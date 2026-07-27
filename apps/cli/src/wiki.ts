import { createHash } from "node:crypto";
import { constants, type Stats } from "node:fs";
import { type FileHandle, lstat, mkdir, open, unlink } from "node:fs/promises";
import { isAbsolute, join } from "node:path";
import { TextDecoder } from "node:util";
import {
  type ExternalRunnerConfig,
  type WikiAnswerRunnerResult,
  type WikiAnswerTask,
  WikiAnswerWorkflow,
  WikiMemoryWorkflow,
  type WikiProposal,
  type WikiRebuildReport,
  WikiRebuildWorkflow,
  type WikiReflectionReport,
  WikiReflectionWorkflow,
  externalRunnerFileSha256,
} from "@ai-lab/agent-runtime";
import { createDefaultWorkspace, createWorkspace } from "@ai-lab/workspace";
import type { CAC } from "cac";

interface SourceOptions {
  readonly title?: string;
}

interface TaskOptions {
  readonly input?: string;
  readonly out?: string;
  readonly sources?: string;
  readonly title?: string;
}

interface ProposeOptions {
  readonly out?: string;
  readonly result?: string;
  readonly task?: string;
}

interface ApplyOptions {
  readonly acceptDigest?: string;
  readonly reviewer?: string;
}

interface RebuildApplyOptions extends ApplyOptions, ProposeOptions {}

interface RunnerOptions {
  readonly acceptRunnerDigest?: string;
  readonly acceptTaskDigest?: string;
  readonly runnerArgsJson?: string;
  readonly runnerEnv?: string;
  readonly runnerExecutable?: string;
  readonly runnerId?: string;
  readonly runnerTrustedFilesJson?: string;
  readonly runnerTimeoutMs?: number | string;
  readonly trustRunner?: string;
}

interface WikiCommandOptions
  extends SourceOptions,
    TaskOptions,
    ProposeOptions,
    ApplyOptions,
    RunnerOptions {}

interface ArtifactReservation {
  readonly handle: FileHandle;
  readonly path: string;
  readonly dev: number;
  readonly ino: number;
}

const maxArtifactBytes = 8_000_000;
const defaultRunnerTimeoutMs = 120_000;
const runnerConsentSchemaVersion = "ai-lab.external-runner-config.v2";
const runnerTerminationSignals: readonly NodeJS.Signals[] =
  process.platform === "win32" ? ["SIGINT", "SIGTERM"] : ["SIGINT", "SIGTERM", "SIGHUP"];

export function registerWikiCommands(cli: CAC, root?: string): void {
  cli
    .command("wiki [...args]", "Manage the local provider-neutral LLM Wiki")
    .option("--title <title>", "Human-readable source or page title")
    .option("--sources <ids>", "Comma-separated registered source ids")
    .option("--input <file>", "Private input artifact filename")
    .option("--out <file>", "Artifact filename under .ai-lab/wiki-exchange")
    .option("--task <file>", "Task artifact filename")
    .option("--result <file>", "AI result artifact filename")
    .option("--reviewer <name>", "Human reviewer identity")
    .option("--accept-digest <digest>", "Full reviewed proposal or report digest")
    .option("--runner-id <id>", "Explicit external runner id")
    .option("--runner-executable <path>", "Absolute external runner executable")
    .option("--runner-args-json <json>", "Static argument JSON array, default []")
    .option("--runner-env <names>", "Comma-separated environment name allowlist")
    .option("--runner-trusted-files-json <json>", "Trusted static file path JSON array")
    .option("--runner-timeout-ms <ms>", "External runner timeout in milliseconds")
    .option("--accept-task-digest <digest>", "Full disclosed task digest")
    .option("--accept-runner-digest <digest>", "Full disclosed runner config digest")
    .option("--trust-runner <id>", "Exact disclosed runner id")
    .action((args: string[], options: WikiCommandOptions) =>
      dispatchWikiCommand(root, args, options),
    );
}

