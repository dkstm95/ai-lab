import { createHash } from "node:crypto";
import { lstat, mkdir, readFile, readdir, stat, writeFile } from "node:fs/promises";
import { extname, join, posix, relative } from "node:path";
import { type Workspace, slugify } from "@ai-lab/workspace";
import {
  type WikiAnswerProposalDraft,
  type WikiAnswerTask,
  type WikiAnswerTaskEvidence,
  answerDraftFromExchange,
  buildWikiAnswerTask,
  parseWikiAnswerResult,
  parseWikiAnswerTask,
} from "./answer-exchange.js";
import {
  WikiCandidateValidationError,
  type WikiPathExpectation,
  WikiSourceReferenceError,
  type WikiTransactionFile,
  assertWikiPath,
  hashWikiFiles,
  previewWikiFiles,
  promoteWikiFiles,
  readWikiContextFiles,
  readWorkspaceSource,
  resolveWikiSource,
  sha256,
  withWikiWriteLock,
} from "./transaction.js";

export {
  parseWikiAnswerResult,
  parseWikiAnswerTask,
  wikiAnswerResultSchemaVersion,
  wikiAnswerTaskSchemaVersion,
} from "./answer-exchange.js";
export { parseWikiAnswerResultForTask } from "./answer-exchange.js";
export type {
  WikiAnswerResult,
  WikiAnswerResultClaim,
  WikiAnswerTask,
  WikiAnswerTaskContext,
  WikiAnswerTaskEvidence,
} from "./answer-exchange.js";

export {
  WikiCandidateValidationError,
  WikiRecoveryRequiredError,
  WikiWriteConflictError,
} from "./transaction.js";

export const wikiPageKinds = [
  "concept",
  "entity",
  "source",
  "synthesis",
  "question",
  "playbook",
  "failure",
  "decision",
  "eval",
] as const;

export const wikiPageStatuses = ["draft", "active", "review", "superseded", "conflicted"] as const;

export type WikiPageKind = (typeof wikiPageKinds)[number];
export type WikiPageStatus = (typeof wikiPageStatuses)[number];

export interface AddWikiSourceInput {
  readonly path: string;
  readonly title: string;
}

export interface WikiSnapshot {
  readonly root: string;
}

export interface WikiSource {
  readonly id: string;
  readonly title: string;
  readonly path: string;
  readonly addedAt: string;
}

export interface WikiPageMetadata {
  readonly title: string;
  readonly slug: string;
  readonly kind: WikiPageKind;
  readonly status: WikiPageStatus;
  readonly createdAt: string;
  readonly updatedAt: string;
  readonly reviewAfter?: string;
  readonly sources: readonly string[];
}

export interface WikiPage {
  readonly metadata: WikiPageMetadata;
  readonly path: string;
  readonly content: string;
}

export interface WikiLintIssue {
  readonly code: string;
  readonly path: string;
  readonly message: string;
}

export interface WikiLintReport {
  readonly issues: readonly WikiLintIssue[];
}

export type WikiTask = "ingest" | "query" | "lint-fix" | "reflect" | "evolve";

export interface WikiTaskPacket {
  readonly task: WikiTask;
  readonly prompt: string;
  readonly contextFiles: readonly string[];
  readonly expectedFiles: readonly string[];
  readonly constraints: readonly string[];
  readonly diagnostics?: WikiLintReport;
}

export interface WikiUpdateFile {
  readonly path: string;
  readonly content: string;
}

export interface WikiApplyResult {
  readonly proposalId: string;
  readonly files: readonly string[];
  readonly lint: WikiLintReport;
}

export interface RecordWikiRunInput {
  readonly task: string;
  readonly input: string;
  readonly output: string;
  readonly metadata?: Record<string, unknown>;
}

export interface WikiRun {
  readonly id: string;
  readonly path: string;
  readonly recordedAt: string;
}

export interface WikiAcceptedClaim {
  readonly text: string;
  readonly source: string;
}

export interface WikiAnswerProposalInput {
  readonly question: string;
  readonly summary: string;
  readonly acceptedClaims: readonly WikiAcceptedClaim[];
  readonly title?: string;
}

export interface PrepareWikiAnswerTaskInput {
  readonly question: string;
  readonly sourceIds: readonly string[];
  readonly title?: string;
}

export interface WikiProposal {
  readonly id: string;
  readonly digest: string;
  readonly kind: "answer";
  readonly note: string;
  readonly files: readonly WikiUpdateFile[];
  readonly baseHashes: Readonly<Record<string, string | null>>;
  readonly sourceHashes: Readonly<Record<string, string>>;
  readonly diagnostics: WikiLintReport;
}

export interface WikiApproval {
  readonly proposalId: string;
  readonly digest: string;
  readonly accepted: true;
  readonly reviewedBy: string;
  readonly reviewedAt: string;
}

interface WikiAnswerDraft {
  readonly path: string;
  readonly page: string;
  readonly input: WikiAnswerProposalInput;
}

interface WikiProposalContent {
  readonly kind: "answer";
  readonly note: string;
  readonly files: readonly WikiUpdateFile[];
  readonly baseHashes: Readonly<Record<string, string | null>>;
  readonly sourceHashes: Readonly<Record<string, string>>;
  readonly diagnostics: WikiLintReport;
}

const pageDirs = [
  "concepts",
  "entities",
  "sources",
  "syntheses",
  "questions",
  "playbooks",
  "failures",
  "decisions",
  "evals",
];

export async function initWiki(workspace: Workspace): Promise<WikiSnapshot> {
  return withWikiWriteLock(workspace, initWikiUnlocked);
}

async function initWikiUnlocked(workspace: Workspace): Promise<WikiSnapshot> {
  await assertWikiLayout(workspace, true);
  await Promise.all(wikiDirectories(workspace).map((path) => mkdir(path, { recursive: true })));
  await Promise.all([
    writeSeedFile(wikiPath(workspace, "schema.md"), schemaSeed()),
    writeSeedFile(wikiPath(workspace, "index.md"), "# Wiki Index\n"),
    writeSeedFile(wikiPath(workspace, "log.md"), "# Wiki Log\n"),
  ]);
  await assertWikiLayout(workspace, false);
  return { root: wikiPath(workspace) };
}

export async function addWikiSource(
  workspace: Workspace,
  input: AddWikiSourceInput,
  now: Date = new Date(),
): Promise<WikiSource> {
  const snapshot = { input: structuredClone(input), now: new Date(now.getTime()) };
  return withWikiWriteLock(workspace, (locked) =>
    addWikiSourceUnlocked(locked, snapshot.input, snapshot.now),
  );
}

export async function listWikiPages(workspace: Workspace): Promise<WikiPage[]> {
  await assertWikiPath(workspace, { path: "pages", type: "directory", allowMissing: false });
  const files = await markdownFileSet(wikiPath(workspace, "pages"));
  if (files.issues.length > 0) {
    throw new Error(files.issues[0]?.message);
  }
  return Promise.all(files.paths.map(readWikiPageFile));
}

export async function readWikiPage(workspace: Workspace, slug: string): Promise<WikiPage> {
  const pages = await listWikiPages(workspace);
  const page = pages.find((candidate) => candidate.metadata.slug === slug);
  if (page === undefined) {
    throw new Error(`Wiki page not found: ${slug}`);
  }
  return page;
}

export async function lintWiki(
  workspace: Workspace,
  now: Date = new Date(),
): Promise<WikiLintReport> {
  const issues = await requiredIssues(workspace);
  if (issues.length > 0) {
    return { issues };
  }
  return { issues: await contentIssues(workspace, now) };
}

export async function prepareWikiIngest(
  workspace: Workspace,
  sourceId: string,
): Promise<WikiTaskPacket> {
  const sourcePath = await findSourcePath(workspace, sourceId);
  const contextFiles = ["schema.md", "index.md", relativeWikiPath(workspace, sourcePath)];
  return validatedTaskPacket(
    workspace,
    taskPacket("ingest", ingestPrompt(sourceId), contextFiles, ingestTargets(sourceId)),
  );
}

