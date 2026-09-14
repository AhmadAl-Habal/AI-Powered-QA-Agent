const fs = require('fs');
const path = require('path');
const ollama = require('./ollama-client');
const config = require('./config');
const { NormalizedRawTestCaseSchema } = require('./raw-testcase-normalizer-schema');
const { TestCaseSchema } = require('./testcase-schema');

const OLLAMA_HOST = config.ollamaBaseUrl;
const DEFAULT_INBOX_PATH = config.rawTestcasePath;
const INBOX_PLACEHOLDER = 'Paste a raw manual QA test case here';
const DEBUG_DIR = path.join(config.artifactsDir, 'normalizer-debug');

const FULL_URL_REGEX = /\bhttps?:\/\/[^\s<>"')]+/i;
const DOMAIN_REGEX = /\b(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,}\b/i;
const RELEVANCE_STOPWORDS = new Set([
  'allowed',
  'rejected',
  'should',
  'case',
  'flow',
  'test',
  'user',
  'users',
  'without',
  'within',
  'inside',
  'already',
  'available',
  'selected',
  'default',
  'only',
  'ones',
  'then',
  'when',
  'from',
  'with',
  'that',
  'this',
]);

const NormalizedFormatSchema = {
  type: 'object',
  required: ['id', 'title', 'requires_auth', 'preconditions', 'steps', 'expected_results'],
  properties: {
    id: { type: 'string' },
    title: { type: 'string' },
    requires_auth: { type: 'boolean' },
    start_url: { type: 'string' },
    app_host: { type: 'string' },
    preconditions: { type: 'array', items: { type: 'string' } },
    test_data: { type: 'object' },
    steps: {
      type: 'array',
      items: {
        type: 'object',
        required: ['description'],
        properties: {
          description: { type: 'string' },
          precondition: { type: 'string' },
          expected_result: { type: 'string' },
          notes: { type: 'array', items: { type: 'string' } },
          data_hints: { type: 'array', items: { type: 'string' } },
          value: { type: 'string' },
          timeoutMs: { type: 'number' },
        },
      },
    },
    expected_results: { type: 'array', items: { type: 'string' } },
    tags: { type: 'array', items: { type: 'string' } },
    source_notes: { type: 'array', items: { type: 'string' } },
    split_suggestions: {
      type: 'array',
      items: {
        type: 'object',
        required: ['title'],
        properties: {
          title: { type: 'string' },
          reason: { type: 'string' },
          notes: { type: 'array', items: { type: 'string' } },
          tags: { type: 'array', items: { type: 'string' } },
        },
      },
    },
  },
};

function normalizerModel() {
  return config.models.normalizer;
}

function errorMessage(error) {
  return error && error.message ? error.message : String(error);
}

function cleanString(value) {
  if (typeof value !== 'string') {
    return undefined;
  }

  const cleaned = value.replace(/\s+/g, ' ').trim();
  return cleaned || undefined;
}

function asArray(value) {
  if (Array.isArray(value)) {
    return value.map(cleanString).filter(Boolean);
  }

  const cleaned = cleanString(value);
  return cleaned ? [cleaned] : [];
}

function appendUnique(items, value) {
  const cleaned = cleanString(value);
  if (!cleaned || items.some((item) => item.toLowerCase() === cleaned.toLowerCase())) {
    return items;
  }

  return [...items, cleaned];
}

function mergeUniqueStrings(...groups) {
  return groups.flat().reduce((merged, value) => appendUnique(merged, value), []);
}

function collectStrings(value) {
  if (typeof value === 'string') {
    return [value];
  }

  if (Array.isArray(value)) {
    return value.flatMap(collectStrings);
  }

  if (value && typeof value === 'object') {
    return Object.values(value).flatMap(collectStrings);
  }

  return [];
}

function formatZodIssues(error) {
  return error.issues
    .map((issue) => {
      const field = issue.path.length ? issue.path.join('.') : '(root)';
      return `${field}: ${issue.message}`;
    })
    .join('; ');
}

function safeName(value) {
  return (
    String(value || 'normalized-testcase')
      .replace(/[^a-z0-9._-]+/gi, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 80) || 'normalized-testcase'
  );
}

function timestampForFile() {
  return new Date().toISOString().replace(/[:.]/g, '-');
}

function writeJson(filePath, value) {
  fs.writeFileSync(filePath, `${JSON.stringify(value, null, 2)}\n`);
}

function writeValidationDebugFiles({ stage, inputPath, rawModelContent, parsed, sanitized, error }) {
  fs.mkdirSync(DEBUG_DIR, { recursive: true });

  const baseName = `${timestampForFile()}-${safeName(stage || 'validation')}`;
  const rawPath = path.join(DEBUG_DIR, `${baseName}-raw-output.json`);
  const sanitizedPath = path.join(DEBUG_DIR, `${baseName}-sanitized.json`);

  fs.writeFileSync(rawPath, `${rawModelContent || ''}\n`);
  writeJson(sanitizedPath, {
    stage,
    inputPath,
    error: formatZodIssues(error),
    parsed,
    sanitized,
  });

  return { rawPath, sanitizedPath };
}

function parseModelJson(content) {
  try {
    return JSON.parse(content);
  } catch (error) {
    const preview = String(content || '').slice(0, 500);
    throw new Error(`Normalizer returned invalid JSON: ${error.message}. Preview: ${preview}`);
  }
}

function isRetryableRequestError(error) {
  return /fetch failed|ECONNREFUSED|ECONNRESET|ETIMEDOUT|network|timeout|format|schema|structured|malformed/i.test(
    errorMessage(error)
  );
}

function isConditionText(value) {
  const text = cleanString(value);
  return Boolean(
    text &&
      (/^(enabled|disabled|available)\s+when\b/i.test(text) ||
        /\bwhen all required fields?\s+(are\s+)?filled\b/i.test(text) ||
        /\buntil all required fields?\s+(are\s+)?filled\b/i.test(text))
  );
}

function isExpectedOutcomeText(value) {
  const text = cleanString(value);
  if (!text || isConditionText(text)) {
    return false;
  }

  return /\bshould\b/i.test(text) ||
    /\bopens?\b/i.test(text) ||
    /\bappears?\b/i.test(text) ||
    /\bnavigat(?:e|es|ed|ing)\b/i.test(text) ||
    /\bredirects?\b/i.test(text) ||
    /\brenders?\b/i.test(text) ||
    /\bis rendered\b/i.test(text) ||
    /\bis visible\b/i.test(text) ||
    /\bis displayed\b/i.test(text) ||
    /\bis shown\b/i.test(text) ||
    /\bis created\b/i.test(text) ||
    /\bis accepted\b/i.test(text) ||
    /\baccepts?\b/i.test(text) ||
    /\bprocess\b.*\bbegin/i.test(text) ||
    /\bdialog\b.*\bclose/i.test(text) ||
    /\boption is selected\b/i.test(text);
}

function isDataHintText(value) {
  const text = cleanString(value);
  if (!text || isExpectedOutcomeText(text) || isConditionText(text)) {
    return false;
  }

  return /\bunlabeled\s+data\b/i.test(text) ||
    /\bdataset(?:_type|\s+type)?\b/i.test(text) ||
    /\b\d+\s+(images?|files?|media|items?|records?)\b/i.test(text) ||
    /\brepository\s+name\s*:/i.test(text) ||
    /\bdescription\s*:/i.test(text) ||
    /\bselected\s+(project|repository|dataset)\b/i.test(text) ||
    /\bfree\s+plan\b/i.test(text) ||
    /\bdefault\s+roles?\b/i.test(text) ||
    /^[-\w]+:\s*\S+/.test(text);
}

function hasUnlabeledData(value) {
  return collectStrings(value).some((text) => /\bunlabeled\s+data\b/i.test(text));
}

function isUploadHint(value) {
  const text = cleanString(value);
  return Boolean(
    text &&
      (/\bunlabeled\s+data\b/i.test(text) ||
        /\b\d+\s+(images?|files?|media)\b/i.test(text) ||
        /\bdataset(?:_type|\s+type)?\b/i.test(text))
  );
}

function stepLooksUploadRelated(step) {
  const text = collectStrings({
    description: step.description,
    precondition: step.precondition,
    expected_result: step.expected_result,
    notes: step.notes,
  }).join(' ');

  return /\b(upload|files?|media|images?|dataset|labels?)\b/i.test(text);
}

function normalizeHost(value) {
  const text = cleanString(value);
  if (!text) {
    return undefined;
  }

  const fullUrl = text.match(FULL_URL_REGEX);
  if (fullUrl) {
    try {
      return new URL(fullUrl[0]).hostname;
    } catch {
      return undefined;
    }
  }

  const domain = text.replace(/[),.;]+$/g, '').match(DOMAIN_REGEX);
  return domain ? domain[0] : undefined;
}