async function dispatchWikiCommand(
  root: string | undefined,
  args: readonly string[],
  options: WikiCommandOptions,
): Promise<void> {
  const route = args.slice(0, 2).join(" ");
  if (route === "init" && args.length === 1) return initWikiCommand(root);
  if (route === "source add" && args.length === 3)
    return addSourceCommand(root, args[2] ?? "", options);
  if (route === "answer task" && args.length === 3)
    return answerTaskCommand(root, args[2] ?? "", options);
  if (route === "answer run" && args.length === 2) return answerRunCommand(root, options);
  if (route === "answer propose" && args.length === 2) return answerProposeCommand(root, options);
  if (route === "answer review" && args.length === 3)
    return answerReviewCommand(root, args[2] ?? "");
  if (route === "answer apply" && args.length === 3)
    return answerApplyCommand(root, args[2] ?? "", options);
  if (route.startsWith("rebuild ") || route.startsWith("reflect ") || route.startsWith("memory "))
    return dispatchWikiMaintenanceCommand(root, args, options);
  throw new Error(`Unknown wiki command: wiki ${args.join(" ")}`);
}

async function dispatchWikiMaintenanceCommand(
  root: string | undefined,
  args: readonly string[],
  options: WikiCommandOptions,
): Promise<void> {
  const route = args.slice(0, 2).join(" ");
  if (route === "rebuild task" && args.length === 2) return rebuildTaskCommand(root, options);
  if (route === "rebuild compare" && args.length === 2) return rebuildCompareCommand(root, options);
  if (route === "rebuild review" && args.length === 3)
    return rebuildReviewCommand(root, args[2] ?? "");
  if (route === "rebuild apply" && args.length === 3)
    return rebuildApplyCommand(root, args[2] ?? "", options);
  if (route === "reflect prepare" && args.length === 2)
    return reflectionPrepareCommand(root, options);
  if (route === "reflect propose" && args.length === 2)
    return reflectionProposeCommand(root, options);
  if (route === "reflect review" && args.length === 3)
    return reflectionReviewCommand(root, args[2] ?? "");
  if (route === "reflect apply" && args.length === 3)
    return reflectionApplyCommand(root, args[2] ?? "", options);
  return dispatchWikiMemoryCommand(root, args, options);
}

async function dispatchWikiMemoryCommand(
  root: string | undefined,
  args: readonly string[],
  options: WikiCommandOptions,
): Promise<void> {
  const route = args.slice(0, 2).join(" ");
  if (route === "memory retrieve" && args.length === 3)
    return memoryRetrieveCommand(root, args[2] ?? "", options);
  if (route === "memory evaluate" && args.length === 2) return memoryEvaluateCommand(root, options);
  if (route === "memory stats" && args.length === 2) return memoryStatsCommand(root);
  throw new Error(`Unknown wiki command: wiki ${args.join(" ")}`);
}

async function initWikiCommand(root?: string): Promise<void> {
  const snapshot = await workflow(root).initialize();
  console.log(JSON.stringify(snapshot, null, 2));
}

async function addSourceCommand(
  root: string | undefined,
  path: string,
  options: SourceOptions,
): Promise<void> {
  const title = requiredText(options.title, "--title");
  const source = await workflow(root).addSource({ path, title });
  console.log(JSON.stringify(source, null, 2));
}

async function answerTaskCommand(
  root: string | undefined,
  question: string,
  options: TaskOptions,
): Promise<void> {
  const task = await workflow(root).prepareTask(taskInput(question, options));
  const artifact = await writeArtifact(
    workspaceRoot(root),
    requiredText(options.out, "--out"),
    task,
  );
  console.log(JSON.stringify({ artifact, id: task.id, digest: task.digest }, null, 2));
}

function taskInput(question: string, options: TaskOptions) {
  const input = {
    question,
    sourceIds: sourceIds(requiredText(options.sources, "--sources")),
  };
  return options.title === undefined ? input : { ...input, title: options.title };
}

