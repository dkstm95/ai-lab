import { mkdtemp, rm } from "node:fs/promises";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { DatabaseSync } from "node:sqlite";
import { afterEach, describe, expect, it } from "vitest";
import {
  insufficientEvidenceFixture,
  motherCaseFixture,
  selfInsightFixture,
} from "../src/fixtures.js";
import {
  type ContextPacket,
  FakeAnswerModel,
  type RetrievedMemory,
  SubbrainEngine,
  SubbrainValidationError,
  answerEvidenceCoverage,
  buildContextPacket,
  evaluateRetrieval,
  extractMemoryEvents,
  inferRetrievalQuery,
  retrieveMemories,
  seedFixture,
} from "../src/index.js";
import { SqliteSubbrainStore } from "../src/sqlite.js";

const roots: string[] = [];
const require = createRequire(import.meta.url);
const { DatabaseSync: RuntimeDatabaseSync } = require("node:sqlite") as {
  readonly DatabaseSync: new (path: string) => DatabaseSync;
};

afterEach(async () => {
  await Promise.all(roots.map((root) => rm(root, { recursive: true, force: true })));
  roots.length = 0;
});

describe("subbrain", () => {
  it("stores raw entries as event-level memories in SQLite", async () => {
    const store = await seededStore(motherCaseFixture);

    const events = store.listMemoryEvents();

    expect(events).toHaveLength(4);
    expect(events[0]?.sourceEntryId).toBe("entry_steroid");
    expect(events[0]?.attributes).toContainEqual({
      type: "body_area",
      value: "왼쪽 검지 두번째 관절",
    });
    store.close();
  });

  it("retrieves forgotten prior events through FTS and structured scoring", async () => {
    const store = await seededStore(motherCaseFixture);

    const memories = retrieveMemories(store, firstMotherCase().query, 5);

    expect(memories.map((memory) => memory.event.id)).toContain("event_steroid_injection");
    expect(
      memories.find((memory) => memory.event.id === "event_steroid_injection")?.forgotten,
    ).toBe(true);
    expect(memories.filter((memory) => memory.forgotten).map((memory) => memory.event.id)).toEqual([
      "event_steroid_injection",
    ]);
    expect(memories[0]?.reasons).toContain("attribute:overlap");
    store.close();
  });

  it("builds context packets with evidence and cautious answer rules", async () => {
    const store = await seededStore(motherCaseFixture);

    const packet = buildContextPacket(store, firstMotherCase().query);

    expect(packet.causalCandidates.map((memory) => memory.event.id)).toContain(
      "event_steroid_injection",
    );
    expect(packet.causalCandidates.map((memory) => memory.event.id)).not.toContain(
      "event_white_numb_symptom",
    );
    expect(packet.answerRules).toContain("Present possible connections, not final causes.");
    expect(packet.retrievedMemories.every((memory) => memory.event.sourceEntryId)).toBe(true);
    store.close();
  });

  it("generates deterministic answer drafts without unsupported causes", async () => {
    const store = await seededStore(motherCaseFixture);
    const model = new FakeAnswerModel();
    const packet = buildContextPacket(store, firstMotherCase().query);

    const answer = await model.generate(packet);

    expect(answer.causalCandidates.map((candidate) => candidate.eventId)).toContain(
      "event_steroid_injection",
    );
    expect(answer.evidence.map((evidence) => evidence.eventId)).toContain(
      "event_steroid_injection",
    );
    expect(answer.uncertainty).toContain(
      "검색된 기억은 인과 증명이 아니라 가능한 연결 후보입니다.",
    );
    expect(answerEvidenceCoverage(packet, answer)).toBe(1);
    expect(answerEvidenceCoverage(packet, { ...answer, evidence: [] })).toBe(0);
    store.close();
  });

  it("keeps answer drafts abstaining when retrieval has no support", async () => {
    const model = new FakeAnswerModel();

    const answer = await model.generate(emptyPacket());

    expect(answer.causalCandidates).toEqual([]);
    expect(answer.evidence).toEqual([]);
    expect(answer.summary).toContain("충분하지 않습니다");
  });

  it("passes retrieval metrics for daily-event and self-insight fixtures", async () => {
    const store = await seededStore(motherCaseFixture, selfInsightFixture);

    const report = evaluateRetrieval(store, [
      ...motherCaseFixture.cases,
      ...selfInsightFixture.cases,
    ]);

    expect(report.recallAt5).toBeGreaterThanOrEqual(0.8);
    expect(report.recallAt10).toBeGreaterThanOrEqual(0.9);
    expect(report.precisionAt5).toBeGreaterThanOrEqual(0.8);
    expect(report.precisionAt10).toBeGreaterThanOrEqual(0.8);
    expect(report.forgottenMemoryHitRate).toBeGreaterThanOrEqual(0.7);
    expect(report.forgottenMemoryPrecision).toBe(1);
    store.close();
  });

  it("passes fixture recall through the default query interpreter", async () => {
    const store = await seededStore(motherCaseFixture, selfInsightFixture);
    const cases = [...motherCaseFixture.cases, ...selfInsightFixture.cases].map((testCase) => ({
      ...testCase,
      query: inferRetrievalQuery(testCase.query.text, testCase.query.referenceDate),
    }));

    const report = evaluateRetrieval(store, cases);

    expect(report.recallAt5).toBeGreaterThanOrEqual(0.8);
    expect(report.recallAt10).toBeGreaterThanOrEqual(0.9);
    store.close();
  });

  it("ranks linked prior cause candidates above direct but weaker distractions", async () => {
    const store = await seededStore(motherCaseFixture);

    const memories = retrieveMemories(store, firstMotherCase().query, 5);
    const ids = memories.map((memory) => memory.event.id);

    expect(ids.indexOf("event_steroid_injection")).toBeLessThan(ids.indexOf("event_radish_thorn"));
    expect(
      memories.find((memory) => memory.event.id === "event_steroid_injection")?.reasons,
    ).toContain("link:candidate_cause");
    store.close();
  });

  it("keeps future follow-up observations out of prior cause candidates", async () => {
    const store = await seededStore(motherCaseFixture);

    const memories = retrieveMemories(store, firstMotherCase().query, 10);

    expect(memories.map((memory) => memory.event.id)).not.toContain("event_dermatology_followup");
    store.close();
  });

  it("does not spread links through temporal-only matches", async () => {
    const store = await seededStore(motherCaseFixture, selfInsightFixture);

    const fingerMemories = retrieveMemories(store, firstMotherCase().query, 10);
    const workMemories = retrieveMemories(store, firstSelfInsightCase().query, 10);

    expect(fingerMemories.map((memory) => memory.event.id)).not.toContain("event_direction_change");
    expect(workMemories.map((memory) => memory.event.id)).not.toContain("event_steroid_injection");
    store.close();
  });

  it("does not create causal candidates without a reference date", async () => {
    const store = await seededStore(motherCaseFixture);

    const packet = buildContextPacket(store, {
      ...firstMotherCase().query,
      referenceDate: undefined,
    });

    expect(packet.retrievedMemories.map((memory) => memory.event.id)).toContain(
      "event_steroid_injection",
    );
    expect(packet.causalCandidates).toEqual([]);
    store.close();
  });

  it("does not propagate invalid or temporally impossible cause links", async () => {
    const cases = [
      { causeDate: "2026-06-20", targetDate: "2026-06-28", confidence: 0.8 },
      { causeDate: "2026-06-21", targetDate: "2026-06-20", confidence: 0.8 },
      { causeDate: "2026-06-10", targetDate: "2026-06-20", confidence: 0 },
    ];

    for (const testCase of cases) {
      const store = await linkedCauseStore(testCase);
      const packet = buildContextPacket(store, {
        text: "손가락 감각 증상",
        referenceDate: "2026-06-27",
        topics: ["증상"],
      });

      expect(packet.causalCandidates).toEqual([]);
      expect(packet.retrievedMemories.map((memory) => memory.event.id)).not.toContain(
        "event_possible_cause",
      );
      store.close();
    }
  });

  it("abstains when the fixture has no supporting evidence", async () => {
    const store = await seededStore(insufficientEvidenceFixture);
    const query = firstInsufficientCase().query;

    const answer = await new FakeAnswerModel().generate(buildContextPacket(store, query));

    expect(retrieveMemories(store, query)).toEqual([]);
    expect(answer.causalCandidates).toEqual([]);
    expect(answer.summary).toContain("충분하지 않습니다");
    store.close();
  });

  it("retrieves repeated self-insight patterns through similar event links", async () => {
    const store = await seededStore(selfInsightFixture);

    const memories = retrieveMemories(store, firstSelfInsightCase().query, 5);
    const ids = memories.map((memory) => memory.event.id);
    const similarLinkedCount = memories.filter((memory) =>
      memory.reasons.includes("link:similar"),
    ).length;

    expect(ids).toEqual(
      expect.arrayContaining([
        "event_direction_change",
        "event_job_change_again",
        "event_process_churn",
      ]),
    );
    expect(similarLinkedCount).toBeGreaterThanOrEqual(2);
    expect(memories.filter((memory) => memory.forgotten).map((memory) => memory.event.id)).toEqual(
      expect.arrayContaining(["event_low_growth", "event_process_churn"]),
    );
    expect(memories.filter((memory) => memory.forgotten)).toHaveLength(2);
    store.close();
  });

  it("creates cautious cause and repetition links from manual records", async () => {
    const store = await emptyStore();
    const engine = new SubbrainEngine(store);

    const treatment = await engine.addEntry({
      id: "entry_manual_treatment",
      text: "왼쪽 검지에 스테로이드 주사를 맞았다.",
      recordedAt: "2026-05-15T20:00:00+09:00",
    });
    const symptom = await engine.addEntry({
      id: "entry_manual_symptom",
      text: "왼쪽 검지가 하얘지고 감각이 둔한 증상이 이어졌다.",
      recordedAt: "2026-06-26T20:00:00+09:00",
    });
    const firstWork = await engine.addEntry({
      id: "entry_manual_work_first",
      text: "팀장과 방향 논의 후 이직 생각이 들고 답답했다.",
      recordedAt: "2026-06-20T20:00:00+09:00",
    });
    const repeatedWork = await engine.addEntry({
      id: "entry_manual_work_second",
      text: "우선순위가 또 바뀌어 주도권이 없고 답답했다.",
      recordedAt: "2026-06-24T20:00:00+09:00",
    });

    expect(treatment.links).toEqual([]);
    expect(symptom.links).toContainEqual(
      expect.objectContaining({
        fromEventId: treatment.events[0]?.id,
        toEventId: symptom.events[0]?.id,
        type: "candidate_cause",
      }),
    );
    expect(repeatedWork.links).toContainEqual(
      expect.objectContaining({
        fromEventId: firstWork.events[0]?.id,
        toEventId: repeatedWork.events[0]?.id,
        type: "similar",
      }),
    );
    const packet = buildContextPacket(
      store,
      inferRetrievalQuery("왼쪽 검지가 하얘지고 감각이 둔한 이유는?", "2026-06-27"),
    );
    expect(packet.causalCandidates.map((memory) => memory.event.id)).toContain(
      treatment.events[0]?.id,
    );
    store.close();
  });

  it("abstains by returning no memories when records lack supporting evidence", async () => {
    const store = await seededStore(selfInsightFixture);

    const memories = retrieveMemories(store, { text: "작년에 제주도에서 만난 사람은 누구였지?" });

    expect(memories).toEqual([]);
    store.close();
  });

  it("extracts simple memory events from raw user entries", async () => {
    const store = await emptyStore();
    const entry = {
      id: "entry_manual_work",
      text: "오늘 팀장과 1:1 후 또 방향이 바뀌어서 답답했다.",
      recordedAt: "2026-06-28T20:00:00+09:00",
    };

    store.addRawEntry(entry);
    for (const event of extractMemoryEvents(entry)) {
      store.addMemoryEvent(event);
    }

    const memories = retrieveMemories(store, inferRetrievalQuery("팀장과 일하면 왜 답답하지?"));
    expect(memories[0]?.event.sourceEntryId).toBe("entry_manual_work");
    expect(memories[0]?.event.topics).toContain("업무 방향");
    store.close();
  });

  it("retrieves personal records together with fixture memories for one question", async () => {
    const store = await seededStore(selfInsightFixture);
    const engine = new SubbrainEngine(store);

    await engine.addEntry({
      id: "entry_manual_direction",
      text: "오늘 팀장과 1:1 후 또 방향이 바뀌어서 답답했고 이직 생각이 났다.",
      recordedAt: "2026-06-28T20:00:00+09:00",
    });
    await engine.addEntry({
      id: "entry_manual_condition",
      text: "오늘 목이 불편하고 피곤해서 집중이 잘 안 됐다.",
      recordedAt: "2026-06-28T21:00:00+09:00",
    });

    const result = await engine.answer(
      inferRetrievalQuery("왜 팀장과 일하면 답답하고 이직 생각이 들까?", "2026-06-30"),
    );
    const sourceEntryIds = result.context.retrievedMemories.map(
      (memory) => memory.event.sourceEntryId,
    );

    expect(sourceEntryIds).toEqual(
      expect.arrayContaining([
        "entry_manual_direction",
        "entry_direction_change",
        "entry_job_change_again",
      ]),
    );
    expect(sourceEntryIds).not.toContain("entry_manual_condition");
    expect(result.answer.evidence.map((evidence) => evidence.sourceEntryId)).toEqual(
      expect.arrayContaining(["entry_manual_direction", "entry_direction_change"]),
    );
    expect(
      result.context.retrievedMemories.find(
        (memory) => memory.event.sourceEntryId === "entry_manual_direction",
      )?.reasons,
    ).toEqual(expect.arrayContaining(["fts:text", "topic:overlap", "entity:overlap"]));
    store.close();
  });

  it("preserves each source entry when identical records are edited independently", async () => {
    const store = await emptyStore();
    const engine = new SubbrainEngine(store);
    const first = {
      id: "entry_repeat_first",
      text: "오늘 팀장과 1:1 후 또 방향이 바뀌어서 답답했다.",
      recordedAt: "2026-06-28T20:00:00+09:00",
    };
    const second = { ...first, id: "entry_repeat_second" };

    const firstResult = await engine.addEntry(first);
    const secondResult = await engine.addEntry(second);
    await engine.addEntry({ ...second, text: "오늘은 목이 뻐근하고 피곤했다." });
    const events = store.listMemoryEvents();

    expect(firstResult.events[0]?.id).not.toBe(secondResult.events[0]?.id);
    expect(events).toHaveLength(2);
    expect(events.map((event) => event.sourceEntryId)).toEqual(
      expect.arrayContaining(["entry_repeat_first", "entry_repeat_second"]),
    );
    expect(events.find((event) => event.sourceEntryId === "entry_repeat_first")?.summary).toBe(
      first.text,
    );
    store.close();
  });

  it("replaces old memory events when the same raw entry is edited", async () => {
    const store = await emptyStore();
    const engine = new SubbrainEngine(store);
    const original = {
      id: "entry_edit",
      text: "오늘 팀장과 1:1 후 또 방향이 바뀌어서 답답했다.",
      recordedAt: "2026-06-28T20:00:00+09:00",
    };
    const edited = { ...original, text: "오늘은 목이 뻐근하고 피곤했다." };

    await engine.addEntry(original);
    await engine.addEntry(edited);

    const events = store.listMemoryEvents();
    expect(events).toHaveLength(1);
    expect(events[0]?.summary).toBe("오늘은 목이 뻐근하고 피곤했다.");
    expect(events[0]?.topics).toContain("컨디션");
    expect(store.searchEventIds("팀장과")).toEqual(new Set());
    store.close();
  });

  it("rejects invalid raw-entry timestamps before extraction", async () => {
    const store = await emptyStore();
    const engine = new SubbrainEngine(store);

    await expect(
      engine.addEntry({
        id: "entry_bad_date",
        text: "오늘 팀장과 1:1 후 답답했다.",
        recordedAt: "2026-02-30T20:00:00+09:00",
      }),
    ).rejects.toBeInstanceOf(SubbrainValidationError);
    expect(store.listMemoryEvents()).toEqual([]);
    store.close();
  });

  it("rejects event links that reference missing events", async () => {
    const store = await seededStore(motherCaseFixture);

    expect(() =>
      store.addEventLink({
        fromEventId: "event_missing",
        toEventId: "event_white_numb_symptom",
        type: "candidate_cause",
        reason: "missing event",
        confidence: 0.5,
      }),
    ).toThrow();
    store.close();
  });

  it("migrates legacy databases and rebuilds their derived FTS index", async () => {
    const path = await tempDbPath();
    createLegacyDatabase(path);

    const store = new SqliteSubbrainStore(path);

    expect(store.listMemoryEvents()).toHaveLength(1);
    expect(store.searchEventIds("유지할")).toEqual(new Set(["event_legacy"]));
    expect(store.searchEventIds("삭제된")).toEqual(new Set());
    expect(() =>
      store.addEventLink({
        fromEventId: "event_missing_a",
        toEventId: "event_missing_b",
        type: "similar",
        reason: "invalid",
        confidence: 0.5,
      }),
    ).toThrow();
    store.close();

    const migrated = new RuntimeDatabaseSync(path);
    expect(migrated.prepare("PRAGMA user_version").get()).toMatchObject({ user_version: 2 });
    migrated.close();
  });

  it("lets the engine replace extraction, query interpretation, and answer generation", async () => {
    const store = await emptyStore();
    const engine = new SubbrainEngine(store, {
      extractor: { extract: async (entry) => [customEvent(entry)] },
      queryInterpreter: {
        infer: async (text) => ({ text, topics: ["사용자 정의 주제"] }),
      },
      answerModel: {
        generate: async (packet) => customAnswer(packet.question),
      },
    });

    const entry = { id: "entry_custom", text: "원문", recordedAt: "2026-06-28T20:00:00+09:00" };
    const saved = await engine.addEntry(entry);
    const query = await engine.inferQuery("사용자 정의 질문");
    const result = await engine.answer(query);

    expect(saved.events[0]?.id).toBe("event_custom");
    expect(result.context.retrievedMemories[0]?.event.id).toBe("event_custom");
    expect(result.answer.summary).toBe("custom answer for 사용자 정의 질문");
    store.close();
  });

  it("rejects invalid extracted events before storing memories", async () => {
    const store = await emptyStore();
    const engine = new SubbrainEngine(store, {
      extractor: { extract: async () => [invalidEvent()] },
    });

    const entry = { id: "entry_bad", text: "원문", recordedAt: "2026-06-28T20:00:00+09:00" };

    await expect(engine.addEntry(entry)).rejects.toBeInstanceOf(SubbrainValidationError);
    expect(store.listMemoryEvents()).toEqual([]);
    store.close();
  });

  it("rejects invalid inferred links before storing an entry", async () => {
    const store = await emptyStore();
    const engine = new SubbrainEngine(store, {
      linker: {
        link: async () => [
          {
            fromEventId: "event_missing",
            toEventId: "event_other_missing",
            type: "candidate_cause",
            reason: "unsupported",
            confidence: 0.5,
          },
        ],
      },
    });

    await expect(
      engine.addEntry({
        id: "entry_bad_link",
        text: "왼쪽 검지 감각이 둔하다.",
        recordedAt: "2026-06-26T20:00:00+09:00",
      }),
    ).rejects.toBeInstanceOf(SubbrainValidationError);
    expect(store.listRawEntries()).toEqual([]);
    expect(store.listMemoryEvents()).toEqual([]);
    store.close();
  });

  it("retries invalid answer drafts before returning a validated answer", async () => {
    const store = await seededStore(motherCaseFixture);
    let calls = 0;
    const engine = new SubbrainEngine(store, {
      maxModelAttempts: 2,
      answerModel: {
        generate: async (packet) => {
          calls += 1;
          return calls === 1 ? invalidAnswer(packet.question) : customAnswer(packet.question);
        },
      },
    });

    const result = await engine.answer(firstMotherCase().query);

    expect(calls).toBe(2);
    expect(result.answer.summary).toBe(`custom answer for ${firstMotherCase().query.text}`);
    store.close();
  });

  it("falls back when answer drafts never pass validation", async () => {
    const store = await seededStore(motherCaseFixture);
    const engine = new SubbrainEngine(store, {
      answerModel: { generate: async (packet) => invalidAnswer(packet.question) },
    });

    const result = await engine.answer(firstMotherCase().query);

    expect(result.answer.causalCandidates).toEqual([]);
    expect(result.answer.summary).toContain("검증을 통과하지 못해");
    expect(result.answer.uncertainty[0]).toContain("존재하지 않는 기억");
    store.close();
  });

  it("rejects causal candidates that were only retrieved as evidence", async () => {
    const store = await seededStore(motherCaseFixture);
    const engine = new SubbrainEngine(store, {
      answerModel: {
        generate: async (packet) =>
          answerForMemory(packet, requiredMemory(packet, "event_radish_thorn")),
      },
    });

    const result = await engine.answer(firstMotherCase().query);

    expect(result.answer.causalCandidates).toEqual([]);
    expect(result.answer.summary).toContain("검증을 통과하지 못해");
    store.close();
  });

  it("rejects evidence fields that do not match the stored memory", async () => {
    const store = await seededStore(motherCaseFixture);
    const engine = new SubbrainEngine(store, {
      answerModel: {
        generate: async (packet) => {
          const memory = requiredMemory(packet, "event_steroid_injection");
          const answer = answerForMemory(packet, memory);
          return {
            ...answer,
            evidence: [{ ...answer.evidence[0], sourceEntryId: "fabricated_source" }],
          };
        },
      },
    });

    const result = await engine.answer(firstMotherCase().query);

    expect(result.answer.causalCandidates).toEqual([]);
    expect(result.answer.summary).toContain("검증을 통과하지 못해");
    store.close();
  });

  it("rejects invalid interpreted retrieval queries", async () => {
    const store = await emptyStore();
    const engine = new SubbrainEngine(store, {
      queryInterpreter: { infer: async () => ({ text: "" }) },
    });

    await expect(engine.inferQuery("질문")).rejects.toBeInstanceOf(SubbrainValidationError);
    await expect(engine.answer({ text: "", referenceDate: "invalid" })).rejects.toBeInstanceOf(
      SubbrainValidationError,
    );
    store.close();
  });
});

