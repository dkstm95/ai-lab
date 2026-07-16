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

export type ValidationKind =
  | "answer_draft"
  | "event_link"
  | "memory_event"
  | "raw_entry"
  | "retrieval_query";

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

export interface EventLinkingInput {
  readonly existingEvents: readonly MemoryEvent[];
  readonly newEvents: readonly MemoryEventInput[];
}

export interface EventLinker {
  link(input: EventLinkingInput): Promise<readonly EventLinkInput[]>;
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
  readonly links: readonly EventLinkInput[];
}

export interface SubbrainEngineOptions {
  readonly answerModel?: AnswerModel;
  readonly extractor?: MemoryExtractor;
  readonly linker?: EventLinker;
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
  readonly precisionAt5: number;
  readonly precisionAt10: number;
  readonly forgottenMemoryHitRate: number;
  readonly forgottenMemoryPrecision: number;
}

export interface SubbrainStore {
  addRawEntry(input: RawEntryInput): void;
  addMemoryEvent(input: MemoryEventInput): void;
  addEventLink(input: EventLinkInput): void;
  deleteMemoryEventsForEntry(sourceEntryId: string): void;
  listEventLinks(): EventLinkInput[];
  listMemoryEvents(): MemoryEvent[];
  listRawEntries(): RawEntryInput[];
  saveExtractedEntry(
    input: RawEntryInput,
    events: readonly MemoryEventInput[],
    links?: readonly EventLinkInput[],
  ): void;
  searchEventIds(text: string): Set<string>;
  close(): void;
}

interface ScoringContext {
  readonly events: readonly MemoryEvent[];
  readonly ftsHits: ReadonlySet<string>;
  readonly links: readonly EventLinkInput[];
  readonly query: RetrievalQuery;
  readonly rawEntries: ReadonlyMap<string, RawEntryInput>;
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
    rawEntries: new Map(store.listRawEntries().map((entry) => [entry.id, entry])),
  };
}

function retrievableMemory(memory: RetrievedMemory): boolean {
  return memory.score > 0 && !memory.reasons.includes("temporal:future");
}

function causalCandidate(memory: RetrievedMemory, query: RetrievalQuery): boolean {
  return (
    query.referenceDate !== undefined &&
    priorEvent(memory, query) &&
    !evidenceOnlyEvent(memory.event) &&
    memory.reasons.includes("link:candidate_cause")
  );
}

function priorEvent(memory: RetrievedMemory, query: RetrievalQuery): boolean {
  return query.referenceDate === undefined || memory.event.occurredAt <= query.referenceDate;
}

