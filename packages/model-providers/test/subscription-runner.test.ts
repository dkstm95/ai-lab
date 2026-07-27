import { chmod, copyFile, mkdir, mkdtemp, readFile, rm, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, describe, expect, it, vi } from "vitest";
import { externalRunnerProtocol, externalRunnerProtocolVersion } from "../src/external-runner.js";
import { claudeSubscriptionProfile } from "../src/subscription-runner/claude.js";
import { runSubscriptionRunnerCli } from "../src/subscription-runner/cli.js";
import { codexSubscriptionProfile } from "../src/subscription-runner/codex.js";
import type {
  SubscriptionProfileId,
  SubscriptionRunnerConfig,
} from "../src/subscription-runner/profile.js";
import {
  inspectSubscriptionRunner,
  runSubscriptionRunner,
} from "../src/subscription-runner/runtime.js";

const roots: string[] = [];
const fixture = fileURLToPath(new URL("./fixtures/subscription-cli.mjs", import.meta.url));
const adapter = fileURLToPath(new URL("../src/subscription-runner.ts", import.meta.url));
const result = { answer: "structured result" };
const responseSchema = {
  type: "object",
  additionalProperties: false,
  properties: { answer: { type: "string" } },
  required: ["answer"],
};

vi.setConfig({ testTimeout: 15_000 });

afterEach(async () => {
  await Promise.all(roots.map((root) => rm(root, { recursive: true, force: true })));
  roots.length = 0;
});

