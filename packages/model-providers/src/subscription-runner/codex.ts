import type {
  NormalizedSubscriptionRunnerConfig,
  ProfileCheck,
  ProfileRunInput,
  SubscriptionAuth,
  SubscriptionCliProfile,
} from "./profile.js";

const chatGptAuthStatus = "Logged in using ChatGPT";
const codexGlobalPolicyArgs = ["--ask-for-approval", "never"] as const;
const codexRunPolicyArgs = [
  "--ephemeral",
  "--ignore-user-config",
  "--ignore-rules",
  "--strict-config",
  "--skip-git-repo-check",
  "--sandbox",
  "read-only",
  "--color",
  "never",
] as const;
const codexIsolationConfig = [
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
] as const;
const codexDisabledFeatures = [
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
] as const;

const emptyMcpCheck: ProfileCheck = {
  id: "empty-mcp",
  args: ["mcp", "list", "--json"],
  validate(stdout: string): void {
    let value: unknown;
    try {
      value = JSON.parse(stdout);
    } catch {
      throw new Error("Codex MCP inventory must be one JSON array");
    }
    if (!Array.isArray(value) || value.length !== 0) {
      throw new Error("Codex subscription runner requires an empty MCP inventory");
    }
  },
};

export const codexSubscriptionProfile: SubscriptionCliProfile =
  Object.freeze<SubscriptionCliProfile>({
    id: "codex",
    profileVersion: "1",
    auditedTargetVersion: "codex-cli 0.145.0",
    expectedAuth: { route: "chatgpt", entitlement: "chatgpt-account" },
    stateEnvironmentName: "CODEX_HOME",
    forbiddenStateEntries: ["config.toml", "AGENTS.md", "skills", "rules", "hooks", "plugins"],
    policy: {
      nonInteractive: true,
      promptTransport: "stdin",
      tools: "disabled-best-effort",
      outputFormat: "JSON Schema requested; host validation required",
      sessionPersistence: "disabled",
      limitations: [
        "ChatGPT login status is a preflight, not per-request billing attestation.",
        "Codex has no single documented switch that disables every built-in tool.",
        "System-managed configuration may impose additional behavior.",
      ],
    },
    versionArgs: ["--version"],
    authArgs: ["login", "status"],
    validateConfig,
    parseAuth,
    checks: () => [emptyMcpCheck],
    runArgs,
    parseRunOutput: parsePlainObject,
  });

function validateConfig(config: NormalizedSubscriptionRunnerConfig): void {
  if (config.profile !== "codex") {
    throw new Error("Codex profile requires profile=codex");
  }
  if (config.model.trim().length === 0) {
    throw new Error("Codex profile requires a model");
  }
  if (config.reasoningEffort === undefined) {
    throw new Error("Codex profile requires reasoningEffort");
  }
}

function parseAuth(stdout: string): SubscriptionAuth {
  if (!isExactLine(stdout, chatGptAuthStatus)) {
    throw new Error("Codex subscription runner requires ChatGPT authentication");
  }
  return { route: "chatgpt", entitlement: "chatgpt-account" };
}

function isExactLine(stdout: string, expected: string): boolean {
  return stdout === expected || stdout === `${expected}\n` || stdout === `${expected}\r\n`;
}

function runArgs(input: ProfileRunInput): readonly string[] {
  const effort = input.config.reasoningEffort;
  if (effort === undefined) {
    throw new Error("Codex profile requires reasoningEffort");
  }
  return [
    ...codexGlobalPolicyArgs,
    "exec",
    ...codexRunPolicyArgs,
    "--output-schema",
    input.schemaPath,
    "-C",
    input.cwd,
    "-m",
    input.config.model,
    "-c",
    'model_provider="openai"',
    "-c",
    `model_reasoning_effort="${effort}"`,
    ...configArgs(codexIsolationConfig),
    ...disabledFeatureArgs(codexDisabledFeatures),
    "-",
  ];
}

function configArgs(values: readonly string[]): string[] {
  return values.flatMap((value) => ["-c", value]);
}

function disabledFeatureArgs(features: readonly string[]): string[] {
  return features.flatMap((feature) => ["--disable", feature]);
}

function parsePlainObject(stdout: string): Record<string, unknown> {
  let value: unknown;
  try {
    value = JSON.parse(stdout);
  } catch {
    throw new Error("Codex output must be exactly one JSON object");
  }
  if (value === null || Array.isArray(value) || typeof value !== "object") {
    throw new Error("Codex output must be exactly one JSON object");
  }
  if (Object.getPrototypeOf(value) !== Object.prototype) {
    throw new Error("Codex output must be a plain JSON object");
  }
  return value as Record<string, unknown>;
}
