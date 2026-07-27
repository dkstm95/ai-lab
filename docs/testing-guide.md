# Testing Guide

Tests protect package contracts and runnable lab flows. They must not call real networks, require API keys, or invoke subscription-based tools.

## Package Focus

- `protocol`: schema acceptance and rejection.
- `config`: default config and provider profile selection without secrets.
- `model-providers`: deterministic fake provider, routing, bounded external-runner protocol, and subscription profile conformance.
- `agent-runtime`: model/tool orchestration and trusted provider-neutral Wiki workflow composition.
- `workspace`: workspace creation and slug behavior.
- `wiki`: markdown layout, source registration, strict task/result binding, proposal safety, promotion, metadata, and lint.
- `subbrain`: SQLite memory storage, deterministic retrieval, context packets, replaceable provider ports, and fixture evaluation.
- `local-tools`: tool input handling, workspace integration, and wiki tool contracts.
- `apps/cli`: manual and runner exchange artifacts, outbound disclosure, exact runner consent, review output, explicit digest approval, and command behavior.
- `apps/service`: HTTP status and JSON contracts.

Avoid duplicate coverage. A rule should be tested at the package that owns it, while adapters test only command or HTTP contracts.

## Provider Tests

The default suite uses `FakeModelProvider` and local fixtures that emulate external and subscription
CLI processes. Real API providers, network calls, credential stores, and subscription CLIs must
remain outside `pnpm test`.

Wiki workflow tests use generated task/result fixtures only. They verify that provider-neutral task
creation and proposal preparation leave the live Wiki unchanged, stale or forged artifacts fail,
source IDs remain bound to selected evidence, and only an exact human-approved digest is promoted.
CLI tests must not open a browser, call an API, or invoke a subscription tool.

Knowledge tests verify active and review-date eligibility, deterministic field-weighted ranking,
Korean suffix normalization, the five-page limit, raw-source expansion, answer-task binding, and
stale page rejection. The checked-in evaluation cases measure required-page recall, allowed-page
precision, required-source recall, and correct abstention on unrelated questions. Compiled pages
guide synthesis but cannot replace bound raw evidence.

Memory tests verify active and review-date eligibility, reviewed multilingual retrieval terms,
deterministic relevance ranking, the three-page limit, answer-task injection, stale hashes, exact
per-page assessments, digest-bound no-memory controls, paired result hashes and preferences, and
aggregate usefulness rates. Evaluation fixtures are local and must not treat one comparison as
causal proof.

Shadow rebuild tests keep baseline pages hidden from task contexts, bind schema, index, source, and
target hashes, accept independent evidence pages and structured synthesis targets, compare
candidates only in a temporary Wiki copy, preserve typed blocks and hypotheses, report claim,
hypothesis, and section loss, and require an exact reviewed report before transactional promotion.

External-runner tests verify strict envelopes, request binding, fatal UTF-8, byte and time limits,
fresh environment construction, sensitive environment-name rejection, no-shell argument handling,
temporary directory cleanup, cancellation, bounded inherited-pipe settlement, and generic process
errors that do not expose model input or process output. CLI tests also prove that consent failure
or an existing output causes zero spawns, failed runs remove an unchanged reservation, runner
configuration changes invalidate consent, and host success creates only a result artifact.

Subscription profile tests also verify exact version and authentication gates, fixed CLI arguments,
stdin prompt transport, fresh environments, empty MCP checks, structured output parsing, manifest
binding, file drift rejection, and target timeouts for both supported profiles.

## Coverage

```bash
pnpm coverage
```

Coverage uses Vitest's V8 provider. `pnpm check` fails below 90% for branches, functions, lines, or statements.

## Verification

```bash
pnpm code:shape
pnpm docs:check
pnpm smoke:dist
pnpm wiki:knowledge:eval
pnpm check
```

`pnpm docs:check` verifies that required guides exist, root scripts are documented, package responsibilities are covered in the system design, and `AGENTS.md` points to the current document map.
`pnpm smoke:dist` runs the built main CLI and standalone subscription runner so bundling cannot
silently activate the wrong process entrypoint.

## References

- Vitest coverage: https://vitest.dev/guide/coverage
- Google developer style guide: https://developers.google.com/style
- Microsoft Writing Style Guide: https://learn.microsoft.com/en-us/style-guide/welcome/
