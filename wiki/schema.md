# Wiki Schema

## Role

The LLM agent prepares source-backed knowledge and evidence-bound reflections. A trusted caller attests that a human reviewed the exact proposal or report bytes; the package validates the attestation and current hashes but does not authenticate the reviewer.

## Layers
- raw sources are immutable evidence under `raw/sources/`.
- raw memory evaluations are local observations under `raw/evals/`.
- wiki pages are compiled markdown knowledge under `pages/`.
- `index.md` is the content map and must be updated with page changes.
- `log.md` is chronological, append-only, and written only by the wiki package.

## Page Rules
- Use YAML frontmatter with title, slug, kind, status, createdAt, updatedAt, and sources.
- Active reflection pages also keep reviewed `retrievalTerms`. Use specific future task phrases and useful equivalents in other user languages; do not use generic kind names by themselves.
- Use typed claims: accepted, hypothesis, or conflicted.
- Keep source-backed facts in accepted claims and interpretations that still require project judgment in hypothesis claims.
- Every accepted claim must include a following source line.
- A source path proves provenance, not truth. Accepted status requires review of the exact claim/source pair.
- Keep each accepted claim distinct; do not duplicate the same claim/source pair across pages.
- Reflection pages keep `sources` empty because raw runs stay local; the task and report digests bind their evidence.
- Avoid stale metaphors, similes, idioms, and stock phrases.
- Prefer short, familiar words when they express the same meaning.
- Remove every word that does not add meaning.
- Prefer active voice when it makes the actor and action clearer.
- Replace foreign phrases, scientific terms, and jargon with everyday language when possible. Explain terms needed for precision.
- Treat these as judgment rules, not rigid formulas. Break one when following it would make the writing inaccurate, unclear, or unnatural.
- Keep one main idea per sentence. Split any sentence that is hard to understand in one pass.
- Prefer wiki links like [[concept-slug]] for reusable concepts.

## Ingest

Read schema.md, index.md, then one raw source. Preserve source coverage before compression by keeping distinct operating models, practices, risks, and tradeoffs as separate source-backed claims. Create or update source, concept, entity, and synthesis pages when the source contains reusable knowledge beyond a one-off summary. Check existing claim/source pairs before writing to avoid semantic duplicates. Mark contradictions as conflicted instead of overwriting silently. Route ambiguous contradictions, stale updates, and user-owned interpretations to review instead of silently overwriting. Prepare candidate page and index changes only. Ingest approval and promotion are not implemented yet.

## Query

Retrieve at most five relevant active source, concept, entity, synthesis, or question pages whose review date has not expired. Use them as navigation and synthesis context, then bind their raw sources as citable evidence. A compiled page does not itself prove a factual claim. Explicit source IDs add evidence but are not required when retrieved pages provide it. Prepare reusable answers as proposals with explicit claim/source pairs. Do not promote them before approval.

## Evolve

Manual or automated agents read lint issues, recent runs, and candidate pages, then prepare small source-backed candidate updates. Evolve approval and promotion are not implemented yet.

## Reflect

Prepare a task from one explicit run or summary, feedback, validation, and changed files. Return a typed failure, playbook, decision, or skip result. The package renders and lints candidate Markdown. Promote it only after review of the exact report digest.

## Memory

Retrieve at most three relevant active playbook, failure, or decision pages whose review date has not expired. Score reviewed retrieval terms before title, slug, summary, and body terms. Treat memories as guidance, not factual evidence. The current request, explicit instructions, and source evidence take precedence. Bind selected paths, content hashes, scores, and matched terms to answer tasks. Store explicit post-task usefulness observations under `raw/evals/`. For stronger evidence, derive a digest-bound control task that differs only by removing memory, then bind both answer-result hashes and the human preference to a paired comparison record.

## Lint

Check broken links, orphan concept/entity/synthesis pages, stale TODOs, unsupported sources, conflicted or review pages, active reflection pages without retrieval terms, duplicate slugs, duplicate accepted claims, stale active pages, and index drift.
