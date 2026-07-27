# Wiki Memory Retrieval and Evaluation

## Purpose

Approved reflection pages become useful only when later work can find them. The memory flow selects
reviewed guidance before a Wiki answer task, binds the exact selection to the task, and records
explicit observations after the task.

The flow is provider-neutral. Retrieval and evaluation are deterministic host operations and do not
call a model API, subscription CLI, browser, or network.

## Eligible Memory

Retrieval considers only `playbook`, `failure`, and `decision` pages with `status: active`.
`superseded`, `review`, `draft`, and `conflicted` pages are excluded. An active page is also excluded
after its `reviewAfter` timestamp.

The exact reflection apply flow creates active pages after digest approval. A manually authored
active page relies on repository review and trusted maintainer discipline; the package does not
reconstruct or authenticate that external approval history.

## Deterministic Selection

The query is split into normalized letter and number terms. Common English function words are
removed. Each matching term receives its strongest field weight:

- title: 8
- slug: 6
- summary: 4
- remaining page content: 1

Results are ordered by relevance score. Ties prefer `playbook`, then `failure`, then `decision`, and
finally the canonical page path. At most three pages are returned. A page with no matching term is
unrelated and is not injected.

`wiki memory retrieve` prints the selected page bytes, SHA-256 hashes, scores, and matched terms.
Use `--out` when a private exchange artifact is needed:

```bash
pnpm cli wiki memory retrieve "review the requested memory scope"
pnpm cli wiki memory retrieve "review the requested memory scope" --out memory-context.json
```

## Automatic Answer-Task Injection

`wiki answer task` runs the same retrieval automatically. Selected memory references and content
hashes become part of the answer-task digest, and their page bytes are included in its contexts.
Changing a selected page makes the task stale.

Memory is guidance, not evidence. The task tells the model that the current request, explicit
instructions, and selected source evidence take precedence. Memory pages cannot be cited as answer
evidence unless they are independently present as selected source evidence.

## Usefulness Observation

After completing a task, create a private evaluation input. Assess every selected memory exactly
once:

```json
{
  "taskOutcome": "improved",
  "assessments": [
    {
      "path": "pages/failures/memory-candidate-scope-mismatch.md",
      "verdict": "helpful",
      "note": "It prevented a scope substitution."
    }
  ],
  "note": "The answer stayed within the requested memory layer."
}
```

Allowed task outcomes are `improved`, `unchanged`, and `worse`. Allowed page verdicts are `helpful`,
`unused`, and `harmful`.

```bash
pnpm cli wiki memory evaluate \
  --task answer-task.json \
  --input memory-evaluation.json
pnpm cli wiki memory stats
```

Records are stored under ignored `wiki/raw/evals/`. They bind the answer task digest, selected page
path and hash, verdicts, and timestamp. They do not copy the answer, source contexts, or task prompt.
Aggregate stats expose counts and helpful or harmful rates by page.

## Interpretation

The evaluation is an explicit human or trusted-caller observation, not a model self-score. It can
show repeated usefulness, disuse, or harm, but it has no no-memory control group and therefore
cannot prove causal improvement. Use enough observations to decide whether to revise, supersede, or
retain a page. Add A/B evaluation only when the workflow has enough repeated tasks to support it.
