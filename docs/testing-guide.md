# Testing Guide

Tests protect package contracts and runnable lab flows. They must not call real networks, require API keys, or invoke subscription-based tools.

## Package Focus

- `protocol`: schema acceptance and rejection.
- `config`: default config and provider profile selection without secrets.
- `model-providers`: deterministic fake provider, task routing, and the bounded external-runner process protocol.
- `agent-runtime`: model/tool orchestration and trusted provider-neutral Wiki workflow composition.
- `workspace`: workspace creation and slug behavior.
- `wiki`: markdown layout, source registration, strict task/result binding, proposal safety, promotion, metadata, and lint.
- `subbrain`: SQLite memory storage, deterministic retrieval, context packets, replaceable provider ports, and fixture evaluation.
- `local-tools`: tool input handling, workspace integration, and wiki tool contracts.
- `apps/cli`: manual and runner exchange artifacts, outbound disclosure, exact runner consent, review output, explicit digest approval, and command behavior.
- `apps/service`: HTTP status and JSON contracts.

Avoid duplicate coverage. A rule should be tested at the package that owns it, while adapters test only command or HTTP contracts.

## Provider Tests

The default suite uses `FakeModelProvider` and local external-runner fixtures. Real API providers,
network calls, and subscription CLIs must remain outside `pnpm test`.

Wiki workflow tests use generated task/result fixtures only. They verify that provider-neutral task
creation and proposal preparation leave the live Wiki unchanged, stale or forged artifacts fail,
source IDs remain bound to selected evidence, and only an exact human-approved digest is promoted.
CLI tests must not open a browser, call an API, or invoke a subscription tool.

External-runner tests verify strict envelopes, request binding, fatal UTF-8, byte and time limits,
fresh environment construction, sensitive environment-name rejection, no-shell argument handling,
temporary directory cleanup, cancellation, bounded inherited-pipe settlement, and generic process
errors that do not expose model input or process output. CLI tests also prove that consent failure
or an existing output causes zero spawns, failed runs remove an unchanged reservation, runner
configuration changes invalidate consent, and host success creates only a result artifact.

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
