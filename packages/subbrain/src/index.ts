export type EntityType =
  | "person"
  | "organization"
  | "place"
  | "project"
  | "object"
  | "topic"
  | "custom";

export type EventLinkType = "similar" | "follow_up" | "contradicts" | "candidate_cause";

export interface RawEntryInput {
  readonly id: string;
  readonly text: string;
  readonly recordedAt: string;
}

export interface EntityInput {
  readonly id: string;
  readonly type: EntityType;
  readonly name: string;
}

export interface EventAttribute {
  readonly type: string;
  readonly value: string;
}

export interface MemoryEventInput {
  readonly id: string;
  readonly sourceEntryId: string;
  readonly occurredAt: string;
  readonly summary: string;
  readonly eventType: string;
  readonly topics: readonly string[];
  readonly emotions: readonly string[];
  readonly confidence: number;
  readonly entities?: readonly EntityInput[];
  readonly attributes?: readonly EventAttribute[];
}

export type MemoryEvent = Required<MemoryEventInput>;

export interface EventLinkInput {
  readonly fromEventId: string;
  readonly toEventId: string;
  readonly type: EventLinkType;
  readonly reason: string;
  readonly confidence: number;
}

export interface RetrievalQuery {
  readonly text: string;
  readonly referenceDate?: string;
  readonly topics?: readonly string[];
  readonly emotions?: readonly string[];
  readonly entities?: readonly string[];
  readonly attributes?: readonly EventAttribute[];
}

export interface RetrievedMemory {
  readonly event: MemoryEvent;
  readonly score: number;
  readonly reasons: readonly string[];
  readonly forgotten: boolean;
}

export interface ContextPacket {
  readonly question: string;
  readonly retrievedMemories: readonly RetrievedMemory[];
  readonly causalCandidates: readonly RetrievedMemory[];
  readonly answerRules: readonly string[];
}

export type AnswerConfidence = "high" | "medium" | "low";

export interface AnswerEvidence {
  readonly eventId: string;
  readonly sourceEntryId: string;
  readonly occurredAt: string;
  readonly summary: string;
  readonly reasons: readonly string[];
}

export interface CausalCandidate {
  readonly eventId: string;
  readonly label: string;
  readonly confidence: AnswerConfidence;
  readonly evidenceEventIds: readonly string[];
  readonly rationale: string;
}

export interface AnswerDraft {
  readonly question: string;
  readonly summary: string;
  readonly causalCandidates: readonly CausalCandidate[];
  readonly evidence: readonly AnswerEvidence[];
  readonly uncertainty: readonly string[];
  readonly suggestedQuestions: readonly string[];
}

export interface AnswerModel {
  generate(packet: ContextPacket): Promise<AnswerDraft>;
}

export interface ValidationIssue {
  readonly path: string;
  readonly message: string;
}

export type ValidationKind = "answer_draft" | "memory_event" | "retrieval_query";

export class SubbrainValidationError extends Error {
  readonly issues: readonly ValidationIssue[];
  readonly kind: ValidationKind;

  constructor(kind: ValidationKind, issues: readonly ValidationIssue[]) {
    super(`Invalid SubBrain ${kind}: ${issues.map((issue) => issue.path).join(", ")}`);
    this.name = "SubbrainValidationError";
    this.kind = kind;
    this.issues = issues;
  }
}

export interface MemoryExtractor {
  extract(input: RawEntryInput): Promise<readonly MemoryEventInput[]>;
}

export interface QueryInterpreter {
  infer(text: string, referenceDate?: string): Promise<RetrievalQuery>;
}

export interface SubbrainAnswerResult {
  readonly context: ContextPacket;
  readonly answer: AnswerDraft;
}

export interface SubbrainEntryResult {
  readonly entry: RawEntryInput;
  readonly events: readonly MemoryEventInput[];
}

export interface SubbrainEngineOptions {
  readonly answerModel?: AnswerModel;
  readonly extractor?: MemoryExtractor;
  readonly maxModelAttempts?: number;
  readonly queryInterpreter?: QueryInterpreter;
}

export interface EvaluationCase {
  readonly id: string;
  readonly query: RetrievalQuery;
  readonly relevantEventIds: readonly string[];
  readonly forgottenEventIds: readonly string[];
}

