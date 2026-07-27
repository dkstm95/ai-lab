# Wiki Knowledge Retrieval

## Purpose

The knowledge flow implements the LLM Wiki query operation. It finds maintained Wiki pages before
an answer task, then binds the raw sources cited by those pages as factual evidence.

This is not raw-chunk RAG. The durable search target is compiled, reviewed Markdown. Raw sources
remain immutable evidence and enter the task only when a selected page or trusted caller cites them.

## Knowledge and Memory

The two retrieval paths have different authority:

- Knowledge retrieval selects `source`, `concept`, `entity`, `synthesis`, and `question` pages.
  These pages guide navigation and synthesis. Their raw sources support factual citations.
- Memory retrieval selects `playbook`, `failure`, and `decision` pages. These pages guide behavior
  and cannot be cited as factual evidence.

An answer task can contain both. The current request and explicit instructions remain authoritative.

## Deterministic Selection

Only `active` knowledge pages are eligible. A page is excluded when its `reviewAfter` timestamp has
passed or is invalid. The query is normalized into letter and number terms. Common English question
words and a narrow set of Korean particles and question endings are removed. When a query contains
more than one retained term, a page must match at least two. When a query contains specific terms,
one isolated match on `AI`, `LLM`, or `Wiki` does not select a page.

Each matching query term receives its strongest field weight:

- title: 8
- slug: 6
- summary or conclusion: 4
- heading: 2
- remaining body: 1

Results are ordered by score, matched-term count, page-kind priority, and canonical path. Kind ties
prefer synthesis, concept, question, entity, then source. At most five pages are returned.

```bash
pnpm cli wiki knowledge retrieve "AI 시대에 해자가 되는 것은 데이터일까?"
pnpm cli wiki knowledge retrieve "AI 시대의 경쟁 우위" --out knowledge-context.json
```

The output contains exact page bytes, SHA-256 hashes, scores, matched terms, and source paths. The
context digest binds the full selection. Validation rejects it after any selected page or ranking
input changes.

## Retrieval Evaluation

The reviewed fixture at `wiki/evals/knowledge-retrieval.json` contains real questions, required
pages and sources, allowed pages, and unrelated questions that should return no result.

```bash
pnpm wiki:knowledge:eval
```

The command calls no model or API. It fails when a required page or source is missing, a selected
page is outside the case allowlist, or an unrelated question retrieves a page. The report includes
case pass rate, required-page recall, allowed-page precision, required-source recall, and
abstention accuracy. Add or revise cases when the Wiki gains a durable topic or an observed search
failure. Do not loosen a case merely to preserve the current ranking.

## Answer-Task Integration

`wiki answer task` runs knowledge and memory retrieval automatically:

```bash
pnpm cli wiki answer task "AI 시대에 해자가 되는 것은 데이터일까?" --out task.json
```

For each selected knowledge page, the host resolves its frontmatter `sources` to managed files under
`raw/sources`. It adds those files to the task evidence and allows answer claims to cite their source
IDs. `--sources <id,...>` is optional and adds trusted caller-selected evidence.

The task binds:

- caller-requested source IDs;
- selected knowledge paths, hashes, scores, terms, and source paths;
- selected memory references;
- raw evidence IDs and paths;
- schema, index, page, memory, and raw-source context bytes;
- instructions and the rendered prompt.

A task with neither explicit evidence nor knowledge-backed raw sources fails before model execution.
Changing the query result, a selected page, or evidence makes a prepared task stale.

## Limits

- Retrieval is lexical and does not resolve synonyms unless the page contains both terms.
- Korean normalization handles a narrow reviewed suffix set, not full morphological analysis.
- A source path proves provenance, not truth. Human review still decides whether a claim is accepted.
- Embeddings, graph traversal, and reranking remain deferred until observed misses justify them.
