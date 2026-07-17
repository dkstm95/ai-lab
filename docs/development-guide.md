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

## DiffScope

Use the external [DiffScope](https://github.com/dkstm95/diff-scope) `$diff`
skill after one AI-assisted local code task is complete and before approval or
commit. It uses the active Codex subscription session and renders:

- `explanation.md` for the causal before-to-after model;
- `artifact.json` for the portable validated contract;
- `index.html` for the offline quiz and interactive microworld.

The alpha supports only one completed `HEAD -> working tree` work unit. The
bundle does not prove understanding, so review its claims and complete the
active check. Repository contents in scope are processed by the signed-in Codex
service. DiffScope owns its own deterministic tests and release lifecycle; do
not duplicate its runtime inside ai-lab.

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

Keep one-off diff explanations in the task or pull request. Promote only stable
decisions, repeated failures, and reusable procedures to the LLM Wiki.

## References

- pnpm workspaces: https://pnpm.io/workspaces
- TypeScript project references: https://www.typescriptlang.org/docs/handbook/project-references.html
- Hono docs: https://hono.dev/docs