export interface EvaluationReport {
  readonly recallAt5: number;
  readonly recallAt10: number;
  readonly forgottenMemoryHitRate: number;
  readonly evidenceCoverage: number;
}

export interface SubbrainStore {
  addRawEntry(input: RawEntryInput): void;
  addMemoryEvent(input: MemoryEventInput): void;
  addEventLink(input: EventLinkInput): void;
  deleteMemoryEventsForEntry(sourceEntryId: string): void;
  listEventLinks(): EventLinkInput[];
  listMemoryEvents(): MemoryEvent[];
  saveExtractedEntry(input: RawEntryInput, events: readonly MemoryEventInput[]): void;
  searchEventIds(text: string): Set<string>;
  close(): void;
}

interface ScoringContext {
  readonly events: readonly MemoryEvent[];
  readonly ftsHits: ReadonlySet<string>;
  readonly links: readonly EventLinkInput[];
  readonly query: RetrievalQuery;
}

export function retrieveMemories(
  store: SubbrainStore,
  query: RetrievalQuery,
  limit = 10,
): RetrievedMemory[] {
  const context = scoringContext(store, query);
  return context.events
    .map((event) => scoreMemory(event, context))
    .filter(retrievableMemory)
    .sort((left, right) => right.score - left.score)
    .slice(0, limit);
}

function scoringContext(store: SubbrainStore, query: RetrievalQuery): ScoringContext {
  return {
    events: store.listMemoryEvents(),
    ftsHits: store.searchEventIds(query.text),
    links: store.listEventLinks(),
    query,
  };
}

function retrievableMemory(memory: RetrievedMemory): boolean {
  return memory.score > 0 && !memory.reasons.includes("temporal:future");
}

function causalCandidate(memory: RetrievedMemory, query: RetrievalQuery): boolean {
  return (
    priorEvent(memory, query) &&
    !evidenceOnlyEvent(memory.event) &&
    (memory.reasons.includes("link:candidate_cause") || strongStructuredSupport(memory))
  );
}

function priorEvent(memory: RetrievedMemory, query: RetrievalQuery): boolean {
  return query.referenceDate === undefined || memory.event.occurredAt <= query.referenceDate;
}

function evidenceOnlyEvent(event: MemoryEvent): boolean {
  return event.eventType.includes("observation") || event.eventType.includes("follow_up");
}

function strongStructuredSupport(memory: RetrievedMemory): boolean {
  return memory.reasons.some((reason) =>
    ["attribute:overlap", "entity:overlap", "link:similar"].includes(reason),
  );
}

export function buildContextPacket(store: SubbrainStore, query: RetrievalQuery): ContextPacket {
  const retrievedMemories = retrieveMemories(store, query, 10);
  return {
    question: query.text,
    retrievedMemories,
    causalCandidates: retrievedMemories
      .filter((memory) => causalCandidate(memory, query))
      .slice(0, 5),
    answerRules: answerRules(),
  };
}

export class FakeAnswerModel implements AnswerModel {
  async generate(packet: ContextPacket): Promise<AnswerDraft> {
    return fakeAnswer(packet);
  }
}

export class DeterministicAnswerModel extends FakeAnswerModel {}

export class RuleBasedMemoryExtractor implements MemoryExtractor {
  async extract(input: RawEntryInput): Promise<readonly MemoryEventInput[]> {
    return ruleBasedMemoryEvents(input);
  }
}

export class RuleBasedQueryInterpreter implements QueryInterpreter {
  async infer(text: string, referenceDate?: string): Promise<RetrievalQuery> {
    return ruleBasedRetrievalQuery(text, referenceDate);
  }
}

export class SubbrainEngine {
  readonly #answerModel: AnswerModel;
  readonly #extractor: MemoryExtractor;
  readonly #maxModelAttempts: number;
  readonly #queryInterpreter: QueryInterpreter;
  readonly #store: SubbrainStore;

  constructor(store: SubbrainStore, options: SubbrainEngineOptions = {}) {
    this.#store = store;
    this.#answerModel = options.answerModel ?? new DeterministicAnswerModel();
    this.#extractor = options.extractor ?? new RuleBasedMemoryExtractor();
    this.#maxModelAttempts = modelAttempts(options.maxModelAttempts);
    this.#queryInterpreter = options.queryInterpreter ?? new RuleBasedQueryInterpreter();
  }

