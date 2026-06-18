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
  local-tools/
docs/
```

## Package Responsibilities

- `packages/protocol`: Zod schemas, shared interfaces, and request/result types. It must not depend on internal packages, vendor SDKs, MCP SDKs, Hono, or Node runtime implementation modules.
- `packages/config`: environment, workspace root, provider profile, and model routing config. It depends on `protocol`.
- `packages/model-providers`: provider adapters and routing. It supports API, external runner, manual, and fake provider kinds. The initial implementation uses only deterministic fake providers.
- `packages/agent-runtime`: agent execution flow. It calls model providers and local tools, then returns normalized run results. It does not know CLI, HTTP, MCP, or provider transport details.
- `packages/workspace`: local workspace behavior such as root selection, slug creation, and path-oriented helpers.
- `packages/wiki`: agent-internal local markdown LLM Wiki behavior such as wiki layout, source registration, ingest/query/evolve packets, reusable answer filing, page metadata, index/log files, and deterministic linting. It does not call model providers, own the agent loop, or expose human-facing CLI flows.
- `packages/local-tools`: tools callable by the agent runtime, such as echo and wiki tools. It does not own the agent loop.
- `apps/cli`: human terminal entrypoint.
- `apps/service`: local Hono HTTP entrypoint.

These packages are intentionally small but not temporary. They represent stable ownership boundaries for AI lab work. Do not add a new package until a responsibility is shared by at least two flows or cannot fit the existing boundary without coupling unrelated concerns.

## Dependency Direction

```text
apps/* -> agent-runtime, workspace, protocol
agent-runtime -> protocol, model-providers, local-tools
local-tools -> protocol, workspace, wiki
wiki -> workspace
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
- `external-runner`: official CLI or local runner integrations such as Codex, Claude Code, or OpenCode.
- `manual`: generate a prompt/package for a user to run elsewhere and import the result.
- `fake`: deterministic provider used by tests and smoke commands.

The default test suite uses fake providers only. Subscription-based tools must not be invoked through browser automation or unofficial bypasses.

## Later Additions

- Extend `packages/wiki` with bidirectional links, retrieval, reflection task packets, and approved self-evolution memory pages as behavior becomes concrete.
- Add `packages/mcp` when agent runtime, local tools, or workspace capabilities need to be exposed to external agents.
- Add `packages/evals` or `evals/` when the same validation logic repeats across multiple wiki or agent runs.

## References

- OpenAI Agents SDK TypeScript: https://openai.github.io/openai-agents-js/
- Model Context Protocol TypeScript SDK: https://github.com/modelcontextprotocol/typescript-sdk
- TypeScript project references: https://www.typescriptlang.org/docs/handbook/project-references.html
- pnpm workspaces: https://pnpm.io/workspaces
