import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { EchoTool } from "@ai-lab/local-tools";
import { FakeModelProvider, ModelRouter } from "@ai-lab/model-providers";
import { addWikiSource, initWiki, prepareWikiQuery } from "@ai-lab/wiki";
import { createWorkspace } from "@ai-lab/workspace";
import { afterEach, describe, expect, it } from "vitest";
import {
  DefaultAgentRuntime,
  WikiAnswerWorkflow,
  createDefaultAgentRuntime,
} from "../src/index.js";

const roots: string[] = [];

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

function now(): Date {
  return new Date("2026-06-17T12:00:00.000Z");
}