  async addEntry(input: RawEntryInput): Promise<SubbrainEntryResult> {
    const events = await this.extractValidEvents(input);
    this.#store.saveExtractedEntry(input, events);
    return { entry: input, events };
  }

  async answer(query: RetrievalQuery): Promise<SubbrainAnswerResult> {
    const context = buildContextPacket(this.#store, query);
    return { context, answer: await this.generateValidAnswer(context) };
  }

  async inferQuery(text: string, referenceDate?: string): Promise<RetrievalQuery> {
    const query = await this.#queryInterpreter.infer(text, referenceDate);
    assertValidQuery(query);
    return query;
  }

  private async extractValidEvents(input: RawEntryInput): Promise<readonly MemoryEventInput[]> {
    return withValidatedRetry(
      () => this.#extractor.extract(input),
      (events) => assertValidEvents(events, input),
      "memory_event",
      this.#maxModelAttempts,
    );
  }

  private async generateValidAnswer(packet: ContextPacket): Promise<AnswerDraft> {
    try {
      return await withValidatedRetry(
        () => this.#answerModel.generate(packet),
        (answer) => assertValidAnswer(answer, packet),
        "answer_draft",
        this.#maxModelAttempts,
      );
    } catch (error) {
      if (error instanceof SubbrainValidationError) {
        return validationFallbackAnswer(packet, error.issues);
      }
      throw error;
    }
  }
}

export function evaluateRetrieval(
  store: SubbrainStore,
  cases: readonly EvaluationCase[],
): EvaluationReport {
  const results = cases.map((testCase) => evaluateCase(store, testCase));
  return {
    recallAt5: average(results.map((result) => result.recallAt5)),
    recallAt10: average(results.map((result) => result.recallAt10)),
    forgottenMemoryHitRate: average(results.map((result) => result.forgottenMemoryHitRate)),
    evidenceCoverage: average(results.map((result) => result.evidenceCoverage)),
  };
}

export function seedFixture(store: SubbrainStore, fixture: SubbrainFixture): void {
  for (const entry of fixture.entries) {
    store.addRawEntry(entry);
  }
  for (const event of fixture.events) {
    store.addMemoryEvent(event);
  }
  for (const link of fixture.links) {
    store.addEventLink(link);
  }
}

export interface SubbrainFixture {
  readonly entries: readonly RawEntryInput[];
  readonly events: readonly MemoryEventInput[];
  readonly links: readonly EventLinkInput[];
  readonly cases: readonly EvaluationCase[];
}

export function extractMemoryEvents(input: RawEntryInput): MemoryEventInput[] {
  return ruleBasedMemoryEvents(input);
}

export function inferRetrievalQuery(text: string, referenceDate?: string): RetrievalQuery {
  return ruleBasedRetrievalQuery(text, referenceDate);
}

function ruleBasedMemoryEvents(input: RawEntryInput): MemoryEventInput[] {
  return [
    {
      id: stableEventId(input),
      sourceEntryId: input.id,
      occurredAt: input.recordedAt.slice(0, 10),
      summary: summarizeEntry(input.text),
      eventType: "user_entry",
      topics: entryTopics(input.text),
      emotions: entryEmotions(input.text),
      confidence: 0.55,
      entities: entryEntities(input.text),
      attributes: entryAttributes(input.text),
    },
  ];
}

function stableEventId(input: RawEntryInput): string {
  const date = input.recordedAt.slice(0, 10);
  return `event_${slugText(date)}_${hashText(summarizeEntry(input.text))}`;
}

function ruleBasedRetrievalQuery(text: string, referenceDate?: string): RetrievalQuery {
  const query: RetrievalQuery = {
    text,
    topics: entryTopics(text),
    emotions: entryEmotions(text),
    entities: entryEntities(text).map((entity) => entity.name),
    attributes: entryAttributes(text),
  };
  return referenceDate === undefined ? query : { ...query, referenceDate };
}

async function withValidatedRetry<T>(
  load: () => Promise<T>,
  validate: (value: T) => readonly ValidationIssue[],
  kind: ValidationKind,
  attempts: number,
): Promise<T> {
  let issues: readonly ValidationIssue[] = [];
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    const value = await load();
    issues = validate(value);
    if (issues.length === 0) {
      return value;
    }
  }
  throw new SubbrainValidationError(kind, issues);
}

