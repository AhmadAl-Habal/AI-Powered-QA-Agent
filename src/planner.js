const ollama = require('./ollama-client');
const { z } = require('zod');
const config = require('./config');
const createRepositoryProfile = require('./ui-profiles/create-repository');
const repositoryCreateSampleTrainProfile = require('./ui-profiles/repository-create-sample-train');

const SUPPORTED_ACTIONS = [
  'goto',
  'click',
  'fill',
  'upload_files',
  'wait_for_text',
  'assert_text',
  'assert_text_near_text',
  'assert_text_matches',
  'assert_dialog_title',
  'assert_dialog_fingerprint',
  'assert_url_contains',
  'assert_enabled',
  'assert_disabled_or_hidden',
  'ensure_panel_open',
];

const PlanActionSchema = z
  .object({
    action: z.enum(SUPPORTED_ACTIONS),
    selector: z.string().optional(),
    text: z.string().optional(),
    texts: z.array(z.string()).optional(),
    placeholder: z.string().optional(),
    placeholders: z.array(z.string()).optional(),
    pattern: z.string().optional(),
    value: z.string().optional(),
    url: z.string().optional(),
    files: z.array(z.string()).optional(),
    timeoutMs: z.number().int().positive().optional(),
  })
  .strict();

const PlanSchema = z
  .object({
    test_name: z.string(),
    flow_profile: z.string().optional(),
    flow_profiles: z.array(z.string()).optional(),
    runtime_values: z.record(z.string(), z.unknown()).optional(),
    actions: z.array(PlanActionSchema).min(1),
  })
  .strict();

const PlanFormatSchema = {
  type: 'object',
  required: ['test_name', 'actions'],
  properties: {
    test_name: { type: 'string' },
    flow_profile: { type: 'string' },
    flow_profiles: {
      type: 'array',
      items: { type: 'string' },
    },
    runtime_values: { type: 'object' },
    actions: {
      type: 'array',
      items: {
        type: 'object',
        required: ['action'],
        properties: {
          action: { type: 'string', enum: SUPPORTED_ACTIONS },
          selector: { type: 'string' },
          text: { type: 'string' },
          texts: {
            type: 'array',
            items: { type: 'string' },
          },
          placeholder: { type: 'string' },
          placeholders: {
            type: 'array',
            items: { type: 'string' },
          },
          pattern: { type: 'string' },
          value: { type: 'string' },
          url: { type: 'string' },
          files: {
            type: 'array',
            items: { type: 'string' },
          },
          timeoutMs: { type: 'number' },
        },
        additionalProperties: false,
      },
    },
  },
  additionalProperties: false,
};

function isFormatSchemaError(error) {
  const message = error && error.message ? error.message : String(error);
  return /invalid JSON schema in format/i.test(message);
}

function createDefaultTestCase() {
  return {
    id: 'default-smoke',
    title: 'Verify repositories page loads',
    requires_auth: true,
    start_url: config.targetUrl,
    preconditions: ['Saved Playwright auth state exists'],
    test_data: {},
    steps: ['Open the target page', `Verify that "${config.ui.successText}" is visible`],
    expected_results: [`The text "${config.ui.successText}" is visible`],
    tags: ['smoke'],
  };
}

function resolveStartUrl(testCase) {
  const startUrl = testCase.start_url || config.targetUrl;
  if (!startUrl) {
    throw new Error('Test case start_url or TARGET_URL is required to build an executable plan.');
  }

  config.assertSafeTarget('Test target', startUrl);
  return startUrl;
}

function collectText(value) {
  if (typeof value === 'string') {
    return value;
  }

  if (Array.isArray(value)) {
    return value.map(collectText).join(' ');
  }

  if (value && typeof value === 'object') {
    return Object.values(value).map(collectText).join(' ');
  }

  return '';
}

function selectFlowProfile(testCase) {
  const text = collectText({
    title: testCase.title,
    tags: testCase.tags,
    expected_results: testCase.expected_results,
    steps: testCase.steps,
    flow_profile: testCase.flow_profile,
  }).toLowerCase();

  if (
    testCase.flow_profile === repositoryCreateSampleTrainProfile.id ||
    text.includes('repository-create-sample-train') ||
    text.includes('fruit detection') ||
    ((text.includes('create repository') || text.includes('creating repository')) &&
      (text.includes('sample') || text.includes('train') || text.includes('model')))
  ) {
    return repositoryCreateSampleTrainProfile;
  }

  if (
    text.includes('create-repository') ||
    text.includes('create repository') ||
    text.includes('creating repository') ||
    (text.includes('repository') && text.includes('create'))
  ) {
    return createRepositoryProfile;
  }

  return null;
}