export async function prepareWikiQuery(
  workspace: Workspace,
  question: string,
): Promise<WikiTaskPacket> {
  const pages = await selectQueryPages(workspace, question);
  const contextFiles = [
    "schema.md",
    "index.md",
    ...pages.map((page) => relativeWikiPath(workspace, page.path)),
  ];
  return validatedTaskPacket(
    workspace,
    taskPacket("query", queryPrompt(question), contextFiles, []),
  );
}

export async function prepareWikiEvolve(workspace: Workspace): Promise<WikiTaskPacket> {
  const [pages, report, runs] = await Promise.all([
    listWikiPages(workspace),
    lintWiki(workspace),
    recentRunFiles(workspace),
  ]);
  return validatedTaskPacket(workspace, evolvePacket(workspace, pages, report, runs));
}

export async function prepareWikiAnswerTask(
  workspace: Workspace,
  input: PrepareWikiAnswerTaskInput,
): Promise<WikiAnswerTask> {
  const snapshot = normalizedAnswerTaskInput(structuredClone(input));
  return withWikiWriteLock(workspace, (locked) => prepareWikiAnswerTaskLocked(locked, snapshot));
}

export async function validateCurrentWikiAnswerTask(
  workspace: Workspace,
  taskValue: unknown,
): Promise<WikiAnswerTask> {
  const task = parseWikiAnswerTask(taskValue);
  return withWikiWriteLock(workspace, async (locked) => {
    await assertAnswerTaskCurrent(locked, task);
    return task;
  });
}

async function prepareWikiAnswerTaskLocked(
  workspace: Workspace,
  input: PrepareWikiAnswerTaskInput,
): Promise<WikiAnswerTask> {
  await assertInitializedWiki(workspace);
  const packet = await prepareWikiQuery(workspace, input.question);
  const evidence = await answerTaskEvidence(workspace, input.sourceIds);
  const contexts = await readWikiContextFiles(workspace, [
    ...packet.contextFiles,
    ...evidence.map((source) => source.path),
  ]);
  return buildWikiAnswerTask({
    ...input,
    instructions: [packet.prompt, ...packet.constraints],
    contexts,
    evidence,
  });
}

export async function prepareWikiAnswerProposal(
  workspace: Workspace,
  input: WikiAnswerProposalInput,
  now: Date = new Date(),
): Promise<WikiProposal> {
  const snapshot = { input: structuredClone(input), now: new Date(now.getTime()) };
  validateAnswerInput(snapshot.input);
  return withWikiWriteLock(workspace, (locked) =>
    prepareWikiAnswerProposalLocked(locked, snapshot.input, snapshot.now),
  );
}

export async function prepareWikiAnswerProposalFromTask(
  workspace: Workspace,
  taskValue: unknown,
  resultValue: unknown,
  now: Date = new Date(),
): Promise<WikiProposal> {
  const task = parseWikiAnswerTask(taskValue);
  const result = parseWikiAnswerResult(resultValue);
  const input = answerDraftFromExchange(task, result);
  validateAnswerInput(input);
  return withWikiWriteLock(workspace, (locked) =>
    prepareTaskBoundProposal(locked, task, input, new Date(now.getTime())),
  );
}

async function prepareTaskBoundProposal(
  workspace: Workspace,
  task: WikiAnswerTask,
  input: WikiAnswerProposalDraft,
  now: Date,
): Promise<WikiProposal> {
  await assertAnswerTaskCurrent(workspace, task);
  return prepareWikiAnswerProposalLocked(workspace, input, now);
}

async function prepareWikiAnswerProposalLocked(
  workspace: Workspace,
  input: WikiAnswerProposalInput,
  now: Date,
): Promise<WikiProposal> {
  await assertInitializedWiki(workspace);
  return buildAnswerProposal(workspace, await answerDraft(workspace, input, now));
}

export async function applyWikiProposal(
  workspace: Workspace,
  proposal: WikiProposal,
  approval: WikiApproval,
  now: Date = new Date(),
): Promise<WikiApplyResult> {
  const snapshot = wikiApplicationSnapshot(proposal, approval, now);
  validateWikiProposal(snapshot.proposal);
  validateWikiApproval(snapshot.proposal, snapshot.approval);
  return withWikiWriteLock(workspace, (locked) =>
    applyApprovedWikiProposal(locked, snapshot.proposal, snapshot.approval, snapshot.now),
  );
}

function wikiApplicationSnapshot(proposal: WikiProposal, approval: WikiApproval, now: Date) {
  return {
    proposal: structuredClone(proposal),
    approval: structuredClone(approval),
    now: new Date(now.getTime()),
  };
}

export async function recordWikiRun(
  workspace: Workspace,
  input: RecordWikiRunInput,
  now: Date = new Date(),
): Promise<WikiRun> {
  const snapshot = { input: structuredClone(input), now: new Date(now.getTime()) };
  return withWikiWriteLock(workspace, (locked) =>
    recordWikiRunUnlocked(locked, snapshot.input, snapshot.now),
  );
}

export function renderWikiPage(metadata: WikiPageMetadata, body: string): string {
  return `---\n${renderFrontmatter(metadata)}---\n\n${body.trim()}\n`;
}

export function parseWikiPage(content: string, path = ""): WikiPage {
  return {
    metadata: parseMetadata(frontmatter(content)),
    path,
    content,
  };
}

export function parseWikiProposal(value: unknown): WikiProposal {
  if (!wikiProposalObject(value)) {
    throw new Error("Wiki proposal artifact is invalid");
  }
  const proposal = structuredClone(value);
  validateWikiProposal(proposal);
  return proposal;
}

const wikiProposalKeys = [
  "id",
  "digest",
  "kind",
  "note",
  "files",
  "baseHashes",
  "sourceHashes",
  "diagnostics",
];

function wikiProposalObject(value: unknown): value is WikiProposal {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return false;
  }
  const proposal = value as Partial<WikiProposal>;
  return (
    hasExactKeys(value, wikiProposalKeys) &&
    proposal.kind === "answer" &&
    typeof proposal.id === "string" &&
    typeof proposal.digest === "string" &&
    typeof proposal.note === "string" &&
    Array.isArray(proposal.files) &&
    proposal.files.every(wikiUpdateFileObject) &&
    recordObject(proposal.baseHashes) &&
    recordObject(proposal.sourceHashes) &&
    wikiLintReportObject(proposal.diagnostics)
  );
}

function wikiUpdateFileObject(value: unknown): value is WikiUpdateFile {
  return (
    typeof value === "object" &&
    value !== null &&
    hasExactKeys(value, ["path", "content"]) &&
    "path" in value &&
    typeof value.path === "string" &&
    "content" in value &&
    typeof value.content === "string"
  );
}

function wikiLintReportObject(value: unknown): value is WikiLintReport {
  return (
    typeof value === "object" &&
    value !== null &&
    hasExactKeys(value, ["issues"]) &&
    "issues" in value &&
    Array.isArray(value.issues) &&
    value.issues.every(
      (candidate) =>
        typeof candidate === "object" &&
        candidate !== null &&
        hasExactKeys(candidate, ["code", "path", "message"]) &&
        "code" in candidate &&
        typeof candidate.code === "string" &&
        "path" in candidate &&
        typeof candidate.path === "string" &&
        "message" in candidate &&
        typeof candidate.message === "string",
    )
  );
}

function recordObject(value: unknown): value is Readonly<Record<string, unknown>> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function hasExactKeys(value: object, expected: readonly string[]): boolean {
  return JSON.stringify(Object.keys(value).sort()) === JSON.stringify([...expected].sort());
}

async function addWikiSourceUnlocked(
  workspace: Workspace,
  input: AddWikiSourceInput,
  now: Date,
): Promise<WikiSource> {
  await initWikiUnlocked(workspace);
  const imported = await readWorkspaceSource(workspace, input.path);
  const source = wikiSource(workspace, input, sourceId(input.title, imported.content), now);
  await assertNewSourceId(workspace, source.id);
  await promoteManagedWikiFile(
    workspace,
    {
      path: relativeWikiPath(workspace, source.path),
      content: imported.content,
      mode: imported.mode,
    },
    `## [${now.toISOString()}] source | ${auditValue(input.title)} | ${source.id}`,
  );
  return source;
}

