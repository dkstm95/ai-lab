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
  PrepareWikiMemoryContextTool,
  PrepareWikiQueryTool,
  PrepareWikiReflectionTool,
  ProposeWikiAnswerTool,
  ProposeWikiReflectionTool,
  RecordWikiRunTool,
  SummarizeWikiMemoryEvaluationsTool,
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
      "wiki.memory.retrieve",
      "wiki.memory.stats",
      "wiki.evolve.prepare",
      "wiki.run.record",
      "wiki.answer.propose",
      "wiki.reflect.propose",
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
    const memory = await new PrepareWikiMemoryContextTool(workspace).execute({
      name: "wiki.memory.retrieve",
      input: { query: "LLM Wiki" },
    });
    const memoryStats = await new SummarizeWikiMemoryEvaluationsTool(workspace).execute({
      name: "wiki.memory.stats",
      input: {},
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
    expect((memory.output as { memories: unknown[] }).memories).toEqual([]);
    expect((memoryStats.output as { evaluations: number }).evaluations).toBe(0);
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

  it("exposes reflection preparation only through an explicitly selected trusted tool", async () => {
    const workspace = await tempWorkspace();
    await new InitWikiTool(workspace).execute({ name: "wiki.init", input: {} });
    const run = await new RecordWikiRunTool(workspace).execute({
      name: "wiki.run.record",
      input: { task: "review", input: "correction", output: "validated" },
    });
    const runId = String((run.output as { id: string }).id);

    const task = await new PrepareWikiReflectionTool(workspace).execute({
      name: "wiki.reflect.prepare",
      input: {
        runId,
        feedback: "Remember this correction.",
        validation: "It is reusable.",
        changedFiles: [],
      },
    });
    const reflectionTask = task.output as { id: string; digest: string };
    const report = await new ProposeWikiReflectionTool(workspace).execute({
      name: "wiki.reflect.propose",
      input: {
        task: task.output,
        result: {
          schemaVersion: "ai-lab.wiki-reflection-result.v1",
          taskId: reflectionTask.id,
          taskDigest: reflectionTask.digest,
          outcome: "propose",
          rationale: "The correction is reusable.",
          page: {
            kind: "failure",
            title: "Scope Mismatch",
            slug: "scope-mismatch",
            summary: "Answer the requested scope.",
            failure: "The response answered a different scope.",
            trigger: "A request can refer to more than one memory layer.",
            correction: ["Restate the requested scope."],
            preventionChecks: ["The response answers the stated scope."],
            hypotheses: [],
            links: [],
          },
        },
      },
    });

    expect((task.output as { evidence: { id: string } }).evidence.id).toBe(runId);
    expect(
      (report.output as { candidateDiagnostics: { issues: unknown[] } }).candidateDiagnostics,
    ).toMatchObject({ issues: [] });
    expect(createWorkspaceTools(workspace).map((tool) => tool.definition.name)).not.toContain(
      "wiki.reflect.prepare",
    );
    await expect(
      readFile(join(workspace.root, "wiki", "pages", "failures", "scope-mismatch.md"), "utf8"),
    ).rejects.toThrow();
  });
});