function findDomainOnly(value) {
  for (const text of collectStrings(value)) {
    if (FULL_URL_REGEX.test(text)) {
      continue;
    }

    const domain = text.match(DOMAIN_REGEX);
    if (domain) {
      return domain[0];
    }
  }

  return undefined;
}

function hasAuthRequiredSignal(value) {
  const text = collectStrings(value).join('\n');

  return /\b(user|tester|admin)\s+(is\s+)?(already\s+)?(logged|signed)\s+in\b/i.test(text) ||
    /\balready\s+(logged|signed)\s+in\b/i.test(text) ||
    /\binside\s+the\s+platform\b/i.test(text) ||
    /\brepository\s+page\s+is\s+(already\s+)?open\b/i.test(text) ||
    /\bproject\s+dashboard\s+is\s+open\b/i.test(text) ||
    /\bonboarding\s+extension\s+is\s+available\b/i.test(text) ||
    /\bsaved\s+(browser\s+)?session\b/i.test(text) ||
    /\bsaved\s+auth\b/i.test(text) ||
    /\bstorage\s+state\b/i.test(text) ||
    /\bcreate new repository dialog\b/i.test(text) ||
    /\bupload files?\s+tab\b/i.test(text);
}

function hasPublicOrSignedOutSignal(value) {
  const text = collectStrings(value).join('\n');

  return /\bpublic\s+(page|site|landing)\b/i.test(text) ||
    /\bsigned[-\s]?out\b/i.test(text) ||
    /\blogged[-\s]?out\b/i.test(text) ||
    /\bunauthenticated\b/i.test(text) ||
    /\bwithout\s+(logging|signing)\s+in\b/i.test(text) ||
    /\bno\s+login\s+required\b/i.test(text) ||
    /\blogin\s+page\b/i.test(text) ||
    /\bsign[-\s]?in\s+page\b/i.test(text) ||
    /\bregistration\s+page\b/i.test(text);
}

