import { type WikiKnowledgePageCandidate, selectWikiKnowledge } from "./knowledge.js";

export const wikiKnowledgeEvaluationCaseSetSchemaVersion =
  "ai-lab.wiki-knowledge-evaluation-cases.v1";
export const wikiKnowledgeEvaluationReportSchemaVersion =
  "ai-lab.wiki-knowledge-evaluation-report.v1";

export interface WikiKnowledgeEvaluationCase {
  readonly id: string;
  readonly query: string;
  readonly expectedPages: readonly string[];
  readonly allowedPages: readonly string[];
  readonly expectedSources: readonly string[];
}

export interface WikiKnowledgeEvaluationCaseSet {
  readonly schemaVersion: typeof wikiKnowledgeEvaluationCaseSetSchemaVersion;
  readonly cases: readonly WikiKnowledgeEvaluationCase[];
}

export interface WikiKnowledgeEvaluationCaseResult extends WikiKnowledgeEvaluationCase {
  readonly passed: boolean;
  readonly selectedPages: readonly string[];
  readonly selectedSources: readonly string[];
  readonly missingPages: readonly string[];
  readonly unexpectedPages: readonly string[];
  readonly missingSources: readonly string[];
}

export interface WikiKnowledgeEvaluationMetrics {
  readonly casePassRate: number;
  readonly requiredPageRecall: number;
  readonly allowedPagePrecision: number;
  readonly requiredSourceRecall: number;
  readonly abstentionAccuracy: number;
}

export interface WikiKnowledgeEvaluationReport {
  readonly schemaVersion: typeof wikiKnowledgeEvaluationReportSchemaVersion;
  readonly evaluatedAt: string;
  readonly passed: boolean;
  readonly caseCount: number;
  readonly passedCaseCount: number;
  readonly metrics: WikiKnowledgeEvaluationMetrics;
  readonly cases: readonly WikiKnowledgeEvaluationCaseResult[];
}

const caseSetKeys = ["schemaVersion", "cases"];
const caseKeys = ["id", "query", "expectedPages", "allowedPages", "expectedSources"];

export function parseWikiKnowledgeEvaluationCaseSet(
  value: unknown,
): WikiKnowledgeEvaluationCaseSet {
  const caseSet = structuredClone(
    strictRecord(value, caseSetKeys, "Wiki knowledge evaluation case set"),
  ) as unknown as WikiKnowledgeEvaluationCaseSet;
  assertCaseSet(caseSet);
  return caseSet;
}

export function evaluateWikiKnowledgePages(
  pages: readonly WikiKnowledgePageCandidate[],
  value: unknown,
  now: Date,
): WikiKnowledgeEvaluationReport {
  const caseSet = parseWikiKnowledgeEvaluationCaseSet(value);
  const results = caseSet.cases.map((testCase) => evaluateCase(pages, testCase, now));
  const passedCaseCount = results.filter(({ passed }) => passed).length;
  return {
    schemaVersion: wikiKnowledgeEvaluationReportSchemaVersion,
    evaluatedAt: now.toISOString(),
    passed: passedCaseCount === results.length,
    caseCount: results.length,
    passedCaseCount,
    metrics: evaluationMetrics(results),
    cases: results,
  };
}

function evaluateCase(
  pages: readonly WikiKnowledgePageCandidate[],
  testCase: WikiKnowledgeEvaluationCase,
  now: Date,
): WikiKnowledgeEvaluationCaseResult {
  const selected = selectedKnowledge(pages, testCase.query, now);
  const mismatches = caseMismatches(testCase, selected);
  return {
    ...testCase,
    passed: Object.values(mismatches).every((values) => values.length === 0),
    ...selected,
    ...mismatches,
  };
}

function selectedKnowledge(pages: readonly WikiKnowledgePageCandidate[], query: string, now: Date) {
  const selected = selectWikiKnowledge(pages, query, now);
  return {
    selectedPages: selected.map(({ path }) => path),
    selectedSources: unique(selected.flatMap(({ sources }) => sources)).sort(compareText),
  };
}

function caseMismatches(
  testCase: WikiKnowledgeEvaluationCase,
  selected: ReturnType<typeof selectedKnowledge>,
) {
  return {
    missingPages: difference(testCase.expectedPages, selected.selectedPages),
    unexpectedPages: difference(selected.selectedPages, testCase.allowedPages),
    missingSources: difference(testCase.expectedSources, selected.selectedSources),
  };
}

function evaluationMetrics(
  results: readonly WikiKnowledgeEvaluationCaseResult[],
): WikiKnowledgeEvaluationMetrics {
  return {
    casePassRate: ratio(results.filter(({ passed }) => passed).length, results.length),
    requiredPageRecall: requiredPageRecall(results),
    allowedPagePrecision: allowedPagePrecision(results),
    requiredSourceRecall: requiredSourceRecall(results),
    abstentionAccuracy: abstentionAccuracy(results),
  };
}

function requiredPageRecall(results: readonly WikiKnowledgeEvaluationCaseResult[]): number {
  const expected = sum(results.map(({ expectedPages }) => expectedPages.length));
  const missing = sum(results.map(({ missingPages }) => missingPages.length));
  return ratio(expected - missing, expected);
}

