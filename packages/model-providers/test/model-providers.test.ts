import type { ChildProcessWithoutNullStreams } from "node:child_process";
import { stat } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import type { ModelProfile, ModelRequest } from "@ai-lab/protocol";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  type ExternalRunnerConfig,
  ExternalRunnerModelProvider,
  FakeModelProvider,
  ModelRouter,
  createDefaultModelRouter,
  createFakeModelProfiles,
  externalRunnerProtocol,
  externalRunnerProtocolVersion,
} from "../src/index.js";

const runnerFixture = fileURLToPath(new URL("./fixtures/external-runner.mjs", import.meta.url));
const externalProfile: ModelProfile = {
  task: "general",
  kind: "external-runner",
  provider: "fixture-runner",
  model: "fixture-model",
};
const externalRequest: ModelRequest = {
  task: "general",
  messages: [{ role: "user", content: "hello runner" }],
};

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("model providers", () => {
  it("routes a task to the configured fake provider", async () => {
    const router = new ModelRouter({
      providers: [new FakeModelProvider()],
      profiles: [{ task: "code", kind: "fake", provider: "fake", model: "fake-code" }],
    });

    const result = await router.generate({
      task: "code",
      messages: [{ role: "user", content: "write code" }],
    });

    expect(result.output).toBe("[fake:fake-code] write code");
  });

  it("uses the default fake profiles for every supported task", async () => {
    const router = createDefaultModelRouter(createFakeModelProfiles());

    const result = await router.generate({
      task: "reasoning",
      messages: [{ role: "user", content: "think" }],
    });

    expect(result.output).toBe("[fake:fake-reasoning] think");
  });

  it("returns an empty response when no user message exists", async () => {
    const provider = new FakeModelProvider();

    const result = await provider.generate(
      {
        task: "general",
        messages: [{ role: "system", content: "system prompt" }],
      },
      { task: "general", kind: "fake", provider: "fake" },
    );

    expect(result.output).toBe("[fake:general] ");
  });

  it("fails when no provider matches the selected profile", async () => {
    const router = new ModelRouter({
      providers: [],
      profiles: [{ task: "general", kind: "fake", provider: "fake", model: "fake-general" }],
    });

    await expect(
      router.generate({
        task: "general",
        messages: [{ role: "user", content: "hello" }],
      }),
    ).rejects.toThrow("No model provider registered");
  });
});

