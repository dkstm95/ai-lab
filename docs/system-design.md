# System Design

## Purpose

This repository is a TypeScript-first AI lab for implementing and testing AI ideas. It is not centered on a single experiment. The base system provides stable places for CLI flows, local web service flows, model routing, agent execution, workspace files, and local tools.

## Monorepo

```text
apps/
  cli/
  service/
packages/
  protocol/
  config/
  model-providers/
  agent-runtime/
  workspace/
  wiki/
  subbrain/
  local-tools/
docs/
```

## Package Responsibilities

- `packages/protocol`: Zod schemas, shared interfaces, and request/result types. It must not depend on internal packages, vendor SDKs, MCP SDKs, Hono, or Node runtime implementation modules.
- `packages/config`: environment, workspace root, provider profile, and model routing config. It depends on `protocol`.
- `packages/model-providers`: provider adapters and routing. It supports API, external runner, manual, and fake provider kinds. It implements deterministic fake providers, the strict process boundary for trusted external-runner wrappers, and exact-version Codex and Claude subscription CLI profiles.
- `packages/agent-runtime`: agent execution flow and trusted application workflows. It calls model providers and local tools, returns normalized run results, and composes the provider-neutral Wiki answer flow for human-facing adapters. It does not know CLI, HTTP, MCP, or provider transport details.
- `packages/workspace`: local workspace behavior such as root selection, slug creation, and path-oriented helpers.
- `packages/wiki`: local markdown LLM Wiki behavior such as wiki layout, source registration, portable task/result schemas, digest-bound answer and reflection proposals, approved-memory retrieval and evaluation records, non-mutating shadow rebuild reports, approval and stale-hash gates, transactional promotion, audit logs, metadata, and deterministic linting. Trusted integrations own source selection and reviewer authentication. The package has no provider, process, network, agent-loop, or CLI knowledge.
- `packages/subbrain`: portable personal context memory prototype. It owns raw manual entries, event-level memories, the store interface, deterministic retrieval scoring, context packets, replaceable extraction/linking/query/answer ports, fixtures, and evaluation helpers. Its SQLite implementation is exposed from a separate subpath. It must not depend on apps, wiki, model providers, or agent runtime.
- `packages/local-tools`: tools callable by the agent runtime, such as echo and Wiki packet/proposal tools. Its default agent-safe Wiki set cannot import sources, export source-bearing tasks, or apply proposals.
- `apps/cli`: human terminal entrypoint. It owns private exchange artifacts, outbound task and runner disclosure, exact runner consent, exact proposal review rendering, and explicit digest acceptance.
- `apps/service`: local Hono HTTP entrypoint.

These packages are intentionally small but not temporary. They represent stable ownership boundaries for AI lab work. Do not add a new package until a responsibility is shared by at least two flows or cannot fit the existing boundary without coupling unrelated concerns.

## Dependency Direction

```text
apps/* -> agent-runtime, workspace, protocol, subbrain
agent-runtime -> protocol, model-providers, local-tools, wiki, workspace
local-tools -> protocol, workspace, wiki
wiki -> workspace
subbrain -> no internal deps
model-providers -> protocol, config
workspace -> no internal deps
config -> protocol
protocol -> no internal deps
```

`dependency-cruiser` is used instead of Nx because this lab needs lightweight dependency boundary checks, not a full monorepo task framework.

## Code Shape

- Reduce branches, mutable state, exception handling, and duplicate tests.
- Keep functions within 15 to 25 lines, with 4 or fewer parameters and few local variables.
- Export meaningful package behavior from `src/index.ts`; keep incidental helpers local.
- Avoid deep call stacks. `apps/*` should call package APIs directly, and orchestration belongs in `agent-runtime`.
- Prefer explicit input/output objects over hidden module state.

## Provider Modes

Model providers must not be assumed to be API-only.

- `api`: OpenAI, Anthropic, Gemini, Kimi, local API-compatible servers.
- `external-runner`: trusted wrappers around official CLIs or local runners. The primitive uses a vendor-neutral stdin/stdout envelope. The built-in subscription runner implements separately audited, exact-version Codex and Claude profiles without changing that envelope.
- `manual`: export a self-contained task for a user to run anywhere, then import a strict result. The Wiki CLI implements this without treating a paused human workflow as a synchronous model provider.
- `fake`: deterministic provider used by tests and smoke commands.

The default suite uses fake providers and local process fixtures. It does not invoke a real model,
network, API key, subscription CLI, browser automation, or unofficial bypass.

## External Runner Trust Boundary

The host supplies runner configuration explicitly. A task, model response, or workspace file cannot
choose the executable or arguments. Before process creation, the CLI discloses every outbound
context and binds the absolute executable and trusted-file hashes, static arguments, allowed
environment names, and timeout to a second consent digest.

The process adapter uses no shell, sends model input over standard input, starts with a fresh
environment in a private temporary directory, enforces resource limits, and requires a strict
request-bound response. The Wiki task is current both before and after execution. A successful run
returns a result artifact only; proposal review and apply remain separate.

These controls are not an OS sandbox. A trusted same-user runner can access or change files,
credentials, processes, and the network. Post-run validation can reject detected Wiki changes but
cannot undo them. Process-group termination is best effort and cannot guarantee cleanup of detached
descendants. Strong isolation requires a separate OS user, container, or virtual machine.

The generic protocol does not attest the wrapper, provider, login, or billing path. Built-in
subscription profiles preflight a narrow authenticated route and bind its sanitized result, but
still cannot prove per-request quota or billing. The contracts are in `docs/external-runner.md` and
`docs/subscription-runner.md`.

## Later Additions

- Re-audit built-in subscription profiles for new exact CLI versions, and add another profile only
  when its prompt transport, authentication route, and tool controls preserve the shared contracts.
- Add stemming, embeddings, or graph retrieval only after deterministic memory evaluation records
  show that lexical retrieval misses useful pages often enough to justify the added complexity.
- Extend `packages/subbrain` with embedding search, graph traversal, and relationship context after the deterministic baseline passes.
- Add `packages/mcp` when agent runtime, local tools, or workspace capabilities need to be exposed to external agents.
- Add `packages/evals` or `evals/` when the same validation logic repeats across multiple wiki or agent runs.

## References

- OpenAI Agents SDK TypeScript: https://openai.github.io/openai-agents-js/
- Model Context Protocol TypeScript SDK: https://github.com/modelcontextprotocol/typescript-sdk
- TypeScript project references: https://www.typescriptlang.org/docs/handbook/project-references.html
- pnpm workspaces: https://pnpm.io/workspaces