function stringFromTestData(testData, keys) {
  for (const key of keys) {
    const value = testData && testData[key];
    if (typeof value === 'string' && value.trim()) {
      return value.trim();
    }
  }

  return undefined;
}

function uniqueStrings(values) {
  const unique = [];

  for (const value of values) {
    if (typeof value !== 'string' || !value.trim()) {
      continue;
    }

    const cleaned = value.trim();
    if (!unique.some((item) => item.toLowerCase() === cleaned.toLowerCase())) {
      unique.push(cleaned);
    }
  }

  return unique;
}

function compactTimestamp(date = new Date()) {
  const pad = (value, size = 2) => String(value).padStart(size, '0');

  return (
    `${date.getFullYear()}${pad(date.getMonth() + 1)}${pad(date.getDate())}-` +
    `${pad(date.getHours())}${pad(date.getMinutes())}${pad(date.getSeconds())}-` +
    `${pad(date.getMilliseconds(), 3)}`
  );
}

function uniqueRunValue(baseValue) {
  return `${baseValue.trim()} ${compactTimestamp()}`;
}

function fillActionForField(field, value) {
  const labels = uniqueStrings([field.label, ...(Array.isArray(field.labels) ? field.labels : [])]);
  const placeholders = uniqueStrings([
    field.placeholder,
    ...(Array.isArray(field.placeholders) ? field.placeholders : []),
  ]);
  const action = { action: 'fill', value };

  if (labels.length === 1) {
    action.text = labels[0];
  } else if (labels.length > 1) {
    action.texts = labels;
  }

  if (placeholders.length === 1) {
    action.placeholder = placeholders[0];
  } else if (placeholders.length > 1) {
    action.placeholders = placeholders;
  }

  return action;
}

function createRepositoryRuntime(testCase, profile) {
  const repositoryNameBase =
    stringFromTestData(testCase.test_data, ['repository_name', 'repositoryName', 'name']) ||
    'QA Guided Repository';
  const repositoryName = profile.create_dialog.fields.repository_name.unique_per_run
    ? uniqueRunValue(repositoryNameBase)
    : repositoryNameBase;
  const description =
    stringFromTestData(testCase.test_data, ['description', 'repository_description', 'repositoryDescription']) ||
    'Created by the guided QA agent';

  return { repositoryName, description };
}

function buildCreateRepositoryActions(startUrl, profile, runtime) {
  return [
    { action: 'goto', url: startUrl },
    { action: 'assert_text', text: profile.assertions.page_ready },
    { action: 'click', texts: profile.entry_triggers },
    { action: 'assert_dialog_fingerprint', texts: profile.create_dialog.verification_texts },
    fillActionForField(profile.create_dialog.fields.repository_name, runtime.repositoryName),
    fillActionForField(profile.create_dialog.fields.description, runtime.description),
    {
      action: 'assert_enabled',
      text: profile.create_dialog.continue_button,
    },
    {
      action: 'click',
      text: profile.create_dialog.continue_button,
    },
    { action: 'assert_dialog_fingerprint', texts: profile.add_content_dialog.verification_texts },
    { action: 'assert_text', text: profile.assertions.upload_tab_visible },
  ];
}

function buildCreateRepositoryPlan(testCase, profile) {
  const startUrl = resolveStartUrl(testCase);
  const runtime = createRepositoryRuntime(testCase, profile);

  return {
    test_name: testCase.title || profile.title,
    flow_profile: profile.id,
    flow_profiles: [profile.id],
    runtime_values: {
      repository_name: runtime.repositoryName,
      repository_description: runtime.description,
    },
    actions: buildCreateRepositoryActions(startUrl, profile, runtime),
  };
}