async function seededStore(...fixtures: Parameters<typeof seedFixture>[1][]) {
  const store = await emptyStore();
  for (const fixture of fixtures) {
    seedFixture(store, fixture);
  }
  return store;
}

async function emptyStore() {
  return new SqliteSubbrainStore(await tempDbPath());
}

async function linkedCauseStore(input: {
  readonly causeDate: string;
  readonly targetDate: string;
  readonly confidence: number;
}) {
  const store = await emptyStore();
  store.addRawEntry({
    id: "entry_cause",
    text: "이전 처치",
    recordedAt: `${input.causeDate}T12:00:00Z`,
  });
  store.addRawEntry({
    id: "entry_target",
    text: "손가락 감각 증상",
    recordedAt: `${input.targetDate}T12:00:00Z`,
  });
  store.addMemoryEvent(
    memoryEvent("event_possible_cause", "entry_cause", input.causeDate, "이전 처치", []),
  );
  store.addMemoryEvent(
    memoryEvent("event_target", "entry_target", input.targetDate, "손가락 감각 증상", ["증상"]),
  );
  store.addEventLink({
    fromEventId: "event_possible_cause",
    toEventId: "event_target",
    type: "candidate_cause",
    reason: "candidate",
    confidence: input.confidence,
  });
  return store;
}