function wikiSource(
  workspace: Workspace,
  input: AddWikiSourceInput,
  id: string,
  now: Date,
): WikiSource {
  return {
    id,
    title: input.title,
    path: join(wikiPath(workspace), "raw", "sources", sourceName(input.path, id)),
    addedAt: now.toISOString(),
  };
}

function sourceName(path: string, id: string): string {
  return `${id}${extname(path) || ".md"}`;
}

function sourceId(title: string, content: Buffer): string {
  return `${slugify(title)}-${createHash("sha256").update(content).digest("hex").slice(0, 32)}`;
}

async function findSourcePath(workspace: Workspace, sourceId: string): Promise<string> {
  const root = wikiPath(workspace, "raw", "sources");
  await assertWikiPath(workspace, {
    path: "raw/sources",
    type: "directory",
    allowMissing: false,
  });
  const names = (await readdir(root))
    .filter((candidate) => sourceFileId(candidate) === sourceId)
    .sort();
  if (names.length === 0) {
    throw new Error(`Wiki source not found: ${sourceId}`);
  }
  if (names.length > 1) {
    throw new Error(`Wiki source id is ambiguous: ${sourceId}`);
  }
  const name = names[0] ?? "";
  return (await resolveWikiSource(workspace, `raw/sources/${name}`)).path;
}

async function assertNewSourceId(workspace: Workspace, sourceId: string): Promise<void> {
  const names = await readdir(wikiPath(workspace, "raw", "sources"));
  if (names.some((candidate) => sourceFileId(candidate) === sourceId)) {
    throw new Error(`Wiki source id is already registered: ${sourceId}`);
  }
}

function sourceFileId(name: string): string {
  const extension = extname(name);
  return extension.length === 0 ? name : name.slice(0, -extension.length);
}

function normalizedAnswerTaskInput(input: PrepareWikiAnswerTaskInput): PrepareWikiAnswerTaskInput {
  if (
    !Array.isArray(input.sourceIds) ||
    input.sourceIds.some((sourceId) => typeof sourceId !== "string")
  ) {
    throw new Error("Wiki answer task requires a question and at least one valid source id");
  }
  const sourceIds = unique(input.sourceIds.map((sourceId) => sourceId.trim())).sort();
  if (
    !validTaskQuestion(input.question) ||
    !validTaskSources(sourceIds) ||
    !validTitle(input.title)
  ) {
    throw new Error("Wiki answer task requires a question and at least one valid source id");
  }
  const normalized = { question: input.question.trim(), sourceIds };
  return input.title === undefined ? normalized : { ...normalized, title: input.title.trim() };
}

function validTaskQuestion(question: string): boolean {
  return boundedOneLine(question, 10_000);
}

function validTaskSources(sourceIds: readonly string[]): boolean {
  return (
    sourceIds.length > 0 &&
    sourceIds.length <= 100 &&
    sourceIds.every((sourceId) => boundedOneLine(sourceId, 500))
  );
}

async function answerTaskEvidence(
  workspace: Workspace,
  sourceIds: readonly string[],
): Promise<WikiAnswerTaskEvidence[]> {
  const evidence: WikiAnswerTaskEvidence[] = [];
  for (const id of sourceIds) {
    const path = await findSourcePath(workspace, id);
    evidence.push({ id, path: relativeWikiPath(workspace, path) });
  }
  return evidence;
}

async function assertAnswerTaskCurrent(workspace: Workspace, task: WikiAnswerTask): Promise<void> {
  const input = {
    question: task.question,
    sourceIds: task.evidence.map((source) => source.id),
  };
  const current = await prepareWikiAnswerTaskLocked(
    workspace,
    task.title === undefined ? input : { ...input, title: task.title },
  );
  if (current.digest !== task.digest) {
    throw new Error("Wiki answer task is stale or was not prepared from the current wiki");
  }
}

function taskPacket(
  task: WikiTask,
  prompt: string,
  contextFiles: readonly string[],
  expectedFiles: readonly string[],
): WikiTaskPacket {
  return {
    task,
    prompt,
    contextFiles,
    expectedFiles,
    constraints: taskConstraints(),
  };
}

async function validatedTaskPacket(
  workspace: Workspace,
  packet: WikiTaskPacket,
): Promise<WikiTaskPacket> {
  await Promise.all(
    packet.contextFiles.map((path) =>
      assertWikiPath(workspace, { path, type: "file", allowMissing: false }),
    ),
  );
  return packet;
}

function ingestTargets(sourceId: string): string[] {
  return [
    "index.md",
    `pages/sources/${sourceId}.md`,
    `pages/concepts/${sourceId}.md`,
    "pages/entities/*.md",
    "pages/syntheses/*.md",
  ];
}

function ingestPrompt(sourceId: string): string {
  return [
    `Ingest source ${sourceId} into the LLM Wiki.`,
    "Read schema.md first, then index.md, then the raw source.",
    "Preserve source coverage before compression: keep distinct operating models, practices, risks, and tradeoffs as separate source-backed claims.",
    "Create or update source, concept, entity, and synthesis pages when the source contains reusable knowledge beyond a one-off summary.",
    "Flag contradictions with conflicted pages instead of overwriting silently.",
    "Prepare candidate page and index changes only. Ingest approval and promotion are not implemented yet.",
  ].join("\n");
}

function queryPrompt(question: string): string {
  return [
    "Answer from the LLM Wiki.",
    "Read index.md first, then the provided relevant pages.",
    "Cite page/source paths for accepted claims.",
    "Prepare reusable answers as reviewable proposals with explicit claim/source pairs.",
    `Question: ${question}`,
  ].join("\n");
}

function taskConstraints(): string[] {
  return [
    "Do not invent accepted claims without sources.",
    "Keep hypotheses distinct from accepted facts.",
    ...writingConstraints(),
    "Keep one main idea per sentence and split sentences that are hard to understand in one pass.",
    "Prefer small markdown updates with explicit links.",
    "Preserve raw sources as immutable evidence.",
    "Keep index.md content-oriented; the wiki package owns chronological log writes.",
  ];
}

function writingConstraints(): string[] {
  return [
    "Avoid stale metaphors, similes, idioms, and stock phrases.",
    "Prefer short, familiar words when they express the same meaning.",
    "Remove every word that does not add meaning.",
    "Prefer active voice when it makes the actor and action clearer.",
    "Replace foreign phrases, scientific terms, and jargon with everyday language when possible; explain terms needed for precision.",
    "Treat these as judgment rules, not rigid formulas; break one when following it would make the writing inaccurate, unclear, or unnatural.",
  ];
}

function evolvePacket(
  workspace: Workspace,
  pages: readonly WikiPage[],
  report: WikiLintReport,
  runs: readonly string[],
): WikiTaskPacket {
  return {
    task: "evolve",
    prompt: evolvePrompt(report),
    contextFiles: evolveContextFiles(workspace, pages, report, runs),
    expectedFiles: evolveTargets(),
    constraints: evolveConstraints(),
    diagnostics: report,
  };
}

function evolvePrompt(report: WikiLintReport): string {
  return [
    "Evolve the LLM Wiki without calling model APIs from this package.",
    `Start with ${report.issues.length} deterministic lint issue(s).`,
    "Read schema.md, index.md, log.md, candidate pages, and recent run records.",
    "Prepare the smallest candidate update that improves durable knowledge quality.",
    "Evolve approval and promotion are not implemented yet; do not write the live wiki.",
    "If no safe improvement exists, record the reason instead of editing pages.",
  ].join("\n");
}

function evolveContextFiles(
  workspace: Workspace,
  pages: readonly WikiPage[],
  report: WikiLintReport,
  runs: readonly string[],
): string[] {
  return unique([
    "schema.md",
    "index.md",
    "log.md",
    ...evolvePageFiles(workspace, pages, report),
    ...runs,
  ]);
}

function evolveTargets(): string[] {
  return ["index.md", "pages/**/*.md"];
}

function evolveConstraints(): string[] {
  return [
    ...taskConstraints(),
    "Do not modify raw/sources or raw/runs from an evolve update.",
    "Do not resolve conflicted pages without explicit source support.",
    "Prefer one coherent improvement per evolve run.",
    "Record durable uncertainty in a sourced page; the package owns log.md.",
  ];
}

