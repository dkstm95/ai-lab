import { constants, type Stats } from "node:fs";
import { lstat, mkdir, open } from "node:fs/promises";
import { join } from "node:path";
import { TextDecoder } from "node:util";
import { WikiAnswerWorkflow, type WikiProposal } from "@ai-lab/agent-runtime";
import { createDefaultWorkspace, createWorkspace } from "@ai-lab/workspace";
import type { CAC } from "cac";

interface SourceOptions {
  readonly title?: string;
}

interface TaskOptions {
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

interface WikiCommandOptions extends SourceOptions, TaskOptions, ProposeOptions, ApplyOptions {}

const maxArtifactBytes = 8_000_000;

export function registerWikiCommands(cli: CAC, root?: string): void {
  cli
    .command("wiki [...args]", "Manage the local provider-neutral LLM Wiki")
    .option("--title <title>", "Human-readable source or page title")
    .option("--sources <ids>", "Comma-separated registered source ids")
    .option("--out <file>", "Artifact filename under .ai-lab/wiki-exchange")
    .option("--task <file>", "Task artifact filename")
    .option("--result <file>", "AI result artifact filename")
    .option("--reviewer <name>", "Human reviewer identity")
    .option("--accept-digest <digest>", "Full reviewed proposal digest")
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
  if (route === "answer propose" && args.length === 2) return answerProposeCommand(root, options);
  if (route === "answer review" && args.length === 3)
    return answerReviewCommand(root, args[2] ?? "");
  if (route === "answer apply" && args.length === 3)
    return answerApplyCommand(root, args[2] ?? "", options);
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

function workflow(root?: string): WikiAnswerWorkflow {
  return new WikiAnswerWorkflow(
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

function safeJson(value: unknown): string {
  return JSON.stringify(value, null, 2).replace(
    /[\u007f-\u009f\u2028\u2029\u202a-\u202e\u2066-\u2069]/g,
    (character) => `\\u${character.charCodeAt(0).toString(16).padStart(4, "0")}`,
  );
}
