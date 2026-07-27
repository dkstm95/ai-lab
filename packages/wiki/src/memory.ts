import { createHash } from "node:crypto";

export const wikiMemoryContextSchemaVersion = "ai-lab.wiki-memory-context.v1";
export const wikiMemoryEvaluationSchemaVersion = "ai-lab.wiki-memory-evaluation.v2";
export const wikiMemoryInstruction =
  "Use these reviewed memories as guidance only. The current request, explicit instructions, and source evidence take precedence. Do not cite a memory page as factual evidence.";

export const wikiMemoryKinds = ["playbook", "failure", "decision"] as const;
export type WikiMemoryKind = (typeof wikiMemoryKinds)[number];
export type WikiMemoryTaskOutcome = "improved" | "unchanged" | "worse";
export type WikiMemoryVerdict = "helpful" | "unused" | "harmful";
export type WikiMemoryEvaluationMode = "observation" | "comparison";
export type WikiMemoryComparisonPreference = "memory" | "control" | "tie";

export interface WikiMemoryPageCandidate {
  readonly path: string;
  readonly title: string;
  readonly slug: string;
  readonly kind: string;
  readonly status: string;
  readonly reviewAfter?: string;
  readonly retrievalTerms?: readonly string[];
  readonly content: string;
}

export interface WikiMemoryMatch {
  readonly path: string;
  readonly title: string;
  readonly slug: string;
  readonly kind: WikiMemoryKind;
  readonly score: number;
  readonly matchedTerms: readonly string[];
  readonly sha256: string;
  readonly content: string;
}

export interface WikiMemoryReference {
  readonly path: string;
  readonly title: string;
  readonly slug: string;
  readonly kind: WikiMemoryKind;
  readonly score: number;
  readonly matchedTerms: readonly string[];
  readonly sha256: string;
}

export interface WikiMemoryContext {
  readonly schemaVersion: typeof wikiMemoryContextSchemaVersion;
  readonly id: string;
  readonly digest: string;
  readonly query: string;
  readonly preparedAt: string;
  readonly instruction: typeof wikiMemoryInstruction;
  readonly memories: readonly WikiMemoryMatch[];
}

export interface WikiMemoryAssessmentInput {
  readonly path: string;
  readonly verdict: WikiMemoryVerdict;
  readonly note?: string;
}

export interface WikiMemoryEvaluationInput {
  readonly taskOutcome: WikiMemoryTaskOutcome;
  readonly assessments: readonly WikiMemoryAssessmentInput[];
  readonly note?: string;
}

export interface WikiMemoryComparisonJudgmentInput {
  readonly preference: WikiMemoryComparisonPreference;
  readonly assessments: readonly WikiMemoryAssessmentInput[];
  readonly note?: string;
}

export interface WikiMemoryComparisonEvidence {
  readonly controlTaskId: string;
  readonly controlTaskDigest: string;
  readonly memoryResultSha256: string;
  readonly controlResultSha256: string;
  readonly preference: WikiMemoryComparisonPreference;
}

export interface WikiMemoryEvaluationAssessment extends WikiMemoryAssessmentInput {
  readonly title: string;
  readonly kind: WikiMemoryKind;
  readonly sha256: string;
}

export interface WikiMemoryEvaluationRecord {
  readonly schemaVersion: typeof wikiMemoryEvaluationSchemaVersion;
  readonly id: string;
  readonly digest: string;
  readonly taskId: string;
  readonly taskDigest: string;
  readonly query: string;
  readonly mode: WikiMemoryEvaluationMode;
  readonly taskOutcome: WikiMemoryTaskOutcome;
  readonly assessments: readonly WikiMemoryEvaluationAssessment[];
  readonly comparison?: WikiMemoryComparisonEvidence;
  readonly note?: string;
  readonly recordedAt: string;
}

export interface WikiMemoryEvaluationCounts {
  readonly improved: number;
  readonly unchanged: number;
  readonly worse: number;
  readonly helpful: number;
  readonly unused: number;
  readonly harmful: number;
  readonly memoryPreferred: number;
  readonly controlPreferred: number;
  readonly tied: number;
}

