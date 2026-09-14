const path = require('path');

const projectRoot = path.resolve(__dirname, '..');

require('dotenv').config({
  path: path.join(projectRoot, '.env'),
  quiet: true,
});

function env(name, fallback) {
  const value = process.env[name];
  return typeof value === 'string' && value.trim() ? value.trim() : fallback;
}

function parseTimeoutMs(value, fallback) {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : fallback;
}

function parseBoolean(value, fallback = false) {
  if (typeof value !== 'string') {
    return fallback;
  }

  return value.trim().toLowerCase() === 'true';
}

function resolveProjectPath(value, fallback) {
  const configured = typeof value === 'string' && value.trim() ? value.trim() : fallback;
  return path.isAbsolute(configured) ? path.normalize(configured) : path.resolve(projectRoot, configured);
}

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

function looksNonProduction(url) {
  const hostname = url.hostname.toLowerCase();
  return (
    hostname === 'localhost' ||
    hostname === '127.0.0.1' ||
    hostname === '::1' ||
    hostname.endsWith('.local') ||
    hostname.endsWith('.test') ||
    /(^|[-.])(dev|qa|sandbox|stage|staging|stg|test)([-.]|$)/.test(hostname)
  );
}

const allowProduction = parseBoolean(process.env.ALLOW_PROD, false);

function assertSafeTarget(name, value) {
  const url = parseUrl(value);
  if (!url || allowProduction || looksNonProduction(url)) {
    return;
  }

  throw new Error(
    `${name} points to a production-like host (${url.hostname}). ` +
      'Set ALLOW_PROD=true only if you intentionally want browser automation to run there.'
  );
}

module.exports = {
  projectRoot,
  baseUrl: env('BASE_URL'),
  loginUrl: env('LOGIN_URL'),
  targetUrl: env('TARGET_URL'),
  ollamaBaseUrl: env('OLLAMA_BASE_URL', 'http://127.0.0.1:11434'),
  headless: parseBoolean(process.env.HEADLESS, false),
  allowProduction,
  assertSafeTarget,

  assertTimeoutMs: parseTimeoutMs(process.env.ASSERT_TIMEOUT_MS, 30_000),
  pageGotoTimeoutMs: parseTimeoutMs(process.env.PAGE_GOTO_TIMEOUT_MS, 60_000),
  authSetupTimeoutMs: parseTimeoutMs(process.env.AUTH_SETUP_TIMEOUT_MS, 180_000),

  models: {
    planner: env('PLANNER_MODEL', 'qwen2.5-coder:7b'),
    normalizer: env('NORMALIZER_MODEL', 'qwen2.5:7b-instruct'),
    vision: env('VISION_MODEL', 'qwen3-vl:8b'),
  },

  ui: {
    emailSelector: 'input[name="email"]',
    passwordSelector: 'input[name="password"]',
    submitSelector: 'button[type="submit"]',
    successText: 'Your Repositories',
  },

  authStatePath: resolveProjectPath(process.env.AUTH_STATE_PATH, 'playwright/.auth/user.json'),
  artifactsDir: resolveProjectPath(process.env.ARTIFACTS_DIR, 'artifacts'),
  rawTestcasePath: resolveProjectPath(process.env.RAW_TESTCASE_PATH, 'raw-testcases/inbox.txt'),
};