describe("subscription runner", () => {
  it.each(["codex", "claude"] as const)(
    "runs the %s profile through stdin with a fresh target environment",
    async (profile) => {
      const setup = await fixtureSetup(profile);
      const manifest = await inspectSubscriptionRunner(setup.config, adapter);
      const response = await runSubscriptionRunner(
        setup.config,
        adapter,
        manifest.digest,
        JSON.stringify(requestEnvelope(profile, "private prompt canary")),
      );
      const trace = await readTrace(setup.stateDir);
      const run = trace.find((entry) => entry.command === "run");

      expect(JSON.parse(response.output)).toEqual(result);
      expect(response).toMatchObject({
        protocol: externalRunnerProtocol,
        version: externalRunnerProtocolVersion,
        requestId: "request-1",
      });
      expect(run?.input).toBe("private prompt canary");
      expect(JSON.stringify(run?.args)).not.toContain("private prompt canary");
      expect(run?.envNames).not.toContain("PATH");
      expect(run?.envNames.join(" ")).not.toMatch(/API|TOKEN|SECRET|PROXY/);
      expect(run?.claudeAiMcpServers).toBe(profile === "claude" ? "false" : undefined);
      await expect(stat(run?.cwd ?? "")).rejects.toThrow();
      assertProfileArguments(profile, run?.args ?? []);
    },
    15_000,
  );

  it("creates a stable, content-bound manifest without disclosing identity", async () => {
    const setup = await fixtureSetup("claude");
    const first = await inspectSubscriptionRunner(setup.config, adapter);
    const second = await inspectSubscriptionRunner(setup.config, adapter);
    const text = JSON.stringify(first);

    expect(first.digest).toBe(second.digest);
    expect(first.digest).toMatch(/^[a-f0-9]{64}$/);
    expect(first.adapter.sha256).toMatch(/^[a-f0-9]{64}$/);
    expect(first.target.sha256).toMatch(/^[a-f0-9]{64}$/);
    expect(first.target.version).toBe("2.1.156 (Claude Code)");
    expect(first.auth).toEqual({ route: "claude.ai", entitlement: "subscription" });
    expect(first.responseFormat).toBe("requested-json-schema-host-validated");
    expect(text).not.toContain("must-not-be-disclosed");
    expect(first.launcher.executable).toMatchObject({ version: process.version });
  });

  it("rejects unaudited versions, non-subscription auth, and configured MCP", async () => {
    const version = await fixtureSetup("codex", { version: "codex-cli 9.9.9" });
    await expect(inspectSubscriptionRunner(version.config, adapter)).rejects.toThrow(
      "version has not been audited",
    );
    const auth = await fixtureSetup("claude", { auth: "api" });
    await expect(inspectSubscriptionRunner(auth.config, adapter)).rejects.toThrow(
      "subscription authentication is required",
    );
    const mixed = await fixtureSetup("claude", { auth: "mixed" });
    await expect(inspectSubscriptionRunner(mixed.config, adapter)).rejects.toThrow(
      "subscription authentication is required",
    );
    const mcp = await fixtureSetup("codex", { mcp: [{ name: "unsafe" }] });
    await expect(inspectSubscriptionRunner(mcp.config, adapter)).rejects.toThrow(
      "empty MCP inventory",
    );
  });

  it("rejects profile-invalid options and state directories with instructions", async () => {
    const claude = await fixtureSetup("claude");
    await expect(
      inspectSubscriptionRunner({ ...claude.config, reasoningEffort: "medium" }, adapter),
    ).rejects.toThrow("does not support reasoningEffort");
    await writeFile(join(claude.stateDir, "SETTINGS.JSON"), "{}\n");
    await expect(inspectSubscriptionRunner(claude.config, adapter)).rejects.toThrow(
      "contains executable instructions or settings",
    );
    const codex = await fixtureSetup("codex");
    const { reasoningEffort: _, ...withoutEffort } = codex.config;
    await expect(inspectSubscriptionRunner(withoutEffort, adapter)).rejects.toThrow(
      "requires reasoningEffort",
    );
  });

  it("rejects malformed or incorrectly bound runner requests before target execution", async () => {
    const setup = await fixtureSetup("codex");
    const manifest = await inspectSubscriptionRunner(setup.config, adapter);
    await writeFile(join(setup.stateDir, "trace.jsonl"), "");

    await expect(
      runSubscriptionRunner(setup.config, adapter, manifest.digest, "{"),
    ).rejects.toThrow("malformed JSON");
    await expect(
      runSubscriptionRunner(
        setup.config,
        adapter,
        manifest.digest,
        JSON.stringify({
          ...requestEnvelope("codex", "prompt"),
          unexpected: true,
        }),
      ),
    ).rejects.toThrow("unknown or missing fields");
    await expect(
      runSubscriptionRunner(
        setup.config,
        adapter,
        manifest.digest,
        JSON.stringify(requestEnvelope("claude", "prompt")),
      ),
    ).rejects.toThrow("does not match its profile");
    expect(await readTrace(setup.stateDir)).toEqual([]);
  });

  it("rejects non-Wiki-shaped model requests and profiles before target execution", async () => {
    const setup = await fixtureSetup("codex");
    const manifest = await inspectSubscriptionRunner(setup.config, adapter);
    const base = requestEnvelope("codex", "prompt");
    const values = [
      {
        ...base,
        protocol: "other.protocol",
      },
      {
        ...base,
        request: { task: "reasoning", messages: base.request.messages },
      },
      {
        ...base,
        request: {
          ...base.request,
          messages: [{ role: "system", content: "prompt" }],
        },
      },
      {
        ...base,
        profile: { ...base.profile, model: "unexpected" },
      },
    ];
    await writeFile(join(setup.stateDir, "trace.jsonl"), "");
    for (const value of values) {
      await expect(
        runSubscriptionRunner(setup.config, adapter, manifest.digest, JSON.stringify(value)),
      ).rejects.toThrow("Subscription runner");
    }
    expect(await readTrace(setup.stateDir)).toEqual([]);
  });

  it("rejects an oversized response schema after manifest consent", async () => {
    const setup = await fixtureSetup("claude");
    const manifest = await inspectSubscriptionRunner(setup.config, adapter);
    const request = requestEnvelope("claude", "prompt");
    request.request.responseFormat.schema = { value: "x".repeat(65_536) };
    await expect(
      runSubscriptionRunner(setup.config, adapter, manifest.digest, JSON.stringify(request)),
    ).rejects.toThrow("response schema is invalid or too large");
  });

  it.each([
    ["noise", "exactly one JSON object"],
    ["invalid-utf8", "not valid UTF-8"],
    ["nonzero", "exited with code 7"],
    ["stdout-limit", "stdout exceeds 1100000 bytes"],
    ["stderr-limit", "stderr exceeds 1100000 bytes"],
    ["timeout", "timed out"],
  ])("rejects target run failure: %s", async (run, message) => {
    const setup = await fixtureSetup("codex", { run });
    const config = run === "timeout" ? { ...setup.config, targetTimeoutMs: 500 } : setup.config;
    const manifest = await inspectSubscriptionRunner(config, adapter);
    await expect(
      runSubscriptionRunner(
        config,
        adapter,
        manifest.digest,
        JSON.stringify(requestEnvelope("codex", "prompt")),
      ),
    ).rejects.toThrow(message);
  });

  it("rejects a changed target and an unaccepted manifest before model execution", async () => {
    const setup = await fixtureSetup("codex", {}, true);
    const manifest = await inspectSubscriptionRunner(setup.config, adapter);
    await writeFile(join(setup.stateDir, "trace.jsonl"), "");
    await writeFile(setup.config.target, "\n", { flag: "a" });

    await expect(
      runSubscriptionRunner(
        setup.config,
        adapter,
        manifest.digest,
        JSON.stringify(requestEnvelope("codex", "prompt")),
      ),
    ).rejects.toThrow("manifest digest was not accepted");
    expect(await readTrace(setup.stateDir)).toEqual([]);
    await expect(
      runSubscriptionRunner(
        setup.config,
        adapter,
        "f".repeat(64),
        JSON.stringify(requestEnvelope("codex", "prompt")),
      ),
    ).rejects.toThrow("manifest digest was not accepted");
    expect(await readTrace(setup.stateDir)).toEqual([]);
  });

  it("supports inspect through the strict command adapter", async () => {
    const setup = await fixtureSetup("claude");
    let output = "";
    await runSubscriptionRunnerCli(cliArgs("inspect", setup.config), adapter, {
      readInput: async () => {
        throw new Error("inspect must not read stdin");
      },
      writeOutput: (value) => {
        output += value;
      },
    });
    expect(JSON.parse(output)).toMatchObject({
      profile: { id: "claude", version: "1" },
      auth: { route: "claude.ai" },
    });
  });

  it("supports a manifest-bound run through the command adapter", async () => {
    const setup = await fixtureSetup("claude");
    const manifest = await inspectSubscriptionRunner(setup.config, adapter);
    let output = "";
    await runSubscriptionRunnerCli(
      [...cliArgs("run", setup.config), "--accept-manifest-digest", manifest.digest],
      adapter,
      {
        readInput: async () => JSON.stringify(requestEnvelope("claude", "prompt")),
        writeOutput: (value) => {
          output += value;
        },
      },
    );
    expect(JSON.parse(output)).toMatchObject({
      protocol: externalRunnerProtocol,
      requestId: "request-1",
    });
  });

  it.each([
    [[]],
    [["other"]],
    [["inspect", "--profile"]],
    [["inspect", "--unknown", "value"]],
    [["inspect", "--profile", "codex", "--profile", "claude"]],
    [["inspect", "--target-timeout-ms", "zero"]],
  ])("rejects malformed command arguments: %j", async (args) => {
    await expect(
      runSubscriptionRunnerCli(args, adapter, {
        readInput: async () => "",
        writeOutput: () => undefined,
      }),
    ).rejects.toThrow("Subscription runner");
  });

  it("rejects command-specific manifest options", async () => {
    const setup = await fixtureSetup("claude");
    await expect(
      runSubscriptionRunnerCli(
        [...cliArgs("inspect", setup.config), "--accept-manifest-digest", "f".repeat(64)],
        adapter,
        { readInput: async () => "", writeOutput: () => undefined },
      ),
    ).rejects.toThrow("inspect does not accept");
    await expect(
      runSubscriptionRunnerCli(cliArgs("run", setup.config), adapter, {
        readInput: async () => "",
        writeOutput: () => undefined,
      }),
    ).rejects.toThrow("requires --accept-manifest-digest");
  });

  it("uses an integrity-bound native launcher", async () => {
    const setup = await fixtureSetup("claude");
    const target = await nativeWrapper(setup.stateDir);
    const config = { ...setup.config, launcher: "native" as const, target };
    const manifest = await inspectSubscriptionRunner(config, adapter);
    const response = await runSubscriptionRunner(
      config,
      adapter,
      manifest.digest,
      JSON.stringify(requestEnvelope("claude", "native prompt")),
    );
    expect(JSON.parse(response.output)).toEqual(result);
    expect(manifest.launcher).toEqual({ kind: "native" });
  });

  it("rejects invalid normalized configuration without running a target", async () => {
    const setup = await fixtureSetup("codex");
    const invalid = [
      { ...setup.config, profile: "other" },
      { ...setup.config, launcher: "shell" },
      { ...setup.config, model: "bad model" },
      { ...setup.config, reasoningEffort: "maximum" },
      { ...setup.config, targetTimeoutMs: 0 },
      { ...setup.config, targetTimeoutMs: 600_001 },
    ] as unknown as SubscriptionRunnerConfig[];
    for (const config of invalid) {
      await expect(inspectSubscriptionRunner(config, adapter)).rejects.toThrow(
        "Subscription runner",
      );
    }
    await expect(
      inspectSubscriptionRunner(null as unknown as SubscriptionRunnerConfig, adapter),
    ).rejects.toThrow("profile is invalid");
  });

  it("rejects unsafe paths, permissions, and executable formats", async () => {
    const setup = await fixtureSetup("claude");
    if (process.platform !== "win32") {
      await chmod(setup.stateDir, 0o755);
      await expect(inspectSubscriptionRunner(setup.config, adapter)).rejects.toThrow(
        "private directory",
      );
      await chmod(setup.stateDir, 0o700);
    }
    await expect(
      inspectSubscriptionRunner({ ...setup.config, target: "relative-cli" }, adapter),
    ).rejects.toThrow("absolute path");
    const invalid = join(setup.stateDir, "invalid-executable");
    await writeFile(invalid, "#!/definitely/missing\n", { mode: 0o700 });
    await expect(
      inspectSubscriptionRunner({ ...setup.config, launcher: "native", target: invalid }, adapter),
    ).rejects.toThrow("Subscription target failed");
    const writable = await copiedTarget(setup.stateDir);
    await chmod(writable, 0o722);
    await expect(
      inspectSubscriptionRunner({ ...setup.config, target: writable }, adapter),
    ).rejects.toThrow("safe regular file");
  });
});

