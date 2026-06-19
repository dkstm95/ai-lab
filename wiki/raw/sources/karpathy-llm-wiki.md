# Karpathy LLM Wiki Source Note

Source URL: https://gist.github.com/karpathy/442a6bf555914893e9891c11519de94f
Author: Andrej Karpathy
Created: 2026-04-04
Retrieved: 2026-06-19

## Source Note

Karpathy describes an "LLM Wiki" pattern for personal or team knowledge bases. The main contrast is with ordinary RAG: instead of retrieving raw chunks and re-synthesizing from scratch on every question, an LLM incrementally maintains a persistent markdown wiki that compiles, links, reconciles, and updates knowledge as sources and questions arrive.

The proposed architecture has three layers:

- raw sources: immutable curated evidence such as articles, papers, notes, images, and data files.
- wiki pages: LLM-generated markdown summaries, entity pages, concept pages, comparisons, overviews, and syntheses.
- schema or agent instructions: the maintenance contract that tells the LLM how the wiki is structured and how ingest, query, and lint workflows should operate.

The operations are:

- ingest: add one or more sources, read them, write a source summary, update relevant entity and concept pages, revise syntheses, flag contradictions, update the index, and append the log.
- query: answer from the wiki with citations, then optionally file valuable answers back into the wiki as reusable pages.
- lint: periodically check contradictions, stale claims, orphan pages, missing cross-references, missing concept pages, and data gaps.

The source emphasizes two special files:

- index.md: content-oriented map of pages, used first when answering queries.
- log.md: chronological append-only record of ingests, queries, and lint passes, ideally parseable with simple tools.

Suggested optional tooling includes local markdown search such as qmd, Obsidian Web Clipper, local image attachment capture, Obsidian graph view, Marp for decks, Dataview for frontmatter queries, and git for history, branching, and collaboration.

The underlying rationale is that humans often abandon wikis because bookkeeping costs grow quickly. LLMs can handle summarizing, cross-linking, filing, consistency checks, and repetitive maintenance while humans curate sources, ask questions, direct analysis, and think about meaning.

The document is explicitly abstract: directory structure, schema conventions, page formats, and tools should be instantiated with an LLM agent for the user's domain and preferences.
