import { writeFileSync } from "node:fs";
import { chmod, mkdir, mkdtemp, readFile, rm, stat, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, relative } from "node:path";
import { fileURLToPath } from "node:url";
import type {
  ExternalRunnerConfig,
  ExternalRunnerTrustedFile,
  WikiAnswerResult,
  WikiAnswerTask,
  WikiProposal,
  WikiRebuildReport,
  WikiRebuildResult,
  WikiRebuildTask,
  WikiReflectionReport,
  WikiReflectionTask,
} from "@ai-lab/agent-runtime";
import { externalRunnerFileSha256 } from "@ai-lab/agent-runtime";
import { afterEach, describe, expect, it, vi } from "vitest";
import { runCli } from "../src/index.js";
import {
  formatWikiProposalReview,
  formatWikiRebuildReview,
  formatWikiReflectionReview,
  wikiRunnerConfigDigest,
} from "../src/wiki.js";

const roots: string[] = [];
const runnerFixture = fileURLToPath(new URL("./fixtures/wiki-runner.mjs", import.meta.url));
const executableSha256 = await externalRunnerFileSha256(process.execPath);
const runnerFixtureSha256 = await externalRunnerFileSha256(runnerFixture);

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

  it("prepares a private provider-neutral reflection artifact from explicit input", async () => {
    const root = await tempRoot();
    const log = vi.spyOn(console, "log").mockImplementation(() => undefined);
    await runCli(["node", "ai-lab", "wiki", "init"], root);
    const exchange = join(root, ".ai-lab", "wiki-exchange");
    await mkdir(exchange, { recursive: true, mode: 0o700 });
    await writeFile(
      join(exchange, "reflection-input.json"),
      `${JSON.stringify({
        runSummary: "The response answered a different memory scope.",
        feedback: "Keep the scope the user requested.",
        validation: "The mismatch is observable and repeatable.",
        changedFiles: ["docs/self-evolution-guide.md"],
      })}\n`,
      { encoding: "utf8", mode: 0o600 },
    );

    await runCli(
      [
        "node",
        "ai-lab",
        "wiki",
        "reflect",
        "prepare",
        "--input",
        "reflection-input.json",
        "--out",
        "reflection-task.json",
      ],
      root,
    );
    const task = await artifact<WikiReflectionTask>(root, "reflection-task.json");

    expect(task.id).toBe(`wiki-reflection-${task.digest}`);
    expect(task.evidence.kind).toBe("provided-summary");
    expect(task.contexts.map(({ path }) => path)).toEqual(["index.md", "schema.md"]);
    expect(loggedJson<{ artifact: string }>(log).artifact).toBe(
      ".ai-lab/wiki-exchange/reflection-task.json",
    );
    await writeFile(
      join(exchange, "reflection-result.json"),
      `${JSON.stringify(reflectionResult(task))}\n`,
      { encoding: "utf8", mode: 0o600 },
    );
    await runCli(
      [
        "node",
        "ai-lab",
        "wiki",
        "reflect",
        "propose",
        "--task",
        "reflection-task.json",
        "--result",
        "reflection-result.json",
        "--out",
        "reflection-report.json",
      ],
      root,
    );
    const report = await artifact<WikiReflectionReport>(root, "reflection-report.json");
    await expect(
      stat(join(root, "wiki", "pages", "failures", "scope-mismatch.md")),
    ).rejects.toThrow();
    await runCli(["node", "ai-lab", "wiki", "reflect", "review", "reflection-report.json"], root);
    expect(String(log.mock.calls.at(-1)?.[0])).toContain(`Digest: ${report.digest}`);
    expect(formatWikiReflectionReview({ ...report, rationale: "\u202e" })).toContain("\\u202e");
    await runCli(
      [
        "node",
        "ai-lab",
        "wiki",
        "reflect",
        "apply",
        "reflection-report.json",
        "--task",
        "reflection-task.json",
        "--result",
        "reflection-result.json",
        "--reviewer",
        "Reviewer",
        "--accept-digest",
        report.digest,
      ],
      root,
    );
    await expect(
      readFile(join(root, "wiki", "pages", "failures", "scope-mismatch.md"), "utf8"),
    ).resolves.toContain("## Correction");
  });

  it("runs a trusted external runner without exposing private runner inputs", async () => {
    const root = await tempRoot();
    const log = vi.spyOn(console, "log").mockImplementation(() => undefined);
    const stdinMarker = join(root, "stdin-must-not-run");
    const task = await prepareRunnerTask(
      root,
      log,
      `# Research\nDurable knowledge is reusable.\n$(touch ${stdinMarker})\n`,
    );
    const spawnMarker = join(root, "runner-spawned");
    const shellMarker = join(root, "shell-must-not-run");
    const before = await liveWikiState(root);
    vi.stubEnv("ALLOWED_RUNNER_VALUE", "private-environment-value");

    await runCli(
      runnerArgv(task, "runner-result.json", spawnMarker, {
        args: [runnerFixture, "success", spawnMarker, `; touch ${shellMarker}`],
        env: "ALLOWED_RUNNER_VALUE",
      }),
      root,
    );

    const result = await artifact<WikiAnswerResult>(root, "runner-result.json");
    const disclosure = runnerDisclosure(log);
    expect(result).toMatchObject({
      taskId: task.id,
      taskDigest: task.digest,
      summary: "Runner produced durable knowledge.",
    });
    expect(disclosure).toMatchObject({
      action: "external-runner-disclosure",
      warnings: expect.arrayContaining([
        expect.stringContaining("not a sandbox"),
        expect.stringContaining("API billing"),
        expect.stringContaining("No-auto-apply"),
      ]),
      runner: {
        schemaVersion: "ai-lab.external-runner-config.v2",
        provider: "fixture-runner",
        executable: process.execPath,
        executableSha256,
        args: [runnerFixture, "success", spawnMarker, `; touch ${shellMarker}`],
        envAllowlist: ["ALLOWED_RUNNER_VALUE"],
        trustedFiles: [{ path: runnerFixture, sha256: runnerFixtureSha256 }],
        timeoutMs: 5000,
        digest: expect.stringMatching(/^[a-f0-9]{64}$/),
      },
      task: {
        digest: task.digest,
        contexts: task.contexts.map((context) => ({
          path: context.path,
          sha256: context.sha256,
          utf8Bytes: Buffer.byteLength(context.content, "utf8"),
        })),
      },
    });
    const disclosed = JSON.stringify(disclosure);
    expect(disclosed).not.toContain("Durable knowledge is reusable.");
    expect(disclosed).toContain(`; touch ${shellMarker}`);
    expect(disclosed).not.toContain("private-environment-value");
    await expect(stat(spawnMarker)).resolves.toBeDefined();
    await expect(stat(shellMarker)).rejects.toThrow();
    await expect(stat(stdinMarker)).rejects.toThrow();
    await expect(liveWikiState(root)).resolves.toEqual(before);
    await expect(stat(questionPath(root))).rejects.toThrow();
    await expect(stat(join(root, ".ai-lab", "wiki-exchange", "proposal.json"))).rejects.toThrow();
    const resultInfo = await stat(join(root, ".ai-lab", "wiki-exchange", "runner-result.json"));
    if (process.platform !== "win32") expect(resultInfo.mode & 0o777).toBe(0o600);

    await runCli(
      [
        "node",
        "ai-lab",
        "wiki",
        "answer",
        "propose",
        "--task",
        "runner-task.json",
        "--result",
        "runner-result.json",
        "--out",
        "runner-proposal.json",
      ],
      root,
    );
    const proposal = await artifact<WikiProposal>(root, "runner-proposal.json");
    await runCli(["node", "ai-lab", "wiki", "answer", "review", "runner-proposal.json"], root);
    await runCli(
      [
        "node",
        "ai-lab",
        "wiki",
        "answer",
        "apply",
        "runner-proposal.json",
        "--reviewer",
        "Reviewer",
        "--accept-digest",
        proposal.digest,
      ],
      root,
    );
    await expect(readFile(questionPath(root), "utf8")).resolves.toContain(
      "Runner produced durable knowledge.",
    );
  });

  it("applies a manual shadow rebuild only after exact report review", async () => {
    const root = await tempRoot();
    const log = vi.spyOn(console, "log").mockImplementation(() => undefined);
    await writeFile(join(root, "source.md"), "# Research\nDurable knowledge is reusable.\n");
    await runCli(["node", "ai-lab", "wiki", "init"], root);
    await runCli(
      ["node", "ai-lab", "wiki", "source", "add", "source.md", "--title", "Research"],
      root,
    );
    const source = loggedJson<{ id: string; path: string }>(log);
    await writeRebuildPages(root, source.path);
    const before = await rebuildLiveWikiState(root);

    await runCli(
      [
        "node",
        "ai-lab",
        "wiki",
        "rebuild",
        "task",
        "--sources",
        source.id,
        "--out",
        "rebuild-task.json",
      ],
      root,
    );
    const task = await artifact<WikiRebuildTask>(root, "rebuild-task.json");
    await writeRebuildResult(root, task, source.id);
    await runCli(
      [
        "node",
        "ai-lab",
        "wiki",
        "rebuild",
        "compare",
        "--task",
        "rebuild-task.json",
        "--result",
        "rebuild-result.json",
        "--out",
        "rebuild-report.json",
      ],
      root,
    );

    const report = await artifact<WikiRebuildReport>(root, "rebuild-report.json");
    expect(report.candidateDiagnostics.issues).toEqual([]);
    await runCli(["node", "ai-lab", "wiki", "rebuild", "review", "rebuild-report.json"], root);
    const review = String(log.mock.calls.at(-1)?.[0]);
    expect(review.split("\n").filter((line) => line.startsWith("Digest:"))).toEqual([
      `Digest: ${report.digest}`,
    ]);
    expect(formatWikiRebuildReview({ ...report, taskId: "\u202e" })).toContain("\\u202e");
    await expect(rebuildLiveWikiState(root)).resolves.toEqual(before);
    await expect(
      runCli(
        [
          "node",
          "ai-lab",
          "wiki",
          "rebuild",
          "apply",
          "rebuild-report.json",
          "--task",
          "rebuild-task.json",
          "--result",
          "rebuild-result.json",
          "--reviewer",
          "Reviewer",
          "--accept-digest",
          "f".repeat(64),
        ],
        root,
      ),
    ).rejects.toThrow("does not match");
    await expect(rebuildLiveWikiState(root)).resolves.toEqual(before);

    await runCli(
      [
        "node",
        "ai-lab",
        "wiki",
        "rebuild",
        "apply",
        "rebuild-report.json",
        "--task",
        "rebuild-task.json",
        "--result",
        "rebuild-result.json",
        "--reviewer",
        "Reviewer",
        "--accept-digest",
        report.digest,
      ],
      root,
    );
    await expect(readFile(join(root, "wiki", "log.md"), "utf8")).resolves.toContain(
      `rebuild | ${report.id} | digest=${report.digest}`,
    );
    await expect(
      readFile(join(root, "wiki", task.targets[0]?.path ?? ""), "utf8"),
    ).resolves.toContain("Rebuilt");
  });

  it("does not spawn when a trusted static file changes after disclosure", async () => {
    const root = await tempRoot();
    const log = vi.spyOn(console, "log").mockImplementation(() => undefined);
    const task = await prepareRunnerTask(root, log);
    const mutableRunner = join(root, "mutable-runner.mjs");
    await writeFile(mutableRunner, await readFile(runnerFixture));
    const mutableSha256 = await externalRunnerFileSha256(mutableRunner);
    const spawnMarker = join(root, "integrity-spawned");
    const argv = runnerArgv(task, "integrity-result.json", spawnMarker, {
      args: [mutableRunner, "success", spawnMarker],
      trustedFiles: [{ path: mutableRunner, sha256: mutableSha256 }],
    });
    let changed = false;
    log.mockImplementation((value: unknown) => {
      if (!changed && String(value).includes('"external-runner-disclosure"')) {
        changed = true;
        writeFileSync(mutableRunner, "throw new Error('changed after disclosure');\n");
      }
    });

    await expect(runCli(argv, root)).rejects.toThrow("trusted file SHA-256 mismatch");

    expect(changed).toBe(true);
    await expect(stat(spawnMarker)).rejects.toThrow();
    await expect(
      stat(join(root, ".ai-lab", "wiki-exchange", "integrity-result.json")),
    ).rejects.toThrow();
  });

  it("binds executable and trusted file hashes to the runner consent digest", () => {
    const trustedFiles = [{ path: runnerFixture, sha256: runnerFixtureSha256 }];
    const config = runnerTestConfig([runnerFixture, "success"], undefined, trustedFiles);
    const digest = wikiRunnerConfigDigest(config);

    expect(wikiRunnerConfigDigest({ ...config, executableSha256: "0".repeat(64) })).not.toBe(
      digest,
    );
    expect(
      wikiRunnerConfigDigest({
        ...config,
        trustedFiles: [{ path: runnerFixture, sha256: "0".repeat(64) }],
      }),
    ).not.toBe(digest);
  });

  it("does not spawn without exact consent or when the output already exists", async () => {
    const root = await tempRoot();
    const log = vi.spyOn(console, "log").mockImplementation(() => undefined);
    const task = await prepareRunnerTask(root, log);
    const digestMarker = join(root, "digest-spawn");
    const trustMarker = join(root, "trust-spawn");
    const runnerDigestMarker = join(root, "runner-digest-spawn");
    const occupiedMarker = join(root, "occupied-spawn");

    await expect(
      runCli(
        runnerArgv(task, "digest-result.json", digestMarker, {
          acceptTaskDigest: "f".repeat(64),
        }),
        root,
      ),
    ).rejects.toThrow("full disclosed task digest");
    await expect(stat(digestMarker)).rejects.toThrow();
    await expect(
      stat(join(root, ".ai-lab", "wiki-exchange", "digest-result.json")),
    ).rejects.toThrow();

    await expect(
      runCli(
        runnerArgv(task, "trust-result.json", trustMarker, { trustRunner: "other-runner" }),
        root,
      ),
    ).rejects.toThrow("exact disclosed runner id");
    await expect(stat(trustMarker)).rejects.toThrow();

    await expect(
      runCli(
        runnerArgv(task, "runner-digest-result.json", runnerDigestMarker, {
          acceptRunnerDigest: "f".repeat(64),
        }),
        root,
      ),
    ).rejects.toThrow("full disclosed runner config digest");
    await expect(stat(runnerDigestMarker)).rejects.toThrow();

    await writeFile(join(root, ".ai-lab", "wiki-exchange", "occupied.json"), "{}\n");
    await expect(runCli(runnerArgv(task, "occupied.json", occupiedMarker), root)).rejects.toThrow();
    await expect(stat(occupiedMarker)).rejects.toThrow();
  });

  it("removes its empty reservation when runner output is invalid", async () => {
    const root = await tempRoot();
    const log = vi.spyOn(console, "log").mockImplementation(() => undefined);
    const task = await prepareRunnerTask(root, log);
    const spawnMarker = join(root, "invalid-spawned");
    const before = await liveWikiState(root);

    await expect(
      runCli(
        runnerArgv(task, "invalid-result.json", spawnMarker, {
          args: [runnerFixture, "invalid-result", spawnMarker],
        }),
        root,
      ),
    ).rejects.toThrow("unknown or missing fields");

    await expect(stat(spawnMarker)).resolves.toBeDefined();
    await expect(
      stat(join(root, ".ai-lab", "wiki-exchange", "invalid-result.json")),
    ).rejects.toThrow();
    await expect(liveWikiState(root)).resolves.toEqual(before);
    await expect(stat(questionPath(root))).rejects.toThrow();
  });

  it("does not delete a file that replaces its reserved output", async () => {
    const root = await tempRoot();
    const log = vi.spyOn(console, "log").mockImplementation(() => undefined);
    const task = await prepareRunnerTask(root, log);
    const spawnMarker = join(root, "replacement-spawned");
    const output = join(root, ".ai-lab", "wiki-exchange", "replaced.json");
    const before = await liveWikiState(root);

    await expect(
      runCli(
        runnerArgv(task, "replaced.json", spawnMarker, {
          args: [runnerFixture, "replace-output", spawnMarker, output],
        }),
        root,
      ),
    ).rejects.toThrow("reservation was replaced");

    await expect(readFile(output, "utf8")).resolves.toBe("replacement\n");
    await expect(stat(spawnMarker)).resolves.toBeDefined();
    await expect(liveWikiState(root)).resolves.toEqual(before);
  });

  it.each(["SIGINT", "SIGTERM"] as const)(
    "aborts the external runner on %s and removes its reservation",
    async (signal) => {
      const root = await tempRoot();
      const log = vi.spyOn(console, "log").mockImplementation(() => undefined);
      const task = await prepareRunnerTask(root, log);
      const name = signal.toLowerCase();
      const spawnMarker = join(root, `${name}-spawned`);
      const output = join(root, ".ai-lab", "wiki-exchange", `${name}-result.json`);
      const listeners = process.listenerCount(signal);
      const pending = runCli(
        runnerArgv(task, `${name}-result.json`, spawnMarker, {
          args: [runnerFixture, "timeout", spawnMarker],
        }),
        root,
      );
      const interrupt = waitForFile(spawnMarker).then(() => process.emit(signal, signal));

      await expect(pending).rejects.toThrow("aborted");
      await interrupt;
      await expect(stat(output)).rejects.toThrow();
      expect(process.listenerCount(signal)).toBe(listeners);
    },
    15_000,
  );

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

