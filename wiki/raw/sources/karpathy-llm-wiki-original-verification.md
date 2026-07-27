# Karpathy LLM Wiki Original Verification

Source URL: https://gist.github.com/karpathy/442a6bf555914893e9891c11519de94f
Author: Andrej Karpathy
Original publication date: 2026-04-04
Verified: 2026-07-27

## Verification Scope

This note checks claims that were ambiguous in the earlier compact source note. It paraphrases the
original gist rather than copying it.

- Karpathy presents the LLM Wiki as a pattern, not a fixed product or reference implementation.
- The original describes three layers: immutable raw sources, LLM-maintained Markdown pages, and a
  schema or agent instruction file that defines maintenance conventions.
- Ingest integrates a source into summaries, entity and concept pages, the index, and the
  chronological log. Karpathy prefers processing sources one at a time with active review, while
  leaving batch ingestion as an optional workflow choice.
- Query starts from the maintained wiki, cites relevant material, and can file a reusable answer
  back into the wiki.
- Lint checks contradictions, stale claims, orphan pages, missing concepts, missing
  cross-references, and research gaps.

## Index and Search Boundary

Karpathy reports that a maintained index works at roughly one hundred sources and hundreds of
pages in his usage. He presents this as an experience report, not a universal benchmark or a
guaranteed threshold.

The original also says that an index can be enough at small scale and that proper search becomes
useful as the wiki grows. It names qmd as an optional local hybrid search tool. Therefore the
supported conclusion is conditional: start with the inspectable index, measure retrieval failures,
and add search infrastructure when the wiki's observed scale or recall requires it.

## Evidence Limits

- The source does not show a controlled comparison between an index and vector retrieval.
- It does not define a universal page-count threshold for changing retrieval methods.
- Claims about review gates, semantic deduplication, concurrent writers, and drift controls come
  from the comment discussion or later implementations, not from Karpathy's core proposal alone.
