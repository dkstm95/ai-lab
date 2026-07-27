import {
  chmod,
  mkdir,
  mkdtemp,
  readFile,
  readdir,
  rm,
  stat,
  symlink,
  writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createWorkspace } from "@ai-lab/workspace";
import { afterEach, describe, expect, it } from "vitest";
import { buildWikiAnswerTask } from "../src/answer-exchange.js";
import {
  type WikiAnswerTask,
  type WikiProposal,
  type WikiRebuildResult,
  type WikiRebuildTask,
  type WikiReflectionResult,
  addWikiSource,
  applyWikiProposal,
  applyWikiRebuild,
  applyWikiReflection,
  evaluateCurrentWikiKnowledge,
  initWiki,
  lintWiki,
  parseWikiAnswerResult,
  parseWikiAnswerResultForTask,
  parseWikiAnswerTask,
  parseWikiKnowledgeContext,
  parseWikiMemoryComparisonJudgmentInput,
  parseWikiMemoryContext,
  parseWikiMemoryEvaluationInput,
  parseWikiMemoryEvaluationRecord,
  parseWikiPage,
  parseWikiRebuildReport,
  parseWikiRebuildResult,
  parseWikiRebuildResultForTask,
  parseWikiRebuildTask,
  parseWikiReflectionReport,
  parseWikiReflectionResult,
  parseWikiReflectionResultForTask,
  parseWikiReflectionTask,
  parseWikiReflectionTaskInput,
  prepareWikiAnswerProposal,
  prepareWikiAnswerProposalFromTask,
  prepareWikiAnswerTask,
  prepareWikiEvolve,
  prepareWikiIngest,
  prepareWikiKnowledgeContext,
  prepareWikiMemoryContext,
  prepareWikiMemoryControlTask,
  prepareWikiQuery,
  prepareWikiRebuildReport,
  prepareWikiRebuildTask,
  prepareWikiReflectionReport,
  prepareWikiReflectionTask,
  readWikiPage,
  recordWikiMemoryComparison,
  recordWikiMemoryEvaluation,
  recordWikiRun,
  renderWikiPage,
  summarizeWikiMemoryEvaluations,
  validateCurrentWikiAnswerTask,
  validateCurrentWikiKnowledgeContext,
  validateCurrentWikiMemoryContext,
  validateCurrentWikiRebuildTask,
  validateCurrentWikiReflectionTask,
} from "../src/index.js";
import {
  evaluateWikiKnowledgePages,
  parseWikiKnowledgeEvaluationCaseSet,
  wikiKnowledgeEvaluationCaseSetSchemaVersion,
} from "../src/knowledge-evaluation.js";
import {
  buildWikiKnowledgeContext,
  selectWikiKnowledge,
  wikiKnowledgeReference,
} from "../src/knowledge.js";
import {
  buildWikiMemoryContext,
  buildWikiMemoryEvaluationRecord,
  selectWikiMemories,
  summarizeWikiMemoryEvaluationRecords,
  wikiMemoryReference,
} from "../src/memory.js";
import { buildWikiRebuildReport, buildWikiRebuildTask } from "../src/rebuild-exchange.js";
import { buildWikiReflectionTask } from "../src/reflection-exchange.js";
import { buildWikiReflectionReport } from "../src/reflection-result.js";
import { promoteWikiFiles } from "../src/transaction.js";

