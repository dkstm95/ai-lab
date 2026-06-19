# Karpathy LLM Wiki Comments Source Note

Source URL: https://gist.github.com/karpathy/442a6bf555914893e9891c11519de94f
Retrieved: 2026-06-19

## Source Note

The visible comment discussion extends the LLM Wiki pattern with several implementation and reliability themes.

A comment by Archimondstat raises a risk that an Obsidian vault or similar knowledge base can fill with AI-generated notes that the user never internalizes, and that a nonzero hallucination rate eventually implies some false notes. The proposed counter-pattern is to let the user first state an idea, hypothesis, or interpretation, then have the AI challenge it, check weaknesses, and only promote the refined idea after that review.

Several comments by watsonrm focus on concurrency and semantic integrity. The key argument is that git branch-and-merge solves textual conflicts but not semantic duplication, such as two agents writing the same fact in different words. The suggested mitigation is to make writes idempotent and commutative where possible: append-only logs, partitioned files or sections, single-writer-per-target discipline, deterministic merge rules for rare same-region collisions, and permanent semantic dedup before writing.

The same thread argues that ingest should deduplicate against stable claim identity, preferably the citation or source-backed claim identity, not against textual position or proximity. This makes re-ingest order less important and keeps lint focused on genuine semantic conflicts. Ambiguous contradiction or reversal cases should go to a human review queue instead of being silently auto-resolved.

Other commenters report implementations that map the pattern to product or tool workflows. Examples include immutable source stores plus generated wiki pages, guided "wiki librarian" assistants, session-end extraction, drift detection, validation CLIs, local graph reports, and domain-specific applications such as tabletop role-playing game campaign management with markdown canon plus PDF corpora.

The recurring additions worth preserving are:

- use human review gates for ambiguous claims, contradictions, stale updates, and user-owned interpretations.
- use append-only or partitioned write models when multiple agents update one wiki.
- use citation-backed claim identity for deduplication and contradiction checks.
- track stale memory and drift because confident outdated knowledge can make the agent worse over time.
- keep validation, provenance, portability, and ordinary-file compatibility explicit instead of hiding the wiki inside a proprietary app.
