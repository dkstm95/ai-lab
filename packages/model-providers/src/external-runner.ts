import { type ChildProcessWithoutNullStreams, spawn } from "node:child_process";
import { createHash, randomUUID } from "node:crypto";
import { constants, type Stats } from "node:fs";
import { chmod, lstat, mkdtemp, open, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { isAbsolute, join } from "node:path";
import {
  type ModelProfile,
  type ModelRequest,
  type ModelResponse,
  modelProfileSchema,
  modelRequestSchema,
} from "@ai-lab/protocol";
import type { ModelProvider } from "./index.js";

export const externalRunnerProtocol = "ai-lab.external-runner";
export const externalRunnerProtocolVersion = 1;

export interface ExternalRunnerConfig {
  readonly provider: string;
  readonly executable: string;
  readonly executableSha256: string;
  readonly args: readonly string[];
  readonly envAllowlist: readonly string[];
  readonly trustedFiles: readonly ExternalRunnerTrustedFile[];
  readonly timeoutMs?: number;
  readonly maxRequestBytes?: number;
  readonly maxStdoutBytes?: number;
  readonly maxStderrBytes?: number;
}

export interface ExternalRunnerTrustedFile {
  readonly path: string;
  readonly sha256: string;
}

export interface ExternalRunnerRequestEnvelope {
  readonly protocol: typeof externalRunnerProtocol;
  readonly version: typeof externalRunnerProtocolVersion;
  readonly requestId: string;
  readonly request: ModelRequest;
  readonly profile: ModelProfile;
}

export interface ExternalRunnerResponseEnvelope {
  readonly protocol: typeof externalRunnerProtocol;
  readonly version: typeof externalRunnerProtocolVersion;
  readonly requestId: string;
  readonly output: string;
}

interface NormalizedRunnerConfig {
  readonly provider: string;
  readonly executable: string;
  readonly executableSha256: string;
  readonly args: readonly string[];
  readonly envAllowlist: readonly string[];
  readonly trustedFiles: readonly ExternalRunnerTrustedFile[];
  readonly timeoutMs: number;
  readonly maxRequestBytes: number;
  readonly maxStdoutBytes: number;
  readonly maxStderrBytes: number;
}

interface ProcessOutput {
  readonly stdout: Buffer;
  readonly code: number | null;
  readonly signal: NodeJS.Signals | null;
}

interface ProcessExit {
  readonly code: number | null;
  readonly signal: NodeJS.Signals | null;
}

interface ProcessCompletion {
  readonly resolve: (value: ProcessOutput) => void;
  readonly reject: (error: Error) => void;
}

type SpawnRunner = (cwd: string) => ChildProcessWithoutNullStreams;

interface CaptureState {
  readonly stdout: Buffer[];
  readonly stderr: Buffer[];
  stdoutBytes: number;
  stderrBytes: number;
  failure?: Error;
  hardSettle?: NodeJS.Timeout;
  abortCleanup: (() => void) | undefined;
}

const defaults = {
  timeoutMs: 120_000,
  maxRequestBytes: 1_100_000,
  maxStdoutBytes: 1_100_000,
  maxStderrBytes: 65_536,
};
const maximums = {
  timeoutMs: 600_000,
  maxRequestBytes: 16_777_216,
  maxStdoutBytes: 16_777_216,
  maxStderrBytes: 16_777_216,
};
const hardSettleMs = 250;
const configKeys = [
  "provider",
  "executable",
  "executableSha256",
  "args",
  "envAllowlist",
  "trustedFiles",
  "timeoutMs",
  "maxRequestBytes",
  "maxStdoutBytes",
  "maxStderrBytes",
];
const requiredConfigKeys = [
  "provider",
  "executable",
  "executableSha256",
  "args",
  "envAllowlist",
  "trustedFiles",
];

/**
 * Runs only explicitly trusted executables. Process cwd and environment isolation
 * reduce accidental leakage but do not sandbox the runner from same-user files,
 * processes, credentials, or network access.
 */
export class ExternalRunnerModelProvider implements ModelProvider {
  readonly kind = "external-runner";
  readonly provider: string;
  private readonly config: NormalizedRunnerConfig;

  constructor(config: ExternalRunnerConfig) {
    this.config = normalizeConfig(config);
    this.provider = this.config.provider;
  }

  async generate(
    requestValue: ModelRequest,
    profileValue: ModelProfile,
    signal?: AbortSignal,
  ): Promise<ModelResponse> {
    assertNotAborted(signal);
    const profile = boundProfile(profileValue, this.provider);
    const envelope = requestEnvelope(modelRequestSchema.parse(requestValue), profile);
    const response = await invokeRunner(
      this.config,
      envelope,
      (cwd) => this.spawnRunner(cwd),
      signal,
    );
    return hostResponse(profile, response);
  }

  protected spawnRunner(cwd: string): ChildProcessWithoutNullStreams {
    return spawn(this.config.executable, this.config.args, {
      cwd,
      env: allowedEnvironment(this.config.envAllowlist),
      shell: false,
      stdio: ["pipe", "pipe", "pipe"],
      windowsHide: true,
      detached: process.platform !== "win32",
    });
  }
}

async function invokeRunner(
  config: NormalizedRunnerConfig,
  envelope: ExternalRunnerRequestEnvelope,
  spawnRunner: SpawnRunner,
  signal?: AbortSignal,
): Promise<ExternalRunnerResponseEnvelope> {
  const request = encodeRequest(envelope, config.maxRequestBytes);
  const output = await executeRunner(config, request, spawnRunner, signal);
  return parseResponse(output.stdout, envelope.requestId);
}

function normalizeConfig(config: ExternalRunnerConfig): NormalizedRunnerConfig {
  assertConfigKeys(config);
  if (
    !runnerId(config.provider) ||
    !isAbsolute(config.executable) ||
    hasNull(config.executable) ||
    /[\r\n]/.test(config.executable)
  ) {
    throw new Error("External runner requires a provider id and absolute executable");
  }
  const normalized = {
    provider: config.provider,
    executable: config.executable,
    executableSha256: sha256Digest(config.executableSha256, "executable"),
    args: staticArgs(config.args),
    envAllowlist: environmentNames(config.envAllowlist),
    trustedFiles: trustedFiles(config.trustedFiles, config.executable),
    ...normalizedLimits(config),
  };
  return Object.freeze(normalized);
}

function normalizedLimits(config: ExternalRunnerConfig) {
  return {
    timeoutMs: boundedLimit(config.timeoutMs, defaults.timeoutMs, maximums.timeoutMs, "timeout"),
    maxRequestBytes: boundedLimit(
      config.maxRequestBytes,
      defaults.maxRequestBytes,
      maximums.maxRequestBytes,
      "request",
    ),
    maxStdoutBytes: boundedLimit(
      config.maxStdoutBytes,
      defaults.maxStdoutBytes,
      maximums.maxStdoutBytes,
      "stdout",
    ),
    maxStderrBytes: boundedLimit(
      config.maxStderrBytes,
      defaults.maxStderrBytes,
      maximums.maxStderrBytes,
      "stderr",
    ),
  };
}

function assertConfigKeys(config: ExternalRunnerConfig): void {
  if (
    !isRecord(config) ||
    Object.keys(config).some((key) => !configKeys.includes(key)) ||
    requiredConfigKeys.some((key) => !Object.hasOwn(config, key))
  ) {
    throw new Error("External runner config contains unknown or missing fields");
  }
}

function staticArgs(value: readonly string[]): readonly string[] {
  if (!Array.isArray(value) || value.some((arg) => typeof arg !== "string" || hasNull(arg))) {
    throw new Error("External runner args must be a static string array");
  }
  return Object.freeze([...value]);
}

function trustedFiles(
  value: readonly ExternalRunnerTrustedFile[],
  executable: string,
): readonly ExternalRunnerTrustedFile[] {
  if (!Array.isArray(value)) {
    throw new Error("External runner trustedFiles must be an array");
  }
  const normalized = value.map((file) => {
    if (!isRecord(file) || !exactKeys(file, ["path", "sha256"])) {
      throw new Error("External runner trusted file contains unknown or missing fields");
    }
    const path = runnerFilePath(file.path, "trusted file");
    return Object.freeze({ path, sha256: sha256Digest(file.sha256, "trusted file") });
  });
  const paths = normalized.map((file) => file.path);
  if (new Set(paths).size !== paths.length || paths.includes(executable)) {
    throw new Error("External runner trusted file paths must be unique and exclude the executable");
  }
  return Object.freeze(normalized.sort((left, right) => left.path.localeCompare(right.path)));
}

function runnerFilePath(value: unknown, label: string): string {
  if (typeof value !== "string" || !isAbsolute(value) || hasNull(value) || /[\r\n]/.test(value)) {
    throw new Error(`External runner ${label} path must be absolute`);
  }
  return value;
}

function sha256Digest(value: unknown, label: string): string {
  if (typeof value !== "string" || !/^[a-f0-9]{64}$/.test(value)) {
    throw new Error(`External runner ${label} SHA-256 must be 64 lowercase hex characters`);
  }
  return value;
}

function environmentNames(value: readonly string[]): readonly string[] {
  if (
    !Array.isArray(value) ||
    new Set(value).size !== value.length ||
    value.some(
      (name) =>
        typeof name !== "string" ||
        !/^[A-Za-z_][A-Za-z0-9_]*$/.test(name) ||
        blockedEnvironmentName(name),
    )
  ) {
    throw new Error("External runner envAllowlist contains an invalid or sensitive name");
  }
  return Object.freeze([...value]);
}

function blockedEnvironmentName(name: string): boolean {
  return [
    /(^|_)PATH$/i,
    /^NODE_OPTIONS$/i,
    /^(DYLD|LD)/i,
    /(API.*KEY|TOKEN|SECRET|PASSWORD|CREDENTIAL)/i,
    /^SSH/i,
    /PROXY/i,
    /^(AWS|AZURE|GCP|GCLOUD|GOOGLE|CLOUD|CLOUDFLARE|KUBE|OCI|DIGITALOCEAN|HEROKU|VERCEL|NETLIFY)/i,
    /^(GITHUB|GH_)/i,
    /^(BASH_ENV|ENV|SHELLOPTS|JAVA_TOOL_OPTIONS|JDK_JAVA_OPTIONS|_JAVA_OPTIONS)$/i,
    /^(RUBYOPT|RUBYLIB|PERL5OPT|PERL5LIB|PYTHONPATH|PYTHONHOME|PYTHONSTARTUP)$/i,
    /^GIT_CONFIG/i,
    /^(NPM_CONFIG|YARN_|PNPM_)/i,
  ].some((pattern) => pattern.test(name));
}

function boundedLimit(
  value: number | undefined,
  fallback: number,
  maximum: number,
  label: string,
): number {
  const limit = value ?? fallback;
  if (!Number.isSafeInteger(limit) || limit <= 0 || limit > maximum) {
    throw new Error(`External runner ${label} limit must be between 1 and ${maximum}`);
  }
  return limit;
}

function boundProfile(value: ModelProfile, provider: string): ModelProfile {
  const profile = modelProfileSchema.parse(value);
  if (profile.kind !== "external-runner" || profile.provider !== provider) {
    throw new Error(`External runner profile must target external-runner:${provider}`);
  }
  return profile;
}

function requestEnvelope(
  request: ModelRequest,
  profile: ModelProfile,
): ExternalRunnerRequestEnvelope {
  return {
    protocol: externalRunnerProtocol,
    version: externalRunnerProtocolVersion,
    requestId: randomUUID(),
    request,
    profile,
  };
}

function encodeRequest(envelope: ExternalRunnerRequestEnvelope, maxBytes: number): Buffer {
  const encoded = Buffer.from(`${JSON.stringify(envelope)}\n`, "utf8");
  if (encoded.length > maxBytes) {
    throw new Error(`External runner request exceeds ${maxBytes} bytes`);
  }
  return encoded;
}

async function executeRunner(
  config: NormalizedRunnerConfig,
  request: Buffer,
  spawnRunner: SpawnRunner,
  signal?: AbortSignal,
): Promise<ProcessOutput> {
  assertNotAborted(signal);
  const cwd = await mkdtemp(join(tmpdir(), "ai-lab-runner-"));
  try {
    await chmod(cwd, 0o700);
    assertNotAborted(signal);
    await verifyRunnerIntegrity(config, signal);
    assertNotAborted(signal);
    return await observeChild(spawnRunner(cwd), config, request, signal);
  } finally {
    await rm(cwd, { recursive: true, force: true });
  }
}

async function verifyRunnerIntegrity(
  config: NormalizedRunnerConfig,
  signal?: AbortSignal,
): Promise<void> {
  // Node has no portable fexecve. Hashing the executable last minimizes, but cannot
  // remove, the same-user check-to-spawn race at this trusted process boundary.
  for (const file of config.trustedFiles) {
    await verifyRunnerFile(file, "trusted file", signal);
  }
  await verifyRunnerFile(
    { path: config.executable, sha256: config.executableSha256 },
    "executable",
    signal,
  );
}

async function verifyRunnerFile(
  file: ExternalRunnerTrustedFile,
  label: string,
  signal?: AbortSignal,
): Promise<void> {
  const actual = await externalRunnerFileSha256(file.path, signal);
  if (actual !== file.sha256) {
    throw new Error(`External runner ${label} SHA-256 mismatch: ${file.path}`);
  }
}

export async function externalRunnerFileSha256(
  pathValue: string,
  signal?: AbortSignal,
): Promise<string> {
  assertNotAborted(signal);
  const path = runnerFilePath(pathValue, "integrity file");
  const handle = await openIntegrityFile(path);
  try {
    const before = await handle.stat();
    if (!before.isFile() || unsafeWritableMode(before.mode)) {
      throw new Error(`External runner integrity path is not a safe regular file: ${path}`);
    }
    const digest = await hashFileHandle(handle, signal);
    const [after, current] = await Promise.all([handle.stat(), lstat(path)]);
    if (!sameStableFile(before, after, current)) {
      throw new Error(`External runner integrity file changed while hashing: ${path}`);
    }
    return digest;
  } finally {
    await handle.close();
  }
}

async function openIntegrityFile(path: string) {
  const flags = constants.O_RDONLY | constants.O_NOFOLLOW | constants.O_NONBLOCK;
  return open(path, flags).catch((error: unknown) => {
    throw new Error(`External runner integrity file could not be opened: ${path}`, {
      cause: error,
    });
  });
}

async function hashFileHandle(
  handle: Awaited<ReturnType<typeof open>>,
  signal?: AbortSignal,
): Promise<string> {
  const hash = createHash("sha256");
  const buffer = Buffer.allocUnsafe(64 * 1024);
  let position = 0;
  while (true) {
    assertNotAborted(signal);
    const { bytesRead } = await handle.read(buffer, 0, buffer.length, position);
    if (bytesRead === 0) break;
    hash.update(buffer.subarray(0, bytesRead));
    position += bytesRead;
  }
  return hash.digest("hex");
}

function sameStableFile(before: Stats, after: Stats, current: Stats): boolean {
  return (
    after.isFile() &&
    current.isFile() &&
    !current.isSymbolicLink() &&
    before.dev === after.dev &&
    before.ino === after.ino &&
    before.size === after.size &&
    before.mtimeMs === after.mtimeMs &&
    before.ctimeMs === after.ctimeMs &&
    before.mode === after.mode &&
    after.dev === current.dev &&
    after.ino === current.ino &&
    after.size === current.size &&
    after.mtimeMs === current.mtimeMs &&
    after.ctimeMs === current.ctimeMs &&
    after.mode === current.mode
  );
}

function unsafeWritableMode(mode: number): boolean {
  return process.platform !== "win32" && (mode & 0o022) !== 0;
}

function allowedEnvironment(names: readonly string[]): NodeJS.ProcessEnv {
  const environment = Object.create(null) as NodeJS.ProcessEnv;
  for (const name of names) {
    if (process.env[name] !== undefined) {
      environment[name] = process.env[name];
    }
  }
  return environment;
}

function observeChild(
  child: ChildProcessWithoutNullStreams,
  config: NormalizedRunnerConfig,
  request: Buffer,
  signal?: AbortSignal,
): Promise<ProcessOutput> {
  const state: CaptureState = {
    stdout: [],
    stderr: [],
    stdoutBytes: 0,
    stderrBytes: 0,
    abortCleanup: undefined,
  };
  return new Promise((resolve, reject) => {
    const completion = { resolve, reject };
    const fail = (error: Error) => failChild(child, state, completion, error);
    const timer = runnerTimer(config.timeoutMs, fail);
    state.abortCleanup = attachAbort(signal, fail);
    captureStream(child, state, { stream: "stdout", maxBytes: config.maxStdoutBytes }, fail);
    captureStream(child, state, { stream: "stderr", maxBytes: config.maxStderrBytes }, fail);
    child.once("error", (error) => rejectAfterTimer(timer, state, reject, error));
    child.once("close", (code, signal) => finishChild(timer, state, { code, signal }, completion));
    writeRequest(child, request, fail);
  });
}

function runnerTimer(timeoutMs: number, fail: (error: Error) => void): NodeJS.Timeout {
  const timer = setTimeout(() => {
    fail(new Error(`External runner timed out after ${timeoutMs}ms`));
  }, timeoutMs);
  timer.unref();
  return timer;
}

function captureStream(
  child: ChildProcessWithoutNullStreams,
  state: CaptureState,
  limit: { stream: "stdout" | "stderr"; maxBytes: number },
  fail: (error: Error) => void,
): void {
  const source = child[limit.stream];
  source.on("data", (value: Buffer | string) => {
    captureChunk(state, limit, fail, value);
  });
  source.once("error", () => {
    fail(new Error(`External runner ${limit.stream} stream failed`));
  });
}

function captureChunk(
  state: CaptureState,
  limit: { stream: "stdout" | "stderr"; maxBytes: number },
  fail: (error: Error) => void,
  value: Buffer | string,
): void {
  const chunk = Buffer.isBuffer(value) ? value : Buffer.from(value);
  const nextBytes = state[`${limit.stream}Bytes`] + chunk.length;
  if (nextBytes > limit.maxBytes) {
    fail(new Error(`External runner ${limit.stream} exceeds ${limit.maxBytes} bytes`));
    return;
  }
  state[`${limit.stream}Bytes`] = nextBytes;
  state[limit.stream].push(chunk);
}

function writeRequest(
  child: ChildProcessWithoutNullStreams,
  request: Buffer,
  fail: (error: Error) => void,
): void {
  child.stdin.once("error", (error: NodeJS.ErrnoException) => {
    if (error.code !== "EPIPE") {
      fail(new Error("External runner stdin failed"));
    }
  });
  child.stdin.end(request);
}

function failChild(
  child: ChildProcessWithoutNullStreams,
  state: CaptureState,
  completion: ProcessCompletion,
  error: Error,
): void {
  if (state.failure !== undefined) {
    return;
  }
  state.failure = error;
  terminateProcessGroup(child);
  closeChildPipes(child);
  state.hardSettle = setTimeout(() => {
    state.abortCleanup?.();
    completion.reject(error);
  }, hardSettleMs);
}

function terminateProcessGroup(child: ChildProcessWithoutNullStreams): void {
  if (process.platform !== "win32" && child.pid !== undefined) {
    try {
      process.kill(-child.pid, "SIGKILL");
      return;
    } catch {
      // Fall back to the direct child if its process group is already gone.
    }
  }
  child.kill("SIGKILL");
}

function closeChildPipes(child: ChildProcessWithoutNullStreams): void {
  child.stdin.destroy();
  child.stdout.destroy();
  child.stderr.destroy();
}

function finishChild(
  timer: NodeJS.Timeout,
  state: CaptureState,
  exit: ProcessExit,
  completion: ProcessCompletion,
): void {
  clearTimeout(timer);
  clearTimeout(state.hardSettle);
  state.abortCleanup?.();
  const error = state.failure ?? processExitError(exit.code, exit.signal);
  if (error !== undefined) {
    completion.reject(error);
    return;
  }
  completion.resolve({
    stdout: Buffer.concat(state.stdout),
    ...exit,
  });
}

function rejectAfterTimer(
  timer: NodeJS.Timeout,
  state: CaptureState,
  reject: (error: Error) => void,
  error: Error,
): void {
  clearTimeout(timer);
  state.abortCleanup?.();
  reject(new Error(`External runner failed to start: ${error.message}`));
}

function attachAbort(
  signal: AbortSignal | undefined,
  fail: (error: Error) => void,
): (() => void) | undefined {
  if (signal === undefined) {
    return undefined;
  }
  const onAbort = () => fail(abortError());
  signal.addEventListener("abort", onAbort, { once: true });
  if (signal.aborted) {
    onAbort();
  }
  return () => signal.removeEventListener("abort", onAbort);
}

function assertNotAborted(signal?: AbortSignal): void {
  if (signal?.aborted) {
    throw abortError();
  }
}

function abortError(): Error {
  const error = new Error("External runner aborted");
  error.name = "AbortError";
  return error;
}

function processExitError(code: number | null, signal: NodeJS.Signals | null): Error | undefined {
  if (signal !== null) {
    return new Error(`External runner terminated by signal ${signal}`);
  }
  return code === 0 ? undefined : new Error(`External runner exited with code ${String(code)}`);
}

function parseResponse(stdout: Buffer, requestId: string): ExternalRunnerResponseEnvelope {
  const text = decodeUtf8(stdout);
  let value: unknown;
  try {
    value = JSON.parse(text);
  } catch {
    throw new Error("External runner returned malformed JSON");
  }
  return strictResponse(value, requestId);
}

function decodeUtf8(value: Buffer): string {
  try {
    return new TextDecoder("utf-8", { fatal: true }).decode(value);
  } catch {
    throw new Error("External runner stdout is not valid UTF-8");
  }
}

function strictResponse(value: unknown, requestId: string): ExternalRunnerResponseEnvelope {
  if (!isRecord(value) || !exactKeys(value, ["protocol", "version", "requestId", "output"])) {
    throw new Error("External runner response contains unknown or missing fields");
  }
  if (
    value.protocol !== externalRunnerProtocol ||
    value.version !== externalRunnerProtocolVersion ||
    value.requestId !== requestId ||
    typeof value.output !== "string"
  ) {
    throw new Error("External runner response does not match its request");
  }
  return value as unknown as ExternalRunnerResponseEnvelope;
}

function hostResponse(
  profile: ModelProfile,
  response: ExternalRunnerResponseEnvelope,
): ModelResponse {
  return {
    profile,
    output: response.output,
    metadata: {
      transport: "external-runner",
      protocol: externalRunnerProtocol,
      protocolVersion: externalRunnerProtocolVersion,
      requestId: response.requestId,
    },
  };
}

function exactKeys(value: Record<string, unknown>, keys: readonly string[]): boolean {
  return JSON.stringify(Object.keys(value).sort()) === JSON.stringify([...keys].sort());
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function runnerId(value: unknown): value is string {
  return typeof value === "string" && /^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/.test(value);
}

function hasNull(value: string): boolean {
  return value.includes("\0");
}
