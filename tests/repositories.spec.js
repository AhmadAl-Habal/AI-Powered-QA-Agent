const { test, expect } = require('@playwright/test');
const config = require('../src/config');

test('repositories page shows saved-session content', async ({ page }) => {
  if (!config.targetUrl) {
    throw new Error('TARGET_URL is required for the repositories smoke test.');
  }

  await page.goto(config.targetUrl, { waitUntil: 'domcontentloaded' });

  await expect(page.getByText(config.ui.successText, { exact: true })).toBeVisible();
});
