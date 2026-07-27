# Wiki Schema

## Role

The LLM agent proposes source-backed changes. For answer proposals, a trusted caller attests that a human reviewed the exact bytes; the package validates the attestation and current hashes but does not authenticate the reviewer.

## Layers
- raw sources are immutable evidence under `raw/sources/`.
- wiki pages are compiled markdown knowledge under `pages/`.
- `index.md` is the content map and must be updated with page changes.
- `log.md` is chronological, append-only, and written only by the wiki package.

## Page Rules
- Use YAML frontmatter with title, slug, kind, status, createdAt, updatedAt, and sources.
- Use typed claims: accepted, hypothesis, or conflicted.
- Keep source-backed facts in accepted claims and interpretations that still require project judgment in hypothesis claims.
- Every accepted claim must include a following source line.
- A source path proves provenance, not truth. Accepted status requires review of the exact claim/source pair.
- Keep each accepted claim distinct; do not duplicate the same claim/source pair across pages.
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

Read index.md first, then relevant pages. Answer with citations to wiki pages or raw sources. Prepare reusable answers as proposals with explicit claim/source pairs. Do not promote them before approval.

## Evolve

Manual or automated agents read lint issues, recent runs, and candidate pages, then prepare small source-backed candidate updates. Evolve approval and promotion are not implemented yet.

## Lint

Check broken links, orphan pages, stale TODOs, unsupported sources, conflicted or review pages, duplicate slugs, duplicate accepted claims, stale active pages, and index drift.
