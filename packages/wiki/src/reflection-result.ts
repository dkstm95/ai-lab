import { createHash } from "node:crypto";

export const wikiReflectionResultSchemaVersion = "ai-lab.wiki-reflection-result.v2";
export const wikiReflectionReportSchemaVersion = "ai-lab.wiki-reflection-report.v1";

const plainTextSchema = {
  type: "string",
  minLength: 1,
  maxLength: 10_000,
  pattern: "^[^\\r\\n]+$",
  description: "One line of plain text without Markdown structure or wiki-link syntax.",
} as const;
const textListSchema = {
  type: "array",
  minItems: 1,
  maxItems: 50,
  items: plainTextSchema,
} as const;
const optionalTextListSchema = {
  type: "array",
  maxItems: 50,
  items: plainTextSchema,
} as const;
const retrievalTermsSchema = {
  type: "array",
  minItems: 1,
  maxItems: 20,
  uniqueItems: true,
  items: { ...plainTextSchema, maxLength: 200 },
  description:
    "Specific search phrases, including likely terms in other user languages when useful.",
} as const;
const reflectionPageBaseProperties = {
  title: { ...plainTextSchema, maxLength: 500 },
  slug: {
    type: "string",
    minLength: 1,
    maxLength: 500,
    pattern: "^[a-z0-9가-힣]+(?:-[a-z0-9가-힣]+)*$",
  },
  summary: plainTextSchema,
  retrievalTerms: retrievalTermsSchema,
  hypotheses: optionalTextListSchema,
  links: {
    type: "array",
    maxItems: 50,
    items: {
      type: "string",
      minLength: 1,
      maxLength: 500,
      pattern: "^[a-z0-9가-힣]+(?:-[a-z0-9가-힣]+)*$",
    },
  },
} as const;
const reflectionPageBaseRequired = [
  "kind",
  "title",
  "slug",
  "summary",
  "retrievalTerms",
  "hypotheses",
  "links",
] as const;

const failurePageSchema = {
  type: "object",
  additionalProperties: false,
  properties: {
    ...reflectionPageBaseProperties,
    kind: { const: "failure" },
    failure: plainTextSchema,
    trigger: plainTextSchema,
    correction: textListSchema,
    preventionChecks: textListSchema,
  },
  required: [...reflectionPageBaseRequired, "failure", "trigger", "correction", "preventionChecks"],
} as const;
const playbookPageSchema = {
  type: "object",
  additionalProperties: false,
  properties: {
    ...reflectionPageBaseProperties,
    kind: { const: "playbook" },
    whenToUse: plainTextSchema,
    steps: textListSchema,
    checks: textListSchema,
  },
  required: [...reflectionPageBaseRequired, "whenToUse", "steps", "checks"],
} as const;
const decisionPageSchema = {
  type: "object",
  additionalProperties: false,
  properties: {
    ...reflectionPageBaseProperties,
    kind: { const: "decision" },
    decision: plainTextSchema,
    reasoning: textListSchema,
    consequences: textListSchema,
  },
  required: [...reflectionPageBaseRequired, "decision", "reasoning", "consequences"],
} as const;

const reflectionResultBaseProperties = {
  schemaVersion: { const: wikiReflectionResultSchemaVersion },
  taskId: { type: "string", minLength: 1, maxLength: 500 },
  taskDigest: { type: "string", pattern: "^[a-f0-9]{64}$" },
  rationale: plainTextSchema,
} as const;

export const wikiReflectionResultJsonSchema = {
  oneOf: [
    {
      type: "object",
      additionalProperties: false,
      properties: { ...reflectionResultBaseProperties, outcome: { const: "skip" } },
      required: ["schemaVersion", "taskId", "taskDigest", "outcome", "rationale"],
    },
    {
      type: "object",
      additionalProperties: false,
      properties: {
        ...reflectionResultBaseProperties,
        outcome: { const: "propose" },
        page: { oneOf: [failurePageSchema, playbookPageSchema, decisionPageSchema] },
      },
      required: ["schemaVersion", "taskId", "taskDigest", "outcome", "rationale", "page"],
    },
  ],
} as const;