function sanitizeOptionalString(target, field) {
  const cleaned = cleanString(target[field]);
  if (cleaned) {
    target[field] = cleaned;
  } else {
    delete target[field];
  }
}

function sanitizeOptionalArray(target, field) {
  const values = asArray(target[field]);
  if (values.length > 0) {
    target[field] = values;
  } else {
    delete target[field];
  }
}

function sanitizeOptionalTimeout(step) {
  const timeout = Number(step.timeoutMs);
  if (Number.isInteger(timeout) && timeout > 0) {
    step.timeoutMs = timeout;
  } else {
    delete step.timeoutMs;
  }
}

function preserveTextSemantics(step, field) {
  const text = cleanString(step[field]);
  if (!text) {
    delete step[field];
    return;
  }

  if (isExpectedOutcomeText(text)) {
    step.expected_result = mergeUniqueStrings(asArray(step.expected_result), [text]).join('; ');
    delete step[field];
    return;
  }

  if (isConditionText(text)) {
    step.notes = appendUnique(asArray(step.notes), text);
    delete step[field];
    return;
  }

  if (field === 'text') {
    if (isDataHintText(text)) {
      step.data_hints = appendUnique(asArray(step.data_hints), text);
    } else {
      step.notes = appendUnique(asArray(step.notes), text);
    }
    delete step[field];
    return;
  }

  step[field] = text;
}

