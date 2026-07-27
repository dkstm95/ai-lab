# External Runner Contract

## Status

The external runner is a vendor-neutral protocol primitive. It calls an explicitly trusted
executable without adding a model API SDK or API key to ai-lab.

An official CLI requires an audited wrapper that owns provider-specific flags and its established
login session. Built-in Codex and Claude wrappers are in `docs/subscription-runner.md`.

`wiki answer run` stops at a task-bound result artifact. Proposal, apply, and audit actions remain
explicit later commands.

Before starting the process, the CLI:

1. validates that the task still matches the current Wiki;
2. prints every outbound context path, SHA-256, and UTF-8 byte count;
3. prints the runner id, executable and trusted file paths and SHA-256 values, static arguments,
   allowed environment names, timeout, and canonical manifest digest;
4. requires the full task digest, runner id, and runner manifest digest to match explicit consent
   options; and
5. reserves the result path as a new private regular file.

The runner is not started when consent is missing, a digest differs, or output already exists. Its
executable and arguments come only from host options, never task, model output, or workspace files.

## Command

```bash
pnpm cli wiki answer run \
  --task task.json \
  --out result.json \
  --runner-id my-wrapper \
  --runner-executable /absolute/path/to/my-wrapper \
  --runner-args-json '[]' \
  --runner-trusted-files-json '[]' \
  --runner-timeout-ms 120000 \
  --accept-task-digest "<full-disclosed-task-digest>" \
  --trust-runner my-wrapper \
  --accept-runner-digest "<full-disclosed-runner-digest>"
```

`--runner-env HOME,LANG` copies only named values into a fresh environment. Values are not printed
or digested; sensitive and process-injection names are rejected. Do not put credentials in args.

`--runner-trusted-files-json` lists absolute static file paths. The CLI discloses each SHA-256;
files must be regular, non-symlink, and not group/world-writable. Unlisted files are not checked.

The command prints disclosure before checking consent, so the first invocation may omit or mismatch
acceptance values. Inspect it, then repeat with the exact digests. Changed executable or trusted-file
bytes, arguments, environment names, or timeout produce a different runner digest.

## Process Boundary

The host starts the wrapper with these rules:

- the executable path is absolute;
- arguments are a static string array;
- the executable and explicitly trusted static files are SHA-256 checked immediately before spawn;
- no shell is used;
- the request is sent through standard input, never command arguments;
- the working directory is a new mode-`0700` temporary directory;
- the environment starts empty and receives only allowed names;
- request, standard output, standard error, and runtime have hard limits;
- output must be fatal UTF-8 and one strict response envelope;
- nonzero exit, signal termination, timeout, cancellation, malformed output, and unknown fields
  fail the run;
- no retry or provider failover occurs; and
- the task is checked against the current Wiki again after the runner returns.

The timeout defaults to 120 seconds and cannot exceed 10 minutes. Request and output default to
1.1 MB, standard error to 64 KiB, and no byte limit can exceed 16 MiB.

On POSIX, SIGINT, SIGTERM, SIGHUP, timeout, and cancellation kill the runner process group. The host
also has a bounded settlement deadline so a descendant holding inherited output pipes cannot hang the
command forever. A descendant that creates a separate process group can survive.

## Envelope

The wrapper reads exactly one JSON request from standard input:

```json
{
  "protocol": "ai-lab.external-runner",
  "version": 1,
  "requestId": "<host-generated-id>",
  "request": {
    "task": "reasoning",
    "messages": [{ "role": "user", "content": "<complete Wiki task prompt>" }],
    "responseFormat": { "type": "json_schema", "name": "wiki_answer_result", "schema": {} }
  },
  "profile": { "task": "reasoning", "kind": "external-runner", "provider": "my-wrapper" }
}
```

The Wiki request carries the full static result schema; `{}` above abbreviates that schema.

It writes exactly one JSON response to standard output:

```json
{
  "protocol": "ai-lab.external-runner",
  "version": 1,
  "requestId": "<same-host-generated-id>",
  "output": "<one strict ai-lab.wiki-answer-result.v1 JSON object as a string>"
}
```

The response must have exactly these four fields. `requestId` prevents accidental response mix-ups;
it does not authenticate the wrapper or prove which provider or billing path was used. The `output`
string is parsed separately and must match the task id, task digest, question, and selected evidence
ids.

## Wrapper Requirements

An audited provider wrapper should:

- use fixed, reviewed noninteractive provider CLI flags;
- disable provider CLI tools and file mutation when the CLI supports that mode;
- pass the Wiki prompt through standard input or another non-argument data channel;
- use an out-of-band subscription login and keep credentials out of arguments, output, and logs;
- turn the model response into the exact Wiki result schema;
- emit no progress text or markdown on standard output; and
- exit nonzero when the provider CLI or result conversion fails.

Do not point `--runner-executable` directly at an official AI CLI unless that executable already
implements this exact envelope. Adding a provider means adding or auditing a wrapper, not changing
the Wiki task/result contract.

## Trust Limit

The runner is trusted same-user code, not a sandbox. It can access files, credentials, processes,
and the network. The temporary directory and environment filter only reduce accidental leakage.

The host's “result only” rule means the host workflow does not call proposal or apply. It cannot
stop a runner from modifying the live Wiki or other files itself. The post-run task check detects
some such changes and rejects the result, but it cannot undo them. Strong isolation requires a
separate OS user, container, or virtual machine with an explicit filesystem and network policy.
Node has no portable descriptor-based `exec`, so same-user code can still race the final path spawn.
