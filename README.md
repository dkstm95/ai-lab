# ai-lab

TypeScript-first personal AI lab for implementing and testing AI ideas.

Korean guide: `README.ko.md`

The project starts with a small runnable monorepo: a CLI, a local HTTP service, a fake model provider, an agent runtime, workspace file handling, and local tools. Real API providers and subscription-based external runners are intentionally outside the default test path.

## Quick Start

```bash
pnpm install
pnpm check
pnpm cli --help
pnpm cli idea add "LLM Wiki" --source "https://example.com"
pnpm cli idea list
pnpm cli run hello "hello"
pnpm coverage
```

Run the local service:

```bash
pnpm service:dev
```

Endpoints:

- `GET /health`
- `GET /ideas`
- `POST /agent/hello`

## Structure

```text
apps/cli                 terminal entrypoint
apps/service             local Hono HTTP service
packages/protocol        schemas and package communication protocol
packages/config          environment and model profile config
packages/model-providers provider adapters and routing
packages/agent-runtime   model/tool execution flow
packages/workspace       local ideas/files workspace
packages/local-tools     tools callable by the agent runtime
ideas/                   idea notes and implementation plans
docs/                    system, development, and testing guides
```

## Working With Ideas

Add ideas as markdown documents:

```bash
pnpm cli idea add "My AI idea" --source "https://example.com" --notes "First notes"
```

Implement reusable code in `packages/*`, expose human-facing flows from `apps/cli` or `apps/service`, and keep provider-specific SDK details inside `packages/model-providers`.

## Docs

- `README.md`
- `README.ko.md`
- `docs/system-design.md`
- `docs/development-guide.md`
- `docs/testing-guide.md`
- `docs/contribution-guide.md`
- `AGENTS.md`
