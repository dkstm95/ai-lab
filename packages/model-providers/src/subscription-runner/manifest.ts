import { createHash } from "node:crypto";
import { constants, createReadStream } from "node:fs";
import { access, lstat, readdir, realpath, stat } from "node:fs/promises";
import { isAbsolute } from "node:path";
import type { TargetFile } from "./process.js";
import type {
  NormalizedSubscriptionRunnerConfig,
  SubscriptionAuth,
  SubscriptionCliProfile,
} from "./profile.js";

export const subscriptionRunnerManifestVersion = "ai-lab.subscription-runner-manifest.v1";
export const subscriptionRunnerVersion = "1";

export interface SubscriptionRunnerManifest {
  readonly schemaVersion: typeof subscriptionRunnerManifestVersion;
  readonly adapter: FileIdentity & { readonly version: string };
  readonly profile: { readonly id: string; readonly version: string };
  readonly target: TargetFile & { readonly version: string };
  readonly launcher: LauncherIdentity;
  readonly model: { readonly id: string; readonly reasoningEffort?: string };
  readonly auth: SubscriptionAuth;
  readonly state: StateIdentity;
  readonly policy: SubscriptionCliProfile["policy"];
  readonly limits: { readonly targetTimeoutMs: number; readonly maxOutputBytes: number };
  readonly responseFormat: "requested-json-schema-host-validated";
  readonly digest: string;
}

interface FileIdentity {
  readonly requestedPath: string;
  readonly realpath: string;
  readonly sha256: string;
}

interface LauncherIdentity {
  readonly kind: string;
  readonly executable?: FileIdentity & { readonly version: string };
}

interface StateIdentity {
  readonly requestedPath: string;
  readonly realpath: string;
  readonly environmentName: string;
  readonly access: "read-write";
  readonly forbiddenEntriesChecked: readonly string[];
}

interface ManifestInput {
  readonly adapter: FileIdentity;
  readonly profile: SubscriptionCliProfile;
  readonly config: NormalizedSubscriptionRunnerConfig;
  readonly target: TargetFile;
  readonly targetVersion: string;
  readonly auth: SubscriptionAuth;
  readonly state: StateIdentity;
  readonly launcher: LauncherIdentity;
}

type SubscriptionRunnerManifestCore = Omit<SubscriptionRunnerManifest, "digest">;

const maxOutputBytes = 1_100_000;

export async function resolveRunnerFile(path: string, executable: boolean): Promise<TargetFile> {
  assertAbsolutePath(path, "file");
  const resolved = await realpath(path);
  const info = await stat(resolved);
  if (!info.isFile() || unsafeWritableMode(info.mode)) {
    throw new Error("Subscription runner path must be a safe regular file");
  }
  await access(resolved, executable ? constants.X_OK : constants.R_OK);
  return { requestedPath: path, realpath: resolved, sha256: await sha256File(resolved) };
}

export async function resolveStateDirectory(
  path: string,
  profile: SubscriptionCliProfile,
): Promise<StateIdentity> {
  if (process.platform === "win32") {
    throw new Error("Subscription runner cannot verify private state ACLs on Windows");
  }
  assertAbsolutePath(path, "state directory");
  const resolved = await realpath(path);
  const info = await lstat(resolved);
  if (!info.isDirectory() || (info.mode & 0o077) !== 0) {
    throw new Error("Subscription state directory must be a private directory");
  }
  await assertForbiddenEntriesAbsent(resolved, profile.forbiddenStateEntries);
  return {
    requestedPath: path,
    realpath: resolved,
    environmentName: profile.stateEnvironmentName,
    access: "read-write",
    forbiddenEntriesChecked: profile.forbiddenStateEntries,
  };
}

export async function resolveLauncher(kind: string): Promise<LauncherIdentity> {
  if (kind === "native") {
    return { kind };
  }
  const executable = await resolveRunnerFile(process.execPath, true);
  return { kind, executable: { ...executable, version: process.version } };
}

export function buildSubscriptionManifest(input: ManifestInput): SubscriptionRunnerManifest {
  const core = manifestCore(input);
  return { ...core, digest: sha256Text(canonicalJson(core)) };
}

export async function assertFileDigest(file: TargetFile): Promise<void> {
  if ((await sha256File(file.realpath)) !== file.sha256) {
    throw new Error("Subscription runner file changed after inspection");
  }
}

function manifestCore(input: ManifestInput): SubscriptionRunnerManifestCore {
  const model = {
    id: input.config.model,
    ...(input.config.reasoningEffort === undefined
      ? {}
      : { reasoningEffort: input.config.reasoningEffort }),
  };
  return {
    schemaVersion: subscriptionRunnerManifestVersion,
    adapter: { ...input.adapter, version: subscriptionRunnerVersion },
    profile: { id: input.profile.id, version: input.profile.profileVersion },
    target: { ...input.target, version: input.targetVersion },
    launcher: input.launcher,
    model,
    auth: input.auth,
    state: input.state,
    policy: input.profile.policy,
    limits: { targetTimeoutMs: input.config.targetTimeoutMs, maxOutputBytes },
    responseFormat: "requested-json-schema-host-validated" as const,
  };
}

async function assertForbiddenEntriesAbsent(
  directory: string,
  forbidden: readonly string[],
): Promise<void> {
  const entries = new Set((await readdir(directory)).map((entry) => entry.toLowerCase()));
  if (forbidden.some((entry) => entries.has(entry.toLowerCase()))) {
    throw new Error("Subscription state directory contains executable instructions or settings");
  }
}

async function sha256File(path: string): Promise<string> {
  const hash = createHash("sha256");
  for await (const chunk of createReadStream(path)) {
    hash.update(chunk as Buffer);
  }
  return hash.digest("hex");
}

function assertAbsolutePath(value: string, label: string): void {
  if (!isAbsolute(value) || value.includes("\0") || /[\r\n]/.test(value)) {
    throw new Error(`Subscription runner ${label} must be an absolute path`);
  }
}

function unsafeWritableMode(mode: number): boolean {
  return process.platform !== "win32" && (mode & 0o022) !== 0;
}

function canonicalJson(value: unknown): string {
  return JSON.stringify(canonicalValue(value));
}

function canonicalValue(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map(canonicalValue);
  }
  if (typeof value !== "object" || value === null) {
    return value;
  }
  return Object.fromEntries(
    Object.entries(value)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, child]) => [key, canonicalValue(child)]),
  );
}

function sha256Text(value: string): string {
  return createHash("sha256").update(value, "utf8").digest("hex");
}