function evidenceOnlyEvent(event: MemoryEvent): boolean {
  return event.eventType.includes("observation") || event.eventType.includes("follow_up");
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

export class RuleBasedEventLinker implements EventLinker {
  async link(input: EventLinkingInput): Promise<readonly EventLinkInput[]> {
    return ruleBasedEventLinks(input);
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
  readonly #linker: EventLinker;
  readonly #maxModelAttempts: number;
  readonly #queryInterpreter: QueryInterpreter;
  readonly #store: SubbrainStore;

  constructor(store: SubbrainStore, options: SubbrainEngineOptions = {}) {
    this.#store = store;
    this.#answerModel = options.answerModel ?? new DeterministicAnswerModel();
    this.#extractor = options.extractor ?? new RuleBasedMemoryExtractor();
    this.#linker = options.linker ?? new RuleBasedEventLinker();
    this.#maxModelAttempts = modelAttempts(options.maxModelAttempts);
    this.#queryInterpreter = options.queryInterpreter ?? new RuleBasedQueryInterpreter();
  }

  async addEntry(input: RawEntryInput): Promise<SubbrainEntryResult> {
    assertValidRawEntry(input);
    const events = await this.extractValidEvents(input);
    const existingEvents = this.#store
      .listMemoryEvents()
      .filter((event) => event.sourceEntryId !== input.id);
    const links = await this.linkValidEvents({ existingEvents, newEvents: events });
    this.#store.saveExtractedEntry(input, events, links);
    return { entry: input, events, links };
  }

  async answer(query: RetrievalQuery): Promise<SubbrainAnswerResult> {
    assertValidQuery(query);
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

  private async linkValidEvents(input: EventLinkingInput): Promise<readonly EventLinkInput[]> {
    return withValidatedRetry(
      () => this.#linker.link(input),
      (links) => assertValidLinks(links, input),
      "event_link",
      this.#maxModelAttempts,
    );
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
    precisionAt5: average(results.map((result) => result.precisionAt5)),
    precisionAt10: average(results.map((result) => result.precisionAt10)),
    forgottenMemoryHitRate: average(results.map((result) => result.forgottenMemoryHitRate)),
    forgottenMemoryPrecision: average(results.map((result) => result.forgottenMemoryPrecision)),
  };
}

export function answerEvidenceCoverage(packet: ContextPacket, answer: AnswerDraft): number {
  const expectedIds = packet.retrievedMemories.map((memory) => memory.event.id);
  const citedIds = new Set(answer.evidence.map((evidence) => evidence.eventId));
  return expectedIds.length === 0
    ? 1
    : expectedIds.filter((id) => citedIds.has(id)).length / expectedIds.length;
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
      eventType: entryEventType(input.text),
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
  return `event_${slugText(date)}_${hashText(`${input.id}\n${normalizeEntryText(input.text)}`)}`;
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

function ruleBasedEventLinks(input: EventLinkingInput): EventLinkInput[] {
  const newIds = new Set(input.newEvents.map((event) => event.id));
  const events = [...input.existingEvents, ...input.newEvents];
  return eventPairs(events)
    .filter(([left, right]) => newIds.has(left.id) || newIds.has(right.id))
    .flatMap(([left, right]) => inferEventPairLink(left, right));
}

function eventPairs(
  events: readonly MemoryEventInput[],
): Array<readonly [MemoryEventInput, MemoryEventInput]> {
  return events.flatMap((event, index) =>
    events.slice(index + 1).map((other) => [event, other] as const),
  );
}

function inferEventPairLink(left: MemoryEventInput, right: MemoryEventInput): EventLinkInput[] {
  const [earlier, later] = orderedEvents(left, right);
  if (causeEvent(earlier) && observationEvent(later) && sharesBodyArea(earlier, later)) {
    return [candidateCauseLink(earlier, later)];
  }
  return reflectionEvent(left) && reflectionEvent(right) && sharesReflectionFacet(left, right)
    ? [similarEventLink(earlier, later)]
    : [];
}

function orderedEvents(
  left: MemoryEventInput,
  right: MemoryEventInput,
): readonly [MemoryEventInput, MemoryEventInput] {
  return left.occurredAt < right.occurredAt ||
    (left.occurredAt === right.occurredAt && left.id < right.id)
    ? [left, right]
    : [right, left];
}

function causeEvent(event: MemoryEventInput): boolean {
  return event.eventType === "prior_treatment" || event.eventType === "daily_incident";
}

function observationEvent(event: MemoryEventInput): boolean {
  return event.eventType.includes("observation");
}

function reflectionEvent(event: MemoryEventInput): boolean {
  return event.eventType === "work_reflection" || event.eventType === "self_insight";
}

function sharesBodyArea(left: MemoryEventInput, right: MemoryEventInput): boolean {
  return sharedAttributes(left, right).some((attribute) => attribute.type === "body_area");
}

function sharesReflectionFacet(left: MemoryEventInput, right: MemoryEventInput): boolean {
  return (
    overlapValues(left.topics, right.topics) ||
    overlapValues(left.emotions, right.emotions) ||
    sharedAttributes(left, right).some((attribute) => attribute.type === "work_mode")
  );
}

function sharedAttributes(left: MemoryEventInput, right: MemoryEventInput): EventAttribute[] {
  return (left.attributes ?? []).filter((attribute) =>
    (right.attributes ?? []).some((candidate) => sameAttribute(attribute, candidate)),
  );
}

function overlapValues(left: readonly string[], right: readonly string[]): boolean {
  return left.some((value) => right.some((candidate) => sameText(value, candidate)));
}

function candidateCauseLink(source: MemoryEventInput, target: MemoryEventInput): EventLinkInput {
  return {
    fromEventId: source.id,
    toEventId: target.id,
    type: "candidate_cause",
    reason: "같은 신체 부위의 이전 사건과 이후 관찰이 연결됨",
    confidence: source.eventType === "prior_treatment" ? 0.55 : 0.45,
  };
}

function similarEventLink(source: MemoryEventInput, target: MemoryEventInput): EventLinkInput {
  return {
    fromEventId: source.id,
    toEventId: target.id,
    type: "similar",
    reason: "업무 주제, 감정, 또는 작업 방식이 반복됨",
    confidence: 0.6,
  };
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
  return Number.isFinite(value) ? Math.max(1, Math.floor(value ?? 1)) : 1;
}

function assertValidRawEntry(input: RawEntryInput): void {
  const issues = rawEntryIssues(input);
  if (issues.length > 0) {
    throw new SubbrainValidationError("raw_entry", issues);
  }
}

function rawEntryIssues(value: RawEntryInput): ValidationIssue[] {
  const record = value as unknown as Readonly<Record<string, unknown>>;
  return [
    ...requiredTextIssues(record, "entry", ["id", "text", "recordedAt"]),
    ...timestampIssues(value.recordedAt, "entry.recordedAt"),
  ];
}

function assertValidEvents(value: unknown, entry: RawEntryInput): readonly ValidationIssue[] {
  if (!Array.isArray(value)) {
    return [{ path: "events", message: "Expected an array." }];
  }
  return value.flatMap((event, index) => eventIssues(event, entry, `events.${index}`));
}

function assertValidLinks(value: unknown, input: EventLinkingInput): readonly ValidationIssue[] {
  if (!Array.isArray(value)) {
    return [{ path: "links", message: "Expected an array." }];
  }
  const events = [...input.existingEvents, ...input.newEvents];
  const ids = new Set(events.map((event) => event.id));
  return value.flatMap((link, index) => linkIssues(link, events, ids, `links.${index}`));
}

function linkIssues(
  value: unknown,
  events: readonly MemoryEventInput[],
  ids: ReadonlySet<string>,
  path: string,
): ValidationIssue[] {
  if (!isRecord(value)) {
    return [{ path, message: "Expected an object." }];
  }
  return [
    ...requiredTextIssues(value, path, ["fromEventId", "toEventId", "type", "reason"]),
    ...supportedIdIssues(value.fromEventId, ids, `${path}.fromEventId`),
    ...supportedIdIssues(value.toEventId, ids, `${path}.toEventId`),
    ...differentValueIssues(value.fromEventId, value.toEventId, `${path}.toEventId`),
    ...eventLinkTypeIssues(value.type, `${path}.type`),
    ...confidenceIssues(value.confidence, `${path}.confidence`),
    ...causalOrderIssues(value, events, path),
  ];
}

function assertValidQuery(value: RetrievalQuery): void {
  const issues = queryIssues(value);
  if (issues.length > 0) {
    throw new SubbrainValidationError("retrieval_query", issues);
  }
}

function assertValidAnswer(value: unknown, packet: ContextPacket): readonly ValidationIssue[] {
  const memories = new Map(
    packet.retrievedMemories.map((memory) => [memory.event.id, memory] as const),
  );
  const candidateIds = new Set(packet.causalCandidates.map((memory) => memory.event.id));
  const evidenceIds = new Set(evidenceEventIds(arrayField(value, "evidence")));
  return [
    ...answerShapeIssues(value, packet),
    ...candidateIssues(arrayField(value, "causalCandidates"), candidateIds, evidenceIds),
    ...evidenceIssues(arrayField(value, "evidence"), memories),
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
    ...dateIssues(value.occurredAt, `${path}.occurredAt`),
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
    ...optionalDateIssues(value.referenceDate, "query.referenceDate"),
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

function evidenceIssues(
  value: unknown,
  memories: ReadonlyMap<string, RetrievedMemory>,
): ValidationIssue[] {
  if (!Array.isArray(value)) {
    return [];
  }
  return value.flatMap((evidence, index) => evidenceItemIssues(evidence, index, memories));
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
    ...supportedIdsIssues(value.evidenceEventIds, evidenceIds, `${path}.evidenceEventIds`),
  ];
}

function evidenceItemIssues(
  value: unknown,
  index: number,
  memories: ReadonlyMap<string, RetrievedMemory>,
): ValidationIssue[] {
  const path = `answer.evidence.${index}`;
  if (!isRecord(value)) {
    return [{ path, message: "Expected an object." }];
  }
  return [
    ...requiredTextIssues(value, path, ["eventId", "sourceEntryId", "occurredAt", "summary"]),
    ...supportedIdIssues(value.eventId, new Set(memories.keys()), `${path}.eventId`),
    ...stringArrayIssues(value.reasons, `${path}.reasons`),
    ...canonicalEvidenceIssues(value, memories.get(String(value.eventId)), path),
  ];
}

function canonicalEvidenceIssues(
  value: Readonly<Record<string, unknown>>,
  memory: RetrievedMemory | undefined,
  path: string,
): ValidationIssue[] {
  if (memory === undefined) {
    return [];
  }
  return [
    ...sameValueIssues(value.sourceEntryId, memory.event.sourceEntryId, `${path}.sourceEntryId`),
    ...sameValueIssues(value.occurredAt, memory.event.occurredAt, `${path}.occurredAt`),
    ...sameValueIssues(value.summary, memory.event.summary, `${path}.summary`),
    ...sameStringArrayIssues(value.reasons, memory.reasons, `${path}.reasons`),
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

function sameStringArrayIssues(
  value: unknown,
  expected: readonly string[],
  path: string,
): ValidationIssue[] {
  return Array.isArray(value) &&
    value.length === expected.length &&
    value.every((item, index) => item === expected[index])
    ? []
    : [{ path, message: "Expected canonical evidence reasons." }];
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

function optionalDateIssues(value: unknown, path: string): ValidationIssue[] {
  return value === undefined ? [] : dateIssues(value, path);
}

function dateIssues(value: unknown, path: string): ValidationIssue[] {
  return typeof value === "string" && validDate(value)
    ? []
    : [{ path, message: "Expected YYYY-MM-DD." }];
}

function timestampIssues(value: unknown, path: string): ValidationIssue[] {
  return typeof value === "string" && validTimestamp(value)
    ? []
    : [{ path, message: "Expected an ISO-compatible timestamp." }];
}

function validTimestamp(value: string): boolean {
  return (
    /^\d{4}-\d{2}-\d{2}T/.test(value) &&
    validDate(value.slice(0, 10)) &&
    !Number.isNaN(Date.parse(value))
  );
}

function validDate(value: string): boolean {
  const timestamp = Date.parse(`${value}T00:00:00Z`);
  return (
    /^\d{4}-\d{2}-\d{2}$/.test(value) &&
    !Number.isNaN(timestamp) &&
    new Date(timestamp).toISOString().startsWith(value)
  );
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

function eventLinkTypeIssues(value: unknown, path: string): ValidationIssue[] {
  return eventLinkTypeValues().has(value as EventLinkType)
    ? []
    : [{ path, message: "Expected a known event-link type." }];
}

function differentValueIssues(left: unknown, right: unknown, path: string): ValidationIssue[] {
  return left !== right ? [] : [{ path, message: "Expected a different event id." }];
}

function causalOrderIssues(
  value: Readonly<Record<string, unknown>>,
  events: readonly MemoryEventInput[],
  path: string,
): ValidationIssue[] {
  if (value.type !== "candidate_cause") {
    return [];
  }
  const source = events.find((event) => event.id === value.fromEventId);
  const target = events.find((event) => event.id === value.toEventId);
  return source !== undefined && target !== undefined && source.occurredAt <= target.occurredAt
    ? []
    : [{ path: `${path}.fromEventId`, message: "Expected cause before target." }];
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

function eventLinkTypeValues(): ReadonlySet<EventLinkType> {
  return new Set(["similar", "follow_up", "contradicts", "candidate_cause"]);
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
    score: memoryScore(event, reasons, context),
    reasons,
    forgotten: !directlyNamed(event, context),
  };
}

function memoryScore(
  event: MemoryEvent,
  reasons: readonly string[],
  context: ScoringContext,
): number {
  return hasSubstantiveReason(reasons)
    ? reasons.reduce((total, reason) => total + reasonScore(reason), 0) + linkScore(event, context)
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
    topic: 1.5,
    emotion: 1,
    temporal: 0.5,
  };
  return weights[reason.split(":")[0] ?? ""] ?? 0;
}

function directlyNamed(event: MemoryEvent, context: ScoringContext): boolean {
  const source = context.rawEntries.get(event.sourceEntryId);
  if (source === undefined) {
    return structuredMention(event, context.query);
  }
  return sourceMentionsEvent(source.text, context);
}

function sourceMentionsEvent(sourceText: string, context: ScoringContext): boolean {
  const queryTerms = contentTermKeys(context.query.text);
  return [...contentTermKeys(sourceText)].some(
    (term) =>
      queryTerms.has(term) && termFrequency(term, context) <= mentionFrequencyLimit(context),
  );
}

function mentionFrequencyLimit(context: ScoringContext): number {
  return Math.min(2, Math.max(1, Math.floor(context.events.length / 2)));
}

function structuredMention(event: MemoryEvent, query: RetrievalQuery): boolean {
  return [
    ...entityNames(event),
    ...event.topics,
    ...event.attributes.map((item) => item.value),
  ].some((value) => query.text.includes(value));
}

function termFrequency(term: string, context: ScoringContext): number {
  return context.events.filter((event) => {
    const source = context.rawEntries.get(event.sourceEntryId);
    return source !== undefined && contentTermKeys(source.text).has(term);
  }).length;
}

function contentTermKeys(text: string): ReadonlySet<string> {
  return new Set(
    text
      .toLowerCase()
      .split(/[^a-z0-9가-힣]+/)
      .filter((token) => token.length > 1)
      .map((token) => token.slice(0, 2))
      .filter((term) => !stopTermKeys().has(term)),
  );
}

function stopTermKeys(): ReadonlySet<string> {
  return new Set([
    "오늘",
    "어제",
    "요즘",
    "내가",
    "자주",
    "하지",
    "그럴",
    "지난",
    "같은",
    "다시",
    "이유",
    "무엇",
    "어떤",
    "기록",
  ]);
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
  return uniqueTexts(matchingLinks(event, context).map((link) => `link:${link.type}`));
}

function matchingLinks(event: MemoryEvent, context: ScoringContext): EventLinkInput[] {
  return context.links.filter((link) => link.confidence > 0 && linkMatches(event, context, link));
}

function linkMatches(event: MemoryEvent, context: ScoringContext, link: EventLinkInput): boolean {
  if (link.type === "candidate_cause") {
    return (
      link.fromEventId === event.id &&
      causalLinkIsOrdered(link, context.events) &&
      linkedEventMatches(link.toEventId, context)
    );
  }
  return similarLinkedEventId(event.id, link).some((id) => linkedEventMatches(id, context));
}

function causalLinkIsOrdered(link: EventLinkInput, events: readonly MemoryEvent[]): boolean {
  const source = events.find((event) => event.id === link.fromEventId);
  const target = events.find((event) => event.id === link.toEventId);
  return source !== undefined && target !== undefined && source.occurredAt <= target.occurredAt;
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
  if (event === undefined) {
    return false;
  }
  const reasons = scoreReasons(event, linklessContext(context));
  return hasSubstantiveReason(reasons) && !reasons.includes("temporal:future");
}

function linkScore(event: MemoryEvent, context: ScoringContext): number {
  const confidenceByType = new Map<string, number>();
  for (const link of matchingLinks(event, context)) {
    confidenceByType.set(
      link.type,
      Math.max(confidenceByType.get(link.type) ?? 0, link.confidence),
    );
  }
  return [...confidenceByType.values()].reduce((total, confidence) => total + 3.5 * confidence, 0);
}

function linklessContext(context: ScoringContext): ScoringContext {
  return { ...context, links: [] };
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
    precisionAt5: precision(topFive, testCase.relevantEventIds),
    precisionAt10: precision(topTen, testCase.relevantEventIds),
    forgottenMemoryHitRate: forgottenHitRate(topFive, testCase.forgottenEventIds),
    forgottenMemoryPrecision: forgottenPrecision(topFive, testCase.forgottenEventIds),
  };
}

function recall(memories: readonly RetrievedMemory[], expected: readonly string[]): number {
  return expected.length === 0 ? 1 : hitCount(memories, expected) / expected.length;
}

function precision(memories: readonly RetrievedMemory[], expected: readonly string[]): number {
  return memories.length === 0 ? 1 : hitCount(memories, expected) / memories.length;
}

function forgottenHitRate(
  memories: readonly RetrievedMemory[],
  expected: readonly string[],
): number {
  const forgotten = memories.filter((memory) => memory.forgotten);
  return recall(forgotten, expected);
}

function forgottenPrecision(
  memories: readonly RetrievedMemory[],
  expected: readonly string[],
): number {
  return precision(
    memories.filter((memory) => memory.forgotten),
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
  return normalizeEntryText(text).slice(0, 120);
}

function normalizeEntryText(text: string): string {
  return text.trim().replace(/\s+/g, " ");
}

function entryEventType(text: string): string {
  if (hasAnyToken(text, ["감각", "하얘", "아프", "증상"])) {
    return "observation";
  }
  if (hasAnyToken(text, ["스테로이드", "주사", "치료", "처치"])) {
    return "prior_treatment";
  }
  if (hasAnyToken(text, ["가시", "찔"])) {
    return "daily_incident";
  }
  return hasAnyToken(text, ["이직", "팀장", "회사", "방향", "우선순위", "주도권", "성장"])
    ? "work_reflection"
    : "user_entry";
}

function entryTopics(text: string): string[] {
  return uniqueTexts([
    ...topicWhen(text, "이직", "이직 고민"),
    ...topicWhen(text, "팀장", "업무 방향"),
    ...topicWhen(text, "방향", "업무 방향"),
    ...topicWhen(text, "피곤", "컨디션"),
    ...topicWhen(text, "목", "컨디션"),
    ...topicWhen(text, "손가락", "손가락 증상"),
    ...topicWhen(text, "검지", "손가락 증상"),
    ...topicWhen(text, "감각", "손가락 증상"),
    ...topicWhen(text, "스테로이드", "이전 처치"),
    ...topicWhen(text, "주사", "이전 처치"),
    ...topicWhen(text, "열무", "열무 가시"),
    ...topicWhen(text, "가시", "열무 가시"),
    ...topicWhen(text, "우선순위", "업무 방향"),
    ...topicWhen(text, "주도권", "자율성"),
    ...topicWhen(text, "성장", "성장감"),
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
    ...entityWhenAny(text, ["손가락", "검지"], {
      id: "entity_finger",
      type: "object",
      name: "손가락",
    }),
  ];
}

function entryAttributes(text: string): EventAttribute[] {
  return [
    ...attributeWhenAny(text, ["방향", "우선순위"], "work_mode", "방향 변경이 잦음"),
    ...attributeWhenAny(text, ["손가락", "검지"], "body_area", "손가락"),
    ...attributeWhen(text, "목", "symptom", "목 불편감"),
    ...attributeWhen(text, "피곤", "symptom", "피로감"),
    ...attributeWhen(text, "감각", "symptom", "감각 이상"),
  ];
}

function topicWhen(text: string, token: string, value: string): string[] {
  return text.includes(token) ? [value] : [];
}

function hasAnyToken(text: string, tokens: readonly string[]): boolean {
  return tokens.some((token) => text.includes(token));
}

function entityWhen(text: string, token: string, type: EntityType): EntityInput[] {
  return text.includes(token)
    ? [{ id: `entity_${slugText(valueForEntity(token))}`, type, name: token }]
    : [];
}

function entityWhenAny(
  text: string,
  tokens: readonly string[],
  entity: EntityInput,
): EntityInput[] {
  return hasAnyToken(text, tokens) ? [entity] : [];
}

function attributeWhen(text: string, token: string, type: string, value: string): EventAttribute[] {
  return text.includes(token) ? [{ type, value }] : [];
}

function attributeWhenAny(
  text: string,
  tokens: readonly string[],
  type: string,
  value: string,
): EventAttribute[] {
  return hasAnyToken(text, tokens) ? [{ type, value }] : [];
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
  if (packet.retrievedMemories.length === 0) {
    return "기록상 이 질문을 뒷받침할 개인 기억이 충분하지 않습니다.";
  }
  return packet.causalCandidates.length === 0
    ? "관련 개인 기록은 찾았지만 원인 연결 후보를 만들 근거는 충분하지 않습니다."
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
