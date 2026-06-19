import { createHash } from "node:crypto";
import { constants } from "node:fs";
import { copyFile, mkdir, open, readFile, readdir, stat, writeFile } from "node:fs/promises";
import { dirname, extname, join, normalize, relative, resolve } from "node:path";
import { type Workspace, slugify } from "@ai-lab/workspace";

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

export interface WikiUpdate {
  readonly files: readonly WikiUpdateFile[];
  readonly note?: string;
}

export interface WikiApplyResult {
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

export interface FileWikiAnswerInput {
  readonly question: string;
  readonly answer: string;
  readonly sources: readonly string[];
  readonly title?: string;
}

interface WikiAnswerDraft {
  readonly path: string;
  readonly page: string;
  readonly input: FileWikiAnswerInput;
  readonly now: Date;
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
  await Promise.all(wikiDirectories(workspace).map((path) => mkdir(path, { recursive: true })));
  await Promise.all([
    writeSeedFile(wikiPath(workspace, "schema.md"), schemaSeed()),
    writeSeedFile(wikiPath(workspace, "index.md"), "# Wiki Index\n"),
    writeSeedFile(wikiPath(workspace, "log.md"), "# Wiki Log\n"),
  ]);
  return { root: wikiPath(workspace) };
}

export async function addWikiSource(
  workspace: Workspace,
  input: AddWikiSourceInput,
  now: Date = new Date(),
): Promise<WikiSource> {
  await initWiki(workspace);
  const content = await readFile(input.path);
  const source = wikiSource(workspace, input, sourceId(input.title, content), now);
  await copyFile(input.path, source.path, constants.COPYFILE_EXCL);
  await appendLog(workspace, now, `source | ${input.title} | ${source.id}`);
  return source;
}

export async function listWikiPages(workspace: Workspace): Promise<WikiPage[]> {
  return Promise.all((await markdownFiles(wikiPath(workspace, "pages"))).map(readWikiPageFile));
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
  return taskPacket("ingest", ingestPrompt(sourceId), contextFiles, ingestTargets(sourceId));
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
  return taskPacket("query", queryPrompt(question), contextFiles, []);
}

export async function prepareWikiEvolve(workspace: Workspace): Promise<WikiTaskPacket> {
  const [pages, report, runs] = await Promise.all([
    listWikiPages(workspace),
    lintWiki(workspace),
    recentRunFiles(workspace),
  ]);
  return evolvePacket(workspace, pages, report, runs);
}

export async function applyWikiUpdate(
  workspace: Workspace,
  update: WikiUpdate,
  now: Date = new Date(),
): Promise<WikiApplyResult> {
  await initWiki(workspace);
  const paths = update.files.map((file) => wikiTargetPath(workspace, file.path));
  validateWikiUpdate(update);
  await Promise.all(update.files.map((file) => writeWikiUpdateFile(workspace, file)));
  await appendLog(workspace, now, `update | ${update.note ?? "applied wiki update"}`);
  return { files: paths, lint: await lintWiki(workspace) };
}

export async function recordWikiRun(
  workspace: Workspace,
  input: RecordWikiRunInput,
  now: Date = new Date(),
): Promise<WikiRun> {
  await initWiki(workspace);
  const id = runId(input, now);
  const path = wikiPath(workspace, "raw", "runs", `${id}.json`);
  await writeFile(path, `${JSON.stringify(runRecord(input, now), null, 2)}\n`, "utf8");
  await appendLog(workspace, now, `run | ${input.task} | ${id}`);
  return { id, path, recordedAt: now.toISOString() };
}

export async function fileWikiAnswer(
  workspace: Workspace,
  input: FileWikiAnswerInput,
  now: Date = new Date(),
): Promise<WikiApplyResult> {
  validateAnswerInput(input);
  return applyWikiUpdate(workspace, await answerUpdate(workspace, answerDraft(input, now)), now);
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
  return `${slugify(title)}-${createHash("sha256").update(content).digest("hex").slice(0, 8)}`;
}

async function findSourcePath(workspace: Workspace, sourceId: string): Promise<string> {
  const root = wikiPath(workspace, "raw", "sources");
  const names = await readdir(root);
  const name = names.find((candidate) => candidate.startsWith(`${sourceId}.`));
  if (name === undefined) {
    throw new Error(`Wiki source not found: ${sourceId}`);
  }
  return join(root, name);
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

function ingestTargets(sourceId: string): string[] {
  return [
    "index.md",
    "log.md",
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
    "Update index.md and append log.md in the same update.",
  ].join("\n");
}

function queryPrompt(question: string): string {
  return [
    "Answer from the LLM Wiki.",
    "Read index.md first, then the provided relevant pages.",
    "Cite page/source paths for accepted claims.",
    "File reusable answers under pages/questions or pages/syntheses.",
    `Question: ${question}`,
  ].join("\n");
}

function taskConstraints(): string[] {
  return [
    "Do not invent accepted claims without sources.",
    "Keep hypotheses distinct from accepted facts.",
    "Prefer small markdown updates with explicit links.",
    "Preserve raw sources as immutable evidence.",
    "Keep index.md content-oriented and log.md chronological.",
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
    "Prepare the smallest validated wiki update that improves durable knowledge quality.",
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
  return ["index.md", "log.md", "pages/**/*.md"];
}

function evolveConstraints(): string[] {
  return [
    ...taskConstraints(),
    "Do not modify raw/sources or raw/runs from an evolve update.",
    "Do not resolve conflicted pages without explicit source support.",
    "Prefer one coherent improvement per evolve run.",
    "Record skipped improvements and uncertainty in log.md or a sourced page.",
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
  const names = await readdir(root).catch(() => []);
  return names
    .filter((name) => name.endsWith(".json"))
    .sort()
    .slice(-5)
    .map((name) => `raw/runs/${name}`);
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

async function pathExists(path: string): Promise<boolean> {
  try {
    await stat(path);
    return true;
  } catch {
    return false;
  }
}

function wikiPath(workspace: Workspace, ...parts: string[]): string {
  return join(workspace.root, "wiki", ...parts);
}

function relativeWikiPath(workspace: Workspace, path: string): string {
  return relative(wikiPath(workspace), path);
}

function wikiTargetPath(workspace: Workspace, path: string): string {
  const root = resolve(wikiPath(workspace));
  const target = resolve(root, path);
  if (target !== root && !target.startsWith(`${root}/`)) {
    throw new Error(`Wiki update path escapes wiki root: ${path}`);
  }
  return target;
}

function wikiDirectories(workspace: Workspace): string[] {
  return [
    wikiPath(workspace, "raw", "sources"),
    wikiPath(workspace, "raw", "runs"),
    ...pageDirs.map((dir) => wikiPath(workspace, "pages", dir)),
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

async function appendLog(workspace: Workspace, now: Date, entry: string): Promise<void> {
  const file = await open(wikiPath(workspace, "log.md"), "a");
  try {
    await file.writeFile(`\n## [${now.toISOString()}] ${entry}\n`);
  } finally {
    await file.close();
  }
}

async function readWikiPageFile(path: string): Promise<WikiPage> {
  return parseWikiPage(await readFile(path, "utf8"), path);
}

async function markdownFiles(root: string): Promise<string[]> {
  const entries = await readdir(root, { withFileTypes: true });
  const nested = await Promise.all(entries.map((entry) => childMarkdownFiles(root, entry)));
  return nested.flat().sort();
}

async function childMarkdownFiles(root: string, entry: { name: string; isDirectory(): boolean }) {
  const path = join(root, entry.name);
  if (entry.isDirectory()) {
    return markdownFiles(path);
  }
  return entry.name.endsWith(".md") ? [path] : [];
}

async function requiredIssues(workspace: Workspace): Promise<WikiLintIssue[]> {
  return Promise.all(requiredPaths(workspace).map(requiredIssue)).then((results) =>
    results.filter((issue): issue is WikiLintIssue => issue !== undefined),
  );
}

async function requiredIssue(path: string): Promise<WikiLintIssue | undefined> {
  try {
    await stat(path);
    return undefined;
  } catch {
    return issue("missing-required-path", path, "Required wiki path is missing");
  }
}

function requiredPaths(workspace: Workspace): string[] {
  return [
    wikiPath(workspace, "schema.md"),
    wikiPath(workspace, "index.md"),
    wikiPath(workspace, "log.md"),
    ...wikiDirectories(workspace),
  ];
}

function validateWikiUpdate(update: WikiUpdate): void {
  if (update.files.length === 0) {
    throw new Error("Wiki update requires at least one file");
  }
  if (changesPages(update) && !includesIndexAndLog(update)) {
    throw new Error("Wiki page updates must include index.md and log.md");
  }
  for (const file of update.files) {
    validateWikiUpdateFile(file);
  }
}

function changesPages(update: WikiUpdate): boolean {
  return update.files.some((file) => file.path.startsWith("pages/"));
}

function includesIndexAndLog(update: WikiUpdate): boolean {
  const paths = update.files.map((file) => file.path);
  return paths.includes("index.md") && paths.includes("log.md");
}

function validateWikiUpdateFile(file: WikiUpdateFile): void {
  if (!isAllowedWikiUpdatePath(file.path)) {
    throw new Error(`Unsupported wiki update path: ${file.path}`);
  }
  if (file.path.startsWith("pages/")) {
    assertValidPageUpdate(file);
  }
}

function isAllowedWikiUpdatePath(path: string): boolean {
  return path === normalizedPath(path) && managedWikiPath(path);
}

function managedWikiPath(path: string): boolean {
  return path === "index.md" || path === "log.md" || pageUpdatePath(path);
}

function pageUpdatePath(path: string): boolean {
  return path.startsWith("pages/") && path.endsWith(".md");
}

function normalizedPath(path: string): string {
  return normalize(path);
}

function assertValidPageUpdate(file: WikiUpdateFile): void {
  const page = parseWikiPage(file.content, file.path);
  const issues = acceptedClaimIssues(page);
  if (issues.length > 0) {
    throw new Error(`Invalid wiki page update: ${issues[0]?.message}`);
  }
}

async function writeWikiUpdateFile(workspace: Workspace, file: WikiUpdateFile): Promise<void> {
  const path = wikiTargetPath(workspace, file.path);
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, file.content, "utf8");
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

function questionMetadata(input: FileWikiAnswerInput, slug: string, now: Date): WikiPageMetadata {
  return {
    title: input.title ?? input.question,
    slug,
    kind: "question",
    status: "active",
    createdAt: now.toISOString(),
    updatedAt: now.toISOString(),
    sources: input.sources,
  };
}

function questionBody(input: FileWikiAnswerInput): string {
  return `## Question\n\n${input.question}\n\n## Summary\n\n${input.answer}\n\n## Key Claims\n\n${answerClaims(input.sources)}\n\n## Links\n\n`;
}

function answerClaims(sources: readonly string[]): string {
  return sources
    .map((source) => `- accepted: Answer is supported by ${source}\n  source: ${source}`)
    .join("\n");
}

function answerDraft(input: FileWikiAnswerInput, now: Date): WikiAnswerDraft {
  const slug = slugify(input.title ?? input.question);
  return {
    path: `pages/questions/${slug}.md`,
    page: renderWikiPage(questionMetadata(input, slug, now), questionBody(input)),
    input,
    now,
  };
}

async function answerUpdate(workspace: Workspace, draft: WikiAnswerDraft): Promise<WikiUpdate> {
  return {
    note: `file answer | ${draft.input.question}`,
    files: [
      updateFile("index.md", await indexWithAnswer(workspace, draft.path, draft.input)),
      updateFile("log.md", await logWithAnswer(workspace, draft.input, draft.now)),
      updateFile(draft.path, draft.page),
    ],
  };
}

async function indexWithAnswer(
  workspace: Workspace,
  path: string,
  input: FileWikiAnswerInput,
): Promise<string> {
  const index = await readFile(wikiPath(workspace, "index.md"), "utf8").catch(
    () => "# Wiki Index\n",
  );
  return `${index.trimEnd()}\n- [${input.title ?? input.question}](${path})\n`;
}

async function logWithAnswer(
  workspace: Workspace,
  input: FileWikiAnswerInput,
  now: Date,
): Promise<string> {
  const log = await readFile(wikiPath(workspace, "log.md"), "utf8").catch(() => "# Wiki Log\n");
  return `${log.trimEnd()}\n\n## [${now.toISOString()}] query | ${input.question}\n`;
}

function updateFile(path: string, content: string): WikiUpdateFile {
  return { path, content };
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
  const paths = await markdownFiles(wikiPath(workspace, "pages"));
  const results = await Promise.all(paths.map(readWikiPageResult));
  return {
    pages: results.flatMap((result) => result.pages),
    issues: results.flatMap((result) => result.issues),
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
  return next?.trimStart().startsWith("source:")
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
  return content.split("\n").flatMap(acceptedClaimSource);
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
  if (!source.startsWith("raw/sources/")) {
    return [issue("unsupported-source", path, `Unsupported source reference: ${source}`)];
  }
  return (await pathExists(wikiPath(workspace, source)))
    ? []
    : [issue("missing-source", path, `Source reference is missing: ${source}`)];
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
    "## Role\n\nThe LLM agent maintains this wiki. Humans curate sources, ask questions, and review outcomes.",
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
    "- `log.md` is chronological and append-only.",
  ].join("\n");
}

function schemaPageRules(): string {
  return [
    "## Page Rules",
    "- Use YAML frontmatter with title, slug, kind, status, createdAt, updatedAt, and sources.",
    "- Use typed claims: accepted, hypothesis, or conflicted.",
    "- Every accepted claim must include a following source line.",
    "- Keep each accepted claim distinct; do not duplicate the same claim/source pair across pages.",
    "- Prefer wiki links like [[concept-slug]] for reusable concepts.",
  ].join("\n");
}

function schemaWorkflowRules(): string {
  return [
    "## Ingest",
    "Read schema.md, index.md, then one raw source. Preserve source coverage before compression by keeping distinct operating models, practices, risks, and tradeoffs as separate source-backed claims. Create or update source, concept, entity, and synthesis pages when the source contains reusable knowledge beyond a one-off summary. Check existing claim/source pairs before writing to avoid semantic duplicates. Mark contradictions as conflicted instead of overwriting silently. Route ambiguous contradictions, stale updates, and user-owned interpretations to review instead of silently overwriting. Update index.md and log.md.",
    "## Query",
    "Read index.md first, then relevant pages. Answer with citations to wiki pages or raw sources. File reusable answers as question or synthesis pages.",
    "## Evolve",
    "Manual or automated agents read lint issues, recent runs, and candidate pages, then apply small source-backed improvements through validated updates.",
    "## Lint",
    "Check broken links, orphan pages, stale TODOs, unsupported sources, conflicted or review pages, duplicate slugs, duplicate accepted claims, stale active pages, and index drift.",
  ].join("\n\n");
}

function validateAnswerInput(input: FileWikiAnswerInput): void {
  if (input.sources.length === 0) {
    throw new Error("Wiki answer requires at least one source");
  }
}

function issue(code: string, path: string, message: string): WikiLintIssue {
  return { code, path, message };
}

function isFileExistsError(error: unknown): error is NodeJS.ErrnoException {
  return error instanceof Error && "code" in error && error.code === "EEXIST";
}