describe("subscription profiles", () => {
  it("strictly parses Codex auth and result objects", () => {
    expect(codexSubscriptionProfile.parseAuth("Logged in using ChatGPT\r\n")).toEqual({
      route: "chatgpt",
      entitlement: "chatgpt-account",
    });
    expect(() => codexSubscriptionProfile.parseAuth("Logged in using ChatGPT\nextra")).toThrow();
    expect(() => codexSubscriptionProfile.parseRunOutput("null")).toThrow();
    expect(() => codexSubscriptionProfile.parseRunOutput("[]")).toThrow();
    expect(() => codexSubscriptionProfile.parseRunOutput("{")).toThrow();
  });

  it("strictly parses Claude subscription status and structured output", () => {
    const ready = JSON.stringify({
      loggedIn: true,
      authMethod: "claude.ai",
      apiProvider: "firstParty",
      subscriptionType: "max",
    });
    expect(claudeSubscriptionProfile.parseAuth(ready)).toEqual({
      route: "claude.ai",
      entitlement: "subscription",
    });
    expect(() => claudeSubscriptionProfile.parseAuth("[]")).toThrow();
    expect(() => claudeSubscriptionProfile.parseAuth("{")).toThrow();
    expect(() =>
      claudeSubscriptionProfile.parseAuth(
        JSON.stringify({
          loggedIn: true,
          authMethod: "claude.ai",
          apiProvider: "firstParty",
          subscriptionType: "max",
          apiKeySource: "apiKeyHelper",
        }),
      ),
    ).toThrow();
    expect(() =>
      claudeSubscriptionProfile.parseAuth(
        JSON.stringify({
          loggedIn: true,
          authMethod: "claude.ai",
          apiProvider: "firstParty",
          subscriptionType: "enterprise",
        }),
      ),
    ).toThrow();
    expect(() =>
      claudeSubscriptionProfile.parseRunOutput(
        JSON.stringify({
          type: "result",
          subtype: "error",
          is_error: true,
          structured_output: result,
        }),
      ),
    ).toThrow();
    expect(() =>
      claudeSubscriptionProfile.parseRunOutput(
        JSON.stringify({
          type: "result",
          subtype: "success",
          is_error: false,
          structured_output: result,
        }),
      ),
    ).not.toThrow();
    expect(() => claudeSubscriptionProfile.parseRunOutput("{}")).toThrow();
  });
});

