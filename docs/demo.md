# Portfolio Demo Script

This script fits a five-to-ten-minute walkthrough. Prepare a dedicated QA environment, Ollama, Chromium, and local auth state before the meeting. Never demonstrate against production.

The included guided profiles are an application-specific demonstration workflow. Before using this script with another product, adapt the profiles, target URL, authentication bootstrap, and success signals to that product.

## 1. Show the raw testcase

Open `raw-testcases/example-confluence-testcase.txt` and point out the Confluence-style rows, preconditions, test data, and expected results. Explain that it is readable by a QA engineer and contains no browser selectors.

## 2. Normalize it

Run:

```bash
npm run testcase:normalize -- raw-testcases/example-confluence-testcase.txt
```

Explain that `qwen2.5:7b-instruct` runs locally through Ollama. The output is sanitized and validated before it is accepted.

## 3. Show normalized output

Open the generated file under `testcases/normalized/`. Highlight:

- normalized title and identifier;
- inferred authentication requirement;
- row-level preconditions and expected results;
- structured test data;
- any split suggestions.

State the boundary plainly: this output is not automatically executable end to end yet.

## 4. Explain Flow Profiles

Open `src/ui-profiles/create-repository.js` and `src/ui-profiles/repository-create-sample-train.js`.

Describe base profiles as reusable application knowledge and the composite as an ordered bundle:

```text
create-repository -> sample-import -> repository-post-import -> train-model -> models-dropdown
```

## 5. Run a guided test

For the short flow:

```bash
npm run agent:run -- testcases/examples/repository-create-guided.json
```

For the full proven flow:

```bash
npm run agent:run -- testcases/examples/repository-create-sample-train-guided.json
```

Warn the audience that both examples create state, and the extended flow starts model training. Use only an authorized disposable QA environment.

## 6. Show browser execution

With `HEADLESS=false`, point out:

- a unique repository name is generated once;
- labels and dialog fingerprints come from profiles;
- Playwright performs the browser operations;
- deterministic assertions gate progress;
- screenshots are captured after steps.

## 7. Open artifacts

Open the newest directory under `artifacts/` and review:

```text
plan.json
execution-result.json
vision-result.json
final-report.json
screenshots/
```

Show how the final report connects the input, selected profiles, runtime values, functional status, final URL, failure context, and evidence paths.

## 8. Explain the vision layer

Open `vision-result.json`. Explain that `qwen3-vl:8b` can provide a supporting review of the final screenshot. It is optional and local. A missing model may produce `skipped` without changing a successful deterministic functional result.

## 9. Explain the current limitation

Use this wording:

> Raw normalization and guided execution both work, but automatic normalized-testcase-to-profile matching and guided testcase generation are not connected yet. Supported execution currently relies on guided testcases and maintained Flow Profiles.

Also note that the guided profile plan is composed deterministically; the coding model is used as a constrained fallback for other structured cases.

## 10. Explain the roadmap

Close with the next engineering steps:

1. scored profile matching;
2. reviewable guided testcase generation;
3. one-command raw-to-execution orchestration;
4. self-hosted CI with external test data;
5. profile discovery and richer failure analysis.

Avoid calling the current system fully autonomous or self-healing.
