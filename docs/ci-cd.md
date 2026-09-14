# CI/CD Design

## Recommended flow

```text
Release
   |
   v
Deployment to QA/staging
   |
   v
Authorized QA runner
   |
   +--> Playwright + Chromium
   |
   +--> local/networked Ollama
   |
   v
Application under test
   |
   v
Plans + screenshots + reports
   |
   v
Pipeline pass/fail
```

The checked-in GitHub Actions workflow intentionally runs only `npm ci` and `npm run check`. It proves that source syntax, testcase schemas, profile matching, and deterministic guided-plan generation remain valid without requiring a browser session, models, or access to an application.

## Why full E2E is separate

The guided examples create repository state, and the extended example starts training. A safe E2E job therefore needs:

- an explicitly authorized QA or staging target;
- a dedicated least-privilege account;
- securely provisioned Playwright storage state;
- Chromium and required system libraries;
- access to the configured Ollama endpoint and models;
- cleanup or disposable test resources;
- protected artifact handling.

These conditions are application-specific and should not be guessed in a public workflow.

## When to use a self-hosted runner

Prefer a self-hosted runner when:

- Ollama must remain on a private network;
- GPU acceleration is desired;
- the QA application is not internet-accessible;
- browser auth must be bootstrapped in a controlled environment;
- large private datasets are mounted locally;
- predictable model and browser caches matter.

The same design can be used with GitHub Actions, GitLab CI, Jenkins, or another orchestrator. The runner needs Node.js, the Playwright browser, Ollama connectivity, and application connectivity.

## Configuration and secrets

Provision `.env` values through the CI system's secret/configuration mechanism. Do not commit a generated `.env` file. Treat Playwright `storageState` as a secret because it can contain reusable cookies and browser storage.

Recommended controls:

- use environment protection and manual approval for state-changing suites;
- keep `ALLOW_PROD=false` and validate the target host;
- rotate test sessions and accounts;
- use separate artifact retention rules for screenshots and traces;
- redact or withhold artifacts that show private customer or application data.

## Suggested job separation

### Pull requests

Run:

```bash
npm ci
npm run check
```

Optionally add isolated unit tests that do not need the application, Ollama, or auth.

### Post-deployment smoke

On an authorized runner, execute the shortest non-destructive or disposable guided flow. Publish the JSON report and screenshots with restricted retention.

### Nightly/regression

Run longer composite flows and large-data cases. Keep datasets outside Git and mount or fetch them from a controlled registry.

## Large upload design

Large uploads are roadmap work. A production-quality subsystem should resolve named datasets to runner-local files, verify hashes and expected metadata, upload with Playwright `setInputFiles`, observe network responses, and compare server-side outcomes. Run these expensive scenarios on a schedule rather than every commit.

## Failure behavior

The agent exits non-zero when planning or deterministic execution fails. Vision failure or skip status is recorded independently. CI should base its primary gate on the final functional status while retaining vision output for diagnosis.