interface FixtureControl {
  readonly profile: SubscriptionProfileId;
  readonly version: string;
  readonly auth: string;
  readonly mcp?: unknown[];
  readonly run?: string;
  readonly result: unknown;
}

interface FixtureSetup {
  readonly stateDir: string;
  readonly config: SubscriptionRunnerConfig;
}

interface TraceEntry {
  readonly command: string;
  readonly args: string[];
  readonly input: string;
  readonly cwd: string;
  readonly envNames: string[];
  readonly claudeAiMcpServers?: string;
}

async function fixtureSetup(
  profile: SubscriptionProfileId,
  overrides: Partial<FixtureControl> = {},
  copyTarget = false,
): Promise<FixtureSetup> {
  const root = await mkdtemp(join(tmpdir(), "ai-lab-subscription-test-"));
  roots.push(root);
  const stateDir = join(root, "auth");
  await writeFile(join(root, ".keep"), "");
  await mkdir(stateDir, { mode: 0o700 });
  const control = defaultControl(profile, overrides);
  await writeFile(join(stateDir, "fixture.json"), `${JSON.stringify(control)}\n`, { mode: 0o600 });
  const target = copyTarget ? await copiedTarget(root) : fixture;
  return { stateDir, config: subscriptionConfig(profile, stateDir, target) };
}

