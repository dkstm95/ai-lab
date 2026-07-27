export interface WikiRebuildDocumentClaim {
  readonly text: string;
  readonly sourceId: string;
}

export interface WikiRebuildDocumentSection {
  readonly heading: string;
  readonly blocks: readonly WikiRebuildDocumentBlock[];
}

export type WikiRebuildDocumentBlock =
  | { readonly type: "paragraph"; readonly text: string }
  | { readonly type: "callout"; readonly text: string }
  | { readonly type: "bullets"; readonly items: readonly string[] }
  | { readonly type: "steps"; readonly items: readonly string[] }
  | { readonly type: "subheading"; readonly text: string }
  | {
      readonly type: "table";
      readonly columns: readonly string[];
      readonly rows: readonly (readonly string[])[];
    }
  | { readonly type: "acceptedClaims"; readonly claims: readonly WikiRebuildDocumentClaim[] }
  | { readonly type: "hypotheses"; readonly items: readonly string[] }
  | { readonly type: "links"; readonly slugs: readonly string[] };

export interface WikiRebuildDocumentResultPage {
  readonly path: string;
  readonly format: "document";
  readonly sections: readonly WikiRebuildDocumentSection[];
}

const textSchema = {
  type: "string",
  minLength: 1,
  maxLength: 100_000,
  pattern: "^[^\\r\\n]+$",
} as const;

const stringListSchema = {
  type: "array",
  minItems: 1,
  maxItems: 100,
  items: textSchema,
} as const;

const claimSchema = {
  type: "object",
  additionalProperties: false,
  properties: {
    text: textSchema,
    sourceId: { type: "string", minLength: 1, maxLength: 500 },
  },
  required: ["text", "sourceId"],
} as const;

export const wikiRebuildDocumentPageJsonSchema = {
  type: "object",
  additionalProperties: false,
  properties: {
    path: { type: "string", minLength: 1, maxLength: 1_000 },
    format: { const: "document" },
    sections: {
      type: "array",
      minItems: 1,
      maxItems: 50,
      items: {
        type: "object",
        additionalProperties: false,
        properties: {
          heading: { ...textSchema, maxLength: 500 },
          blocks: {
            type: "array",
            minItems: 1,
            maxItems: 100,
            items: {
              oneOf: [
                textBlockSchema("paragraph"),
                textBlockSchema("callout"),
                listBlockSchema("bullets"),
                listBlockSchema("steps"),
                textBlockSchema("subheading"),
                tableBlockSchema(),
                claimBlockSchema(),
                listBlockSchema("hypotheses"),
                linkBlockSchema(),
              ],
            },
          },
        },
        required: ["heading", "blocks"],
      },
    },
  },
  required: ["path", "format", "sections"],
} as const;

function textBlockSchema(type: "paragraph" | "callout" | "subheading") {
  return {
    type: "object",
    additionalProperties: false,
    properties: { type: { const: type }, text: textSchema },
    required: ["type", "text"],
  } as const;
}

function listBlockSchema(type: "bullets" | "steps" | "hypotheses") {
  return {
    type: "object",
    additionalProperties: false,
    properties: { type: { const: type }, items: stringListSchema },
    required: ["type", "items"],
  } as const;
}

function tableBlockSchema() {
  return {
    type: "object",
    additionalProperties: false,
    properties: {
      type: { const: "table" },
      columns: stringListSchema,
      rows: {
        type: "array",
        minItems: 1,
        maxItems: 100,
        items: stringListSchema,
      },
    },
    required: ["type", "columns", "rows"],
  } as const;
}

function claimBlockSchema() {
  return {
    type: "object",
    additionalProperties: false,
    properties: {
      type: { const: "acceptedClaims" },
      claims: { type: "array", minItems: 1, maxItems: 100, items: claimSchema },
    },
    required: ["type", "claims"],
  } as const;
}

function linkBlockSchema() {
  return {
    type: "object",
    additionalProperties: false,
    properties: {
      type: { const: "links" },
      slugs: {
        type: "array",
        minItems: 1,
        maxItems: 100,
        items: { type: "string", minLength: 1, maxLength: 500 },
      },
    },
    required: ["type", "slugs"],
  } as const;
}