async function answerRunCommand(
  root: string | undefined,
  options: WikiCommandOptions,
): Promise<void> {
  const wiki = workflow(root);
  const task = await wiki.validateTask(
    await readArtifact(workspaceRoot(root), requiredText(options.task, "--task")),
  );
  await discloseAndRun(root, wiki, task, options);
}

async function discloseAndRun(
  root: string | undefined,
  wiki: WikiAnswerWorkflow,
  task: WikiAnswerTask,
  options: WikiCommandOptions,
): Promise<void> {
  const config = await runnerConfig(options);
  console.log(formatWikiRunnerDisclosure(task, config));
  assertRunnerConsent(task, config, options);
  const saved = await withTerminationAbort((signal) =>
    runToReservedArtifact(root, requiredText(options.out, "--out"), () =>
      runExternalTask(wiki, task, config, signal),
    ),
  );
  console.log(
    JSON.stringify(
      { artifact: saved.artifact, taskId: task.id, runner: saved.run.runner.id },
      null,
      2,
    ),
  );
}

async function runnerConfig(options: RunnerOptions): Promise<ExternalRunnerConfig> {
  const executable = requiredText(options.runnerExecutable, "--runner-executable");
  if (!isAbsolute(executable)) {
    throw new Error("--runner-executable must be an absolute path");
  }
  const trustedFiles = runnerTrustedFilePaths(options.runnerTrustedFilesJson, executable);
  return {
    provider: requiredText(options.runnerId, "--runner-id"),
    executable,
    executableSha256: await externalRunnerFileSha256(executable),
    args: runnerArguments(options.runnerArgsJson),
    envAllowlist: runnerEnvironment(options.runnerEnv),
    trustedFiles: await Promise.all(
      trustedFiles.map(async (path) => ({
        path,
        sha256: await externalRunnerFileSha256(path),
      })),
    ),
    timeoutMs: positiveInteger(
      options.runnerTimeoutMs ?? defaultRunnerTimeoutMs,
      "--runner-timeout-ms",
    ),
  };
}

function runnerTrustedFilePaths(value: string | undefined, executable: string): string[] {
  let parsed: unknown;
  try {
    parsed = JSON.parse(value ?? "[]");
  } catch {
    throw new Error("--runner-trusted-files-json must be an absolute path JSON string array");
  }
  if (
    !Array.isArray(parsed) ||
    parsed.some((path) => typeof path !== "string" || !isAbsolute(path))
  ) {
    throw new Error("--runner-trusted-files-json must be an absolute path JSON string array");
  }
  if (new Set(parsed).size !== parsed.length || parsed.includes(executable)) {
    throw new Error("--runner-trusted-files-json paths must be unique and exclude the executable");
  }
  return [...parsed].sort();
}

function runnerArguments(value?: string): string[] {
  let parsed: unknown;
  try {
    parsed = JSON.parse(value ?? "[]");
  } catch {
    throw new Error("--runner-args-json must be a JSON string array");
  }
  if (!Array.isArray(parsed) || parsed.some((argument) => typeof argument !== "string")) {
    throw new Error("--runner-args-json must be a JSON string array");
  }
  return parsed;
}

function runnerEnvironment(value?: string): string[] {
  const names = (value ?? "")
    .split(",")
    .map((name) => name.trim())
    .filter(Boolean);
  if (new Set(names).size !== names.length) {
    throw new Error("--runner-env must not contain duplicate names");
  }
  return names.sort();
}

function positiveInteger(value: number | string | undefined, option: string): number {
  const parsed = typeof value === "number" ? value : Number(value);
  if (!Number.isSafeInteger(parsed) || parsed <= 0) {
    throw new Error(`${option} must be a positive integer`);
  }
  return parsed;
}

