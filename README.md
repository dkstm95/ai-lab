# ai-lab

TypeScript-first personal AI lab for implementing and testing AI ideas.

Korean guide: `README.ko.md`

The project starts with a small runnable monorepo: a CLI, a local HTTP service, a fake model provider, an agent runtime, workspace file handling, and local tools. Real API providers and subscription-based external runners are intentionally outside the default test path.

## Quick Start

```bash
pnpm install
pnpm check
pnpm cli --help
pnpm cli run hello "hello"
pnpm coverage
```

Run the local service:

```bash
pnpm service:dev
```

Endpoints:

- `GET /health`
- `POST /agent/hello`
- `GET /subbrain`

`/subbrain` is a local prototype page. Its JSON routes are private demo helpers,
not stable product APIs.

## Structure

```text
apps/cli                 terminal entrypoint
apps/service             local Hono HTTP service
packages/protocol        schemas and package communication protocol
packages/config          environment and model profile config
packages/model-providers provider adapters and routing
packages/agent-runtime   model/tool execution flow
packages/workspace       local workspace root and path helpers
packages/wiki            local markdown LLM Wiki workspace
packages/subbrain        personal event memory prototype
packages/local-tools     tools callable by the agent runtime
docs/                    system, development, and testing guides
```

## Working With LLM Wiki

LLM Wiki stores managed source copies and human-readable, reusable markdown knowledge. The current implementation provides safe answer-proposal and promotion primitives, not a runnable LLM workflow. Trusted integrations register workspace-local sources. The wiki package's agent-safe tool factory can prepare ingest/query/evolve packets and create answer proposals, but it cannot import sources or promote an answer directly; it is not wired into the default runtime yet. The implemented approval/promotion path currently covers reusable answer proposals only. A trusted caller must attest that a human reviewed the proposal's exact digest; the package validates that attestation but does not authenticate the reviewer. It then checks target and source hashes, validates a full candidate copy, promotes only the reviewed bytes, and appends its own audit entry. Wiki lint also rejects source traversal, directories, and symbolic links. There is no human-facing wiki CLI yet.

Implement reusable code in `packages/*`, expose human-facing flows from `apps/cli` or `apps/service` only when they are meant for people, and keep provider-specific SDK details inside `packages/model-providers`.

## Docs

- `README.md`
- `README.ko.md`
- `docs/system-design.md`
- `docs/development-guide.md`
- `docs/testing-guide.md`
- `docs/contribution-guide.md`
- `docs/self-evolution-guide.md`
- `docs/subbrain-design.md`
- `AGENTS.md`