async function prepareRunnerTask(
  root: string,
  log: ReturnType<typeof vi.spyOn>,
  sourceContent = "# Research\nDurable knowledge is reusable.\n",
): Promise<WikiAnswerTask> {
  await writeFile(join(root, "source.md"), sourceContent);
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
      "runner-task.json",
    ],
    root,
  );
  return artifact(root, "runner-task.json");
}

interface RunnerArgvOverrides {
  readonly acceptRunnerDigest?: string;
  readonly acceptTaskDigest?: string;
  readonly args?: readonly string[];
  readonly env?: string;
  readonly trustedFiles?: readonly ExternalRunnerTrustedFile[];
  readonly trustRunner?: string;
}

function runnerArgv(
  task: WikiAnswerTask,
  out: string,
  spawnMarker: string,
  overrides: RunnerArgvOverrides = {},
): string[] {
  const args = overrides.args ?? [runnerFixture, "success", spawnMarker];
  const trustedFiles = overrides.trustedFiles ?? [
    { path: runnerFixture, sha256: runnerFixtureSha256 },
  ];
  const config = runnerTestConfig(args, overrides.env, trustedFiles);
  const argv = [
    "node",
    "ai-lab",
    "wiki",
    "answer",
    "run",
    "--task",
    "runner-task.json",
    "--out",
    out,
    "--runner-id",
    "fixture-runner",
    "--runner-executable",
    process.execPath,
    "--runner-args-json",
    JSON.stringify(args),
    "--runner-trusted-files-json",
    JSON.stringify(trustedFiles.map((file) => file.path)),
    "--runner-timeout-ms",
    "5000",
    "--accept-task-digest",
    overrides.acceptTaskDigest ?? task.digest,
    "--accept-runner-digest",
    overrides.acceptRunnerDigest ?? wikiRunnerConfigDigest(config),
    "--trust-runner",
    overrides.trustRunner ?? "fixture-runner",
  ];
  return overrides.env === undefined ? argv : [...argv, "--runner-env", overrides.env];
}

