# SubBrain Design

## Goal

SubBrain is a personal context memory prototype. It stores manual text records as
event-level memories, retrieves forgotten but relevant memories for a new
question, and builds evidence-backed context for a later LLM answer.

## Non-Goals

- Do not build a medical, legal, financial, or diagnostic advisor.
- Do not collect messages, mail, location, photos, or app data automatically.
- Do not add accounts, mobile UI, billing, notifications, or product storage.
- Do not make unsupported causal claims.

## MVP Scope

- Manual text entries only.
- SQLite file storage through a replaceable store interface.
- Replaceable ports for memory extraction, event linking, query interpretation,
  and answer generation.
- Two fixture domains: daily events with a missed prior event, and self-insight
  with repeated patterns.
- Relationship context is a later extension, but entity and event-link shapes
  must not block it.
- Core package and tests first; service exposure stays as a thin local test shell.

The local `/subbrain` test page and its JSON routes are private demo helpers, not
stable product APIs. Product UI, auth, billing, sync, and real adapters remain out of scope.

## Core Concepts

- `raw entry`: original user text and timestamp. It is the source of truth.
- `memory event`: one event extracted from a raw entry.
- `entity`: person, organization, place, project, object, topic, or custom item.
- `attribute`: general event facet such as body area, symptom, work mode, need,
  or relationship state.
- `event link`: relation between events such as similar, follow-up, contradicts,
  or candidate cause.
- `context packet`: selected memories, causal candidates, and answer rules for
  an LLM response.
- `answer draft`: structured response with possible connections, evidence,
  uncertainty, and next checks.

## Storage

The initial store implementation uses SQLite without a server and lives behind
the `@ai-lab/subbrain/sqlite` subpath. The core package entrypoint exposes a
store interface so the same memory logic can move to a product project later
without loading `node:sqlite`.

The schema keeps raw entries, events, entities, attributes, links, and an FTS
index. Version 2 enforces foreign keys, confidence checks, and link uniqueness;
opening version 0 or 1 rebuilds derived tables and FTS in one transaction.

The default extractor derives a stable event id from the source entry id, date,
and full normalized text. Re-saving replaces only that source's events; matching
entries remain separate because provenance takes priority over cross-entry
deduplication. Entry writes are atomic, and deletion explicitly clears FTS rows
because foreign keys do not cascade into virtual tables.

## Retrieval

The first retrieval pass combines:

- SQLite FTS hits for direct keyword evidence.
- Structured overlap for topics, emotions, entities, and attributes.
- Temporal ordering for events before the question reference time.
- A forgotten-memory signal based on discriminative terms shared by the question
  and original raw entry, not broad facets attached during extraction.

Links require positive confidence. Candidate causes must precede their target,
both events must be valid at the reference date, and confidence scales link score.

Embeddings and graph traversal are later additions after the deterministic
baseline is measurable.

## Answer Rules

- Present possible connections, not final causes.
- Cite source event IDs for every personal claim.
- Show uncertainty and conflicting or missing evidence.
- Prefer questions or next checks over decisions.

The MVP includes a deterministic fake answer model. It verifies the answer
contract before any real API adapter is added.

## Evaluation

The MVP should pass fixture tests before product work starts:

- `Recall@5 >= 80%`
- `Recall@10 >= 90%`
- Returned-result precision at limits 5 and 10 is at least 80%.
- Forgotten-memory hit rate is at least 70%, with precision at 100%.
- Deterministic `AnswerEvidenceCoverage = 100%`.
- Causal humility and abstention cases pass.
- Temporal ordering distinguishes prior events from later observations.
- Linked prior cause candidates outrank direct but weaker distractors.
- Repeated self-insight patterns are retrievable through similar event links.
- Temporal ordering is a support signal only; it must not retrieve unrelated
  memories by itself.

## Extraction

Keep the package free of CLI, service, wiki, and provider dependencies. The
portable unit is the data model, store interface, retrieval scorer, context
packet builder, answer contract, fixtures, and tests.

`SubbrainEngine` wires these portable pieces through explicit ports:

- `MemoryExtractor`: raw entry to memory events.
- `EventLinker`: new and stored events to cautious candidate or similarity links.
- `QueryInterpreter`: user question to retrieval query.
- `AnswerModel`: context packet to answer draft.

The default implementations are deterministic and rule-based. Real LLM-backed
implementations should live outside this package or be injected through these
interfaces so storage and retrieval remain provider-independent.

Injected model outputs are treated as untrusted. The engine validates raw
entries, extracted events and links, direct or inferred queries, and answer
drafts at runtime. Invalid derived records are rejected before storage. Answer
causal candidates must come from the context packet's candidate set, and every
evidence field must exactly match the canonical retrieved memory. Invalid answer
drafts may be retried, then fall back to a cautious abstention answer.

The default linker creates low-confidence candidate-cause links for ordered
events sharing a body area and similarity links for repeated work reflections.
Fixtures remain scorer inputs; richer LLM linking can be injected through the
same validated port.

## Later Extensions

- Relationship context over people and interaction history.
- Embedding search.
- Graph traversal over event links and entity neighborhoods.
- Product project migration with encryption, sync, and user-owned exports.
