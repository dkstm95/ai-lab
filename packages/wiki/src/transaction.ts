import { createHash } from "node:crypto";
import { constants, type Stats } from "node:fs";
import {
  appendFile,
  copyFile,
  cp,
  link,
  lstat,
  mkdir,
  mkdtemp,
  open,
  readFile,
  realpath,
  rename,
  rm,
  unlink,
  writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, isAbsolute, join, posix, relative, resolve, sep } from "node:path";
import type { Workspace } from "@ai-lab/workspace";

export interface WikiTransactionFile {
  readonly path: string;
  readonly content: string | Buffer;
  readonly createOnly?: boolean;
  readonly mode?: number;
}

export interface WikiTransactionIssue {
  readonly code: string;
  readonly path: string;
  readonly message: string;
}

export interface WikiTransactionReport {
  readonly issues: readonly WikiTransactionIssue[];
}

export interface WikiSourceFile {
  readonly path: string;
  readonly hash: string;
}

export interface WikiWorkspaceSource {
  readonly content: Buffer;
  readonly mode: number;
}

export interface WikiPathExpectation {
  readonly path: string;
  readonly type: "directory" | "file";
  readonly allowMissing: boolean;
}

export type WikiCandidateValidator = (workspace: Workspace) => Promise<WikiTransactionReport>;

export interface PromoteWikiFilesInput {
  readonly files: readonly WikiTransactionFile[];
  readonly auditEntry: string;
  readonly validate: WikiCandidateValidator;
  readonly prePromote?: () => Promise<void>;
}

export interface WikiPromotionResult {
  readonly files: readonly string[];
  readonly lint: WikiTransactionReport;
}

interface WikiCandidate {
  readonly root: string;
  readonly workspace: Workspace;
}

interface WikiBackup {
  readonly path: string;
  readonly livePath: string;
  readonly candidatePath: string;
  readonly backupPath: string;
  readonly createOnly: boolean;
  readonly existed: boolean;
}

interface WikiPromotionTarget {
  readonly path: string;
  readonly createOnly: boolean;
}

export class WikiWriteConflictError extends Error {
  constructor(path: string) {
    super(`Another wiki writer holds the lock: ${path}`);
    this.name = "WikiWriteConflictError";
  }
}

export class WikiCandidateValidationError extends Error {
  constructor(readonly report: WikiTransactionReport) {
    super(`Wiki candidate has ${report.issues.length} lint issue(s)`);
    this.name = "WikiCandidateValidationError";
  }
}

export class WikiRecoveryRequiredError extends Error {
  constructor(
    readonly transactionRoot: string,
    cause: unknown,
  ) {
    super(`Wiki rollback failed; recovery files remain at ${transactionRoot}`, { cause });
    this.name = "WikiRecoveryRequiredError";
  }
}

export class WikiSourceReferenceError extends Error {
  constructor(
    readonly kind: "missing" | "unsupported",
    source: string,
  ) {
    super(
      kind === "missing"
        ? `Source reference is missing: ${source}`
        : `Unsupported source reference: ${source}`,
    );
    this.name = "WikiSourceReferenceError";
  }
}

export async function withWikiWriteLock<T>(
  workspace: Workspace,
  operation: (lockedWorkspace: Workspace) => Promise<T>,
): Promise<T> {
  const lockedWorkspace = Object.freeze({ root: workspace.root });
  const path = join(lockedWorkspace.root, ".ai-lab-wiki.lock");
  const handle = await acquireWikiWriteLock(path);
  try {
    return await operation(lockedWorkspace);
  } finally {
    try {
      await handle.close();
    } finally {
      await unlink(path).catch(() => undefined);
    }
  }
}

export async function readWorkspaceSource(
  workspace: Workspace,
  inputPath: string,
): Promise<WikiWorkspaceSource> {
  const path = workspaceInputPath(workspace, inputPath);
  const handle = await open(path, constants.O_RDONLY | constants.O_NOFOLLOW).catch(
    workspaceSourceOpenError,
  );
  try {
    const info = await handle.stat();
    await assertWorkspaceImportPath(workspace, path, info);
    return { content: await handle.readFile(), mode: info.mode & 0o777 };
  } finally {
    await handle.close();
  }
}

