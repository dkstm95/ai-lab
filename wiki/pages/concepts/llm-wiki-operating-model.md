---
title: LLM Wiki Operating Model
slug: llm-wiki-operating-model
kind: concept
status: active
createdAt: 2026-06-19T00:00:00.000Z
updatedAt: 2026-07-27T07:41:29.819Z
reviewAfter: 2026-12-19T00:00:00.000Z
sources:
  - raw/sources/karpathy-llm-wiki.md
  - raw/sources/karpathy-llm-wiki-original-verification.md
  - raw/sources/karpathy-llm-wiki-comments.md
---

## Summary

An LLM Wiki compiles curated evidence into persistent Markdown knowledge through explicit ingest, query, lint, review, and drift-control practices.

## Key Claims

- accepted: An LLM Wiki maintains persistent knowledge instead of reconstructing every synthesis from retrieved raw chunks.
  source: raw/sources/karpathy-llm-wiki.md
- accepted: The operating model separates immutable raw evidence, LLM-maintained Markdown pages, and written maintenance rules.
  source: raw/sources/karpathy-llm-wiki-original-verification.md
- accepted: Ingest should update source summaries, related concept or entity pages, the index, and the chronological log.
  source: raw/sources/karpathy-llm-wiki-original-verification.md
- accepted: Karpathy prefers reviewing sources one at a time while treating batch ingestion as an optional workflow choice.
  source: raw/sources/karpathy-llm-wiki-original-verification.md
- accepted: Query should cite maintained knowledge and can file reusable answers back into the wiki.
  source: raw/sources/karpathy-llm-wiki-original-verification.md
- accepted: Lint should check contradictions, stale claims, orphan pages, missing concepts, missing links, and research gaps.
  source: raw/sources/karpathy-llm-wiki-original-verification.md
- accepted: Karpathy reports that an index worked for roughly one hundred sources and hundreds of pages, but this is an experience report rather than a universal retrieval threshold.
  source: raw/sources/karpathy-llm-wiki-original-verification.md
- accepted: Search infrastructure should be added when observed scale or retrieval failures justify it instead of being assumed from the start.
  source: raw/sources/karpathy-llm-wiki-original-verification.md
- accepted: Concurrent writers should prefer append-only or partitioned targets, single-writer ownership, and deterministic collision rules.
  source: raw/sources/karpathy-llm-wiki-comments.md
- accepted: Deduplication and contradiction checks should use stable source-backed claim identity rather than text position or proximity.
  source: raw/sources/karpathy-llm-wiki-comments.md
- accepted: Ambiguous contradictions, stale changes, and user-owned interpretations should go through review instead of silent automatic resolution.
  source: raw/sources/karpathy-llm-wiki-comments.md

## Links

- [[ai-data-learning-advantage]]
- [[karpathy-llm-wiki]]
- [[memory-candidate-scope-mismatch]]