function defaultControl(
  profile: SubscriptionProfileId,
  overrides: Partial<FixtureControl>,
): FixtureControl {
  return {
    profile,
    version: profile === "codex" ? "codex-cli 0.145.0" : "2.1.156 (Claude Code)",
    auth: "subscription",
    mcp: [],
    run: "success",
    result,
    ...overrides,
  };
}

function subscriptionConfig(
  profile: SubscriptionProfileId,
  stateDir: string,
  target: string,
): SubscriptionRunnerConfig {
  const base = {
    profile,
    target,
    stateDir,
    launcher: "node" as const,
    model: profile === "codex" ? "gpt-test" : "claude-test",
    targetTimeoutMs: 5_000,
  };
  return profile === "codex" ? { ...base, reasoningEffort: "medium" } : base;
}

function requestEnvelope(profile: SubscriptionProfileId, prompt: string) {
  return {
    protocol: externalRunnerProtocol,
    version: externalRunnerProtocolVersion,
    requestId: "request-1",
    request: {
      task: "reasoning",
      messages: [{ role: "user", content: prompt }],
      responseFormat: {
        type: "json_schema",
        name: "fixture_result",
        schema: responseSchema,
      },
    },
    profile: {
      task: "reasoning",
      kind: "external-runner",
      provider: `subscription-${profile}`,
    },
  };
}

async function readTrace(stateDir: string): Promise<TraceEntry[]> {
  const text = await readFile(join(stateDir, "trace.jsonl"), "utf8").catch(() => "");
  return text
    .split("\n")
    .filter(Boolean)
    .map((line) => JSON.parse(line) as TraceEntry);
}

function assertProfileArguments(profile: SubscriptionProfileId, args: readonly string[]): void {
  if (profile === "codex") {
    expect(args).toEqual(expectedCodexArguments(codexArgumentCwd(args)));
    return;
  }
  expect(args).toEqual(expectedClaudeArguments());
}