function workspaceSourceOpenError(error: unknown): never {
  if (isNodeError(error, "ELOOP")) {
    throw new Error("Wiki source must be a regular file inside the workspace root");
  }
  throw error;
}

export async function resolveWikiSource(
  workspace: Workspace,
  source: string,
): Promise<WikiSourceFile> {
  assertCanonicalSourceReference(source);
  const path = resolveSourcePath(workspace, source);
  await assertSafeSourceTarget(workspace, path, source);
  await assertManagedSourceFile(workspace, path, source);
  return { path, hash: sha256(await readFile(path)) };
}

export async function assertWikiPath(
  workspace: Workspace,
  expectation: WikiPathExpectation,
): Promise<void> {
  const root = resolve(workspace.root, "wiki");
  const path = resolve(root, expectation.path);
  await assertSafeTarget(root, path);
  await assertExpectedPath(path, expectation);
}

export async function hashWikiFiles(
  workspace: Workspace,
  paths: readonly string[],
): Promise<Record<string, string | null>> {
  const entries = await Promise.all(
    [...paths].sort().map(async (path) => [path, await hashWikiFile(workspace, path)] as const),
  );
  return Object.fromEntries(entries);
}

export async function previewWikiFiles(
  workspace: Workspace,
  files: readonly WikiTransactionFile[],
  validate: WikiCandidateValidator,
): Promise<WikiTransactionReport> {
  const candidate = await createWikiCandidate(workspace, join(tmpdir(), "ai-lab-wiki-preview-"));
  try {
    await writeCandidateFiles(candidate.workspace, files);
    return remapReport(await validate(candidate.workspace), candidate.workspace, workspace);
  } finally {
    await rm(candidate.root, { recursive: true, force: true });
  }
}

export async function promoteWikiFiles(
  workspace: Workspace,
  input: PromoteWikiFilesInput,
): Promise<WikiPromotionResult> {
  const candidate = await createWikiCandidate(workspace, join(workspace.root, ".wiki-txn-"));
  let preserve = false;
  try {
    return await promoteWikiCandidate(workspace, candidate, input);
  } catch (error) {
    preserve = error instanceof WikiRecoveryRequiredError;
    throw error;
  } finally {
    if (!preserve) {
      await rm(candidate.root, { recursive: true, force: true });
    }
  }
}

export function sha256(content: string | Buffer): string {
  return createHash("sha256").update(content).digest("hex");
}

function workspaceInputPath(workspace: Workspace, path: string): string {
  return isAbsolute(path) ? resolve(path) : resolve(workspace.root, path);
}

async function assertWorkspaceImportPath(
  workspace: Workspace,
  path: string,
  opened: Stats,
): Promise<void> {
  const roots = await Promise.all([realpath(workspace.root), realpath(path)]);
  const current = await lstat(path);
  if (
    !isWithin(roots[0], roots[1]) ||
    !opened.isFile() ||
    current.isSymbolicLink() ||
    !current.isFile() ||
    opened.dev !== current.dev ||
    opened.ino !== current.ino
  ) {
    throw new Error("Wiki source must be a regular file inside the workspace root");
  }
}

function assertCanonicalSourceReference(source: string): void {
  const parts = source.split("/");
  if (
    source.includes("\\") ||
    posix.isAbsolute(source) ||
    posix.normalize(source) !== source ||
    parts[0] !== "raw" ||
    parts[1] !== "sources" ||
    parts.length < 3 ||
    parts.some((part) => part.length === 0 || part === "." || part === "..")
  ) {
    throw new WikiSourceReferenceError("unsupported", source);
  }
}

function resolveSourcePath(workspace: Workspace, source: string): string {
  const root = resolve(workspace.root, "wiki", "raw", "sources");
  const path = resolve(workspace.root, "wiki", source);
  if (!isWithin(root, path)) {
    throw new WikiSourceReferenceError("unsupported", source);
  }
  return path;
}

async function assertSafeSourceTarget(
  workspace: Workspace,
  path: string,
  source: string,
): Promise<void> {
  try {
    await assertSafeTarget(resolve(workspace.root, "wiki"), path);
  } catch {
    throw new WikiSourceReferenceError("unsupported", source);
  }
}

