# AI-Powered QA Automation Agent

AI-Powered QA Automation Agent is a local-first, open-source-oriented orchestration layer above Playwright. It uses local Ollama models, structured test cases, and reusable UI Flow Profiles to turn QA intent into guided browser execution, deterministic assertions, screenshot evidence, and structured reports. Playwright remains the browser automation engine; the agent adds normalization, planning, reusable application knowledge, and optional visual review.

The project is usable today for the guided flows represented by its profiles. It is not yet a fully autonomous system that can execute any arbitrary raw test case end to end.

> **Application-specific examples:** The included repository, sample-import, and training profiles demonstrate one application's workflow. They will not run against an arbitrary `BASE_URL`. To use this agent with another product, create or adapt Flow Profiles for that product's UI, labels, dialogs, and success signals.

## Project Status

**Working today:** raw testcase normalization, guided and composite Flow Profiles, constrained AI-assisted planning, Playwright execution, deterministic assertions, runtime values, screenshots/artifacts, and optional supporting vision analysis.

**Not yet fully automated:** matching arbitrary normalized testcases to profiles, generating guided testcases for unknown flows, one-command raw-Confluence execution, autonomous profile discovery, and self-healing UI automation.

## Quick Start

From the public project directory, install the Node.js dependencies and Chromium:

```bash
npm install
npx playwright install chromium
```

Create local configuration:

macOS/Linux:

```bash
cp .env.example .env
```

Windows PowerShell:

```powershell
Copy-Item .env.example .env
```

Configure a dedicated QA or staging environment in `.env`, then install the local Ollama models:

```bash
ollama pull qwen2.5:7b-instruct
ollama pull qwen2.5-coder:7b
ollama pull qwen3-vl:8b
```

After pasting a raw test case into `raw-testcases/inbox.txt`, normalize it with:

```bash
npm run testcase:normalize
```

The guided examples require adapted profiles, an authorized application-specific authentication setup, and a matching QA environment. They create application state; do not run them against production:

```bash
npm run agent:run -- testcases/examples/repository-create-guided.json
```

## Why This Project Exists

Traditional UI automation usually moves through a code-heavy handoff:

```text
Manual QA test case
        |
        v
Automation engineer
        |
        v
Selectors -> waits -> assertions -> maintenance
        |
        v
Executable script
```

This project explores an intent-first path:

```text
QA intent
   |
   v
Normalization
   |
   v
Reusable UI knowledge
   |
   v
Structured planning
   |
   v
Playwright execution
   |
   v
Validation and report
```

The aim is to preserve the reliability and control of Playwright while reducing duplicated application knowledge and making manual test intent easier to structure, compose, and execute.

## What Makes It Different From Normal Playwright Automation

Playwright is primarily code-first: engineers write locators, actions, waits, and assertions directly in tests. This project builds on Playwright with an intent-first layer:

- **Reusable UI Flow Profiles** hold stable application knowledge such as entry labels, dialog fingerprints, fields, and expected states.
- **AI-assisted planning** can translate structured test cases without a recognized profile into a constrained action schema.
- **Structured runtime values** generate values such as a unique repository name once and reuse them throughout the plan.
- **Natural-language normalization** turns Confluence-style test case text into validated JSON.
- **Composable flows** combine smaller profiles without duplicating locator or business-flow knowledge.
- **Optional vision analysis** reviews the final screenshot as a supporting signal.
- **Automated evidence** records plans, step screenshots, execution results, and a final report.

The guided profile paths in the current implementation are composed deterministically. The local planner model is the fallback for other structured test cases. This keeps the proven path predictable while retaining an AI-assisted planning path.

## Architecture

```text
Raw QA Test Case
       |
       v
AI Normalizer: qwen2.5:7b-instruct
       |
       v
Normalized Test Case JSON
       |
       |  manual selection/authoring boundary today
       v
Guided Test Case + Flow Profiles
       |
       +------ recognized profile ------> deterministic profile composer
       |
       +------ no recognized profile ---> AI Planner: qwen2.5-coder:7b
                                            |
                                            v
                                  Structured Action Plan
                                            |
                                            v
                                  Playwright Executor
                                            |
                         +------------------+------------------+
                         |                                     |
                         v                                     v
              Functional assertions                 Screenshots / logs
                         |                                     |
                         +------------------+------------------+
                                            |
                                            v
                                  Vision Validator (optional)
                                       qwen3-vl:8b
                                            |
                                            v
                                      Final QA Report
```

The main components are:

