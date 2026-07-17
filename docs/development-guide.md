# Development Guide

## Requirements

- Node.js LTS
- pnpm

## Install

```bash
pnpm install
```

## Commands

```bash
pnpm cli --help
pnpm cli run hello "hello"
pnpm service:dev
pnpm test
pnpm typecheck
pnpm lint
pnpm code:shape
pnpm docs:check
pnpm coverage
pnpm build
pnpm check
```

`pnpm check` is the final local verification command. It runs formatting, lint and dependency boundaries, typecheck, code shape checks, coverage, build, and documentation consistency checks.

## Configuration

The default configuration requires no API key. Fake model profiles are used for smoke commands and tests.

Useful environment variables:

- `AI_LAB_WORKSPACE_ROOT`: workspace root for local files.
- `AI_LAB_SERVICE_PORT`: local service port, default `3000`.

API providers and subscription/external runner providers are intentionally excluded from the default verification path.

## Hope

Use the external [Hope](https://github.com/dkstm95/hope) skills around a
non-trivial AI-assisted task. The active Codex session processes in-scope code.

Before implementation, run `$hope:align` to:

- state the goal, observable behavior, constraints, non-goals, and expected
  scenarios;
- surface every unresolved decision that genuinely needs the user's judgment,
  without an arbitrary card limit;
- freeze the approved result as an immutable intent revision.

After one local work unit is complete, run `$hope:diff` to:

- bind the review to the exact change fingerprint;
- compare the implementation with the approved intent when one exists;
- distinguish fulfilled intent, implementation defects, deviations that need
  user review, residual risks, and unknowns;
- render the evidence-based explanation, auto-scored quiz, and interactive
  microworld used for active understanding.

`$hope:align` affects `$hope:diff`, but `$hope:diff` cannot rewrite approved intent. If the
intent should change, return the decision to the user and begin a new revision
from the next clean boundary. Until then, `$hope:diff` reports the mismatch against
the existing revision. Code changes make a review stale. `$hope:diff` also works
without prior alignment by deriving its model from the change context.

Keep the private bundle through review and merge for resume or handoff; do not
commit it. After merge, discard the entire generated bundle, including
`artifact.json`, explanations, quiz state, and microworld output, unless the user
pins it for audit or education. Promote durable knowledge to its owner instead:

- behavioral contracts and invariants belong in tests, types, assertions, or
  fixtures;
- local non-obvious rationale belongs near the code;
- architecture decisions belong in an existing ADR or design document;
- operational constraints belong in a runbook;
- small change-specific rationale belongs in the commit or pull request.

The bundle does not prove understanding, so review its claims and complete the
active check. Hope owns its tests and runtime outside ai-lab.

## Tooling Notes

- pnpm workspaces keep local package links explicit with `workspace:*`.
- TypeScript project references let `tsc -b` typecheck packages in dependency order.
- Hono is used only as the local HTTP adapter.

## Git Hooks

```bash
git config core.hooksPath .githooks
```

Both pre-commit and pre-push hooks run `scripts/verify.sh`.

Commit and pull request rules are in `docs/contribution-guide.md`.

## AI-Assisted Change Handoff

Automated verification is correctness evidence; it does not replace a human
mental model of the changed system. After a non-trivial AI-assisted code change,
the final task handoff and pull request `Understanding` section must make the
change usable for the next decision, not merely reviewable as a finished diff.

Include:

- the goal and observable behavior that changed;
- the important control or data path as a before-to-after transition;
- a responsibility map for only the meaningful files or components;
- decisions, invariants, tradeoffs, and explicit non-goals;
- validation commands and results, separated from residual risks and unknowns;
- one active participation check, such as a prediction question, targeted test,
  short walkthrough, or small executable example.

Keep the artifact proportional to cognitive risk. A mechanical local edit can
use one concise paragraph. A change spanning three or more components should
usually use a small flow diagram or responsibility table. When dynamic behavior
is still hard to picture, prefer an executable example, playground, or temporary
microworld over more prose.

The active check should let the reviewer explain an invariant, predict a
consequence, or identify the next safe change. `pnpm check` can prove repository
constraints passed, but it cannot prove that this understanding exists.

Keep one-off Hope explanations in the private task bundle or pull request rather
than committing a parallel documentation tree. Promote only stable decisions,
repeated failures, and reusable procedures to the existing tests, code, design
docs, runbooks, or LLM Wiki that already own that knowledge.

## References

- pnpm workspaces: https://pnpm.io/workspaces
- TypeScript project references: https://www.typescriptlang.org/docs/handbook/project-references.html
- Hono docs: https://hono.dev/docs