async function selectQueryPages(workspace: Workspace, question: string): Promise<WikiPage[]> {
  const pages = await listWikiPages(workspace);
  const tokens = queryTokens(question);
  return pages.filter((page) => pageMatches(page, tokens)).slice(0, 5);
}

function queryTokens(question: string): string[] {
  return question
    .toLowerCase()
    .split(/[^a-z0-9가-힣]+/)
    .filter((token) => token.length > 1);
}

function pageMatches(page: WikiPage, tokens: readonly string[]): boolean {
  const text = `${page.metadata.title}\n${page.metadata.slug}\n${page.content}`.toLowerCase();
  return tokens.length === 0 || tokens.some((token) => text.includes(token));
}

async function recentRunFiles(workspace: Workspace): Promise<string[]> {
  const root = wikiPath(workspace, "raw", "runs");
  await assertWikiPath(workspace, { path: "raw/runs", type: "directory", allowMissing: false });
  const names = await readdir(root);
  const paths = names
    .filter((name) => name.endsWith(".json"))
    .sort()
    .slice(-5)
    .map((name) => `raw/runs/${name}`);
  await Promise.all(
    paths.map((path) => assertWikiPath(workspace, { path, type: "file", allowMissing: false })),
  );
  return paths;
}

function evolvePageFiles(
  workspace: Workspace,
  pages: readonly WikiPage[],
  report: WikiLintReport,
): string[] {
  const issuePaths = new Set(report.issues.map((candidate) => candidate.path));
  const candidates = pages.filter((page) => issuePaths.has(page.path));
  return selectedEvolvePages(candidates.length > 0 ? candidates : pages, workspace);
}

function selectedEvolvePages(pages: readonly WikiPage[], workspace: Workspace): string[] {
  return pages.slice(0, 10).map((page) => relativeWikiPath(workspace, page.path));
}

function unique(values: readonly string[]): string[] {
  return [...new Set(values)];
}

function wikiPath(workspace: Workspace, ...parts: string[]): string {
  return join(workspace.root, "wiki", ...parts);
}

function relativeWikiPath(workspace: Workspace, path: string): string {
  return relative(wikiPath(workspace), path);
}

function wikiDirectories(workspace: Workspace): string[] {
  return [
    wikiPath(workspace, "raw", "sources"),
    wikiPath(workspace, "raw", "runs"),
    ...pageDirs.map((dir) => wikiPath(workspace, "pages", dir)),
  ];
}

async function assertWikiLayout(workspace: Workspace, allowMissing: boolean): Promise<void> {
  await Promise.all(
    wikiLayoutExpectations(allowMissing).map((expectation) =>
      assertWikiPath(workspace, expectation),
    ),
  );
}

function wikiLayoutExpectations(allowMissing: boolean): WikiPathExpectation[] {
  return [
    ...[
      "",
      "raw",
      "raw/sources",
      "raw/runs",
      "pages",
      ...pageDirs.map((dir) => `pages/${dir}`),
    ].map((path) => ({ path, type: "directory" as const, allowMissing })),
    ...["schema.md", "index.md", "log.md"].map((path) => ({
      path,
      type: "file" as const,
      allowMissing,
    })),
  ];
}

async function writeSeedFile(path: string, content: string): Promise<void> {
  try {
    await writeFile(path, content, { encoding: "utf8", flag: "wx" });
  } catch (error) {
    if (!isFileExistsError(error)) {
      throw error;
    }
  }
}

async function readWikiPageFile(path: string): Promise<WikiPage> {
  const info = await lstat(path);
  if (info.isSymbolicLink() || !info.isFile()) {
    throw new Error(`Wiki page is not a regular file: ${path}`);
  }
  return parseWikiPage(await readFile(path, "utf8"), path);
}

interface MarkdownFileSet {
  readonly paths: readonly string[];
  readonly issues: readonly WikiLintIssue[];
}

async function markdownFileSet(root: string): Promise<MarkdownFileSet> {
  const entries = await readdir(root, { withFileTypes: true });
  const nested = await Promise.all(entries.map((entry) => childMarkdownFileSet(root, entry)));
  return {
    paths: nested.flatMap((result) => result.paths).sort(),
    issues: nested.flatMap((result) => result.issues),
  };
}

async function childMarkdownFileSet(
  root: string,
  entry: {
    name: string;
    isDirectory(): boolean;
    isFile(): boolean;
    isSymbolicLink(): boolean;
  },
): Promise<MarkdownFileSet> {
  const path = join(root, entry.name);
  if (entry.isDirectory()) {
    return markdownFileSet(path);
  }
  if (entry.isSymbolicLink() || (entry.name.endsWith(".md") && !entry.isFile())) {
    return {
      paths: [],
      issues: [issue("unsafe-page-path", path, "Wiki page path is not a regular file")],
    };
  }
  return { paths: entry.name.endsWith(".md") ? [path] : [], issues: [] };
}

async function requiredIssues(workspace: Workspace): Promise<WikiLintIssue[]> {
  return Promise.all(
    wikiLayoutExpectations(false).map((expectation) => requiredLayoutIssue(workspace, expectation)),
  ).then((results) => results.filter((issue): issue is WikiLintIssue => issue !== undefined));
}

async function requiredLayoutIssue(
  workspace: Workspace,
  expectation: WikiPathExpectation,
): Promise<WikiLintIssue | undefined> {
  const path = wikiPath(workspace, expectation.path);
  try {
    const info = await lstat(path);
    return validLayoutType(info, expectation.type)
      ? undefined
      : issue("unsafe-required-path", path, `Required wiki ${expectation.type} is unsafe`);
  } catch {
    return issue("missing-required-path", path, "Required wiki path is missing");
  }
}

function validLayoutType(
  info: { isDirectory(): boolean; isFile(): boolean; isSymbolicLink(): boolean },
  type: WikiPathExpectation["type"],
): boolean {
  return !info.isSymbolicLink() && (type === "directory" ? info.isDirectory() : info.isFile());
}

async function requiredIssue(path: string): Promise<WikiLintIssue | undefined> {
  try {
    await stat(path);
    return undefined;
  } catch {
    return issue("missing-required-path", path, "Required wiki path is missing");
  }
}

async function assertInitializedWiki(workspace: Workspace): Promise<void> {
  const issues = await requiredIssues(workspace);
  if (issues.length > 0) {
    throw new Error("Wiki must be initialized before preparing a proposal");
  }
}

function validateWikiProposal(proposal: WikiProposal): void {
  validateProposalShape(proposal);
  validateProposalFiles(proposal.files);
  validateProposalPreconditions(proposal);
  if (proposal.digest !== proposalDigest(proposal)) {
    throw new Error("Wiki proposal digest does not match its reviewed content");
  }
  if (proposal.id !== `answer-${proposal.digest}`) {
    throw new Error("Wiki proposal id does not match its digest");
  }
}

function validateProposalShape(proposal: WikiProposal): void {
  if (proposal.kind !== "answer" || proposal.files.length !== 2) {
    throw new Error("Unsupported wiki proposal shape");
  }
  if (proposal.note.trim().length === 0) {
    throw new Error("Wiki proposal requires a note");
  }
}

function validateProposalFiles(files: readonly WikiUpdateFile[]): void {
  const paths = files.map((file) => file.path);
  if (new Set(paths).size !== paths.length) {
    throw new Error("Wiki proposal contains duplicate target paths");
  }
  for (const file of files) {
    validateProposalFile(file);
  }
  if (!paths.includes("index.md") || !paths.some(questionPagePath)) {
    throw new Error("Answer proposal must include index.md and one question page");
  }
  validateAnswerProposalPage(files);
}

function validateProposalFile(file: WikiUpdateFile): void {
  if (!canonicalProposalPath(file.path)) {
    throw new Error(`Unsupported wiki proposal path: ${file.path}`);
  }
  if (file.path.startsWith("pages/")) {
    assertValidPageUpdate(file);
  }
}

function canonicalProposalPath(path: string): boolean {
  return (
    !path.includes("\\") &&
    posix.normalize(path) === path &&
    (path === "index.md" || questionPagePath(path))
  );
}

function questionPagePath(path: string): boolean {
  return /^pages\/questions\/[^/]+\.md$/.test(path);
}