export interface WikiMemoryPageEvaluationSummary {
  readonly path: string;
  readonly title: string;
  readonly kind: WikiMemoryKind;
  readonly selected: number;
  readonly helpful: number;
  readonly unused: number;
  readonly harmful: number;
}

export interface WikiMemoryEvaluationSummary {
  readonly evaluations: number;
  readonly comparisons: number;
  readonly selections: number;
  readonly helpfulRate: number;
  readonly harmfulRate: number;
  readonly counts: WikiMemoryEvaluationCounts;
  readonly memories: readonly WikiMemoryPageEvaluationSummary[];
}

interface WikiMemoryContextCore {
  readonly schemaVersion: typeof wikiMemoryContextSchemaVersion;
  readonly query: string;
  readonly preparedAt: string;
  readonly instruction: typeof wikiMemoryInstruction;
  readonly memories: readonly WikiMemoryMatch[];
}

interface BuildWikiMemoryEvaluationInput {
  readonly taskId: string;
  readonly taskDigest: string;
  readonly query: string;
  readonly memories: readonly WikiMemoryReference[];
  readonly evaluation: WikiMemoryEvaluationInput;
  readonly comparison?: WikiMemoryComparisonEvidence;
  readonly recordedAt: string;
}

const memoryContextKeys = [
  "schemaVersion",
  "id",
  "digest",
  "query",
  "preparedAt",
  "instruction",
  "memories",
];
const memoryKeys = ["path", "title", "slug", "kind", "score", "matchedTerms", "sha256", "content"];
const memoryReferenceKeys = memoryKeys.filter((key) => key !== "content");
const evaluationRecordKeys = [
  "schemaVersion",
  "id",
  "digest",
  "taskId",
  "taskDigest",
  "query",
  "mode",
  "taskOutcome",
  "assessments",
  "recordedAt",
];
const evaluationAssessmentKeys = ["path", "title", "kind", "sha256", "verdict"];
const comparisonKeys = [
  "controlTaskId",
  "controlTaskDigest",
  "memoryResultSha256",
  "controlResultSha256",
  "preference",
];
const ignoredQueryTerms = new Set([
  "a",
  "an",
  "and",
  "are",
  "as",
  "at",
  "be",
  "by",
  "for",
  "from",
  "how",
  "in",
  "is",
  "it",
  "llm",
  "memory",
  "of",
  "on",
  "or",
  "the",
  "task",
  "to",
  "what",
  "when",
  "where",
  "which",
  "who",
  "why",
  "with",
  "wiki",
  "기억",
  "메모리",
  "작업",
]);
const koreanParticles = [
  "에서",
  "으로",
  "에게",
  "까지",
  "부터",
  "처럼",
  "보다",
  "하고",
  "이며",
  "이고",
  "은",
  "는",
  "이",
  "가",
  "을",
  "를",
  "의",
  "에",
  "도",
  "만",
  "와",
  "과",
  "로",
] as const;
const maxMemoryBytes = 300_000;

export function selectWikiMemories(
  pages: readonly WikiMemoryPageCandidate[],
  query: string,
  now: Date,
  limit = 3,
): WikiMemoryMatch[] {
  assertMemoryQuery(query);
  if (!Number.isSafeInteger(limit) || limit < 1 || limit > 3) {
    throw new Error("Wiki memory retrieval limit must be from 1 to 3");
  }
  const terms = queryTerms(query);
  if (terms.length === 0) return [];
  return pages
    .filter((page) => eligibleMemoryPage(page, now))
    .map((page) => scoredMemory(page, terms))
    .filter((memory): memory is WikiMemoryMatch => memory !== undefined)
    .sort(compareMemoryMatches)
    .slice(0, limit);
}

export function buildWikiMemoryContext(input: {
  readonly query: string;
  readonly preparedAt: string;
  readonly memories: readonly WikiMemoryMatch[];
}): WikiMemoryContext {
  const core = normalizedMemoryContextCore(input);
  const digest = hashJson(core);
  const context = { ...core, id: `wiki-memory-context-${digest}`, digest };
  assertWikiMemoryContext(context);
  return context;
}