interface WikiReflectionPageBase {
  readonly title: string;
  readonly slug: string;
  readonly summary: string;
  readonly retrievalTerms: readonly string[];
  readonly hypotheses: readonly string[];
  readonly links: readonly string[];
}

export interface WikiReflectionFailurePage extends WikiReflectionPageBase {
  readonly kind: "failure";
  readonly failure: string;
  readonly trigger: string;
  readonly correction: readonly string[];
  readonly preventionChecks: readonly string[];
}

export interface WikiReflectionPlaybookPage extends WikiReflectionPageBase {
  readonly kind: "playbook";
  readonly whenToUse: string;
  readonly steps: readonly string[];
  readonly checks: readonly string[];
}

export interface WikiReflectionDecisionPage extends WikiReflectionPageBase {
  readonly kind: "decision";
  readonly decision: string;
  readonly reasoning: readonly string[];
  readonly consequences: readonly string[];
}

export type WikiReflectionResultPage =
  | WikiReflectionFailurePage
  | WikiReflectionPlaybookPage
  | WikiReflectionDecisionPage;

interface WikiReflectionResultBase {
  readonly schemaVersion: typeof wikiReflectionResultSchemaVersion;
  readonly taskId: string;
  readonly taskDigest: string;
  readonly rationale: string;
}

export type WikiReflectionResult =
  | (WikiReflectionResultBase & { readonly outcome: "skip" })
  | (WikiReflectionResultBase & {
      readonly outcome: "propose";
      readonly page: WikiReflectionResultPage;
    });

export interface WikiReflectionFile {
  readonly path: string;
  readonly content: string;
}

export interface WikiReflectionIssue {
  readonly code: string;
  readonly path: string;
  readonly message: string;
}

export interface WikiReflectionReport {
  readonly schemaVersion: typeof wikiReflectionReportSchemaVersion;
  readonly id: string;
  readonly digest: string;
  readonly taskId: string;
  readonly taskDigest: string;
  readonly generatedAt: string;
  readonly outcome: "skip" | "propose";
  readonly rationale: string;
  readonly files: readonly WikiReflectionFile[];
  readonly baseHashes: Readonly<Record<string, string | null>>;
  readonly baselineDiagnostics: { readonly issues: readonly WikiReflectionIssue[] };
  readonly candidateDiagnostics: { readonly issues: readonly WikiReflectionIssue[] };
  readonly introducedIssues: readonly WikiReflectionIssue[];
  readonly resolvedIssues: readonly WikiReflectionIssue[];
}

export interface BuildWikiReflectionReportInput {
  readonly taskId: string;
  readonly taskDigest: string;
  readonly generatedAt: string;
  readonly outcome: "skip" | "propose";
  readonly rationale: string;
  readonly files: readonly WikiReflectionFile[];
  readonly baseHashes: Readonly<Record<string, string | null>>;
  readonly baselineDiagnostics: { readonly issues: readonly WikiReflectionIssue[] };
  readonly candidateDiagnostics: { readonly issues: readonly WikiReflectionIssue[] };
  readonly introducedIssues: readonly WikiReflectionIssue[];
  readonly resolvedIssues: readonly WikiReflectionIssue[];
}

type WikiReflectionReportCore = Omit<WikiReflectionReport, "id" | "digest">;

const resultBaseKeys = ["schemaVersion", "taskId", "taskDigest", "outcome", "rationale"];
const reportKeys = [
  "schemaVersion",
  "id",
  "digest",
  "taskId",
  "taskDigest",
  "generatedAt",
  "outcome",
  "rationale",
  "files",
  "baseHashes",
  "baselineDiagnostics",
  "candidateDiagnostics",
  "introducedIssues",
  "resolvedIssues",
];
const pageBaseKeys = ["kind", "title", "slug", "summary", "retrievalTerms", "hypotheses", "links"];

export function parseWikiReflectionResult(value: unknown): WikiReflectionResult {
  const record = strictRecord(value, resultKeys(value), "Wiki reflection result");
  const result = structuredClone(record) as unknown as WikiReflectionResult;
  assertResult(result);
  return result;
}