function modelAttempts(value: number | undefined): number {
  return Math.max(1, Math.floor(value ?? 1));
}

function assertValidEvents(value: unknown, entry: RawEntryInput): readonly ValidationIssue[] {
  if (!Array.isArray(value)) {
    return [{ path: "events", message: "Expected an array." }];
  }
  return value.flatMap((event, index) => eventIssues(event, entry, `events.${index}`));
}

function assertValidQuery(value: RetrievalQuery): void {
  const issues = queryIssues(value);
  if (issues.length > 0) {
    throw new SubbrainValidationError("retrieval_query", issues);
  }
}

function assertValidAnswer(value: unknown, packet: ContextPacket): readonly ValidationIssue[] {
  const supportedIds = new Set(packet.retrievedMemories.map((memory) => memory.event.id));
  const evidenceIds = new Set(evidenceEventIds(arrayField(value, "evidence")));
  return [
    ...answerShapeIssues(value, packet),
    ...candidateIssues(arrayField(value, "causalCandidates"), supportedIds, evidenceIds),
    ...evidenceIssues(arrayField(value, "evidence"), supportedIds),
  ];
}

function eventIssues(value: unknown, entry: RawEntryInput, path: string): ValidationIssue[] {
  if (!isRecord(value)) {
    return [{ path, message: "Expected an object." }];
  }
  return [
    ...requiredTextIssues(value, path, [
      "id",
      "sourceEntryId",
      "occurredAt",
      "summary",
      "eventType",
    ]),
    ...sameValueIssues(value.sourceEntryId, entry.id, `${path}.sourceEntryId`),
    ...stringArrayIssues(value.topics, `${path}.topics`),
    ...stringArrayIssues(value.emotions, `${path}.emotions`),
    ...confidenceIssues(value.confidence, `${path}.confidence`),
    ...entityIssues(value.entities ?? [], `${path}.entities`),
    ...attributeListIssues(value.attributes ?? [], `${path}.attributes`),
  ];
}

function queryIssues(value: unknown): ValidationIssue[] {
  if (!isRecord(value)) {
    return [{ path: "query", message: "Expected an object." }];
  }
  return [
    ...requiredTextIssues(value, "query", ["text"]),
    ...stringArrayIssues(value.topics ?? [], "query.topics"),
    ...stringArrayIssues(value.emotions ?? [], "query.emotions"),
    ...stringArrayIssues(value.entities ?? [], "query.entities"),
    ...attributeListIssues(value.attributes ?? [], "query.attributes"),
  ];
}

function answerShapeIssues(value: unknown, packet: ContextPacket): ValidationIssue[] {
  if (!isRecord(value)) {
    return [{ path: "answer", message: "Expected an object." }];
  }
  return [
    ...requiredTextIssues(value, "answer", ["question", "summary"]),
    ...sameValueIssues(value.question, packet.question, "answer.question"),
    ...arrayIssues(value.causalCandidates, "answer.causalCandidates"),
    ...arrayIssues(value.evidence, "answer.evidence"),
    ...stringArrayIssues(value.uncertainty, "answer.uncertainty"),
    ...stringArrayIssues(value.suggestedQuestions, "answer.suggestedQuestions"),
  ];
}

function candidateIssues(
  value: unknown,
  ids: ReadonlySet<string>,
  evidenceIds: ReadonlySet<string>,
): ValidationIssue[] {
  if (!Array.isArray(value)) {
    return [];
  }
  return value.flatMap((candidate, index) =>
    candidateItemIssues(candidate, index, ids, evidenceIds),
  );
}

function evidenceIssues(value: unknown, ids: ReadonlySet<string>): ValidationIssue[] {
  if (!Array.isArray(value)) {
    return [];
  }
  return value.flatMap((evidence, index) => evidenceItemIssues(evidence, index, ids));
}