export function parseWikiMemoryContext(value: unknown): WikiMemoryContext {
  const context = structuredClone(
    strictRecord(value, memoryContextKeys, "Wiki memory context"),
  ) as unknown as WikiMemoryContext;
  assertWikiMemoryContext(context);
  return context;
}

export function wikiMemoryReference(memory: WikiMemoryMatch): WikiMemoryReference {
  return {
    path: memory.path,
    title: memory.title,
    slug: memory.slug,
    kind: memory.kind,
    score: memory.score,
    matchedTerms: [...memory.matchedTerms],
    sha256: memory.sha256,
  };
}

export function parseWikiMemoryReference(value: unknown): WikiMemoryReference {
  const memory = structuredClone(
    strictRecord(value, memoryReferenceKeys, "Wiki memory reference"),
  ) as unknown as WikiMemoryReference;
  assertMemoryReference(memory);
  return memory;
}

export function parseWikiMemoryEvaluationInput(value: unknown): WikiMemoryEvaluationInput {
  const record = strictRecord(
    value,
    optionalKey(value, ["taskOutcome", "assessments"], "note"),
    "Wiki memory evaluation input",
  );
  const input = structuredClone(record) as unknown as WikiMemoryEvaluationInput;
  assertEvaluationInput(input);
  return input;
}

export function parseWikiMemoryComparisonJudgmentInput(
  value: unknown,
): WikiMemoryComparisonJudgmentInput {
  const record = strictRecord(
    value,
    optionalKey(value, ["preference", "assessments"], "note"),
    "Wiki memory comparison judgment",
  );
  const input = structuredClone(record) as unknown as WikiMemoryComparisonJudgmentInput;
  assertComparisonJudgment(input);
  return input;
}

export function buildWikiMemoryEvaluationRecord(
  input: BuildWikiMemoryEvaluationInput,
): WikiMemoryEvaluationRecord {
  const evaluation = normalizedEvaluation(input.evaluation);
  assertEvaluationCoverage(input.memories, evaluation.assessments);
  return evaluationRecordWithDigest(evaluationRecordCore(input, evaluation));
}

function evaluationRecordWithDigest(
  core: Omit<WikiMemoryEvaluationRecord, "id" | "digest">,
): WikiMemoryEvaluationRecord {
  const digest = hashJson(core);
  const record = { ...core, id: `wiki-memory-evaluation-${digest}`, digest };
  assertWikiMemoryEvaluationRecord(record);
  return record;
}

export function parseWikiMemoryEvaluationRecord(value: unknown): WikiMemoryEvaluationRecord {
  const record = structuredClone(
    strictRecord(
      value,
      optionalKey(value, optionalKey(value, evaluationRecordKeys, "comparison"), "note"),
      "Wiki memory evaluation record",
    ),
  ) as unknown as WikiMemoryEvaluationRecord;
  assertWikiMemoryEvaluationRecord(record);
  return record;
}

export function summarizeWikiMemoryEvaluationRecords(
  records: readonly WikiMemoryEvaluationRecord[],
): WikiMemoryEvaluationSummary {
  const counts = evaluationCounts(records);
  const selections = records.reduce((total, record) => total + record.assessments.length, 0);
  return {
    evaluations: records.length,
    comparisons: records.filter(({ mode }) => mode === "comparison").length,
    selections,
    helpfulRate: ratio(counts.helpful, selections),
    harmfulRate: ratio(counts.harmful, selections),
    counts,
    memories: pageEvaluationSummaries(records),
  };
}

function normalizedMemoryContextCore(input: {
  readonly query: string;
  readonly preparedAt: string;
  readonly memories: readonly WikiMemoryMatch[];
}): WikiMemoryContextCore {
  return {
    schemaVersion: wikiMemoryContextSchemaVersion,
    query: input.query.trim(),
    preparedAt: input.preparedAt,
    instruction: wikiMemoryInstruction,
    memories: structuredClone(input.memories),
  };
}

