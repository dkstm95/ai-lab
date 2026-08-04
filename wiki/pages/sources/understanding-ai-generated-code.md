---
title: Understanding AI-generated Code
slug: understanding-ai-generated-code
kind: source
status: active
createdAt: 2026-07-16T14:48:48.000Z
updatedAt: 2026-07-28T08:59:54.000Z
reviewAfter: 2027-01-16T00:00:00.000Z
sources:
  - raw/sources/understanding-ai-generated-code.md
---

## Summary

Geoffrey Litt argues that AI-generated code can outpace the human understanding needed to guide later work, and proposes explanations, active questions, and small interactive models as ways to generate understanding alongside implementation.

## Key Claims

- accepted: AI agents can produce changes faster than people can understand them by reading every changed line.
  source: raw/sources/understanding-ai-generated-code.md
- accepted: Understanding a change lets a person form later ideas and steer future work instead of only approving or rejecting the current result.
  source: raw/sources/understanding-ai-generated-code.md
- accepted: When implementation advances faster than the human mental model, the resulting cognitive debt makes later changes harder to direct even when the current code is correct.
  source: raw/sources/understanding-ai-generated-code.md
- accepted: Litt credits Margaret Storey and Simon Willison with popularizing the cognitive-debt framing.
  source: raw/sources/understanding-ai-generated-code.md
- accepted: An agent can create explanation documents at the level a person needs instead of requiring line-by-line source reading.
  source: raw/sources/understanding-ai-generated-code.md
- accepted: Quizzes and prediction questions make understanding observable by requiring a person to recall or apply a mental model.
  source: raw/sources/understanding-ai-generated-code.md
- accepted: Small interactive microworlds let a person explore focused system behavior without navigating the full codebase.
  source: raw/sources/understanding-ai-generated-code.md
- accepted: Shared explanations and interactive artifacts can help a team accumulate context around agent-authored work.
  source: raw/sources/understanding-ai-generated-code.md
- accepted: Cheaper generated code also lowers the cost of purpose-built debuggers, playgrounds, simulations, and temporary explanatory interfaces.
  source: raw/sources/understanding-ai-generated-code.md

## Application Notes

- hypothesis: Choose the teaching artifact according to the knowledge gap: use an explanation for structure, an active question for recall or prediction, and a microworld for dynamic behavior.
- hypothesis: Require an active comprehension check before treating a large agent-authored change as understood.
- hypothesis: Keep generated teaching material temporary unless it captures stable shared context that the team needs to maintain.

## Links

- [[human-steering-coding-workflow]]
