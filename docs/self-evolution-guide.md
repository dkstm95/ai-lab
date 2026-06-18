# Self-Evolution Guide

This project treats self-evolution as a verified memory loop, not model weight training.
The agent records work, reflects on useful lessons, proposes durable memory, and uses approved memory in later work.

## Goals

- Remember user feedback that should change future behavior.
- Convert repeated mistakes into short failure or playbook pages.
- Keep durable memory reviewable as markdown and Git diffs.
- Avoid storing secrets, personal data, or noisy transcripts.
- Keep `AGENTS.md` small by promoting only high-value rules.

## Memory Layers

- `wiki/raw/runs/*`: local-only run records and raw work summaries.
- `wiki/pages/failures/*`: mistakes, triggers, corrections, and prevention rules.
- `wiki/pages/playbooks/*`: reusable procedures for future tasks.
- `wiki/pages/decisions/*`: accepted process or design decisions.
- `wiki/pages/evals/*`: validation criteria and regression checks.
- `AGENTS.md`: stable, frequently used instructions that passed review.

`wiki/raw/runs/*` stays ignored by Git. Commit concise wiki pages only when they are useful shared memory.

## Default Policy

- Raw run records are local by default.
- Memory candidates may be generated automatically.
- Applying memory requires wiki lint and human approval.
- `AGENTS.md` and `docs/*` updates always require human approval.
- Inject at most three relevant memory pages into a future task.
- Prefer `playbook`, then `failure`, then `decision` pages for retrieval.
- Exclude `superseded` and unrelated pages from task context.
- Redact secrets, tokens, environment values, private data, and long command output.

## Completion Loop

At the end of a task, the agent checks:

- Did the final result match the user request?
- Were repo instructions or docs missed?
- Did any command fail or require a justified workaround?
- Did user feedback reveal a repeatable correction?
- Should the lesson be ignored, saved to wiki, or proposed for docs?

Only actionable lessons should become memory. Do not store generic self-critique.

## Proposed Runtime Flow

```text
run task
  -> record local run summary
  -> prepare reflection from run, validation, and feedback
  -> propose failure/playbook/decision pages
  -> lint proposed wiki update
  -> ask for approval
  -> apply approved memory
  -> retrieve relevant memory on the next task
```

## First Implementation Unit

Start with `wiki.reflect.prepare`.

Inputs:

- recent run id or run summary
- user feedback
- validation result
- changed files

Output:

- a reflection task packet
- expected files under `pages/failures`, `pages/playbooks`, or `pages/decisions`
- constraints for redaction, source-backed claims, and no direct `AGENTS.md` edits

Later additions can add memory proposal helpers, approval queues, and stronger retrieval.