function scoredMemory(
  page: WikiMemoryPageCandidate,
  terms: readonly string[],
): WikiMemoryMatch | undefined {
  const matchedTerms = terms.filter((term) => memoryTermScore(page, term, terms) > 0);
  if (matchedTerms.length === 0) return undefined;
  return {
    path: page.path,
    title: page.title,
    slug: page.slug,
    kind: page.kind as WikiMemoryKind,
    score: matchedTerms.reduce((total, term) => total + memoryTermScore(page, term, terms), 0),
    matchedTerms,
    sha256: sha256(page.content),
    content: page.content,
  };
}

function memoryTermScore(
  page: WikiMemoryPageCandidate,
  term: string,
  query: readonly string[],
): number {
  if (matchesRetrievalTerm(page.retrievalTerms ?? [], term, query)) return 10;
  if (textTerms(page.title).includes(term)) return 8;
  if (textTerms(page.slug).includes(term)) return 6;
  if (textTerms(summarySection(page.content)).includes(term)) return 4;
  return textTerms(searchableBody(page.content)).includes(term) ? 1 : 0;
}

function matchesRetrievalTerm(
  retrievalTerms: readonly string[],
  term: string,
  query: readonly string[],
): boolean {
  const querySet = new Set(query);
  return retrievalTerms.some((value) => {
    const alias = queryTerms(value);
    return alias.includes(term) && alias.every((candidate) => querySet.has(candidate));
  });
}

function eligibleMemoryPage(page: WikiMemoryPageCandidate, now: Date): boolean {
  return (
    wikiMemoryKinds.includes(page.kind as WikiMemoryKind) &&
    page.status === "active" &&
    !reviewExpired(page.reviewAfter, now)
  );
}

function reviewExpired(reviewAfter: string | undefined, now: Date): boolean {
  if (reviewAfter === undefined) return false;
  const timestamp = Date.parse(reviewAfter);
  return Number.isNaN(timestamp) || timestamp <= now.getTime();
}

function compareMemoryMatches(left: WikiMemoryReference, right: WikiMemoryReference): number {
  return (
    right.score - left.score ||
    memoryKindPriority(right.kind) - memoryKindPriority(left.kind) ||
    compareText(left.path, right.path)
  );
}

function memoryKindPriority(kind: WikiMemoryKind): number {
  if (kind === "playbook") return 3;
  if (kind === "failure") return 2;
  return 1;
}

function queryTerms(query: string): string[] {
  return unique(textTerms(query).filter((term) => !ignoredQueryTerms.has(term))).sort(compareText);
}

function textTerms(value: string): string[] {
  return value
    .toLocaleLowerCase("en-US")
    .split(/[^\p{L}\p{N}]+/u)
    .map(normalizeKoreanParticle)
    .filter((term) => term.length > 1);
}

function normalizeKoreanParticle(term: string): string {
  if (!/^[가-힣]+$/u.test(term)) return term;
  const suffix = koreanParticles.find(
    (candidate) => term.endsWith(candidate) && term.length - candidate.length >= 2,
  );
  return suffix === undefined ? term : term.slice(0, -suffix.length);
}

