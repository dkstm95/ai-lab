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

## Tooling Notes

- pnpm workspaces keep local package links explicit with `workspace:*`.
- TypeScript project references let `tsc -b` typecheck packages in dependency order.
- Hono is used only as the local HTTP adapter.

## Git Hooks

```bash
git config core.hooksPath .githooks
```

The pre-commit hook runs formatting, lint, dependency-boundary, and type checks for fast feedback.
The pre-push hook runs the full `scripts/verify.sh` verification, including coverage, build, and docs checks.

Commit and pull request rules are in `docs/contribution-guide.md`.

## References

- pnpm workspaces: https://pnpm.io/workspaces
- TypeScript project references: https://www.typescriptlang.org/docs/handbook/project-references.html
- Hono docs: https://hono.dev/docs