function allowedPagePrecision(results: readonly WikiKnowledgeEvaluationCaseResult[]): number {
  const selected = sum(results.map(({ selectedPages }) => selectedPages.length));
  const unexpected = sum(results.map(({ unexpectedPages }) => unexpectedPages.length));
  return ratio(selected - unexpected, selected);
}

function requiredSourceRecall(results: readonly WikiKnowledgeEvaluationCaseResult[]): number {
  const expected = sum(results.map(({ expectedSources }) => expectedSources.length));
  const missing = sum(results.map(({ missingSources }) => missingSources.length));
  return ratio(expected - missing, expected);
}

function abstentionAccuracy(results: readonly WikiKnowledgeEvaluationCaseResult[]): number {
  const abstentions = results.filter(({ expectedPages }) => expectedPages.length === 0);
  const correct = abstentions.filter(({ selectedPages }) => selectedPages.length === 0);
  return ratio(correct.length, abstentions.length);
}

function assertCaseSet(caseSet: WikiKnowledgeEvaluationCaseSet): void {
  if (
    caseSet.schemaVersion !== wikiKnowledgeEvaluationCaseSetSchemaVersion ||
    !Array.isArray(caseSet.cases) ||
    caseSet.cases.length < 2 ||
    caseSet.cases.length > 100
  ) {
    throw new Error("Wiki knowledge evaluation case set is invalid");
  }
  for (const testCase of caseSet.cases) assertCase(testCase);
  assertCaseSetCoverage(caseSet.cases);
}

function assertCase(testCase: WikiKnowledgeEvaluationCase): void {
  assertExactKeys(testCase, caseKeys, "Wiki knowledge evaluation case");
  if (
    !/^[a-z0-9][a-z0-9-]{0,99}$/u.test(testCase.id) ||
    !boundedOneLine(testCase.query, 10_000) ||
    !canonicalPaths(testCase.expectedPages, managedPagePath, 5) ||
    !canonicalPaths(testCase.allowedPages, managedPagePath, 5) ||
    !canonicalPaths(testCase.expectedSources, managedSourcePath, 100) ||
    testCase.expectedPages.some((path) => !testCase.allowedPages.includes(path))
  ) {
    throw new Error(`Wiki knowledge evaluation case is invalid: ${testCase.id}`);
  }
  assertCaseExpectation(testCase);
}

function assertCaseExpectation(testCase: WikiKnowledgeEvaluationCase): void {
  const abstention = testCase.expectedPages.length === 0;
  if (
    (abstention && (testCase.allowedPages.length > 0 || testCase.expectedSources.length > 0)) ||
    (!abstention && testCase.expectedSources.length === 0)
  ) {
    throw new Error(`Wiki knowledge evaluation expectation is invalid: ${testCase.id}`);
  }
}

function assertCaseSetCoverage(cases: readonly WikiKnowledgeEvaluationCase[]): void {
  if (
    new Set(cases.map(({ id }) => id)).size !== cases.length ||
    new Set(cases.map(({ query }) => query)).size !== cases.length ||
    !cases.some(({ expectedPages }) => expectedPages.length > 0) ||
    !cases.some(({ expectedPages }) => expectedPages.length === 0)
  ) {
    throw new Error(
      "Wiki knowledge evaluation cases require unique ids, unique queries, positive cases, and abstentions",
    );
  }
}

function canonicalPaths(
  values: readonly string[],
  validPath: (path: string) => boolean,
  limit: number,
): boolean {
  return (
    Array.isArray(values) &&
    values.length <= limit &&
    values.every(validPath) &&
    JSON.stringify(values) === JSON.stringify(unique(values).sort(compareText))
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
  const actual = Object.keys(value).sort();
  const expected = [...keys].sort();
  if (JSON.stringify(actual) !== JSON.stringify(expected)) {
    throw new Error(`${label} contains unknown or missing fields`);
  }
}

function managedPagePath(path: string): boolean {
  return (
    /^pages\/(?:sources|concepts|entities|syntheses|questions)\/[^/]+\.md$/u.test(path) &&
    !path.includes("\\")
  );
}

function managedSourcePath(path: string): boolean {
  return /^raw\/sources\/[^/]+$/u.test(path) && !path.includes("\\");
}

function boundedOneLine(value: unknown, limit: number): value is string {
  return (
    typeof value === "string" &&
    value.trim().length > 0 &&
    value.length <= limit &&
    !/[\r\n]/u.test(value) &&
    ![...value].some((character) => unsafeControlCode(character.charCodeAt(0)))
  );
}

function unsafeControlCode(code: number): boolean {
  return (
    code < 9 ||
    (code > 13 && code < 32) ||
    (code >= 127 && code <= 159) ||
    code === 0x061c ||
    code === 0x200e ||
    code === 0x200f ||
    (code >= 0x202a && code <= 0x202e) ||
    (code >= 0x2066 && code <= 0x2069)
  );
}

function difference(left: readonly string[], right: readonly string[]): string[] {
  const rightValues = new Set(right);
  return left.filter((value) => !rightValues.has(value));
}

function ratio(numerator: number, denominator: number): number {
  return denominator === 0 ? 1 : numerator / denominator;
}

function sum(values: readonly number[]): number {
  return values.reduce((total, value) => total + value, 0);
}

function unique(values: readonly string[]): string[] {
  return [...new Set(values)];
}

function compareText(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}
