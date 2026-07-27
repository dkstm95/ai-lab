import { createHash } from "node:crypto";

export const wikiKnowledgeContextSchemaVersion = "ai-lab.wiki-knowledge-context.v1";
export const wikiKnowledgeInstruction =
  "Use selected Wiki knowledge as reviewed navigation and synthesis context. Cite only bound raw source evidence for factual accepted claims; a compiled Wiki page does not itself prove truth.";
export const wikiKnowledgeKinds = ["synthesis", "concept", "question", "entity", "source"] as const;

export type WikiKnowledgeKind = (typeof wikiKnowledgeKinds)[number];

export interface WikiKnowledgePageCandidate {
  readonly path: string;
  readonly title: string;
  readonly slug: string;
  readonly kind: string;
  readonly status: string;
  readonly reviewAfter?: string;
  readonly sources: readonly string[];
  readonly content: string;
}

export interface WikiKnowledgeMatch {
  readonly path: string;
  readonly title: string;
  readonly slug: string;
  readonly kind: WikiKnowledgeKind;
  readonly score: number;
  readonly matchedTerms: readonly string[];
  readonly sources: readonly string[];
  readonly sha256: string;
  readonly content: string;
}

export type WikiKnowledgeReference = Omit<WikiKnowledgeMatch, "content">;

export interface WikiKnowledgeContext {
  readonly schemaVersion: typeof wikiKnowledgeContextSchemaVersion;
  readonly id: string;
  readonly digest: string;
  readonly query: string;
  readonly preparedAt: string;
  readonly instruction: typeof wikiKnowledgeInstruction;
  readonly knowledge: readonly WikiKnowledgeMatch[];
}

interface WikiKnowledgeContextCore {
  readonly schemaVersion: typeof wikiKnowledgeContextSchemaVersion;
  readonly query: string;
  readonly preparedAt: string;
  readonly instruction: typeof wikiKnowledgeInstruction;
  readonly knowledge: readonly WikiKnowledgeMatch[];
}

