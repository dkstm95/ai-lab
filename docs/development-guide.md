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

API providers and real subscription CLIs are intentionally excluded from the default verification
path. External and subscription runner behavior is covered by local fixture executables only.

## External Runner Development

Read `docs/external-runner.md` before changing the protocol boundary. Read
`docs/subscription-runner.md` before changing the audited Codex or Claude profile.

- Keep provider-specific flags and login behavior inside a separately audited wrapper.
- Never load an executable or arguments from a Wiki task, model output, or workspace runner config.
- Do not place prompts or credentials in command arguments.
- Preserve the strict request/response envelope and result-only Wiki boundary.
- Use local fixtures for tests. Do not consume network, API, or subscription quota.
- Keep exact target versions, authentication checks, fixed policy, and manifest fields in sync.
- Treat the wrapper as trusted same-user code unless it runs under a separately enforced OS
  sandbox.

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

## References

- pnpm workspaces: https://pnpm.io/workspaces
- TypeScript project references: https://www.typescriptlang.org/docs/handbook/project-references.html
- Hono docs: https://hono.dev/docs