function runnerTestConfig(
  args: readonly string[],
  env: string | undefined,
  trustedFiles: readonly ExternalRunnerTrustedFile[],
): ExternalRunnerConfig {
  return {
    provider: "fixture-runner",
    executable: process.execPath,
    executableSha256,
    args,
    envAllowlist: (env ?? "")
      .split(",")
      .map((name) => name.trim())
      .filter(Boolean)
      .sort(),
    trustedFiles: [...trustedFiles].sort((left, right) => left.path.localeCompare(right.path)),
    timeoutMs: 5000,
  };
}

function runnerDisclosure(log: ReturnType<typeof vi.spyOn>) {
  const value = log.mock.calls
    .map((call) => String(call[0]))
    .find((entry) => entry.includes('"external-runner-disclosure"'));
  if (value === undefined) throw new Error("Test runner disclosure was not logged");
  return JSON.parse(value) as unknown;
}

async function writeRebuildPages(root: string, sourcePath: string): Promise<void> {
  const source = relative(join(root, "wiki"), sourcePath);
  await writeFile(
    rebuildConceptPath(root),
    rebuildPage("Research Concept", "research-concept", "concept", source, "Concept claim."),
  );
  await writeFile(
    rebuildSourcePath(root),
    rebuildPage("Research Source", "research-source", "source", source, "Source claim."),
  );
  await writeFile(
    join(root, "wiki", "index.md"),
    "# Wiki Index\n\n- [Research Concept](pages/concepts/research-concept.md)\n- [Research Source](pages/sources/research-source.md)\n",
  );
}