function candidateItemIssues(
  value: unknown,
  index: number,
  ids: ReadonlySet<string>,
  evidenceIds: ReadonlySet<string>,
): ValidationIssue[] {
  const path = `answer.causalCandidates.${index}`;
  if (!isRecord(value)) {
    return [{ path, message: "Expected an object." }];
  }
  return [
    ...requiredTextIssues(value, path, ["eventId", "label", "confidence", "rationale"]),
    ...supportedIdIssues(value.eventId, ids, `${path}.eventId`),
    ...confidenceLabelIssues(value.confidence, `${path}.confidence`),
    ...stringArrayIssues(value.evidenceEventIds, `${path}.evidenceEventIds`),
    ...nonEmptyArrayIssues(value.evidenceEventIds, `${path}.evidenceEventIds`),
    ...supportedIdsIssues(value.evidenceEventIds, ids, `${path}.evidenceEventIds`),
    ...supportedIdsIssues(value.evidenceEventIds, evidenceIds, `${path}.evidenceEventIds`),
  ];
}

function evidenceItemIssues(
  value: unknown,
  index: number,
  ids: ReadonlySet<string>,
): ValidationIssue[] {
  const path = `answer.evidence.${index}`;
  if (!isRecord(value)) {
    return [{ path, message: "Expected an object." }];
  }
  return [
    ...requiredTextIssues(value, path, ["eventId", "sourceEntryId", "occurredAt", "summary"]),
    ...supportedIdIssues(value.eventId, ids, `${path}.eventId`),
    ...stringArrayIssues(value.reasons, `${path}.reasons`),
  ];
}

function entityIssues(value: unknown, path: string): ValidationIssue[] {
  if (!Array.isArray(value)) {
    return [{ path, message: "Expected an array." }];
  }
  return value.flatMap((entity, index) => entityItemIssues(entity, `${path}.${index}`));
}

function entityItemIssues(value: unknown, path: string): ValidationIssue[] {
  if (!isRecord(value)) {
    return [{ path, message: "Expected an object." }];
  }
  return [
    ...requiredTextIssues(value, path, ["id", "type", "name"]),
    ...entityTypeIssues(value.type, `${path}.type`),
  ];
}

function attributeListIssues(value: unknown, path: string): ValidationIssue[] {
  if (!Array.isArray(value)) {
    return [{ path, message: "Expected an array." }];
  }
  return value.flatMap((attribute, index) => attributeItemIssues(attribute, `${path}.${index}`));
}

function attributeItemIssues(value: unknown, path: string): ValidationIssue[] {
  if (!isRecord(value)) {
    return [{ path, message: "Expected an object." }];
  }
  return requiredTextIssues(value, path, ["type", "value"]);
}

function requiredTextIssues(
  value: Readonly<Record<string, unknown>>,
  path: string,
  keys: readonly string[],
): ValidationIssue[] {
  return keys
    .filter((key) => typeof value[key] !== "string" || value[key].trim() === "")
    .map((key) => ({ path: `${path}.${key}`, message: "Expected non-empty text." }));
}

function stringArrayIssues(value: unknown, path: string): ValidationIssue[] {
  if (!Array.isArray(value)) {
    return [{ path, message: "Expected an array." }];
  }
  return value.flatMap((item, index) => textIssue(item, `${path}.${index}`));
}

function arrayIssues(value: unknown, path: string): ValidationIssue[] {
  return Array.isArray(value) ? [] : [{ path, message: "Expected an array." }];
}

function nonEmptyArrayIssues(value: unknown, path: string): ValidationIssue[] {
  return Array.isArray(value) && value.length > 0
    ? []
    : [{ path, message: "Expected a non-empty array." }];
}

function confidenceIssues(value: unknown, path: string): ValidationIssue[] {
  return typeof value === "number" && value >= 0 && value <= 1
    ? []
    : [{ path, message: "Expected a number from 0 to 1." }];
}

function confidenceLabelIssues(value: unknown, path: string): ValidationIssue[] {
  return value === "high" || value === "medium" || value === "low"
    ? []
    : [{ path, message: "Expected high, medium, or low." }];
}

function supportedIdsIssues(value: unknown, ids: ReadonlySet<string>, path: string) {
  return Array.isArray(value)
    ? value.flatMap((id, index) => supportedIdIssues(id, ids, `${path}.${index}`))
    : [];
}

function supportedIdIssues(value: unknown, ids: ReadonlySet<string>, path: string) {
  return typeof value === "string" && ids.has(value)
    ? []
    : [{ path, message: "Expected an event id from the context packet." }];
}

