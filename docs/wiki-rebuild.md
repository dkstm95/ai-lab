# Wiki Shadow Rebuild

Shadow rebuild measures whether the current Wiki can be reconstructed from managed evidence without
changing live pages. Version 1 supports existing `source` and `concept` pages.

## Why It Is Separate

The answer workflow creates a reusable question page and can promote it after review. A rebuild has
a different purpose: hide the existing page bodies, generate replacement candidates from source
evidence, and compare them with the baseline.

Shadow rebuild has no `apply` command. It does not update `index.md`, `log.md`, or live pages.

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
```

Artifacts live under `.ai-lab/wiki-exchange`. The task and result schemas do not name a provider,
API, subscription product, or transport. A web subscription, local model, or trusted integration
can produce the same result object.

## Target Selection

The host, not the model, selects targets:

1. Resolve the requested IDs to managed files under `raw/sources`.
2. Find existing pages whose metadata cites at least one selected source.
3. Keep only `source` and `concept` pages.
4. Require at least one page of each kind and at most ten pages.
5. Sort targets by path.

The result must return every target exactly once. It cannot add a path, choose another page kind,
change metadata, or cite an unselected source. The candidate preserves each target's existing
status, including `review` and `conflicted`; rebuild does not claim that those states were resolved.

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
- allowed Wiki links.

The host renders frontmatter and markdown. This keeps model output from selecting paths, status,
timestamps, or raw source references directly. Summary and claim text cannot contain Wiki-link
syntax; links must use the validated `links` field.

## Report

Comparison runs against a temporary copy of the complete Wiki. The report records:

- baseline and candidate SHA-256 values;
- exact accepted claims retained, removed, and added;
- baseline, candidate, removed, and added Wiki links;
- baseline, candidate, and missing source paths;
- baseline and candidate lint;
- introduced and resolved lint issues;
- the full candidate files and an exact report digest.

Claim retention uses the same identity as deterministic Wiki lint: normalized claim text plus source
path. It does not decide whether differently worded claims mean the same thing. Semantic quality,
truth, and acceptable information loss remain human review decisions.

## Limitations

- Version 1 does not rebuild synthesis, failure, decision, or other rich page kinds.
- It renders a canonical summary, accepted-claims, and links layout.
- It does not execute a model itself or expose `rebuild run`.
- It does not promote candidates.
- A clean lint report proves structural consistency, not factual correctness.

Promotion should be added only after repeated shadow runs establish acceptable source coverage and
human reviewers can inspect multi-page changes safely.
