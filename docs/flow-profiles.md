# Flow Profiles

## Definition

A Flow Profile is a CommonJS data module containing reusable knowledge about one focused UI operation. It is not a complete Playwright test and it does not execute browser actions by itself.

A profile may describe:

- stable visible labels and alternate entry triggers;
- form labels and placeholders;
- dialog fingerprint text;
- domain-specific success signals;
- timeout expectations;
- default selections;
- rules for runtime values.

The planner turns profile data plus a guided testcase into a validated action plan.

> **Application-specific examples:** The included repository, sample-import, and training profiles demonstrate one application's workflow. They are not expected to work against an arbitrary `BASE_URL`. To use this agent with another product, create or adapt Flow Profiles for that product's UI, labels, dialogs, and success signals.

## Base profiles

The project includes five base profiles.

| Profile | Responsibility |
| --- | --- |
| `create-repository` | Open repository creation, fill details, submit, and verify the add-content dialog. |
| `sample-import` | Select the Fruit Detection sample and wait for import success. |
| `repository-post-import` | Describe the imported folder and Ready-state assertion. |
| `train-model` | Open model training, select Object Detection, check the visible Normal and Plus training-setting labels, and start training. |
| `models-dropdown` | Open and validate the models panel and generated model entry. |

Each profile is intentionally narrow. It can be updated without rewriting the entire composite journey.

## Composite profile

`repository-create-sample-train.js` imports the five base profiles and records their order:

```text
create-repository
        -> sample-import
        -> repository-post-import
        -> train-model
        -> models-dropdown
```

The planner owns the actual action composition. The composite module owns identity, ordering, and references to its parts.

## Guided testcase

A guided testcase is normal testcase JSON with an explicit `flow_profile` and relevant `test_data`:

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
      "description": "Create a repository",
      "expected_result": "Add Content to Repository dialog appears"
    }
  ],
  "expected_results": [
    "Add Content to Repository dialog appears"
  ]
}
```

`start_url: null` means the run uses `TARGET_URL` from local configuration. The example contains no environment-specific URL, but its profile vocabulary remains application-specific.

## Runtime values

Runtime values are generated or resolved once during planning and reused by later actions and assertions. The repository profile marks the repository name as `unique_per_run`; the planner appends a compact timestamp. The composite plan then derives the expected model name from that generated repository name.

Example plan fragment:

```json
{
  "runtime_values": {
    "repository_name": "QA Guided Repository 20260914-103015-042",
    "repository_description": "Created by the guided QA agent",
    "expected_model_name": "QA Guided Repository 20260914-103015-042 01"
  }
}
```

This prevents a test from generating one name and later asserting against a different hard-coded value.

## Adding a profile

1. Create a focused module under `src/ui-profiles/`.
2. Store UI knowledge as data; keep browser calls in the executor.
3. Add explicit selection logic in `planner.js`.
4. Add a deterministic plan builder if the flow should be guided.
5. Keep every emitted action within `SUPPORTED_ACTIONS` and `PlanSchema`.
6. Add a sanitized guided testcase under `testcases/examples/`.
7. Extend `scripts/validate-examples.js` if new selection rules need additional checks.
8. Run `npm run check` before executing any browser flow.

Do not embed credentials, storage state, private URLs, or local absolute paths in a profile.

## Maintenance principles

- Prefer accessibility roles, labels, placeholders, and visible business text over brittle CSS structure.
- Use dialog fingerprints when a title alone could match hidden or unrelated content.
- Keep timeouts close to the operation that needs them.
- Use deterministic assertions for functional truth.
- Treat model-generated or self-healing profile changes as proposals requiring review.