- `normalize-testcase.js`: prompts the local normalizer, sanitizes the response, and validates it against both normalization and agent schemas.
- `planner.js`: matches supported Flow Profiles and builds deterministic actions for them; otherwise it asks the local coding model for a schema-constrained plan.
- `ui-profiles/`: stores reusable UI and business-flow knowledge.
- `executor.js`: runs the supported action vocabulary with Playwright and captures evidence after every step.
- `vision.js`: optionally asks a local vision model to review the final screenshot.
- `run-agent.js`: coordinates planning, execution, vision, and artifact generation.

See [docs/architecture.md](docs/architecture.md) for the current and target data flows.

## Flow Profiles

Flow Profiles are reusable application knowledge, not complete test scripts. A profile describes stable vocabulary and expected UI state for a focused operation.

Included base profiles:

- `create-repository`
- `sample-import`
- `repository-post-import`
- `train-model`
- `models-dropdown`

The composite profile joins them in this order:

```text
create-repository
        -> sample-import
        -> repository-post-import
        -> train-model
        -> models-dropdown
```

The guided test case supplies intent and test data; the profiles supply reusable UI knowledge; the planner produces an executable action list. This reduces repeated labels, dialog checks, business transitions, and runtime-value handling across tests.

See [docs/flow-profiles.md](docs/flow-profiles.md) for the profile contract and composition example.

## Current Capabilities

- Raw Confluence-style test case normalization with local `qwen2.5:7b-instruct`
- Validated normalized JSON output
- Reusable base and composite UI Flow Profiles
- Deterministic guided-plan composition for supported profiles
- Schema-constrained AI planning fallback with local `qwen2.5-coder:7b`
- Playwright browser execution with a constrained action vocabulary
- Saved Playwright authentication state support
- Unique runtime values for generated repository names
- Deterministic functional assertions and waits
- Screenshot evidence after each successful step and at failure/final state
- Optional local `qwen3-vl:8b` screenshot analysis
- Structured plan, execution, vision, and final-report artifacts

## Current Limitations

- Arbitrary raw test cases are not automatically converted all the way into executable guided tests.
- Normalization and guided execution are separate stages today.
- Supported guided execution depends on an existing Flow Profile and UI vocabulary that matches the target application.
- The generic AI planning fallback is constrained but does not make arbitrary workflows reliable or autonomous.
- Vision is supplementary. It does not override deterministic Playwright assertions or determine the current final pass/fail verdict.
- Authentication bootstrap is environment-specific and may require adapting the success signal in `src/config.js`.
- UI profiles must be maintained when the target product changes.
- The included profile labels describe the proven reference flow; adopters should adapt them to their own QA application.

## Proven Demo Flow

The extended guided flow has passed end to end with Playwright in its source environment:

```text
Create Repository
  -> Import Fruit Detection
  -> Verify import success
  -> Open generated Repository
  -> Verify imported images are Ready
  -> Open Build a Model
  -> Select Object Detection
  -> Check visible Normal / Plus training-setting labels
  -> Start Training
  -> Detect the repository/model state update
  -> Verify the Models panel and generated model
```

The primary functional result comes from Playwright assertions. The vision result is recorded separately and treated as supporting context.

The public repository does not include the original authentication state, target URL, execution artifacts, or screenshots. Running the flow requires an authorized QA environment whose UI matches the profiles.

## Requirements