function sanitizeStep(step) {
  if (typeof step === 'string') {
    return cleanString(step) || '';
  }

  if (!step || typeof step !== 'object' || Array.isArray(step)) {
    return step;
  }

  const sanitized = { ...step };
  sanitized.description = cleanString(sanitized.description) || '';

  for (const field of ['precondition', 'expected_result', 'action', 'selector', 'url']) {
    sanitizeOptionalString(sanitized, field);
  }

  preserveTextSemantics(sanitized, 'text');
  preserveTextSemantics(sanitized, 'value');
  sanitizeOptionalArray(sanitized, 'notes');
  sanitizeOptionalArray(sanitized, 'data_hints');
  sanitizeOptionalArray(sanitized, 'files');
  sanitizeOptionalTimeout(sanitized);

  if (isConditionText(sanitized.expected_result)) {
    sanitized.notes = appendUnique(asArray(sanitized.notes), sanitized.expected_result);
    delete sanitized.expected_result;
  }

  const keptHints = [];
  for (const hint of asArray(sanitized.data_hints)) {
    if (isExpectedOutcomeText(hint)) {
      sanitized.expected_result = mergeUniqueStrings(asArray(sanitized.expected_result), [hint]).join('; ');
      continue;
    }

    if (isConditionText(hint)) {
      sanitized.notes = appendUnique(asArray(sanitized.notes), hint);
      continue;
    }

    if (isUploadHint(hint) && !stepLooksUploadRelated(sanitized)) {
      continue;
    }

    if (isDataHintText(hint)) {
      keptHints.push(hint);
    } else {
      sanitized.notes = appendUnique(asArray(sanitized.notes), hint);
    }
  }

  if (hasUnlabeledData(sanitized)) {
    keptHints.push('dataset_type: unlabeled');
  }

  sanitized.data_hints = mergeUniqueStrings(keptHints);

  for (const field of ['notes', 'data_hints', 'files']) {
    if (!Array.isArray(sanitized[field]) || sanitized[field].length === 0) {
      delete sanitized[field];
    }
  }

  return sanitized;
}

function hasMeaningfulStepContent(step) {
  if (typeof step === 'string') {
    return Boolean(cleanString(step));
  }

  return Boolean(step && typeof step === 'object' && collectStrings(step).some(Boolean));
}

function normalizeSplitSuggestion(suggestion) {
  if (typeof suggestion === 'string') {
    const title = cleanString(suggestion);
    return title ? { title, notes: [], tags: [] } : null;
  }

  if (!suggestion || typeof suggestion !== 'object' || Array.isArray(suggestion)) {
    return null;
  }

  const normalized = {
    ...suggestion,
    title: cleanString(suggestion.title) || '',
    reason: cleanString(suggestion.reason),
    notes: asArray(suggestion.notes),
    tags: asArray(suggestion.tags),
  };

  if (!normalized.reason) {
    delete normalized.reason;
  }

  return normalized.title ? normalized : null;
}

function relevanceTerms(value) {
  return [
    ...new Set(
      collectStrings(value)
        .join(' ')
        .toLowerCase()
        .match(/[a-z0-9]+/g)
        ?.filter((term) => term.length >= 4 && !RELEVANCE_STOPWORDS.has(term)) || []
    ),
  ];
}

function isSplitSuggestionRelevant(suggestion, rawText) {
  const rawTerms = new Set(relevanceTerms(rawText));
  const suggestionTerms = relevanceTerms(suggestion);
  return suggestionTerms.some((term) => rawTerms.has(term));
}

