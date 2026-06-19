---
title: Karpathy LLM Wiki
slug: karpathy-llm-wiki
kind: source
status: active
createdAt: 2026-06-19T00:00:00.000Z
updatedAt: 2026-06-19T01:00:00.000Z
reviewAfter: 2026-12-19T00:00:00.000Z
sources:
  - raw/sources/karpathy-llm-wiki.md
  - raw/sources/karpathy-llm-wiki-comments.md
---

## Summary

Karpathy's gist describes [[llm-wiki-operating-model]]: an agent-maintained markdown wiki that sits between humans and raw sources. Instead of using RAG only to retrieve chunks at query time, the agent compiles durable pages, links concepts, records contradictions, and files valuable answers back into the wiki. The local raw source is a source note with URL and retrieval metadata rather than a verbatim full-text copy. The visible comments add reliability constraints: human review gates, citation-backed deduplication, append-only or partitioned writes, and drift detection.

## Key Claims

- accepted: An LLM Wiki differs from ordinary RAG by compiling and maintaining persistent markdown knowledge instead of re-deriving synthesis from raw retrieved chunks on every query.
  source: raw/sources/karpathy-llm-wiki.md
- accepted: The pattern uses three layers: immutable raw sources, LLM-owned wiki pages, and schema or agent instructions that define maintenance workflows.
  source: raw/sources/karpathy-llm-wiki.md
- accepted: Ingest should integrate new sources into existing pages by updating summaries, entity pages, concept pages, syntheses, index entries, and the chronological log.
  source: raw/sources/karpathy-llm-wiki.md
- accepted: Query answers can become durable wiki pages when they contain reusable analysis, comparisons, or connections that should not disappear into chat history.
  source: raw/sources/karpathy-llm-wiki.md
- accepted: Lint passes should look for contradictions, stale claims, orphan pages, missing cross-references, missing concept pages, and research gaps.
  source: raw/sources/karpathy-llm-wiki.md
- accepted: The index is content-oriented navigation, while the log is an append-only chronological record that helps humans and agents understand recent wiki evolution.
  source: raw/sources/karpathy-llm-wiki.md
- accepted: Humans remain responsible for source curation, question selection, review, and meaning-making, while the LLM handles repetitive wiki maintenance.
  source: raw/sources/karpathy-llm-wiki.md
- accepted: The comment discussion identifies semantic duplication as a separate risk from git textual merge conflicts, so multi-agent wiki writes need citation-backed deduplication and commutative write models.
  source: raw/sources/karpathy-llm-wiki-comments.md
- accepted: Ambiguous contradictions, stale-memory updates, and user-owned interpretations should be routed through human review instead of silent autonomous overwrite.
  source: raw/sources/karpathy-llm-wiki-comments.md

## Links

- [[llm-wiki-operating-model]]
