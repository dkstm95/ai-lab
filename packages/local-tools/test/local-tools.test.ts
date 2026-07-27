import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { wikiAnswerResultSchemaVersion } from "@ai-lab/wiki";
import { createWorkspace } from "@ai-lab/workspace";
import { afterEach, describe, expect, it } from "vitest";
import {
  AddWikiSourceTool,
  EchoTool,
  InitWikiTool,
  LintWikiTool,
  PrepareWikiAnswerTaskTool,
  PrepareWikiEvolveTool,
  PrepareWikiIngestTool,
  PrepareWikiQueryTool,
  ProposeWikiAnswerTool,
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
      "wiki.lint",
      "wiki.ingest.prepare",
      "wiki.query.prepare",
      "wiki.evolve.prepare",
      "wiki.run.record",
      "wiki.answer.propose",
    ]);
  });

  it("implements trusted source registration and agent-safe wiki tools", async () => {
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
    const task = await new PrepareWikiAnswerTaskTool(workspace).execute({
      name: "wiki.answer.prepare",
      input: {
        question: "How does LLM Wiki work?",
        sourceIds: [sourceId],
      },
    });
    const answerTask = task.output as {
      id: string;
      digest: string;
      question: string;
    };
    const answer = await new ProposeWikiAnswerTool(workspace).execute({
      name: "wiki.answer.propose",
      input: {
        task: task.output,
        result: {
          schemaVersion: wikiAnswerResultSchemaVersion,
          taskId: answerTask.id,
          taskDigest: answerTask.digest,
          question: answerTask.question,
          summary: "Agents maintain the wiki from accepted sources.",
          acceptedClaims: [
            {
              text: "Agents maintain the wiki from accepted sources.",
              sourceId,
            },
          ],
        },
      },
    });

    expect((ingest.output as { task: string }).task).toBe("ingest");
    expect((query.output as { task: string }).task).toBe("query");
    expect((evolve.output as { task: string }).task).toBe("evolve");
    expect((lint.output as { issues: unknown[] }).issues).toEqual([]);
    expect((answer.output as { diagnostics: { issues: unknown[] } }).diagnostics.issues).toEqual(
      [],
    );
    await expect(
      readFile(join(workspace.root, "wiki", "pages", "questions", "how-does-llm-wiki-work.md")),
    ).rejects.toThrow();
    await expect(
      readFile(String((run.output as { path: string }).path), "utf8"),
    ).resolves.toContain('"task": "answer"');
  });

  it("rejects legacy answer proposals that are not bound to a task", async () => {
    const workspace = await tempWorkspace();
    const tool = new ProposeWikiAnswerTool(workspace);

    await expect(
      tool.execute({
        name: "wiki.answer.propose",
        input: {
          question: "Question",
          summary: "Summary",
          acceptedClaims: [{ text: "Claim", source: "raw/sources/source.md" }],
        },
      }),
    ).rejects.toThrow("wiki.answer.propose requires task");
  });
});
