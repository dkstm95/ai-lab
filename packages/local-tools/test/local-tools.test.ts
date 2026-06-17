import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createWorkspace } from "@ai-lab/workspace";
import { afterEach, describe, expect, it } from "vitest";
import {
  AddWikiSourceTool,
  EchoTool,
  FileWikiAnswerTool,
  InitWikiTool,
  LintWikiTool,
  PrepareWikiEvolveTool,
  PrepareWikiIngestTool,
  PrepareWikiQueryTool,
  RecordWikiRunTool,
  createWorkspaceTools,
} from "../src/index.js";

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

  it("creates the default workspace tool set", async () => {
    const workspace = await tempWorkspace();

    const names = createWorkspaceTools(workspace).map((tool) => tool.definition.name);

    expect(names).toEqual([
      "echo",
      "wiki.init",
      "wiki.source.add",
      "wiki.lint",
      "wiki.ingest.prepare",
      "wiki.query.prepare",
      "wiki.evolve.prepare",
      "wiki.run.record",
      "wiki.answer.file",
    ]);
  });

  it("exposes wiki init, source, ingest, query, evolve, lint, run, and answer tools", async () => {
    const workspace = await tempWorkspace();
    const sourcePath = join(workspace.root, "source.md");
    await writeFile(sourcePath, "# Source\n", "utf8");

    await new InitWikiTool(workspace).execute({ name: "wiki.init", input: {} });
    const source = await new AddWikiSourceTool(workspace).execute({
      name: "wiki.source.add",
      input: { path: sourcePath, title: "LLM Wiki" },
    });
    const sourceId = String((source.output as { id: string }).id);
    const ingest = await new PrepareWikiIngestTool(workspace).execute({
      name: "wiki.ingest.prepare",
      input: { sourceId },
    });
    const query = await new PrepareWikiQueryTool(workspace).execute({
      name: "wiki.query.prepare",
      input: { question: "LLM Wiki" },
    });
    const evolve = await new PrepareWikiEvolveTool(workspace).execute({
      name: "wiki.evolve.prepare",
      input: {},
    });
    const lint = await new LintWikiTool(workspace).execute({ name: "wiki.lint", input: {} });
    const run = await new RecordWikiRunTool(workspace).execute({
      name: "wiki.run.record",
      input: { task: "answer", input: "q", output: "a" },
    });
    const answer = await new FileWikiAnswerTool(workspace).execute({
      name: "wiki.answer.file",
      input: {
        question: "How does LLM Wiki work?",
        answer: "Agents maintain the wiki from accepted sources.",
        sources: [`raw/sources/${sourceId}.md`],
      },
    });

    expect((ingest.output as { task: string }).task).toBe("ingest");
    expect((query.output as { task: string }).task).toBe("query");
    expect((evolve.output as { task: string }).task).toBe("evolve");
    expect((lint.output as { issues: unknown[] }).issues).toEqual([]);
    expect((answer.output as { lint: { issues: unknown[] } }).lint.issues).toEqual([]);
    await expect(
      readFile(String((run.output as { path: string }).path), "utf8"),
    ).resolves.toContain('"task": "answer"');
  });
});
