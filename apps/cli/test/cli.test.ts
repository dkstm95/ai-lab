import { chmod, mkdir, mkdtemp, readFile, rm, stat, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { WikiAnswerTask, WikiProposal } from "@ai-lab/agent-runtime";
import { afterEach, describe, expect, it, vi } from "vitest";
import { runCli } from "../src/index.js";
import { formatWikiProposalReview } from "../src/wiki.js";

const roots: string[] = [];

afterEach(async () => {
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
  await Promise.all(roots.map((root) => rm(root, { recursive: true, force: true })));
  roots.length = 0;
});

describe("cli", () => {
  it("runs hello through the fake provider", async () => {
    const log = vi.spyOn(console, "log").mockImplementation(() => undefined);

    await runCli(["node", "ai-lab", "run", "hello", "ping"]);

    expect(log).toHaveBeenCalledWith("[fake:fake-general] ping");
  });

  it("uses default hello input when no input is supplied", async () => {
    const log = vi.spyOn(console, "log").mockImplementation(() => undefined);

    await runCli(["node", "ai-lab", "run", "hello"]);

    expect(log).toHaveBeenCalledWith("[fake:fake-general] hello");
  });

  it("normalizes pnpm separator arguments", async () => {
    const log = vi.spyOn(console, "log").mockImplementation(() => undefined);

    await runCli(["node", "ai-lab", "--", "run", "hello", "ping"]);

    expect(log).toHaveBeenCalledWith("[fake:fake-general] ping");
  });

  it("rejects unknown run targets", async () => {
    await expect(runCli(["node", "ai-lab", "run", "other"])).rejects.toThrow(
      "Only `run hello [input]` is available",
    );
  });

  it("runs the portable wiki answer flow with explicit digest approval", async () => {
    const root = await tempRoot();
    const log = vi.spyOn(console, "log").mockImplementation(() => undefined);
    await writeFile(join(root, "source.md"), "# Research\nDurable knowledge is reusable.\n");
    await runCli(["node", "ai-lab", "wiki", "init"], root);
    await runCli(
      ["node", "ai-lab", "wiki", "source", "add", "source.md", "--title", "Research"],
      root,
    );
    const source = loggedJson<{ id: string }>(log);

    await runCli(
      [
        "node",
        "ai-lab",
        "wiki",
        "answer",
        "task",
        "What is durable knowledge?",
        "--sources",
        source.id,
        "--out",
        "task.json",
      ],
      root,
    );
    const task = await artifact<WikiAnswerTask>(root, "task.json");
    await writeResult(root, task, source.id, `Summary.\nDigest: ${"f".repeat(64)}`);
    await runCli(
      [
        "node",
        "ai-lab",
        "wiki",
        "answer",
        "propose",
        "--task",
        "task.json",
        "--result",
        "result.json",
        "--out",
        "proposal.json",
      ],
      root,
    );
    const proposal = await artifact<WikiProposal>(root, "proposal.json");

    await expect(stat(questionPath(root))).rejects.toThrow();
    await runCli(["node", "ai-lab", "wiki", "answer", "review", "proposal.json"], root);
    const review = String(log.mock.calls.at(-1)?.[0]);
    expect(review).toContain(`Digest: ${proposal.digest}`);
    expect(review.split("\n").filter((line) => line.startsWith("Digest:"))).toHaveLength(1);
    expect(formatWikiProposalReview({ ...proposal, note: "\u202e" })).toContain("\\u202e");
    await expect(
      runCli(
        [
          "node",
          "ai-lab",
          "wiki",
          "answer",
          "apply",
          "proposal.json",
          "--reviewer",
          "Reviewer",
          "--accept-digest",
          "f".repeat(64),
        ],
        root,
      ),
    ).rejects.toThrow("does not match");
    await expect(stat(questionPath(root))).rejects.toThrow();

    await runCli(
      [
        "node",
        "ai-lab",
        "wiki",
        "answer",
        "apply",
        "proposal.json",
        "--reviewer",
        "Reviewer",
        "--accept-digest",
        proposal.digest,
      ],
      root,
    );
    await expect(readFile(questionPath(root), "utf8")).resolves.toContain(
      "Durable knowledge remains reusable.",
    );
    await expect(readFile(join(root, "wiki", "log.md"), "utf8")).resolves.toContain(
      `digest=${proposal.digest}`,
    );
  });

  it("keeps exchange artifacts inside the private workspace directory", async () => {
    const root = await tempRoot();
    const log = vi.spyOn(console, "log").mockImplementation(() => undefined);
    await writeFile(join(root, "source.md"), "# Source\n");
    await runCli(["node", "ai-lab", "wiki", "init"], root);
    await runCli(
      ["node", "ai-lab", "wiki", "source", "add", "source.md", "--title", "Source"],
      root,
    );
    const source = loggedJson<{ id: string }>(log);

    await expect(
      runCli(
        [
          "node",
          "ai-lab",
          "wiki",
          "answer",
          "task",
          "Question?",
          "--sources",
          source.id,
          "--out",
          "../task.json",
        ],
        root,
      ),
    ).rejects.toThrow("filename");
    await expect(stat(join(root, "task.json"))).rejects.toThrow();
    const outside = join(root, "outside.json");
    await writeFile(outside, "{}\n");
    await symlink(outside, join(root, ".ai-lab", "wiki-exchange", "linked.json"));
    await expect(
      runCli(["node", "ai-lab", "wiki", "answer", "review", "linked.json"], root),
    ).rejects.toThrow();
  });

  it("uses the configured default workspace and preserves optional titles", async () => {
    const root = await tempRoot();
    const log = vi.spyOn(console, "log").mockImplementation(() => undefined);
    vi.stubEnv("AI_LAB_WORKSPACE_ROOT", root);
    await writeFile(join(root, "source.md"), "# Source\n");

    await runCli(["node", "ai-lab", "wiki", "init"]);
    await runCli(["node", "ai-lab", "wiki", "source", "add", "source.md", "--title", "Source"]);
    const source = loggedJson<{ id: string }>(log);
    await runCli([
      "node",
      "ai-lab",
      "wiki",
      "answer",
      "task",
      "Question?",
      "--title",
      "Portable answer",
      "--sources",
      source.id,
      "--out",
      "task.json",
    ]);

    await expect(artifact<WikiAnswerTask>(root, "task.json")).resolves.toMatchObject({
      title: "Portable answer",
    });
  });

  it("rejects unknown commands and missing required options", async () => {
    const root = await tempRoot();

    await expect(runCli(["node", "ai-lab", "wiki", "unknown"], root)).rejects.toThrow(
      "Unknown wiki command",
    );
    await expect(
      runCli(["node", "ai-lab", "wiki", "source", "add", "source.md"], root),
    ).rejects.toThrow("--title is required");
    await expect(
      runCli(
        [
          "node",
          "ai-lab",
          "wiki",
          "answer",
          "task",
          "Question?",
          "--sources",
          ",",
          "--out",
          "task.json",
        ],
        root,
      ),
    ).rejects.toThrow("at least one source id");
  });

  it("rejects public exchange directories and oversized artifacts", async () => {
    const publicRoot = await tempRoot();
    const largeRoot = await tempRoot();
    if (process.platform !== "win32") {
      await mkdir(join(publicRoot, ".ai-lab", "wiki-exchange"), { recursive: true });
      await chmod(join(publicRoot, ".ai-lab", "wiki-exchange"), 0o755);
      await expect(
        runCli(["node", "ai-lab", "wiki", "answer", "review", "proposal.json"], publicRoot),
      ).rejects.toThrow("directory is unsafe");
    }

    await mkdir(join(largeRoot, ".ai-lab", "wiki-exchange"), {
      recursive: true,
      mode: 0o700,
    });
    await writeFile(
      join(largeRoot, ".ai-lab", "wiki-exchange", "large.json"),
      "x".repeat(8_000_001),
    );
    await expect(
      runCli(["node", "ai-lab", "wiki", "answer", "review", "large.json"], largeRoot),
    ).rejects.toThrow("exceeds");
  });
});

async function tempRoot(): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), "ai-lab-cli-"));
  roots.push(root);
  return root;
}

function loggedJson<T>(log: ReturnType<typeof vi.spyOn>): T {
  return JSON.parse(String(log.mock.calls.at(-1)?.[0])) as T;
}

async function artifact<T>(root: string, name: string): Promise<T> {
  return JSON.parse(await readFile(join(root, ".ai-lab", "wiki-exchange", name), "utf8")) as T;
}

async function writeResult(
  root: string,
  task: WikiAnswerTask,
  sourceId: string,
  summary = "Durable knowledge remains reusable.",
): Promise<void> {
  await writeFile(
    join(root, ".ai-lab", "wiki-exchange", "result.json"),
    `${JSON.stringify({
      schemaVersion: "ai-lab.wiki-answer-result.v1",
      taskId: task.id,
      taskDigest: task.digest,
      question: task.question,
      summary,
      acceptedClaims: [{ text: "Durable knowledge remains reusable.", sourceId }],
    })}\n`,
    { mode: 0o600 },
  );
}

function questionPath(root: string): string {
  return join(root, "wiki", "pages", "questions", "what-is-durable-knowledge.md");
}
