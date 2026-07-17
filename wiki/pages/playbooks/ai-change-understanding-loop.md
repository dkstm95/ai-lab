---
title: AI Change Understanding Loop
slug: ai-change-understanding-loop
kind: playbook
status: active
createdAt: 2026-07-16T14:48:48.000Z
updatedAt: 2026-07-17T15:00:00.000Z
reviewAfter: 2027-01-16T00:00:00.000Z
sources:
  - raw/sources/understanding-ai-generated-code.md
---

## Summary

An AI-assisted code change starts by aligning intent and ends by checking human
understanding, not merely when tests pass. The human needs an approved frame for
the work and a compact mental model that supports the next decision. In ai-lab,
non-trivial changes therefore connect a pre-change intent checkpoint to exact
change evidence and an active understanding check.

## Operating Loop

1. Before implementation, state the goal, observable behavior, constraints,
   non-goals, expected scenarios, and unresolved user-owned decisions.
2. Freeze the user's approved intent as an immutable revision.
3. Implement the change without silently rewriting that approved frame.
4. Bind the review to the exact change snapshot and compare intent with evidence.
5. Explain the important control or data path as a before-to-after transition.
6. Separate validation evidence, deviations that need user review, residual
   risks, and unverified assumptions.
7. End with an active participation check: predict behavior, run a targeted
   example, answer a short question, or modify a small sandbox.
8. Promote only durable knowledge to the existing artifact that owns it.

## Artifact Ladder

Use the smallest artifact that restores the mental model.

- A mechanical local edit needs one concise paragraph.
- A change spanning several components benefits from a small flow diagram or
  responsibility table.
- Dynamic behavior that remains hard to picture benefits from an executable
  example, playground, or temporary microworld.
- A short quiz is useful when terminology is clear but retention or causal
  understanding is uncertain.

## Completion Check

- Can the reviewer explain why the behavior changed without narrating every
  changed line?
- Can the reviewer name what must remain true and what is still uncertain?
- Can the reviewer predict one consequence or identify the next safe change?
- Do validation commands support the stated claims without being treated as a
  substitute for understanding?

## Project Implementation

The reusable implementation is the external
[Hope](https://github.com/dkstm95/hope) Codex plugin rather than a second copy
inside ai-lab. Its `$hope:align` skill freezes approved intent before implementation.
Its `$hope:diff` skill consumes that revision as read-only context, binds the review
to the exact local change, and creates the explanation, quiz, and interactive
microworld. A finding may lead to a code correction or a future user-approved
intent revision from a clean Git boundary, but it cannot mutate the prior
approval. While the tree remains dirty, the mismatch stays visible in `$hope:diff`.
`$hope:diff` remains useful without a prior `$hope:align` checkpoint.

## Knowledge Boundary

Keep the private Hope bundle through review and merge for resume and handoff. Do
not commit it by default. After merge, discard the entire generated bundle,
including `artifact.json`, explanations, quiz state, and microworld output,
unless it is explicitly pinned for audit or education.

Promote only non-reconstructible knowledge that can affect a future decision:

- encode behavioral contracts and invariants in tests, types, assertions, or
  fixtures;
- keep local non-obvious rationale near the code;
- add architecture and operational knowledge to existing ADRs, design docs, or
  runbooks;
- keep small change-specific rationale in the commit or pull request;
- add only recurring principles, failure patterns, or reusable procedures to the
  durable Wiki.

This separates cognitive continuity from artifact accumulation. A generated
explanation may help one reviewer understand the current change, but duplicating
it permanently creates documentation debt without guaranteeing future recall.

## Claims

- accepted: Understanding is needed for continued participation in a sequence of changes, not only for a thumbs-up or thumbs-down correctness decision.
  source: raw/sources/understanding-ai-generated-code.md
- hypothesis: An immutable approved intent plus an exact change snapshot will expose implementation drift without allowing hindsight to rewrite the goal.
- hypothesis: A proportional handoff plus one active check will expose gaps in the human mental model earlier than a passive change summary.
- hypothesis: Selective promotion will preserve cognitive continuity without turning generated teaching material into a parallel documentation system.

## Links

- [[understanding-ai-generated-code]]
- [[llm-wiki-operating-model]]