export function assertWikiRebuildDocumentPage(
  value: unknown,
): asserts value is WikiRebuildDocumentResultPage {
  const page = record(value, ["path", "format", "sections"], "Wiki rebuild document page");
  if (!plainText(page.path, 1_000) || page.format !== "document" || !Array.isArray(page.sections)) {
    throw new Error("Wiki rebuild document page is invalid");
  }
  if (page.sections.length === 0 || page.sections.length > 50) {
    throw new Error("Wiki rebuild document sections are invalid");
  }
  for (const section of page.sections) assertSection(section);
  assertUniqueDocumentValues(page as unknown as WikiRebuildDocumentResultPage);
}

function assertSection(value: unknown): void {
  const section = record(value, ["heading", "blocks"], "Wiki rebuild document section");
  if (!plainText(section.heading, 500) || !Array.isArray(section.blocks)) {
    throw new Error("Wiki rebuild document section is invalid");
  }
  if (section.blocks.length === 0 || section.blocks.length > 100) {
    throw new Error("Wiki rebuild document blocks are invalid");
  }
  for (const block of section.blocks) assertBlock(block);
}

function assertBlock(value: unknown): void {
  const block = untypedRecord(value, "Wiki rebuild document block");
  if (["paragraph", "callout", "subheading"].includes(String(block.type))) {
    assertTextBlock(block);
  } else if (["bullets", "steps", "hypotheses"].includes(String(block.type))) {
    assertListBlock(block);
  } else {
    assertStructuredBlock(block);
  }
}

function assertStructuredBlock(block: Record<string, unknown>): void {
  switch (block.type) {
    case "table":
      assertTableBlock(block);
      return;
    case "acceptedClaims":
      assertClaimBlock(block);
      return;
    case "links":
      assertLinkBlock(block);
      return;
    default:
      throw new Error("Wiki rebuild document block type is invalid");
  }
}

function assertTextBlock(block: Record<string, unknown>): void {
  exactKeys(block, ["type", "text"], "Wiki rebuild document text block");
  if (!plainText(block.text, 100_000)) throw new Error("Wiki rebuild document text is invalid");
}

function assertListBlock(block: Record<string, unknown>): void {
  exactKeys(block, ["type", "items"], "Wiki rebuild document list block");
  assertTextList(block.items, "Wiki rebuild document list");
}

function assertTableBlock(block: Record<string, unknown>): void {
  exactKeys(block, ["type", "columns", "rows"], "Wiki rebuild document table block");
  assertTextList(block.columns, "Wiki rebuild document table columns");
  if (!Array.isArray(block.rows) || block.rows.length === 0 || block.rows.length > 100) {
    throw new Error("Wiki rebuild document table rows are invalid");
  }
  const width = block.columns.length;
  for (const row of block.rows) {
    assertTextList(row, "Wiki rebuild document table row");
    if (row.length !== width) throw new Error("Wiki rebuild document table width is invalid");
  }
}

function assertClaimBlock(block: Record<string, unknown>): void {
  exactKeys(block, ["type", "claims"], "Wiki rebuild document claim block");
  if (!Array.isArray(block.claims) || block.claims.length === 0 || block.claims.length > 100) {
    throw new Error("Wiki rebuild document claims are invalid");
  }
  for (const value of block.claims) {
    const claim = record(value, ["text", "sourceId"], "Wiki rebuild document claim");
    if (!plainText(claim.text, 10_000) || !plainText(claim.sourceId, 500)) {
      throw new Error("Wiki rebuild document claim is invalid");
    }
  }
}

function assertLinkBlock(block: Record<string, unknown>): void {
  exactKeys(block, ["type", "slugs"], "Wiki rebuild document link block");
  assertTextList(block.slugs, "Wiki rebuild document links");
}

function assertTextList(value: unknown, label: string): asserts value is string[] {
  if (
    !Array.isArray(value) ||
    value.length === 0 ||
    value.length > 100 ||
    value.some((item) => !plainText(item, 100_000))
  ) {
    throw new Error(`${label} is invalid`);
  }
}

function assertUniqueDocumentValues(page: WikiRebuildDocumentResultPage): void {
  if (documentClaims(page).length === 0) {
    throw new Error("Wiki rebuild document requires at least one accepted claim");
  }
  assertUnique(
    page.sections.map((section) => normalize(section.heading)),
    "section headings",
  );
  assertUnique(documentClaimIdentities(page), "accepted claims");
  assertUnique(documentHypotheses(page).map(normalize), "hypotheses");
  assertUnique(documentLinks(page), "links");
}

function assertUnique(values: readonly string[], label: string): void {
  if (new Set(values).size !== values.length) {
    throw new Error(`Wiki rebuild document contains duplicate ${label}`);
  }
}

