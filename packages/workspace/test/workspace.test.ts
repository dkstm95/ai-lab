import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { createIdea, createWorkspace, listIdeas, slugify } from "../src/index.js";

const roots: string[] = [];

afterEach(async () => {
  await Promise.all(roots.map((root) => rm(root, { recursive: true, force: true })));
  roots.length = 0;
});

async function tempWorkspace() {
  const root = await mkdtemp(join(tmpdir(), "ai-lab-"));
  roots.push(root);
  return createWorkspace(root);
}

describe("workspace", () => {
  it("creates and lists idea documents", async () => {
    const workspace = await tempWorkspace();
    await createIdea(workspace, { title: "LLM Wiki", source: "https://example.com" });

    const ideas = await listIdeas(workspace);

    expect(ideas).toHaveLength(1);
    expect(ideas[0]?.metadata.title).toBe("LLM Wiki");
  });

  it("creates stable slugs", () => {
    expect(slugify("Hello, AI Lab!")).toBe("hello-ai-lab");
  });

  it("uses a safe fallback slug when a title has no slug characters", () => {
    expect(slugify("!!!")).toBe("untitled");
  });

  it("does not overwrite an existing idea with the same slug", async () => {
    const workspace = await tempWorkspace();
    await createIdea(workspace, { title: "Duplicate Idea", notes: "first" });

    await expect(
      createIdea(workspace, { title: "Duplicate Idea", notes: "second" }),
    ).rejects.toThrow("Idea already exists:");

    const ideas = await listIdeas(workspace);
    expect(ideas[0]?.content).toContain("first");
    expect(ideas[0]?.content).not.toContain("second");
  });

  it("rethrows non-duplicate write failures", async () => {
    const workspace = await tempWorkspace();
    await writeFile(join(workspace.root, "ideas"), "not a directory", "utf8");

    await expect(createIdea(workspace, { title: "Broken" })).rejects.toThrow();
  });
});