function memoryEvent(
  id: string,
  sourceEntryId: string,
  occurredAt: string,
  summary: string,
  topics: readonly string[],
) {
  return {
    id,
    sourceEntryId,
    occurredAt,
    summary,
    eventType: "test",
    topics,
    emotions: [],
    confidence: 0.8,
  };
}

function requiredMemory(packet: ContextPacket, id: string): RetrievedMemory {
  const memory = packet.retrievedMemories.find((candidate) => candidate.event.id === id);
  if (memory === undefined) {
    throw new Error(`Missing test memory: ${id}`);
  }
  return memory;
}

function answerForMemory(packet: ContextPacket, memory: RetrievedMemory) {
  return {
    question: packet.question,
    summary: "candidate",
    causalCandidates: [
      {
        eventId: memory.event.id,
        label: memory.event.summary,
        confidence: "high" as const,
        evidenceEventIds: [memory.event.id],
        rationale: "candidate",
      },
    ],
    evidence: [
      {
        eventId: memory.event.id,
        sourceEntryId: memory.event.sourceEntryId,
        occurredAt: memory.event.occurredAt,
        summary: memory.event.summary,
        reasons: memory.reasons,
      },
    ],
    uncertainty: [],
    suggestedQuestions: [],
  };
}

function firstMotherCase() {
  const testCase = motherCaseFixture.cases[0];
  if (testCase === undefined) {
    throw new Error("Mother case fixture is missing");
  }
  return testCase;
}

