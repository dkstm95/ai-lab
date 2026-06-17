import { mkdtemp, readFile, rm, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createWorkspace } from "@ai-lab/workspace";
import { afterEach, describe, expect, it } from "vitest";
import {
  addWikiSource,
  applyWikiUpdate,
  fileWikiAnswer,
  initWiki,
  lintWiki,
  parseWikiPage,
  prepareWikiEvolve,
  prepareWikiIngest,
  prepareWikiQuery,
  readWikiPage,
  recordWikiRun,
  renderWikiPage,
} from "../src/index.js";

const roots: string[] = [];

afterEach(async () => {
  await Promise.all(roots.map((root) => rm(root, { recursive: true, force: true })));
  roots.length = 0;
});

async function tempWorkspace() {
  const root = await mkdtemp(join(tmpdir(), "ai-lab-wiki-"));
  roots.push(root);
  return createWorkspace(root);
}

describe("wiki", () => {
  it("initializes the wiki layout", async () => {
    const workspace = await tempWorkspace();

    await initWiki(workspace);

    await expect(stat(join(workspace.root, "wiki", "schema.md"))).resolves.toBeDefined();
    await expect(stat(join(workspace.root, "wiki", "raw", "sources"))).resolves.toBeDefined();
    await expect(stat(join(workspace.root, "wiki", "pages", "playbooks"))).resolves.toBeDefined();
    await expect(stat(join(workspace.root, "wiki", "pages", "questions"))).resolves.toBeDefined();
    await expect(readFile(join(workspace.root, "wiki", "schema.md"), "utf8")).resolves.toContain(
      "The LLM agent maintains this wiki",
    );
  });

  it("registers sources with deterministic ids and log entries", async () => {
    const workspace = await tempWorkspace();
    const sourcePath = join(workspace.root, "source.md");
    await writeFile(sourcePath, "# Source\n", "utf8");

    const source = await addWikiSource(workspace, { path: sourcePath, title: "LLM Wiki" });

    expect(source.id).toMatch(/^llm-wiki-[a-f0-9]{8}$/);
    await expect(readFile(source.path, "utf8")).resolves.toBe("# Source\n");
    await expect(readFile(join(workspace.root, "wiki", "log.md"), "utf8")).resolves.toContain(
      `source | LLM Wiki | ${source.id}`,
    );
  });

  it("prepares ingest task packets from registered sources", async () => {
    const workspace = await tempWorkspace();
    const sourcePath = join(workspace.root, "source.md");
    await writeFile(sourcePath, "# Source\n", "utf8");
    const source = await addWikiSource(workspace, { path: sourcePath, title: "LLM Wiki" });

    const packet = await prepareWikiIngest(workspace, source.id);

    expect(packet.task).toBe("ingest");
    expect(packet.contextFiles).toContain(`raw/sources/${source.id}.md`);
    expect(packet.prompt).toContain("Read schema.md first");
    expect(packet.expectedFiles).toContain(`pages/sources/${source.id}.md`);
    expect(packet.expectedFiles).toContain("pages/entities/*.md");
    expect(packet.constraints).toContain("Preserve raw sources as immutable evidence.");
  });

  it("parses and renders wiki page metadata", () => {
    const rendered = renderWikiPage(metadata(), "## Summary\n\nA page.");

    const page = parseWikiPage(rendered);

    expect(page.metadata).toEqual(metadata());
    expect(rendered).toContain("kind: concept");
  });

  it("reports lint findings for invalid wiki content", async () => {
    const workspace = await tempWorkspace();
    await initWiki(workspace);
    await writeRawSource(workspace.root);
    await writeFile(join(workspace.root, "wiki", "index.md"), "# Wiki Index\n", "utf8");
    await writeFile(pagePath(workspace.root), renderWikiPage(metadata(), badBody()), "utf8");

    const report = await lintWiki(workspace);

    expect(report.issues.map((issue) => issue.code)).toEqual([
      "broken-wiki-link",
      "accepted-claim-missing-source",
      "orphan-page",
      "page-missing-from-index",
    ]);
  });

  it("reports stale todos, conflicted pages, and unsupported sources", async () => {
    const workspace = await tempWorkspace();
    await initWiki(workspace);
    await writeFile(
      pagePath(workspace.root),
      renderWikiPage(conflictedMetadata(), "TODO\n"),
      "utf8",
    );
    await writeFile(join(workspace.root, "wiki", "index.md"), indexWithPage(), "utf8");

    const report = await lintWiki(workspace);
    const codes = report.issues.map((issue) => issue.code);

    expect(codes).toContain("stale-todo");
    expect(codes).toContain("conflicted-page");
    expect(codes).toContain("unsupported-source");
  });

  it("reports invalid frontmatter with the failing file path", async () => {
    const workspace = await tempWorkspace();
    await initWiki(workspace);
    await writeFile(pagePath(workspace.root), "# Missing frontmatter\n", "utf8");

    const report = await lintWiki(workspace);

    expect(report.issues[0]).toMatchObject({
      code: "invalid-frontmatter",
      path: pagePath(workspace.root),
    });
  });

  it("passes lint for indexed source-backed pages", async () => {
    const workspace = await tempWorkspace();
    await initWiki(workspace);
    await writeRawSource(workspace.root);
    await writeFile(pagePath(workspace.root), renderWikiPage(metadata(), goodBody()), "utf8");
    await writeFile(join(workspace.root, "wiki", "index.md"), indexWithPage(), "utf8");

    const report = await lintWiki(workspace);
    const page = await readWikiPage(workspace, "llm-wiki");

    expect(report.issues).toEqual([]);
    expect(page.metadata.title).toBe("LLM Wiki");
  });

  it("prepares query task packets from matching pages", async () => {
    const workspace = await tempWorkspace();
    await initWiki(workspace);
    await writeRawSource(workspace.root);
    await writeFile(pagePath(workspace.root), renderWikiPage(metadata(), goodBody()), "utf8");
    await writeFile(join(workspace.root, "wiki", "index.md"), indexWithPage(), "utf8");

    const packet = await prepareWikiQuery(workspace, "How does LLM Wiki work?");

    expect(packet.task).toBe("query");
    expect(packet.contextFiles).toContain("pages/concepts/llm-wiki.md");
    expect(packet.prompt).toContain("How does LLM Wiki work?");
    expect(packet.prompt).toContain("File reusable answers");
  });

  it("prepares evolve task packets for manual or automated improvement", async () => {
    const workspace = await tempWorkspace();
    await initWiki(workspace);
    await writeFile(pagePath(workspace.root), renderWikiPage(metadata(), badBody()), "utf8");
    await recordWikiRun(
      workspace,
      {
        task: "evolve",
        input: "manual trigger",
        output: "candidate update",
      },
      now(),
    );

    const packet = await prepareWikiEvolve(workspace);

    expect(packet.task).toBe("evolve");
    expect(packet.contextFiles).toContain("schema.md");
    expect(packet.contextFiles).toContain("pages/concepts/llm-wiki.md");
    expect(packet.contextFiles.some((path) => path.startsWith("raw/runs/"))).toBe(true);
    expect(packet.expectedFiles).toContain("pages/**/*.md");
    expect(packet.constraints).toContain(
      "Do not modify raw/sources or raw/runs from an evolve update.",
    );
    expect(packet.diagnostics?.issues.map((issue) => issue.code)).toContain("broken-wiki-link");
  });

  it("files reusable query answers as wiki question pages", async () => {
    const workspace = await tempWorkspace();
    await initWiki(workspace);
    await writeRawSource(workspace.root);

    const result = await fileWikiAnswer(workspace, answerInput(), now());

    expect(result.lint.issues).toEqual([]);
    await expect(readFile(questionPath(workspace.root), "utf8")).resolves.toContain(
      "## Question\n\nHow does LLM Wiki work?",
    );
    await expect(readFile(join(workspace.root, "wiki", "index.md"), "utf8")).resolves.toContain(
      "[How does LLM Wiki work?](pages/questions/how-does-llm-wiki-work.md)",
    );
  });

  it("rejects reusable answers without sources", async () => {
    const workspace = await tempWorkspace();

    await expect(fileWikiAnswer(workspace, { ...answerInput(), sources: [] })).rejects.toThrow(
      "requires at least one source",
    );
  });

  it("applies validated wiki updates", async () => {
    const workspace = await tempWorkspace();
    await initWiki(workspace);
    await writeRawSource(workspace.root);

    const result = await applyWikiUpdate(workspace, wikiUpdate());

    expect(result.lint.issues).toEqual([]);
    await expect(readFile(pagePath(workspace.root), "utf8")).resolves.toContain("Has a source");
  });

  it("rejects unsafe or unsupported wiki updates", async () => {
    const workspace = await tempWorkspace();

    await expect(applyWikiUpdate(workspace, { files: [] })).rejects.toThrow("requires");
    await expect(
      applyWikiUpdate(workspace, { files: [updateFile("../bad.md", "")] }),
    ).rejects.toThrow("escapes wiki root");
    await expect(
      applyWikiUpdate(workspace, { files: [updateFile("pages/concepts/a.md", "")] }),
    ).rejects.toThrow("must include index.md and log.md");
    await expect(
      applyWikiUpdate(workspace, { files: [updateFile("raw/sources/source.md", "changed")] }),
    ).rejects.toThrow("Unsupported wiki update path");
    await expect(
      applyWikiUpdate(workspace, {
        files: [
          updateFile("index.md", "# Wiki Index\n"),
          updateFile("log.md", "# Wiki Log\n"),
          updateFile("pages/../raw/sources/source.md", "changed"),
        ],
      }),
    ).rejects.toThrow("Unsupported wiki update path");
  });

  it("reports source references that do not exist", async () => {
    const workspace = await tempWorkspace();
    await initWiki(workspace);
    await writeFile(pagePath(workspace.root), renderWikiPage(metadata(), goodBody()), "utf8");
    await writeFile(join(workspace.root, "wiki", "index.md"), indexWithPage(), "utf8");

    const report = await lintWiki(workspace);

    expect(report.issues.map((issue) => issue.code)).toContain("missing-source");
  });

  it("records raw agent runs", async () => {
    const workspace = await tempWorkspace();

    const run = await recordWikiRun(workspace, {
      task: "answer",
      input: "question",
      output: "answer",
    });

    await expect(readFile(run.path, "utf8")).resolves.toContain('"task": "answer"');
    await expect(readFile(join(workspace.root, "wiki", "log.md"), "utf8")).resolves.toContain(
      `run | answer | ${run.id}`,
    );
  });

  it("reports missing required paths before creating a wiki", async () => {
    const workspace = await tempWorkspace();

    const report = await lintWiki(workspace);

    expect(report.issues[0]?.code).toBe("missing-required-path");
  });

  it("reports duplicate slugs and missing indexed files", async () => {
    const workspace = await tempWorkspace();
    await initWiki(workspace);
    await writeFile(pagePath(workspace.root), renderWikiPage(metadata(), goodBody()), "utf8");
    await writeFile(sourcePagePath(workspace.root), renderWikiPage(metadata(), goodBody()), "utf8");
    await writeFile(
      join(workspace.root, "wiki", "index.md"),
      `${indexWithPage()}\n- [Ghost](pages/concepts/ghost.md)\n`,
    );

    const report = await lintWiki(workspace);

    expect(report.issues.map((issue) => issue.code)).toContain("duplicate-slug");
    expect(report.issues.map((issue) => issue.code)).toContain("missing-required-path");
  });

  it("rejects missing and invalid page metadata", async () => {
    await expect(() => parseWikiPage("---\ntitle: Broken\n---\n")).toThrow(
      "Missing frontmatter field: slug",
    );
    await expect(() =>
      parseWikiPage(renderWikiPage({ ...metadata(), kind: "bad" as never }, "")),
    ).toThrow("Invalid wiki page kind");
    await expect(() =>
      parseWikiPage(renderWikiPage({ ...metadata(), status: "bad" as never }, "")),
    ).toThrow("Invalid wiki page status");
  });

  it("rejects unknown page slugs", async () => {
    const workspace = await tempWorkspace();
    await initWiki(workspace);

    await expect(readWikiPage(workspace, "missing")).rejects.toThrow("Wiki page not found");
  });

  it("does not initialize the wiki from read operations", async () => {
    const workspace = await tempWorkspace();

    await expect(readWikiPage(workspace, "missing")).rejects.toThrow();
    await expect(stat(join(workspace.root, "wiki"))).rejects.toThrow();
  });
});

