# Why Software Factories Fail Source Note

Source URL: https://youtu.be/-c43cv80FiA?si=PS-jOtEfQjbkmnam
Canonical URL: https://www.youtube.com/watch?v=-c43cv80FiA
Companion article: https://github.com/humanlayer/advanced-context-engineering-for-coding-agents/blob/main/wsff.md
Translated video title: [한영자막] 코드 리뷰 없앤 지 3개월, 사이트가 터졌습니다
Original talk title: Harness Engineering is not Enough: Why Software Factories Fail
Speaker: Dex Horthy, co-founder of HumanLayer
Event: AI Engineer World's Fair 2026
Retrieved: 2026-07-28

## Ingest Focus

This note preserves the talk's argument about why a fully automated coding
factory can damage a production codebase even when agents pass tests and
automated checks. It also records the human steering practices that Horthy
recommends before and during implementation.

## Structured Notes

- A lights-off software factory removes routine human code reading and relies
  on agent-written code, automated tests, automated review, monitoring, rollout,
  and user feedback.
- HumanLayer tried this approach in July 2025 for small and medium work. When an
  agent could not resolve a difficult production issue, the team had to
  understand a codebase that people had stopped reading for about three months.
  Repeated incidents eventually led the team to rebuild important patterns by
  hand.
- Horthy argues that current coding models can solve bounded tasks and pass
  tests without preserving the long-term maintainability of a codebase. A local
  change can work while making later changes harder or more likely to affect
  unrelated code.
- Tests and common coding benchmarks provide quick pass-or-fail feedback. They
  do not impose an equivalent penalty when a change weakens architecture or
  increases future maintenance cost.
- More tokens, review agents, and harness improvements can catch simple errors.
  Horthy does not consider them a complete substitute for human judgment about
  design and maintainability.
- The proposed response is to restore human code review and move important
  decisions earlier. Horthy divides this work into product requirements, system
  architecture, program design, and vertical slices.
- Product review defines the user problem and a useful success condition before
  technical implementation starts. Small, obvious, low-cost changes can still
  go directly to an agent.
- System architecture defines service boundaries, endpoints, schemas, queues,
  stores, and their interactions.
- Program design makes the intended code shape explicit through types, method
  signatures, file layout, call stacks, and dependency boundaries. These
  decisions would otherwise surface late during code review.
- Vertical slices divide implementation into narrow, testable paths through
  the system. People can review and redirect the agent after a small change
  instead of discovering a wrong direction after a large diff.
- Horthy recommends applying the full process in proportion to the cost of an
  agent misunderstanding the task. High-risk or complex changes need more
  upfront alignment and more frequent code review.

## Source Limits

This is a paraphrased note based on the translated YouTube video's title and
description and Horthy's companion article, which expands the original keynote.
It does not reproduce the video transcript. Claims about the broader
performance of coding models are the speaker's argument and should not be
treated as a controlled comparison of models or development processes.