function assertValidPageUpdate(file: WikiUpdateFile): void {
  const page = parseWikiPage(file.content, file.path);
  const issues = acceptedClaimIssues(page);
  if (issues.length > 0) {
    throw new Error(`Invalid wiki page update: ${issues[0]?.message}`);
  }
}

function validateAnswerProposalPage(files: readonly WikiUpdateFile[]): void {
  const file = files.find((candidate) => questionPagePath(candidate.path));
  if (file === undefined) {
    throw new Error("Answer proposal is missing its question page");
  }
  const page = parseWikiPage(file.content, file.path);
  const claimSources = unique(acceptedClaimRecords(page).map((claim) => claim.source));
  if (
    page.metadata.kind !== "question" ||
    page.metadata.status !== "active" ||
    page.metadata.slug !== posix.basename(file.path, ".md") ||
    claimSources.length === 0 ||
    JSON.stringify(page.metadata.sources) !== JSON.stringify(claimSources)
  ) {
    throw new Error("Answer proposal page does not match its explicit accepted claims");
  }
}

async function recordWikiRunUnlocked(
  workspace: Workspace,
  input: RecordWikiRunInput,
  now: Date,
): Promise<WikiRun> {
  await initWikiUnlocked(workspace);
  const id = runId(input, now);
  const path = wikiPath(workspace, "raw", "runs", `${id}.json`);
  await promoteManagedWikiFile(
    workspace,
    {
      path: relativeWikiPath(workspace, path),
      content: `${JSON.stringify(runRecord(input, now), null, 2)}\n`,
    },
    `## [${now.toISOString()}] run | ${auditValue(input.task)} | ${id}`,
  );
  return { id, path, recordedAt: now.toISOString() };
}

async function promoteManagedWikiFile(
  workspace: Workspace,
  file: WikiTransactionFile,
  auditEntry: string,
): Promise<void> {
  await promoteWikiFiles(workspace, {
    files: [{ ...file, createOnly: true }],
    auditEntry,
    validate: validateManagedWikiCandidate,
  });
}

async function validateManagedWikiCandidate(workspace: Workspace): Promise<WikiLintReport> {
  await assertWikiLayout(workspace, false);
  return { issues: [] };
}

function runId(input: RecordWikiRunInput, now: Date): string {
  const hash = createHash("sha256")
    .update(`${input.task}\n${input.input}\n${input.output}`)
    .digest("hex");
  return `${now.toISOString().replace(/[:.]/g, "-")}-${slugify(input.task)}-${hash.slice(0, 8)}`;
}

function runRecord(input: RecordWikiRunInput, now: Date) {
  return {
    task: input.task,
    input: input.input,
    output: input.output,
    metadata: input.metadata ?? {},
    recordedAt: now.toISOString(),
  };
}

async function questionMetadata(
  workspace: Workspace,
  input: WikiAnswerProposalInput,
  path: string,
  now: Date,
): Promise<WikiPageMetadata> {
  const existing = await optionalWikiPage(workspace, path);
  const timestamp = now.toISOString();
  return {
    title: input.title ?? input.question,
    slug: slugify(input.title ?? input.question),
    kind: "question",
    status: "active",
    createdAt: existing?.metadata.createdAt ?? timestamp,
    updatedAt: timestamp,
    sources: unique(input.acceptedClaims.map((claim) => claim.source)),
  };
}

function questionBody(input: WikiAnswerProposalInput): string {
  return `## Question\n\n${input.question}\n\n## Summary\n\n${input.summary}\n\n## Key Claims\n\n${answerClaims(input.acceptedClaims)}\n\n## Links\n\n`;
}

function answerClaims(claims: readonly WikiAcceptedClaim[]): string {
  return claims.map((claim) => `- accepted: ${claim.text}\n  source: ${claim.source}`).join("\n");
}

async function answerDraft(
  workspace: Workspace,
  input: WikiAnswerProposalInput,
  now: Date,
): Promise<WikiAnswerDraft> {
  const normalized = await normalizedAnswerInput(workspace, input);
  const path = answerPath(normalized);
  return {
    path,
    page: renderWikiPage(
      await questionMetadata(workspace, normalized, path, now),
      questionBody(normalized),
    ),
    input: normalized,
  };
}

function answerPath(input: WikiAnswerProposalInput): string {
  return `pages/questions/${slugify(input.title ?? input.question)}.md`;
}

async function indexWithAnswer(
  workspace: Workspace,
  path: string,
  input: WikiAnswerProposalInput,
): Promise<string> {
  const index = await readFile(wikiPath(workspace, "index.md"), "utf8");
  if (index.includes(`(${path})`)) {
    return index;
  }
  return `${index.trimEnd()}\n- [${markdownLabel(input.title ?? input.question)}](${path})\n`;
}

async function optionalWikiPage(workspace: Workspace, path: string): Promise<WikiPage | undefined> {
  return readFile(wikiPath(workspace, path), "utf8")
    .then((content) => parseWikiPage(content, wikiPath(workspace, path)))
    .catch(optionalMissingFile);
}

function updateFile(path: string, content: string): WikiUpdateFile {
  return { path, content };
}

async function normalizedAnswerInput(
  workspace: Workspace,
  input: WikiAnswerProposalInput,
): Promise<WikiAnswerProposalInput> {
  const acceptedClaims = await canonicalAcceptedClaims(workspace, input.acceptedClaims);
  return input.title === undefined
    ? { question: input.question.trim(), summary: input.summary.trim(), acceptedClaims }
    : {
        question: input.question.trim(),
        summary: input.summary.trim(),
        acceptedClaims,
        title: input.title.trim(),
      };
}

async function canonicalAcceptedClaims(
  workspace: Workspace,
  claims: readonly WikiAcceptedClaim[],
): Promise<WikiAcceptedClaim[]> {
  const normalized: WikiAcceptedClaim[] = [];
  for (const claim of claims) {
    validateAcceptedClaim(claim);
    await resolveWikiSource(workspace, claim.source);
    const candidate = { text: claim.text.trim(), source: claim.source };
    if (!normalized.some((existing) => sameAcceptedClaim(existing, candidate))) {
      normalized.push(candidate);
    }
  }
  return normalized;
}

function sameAcceptedClaim(left: WikiAcceptedClaim, right: WikiAcceptedClaim): boolean {
  return left.source === right.source && normalizeClaim(left.text) === normalizeClaim(right.text);
}

function validateAcceptedClaim(claim: WikiAcceptedClaim): void {
  if (
    claim.text.trim().length === 0 ||
    claim.text.length > 10_000 ||
    /[\r\n]/.test(claim.text) ||
    unsafeTextControl(claim.text)
  ) {
    throw new Error("Accepted wiki claims must contain one non-empty line");
  }
  if (claim.source.trim().length === 0 || /[\r\n]/.test(claim.source)) {
    throw new Error("Accepted wiki claims require one managed source path");
  }
}

async function buildAnswerProposal(
  workspace: Workspace,
  draft: WikiAnswerDraft,
): Promise<WikiProposal> {
  const files = await answerProposalFiles(workspace, draft);
  const content = await answerProposalContent(workspace, draft, files);
  const digest = proposalDigest(content);
  return { ...content, id: `answer-${digest}`, digest };
}

async function answerProposalFiles(
  workspace: Workspace,
  draft: WikiAnswerDraft,
): Promise<WikiUpdateFile[]> {
  return [
    updateFile("index.md", await indexWithAnswer(workspace, draft.path, draft.input)),
    updateFile(draft.path, draft.page),
  ];
}

async function answerProposalContent(
  workspace: Workspace,
  draft: WikiAnswerDraft,
  files: readonly WikiUpdateFile[],
): Promise<WikiProposalContent> {
  const [baseHashes, sourceHashes, diagnostics] = await Promise.all([
    hashWikiFiles(workspace, proposalBasePaths(files)),
    answerSourceHashes(workspace, draft.input.acceptedClaims),
    previewWikiFiles(workspace, files, lintWiki),
  ]);
  return {
    kind: "answer",
    note: `file answer | ${draft.input.question}`,
    files,
    baseHashes,
    sourceHashes,
    diagnostics,
  };
}