function firstSelfInsightCase() {
  const testCase = selfInsightFixture.cases[0];
  if (testCase === undefined) {
    throw new Error("Self-insight fixture is missing");
  }
  return testCase;
}

function firstInsufficientCase() {
  const testCase = insufficientEvidenceFixture.cases[0];
  if (testCase === undefined) {
    throw new Error("Insufficient evidence fixture is missing");
  }
  return testCase;
}

function emptyPacket() {
  return {
    question: "작년에 제주도에서 만난 사람은 누구였지?",
    retrievedMemories: [],
    causalCandidates: [],
    answerRules: ["Present possible connections, not final causes."],
  };
}

function customEvent(entry: { readonly id: string; readonly recordedAt: string }) {
  return {
    id: "event_custom",
    sourceEntryId: entry.id,
    occurredAt: entry.recordedAt.slice(0, 10),
    summary: "사용자 정의 이벤트",
    eventType: "custom",
    topics: ["사용자 정의 주제"],
    emotions: [],
    confidence: 0.9,
  };
}

function customAnswer(question: string) {
  return {
    question,
    summary: `custom answer for ${question}`,
    causalCandidates: [],
    evidence: [],
    uncertainty: [],
    suggestedQuestions: [],
  };
}

function invalidEvent() {
  return {
    id: "event_bad",
    sourceEntryId: "other_entry",
    occurredAt: "2026-06-28",
    summary: "",
    eventType: "custom",
    topics: [],
    emotions: [],
    confidence: 2,
  };
}