function sameValueIssues(value: unknown, expected: string, path: string): ValidationIssue[] {
  return value === expected ? [] : [{ path, message: `Expected ${expected}.` }];
}

function entityTypeIssues(value: unknown, path: string): ValidationIssue[] {
  return entityTypeValues().has(value as EntityType)
    ? []
    : [{ path, message: "Expected a known entity type." }];
}

function textIssue(value: unknown, path: string): ValidationIssue[] {
  return typeof value === "string" && value.trim() !== ""
    ? []
    : [{ path, message: "Expected non-empty text." }];
}

function arrayField(value: unknown, key: string): unknown {
  return isRecord(value) ? value[key] : undefined;
}

function evidenceEventIds(value: unknown): string[] {
  return Array.isArray(value)
    ? value
        .map((item) => (isRecord(item) ? item.eventId : undefined))
        .filter((id): id is string => typeof id === "string")
    : [];
}

function isRecord(value: unknown): value is Readonly<Record<string, unknown>> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function entityTypeValues(): ReadonlySet<EntityType> {
  return new Set(["person", "organization", "place", "project", "object", "topic", "custom"]);
}

function validationFallbackAnswer(
  packet: ContextPacket,
  issues: readonly ValidationIssue[],
): AnswerDraft {
  return {
    question: packet.question,
    summary: "답변 모델 출력이 검증을 통과하지 못해 근거 기반 답변을 보류했습니다.",
    causalCandidates: [],
    evidence: packet.retrievedMemories.map(evidenceFromMemory),
    uncertainty: [
      "답변 모델이 존재하지 않는 기억을 인용하거나 필수 형식을 지키지 않았습니다.",
      `검증 실패 위치: ${issues
        .map((issue) => issue.path)
        .slice(0, 3)
        .join(", ")}`,
    ],
    suggestedQuestions: ["검색된 기억 근거를 확인한 뒤 질문을 더 좁혀보세요."],
  };
}

function scoreMemory(event: MemoryEvent, context: ScoringContext): RetrievedMemory {
  const reasons = scoreReasons(event, context);
  return {
    event,
    score: memoryScore(reasons),
    reasons,
    forgotten: !directlyNamed(event, context.query),
  };
}

function memoryScore(reasons: readonly string[]): number {
  return hasSubstantiveReason(reasons)
    ? reasons.reduce((total, reason) => total + reasonScore(reason), 0)
    : 0;
}

function hasSubstantiveReason(reasons: readonly string[]): boolean {
  return reasons.some((reason) => !reason.startsWith("temporal:"));
}

function scoreReasons(event: MemoryEvent, context: ScoringContext): string[] {
  return [
    ...ftsReason(event, context.ftsHits),
    ...overlapReasons("topic", event.topics, context.query.topics),
    ...overlapReasons("emotion", event.emotions, context.query.emotions),
    ...overlapReasons("entity", entityNames(event), context.query.entities),
    ...attributeReasons(event.attributes, context.query.attributes),
    ...linkReasons(event, context),
    ...temporalReason(event, context.query),
  ];
}

function reasonScore(reason: string): number {
  if (reason === "temporal:future") {
    return -10;
  }
  const weights: Record<string, number> = {
    fts: 3,
    attribute: 2.5,
    entity: 2,
    link: 3.5,
    topic: 1.5,
    emotion: 1,
    temporal: 0.5,
  };
  return weights[reason.split(":")[0] ?? ""] ?? 0;
}

function directlyNamed(event: MemoryEvent, query: RetrievalQuery): boolean {
  return [
    ...entityNames(event),
    ...event.topics,
    ...event.attributes.map((item) => item.value),
  ].some((value) => query.text.includes(value));
}

function ftsReason(event: MemoryEvent, ftsHits: ReadonlySet<string>): string[] {
  return ftsHits.has(event.id) ? ["fts:text"] : [];
}

function overlapReasons(
  kind: string,
  values: readonly string[],
  queryValues: readonly string[] = [],
): string[] {
  return values
    .filter((value) => queryValues.some((query) => sameText(value, query)))
    .map(() => `${kind}:overlap`);
}