async function answerSourceHashes(
  workspace: Workspace,
  claims: readonly WikiAcceptedClaim[],
): Promise<Record<string, string>> {
  const entries = await Promise.all(
    unique(claims.map((claim) => claim.source))
      .sort()
      .map(async (source) => [source, (await resolveWikiSource(workspace, source)).hash] as const),
  );
  return Object.fromEntries(entries);
}

function proposalBasePaths(files: readonly WikiUpdateFile[]): string[] {
  return unique(["schema.md", ...files.map((file) => file.path)]).sort();
}

function proposalDigest(proposal: WikiProposalContent | WikiProposal): string {
  return sha256(JSON.stringify(proposalDigestPayload(proposal)));
}

function proposalDigestPayload(proposal: WikiProposalContent | WikiProposal) {
  return {
    kind: proposal.kind,
    note: proposal.note,
    files: [...proposal.files].sort((left, right) => left.path.localeCompare(right.path)),
    baseHashes: sortedRecordEntries(proposal.baseHashes),
    sourceHashes: sortedRecordEntries(proposal.sourceHashes),
    diagnostics: sortedIssues(proposal.diagnostics.issues),
  };
}

function sortedRecordEntries<T>(record: Readonly<Record<string, T>>): [string, T][] {
  return Object.entries(record).sort(([left], [right]) => left.localeCompare(right));
}

function sortedIssues(issues: readonly WikiLintIssue[]): WikiLintIssue[] {
  return [...issues].sort((left, right) =>
    `${left.path}\n${left.code}\n${left.message}`.localeCompare(
      `${right.path}\n${right.code}\n${right.message}`,
    ),
  );
}

function validateProposalPreconditions(proposal: WikiProposal): void {
  assertRecordKeys(proposal.baseHashes, proposalBasePaths(proposal.files), "base hash");
  assertRecordKeys(proposal.sourceHashes, proposalSources(proposal), "source hash");
  for (const hash of Object.values(proposal.baseHashes)) {
    assertHash(hash, true);
  }
  for (const hash of Object.values(proposal.sourceHashes)) {
    assertHash(hash, false);
  }
}

function proposalSources(proposal: WikiProposal): string[] {
  const page = proposal.files.find((file) => questionPagePath(file.path));
  return page === undefined ? [] : [...parseWikiPage(page.content).metadata.sources].sort();
}

function assertRecordKeys<T>(
  record: Readonly<Record<string, T>>,
  expected: readonly string[],
  label: string,
): void {
  if (JSON.stringify(Object.keys(record).sort()) !== JSON.stringify([...expected].sort())) {
    throw new Error(`Wiki proposal ${label} keys do not match its content`);
  }
}

function assertHash(hash: string | null, nullable: boolean): void {
  if ((hash === null && nullable) || (typeof hash === "string" && /^[a-f0-9]{64}$/.test(hash))) {
    return;
  }
  throw new Error("Wiki proposal contains an invalid content hash");
}

function validateWikiApproval(proposal: WikiProposal, approval: WikiApproval): void {
  if (
    approval.accepted !== true ||
    approval.proposalId !== proposal.id ||
    approval.digest !== proposal.digest
  ) {
    throw new Error("Wiki approval does not match the reviewed proposal");
  }
  if (approval.reviewedBy.trim().length === 0 || !validIsoDate(approval.reviewedAt)) {
    throw new Error("Wiki approval requires a reviewer and ISO review timestamp");
  }
  if (Date.parse(approval.reviewedAt) < proposalUpdatedAt(proposal)) {
    throw new Error("Wiki approval cannot predate the reviewed proposal");
  }
}

function validIsoDate(value: string): boolean {
  const timestamp = Date.parse(value);
  return !Number.isNaN(timestamp) && new Date(timestamp).toISOString() === value;
}

function proposalUpdatedAt(proposal: WikiProposal): number {
  const page = proposal.files.find((file) => questionPagePath(file.path));
  return page === undefined
    ? Number.POSITIVE_INFINITY
    : Date.parse(parseWikiPage(page.content).metadata.updatedAt);
}

async function applyApprovedWikiProposal(
  workspace: Workspace,
  proposal: WikiProposal,
  approval: WikiApproval,
  now: Date,
): Promise<WikiApplyResult> {
  await assertProposalNotApplied(workspace, proposal.id);
  await assertProposalState(workspace, proposal);
  if (proposal.diagnostics.issues.length > 0) {
    throw new WikiCandidateValidationError(proposal.diagnostics);
  }
  const result = await promoteWikiFiles(workspace, {
    files: proposal.files,
    auditEntry: proposalAuditEntry(proposal, approval, now),
    validate: lintWiki,
    prePromote: () => assertProposalState(workspace, proposal),
  });
  return { proposalId: proposal.id, files: result.files, lint: result.lint };
}

async function assertProposalNotApplied(workspace: Workspace, id: string): Promise<void> {
  await assertWikiPath(workspace, { path: "log.md", type: "file", allowMissing: false });
  const log = await readFile(wikiPath(workspace, "log.md"), "utf8");
  if (log.includes(`proposal | ${id} |`)) {
    throw new Error(`Wiki proposal was already applied: ${id}`);
  }
}

async function assertProposalState(workspace: Workspace, proposal: WikiProposal): Promise<void> {
  const [baseHashes, sourceHashes] = await Promise.all([
    hashWikiFiles(workspace, Object.keys(proposal.baseHashes)),
    currentSourceHashes(workspace, Object.keys(proposal.sourceHashes)),
  ]);
  assertHashesMatch(proposal.baseHashes, baseHashes);
  assertHashesMatch(proposal.sourceHashes, sourceHashes);
}

async function currentSourceHashes(
  workspace: Workspace,
  sources: readonly string[],
): Promise<Record<string, string>> {
  const entries = await Promise.all(
    sources.map(
      async (source) => [source, (await resolveWikiSource(workspace, source)).hash] as const,
    ),
  );
  return Object.fromEntries(entries);
}

function assertHashesMatch<T>(
  expected: Readonly<Record<string, T>>,
  current: Readonly<Record<string, T>>,
): void {
  for (const [path, hash] of Object.entries(expected)) {
    if (current[path] !== hash) {
      throw new Error(`Wiki proposal is stale: ${path}`);
    }
  }
}

function proposalAuditEntry(
  proposal: WikiProposal,
  approval: WikiApproval,
  appliedAt: Date,
): string {
  return `## [${appliedAt.toISOString()}] proposal | ${proposal.id} | digest=${
    proposal.digest
  } | reviewer=${auditValue(approval.reviewedBy)} | reviewedAt=${
    approval.reviewedAt
  } | ${auditValue(proposal.note)}`;
}