function assertRunnerConsent(
  task: WikiAnswerTask,
  config: ExternalRunnerConfig,
  options: RunnerOptions,
): void {
  if (requiredText(options.acceptTaskDigest, "--accept-task-digest") !== task.digest) {
    throw new Error("--accept-task-digest must equal the full disclosed task digest");
  }
  if (requiredText(options.trustRunner, "--trust-runner") !== config.provider) {
    throw new Error("--trust-runner must equal the exact disclosed runner id");
  }
  if (
    requiredText(options.acceptRunnerDigest, "--accept-runner-digest") !==
    wikiRunnerConfigDigest(config)
  ) {
    throw new Error("--accept-runner-digest must equal the full disclosed runner config digest");
  }
}

async function answerProposeCommand(
  root: string | undefined,
  options: ProposeOptions,
): Promise<void> {
  const wiki = workflow(root);
  const [task, result] = await Promise.all([
    readArtifact(workspaceRoot(root), requiredText(options.task, "--task")),
    readArtifact(workspaceRoot(root), requiredText(options.result, "--result")),
  ]);
  const proposal = await wiki.prepareProposal(task, result);
  await writeProposalArtifact(root, options, proposal);
}

async function writeProposalArtifact(
  root: string | undefined,
  options: ProposeOptions,
  proposal: WikiProposal,
): Promise<void> {
  const artifact = await writeArtifact(
    workspaceRoot(root),
    requiredText(options.out, "--out"),
    proposal,
  );
  console.log(JSON.stringify({ artifact, id: proposal.id, digest: proposal.digest }, null, 2));
}

async function answerReviewCommand(root: string | undefined, name: string): Promise<void> {
  const proposal = workflow(root).reviewProposal(await readArtifact(workspaceRoot(root), name));
  console.log(formatWikiProposalReview(proposal));
}

async function answerApplyCommand(
  root: string | undefined,
  name: string,
  options: ApplyOptions,
): Promise<void> {
  const wiki = workflow(root);
  const proposal = await readArtifact(workspaceRoot(root), name);
  const result = await wiki.applyReviewed(proposal, {
    acceptedDigest: requiredText(options.acceptDigest, "--accept-digest"),
    reviewedBy: requiredText(options.reviewer, "--reviewer"),
  });
  console.log(JSON.stringify(result, null, 2));
}

async function rebuildTaskCommand(root: string | undefined, options: TaskOptions): Promise<void> {
  const task = await rebuildWorkflow(root).prepareTask({
    sourceIds: sourceIds(requiredText(options.sources, "--sources")),
  });
  const artifact = await writeArtifact(
    workspaceRoot(root),
    requiredText(options.out, "--out"),
    task,
  );
  console.log(
    JSON.stringify(
      { artifact, id: task.id, digest: task.digest, targets: task.targets.map(({ path }) => path) },
      null,
      2,
    ),
  );
}

async function rebuildCompareCommand(
  root: string | undefined,
  options: ProposeOptions,
): Promise<void> {
  const [task, result] = await Promise.all([
    readArtifact(workspaceRoot(root), requiredText(options.task, "--task")),
    readArtifact(workspaceRoot(root), requiredText(options.result, "--result")),
  ]);
  const report = await rebuildWorkflow(root).prepareReport(task, result);
  await writeRebuildReportArtifact(root, options, report);
}

async function writeRebuildReportArtifact(
  root: string | undefined,
  options: ProposeOptions,
  report: WikiRebuildReport,
): Promise<void> {
  const artifact = await writeArtifact(
    workspaceRoot(root),
    requiredText(options.out, "--out"),
    report,
  );
  console.log(JSON.stringify({ artifact, id: report.id, digest: report.digest }, null, 2));
}

async function rebuildReviewCommand(root: string | undefined, name: string): Promise<void> {
  const report = rebuildWorkflow(root).reviewReport(await readArtifact(workspaceRoot(root), name));
  console.log(formatWikiRebuildReview(report));
}

async function rebuildApplyCommand(
  root: string | undefined,
  name: string,
  options: RebuildApplyOptions,
): Promise<void> {
  const [task, result, report] = await Promise.all([
    readArtifact(workspaceRoot(root), requiredText(options.task, "--task")),
    readArtifact(workspaceRoot(root), requiredText(options.result, "--result")),
    readArtifact(workspaceRoot(root), name),
  ]);
  const applied = await rebuildWorkflow(root).applyReviewed({
    task,
    result,
    report,
    acceptedDigest: requiredText(options.acceptDigest, "--accept-digest"),
    reviewedBy: requiredText(options.reviewer, "--reviewer"),
  });
  console.log(JSON.stringify(applied, null, 2));
}