const roots: string[] = [];
const supportsPosixModes = process.platform !== "win32";
const supportsPermissionFailure = process.platform !== "win32" && process.getuid?.() !== 0;

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
    await expect(stat(join(workspace.root, "wiki", "evals"))).resolves.toBeDefined();
    await expect(stat(join(workspace.root, "wiki", "raw", "sources"))).resolves.toBeDefined();
    await expect(stat(join(workspace.root, "wiki", "pages", "playbooks"))).resolves.toBeDefined();
    await expect(stat(join(workspace.root, "wiki", "pages", "questions"))).resolves.toBeDefined();
    const schema = await readFile(join(workspace.root, "wiki", "schema.md"), "utf8");
    expect(schema).toContain(
      "The LLM agent prepares source-backed knowledge and evidence-bound reflections",
    );
    expect(schema).toContain("Return a typed failure, playbook, decision, or skip result");
    expect(schema).toContain("Avoid stale metaphors");
    expect(schema).toContain("Prefer short, familiar words");
    expect(schema).toContain("Remove every word that does not add meaning");
    expect(schema).toContain("Prefer active voice");
    expect(schema).toContain("Replace foreign phrases");
    expect(schema).toContain("Treat these as judgment rules");
    expect(schema).toContain("Keep one main idea per sentence");
  });

  it("does not initialize through a symbolic wiki root", async () => {
    const workspace = await tempWorkspace();
    const outside = await tempWorkspace();
    await symlink(outside.root, join(workspace.root, "wiki"));

    await expect(initWiki(workspace)).rejects.toThrow("Wiki root");
    await expect(stat(join(outside.root, "schema.md"))).rejects.toThrow();
  });

  it("serializes wiki writers with a workspace lock", async () => {
    const workspace = await tempWorkspace();
    const lock = join(workspace.root, ".ai-lab-wiki.lock");
    await writeFile(lock, "held\n", "utf8");

    await expect(initWiki(workspace)).rejects.toThrow("holds the lock");
    await expect(stat(join(workspace.root, "wiki"))).rejects.toThrow();
    await rm(lock);
    await initWiki(workspace);
    await writeRawSource(workspace.root);
    await writeFile(lock, "held\n", "utf8");
    await expect(prepareWikiAnswerProposal(workspace, answerInput())).rejects.toThrow(
      "holds the lock",
    );
  });

  it("registers sources with deterministic ids and log entries", async () => {
    const workspace = await tempWorkspace();
    const sourcePath = join(workspace.root, "source.md");
    await writeFile(sourcePath, "# Source\n", "utf8");

    const source = await addWikiSource(workspace, { path: "source.md", title: "LLM Wiki" });

    expect(source.id).toMatch(/^llm-wiki-[a-f0-9]{32}$/);
    await expect(readFile(source.path, "utf8")).resolves.toBe("# Source\n");
    await expect(readFile(join(workspace.root, "wiki", "log.md"), "utf8")).resolves.toContain(
      `source | LLM Wiki | ${source.id}`,
    );
  });

  it("rejects a duplicate source id across file extensions", async () => {
    const workspace = await tempWorkspace();
    await writeFile(join(workspace.root, "source.md"), "# Same source\n", "utf8");
    await writeFile(join(workspace.root, "source.txt"), "# Same source\n", "utf8");
    await addWikiSource(workspace, { path: "source.md", title: "Same" });

    await expect(addWikiSource(workspace, { path: "source.txt", title: "Same" })).rejects.toThrow(
      "already registered",
    );
  });

  it("registers sources only from regular files inside the workspace", async () => {
    const workspace = await tempWorkspace();
    const outside = await tempWorkspace();
    const outsidePath = join(outside.root, "outside.md");
    const localPath = join(workspace.root, "local-source");
    const linkPath = join(workspace.root, "linked.md");
    await writeFile(outsidePath, "# Outside\n", "utf8");
    await writeFile(localPath, "# Local\n", "utf8");
    await symlink(localPath, linkPath);

    await expect(addWikiSource(workspace, { path: outsidePath, title: "Outside" })).rejects.toThrow(
      "inside the workspace",
    );
    await expect(addWikiSource(workspace, { path: linkPath, title: "Linked" })).rejects.toThrow(
      "regular file",
    );
    const local = await addWikiSource(workspace, { path: localPath, title: "Local" });
    expect(local.path).toMatch(/\.md$/);
  });

  it.runIf(supportsPosixModes)("does not broaden imported source permissions", async () => {
    const workspace = await tempWorkspace();
    const sourcePath = join(workspace.root, "private.md");
    await writeFile(sourcePath, "# Private\n", "utf8");
    await chmod(sourcePath, 0o600);

    const source = await addWikiSource(workspace, { path: sourcePath, title: "Private" });

    expect((await stat(source.path)).mode & 0o777).toBe(0o600);
  });

  it("does not follow managed log, run, or source directory symlinks", async () => {
    const logWorkspace = await tempWorkspace();
    const runWorkspace = await tempWorkspace();
    const sourceWorkspace = await tempWorkspace();
    await Promise.all([initWiki(logWorkspace), initWiki(runWorkspace), initWiki(sourceWorkspace)]);
    await assertLogSymlinkRejected(logWorkspace.root);
    await assertRunDirectorySymlinkRejected(runWorkspace.root);
    await assertSourceDirectorySymlinkRejected(sourceWorkspace.root);
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
    expect(packet.prompt).toContain("Preserve source coverage before compression");
    expect(packet.prompt).toContain("reusable knowledge beyond a one-off summary");
    expect(packet.expectedFiles).toContain(`pages/sources/${source.id}.md`);
    expect(packet.expectedFiles).toContain("pages/entities/*.md");
    expect(packet.constraints).toContain("Preserve raw sources as immutable evidence.");
    expect(packet.constraints).toContain(
      "Avoid stale metaphors, similes, idioms, and stock phrases.",
    );
    expect(packet.constraints).toContain(
      "Prefer short, familiar words when they express the same meaning.",
    );
    expect(packet.constraints).toContain("Remove every word that does not add meaning.");
    expect(packet.constraints).toContain(
      "Prefer active voice when it makes the actor and action clearer.",
    );
    expect(packet.constraints).toContain(
      "Replace foreign phrases, scientific terms, and jargon with everyday language when possible; explain terms needed for precision.",
    );
    expect(packet.constraints).toContain(
      "Treat these as judgment rules, not rigid formulas; break one when following it would make the writing inaccurate, unclear, or unnatural.",
    );
    expect(packet.constraints).toContain(
      "Keep one main idea per sentence and split sentences that are hard to understand in one pass.",
    );
  });

  it("rejects ingest packets for unknown sources", async () => {
    const workspace = await tempWorkspace();
    await initWiki(workspace);

    await expect(prepareWikiIngest(workspace, "missing")).rejects.toThrow("Wiki source not found");
  });

  it("rejects symbolic source files when preparing ingest context", async () => {
    const workspace = await tempWorkspace();
    await initWiki(workspace);
    const outside = join(workspace.root, "outside-ingest.md");
    await writeFile(outside, "# Outside\n", "utf8");
    await symlink(outside, join(workspace.root, "wiki", "raw", "sources", "linked.md"));

    await expect(prepareWikiIngest(workspace, "linked")).rejects.toThrow(
      "Unsupported source reference",
    );
  });

  it("parses and renders wiki page metadata", () => {
    const rendered = renderWikiPage(metadata(), "## Summary\n\nA page.");

    const page = parseWikiPage(rendered);

    expect(page.metadata).toEqual(metadata());
    expect(rendered).toContain("kind: concept");
    expect(() =>
      parseWikiPage(
        renderWikiPage(
          { ...metadata(), retrievalTerms: ["same term", "same term"] },
          "## Summary\n\nA page.",
        ),
      ),
    ).toThrow("retrievalTerms");
  });

  it("reports active reflection pages without reviewed retrieval terms", async () => {
    const workspace = await tempWorkspace();
    await initWiki(workspace);
    await writeFile(
      join(workspace.root, "wiki", "pages", "failures", "missing-terms.md"),
      renderWikiPage(
        {
          title: "Missing Terms",
          slug: "missing-terms",
          kind: "failure",
          status: "active",
          createdAt: "2026-06-17T12:00:00.000Z",
          updatedAt: "2026-06-17T12:00:00.000Z",
          sources: [],
        },
        "## Summary\n\nA reusable correction.\n\n## Links\n\n",
      ),
    );

    const report = await lintWiki(workspace);

    expect(report.issues.map(({ code }) => code)).toContain("missing-retrieval-terms");
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

  it("reports pages that need human review or stale review", async () => {
    const workspace = await tempWorkspace();
    await initWiki(workspace);
    await writeRawSource(workspace.root);
    await writeFile(pagePath(workspace.root), renderWikiPage(reviewMetadata(), goodBody()), "utf8");
    await writeFile(
      sourcePagePath(workspace.root),
      renderWikiPage(staleMetadata(), sourceBackedBody("Different sourced claim.")),
      "utf8",
    );
    await writeFile(
      join(workspace.root, "wiki", "index.md"),
      `${indexWithPage()}- [LLM Wiki Source](pages/sources/llm-wiki.md)\n`,
      "utf8",
    );

    const report = await lintWiki(workspace, now());
    const codes = report.issues.map((issue) => issue.code);

    expect(codes).toContain("review-page");
    expect(codes).toContain("stale-review");
  });

  it("reports invalid reviewAfter metadata", async () => {
    const workspace = await tempWorkspace();
    await initWiki(workspace);
    await writeRawSource(workspace.root);
    await writeFile(
      pagePath(workspace.root),
      renderWikiPage(invalidReviewAfterMetadata(), goodBody()),
      "utf8",
    );
    await writeFile(join(workspace.root, "wiki", "index.md"), indexWithPage(), "utf8");

    const report = await lintWiki(workspace, now());

    expect(report.issues.map((issue) => issue.code)).toContain("invalid-review-after");
    expect(report.issues.map((issue) => issue.code)).not.toContain("stale-review");
  });

  it("reports duplicate accepted claim and source pairs", async () => {
    const workspace = await tempWorkspace();
    await initWiki(workspace);
    await writeRawSource(workspace.root);
    await writeFile(pagePath(workspace.root), renderWikiPage(metadata(), goodBody()), "utf8");
    await writeFile(
      sourcePagePath(workspace.root),
      renderWikiPage(sourceMetadata(), goodBody()),
      "utf8",
    );
    await writeFile(
      join(workspace.root, "wiki", "index.md"),
      `${indexWithPage()}- [LLM Wiki Source](pages/sources/llm-wiki.md)\n`,
      "utf8",
    );

    const report = await lintWiki(workspace);

    expect(report.issues.map((issue) => issue.code)).toContain("duplicate-accepted-claim");
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
    expect(packet.contextFiles).toContain("raw/sources/karpathy-llm-wiki.md");
    expect(packet.prompt).toContain("How does LLM Wiki work?");
    expect(packet.prompt).toContain("Prepare reusable answers as reviewable proposals");
  });

  it("retrieves ranked active knowledge with Korean query normalization", async () => {
    const workspace = await tempWorkspace();
    await initWiki(workspace);
    await writeRawSource(workspace.root);
    const path = await writeKnowledgePage(
      workspace.root,
      "synthesis",
      "AI Data Learning Advantage",
      "active",
      "## 결론\n\n데이터는 검증된 학습 구조의 재료다.\n",
    );
    await writeKnowledgePage(
      workspace.root,
      "concept",
      "AI Operations",
      "active",
      "## Summary\n\nGeneral AI operations.\n",
    );
    await writeKnowledgePage(
      workspace.root,
      "source",
      "Old Data Note",
      "active",
      "## Summary\n\n데이터 기록.\n",
      "2026-06-16T12:00:00.000Z",
    );

    const context = await prepareWikiKnowledgeContext(
      workspace,
      "AI 시대에 해자가 되는 것은 데이터일까?",
      now(),
    );

    expect(context.knowledge[0]).toMatchObject({
      path,
      kind: "synthesis",
      matchedTerms: expect.arrayContaining(["ai", "데이터"]),
    });
    expect(context.knowledge.map(({ path: selected }) => selected)).not.toContain(
      "pages/sources/old-data-note.md",
    );
    expect(parseWikiKnowledgeContext(context)).toEqual(context);
    await expect(validateCurrentWikiKnowledgeContext(workspace, context, now())).resolves.toEqual(
      context,
    );
    await writeFile(
      join(workspace.root, "wiki", path),
      `${context.knowledge[0]?.content}\nChanged.`,
    );
    await expect(validateCurrentWikiKnowledgeContext(workspace, context, now())).rejects.toThrow(
      "stale",
    );
  });

  it("scores knowledge fields deterministically and rejects invalid contexts", () => {
    const candidate = {
      path: "pages/concepts/beta.md",
      title: "Alpha",
      slug: "beta",
      kind: "concept",
      status: "active",
      sources: ["raw/sources/source.md"],
      content: "## Summary\n\nGamma.\n\n## Detail\n\nDelta.\n",
    };
    const knowledge = selectWikiKnowledge(
      [
        candidate,
        { ...candidate, path: "pages/concepts/stale.md", reviewAfter: "bad" },
        { ...candidate, path: "pages/concepts/draft.md", status: "draft" },
      ],
      "alpha beta gamma delta",
      now(),
    );
    const context = buildWikiKnowledgeContext({
      query: "alpha beta gamma delta",
      preparedAt: now().toISOString(),
      knowledge,
    });
    const first = knowledge[0];
    if (first === undefined) throw new Error("Expected a knowledge match");

    expect(knowledge).toMatchObject([
      { score: 19, matchedTerms: ["alpha", "beta", "delta", "gamma"] },
    ]);
    expect(wikiKnowledgeReference(first)).not.toHaveProperty("content");
    expect(selectWikiKnowledge([candidate], "what is the", now())).toEqual([]);
    expect(
      selectWikiKnowledge(
        [{ ...candidate, title: "AI", slug: "ai", content: "## Summary\n\nGeneral." }],
        "AI 해자",
        now(),
      ),
    ).toEqual([]);
    expect(
      selectWikiKnowledge(
        [{ ...candidate, title: "LLM Wiki", slug: "llm-wiki" }],
        "LLM Wiki",
        now(),
      ),
    ).toHaveLength(1);
    expect(() => selectWikiKnowledge([candidate], "query", now(), 6)).toThrow("limit");
    expect(() => selectWikiKnowledge([candidate], "\n", now())).toThrow("one-line");
    expect(() => parseWikiKnowledgeContext({ ...context, extra: true })).toThrow("unknown");
    expect(() =>
      parseWikiKnowledgeContext({
        ...context,
        knowledge: [{ ...first, sha256: "0".repeat(64) }],
      }),
    ).toThrow("hash");
  });

  it("evaluates required pages, allowed noise, sources, and abstention", () => {
    const page = knowledgeCandidate("pages/concepts/durable-knowledge.md");
    const cases = knowledgeEvaluationCases();
    const report = evaluateWikiKnowledgePages([page], cases, now());

    expect(report).toMatchObject({
      passed: true,
      caseCount: 2,
      passedCaseCount: 2,
      metrics: {
        casePassRate: 1,
        requiredPageRecall: 1,
        allowedPagePrecision: 1,
        requiredSourceRecall: 1,
        abstentionAccuracy: 1,
      },
    });

    const noisy = evaluateWikiKnowledgePages(
      [
        page,
        {
          ...page,
          path: "pages/concepts/durable-knowledge-noise.md",
          title: "Durable Knowledge Noise",
        },
      ],
      cases,
      now(),
    );
    expect(noisy).toMatchObject({
      passed: false,
      passedCaseCount: 1,
      metrics: { allowedPagePrecision: 0.5 },
    });
    expect(noisy.cases[0]?.unexpectedPages).toEqual(["pages/concepts/durable-knowledge-noise.md"]);
  });

  it("rejects malformed or unbalanced knowledge evaluation cases", () => {
    const cases = knowledgeEvaluationCases();
    expect(parseWikiKnowledgeEvaluationCaseSet(cases)).toEqual(cases);
    expect(() => parseWikiKnowledgeEvaluationCaseSet({ ...cases, extra: true })).toThrow("unknown");
    expect(() =>
      parseWikiKnowledgeEvaluationCaseSet({
        ...cases,
        cases: [
          cases.cases[0],
          {
            ...cases.cases[0],
            id: "another-durable-knowledge",
            query: "another durable knowledge",
          },
        ],
      }),
    ).toThrow("positive cases, and abstentions");
    expect(() =>
      parseWikiKnowledgeEvaluationCaseSet({
        ...cases,
        cases: [
          {
            ...cases.cases[0],
            allowedPages: [],
          },
          cases.cases[1],
        ],
      }),
    ).toThrow("invalid");
  });

  it("evaluates the current Wiki from its reviewed fixture", async () => {
    const workspace = await tempWorkspace();
    await initWiki(workspace);
    await writeRawSource(workspace.root);
    const path = await writeKnowledgePage(
      workspace.root,
      "concept",
      "Durable Knowledge",
      "active",
      "## Summary\n\nDurable knowledge compounds across work.\n",
    );
    const cases = knowledgeEvaluationCases(path);
    await writeFile(
      join(workspace.root, "wiki", "evals", "knowledge-retrieval.json"),
      `${JSON.stringify(cases)}\n`,
    );

    await expect(evaluateCurrentWikiKnowledge(workspace, now())).resolves.toMatchObject({
      passed: true,
      caseCount: 2,
    });
    await rm(rawSourcePath(workspace.root));
    await expect(evaluateCurrentWikiKnowledge(workspace, now())).rejects.toThrow();
    await writeFile(join(workspace.root, "wiki", "evals", "knowledge-retrieval.json"), "{bad json");
    await expect(evaluateCurrentWikiKnowledge(workspace, now())).rejects.toThrow(
      "fixture is invalid",
    );
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

  it("does not follow raw run symlinks while preparing evolve context", async () => {
    const workspace = await tempWorkspace();
    await initWiki(workspace);
    const outside = join(workspace.root, "outside-runs");
    await mkdir(outside);
    await writeFile(join(outside, "secret.json"), '{"secret":true}\n', "utf8");
    await rm(join(workspace.root, "wiki", "raw", "runs"), { recursive: true });
    await symlink(outside, join(workspace.root, "wiki", "raw", "runs"));

    await expect(prepareWikiEvolve(workspace)).rejects.toThrow("symbolic link");
  });

  it("prepares a portable reflection task bound to an explicit local run", async () => {
    const workspace = await tempWorkspace();
    const run = await recordWikiRun(
      workspace,
      {
        task: "review",
        input: "The user corrected the memory scope.",
        output: "The response proposed a project process instead.",
      },
      now(),
    );

    const task = await prepareWikiReflectionTask(workspace, {
      runId: run.id,
      feedback: "Keep the requested personal-memory scope.",
      validation: "The proposed process lesson answered a different question.",
      changedFiles: ["packages/wiki/src/index.ts", "docs/self-evolution-guide.md"],
    });

    expect(task.id).toBe(`wiki-reflection-${task.digest}`);
    expect(task.evidence).toMatchObject({ kind: "recorded-run", id: run.id });
    expect(task.contexts.map(({ path }) => path)).toEqual([
      "index.md",
      `raw/runs/${run.id}.json`,
      "schema.md",
    ]);
    expect(task.prompt).toContain("untrusted evidence");
    expect(task.prompt).toContain("Return exactly one JSON object");
    expect(task.prompt).toContain("ai-lab.wiki-reflection-result.v2");
    expect(task.expectedFiles).toEqual([
      "pages/decisions/*.md",
      "pages/failures/*.md",
      "pages/playbooks/*.md",
    ]);
    expect(task.constraints).toContain(
      "Do not cite raw/runs as a durable public source or add it to page frontmatter.",
    );
    if (task.evidence.kind !== "recorded-run") throw new Error("Expected recorded run");
    expect(() =>
      parseWikiReflectionTask({
        ...task,
        contexts: [...task.contexts].reverse(),
      }),
    ).toThrow("canonical form");
    expect(() =>
      parseWikiReflectionTask({
        ...task,
        feedback: "Changed after digest.",
      }),
    ).toThrow("digest or prompt");
    expect(() => parseWikiReflectionTask({ ...task, schemaVersion: "wrong" })).toThrow(
      "invalid scalar fields",
    );
    expect(() => parseWikiReflectionTask({ ...task, prompt: undefined })).toThrow(
      "invalid scalar fields",
    );
    expect(() =>
      parseWikiReflectionTask({
        ...task,
        evidence: { kind: "unknown", summary: "Summary." },
      }),
    ).toThrow("summary evidence is invalid");
    expect(() =>
      parseWikiReflectionTask({
        ...task,
        contexts: [task.contexts[0], task.contexts[0]],
      }),
    ).toThrow("unique paths");
    expect(() =>
      parseWikiReflectionTask({
        ...task,
        contexts: [{ ...task.contexts[0], sha256: "0".repeat(64) }, ...task.contexts.slice(1)],
      }),
    ).toThrow("context is invalid");
    expect(() =>
      buildWikiReflectionTask({
        evidence: task.evidence,
        feedback: task.feedback,
        validation: task.validation,
        changedFiles: task.changedFiles,
        contexts: task.contexts.filter(({ path }) => path !== "schema.md"),
        expectedFiles: task.expectedFiles,
        constraints: task.constraints,
      }),
    ).toThrow("must bind schema.md and index.md");
    expect(() =>
      buildWikiReflectionTask({
        evidence: { ...task.evidence, sha256: "0".repeat(64) },
        feedback: task.feedback,
        validation: task.validation,
        changedFiles: task.changedFiles,
        contexts: task.contexts,
        expectedFiles: task.expectedFiles,
        constraints: task.constraints,
      }),
    ).toThrow("does not bind its recorded run");
    await expect(validateCurrentWikiReflectionTask(workspace, task)).resolves.toEqual(task);
  });

  it("supports a supplied reflection summary without fabricating a raw run", async () => {
    const workspace = await tempWorkspace();
    await initWiki(workspace);

    const task = await prepareWikiReflectionTask(workspace, {
      runSummary: "A concise local summary with no retained transcript.",
      feedback: "Preserve the requested scope.",
      validation: "The correction is repeatable.",
      changedFiles: [],
    });

    expect(task.evidence).toEqual({
      kind: "provided-summary",
      summary: "A concise local summary with no retained transcript.",
    });
    expect(task.contexts.map(({ path }) => path)).toEqual(["index.md", "schema.md"]);
  });

  it("rejects ambiguous, missing, unsafe, and stale reflection evidence", async () => {
    const workspace = await tempWorkspace();
    await initWiki(workspace);
    const input = {
      feedback: "Correction.",
      validation: "Validation.",
      changedFiles: [],
    };

    await expect(prepareWikiReflectionTask(workspace, input)).rejects.toThrow(
      "exactly one of runId or runSummary",
    );
    await expect(
      prepareWikiReflectionTask(workspace, { ...input, runId: "run", runSummary: "Summary." }),
    ).rejects.toThrow("exactly one of runId or runSummary");
    expect(() => parseWikiReflectionTaskInput(null)).toThrow("must be an object");
    expect(() =>
      parseWikiReflectionTaskInput({
        ...input,
        runSummary: "Summary.",
        unexpected: true,
      }),
    ).toThrow("unknown or missing fields");
    await expect(
      prepareWikiReflectionTask(workspace, { ...input, runId: "../outside" }),
    ).rejects.toThrow("run id is invalid");
    await expect(
      prepareWikiReflectionTask(workspace, { ...input, runId: "missing" }),
    ).rejects.toThrow();
    await expect(
      prepareWikiReflectionTask(workspace, {
        ...input,
        runSummary: "Summary.",
        changedFiles: ["../outside"],
      }),
    ).rejects.toThrow("changed file path is invalid");

    const run = await recordWikiRun(
      workspace,
      { task: "review", input: "input", output: "output" },
      now(),
    );
    const task = await prepareWikiReflectionTask(workspace, { ...input, runId: run.id });
    await writeFile(run.path, '{"changed":true}\n', "utf8");
    await expect(validateCurrentWikiReflectionTask(workspace, task)).rejects.toThrow(
      "contexts changed",
    );
  });

  it("prepares, reviews, and applies an exact reflection report", async () => {
    const workspace = await tempWorkspace();
    await initWiki(workspace);
    const task = await prepareWikiReflectionTask(workspace, reflectionInput());
    const result = reflectionResult(task);
    const before = await reflectionWikiState(workspace.root);

    const report = await prepareWikiReflectionReport(workspace, task, result, now());

    expect(report.id).toBe(`wiki-reflection-report-${report.digest}`);
    expect(report.outcome).toBe("propose");
    expect(report.candidateDiagnostics.issues).toEqual([]);
    expect(report.files.map(({ path }) => path)).toEqual([
      "index.md",
      "pages/failures/scope-mismatch.md",
    ]);
    expect(report.files[1]?.content).toContain("## Prevention Check");
    expect(report.files[1]?.content).toContain("- hypothesis: The mismatch may recur.");
    expect(report.files[1]?.content).toContain("Restate \\*exact\\* requested scope.");
    expect(report.files[1]?.content).toContain("sources:\n");
    expect(await reflectionWikiState(workspace.root)).toEqual(before);
    expect(parseWikiReflectionReport(report)).toEqual(report);
    await expect(
      applyWikiReflection(
        workspace,
        reflectionApplication(task, result, report, {
          ...reflectionApproval(report),
          digest: "0".repeat(64),
        }),
      ),
    ).rejects.toThrow("does not match");

    const applied = await applyWikiReflection(
      workspace,
      reflectionApplication(task, result, report),
      new Date("2026-06-17T13:00:00.000Z"),
    );

    expect(applied.files.some((path) => path.endsWith("/pages/failures/scope-mismatch.md"))).toBe(
      true,
    );
    expect(applied.files.some((path) => path.endsWith("/index.md"))).toBe(true);
    expect(applied.files.some((path) => path.endsWith("/log.md"))).toBe(true);
    await expect(
      readFile(join(workspace.root, "wiki", "pages", "failures", "scope-mismatch.md"), "utf8"),
    ).resolves.toContain("## Correction");
    await expect(readFile(join(workspace.root, "wiki", "index.md"), "utf8")).resolves.toContain(
      "[Scope Mismatch](pages/failures/scope-mismatch.md)",
    );
    await expect(readFile(join(workspace.root, "wiki", "log.md"), "utf8")).resolves.toContain(
      `reflection | ${report.id} | digest=${report.digest}`,
    );
    await expect(
      applyWikiReflection(workspace, reflectionApplication(task, result, report)),
    ).rejects.toThrow("already applied");
  });

  it.each([
    [
      "playbook",
      {
        kind: "playbook",
        title: "Review Scope",
        slug: "review-scope",
        summary: "Check the requested scope before reviewing.",
        retrievalTerms: ["memory scope review", "기억 범위 검토"],
        whenToUse: "Use this when a request can refer to more than one memory layer.",
        steps: ["Restate the requested scope.", "Classify each candidate."],
        checks: ["Each candidate answers the stated scope."],
        hypotheses: [],
        links: [],
      },
      "## When to Use",
    ],
    [
      "decision",
      {
        kind: "decision",
        title: "Keep Raw Runs Local",
        slug: "keep-raw-runs-local",
        summary: "Keep raw runs local and promote concise memory only.",
        retrievalTerms: ["local raw runs", "원본 실행 기록"],
        decision: "Raw runs remain local-only evidence.",
        reasoning: ["Raw runs can contain private or noisy details."],
        consequences: ["Shared pages must remain useful without the transcript."],
        hypotheses: [],
        links: [],
      },
      "## Consequences",
    ],
  ] as const)(
    "renders a typed %s reflection without model-authored Markdown",
    async (_, page, section) => {
      const workspace = await tempWorkspace();
      await initWiki(workspace);
      const task = await prepareWikiReflectionTask(workspace, reflectionInput());
      const result = {
        schemaVersion: "ai-lab.wiki-reflection-result.v2",
        taskId: task.id,
        taskDigest: task.digest,
        outcome: "propose",
        rationale: "This lesson is reusable.",
        page,
      };

      const report = await prepareWikiReflectionReport(workspace, task, result, now());

      expect(report.files[1]?.content).toContain(section);
      expect(report.candidateDiagnostics.issues).toEqual([]);
    },
  );

  it("records a skip reflection without making it applicable", async () => {
    const workspace = await tempWorkspace();
    await initWiki(workspace);
    const task = await prepareWikiReflectionTask(workspace, reflectionInput());
    const result = {
      schemaVersion: "ai-lab.wiki-reflection-result.v2",
      taskId: task.id,
      taskDigest: task.digest,
      outcome: "skip",
      rationale: "The event is too specific to save.",
    } as const;

    const report = await prepareWikiReflectionReport(workspace, task, result, now());

    expect(report.files).toEqual([]);
    expect(report.outcome).toBe("skip");
    await expect(
      applyWikiReflection(workspace, reflectionApplication(task, result, report)),
    ).rejects.toThrow("cannot be applied");
  });

  it("rejects malformed, unbound, unsafe, and stale reflection results", async () => {
    const workspace = await tempWorkspace();
    await initWiki(workspace);
    const task = await prepareWikiReflectionTask(workspace, reflectionInput());
    const result = reflectionResult(task);

    expect(() => parseWikiReflectionResult({ ...result, unexpected: true })).toThrow(
      "unknown or missing fields",
    );
    expect(() =>
      parseWikiReflectionResult({
        ...result,
        page: { ...result.page, failure: "## Injected heading" },
      }),
    ).toThrow("failure page is invalid");
    expect(() =>
      parseWikiReflectionResultForTask(task, { ...result, taskDigest: "0".repeat(64) }),
    ).toThrow("does not match");
    await expect(
      prepareWikiReflectionReport(
        workspace,
        task,
        { ...result, page: { ...result.page, slug: "different-title" } },
        now(),
      ),
    ).rejects.toThrow("slug must match");
    const brokenResult = {
      ...result,
      page: { ...result.page, links: ["missing-page"] },
    };
    const broken = await prepareWikiReflectionReport(workspace, task, brokenResult, now());
    expect(broken.candidateDiagnostics.issues.map(({ code }) => code)).toContain(
      "broken-wiki-link",
    );
    await expect(
      applyWikiReflection(workspace, reflectionApplication(task, brokenResult, broken)),
    ).rejects.toThrow("lint issue");
    const current = await prepareWikiReflectionReport(workspace, task, result, now());
    await writeFile(join(workspace.root, "wiki", "index.md"), "# Changed\n", "utf8");
    await expect(
      applyWikiReflection(workspace, reflectionApplication(task, result, current)),
    ).rejects.toThrow("contexts changed");
  });

  it("strictly rejects malformed reflection result and report artifacts", async () => {
    const workspace = await tempWorkspace();
    await initWiki(workspace);
    const task = await prepareWikiReflectionTask(workspace, reflectionInput());
    const result = reflectionResult(task);
    const report = await prepareWikiReflectionReport(workspace, task, result, now());
    const { id: _id, digest: _digest, ...reportInput } = report;

    expect(() => parseWikiReflectionResult(null)).toThrow("must be an object");
    expect(() =>
      parseWikiReflectionResult({
        schemaVersion: result.schemaVersion,
        taskId: result.taskId,
        taskDigest: result.taskDigest,
        outcome: "other",
        rationale: result.rationale,
      }),
    ).toThrow("outcome is invalid");
    expect(() => parseWikiReflectionResult({ ...result, page: null })).toThrow(
      "page must be an object",
    );
    expect(() =>
      parseWikiReflectionResult({
        ...result,
        page: { ...result.page, links: ["same", "same"] },
      }),
    ).toThrow("shared fields");
    expect(() =>
      parseWikiReflectionResult({
        ...result,
        page: {
          kind: "playbook",
          title: "Review Scope",
          slug: "review-scope",
          summary: "Review the requested scope.",
          retrievalTerms: ["requested scope"],
          whenToUse: "Use this before memory review.",
          steps: [],
          checks: ["The scope matches."],
          hypotheses: [],
          links: [],
        },
      }),
    ).toThrow("playbook page is invalid");
    expect(() =>
      parseWikiReflectionResult({
        ...result,
        page: {
          kind: "decision",
          title: "Keep Runs Local",
          slug: "keep-runs-local",
          summary: "Keep runs local.",
          retrievalTerms: ["local raw runs"],
          decision: "Raw runs remain local.",
          reasoning: [],
          consequences: ["Shared memory stays concise."],
          hypotheses: [],
          links: [],
        },
      }),
    ).toThrow("decision page is invalid");
    expect(() =>
      parseWikiReflectionReport({ ...report, files: [...report.files].reverse() }),
    ).toThrow("canonical form");
    expect(() => parseWikiReflectionReport({ ...report, digest: "0".repeat(64) })).toThrow(
      "digest does not match",
    );
    expect(() => parseWikiReflectionReport({ ...report, generatedAt: "invalid" })).toThrow(
      "invalid scalar fields",
    );
    expect(() =>
      buildWikiReflectionReport({
        ...reportInput,
        files: [...report.files, { path: "extra.md", content: "" }],
      }),
    ).toThrow("files are invalid");
    expect(() =>
      buildWikiReflectionReport({
        ...reportInput,
        baseHashes: { ...report.baseHashes, "bad.md": "bad" },
      }),
    ).toThrow("base hash is invalid");
    expect(() =>
      buildWikiReflectionReport({
        ...reportInput,
        introducedIssues: Array.from({ length: 1_001 }, () => ({
          code: "issue",
          path: "index.md",
          message: "Issue.",
        })),
      }),
    ).toThrow("issues are invalid");
    expect(() =>
      buildWikiReflectionReport({
        ...reportInput,
        introducedIssues: [{ code: "", path: "index.md", message: "Issue." }],
      }),
    ).toThrow("issue is invalid");
    expect(() =>
      buildWikiReflectionReport({ ...reportInput, outcome: "skip", files: report.files }),
    ).toThrow("outcome does not match");
  });

  it("prepares deterministic provider-neutral answer tasks", async () => {
    const workspace = await tempWorkspace();
    await initWiki(workspace);
    await writeRawSource(workspace.root);
    const before = await wikiState(workspace.root);

    const task = await prepareWikiAnswerTask(workspace, answerTaskInput());
    const repeated = await prepareWikiAnswerTask(workspace, answerTaskInput());

    expect(task).toEqual(repeated);
    expect(task.id).toBe(`wiki-answer-${task.digest}`);
    expect(task.evidence).toEqual([
      { id: "karpathy-llm-wiki", path: "raw/sources/karpathy-llm-wiki.md" },
    ]);
    expect(task.contexts.map((context) => context.path)).toContain(
      "raw/sources/karpathy-llm-wiki.md",
    );
    expect(task.contexts.every((context) => !context.path.includes(workspace.root))).toBe(true);
    expect(task.prompt).toContain("Return exactly one JSON object");
    expect(task.prompt).toContain('"sourceId":"karpathy-llm-wiki"');
    await expect(validateCurrentWikiAnswerTask(workspace, task)).resolves.toEqual(task);
    await expect(wikiState(workspace.root)).resolves.toEqual(before);
  });

  it("binds retrieved knowledge and its raw sources without explicit source ids", async () => {
    const workspace = await tempWorkspace();
    await initWiki(workspace);
    await writeRawSource(workspace.root);
    const path = await writeKnowledgePage(
      workspace.root,
      "concept",
      "Durable Knowledge",
      "active",
      "## Summary\n\nDurable knowledge compounds across questions.\n",
    );

    const task = await prepareWikiAnswerTask(workspace, {
      question: "How does durable knowledge compound?",
    });

    expect(task.requestedSourceIds).toEqual([]);
    expect(task.knowledge).toMatchObject([{ path, kind: "concept" }]);
    expect(task.evidence).toEqual([
      { id: "karpathy-llm-wiki", path: "raw/sources/karpathy-llm-wiki.md" },
    ]);
    expect(task.contexts.map(({ path: contextPath }) => contextPath)).toEqual(
      expect.arrayContaining([path, "raw/sources/karpathy-llm-wiki.md"]),
    );
    expect(task.prompt).toContain("compiled Wiki page does not itself prove truth");
    expect(parseWikiAnswerTask(task)).toEqual(task);
    expect(parseWikiAnswerResultForTask(task, answerTaskResult(task))).toEqual(
      answerTaskResult(task),
    );

    const selectedContext = task.contexts.find(({ path: contextPath }) => contextPath === path);
    if (selectedContext === undefined) throw new Error("Expected selected knowledge context");
    const selectedKnowledge = task.knowledge[0];
    if (selectedKnowledge === undefined) throw new Error("Expected selected knowledge");
    expect(() =>
      parseWikiAnswerTask({
        ...task,
        knowledge: [
          {
            ...selectedKnowledge,
            sources: ["raw/sources/missing.md"],
          },
        ],
      }),
    ).toThrow("missing from evidence");
    await writeFile(
      join(workspace.root, "wiki", path),
      `${selectedContext.content}\nChanged.\n`,
      "utf8",
    );
    await expect(validateCurrentWikiAnswerTask(workspace, task)).rejects.toThrow("stale");
  });

  it("rejects answer tasks with neither explicit nor retrieved source evidence", async () => {
    const workspace = await tempWorkspace();
    await initWiki(workspace);

    await expect(
      prepareWikiAnswerTask(workspace, { question: "Unrelated unanswered question" }),
    ).rejects.toThrow("citable source evidence");
  });

  it("retrieves at most three current active memories by relevance with stable tie breaks", async () => {
    const workspace = await tempWorkspace();
    await initWiki(workspace);
    await Promise.all([
      writeMemoryPage(workspace.root, "playbook", "Memory Scope Review", "active"),
      writeMemoryPage(workspace.root, "failure", "Memory Scope Review", "active"),
      writeMemoryPage(workspace.root, "decision", "Memory Scope Review", "active"),
      writeMemoryPage(workspace.root, "playbook", "Memory Scope Review Stale", "active", {
        reviewAfter: "2026-06-16T12:00:00.000Z",
      }),
      writeMemoryPage(workspace.root, "failure", "Memory Scope Review Old", "superseded"),
      writeMemoryPage(workspace.root, "playbook", "Release Checklist", "active"),
    ]);

    const context = await prepareWikiMemoryContext(workspace, "memory scope review", now());

    expect(context.memories.map(({ kind }) => kind)).toEqual(["playbook", "failure", "decision"]);
    expect(context.memories).toHaveLength(3);
    expect(context.memories.every(({ matchedTerms }) => matchedTerms.length === 2)).toBe(true);
    expect(parseWikiMemoryContext(context)).toEqual(context);
    await expect(validateCurrentWikiMemoryContext(workspace, context, now())).resolves.toEqual(
      context,
    );
    expect(() => parseWikiMemoryContext({ ...context, extra: true })).toThrow("unknown");

    await writeFile(
      join(workspace.root, "wiki", context.memories[0]?.path ?? ""),
      `${context.memories[0]?.content}\nChanged.\n`,
      "utf8",
    );
    await expect(validateCurrentWikiMemoryContext(workspace, context, now())).rejects.toThrow(
      "stale",
    );
  });

  it("scores title, slug, summary, and body terms while rejecting ineligible retrieval input", () => {
    const candidate = {
      path: "pages/playbooks/retrieval-slug.md",
      title: "Retrieval Title",
      slug: "retrieval-slug",
      kind: "playbook",
      status: "active",
      content:
        "---\ntitle: Retrieval Title\n---\n\n## Summary\n\nSummary guidance.\n\n## Steps\n\nBody guidance.\n",
    };
    const memories = selectWikiMemories(
      [
        candidate,
        { ...candidate, path: "pages/failures/stale.md", kind: "failure", reviewAfter: "bad" },
        { ...candidate, path: "pages/decisions/draft.md", kind: "decision", status: "draft" },
        {
          ...candidate,
          path: "pages/playbooks/unrelated.md",
          title: "Other",
          slug: "other",
          content: "## Summary\n\nDifferent terms.",
        },
      ],
      "title slug summary body",
      now(),
    );

    expect(memories).toMatchObject([
      { score: 19, matchedTerms: ["body", "slug", "summary", "title"] },
    ]);
    expect(
      selectWikiMemories(
        [{ ...candidate, retrievalTerms: ["personal context", "기억 범위"] }],
        "대화의 기억 범위를 확인해",
        now(),
      ),
    ).toMatchObject([{ score: 10, matchedTerms: ["범위"] }]);
    expect(
      selectWikiMemories(
        [{ ...candidate, retrievalTerms: ["기억 범위"] }],
        "일반적인 기억 검색",
        now(),
      ),
    ).toEqual([]);
    expect(selectWikiMemories([candidate], "what is the", now())).toEqual([]);
    expect(() => selectWikiMemories([candidate], "query", now(), 4)).toThrow("limit");
    expect(() => selectWikiMemories([candidate], "\n", now())).toThrow("one-line");
  });

  it("strictly validates memory contexts, evaluations, and every selected page", () => {
    const memories = selectWikiMemories(
      [
        {
          path: "pages/playbooks/scope-review.md",
          title: "Scope Review",
          slug: "scope-review",
          kind: "playbook",
          status: "active",
          content: "## Summary\n\nReview scope.",
        },
        {
          path: "pages/failures/scope-failure.md",
          title: "Scope Failure",
          slug: "scope-failure",
          kind: "failure",
          status: "active",
          content: "## Summary\n\nScope correction.",
        },
      ],
      "scope review",
      now(),
    );
    const context = buildWikiMemoryContext({
      query: "scope review",
      preparedAt: now().toISOString(),
      memories,
    });
    const references = memories.map(wikiMemoryReference);
    const first = references[0];
    if (first === undefined) throw new Error("Expected a memory reference");
    const helpful = buildWikiMemoryEvaluationRecord({
      taskId: "wiki-answer-task",
      taskDigest: "a".repeat(64),
      query: "scope review",
      memories: references,
      evaluation: {
        taskOutcome: "improved",
        assessments: references.map(({ path }) => ({ path, verdict: "helpful" })),
      },
      recordedAt: now().toISOString(),
    });
    const harmful = buildWikiMemoryEvaluationRecord({
      taskId: "wiki-answer-task-2",
      taskDigest: "b".repeat(64),
      query: "scope review",
      memories: references,
      evaluation: {
        taskOutcome: "worse",
        assessments: references.map(({ path }) => ({ path, verdict: "harmful" })),
      },
      recordedAt: new Date("2026-06-17T13:00:00.000Z").toISOString(),
    });

    expect(summarizeWikiMemoryEvaluationRecords([helpful, harmful])).toMatchObject({
      evaluations: 2,
      helpfulRate: 0.5,
      harmfulRate: 0.5,
      counts: { improved: 1, worse: 1, helpful: 2, harmful: 2 },
    });
    expect(() => parseWikiMemoryContext(null)).toThrow("object");
    expect(() => parseWikiMemoryContext({ ...context, digest: "0".repeat(64) })).toThrow("digest");
    expect(() => parseWikiMemoryContext({ ...context, preparedAt: "invalid" })).toThrow("scalar");
    expect(() =>
      parseWikiMemoryContext({ ...context, memories: [context.memories[0], context.memories[0]] }),
    ).toThrow("unique");
    expect(() =>
      parseWikiMemoryContext({
        ...context,
        memories: [{ ...context.memories[0], content: "tampered" }],
      }),
    ).toThrow("hash");
    expect(() =>
      parseWikiMemoryEvaluationInput({ taskOutcome: "unknown", assessments: [] }),
    ).toThrow("invalid");
    expect(() =>
      parseWikiMemoryEvaluationInput({
        taskOutcome: "unchanged",
        assessments: [{ path: first.path, verdict: "unused" }],
      }),
    ).not.toThrow();
    expect(() =>
      buildWikiMemoryEvaluationRecord({
        taskId: "wiki-answer-task",
        taskDigest: "a".repeat(64),
        query: "scope review",
        memories: references,
        evaluation: {
          taskOutcome: "unchanged",
          assessments: [{ path: first.path, verdict: "unused" }],
        },
        recordedAt: now().toISOString(),
      }),
    ).toThrow("every selected memory");
    expect(() => parseWikiMemoryEvaluationRecord({ ...helpful, digest: "0".repeat(64) })).toThrow(
      "digest",
    );
  });

  it("automatically binds relevant reviewed memory to an answer task", async () => {
    const workspace = await tempWorkspace();
    await initWiki(workspace);
    await writeRawSource(workspace.root);
    await writeMemoryPage(workspace.root, "playbook", "LLM Wiki Review", "active");

    const task = await prepareWikiAnswerTask(
      workspace,
      answerTaskInput("How should LLM Wiki review work?"),
    );

    expect(task.memories.map(({ path }) => path)).toEqual(["pages/playbooks/llm-wiki-review.md"]);
    expect(task.contexts.map(({ path }) => path)).toContain(task.memories[0]?.path);
    expect(task.prompt).toContain("reviewed guidance");
    expect(task.prompt).toContain("current request");
    const selected = task.memories[0];
    if (selected === undefined) throw new Error("Expected a selected memory");
    expect(() =>
      parseWikiAnswerTask({
        ...task,
        memories: [{ ...selected, sha256: "0".repeat(64) }],
      }),
    ).toThrow("memory");
    expect(() =>
      parseWikiAnswerTask({
        ...task,
        instructions: task.instructions.filter((instruction) => !instruction.includes("guidance")),
      }),
    ).toThrow("precedence");
    expect(() => parseWikiAnswerTask({ ...task, memories: [selected, selected] })).toThrow(
      "canonical",
    );
    await writeFile(
      join(workspace.root, "wiki", selected.path),
      `${task.contexts.find(({ path }) => path === selected.path)?.content}\nChanged.\n`,
      "utf8",
    );
    await expect(validateCurrentWikiAnswerTask(workspace, task)).rejects.toThrow("stale");
  });

  it("records explicit usefulness observations and aggregates them without answer content", async () => {
    const workspace = await tempWorkspace();
    await initWiki(workspace);
    await writeRawSource(workspace.root);
    await writeMemoryPage(workspace.root, "failure", "LLM Wiki Scope Failure", "active");
    const task = await prepareWikiAnswerTask(
      workspace,
      answerTaskInput("How should LLM Wiki handle a scope failure?"),
    );
    const memory = task.memories[0];
    if (memory === undefined) throw new Error("Expected a selected memory");
    const input = {
      taskOutcome: "improved" as const,
      assessments: [{ path: memory.path, verdict: "helpful" as const }],
      note: "The correction prevented a scope mismatch.",
    };

    const record = await recordWikiMemoryEvaluation(workspace, task, input, now());
    const summary = await summarizeWikiMemoryEvaluations(workspace);

    expect(parseWikiMemoryEvaluationInput(input)).toEqual(input);
    expect(parseWikiMemoryEvaluationRecord(record)).toEqual(record);
    expect(summary).toMatchObject({
      evaluations: 1,
      selections: 1,
      helpfulRate: 1,
      harmfulRate: 0,
      counts: { improved: 1, helpful: 1, harmful: 0 },
      memories: [{ path: memory.path, selected: 1, helpful: 1 }],
    });
    const saved = await readFile(
      join(workspace.root, "wiki", "raw", "evals", `${record.id}.json`),
      "utf8",
    );
    expect(saved).not.toContain("Agents compile durable wiki pages");
    expect(() => parseWikiMemoryEvaluationRecord({ ...record, extra: true })).toThrow("unknown");
    await expect(
      recordWikiMemoryEvaluation(workspace, task, {
        ...input,
        assessments: [{ path: "pages/failures/unselected.md", verdict: "helpful" }],
      }),
    ).rejects.toThrow("assess every selected memory");
  });

  it("binds a no-memory control and records a paired human comparison", async () => {
    const workspace = await tempWorkspace();
    await initWiki(workspace);
    await writeRawSource(workspace.root);
    await writeMemoryPage(workspace.root, "failure", "LLM Wiki Scope Failure", "active");
    const task = await prepareWikiAnswerTask(
      workspace,
      answerTaskInput("How should LLM Wiki handle a scope failure?"),
    );
    const memory = task.memories[0];
    if (memory === undefined) throw new Error("Expected a selected memory");
    const control = await prepareWikiMemoryControlTask(workspace, task);
    const memoryResult = answerResultForTask(task, "The answer keeps the requested scope.");
    const controlResult = answerResultForTask(control, "The answer describes a generic process.");
    const judgment = {
      preference: "memory" as const,
      assessments: [{ path: memory.path, verdict: "helpful" as const }],
      note: "The memory arm follows the requested scope.",
    };

    expect(control.memories).toEqual([]);
    expect(control.contexts.map(({ path }) => path)).not.toContain(memory.path);
    expect(control.evidence).toEqual(task.evidence);
    expect(control.requestedSourceIds).toEqual(task.requestedSourceIds);
    expect(control.knowledge).toEqual(task.knowledge);
    expect(control.question).toBe(task.question);
    expect(control.instructions).not.toContainEqual(expect.stringContaining("guidance only"));
    expect(parseWikiMemoryComparisonJudgmentInput(judgment)).toEqual(judgment);
    await expect(
      recordWikiMemoryComparison(
        workspace,
        {
          task,
          controlTask: { ...control, digest: "0".repeat(64) },
          memoryResult,
          controlResult,
          judgment,
        },
        now(),
      ),
    ).rejects.toThrow();

    const record = await recordWikiMemoryComparison(
      workspace,
      { task, controlTask: control, memoryResult, controlResult, judgment },
      now(),
    );
    const summary = await summarizeWikiMemoryEvaluations(workspace);

    expect(record).toMatchObject({
      mode: "comparison",
      taskOutcome: "improved",
      comparison: {
        controlTaskId: control.id,
        controlTaskDigest: control.digest,
        preference: "memory",
      },
    });
    expect(summary).toMatchObject({
      evaluations: 1,
      comparisons: 1,
      counts: { memoryPreferred: 1, controlPreferred: 0, tied: 0 },
    });
  });

  it("rejects ambiguous or oversized task evidence", async () => {
    const workspace = await tempWorkspace();
    await initWiki(workspace);
    await writeRawSource(workspace.root);
    await writeFile(
      join(workspace.root, "wiki", "raw", "sources", "karpathy-llm-wiki.txt"),
      "# Duplicate id\n",
    );

    await expect(prepareWikiAnswerTask(workspace, answerTaskInput())).rejects.toThrow("ambiguous");
    await rm(join(workspace.root, "wiki", "raw", "sources", "karpathy-llm-wiki.txt"));
    await writeFile(rawSourcePath(workspace.root), "x".repeat(1_000_001));
    await expect(prepareWikiAnswerTask(workspace, answerTaskInput())).rejects.toThrow(
      "context exceeds",
    );
  });

  it("turns a task-bound result into a proposal without changing the live wiki", async () => {
    const workspace = await tempWorkspace();
    await initWiki(workspace);
    await writeRawSource(workspace.root);
    const task = await prepareWikiAnswerTask(workspace, answerTaskInput());
    const before = await wikiState(workspace.root);

    const proposal = await prepareWikiAnswerProposalFromTask(
      workspace,
      task,
      answerTaskResult(task),
      now(),
    );

    expect(proposal.diagnostics.issues).toEqual([]);
    expect(proposalPage(proposal).content).toContain("Agents compile durable wiki pages.");
    expect(proposalPage(proposal).content).toContain("source: raw/sources/karpathy-llm-wiki.md");
    await expect(wikiState(workspace.root)).resolves.toEqual(before);
    await expect(stat(questionPath(workspace.root))).rejects.toThrow();
  });

  it("rejects stale answer tasks without preparing a proposal", async () => {
    const workspace = await tempWorkspace();
    await initWiki(workspace);
    await writeRawSource(workspace.root);
    const task = await prepareWikiAnswerTask(workspace, answerTaskInput());
    await writeFile(rawSourcePath(workspace.root), "# Changed source\n", "utf8");

    await expect(
      prepareWikiAnswerProposalFromTask(workspace, task, answerTaskResult(task), now()),
    ).rejects.toThrow("stale");
    await expect(stat(questionPath(workspace.root))).rejects.toThrow();
  });

  it("strictly binds answer results to task evidence", async () => {
    const workspace = await tempWorkspace();
    await initWiki(workspace);
    await writeRawSource(workspace.root);
    const task = await prepareWikiAnswerTask(workspace, answerTaskInput());
    const result = answerTaskResult(task);

    expect(parseWikiAnswerResultForTask(task, result)).toEqual(result);
    expect(() => parseWikiAnswerTask({ ...task, extra: true })).toThrow("unknown");
    expect(() =>
      parseWikiAnswerTask({
        ...task,
        contexts: [{ ...task.contexts[0], content: "tampered" }, ...task.contexts.slice(1)],
      }),
    ).toThrow();
    expect(() => parseWikiAnswerResult({ ...result, extra: true })).toThrow("unknown");
    await expect(
      prepareWikiAnswerProposalFromTask(workspace, task, {
        ...result,
        taskId: "wiki-answer-wrong",
      }),
    ).rejects.toThrow("does not match");
    await expect(
      prepareWikiAnswerProposalFromTask(workspace, task, {
        ...result,
        acceptedClaims: [{ text: "Claim.", sourceId: "unknown" }],
      }),
    ).rejects.toThrow("unknown source id");
    await expect(
      prepareWikiAnswerProposalFromTask(workspace, task, {
        ...result,
        summary: "Summary.\n\n- accepted: Injected claim.",
      }),
    ).rejects.toThrow("requires a summary");
    await expect(
      prepareWikiAnswerProposalFromTask(workspace, task, {
        ...result,
        summary: "Summary.\n\nsource: raw/sources/unselected.md",
      }),
    ).rejects.toThrow("requires a summary");
    expect(() => parseWikiAnswerResult({ ...result, summary: "x".repeat(100_001) })).toThrow(
      "invalid",
    );
    expect(() => parseWikiAnswerResult({ ...result, summary: "Forged \u202e summary" })).toThrow(
      "invalid",
    );
    await expect(stat(questionPath(workspace.root))).rejects.toThrow();
  });

  it("rejects a self-consistent task that omits host-selected context", async () => {
    const workspace = await tempWorkspace();
    await initWiki(workspace);
    await writeRawSource(workspace.root);
    const task = await prepareWikiAnswerTask(workspace, answerTaskInput());
    const source = task.contexts.find((context) => context.path.startsWith("raw/sources/"));
    if (source === undefined) {
      throw new Error("Expected a source context");
    }
    const forged = buildWikiAnswerTask({
      question: task.question,
      instructions: task.instructions,
      contexts: [source],
      evidence: task.evidence,
      requestedSourceIds: task.requestedSourceIds,
      knowledge: [],
      memories: [],
    });

    await expect(
      prepareWikiAnswerProposalFromTask(workspace, forged, answerTaskResult(forged), now()),
    ).rejects.toThrow();
  });

  it("prepares deterministic source-bound shadow rebuild tasks", async () => {
    const workspace = await tempWorkspace();
    await prepareRebuildWiki(workspace.root);
    const before = await rebuildWikiState(workspace.root);

    const task = await prepareWikiRebuildTask(workspace, rebuildTaskInput(), now());
    const repeated = await prepareWikiRebuildTask(workspace, rebuildTaskInput(), now());

    expect(task).toEqual(repeated);
    expect(task.targets.map((target) => target.path)).toEqual([
      "pages/concepts/llm-wiki.md",
      "pages/sources/llm-wiki-source.md",
    ]);
    expect(task.contexts.map((context) => context.path)).toEqual([
      "index.md",
      "raw/sources/karpathy-llm-wiki.md",
      "schema.md",
    ]);
    expect(task.prompt).not.toContain("Original concept summary.");
    expect(task.prompt).not.toContain("Original source summary.");
    await expect(validateCurrentWikiRebuildTask(workspace, task)).resolves.toEqual(task);
    await expect(rebuildWikiState(workspace.root)).resolves.toEqual(before);
  });

  it("rebuilds a supported page without requiring a paired page kind", async () => {
    const workspace = await tempWorkspace();
    await prepareRebuildWiki(workspace.root);
    await rm(pagePath(workspace.root));
    await writeFile(
      rebuildSourcePagePath(workspace.root),
      renderWikiPage(
        rebuildSourceMetadata(),
        "## Summary\n\nOriginal source summary.\n\n## Key Claims\n\n- accepted: Original source claim.\n  source: raw/sources/karpathy-llm-wiki.md\n\n## Links\n",
      ),
    );
    await writeFile(
      join(workspace.root, "wiki", "index.md"),
      "# Wiki Index\n\n- [LLM Wiki Source](pages/sources/llm-wiki-source.md)\n",
      "utf8",
    );

    const task = await prepareWikiRebuildTask(workspace, rebuildTaskInput(), now());
    const result = {
      ...rebuildResult(task),
      pages: rebuildResult(task).pages.map((page) => ({ ...page, links: [] })),
    };
    const report = await prepareWikiRebuildReport(workspace, task, result);

    expect(task.targets.map((target) => target.path)).toEqual(["pages/sources/llm-wiki-source.md"]);
    expect(report.files.map((file) => file.path)).toEqual(["pages/sources/llm-wiki-source.md"]);
    expect(report.candidateDiagnostics.issues).toEqual([]);
  });

  it("rebuilds synthesis pages through validated document blocks", async () => {
    const workspace = await tempWorkspace();
    await prepareRebuildWiki(workspace.root);
    const synthesisPath = join(
      workspace.root,
      "wiki",
      "pages",
      "syntheses",
      "research-synthesis.md",
    );
    await writeFile(
      synthesisPath,
      renderWikiPage(
        {
          ...metadata(),
          title: "Research Synthesis",
          slug: "research-synthesis",
          kind: "synthesis",
        },
        "## Conclusion\n\nBaseline synthesis.\n\n## Key Claims\n\n- accepted: Baseline synthesis claim.\n  source: raw/sources/karpathy-llm-wiki.md\n",
      ),
    );
    const conceptPath = pagePath(workspace.root);
    const concept = await readFile(conceptPath, "utf8");
    await writeFile(
      conceptPath,
      concept.replace("- [[llm-wiki-source]]", "- [[llm-wiki-source]]\n- [[research-synthesis]]"),
      "utf8",
    );
    const indexPath = join(workspace.root, "wiki", "index.md");
    const index = await readFile(indexPath, "utf8");
    await writeFile(
      indexPath,
      `${index}- [Research Synthesis](pages/syntheses/research-synthesis.md)\n`,
      "utf8",
    );

    const task = await prepareWikiRebuildTask(workspace, rebuildTaskInput(), now());
    const result = richSynthesisResult(task);
    const report = await prepareWikiRebuildReport(workspace, task, result);
    const candidate = report.files.find((file) => file.path.endsWith("research-synthesis.md"));

    expect(task.targets.map((target) => target.kind)).toEqual(["concept", "source", "synthesis"]);
    expect(task.prompt).not.toContain("Baseline synthesis.");
    expect(candidate?.content).toContain("## Decision");
    expect(candidate?.content).toContain("### Measure outcomes");
    expect(candidate?.content).toContain("| Signal | Meaning \\| action |");
    expect(candidate?.content).toContain("- hypothesis: Test the learning loop before scaling.");
    expect(candidate?.content).toContain("source: raw/sources/karpathy-llm-wiki.md");
    expect(report.candidateDiagnostics.issues).toEqual([]);
  });

  it("preserves and compares structured hypotheses without exposing the baseline body", async () => {
    const workspace = await tempWorkspace();
    await prepareRebuildWiki(workspace.root);
    const sourcePath = rebuildSourcePagePath(workspace.root);
    const source = await readFile(sourcePath, "utf8");
    await writeFile(
      sourcePath,
      `${source}\n## Application Notes\n\n- hypothesis: Test before promotion.\n`,
      "utf8",
    );
    const task = await prepareWikiRebuildTask(workspace, rebuildTaskInput(), now());

    const result = {
      ...rebuildResult(task),
      pages: rebuildResult(task).pages.map((page) =>
        page.path === "pages/sources/llm-wiki-source.md"
          ? { ...page, hypotheses: ["Test before promotion."] }
          : page,
      ),
    };
    const report = await prepareWikiRebuildReport(workspace, task, result);
    const comparison = report.comparisons.find(
      (candidate) => candidate.path === "pages/sources/llm-wiki-source.md",
    );

    expect(comparison).toMatchObject({
      baselineSections: ["Application Notes", "Key Claims", "Links", "Summary"],
      candidateSections: ["Application Notes", "Key Claims", "Links", "Summary"],
      missingSections: [],
      addedSections: [],
      baselineHypothesisCount: 1,
      candidateHypothesisCount: 1,
      retainedHypothesisCount: 1,
      missingHypotheses: [],
      addedHypotheses: [],
    });
    expect(task.prompt).not.toContain("Test before promotion.");
  });

  it("reports hypothesis loss even when the section shape remains otherwise valid", async () => {
    const workspace = await tempWorkspace();
    await prepareRebuildWiki(workspace.root);
    const sourcePath = rebuildSourcePagePath(workspace.root);
    const source = await readFile(sourcePath, "utf8");
    await writeFile(
      sourcePath,
      `${source}\n## Application Notes\n\n- hypothesis: Test before promotion.\n`,
      "utf8",
    );
    const task = await prepareWikiRebuildTask(workspace, rebuildTaskInput(), now());
    const report = await prepareWikiRebuildReport(workspace, task, rebuildResult(task));
    const comparison = report.comparisons.find(
      (candidate) => candidate.path === "pages/sources/llm-wiki-source.md",
    );

    expect(comparison).toMatchObject({
      baselineHypothesisCount: 1,
      candidateHypothesisCount: 0,
      retainedHypothesisCount: 0,
      missingHypotheses: ["Test before promotion."],
      addedHypotheses: [],
      missingSections: ["Application Notes"],
    });
  });

  it("rejects unsupported rebuild target kinds in self-consistent tasks", async () => {
    const workspace = await tempWorkspace();
    await prepareRebuildWiki(workspace.root);
    const task = await prepareWikiRebuildTask(workspace, rebuildTaskInput(), now());

    expect(() =>
      buildWikiRebuildTask({
        generatedAt: task.generatedAt,
        instructions: task.instructions,
        contexts: task.contexts,
        evidence: task.evidence,
        targets: task.targets.map((target, index) =>
          index === 0 ? { ...target, kind: "entity" as "concept" } : target,
        ),
        allowedLinks: task.allowedLinks,
      }),
    ).toThrow("target is invalid");
  });

  it("compares shadow rebuild candidates without changing the live wiki", async () => {
    const workspace = await tempWorkspace();
    await prepareRebuildWiki(workspace.root);
    const task = await prepareWikiRebuildTask(workspace, rebuildTaskInput(), now());
    const before = await rebuildWikiState(workspace.root);

    const report = await prepareWikiRebuildReport(workspace, task, rebuildResult(task));
    const concept = report.comparisons.find(
      (comparison) => comparison.path === "pages/concepts/llm-wiki.md",
    );

    expect(report.baselineDiagnostics.issues).toEqual([]);
    expect(report.candidateDiagnostics.issues).toEqual([]);
    expect(report.introducedIssues).toEqual([]);
    expect(concept).toMatchObject({
      baselineClaimCount: 1,
      candidateClaimCount: 1,
      retainedClaimCount: 0,
    });
    expect(concept?.missingClaims[0]?.text).toBe("Original concept claim.");
    expect(concept?.addedClaims[0]?.text).toBe("Rebuilt concept claim.");
    expect(parseWikiRebuildReport(report)).toEqual(report);
    const { id: _id, digest: _digest, ...reportCore } = report;
    expect(() =>
      buildWikiRebuildReport({
        ...reportCore,
        comparisons: report.comparisons.map((comparison, index) =>
          index === 0
            ? {
                ...comparison,
                missingSources: ["raw/sources/karpathy-llm-wiki.md"],
              }
            : comparison,
        ),
      }),
    ).toThrow("missing sources");
    await expect(rebuildWikiState(workspace.root)).resolves.toEqual(before);
  });

  it("keeps shadow rebuild diagnostics portable across workspace roots", async () => {
    const first = await tempWorkspace();
    const second = await tempWorkspace();
    await Promise.all([prepareRebuildWiki(first.root), prepareRebuildWiki(second.root)]);
    const [firstTask, secondTask] = await Promise.all([
      prepareWikiRebuildTask(first, rebuildTaskInput(), now()),
      prepareWikiRebuildTask(second, rebuildTaskInput(), now()),
    ]);
    const withoutConceptInboundLink = {
      ...rebuildResult(firstTask),
      pages: rebuildResult(firstTask).pages.map((page) =>
        page.path === "pages/sources/llm-wiki-source.md" ? { ...page, links: [] } : page,
      ),
    };
    const secondResult = {
      ...withoutConceptInboundLink,
      taskId: secondTask.id,
      taskDigest: secondTask.digest,
    };

    const [firstReport, secondReport] = await Promise.all([
      prepareWikiRebuildReport(first, firstTask, withoutConceptInboundLink),
      prepareWikiRebuildReport(second, secondTask, secondResult),
    ]);

    expect(firstReport.introducedIssues).toEqual([
      {
        code: "orphan-page",
        path: "pages/concepts/llm-wiki.md",
        message: "Wiki page has no inbound links",
      },
    ]);
    expect(
      firstReport.comparisons.find(
        (comparison) => comparison.path === "pages/sources/llm-wiki-source.md",
      ),
    ).toMatchObject({
      baselineLinks: ["llm-wiki"],
      candidateLinks: [],
      missingLinks: ["llm-wiki"],
      addedLinks: [],
    });
    expect(firstReport.digest).toBe(secondReport.digest);
  });

  it("compares duplicate baseline claims as a multiset", async () => {
    const workspace = await tempWorkspace();
    await prepareRebuildWiki(workspace.root);
    const conceptPath = pagePath(workspace.root);
    const concept = await readFile(conceptPath, "utf8");
    const claim = [
      "- accepted: Original concept claim.",
      "  source: raw/sources/karpathy-llm-wiki.md",
    ].join("\n");
    const duplicateSource = [
      "sources:",
      "  - raw/sources/karpathy-llm-wiki.md",
      "  - raw/sources/karpathy-llm-wiki.md",
    ].join("\n");
    await writeFile(
      conceptPath,
      concept
        .replace("sources:\n  - raw/sources/karpathy-llm-wiki.md", duplicateSource)
        .replace(claim, `${claim}\n${claim}`),
      "utf8",
    );
    const task = await prepareWikiRebuildTask(workspace, rebuildTaskInput(), now());
    const result = rebuildResult(task);
    const withOneOriginalClaim = {
      ...result,
      pages: result.pages.map((page) =>
        page.path === "pages/concepts/llm-wiki.md"
          ? {
              ...page,
              acceptedClaims: [
                {
                  text: "Original concept claim.",
                  sourceId: "karpathy-llm-wiki",
                },
              ],
            }
          : page,
      ),
    };

    const report = await prepareWikiRebuildReport(workspace, task, withOneOriginalClaim);
    const comparison = report.comparisons.find(
      (candidate) => candidate.path === "pages/concepts/llm-wiki.md",
    );

    expect(comparison).toMatchObject({
      baselineClaimCount: 2,
      candidateClaimCount: 1,
      retainedClaimCount: 1,
    });
    expect(comparison?.missingClaims).toEqual([
      {
        text: "Original concept claim.",
        source: "raw/sources/karpathy-llm-wiki.md",
      },
    ]);
    expect(comparison?.baselineSources).toEqual(["raw/sources/karpathy-llm-wiki.md"]);
    expect(report.resolvedIssues.some((issue) => issue.code === "duplicate-accepted-claim")).toBe(
      true,
    );
  });

  it("preserves target status instead of claiming conflicts were resolved", async () => {
    const workspace = await tempWorkspace();
    await prepareRebuildWiki(workspace.root);
    const conceptPath = pagePath(workspace.root);
    const concept = await readFile(conceptPath, "utf8");
    await writeFile(conceptPath, concept.replace("status: active", "status: conflicted"), "utf8");
    const task = await prepareWikiRebuildTask(workspace, rebuildTaskInput(), now());

    const report = await prepareWikiRebuildReport(workspace, task, rebuildResult(task));
    const candidate = report.files.find((file) => file.path === "pages/concepts/llm-wiki.md");

    expect(task.targets.find((target) => target.kind === "concept")?.status).toBe("conflicted");
    expect(candidate?.content).toContain("\nstatus: conflicted\n");
    expect(report.candidateDiagnostics.issues).toContainEqual({
      code: "conflicted-page",
      path: "pages/concepts/llm-wiki.md",
      message: "Wiki page has unresolved conflicts",
    });
    expect(report.resolvedIssues).toEqual([]);
  });

  it("rejects rebuild text that bypasses structured claims or links", async () => {
    const workspace = await tempWorkspace();
    await prepareRebuildWiki(workspace.root);
    const task = await prepareWikiRebuildTask(workspace, rebuildTaskInput(), now());
    const result = rebuildResult(task);
    const injectedClaim = {
      ...result,
      pages: result.pages.map((page, index) =>
        index === 0
          ? {
              ...page,
              summary:
                "Summary.\n\n## Key Claims\n\n- accepted: Injected claim.\n  source: raw/sources/not-selected.md",
            }
          : page,
      ),
    };
    const injectedLink = {
      ...result,
      pages: result.pages.map((page, index) =>
        index === 0
          ? {
              ...page,
              acceptedClaims: [
                {
                  text: "Structured claim with [[unreviewed-link]].",
                  sourceId: "karpathy-llm-wiki",
                },
              ],
            }
          : page,
      ),
    };

    expect(() => parseWikiRebuildResultForTask(task, injectedClaim)).toThrow();
    expect(() => parseWikiRebuildResultForTask(task, injectedLink)).toThrow();
  });

  it("strictly rejects malformed rebuild task, result, and report artifacts", async () => {
    const workspace = await tempWorkspace();
    await prepareRebuildWiki(workspace.root);
    const task = await prepareWikiRebuildTask(workspace, rebuildTaskInput(), now());
    const result = rebuildResult(task);
    const report = await prepareWikiRebuildReport(workspace, task, result);
    const firstTarget = task.targets[0];
    const firstEvidence = task.evidence[0];
    const firstClaim = result.pages[0]?.acceptedClaims[0];
    if (firstTarget === undefined || firstEvidence === undefined || firstClaim === undefined) {
      throw new Error("Expected rebuild fixtures");
    }
    const invalidArtifacts = [
      () => parseWikiRebuildTask({ ...task, schemaVersion: "invalid" }),
      () =>
        parseWikiRebuildTask({
          ...task,
          contexts: task.contexts.map((context, index) =>
            index === 0 ? { ...context, sha256: "0".repeat(64) } : context,
          ),
        }),
      () =>
        parseWikiRebuildTask({
          ...task,
          evidence: [{ ...firstEvidence, path: "../outside.md" }],
        }),
      () =>
        parseWikiRebuildTask({
          ...task,
          targets: task.targets.map((target, index) =>
            index === 0 ? { ...target, reviewAfter: "not-a-date" } : target,
          ),
        }),
      () =>
        parseWikiRebuildTask({
          ...task,
          allowedLinks: task.allowedLinks.filter((link) => link !== firstTarget.slug),
        }),
      () => parseWikiRebuildTask({ ...task, id: `wiki-rebuild-${"0".repeat(64)}` }),
      () => parseWikiRebuildResult(null),
      () => parseWikiRebuildResult({ ...result, unexpected: true }),
      () =>
        parseWikiRebuildResult({
          ...result,
          pages: result.pages.map((page, index) =>
            index === 0
              ? {
                  path: page.path,
                  format: "document",
                  sections: [
                    {
                      heading: "Invalid table",
                      blocks: [
                        { type: "table", columns: ["A", "B"], rows: [["one cell"]] },
                        { type: "acceptedClaims", claims: [firstClaim] },
                      ],
                    },
                  ],
                }
              : page,
          ),
        }),
      () =>
        parseWikiRebuildResult({
          ...result,
          pages: result.pages.map((page, index) =>
            index === 0
              ? {
                  path: page.path,
                  format: "document",
                  sections: [
                    {
                      heading: "Missing claims",
                      blocks: [{ type: "paragraph", text: "No accepted claim." }],
                    },
                  ],
                }
              : page,
          ),
        }),
      () => parseWikiRebuildResultForTask(task, { ...result, taskId: "wrong-task" }),
      () => parseWikiRebuildResultForTask(task, { ...result, pages: result.pages.slice(1) }),
      () =>
        parseWikiRebuildResultForTask(task, {
          ...result,
          pages: result.pages.map((page, index) =>
            index === 0 ? { ...page, acceptedClaims: [firstClaim, firstClaim] } : page,
          ),
        }),
      () =>
        parseWikiRebuildResultForTask(task, {
          ...result,
          pages: result.pages.map((page, index) =>
            index === 0
              ? { ...page, hypotheses: ["Repeated hypothesis.", "repeated  hypothesis."] }
              : page,
          ),
        }),
      () =>
        parseWikiRebuildResultForTask(task, {
          ...result,
          pages: result.pages.map((page, index) =>
            index === 0 ? { ...page, links: [firstTarget.slug] } : page,
          ),
        }),
      () =>
        parseWikiRebuildReport({
          ...report,
          comparisons: report.comparisons.map((comparison, index) =>
            index === 0 ? { ...comparison, baselineClaimCount: -1 } : comparison,
          ),
        }),
      () => parseWikiRebuildReport({ ...report, comparisons: report.comparisons.slice(1) }),
      () =>
        parseWikiRebuildReport({
          ...report,
          baselineDiagnostics: {
            issues: [{ code: "", path: "schema.md", message: "invalid" }],
          },
        }),
    ];

    for (const parse of invalidArtifacts) expect(parse).toThrow();
  });

  it("rejects stale or incorrectly bound shadow rebuild artifacts", async () => {
    const workspace = await tempWorkspace();
    await prepareRebuildWiki(workspace.root);
    const task = await prepareWikiRebuildTask(workspace, rebuildTaskInput(), now());
    const result = rebuildResult(task);

    expect(parseWikiRebuildResultForTask(task, result)).toEqual(result);
    expect(() =>
      parseWikiRebuildResultForTask(task, {
        ...result,
        pages: [...result.pages, result.pages[0]],
      }),
    ).toThrow();
    expect(() =>
      parseWikiRebuildResultForTask(task, {
        ...result,
        pages: result.pages.map((page, index) =>
          index === 0
            ? {
                ...page,
                acceptedClaims: [{ text: "Claim.", sourceId: "unknown" }],
              }
            : page,
        ),
      }),
    ).toThrow("unknown source");

    await writeFile(rawSourcePath(workspace.root), "# Changed source\n", "utf8");
    await expect(prepareWikiRebuildReport(workspace, task, result)).rejects.toThrow("stale");
    await expect(stat(join(workspace.root, "wiki", "pages", "questions"))).resolves.toBeDefined();
  });

  it("applies only an exact reviewed rebuild report and records it once", async () => {
    const workspace = await tempWorkspace();
    await prepareRebuildWiki(workspace.root);
    const task = await prepareWikiRebuildTask(workspace, rebuildTaskInput(), now());
    const result = rebuildResult(task);
    const report = await prepareWikiRebuildReport(workspace, task, result);
    const before = await rebuildWikiState(workspace.root);

    await expect(
      applyWikiRebuild(
        workspace,
        rebuildApplication(task, result, report, {
          ...rebuildApproval(report),
          digest: "0".repeat(64),
        }),
        new Date("2026-06-17T13:00:00.000Z"),
      ),
    ).rejects.toThrow("does not match");
    await expect(rebuildWikiState(workspace.root)).resolves.toEqual(before);

    const alternativeResult = {
      ...result,
      pages: result.pages.map((page, index) =>
        index === 0 ? { ...page, summary: "Different reviewed summary." } : page,
      ),
    };
    const alternativeReport = await prepareWikiRebuildReport(workspace, task, alternativeResult);
    await expect(
      applyWikiRebuild(
        workspace,
        rebuildApplication(task, result, alternativeReport),
        new Date("2026-06-17T13:00:00.000Z"),
      ),
    ).rejects.toThrow("does not match its task and result");
    await expect(rebuildWikiState(workspace.root)).resolves.toEqual(before);

    const applied = await applyWikiRebuild(
      workspace,
      rebuildApplication(task, result, report),
      new Date("2026-06-17T13:00:00.000Z"),
    );

    expect(applied.reportId).toBe(report.id);
    expect(applied.lint.issues).toEqual([]);
    await expect(readFile(pagePath(workspace.root), "utf8")).resolves.toContain(
      "Rebuilt concept claim.",
    );
    await expect(readFile(join(workspace.root, "wiki", "log.md"), "utf8")).resolves.toContain(
      `rebuild | ${report.id} | digest=${report.digest}`,
    );
    await expect(
      applyWikiRebuild(workspace, rebuildApplication(task, result, report)),
    ).rejects.toThrow("already applied");
  });

  it("rejects a reviewed rebuild when its task becomes stale", async () => {
    const workspace = await tempWorkspace();
    await prepareRebuildWiki(workspace.root);
    const task = await prepareWikiRebuildTask(workspace, rebuildTaskInput(), now());
    const result = rebuildResult(task);
    const report = await prepareWikiRebuildReport(workspace, task, result);
    const before = await readFile(pagePath(workspace.root), "utf8");
    await writeFile(rawSourcePath(workspace.root), "# Changed after review\n", "utf8");

    await expect(
      applyWikiRebuild(workspace, rebuildApplication(task, result, report)),
    ).rejects.toThrow("stale");
    await expect(readFile(pagePath(workspace.root), "utf8")).resolves.toBe(before);
  });

  it("does not promote a rebuild that fails current full-wiki lint", async () => {
    const workspace = await tempWorkspace();
    await prepareRebuildWiki(workspace.root);
    const conceptPath = pagePath(workspace.root);
    const concept = await readFile(conceptPath, "utf8");
    await writeFile(
      conceptPath,
      concept.replace(
        "updatedAt: 2026-06-17T12:00:00.000Z",
        "updatedAt: 2026-06-17T12:00:00.000Z\nreviewAfter: 2026-06-18T12:00:00.000Z",
      ),
      "utf8",
    );
    const task = await prepareWikiRebuildTask(workspace, rebuildTaskInput(), now());
    const result = rebuildResult(task);
    const report = await prepareWikiRebuildReport(workspace, task, result);
    const before = await rebuildWikiState(workspace.root);

    expect(report.candidateDiagnostics.issues).toEqual([]);
    await expect(
      applyWikiRebuild(workspace, rebuildApplication(task, result, report)),
    ).rejects.toThrow("lint issue");
    await expect(rebuildWikiState(workspace.root)).resolves.toEqual(before);
  });

  it("prepares deterministic answer proposals without changing the live wiki", async () => {
    const workspace = await tempWorkspace();
    await initWiki(workspace);
    await writeRawSource(workspace.root);
    const before = await wikiState(workspace.root);

    const proposal = await prepareWikiAnswerProposal(workspace, answerInput(), now());
    const repeated = await prepareWikiAnswerProposal(workspace, answerInput(), now());
    const page = proposal.files.find((file) => file.path === questionRelativePath());

    expect(proposal.id).toBe(repeated.id);
    expect(proposal.digest).toBe(repeated.digest);
    expect(proposal.diagnostics.issues).toEqual([]);
    expect(page?.content).toContain("- accepted: Agents compile durable wiki pages.");
    expect(page?.content).toContain("source: raw/sources/karpathy-llm-wiki.md");
    expect(page?.content).not.toContain("Answer is supported by");
    expect(page?.content.match(/source: raw\/sources\/karpathy-llm-wiki\.md/g)).toHaveLength(1);
    expect(parseWikiPage(page?.content ?? "").metadata.sources).toEqual([
      "raw/sources/karpathy-llm-wiki.md",
    ]);
    await expect(wikiState(workspace.root)).resolves.toEqual(before);
    await expect(stat(questionPath(workspace.root))).rejects.toThrow();
  });

  it("requires explicit accepted claims in answer proposals", async () => {
    const workspace = await tempWorkspace();
    await initWiki(workspace);
    await writeRawSource(workspace.root);

    await expect(
      prepareWikiAnswerProposal(workspace, { ...answerInput(), acceptedClaims: [] }),
    ).rejects.toThrow("requires at least one accepted claim");
    await expect(
      prepareWikiAnswerProposal(workspace, {
        ...answerInput(),
        acceptedClaims: [{ text: "", source: "raw/sources/karpathy-llm-wiki.md" }],
      }),
    ).rejects.toThrow("non-empty line");
    await expect(
      prepareWikiAnswerProposal(workspace, {
        ...answerInput(),
        acceptedClaims: [{ text: "Claim.", source: "raw/sources/missing.md" }],
      }),
    ).rejects.toThrow("missing");
  });

  it("does not initialize a wiki while preparing an answer proposal", async () => {
    const workspace = await tempWorkspace();

    await expect(prepareWikiAnswerProposal(workspace, answerInput())).rejects.toThrow(
      "must be initialized",
    );
    await expect(stat(join(workspace.root, "wiki"))).rejects.toThrow();
  });

  it("applies only the exact approved proposal and records one audit entry", async () => {
    const workspace = await tempWorkspace();
    await initWiki(workspace);
    await writeRawSource(workspace.root);
    const proposal = await prepareWikiAnswerProposal(workspace, answerInput(), now());
    const appliedAt = new Date("2026-06-17T13:00:00.000Z");

    const result = await applyWikiProposal(workspace, proposal, approval(proposal), appliedAt);
    const page = proposal.files.find((file) => file.path === questionRelativePath());
    const index = proposal.files.find((file) => file.path === "index.md");

    expect(result.proposalId).toBe(proposal.id);
    expect(result.lint.issues).toEqual([]);
    await expect(readFile(questionPath(workspace.root), "utf8")).resolves.toBe(page?.content);
    await expect(readFile(join(workspace.root, "wiki", "index.md"), "utf8")).resolves.toBe(
      index?.content,
    );
    const log = await readFile(join(workspace.root, "wiki", "log.md"), "utf8");
    expect(log).toContain(
      `## [${appliedAt.toISOString()}] proposal | ${proposal.id} | digest=${proposal.digest}`,
    );
    expect(log).toContain("reviewer=SeungIl");
    expect(log).toContain("reviewedAt=2026-06-17T12:30:00.000Z");
    await expect(applyWikiProposal(workspace, proposal, approval(proposal))).rejects.toThrow(
      "already applied",
    );
  });

  it("snapshots reviewed inputs before waiting for the write lock", async () => {
    const workspace = await tempWorkspace();
    await initWiki(workspace);
    await writeRawSource(workspace.root);
    const proposal = await prepareWikiAnswerProposal(workspace, answerInput(), now());
    const page = proposalPage(proposal);
    const reviewed = approval(proposal);
    const appliedAt = new Date("2026-06-17T13:00:00.000Z");
    const original = page.content;

    const pending = applyWikiProposal(workspace, proposal, reviewed, appliedAt);
    (page as { content: string }).content = original.replace(
      "Agents compile durable wiki pages.",
      "Unreviewed mutation.",
    );
    reviewed.reviewedBy = "Mallory";
    appliedAt.setUTCFullYear(2000);
    await pending;

    await expect(readFile(questionPath(workspace.root), "utf8")).resolves.toBe(original);
    const log = await readFile(join(workspace.root, "wiki", "log.md"), "utf8");
    expect(log).toContain(`digest=${proposal.digest}`);
    expect(log).toContain("reviewer=SeungIl");
    expect(log).toContain("[2026-06-17T13:00:00.000Z]");
    expect(log).not.toContain("Mallory");
  });

  it("uses the workspace root that acquired the write lock", async () => {
    const workspace = await tempWorkspace();
    const other = await tempWorkspace();
    const originalRoot = workspace.root;
    await Promise.all([initWiki(workspace), initWiki(other)]);
    await Promise.all([writeRawSource(originalRoot), writeRawSource(other.root)]);
    const proposal = await prepareWikiAnswerProposal(workspace, answerInput(), now());

    const pending = applyWikiProposal(workspace, proposal, approval(proposal));
    (workspace as { root: string }).root = other.root;
    await pending;

    await expect(readFile(questionPath(originalRoot), "utf8")).resolves.toContain(
      "Agents compile durable wiki pages.",
    );
    await expect(stat(questionPath(other.root))).rejects.toThrow();
  });

  it("rejects malformed or tampered proposal envelopes before writing", async () => {
    const workspace = await tempWorkspace();
    await initWiki(workspace);
    await writeRawSource(workspace.root);
    const proposal = await prepareWikiAnswerProposal(workspace, answerInput(), now());
    const before = await wikiState(workspace.root);

    for (const candidate of tamperedProposals(proposal)) {
      await expect(applyWikiProposal(workspace, candidate, approval(proposal))).rejects.toThrow();
    }

    await expect(wikiState(workspace.root)).resolves.toEqual(before);
    await expect(stat(questionPath(workspace.root))).rejects.toThrow();
  });

  it("refiles an approved answer without duplicating its index link or createdAt", async () => {
    const workspace = await tempWorkspace();
    await initWiki(workspace);
    await writeRawSource(workspace.root);
    const first = await prepareWikiAnswerProposal(workspace, answerInput(), now());
    await applyWikiProposal(workspace, first, approval(first));
    const later = new Date("2026-06-18T12:00:00.000Z");
    const second = await prepareWikiAnswerProposal(workspace, answerInput(), later);
    const page = proposalPage(second);

    expect(second.diagnostics.issues).toEqual([]);
    expect(parseWikiPage(page.content).metadata.createdAt).toBe(now().toISOString());
    expect(parseWikiPage(page.content).metadata.updatedAt).toBe(later.toISOString());
    await applyWikiProposal(workspace, second, approval(second, "2026-06-18T12:30:00.000Z"));
    const index = await readFile(join(workspace.root, "wiki", "index.md"), "utf8");
    expect(index.match(/pages\/questions\/how-does-llm-wiki-work\.md/g)).toHaveLength(1);
  });

  it("does not mutate the wiki for a mismatched approval", async () => {
    const workspace = await tempWorkspace();
    await initWiki(workspace);
    await writeRawSource(workspace.root);
    const proposal = await prepareWikiAnswerProposal(workspace, answerInput(), now());
    const before = await wikiState(workspace.root);

    await expect(
      applyWikiProposal(workspace, proposal, { ...approval(proposal), digest: "0".repeat(64) }),
    ).rejects.toThrow("does not match");
    await expect(
      applyWikiProposal(workspace, proposal, { ...approval(proposal), reviewedBy: "" }),
    ).rejects.toThrow("requires a reviewer");
    await expect(
      applyWikiProposal(workspace, proposal, { ...approval(proposal), reviewedAt: "yesterday" }),
    ).rejects.toThrow("ISO review timestamp");
    await expect(
      applyWikiProposal(workspace, proposal, {
        ...approval(proposal),
        reviewedAt: "2026-06-17T11:00:00.000Z",
      }),
    ).rejects.toThrow("cannot predate");
    await expect(wikiState(workspace.root)).resolves.toEqual(before);
    await expect(stat(questionPath(workspace.root))).rejects.toThrow();
  });

  it("rejects stale source evidence without partially writing files", async () => {
    const workspace = await tempWorkspace();
    await initWiki(workspace);
    await writeRawSource(workspace.root);
    const proposal = await prepareWikiAnswerProposal(workspace, answerInput(), now());
    const before = await wikiState(workspace.root);
    await writeFile(rawSourcePath(workspace.root), "# Changed source\n", "utf8");

    await expect(applyWikiProposal(workspace, proposal, approval(proposal))).rejects.toThrow(
      "stale",
    );
    await expect(wikiState(workspace.root)).resolves.toEqual({
      ...before,
      source: "# Changed source\n",
    });
    await expect(stat(questionPath(workspace.root))).rejects.toThrow();
  });

  it("preserves a newer index instead of applying a stale proposal", async () => {
    const workspace = await tempWorkspace();
    await initWiki(workspace);
    await writeRawSource(workspace.root);
    const proposal = await prepareWikiAnswerProposal(workspace, answerInput(), now());
    const manualIndex = "# Wiki Index\n\nManual edit.\n";
    await writeFile(join(workspace.root, "wiki", "index.md"), manualIndex, "utf8");
    const before = await wikiState(workspace.root);

    await expect(applyWikiProposal(workspace, proposal, approval(proposal))).rejects.toThrow(
      "stale",
    );
    await expect(wikiState(workspace.root)).resolves.toEqual(before);
    await expect(stat(questionPath(workspace.root))).rejects.toThrow();
  });

  it("keeps lint-failing proposals out of the live wiki", async () => {
    const workspace = await tempWorkspace();
    await initWiki(workspace);
    await writeRawSource(workspace.root);
    const proposal = await prepareWikiAnswerProposal(
      workspace,
      { ...answerInput(), summary: "Broken link: [[missing-page]]" },
      now(),
    );
    const before = await wikiState(workspace.root);

    expect(proposal.diagnostics.issues.map((issue) => issue.code)).toContain("broken-wiki-link");
    await expect(applyWikiProposal(workspace, proposal, approval(proposal))).rejects.toThrow(
      "lint issue",
    );
    await expect(wikiState(workspace.root)).resolves.toEqual(before);
    await expect(stat(questionPath(workspace.root))).rejects.toThrow();
  });

  it("reruns full candidate lint immediately before promotion", async () => {
    const workspace = await tempWorkspace();
    await initWiki(workspace);
    await writeRawSource(workspace.root);
    const proposal = await prepareWikiAnswerProposal(workspace, answerInput(), now());
    await writeFile(pagePath(workspace.root), renderWikiPage(metadata(), goodBody()), "utf8");
    const before = await wikiState(workspace.root);

    await expect(applyWikiProposal(workspace, proposal, approval(proposal))).rejects.toThrow(
      "lint issue",
    );
    await expect(wikiState(workspace.root)).resolves.toEqual(before);
    await expect(readFile(pagePath(workspace.root), "utf8")).resolves.toContain("Has a source");
    await expect(stat(questionPath(workspace.root))).rejects.toThrow();
  });

  it("rolls back promoted files when final validation throws", async () => {
    const workspace = await tempWorkspace();
    await initWiki(workspace);
    await writeRawSource(workspace.root);
    const proposal = await prepareWikiAnswerProposal(workspace, answerInput(), now());
    const before = await wikiState(workspace.root);
    let validations = 0;

    await expect(
      promoteWikiFiles(workspace, {
        files: proposal.files,
        auditEntry: "## [2026-06-17T12:30:00.000Z] injected validation failure",
        validate: async (candidate) => {
          validations += 1;
          if (validations === 2) {
            throw new Error("validator I/O failure");
          }
          return lintWiki(candidate);
        },
      }),
    ).rejects.toThrow("validator I/O failure");
    await expect(wikiState(workspace.root)).resolves.toEqual(before);
    await expect(stat(questionPath(workspace.root))).rejects.toThrow();
  });

  it("does not overwrite a file that appears before create-only promotion", async () => {
    const workspace = await tempWorkspace();
    await initWiki(workspace);
    const path = "raw/runs/race.json";
    const livePath = join(workspace.root, "wiki", path);
    const logPath = join(workspace.root, "wiki", "log.md");
    const beforeLog = await readFile(logPath, "utf8");

    await expect(
      promoteWikiFiles(workspace, {
        files: [{ path, content: "candidate\n", createOnly: true }],
        auditEntry: "## [2026-06-17T12:30:00.000Z] race",
        validate: async () => ({ issues: [] }),
        prePromote: () => writeFile(livePath, "concurrent\n", "utf8"),
      }),
    ).rejects.toThrow("Create-only wiki target already exists");
    await expect(readFile(livePath, "utf8")).resolves.toBe("concurrent\n");
    await expect(readFile(logPath, "utf8")).resolves.toBe(beforeLog);
  });

  it("reports source references that do not exist", async () => {
    const workspace = await tempWorkspace();
    await initWiki(workspace);
    await writeFile(pagePath(workspace.root), renderWikiPage(metadata(), goodBody()), "utf8");
    await writeFile(join(workspace.root, "wiki", "index.md"), indexWithPage(), "utf8");

    const report = await lintWiki(workspace);

    expect(report.issues.map((issue) => issue.code)).toContain("missing-source");
  });

  it("rejects traversal, directories, and symbolic links as source evidence", async () => {
    const workspace = await tempWorkspace();
    await initWiki(workspace);
    await writeFile(join(workspace.root, "outside.md"), "# Outside\n", "utf8");
    await mkdir(join(workspace.root, "outside-directory"));
    await writeFile(join(workspace.root, "outside-directory", "nested.md"), "# Nested\n", "utf8");
    await mkdir(join(workspace.root, "wiki", "raw", "sources", "directory.md"));
    await symlink(
      join(workspace.root, "outside.md"),
      join(workspace.root, "wiki", "raw", "sources", "linked.md"),
    );
    await symlink(
      join(workspace.root, "outside-directory"),
      join(workspace.root, "wiki", "raw", "sources", "linked-directory"),
    );

    const reports = [];
    for (const source of [
      "raw/sources/../../../outside.md",
      "raw/sources/directory.md",
      "raw/sources/linked.md",
      "raw/sources/linked-directory/nested.md",
    ]) {
      reports.push(await lintSingleSourcePage(workspace.root, source));
    }

    expect(reports.map((report) => report.issues[0]?.code)).toEqual([
      "unsupported-source",
      "unsupported-source",
      "unsupported-source",
      "unsupported-source",
    ]);
  });

  it("reports a symbolic managed source root instead of trusting its realpath", async () => {
    const workspace = await tempWorkspace();
    await initWiki(workspace);
    const outside = join(workspace.root, "outside-source-root");
    await mkdir(outside);
    await writeFile(join(outside, "source.md"), "# Outside source\n", "utf8");
    await rm(join(workspace.root, "wiki", "raw", "sources"), { recursive: true });
    await symlink(outside, join(workspace.root, "wiki", "raw", "sources"));
    await writeFile(pagePath(workspace.root), renderWikiPage(metadata(), goodBody()), "utf8");
    await writeFile(join(workspace.root, "wiki", "index.md"), indexWithPage(), "utf8");

    const report = await lintWiki(workspace);
    expect(report.issues).toContainEqual(expect.objectContaining({ code: "unsafe-required-path" }));
  });

  it("does not follow a question-page symlink while applying a proposal", async () => {
    const workspace = await tempWorkspace();
    await initWiki(workspace);
    await writeRawSource(workspace.root);
    const proposal = await prepareWikiAnswerProposal(workspace, answerInput(), now());
    const outside = join(workspace.root, "outside-answer.md");
    await writeFile(outside, "sentinel\n", "utf8");
    await symlink(outside, questionPath(workspace.root));
    const before = await wikiState(workspace.root);

    await expect(applyWikiProposal(workspace, proposal, approval(proposal))).rejects.toThrow(
      "symbolic link",
    );
    await expect(readFile(outside, "utf8")).resolves.toBe("sentinel\n");
    await expect(wikiState(workspace.root)).resolves.toEqual(before);
  });

  it("does not append candidate audit data through a live log symlink", async () => {
    const workspace = await tempWorkspace();
    await initWiki(workspace);
    await writeRawSource(workspace.root);
    const proposal = await prepareWikiAnswerProposal(workspace, answerInput(), now());
    const beforeIndex = await readFile(join(workspace.root, "wiki", "index.md"), "utf8");
    const outside = join(workspace.root, "outside-log.md");
    await writeFile(outside, "sentinel\n", "utf8");
    await rm(join(workspace.root, "wiki", "log.md"));
    await symlink(outside, join(workspace.root, "wiki", "log.md"));

    await expect(applyWikiProposal(workspace, proposal, approval(proposal))).rejects.toThrow(
      "symbolic link",
    );
    await expect(readFile(outside, "utf8")).resolves.toBe("sentinel\n");
    await expect(readFile(join(workspace.root, "wiki", "index.md"), "utf8")).resolves.toBe(
      beforeIndex,
    );
    await expect(stat(questionPath(workspace.root))).rejects.toThrow();
  });

  it("reports and refuses symbolic wiki pages during lint and reads", async () => {
    const workspace = await tempWorkspace();
    await initWiki(workspace);
    await writeRawSource(workspace.root);
    const outside = join(workspace.root, "outside-page.md");
    await writeFile(
      outside,
      renderWikiPage(
        {
          ...metadata(),
          title: "Leaked",
          slug: "leaked",
          kind: "question",
        },
        goodBody(),
      ),
      "utf8",
    );
    await symlink(outside, join(workspace.root, "wiki", "pages", "questions", "leaked.md"));
    await writeFile(
      join(workspace.root, "wiki", "index.md"),
      "# Wiki Index\n\n- [Leaked](pages/questions/leaked.md)\n",
      "utf8",
    );

    const report = await lintWiki(workspace);
    expect(report.issues.map((issue) => issue.code)).toContain("unsafe-page-path");
    await expect(readWikiPage(workspace, "leaked")).rejects.toThrow("not a regular file");
    await expect(prepareWikiQuery(workspace, "leaked")).rejects.toThrow("not a regular file");
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

  it.runIf(supportsPermissionFailure)(
    "does not leave raw files behind when an audit append fails",
    async () => {
      const sourceWorkspace = await tempWorkspace();
      const runWorkspace = await tempWorkspace();
      await Promise.all([initWiki(sourceWorkspace), initWiki(runWorkspace)]);
      await writeFile(join(sourceWorkspace.root, "source.md"), "# Source\n", "utf8");

      await assertAuditFailureRollsBackSource(sourceWorkspace.root);
      await assertAuditFailureRollsBackRun(runWorkspace.root);
    },
  );

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

function reviewMetadata() {
  return {
    ...metadata(),
    status: "review" as const,
  };
}

function staleMetadata() {
  return {
    ...sourceMetadata(),
    reviewAfter: "2026-06-16T12:00:00.000Z",
  };
}

function invalidReviewAfterMetadata() {
  return {
    ...metadata(),
    reviewAfter: "not-a-date",
  };
}

function sourceMetadata() {
  return {
    ...metadata(),
    title: "LLM Wiki Source",
    slug: "llm-wiki-source",
    kind: "source" as const,
  };
}

function answerInput() {
  return {
    question: "How does LLM Wiki work?",
    summary: "Agents compile durable wiki pages from managed sources.",
    acceptedClaims: [
      {
        text: "Agents compile durable wiki pages.",
        source: "raw/sources/karpathy-llm-wiki.md",
      },
      {
        text: "Agents compile durable wiki pages.",
        source: "raw/sources/karpathy-llm-wiki.md",
      },
    ],
  };
}

function answerTaskInput(question = "How does LLM Wiki work?") {
  return {
    question,
    sourceIds: ["karpathy-llm-wiki"],
  };
}

function answerTaskResult(task: WikiAnswerTask) {
  return {
    schemaVersion: "ai-lab.wiki-answer-result.v1" as const,
    taskId: task.id,
    taskDigest: task.digest,
    question: task.question,
    summary: "Agents compile durable wiki pages from managed sources.",
    acceptedClaims: [
      {
        text: "Agents compile durable wiki pages.",
        sourceId: "karpathy-llm-wiki",
      },
    ],
  };
}

function answerResultForTask(task: WikiAnswerTask, summary: string) {
  return { ...answerTaskResult(task), summary };
}

function rebuildTaskInput() {
  return { sourceIds: ["karpathy-llm-wiki"] };
}

function rebuildResult(task: WikiRebuildTask): WikiRebuildResult {
  return {
    schemaVersion: "ai-lab.wiki-rebuild-result.v3",
    taskId: task.id,
    taskDigest: task.digest,
    pages: task.targets.map(rebuildResultPage),
  };
}

function rebuildResultPage(target: WikiRebuildTask["targets"][number]) {
  if (target.kind === "synthesis") {
    return {
      path: target.path,
      format: "document" as const,
      sections: [
        {
          heading: "Conclusion",
          blocks: [
            { type: "paragraph" as const, text: "Rebuilt synthesis." },
            {
              type: "acceptedClaims" as const,
              claims: [{ text: "Rebuilt synthesis claim.", sourceId: "karpathy-llm-wiki" }],
            },
          ],
        },
      ],
    };
  }
  return {
    path: target.path,
    format: "evidence" as const,
    summary: target.kind === "concept" ? "Rebuilt concept summary." : "Original source summary.",
    acceptedClaims: [
      {
        text: target.kind === "concept" ? "Rebuilt concept claim." : "Original source claim.",
        sourceId: "karpathy-llm-wiki",
      },
    ],
    hypotheses: [],
    links: [target.kind === "concept" ? "llm-wiki-source" : "llm-wiki"],
  };
}

function richSynthesisResult(task: WikiRebuildTask): WikiRebuildResult {
  const result = rebuildResult(task);
  return {
    ...result,
    pages: result.pages.map((page) => {
      if (page.format === "document") return richDocumentPage(page.path);
      return page.path.includes("/concepts/")
        ? { ...page, links: [...page.links, "research-synthesis"] }
        : page;
    }),
  };
}

function richDocumentPage(path: string): WikiRebuildResult["pages"][number] {
  return {
    path,
    format: "document",
    sections: [
      {
        heading: "Conclusion",
        blocks: [
          { type: "paragraph", text: "Own a complete learning loop." },
          { type: "callout", text: "Records become useful when they change later action." },
        ],
      },
      {
        heading: "Decision",
        blocks: [
          { type: "subheading", text: "Measure outcomes" },
          { type: "bullets", items: ["Record corrections.", "Connect them to results."] },
          { type: "steps", items: ["Choose one task.", "Evaluate the result."] },
          {
            type: "table",
            columns: ["Signal", "Meaning | action"],
            rows: [["Correction", "Update the rule."]],
          },
          { type: "hypotheses", items: ["Test the learning loop before scaling."] },
          {
            type: "acceptedClaims",
            claims: [
              {
                text: "A managed Wiki preserves reusable knowledge.",
                sourceId: "karpathy-llm-wiki",
              },
            ],
          },
          { type: "links", slugs: ["llm-wiki"] },
        ],
      },
    ],
  };
}

async function prepareRebuildWiki(root: string): Promise<void> {
  await initWiki(createWorkspace(root));
  await writeRawSource(root);
  await writeFile(
    pagePath(root),
    renderWikiPage(metadata(), rebuildBody("Original concept summary.", "Original concept claim.")),
  );
  await writeFile(
    rebuildSourcePagePath(root),
    renderWikiPage(
      rebuildSourceMetadata(),
      rebuildBody("Original source summary.", "Original source claim."),
    ),
  );
  await writeFile(join(root, "wiki", "index.md"), rebuildIndex(), "utf8");
}

function rebuildSourceMetadata() {
  return {
    ...metadata(),
    title: "LLM Wiki Source",
    slug: "llm-wiki-source",
    kind: "source" as const,
  };
}

function rebuildBody(summary: string, claim: string): string {
  const link = summary.includes("concept") ? "llm-wiki-source" : "llm-wiki";
  return `## Summary\n\n${summary}\n\n## Key Claims\n\n- accepted: ${claim}\n  source: raw/sources/karpathy-llm-wiki.md\n\n## Links\n\n- [[${link}]]\n`;
}

function rebuildIndex(): string {
  return [
    "# Wiki Index",
    "",
    "- [LLM Wiki](pages/concepts/llm-wiki.md)",
    "- [LLM Wiki Source](pages/sources/llm-wiki-source.md)",
    "",
  ].join("\n");
}

async function rebuildWikiState(root: string) {
  return {
    concept: await readFile(pagePath(root), "utf8"),
    sourcePage: await readFile(rebuildSourcePagePath(root), "utf8"),
    index: await readFile(join(root, "wiki", "index.md"), "utf8"),
    log: await readFile(join(root, "wiki", "log.md"), "utf8"),
    source: await readFile(rawSourcePath(root), "utf8"),
  };
}

function approval(proposal: WikiProposal, reviewedAt = "2026-06-17T12:30:00.000Z") {
  return {
    proposalId: proposal.id,
    digest: proposal.digest,
    accepted: true as const,
    reviewedBy: "SeungIl",
    reviewedAt,
  };
}

function rebuildApproval(report: { id: string; digest: string }) {
  return {
    reportId: report.id,
    digest: report.digest,
    accepted: true as const,
    reviewedBy: "SeungIl",
    reviewedAt: "2026-06-17T12:30:00.000Z",
  };
}

function rebuildApplication(
  task: WikiRebuildTask,
  result: WikiRebuildResult,
  report: { id: string; digest: string },
  approval = rebuildApproval(report),
) {
  return { task, result, report, approval };
}

function reflectionInput() {
  return {
    runSummary: "The response answered a different memory scope.",
    feedback: "Keep the scope the user requested.",
    validation: "The mismatch is observable and repeatable.",
    changedFiles: ["packages/wiki/src/index.ts"],
  };
}

function reflectionResult(task: { id: string; digest: string }): WikiReflectionResult {
  return {
    schemaVersion: "ai-lab.wiki-reflection-result.v2",
    taskId: task.id,
    taskDigest: task.digest,
    outcome: "propose",
    rationale: "The correction is reusable.",
    page: {
      kind: "failure",
      title: "Scope Mismatch",
      slug: "scope-mismatch",
      summary: "Answer the memory scope the user requested.",
      retrievalTerms: ["requested memory scope", "요청한 기억 범위"],
      failure: "The response replaced the requested scope with a generic process lesson.",
      trigger: "A user asks what should be remembered from a conversation.",
      correction: [
        "Restate *exact* requested scope.",
        "Classify candidates before proposing storage.",
      ],
      preventionChecks: ["Each candidate answers the stated scope."],
      hypotheses: ["The mismatch may recur."],
      links: [],
    },
  };
}

function reflectionApproval(report: { id: string; digest: string }) {
  return {
    reportId: report.id,
    digest: report.digest,
    accepted: true as const,
    reviewedBy: "SeungIl",
    reviewedAt: "2026-06-17T12:30:00.000Z",
  };
}

function reflectionApplication(
  task: unknown,
  result: unknown,
  report: { id: string; digest: string },
  approval = reflectionApproval(report),
) {
  return { task, result, report, approval };
}

async function reflectionWikiState(root: string) {
  return {
    index: await readFile(join(root, "wiki", "index.md"), "utf8"),
    log: await readFile(join(root, "wiki", "log.md"), "utf8"),
    page: await readFile(
      join(root, "wiki", "pages", "failures", "scope-mismatch.md"),
      "utf8",
    ).catch(() => null),
  };
}

function tamperedProposals(proposal: WikiProposal): WikiProposal[] {
  const index = proposal.files.find((file) => file.path === "index.md");
  const page = proposalPage(proposal);
  if (index === undefined) {
    throw new Error("Test proposal is missing index.md");
  }
  return [
    { ...proposal, digest: "0".repeat(64) },
    { ...proposal, id: "answer-wrong" },
    { ...proposal, kind: "unsupported" as never },
    { ...proposal, note: "" },
    { ...proposal, files: [index, index] },
    { ...proposal, files: [page, { ...page, path: "pages/questions/other.md" }] },
    { ...proposal, files: [{ ...index, path: "../index.md" }, page] },
    {
      ...proposal,
      files: [
        index,
        { ...page, content: page.content.replace("status: active", "status: review") },
      ],
    },
    {
      ...proposal,
      files: [index, { ...page, content: page.content.replace("  source:", "  evidence:") }],
    },
    { ...proposal, baseHashes: {} },
    { ...proposal, baseHashes: { ...proposal.baseHashes, "schema.md": "bad" } },
    { ...proposal, sourceHashes: {} },
  ];
}

function proposalPage(proposal: WikiProposal) {
  const page = proposal.files.find((file) => file.path === questionRelativePath());
  if (page === undefined) {
    throw new Error("Test proposal is missing its question page");
  }
  return page;
}

function now(): Date {
  return new Date("2026-06-17T12:00:00.000Z");
}

function badBody(): string {
  return "## Summary\n\n[[ ]]\n\n- accepted: Missing a source line.\n\n## Key Claims\n";
}

function goodBody(): string {
  return "## Summary\n\n[[llm-wiki]]\n\n## Key Claims\n\n- accepted: Has a source.\n  source: raw/sources/karpathy-llm-wiki.md\n";
}

function sourceBackedBody(claim: string): string {
  return `## Summary\n\nA source-backed page.\n\n## Key Claims\n\n- accepted: ${claim}\n  source: raw/sources/karpathy-llm-wiki.md\n`;
}

function indexWithPage(): string {
  return "# Wiki Index\n\n- [LLM Wiki](pages/concepts/llm-wiki.md)\n";
}

async function writeRawSource(root: string): Promise<void> {
  await writeFile(rawSourcePath(root), "# Source\n");
}

async function writeMemoryPage(
  root: string,
  kind: "playbook" | "failure" | "decision",
  title: string,
  status: "active" | "superseded",
  options: { readonly reviewAfter?: string } = {},
): Promise<void> {
  const slug = title.toLowerCase().replaceAll(" ", "-");
  const directory =
    kind === "playbook" ? "playbooks" : kind === "failure" ? "failures" : "decisions";
  const metadata = {
    title,
    slug,
    kind,
    status,
    createdAt: "2026-06-17T12:00:00.000Z",
    updatedAt: "2026-06-17T12:00:00.000Z",
    reviewAfter: options.reviewAfter ?? "2027-06-17T12:00:00.000Z",
    retrievalTerms: [title],
    sources: [],
  };
  await writeFile(
    join(root, "wiki", "pages", directory, `${slug}.md`),
    renderWikiPage(metadata, `## Summary\n\n${title} guidance.\n\n## Links\n\n`),
    "utf8",
  );
}

async function writeKnowledgePage(
  root: string,
  kind: "source" | "concept" | "entity" | "synthesis" | "question",
  title: string,
  status: "active" | "draft" | "superseded",
  body: string,
  reviewAfter = "2027-06-17T12:00:00.000Z",
): Promise<string> {
  const slug = title.toLowerCase().replaceAll(" ", "-");
  const directory =
    kind === "entity" ? "entities" : kind === "synthesis" ? "syntheses" : `${kind}s`;
  const path = `pages/${directory}/${slug}.md`;
  await writeFile(
    join(root, "wiki", path),
    renderWikiPage(
      {
        title,
        slug,
        kind,
        status,
        createdAt: "2026-06-17T12:00:00.000Z",
        updatedAt: "2026-06-17T12:00:00.000Z",
        reviewAfter,
        sources: ["raw/sources/karpathy-llm-wiki.md"],
      },
      body,
    ),
    "utf8",
  );
  return path;
}

function knowledgeCandidate(path: string) {
  return {
    path,
    title: "Durable Knowledge",
    slug: path.slice(path.lastIndexOf("/") + 1, -3),
    kind: "concept",
    status: "active",
    sources: ["raw/sources/karpathy-llm-wiki.md"],
    content: "## Summary\n\nDurable knowledge compounds across work.\n",
  };
}

function knowledgeEvaluationCases(expectedPath = "pages/concepts/durable-knowledge.md") {
  return {
    schemaVersion: wikiKnowledgeEvaluationCaseSetSchemaVersion,
    cases: [
      {
        id: "durable-knowledge",
        query: "durable knowledge",
        expectedPages: [expectedPath],
        allowedPages: [expectedPath],
        expectedSources: ["raw/sources/karpathy-llm-wiki.md"],
      },
      {
        id: "unrelated-weather",
        query: "weather forecast",
        expectedPages: [],
        allowedPages: [],
        expectedSources: [],
      },
    ],
  };
}

function pagePath(root: string): string {
  return join(root, "wiki", "pages", "concepts", "llm-wiki.md");
}

function questionPath(root: string): string {
  return join(root, "wiki", questionRelativePath());
}

function sourcePagePath(root: string): string {
  return join(root, "wiki", "pages", "sources", "llm-wiki.md");
}

function rebuildSourcePagePath(root: string): string {
  return join(root, "wiki", "pages", "sources", "llm-wiki-source.md");
}

function questionRelativePath(): string {
  return "pages/questions/how-does-llm-wiki-work.md";
}

function rawSourcePath(root: string): string {
  return join(root, "wiki", "raw", "sources", "karpathy-llm-wiki.md");
}

async function wikiState(root: string) {
  return {
    index: await readFile(join(root, "wiki", "index.md"), "utf8"),
    log: await readFile(join(root, "wiki", "log.md"), "utf8"),
    source: await readFile(rawSourcePath(root), "utf8"),
  };
}

async function lintSingleSourcePage(root: string, source: string) {
  const workspace = createWorkspace(root);
  await writeFile(
    pagePath(root),
    renderWikiPage({ ...metadata(), sources: [source] }, sourceBackedBodyFor(source)),
    "utf8",
  );
  await writeFile(join(root, "wiki", "index.md"), indexWithPage(), "utf8");
  return lintWiki(workspace);
}

function sourceBackedBodyFor(source: string): string {
  return `## Summary\n\nEvidence.\n\n## Key Claims\n\n- accepted: A claim.\n  source: ${source}\n`;
}

async function assertLogSymlinkRejected(root: string): Promise<void> {
  const outside = join(root, "outside-log.md");
  await writeFile(outside, "sentinel\n", "utf8");
  await rm(join(root, "wiki", "log.md"));
  await symlink(outside, join(root, "wiki", "log.md"));
  await expect(
    recordWikiRun(createWorkspace(root), { task: "answer", input: "q", output: "a" }),
  ).rejects.toThrow("symbolic link");
  await expect(readFile(outside, "utf8")).resolves.toBe("sentinel\n");
}

async function assertRunDirectorySymlinkRejected(root: string): Promise<void> {
  const outside = join(root, "outside-runs");
  await mkdir(outside);
  await rm(join(root, "wiki", "raw", "runs"), { recursive: true });
  await symlink(outside, join(root, "wiki", "raw", "runs"));
  await expect(
    recordWikiRun(createWorkspace(root), { task: "answer", input: "q", output: "a" }),
  ).rejects.toThrow("symbolic link");
  await expect(readdir(outside)).resolves.toEqual([]);
}

async function assertSourceDirectorySymlinkRejected(root: string): Promise<void> {
  const outside = join(root, "outside-sources");
  const input = join(root, "input.md");
  await mkdir(outside);
  await writeFile(input, "# Input\n", "utf8");
  await rm(join(root, "wiki", "raw", "sources"), { recursive: true });
  await symlink(outside, join(root, "wiki", "raw", "sources"));
  await expect(
    addWikiSource(createWorkspace(root), { path: input, title: "Input" }),
  ).rejects.toThrow("symbolic link");
  await expect(readdir(outside)).resolves.toEqual([]);
}

async function assertAuditFailureRollsBackSource(root: string): Promise<void> {
  const log = join(root, "wiki", "log.md");
  const before = await readFile(log, "utf8");
  await chmod(log, 0o444);
  try {
    await expect(
      addWikiSource(createWorkspace(root), { path: "source.md", title: "Source" }),
    ).rejects.toThrow();
    await expect(readdir(join(root, "wiki", "raw", "sources"))).resolves.toEqual([]);
    await expect(readFile(log, "utf8")).resolves.toBe(before);
  } finally {
    await chmod(log, 0o644);
  }
}

async function assertAuditFailureRollsBackRun(root: string): Promise<void> {
  const log = join(root, "wiki", "log.md");
  const before = await readFile(log, "utf8");
  await chmod(log, 0o444);
  try {
    await expect(
      recordWikiRun(createWorkspace(root), { task: "answer", input: "q", output: "a" }),
    ).rejects.toThrow();
    await expect(readdir(join(root, "wiki", "raw", "runs"))).resolves.toEqual([]);
    await expect(readFile(log, "utf8")).resolves.toBe(before);
  } finally {
    await chmod(log, 0o644);
  }
}
