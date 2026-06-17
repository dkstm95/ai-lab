import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { runCli } from "../src/index.js";

const roots: string[] = [];

afterEach(async () => {
  vi.restoreAllMocks();
  await Promise.all(roots.map((root) => rm(root, { recursive: true, force: true })));
  roots.length = 0;
});

async function tempRoot() {
  const root = await mkdtemp(join(tmpdir(), "ai-lab-cli-"));
  roots.push(root);
  return root;
}

describe("cli", () => {
  it("adds and lists ideas", async () => {
    const root = await tempRoot();
    const log = vi.spyOn(console, "log").mockImplementation(() => undefined);

    await runCli(["node", "ai-lab", "idea", "add", "Test Idea"], root);
    await runCli(["node", "ai-lab", "idea", "list"], root);

    expect(log).toHaveBeenCalledWith("created test-idea");
    expect(log).toHaveBeenCalledWith("test-idea\tTest Idea");
  });

  it("adds ideas with source and notes options", async () => {
    const root = await tempRoot();
    const log = vi.spyOn(console, "log").mockImplementation(() => undefined);

    await runCli(
      [
        "node",
        "ai-lab",
        "idea",
        "add",
        "Documented Idea",
        "--source",
        "https://example.com",
        "--notes",
        "note",
      ],
      root,
    );

    expect(log).toHaveBeenCalledWith("created documented-idea");
  });

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

  it("rejects unknown idea actions", async () => {
    await expect(runCli(["node", "ai-lab", "idea", "remove"])).rejects.toThrow(
      "Use `idea add <title>` or `idea list`",
    );
  });

  it("rejects unknown run targets", async () => {
    await expect(runCli(["node", "ai-lab", "run", "other"])).rejects.toThrow(
      "Only `run hello [input]` is available",
    );
  });
});