async function reflectionPrepareCommand(
  root: string | undefined,
  options: TaskOptions,
): Promise<void> {
  const task = await reflectionWorkflow(root).prepareTask(
    await readArtifact(workspaceRoot(root), requiredText(options.input, "--input")),
  );
  const artifact = await writeArtifact(
    workspaceRoot(root),
    requiredText(options.out, "--out"),
    task,
  );
  console.log(JSON.stringify(reflectionTaskSummary(task, artifact), null, 2));
}

function reflectionTaskSummary(
  task: Awaited<ReturnType<WikiReflectionWorkflow["prepareTask"]>>,
  artifact: string,
) {
  return {
    artifact,
    id: task.id,
    digest: task.digest,
    evidence: task.evidence.kind,
    contexts: task.contexts.map(({ path }) => path),
  };
}

async function reflectionProposeCommand(
  root: string | undefined,
  options: ProposeOptions,
): Promise<void> {
  const [task, result] = await Promise.all([
    readArtifact(workspaceRoot(root), requiredText(options.task, "--task")),
    readArtifact(workspaceRoot(root), requiredText(options.result, "--result")),
  ]);
  const report = await reflectionWorkflow(root).prepareReport(task, result);
  const artifact = await writeArtifact(
    workspaceRoot(root),
    requiredText(options.out, "--out"),
    report,
  );
  console.log(JSON.stringify({ artifact, id: report.id, digest: report.digest }, null, 2));
}

async function reflectionReviewCommand(root: string | undefined, name: string): Promise<void> {
  const report = reflectionWorkflow(root).reviewReport(
    await readArtifact(workspaceRoot(root), name),
  );
  console.log(formatWikiReflectionReview(report));
}

async function reflectionApplyCommand(
  root: string | undefined,
  name: string,
  options: RebuildApplyOptions,
): Promise<void> {
  const [task, result, report] = await Promise.all([
    readArtifact(workspaceRoot(root), requiredText(options.task, "--task")),
    readArtifact(workspaceRoot(root), requiredText(options.result, "--result")),
    readArtifact(workspaceRoot(root), name),
  ]);
  const applied = await reflectionWorkflow(root).applyReviewed({
    task,
    result,
    report,
    acceptedDigest: requiredText(options.acceptDigest, "--accept-digest"),
    reviewedBy: requiredText(options.reviewer, "--reviewer"),
  });
  console.log(JSON.stringify(applied, null, 2));
}

async function memoryRetrieveCommand(
  root: string | undefined,
  query: string,
  options: TaskOptions,
): Promise<void> {
  const context = await memoryWorkflow(root).prepareContext(query);
  if (options.out === undefined) {
    console.log(JSON.stringify(context, null, 2));
    return;
  }
  const artifact = await writeArtifact(workspaceRoot(root), options.out, context);
  console.log(JSON.stringify(memoryContextSummary(context, artifact), null, 2));
}

function memoryContextSummary(
  context: Awaited<ReturnType<WikiMemoryWorkflow["prepareContext"]>>,
  artifact: string,
) {
  return {
    artifact,
    id: context.id,
    digest: context.digest,
    memories: context.memories.map(({ path, kind, score, matchedTerms }) => ({
      path,
      kind,
      score,
      matchedTerms,
    })),
  };
}

async function memoryEvaluateCommand(
  root: string | undefined,
  options: WikiCommandOptions,
): Promise<void> {
  const [task, input] = await Promise.all([
    readArtifact(workspaceRoot(root), requiredText(options.task, "--task")),
    readArtifact(workspaceRoot(root), requiredText(options.input, "--input")),
  ]);
  const record = await memoryWorkflow(root).recordEvaluation(task, input);
  console.log(JSON.stringify({ id: record.id, digest: record.digest }, null, 2));
}

