---
title: Karpathy LLM Wiki
slug: karpathy-llm-wiki
kind: source
status: active
createdAt: 2026-06-19T00:00:00.000Z
updatedAt: 2026-07-27T07:41:29.819Z
reviewAfter: 2026-12-19T00:00:00.000Z
sources:
  - raw/sources/karpathy-llm-wiki-original-verification.md
  - raw/sources/karpathy-llm-wiki.md
  - raw/sources/karpathy-llm-wiki-comments.md
---

## Summary

Karpathy proposes a configurable personal or team knowledge-base pattern in which an LLM incrementally maintains interlinked Markdown from curated sources.

## Key Claims

- accepted: Karpathy presents the LLM Wiki as a configurable pattern rather than a fixed product or reference implementation.
  source: raw/sources/karpathy-llm-wiki-original-verification.md
- accepted: The proposal contrasts a persistent compiled wiki with retrieval workflows that reassemble raw chunks for every question.
  source: raw/sources/karpathy-llm-wiki.md
- accepted: The proposal uses three layers consisting of immutable sources, generated Markdown pages, and maintenance instructions.
  source: raw/sources/karpathy-llm-wiki-original-verification.md
- accepted: Ingest integrates a source into summaries, related pages, the index, and the append-only log.
  source: raw/sources/karpathy-llm-wiki-original-verification.md
- accepted: Useful query answers can become durable wiki pages instead of disappearing with chat history.
  source: raw/sources/karpathy-llm-wiki-original-verification.md
- accepted: The proposed lint operation checks contradictions, stale knowledge, missing structure, missing links, and research gaps.
  source: raw/sources/karpathy-llm-wiki-original-verification.md
- accepted: The author reports that index-first navigation worked at roughly one hundred sources and hundreds of pages without presenting that scale as a controlled benchmark.
  source: raw/sources/karpathy-llm-wiki-original-verification.md
- accepted: Local Markdown search, Obsidian features, Marp, Dataview, and git are optional tools rather than required parts of the pattern.
  source: raw/sources/karpathy-llm-wiki.md
- accepted: People curate sources, choose questions, direct analysis, and judge meaning while the LLM handles repetitive maintenance.
  source: raw/sources/karpathy-llm-wiki.md
- accepted: The comment discussion adds review gates, citation-backed deduplication, concurrent-write controls, provenance, and drift detection.
  source: raw/sources/karpathy-llm-wiki-comments.md

## Links

- [[llm-wiki-operating-model]]
