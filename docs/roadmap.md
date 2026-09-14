# Roadmap

The roadmap separates demonstrated behavior from proposed work. Items are not considered implemented until code, validation, and documentation agree.

## Implemented

### Normalization

- Confluence-style raw testcase ingestion
- Local `qwen2.5:7b-instruct` integration
- Structured-output request with JSON fallback
- Output cleanup and two-stage Zod validation
- Normalized JSON and validation debug artifacts

### Guided planning

- Explicit guided testcase format
- Base and composite Flow Profiles
- Deterministic composition for repository creation and the extended sample-to-training flow
- Unique repository runtime values and derived model name
- Constrained `qwen2.5-coder:7b` fallback for unprofiled structured input

### Execution and evidence

- Playwright action executor
- Deterministic text, URL, dialog, enabled-state, and nearby-text assertions
- File upload action support
- Saved authentication state
- Step, final, and failure screenshots
- Plan, execution, vision, and final reports
- Optional local `qwen3-vl:8b` analysis

## Next

### Automatic profile matching

Build a matcher that compares normalized intent with profile capabilities and returns:

- candidate profile identifiers;
- match confidence and reasons;
- missing required data;
- ambiguous or unsupported steps;
- a human-reviewable selection.

### Guided testcase generation

Generate a schema-valid guided testcase from a normalized testcase plus selected profiles. Preserve traceability from every generated guided step to its source step. Do not silently discard unsupported intent.

Acceptance requires tests for correct matches, ambiguous cases, unsupported cases, and profile-version changes.

## Future

### One-command raw execution

Target interface:

```bash
npm run agent:from-raw -- raw-testcases/inbox.txt
```

The orchestration should stop for review or fail safely when confidence is low, required data is missing, or a state-changing action is not authorized. This command is not implemented today.

### CI/CD execution

- self-hosted runner reference configuration;
- secure auth-state provisioning;
- post-deployment smoke and nightly regression tiers;
- structured artifact publication and retention;
- disposable resource cleanup.

### Test-data registry and uploads

- external dataset identifiers and metadata;
- runner-local path resolution;
- checksums and data validation;
- large upload scenarios;
- request/response and server-state validation.

### Assisted profile discovery

- record missing UI knowledge during controlled exploration;
- propose profile updates rather than applying them silently;
- compare changed labels and dialog fingerprints;
- require review before execution uses new application knowledge.

This is assistance, not an implemented self-healing system.

### Failure analysis and scale

- richer correlation between failed actions, page state, console logs, and network events;
- configurable functional/vision warning policies;
- batch testcase execution and aggregate reports;
- profile compatibility and version checks.

## Engineering guardrails

Every phase should preserve:

- Playwright as the execution engine;
- explicit schemas between AI and execution;
- deterministic assertions as the primary verdict;
- auditable application knowledge;
- production-target safety;
- local-first operation without committed credentials or private data.