const contextKeys = [
  "schemaVersion",
  "id",
  "digest",
  "query",
  "preparedAt",
  "instruction",
  "knowledge",
];
const matchKeys = [
  "path",
  "title",
  "slug",
  "kind",
  "score",
  "matchedTerms",
  "sources",
  "sha256",
  "content",
];
const referenceKeys = matchKeys.filter((key) => key !== "content");
const ignoredTerms = new Set([
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
  "of",
  "on",
  "or",
  "the",
  "to",
  "what",
  "when",
  "where",
  "which",
  "who",
  "why",
  "with",
  "것",
  "무엇",
  "어떻게",
  "언제",
  "어디",
  "누구",
]);
const genericKnowledgeTerms = new Set(["ai", "llm", "wiki"]);
const koreanSuffixes = [
  "인가요",
  "일까요",
  "입니다",
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
  "인가",
  "일까",
  "인지",
  "이다",
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
const maxKnowledgeBytes = 800_000;

export function selectWikiKnowledge(
  pages: readonly WikiKnowledgePageCandidate[],
  query: string,
  now: Date,
  limit = 5,
): WikiKnowledgeMatch[] {
  assertQuery(query);
  if (!Number.isSafeInteger(limit) || limit < 1 || limit > 5) {
    throw new Error("Wiki knowledge retrieval limit must be from 1 to 5");
  }
  const terms = queryTerms(query);
  if (terms.length === 0) return [];
  const requireSpecificMatch = terms.some((term) => !genericKnowledgeTerms.has(term));
  return pages
    .filter((page) => eligiblePage(page, now))
    .map((page) => scoredPage(page, terms, requireSpecificMatch))
    .filter((page): page is WikiKnowledgeMatch => page !== undefined)
    .sort(compareKnowledge)
    .slice(0, limit);
}

export function buildWikiKnowledgeContext(input: {
  readonly query: string;
  readonly preparedAt: string;
  readonly knowledge: readonly WikiKnowledgeMatch[];
}): WikiKnowledgeContext {
  const core = normalizedContextCore(input);
  const digest = hashJson(core);
  const context = { ...core, id: `wiki-knowledge-context-${digest}`, digest };
  assertContext(context);
  return context;
}

export function parseWikiKnowledgeContext(value: unknown): WikiKnowledgeContext {
  const context = structuredClone(
    strictRecord(value, contextKeys, "Wiki knowledge context"),
  ) as unknown as WikiKnowledgeContext;
  assertContext(context);
  return context;
}

export function wikiKnowledgeReference(knowledge: WikiKnowledgeMatch): WikiKnowledgeReference {
  const { content: _content, ...reference } = knowledge;
  return reference;
}

export function parseWikiKnowledgeReference(value: unknown): WikiKnowledgeReference {
  const reference = structuredClone(
    strictRecord(value, referenceKeys, "Wiki knowledge reference"),
  ) as unknown as WikiKnowledgeReference;
  assertReference(reference);
  return reference;
}

function normalizedContextCore(input: {
  readonly query: string;
  readonly preparedAt: string;
  readonly knowledge: readonly WikiKnowledgeMatch[];
}): WikiKnowledgeContextCore {
  return {
    schemaVersion: wikiKnowledgeContextSchemaVersion,
    query: input.query.trim(),
    preparedAt: input.preparedAt,
    instruction: wikiKnowledgeInstruction,
    knowledge: structuredClone(input.knowledge),
  };
}

function scoredPage(
  page: WikiKnowledgePageCandidate,
  terms: readonly string[],
  requireSpecificMatch: boolean,
): WikiKnowledgeMatch | undefined {
  const matchedTerms = terms.filter((term) => termScore(page, term) > 0);
  if (!usefulMatch(matchedTerms, requireSpecificMatch)) return undefined;
  return {
    path: page.path,
    title: page.title,
    slug: page.slug,
    kind: page.kind as WikiKnowledgeKind,
    score: matchedTerms.reduce((total, term) => total + termScore(page, term), 0),
    matchedTerms,
    sources: [...page.sources].sort(compareText),
    sha256: sha256(page.content),
    content: page.content,
  };
}

function usefulMatch(matchedTerms: readonly string[], requireSpecificMatch: boolean): boolean {
  if (matchedTerms.length === 0) return false;
  const genericOnly = matchedTerms.every((term) => genericKnowledgeTerms.has(term));
  return !requireSpecificMatch || !genericOnly || matchedTerms.length >= 2;
}

function termScore(page: WikiKnowledgePageCandidate, term: string): number {
  if (textTerms(page.title).includes(term)) return 8;
  if (textTerms(page.slug).includes(term)) return 6;
  if (textTerms(summarySection(page.content)).includes(term)) return 4;
  if (textTerms(headings(page.content)).includes(term)) return 2;
  return textTerms(searchableBody(page.content)).includes(term) ? 1 : 0;
}

function eligiblePage(page: WikiKnowledgePageCandidate, now: Date): boolean {
  return (
    wikiKnowledgeKinds.includes(page.kind as WikiKnowledgeKind) &&
    page.status === "active" &&
    !reviewExpired(page.reviewAfter, now)
  );
}

function reviewExpired(reviewAfter: string | undefined, now: Date): boolean {
  if (reviewAfter === undefined) return false;
  const timestamp = Date.parse(reviewAfter);
  return Number.isNaN(timestamp) || timestamp <= now.getTime();
}

function compareKnowledge(left: WikiKnowledgeReference, right: WikiKnowledgeReference): number {
  return (
    right.score - left.score ||
    right.matchedTerms.length - left.matchedTerms.length ||
    kindPriority(right.kind) - kindPriority(left.kind) ||
    compareText(left.path, right.path)
  );
}

function kindPriority(kind: WikiKnowledgeKind): number {
  return wikiKnowledgeKinds.length - wikiKnowledgeKinds.indexOf(kind);
}

function queryTerms(query: string): string[] {
  return unique(textTerms(query).filter((term) => !ignoredTerms.has(term))).sort(compareText);
}

function textTerms(value: string): string[] {
  return value
    .toLocaleLowerCase("en-US")
    .split(/[^\p{L}\p{N}]+/u)
    .map(normalizeKoreanSuffix)
    .filter((term) => term.length > 1);
}

function normalizeKoreanSuffix(term: string): string {
  if (!/^[가-힣]+$/u.test(term)) return term;
  const suffix = koreanSuffixes.find(
    (candidate) => term.endsWith(candidate) && term.length - candidate.length >= 2,
  );
  return suffix === undefined ? term : term.slice(0, -suffix.length);
}

function summarySection(content: string): string {
  return content.match(/^## (?:Summary|결론|요약)\s*\n+([\s\S]*?)(?=\n## |\s*$)/m)?.[1] ?? "";
}

function headings(content: string): string {
  return content
    .split("\n")
    .filter((line) => /^#{1,6}\s+/u.test(line))
    .join("\n");
}

function searchableBody(content: string): string {
  return content.replace(/^---\n[\s\S]*?\n---\n?/u, "").replace(/^#{1,6}\s+.*$/gmu, "");
}

function assertContext(context: WikiKnowledgeContext): void {
  assertContextScalars(context);
  assertKnowledge(context.knowledge, true);
  const core = contextCore(context);
  if (
    context.digest !== hashJson(core) ||
    context.id !== `wiki-knowledge-context-${context.digest}`
  ) {
    throw new Error("Wiki knowledge context digest does not match its content");
  }
}

function assertContextScalars(context: WikiKnowledgeContext): void {
  if (
    context.schemaVersion !== wikiKnowledgeContextSchemaVersion ||
    !oneLine(context.id) ||
    !hash(context.digest) ||
    !boundedOneLine(context.query, 10_000) ||
    !timestamp(context.preparedAt) ||
    context.instruction !== wikiKnowledgeInstruction
  ) {
    throw new Error("Wiki knowledge context has invalid scalar fields");
  }
}

function assertKnowledge(knowledge: readonly WikiKnowledgeMatch[], withContent: boolean): void {
  if (!Array.isArray(knowledge) || knowledge.length > 5 || !canonicalKnowledge(knowledge)) {
    throw new Error("Wiki knowledge context must contain at most five canonical pages");
  }
  for (const page of knowledge) {
    assertExactKeys(page, withContent ? matchKeys : referenceKeys, "Wiki knowledge");
    assertReference(page);
    if (withContent && (typeof page.content !== "string" || sha256(page.content) !== page.sha256)) {
      throw new Error("Wiki knowledge content does not match its hash");
    }
  }
  const bytes = knowledge.reduce((total, page) => total + Buffer.byteLength(page.content ?? ""), 0);
  if (withContent && bytes > maxKnowledgeBytes) {
    throw new Error(`Wiki knowledge context exceeds ${maxKnowledgeBytes} bytes`);
  }
}

function assertReference(reference: WikiKnowledgeReference): void {
  if (
    !managedPagePath(reference.path) ||
    !boundedOneLine(reference.title, 500) ||
    !boundedOneLine(reference.slug, 500) ||
    !wikiKnowledgeKinds.includes(reference.kind) ||
    !Number.isSafeInteger(reference.score) ||
    reference.score <= 0 ||
    !stringList(reference.matchedTerms, 100) ||
    !stringList(reference.sources, 100) ||
    !sortedUnique(reference.matchedTerms) ||
    !sortedUnique(reference.sources) ||
    reference.sources.some((path) => !managedSourcePath(path)) ||
    !hash(reference.sha256)
  ) {
    throw new Error("Wiki knowledge reference is invalid");
  }
}

function canonicalKnowledge(knowledge: readonly WikiKnowledgeReference[]): boolean {
  if (new Set(knowledge.map(({ path }) => path)).size !== knowledge.length) return false;
  return knowledge.every((page, index) => {
    const previous = knowledge[index - 1];
    return previous === undefined || compareKnowledge(previous, page) <= 0;
  });
}

function contextCore(context: WikiKnowledgeContext): WikiKnowledgeContextCore {
  return {
    schemaVersion: context.schemaVersion,
    query: context.query,
    preparedAt: context.preparedAt,
    instruction: context.instruction,
    knowledge: context.knowledge,
  };
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

function sortedUnique(values: readonly string[]): boolean {
  return JSON.stringify(values) === JSON.stringify(unique(values).sort(compareText));
}

function stringList(values: readonly string[], limit: number): boolean {
  return (
    Array.isArray(values) &&
    values.length <= limit &&
    values.every((value) => boundedOneLine(value, 1_000))
  );
}

function assertQuery(query: string): void {
  if (!boundedOneLine(query, 10_000)) {
    throw new Error("Wiki knowledge query must be a non-empty one-line string");
  }
}

function managedPagePath(path: string): boolean {
  return /^pages\/[^/]+\/[^/]+\.md$/u.test(path) && !path.includes("\\");
}

function managedSourcePath(path: string): boolean {
  return /^raw\/sources\/[^/]+$/u.test(path) && !path.includes("\\");
}

function timestamp(value: string): boolean {
  const parsed = Date.parse(value);
  return !Number.isNaN(parsed) && new Date(parsed).toISOString() === value;
}

function boundedOneLine(value: unknown, limit: number): value is string {
  return oneLine(value) && value.length <= limit;
}

function oneLine(value: unknown): value is string {
  return (
    typeof value === "string" &&
    value.trim().length > 0 &&
    !/[\r\n]/u.test(value) &&
    safeMultiline(value)
  );
}

function safeMultiline(value: string): boolean {
  return ![...value].some((character) => unsafeControlCode(character.charCodeAt(0)));
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

function hash(value: unknown): value is string {
  return typeof value === "string" && /^[a-f0-9]{64}$/u.test(value);
}

function unique(values: readonly string[]): string[] {
  return [...new Set(values)];
}

function compareText(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}

function sha256(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

function hashJson(value: unknown): string {
  return sha256(JSON.stringify(value));
}