function buildRepositoryCreateSampleTrainPlan(testCase, profile) {
  const startUrl = resolveStartUrl(testCase);
  const createProfile = profile.createRepository;
  const sampleImport = profile.sampleImport;
  const repositoryPostImport = profile.repositoryPostImport;
  const trainModel = profile.trainModel;
  const modelsDropdown = profile.modelsDropdown;
  const runtime = createRepositoryRuntime(testCase, createProfile);
  const modelName = `${runtime.repositoryName} ${modelsDropdown.model_name_suffix}`;

  return {
    test_name: testCase.title || profile.title,
    flow_profile: profile.id,
    flow_profiles: profile.subprofiles,
    runtime_values: {
      repository_name: runtime.repositoryName,
      repository_description: runtime.description,
      sample_dataset: sampleImport.sample.name,
      training_type: trainModel.dialog.training_type,
      expected_model_name: modelName,
    },
    actions: [
      ...buildCreateRepositoryActions(startUrl, createProfile, runtime),
      { action: 'click', text: sampleImport.tab },
      { action: 'assert_dialog_fingerprint', texts: sampleImport.fingerprints.sample_picker },
      { action: 'click', text: sampleImport.sample.name },
      { action: 'assert_enabled', text: sampleImport.sample.continue_button },
      { action: 'click', text: sampleImport.sample.continue_button },
      {
        action: 'wait_for_text',
        text: sampleImport.success_text,
        timeoutMs: sampleImport.importTimeoutMs,
      },
      { action: 'assert_dialog_fingerprint', texts: sampleImport.fingerprints.import_complete },
      { action: 'click', text: sampleImport.done_button },
      { action: 'wait_for_text', text: runtime.repositoryName, timeoutMs: config.assertTimeoutMs },
      { action: 'click', text: runtime.repositoryName },
      { action: 'assert_text', text: runtime.repositoryName },
      {
        action: 'assert_text_near_text',
        text: repositoryPostImport.imported_content.folder_name,
        value: repositoryPostImport.imported_content.ready_status,
      },
      { action: 'click', text: trainModel.entry_button },
      {
        action: 'assert_dialog_fingerprint',
        texts: [trainModel.dialog.title, trainModel.dialog.training_type],
      },
      { action: 'click', text: trainModel.dialog.training_type },
      { action: 'assert_dialog_fingerprint', texts: trainModel.dialog.expanded_fingerprint },
      { action: 'click', text: trainModel.dialog.start_button },
      { action: 'assert_disabled_or_hidden', text: trainModel.dialog.start_button },
      {
        action: 'wait_for_text',
        text: trainModel.post_start.models_button,
        timeoutMs: trainModel.post_start.pageUpdateTimeoutMs,
      },
      {
        action: 'ensure_panel_open',
        text: modelsDropdown.button,
        texts: [modelsDropdown.heading, modelName, modelsDropdown.model_type],
      },
      { action: 'assert_text_matches', pattern: modelsDropdown.count_pattern },
      { action: 'assert_text', text: modelName },
      { action: 'assert_text', text: modelsDropdown.model_type },
    ],
  };
}

function buildPrompt(testCase) {
  const startUrl = resolveStartUrl(testCase);

  const plannerInput = {
    ...testCase,
    start_url: startUrl,
    default_success_text: config.ui.successText,
  };

  return `
You are a QA planning model.
Return executable JSON only.

Build a Playwright execution plan from this test case.

Supported action types:
- goto: requires url
- click: requires selector
- fill: requires selector and value, or text/texts/placeholder/placeholders and value
- upload_files: requires selector and files
- wait_for_text: requires text
- assert_text: requires text
- assert_text_near_text: requires text and value
- assert_text_matches: requires pattern
- assert_dialog_title: requires text
- assert_dialog_fingerprint: requires texts
- assert_url_contains: requires text
- assert_enabled: requires selector
- assert_disabled_or_hidden: requires text
- ensure_panel_open: requires text and texts

Allowed action fields:
- action
- selector
- text
- texts
- placeholder
- placeholders
- pattern
- value
- url
- files
- timeoutMs

Rules:
- Use only the supported action types.
- Do not invent unsupported fields or actions.
- Keep the plan minimal and directly tied to the test case.
- Prefer goto followed by assertions for smoke-style verification.
- Use assert_dialog_title for modal/dialog titles instead of page-wide assert_text.
- Use assert_dialog_fingerprint when a modal has multiple stable visible text or field fingerprints.
- Return JSON only.

Test case:
${JSON.stringify(plannerInput, null, 2)}

Expected JSON structure:
{
  "test_name": "string",
  "actions": [
    { "action": "goto", "url": "string" },
    { "action": "assert_text", "text": "string" }
  ]
}
`;
}

async function buildPlan(testCase = createDefaultTestCase()) {
  const flowProfile = selectFlowProfile(testCase);
  if (flowProfile && flowProfile.id === repositoryCreateSampleTrainProfile.id) {
    return PlanSchema.parse(buildRepositoryCreateSampleTrainPlan(testCase, flowProfile));
  }

  if (flowProfile && flowProfile.id === createRepositoryProfile.id) {
    return PlanSchema.parse(buildCreateRepositoryPlan(testCase, flowProfile));
  }

  const prompt = buildPrompt(testCase);

  const request = {
    model: config.models.planner,
    messages: [{ role: 'user', content: prompt }],
    stream: false,
    options: { temperature: 0 },
  };

  let response;
  try {
    response = await ollama.chat({ ...request, format: PlanFormatSchema });
  } catch (error) {
    if (!isFormatSchemaError(error)) {
      throw error;
    }

    response = await ollama.chat({ ...request, format: 'json' });
  }

  return PlanSchema.parse(JSON.parse(response.message.content));
}

module.exports = {
  buildPlan,
  PlanSchema,
  selectFlowProfile,
};