function attributeReasons(
  values: readonly EventAttribute[],
  queryValues: readonly EventAttribute[] = [],
): string[] {
  return values
    .filter((value) => queryValues.some((query) => sameAttribute(value, query)))
    .map(() => "attribute:overlap");
}

function linkReasons(event: MemoryEvent, context: ScoringContext): string[] {
  return context.links.flatMap((link) => linkReason(event, context, link));
}

function linkReason(event: MemoryEvent, context: ScoringContext, link: EventLinkInput): string[] {
  if (link.type === "candidate_cause") {
    return link.fromEventId === event.id && linkedEventMatches(link.toEventId, context)
      ? ["link:candidate_cause"]
      : [];
  }
  return similarLinkedEventId(event.id, link).some((id) => linkedEventMatches(id, context))
    ? [`link:${link.type}`]
    : [];
}

function similarLinkedEventId(eventId: string, link: EventLinkInput): string[] {
  if (link.type !== "similar") {
    return [];
  }
  return link.fromEventId === eventId
    ? [link.toEventId]
    : link.toEventId === eventId
      ? [link.fromEventId]
      : [];
}

function linkedEventMatches(eventId: string, context: ScoringContext): boolean {
  const event = context.events.find((candidate) => candidate.id === eventId);
  return event === undefined ? false : scoreReasons(event, linklessContext(context)).length > 0;
}

function linklessContext(context: ScoringContext): ScoringContext {
  return { ...context, ftsHits: new Set(), links: [] };
}

function temporalReason(event: MemoryEvent, query: RetrievalQuery): string[] {
  if (query.referenceDate === undefined) {
    return [];
  }
  return event.occurredAt <= query.referenceDate ? ["temporal:prior"] : ["temporal:future"];
}

function sameText(left: string, right: string): boolean {
  return left.includes(right) || right.includes(left);
}

function sameAttribute(left: EventAttribute, right: EventAttribute): boolean {
  return left.type === right.type && sameText(left.value, right.value);
}

function entityNames(event: MemoryEvent): string[] {
  return event.entities.map((entity) => entity.name);
}

function evaluateCase(store: SubbrainStore, testCase: EvaluationCase) {
  const topFive = retrieveMemories(store, testCase.query, 5);
  const topTen = retrieveMemories(store, testCase.query, 10);
  return {
    recallAt5: recall(topFive, testCase.relevantEventIds),
    recallAt10: recall(topTen, testCase.relevantEventIds),
    forgottenMemoryHitRate: forgottenHitRate(topFive, testCase.forgottenEventIds),
    evidenceCoverage: evidenceCoverage(topTen, testCase.relevantEventIds),
  };
}

function recall(memories: readonly RetrievedMemory[], expected: readonly string[]): number {
  return expected.length === 0 ? 1 : hitCount(memories, expected) / expected.length;
}

function forgottenHitRate(
  memories: readonly RetrievedMemory[],
  expected: readonly string[],
): number {
  const forgotten = memories.filter((memory) => memory.forgotten);
  return recall(forgotten, expected);
}

function evidenceCoverage(
  memories: readonly RetrievedMemory[],
  expected: readonly string[],
): number {
  return recall(
    memories.filter((memory) => memory.reasons.length > 0),
    expected,
  );
}

function hitCount(memories: readonly RetrievedMemory[], expected: readonly string[]): number {
  return expected.filter((id) => memories.some((memory) => memory.event.id === id)).length;
}

function average(values: readonly number[]): number {
  return values.reduce((total, value) => total + value, 0) / values.length;
}

function summarizeEntry(text: string): string {
  return text.trim().replace(/\s+/g, " ").slice(0, 120);
}

function entryTopics(text: string): string[] {
  return uniqueTexts([
    ...topicWhen(text, "이직", "이직 고민"),
    ...topicWhen(text, "팀장", "업무 방향"),
    ...topicWhen(text, "방향", "업무 방향"),
    ...topicWhen(text, "피곤", "컨디션"),
    ...topicWhen(text, "목", "컨디션"),
    ...topicWhen(text, "손가락", "손가락 증상"),
  ]);
}

function entryEmotions(text: string): string[] {
  return uniqueTexts([
    ...topicWhen(text, "답답", "답답함"),
    ...topicWhen(text, "걱정", "걱정"),
    ...topicWhen(text, "피곤", "피로감"),
    ...topicWhen(text, "만족", "만족감"),
  ]);
}

