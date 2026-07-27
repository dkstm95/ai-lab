import type {
  NormalizedSubscriptionRunnerConfig,
  ProfileRunInput,
  SubscriptionAuth,
  SubscriptionCliProfile,
} from "./profile.js";

const auditedVersionOutput = "2.1.156 (Claude Code)";
const emptyMcpConfig = '{"mcpServers":{}}';
const isolatedSettings = '{"disableAllHooks":true}';
const auditedSubscriptionTypes = new Set(["pro", "max"]);

export const claudeSubscriptionProfile = Object.freeze<SubscriptionCliProfile>({
  id: "claude",
  profileVersion: "1",
  auditedTargetVersion: auditedVersionOutput,
  expectedAuth: { route: "claude.ai", entitlement: "subscription" },
  stateEnvironmentName: "CLAUDE_CONFIG_DIR",
  forbiddenStateEntries: ["CLAUDE.md", "settings.json", "plugins", "commands", "skills", "hooks"],
  policy: {
    nonInteractive: true,
    promptTransport: "stdin",
    tools: "disabled-best-effort",
    outputFormat: "JSON Schema requested; host validation required",
    sessionPersistence: "disabled",
    limitations: [
      "The CLI remains trusted same-user code, not an OS sandbox.",
      "Managed Claude Code settings and hooks may still apply.",
      "Authentication preflight does not attest the quota or credit source for a request.",
    ],
  },
  versionArgs: ["--version"],
  authArgs: ["auth", "status", "--json"],
  validateConfig: validateClaudeConfig,
  parseAuth: parseClaudeAuth,
  checks: () => [],
  runArgs: claudeRunArgs,
  parseRunOutput: parseClaudeRunOutput,
});

function validateClaudeConfig(config: NormalizedSubscriptionRunnerConfig): void {
  if (config.profile !== "claude" || config.model.trim().length === 0) {
    throw new Error("Claude profile requires profile=claude and a model");
  }
  if (config.reasoningEffort !== undefined) {
    throw new Error("Claude subscription runner does not support reasoningEffort");
  }
}

function parseClaudeAuth(stdout: string): SubscriptionAuth {
  const status = parseJsonObject(stdout, "Claude auth status");
  if (!isClaudeSubscription(status)) {
    throw new Error("Claude subscription authentication is required");
  }
  return { route: "claude.ai", entitlement: "subscription" };
}

function claudeRunArgs(input: ProfileRunInput): readonly string[] {
  return [
    "-p",
    "--output-format",
    "json",
    "--json-schema",
    input.schemaJson,
    "--model",
    input.config.model,
    "--no-session-persistence",
    "--tools",
    "",
    "--disable-slash-commands",
    "--strict-mcp-config",
    "--mcp-config",
    emptyMcpConfig,
    "--setting-sources",
    "",
    "--settings",
    isolatedSettings,
    "--no-chrome",
    "--permission-mode",
    "dontAsk",
  ];
}

function parseClaudeRunOutput(stdout: string): unknown {
  const envelope = parseJsonObject(stdout, "Claude run output");
  if (
    envelope.type !== "result" ||
    envelope.subtype !== "success" ||
    envelope.is_error !== false ||
    !isPlainObject(envelope.structured_output)
  ) {
    throw new Error("Claude run output lacks structured_output");
  }
  return envelope.structured_output;
}

function parseJsonObject(stdout: string, label: string): Record<string, unknown> {
  let value: unknown;
  try {
    value = JSON.parse(stdout);
  } catch {
    throw new Error(`${label} is not valid JSON`);
  }
  if (!isPlainObject(value)) {
    throw new Error(`${label} must be a JSON object`);
  }
  return value;
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return (
    typeof value === "object" &&
    value !== null &&
    !Array.isArray(value) &&
    Object.getPrototypeOf(value) === Object.prototype
  );
}

function isNonemptyString(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

function isClaudeSubscription(value: Record<string, unknown>): boolean {
  return (
    value.loggedIn === true &&
    value.authMethod === "claude.ai" &&
    value.apiProvider === "firstParty" &&
    isNonemptyString(value.subscriptionType) &&
    auditedSubscriptionTypes.has(value.subscriptionType.toLowerCase()) &&
    (value.apiKeySource === undefined || value.apiKeySource === null)
  );
}
