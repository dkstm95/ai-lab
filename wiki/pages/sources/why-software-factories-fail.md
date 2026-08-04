---
title: Why Software Factories Fail
slug: why-software-factories-fail
kind: source
status: active
createdAt: 2026-07-28T08:59:54.000Z
updatedAt: 2026-07-28T08:59:54.000Z
reviewAfter: 2027-01-28T00:00:00.000Z
sources:
  - raw/sources/why-software-factories-fail.md
---

## Summary

Dex Horthy argues that automated coding loops can pass checks while degrading a codebase's long-term maintainability. He recommends keeping human code review and moving product, architecture, program-design, and implementation-slice decisions ahead of large implementation.

## Key Claims

- accepted: A lights-off software factory removes routine human code reading and relies on automated checks, review, monitoring, rollout, and feedback loops.
  source: raw/sources/why-software-factories-fail.md
- accepted: HumanLayer's 2025 lights-off experiment left the team debugging a codebase that people had stopped reading for about three months.
  source: raw/sources/why-software-factories-fail.md
- accepted: Horthy argues that current coding models can complete bounded tasks without preserving codebase maintainability over a sequence of changes.
  source: raw/sources/why-software-factories-fail.md
- accepted: Passing automated checks does not penalize a change for architecture damage whose cost appears weeks or months later.
  source: raw/sources/why-software-factories-fail.md
- accepted: Additional tokens, automated reviewers, and harness improvements can catch simple errors but do not replace human judgment about design and maintainability.
  source: raw/sources/why-software-factories-fail.md
- accepted: Horthy recommends restoring human code review and moving important decisions into product requirements, system architecture, program design, and vertical slices.
  source: raw/sources/why-software-factories-fail.md
- accepted: Program design makes types, method signatures, file layout, call stacks, and dependency boundaries explicit before implementation.
  source: raw/sources/why-software-factories-fail.md
- accepted: Vertical slices let people check, review, and redirect a small path through the system before a large change accumulates.
  source: raw/sources/why-software-factories-fail.md
- accepted: Horthy applies the full planning process in proportion to the cost of misunderstanding the task rather than to every small change.
  source: raw/sources/why-software-factories-fail.md

## Application Notes

- hypothesis: Review the product outcome and code shape before delegating a change whose incorrect implementation would be expensive to reverse.
- hypothesis: Delegate one or a few verifiable vertical slices, then review and redirect before continuing.
- hypothesis: Treat passing checks as evidence of current behavior, not proof that the codebase remains easy to change.

## Links

- [[human-steering-coding-workflow]]