export function parseWikiReflectionResultForTask(
  task: { readonly id: string; readonly digest: string },
  value: unknown,
): WikiReflectionResult {
  const result = parseWikiReflectionResult(value);
  if (result.taskId !== task.id || result.taskDigest !== task.digest) {
    throw new Error("Wiki reflection result does not match its task");
  }
  return result;
}

export function buildWikiReflectionReport(
  input: BuildWikiReflectionReportInput,
): WikiReflectionReport {
  const core = normalizedReportCore(input);
  const digest = hashJson(core);
  const report = { ...core, id: `wiki-reflection-report-${digest}`, digest };
  assertReport(report);
  return report;
}

export function parseWikiReflectionReport(value: unknown): WikiReflectionReport {
  const report = structuredClone(
    strictRecord(value, reportKeys, "Wiki reflection report"),
  ) as unknown as WikiReflectionReport;
  assertReport(report);
  return report;
}

export function wikiReflectionResultTemplate(task: {
  readonly id: string;
  readonly digest: string;
}) {
  return {
    schemaVersion: wikiReflectionResultSchemaVersion,
    taskId: task.id,
    taskDigest: task.digest,
    outcome: "propose",
    rationale: "why this lesson is durable",
    page: {
      kind: "failure",
      title: "Concise Failure Title",
      slug: "concise-failure-title",
      summary: "One concise summary.",
      retrievalTerms: ["specific task phrase", "다른 언어의 구체적 검색 구문"],
      failure: "The observable mistake.",
      trigger: "When this correction applies.",
      correction: ["First corrective action."],
      preventionChecks: ["A check that prevents recurrence."],
      hypotheses: [],
      links: [],
    },
  };
}

function resultKeys(value: unknown): string[] {
  return resultOutcome(value) === "propose" ? [...resultBaseKeys, "page"] : resultBaseKeys;
}

function resultOutcome(value: unknown): unknown {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? (value as { outcome?: unknown }).outcome
    : undefined;
}

function assertResult(result: WikiReflectionResult): void {
  assertResultBase(result);
  if (result.outcome === "skip") return;
  if (result.outcome !== "propose") {
    throw new Error("Wiki reflection result outcome is invalid");
  }
  assertResultPage(result.page);
}

function assertResultBase(result: WikiReflectionResult): void {
  if (
    result.schemaVersion !== wikiReflectionResultSchemaVersion ||
    !boundedOneLine(result.taskId, 500) ||
    !hash(result.taskDigest) ||
    !plainLine(result.rationale)
  ) {
    throw new Error("Wiki reflection result has invalid scalar fields");
  }
}

function assertResultPage(page: unknown): asserts page is WikiReflectionResultPage {
  if (typeof page !== "object" || page === null || Array.isArray(page) || !("kind" in page)) {
    throw new Error("Wiki reflection result page must be an object");
  }
  const candidate = page as WikiReflectionResultPage;
  assertExactKeys(candidate, pageKeys(candidate.kind), "Wiki reflection result page");
  assertPageBase(candidate);
  if (candidate.kind === "failure") return assertFailurePage(candidate);
  if (candidate.kind === "playbook") return assertPlaybookPage(candidate);
  if (candidate.kind === "decision") return assertDecisionPage(candidate);
  throw new Error("Wiki reflection result page kind is invalid");
}

function assertPageBase(page: WikiReflectionResultPage): void {
  if (
    !boundedPlainLine(page.title, 500) ||
    !slug(page.slug) ||
    !plainLine(page.summary) ||
    !retrievalTerms(page.retrievalTerms) ||
    !plainList(page.hypotheses, false) ||
    !slugList(page.links)
  ) {
    throw new Error("Wiki reflection result page has invalid shared fields");
  }
}

function retrievalTerms(value: readonly string[]): boolean {
  return (
    plainList(value, true) &&
    value.length <= 20 &&
    value.every((term) => term.length <= 200) &&
    new Set(value).size === value.length
  );
}