function sanitizeTestData(testData) {
  if (!testData || typeof testData !== 'object' || Array.isArray(testData)) {
    return {};
  }

  const sanitized = {};
  for (const [key, value] of Object.entries(testData)) {
    const cleanKey = cleanString(key);
    if (!cleanKey) {
      continue;
    }

    if (typeof value === 'string') {
      const cleaned = cleanString(value);
      if (cleaned) {
        sanitized[cleanKey.replace(/\s+/g, '_')] = cleaned;
      }
      continue;
    }

    if (Array.isArray(value)) {
      const values = asArray(value);
      if (values.length > 0) {
        sanitized[cleanKey.replace(/\s+/g, '_')] = values;
      }
      continue;
    }

    if (Number.isFinite(value) || (value && typeof value === 'object')) {
      sanitized[cleanKey.replace(/\s+/g, '_')] = value;
    }
  }

  return sanitized;
}

function extractQuotedValue(text, label) {
  const match = text.match(new RegExp(`${label}\\s*:?\\s*["']([^"']+)["']`, 'i'));
  return match ? cleanString(match[1]) : undefined;
}

function applyDataHints(normalized, rawText) {
  const combinedText = collectStrings({ normalized, rawText }).join('\n');

  if (hasUnlabeledData(combinedText) && !normalized.test_data.dataset_type) {
    normalized.test_data.dataset_type = 'unlabeled';
  }

  const repositoryName = extractQuotedValue(combinedText, 'repository name');
  if (repositoryName && !normalized.test_data.repository_name) {
    normalized.test_data.repository_name = repositoryName;
  }

  const description = extractQuotedValue(combinedText, 'description');
  if (description && !normalized.test_data.description) {
    normalized.test_data.description = description;
  }

  const imageCount = combinedText.match(/\b(\d+)\s+images?\b/i);
  if (imageCount && !normalized.test_data.image_count) {
    normalized.test_data.image_count = Number(imageCount[1]);
  }

  for (const [pattern, note] of [
    [/\bfree plan\b/i, 'Scenario context: free plan'],
    [/\bdefault roles?\b/i, 'Scenario context: default roles'],
    [/\bselected project\b/i, 'Scenario context: selected project'],
    [/\bselected repositor(?:y|ies)\b/i, 'Scenario context: selected repository'],
  ]) {
    if (pattern.test(combinedText)) {
      normalized.source_notes = appendUnique(normalized.source_notes, note);
    }
  }
}

function deriveExpectedResults(normalized) {
  const stepExpectedResults = Array.isArray(normalized.steps)
    ? normalized.steps
        .map((step) => (step && typeof step === 'object' ? cleanString(step.expected_result) : undefined))
        .filter(Boolean)
    : [];

  normalized.expected_results = mergeUniqueStrings(asArray(normalized.expected_results), stepExpectedResults);
}

function inferRequiresAuth(normalized, rawText) {
  const context = {
    rawText,
    title: normalized.title,
    preconditions: normalized.preconditions,
    steps: normalized.steps,
    source_notes: normalized.source_notes,
    app_host: normalized.app_host,
  };

  if (hasAuthRequiredSignal(context)) {
    return true;
  }

  if (normalized.requires_auth === false && hasPublicOrSignedOutSignal(context)) {
    return false;
  }

  return normalized.requires_auth !== false;
}

function normalizeParsedOutput(value, rawText = '') {
  const normalized = { ...value };

  normalized.id = cleanString(normalized.id) || '';
  normalized.title = cleanString(normalized.title) || '';
  normalized.start_url = normalizeStartUrl(normalized);
  normalized.app_host = normalizeAppHost(normalized, rawText);
  normalized.test_data = sanitizeTestData(normalized.test_data);
  normalized.preconditions = asArray(normalized.preconditions);
  normalized.expected_results = asArray(normalized.expected_results);
  normalized.tags = asArray(normalized.tags);
  normalized.source_notes = asArray(normalized.source_notes);
  normalized.steps = Array.isArray(normalized.steps)
    ? normalized.steps.map(sanitizeStep).filter(hasMeaningfulStepContent)
    : [];
  normalized.split_suggestions = Array.isArray(normalized.split_suggestions)
    ? normalized.split_suggestions
        .map(normalizeSplitSuggestion)
        .filter(Boolean)
        .filter((suggestion) => isSplitSuggestionRelevant(suggestion, rawText))
    : [];

  normalized.requires_auth = inferRequiresAuth(normalized, rawText);
  deriveExpectedResults(normalized);
  applyDataHints(normalized, rawText);

  return normalized;
}

