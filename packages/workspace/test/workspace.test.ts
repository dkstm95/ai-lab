import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { createDefaultWorkspace, createWorkspace, slugify } from "../src/index.js";

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
  it("creates explicit workspaces", async () => {
    const workspace = await tempWorkspace();

    expect(workspace.root).toContain("ai-lab-");
  });

  it("creates stable slugs", () => {
    expect(slugify("Hello, AI Lab!")).toBe("hello-ai-lab");
  });

  it("uses a safe fallback slug when a title has no slug characters", () => {
    expect(slugify("!!!")).toBe("untitled");
  });

  it("creates a default workspace from the current directory", () => {
    const workspace = createDefaultWorkspace();

    expect(workspace.root).toBe(process.cwd());
  });
});
