# AI-Powered QA Automation Agent

A local-first QA automation agent built on top of **Playwright** and **Ollama**.

The project adds an AI-assisted orchestration layer around browser automation: it can normalize human-written QA test cases, compose supported UI flows from reusable profiles, generate structured execution plans, run deterministic Playwright assertions, capture evidence, and optionally review the final UI state with a vision model.

> **Current scope:** the agent is reliable for flows covered by existing UI Flow Profiles. It does **not** yet execute arbitrary raw test cases end to end without profile selection or authoring.

> **Application-specific examples:** the included repository, sample-import, and training profiles demonstrate one product workflow. Adapt the profiles, labels, dialogs, and success signals before using them with another application.

## Why This Project Exists

Traditional UI automation is usually code-first:

```text
Manual QA test case
        ↓
Automation engineer
        ↓
Locators + waits + assertions + test data
        ↓
Playwright script
```

This project explores an intent-first layer:

```text
QA intent
   ↓
Normalization
   ↓
Reusable UI knowledge
   ↓
Structured planning
   ↓
Playwright execution
   ↓
Evidence + report
```

Playwright remains the execution engine. The agent focuses on reducing duplicated application knowledge and making QA flows easier to compose and reuse.

## How It Differs From Normal Playwright Automation

| Traditional Playwright | This Agent |
|---|---|
| Test logic is written directly in code | QA intent can start as structured or natural-language input |
| Locators and flow knowledge often live inside individual tests | Reusable **Flow Profiles** centralize application-specific UI knowledge |
| Test data flow is manually wired per test | Runtime values can be generated once and reused across the flow |
| Each test owns most of its execution logic | Base profiles can be composed into larger guided flows |
| Screenshots/reports are added manually | Plans, screenshots, execution results, and final reports are generated as artifacts |
| Visual review is separate | Optional local vision analysis can provide a supporting signal |

## Architecture

```text
Raw QA Test Case
       ↓
qwen2.5:7b-instruct
       ↓
Normalized Test Case JSON
       ↓
Guided Test Case + Flow Profiles
       ↓
Deterministic profile composer
or qwen2.5-coder:7b planner
       ↓
Structured Action Plan
       ↓
Playwright Executor
       ↓
Functional Assertions + Screenshots
       ↓
Optional qwen3-vl:8b review
       ↓
Final QA Report
```

### Main components

- **Normalizer** — converts Confluence-style/manual test cases into validated JSON.
- **Flow Profiles** — store reusable UI knowledge such as labels, dialogs, states, and business transitions.
- **Planner** — builds a constrained execution plan.
- **Executor** — runs supported actions with Playwright and records evidence.
- **Vision layer** — optionally reviews the final screenshot.
- **Reporter** — stores plan, execution, vision, screenshots, and final status.

More detail: [Architecture](docs/architecture.md) · [Flow Profiles](docs/flow-profiles.md)

## Current Status

### Working today

- Raw test case normalization with `qwen2.5:7b-instruct`
- Validated normalized JSON
- Base and composite UI Flow Profiles
- Deterministic guided-plan composition for supported flows
- Schema-constrained fallback planning with `qwen2.5-coder:7b`
- Playwright browser execution
- Runtime values such as unique repository names
- Functional assertions and waits
- Screenshot evidence
- Optional `qwen3-vl:8b` visual review
- Structured run artifacts and final reports
- Saved Playwright authentication-state support

### Not fully automated yet

- Automatic matching of arbitrary normalized test cases to profiles
- Automatic guided-test generation for unknown flows
- One-command raw-Confluence-to-browser execution
- Autonomous profile discovery
- Self-healing UI automation

The normalizer and guided execution pipeline currently exist as separate stages.

## Proven Guided Flow

The extended reference flow has passed end to end with Playwright in its source environment:

```text
Create Repository
  → Import Fruit Detection
  → Verify import success
  → Open generated repository
  → Verify imported images are Ready
  → Build a Model
  → Select Object Detection
  → Check Normal / Plus settings
  → Start Training
  → Detect repository/model state update
  → Verify Models panel and generated model
```

