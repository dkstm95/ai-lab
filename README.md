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

LLM Wiki stores managed source copies and human-readable, reusable markdown knowledge. Its
portable answer workflow does not call a model API or depend on one AI vendor:

```bash
pnpm cli wiki init
pnpm cli wiki source add notes.md --title "Research notes"
pnpm cli wiki answer task "What should remain reusable?" \
  --sources <source-id> --out task.json

# Give the prompt in .ai-lab/wiki-exchange/task.json to any AI.
# Save its JSON response as .ai-lab/wiki-exchange/result.json.

# Or ask an audited wrapper to produce result.json. The first invocation
# discloses the exact runner manifest and exits unless both digests match.
pnpm cli wiki answer run \
  --task task.json --out result.json \
  --runner-id my-wrapper \
  --runner-executable /absolute/path/to/my-wrapper \
  --runner-args-json '[]' \
  --accept-task-digest "<full-task-digest>" \
  --trust-runner my-wrapper \
  --accept-runner-digest "<full-disclosed-runner-digest>"

pnpm cli wiki answer propose \
  --task task.json --result result.json --out proposal.json
pnpm cli wiki answer review proposal.json
pnpm cli wiki answer apply proposal.json \
  --reviewer "<name>" --accept-digest "<full-reviewed-digest>"
```

The task artifact contains the selected sources, the Wiki schema and index, and up to five matched
pages. Inspect the disclosure before sharing them with a subscription service or another model.
The same strict result schema works with web subscriptions, local models, and trusted runner
wrappers. Task and proposal creation do not change live Wiki pages. The host-side runner workflow
only creates a result artifact; proposal and apply remain separate commands.

An external runner must implement ai-lab's stdin/stdout envelope. Do not assume that an official AI
CLI implements this contract directly. A provider adapter is an audited wrapper around that CLI and
its out-of-band login. ai-lab does not request an API key, but it also cannot prove whether the
wrapped tool used a subscription or API billing path.

The wrapper is a trusted same-user executable, not a sandbox. It can access or modify files,
credentials, processes, and the network with your OS permissions. A private temporary working
directory and a fresh environment reduce accidental exposure but do not prevent that access.
Runner descendants may also outlive cancellation. Review the executable and exact runner digest
before consenting. See `docs/external-runner.md`.

Apply requires a human-reviewed full digest, then rechecks the current Wiki, source hashes,
candidate lint, and reviewed bytes before promotion and audit logging.

Trusted integrations own source selection. Agent-safe tools cannot import sources, create outbound
tasks, or apply proposals. The package rejects traversal, symbolic links, stale tasks, unknown
evidence IDs, oversized artifacts, and malformed exchange data.

Implement reusable code in `packages/*`, expose human-facing flows from `apps/cli` or `apps/service` only when they are meant for people, and keep provider-specific SDK details inside `packages/model-providers`.

## Docs

- `README.md`
- `README.ko.md`
- `docs/system-design.md`
- `docs/development-guide.md`
- `docs/testing-guide.md`
- `docs/external-runner.md`
- `docs/contribution-guide.md`
- `docs/self-evolution-guide.md`
- `docs/subbrain-design.md`
- `AGENTS.md`
