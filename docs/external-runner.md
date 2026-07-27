# External Runner Contract

## Status

The external runner is a vendor-neutral protocol primitive. It lets the Wiki workflow call an
explicitly trusted executable without adding a model API SDK or API key to ai-lab.

It is not a ready-made Codex, Claude Code, Gemini, or other vendor adapter. An official CLI can be
used only through an audited wrapper that implements this contract. The wrapper owns
provider-specific flags and its separately established login session.

`wiki answer run` stops at a task-bound result artifact. It does not prepare a proposal, apply a
page, or append a Wiki audit entry. Those actions remain explicit later commands.

Before starting the process, the CLI:

1. validates that the task still matches the current Wiki;
2. prints every outbound context path, SHA-256, and UTF-8 byte count;
3. prints the runner id, absolute executable, static arguments, allowed environment names, effective
   timeout, and a SHA-256 digest of that canonical runner manifest;
4. requires the full task digest, runner id, and runner manifest digest to match explicit consent
   options; and
5. reserves the result path as a new private regular file.

The runner is not started when consent is missing, a digest differs, or the output already exists.
The CLI takes runner configuration only from explicit host command options. It does not read an
executable or arguments from the task, model output, or a workspace runner configuration file.

## Command

```bash
pnpm cli wiki answer run \
  --task task.json \
  --out result.json \
  --runner-id my-wrapper \
  --runner-executable /absolute/path/to/my-wrapper \
  --runner-args-json '[]' \
  --runner-timeout-ms 120000 \
  --accept-task-digest "<full-disclosed-task-digest>" \
  --trust-runner my-wrapper \
  --accept-runner-digest "<full-disclosed-runner-digest>"
```

`--runner-env HOME,LANG` may copy named values from the host into an otherwise fresh environment.
Use the smallest set the wrapper needs. Values are not printed or included in the consent digest.
Sensitive and process-injection variable names are rejected. Do not place credentials in arguments.

The command prints the disclosure before checking consent, so it is safe to omit or deliberately
mismatch the acceptance values on the first invocation. Inspect the disclosure, then repeat the
same command with the exact full digests. A changed executable, argument, environment name, or
timeout produces a different runner digest.

## Process Boundary

The host starts the wrapper with these rules:

- the executable path is absolute;
- arguments are a static string array;
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

The default timeout is 120 seconds and cannot exceed 10 minutes. The default request and standard
output limit is 1.1 MB each. The default standard error limit is 64 KiB. Each byte limit has a
16 MiB hard ceiling.

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
    "messages": [{ "role": "user", "content": "<complete Wiki task prompt>" }]
  },
  "profile": { "task": "reasoning", "kind": "external-runner", "provider": "my-wrapper" }
}
```

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

The runner is a trusted same-user executable, not an OS sandbox. It can read or modify any file and
credential available to the user, inspect other processes, and use the network. The temporary
directory and environment filtering reduce accidental leakage only.

The host's “result only” rule means the host workflow does not call proposal or apply. It cannot
stop a runner from modifying the live Wiki or other files itself. The post-run task check detects
some such changes and rejects the result, but it cannot undo them. Strong isolation requires a
separate OS user, container, or virtual machine with an explicit filesystem and network policy.

ai-lab also cannot determine whether a wrapped provider used subscription entitlement, API
credits, a local model, or another billing path. That guarantee belongs to the selected wrapper,
provider CLI, and authenticated session.
