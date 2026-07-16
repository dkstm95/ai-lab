import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { createApp } from "../src/index.js";

const roots: string[] = [];

afterEach(async () => {
  await Promise.all(roots.map((root) => rm(root, { recursive: true, force: true })));
  roots.length = 0;
});

describe("service", () => {
  it("responds to health checks", async () => {
    const response = await createApp().request("/health");
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ status: "ok" });
  });

  it("runs hello through the fake provider", async () => {
    const response = await createApp().request("/agent/hello", {
      method: "POST",
      body: JSON.stringify({ input: "hello service" }),
      headers: { "content-type": "application/json" },
    });

    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.output).toBe("[fake:fake-general] hello service");
  });

  it("uses default input when hello receives invalid JSON", async () => {
    const response = await createApp().request("/agent/hello", {
      method: "POST",
      body: "{",
      headers: { "content-type": "application/json" },
    });

    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.output).toBe("[fake:fake-general] hello");
  });

  it("serves the SubBrain local test page", async () => {
    const response = await createApp().request("/subbrain");

    expect(response.status).toBe(200);
    const html = await response.text();
    expect(html).toContain("SubBrain");
    expect(html).toContain("기록 연결 요약");
    expect(html).toContain("확인 후보");
    expect(html).toContain("근거 기억");
    expect(html).toContain("매칭 이유");
    expect(html).toContain("잊고 있던 기억");
    expect(html).toContain("빠른 기록");
    expect(html).toContain("quick-entry");
    expect(html).toContain("추출된 기억");
    expect(html).toContain("저장된 기억");
  });

  it("seeds and asks SubBrain with fake answer output", async () => {
    const app = createApp(await tempRoot());

    const seed = await app.request("/subbrain/seed", {
      method: "POST",
      body: JSON.stringify({ confirmReset: true, fixture: "mother-case" }),
      headers: { "content-type": "application/json" },
    });
    const answer = await app.request("/subbrain/ask", {
      method: "POST",
      body: JSON.stringify({
        question: "열무 가시에 찔린 뒤 왼쪽 검지가 하얘지고 감각이 둔한데 왜 그럴까?",
        referenceDate: "2026-06-27",
      }),
      headers: { "content-type": "application/json" },
    });

    expect(seed.status).toBe(200);
    expect(answer.status).toBe(200);
    const body = await answer.json();
    expect(body.answer.causalCandidates[0].eventId).toBe("event_steroid_injection");
    expect(body.context.retrievedMemories[0].score).toBeGreaterThan(0);
    expect(
      body.context.retrievedMemories.find(
        (memory: { event: { id: string } }) => memory.event.id === "event_steroid_injection",
      ).reasons,
    ).toContain("link:candidate_cause");
  });

  it("rejects destructive SubBrain seed calls without confirmation", async () => {
    const app = createApp(await tempRoot());

    const seed = await app.request("/subbrain/seed", {
      method: "POST",
      body: JSON.stringify({ fixture: "mother-case" }),
      headers: { "content-type": "application/json" },
    });

    expect(seed.status).toBe(400);
    await expect(seed.json()).resolves.toEqual({ error: "seed requires confirmReset=true" });
  });

  it("rejects unknown SubBrain fixtures before resetting storage", async () => {
    const app = createApp(await tempRoot());

    const entry = await app.request("/subbrain/entries", {
      method: "POST",
      body: JSON.stringify({ text: "오늘 팀장과 1:1 후 또 방향이 바뀌어서 답답했다." }),
      headers: { "content-type": "application/json" },
    });
    const seed = await app.request("/subbrain/seed", {
      method: "POST",
      body: JSON.stringify({ confirmReset: true, fixture: "typo" }),
      headers: { "content-type": "application/json" },
    });
    const events = await app.request("/subbrain/events");

    expect(entry.status).toBe(200);
    expect(seed.status).toBe(400);
    await expect(seed.json()).resolves.toEqual({ error: "unknown SubBrain fixture" });
    expect((await events.json()).events).toHaveLength(1);
  });

  it("adds raw SubBrain entries and asks against extracted memories", async () => {
    const app = createApp(await tempRoot());

    const entry = await app.request("/subbrain/entries", {
      method: "POST",
      body: JSON.stringify({ text: "오늘 팀장과 1:1 후 또 방향이 바뀌어서 답답했다." }),
      headers: { "content-type": "application/json" },
    });
    const events = await app.request("/subbrain/events");
    const answer = await app.request("/subbrain/ask", {
      method: "POST",
      body: JSON.stringify({ question: "팀장과 일하면 왜 답답하지?" }),
      headers: { "content-type": "application/json" },
    });

    expect(entry.status).toBe(200);
    const entryBody = await entry.json();
    expect(entryBody.events[0].summary).toContain("팀장과 1:1");
    expect(entryBody.events[0].topics).toContain("업무 방향");
    expect((await events.json()).events[0].topics).toContain("업무 방향");
    const answerBody = await answer.json();
    expect(answerBody.context.retrievedMemories[0].event.sourceEntryId).toBe(entryBody.entry.id);
    expect(answerBody.answer.evidence[0].sourceEntryId).toBe(entryBody.entry.id);
    expect(answerBody.answer.causalCandidates).toEqual([]);
    expect(answerBody.answer.summary).toContain("원인 연결 후보를 만들 근거는 충분하지 않습니다");
  });

  it("links manual records before answering with a cautious cause candidate", async () => {
    const app = createApp(await tempRoot());
    const treatment = await app.request("/subbrain/entries", {
      method: "POST",
      body: JSON.stringify({
        text: "왼쪽 검지에 스테로이드 주사를 맞았다.",
        recordedAt: "2026-05-15T20:00:00+09:00",
      }),
      headers: { "content-type": "application/json" },
    });
    const symptom = await app.request("/subbrain/entries", {
      method: "POST",
      body: JSON.stringify({
        text: "왼쪽 검지가 하얘지고 감각이 둔한 증상이 이어졌다.",
        recordedAt: "2026-06-26T20:00:00+09:00",
      }),
      headers: { "content-type": "application/json" },
    });
    const treatmentBody = await treatment.json();
    const symptomBody = await symptom.json();

    const answer = await app.request("/subbrain/ask", {
      method: "POST",
      body: JSON.stringify({
        question: "왼쪽 검지가 하얘지고 감각이 둔한 이유는?",
        referenceDate: "2026-06-27",
      }),
      headers: { "content-type": "application/json" },
    });
    const answerBody = await answer.json();

    expect(symptomBody.links).toContainEqual(
      expect.objectContaining({
        fromEventId: treatmentBody.events[0].id,
        type: "candidate_cause",
      }),
    );
    expect(answerBody.answer.causalCandidates[0].eventId).toBe(treatmentBody.events[0].id);
  });

  it("rejects empty SubBrain questions and entries", async () => {
    const app = createApp(await tempRoot());

    const entry = await app.request("/subbrain/entries", {
      method: "POST",
      body: JSON.stringify({ text: "" }),
      headers: { "content-type": "application/json" },
    });
    const answer = await app.request("/subbrain/ask", {
      method: "POST",
      body: JSON.stringify({ question: "" }),
      headers: { "content-type": "application/json" },
    });

    expect(entry.status).toBe(400);
    expect(answer.status).toBe(400);
  });

  it("rejects invalid SubBrain JSON field types with client errors", async () => {
    const app = createApp(await tempRoot());
    const requests = [
      app.request("/subbrain/ask", {
        method: "POST",
        body: JSON.stringify({ question: 42 }),
        headers: { "content-type": "application/json" },
      }),
      app.request("/subbrain/entries", {
        method: "POST",
        body: JSON.stringify({ text: null }),
        headers: { "content-type": "application/json" },
      }),
      app.request("/subbrain/ask", {
        method: "POST",
        body: "null",
        headers: { "content-type": "application/json" },
      }),
    ];

    for (const response of await Promise.all(requests)) {
      expect(response.status).toBe(400);
    }
  });

  it("always interprets the supplied question instead of fixture case ids", async () => {
    const app = createApp(await tempRoot());
    await app.request("/subbrain/seed", {
      method: "POST",
      body: JSON.stringify({ confirmReset: true, fixture: "mother-case" }),
      headers: { "content-type": "application/json" },
    });

    const response = await app.request("/subbrain/ask", {
      method: "POST",
      body: JSON.stringify({
        question: "제주도 카페에서 누구를 만났지?",
        caseId: "finger-cause",
        referenceDate: "2026-06-27",
      }),
      headers: { "content-type": "application/json" },
    });

    expect(response.status).toBe(200);
    expect((await response.json()).answer.question).toBe("제주도 카페에서 누구를 만났지?");
  });
});

async function tempRoot(): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), "ai-lab-service-"));
  roots.push(root);
  return root;
}