function normalizeStartUrl(normalized) {
  const startUrl = cleanString(normalized.start_url);
  if (!startUrl) {
    return null;
  }

  const fullUrl = startUrl.match(FULL_URL_REGEX);
  if (fullUrl) {
    return fullUrl[0];
  }

  return null;
}

function normalizeAppHost(normalized, rawText) {
  const explicitHost = normalizeHost(normalized.app_host);
  if (explicitHost) {
    return explicitHost;
  }

  const startUrlHost = !FULL_URL_REGEX.test(cleanString(normalized.start_url) || '')
    ? normalizeHost(normalized.start_url)
    : undefined;
  if (startUrlHost) {
    return startUrlHost;
  }

  return findDomainOnly({
    preconditions: normalized.preconditions,
    steps: normalized.steps,
    source_notes: normalized.source_notes,
    rawText,
  });
}

async function assertOllamaReady(model) {
  let listResponse;

  try {
    listResponse = await ollama.list();
  } catch (error) {
    throw new Error(`Ollama is not reachable at ${OLLAMA_HOST}: ${errorMessage(error)}`);
  }

  const installedModels = Array.isArray(listResponse.models)
    ? listResponse.models.map((entry) => entry.name || entry.model).filter(Boolean)
    : [];

  if (!installedModels.includes(model)) {
    const installedSummary = installedModels.length ? installedModels.join(', ') : 'none';
    throw new Error(`Normalizer model not installed: ${model}. Installed models: ${installedSummary}`);
  }
}

function buildPrompt(rawText, inputPath) {
  return `
You normalize raw manual QA test cases into planner-friendly JSON. Return JSON only.

Output shape:
- id, title, requires_auth, start_url, app_host
- preconditions, test_data, steps, expected_results, tags, source_notes, split_suggestions

Step shape:
- description
- precondition, expected_result, notes, data_hints, value

Table handling:
- Understand Confluence-style tables with Steps, Action, Pre-condition, Expected result, Passed, blank rows, repeated headers, and side-case notes.
- Preserve one step per meaningful row.
- Keep row-specific preconditions and expected results on the same step.
- Ignore Passed/status checkbox text.

Semantic rules:
- UI/system outcomes go in expected_result, not value, not text, not data_hints.
- Constraints like "Enabled when all required field are filled" go in notes unless they are clearly the direct outcome.
- data_hints is only for real data or scenario context such as "Unlabeled data", "10 images", repository names, descriptions, selected project/repository, free plan, or default roles.
- value is only for actual typed/supplied input values.
- If start_url is unknown, use null.
- If only a domain like qa.example-app.company.com is present, put it in app_host and keep start_url null.
- Set requires_auth true for already-logged-in/platform/dashboard/repository/upload flows; set false only for clearly public or signed-out flows.
- Keep one focused happy path. Put only raw-input side cases into split_suggestions.
- Derive top-level expected_results from step expected_result values.
- Do not invent URLs, credentials, selectors, file paths, or hidden app data.

Source file:
${inputPath}

Raw test case:
${rawText}
`;
}