function rebuildPage(
  title: string,
  slug: string,
  kind: "source" | "concept",
  source: string,
  claim: string,
): string {
  const link = kind === "concept" ? "research-source" : "research-concept";
  return `---\ntitle: ${title}\nslug: ${slug}\nkind: ${kind}\nstatus: active\ncreatedAt: 2026-06-17T12:00:00.000Z\nupdatedAt: 2026-06-17T12:00:00.000Z\nsources:\n  - ${source}\n---\n\n## Summary\n\nBaseline ${kind}.\n\n## Key Claims\n\n- accepted: ${claim}\n  source: ${source}\n\n## Links\n\n- [[${link}]]\n`;
}

async function writeRebuildResult(
  root: string,
  task: WikiRebuildTask,
  sourceId: string,
): Promise<void> {
  const result: WikiRebuildResult = {
    schemaVersion: "ai-lab.wiki-rebuild-result.v3",
    taskId: task.id,
    taskDigest: task.digest,
    pages: task.targets.map((target) => rebuildResultPage(target, sourceId)),
  };
  await writeFile(
    join(root, ".ai-lab", "wiki-exchange", "rebuild-result.json"),
    `${JSON.stringify(result)}\n`,
    { mode: 0o600 },
  );
}

function rebuildResultPage(target: WikiRebuildTask["targets"][number], sourceId: string) {
  const concept = target.kind === "concept";
  return {
    path: target.path,
    format: "evidence" as const,
    summary: concept ? "Rebuilt concept." : "Rebuilt source.",
    acceptedClaims: [
      { text: concept ? "Rebuilt concept claim." : "Rebuilt source claim.", sourceId },
    ],
    hypotheses: [],
    links: [concept ? "research-source" : "research-concept"],
  };
}

