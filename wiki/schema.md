# Wiki Schema

## Role

The LLM agent maintains this wiki. Humans curate sources, ask questions, and review outcomes.

## Layers
- raw sources are immutable evidence under `raw/sources/`.
- wiki pages are compiled markdown knowledge under `pages/`.
- `index.md` is the content map and must be updated with page changes.
- `log.md` is chronological and append-only.

## Page Rules
- Use YAML frontmatter with title, slug, kind, status, createdAt, updatedAt, and sources.
- Use typed claims: accepted, hypothesis, or conflicted.
- Every accepted claim must include a following source line.
- Prefer wiki links like [[concept-slug]] for reusable concepts.

## Ingest

Read schema.md, index.md, then one raw source. Create or update source, concept, entity, and synthesis pages. Mark contradictions as conflicted instead of overwriting silently. Update index.md and log.md.

## Query

Read index.md first, then relevant pages. Answer with citations to wiki pages or raw sources. File reusable answers as question or synthesis pages.

## Evolve

Manual or automated agents read lint issues, recent runs, and candidate pages, then apply small source-backed improvements through validated updates.

## Lint

Check broken links, orphan pages, stale TODOs, unsupported sources, conflicted pages, duplicate slugs, and index drift.