function entryEntities(text: string): EntityInput[] {
  return [
    ...entityWhen(text, "팀장", "person"),
    ...entityWhen(text, "회사", "organization"),
    ...entityWhen(text, "열무", "object"),
    ...entityWhen(text, "손가락", "object"),
  ];
}

function entryAttributes(text: string): EventAttribute[] {
  return [
    ...attributeWhen(text, "방향", "work_mode", "방향 변경"),
    ...attributeWhen(text, "목", "symptom", "목 불편감"),
    ...attributeWhen(text, "피곤", "symptom", "피로감"),
    ...attributeWhen(text, "감각", "symptom", "감각 이상"),
  ];
}

function topicWhen(text: string, token: string, value: string): string[] {
  return text.includes(token) ? [value] : [];
}

function entityWhen(text: string, token: string, type: EntityType): EntityInput[] {
  return text.includes(token)
    ? [{ id: `entity_${slugText(valueForEntity(token))}`, type, name: token }]
    : [];
}

function attributeWhen(text: string, token: string, type: string, value: string): EventAttribute[] {
  return text.includes(token) ? [{ type, value }] : [];
}

function valueForEntity(value: string): string {
  return value.toLowerCase();
}

function slugText(value: string): string {
  return value.replace(/[^a-z0-9가-힣]+/g, "_");
}

function hashText(value: string): string {
  let hash = 5381;
  for (const char of value) {
    hash = (hash * 33 + codePoint(char)) >>> 0;
  }
  return hash.toString(36);
}

function codePoint(value: string): number {
  return value.codePointAt(0) ?? 0;
}

function uniqueTexts(values: readonly string[]): string[] {
  return [...new Set(values)];
}

function fakeAnswer(packet: ContextPacket): AnswerDraft {
  return {
    question: packet.question,
    summary: answerSummary(packet),
    causalCandidates: packet.causalCandidates.map(candidateFromMemory),
    evidence: packet.retrievedMemories.map(evidenceFromMemory),
    uncertainty: uncertainty(packet),
    suggestedQuestions: suggestedQuestions(packet),
  };
}

function answerSummary(packet: ContextPacket): string {
  return packet.retrievedMemories.length === 0
    ? "기록상 이 질문을 뒷받침할 개인 기억이 충분하지 않습니다."
    : "검색된 기억을 보면 단정적 원인보다 확인할 가치가 있는 연결 후보가 있습니다.";
}

function candidateFromMemory(memory: RetrievedMemory): CausalCandidate {
  return {
    eventId: memory.event.id,
    label: memory.event.summary,
    confidence: confidence(memory.score),
    evidenceEventIds: [memory.event.id],
    rationale: candidateRationale(memory),
  };
}

function candidateRationale(memory: RetrievedMemory): string {
  return `${memory.event.occurredAt} 기록이며 연결 근거는 ${memory.reasons.join(", ")}입니다.`;
}

function evidenceFromMemory(memory: RetrievedMemory): AnswerEvidence {
  return {
    eventId: memory.event.id,
    sourceEntryId: memory.event.sourceEntryId,
    occurredAt: memory.event.occurredAt,
    summary: memory.event.summary,
    reasons: memory.reasons,
  };
}

function confidence(score: number): AnswerConfidence {
  return score >= 6 ? "high" : score >= 3 ? "medium" : "low";
}

function uncertainty(packet: ContextPacket): string[] {
  return packet.retrievedMemories.length === 0
    ? ["관련 기억이 검색되지 않아 개인 맥락 기반 답변을 만들 수 없습니다."]
    : ["검색된 기억은 인과 증명이 아니라 가능한 연결 후보입니다."];
}

function suggestedQuestions(packet: ContextPacket): string[] {
  return packet.causalCandidates
    .slice(0, 3)
    .map((memory) => `${memory.event.summary}도 함께 확인할까요?`);
}

function answerRules(): string[] {
  return [
    "Present possible connections, not final causes.",
    "Cite event ids for every personal-memory claim.",
    "Show uncertainty and missing evidence.",
    "Prefer next checks or questions over decisions.",
  ];
}
