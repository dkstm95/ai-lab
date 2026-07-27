# Self-Evolution Guide

This project treats self-evolution as a verified memory loop, not model weight training.
The agent records work, reflects on useful lessons, proposes durable memory, and uses approved memory in later work.

## Goals

- Remember user feedback that should change future behavior.
- Convert repeated mistakes into short failure or playbook pages.
- Keep saved knowledge useful for both agent retrieval and human follow-up questions.
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

## Human Readability

LLM Wiki pages are not only prompt context. Users may ask about previously saved knowledge directly, so durable pages should be useful as concise human-facing notes.

The writing rules below adapt George Orwell's six rules in [Politics and the English Language](https://www.orwellfoundation.com/the-orwell-foundation/orwell/essays-and-other-works/politics-and-the-english-language/).

- Prefer clear titles and summaries before detailed claims.
- Avoid stale metaphors, similes, idioms, and stock phrases.
- Prefer short, familiar words when they express the same meaning.
- Remove every word that does not add meaning.
- Prefer active voice when it makes the actor and action clearer.
- Replace foreign phrases, scientific terms, and jargon with everyday language when possible. Explain terms needed for precision.
- Treat these as judgment rules, not rigid formulas. Break one when following it would make the writing inaccurate, unclear, or unnatural.
- Keep one main idea per sentence. Split any sentence that is hard to understand in one pass.
- Keep source-backed claims explicit enough to answer follow-up questions.
- Split dense source notes into reusable concept, synthesis, or playbook pages.
- Avoid storing only agent-oriented diagnostics when a human would need the lesson later.
- Keep raw run details local, but make approved shared memory readable without the raw transcript.

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

## Reflection Workflow

The reflection flow uses provider-neutral JSON artifacts. It does not require a model API. The
input contains exactly one recent run id or run summary, user feedback, validation, and changed
files. `prepare` binds those values with the current `schema.md` and `index.md`.

The recorded-run form snapshots the selected `wiki/raw/runs/*.json` file and binds its hash. The
summary form does not fabricate a raw run. Both forms preserve feedback, validation, and changed
file names in the task digest, so another AI platform receives the same reviewed input.

Create a private input artifact under `.ai-lab/wiki-exchange`, then prepare the task:

```json
{
  "runId": "2026-07-27T00-00-00-000Z-review-12345678",
  "feedback": "Keep the memory scope requested by the user.",
  "validation": "The response answered a different question.",
  "changedFiles": ["packages/wiki/src/index.ts"]
}
```

```bash
pnpm cli wiki reflect prepare \
  --input reflection-input.json \
  --out reflection-task.json

# Produce reflection-result.json with Codex or another platform, then:
pnpm cli wiki reflect propose \
  --task reflection-task.json \
  --result reflection-result.json \
  --out reflection-report.json
pnpm cli wiki reflect review reflection-report.json
pnpm cli wiki reflect apply reflection-report.json \
  --task reflection-task.json \
  --result reflection-result.json \
  --reviewer "reviewer name" \
  --accept-digest "<full reviewed digest>"
```

Use `runSummary` instead of `runId` when no raw run was retained. The exchange directory and
artifacts are private local files. Inspect the task before giving it to Codex or another platform
because a recorded-run task contains the selected raw run snapshot.

The result is typed as `failure`, `playbook`, or `decision`; the host renders Markdown and
frontmatter. `propose` previews full-Wiki lint without changing live files. `apply` accepts only the
exact reviewed report digest, rechecks task context and candidate state, promotes the page and
index atomically, and appends the audit log. A `skip` report records that no durable lesson exists
and cannot be applied.

## Retrieval and Evaluation

Answer tasks automatically inject at most three relevant active memory pages. Selection, stale
hash checks, reviewed multilingual retrieval terms, local usefulness observations, paired
no-memory controls, CLI commands, and interpretation limits are defined in
[`wiki-memory.md`](wiki-memory.md). One observation or comparison guides later review but does not
prove that a memory caused an answer to improve.