export function documentClaims(page: WikiRebuildDocumentResultPage): WikiRebuildDocumentClaim[] {
  return page.sections.flatMap((section) =>
    section.blocks.flatMap((block) => (block.type === "acceptedClaims" ? block.claims : [])),
  );
}

function documentClaimIdentities(page: WikiRebuildDocumentResultPage): string[] {
  return documentClaims(page).map((claim) => `${claim.sourceId}\n${normalize(claim.text)}`);
}

export function documentHypotheses(page: WikiRebuildDocumentResultPage): string[] {
  return page.sections.flatMap((section) =>
    section.blocks.flatMap((block) => (block.type === "hypotheses" ? block.items : [])),
  );
}

export function documentLinks(page: WikiRebuildDocumentResultPage): string[] {
  return page.sections.flatMap((section) =>
    section.blocks.flatMap((block) => (block.type === "links" ? block.slugs : [])),
  );
}

export function renderWikiRebuildDocument(
  page: WikiRebuildDocumentResultPage,
  sourcePath: (sourceId: string) => string,
): string {
  return page.sections
    .map((section) => {
      const blocks = section.blocks.map((block) => renderBlock(block, sourcePath)).join("\n\n");
      return `## ${escapeMarkdown(section.heading)}\n\n${blocks}`;
    })
    .join("\n\n");
}

function renderBlock(
  block: WikiRebuildDocumentBlock,
  sourcePath: (sourceId: string) => string,
): string {
  switch (block.type) {
    case "paragraph":
      return escapeMarkdown(block.text);
    case "callout":
      return `> ${escapeMarkdown(block.text)}`;
    case "bullets":
      return block.items.map((item) => `- ${escapeMarkdown(item)}`).join("\n");
    case "steps":
      return block.items.map((item, index) => `${index + 1}. ${escapeMarkdown(item)}`).join("\n");
    case "subheading":
      return `### ${escapeMarkdown(block.text)}`;
    default:
      return renderStructuredBlock(block, sourcePath);
  }
}

function renderStructuredBlock(
  block: Extract<
    WikiRebuildDocumentBlock,
    { type: "table" | "acceptedClaims" | "hypotheses" | "links" }
  >,
  sourcePath: (sourceId: string) => string,
): string {
  switch (block.type) {
    case "table":
      return renderTable(block);
    case "acceptedClaims":
      return block.claims
        .map((claim) => `- accepted: ${claim.text}\n  source: ${sourcePath(claim.sourceId)}`)
        .join("\n");
    case "hypotheses":
      return block.items.map((item) => `- hypothesis: ${item}`).join("\n");
    case "links":
      return block.slugs.map((slug) => `- [[${slug}]]`).join("\n");
  }
}

function renderTable(block: Extract<WikiRebuildDocumentBlock, { type: "table" }>): string {
  const columns = tableRow(block.columns);
  const divider = tableRow(block.columns.map(() => "---"));
  return [columns, divider, ...block.rows.map(tableRow)].join("\n");
}

function tableRow(values: readonly string[]): string {
  return `| ${values.map((value) => escapeMarkdown(value)).join(" | ")} |`;
}

function escapeMarkdown(value: string): string {
  return value.replaceAll("\\", "\\\\").replace(/([`*_[\]<>#|>])/g, "\\$1");
}

function record(value: unknown, keys: readonly string[], label: string): Record<string, unknown> {
  const candidate = untypedRecord(value, label);
  exactKeys(candidate, keys, label);
  return candidate;
}

function untypedRecord(value: unknown, label: string): Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new Error(`${label} must be an object`);
  }
  return value as Record<string, unknown>;
}

function exactKeys(value: object, keys: readonly string[], label: string): void {
  if (JSON.stringify(Object.keys(value).sort()) !== JSON.stringify([...keys].sort())) {
    throw new Error(`${label} contains unknown or missing fields`);
  }
}

function plainText(value: unknown, maximum: number): value is string {
  return (
    typeof value === "string" &&
    value.trim().length > 0 &&
    value.length <= maximum &&
    !/[\r\n]/.test(value) &&
    !value.includes("[[") &&
    safeText(value)
  );
}

function safeText(value: string): boolean {
  return ![...value].some((character) => {
    const code = character.charCodeAt(0);
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
  });
}

function normalize(value: string): string {
  return value.toLowerCase().replace(/\s+/g, " ").trim();
}