function auditValue(value: string): string {
  return value
    .replace(/[\r\n|]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function markdownLabel(value: string): string {
  return value.replace(/\\/g, "\\\\").replace(/\[/g, "\\[").replace(/\]/g, "\\]");
}

function optionalMissingFile(error: unknown): undefined {
  if (isNodeError(error, "ENOENT")) {
    return undefined;
  }
  throw error;
}

async function contentIssues(workspace: Workspace, now: Date): Promise<WikiLintIssue[]> {
  const { pages, issues } = await readPageSet(workspace);
  const pageIssueGroups = await Promise.all(
    pages.map((page) => pageIssues(workspace, page, pages, now)),
  );
  return [
    ...issues,
    ...pageIssueGroups.flat(),
    ...duplicateSlugIssues(pages),
    ...duplicateAcceptedClaimIssues(pages),
    ...(await indexIssues(workspace, pages)),
  ];
}

interface WikiPageSet {
  readonly pages: readonly WikiPage[];
  readonly issues: readonly WikiLintIssue[];
}

async function readPageSet(workspace: Workspace): Promise<WikiPageSet> {
  const files = await markdownFileSet(wikiPath(workspace, "pages"));
  const results = await Promise.all(files.paths.map(readWikiPageResult));
  return {
    pages: results.flatMap((result) => result.pages),
    issues: [...files.issues, ...results.flatMap((result) => result.issues)],
  };
}

async function readWikiPageResult(path: string): Promise<WikiPageSet> {
  try {
    return { pages: [await readWikiPageFile(path)], issues: [] };
  } catch (error) {
    return { pages: [], issues: [invalidFrontmatterIssue(path, error)] };
  }
}

async function pageIssues(
  workspace: Workspace,
  page: WikiPage,
  pages: readonly WikiPage[],
  now: Date,
): Promise<WikiLintIssue[]> {
  return [
    ...brokenLinkIssues(page, pages),
    ...acceptedClaimIssues(page),
    ...staleTodoIssues(page),
    ...conflictedPageIssues(page),
    ...reviewPageIssues(page),
    ...invalidReviewAfterIssues(page),
    ...staleReviewIssues(page, now),
    ...(await sourceReferenceIssues(workspace, page)),
    ...orphanPageIssues(page, pages),
  ];
}

function brokenLinkIssues(page: WikiPage, pages: readonly WikiPage[]): WikiLintIssue[] {
  return wikiLinks(page.content)
    .filter((slug) => !wikiLinkExists(slug, pages))
    .map((slug) => issue("broken-wiki-link", page.path, `Wiki link target is missing: ${slug}`));
}

function wikiLinkExists(slug: string, pages: readonly WikiPage[]): boolean {
  return slug.trim().length > 0 && pages.some((page) => page.metadata.slug === slug.trim());
}

function acceptedClaimIssues(page: WikiPage): WikiLintIssue[] {
  return page.content
    .split("\n")
    .flatMap((line, index, lines) => acceptedClaimIssue(page.path, line, lines[index + 1]));
}

function acceptedClaimIssue(path: string, line: string, next?: string): WikiLintIssue[] {
  if (!line.trimStart().startsWith("- accepted:")) {
    return [];
  }
  if (acceptedClaimText(line) === undefined) {
    return [issue("empty-accepted-claim", path, "Accepted claim requires text")];
  }
  return acceptedClaimSource(next ?? "").length > 0
    ? []
    : [issue("accepted-claim-missing-source", path, "Accepted claim requires a source")];
}

function staleTodoIssues(page: WikiPage): WikiLintIssue[] {
  return page.content.includes("TODO")
    ? [issue("stale-todo", page.path, "Wiki page contains a TODO marker")]
    : [];
}

function conflictedPageIssues(page: WikiPage): WikiLintIssue[] {
  return page.metadata.status === "conflicted"
    ? [issue("conflicted-page", page.path, "Wiki page has unresolved conflicts")]
    : [];
}

function reviewPageIssues(page: WikiPage): WikiLintIssue[] {
  return page.metadata.status === "review"
    ? [issue("review-page", page.path, "Wiki page is waiting for human review")]
    : [];
}

function invalidReviewAfterIssues(page: WikiPage): WikiLintIssue[] {
  const reviewAfter = page.metadata.reviewAfter;
  return reviewAfter !== undefined && reviewAfterTime(reviewAfter) === undefined
    ? [issue("invalid-review-after", page.path, `Invalid reviewAfter date: ${reviewAfter}`)]
    : [];
}

function staleReviewIssues(page: WikiPage, now: Date): WikiLintIssue[] {
  const reviewAfter = page.metadata.reviewAfter;
  if (page.metadata.status !== "active" || reviewAfter === undefined) {
    return [];
  }
  const time = reviewAfterTime(reviewAfter);
  return time !== undefined && time < now.getTime()
    ? [issue("stale-review", page.path, `Wiki page passed reviewAfter: ${reviewAfter}`)]
    : [];
}

function reviewAfterTime(reviewAfter: string): number | undefined {
  const time = Date.parse(reviewAfter);
  return Number.isNaN(time) ? undefined : time;
}

async function sourceReferenceIssues(
  workspace: Workspace,
  page: WikiPage,
): Promise<WikiLintIssue[]> {
  const checks = await Promise.all(
    sourceReferences(page).map((source) => sourceReferenceIssue(workspace, page.path, source)),
  );
  return checks.flat();
}

function sourceReferences(page: WikiPage): string[] {
  return unique([...page.metadata.sources, ...acceptedClaimSources(page.content)]);
}

function acceptedClaimSources(content: string): string[] {
  return content
    .split("\n")
    .flatMap((line, index, lines) =>
      acceptedClaimText(line) === undefined ? [] : acceptedClaimSource(lines[index + 1] ?? ""),
    );
}

function acceptedClaimSource(line: string): string[] {
  const match = line.match(/^\s*source:\s*(.+)$/);
  return match?.[1] === undefined ? [] : [match[1]];
}

async function sourceReferenceIssue(
  workspace: Workspace,
  path: string,
  source: string,
): Promise<WikiLintIssue[]> {
  try {
    await resolveWikiSource(workspace, source);
    return [];
  } catch (error) {
    if (error instanceof WikiSourceReferenceError) {
      return [issue(`${error.kind}-source`, path, error.message)];
    }
    throw error;
  }
}

function orphanPageIssues(page: WikiPage, pages: readonly WikiPage[]): WikiLintIssue[] {
  if (page.metadata.kind === "source" || page.metadata.kind === "question") {
    return [];
  }
  return inboundLinks(page, pages) === 0
    ? [issue("orphan-page", page.path, "Wiki page has no inbound links")]
    : [];
}

function inboundLinks(page: WikiPage, pages: readonly WikiPage[]): number {
  return pages.filter((candidate) => wikiLinks(candidate.content).includes(page.metadata.slug))
    .length;
}

function duplicateSlugIssues(pages: readonly WikiPage[]): WikiLintIssue[] {
  return pages.flatMap((page, index) =>
    pages.findIndex((candidate) => candidate.metadata.slug === page.metadata.slug) === index
      ? []
      : [issue("duplicate-slug", page.path, `Duplicate wiki slug: ${page.metadata.slug}`)],
  );
}

function duplicateAcceptedClaimIssues(pages: readonly WikiPage[]): WikiLintIssue[] {
  const records = pages.flatMap(acceptedClaimRecords);
  return records.flatMap((record, index) =>
    records.findIndex((candidate) => candidate.identity === record.identity) === index
      ? []
      : [
          issue(
            "duplicate-accepted-claim",
            record.path,
            `Duplicate accepted claim/source pair: ${record.source}`,
          ),
        ],
  );
}

interface AcceptedClaimRecord {
  readonly path: string;
  readonly identity: string;
  readonly source: string;
}

function acceptedClaimRecords(page: WikiPage): AcceptedClaimRecord[] {
  return page.content.split("\n").flatMap((line, index, lines) => {
    const claim = acceptedClaimText(line);
    const source = acceptedClaimSource(lines[index + 1] ?? "")[0];
    return claim === undefined || source === undefined
      ? []
      : [{ path: page.path, identity: `${source}\n${normalizeClaim(claim)}`, source }];
  });
}

function acceptedClaimText(line: string): string | undefined {
  const match = line.match(/^\s*-\s+accepted:\s*(.+)$/);
  return match?.[1];
}

function normalizeClaim(claim: string): string {
  return claim.toLowerCase().replace(/\s+/g, " ").trim();
}

async function indexIssues(
  workspace: Workspace,
  pages: readonly WikiPage[],
): Promise<WikiLintIssue[]> {
  const index = await readFile(wikiPath(workspace, "index.md"), "utf8");
  return [
    ...missingFromIndexIssues(workspace, index, pages),
    ...(await missingFileIssues(workspace, index)),
  ];
}

function missingFromIndexIssues(
  workspace: Workspace,
  index: string,
  pages: readonly WikiPage[],
): WikiLintIssue[] {
  return pages
    .filter((page) => !index.includes(relative(wikiPath(workspace), page.path)))
    .map((page) =>
      issue("page-missing-from-index", page.path, "Wiki page is missing from index.md"),
    );
}

async function missingFileIssues(workspace: Workspace, index: string): Promise<WikiLintIssue[]> {
  const checks = await Promise.all(
    indexPagePaths(index).map((path) => requiredIssue(wikiPath(workspace, path))),
  );
  return checks.filter((result): result is WikiLintIssue => result !== undefined);
}

function indexPagePaths(index: string): string[] {
  return [...index.matchAll(/\((pages\/[^)]+\.md)\)/g)].map((match) => match[1] ?? "");
}

function wikiLinks(content: string): string[] {
  return [...content.matchAll(/\[\[([^\]]*)\]\]/g)].map((match) => match[1] ?? "");
}