Deterministic Playwright assertions are the primary functional verdict. Vision analysis is supplementary and does not override functional assertions.

## Requirements

- Node.js 20+
- npm
- Playwright Chromium
- [Ollama](https://ollama.com/)
- Local models:

```bash
ollama pull qwen2.5:7b-instruct
ollama pull qwen2.5-coder:7b
ollama pull qwen3-vl:8b
```

A GPU is recommended for faster local inference, but it is not required by the project itself.

## Quick Start

```bash
git clone <your-repository-url>
cd AI-Powered-QA-Agent
npm install
npx playwright install chromium
```

Create local configuration:

**macOS / Linux**
```bash
cp .env.example .env
```

**Windows PowerShell**
```powershell
Copy-Item .env.example .env
```

Edit `.env` for your QA/staging environment and Ollama endpoint.

Run safe local checks:

```bash
npm run check
npx playwright test --list
```

## Normalize a Raw Test Case

Paste a manual or Confluence-style test case into:

```text
raw-testcases/inbox.txt
```

Then run:

```bash
npm run testcase:normalize
```

Or:

```bash
npm run testcase:normalize -- raw-testcases/example-confluence-testcase.txt
```

Normalized output is written under `testcases/normalized/`.

> Normalization does not currently trigger profile matching or browser execution automatically.

## Run a Guided Test

The included guided flows are application-specific demonstrations. Adapt the profiles, authentication, and target environment before running them.

```bash
npm run agent:run -- testcases/examples/repository-create-guided.json
```

Extended state-changing reference flow:

```bash
npm run agent:run -- testcases/examples/repository-create-sample-train-guided.json
```

Do not run state-changing examples against production.

## Flow Profiles

Included profiles:

```text
create-repository
sample-import
repository-post-import
train-model
models-dropdown
```

Composite example:

```text
create-repository
    → sample-import
    → repository-post-import
    → train-model
    → models-dropdown
```

Profiles are intentionally application-specific and keep UI knowledge reusable instead of duplicating it across tests.

## Generated Artifacts

Each run writes:

```text
artifacts/<run-id>/
├── plan.json
├── execution-result.json
├── vision-result.json
├── final-report.json
└── screenshots/
```

Artifacts can contain private application data. Review them before sharing.

## Authentication

Authentication is application-specific.

The project supports Playwright `storageState`, but different applications may require UI login, API login, SSO, MFA, CAPTCHA handling, or a manual bootstrap.

Never commit `.env`, cookies, tokens, credentials, or `playwright/.auth/user.json`.

## Safety

State-changing guided flows can create repositories, import data, or start training.

Use dedicated QA/staging environments and keep `ALLOW_PROD=false` unless you deliberately understand and accept the risk.

## Project Structure

```text
.
├── src/
│   ├── planner.js
│   ├── executor.js
│   ├── vision.js
│   ├── normalize-testcase.js
│   └── ui-profiles/
├── testcases/
├── raw-testcases/
├── tests/
├── scripts/
├── docs/
└── artifacts/
```

## CI/CD

The included GitHub Actions workflow runs safe static/schema checks only. It does not run the state-changing E2E flow.

For full execution, a self-hosted runner is a better fit when you need local Ollama access, GPU acceleration, private QA networking, saved authentication, or large datasets.

See [CI/CD](docs/ci-cd.md).

## Roadmap

**Next**
- Automatic normalized-testcase → Flow Profile matching
- Guided testcase generation
- Confidence/mismatch reporting

**Later**
- One-command raw testcase execution
- Self-hosted CI/CD execution
- External test-data registry
- Large-file upload scenarios
- Richer network validation
- Bounded profile-discovery / self-healing assistance
- Batch testcase execution

See [Roadmap](docs/roadmap.md).

## Documentation

- [Architecture](docs/architecture.md)
- [Flow Profiles](docs/flow-profiles.md)
- [Demo Guide](docs/demo.md)
- [CI/CD](docs/ci-cd.md)
- [Roadmap](docs/roadmap.md)

## License

ISC — see [LICENSE](LICENSE).
