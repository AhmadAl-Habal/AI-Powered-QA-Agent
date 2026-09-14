# Architecture

## Design goal

The project adds an intelligence and orchestration layer above Playwright. It separates interpretation from execution so that AI output is constrained by schemas and browser pass/fail decisions remain deterministic wherever possible.

## Current data flow

Two entry paths exist today.

### Raw testcase normalization

```text
Confluence-style text
        |
        v
normalize-testcase.js
        |
        v
qwen2.5:7b-instruct through Ollama
        |
        v
sanitization + Zod validation
        |
        v
testcases/normalized/<id>.json
```

The normalizer preserves row-level preconditions and expected results, removes status-column noise, extracts useful data hints, and creates split suggestions only when they relate to the input. It retries with JSON-only output when the installed Ollama version rejects the detailed response schema.

The normalized file is an output boundary. It is not automatically passed into profile matching or execution today.

### Guided execution

```text
guided testcase JSON
        |
        v
TestCaseSchema validation
        |
        v
profile selection
        |
        +-- recognized profile --> deterministic plan composition
        |
        `-- no profile ----------> qwen2.5-coder:7b constrained planner
                                      |
                                      v
                               PlanSchema validation
                                      |
                                      v
                               Playwright executor
                                      |
                         +------------+------------+
                         |                         |
                         v                         v
                 functional result          screenshots
                         |                         |
                         +------------+------------+
                                      |
                                      v
                              optional qwen3-vl:8b
                                      |
                                      v
                              structured final report
```

Recognized guided flows do not depend on probabilistic model output for their action list. The composite profile is converted into actions by ordinary code and then checked by `PlanSchema`. Unrecognized structured cases can use the local coding model, but the result must use the supported actions and pass schema validation.

## Component responsibilities

### Configuration

`src/config.js` loads `.env` from the project root, trims string values, parses booleans and timeouts, and resolves data paths relative to the project root. It exports application URLs, model names, browser behavior, auth storage, and artifact locations.

### Ollama client

`src/ollama-client.js` owns the client for the configurable local Ollama endpoint. Models are selected by the normalizer, planner, and vision components.

### Schemas

- `raw-testcase-normalizer-schema.js` validates the normalized representation returned after cleanup.
- `testcase-schema.js` validates inputs accepted by the agent runner.
- `PlanSchema` in `planner.js` restricts execution to a small, explicit action vocabulary.

Schema validation is a trust boundary: free-form model text is never sent directly to the browser executor.

### Planner and Flow Profiles

Flow Profiles hold reusable application knowledge. `planner.js` selects a supported profile from the declared profile, title, tags, and step text. It generates runtime values and creates the ordered action list for recognized guided flows. The fallback planner asks the coding model for JSON using only supported action fields.

### Executor

`executor.js` maps structured actions to Playwright operations. Supported actions cover navigation, clicks, fills, uploads, waits, text and URL assertions, dialog fingerprints, enabled state, nearby text, and panel state. Each successful action produces a screenshot. Failures record page context and an error screenshot.

### Vision

`vision.js` sends the final screenshot to the configured local vision model. Missing screenshots, unavailable Ollama, or missing models can produce a skipped result. Vision status is stored separately and does not override the functional verdict.

### Orchestrator and artifacts

`run-agent.js` validates the testcase, creates a unique run directory, builds a plan, executes it, requests optional vision analysis, and writes the final report. Planner or execution failure produces a non-zero process exit code.

## Deterministic execution versus AI reasoning

AI is used for interpreting raw prose and, when no guided profile is recognized, proposing a constrained plan. Deterministic code is responsible for:

- schema validation;
- guided profile composition;
- runtime value generation;
- locator execution and waiting;
- functional assertions;
- status calculation;
- evidence and report writing.

This boundary limits model freedom at the point where application state changes occur. Adding a new browser capability requires adding an explicit schema member and executor implementation.

## Why profiles exist

Raw language often omits selectors, exact labels, dialog boundaries, timeouts, and reliable success signals. Asking a model to rediscover those details on every run is slow and unpredictable. A Flow Profile captures that knowledge once while keeping it composable and reviewable.

Profiles also expose maintenance clearly: when the target UI changes, the affected labels or fingerprints are updated in one focused module rather than across many complete scripts.

## Current versus target architecture

Current:

```text
raw input -> normalized JSON -> human review/boundary
guided JSON -> known profiles -> execution
```

Target:

```text
raw input
   -> normalized JSON
   -> automatic profile matching with confidence
   -> guided testcase generation and review
   -> plan
   -> execution
```

Automatic matching and guided testcase generation are roadmap work. A future one-command path must keep schema validation, auditable profile selection, production safety, and deterministic verdicts intact.
