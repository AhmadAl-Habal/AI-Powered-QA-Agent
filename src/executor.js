const { chromium, expect } = require('@playwright/test');
const fs = require('fs');
const path = require('path');
const config = require('./config');

function stepTimeout(step, fallback) {
  const timeout = Number(step.timeoutMs);
  return Number.isInteger(timeout) && timeout > 0 ? timeout : fallback;
}

function requiredField(step, field) {
  const value = step[field];

  if (
    value === undefined ||
    value === null ||
    value === '' ||
    (Array.isArray(value) && value.length === 0)
  ) {
    throw new Error(`Action "${step.action}" requires "${field}".`);
  }

  return value;
}

function escapeRegExp(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function cleanString(value) {
  if (typeof value !== 'string') {
    return undefined;
  }

  const cleaned = value.replace(/\s+/g, ' ').trim();
  return cleaned || undefined;
}

function resolveFiles(files) {
  return files.map((file) => (path.isAbsolute(file) ? file : path.resolve(config.projectRoot, file)));
}

function stepTexts(step, field = 'text') {
  if (Array.isArray(step.texts) && step.texts.length > 0) {
    return step.texts;
  }

  return [requiredField(step, field)];
}

function fieldCandidates(step, field, pluralField) {
  const values = [];

  for (const value of [step[field], ...(Array.isArray(step[pluralField]) ? step[pluralField] : [])]) {
    const cleaned = cleanString(value);
    if (cleaned && !values.some((candidate) => candidate.toLowerCase() === cleaned.toLowerCase())) {
      values.push(cleaned);
    }
  }

  return values;
}

function fingerprintTexts(step) {
  const texts = [];

  for (const value of [step.text, ...(Array.isArray(step.texts) ? step.texts : [])]) {
    const cleaned = cleanString(value);
    if (cleaned && !texts.some((text) => text.toLowerCase() === cleaned.toLowerCase())) {
      texts.push(cleaned);
    }
  }

  if (texts.length === 0) {
    throw new Error(`Action "${step.action}" requires "text" or "texts".`);
  }

  return texts;
}

async function clickFirstText(page, texts, timeout) {
  const attempts = [];

  for (const text of texts) {
    for (const locator of [
      page.getByRole('button', { name: text, exact: true }).first(),
      page.getByText(text, { exact: true }).first(),
    ]) {
      if (await locator.isVisible({ timeout: Math.min(timeout, 2000) }).catch(() => false)) {
        await locator.click({ timeout });
        return;
      }
    }
    attempts.push(text);
  }

  throw new Error(`None of the text options were visible for click: ${attempts.join(', ')}`);
}

async function tryFillLocators(locators, value, timeout) {
  for (const locator of locators) {
    try {
      await locator.fill(value, { timeout: Math.min(timeout, 3000) });
      return true;
    } catch {
      // Try the next matching strategy.
    }
  }

  return false;
}

async function fillFirstField(page, step, value, timeout) {
  const labels = fieldCandidates(step, 'text', 'texts');
  const placeholders = fieldCandidates(step, 'placeholder', 'placeholders');
  const attempts = [];

  for (const label of labels) {
    const filled = await tryFillLocators(
      [
        page.getByLabel(label, { exact: true }).first(),
        page.getByLabel(label, { exact: false }).first(),
        page.getByRole('textbox', { name: label, exact: true }).first(),
        page.getByRole('textbox', { name: label, exact: false }).first(),
      ],
      value,
      timeout
    );

    if (filled) {
      return;
    }

    attempts.push(label);
  }

  for (const placeholder of placeholders) {
    const filled = await tryFillLocators(
      [
        page.getByPlaceholder(placeholder, { exact: true }).first(),
        page.getByPlaceholder(placeholder, { exact: false }).first(),
      ],
      value,
      timeout
    );

    if (filled) {
      return;
    }

    attempts.push(`placeholder: ${placeholder}`);
  }

  if (labels.length === 0 && placeholders.length === 0) {
    throw new Error(`Action "${step.action}" requires "text", "texts", "placeholder", or "placeholders".`);
  }

  throw new Error(`None of the fill targets could be filled: ${attempts.join(', ')}`);
}

async function expectEnabledByText(page, texts, timeout) {
  const attempts = [];

  for (const text of texts) {
    const button = page.getByRole('button', { name: text, exact: true }).first();
    if (await button.isVisible({ timeout: Math.min(timeout, 2000) }).catch(() => false)) {
      await expect(button).toBeEnabled({ timeout });
      return;
    }
    attempts.push(text);
  }

  throw new Error(`None of the text options were visible for enabled assertion: ${attempts.join(', ')}`);
}

async function countVisibleExactText(page, text) {
  const handles = await page.getByText(text, { exact: true }).elementHandles();
  let visibleCount = 0;

  for (const handle of handles) {
    const isVisible = await handle
      .evaluate((node) => {
        const element = node.nodeType === Node.ELEMENT_NODE ? node : node.parentElement;
        if (!element) {
          return false;
        }

        const style = window.getComputedStyle(element);
        const rect = element.getBoundingClientRect();
        return (
          style.display !== 'none' &&
          style.visibility !== 'hidden' &&
          Number(style.opacity) !== 0 &&
          rect.width > 0 &&
          rect.height > 0 &&
          !element.closest('[hidden], [aria-hidden="true"]')
        );
      })
      .catch(() => false);

    if (isVisible) {
      visibleCount += 1;
    }
  }

  return visibleCount;
}

async function findVisibleFingerprintContainer(page, texts) {
  const title = texts[0];
  const candidates = await page.getByText(title, { exact: true }).elementHandles();

  for (const candidate of candidates) {
    const match = await candidate
      .evaluate((node, expectedTexts) => {
        const normalize = (value) => String(value || '').replace(/\s+/g, ' ').trim();
        const containsAll = (element) => {
          const text = normalize(element.innerText || element.textContent);
          return expectedTexts.every((expected) => text.includes(expected));
        };
        const isVisible = (element) => {
          const style = window.getComputedStyle(element);
          const rect = element.getBoundingClientRect();
          return (
            style.display !== 'none' &&
            style.visibility !== 'hidden' &&
            Number(style.opacity) !== 0 &&
            rect.width > 0 &&
            rect.height > 0 &&
            !element.closest('[hidden], [aria-hidden="true"]')
          );
        };
        const isReasonableRegion = (element) => {
          const rect = element.getBoundingClientRect();
          const tag = element.tagName.toLowerCase();
          if (tag === 'body' || tag === 'html') {
            return false;
          }

          return !(rect.width >= window.innerWidth * 0.95 && rect.height >= window.innerHeight * 0.95);
        };

        let current = node.nodeType === Node.ELEMENT_NODE ? node : node.parentElement;
        for (let depth = 0; current && depth < 8; depth += 1) {
          if (isVisible(current) && isReasonableRegion(current) && containsAll(current)) {
            return true;
          }
          current = current.parentElement;
        }

        return false;
      }, texts)
      .catch(() => false);

    if (match) {
      return true;
    }
  }

  return false;
}

async function expectDialogFingerprint(page, texts, timeout) {
  const deadline = Date.now() + timeout;
  let lastMissing = texts;

  while (Date.now() < deadline) {
    if (await findVisibleFingerprintContainer(page, texts)) {
      return;
    }

    const missing = [];
    for (const text of texts) {
      if ((await countVisibleExactText(page, text)) === 0) {
        missing.push(text);
      }
    }

    if (missing.length === 0 && texts.length > 1) {
      return;
    }

    lastMissing = missing;
    await page.waitForTimeout(250);
  }

  throw new Error(
    `Modal fingerprint was not visible. Expected visible content: ${texts.join(', ')}. ` +
      `Missing: ${lastMissing.join(', ') || 'none'}`
  );
}

async function expectDialogTitle(page, text, timeout) {
  await expectDialogFingerprint(page, [text], timeout);
}

async function isFingerprintVisible(page, texts) {
  if (await findVisibleFingerprintContainer(page, texts)) {
    return true;
  }

  for (const text of texts) {
    if ((await countVisibleExactText(page, text)) === 0) {
      return false;
    }
  }

  return texts.length > 0;
}

async function expectTextNearText(page, text, nearbyText, timeout) {
  const texts = [text, nearbyText].map(cleanString).filter(Boolean);
  const deadline = Date.now() + timeout;

  if (texts.length < 2) {
    throw new Error('assert_text_near_text requires both "text" and "value".');
  }

  while (Date.now() < deadline) {
    if (await findVisibleFingerprintContainer(page, texts)) {
      return;
    }

    await page.waitForTimeout(250);
  }

  throw new Error(`Could not find visible text "${nearbyText}" near "${text}".`);
}

async function expectDisabledOrHiddenByText(page, texts, timeout) {
  const deadline = Date.now() + timeout;

  while (Date.now() < deadline) {
    for (const text of texts) {
      const button = page.getByRole('button', { name: text, exact: true }).first();
      const isVisible = await button.isVisible({ timeout: 250 }).catch(() => false);

      if (!isVisible) {
        return;
      }

      if (await button.isDisabled({ timeout: 250 }).catch(() => false)) {
        return;
      }
    }

    await page.waitForTimeout(250);
  }

  throw new Error(`Expected button to become disabled or hidden: ${texts.join(', ')}`);
}

async function expectPageTextMatches(page, pattern, timeout) {
  const regex = new RegExp(pattern, 'i');

  await expect
    .poll(
      async () => page.locator('body').innerText({ timeout: 1000 }).catch(() => ''),
      { timeout, intervals: [500, 1000] }
    )
    .toMatch(regex);
}

async function ensurePanelOpen(page, toggleText, panelTexts, timeout) {
  if (await isFingerprintVisible(page, panelTexts)) {
    return;
  }

  await clickFirstText(page, [toggleText], timeout);
  await expectDialogFingerprint(page, panelTexts, timeout);
}

async function runStep(page, step) {
  if (step.action === 'goto') {
    await page.goto(requiredField(step, 'url'), {
      waitUntil: 'domcontentloaded',
      timeout: stepTimeout(step, config.pageGotoTimeoutMs),
    });
    return;
  }

  if (step.action === 'click') {
    if (!step.selector) {
      await clickFirstText(page, stepTexts(step), stepTimeout(step, config.assertTimeoutMs));
      return;
    }

    await page.locator(requiredField(step, 'selector')).click({
      timeout: stepTimeout(step, config.assertTimeoutMs),
    });
    return;
  }

  if (step.action === 'fill') {
    if (!step.selector) {
      await fillFirstField(
        page,
        step,
        requiredField(step, 'value'),
        stepTimeout(step, config.assertTimeoutMs)
      );
      return;
    }

    await page.locator(requiredField(step, 'selector')).fill(requiredField(step, 'value'), {
      timeout: stepTimeout(step, config.assertTimeoutMs),
    });
    return;
  }

  if (step.action === 'upload_files') {
    await page.locator(requiredField(step, 'selector')).setInputFiles(resolveFiles(requiredField(step, 'files')), {
      timeout: stepTimeout(step, config.assertTimeoutMs),
    });
    return;
  }

  if (step.action === 'wait_for_text') {
    await page.getByText(requiredField(step, 'text'), { exact: true }).waitFor({
      state: 'visible',
      timeout: stepTimeout(step, config.assertTimeoutMs),
    });
    return;
  }

  if (step.action === 'assert_text') {
    await expect(page.getByText(requiredField(step, 'text'), { exact: true })).toBeVisible({
      timeout: stepTimeout(step, config.assertTimeoutMs),
    });
    return;
  }

  if (step.action === 'assert_text_near_text') {
    await expectTextNearText(
      page,
      requiredField(step, 'text'),
      requiredField(step, 'value'),
      stepTimeout(step, config.assertTimeoutMs)
    );
    return;
  }

  if (step.action === 'assert_text_matches') {
    await expectPageTextMatches(page, requiredField(step, 'pattern'), stepTimeout(step, config.assertTimeoutMs));
    return;
  }

  if (step.action === 'assert_dialog_title') {
    await expectDialogTitle(page, requiredField(step, 'text'), stepTimeout(step, config.assertTimeoutMs));
    return;
  }

  if (step.action === 'assert_dialog_fingerprint') {
    await expectDialogFingerprint(page, fingerprintTexts(step), stepTimeout(step, config.assertTimeoutMs));
    return;
  }

  if (step.action === 'assert_url_contains') {
    const expected = requiredField(step, 'text');
    await expect(page).toHaveURL(new RegExp(escapeRegExp(expected)), {
      timeout: stepTimeout(step, config.assertTimeoutMs),
    });
    return;
  }

  if (step.action === 'assert_enabled') {
    if (!step.selector) {
      await expectEnabledByText(page, stepTexts(step), stepTimeout(step, config.assertTimeoutMs));
      return;
    }

    await expect(page.locator(requiredField(step, 'selector'))).toBeEnabled({
      timeout: stepTimeout(step, config.assertTimeoutMs),
    });
    return;
  }

  if (step.action === 'assert_disabled_or_hidden') {
    await expectDisabledOrHiddenByText(page, stepTexts(step), stepTimeout(step, config.assertTimeoutMs));
    return;
  }

  if (step.action === 'ensure_panel_open') {
    await ensurePanelOpen(
      page,
      requiredField(step, 'text'),
      stepTexts(step, 'texts'),
      stepTimeout(step, config.assertTimeoutMs)
    );
    return;
  }

  throw new Error(`Unsupported action "${step.action}".`);
}

async function shortTextSnippet(page) {
  const text = await page.locator('body').innerText({ timeout: 1000 }).catch(() => '');
  return text.replace(/\s+/g, ' ').trim().slice(0, 500);
}

async function buildFailureContext(page, step, stepIndex, screenshotPath) {
  return {
    step: stepIndex,
    action: step.action,
    selector: step.selector,
    url: step.url,
    text: step.text,
    texts: step.texts,
    pattern: step.pattern,
    placeholder: step.placeholder,
    placeholders: step.placeholders,
    currentUrl: page.url(),
    title: await page.title().catch(() => ''),
    screenshot: screenshotPath,
    textSnippet: await shortTextSnippet(page),
  };
}

async function executePlan(plan, options = {}) {
  const browser = await chromium.launch({ headless: config.headless });

  const contextOptions = {};
  if (options.requiresAuth !== false) {
    if (!fs.existsSync(config.authStatePath)) {
      await browser.close();
      throw new Error(
        `Saved authentication state was not found at ${config.authStatePath}. ` +
          'Run npm run auth:setup first, or use a test case with requires_auth set to false.'
      );
    }
    contextOptions.storageState = config.authStatePath;
  }

  const context = await browser.newContext(contextOptions);

  const page = await context.newPage();
  const shotsDir = options.screenshotsDir || path.join(config.artifactsDir, 'screenshots');

  if (!fs.existsSync(shotsDir)) {
    fs.mkdirSync(shotsDir, { recursive: true });
  }

  const steps = [];
  let currentStep = null;

  try {
    for (let i = 0; i < plan.actions.length; i++) {
      const step = plan.actions[i];
      currentStep = { index: i + 1, action: step };

      await runStep(page, step);

      const shotPath = path.join(shotsDir, `step-${i + 1}.png`);
      await page.screenshot({ path: shotPath, fullPage: true });

      steps.push({
        step: i + 1,
        action: step.action,
        selector: step.selector,
        url: step.url,
        text: step.text,
        texts: step.texts,
        pattern: step.pattern,
        placeholder: step.placeholder,
        placeholders: step.placeholders,
        value: step.value,
        status: 'passed',
        screenshot: shotPath,
        currentUrl: page.url(),
      });
    }

    const finalShot = path.join(shotsDir, 'final.png');
    await page.screenshot({ path: finalShot, fullPage: true });

    return {
      status: 'passed',
      finalUrl: page.url(),
      finalScreenshot: finalShot,
      steps,
    };
  } catch (error) {
    const errorShot = path.join(
      shotsDir,
      currentStep ? `error-step-${currentStep.index}.png` : 'error.png'
    );
    await page.screenshot({ path: errorShot, fullPage: true }).catch(() => {});

    return {
      status: 'failed',
      error: error.message,
      finalUrl: page.url(),
      finalScreenshot: errorShot,
      failedStep: currentStep
        ? await buildFailureContext(page, currentStep.action, currentStep.index, errorShot)
        : undefined,
      steps,
    };
  } finally {
    await browser.close();
  }
}

module.exports = { executePlan };
