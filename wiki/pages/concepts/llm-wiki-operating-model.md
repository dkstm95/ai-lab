---
title: LLM Wiki Operating Model
slug: llm-wiki-operating-model
kind: concept
status: active
createdAt: 2026-06-19T00:00:00.000Z
updatedAt: 2026-07-15T03:54:12.000Z
reviewAfter: 2026-12-19T00:00:00.000Z
sources:
  - raw/sources/karpathy-llm-wiki.md
  - raw/sources/karpathy-llm-wiki-comments.md
---

## Summary

An LLM Wiki is a durable knowledge compilation workflow. Raw sources stay immutable, the LLM maintains structured markdown pages, and a schema constrains how ingest, query, lint, and review work. The operating goal is compounding knowledge: each source and useful question should improve future answers by updating the wiki once instead of forcing the agent to reconstruct context every time. Reliability depends on preserving provenance, avoiding duplicate claim/source pairs, and routing ambiguous changes through review.

## Key Claims

- accepted: Treat raw sources as immutable evidence and wiki pages as compiled, editable knowledge derived from that evidence.
  source: raw/sources/karpathy-llm-wiki.md
- accepted: A useful wiki schema should define page conventions and the ingest, query, and lint workflows so the agent behaves like a maintainer rather than a generic chatbot.
  source: raw/sources/karpathy-llm-wiki.md
- accepted: Ingest should preserve source coverage before compression by integrating each source into summaries, concept pages, entity pages, syntheses, index entries, and log entries.
  source: raw/sources/karpathy-llm-wiki.md
- accepted: Query workflows should cite wiki pages or raw sources, and reusable answers should be filed back as durable pages.
  source: raw/sources/karpathy-llm-wiki.md
- accepted: Lint is a first-class operation because the wiki can decay through contradictions, stale claims, missing links, orphan pages, and missing source coverage.
  source: raw/sources/karpathy-llm-wiki.md
- accepted: At moderate scale, a maintained index can be sufficient routing context before adding embedding or vector search infrastructure.
  source: raw/sources/karpathy-llm-wiki.md
- accepted: Multi-agent maintenance should prefer append-only logs, partitioned write targets, and deterministic merge rules so concurrent writes are easier to merge and reason about.
  source: raw/sources/karpathy-llm-wiki-comments.md
- accepted: Deduplication and contradiction checks should key on stable source-backed claim identity, such as citations, because textual proximity and clean git merges do not catch semantic duplicates.
  source: raw/sources/karpathy-llm-wiki-comments.md
- accepted: Autonomous maintenance needs review gates for ambiguous contradictions, stale updates, and user-owned interpretations to avoid confident but incorrect wiki drift.
  source: raw/sources/karpathy-llm-wiki-comments.md

## Links

- [[karpathy-llm-wiki]]
- [[memory-candidate-scope-mismatch]]
