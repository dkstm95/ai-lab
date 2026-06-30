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
    expect(html).toContain("판단 요약");
    expect(html).toContain("가능한 연결 후보");
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
      body: JSON.stringify({ caseId: "finger-cause" }),
      headers: { "content-type": "application/json" },
    });

    expect(seed.status).toBe(200);
    expect(answer.status).toBe(200);
    const body = await answer.json();
    expect(body.answer.causalCandidates[0].eventId).toBe("event_steroid_injection");
    expect(body.context.retrievedMemories[0].score).toBeGreaterThan(0);
    expect(body.context.retrievedMemories[0].reasons).toContain("link:candidate_cause");
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
    expect((await answer.json()).answer.causalCandidates[0].eventId).toContain("event_");
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
});

async function tempRoot(): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), "ai-lab-service-"));
  roots.push(root);
  return root;
}
