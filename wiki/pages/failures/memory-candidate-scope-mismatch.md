---
title: Memory Candidate Scope Mismatch
slug: memory-candidate-scope-mismatch
kind: failure
status: active
createdAt: 2026-07-15T03:54:12.000Z
updatedAt: 2026-07-15T03:54:12.000Z
reviewAfter: 2027-01-15T00:00:00.000Z
sources:
---

## Summary

When a user asks what should be remembered from a conversation, answer in the
scope they named. Do not replace personal preferences, events, or judgment
criteria with a generic process lesson merely because the process lesson is
easier to formalize.

## Failure

The user asked which information learned about them or which conversation
insights were worth retaining. The response proposed a repository extraction
playbook instead. The playbook was reasonable in isolation, but it answered a
different memory question.

## Trigger

Apply this correction when a user asks what was learned about them, what should
be remembered from a conversation, or where personal context should be stored.

## Correction

1. Restate the requested memory scope before proposing candidates.
2. Classify each candidate as a stable preference, time-bound event, reusable
   knowledge, assistant failure, or project-specific decision.
3. Route stable public preferences to `SOUL.md`, assistant corrections to Wiki,
   and project decisions to the owning project's SSOT.
4. Do not infer a personal trait from a target-user description or a single
   unconfirmed example.
5. Provide evidence, confidence, and the proposed storage location, then obtain
   approval before applying durable memory.

## Prevention Check

- Does the candidate describe the user, the assistant's behavior, general
  knowledge, or a project?
- Does it answer the scope the user explicitly requested?
- Is it durable enough to help a future task without preserving a transcript?
- Is the claim supported, non-sensitive, and approved for its destination?

## Links

- [[llm-wiki-operating-model]]