function invalidAnswer(question: string) {
  return {
    question,
    summary: "unsupported",
    causalCandidates: [
      {
        eventId: "event_not_in_context",
        label: "unsupported",
        confidence: "high",
        evidenceEventIds: ["event_not_in_context"],
        rationale: "unsupported",
      },
    ],
    evidence: [],
    uncertainty: [],
    suggestedQuestions: [],
  };
}

function createLegacyDatabase(path: string): void {
  const db = new RuntimeDatabaseSync(path);
  db.exec(`
    CREATE TABLE raw_entries (id TEXT PRIMARY KEY, text TEXT NOT NULL, recordedAt TEXT NOT NULL);
    CREATE TABLE memory_events (id TEXT PRIMARY KEY, sourceEntryId TEXT NOT NULL, occurredAt TEXT NOT NULL, summary TEXT NOT NULL, eventType TEXT NOT NULL, topics TEXT NOT NULL, emotions TEXT NOT NULL, confidence REAL NOT NULL);
    CREATE TABLE entities (id TEXT PRIMARY KEY, type TEXT NOT NULL, name TEXT NOT NULL);
    CREATE TABLE event_entities (event_id TEXT NOT NULL, entity_id TEXT NOT NULL);
    CREATE TABLE event_attributes (event_id TEXT NOT NULL, type TEXT NOT NULL, value TEXT NOT NULL);
    CREATE TABLE event_links (fromEventId TEXT NOT NULL, toEventId TEXT NOT NULL, type TEXT NOT NULL, reason TEXT NOT NULL, confidence REAL NOT NULL);
    CREATE VIRTUAL TABLE memory_event_fts USING fts5(event_id UNINDEXED, summary, topics, emotions, attributes, entities);
    INSERT INTO raw_entries VALUES ('entry_legacy', '유지할 기억', '2026-06-20T12:00:00Z');
    INSERT INTO memory_events VALUES ('event_legacy', 'entry_legacy', '2026-06-20', '유지할 기억', 'legacy', '["기억"]', '[]', 0.8);
    INSERT INTO memory_event_fts VALUES ('event_legacy', '유지할 기억', '기억', '', '', '');
    INSERT INTO memory_event_fts VALUES ('event_deleted', '삭제된 비밀', '', '', '', '');
    PRAGMA user_version = 1;
  `);
  db.close();
}

async function tempDbPath(): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), "ai-lab-subbrain-"));
  roots.push(root);
  return join(root, "memory.sqlite");
}
