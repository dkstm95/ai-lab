import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createWorkspace } from "@ai-lab/workspace";
import { afterEach, describe, expect, it } from "vitest";
import { CreateIdeaTool, EchoTool, ListIdeasTool, createWorkspaceTools } from "../src/index.js";

const roots: string[] = [];

afterEach(async () => {
  await Promise.all(roots.map((root) => rm(root, { recursive: true, force: true })));
  roots.length = 0;
});

async function tempWorkspace() {
  const root = await mkdtemp(join(tmpdir(), "ai-lab-tools-"));
  roots.push(root);
  return createWorkspace(root);
}

describe("local tools", () => {
  it("echoes text", async () => {
    const result = await new EchoTool().execute({ name: "echo", input: { text: "hello" } });
    expect(result.output).toBe("hello");
  });

  it("echoes an empty string when text is missing", async () => {
    const result = await new EchoTool().execute({ name: "echo", input: {} });
    expect(result.output).toBe("");
  });

  it("creates and lists ideas through workspace tools", async () => {
    const workspace = await tempWorkspace();
    await new CreateIdeaTool(workspace).execute({
      name: "createIdea",
      input: { title: "Agent OS" },
    });

    const result = await new ListIdeasTool(workspace).execute({ name: "listIdeas" });

    expect(result.output).toEqual([
      expect.objectContaining({
        title: "Agent OS",
        slug: "agent-os",
      }),
    ]);
  });

  it("passes optional source and notes to created ideas", async () => {
    const workspace = await tempWorkspace();

    await new CreateIdeaTool(workspace).execute({
      name: "createIdea",
      input: {
        title: "Sourced Idea",
        source: "https://example.com",
        notes: "tool note",
      },
    });

    const result = await new ListIdeasTool(workspace).execute({ name: "listIdeas" });

    expect(result.output).toEqual([
      expect.objectContaining({
        source: "https://example.com",
        title: "Sourced Idea",
      }),
    ]);
  });

  it("rejects create idea calls without a title", async () => {
    const workspace = await tempWorkspace();

    await expect(
      new CreateIdeaTool(workspace).execute({ name: "createIdea", input: {} }),
    ).rejects.toThrow("createIdea requires a title");
  });

  it("creates the default workspace tool set", async () => {
    const workspace = await tempWorkspace();

    const names = createWorkspaceTools(workspace).map((tool) => tool.definition.name);

    expect(names).toEqual(["echo", "createIdea", "listIdeas"]);
  });
});