function metadata() {
  return {
    title: "LLM Wiki",
    slug: "llm-wiki",
    kind: "concept" as const,
    status: "active" as const,
    createdAt: "2026-06-17T12:00:00.000Z",
    updatedAt: "2026-06-17T12:00:00.000Z",
    sources: ["raw/sources/karpathy-llm-wiki.md"],
  };
}

function conflictedMetadata() {
  return {
    ...metadata(),
    status: "conflicted" as const,
    sources: ["https://example.com/source"],
  };
}

function answerInput() {
  return {
    question: "How does LLM Wiki work?",
    answer: "The agent maintains raw sources, compiled pages, an index, and a log.",
    sources: ["raw/sources/karpathy-llm-wiki.md"],
  };
}

function now(): Date {
  return new Date("2026-06-17T12:00:00.000Z");
}

function badBody(): string {
  return "## Summary\n\n[[ ]]\n\n## Key Claims\n\n- accepted: Missing a source line.\n";
}

function goodBody(): string {
  return "## Summary\n\n[[llm-wiki]]\n\n## Key Claims\n\n- accepted: Has a source.\n  source: raw/sources/karpathy-llm-wiki.md\n";
}

function indexWithPage(): string {
  return "# Wiki Index\n\n- [LLM Wiki](pages/concepts/llm-wiki.md)\n";
}

function wikiUpdate() {
  return {
    files: [
      updateFile("index.md", indexWithPage()),
      updateFile("log.md", "# Wiki Log\n"),
      updateFile("pages/concepts/llm-wiki.md", renderWikiPage(metadata(), goodBody())),
    ],
  };
}

function updateFile(path: string, content: string) {
  return { path, content };
}

async function writeRawSource(root: string): Promise<void> {
  await writeFile(join(root, "wiki", "raw", "sources", "karpathy-llm-wiki.md"), "# Source\n");
}

function pagePath(root: string): string {
  return join(root, "wiki", "pages", "concepts", "llm-wiki.md");
}

function questionPath(root: string): string {
  return join(root, "wiki", "pages", "questions", "how-does-llm-wiki-work.md");
}

function sourcePagePath(root: string): string {
  return join(root, "wiki", "pages", "sources", "llm-wiki.md");
}