async function memoryStatsCommand(root?: string): Promise<void> {
  console.log(JSON.stringify(await memoryWorkflow(root).summarizeEvaluations(), null, 2));
}

function workflow(root?: string): WikiAnswerWorkflow {
  return new WikiAnswerWorkflow(
    root === undefined ? createDefaultWorkspace() : createWorkspace(root),
  );
}

function rebuildWorkflow(root?: string): WikiRebuildWorkflow {
  return new WikiRebuildWorkflow(
    root === undefined ? createDefaultWorkspace() : createWorkspace(root),
  );
}

function reflectionWorkflow(root?: string): WikiReflectionWorkflow {
  return new WikiReflectionWorkflow(
    root === undefined ? createDefaultWorkspace() : createWorkspace(root),
  );
}

function memoryWorkflow(root?: string): WikiMemoryWorkflow {
  return new WikiMemoryWorkflow(
    root === undefined ? createDefaultWorkspace() : createWorkspace(root),
  );
}

function workspaceRoot(root?: string): string {
  return root ?? createDefaultWorkspace().root;
}

function sourceIds(value: string): string[] {
  const ids = value
    .split(",")
    .map((id) => id.trim())
    .filter(Boolean);
  if (ids.length === 0) {
    throw new Error("--sources requires at least one source id");
  }
  return ids;
}

function requiredText(value: string | undefined, option: string): string {
  if (value === undefined || value.trim().length === 0) {
    throw new Error(`${option} is required`);
  }
  return value.trim();
}

async function writeArtifact(root: string, name: string, value: unknown): Promise<string> {
  const path = artifactPath(await artifactDirectory(root), name);
  const content = Buffer.from(`${JSON.stringify(value, null, 2)}\n`);
  assertArtifactSize(content.byteLength);
  await writeArtifactFile(path, content);
  return join(".ai-lab", "wiki-exchange", name);
}

async function writeArtifactFile(path: string, content: Buffer): Promise<void> {
  const handle = await open(
    path,
    constants.O_WRONLY | constants.O_CREAT | constants.O_EXCL | constants.O_NOFOLLOW,
    0o600,
  );
  try {
    await handle.writeFile(content);
  } finally {
    await handle.close();
  }
}

async function runToReservedArtifact(
  root: string | undefined,
  name: string,
  operation: () => Promise<WikiAnswerRunnerResult>,
): Promise<{ artifact: string; run: WikiAnswerRunnerResult }> {
  const reservation = await reserveArtifact(workspaceRoot(root), name);
  let complete = false;
  try {
    const run = await operation();
    const bytes = await writeReservedArtifact(reservation, run.result);
    await verifyReservedArtifact(reservation, bytes);
    complete = true;
    return { artifact: join(".ai-lab", "wiki-exchange", name), run };
  } finally {
    try {
      await reservation.handle.close();
    } finally {
      if (!complete) await cleanupFailedReservation(reservation);
    }
  }
}

async function reserveArtifact(root: string, name: string): Promise<ArtifactReservation> {
  const path = artifactPath(await artifactDirectory(root), name);
  const handle = await open(
    path,
    constants.O_WRONLY | constants.O_CREAT | constants.O_EXCL | constants.O_NOFOLLOW,
    0o600,
  );
  return initializeReservation(path, handle);
}

async function initializeReservation(
  path: string,
  handle: FileHandle,
): Promise<ArtifactReservation> {
  let reservation: ArtifactReservation | undefined;
  try {
    const opened = await handle.stat();
    reservation = { handle, path, dev: opened.dev, ino: opened.ino };
    await verifyInitialReservation(reservation);
    return reservation;
  } catch (error) {
    try {
      await handle.close();
    } finally {
      if (reservation !== undefined) await cleanupFailedReservation(reservation);
    }
    throw error;
  }
}

