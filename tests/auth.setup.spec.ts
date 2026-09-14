const { test: setup, expect } = require('@playwright/test');
const fs = require('fs');
const path = require('path');
const config = require('../src/config');

setup('manual auth bootstrap', async ({ page }) => {
  setup.setTimeout(config.authSetupTimeoutMs);

  const loginUrl = config.loginUrl || (config.baseUrl ? new URL('/login', config.baseUrl).toString() : undefined);

  if (!loginUrl) {
    throw new Error('LOGIN_URL is required for manual auth setup. Set LOGIN_URL in .env or provide BASE_URL.');
  }

  // Run this in headed mode and complete login manually if the app prompts.
  // Once the repositories page is visible, the authenticated session is saved.
  await page.goto(loginUrl, {
    waitUntil: 'domcontentloaded',
    timeout: config.pageGotoTimeoutMs,
  });

  await expect(page.getByText(config.ui.successText, { exact: true })).toBeVisible({
    timeout: config.authSetupTimeoutMs,
  });

  fs.mkdirSync(path.dirname(config.authStatePath), { recursive: true });
  await page.context().storageState({ path: config.authStatePath });
});
