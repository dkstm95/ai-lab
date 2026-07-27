import type {
  ReasoningEffort,
  SubscriptionLauncher,
  SubscriptionProfileId,
  SubscriptionRunnerConfig,
} from "./profile.js";
import { inspectSubscriptionRunner, runSubscriptionRunner } from "./runtime.js";

interface SubscriptionRunnerIo {
  readonly readInput: () => Promise<string>;
  readonly writeOutput: (value: string) => void;
}

interface ParsedCommand {
  readonly command: "inspect" | "run";
  readonly config: SubscriptionRunnerConfig;
  readonly acceptedManifestDigest?: string;
}

const optionNames = new Set([
  "profile",
  "target",
  "state-dir",
  "launcher",
  "model",
  "reasoning-effort",
  "target-timeout-ms",
  "accept-manifest-digest",
]);

export async function runSubscriptionRunnerCli(
  argv: readonly string[],
  adapterPath: string,
  io: SubscriptionRunnerIo,
): Promise<void> {
  const parsed = parseCommand(argv);
  if (parsed.command === "inspect") {
    const manifest = await inspectSubscriptionRunner(parsed.config, adapterPath);
    io.writeOutput(`${JSON.stringify(manifest, null, 2)}\n`);
    return;
  }
  const response = await runSubscriptionRunner(
    parsed.config,
    adapterPath,
    requiredAcceptedDigest(parsed),
    await io.readInput(),
  );
  io.writeOutput(`${JSON.stringify(response)}\n`);
}

function parseCommand(argv: readonly string[]): ParsedCommand {
  const command = argv[0];
  if (command !== "inspect" && command !== "run") {
    throw new Error("Subscription runner requires `inspect` or `run`");
  }
  const options = optionMap(argv.slice(1));
  const accepted = options.get("accept-manifest-digest");
  if (command === "inspect" && accepted !== undefined) {
    throw new Error("Subscription runner inspect does not accept a manifest digest");
  }
  return parsedCommand(command, configFromOptions(options), accepted);
}

function parsedCommand(
  command: ParsedCommand["command"],
  config: SubscriptionRunnerConfig,
  accepted?: string,
): ParsedCommand {
  return accepted === undefined
    ? { command, config }
    : { command, config, acceptedManifestDigest: accepted };
}

function optionMap(argv: readonly string[]): ReadonlyMap<string, string> {
  if (argv.length % 2 !== 0) {
    throw new Error("Subscription runner options require values");
  }
  const options = new Map<string, string>();
  for (let index = 0; index < argv.length; index += 2) {
    addOption(options, argv[index], argv[index + 1]);
  }
  return options;
}

function addOption(options: Map<string, string>, flag?: string, value?: string): void {
  const name = flag?.startsWith("--") ? flag.slice(2) : "";
  if (!optionNames.has(name) || value === undefined || value.startsWith("--")) {
    throw new Error("Subscription runner received an unknown or missing option");
  }
  if (options.has(name)) {
    throw new Error("Subscription runner options must not be repeated");
  }
  options.set(name, value);
}

function configFromOptions(options: ReadonlyMap<string, string>): SubscriptionRunnerConfig {
  const timeout = optionalPositiveInteger(options.get("target-timeout-ms"));
  const reasoningEffort = options.get("reasoning-effort") as ReasoningEffort | undefined;
  const config = {
    profile: requiredOption(options, "profile") as SubscriptionProfileId,
    target: requiredOption(options, "target"),
    stateDir: requiredOption(options, "state-dir"),
    launcher: requiredOption(options, "launcher") as SubscriptionLauncher,
    model: requiredOption(options, "model"),
    ...(reasoningEffort === undefined ? {} : { reasoningEffort }),
    ...(timeout === undefined ? {} : { targetTimeoutMs: timeout }),
  };
  return config;
}

function optionalPositiveInteger(value?: string): number | undefined {
  if (value === undefined) {
    return undefined;
  }
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed) || parsed <= 0) {
    throw new Error("Subscription runner timeout must be a positive integer");
  }
  return parsed;
}

function requiredOption(options: ReadonlyMap<string, string>, name: string): string {
  const value = options.get(name);
  if (value === undefined || value.length === 0) {
    throw new Error(`Subscription runner requires --${name}`);
  }
  return value;
}

function requiredAcceptedDigest(parsed: ParsedCommand): string {
  if (parsed.acceptedManifestDigest === undefined) {
    throw new Error("Subscription runner run requires --accept-manifest-digest");
  }
  return parsed.acceptedManifestDigest;
}