- Node.js 20 or later
- npm
- Playwright Chromium
- [Ollama](https://ollama.com/) running locally or at a configured endpoint
- The following Ollama models:

```bash
ollama pull qwen2.5:7b-instruct
ollama pull qwen2.5-coder:7b
ollama pull qwen3-vl:8b
```

A GPU is recommended for faster local inference, but Ollama can run supported models without one when sufficient system resources are available. Exact requirements vary by model build and quantization.

## Installation

Clone your published repository URL, then install dependencies and Chromium:

```bash
git clone <your-repository-url>
cd qa-agent-public
npm install
npx playwright install chromium
```

Create local configuration:

macOS/Linux:

```bash
cp .env.example .env
```

Windows PowerShell:

```powershell
Copy-Item .env.example .env
```

Edit `.env` for a dedicated QA or staging environment, then pull the models shown above. The example URLs are placeholders and are not a runnable target.

Run the offline project checks before connecting to an application:

```bash
npm run check
```

## Configuration and Safety

All local paths may be absolute or relative to the project root. Environment values are trimmed before use, avoiding errors such as a trailing space in a model name.

The Playwright configuration and agent planner reject production-like `BASE_URL`, `LOGIN_URL`, and test targets unless `ALLOW_PROD=true` is set deliberately. Keep this guard enabled and use dedicated test accounts and disposable test data.

Important variables are documented in `.env.example`:

- `BASE_URL`, `LOGIN_URL`, and `TARGET_URL`
- `OLLAMA_BASE_URL`
- `NORMALIZER_MODEL`, `PLANNER_MODEL`, and `VISION_MODEL`
- `HEADLESS` and `ALLOW_PROD`
- `AUTH_STATE_PATH`, `ARTIFACTS_DIR`, and `RAW_TESTCASE_PATH`
- assertion, navigation, and auth setup timeouts

## Authentication

Playwright storage state contains cookies and browser storage that let a new browser context reuse an authenticated session. It is sensitive and must never be committed.

`npm run auth:setup` is an application-specific example/foundation, not a universal authentication solution. It assumes a headed UI login and the configured success text. Other applications may require API login, SSO, MFA, CAPTCHA handling, or a different manual bootstrap. Adapt the test and configuration for the target application.

1. Configure `LOGIN_URL` or `BASE_URL` in `.env`.
2. Run the headed bootstrap:

   ```bash
   npm run auth:setup
   ```

3. Complete login manually if prompted.
4. The setup waits for the configured repositories success text and writes `playwright/.auth/user.json`.

The public project contains only `playwright/.auth/.gitkeep`; `.gitignore` excludes all saved state. Adapt the login URL and success signal to your own application. Do not add credentials to source code.

## Normalizing a Raw Test Case

Paste a manual test case into `raw-testcases/inbox.txt`, then run:

```bash
npm run testcase:normalize
```

Or normalize the included sanitized example:

```bash
npm run testcase:normalize -- raw-testcases/example-confluence-testcase.txt
```

Equivalent shortcut:

```bash
npm run testcase:normalize:sample
```

The normalizer checks that Ollama is reachable and that the configured model is installed. Valid output is written to `testcases/normalized/<testcase-id>.json`. Validation failures produce debug files under the ignored `artifacts/normalizer-debug/` directory.

Normalization does **not** currently trigger profile matching, guided testcase generation, or browser execution automatically. Review the normalized JSON and author or select a compatible guided flow.

## Running a Guided Test

The examples below are application-specific demonstrations. Create or adapt compatible Flow Profiles, configure an authorized QA target, and create local auth state before running either command. A generic `BASE_URL` alone is not sufficient:

```bash
npm run agent:run -- testcases/examples/repository-create-guided.json
```

Extended reference flow:

```bash
npm run agent:run -- testcases/examples/repository-create-sample-train-guided.json
```

These are state-changing browser tests: they create a repository and the extended example starts training. Run them only against an authorized, disposable QA environment whose labels and behavior match the included profiles. They are not executed by CI or by the repository's offline checks.

## Generated Artifacts

Each agent run writes an ignored directory:

```text
artifacts/<run-id>/
|-- plan.json
|-- execution-result.json
|-- vision-result.json
|-- final-report.json
`-- screenshots/
    |-- step-1.png
    |-- ...
    `-- final.png or error-step-<n>.png
```

- `plan.json`: validated structured actions and generated runtime values.
- `execution-result.json`: functional step outcomes, URLs, and evidence paths.
- `vision-result.json`: optional vision analysis, failure, or skip reason.
- `final-report.json`: combined planner and execution status plus supporting vision status.
- `screenshots/`: page evidence captured during execution.

Artifacts can contain private application data. Review and sanitize them before sharing.

## Functional vs Vision Validation

Deterministic Playwright assertions are the primary verdict. Vision is a supporting signal that may help describe the final state or identify an obvious visual problem. It must not overrule a deterministic assertion.

The current report uses `passed` only when planning and functional execution pass, regardless of whether vision passes or is skipped. A future policy could express a result such as:

```text
functional: passed
vision: skipped
overall: passed_with_warning
```

`passed_with_warning` is a recommended roadmap behavior; it is not implemented today.

## Example Raw Test Case

```text
Title: Create a repository from a sample dataset

|| Step || Action || Pre-condition || Test data || Expected result || Passed ||
| 1 | Open repositories | User is authenticated | | Repositories page is visible | [ ] |
| 2 | Create a repository | Repositories page is visible | Name: "QA Sample Repository" | Dialog accepts the values | [ ] |
| 3 | Choose Fruit Detection | Add Content dialog is open | Sample dataset: Fruit Detection | Import begins | [ ] |
```

See `raw-testcases/example-confluence-testcase.txt` for the complete sanitized example.

## Example Guided Flow

```json
{
  "id": "repository-create-guided",
  "title": "Create repository and open add content dialog",
  "flow_profile": "create-repository",
  "requires_auth": true,
  "start_url": null,
  "test_data": {
    "repository_name": "QA Guided Repository",
    "description": "Created by the guided QA agent"
  },
  "steps": [
    {
      "description": "Open repository creation",
      "expected_result": "Create New Repository dialog opens"
    }
  ],
  "expected_results": [
    "Create New Repository dialog opens"
  ]
}
```

The full examples include all fields required by the schema.

## Project Structure

```text
qa-agent-public/
|-- .github/workflows/ci.yml
|-- README.md
|-- LICENSE
|-- .env.example
|-- package.json
|-- playwright.config.js
|-- src/
|   |-- config.js
|   |-- normalize-testcase.js
|   |-- planner.js
|   |-- executor.js
|   |-- vision.js
|   |-- run-agent.js
|   `-- ui-profiles/
|-- testcases/
|   |-- examples/
|   `-- normalized/
|-- raw-testcases/
|-- playwright/.auth/
|-- artifacts/
|-- tests/
|-- scripts/
`-- docs/
```

`src/` contains the runtime, `testcases/examples/` contains publishable guided inputs, `raw-testcases/` contains the normalization inbox and sample, and `docs/` records architecture and delivery decisions. Runtime authentication, normalized output, and artifacts are ignored.

## CI/CD Vision

The included GitHub Actions workflow runs dependency installation plus syntax and schema checks. It does not download Ollama models, authenticate to an application, or run the state-changing E2E flow.

Full execution can evolve to GitHub Actions, GitLab CI, Jenkins, or another system with this shape:

```text
Release -> deployment -> QA runner -> Playwright + Ollama -> application -> artifacts -> pass/fail
```

A self-hosted runner is usually the best fit when local Ollama access, GPU acceleration, private QA networking, browser authentication, or large datasets are required. See [docs/ci-cd.md](docs/ci-cd.md).

## Large Dataset / Upload Testing

Large-file testing is a design direction, not a complete subsystem in this repository. The intended approach is:

- keep binary data in an external dataset registry or controlled storage;
- reference datasets through configuration rather than committing them to Git;
- use Playwright `setInputFiles` for browser uploads;
- add network-level confirmation for accepted requests and server outcomes;
- run expensive uploads in nightly or regression suites rather than on every commit.

Local directories such as `test-data/`, `qa-data/`, and `datasets/` are ignored by default.

## Roadmap

### Phase 1 — complete / working

- Raw test case normalization
- Guided Flow Profiles and composite profiles
- Structured planning
- Playwright execution
- Functional assertions and report artifacts
- Optional vision analysis

### Phase 2 — next

- Automatic matching between normalized test cases and profiles
- Guided testcase generation from normalized intent
- Reviewable confidence and mismatch output

### Phase 3

- One-command raw testcase execution, targeting an interface such as:

  ```bash
  npm run agent:from-raw -- raw-testcases/inbox.txt
  ```

This command does not exist yet.

### Phase 4

- Self-hosted CI/CD execution
- External test-data registry
- Large-file upload scenarios
- Richer network validation

### Phase 5

- Profile discovery assistance
- Carefully bounded self-healing suggestions with human review
- Richer failure analysis
- Batch testcase execution

See [docs/roadmap.md](docs/roadmap.md) for acceptance criteria and boundaries.

## Security

- Never commit `.env`, storage state, cookies, tokens, or production credentials.
- Use dedicated least-privilege test accounts.
- Keep `ALLOW_PROD=false`; avoid destructive runs against production.
- Store large or private test data outside Git.
- Treat screenshots, traces, and reports as potentially sensitive.
- Sanitize artifacts before attaching them to tickets or publishing them.
- Review generated plans before expanding the supported action set.

## Portfolio Context

This project demonstrates QA engineering, Playwright and Node.js automation, local LLM integration, agent orchestration, schema-constrained planning, structured validation, reusable test design, evidence capture, and pragmatic AI-assisted QA workflows. It also makes the system boundaries visible: deterministic browser checks remain authoritative, while AI is applied where interpretation and planning add value.

## Contributing

Issues and focused pull requests are welcome. Before submitting a change:

1. Keep new behavior scoped to explicit action schemas and profiles.
2. Add or update sanitized testcase examples.
3. Run `npm run check`.
4. Do not include auth state, `.env`, datasets, screenshots, or generated artifacts.
5. Clearly label experimental or roadmap behavior.

## License

This project is available under the [ISC License](LICENSE), preserving the license declared by the source project's package metadata.