async function verifyInitialReservation(reservation: ArtifactReservation): Promise<void> {
  const current = await lstat(reservation.path);
  if (!sameReservation(current, reservation)) {
    throw new Error("Wiki result reservation identity could not be verified");
  }
}

async function writeReservedArtifact(
  reservation: ArtifactReservation,
  value: unknown,
): Promise<number> {
  const content = Buffer.from(`${JSON.stringify(value, null, 2)}\n`);
  assertArtifactSize(content.byteLength);
  await reservation.handle.writeFile(content);
  return content.byteLength;
}

async function verifyReservedArtifact(
  reservation: ArtifactReservation,
  expectedBytes: number,
): Promise<void> {
  const current = await lstat(reservation.path).catch(missingArtifactPath);
  const opened = await reservation.handle.stat();
  if (
    !sameReservation(current, reservation) ||
    !sameReservation(opened, reservation) ||
    current?.size !== expectedBytes ||
    opened.size !== expectedBytes
  ) {
    throw new Error("Wiki result reservation was replaced or changed during write");
  }
}

async function cleanupFailedReservation(reservation: ArtifactReservation): Promise<void> {
  const current = await lstat(reservation.path).catch(missingArtifactPath);
  if (current === undefined) return;
  if (!sameReservation(current, reservation)) {
    throw new Error("Wiki result reservation was replaced; refusing to delete another file");
  }
  // Node has no portable inode-conditional unlink; this is best effort inside the trusted same-user TCB.
  await unlink(reservation.path);
}

function missingArtifactPath(error: unknown): undefined {
  if (error instanceof Error && "code" in error && error.code === "ENOENT") return undefined;
  throw error;
}

function sameReservation(current: Stats | undefined, reservation: ArtifactReservation): boolean {
  return (
    current?.isFile() === true &&
    !current.isSymbolicLink() &&
    current.dev === reservation.dev &&
    current.ino === reservation.ino
  );
}

async function withTerminationAbort<T>(operation: (signal: AbortSignal) => Promise<T>): Promise<T> {
  const controller = new AbortController();
  const abort = () =>
    controller.abort(new Error("External runner cancelled by termination signal"));
  for (const signal of runnerTerminationSignals) process.once(signal, abort);
  try {
    return await operation(controller.signal);
  } finally {
    for (const signal of runnerTerminationSignals) process.off(signal, abort);
  }
}

async function runExternalTask(
  wiki: WikiAnswerWorkflow,
  task: WikiAnswerTask,
  config: ExternalRunnerConfig,
  signal: AbortSignal,
): Promise<WikiAnswerRunnerResult> {
  if (signal.aborted) {
    throw signal.reason instanceof Error
      ? signal.reason
      : new Error("External runner was cancelled");
  }
  return wiki.runTaskWithExternalRunner(task, config, { signal });
}

async function readArtifact(root: string, name: string): Promise<unknown> {
  const path = artifactPath(await artifactDirectory(root), name);
  const handle = await open(path, constants.O_RDONLY | constants.O_NOFOLLOW);
  try {
    const info = await handle.stat();
    await assertArtifactFile(path, name, info);
    assertArtifactSize(info.size);
    const content = new TextDecoder("utf-8", { fatal: true }).decode(await handle.readFile());
    return JSON.parse(content);
  } finally {
    await handle.close();
  }
}

async function artifactDirectory(root: string): Promise<string> {
  const parent = join(root, ".ai-lab");
  const directory = join(parent, "wiki-exchange");
  await ensureDirectory(parent, false);
  await ensureDirectory(directory, true);
  return directory;
}

async function ensureDirectory(path: string, privateDirectory: boolean): Promise<void> {
  await mkdir(path, { mode: 0o700 }).catch((error: unknown) => existingDirectory(error));
  const info = await lstat(path);
  if (
    info.isSymbolicLink() ||
    !info.isDirectory() ||
    (privateDirectory && process.platform !== "win32" && (info.mode & 0o077) !== 0)
  ) {
    throw new Error(`Wiki artifact directory is unsafe: ${path}`);
  }
}

