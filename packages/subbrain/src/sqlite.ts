import { createRequire } from "node:module";
import type { DatabaseSync, SQLInputValue } from "node:sqlite";
import type {
  EntityInput,
  EventAttribute,
  EventLinkInput,
  MemoryEvent,
  MemoryEventInput,
  RawEntryInput,
  SubbrainStore,
} from "./index.js";

const require = createRequire(import.meta.url);
const { DatabaseSync: RuntimeDatabaseSync } = require("node:sqlite") as {
  readonly DatabaseSync: new (path: string) => DatabaseSync;
};
const CURRENT_SCHEMA_VERSION = 2;

type EventRow = Omit<MemoryEventInput, "topics" | "emotions" | "entities" | "attributes"> & {
  readonly topics: string;
  readonly emotions: string;
};

type EntityRow = EntityInput & { readonly event_id: string };

type AttributeRow = EventAttribute & { readonly event_id: string };

export class SqliteSubbrainStore implements SubbrainStore {
  readonly #db: DatabaseSync;

  constructor(path: string) {
    this.#db = new RuntimeDatabaseSync(path);
    migrate(this.#db);
  }

  addRawEntry(input: RawEntryInput): void {
    this.#db.prepare(rawEntrySql()).run(input.id, input.text, input.recordedAt);
  }

  addMemoryEvent(input: MemoryEventInput): void {
    this.transaction(() => this.replaceMemoryEvent(input));
  }

  addEventLink(input: EventLinkInput): void {
    this.transaction(() => this.replaceEventLink(input));
  }

  deleteMemoryEventsForEntry(sourceEntryId: string): void {
    this.transaction(() => this.deleteEntryEvents(sourceEntryId));
  }

  private deleteEntryEvents(sourceEntryId: string): void {
    for (const id of sourceEventIds(this.#db, sourceEntryId)) {
      this.deleteMemoryEvent(id);
    }
  }

  listEventLinks(): EventLinkInput[] {
    return eventLinkRows(this.#db);
  }

  listMemoryEvents(): MemoryEvent[] {
    return eventRows(this.#db).map((row) =>
      hydrateEvent(row, entityRows(this.#db), attributeRows(this.#db)),
    );
  }

  listRawEntries(): RawEntryInput[] {
    return rawEntryRows(this.#db);
  }

  saveExtractedEntry(
    input: RawEntryInput,
    events: readonly MemoryEventInput[],
    links: readonly EventLinkInput[] = [],
  ): void {
    this.transaction(() => {
      this.addRawEntry(input);
      this.deleteEntryEvents(input.id);
      for (const event of events) {
        this.replaceMemoryEvent(event);
      }
      for (const link of links) {
        this.replaceEventLink(link);
      }
    });
  }

  searchEventIds(text: string): Set<string> {
    const query = ftsQuery(text);
    return query === "" ? new Set() : new Set(ftsRows(this.#db, query).map((row) => row.event_id));
  }

  close(): void {
    this.#db.close();
  }

  private addAttribute(eventId: string, input: EventAttribute): void {
    this.#db.prepare(attributeSql()).run(eventId, input.type, input.value);
  }

  private addEntity(eventId: string, input: EntityInput): void {
    assertEntityIdentity(this.#db, input);
    this.#db.prepare(entitySql()).run(input.id, input.type, input.name);
    this.#db.prepare(eventEntitySql()).run(eventId, input.id);
  }

  private deleteMemoryEvent(eventId: string): void {
    this.deleteMemoryEventDetails(eventId);
    this.#db
      .prepare("DELETE FROM event_links WHERE fromEventId = ? OR toEventId = ?")
      .run(eventId, eventId);
    this.#db.prepare("DELETE FROM memory_events WHERE id = ?").run(eventId);
    this.#db
      .prepare("DELETE FROM entities WHERE id NOT IN (SELECT entity_id FROM event_entities)")
      .run();
  }

  private replaceMemoryEvent(input: MemoryEventInput): void {
    this.deleteMemoryEventDetails(input.id);
    this.#db.prepare(memoryEventSql()).run(...memoryEventValues(input));
    for (const entity of input.entities ?? []) {
      this.addEntity(input.id, entity);
    }
    for (const attribute of input.attributes ?? []) {
      this.addAttribute(input.id, attribute);
    }
    this.#db.prepare(ftsSql()).run(...ftsValues(input));
  }

  private replaceEventLink(input: EventLinkInput): void {
    this.#db.prepare(deleteEventLinkSql()).run(input.fromEventId, input.toEventId, input.type);
    this.#db.prepare(eventLinkSql()).run(...eventLinkValues(input));
  }

  private deleteMemoryEventDetails(eventId: string): void {
    this.#db.prepare("DELETE FROM event_entities WHERE event_id = ?").run(eventId);
    this.#db.prepare("DELETE FROM event_attributes WHERE event_id = ?").run(eventId);
    this.#db.prepare("DELETE FROM memory_event_fts WHERE event_id = ?").run(eventId);
  }

  private transaction(work: () => void): void {
    this.#db.exec("BEGIN");
    try {
      work();
      this.#db.exec("COMMIT");
    } catch (error) {
      this.#db.exec("ROLLBACK");
      throw error;
    }
  }
}

function migrate(db: DatabaseSync): void {
  const version = schemaVersion(db);
  if (version > CURRENT_SCHEMA_VERSION) {
    throw new Error(`Unsupported SubBrain schema version: ${version}`);
  }
  db.exec("PRAGMA busy_timeout = 1000");
  db.exec("PRAGMA foreign_keys = ON");
  if (!hasTable(db, "memory_events")) {
    db.exec(schemaSql());
    db.exec(`PRAGMA user_version = ${CURRENT_SCHEMA_VERSION}`);
    return;
  }
  if (version < CURRENT_SCHEMA_VERSION) {
    migrateLegacySchema(db);
  }
}

function migrateLegacySchema(db: DatabaseSync): void {
  db.exec("PRAGMA foreign_keys = OFF");
  db.exec("BEGIN IMMEDIATE");
  try {
    db.exec(legacyMigrationSql());
    db.exec(`PRAGMA user_version = ${CURRENT_SCHEMA_VERSION}`);
    db.exec("COMMIT");
  } catch (error) {
    db.exec("ROLLBACK");
    throw error;
  } finally {
    db.exec("PRAGMA foreign_keys = ON");
  }
  const violations = db.prepare("PRAGMA foreign_key_check").all();
  if (violations.length > 0) {
    throw new Error("SubBrain schema migration left foreign-key violations");
  }
}

function schemaVersion(db: DatabaseSync): number {
  const row = db.prepare("PRAGMA user_version").get() as { readonly user_version: number };
  return row.user_version;
}

function hasTable(db: DatabaseSync, name: string): boolean {
  return (
    db.prepare("SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = ?").get(name) !==
    undefined
  );
}

function eventRows(db: DatabaseSync): EventRow[] {
  return db
    .prepare("SELECT * FROM memory_events ORDER BY occurredAt ASC")
    .all() as unknown as EventRow[];
}

function rawEntryRows(db: DatabaseSync): RawEntryInput[] {
  return db
    .prepare("SELECT id, text, recordedAt FROM raw_entries ORDER BY recordedAt ASC")
    .all() as unknown as RawEntryInput[];
}

function entityRows(db: DatabaseSync): EntityRow[] {
  return db.prepare(entityRowsSql()).all() as unknown as EntityRow[];
}

function attributeRows(db: DatabaseSync): AttributeRow[] {
  return db
    .prepare("SELECT event_id, type, value FROM event_attributes")
    .all() as unknown as AttributeRow[];
}

function ftsRows(db: DatabaseSync, query: string): Array<{ readonly event_id: string }> {
  return db
    .prepare("SELECT event_id FROM memory_event_fts WHERE memory_event_fts MATCH ?")
    .all(query) as Array<{ readonly event_id: string }>;
}

function eventLinkRows(db: DatabaseSync): EventLinkInput[] {
  return db.prepare("SELECT * FROM event_links").all() as unknown as EventLinkInput[];
}

function sourceEventIds(db: DatabaseSync, sourceEntryId: string): string[] {
  return db
    .prepare("SELECT id FROM memory_events WHERE sourceEntryId = ?")
    .all(sourceEntryId)
    .map((row) => (row as { readonly id: string }).id);
}

function assertEntityIdentity(db: DatabaseSync, input: EntityInput): void {
  const row = db.prepare("SELECT type, name FROM entities WHERE id = ?").get(input.id) as
    | { readonly type: string; readonly name: string }
    | undefined;
  if (row !== undefined && (row.type !== input.type || row.name !== input.name)) {
    throw new Error(`Conflicting SubBrain entity identity: ${input.id}`);
  }
}

function hydrateEvent(
  row: EventRow,
  entities: readonly EntityRow[],
  attributes: readonly AttributeRow[],
): MemoryEvent {
  return {
    ...row,
    topics: parseList(row.topics),
    emotions: parseList(row.emotions),
    entities: entities.filter((entity) => entity.event_id === row.id).map(publicEntity),
    attributes: attributes
      .filter((attribute) => attribute.event_id === row.id)
      .map(publicAttribute),
  };
}

function publicEntity(row: EntityRow): EntityInput {
  return { id: row.id, type: row.type, name: row.name };
}

function publicAttribute(row: AttributeRow): EventAttribute {
  return { type: row.type, value: row.value };
}

function parseList(value: string): string[] {
  return JSON.parse(value) as string[];
}

function memoryEventValues(input: MemoryEventInput): SQLInputValue[] {
  return [
    input.id,
    input.sourceEntryId,
    input.occurredAt,
    input.summary,
    input.eventType,
    JSON.stringify(input.topics),
    JSON.stringify(input.emotions),
    input.confidence,
  ];
}

function ftsValues(input: MemoryEventInput): SQLInputValue[] {
  return [
    input.id,
    input.summary,
    input.topics.join(" "),
    input.emotions.join(" "),
    (input.attributes ?? []).map((item) => item.value).join(" "),
    (input.entities ?? []).map((item) => item.name).join(" "),
  ];
}

function eventLinkValues(input: EventLinkInput): SQLInputValue[] {
  return [input.fromEventId, input.toEventId, input.type, input.reason, input.confidence];
}

function ftsQuery(text: string): string {
  return text
    .toLowerCase()
    .split(/[^a-z0-9가-힣]+/)
    .filter((token) => token.length > 1)
    .map((token) => `"${token}"`)
    .join(" OR ");
}

function schemaSql(): string {
  return [
    "CREATE TABLE IF NOT EXISTS raw_entries (id TEXT PRIMARY KEY, text TEXT NOT NULL, recordedAt TEXT NOT NULL)",
    memoryEventsTableSql(),
    "CREATE TABLE IF NOT EXISTS entities (id TEXT PRIMARY KEY, type TEXT NOT NULL, name TEXT NOT NULL)",
    eventEntitiesTableSql(),
    eventAttributesTableSql(),
    eventLinksTableSql(),
    ftsTableSql(),
  ].join(";\n");
}

function legacyMigrationSql(): string {
  return [
    memoryEventsTableSql().replace("memory_events", "memory_events_v2"),
    eventEntitiesTableSql().replace("event_entities", "event_entities_v2"),
    eventAttributesTableSql().replace("event_attributes", "event_attributes_v2"),
    eventLinksTableSql().replace("event_links", "event_links_v2"),
    copyLegacyRowsSql(),
    "DROP TABLE memory_event_fts",
    "DROP TABLE event_links",
    "DROP TABLE event_entities",
    "DROP TABLE event_attributes",
    "DROP TABLE memory_events",
    "ALTER TABLE memory_events_v2 RENAME TO memory_events",
    "ALTER TABLE event_entities_v2 RENAME TO event_entities",
    "ALTER TABLE event_attributes_v2 RENAME TO event_attributes",
    "ALTER TABLE event_links_v2 RENAME TO event_links",
    ftsTableSql(),
    rebuildFtsSql(),
    "DELETE FROM entities WHERE id NOT IN (SELECT entity_id FROM event_entities)",
  ].join(";\n");
}

function copyLegacyRowsSql(): string {
  return [
    "INSERT INTO memory_events_v2 SELECT me.* FROM memory_events me JOIN raw_entries re ON re.id = me.sourceEntryId WHERE me.confidence BETWEEN 0 AND 1",
    "INSERT OR IGNORE INTO event_entities_v2 SELECT ee.* FROM event_entities ee JOIN memory_events_v2 me ON me.id = ee.event_id JOIN entities e ON e.id = ee.entity_id",
    "INSERT INTO event_attributes_v2 SELECT ea.* FROM event_attributes ea JOIN memory_events_v2 me ON me.id = ea.event_id",
    "INSERT OR IGNORE INTO event_links_v2 SELECT el.* FROM event_links el JOIN memory_events_v2 source ON source.id = el.fromEventId JOIN memory_events_v2 target ON target.id = el.toEventId WHERE el.confidence BETWEEN 0 AND 1",
  ].join(";\n");
}

function rebuildFtsSql(): string {
  return [
    "INSERT INTO memory_event_fts (event_id, summary, topics, emotions, attributes, entities)",
    "SELECT me.id, me.summary, me.topics, me.emotions,",
    "COALESCE((SELECT group_concat(value, ' ') FROM event_attributes WHERE event_id = me.id), ''),",
    "COALESCE((SELECT group_concat(e.name, ' ') FROM event_entities ee JOIN entities e ON e.id = ee.entity_id WHERE ee.event_id = me.id), '')",
    "FROM memory_events me",
  ].join(" ");
}

function memoryEventsTableSql(): string {
  return [
    "CREATE TABLE IF NOT EXISTS memory_events (id TEXT PRIMARY KEY, sourceEntryId TEXT NOT NULL",
    "occurredAt TEXT NOT NULL, summary TEXT NOT NULL, eventType TEXT NOT NULL",
    "topics TEXT NOT NULL, emotions TEXT NOT NULL, confidence REAL NOT NULL",
    "CHECK (confidence >= 0 AND confidence <= 1)",
    "FOREIGN KEY(sourceEntryId) REFERENCES raw_entries(id) ON DELETE CASCADE)",
  ].join(", ");
}

function eventEntitiesTableSql(): string {
  return [
    "CREATE TABLE IF NOT EXISTS event_entities (event_id TEXT NOT NULL, entity_id TEXT NOT NULL",
    "UNIQUE(event_id, entity_id)",
    "FOREIGN KEY(event_id) REFERENCES memory_events(id) ON DELETE CASCADE",
    "FOREIGN KEY(entity_id) REFERENCES entities(id) ON DELETE CASCADE)",
  ].join(", ");
}

function eventAttributesTableSql(): string {
  return [
    "CREATE TABLE IF NOT EXISTS event_attributes (event_id TEXT NOT NULL, type TEXT NOT NULL, value TEXT NOT NULL",
    "FOREIGN KEY(event_id) REFERENCES memory_events(id) ON DELETE CASCADE)",
  ].join(", ");
}

function eventLinksTableSql(): string {
  return [
    "CREATE TABLE IF NOT EXISTS event_links (fromEventId TEXT NOT NULL, toEventId TEXT NOT NULL",
    "type TEXT NOT NULL, reason TEXT NOT NULL, confidence REAL NOT NULL",
    "CHECK (confidence >= 0 AND confidence <= 1)",
    "UNIQUE(fromEventId, toEventId, type)",
    "FOREIGN KEY(fromEventId) REFERENCES memory_events(id) ON DELETE CASCADE",
    "FOREIGN KEY(toEventId) REFERENCES memory_events(id) ON DELETE CASCADE)",
  ].join(", ");
}

function ftsTableSql(): string {
  return [
    "CREATE VIRTUAL TABLE IF NOT EXISTS memory_event_fts USING fts5(",
    "event_id UNINDEXED, summary, topics, emotions, attributes, entities)",
  ].join("");
}

function rawEntrySql(): string {
  return [
    "INSERT INTO raw_entries (id, text, recordedAt) VALUES (?, ?, ?)",
    "ON CONFLICT(id) DO UPDATE SET text = excluded.text, recordedAt = excluded.recordedAt",
  ].join(" ");
}

function memoryEventSql(): string {
  return [
    "INSERT INTO memory_events",
    "(id, sourceEntryId, occurredAt, summary, eventType, topics, emotions, confidence)",
    "VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
    "ON CONFLICT(id) DO UPDATE SET sourceEntryId = excluded.sourceEntryId,",
    "occurredAt = excluded.occurredAt, summary = excluded.summary,",
    "eventType = excluded.eventType, topics = excluded.topics,",
    "emotions = excluded.emotions, confidence = excluded.confidence",
  ].join(" ");
}

function entitySql(): string {
  return "INSERT OR IGNORE INTO entities (id, type, name) VALUES (?, ?, ?)";
}

function eventEntitySql(): string {
  return "INSERT OR IGNORE INTO event_entities (event_id, entity_id) VALUES (?, ?)";
}

function attributeSql(): string {
  return "INSERT INTO event_attributes (event_id, type, value) VALUES (?, ?, ?)";
}

function eventLinkSql(): string {
  return "INSERT INTO event_links (fromEventId, toEventId, type, reason, confidence) VALUES (?, ?, ?, ?, ?)";
}

function deleteEventLinkSql(): string {
  return "DELETE FROM event_links WHERE fromEventId = ? AND toEventId = ? AND type = ?";
}

function ftsSql(): string {
  return [
    "INSERT INTO memory_event_fts (event_id, summary, topics, emotions, attributes, entities)",
    "VALUES (?, ?, ?, ?, ?, ?)",
  ].join(" ");
}

function entityRowsSql(): string {
  return [
    "SELECT ee.event_id, e.id, e.type, e.name",
    "FROM event_entities ee JOIN entities e ON e.id = ee.entity_id",
  ].join(" ");
}