describe("external runner provider", () => {
  it("uses the fixed envelope in an isolated directory with allowlisted environment", async () => {
    vi.stubEnv("ALLOWED_RUNNER_VALUE", "visible");
    vi.stubEnv("SECRET_RUNNER_VALUE", "must-not-leak");
    const provider = externalRunner("inspect", {
      envAllowlist: ["ALLOWED_RUNNER_VALUE"],
    });

    const result = await provider.generate(externalRequest, externalProfile);
    const inspected = JSON.parse(result.output) as {
      request: Record<string, unknown>;
      cwd: string;
      allowed: string | null;
      secret: string | null;
    };

    expect(inspected.request).toMatchObject({
      protocol: externalRunnerProtocol,
      version: externalRunnerProtocolVersion,
      request: externalRequest,
      profile: externalProfile,
    });
    expect(inspected.allowed).toBe("visible");
    expect(inspected.secret).toBeNull();
    expect(inspected.cwd).not.toBe(process.cwd());
    await expect(stat(inspected.cwd)).rejects.toThrow();
    expect(result.metadata).toEqual({
      transport: "external-runner",
      protocol: externalRunnerProtocol,
      protocolVersion: externalRunnerProtocolVersion,
      requestId: inspected.request.requestId,
    });
  });

  it("snapshots static arguments instead of observing later mutation", async () => {
    const args = [runnerFixture, "success"];
    const provider = new ExternalRunnerModelProvider({
      provider: "fixture-runner",
      executable: process.execPath,
      args,
      envAllowlist: [],
    });
    args[1] = "timeout";

    await expect(provider.generate(externalRequest, externalProfile)).resolves.toMatchObject({
      output: "hello runner",
    });
  });

  it("rejects oversized request, stdout, and stderr payloads", async () => {
    await expect(
      externalRunner("success", { maxRequestBytes: 128 }).generate(
        {
          task: "general",
          messages: [{ role: "user", content: "x".repeat(1_024) }],
        },
        externalProfile,
      ),
    ).rejects.toThrow("request exceeds 128 bytes");
    await expect(
      externalRunner("oversized-stdout", { maxStdoutBytes: 128 }).generate(
        externalRequest,
        externalProfile,
      ),
    ).rejects.toThrow("stdout exceeds 128 bytes");
    await expect(
      externalRunner("oversized-stderr", { maxStderrBytes: 128 }).generate(
        externalRequest,
        externalProfile,
      ),
    ).rejects.toThrow("stderr exceeds 128 bytes");
  });

  it("terminates a runner that exceeds its deadline", async () => {
    await expect(
      externalRunner("timeout", { timeoutMs: 100 }).generate(externalRequest, externalProfile),
    ).rejects.toThrow("timed out after 100ms");
  });

  it.runIf(process.platform !== "win32")(
    "settles after a killed runner leaves inherited pipes open",
    async () => {
      const startedAt = Date.now();
      const provider = new InspectableExternalRunnerProvider(
        externalRunnerConfig("inherited-pipe", { timeoutMs: 100 }),
      );

      await expect(provider.generate(externalRequest, externalProfile)).rejects.toThrow(
        "timed out after 100ms",
      );

      expect(Date.now() - startedAt).toBeLessThan(1_000);
      expect(provider.pipesDestroyed()).toBe(true);
    },
  );

  it("does not spawn when the abort signal is already aborted", async () => {
    const controller = new AbortController();
    controller.abort();

    await expect(
      externalRunner("success", {
        executable:
          process.platform === "win32"
            ? "C:\\definitely-missing\\runner.exe"
            : "/definitely-missing/runner",
      }).generate(externalRequest, externalProfile, controller.signal),
    ).rejects.toMatchObject({
      name: "AbortError",
      message: "External runner aborted",
    });
  });

  it("aborts a running process and removes its signal listener", async () => {
    const controller = new AbortController();
    const remove = vi.spyOn(controller.signal, "removeEventListener");
    const running = externalRunner("timeout", { timeoutMs: 10_000 }).generate(
      externalRequest,
      externalProfile,
      controller.signal,
    );
    setTimeout(() => controller.abort(), 50);

    await expect(running).rejects.toMatchObject({
      name: "AbortError",
      message: "External runner aborted",
    });
    expect(remove).toHaveBeenCalledWith("abort", expect.any(Function));
  });

  it("removes the abort listener after successful execution", async () => {
    const controller = new AbortController();
    const remove = vi.spyOn(controller.signal, "removeEventListener");

    await externalRunner("success").generate(externalRequest, externalProfile, controller.signal);

    expect(remove).toHaveBeenCalledWith("abort", expect.any(Function));
  });

  it.each(["stdout", "stderr"] as const)(
    "rejects a %s stream error without exposing its raw error",
    async (stream) => {
      const provider = new StreamErrorExternalRunnerProvider(
        externalRunnerConfig("timeout", { timeoutMs: 10_000 }),
        stream,
      );

      await expect(provider.generate(externalRequest, externalProfile)).rejects.toMatchObject({
        message: `External runner ${stream} stream failed`,
      });
    },
  );

  it.each([
    ["malformed", "malformed JSON"],
    ["invalid-utf8", "not valid UTF-8"],
    ["unknown-field", "unknown or missing fields"],
    ["wrong-request", "does not match its request"],
    ["wrong-protocol", "does not match its request"],
    ["wrong-version", "does not match its request"],
    ["invalid-output", "does not match its request"],
  ])("rejects %s response envelopes", async (mode, message) => {
    await expect(externalRunner(mode).generate(externalRequest, externalProfile)).rejects.toThrow(
      message,
    );
  });

  it.each([
    ["nonzero", "exited with code 7"],
    ["signal", "terminated by signal"],
  ])("rejects runner process failure: %s", async (mode, message) => {
    await expect(externalRunner(mode).generate(externalRequest, externalProfile)).rejects.toThrow(
      message,
    );
  });

  it("rejects unsafe config and mismatched profiles before execution", async () => {
    expect(
      () =>
        new ExternalRunnerModelProvider({
          provider: "fixture-runner",
          executable: "node",
          args: [],
          envAllowlist: [],
        }),
    ).toThrow("absolute executable");
    await expect(
      externalRunner("success").generate(externalRequest, {
        ...externalProfile,
        provider: "different-runner",
      }),
    ).rejects.toThrow("must target external-runner:fixture-runner");
  });

  it.each([
    "PATH",
    "node_options",
    "NODE_OPTIONS",
    "DYLD_INSERT_LIBRARIES",
    "LD_PRELOAD",
    "OPENAI_API_KEY",
    "AUTH_TOKEN",
    "CLIENT_SECRET",
    "SSH_AUTH_SOCK",
    "HTTPS_PROXY",
    "AWS_PROFILE",
    "GITHUB_TOKEN",
    "BASH_ENV",
    "JAVA_TOOL_OPTIONS",
    "RUBYOPT",
    "PERL5OPT",
    "PYTHONPATH",
    "GIT_CONFIG_COUNT",
    "NPM_CONFIG_USERCONFIG",
    "YARN_RC_FILENAME",
    "PNPM_HOME",
  ])("rejects sensitive environment allowlist name: %s", (name) => {
    expect(() => externalRunner("success", { envAllowlist: [name] })).toThrow(
      "invalid or sensitive name",
    );
  });

  it("rejects unknown config fields", () => {
    expect(
      () =>
        new ExternalRunnerModelProvider({
          provider: "fixture-runner",
          executable: process.execPath,
          args: [runnerFixture, "success"],
          envAllowlist: [],
          unexpected: true,
        } as ExternalRunnerConfig),
    ).toThrow("config contains unknown or missing fields");
    expect(
      () =>
        new ExternalRunnerModelProvider({
          provider: "fixture-runner",
          executable: process.execPath,
          args: [],
        } as ExternalRunnerConfig),
    ).toThrow("config contains unknown or missing fields");
  });

  it("rejects timeout and byte limits above their hard maximums", () => {
    expect(() => externalRunner("success", { timeoutMs: 600_001 })).toThrow(
      "timeout limit must be between",
    );
    expect(() => externalRunner("success", { maxRequestBytes: 16_777_217 })).toThrow(
      "request limit must be between",
    );
    expect(() => externalRunner("success", { maxStdoutBytes: 16_777_217 })).toThrow(
      "stdout limit must be between",
    );
    expect(() => externalRunner("success", { maxStderrBytes: 16_777_217 })).toThrow(
      "stderr limit must be between",
    );
  });
});

