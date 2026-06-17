import { afterEach, describe, expect, it, vi } from "vitest";
import { runCli } from "../src/index.js";

afterEach(async () => {
  vi.restoreAllMocks();
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
});