function assertFailurePage(page: WikiReflectionFailurePage): void {
  if (
    !plainLine(page.failure) ||
    !plainLine(page.trigger) ||
    !plainList(page.correction, true) ||
    !plainList(page.preventionChecks, true)
  ) {
    throw new Error("Wiki reflection failure page is invalid");
  }
}

function assertPlaybookPage(page: WikiReflectionPlaybookPage): void {
  if (!plainLine(page.whenToUse) || !plainList(page.steps, true) || !plainList(page.checks, true)) {
    throw new Error("Wiki reflection playbook page is invalid");
  }
}

function assertDecisionPage(page: WikiReflectionDecisionPage): void {
  if (
    !plainLine(page.decision) ||
    !plainList(page.reasoning, true) ||
    !plainList(page.consequences, true)
  ) {
    throw new Error("Wiki reflection decision page is invalid");
  }
}

function pageKeys(kind: string): string[] {
  if (kind === "failure") {
    return [...pageBaseKeys, "failure", "trigger", "correction", "preventionChecks"];
  }
  if (kind === "playbook") return [...pageBaseKeys, "whenToUse", "steps", "checks"];
  if (kind === "decision") return [...pageBaseKeys, "decision", "reasoning", "consequences"];
  return pageBaseKeys;
}

function normalizedReportCore(input: BuildWikiReflectionReportInput): WikiReflectionReportCore {
  return {
    schemaVersion: wikiReflectionReportSchemaVersion,
    taskId: input.taskId,
    taskDigest: input.taskDigest,
    generatedAt: input.generatedAt,
    outcome: input.outcome,
    rationale: input.rationale,
    files: [...input.files].sort((left, right) => left.path.localeCompare(right.path)),
    baseHashes: sortedRecord(input.baseHashes),
    baselineDiagnostics: { issues: sortedIssues(input.baselineDiagnostics.issues) },
    candidateDiagnostics: { issues: sortedIssues(input.candidateDiagnostics.issues) },
    introducedIssues: sortedIssues(input.introducedIssues),
    resolvedIssues: sortedIssues(input.resolvedIssues),
  };
}

function assertReport(report: WikiReflectionReport): void {
  assertReportScalars(report);
  const core = normalizedReportCore(report);
  if (JSON.stringify(reportCore(report)) !== JSON.stringify(core)) {
    throw new Error("Wiki reflection report is not in canonical form");
  }
  if (report.digest !== hashJson(core) || report.id !== `wiki-reflection-report-${report.digest}`) {
    throw new Error("Wiki reflection report digest does not match its content");
  }
  assertReportContent(report);
}

function assertReportScalars(report: WikiReflectionReport): void {
  if (
    report.schemaVersion !== wikiReflectionReportSchemaVersion ||
    !boundedOneLine(report.taskId, 500) ||
    !hash(report.taskDigest) ||
    !validIsoDate(report.generatedAt) ||
    !plainLine(report.rationale) ||
    !hash(report.digest) ||
    !boundedOneLine(report.id, 500)
  ) {
    throw new Error("Wiki reflection report has invalid scalar fields");
  }
}

function assertReportContent(report: WikiReflectionReport): void {
  assertFiles(report.files);
  assertBaseHashes(report.baseHashes);
  assertIssueReport(report.baselineDiagnostics);
  assertIssueReport(report.candidateDiagnostics);
  assertIssues(report.introducedIssues);
  assertIssues(report.resolvedIssues);
  if (
    (report.outcome === "skip" && report.files.length !== 0) ||
    (report.outcome === "propose" && report.files.length !== 2) ||
    !["skip", "propose"].includes(report.outcome)
  ) {
    throw new Error("Wiki reflection report outcome does not match its files");
  }
}

function reportCore(report: WikiReflectionReport): WikiReflectionReportCore {
  const { id: _id, digest: _digest, ...core } = report;
  return core;
}

function assertFiles(files: readonly WikiReflectionFile[]): void {
  if (!Array.isArray(files) || files.length > 2) {
    throw new Error("Wiki reflection report files are invalid");
  }
  for (const file of files) {
    assertExactKeys(file, ["path", "content"], "Wiki reflection report file");
    if (!boundedOneLine(file.path, 1_000) || typeof file.content !== "string") {
      throw new Error("Wiki reflection report file is invalid");
    }
  }
}