async function assertManagedSourceFile(
  workspace: Workspace,
  path: string,
  source: string,
): Promise<void> {
  const info = await lstat(path).catch((error: unknown) => missingSource(error, source));
  if (info === undefined || info.isSymbolicLink() || !info.isFile()) {
    throw new WikiSourceReferenceError("unsupported", source);
  }
  await assertRealSourceContainment(workspace, path, source);
}

async function assertRealSourceContainment(
  workspace: Workspace,
  path: string,
  source: string,
): Promise<void> {
  const roots = await Promise.all([
    realpath(resolve(workspace.root, "wiki", "raw", "sources")),
    realpath(path),
  ]);
  if (!isWithin(roots[0], roots[1])) {
    throw new WikiSourceReferenceError("unsupported", source);
  }
}

function missingSource(error: unknown, source: string): undefined {
  if (isNodeError(error, "ENOENT")) {
    throw new WikiSourceReferenceError("missing", source);
  }
  throw error;
}

async function hashWikiFile(workspace: Workspace, path: string): Promise<string | null> {
  const target = resolve(workspace.root, "wiki", path);
  await assertSafeTarget(resolve(workspace.root, "wiki"), target);
  return readFile(target)
    .then(sha256)
    .catch((error: unknown) => missingHash(error));
}

function missingHash(error: unknown): null {
  if (isNodeError(error, "ENOENT")) {
    return null;
  }
  throw error;
}

async function acquireWikiWriteLock(path: string) {
  try {
    return await open(path, "wx");
  } catch (error) {
    if (isNodeError(error, "EEXIST")) {
      throw new WikiWriteConflictError(path);
    }
    throw error;
  }
}

async function createWikiCandidate(workspace: Workspace, prefix: string): Promise<WikiCandidate> {
  await assertWikiPath(workspace, { path: "", type: "directory", allowMissing: false });
  const root = await mkdtemp(prefix);
  const candidate = { root: join(root, "candidate") };
  try {
    await copyWikiCandidate(workspace, candidate);
    return { root, workspace: candidate };
  } catch (error) {
    await rm(root, { recursive: true, force: true });
    throw error;
  }
}

async function copyWikiCandidate(workspace: Workspace, candidate: Workspace): Promise<void> {
  await mkdir(candidate.root, { recursive: true });
  await cp(join(workspace.root, "wiki"), join(candidate.root, "wiki"), {
    recursive: true,
    errorOnExist: true,
    force: false,
    verbatimSymlinks: true,
  });
}

async function writeCandidateFiles(
  workspace: Workspace,
  files: readonly WikiTransactionFile[],
): Promise<void> {
  for (const file of files) {
    await writeCandidateFile(workspace, file);
  }
}

async function writeCandidateFile(workspace: Workspace, file: WikiTransactionFile): Promise<void> {
  const root = resolve(workspace.root, "wiki");
  const path = resolve(root, file.path);
  await assertSafeTarget(root, path);
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, file.content, {
    flag: file.createOnly ? "wx" : "w",
    mode: file.mode,
  });
}

async function promoteWikiCandidate(
  workspace: Workspace,
  candidate: WikiCandidate,
  input: PromoteWikiFilesInput,
): Promise<WikiPromotionResult> {
  await writeCandidateFiles(candidate.workspace, input.files);
  await appendCandidateAudit(candidate.workspace, input.auditEntry);
  await assertCandidateValid(candidate, workspace, input.validate);
  await input.prePromote?.();
  return commitWikiCandidate(workspace, candidate, input);
}

async function appendCandidateAudit(workspace: Workspace, entry: string): Promise<void> {
  await assertWikiPath(workspace, { path: "log.md", type: "file", allowMissing: false });
  await appendFile(join(workspace.root, "wiki", "log.md"), `\n${entry}\n`, "utf8");
}

async function assertCandidateValid(
  candidate: WikiCandidate,
  live: Workspace,
  validate: WikiCandidateValidator,
): Promise<void> {
  const report = await validate(candidate.workspace);
  if (report.issues.length > 0) {
    throw new WikiCandidateValidationError(remapReport(report, candidate.workspace, live));
  }
}

async function commitWikiCandidate(
  workspace: Workspace,
  candidate: WikiCandidate,
  input: PromoteWikiFilesInput,
): Promise<WikiPromotionResult> {
  const backups = await prepareWikiBackups(workspace, candidate, promotionTargets(input.files));
  const committed = await promoteBackups(backups, candidate.root);
  return verifyCommittedWiki(workspace, committed, candidate.root, input.validate);
}