function summarySection(content: string): string {
  return content.match(/^## Summary\s*\n+([\s\S]*?)(?=\n## |\s*$)/m)?.[1] ?? "";
}

function searchableBody(content: string): string {
  return content.replace(/^---\n[\s\S]*?\n---\n?/u, "").replace(/^#{1,6}\s+.*$/gmu, "");
}

function assertWikiMemoryContext(context: WikiMemoryContext): void {
  assertContextScalars(context);
  assertMemories(context.memories, true);
  const core = memoryContextCore(context);
  if (context.digest !== hashJson(core) || context.id !== `wiki-memory-context-${context.digest}`) {
    throw new Error("Wiki memory context digest does not match its content");
  }
}

function assertContextScalars(context: WikiMemoryContext): void {
  if (
    context.schemaVersion !== wikiMemoryContextSchemaVersion ||
    !oneLine(context.id) ||
    !hash(context.digest) ||
    !boundedOneLine(context.query, 10_000) ||
    !timestamp(context.preparedAt) ||
    context.instruction !== wikiMemoryInstruction
  ) {
    throw new Error("Wiki memory context has invalid scalar fields");
  }
}

function assertMemories(memories: readonly WikiMemoryMatch[], withContent: boolean): void {
  if (!Array.isArray(memories) || memories.length > 3 || !uniqueValues(memories, "path")) {
    throw new Error("Wiki memory context must contain at most three unique memories");
  }
  for (const memory of memories) {
    assertExactKeys(memory, withContent ? memoryKeys : memoryReferenceKeys, "Wiki memory");
    assertMemoryReference(memory);
    if (
      withContent &&
      (typeof memory.content !== "string" || sha256(memory.content) !== memory.sha256)
    ) {
      throw new Error(`Wiki memory content hash does not match: ${memory.path}`);
    }
  }
  assertMemoryOrder(memories);
  assertMemorySize(memories);
}

function assertMemoryReference(memory: WikiMemoryReference): void {
  if (
    !memoryPath(memory.path, memory.kind) ||
    !boundedOneLine(memory.title, 500) ||
    !boundedOneLine(memory.slug, 500) ||
    !Number.isSafeInteger(memory.score) ||
    memory.score <= 0 ||
    !hash(memory.sha256) ||
    !canonicalTerms(memory.matchedTerms)
  ) {
    throw new Error("Wiki memory reference is invalid");
  }
}

function assertMemoryOrder(memories: readonly WikiMemoryReference[]): void {
  for (let index = 1; index < memories.length; index += 1) {
    const previous = memories[index - 1];
    const current = memories[index];
    if (
      previous !== undefined &&
      current !== undefined &&
      compareMemoryMatches(previous, current) > 0
    ) {
      throw new Error("Wiki memories are not in canonical retrieval order");
    }
  }
}

function assertMemorySize(memories: readonly { readonly content?: string }[]): void {
  const bytes = memories.reduce(
    (total, memory) => total + Buffer.byteLength(memory.content ?? "", "utf8"),
    0,
  );
  if (bytes > maxMemoryBytes) {
    throw new Error(`Wiki memory context exceeds ${maxMemoryBytes} bytes`);
  }
}

function assertEvaluationInput(input: WikiMemoryEvaluationInput): void {
  if (
    !taskOutcome(input.taskOutcome) ||
    !Array.isArray(input.assessments) ||
    input.assessments.length === 0 ||
    input.assessments.length > 3 ||
    !uniqueValues(input.assessments, "path") ||
    !optionalNote(input.note)
  ) {
    throw new Error("Wiki memory evaluation input is invalid");
  }
  for (const assessment of input.assessments) {
    assertAssessmentInput(assessment);
  }
}

function assertComparisonJudgment(input: WikiMemoryComparisonJudgmentInput): void {
  if (!comparisonPreference(input.preference)) {
    throw new Error("Wiki memory comparison preference is invalid");
  }
  assertEvaluationInput({
    taskOutcome: comparisonOutcome(input.preference),
    assessments: input.assessments,
    ...(input.note === undefined ? {} : { note: input.note }),
  });
}

function assertAssessmentInput(assessment: WikiMemoryAssessmentInput): void {
  assertExactKeys(
    assessment,
    optionalKey(assessment, ["path", "verdict"], "note"),
    "Wiki memory assessment",
  );
  if (
    !oneLine(assessment.path) ||
    !memoryVerdict(assessment.verdict) ||
    !optionalNote(assessment.note)
  ) {
    throw new Error("Wiki memory assessment is invalid");
  }
}

function normalizedEvaluation(input: WikiMemoryEvaluationInput): WikiMemoryEvaluationInput {
  const assessments = [...input.assessments]
    .map((assessment) => normalizedAssessment(assessment))
    .sort((left, right) => compareText(left.path, right.path));
  return input.note === undefined
    ? { taskOutcome: input.taskOutcome, assessments }
    : { taskOutcome: input.taskOutcome, assessments, note: input.note.trim() };
}

function normalizedAssessment(input: WikiMemoryAssessmentInput): WikiMemoryAssessmentInput {
  const assessment = { path: input.path.trim(), verdict: input.verdict };
  return input.note === undefined ? assessment : { ...assessment, note: input.note.trim() };
}

function assertEvaluationCoverage(
  memories: readonly WikiMemoryReference[],
  assessments: readonly WikiMemoryAssessmentInput[],
): void {
  const memoryPaths = memories.map(({ path }) => path).sort(compareText);
  const assessmentPaths = assessments.map(({ path }) => path).sort(compareText);
  if (JSON.stringify(memoryPaths) !== JSON.stringify(assessmentPaths)) {
    throw new Error("Wiki memory evaluation must assess every selected memory exactly once");
  }
}

function evaluationRecordCore(
  input: BuildWikiMemoryEvaluationInput,
  evaluation: WikiMemoryEvaluationInput,
): Omit<WikiMemoryEvaluationRecord, "id" | "digest"> {
  const assessments = evaluation.assessments.map((assessment) =>
    recordedAssessment(input.memories, assessment),
  );
  const core: Omit<WikiMemoryEvaluationRecord, "id" | "digest" | "note"> = {
    schemaVersion: wikiMemoryEvaluationSchemaVersion,
    taskId: input.taskId,
    taskDigest: input.taskDigest,
    query: input.query,
    mode: input.comparison === undefined ? "observation" : "comparison",
    taskOutcome: evaluation.taskOutcome,
    assessments,
    recordedAt: input.recordedAt,
  };
  const withComparison =
    input.comparison === undefined ? core : { ...core, comparison: input.comparison };
  return evaluation.note === undefined
    ? withComparison
    : { ...withComparison, note: evaluation.note };
}

function recordedAssessment(
  memories: readonly WikiMemoryReference[],
  assessment: WikiMemoryAssessmentInput,
): WikiMemoryEvaluationAssessment {
  const memory = memories.find(({ path }) => path === assessment.path);
  if (memory === undefined) {
    throw new Error(`Wiki memory evaluation references an unselected page: ${assessment.path}`);
  }
  const recorded = {
    path: memory.path,
    title: memory.title,
    kind: memory.kind,
    sha256: memory.sha256,
    verdict: assessment.verdict,
  };
  return assessment.note === undefined ? recorded : { ...recorded, note: assessment.note };
}

function assertWikiMemoryEvaluationRecord(record: WikiMemoryEvaluationRecord): void {
  assertEvaluationRecordScalars(record);
  assertRecordedAssessments(record.assessments);
  assertComparisonEvidence(record);
  const core = evaluationCore(record);
  if (record.digest !== hashJson(core) || record.id !== `wiki-memory-evaluation-${record.digest}`) {
    throw new Error("Wiki memory evaluation digest does not match its content");
  }
}

function assertEvaluationRecordScalars(record: WikiMemoryEvaluationRecord): void {
  if (
    record.schemaVersion !== wikiMemoryEvaluationSchemaVersion ||
    !oneLine(record.id) ||
    !hash(record.digest) ||
    !boundedOneLine(record.taskId, 500) ||
    !hash(record.taskDigest) ||
    !boundedOneLine(record.query, 10_000) ||
    !evaluationMode(record.mode) ||
    !taskOutcome(record.taskOutcome) ||
    !timestamp(record.recordedAt) ||
    !optionalNote(record.note)
  ) {
    throw new Error("Wiki memory evaluation has invalid scalar fields");
  }
}

function assertRecordedAssessments(assessments: readonly WikiMemoryEvaluationAssessment[]): void {
  if (
    !Array.isArray(assessments) ||
    assessments.length === 0 ||
    assessments.length > 3 ||
    !uniqueValues(assessments, "path")
  ) {
    throw new Error("Wiki memory evaluation assessments are invalid");
  }
  for (const assessment of assessments) {
    assertExactKeys(
      assessment,
      optionalKey(assessment, evaluationAssessmentKeys, "note"),
      "Wiki memory evaluation assessment",
    );
    assertRecordedAssessment(assessment);
  }
}

function assertRecordedAssessment(assessment: WikiMemoryEvaluationAssessment): void {
  if (
    !memoryPath(assessment.path, assessment.kind) ||
    !boundedOneLine(assessment.title, 500) ||
    !hash(assessment.sha256) ||
    !memoryVerdict(assessment.verdict) ||
    !optionalNote(assessment.note)
  ) {
    throw new Error("Wiki memory evaluation assessment is invalid");
  }
}

function evaluationCounts(
  records: readonly WikiMemoryEvaluationRecord[],
): WikiMemoryEvaluationCounts {
  return {
    improved: records.filter(({ taskOutcome }) => taskOutcome === "improved").length,
    unchanged: records.filter(({ taskOutcome }) => taskOutcome === "unchanged").length,
    worse: records.filter(({ taskOutcome }) => taskOutcome === "worse").length,
    helpful: assessmentCount(records, "helpful"),
    unused: assessmentCount(records, "unused"),
    harmful: assessmentCount(records, "harmful"),
    memoryPreferred: comparisonCount(records, "memory"),
    controlPreferred: comparisonCount(records, "control"),
    tied: comparisonCount(records, "tie"),
  };
}

function comparisonCount(
  records: readonly WikiMemoryEvaluationRecord[],
  preference: WikiMemoryComparisonPreference,
): number {
  return records.filter(({ comparison }) => comparison?.preference === preference).length;
}

function assessmentCount(
  records: readonly WikiMemoryEvaluationRecord[],
  verdict: WikiMemoryVerdict,
): number {
  return records
    .flatMap(({ assessments }) => assessments)
    .filter((item) => item.verdict === verdict).length;
}

function pageEvaluationSummaries(
  records: readonly WikiMemoryEvaluationRecord[],
): WikiMemoryPageEvaluationSummary[] {
  const assessments = records.flatMap(({ assessments }) => assessments);
  const paths = unique(assessments.map(({ path }) => path)).sort(compareText);
  return paths.map((path) => summarizePage(path, assessments));
}

function summarizePage(
  path: string,
  assessments: readonly WikiMemoryEvaluationAssessment[],
): WikiMemoryPageEvaluationSummary {
  const selected = assessments.filter((assessment) => assessment.path === path);
  const first = selected[0];
  if (first === undefined) {
    throw new Error(`Wiki memory evaluation summary is missing: ${path}`);
  }
  return {
    path,
    title: first.title,
    kind: first.kind,
    selected: selected.length,
    helpful: selected.filter(({ verdict }) => verdict === "helpful").length,
    unused: selected.filter(({ verdict }) => verdict === "unused").length,
    harmful: selected.filter(({ verdict }) => verdict === "harmful").length,
  };
}

function memoryContextCore(context: WikiMemoryContext): WikiMemoryContextCore {
  return {
    schemaVersion: context.schemaVersion,
    query: context.query,
    preparedAt: context.preparedAt,
    instruction: context.instruction,
    memories: context.memories,
  };
}

function evaluationCore(record: WikiMemoryEvaluationRecord) {
  const core = {
    schemaVersion: record.schemaVersion,
    taskId: record.taskId,
    taskDigest: record.taskDigest,
    query: record.query,
    mode: record.mode,
    taskOutcome: record.taskOutcome,
    assessments: record.assessments,
    recordedAt: record.recordedAt,
  };
  const withComparison =
    record.comparison === undefined ? core : { ...core, comparison: record.comparison };
  return record.note === undefined ? withComparison : { ...withComparison, note: record.note };
}

function assertComparisonEvidence(record: WikiMemoryEvaluationRecord): void {
  if (record.mode === "observation" && record.comparison === undefined) return;
  const comparison = record.comparison;
  if (
    record.mode !== "comparison" ||
    typeof comparison !== "object" ||
    comparison === null ||
    !boundedOneLine(comparison.controlTaskId, 500) ||
    !hash(comparison.controlTaskDigest) ||
    !hash(comparison.memoryResultSha256) ||
    !hash(comparison.controlResultSha256) ||
    !comparisonPreference(comparison.preference) ||
    record.taskOutcome !== comparisonOutcome(comparison.preference)
  ) {
    throw new Error("Wiki memory comparison evidence is invalid");
  }
  assertExactKeys(comparison, comparisonKeys, "Wiki memory comparison evidence");
}

function memoryPath(path: string, kind: WikiMemoryKind): boolean {
  const directory =
    kind === "playbook" ? "playbooks" : kind === "failure" ? "failures" : "decisions";
  return new RegExp(`^pages/${directory}/[^/]+\\.md$`).test(path);
}

function canonicalTerms(terms: readonly string[]): boolean {
  return (
    Array.isArray(terms) &&
    terms.length > 0 &&
    terms.length <= 100 &&
    terms.every((term) => boundedOneLine(term, 200)) &&
    JSON.stringify(terms) === JSON.stringify(unique(terms).sort(compareText))
  );
}

function assertMemoryQuery(query: string): void {
  if (!boundedOneLine(query.trim(), 10_000)) {
    throw new Error("Wiki memory retrieval requires a one-line query");
  }
}

function taskOutcome(value: unknown): value is WikiMemoryTaskOutcome {
  return value === "improved" || value === "unchanged" || value === "worse";
}

export function comparisonOutcome(
  preference: WikiMemoryComparisonPreference,
): WikiMemoryTaskOutcome {
  return preference === "memory" ? "improved" : preference === "control" ? "worse" : "unchanged";
}

function evaluationMode(value: unknown): value is WikiMemoryEvaluationMode {
  return value === "observation" || value === "comparison";
}

function comparisonPreference(value: unknown): value is WikiMemoryComparisonPreference {
  return value === "memory" || value === "control" || value === "tie";
}

function memoryVerdict(value: unknown): value is WikiMemoryVerdict {
  return value === "helpful" || value === "unused" || value === "harmful";
}

function optionalNote(value: unknown): boolean {
  return value === undefined || (typeof value === "string" && safeText(value, 2_000));
}

function safeText(value: string, max: number): boolean {
  return (
    value.trim().length > 0 &&
    value.length <= max &&
    ![...value].some((character) => unsafeControlCode(character.charCodeAt(0)))
  );
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

function boundedOneLine(value: unknown, max: number): value is string {
  return typeof value === "string" && value.length <= max && oneLine(value);
}

function oneLine(value: unknown): value is string {
  return (
    typeof value === "string" &&
    value.trim().length > 0 &&
    safeText(value, value.length) &&
    !/[\r\n]/u.test(value)
  );
}

function timestamp(value: unknown): value is string {
  return (
    typeof value === "string" &&
    !Number.isNaN(Date.parse(value)) &&
    new Date(value).toISOString() === value
  );
}

function hash(value: unknown): value is string {
  return typeof value === "string" && /^[a-f0-9]{64}$/u.test(value);
}

function sha256(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

function hashJson(value: unknown): string {
  return sha256(JSON.stringify(value));
}

function ratio(numerator: number, denominator: number): number {
  return denominator === 0 ? 0 : numerator / denominator;
}

function compareText(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}

function unique(values: readonly string[]): string[] {
  return [...new Set(values)];
}

function uniqueValues<T extends object>(values: readonly T[], key: keyof T): boolean {
  return new Set(values.map((value) => value[key])).size === values.length;
}

function optionalKey(value: unknown, keys: readonly string[], optional: string): string[] {
  return typeof value === "object" && value !== null && optional in value
    ? [...keys, optional]
    : [...keys];
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
  const actual = Object.keys(value).sort(compareText);
  const expected = [...keys].sort(compareText);
  if (JSON.stringify(actual) !== JSON.stringify(expected)) {
    throw new Error(`${label} has missing or unknown fields`);
  }
}