async function rebuildLiveWikiState(root: string) {
  return {
    ...(await liveWikiState(root)),
    concept: await readFile(rebuildConceptPath(root), "utf8"),
    source: await readFile(rebuildSourcePath(root), "utf8"),
  };
}

function rebuildConceptPath(root: string): string {
  return join(root, "wiki", "pages", "concepts", "research-concept.md");
}

function rebuildSourcePath(root: string): string {
  return join(root, "wiki", "pages", "sources", "research-source.md");
}

async function liveWikiState(root: string) {
  return {
    index: await readFile(join(root, "wiki", "index.md"), "utf8"),
    log: await readFile(join(root, "wiki", "log.md"), "utf8"),
  };
}

async function waitForFile(path: string): Promise<void> {
  for (let attempt = 0; attempt < 1_000; attempt += 1) {
    if (
      await stat(path)
        .then(() => true)
        .catch(() => false)
    )
      return;
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
  throw new Error(`Timed out waiting for test file: ${path}`);
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

function reflectionResult(task: WikiReflectionTask) {
  return {
    schemaVersion: "ai-lab.wiki-reflection-result.v1",
    taskId: task.id,
    taskDigest: task.digest,
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
  };
}

function questionPath(root: string): string {
  return join(root, "wiki", "pages", "questions", "what-is-durable-knowledge.md");
}
