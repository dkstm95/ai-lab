---
title: "Boris Cherny: Building Claude Code"
slug: boris-cherny-building-claude-code
kind: source
status: active
createdAt: 2026-08-04T01:46:45.604Z
updatedAt: 2026-08-04T01:46:45.604Z
reviewAfter: 2027-02-04T00:00:00.000Z
sources:
  - raw/sources/boris-cherny-building-claude-code-0856ef24c3ab671a6aae545a11b7b91e.md
---

## Summary

Boris Cherny argues that model-backed products should be rebuilt around each model's observed behavior instead of preserving instructions and scaffolding by default. His method removes old constraints, gives the model harder tasks with clear boundaries, and adds task-specific verification before extending autonomy.

## Key Claims

- accepted: Claude Code changes its system prompt, tools, tool descriptions, and harness when a new model generation behaves differently from the previous one.
  source: raw/sources/boris-cherny-building-claude-code-0856ef24c3ab671a6aae545a11b7b91e.md
- accepted: Anthropic removed about 80% of Claude Code's previous system prompt for Opus 5 because the model no longer needed many corrective instructions.
  source: raw/sources/boris-cherny-building-claude-code-0856ef24c3ab671a6aae545a11b7b91e.md
- accepted: The Claude Code team uses ablation by removing prompts or tools and restoring them one element at a time to measure their effect.
  source: raw/sources/boris-cherny-building-claude-code-0856ef24c3ab671a6aae545a11b7b91e.md
- accepted: Cherny recommends adding an instruction only after the current model repeatedly fails in the same way.
  source: raw/sources/boris-cherny-building-claude-code-0856ef24c3ab671a6aae545a11b7b91e.md
- accepted: Cherny says an eval may outlive one harness version but can saturate after one to three model generations and then needs a harder replacement.
  source: raw/sources/boris-cherny-building-claude-code-0856ef24c3ab671a6aae545a11b7b91e.md
- accepted: Product overhang is a useful ability that a current model already has but available products do not expose, while hobbling is product design that blocks the model from expressing that ability.
  source: raw/sources/boris-cherny-building-claude-code-0856ef24c3ab671a6aae545a11b7b91e.md
- accepted: Cherny recommends stating a hard task, its guardrails, exit criteria, and verification method instead of prescribing every implementation step.
  source: raw/sources/boris-cherny-building-claude-code-0856ef24c3ab671a6aae545a11b7b91e.md
- accepted: Cherny describes a steered dynamic workflow that used automated verification to rewrite Bun's runtime from Zig to Rust over 11 days.
  source: raw/sources/boris-cherny-building-claude-code-0856ef24c3ab671a6aae545a11b7b91e.md
- accepted: Cherny identifies task-specific verification as the most important and most commonly missing part of long-running autonomous work.
  source: raw/sources/boris-cherny-building-claude-code-0856ef24c3ab671a6aae545a11b7b91e.md
- accepted: Dynamic workflows decompose one difficult task into sequential and parallel stages of model workers, while loops and routines repeat a task locally or in the cloud.
  source: raw/sources/boris-cherny-building-claude-code-0856ef24c3ab671a6aae545a11b7b91e.md
- accepted: Cherny says Anthropic was running roughly 20 to 30 routines for maintenance work such as removing dead code, cleaning up experiments, changing automated-check coverage, and unifying duplicate abstractions.
  source: raw/sources/boris-cherny-building-claude-code-0856ef24c3ab671a6aae545a11b7b91e.md
- accepted: Cherny limits his claim that coding is solved by naming deep systems code, distributed systems, and pixel-level interface verification as remaining weak areas.
  source: raw/sources/boris-cherny-building-claude-code-0856ef24c3ab671a6aae545a11b7b91e.md
- accepted: Cherny advises students to combine practical computer science with product building, design judgment, business fluency, data science, and conversations with users.
  source: raw/sources/boris-cherny-building-claude-code-0856ef24c3ab671a6aae545a11b7b91e.md

## Application Notes

- hypothesis: Re-evaluate prompts, tools, and orchestration scaffolding after a meaningful model upgrade instead of assuming that every old constraint still helps.
- hypothesis: Require a trustworthy verification path, bounded permissions, and a clear stop condition before increasing an autonomous task's duration or parallel breadth.
- hypothesis: Treat a large worker count as a resource allocation choice rather than evidence that the result is correct or maintainable.
- hypothesis: Separate capability experiments from production trust, especially when evaluating security claims or unexpected model behavior.

## Source Limits

The source note paraphrases the official Y Combinator transcript linked from the supplied Korean-subtitled video. Security behavior, production use, durations, and worker counts are speaker reports that were not independently reproduced during ingest.

## Links

- [[human-steering-coding-workflow]]
