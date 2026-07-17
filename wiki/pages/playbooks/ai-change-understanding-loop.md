---
title: AI Change Understanding Loop
slug: ai-change-understanding-loop
kind: playbook
status: active
createdAt: 2026-07-16T14:48:48.000Z
updatedAt: 2026-07-17T12:00:00.000Z
reviewAfter: 2027-01-16T00:00:00.000Z
sources:
  - raw/sources/understanding-ai-generated-code.md
---

## Summary

An AI-assisted code change is not fully handed off when tests pass. The human
also needs a compact mental model that supports the next decision. In ai-lab,
non-trivial changes therefore end with correctness evidence and an understanding
handoff. The handoff stays proportional to the change and uses an active check
instead of assuming that reading a summary produced understanding.

## Operating Loop

1. State the goal and the observable behavior that changed.
2. Explain the important control or data path as a before-to-after transition.
3. Map only the meaningful files or components to their responsibilities.
4. Record decisions, invariants, tradeoffs, and explicit non-goals.
5. Separate validation evidence from residual risks and unverified assumptions.
6. End with one active participation check: predict behavior, run a targeted
   example, answer a short question, or modify a small sandbox.

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
[DiffScope](https://github.com/dkstm95/diff-scope) Codex plugin rather than a
second copy inside ai-lab. Its alpha `$diff` skill uses the active subscription
session to turn one completed `HEAD -> working tree` work unit into
`explanation.md`, validated `artifact.json`, and an offline `index.html` with the
quiz and declarative microworld. ai-lab keeps the handoff policy and consumes the
same public tool as other projects.

## Knowledge Boundary

Keep a one-off change explanation in the task handoff or pull request. Promote
only recurring principles, stable decisions, failure patterns, or reusable
procedures into the durable Wiki. Otherwise the attempt to reduce cognitive
debt creates a second pile of documentation debt.

## Claims

- accepted: Understanding is needed for continued participation in a sequence of changes, not only for a thumbs-up or thumbs-down correctness decision.
  source: raw/sources/understanding-ai-generated-code.md
- hypothesis: A proportional handoff plus one active check will expose gaps in the human mental model earlier than a passive change summary.
- hypothesis: Keeping one-off diff explanations out of the durable Wiki will preserve retrieval quality while reusable lessons still compound.

## Links

- [[understanding-ai-generated-code]]
- [[llm-wiki-operating-model]]
