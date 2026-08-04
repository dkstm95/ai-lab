# Boris Cherny: Building Claude Code Source Note

Supplied video: https://youtu.be/UkoosAsEA8w?si=Lkbu5Yg26KtE0OPD
Supplied video title: [한영자막] 보리스 체르니: Claude Code는 이렇게 만들어졌다
Supplied video publisher: Tech Bridge
Supplied video published: 2026-07-29
Canonical talk: https://www.youtube.com/watch?v=qyPCVqFUyDo
Canonical talk title: Boris Cherny: We Deleted 80% of Claude Code's Prompt
Canonical publisher: Y Combinator
Official transcript: https://www.ycrootaccess.com/p/boris-cherny-building-claude-code
Speakers: Boris Cherny and Diana Hu
Event: Y Combinator Startup School 2026
Duration: 35:51
Retrieved: 2026-08-04

## Ingest Focus

This note records Cherny's operating model for building AI products while model capabilities
change quickly. It preserves his claims, examples, cautions, and recommended experiments without
reproducing the transcript.

## Structured Notes

### New model capabilities and prompt injection

- Cherny says Opus 5 can continue some tasks for days, weeks, or months when
  combined with Auto Mode, without requiring separate loop scaffolding.
- He says Anthropic combines model alignment, a prompt-injection classifier,
  and an Auto Mode classifier. In the environment he described, the team could
  no longer demonstrate a successful prompt injection against Opus 5.
- This is a report about Anthropic's observed system behavior, not a guarantee that prompt
  injection has been eliminated in every deployment or threat model.

### Delete and rebuild the harness empirically

- Claude Code changes its system prompt, tool set, tool descriptions, and harness code for each
  major model generation because instructions that fixed an older model may constrain a newer one.
- Anthropic removed about 80% of Claude Code's previous system prompt for Opus 5 because the model
  performed many previously instructed behaviors without those instructions.
- The team uses ablation: remove the system prompt or a tool, then restore one element at a time
  and measure its effect. Cherny says much of the remaining harness concerns safety, permissions,
  static analysis, and user interface behavior.
- Cherny recommends rebuilding instructions from observed failures. Start with fewer instructions,
  use the product, and add an instruction only after the model repeatedly fails in the same way.
- Evals can outlive one harness version, but Cherny says rapidly improving models may saturate an
  eval after one to three model generations. Teams then need harder evals based on the current model's observed limits.

### Product overhang and unhobbled models

- Cherny uses “product overhang” for useful abilities that a current model already has but existing
  products do not expose. A product “hobbles” the model when its interface or scaffolding blocks those abilities.
- He presents the first Claude Code as an example. Sonnet 3.5 could write much more than the
  autocomplete and read-only chat products of its time exposed. A simple terminal harness with
  write access let it work at file and feature scale.
- He argues that startups should search for current model abilities that have not yet been turned
  into useful products, rather than waiting only for a future model.
- The recommended experiment is to give the current model a slightly harder task than expected.
  State the outcome, guardrails, exit criteria, and a way to verify the work instead of prescribing every implementation step.

### Capability examples

- Cherny describes Bun's JavaScript runtime being rewritten from Zig to Rust by a Claude Code
  dynamic workflow. The run lasted 11 days, used a large test suite for verification, and received
  human steering. He says the resulting runtime was put into production for Claude Code.
- He also describes an internal discovery that Opus 5 could draw portraits, animals, and landscapes
  through OpenCV despite not being trained as a drawing system. He uses this as an example of
  finding capabilities through open-ended experiments.
- In another experiment, Claude was asked to rewrite an Electron desktop app
  in Swift, run both versions in a macOS virtual machine, compare screenshots
  pixel by pixel, and continue until they matched. At the time of the talk, the
  task had been running for more than two weeks and was posting progress
  screenshots to an internal Slack channel.

### Verification matters more than prompt tricks

- Cherny says the durable skill is not a particular prompt pattern. It is
  choosing a hard task, giving the model the tools and context needed to check
  its work, observing where it fails, and correcting that failure with a
  prompt, skill, or context integration.
- He calls verification the most commonly missing part of long-running agent
  work. Tests, virtual machines, screenshots, and other task-specific checks
  let the agent detect mistakes and continue without becoming stuck.
- He warns that experienced engineers can over-specify agent work by forcing
  the exact sequence they would follow. For current models, a coworker-like
  brief with clear boundaries can work better than a detailed recipe.

### Dynamic workflows, loops, and routines

- A dynamic workflow breaks one difficult task into stages. Agents can fan out
  for an initial pass, then other agents can verify or summarize the work, and
  later stages can fan out again.
- Cherny describes this orchestration as an algebra of sequential and parallel
  agent operations inside a sandbox. He treats it as a way to allocate more
  inference-time work to a hard task without running every agent in parallel
  at once.
- Loops and routines handle repeated tasks rather than one decomposed task. A
  loop runs locally; a routine runs in the cloud and can continue when a laptop
  is closed.
- Anthropic was running roughly 20 to 30 maintenance routines across its CLI,
  mobile, and desktop codebases. Examples included removing dead code,
  cleaning up completed experiments, adding or deleting tests, and unifying
  duplicate abstractions.
- Cherny says these routines launch hundreds and sometimes thousands of agents
  per day. He frames the goal as automating routine maintenance so engineers
  can focus on new product work and users.

### What remains hard and what people should learn

- Cherny narrows his statement that “coding is solved” to the kinds of coding
  he does. He says deep systems code, distributed systems, and pixel-level user
  interface verification still cause problems.
- He argues that effective users treat model use as an empirical practice:
  retry tasks that older models could not do, observe current behavior, and
  replace old assumptions with current evidence.
- For students, he recommends learning computer science through practical
  problems and combining it with product building, design judgment, business
  understanding, data science, and conversations with users.

## Practical Interpretation

- Re-test system prompts, tools, and agent scaffolding after a meaningful model
  upgrade. Keep only elements whose value survives an ablation or observed
  repeated failure.
- Give autonomous work an explicit verification path before increasing its
  duration or agent count.
- Treat long runtimes and large agent counts as resource choices, not proof of
  quality. The work still needs bounded permissions, clear stop conditions,
  and trustworthy checks.
- Separate capability exploration from production trust. A surprising demo or
  a speaker's security observation should lead to controlled validation, not a
  blanket guarantee.

## Source Limits

This note paraphrases the official English transcript of the Y Combinator talk
linked from the supplied Korean-subtitled video. Product names, feature status,
benchmarks, security behavior, durations, production use, and agent counts are
the speakers' statements. They were not independently reproduced for this
ingest. The talk reflects products and models available in July 2026 and may
become stale as those systems change.