function codexArgumentCwd(args: readonly string[]): string {
  const index = args.indexOf("-C");
  const cwd = args[index + 1];
  expect(index).toBeGreaterThan(0);
  expect(cwd).toBeTruthy();
  return cwd ?? "";
}

function expectedCodexArguments(cwd: string): string[] {
  const config = [
    'chatgpt_base_url="https://chatgpt.com/backend-api/"',
    "project_root_markers=[]",
    "project_doc_max_bytes=0",
    'developer_instructions=""',
    "skills.bundled.enabled=false",
    "skills.include_instructions=false",
    "include_environment_context=false",
    "include_permissions_instructions=false",
    "include_apps_instructions=false",
    "include_collaboration_mode_instructions=false",
    'web_search="disabled"',
    'history.persistence="none"',
    "check_for_update_on_startup=false",
    "analytics.enabled=false",
    "feedback.enabled=false",
    'shell_environment_policy.inherit="none"',
    "allow_login_shell=false",
    "agents.enabled=false",
  ];
  const disabled = [
    "shell_tool",
    "unified_exec",
    "shell_snapshot",
    "code_mode_host",
    "apps",
    "plugins",
    "remote_plugin",
    "plugin_sharing",
    "multi_agent",
    "goals",
    "hooks",
    "memories",
    "skill_search",
    "skill_mcp_dependency_install",
    "tool_suggest",
    "browser_use",
    "browser_use_external",
    "browser_use_full_cdp_access",
    "in_app_browser",
    "computer_use",
    "image_generation",
    "workspace_dependencies",
    "auth_elicitation",
    "tool_call_mcp_elicitation",
  ];
  return [
    "--ask-for-approval",
    "never",
    "exec",
    "--ephemeral",
    "--ignore-user-config",
    "--ignore-rules",
    "--strict-config",
    "--skip-git-repo-check",
    "--sandbox",
    "read-only",
    "--color",
    "never",
    "--output-schema",
    join(cwd, "response.schema.json"),
    "-C",
    cwd,
    "-m",
    "gpt-test",
    "-c",
    'model_provider="openai"',
    "-c",
    'model_reasoning_effort="medium"',
    ...config.flatMap((value) => ["-c", value]),
    ...disabled.flatMap((value) => ["--disable", value]),
    "-",
  ];
}

function expectedClaudeArguments(): string[] {
  return [
    "-p",
    "--output-format",
    "json",
    "--json-schema",
    JSON.stringify(responseSchema),
    "--model",
    "claude-test",
    "--no-session-persistence",
    "--tools",
    "",
    "--disable-slash-commands",
    "--strict-mcp-config",
    "--mcp-config",
    '{"mcpServers":{}}',
    "--setting-sources",
    "",
    "--settings",
    '{"disableAllHooks":true}',
    "--no-chrome",
    "--permission-mode",
    "dontAsk",
  ];
}

async function copiedTarget(root: string): Promise<string> {
  const target = join(root, "subscription-cli.mjs");
  await copyFile(fixture, target);
  await chmod(target, 0o700);
  return target;
}

async function nativeWrapper(stateDir: string): Promise<string> {
  const target = join(stateDir, "native-wrapper");
  const script = `#!/bin/sh\nexec ${shellQuote(process.execPath)} ${shellQuote(fixture)} "$@"\n`;
  await writeFile(target, script, { mode: 0o700 });
  return target;
}

function shellQuote(value: string): string {
  return `'${value.replaceAll("'", "'\\''")}'`;
}

function cliArgs(command: string, config: SubscriptionRunnerConfig): string[] {
  const args = [
    command,
    "--profile",
    config.profile,
    "--target",
    config.target,
    "--state-dir",
    config.stateDir,
    "--launcher",
    config.launcher,
    "--model",
    config.model,
  ];
  if (config.reasoningEffort !== undefined) {
    args.push("--reasoning-effort", config.reasoningEffort);
  }
  if (config.targetTimeoutMs !== undefined) {
    args.push("--target-timeout-ms", String(config.targetTimeoutMs));
  }
  return args;
}
