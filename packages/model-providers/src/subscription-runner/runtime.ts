import { chmod, mkdir, mkdtemp, open, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { type ModelRequest, modelProfileSchema, modelRequestSchema } from "@ai-lab/protocol";
import {
  type ExternalRunnerRequestEnvelope,
  type ExternalRunnerResponseEnvelope,
  externalRunnerProtocol,
  externalRunnerProtocolVersion,
} from "../external-runner.js";
import { claudeSubscriptionProfile } from "./claude.js";
import { codexSubscriptionProfile } from "./codex.js";
import {
  type SubscriptionRunnerManifest,
  assertFileDigest,
  buildSubscriptionManifest,
  resolveLauncher,
  resolveRunnerFile,
  resolveStateDirectory,
} from "./manifest.js";
import { type TargetProcessContext, invokeSubscriptionTarget } from "./process.js";
import {
  type NormalizedSubscriptionRunnerConfig,
  type SubscriptionCliProfile,
  type SubscriptionRunnerConfig,
  reasoningEfforts,
  subscriptionLaunchers,
  subscriptionProfileIds,
} from "./profile.js";

const profiles: readonly SubscriptionCliProfile[] = [
  codexSubscriptionProfile,
  claudeSubscriptionProfile,
];
const defaultTargetTimeoutMs = 120_000;
const maximumTargetTimeoutMs = 600_000;
const maxSchemaBytes = 65_536;

interface InspectionDependencies {
  readonly adapter: Awaited<ReturnType<typeof resolveRunnerFile>>;
  readonly target: Awaited<ReturnType<typeof resolveRunnerFile>>;
  readonly state: Awaited<ReturnType<typeof resolveStateDirectory>>;
  readonly launcher: Awaited<ReturnType<typeof resolveLauncher>>;
}

export async function inspectSubscriptionRunner(
  value: SubscriptionRunnerConfig,
  adapterPath: string,
): Promise<SubscriptionRunnerManifest> {
  const config = normalizeSubscriptionConfig(value);
  const profile = subscriptionProfile(config.profile);
  profile.validateConfig(config);
  const dependencies = await resolveInspectionDependencies(config, profile, adapterPath);
  return withPrivateDirectory((cwd) => inspectResolvedTarget(config, profile, dependencies, cwd));
}

async function resolveInspectionDependencies(
  config: NormalizedSubscriptionRunnerConfig,
  profile: SubscriptionCliProfile,
  adapterPath: string,
): Promise<InspectionDependencies> {
  const [adapter, target, state, launcher] = await Promise.all([
    resolveRunnerFile(adapterPath, false),
    resolveRunnerFile(config.target, config.launcher === "native"),
    resolveStateDirectory(config.stateDir, profile),
    resolveLauncher(config.launcher),
  ]);
  return { adapter, target, state, launcher };
}

async function inspectResolvedTarget(
  config: NormalizedSubscriptionRunnerConfig,
  profile: SubscriptionCliProfile,
  dependencies: InspectionDependencies,
  cwd: string,
): Promise<SubscriptionRunnerManifest> {
  const context = inspectionContext(config, dependencies, cwd);
  const targetVersion = await inspectTargetVersion(profile, context);
  const auth = await inspectTargetAuth(profile, context);
  await runProfileChecks(profile, context);
  await assertInspectionIntegrity(dependencies);
  return buildSubscriptionManifest({ ...dependencies, profile, config, targetVersion, auth });
}

async function assertInspectionIntegrity(dependencies: InspectionDependencies): Promise<void> {
  const files = [
    dependencies.adapter,
    dependencies.target,
    ...(dependencies.launcher.executable === undefined ? [] : [dependencies.launcher.executable]),
  ];
  await Promise.all(files.map(assertFileDigest));
}

function inspectionContext(
  config: NormalizedSubscriptionRunnerConfig,
  dependencies: InspectionDependencies,
  cwd: string,
): TargetProcessContext {
  return {
    config,
    target: dependencies.target,
    stateRealpath: dependencies.state.realpath,
    cwd,
  };
}

export async function runSubscriptionRunner(
  value: SubscriptionRunnerConfig,
  adapterPath: string,
  acceptedManifestDigest: string,
  requestText: string,
): Promise<ExternalRunnerResponseEnvelope> {
  const config = normalizeSubscriptionConfig(value);
  const request = parseRequestEnvelope(requestText, config.profile);
  const accepted = await prepareAcceptedRun(config, adapterPath, acceptedManifestDigest);
  return withPrivateDirectory((cwd) =>
    runInspectedRequest(accepted.config, accepted.manifest, request, cwd),
  );
}

async function prepareAcceptedRun(
  config: NormalizedSubscriptionRunnerConfig,
  adapterPath: string,
  acceptedDigest: string,
) {
  const profile = subscriptionProfile(config.profile);
  profile.validateConfig(config);
  const dependencies = await resolveInspectionDependencies(config, profile, adapterPath);
  return inspectAcceptedRun(config, profile, dependencies, acceptedDigest);
}

async function inspectAcceptedRun(
  config: NormalizedSubscriptionRunnerConfig,
  profile: SubscriptionCliProfile,
  dependencies: InspectionDependencies,
  acceptedDigest: string,
) {
  assertAcceptedManifest(expectedManifest(config, profile, dependencies), acceptedDigest);
  const manifest = await withPrivateDirectory((cwd) =>
    inspectResolvedTarget(config, profile, dependencies, cwd),
  );
  assertAcceptedManifest(manifest, acceptedDigest);
  return { config, manifest };
}

function expectedManifest(
  config: NormalizedSubscriptionRunnerConfig,
  profile: SubscriptionCliProfile,
  dependencies: InspectionDependencies,
): SubscriptionRunnerManifest {
  return buildSubscriptionManifest({
    ...dependencies,
    profile,
    config,
    targetVersion: profile.auditedTargetVersion,
    auth: profile.expectedAuth,
  });
}

function normalizeSubscriptionConfig(
  value: SubscriptionRunnerConfig,
): NormalizedSubscriptionRunnerConfig {
  if (!isRecord(value) || !subscriptionProfileIds.includes(value.profile)) {
    throw new Error("Subscription runner profile is invalid");
  }
  if (!subscriptionLaunchers.includes(value.launcher) || !safeModel(value.model)) {
    throw new Error("Subscription runner launcher or model is invalid");
  }
  if (value.reasoningEffort !== undefined && !reasoningEfforts.includes(value.reasoningEffort)) {
    throw new Error("Subscription runner reasoning effort is invalid");
  }
  return { ...value, targetTimeoutMs: normalizedTimeout(value.targetTimeoutMs) };
}

function normalizedTimeout(value?: number): number {
  const timeout = value ?? defaultTargetTimeoutMs;
  if (!Number.isSafeInteger(timeout) || timeout <= 0 || timeout > maximumTargetTimeoutMs) {
    throw new Error("Subscription runner timeout must be between 1 and 600000");
  }
  return timeout;
}

function subscriptionProfile(id: string): SubscriptionCliProfile {
  const profile = profiles.find((candidate) => candidate.id === id);
  if (profile === undefined) {
    throw new Error("Subscription runner profile is not supported");
  }
  return profile;
}

async function inspectTargetVersion(
  profile: SubscriptionCliProfile,
  context: TargetProcessContext,
): Promise<string> {
  const stdout = await invokeSubscriptionTarget(context, {
    args: profile.versionArgs,
    timeoutMs: Math.min(context.config.targetTimeoutMs, 10_000),
  });
  if (!exactLine(stdout, profile.auditedTargetVersion)) {
    throw new Error("Subscription target version has not been audited");
  }
  return profile.auditedTargetVersion;
}

async function inspectTargetAuth(profile: SubscriptionCliProfile, context: TargetProcessContext) {
  const stdout = await invokeSubscriptionTarget(context, {
    args: profile.authArgs,
    timeoutMs: Math.min(context.config.targetTimeoutMs, 10_000),
  });
  return profile.parseAuth(stdout);
}

async function runProfileChecks(
  profile: SubscriptionCliProfile,
  context: TargetProcessContext,
): Promise<void> {
  for (const check of profile.checks(context.config)) {
    const stdout = await invokeSubscriptionTarget(context, {
      args: check.args,
      timeoutMs: Math.min(context.config.targetTimeoutMs, 10_000),
    });
    check.validate(stdout);
  }
}

async function runInspectedRequest(
  config: NormalizedSubscriptionRunnerConfig,
  manifest: SubscriptionRunnerManifest,
  request: ExternalRunnerRequestEnvelope,
  cwd: string,
): Promise<ExternalRunnerResponseEnvelope> {
  const profile = subscriptionProfile(config.profile);
  await assertRuntimeIntegrity(config, manifest, profile);
  const plan = await targetRunPlan(config, manifest, request.request, cwd);
  const stdout = await invokeSubscriptionTarget(plan.context, {
    args: plan.args,
    input: request.request.messages[0]?.content ?? "",
  });
  return responseEnvelope(request.requestId, JSON.stringify(plan.profile.parseRunOutput(stdout)));
}

async function assertRuntimeIntegrity(
  config: NormalizedSubscriptionRunnerConfig,
  manifest: SubscriptionRunnerManifest,
  profile: SubscriptionCliProfile,
): Promise<void> {
  const files = [
    manifest.adapter,
    manifest.target,
    ...(manifest.launcher.executable === undefined ? [] : [manifest.launcher.executable]),
  ];
  const [state] = await Promise.all([
    resolveStateDirectory(config.stateDir, profile),
    ...files.map(assertFileDigest),
  ]);
  if (
    state.requestedPath !== manifest.state.requestedPath ||
    state.realpath !== manifest.state.realpath
  ) {
    throw new Error("Subscription runner state directory changed after inspection");
  }
}

async function targetRunPlan(
  config: NormalizedSubscriptionRunnerConfig,
  manifest: SubscriptionRunnerManifest,
  request: ModelRequest,
  cwd: string,
) {
  const profile = subscriptionProfile(config.profile);
  const schemaJson = responseSchemaJson(request);
  const schemaPath = await writeResponseSchema(cwd, schemaJson);
  return {
    profile,
    context: targetContext(config, manifest, cwd),
    args: profile.runArgs({ config, cwd, schemaJson, schemaPath }),
  };
}

function targetContext(
  config: NormalizedSubscriptionRunnerConfig,
  manifest: SubscriptionRunnerManifest,
  cwd: string,
): TargetProcessContext {
  return {
    config,
    target: manifest.target,
    stateRealpath: manifest.state.realpath,
    cwd,
  };
}

function parseRequestEnvelope(text: string, profileId: string): ExternalRunnerRequestEnvelope {
  const value = parseJson(text, "request");
  if (
    !isRecord(value) ||
    !exactKeys(value, ["protocol", "version", "requestId", "request", "profile"])
  ) {
    throw new Error("Subscription runner request contains unknown or missing fields");
  }
  const request = strictModelRequest(value.request);
  const profile = strictModelProfile(value.profile);
  assertRequestBinding(value, request, profileId);
  return { ...value, request, profile } as unknown as ExternalRunnerRequestEnvelope;
}

function strictModelRequest(value: unknown): ModelRequest {
  if (!isRecord(value) || !exactKeys(value, ["task", "messages", "responseFormat"])) {
    throw new Error("Subscription runner model request is invalid");
  }
  const request = modelRequestSchema.parse(value);
  if (
    request.task !== "reasoning" ||
    request.messages.length !== 1 ||
    !exactMessage(request.messages[0])
  ) {
    throw new Error("Subscription runner requires one reasoning user message");
  }
  return request;
}

function strictModelProfile(value: unknown) {
  if (!isRecord(value) || !exactKeys(value, ["task", "kind", "provider"])) {
    throw new Error("Subscription runner model profile is invalid");
  }
  return modelProfileSchema.parse(value);
}

function assertRequestBinding(
  value: Record<string, unknown>,
  request: ModelRequest,
  profileId: string,
): void {
  const profile = strictModelProfile(value.profile);
  if (
    value.protocol !== externalRunnerProtocol ||
    value.version !== externalRunnerProtocolVersion ||
    !oneLine(value.requestId) ||
    profile.task !== "reasoning" ||
    profile.kind !== "external-runner" ||
    profile.provider !== `subscription-${profileId}` ||
    request.responseFormat === undefined
  ) {
    throw new Error("Subscription runner request does not match its profile");
  }
}

function exactMessage(value: unknown): boolean {
  return (
    isRecord(value) &&
    exactKeys(value, ["role", "content"]) &&
    value.role === "user" &&
    typeof value.content === "string"
  );
}

function responseSchemaJson(request: ModelRequest): string {
  const json = JSON.stringify(request.responseFormat?.schema);
  if (json === undefined || Buffer.byteLength(json, "utf8") > maxSchemaBytes) {
    throw new Error("Subscription runner response schema is invalid or too large");
  }
  return json;
}

async function writeResponseSchema(cwd: string, json: string): Promise<string> {
  const path = join(cwd, "response.schema.json");
  const handle = await open(path, "wx", 0o600);
  try {
    await handle.writeFile(`${json}\n`, "utf8");
  } finally {
    await handle.close();
  }
  return path;
}

async function withPrivateDirectory<T>(run: (cwd: string) => Promise<T> | T): Promise<T> {
  const cwd = await mkdtemp(join(tmpdir(), "ai-lab-subscription-runner-"));
  try {
    await chmod(cwd, 0o700);
    await Promise.all([
      mkdir(join(cwd, "home"), { mode: 0o700 }),
      mkdir(join(cwd, "state"), { mode: 0o700 }),
    ]);
    return await run(cwd);
  } finally {
    await rm(cwd, { recursive: true, force: true });
  }
}

function assertAcceptedManifest(manifest: SubscriptionRunnerManifest, accepted: string): void {
  if (!/^[a-f0-9]{64}$/.test(accepted) || manifest.digest !== accepted) {
    throw new Error("Subscription runner manifest digest was not accepted");
  }
}

function responseEnvelope(requestId: string, output: string): ExternalRunnerResponseEnvelope {
  return {
    protocol: externalRunnerProtocol,
    version: externalRunnerProtocolVersion,
    requestId,
    output,
  };
}

function exactLine(value: string, expected: string): boolean {
  return value === expected || value === `${expected}\n` || value === `${expected}\r\n`;
}

function safeModel(value: unknown): value is string {
  return typeof value === "string" && /^[A-Za-z0-9][A-Za-z0-9._:/-]{0,127}$/.test(value);
}

function oneLine(value: unknown): value is string {
  return (
    typeof value === "string" && value.length > 0 && value.length <= 500 && !/[\r\n]/.test(value)
  );
}

function parseJson(value: string, label: string): unknown {
  try {
    return JSON.parse(value);
  } catch {
    throw new Error(`Subscription runner ${label} is malformed JSON`);
  }
}

function exactKeys(value: Record<string, unknown>, keys: readonly string[]): boolean {
  return JSON.stringify(Object.keys(value).sort()) === JSON.stringify([...keys].sort());
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
