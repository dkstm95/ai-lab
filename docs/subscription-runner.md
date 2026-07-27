# Subscription CLI Runner

## Status

The subscription runner is a local adapter for the vendor-neutral external-runner protocol. It
uses an official CLI's saved login and does not ask ai-lab for an API key.

Version 1 supports only these audited pairs:

| Profile | Exact `--version` output | Accepted login |
| --- | --- | --- |
| `codex` | `codex-cli 0.145.0` | `Logged in using ChatGPT` |
| `claude` | `2.1.156 (Claude Code)` | first-party `claude.ai`, `pro`/`max`, no API-key source |

Any other version fails closed. A CLI update requires a new review and profile version.
Version 1 also fails closed on Windows because it cannot verify private state-directory ACLs.

The runner is for personal, local use; this is not legal approval. Anthropic forbids third parties
from offering Claude.ai login or routing subscription credentials on users' behalf.

## What It Guarantees

- Adapter, target, launcher, model, state path, policy, version, and sanitized auth are inner-bound.
- Outer consent separately binds the Node executable plus listed adapter and target file hashes.
- The spawn environment does not inherit API-key, token, cloud, proxy, `PATH`, or loader variables.
- The full Wiki prompt is sent only on standard input.
- Both profiles request structured JSON, disable reviewed shell and MCP entry points, and avoid
  conversation persistence.
- The host validates task ID, digest, question, evidence IDs, and result shape before proposal.

## What It Does Not Guarantee

- This is not a sandbox; the CLI retains the same user's file, process, credential, and network access.
- Auth status is a preflight, not per-request billing attestation; quota policies can change.
- `run` checks inner consent before target execution; `inspect` intentionally performs no-model preflights.
- Any process able to change a trusted path can race checks; Node has no portable descriptor `exec`.
- Codex retains residual built-in plan and possibly image/patch tools; hard tool-free mode is absent.
- Claude managed settings or hooks can inject environment and behavior beyond ordinary settings.
- On macOS, Claude credentials live in Keychain; `CLAUDE_CONFIG_DIR` does not isolate it.

## Build and Login

Build the adapter first:

```bash
pnpm --filter @ai-lab/model-providers build
```

Use a private, dedicated state directory. Log in with the official CLI outside the adapter:

```bash
mkdir -m 700 /absolute/path/to/ai-lab-codex-state
CODEX_HOME=/absolute/path/to/ai-lab-codex-state codex login

mkdir -m 700 /absolute/path/to/ai-lab-claude-state
CLAUDE_CONFIG_DIR=/absolute/path/to/ai-lab-claude-state claude
```

Do not copy credential files. The state directory must not contain `AGENTS.md`, `CLAUDE.md`,
settings, skills, hooks, plugins, commands, or rules.

The adapter is one self-contained bundle. Resolve symlinks and prefer the CLI's native executable.
A JavaScript target can load unbound files, and its descendants can outlive its inner timeout.

## Inspect

Inspection checks file hashes, exact version, authentication, and profile preconditions without a
model request. Codex inspection also requires an empty MCP inventory.

```bash
node /absolute/path/to/packages/model-providers/dist/subscription-runner.js inspect \
  --profile codex \
  --target /absolute/path/to/native/codex \
  --state-dir /absolute/path/to/ai-lab-codex-state \
  --launcher native \
  --model <model-id> \
  --reasoning-effort medium \
  --target-timeout-ms 120000
```

For Claude, use its profile, native launcher, no reasoning effort, and a Claude model. Keep the
returned manifest and copy its `digest`.

## Run a Wiki Task

Repeat adapter options in `run` and list adapter and target as outer trusted files. Paths must be
absolute, regular, non-symlink, and not group/world-writable.

```bash
pnpm cli wiki answer run \
  --task task.json \
  --out result.json \
  --runner-id subscription-codex \
  --runner-executable /absolute/path/to/node \
  --runner-args-json '[
    "/absolute/path/to/packages/model-providers/dist/subscription-runner.js",
    "run",
    "--profile", "codex",
    "--target", "/absolute/path/to/native/codex",
    "--state-dir", "/absolute/path/to/ai-lab-codex-state",
    "--launcher", "native",
    "--model", "<model-id>",
    "--reasoning-effort", "medium",
    "--target-timeout-ms", "120000",
    "--accept-manifest-digest", "<inner-manifest-digest>"
  ]' \
  --runner-trusted-files-json '[
    "/absolute/path/to/packages/model-providers/dist/subscription-runner.js",
    "/absolute/path/to/native/codex"
  ]' \
  --runner-timeout-ms 180000 \
  --accept-task-digest "<full-task-digest>" \
  --trust-runner subscription-codex \
  --accept-runner-digest "<outer-runner-digest>"
```

Omit or mismatch the three final acceptance values on the first host invocation. Review the
disclosure, then repeat the exact command with both full digests and the exact runner ID. No
provider environment allowlist is needed.

The only workspace artifact created is `result.json`; login state may change. Then propose and review.

## Unsupported Profiles

- Gemini CLI's individual Pro/Ultra/free login route ended; enterprise and API-key routes are out of scope.
- OpenCode authentication, isolation, structured output, and session behavior are not yet audited.
- Other CLIs can still use the generic contract in `docs/external-runner.md`.

## References

- OpenAI Codex [authentication](https://learn.chatgpt.com/docs/auth.md) and [CLI options](https://learn.chatgpt.com/docs/developer-commands.md?surface=cli)
- Claude Code [authentication](https://code.claude.com/docs/en/authentication), [headless mode](https://code.claude.com/docs/en/headless), and [legal terms](https://code.claude.com/docs/en/legal-and-compliance)
- Anthropic [`claude -p` status](https://support.claude.com/en/articles/15036540-use-the-claude-agent-sdk-with-your-claude-plan) (checked 2026-07-27; announced credit change paused)
- Gemini CLI [individual-account announcement](https://github.com/google-gemini/gemini-cli/discussions/28017)