function promotionTargets(files: readonly WikiTransactionFile[]): WikiPromotionTarget[] {
  const targets = new Map(
    files.map((file) => [file.path, { path: file.path, createOnly: file.createOnly === true }]),
  );
  targets.set("log.md", { path: "log.md", createOnly: false });
  return [...targets.values()].sort(
    (left, right) =>
      promotionRank(left.path) - promotionRank(right.path) || left.path.localeCompare(right.path),
  );
}

function promotionRank(path: string): number {
  if (path.startsWith("pages/")) {
    return 0;
  }
  return path === "index.md" ? 1 : 2;
}

async function prepareWikiBackups(
  workspace: Workspace,
  candidate: WikiCandidate,
  targets: readonly WikiPromotionTarget[],
): Promise<WikiBackup[]> {
  const backups: WikiBackup[] = [];
  for (const target of targets) {
    backups.push(await prepareWikiBackup(workspace, candidate, target));
  }
  return backups;
}

async function prepareWikiBackup(
  workspace: Workspace,
  candidate: WikiCandidate,
  target: WikiPromotionTarget,
): Promise<WikiBackup> {
  const paths = wikiBackupPaths(workspace, candidate, target.path);
  const backup = {
    ...paths,
    createOnly: target.createOnly,
    existed: await assertPromotionPaths(workspace, candidate.workspace, paths),
  };
  if (backup.createOnly && backup.existed) {
    throw new Error(`Create-only wiki target already exists: ${backup.livePath}`);
  }
  if (backup.existed) {
    await mkdir(dirname(backup.backupPath), { recursive: true });
    await copyFile(backup.livePath, backup.backupPath);
  }
  return backup;
}

function wikiBackupPaths(
  workspace: Workspace,
  candidate: WikiCandidate,
  path: string,
): Omit<WikiBackup, "createOnly" | "existed"> {
  const livePath = resolve(workspace.root, "wiki", path);
  const candidatePath = resolve(candidate.workspace.root, "wiki", path);
  return {
    path,
    livePath,
    candidatePath,
    backupPath: resolve(candidate.root, "backup", path),
  };
}

async function assertPromotionPaths(
  workspace: Workspace,
  candidate: Workspace,
  backup: Omit<WikiBackup, "createOnly" | "existed">,
): Promise<boolean> {
  await assertSafeTarget(resolve(workspace.root, "wiki"), backup.livePath);
  await assertSafeTarget(resolve(candidate.root, "wiki"), backup.candidatePath);
  await assertRegularFile(backup.candidatePath, "Candidate wiki target");
  return regularFileExists(backup.livePath);
}

async function promoteBackups(
  backups: readonly WikiBackup[],
  transactionRoot: string,
): Promise<WikiBackup[]> {
  const committed: WikiBackup[] = [];
  try {
    for (const backup of backups) {
      await promoteWikiFile(backup);
      committed.push(backup);
    }
    return committed;
  } catch (error) {
    await rollbackOrRequireRecovery(committed, transactionRoot, error);
    throw error;
  }
}

async function promoteWikiFile(backup: WikiBackup): Promise<void> {
  if (backup.createOnly) {
    await link(backup.candidatePath, backup.livePath);
    return;
  }
  await rename(backup.candidatePath, backup.livePath);
}

async function verifyCommittedWiki(
  workspace: Workspace,
  committed: readonly WikiBackup[],
  transactionRoot: string,
  validate: WikiCandidateValidator,
): Promise<WikiPromotionResult> {
  const report = await validatePromotedWiki(workspace, committed, transactionRoot, validate);
  if (report.issues.length > 0) {
    await rollbackOrRequireRecovery(committed, transactionRoot, report);
    throw new WikiCandidateValidationError(report);
  }
  return { files: committed.map((backup) => backup.livePath), lint: report };
}

async function validatePromotedWiki(
  workspace: Workspace,
  committed: readonly WikiBackup[],
  transactionRoot: string,
  validate: WikiCandidateValidator,
): Promise<WikiTransactionReport> {
  try {
    return await validate(workspace);
  } catch (error) {
    await rollbackOrRequireRecovery(committed, transactionRoot, error);
    throw error;
  }
}

