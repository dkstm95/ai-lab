import { mkdtemp, readFile, rm, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { EchoTool } from "@ai-lab/local-tools";
import { FakeModelProvider, ModelRouter, externalRunnerFileSha256 } from "@ai-lab/model-providers";
import {
  addWikiSource,
  initWiki,
  prepareWikiQuery,
  recordWikiRun,
  renderWikiPage,
} from "@ai-lab/wiki";
import { createWorkspace } from "@ai-lab/workspace";
import { afterEach, describe, expect, it } from "vitest";
import {
  DefaultAgentRuntime,
  type ExternalRunnerConfig,
  WikiAnswerWorkflow,
  WikiMemoryWorkflow,
  WikiReflectionWorkflow,
  createDefaultAgentRuntime,
} from "../src/index.js";

const roots: string[] = [];
const runnerFixture = fileURLToPath(new URL("./fixtures/wiki-runner.mjs", import.meta.url));
const executableSha256 = await externalRunnerFileSha256(process.execPath);
const runnerFixtureSha256 = await externalRunnerFileSha256(runnerFixture);

afterEach(async () => {
  await Promise.all(roots.map((root) => rm(root, { recursive: true, force: true })));
  roots.length = 0;
});

describe("agent runtime", () => {
  it("runs a hello flow through model routing and local tools", async () => {
    const router = new ModelRouter({
      providers: [new FakeModelProvider()],
      profiles: [{ task: "general", kind: "fake", provider: "fake", model: "fake-general" }],
    });
    const runtime = new DefaultAgentRuntime(router, [new EchoTool()]);

    const result = await runtime.run({ task: "general", input: "hello" });

    expect(result.output).toBe("[fake:fake-general] hello");
    expect(result.tools).toEqual([{ name: "echo", output: "agent-runtime-ready" }]);
  });

  it("runs without local tools", async () => {
    const router = new ModelRouter({
      providers: [new FakeModelProvider()],
      profiles: [{ task: "general", kind: "fake", provider: "fake", model: "fake-general" }],
    });
    const runtime = new DefaultAgentRuntime(router);

    const result = await runtime.run({ task: "general", input: "hello" });

    expect(result.tools).toEqual([]);
  });

  it("creates a default runtime backed by fake providers", async () => {
    const runtime = createDefaultAgentRuntime();

    const result = await runtime.run({ task: "creative", input: "draw" });

    expect(result.output).toBe("[fake:fake-creative] draw");
  });

  it("runs a provider-neutral wiki answer through explicit human review", async () => {
    const workspace = await wikiWorkspace();
    const workflow = new WikiAnswerWorkflow(workspace);
    const source = await addWikiSource(workspace, { path: "source.md", title: "Research" });
    const task = await workflow.prepareTask({
      question: "What is durable knowledge?",
      sourceIds: [source.id],
    });
    const proposal = await workflow.prepareProposal(task, answerResult(task, source.id), now());

    await expect(readFile(questionPath(workspace.root), "utf8")).rejects.toThrow();
    await expect(
      workflow.applyReviewed(proposal, {
        acceptedDigest: "0".repeat(64),
        reviewedBy: "Reviewer",
      }),
    ).rejects.toThrow("does not match");
    await workflow.applyReviewed(
      proposal,
      {
        acceptedDigest: proposal.digest,
        reviewedBy: "Reviewer",
        reviewedAt: new Date("2026-06-17T12:30:00.000Z"),
      },
      new Date("2026-06-17T13:00:00.000Z"),
    );

    await expect(readFile(questionPath(workspace.root), "utf8")).resolves.toContain(
      "Durable knowledge remains reusable.",
    );
    const query = await prepareWikiQuery(workspace, "durable knowledge");
    expect(query.contextFiles).toContain("pages/questions/what-is-durable-knowledge.md");
  });

  it("prepares and applies reviewed provider-neutral reflections without invoking a model", async () => {
    const workspace = await wikiWorkspace();
    const run = await recordWikiRun(workspace, {
      task: "review",
      input: "User correction",
      output: "Validated correction",
    });
    const workflow = new WikiReflectionWorkflow(workspace);

    const task = await workflow.prepareTask({
      runId: run.id,
      feedback: "Retain the correction.",
      validation: "The correction applies to future reviews.",
      changedFiles: ["packages/wiki/src/index.ts"],
    });

    expect(task.evidence).toMatchObject({ kind: "recorded-run", id: run.id });
    await expect(workflow.validateTask(task)).resolves.toEqual(task);
    const result = reflectionResult(task);
    const report = await workflow.prepareReport(task, result, now());
    await workflow.applyReviewed(
      {
        task,
        result,
        report,
        acceptedDigest: report.digest,
        reviewedBy: "Reviewer",
        reviewedAt: new Date("2026-06-17T12:30:00.000Z"),
      },
      new Date("2026-06-17T13:00:00.000Z"),
    );
    await expect(
      readFile(join(workspace.root, "wiki", "pages", "failures", "scope-mismatch.md"), "utf8"),
    ).resolves.toContain("## Prevention Check");
  });

  it("retrieves reviewed memory and records a task-bound usefulness observation", async () => {
    const workspace = await wikiWorkspace();
    await writeMemoryPage(workspace.root);
    const source = await addWikiSource(workspace, { path: "source.md", title: "Research" });
    const memory = new WikiMemoryWorkflow(workspace);
    const context = await memory.prepareContext("durable knowledge", now());
    const task = await new WikiAnswerWorkflow(workspace).prepareTask({
      question: "What is durable knowledge?",
      sourceIds: [source.id],
    });

    expect(context.memories.map(({ path }) => path)).toEqual([
      "pages/playbooks/durable-knowledge-review.md",
    ]);
    await expect(memory.validateContext(context, now())).resolves.toEqual(context);
    expect(task.memories.map(({ path }) => path)).toEqual([
      "pages/playbooks/durable-knowledge-review.md",
    ]);
    const selected = task.memories[0];
    if (selected === undefined) throw new Error("Expected a selected memory");
    await memory.recordEvaluation(
      task,
      {
        taskOutcome: "improved",
        assessments: [{ path: selected.path, verdict: "helpful" }],
      },
      now(),
    );
    await expect(memory.summarizeEvaluations()).resolves.toMatchObject({
      evaluations: 1,
      helpfulRate: 1,
      counts: { improved: 1, helpful: 1 },
    });
    const control = await memory.prepareControlTask(task);
    await memory.recordComparison(
      {
        task,
        controlTask: control,
        memoryResult: answerResult(task, source.id),
        controlResult: answerResult(control, source.id),
        judgment: {
          preference: "tie",
          assessments: [{ path: selected.path, verdict: "unused" }],
        },
      },
      new Date("2026-06-17T13:00:00.000Z"),
    );
    await expect(memory.summarizeEvaluations()).resolves.toMatchObject({
      evaluations: 2,
      comparisons: 1,
      counts: { tied: 1 },
    });
  });

  it("returns a task-bound result without changing the live Wiki", async () => {
    const workspace = await wikiWorkspace();
    const workflow = new WikiAnswerWorkflow(workspace);
    const source = await addWikiSource(workspace, { path: "source.md", title: "Research" });
    const task = await workflow.prepareTask({
      question: "What is durable knowledge?",
      sourceIds: [source.id],
    });
    const before = await currentWikiFiles(workspace.root, task.evidence[0]?.path ?? "");

    const run = await workflow.runTaskWithExternalRunner(task, externalRunner("success"));

    expect(run).toEqual({
      result: answerResult(task, source.id),
      runner: { id: "wiki-fixture" },
    });
    await expect(currentWikiFiles(workspace.root, task.evidence[0]?.path ?? "")).resolves.toEqual(
      before,
    );
    const fromRunner = await workflow.prepareProposal(task, run.result, now());
    const fromManual = await workflow.prepareProposal(task, answerResult(task, source.id), now());
    expect(fromRunner.digest).toBe(fromManual.digest);
  });

  it("rejects stale tasks before spawning and rechecks after execution", async () => {
    const workspace = await wikiWorkspace();
    const workflow = new WikiAnswerWorkflow(workspace);
    const source = await addWikiSource(workspace, { path: "source.md", title: "Research" });
    const task = await workflow.prepareTask({
      question: "What is durable knowledge?",
      sourceIds: [source.id],
    });
    const contextPath = join(workspace.root, "wiki", task.evidence[0]?.path ?? "");
    const marker = join(workspace.root, "runner-spawned");
    await writeFile(contextPath, "# Stale before execution.\n");

    await expect(
      workflow.runTaskWithExternalRunner(task, externalRunner("mark", marker)),
    ).rejects.toThrow("stale");
    await expect(stat(marker)).rejects.toThrow();

    const freshTask = await workflow.prepareTask({
      question: "What is durable knowledge?",
      sourceIds: [source.id],
    });
    await expect(
      workflow.runTaskWithExternalRunner(freshTask, externalRunner("mutate-context", contextPath)),
    ).rejects.toThrow("stale");
  });

  it("rejects invalid results and forwards cancellation", async () => {
    const workspace = await wikiWorkspace();
    const workflow = new WikiAnswerWorkflow(workspace);
    const source = await addWikiSource(workspace, { path: "source.md", title: "Research" });
    const task = await workflow.prepareTask({
      question: "What is durable knowledge?",
      sourceIds: [source.id],
    });

    await expect(
      workflow.runTaskWithExternalRunner(task, externalRunner("wrong-source")),
    ).rejects.toThrow("unknown source id");
    await expect(
      workflow.runTaskWithExternalRunner(task, externalRunner("invalid-result")),
    ).rejects.toThrow("invalid Wiki answer JSON");

    const controller = new AbortController();
    const running = workflow.runTaskWithExternalRunner(task, externalRunner("timeout"), {
      signal: controller.signal,
    });
    setTimeout(() => controller.abort(), 50);
    await expect(running).rejects.toMatchObject({ name: "AbortError" });
  });
});

async function wikiWorkspace() {
  const root = await mkdtemp(join(tmpdir(), "ai-lab-agent-wiki-"));
  roots.push(root);
  const workspace = createWorkspace(root);
  await writeFile(join(root, "source.md"), "# Research\nDurable knowledge is reusable.\n", "utf8");
  await initWiki(workspace);
  return workspace;
}

function answerResult(task: { id: string; digest: string; question: string }, sourceId: string) {
  return {
    schemaVersion: "ai-lab.wiki-answer-result.v1" as const,
    taskId: task.id,
    taskDigest: task.digest,
    question: task.question,
    summary: "Durable knowledge remains reusable.",
    acceptedClaims: [{ text: "Durable knowledge remains reusable.", sourceId }],
  };
}

async function writeMemoryPage(root: string): Promise<void> {
  await writeFile(
    join(root, "wiki", "pages", "playbooks", "durable-knowledge-review.md"),
    renderWikiPage(
      {
        title: "Durable Knowledge Review",
        slug: "durable-knowledge-review",
        kind: "playbook",
        status: "active",
        createdAt: "2026-06-17T12:00:00.000Z",
        updatedAt: "2026-06-17T12:00:00.000Z",
        reviewAfter: "2027-06-17T12:00:00.000Z",
        retrievalTerms: ["durable knowledge review"],
        sources: [],
      },
      "## Summary\n\nReview durable knowledge before reuse.\n\n## Links\n\n",
    ),
    "utf8",
  );
}

function questionPath(root: string): string {
  return join(root, "wiki", "pages", "questions", "what-is-durable-knowledge.md");
}

function externalRunner(mode: string, argument?: string): ExternalRunnerConfig {
  return {
    provider: "wiki-fixture",
    executable: process.execPath,
    executableSha256,
    args: argument === undefined ? [runnerFixture, mode] : [runnerFixture, mode, argument],
    envAllowlist: [],
    trustedFiles: [{ path: runnerFixture, sha256: runnerFixtureSha256 }],
  };
}

async function currentWikiFiles(root: string, evidencePath: string): Promise<string[]> {
  return Promise.all(
    ["index.md", "log.md", evidencePath].map((path) => readFile(join(root, "wiki", path), "utf8")),
  );
}

function reflectionResult(task: { id: string; digest: string }) {
  return {
    schemaVersion: "ai-lab.wiki-reflection-result.v2",
    taskId: task.id,
    taskDigest: task.digest,
    outcome: "propose",
    rationale: "The correction is reusable.",
    page: {
      kind: "failure",
      title: "Scope Mismatch",
      slug: "scope-mismatch",
      summary: "Answer the requested scope.",
      retrievalTerms: ["requested scope", "요청한 범위"],
      failure: "The response answered a different scope.",
      trigger: "A request can refer to more than one memory layer.",
      correction: ["Restate the requested scope."],
      preventionChecks: ["The response answers the stated scope."],
      hypotheses: [],
      links: [],
    },
  };
}

function now(): Date {
  return new Date("2026-06-17T12:00:00.000Z");
}