async function requestNormalizedJson(prompt, model) {
  const request = {
    model,
    messages: [{ role: 'user', content: prompt }],
    stream: false,
    options: { temperature: 0 },
  };

  try {
    return await ollama.chat({ ...request, format: NormalizedFormatSchema });
  } catch (structuredError) {
    if (!isRetryableRequestError(structuredError)) {
      throw new Error(`Normalizer structured request failed: ${errorMessage(structuredError)}`);
    }

    try {
      return await ollama.chat({ ...request, format: 'json' });
    } catch (jsonError) {
      throw new Error(
        'Normalizer request failed after structured output and JSON fallback. ' +
          `Structured error: ${errorMessage(structuredError)}. ` +
          `JSON fallback error: ${errorMessage(jsonError)}`
      );
    }
  }
}

function readRawInput(inputPath) {
  const resolvedInputPath = path.isAbsolute(inputPath)
    ? inputPath
    : path.resolve(config.projectRoot, inputPath);

  if (!fs.existsSync(resolvedInputPath)) {
    throw new Error(`Raw test case file not found: ${resolvedInputPath}`);
  }

  const rawText = fs.readFileSync(resolvedInputPath, 'utf8').trim();
  if (!rawText) {
    throw new Error(`Raw test case file is empty: ${resolvedInputPath}`);
  }

  if (resolvedInputPath === DEFAULT_INBOX_PATH && rawText.includes(INBOX_PLACEHOLDER)) {
    throw new Error(`Paste a raw QA test case into ${DEFAULT_INBOX_PATH} before running the normalizer.`);
  }

  return { resolvedInputPath, rawText };
}

function validateNormalized({ parsed, rawParsed, rawModelContent, resolvedInputPath }) {
  const normalizedResult = NormalizedRawTestCaseSchema.safeParse(parsed);
  if (!normalizedResult.success) {
    const debug = writeValidationDebugFiles({
      stage: 'normalized-schema',
      inputPath: resolvedInputPath,
      rawModelContent,
      parsed: rawParsed,
      sanitized: parsed,
      error: normalizedResult.error,
    });
    throw new Error(
      `Normalized output failed schema validation: ${formatZodIssues(normalizedResult.error)}. ` +
        `Debug files: ${debug.rawPath}, ${debug.sanitizedPath}`
    );
  }

  const agentReadyResult = TestCaseSchema.safeParse(normalizedResult.data);
  if (!agentReadyResult.success) {
    const debug = writeValidationDebugFiles({
      stage: 'agent-compatible-schema',
      inputPath: resolvedInputPath,
      rawModelContent,
      parsed: rawParsed,
      sanitized: normalizedResult.data,
      error: agentReadyResult.error,
    });
    throw new Error(
      `Normalized output is not agent-compatible: ${formatZodIssues(agentReadyResult.error)}. ` +
        `Debug files: ${debug.rawPath}, ${debug.sanitizedPath}`
    );
  }

  return agentReadyResult.data;
}

async function normalizeTestCase(inputPath, options = {}) {
  const { resolvedInputPath, rawText } = readRawInput(inputPath);
  const model = normalizerModel();

  await assertOllamaReady(model);

  const sourceLabel = path.relative(config.projectRoot, resolvedInputPath) || path.basename(resolvedInputPath);
  const response = await requestNormalizedJson(buildPrompt(rawText, sourceLabel), model);
  const rawModelContent = response.message.content;
  const rawParsed = parseModelJson(rawModelContent);
  const parsed = normalizeParsedOutput(rawParsed, rawText);
  const normalized = validateNormalized({
    parsed,
    rawParsed,
    rawModelContent,
    resolvedInputPath,
  });

  const outputDir = options.outputDir || path.join(config.projectRoot, 'testcases', 'normalized');
  fs.mkdirSync(outputDir, { recursive: true });

  const outputPath = path.join(outputDir, `${safeName(normalized.id)}.json`);
  fs.writeFileSync(outputPath, `${JSON.stringify(normalized, null, 2)}\n`);

  return {
    status: 'passed',
    inputPath: resolvedInputPath,
    outputPath,
    model,
    normalized,
  };
}

module.exports = { DEFAULT_INBOX_PATH, normalizeTestCase };