function assertBaseHashes(hashes: Readonly<Record<string, string | null>>): void {
  if (typeof hashes !== "object" || hashes === null || Array.isArray(hashes)) {
    throw new Error("Wiki reflection report base hashes are invalid");
  }
  for (const [path, value] of Object.entries(hashes)) {
    if (!boundedOneLine(path, 1_000) || (value !== null && !hash(value))) {
      throw new Error("Wiki reflection report base hash is invalid");
    }
  }
}

function assertIssueReport(report: { readonly issues: readonly WikiReflectionIssue[] }): void {
  assertExactKeys(report, ["issues"], "Wiki reflection diagnostic report");
  assertIssues(report.issues);
}

function assertIssues(issues: readonly WikiReflectionIssue[]): void {
  if (!Array.isArray(issues) || issues.length > 1_000) {
    throw new Error("Wiki reflection report issues are invalid");
  }
  for (const issue of issues) {
    assertExactKeys(issue, ["code", "path", "message"], "Wiki reflection issue");
    if (
      !boundedOneLine(issue.code, 500) ||
      !boundedOneLine(issue.path, 2_000) ||
      !boundedOneLine(issue.message, 10_000)
    ) {
      throw new Error("Wiki reflection issue is invalid");
    }
  }
}

function sortedRecord<T>(record: Readonly<Record<string, T>>): Record<string, T> {
  return Object.fromEntries(
    Object.entries(record).sort(([left], [right]) => left.localeCompare(right)),
  );
}

function sortedIssues(issues: readonly WikiReflectionIssue[]): WikiReflectionIssue[] {
  return [...issues].sort((left, right) => issueKey(left).localeCompare(issueKey(right)));
}

function issueKey(issue: WikiReflectionIssue): string {
  return `${issue.path}\n${issue.code}\n${issue.message}`;
}

function plainList(value: unknown, required: boolean): value is readonly string[] {
  return (
    Array.isArray(value) &&
    value.length <= 50 &&
    (!required || value.length > 0) &&
    value.every(plainLine) &&
    new Set(value).size === value.length
  );
}

function slugList(value: unknown): value is readonly string[] {
  return (
    Array.isArray(value) &&
    value.length <= 50 &&
    value.every(slug) &&
    new Set(value).size === value.length
  );
}

function plainLine(value: unknown): value is string {
  return (
    boundedOneLine(value, 10_000) &&
    !/^(?:#{1,6}|[-*+]|\d+\.)\s/.test(value) &&
    !/```|\[\[|\]\]/.test(value)
  );
}

function slug(value: unknown): value is string {
  return boundedOneLine(value, 500) && /^[a-z0-9가-힣]+(?:-[a-z0-9가-힣]+)*$/.test(value);
}

function boundedPlainLine(value: unknown, max: number): value is string {
  return boundedOneLine(value, max) && plainLine(value);
}

function boundedOneLine(value: unknown, max: number): value is string {
  return (
    typeof value === "string" &&
    value.trim() === value &&
    value.length > 0 &&
    value.length <= max &&
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

function strictRecord(
  value: unknown,
  keys: readonly string[],
  label: string,
): Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new Error(`${label} must be an object`);
  }
  assertExactKeys(value, keys, label);
  return value as Record<string, unknown>;
}

function assertExactKeys(value: object, keys: readonly string[], label: string): void {
  if (JSON.stringify(Object.keys(value).sort()) !== JSON.stringify([...keys].sort())) {
    throw new Error(`${label} contains unknown or missing fields`);
  }
}

function validIsoDate(value: string): boolean {
  const timestamp = Date.parse(value);
  return !Number.isNaN(timestamp) && new Date(timestamp).toISOString() === value;
}

function hash(value: unknown): value is string {
  return typeof value === "string" && /^[a-f0-9]{64}$/.test(value);
}

function hashJson(value: unknown): string {
  return createHash("sha256").update(JSON.stringify(value)).digest("hex");
}
