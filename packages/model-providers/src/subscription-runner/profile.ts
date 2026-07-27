export const subscriptionProfileIds = ["codex", "claude"] as const;
export const subscriptionLaunchers = ["native", "node"] as const;
export const reasoningEfforts = ["low", "medium", "high", "xhigh"] as const;

export type SubscriptionProfileId = (typeof subscriptionProfileIds)[number];
export type SubscriptionLauncher = (typeof subscriptionLaunchers)[number];
export type ReasoningEffort = (typeof reasoningEfforts)[number];

export interface SubscriptionRunnerConfig {
  readonly profile: SubscriptionProfileId;
  readonly target: string;
  readonly stateDir: string;
  readonly launcher: SubscriptionLauncher;
  readonly model: string;
  readonly reasoningEffort?: ReasoningEffort;
  readonly targetTimeoutMs?: number;
}

export interface NormalizedSubscriptionRunnerConfig extends SubscriptionRunnerConfig {
  readonly targetTimeoutMs: number;
}

export interface SubscriptionAuth {
  readonly route: "chatgpt" | "claude.ai";
  readonly entitlement: "chatgpt-account" | "subscription";
}

export interface SubscriptionPolicy {
  readonly nonInteractive: true;
  readonly promptTransport: "stdin";
  readonly tools: "disabled-best-effort";
  readonly outputFormat: string;
  readonly sessionPersistence: "disabled";
  readonly limitations: readonly string[];
}

export interface ProfileRunInput {
  readonly config: NormalizedSubscriptionRunnerConfig;
  readonly cwd: string;
  readonly schemaJson: string;
  readonly schemaPath: string;
}

export interface ProfileCheck {
  readonly id: string;
  readonly args: readonly string[];
  validate(stdout: string): void;
}

export interface SubscriptionCliProfile {
  readonly id: SubscriptionProfileId;
  readonly profileVersion: string;
  readonly auditedTargetVersion: string;
  readonly expectedAuth: SubscriptionAuth;
  readonly stateEnvironmentName: "CODEX_HOME" | "CLAUDE_CONFIG_DIR";
  readonly forbiddenStateEntries: readonly string[];
  readonly policy: SubscriptionPolicy;
  readonly versionArgs: readonly string[];
  readonly authArgs: readonly string[];
  validateConfig(config: NormalizedSubscriptionRunnerConfig): void;
  parseAuth(stdout: string): SubscriptionAuth;
  checks(config: NormalizedSubscriptionRunnerConfig): readonly ProfileCheck[];
  runArgs(input: ProfileRunInput): readonly string[];
  parseRunOutput(stdout: string): unknown;
}
