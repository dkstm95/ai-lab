import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createIdea, createWorkspace } from "@ai-lab/workspace";
import { afterEach, describe, expect, it } from "vitest";
import { createApp } from "../src/index.js";

const roots: string[] = [];

afterEach(async () => {
  await Promise.all(roots.map((root) => rm(root, { recursive: true, force: true })));
  roots.length = 0;
});

async function tempRoot() {
  const root = await mkdtemp(join(tmpdir(), "ai-lab-service-"));
  roots.push(root);
  return root;
}

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

  it("lists idea metadata from the workspace", async () => {
    const root = await tempRoot();
    const workspace = createWorkspace(root);
    await createIdea(workspace, { title: "Service Idea" });

    const response = await createApp(root).request("/ideas");

    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.ideas).toEqual([expect.objectContaining({ title: "Service Idea" })]);
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
});
