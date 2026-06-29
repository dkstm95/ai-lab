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
    this.deleteMemoryEvent(input.id);
    this.insertMemoryEvent(input);
  }

  addEventLink(input: EventLinkInput): void {
    this.#db.prepare(deleteEventLinkSql()).run(input.fromEventId, input.toEventId, input.type);
    this.#db.prepare(eventLinkSql()).run(...eventLinkValues(input));
  }

  deleteMemoryEventsForEntry(sourceEntryId: string): void {
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

  saveExtractedEntry(input: RawEntryInput, events: readonly MemoryEventInput[]): void {
    this.transaction(() => {
      this.addRawEntry(input);
      this.deleteMemoryEventsForEntry(input.id);
      for (const event of events) {
        this.addMemoryEvent(event);
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
    this.#db.prepare(entitySql()).run(input.id, input.type, input.name);
    this.#db.prepare(eventEntitySql()).run(eventId, input.id);
  }

  private deleteMemoryEvent(eventId: string): void {
    this.#db.prepare("DELETE FROM memory_events WHERE id = ?").run(eventId);
    this.#db.prepare("DELETE FROM event_entities WHERE event_id = ?").run(eventId);
    this.#db.prepare("DELETE FROM event_attributes WHERE event_id = ?").run(eventId);
    this.#db
      .prepare("DELETE FROM event_links WHERE fromEventId = ? OR toEventId = ?")
      .run(eventId, eventId);
    this.#db.prepare("DELETE FROM memory_event_fts WHERE event_id = ?").run(eventId);
  }

  private insertMemoryEvent(input: MemoryEventInput): void {
    this.#db.prepare(memoryEventSql()).run(...memoryEventValues(input));
    for (const entity of input.entities ?? []) {
      this.addEntity(input.id, entity);
    }
    for (const attribute of input.attributes ?? []) {
      this.addAttribute(input.id, attribute);
    }
    this.#db.prepare(ftsSql()).run(...ftsValues(input));
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
  db.exec(schemaSql());
  db.exec(deduplicateLinksSql());
  db.exec("PRAGMA user_version = 1");
}

function eventRows(db: DatabaseSync): EventRow[] {
  return db
    .prepare("SELECT * FROM memory_events ORDER BY occurredAt ASC")
    .all() as unknown as EventRow[];
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
    "CREATE TABLE IF NOT EXISTS event_entities (event_id TEXT NOT NULL, entity_id TEXT NOT NULL)",
    "CREATE TABLE IF NOT EXISTS event_attributes (event_id TEXT NOT NULL, type TEXT NOT NULL, value TEXT NOT NULL)",
    eventLinksTableSql(),
    ftsTableSql(),
  ].join(";\n");
}

function memoryEventsTableSql(): string {
  return [
    "CREATE TABLE IF NOT EXISTS memory_events (id TEXT PRIMARY KEY, sourceEntryId TEXT NOT NULL",
    "occurredAt TEXT NOT NULL, summary TEXT NOT NULL, eventType TEXT NOT NULL",
    "topics TEXT NOT NULL, emotions TEXT NOT NULL, confidence REAL NOT NULL)",
  ].join(", ");
}

function eventLinksTableSql(): string {
  return [
    "CREATE TABLE IF NOT EXISTS event_links (fromEventId TEXT NOT NULL, toEventId TEXT NOT NULL",
    "type TEXT NOT NULL, reason TEXT NOT NULL, confidence REAL NOT NULL)",
  ].join(", ");
}

function ftsTableSql(): string {
  return [
    "CREATE VIRTUAL TABLE IF NOT EXISTS memory_event_fts USING fts5(",
    "event_id UNINDEXED, summary, topics, emotions, attributes, entities)",
  ].join("");
}

function rawEntrySql(): string {
  return "INSERT OR REPLACE INTO raw_entries (id, text, recordedAt) VALUES (?, ?, ?)";
}

function memoryEventSql(): string {
  return [
    "INSERT INTO memory_events",
    "(id, sourceEntryId, occurredAt, summary, eventType, topics, emotions, confidence)",
    "VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
  ].join(" ");
}

function entitySql(): string {
  return "INSERT OR IGNORE INTO entities (id, type, name) VALUES (?, ?, ?)";
}

function eventEntitySql(): string {
  return "INSERT INTO event_entities (event_id, entity_id) VALUES (?, ?)";
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

function deduplicateLinksSql(): string {
  return [
    "DELETE FROM event_links WHERE rowid NOT IN (",
    "SELECT MIN(rowid) FROM event_links GROUP BY fromEventId, toEventId, type)",
  ].join(" ");
}