async function rollbackOrRequireRecovery(
  committed: readonly WikiBackup[],
  transactionRoot: string,
  cause: unknown,
): Promise<void> {
  try {
    await rollbackWikiFiles([...committed].reverse());
  } catch (rollbackError) {
    throw new WikiRecoveryRequiredError(transactionRoot, {
      cause,
      rollbackError,
    });
  }
}

async function rollbackWikiFiles(backups: readonly WikiBackup[]): Promise<void> {
  for (const backup of backups) {
    await rollbackWikiFile(backup);
  }
}

async function rollbackWikiFile(backup: WikiBackup): Promise<void> {
  if (backup.createOnly) {
    await unlink(backup.livePath);
    return;
  }
  if (backup.existed) {
    await rename(backup.backupPath, backup.livePath);
    return;
  }
  await mkdir(dirname(backup.candidatePath), { recursive: true });
  await rename(backup.livePath, backup.candidatePath);
}

async function assertSafeTarget(root: string, path: string): Promise<void> {
  if (!isWithin(root, path)) {
    throw new Error(`Wiki target escapes wiki root: ${path}`);
  }
  await assertNoSymlinkComponents(root, path);
}

async function assertNoSymlinkComponents(root: string, path: string): Promise<void> {
  await assertWikiRoot(root);
  let current = root;
  for (const part of relative(root, path).split(sep).filter(Boolean)) {
    current = join(current, part);
    const info = await lstat(current).catch((error: unknown) => missingComponent(error));
    if (info?.isSymbolicLink()) {
      throw new Error(`Wiki target uses a symbolic link: ${current}`);
    }
  }
}

async function assertWikiRoot(root: string): Promise<void> {
  const info = await lstat(root).catch((error: unknown) => missingComponent(error));
  if (info !== undefined && (info.isSymbolicLink() || !info.isDirectory())) {
    throw new Error(`Wiki root is not a regular directory: ${root}`);
  }
}

async function assertExpectedPath(path: string, expectation: WikiPathExpectation): Promise<void> {
  const info = await lstat(path).catch((error: unknown) => missingComponent(error));
  if (info === undefined && expectation.allowMissing) {
    return;
  }
  if (info === undefined || !expectedPathType(info, expectation.type)) {
    throw new Error(`Wiki ${expectation.type} is invalid: ${path}`);
  }
}

function expectedPathType(
  info: { isDirectory(): boolean; isFile(): boolean; isSymbolicLink(): boolean },
  type: WikiPathExpectation["type"],
): boolean {
  return !info.isSymbolicLink() && (type === "directory" ? info.isDirectory() : info.isFile());
}

function missingComponent(error: unknown): undefined {
  if (isNodeError(error, "ENOENT")) {
    return undefined;
  }
  throw error;
}

async function regularFileExists(path: string): Promise<boolean> {
  const info = await lstat(path).catch((error: unknown) => missingComponent(error));
  if (info === undefined) {
    return false;
  }
  if (info.isSymbolicLink() || !info.isFile()) {
    throw new Error(`Wiki target is not a regular file: ${path}`);
  }
  return true;
}

async function assertRegularFile(path: string, label: string): Promise<void> {
  if (!(await regularFileExists(path))) {
    throw new Error(`${label} is missing: ${path}`);
  }
}

function isWithin(root: string, path: string): boolean {
  const child = relative(root, path);
  return child === "" || (!child.startsWith(`..${sep}`) && child !== ".." && !isAbsolute(child));
}

function remapReport(
  report: WikiTransactionReport,
  candidate: Workspace,
  live: Workspace,
): WikiTransactionReport {
  return {
    issues: report.issues.map((issue) => ({
      ...issue,
      path: remapPath(issue.path, candidate, live),
    })),
  };
}

function remapPath(path: string, candidate: Workspace, live: Workspace): string {
  const root = resolve(candidate.root, "wiki");
  return isWithin(root, resolve(path))
    ? resolve(live.root, "wiki", relative(root, resolve(path)))
    : path;
}

function isNodeError(error: unknown, code: string): error is NodeJS.ErrnoException {
  return error instanceof Error && "code" in error && error.code === code;
}
