const { defineConfig, devices } = require('@playwright/test');
const config = require('./src/config');

function parseUrl(value) {
  if (!value) {
    return undefined;
  }

  try {
    return new URL(value);
  } catch {
    return undefined;
  }
}

config.assertSafeTarget('BASE_URL', config.baseUrl);
config.assertSafeTarget('LOGIN_URL', config.loginUrl);
config.assertSafeTarget('TARGET_URL', config.targetUrl);

const targetUrl = parseUrl(config.targetUrl);
const baseURL = config.baseUrl || (targetUrl ? targetUrl.origin : undefined);

module.exports = defineConfig({
  testDir: './tests',
  timeout: 90_000,
  expect: {
    timeout: config.assertTimeoutMs,
  },
  retries: process.env.CI ? 1 : 0,
  reporter: 'list',
  use: {
    baseURL,
    headless: config.headless,
    navigationTimeout: config.pageGotoTimeoutMs,
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
  },
  projects: [
    {
      name: 'setup',
      testMatch: /auth\.setup\.spec\.ts/,
      use: {
        ...devices['Desktop Chrome'],
        storageState: undefined,
      },
    },
    {
      name: 'chromium',
      // dependencies: ['setup'],
      testIgnore: /auth\.setup\.spec\.ts/,
      use: {
        ...devices['Desktop Chrome'],
        storageState: config.authStatePath,
      },
    },
  ],
});
