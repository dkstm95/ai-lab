# Wiki Shadow Rebuild

Shadow rebuild measures whether the current Wiki can be reconstructed from managed evidence without
changing live pages. Version 2 supports existing `source` and `concept` pages.

## Why It Is Separate

The answer workflow creates a reusable question page and can promote it after review. Rebuild hides
existing page bodies, generates replacements from source evidence, and compares them with baseline.

Task, result, compare, and review do not update `index.md`, `log.md`, or live pages. Promotion is a
separate digest-approved command.

## Manual Provider-Neutral Flow

```bash
pnpm cli wiki rebuild task \
  --sources karpathy-llm-wiki,karpathy-llm-wiki-comments \
  --out karpathy-rebuild-task.json

# Give the prompt in the task artifact to any AI platform.
# Save its exact JSON response as karpathy-rebuild-result.json.

pnpm cli wiki rebuild compare \
  --task karpathy-rebuild-task.json \
  --result karpathy-rebuild-result.json \
  --out karpathy-rebuild-report.json

pnpm cli wiki rebuild review karpathy-rebuild-report.json

pnpm cli wiki rebuild apply karpathy-rebuild-report.json \
  --task karpathy-rebuild-task.json \
  --result karpathy-rebuild-result.json \
  --reviewer "<name>" \
  --accept-digest "<full-reviewed-report-digest>"
```

Artifacts live under `.ai-lab/wiki-exchange`. The task and result schemas do not name a provider,
API, subscription product, or transport. A web subscription, local model, or trusted integration
can produce the same result object.

## Target Selection

The host, not the model, selects targets:

1. Resolve the requested IDs to managed files under `raw/sources`.
2. Find existing pages whose metadata cites at least one selected source.
3. Keep only `source` and `concept` pages.
4. Require at least one supported page and at most ten pages.
5. Sort targets by path.

The result must return every target exactly once. It cannot add a path, choose another kind, change
metadata, or cite an unselected source. The candidate preserves existing status, including `review`
and `conflicted`. Source-only and concept-only selections are valid.

## Task Binding

The task digest binds:

- the generation timestamp used by candidate metadata and lint;
- Wiki schema and index bytes;
- selected source IDs, paths, bytes, and hashes;
- target paths, metadata, and baseline hashes;
- allowed Wiki link slugs;
- instructions and the rendered prompt.

Existing target page bodies are not task contexts. The index remains context because it is the Wiki
content map and its exact bytes must remain current. Before comparison, the host rebuilds the task
from the live Wiki and rejects any digest change as stale.

## Result Shape

Each result page contains only:

- its host-selected path;
- a one-line plain-text summary;
- one-line plain-text accepted claims with selected source IDs;
- one-line source-derived hypotheses that still require project judgment;
- allowed Wiki links.

The host renders frontmatter and markdown. This keeps model output from selecting paths, status,
timestamps, or raw source references directly. Summary and claim text cannot contain Wiki-link
syntax; links must use the validated `links` field. Hypotheses render as typed claims under
`Application Notes`; an empty list omits that section.

## Report

Comparison runs against a temporary copy of the complete Wiki. The report records:

- baseline and candidate SHA-256 values;
- exact accepted claims retained, removed, and added;
- exact hypotheses retained, removed, and added;
- baseline, candidate, removed, and added second-level section headings;
- baseline, candidate, removed, and added Wiki links;
- baseline, candidate, and missing source paths;
- baseline and candidate lint;
- introduced and resolved lint issues;
- the full candidate files and an exact report digest.

Accepted claims use normalized text plus source path for identity; hypotheses use normalized text.
Neither detects paraphrases. Quality, truth, section meaning, and acceptable loss remain review
decisions.

## Promotion

Apply reparses the original task, result, and reviewed report, recreates the report from the current
Wiki, and requires its digest to equal the accepted digest. This rechecks schema, index, sources,
targets, candidate bytes, comparison, and lint immediately before promotion.

Promotion replaces only host-selected pages and appends one audit entry to `log.md`. The shared
transaction validates the complete candidate, rechecks live state, rolls back failed commits, and
allows each report ID to be applied once.

Missing sections or claims remain visible rather than being automatically rejected because a
deliberate rewrite may remove them. Applying that loss requires explicit digest acceptance.

## Evaluation Log

The 2026-07-27 migration rehearsal used three independent managed source sets:

- The Karpathy source and concept candidates passed structural and semantic review after a new
  verification source scoped the index-first retrieval claim as an author-reported experience, not
  a universal benchmark. Digest: `6a15cb39c1d880da4dc5e6d317b43b1177e689f3d695f08b3fc3bfbf2b8202fc`.
- The Principal IC source and concept candidates passed after the main review restored distinct
  practices concerning cross-functional scope, undervalued work, calibrated feedback, and making
  room for others. Digest: `42faad44adf9b5f979630bc8cb2400e2e63e1ab461e34d6f59ba802cf3d9afce`.
- The Understanding AI-generated Code version 1 candidate was held because the old contract could
  not represent hypotheses. Version 2 restored that layer and passed semantic review. Digest:
  `6ca9ac987915e22af8c5d4705a83c7e419f867d47d359cdef77b3a79f60eaf65`.

Every baseline and candidate lint report was clean. Shadow operations did not change target pages
or `index.md`.

## Limitations

- Version 2 does not rebuild synthesis, failure, decision, or other rich page kinds.
- It renders a canonical summary, accepted claims, optional application hypotheses, and links.
- Version 1 artifacts are rejected; regenerate them to bind the richer semantic contract.
- It does not execute a model itself or expose `rebuild run`.
