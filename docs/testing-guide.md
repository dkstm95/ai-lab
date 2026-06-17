# Testing Guide

Tests protect package contracts and runnable lab flows. They must not call real networks, require API keys, or invoke subscription-based tools.

## Package Focus

- `protocol`: schema acceptance and rejection.
- `config`: default config and provider profile selection without secrets.
- `model-providers`: deterministic fake provider and task routing.
- `agent-runtime`: model and tool orchestration.
- `workspace`: workspace creation and slug behavior.
- `wiki`: markdown wiki layout, source registration, page metadata parsing, and lint findings.
- `local-tools`: tool input handling, workspace integration, and wiki tool contracts.
- `apps/cli`: command behavior through package APIs.
- `apps/service`: HTTP status and JSON contracts.

Avoid duplicate coverage. A rule should be tested at the package that owns it, while adapters test only command or HTTP contracts.

## Provider Tests

The default suite uses `FakeModelProvider`. Real API provider tests and external runner tests must be opt-in and kept outside `pnpm test` unless they are fully mocked.

## Coverage

```bash
pnpm coverage
```

Coverage uses Vitest's V8 provider. `pnpm check` fails below 90% for branches, functions, lines, or statements.

## Verification

```bash
pnpm code:shape
pnpm docs:check
pnpm check
```

`pnpm docs:check` verifies that required guides exist, root scripts are documented, package responsibilities are covered in the system design, and `AGENTS.md` points to the current document map.

## References

- Vitest coverage: https://vitest.dev/guide/coverage
- Google developer style guide: https://developers.google.com/style
- Microsoft Writing Style Guide: https://learn.microsoft.com/en-us/style-guide/welcome/