function existingDirectory(error: unknown): void {
  if (!(error instanceof Error && "code" in error && error.code === "EEXIST")) {
    throw error;
  }
}

function artifactPath(directory: string, name: string): string {
  if (!/^[A-Za-z0-9][A-Za-z0-9._-]*\.json$/.test(name) || name.includes("..")) {
    throw new Error(`Wiki artifact filename is invalid: ${name}`);
  }
  return join(directory, name);
}

async function assertArtifactFile(path: string, name: string, opened: Stats): Promise<void> {
  const current = await lstat(path);
  if (
    !opened.isFile() ||
    current.isSymbolicLink() ||
    !current.isFile() ||
    current.dev !== opened.dev ||
    current.ino !== opened.ino
  ) {
    throw new Error(`Wiki artifact is not a regular file: ${name}`);
  }
}

function assertArtifactSize(bytes: number): void {
  if (bytes > maxArtifactBytes) {
    throw new Error(`Wiki artifact exceeds ${maxArtifactBytes} bytes`);
  }
}

export function formatWikiProposalReview(proposal: WikiProposal): string {
  return [
    "Review this exact proposal value. Terminal control and direction characters are escaped.",
    safeJson(proposal),
    `Digest: ${proposal.digest}`,
  ].join("\n");
}

export function formatWikiRebuildReview(report: WikiRebuildReport): string {
  return [
    "Review this exact shadow rebuild report before applying its bound task and result.",
    "Terminal control and direction characters are escaped.",
    safeJson(report),
    `Digest: ${report.digest}`,
  ].join("\n");
}

export function formatWikiReflectionReview(report: WikiReflectionReport): string {
  return [
    "Review this exact reflection report before applying its bound task and result.",
    "Terminal control and direction characters are escaped.",
    safeJson(report),
    `Digest: ${report.digest}`,
  ].join("\n");
}

export function formatWikiRunnerDisclosure(
  task: WikiAnswerTask,
  config: ExternalRunnerConfig,
): string {
  const runner = canonicalRunnerConfig(config);
  return safeJson({
    action: "external-runner-disclosure",
    warnings: [
      "This explicitly trusted runner is part of the same-user trusted computing base, not a sandbox.",
      "The runner may access or modify same-user files, credentials, processes, and network resources.",
      "The host does not verify whether the runner uses subscription access or incurs API billing.",
      "No-auto-apply constrains only the host workflow; the runner executable may have its own side effects.",
      "Only the executable and explicitly listed trusted files are integrity checked before spawn.",
    ],
    runner: { ...runner, digest: wikiRunnerConfigDigest(config) },
    task: {
      digest: task.digest,
      contexts: task.contexts.map((context) => ({
        path: context.path,
        sha256: context.sha256,
        utf8Bytes: Buffer.byteLength(context.content, "utf8"),
      })),
    },
  });
}

export function wikiRunnerConfigDigest(config: ExternalRunnerConfig): string {
  return createHash("sha256")
    .update(JSON.stringify(canonicalRunnerConfig(config)))
    .digest("hex");
}

function canonicalRunnerConfig(config: ExternalRunnerConfig) {
  return {
    schemaVersion: runnerConsentSchemaVersion,
    provider: config.provider,
    executable: config.executable,
    executableSha256: config.executableSha256,
    args: [...config.args],
    envAllowlist: [...config.envAllowlist].sort(),
    trustedFiles: [...config.trustedFiles]
      .map((file) => ({ path: file.path, sha256: file.sha256 }))
      .sort((left, right) => left.path.localeCompare(right.path)),
    timeoutMs: config.timeoutMs ?? defaultRunnerTimeoutMs,
  };
}

function safeJson(value: unknown): string {
  return JSON.stringify(value, null, 2).replace(
    /[\u007f-\u009f\u061c\u200e\u200f\u2028\u2029\u202a-\u202e\u2066-\u2069]/g,
    (character) => `\\u${character.charCodeAt(0).toString(16).padStart(4, "0")}`,
  );
}
