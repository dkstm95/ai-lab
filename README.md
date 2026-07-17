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

## DiffScope

After an AI-assisted coding task is complete, use the external
[DiffScope](https://github.com/dkstm95/diff-scope) plugin before approving or
committing the change. Its `$diff` skill turns the current local working-tree
change into three files:

- `explanation.md`: an evidence-based before-to-after explanation;
- `artifact.json`: validated provider-neutral `ArtifactV1` data;
- `index.html`: an offline auto-scored quiz and interactive microworld.

The alpha uses the active Codex subscription session and supports only
`HEAD -> working tree` for one completed work unit. DiffScope is maintained in
its own repository so ai-lab consumes the same public tool as any other project;
it is not part of `packages/agent-runtime` or its fake provider.

## Working With LLM Wiki

LLM Wiki is maintained through agent-internal tools, but approved wiki pages are human-readable knowledge. Agents use `packages/local-tools` to register sources, prepare ingest/query/evolve task packets, file reusable answers, apply validated wiki updates, lint the wiki, and record runs. Wiki lint checks source-backed claims, index drift, review gates, stale review dates, and duplicate accepted claim/source pairs. There is no human-facing wiki CLI.

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
