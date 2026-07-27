import { mkdtemp, readFile, rm, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { EchoTool } from "@ai-lab/local-tools";
import { FakeModelProvider, ModelRouter } from "@ai-lab/model-providers";
import { addWikiSource, initWiki, prepareWikiQuery } from "@ai-lab/wiki";
import { createWorkspace } from "@ai-lab/workspace";
import { afterEach, describe, expect, it } from "vitest";
import {
  DefaultAgentRuntime,
  type ExternalRunnerConfig,
  WikiAnswerWorkflow,
  createDefaultAgentRuntime,
} from "../src/index.js";

const roots: string[] = [];
const runnerFixture = fileURLToPath(new URL("./fixtures/wiki-runner.mjs", import.meta.url));

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

function questionPath(root: string): string {
  return join(root, "wiki", "pages", "questions", "what-is-durable-knowledge.md");
}

function externalRunner(mode: string, argument?: string): ExternalRunnerConfig {
  return {
    provider: "wiki-fixture",
    executable: process.execPath,
    args: argument === undefined ? [runnerFixture, mode] : [runnerFixture, mode, argument],
    envAllowlist: [],
  };
}

async function currentWikiFiles(root: string, evidencePath: string): Promise<string[]> {
  return Promise.all(
    ["index.md", "log.md", evidencePath].map((path) => readFile(join(root, "wiki", path), "utf8")),
  );
}

function now(): Date {
  return new Date("2026-06-17T12:00:00.000Z");
}