function frontmatter(content: string): string {
  const match = content.match(/^---\n([\s\S]*?)\n---/);
  if (match?.[1] === undefined) {
    throw new Error("Missing frontmatter");
  }
  return match[1];
}

function parseMetadata(markdown: string): WikiPageMetadata {
  const map = frontmatterMap(markdown);
  const reviewAfter = optional(map, "reviewAfter");
  const metadata = {
    title: required(map, "title"),
    slug: required(map, "slug"),
    kind: parseKind(required(map, "kind")),
    status: parseStatus(required(map, "status")),
    createdAt: required(map, "createdAt"),
    updatedAt: required(map, "updatedAt"),
    sources: parseSources(markdown),
  };
  return reviewAfter === undefined ? metadata : { ...metadata, reviewAfter };
}

function frontmatterMap(markdown: string): Map<string, string> {
  return new Map(
    markdown
      .split("\n")
      .map((line) => line.match(/^([A-Za-z]+):\s*(.*)$/))
      .filter((match): match is RegExpMatchArray => match !== null)
      .map((match) => [match[1] ?? "", match[2] ?? ""]),
  );
}

function parseSources(markdown: string): string[] {
  const match = markdown.match(/^sources:\n((?:\s+- .+\n?)*)/m);
  return match?.[1]?.split("\n").flatMap(sourceLine) ?? [];
}

function sourceLine(line: string): string[] {
  const match = line.match(/^\s+-\s+(.+)$/);
  return match?.[1] === undefined ? [] : [match[1]];
}

function renderFrontmatter(metadata: WikiPageMetadata): string {
  const reviewAfter =
    metadata.reviewAfter === undefined ? "" : `reviewAfter: ${metadata.reviewAfter}\n`;
  return `title: ${metadata.title}\nslug: ${metadata.slug}\nkind: ${metadata.kind}\nstatus: ${metadata.status}\ncreatedAt: ${metadata.createdAt}\nupdatedAt: ${metadata.updatedAt}\n${reviewAfter}sources:\n${metadata.sources.map((source) => `  - ${source}`).join("\n")}\n`;
}

function parseKind(value: string): WikiPageKind {
  if (wikiPageKinds.includes(value as WikiPageKind)) {
    return value as WikiPageKind;
  }
  throw new Error(`Invalid wiki page kind: ${value}`);
}

function parseStatus(value: string): WikiPageStatus {
  if (wikiPageStatuses.includes(value as WikiPageStatus)) {
    return value as WikiPageStatus;
  }
  throw new Error(`Invalid wiki page status: ${value}`);
}

function required(map: Map<string, string>, key: string): string {
  const value = map.get(key);
  if (value === undefined || value.length === 0) {
    throw new Error(`Missing frontmatter field: ${key}`);
  }
  return value;
}

function optional(map: Map<string, string>, key: string): string | undefined {
  const value = map.get(key);
  return value === undefined || value.length === 0 ? undefined : value;
}

function invalidFrontmatterIssue(path: string, error: unknown): WikiLintIssue {
  const detail = error instanceof Error ? error.message : String(error);
  return issue("invalid-frontmatter", path, `Wiki page frontmatter is invalid: ${detail}`);
}

function schemaSeed(): string {
  return schemaSections().join("\n\n");
}

function schemaSections(): string[] {
  return [
    "# Wiki Schema",
    "## Role\n\nThe LLM agent proposes source-backed changes. For answer proposals, a trusted caller attests that a human reviewed the exact bytes; the package validates the attestation and current hashes but does not authenticate the reviewer.",
    schemaLayerRules(),
    schemaPageRules(),
    schemaWorkflowRules(),
  ];
}

function schemaLayerRules(): string {
  return [
    "## Layers",
    "- raw sources are immutable evidence under `raw/sources/`.",
    "- wiki pages are compiled markdown knowledge under `pages/`.",
    "- `index.md` is the content map and must be updated with page changes.",
    "- `log.md` is chronological, append-only, and written only by the wiki package.",
  ].join("\n");
}

function schemaPageRules(): string {
  return [
    "## Page Rules",
    "- Use YAML frontmatter with title, slug, kind, status, createdAt, updatedAt, and sources.",
    "- Use typed claims: accepted, hypothesis, or conflicted.",
    "- Every accepted claim must include a following source line.",
    "- A source path proves provenance, not truth. Accepted status requires review of the exact claim/source pair.",
    "- Keep each accepted claim distinct; do not duplicate the same claim/source pair across pages.",
    ...writingConstraints().map((constraint) => `- ${constraint}`),
    "- Keep one main idea per sentence. Split any sentence that is hard to understand in one pass.",
    "- Prefer wiki links like [[concept-slug]] for reusable concepts.",
  ].join("\n");
}

function schemaWorkflowRules(): string {
  return [
    "## Ingest",
    "Read schema.md, index.md, then one raw source. Preserve source coverage before compression by keeping distinct operating models, practices, risks, and tradeoffs as separate source-backed claims. Create or update source, concept, entity, and synthesis pages when the source contains reusable knowledge beyond a one-off summary. Check existing claim/source pairs before writing to avoid semantic duplicates. Mark contradictions as conflicted instead of overwriting silently. Route ambiguous contradictions, stale updates, and user-owned interpretations to review instead of silently overwriting. Prepare candidate page and index changes only. Ingest approval and promotion are not implemented yet.",
    "## Query",
    "Read index.md first, then relevant pages. Answer with citations to wiki pages or raw sources. Prepare reusable answers as proposals with explicit claim/source pairs. Do not promote them before approval.",
    "## Evolve",
    "Manual or automated agents read lint issues, recent runs, and candidate pages, then prepare small source-backed candidate updates. Evolve approval and promotion are not implemented yet.",
    "## Lint",
    "Check broken links, orphan pages, stale TODOs, unsupported sources, conflicted or review pages, duplicate slugs, duplicate accepted claims, stale active pages, and index drift.",
  ].join("\n\n");
}

function validateAnswerInput(input: WikiAnswerProposalInput): void {
  if (!boundedOneLine(input.question, 10_000)) {
    throw new Error("Wiki answer proposal requires a one-line question");
  }
  if (!validAnswerSummary(input.summary)) {
    throw new Error("Wiki answer proposal requires a summary");
  }
  if (input.acceptedClaims.length === 0) {
    throw new Error("Wiki answer proposal requires at least one accepted claim");
  }
  if (!validTitle(input.title)) {
    throw new Error("Wiki answer proposal title must fit on one line");
  }
}

function validAnswerSummary(summary: string): boolean {
  return (
    summary.trim().length > 0 &&
    Buffer.byteLength(summary) <= 100_000 &&
    !unsafeTextControl(summary) &&
    !reservedAnswerSyntax(summary)
  );
}

function validTitle(title: string | undefined): boolean {
  return title === undefined || boundedOneLine(title, 500);
}

function boundedOneLine(value: string, maximum: number): boolean {
  return (
    value.trim().length > 0 &&
    value.length <= maximum &&
    !/[\r\n]/.test(value) &&
    !unsafeTextControl(value)
  );
}

function unsafeTextControl(value: string): boolean {
  return [...value].some((character) => unsafeControlCode(character.charCodeAt(0)));
}

function unsafeControlCode(code: number): boolean {
  return (
    code < 9 ||
    (code > 10 && code < 13) ||
    (code > 13 && code < 32) ||
    (code >= 127 && code <= 159) ||
    code === 0x061c ||
    (code >= 0x200e && code <= 0x200f) ||
    (code >= 0x2028 && code <= 0x202e) ||
    (code >= 0x2066 && code <= 0x2069)
  );
}

function reservedAnswerSyntax(summary: string): boolean {
  return summary
    .split(/\r?\n/)
    .some(
      (line) =>
        /^\s*-\s+accepted:/.test(line) ||
        /^\s*source:/.test(line) ||
        ["## Question", "## Summary", "## Key Claims", "## Links"].includes(line.trim()),
    );
}

function issue(code: string, path: string, message: string): WikiLintIssue {
  return { code, path, message };
}

function isFileExistsError(error: unknown): error is NodeJS.ErrnoException {
  return isNodeError(error, "EEXIST");
}

function isNodeError(error: unknown, code: string): error is NodeJS.ErrnoException {
  return error instanceof Error && "code" in error && error.code === code;
}
