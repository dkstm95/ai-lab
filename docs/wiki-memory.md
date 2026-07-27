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
removed, and a narrow list of Korean particles is removed from Hangul terms. Domain-generic terms
such as `LLM`, `Wiki`, `task`, `memory`, and `기억` do not count by themselves. A reflection result
must provide specific `retrievalTerms`. Reviewed equivalents in another user language let a Korean
request select an English page without an embedding service or model call.

Every meaningful term in a multiword retrieval phrase must occur in the query before that phrase
receives the retrieval-term weight. Each matching query term then receives its strongest field
weight:

- retrieval term: 10
- title: 8
- slug: 6
- summary: 4
- remaining page content: 1

Results are ordered by relevance score. Ties prefer `playbook`, then `failure`, then `decision`, and
finally the canonical page path. At most three pages are returned. A page with no matching term is
unrelated and is not injected.

Retrieval terms are page metadata. Reflection report approval binds them to the exact candidate,
and changing them later changes the page hash and makes previously prepared tasks stale.

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
  "assessments": [{
    "path": "pages/failures/memory-candidate-scope-mismatch.md",
    "verdict": "helpful"
  }],
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

## Paired Comparison

An observation can be biased because the reviewer already knows which memory was used. For a
stronger check, derive a control task from the exact selected-memory task:

```bash
pnpm cli wiki memory control --task answer-task.json --out control-task.json
```

The control keeps the same question, source evidence, and non-memory instructions. It removes only
the selected memory references, memory page contexts, and memory precedence instruction. Its own
digest binds that difference.

Run both tasks through the same AI platform and model settings, preferably in separate sessions and
in alternating order. Then save a human judgment:

```json
{
  "preference": "memory",
  "assessments": [{
    "path": "pages/failures/memory-candidate-scope-mismatch.md",
    "verdict": "helpful"
  }],
  "note": "The memory answer stayed within the requested scope."
}
```

Allowed preferences are `memory`, `control`, and `tie`. Record the exact task and result pair:

```bash
pnpm cli wiki memory compare --task answer-task.json --control-task control-task.json \
  --result memory-result.json --control-result control-result.json \
  --input comparison.json
```

The record stores hashes of both results, the control task identity, the preference, and every
per-page assessment. It does not copy answer text into the Wiki log.

## Interpretation

Evaluation is an explicit human or trusted-caller judgment, not a model self-score. A plain
observation can show repeated usefulness, disuse, or harm but cannot establish that memory caused
the difference. A paired comparison controls the task inputs more tightly, but one pair can still
reflect model variance, run order, or reviewer bias. Repeat comparable pairs before revising,
superseding, or retaining a page.