function externalRunner(
  mode: string,
  overrides: Partial<ExternalRunnerConfig> = {},
): ExternalRunnerModelProvider {
  return new ExternalRunnerModelProvider(externalRunnerConfig(mode, overrides));
}

function externalRunnerConfig(
  mode: string,
  overrides: Partial<ExternalRunnerConfig> = {},
): ExternalRunnerConfig {
  return {
    provider: "fixture-runner",
    executable: process.execPath,
    args: [runnerFixture, mode],
    envAllowlist: [],
    ...overrides,
  };
}

class StreamErrorExternalRunnerProvider extends ExternalRunnerModelProvider {
  constructor(
    config: ExternalRunnerConfig,
    private readonly stream: "stdout" | "stderr",
  ) {
    super(config);
  }

  protected override spawnRunner(cwd: string) {
    const child = super.spawnRunner(cwd);
    queueMicrotask(() => {
      child[this.stream].emit("error", new Error("raw stream secret"));
    });
    return child;
  }
}

class InspectableExternalRunnerProvider extends ExternalRunnerModelProvider {
  private child: ChildProcessWithoutNullStreams | undefined;

  pipesDestroyed(): boolean {
    return (
      this.child?.stdin.destroyed === true &&
      this.child.stdout.destroyed &&
      this.child.stderr.destroyed
    );
  }

  protected override spawnRunner(cwd: string) {
    this.child = super.spawnRunner(cwd);
    return this.child;
  }
}
