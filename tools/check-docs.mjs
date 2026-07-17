import { readFileSync, readdirSync, statSync } from "node:fs";
import { access } from "node:fs/promises";

const requiredFiles = [
  "README.md",
  "README.ko.md",
  "AGENTS.md",
  "docs/system-design.md",
  "docs/development-guide.md",
  "docs/testing-guide.md",
  "docs/contribution-guide.md",
  ".github/pull_request_template.md",
  "package.json",
];

const requiredRootScripts = [
  "build",
  "check",
  "cli",
  "code:shape",
  "docs:check",
  "format",
  "format:write",
  "lint",
  "service:dev",
  "test",
  "typecheck",
];

const markdownLineLimit = 140;

const docs = {
  readme: read("README.md"),
  readmeKo: read("README.ko.md"),
  agents: read("AGENTS.md"),
  systemDesign: read("docs/system-design.md"),
  development: read("docs/development-guide.md"),
  testing: read("docs/testing-guide.md"),
  contribution: read("docs/contribution-guide.md"),
  pullRequestTemplate: read(".github/pull_request_template.md"),
  packageJson: JSON.parse(read("package.json")),
};

for (const file of requiredFiles) {
  await assertExists(file);
}

for (const script of requiredRootScripts) {
  assert(script in docs.packageJson.scripts, `Missing root package script: ${script}`);
}

assert("coverage" in docs.packageJson.scripts, "Missing root package script: coverage");
for (const command of [
  "pnpm cli --help",
  "pnpm cli run hello",
  "pnpm service:dev",
  "pnpm test",
  "pnpm typecheck",
  "pnpm lint",
  "pnpm code:shape",
  "pnpm coverage",
  "pnpm build",
  "pnpm check",
]) {
  assert(
    docs.readme.includes(command) ||
      docs.readmeKo.includes(command) ||
      docs.development.includes(command),
    `Documented command is missing: ${command}`,
  );
}

for (const packageName of [
  "protocol",
  "config",
  "model-providers",
  "agent-runtime",
  "workspace",
  "wiki",
  "local-tools",
]) {
  assert(
    docs.systemDesign.includes(`packages/${packageName}`),
    `system-design.md must describe packages/${packageName}`,
  );
}

for (const topic of ["wiki", "MCP", "eval"]) {
  assert(
    docs.systemDesign.toLowerCase().includes(topic.toLowerCase()),
    `Missing later-addition topic: ${topic}`,
  );
}

for (const phrase of [
  "Reduce branches",
  "Export meaningful package behavior",
  "Avoid deep call stacks",
]) {
  assert(
    docs.systemDesign.includes(phrase),
    `system-design.md must include code shape rule: ${phrase}`,
  );
}

assert(
  docs.testing.includes("Avoid duplicate coverage"),
  "testing-guide.md must describe duplicate coverage policy",
);

for (const phrase of [
  "Hope",
  "$hope:align",
  "$hope:diff",
  "packages/agent-runtime",
  "consumer rather than a second implementation",
  "read-only",
  "user-review item",
  "clean Git boundary",
  "not committed by default",
]) {
  assert(
    docs.systemDesign.includes(phrase),
    `system-design.md must describe the external Hope boundary: ${phrase}`,
  );
}

for (const file of [
  "README.md",
  "README.ko.md",
  "docs/system-design.md",
  "docs/development-guide.md",
  "docs/testing-guide.md",
  "docs/contribution-guide.md",
]) {
  assert(docs.agents.includes(file), `AGENTS.md must include ${file} in the document map`);
}

assert(
  docs.development.includes("pnpm docs:check"),
  "development-guide.md must document pnpm docs:check",
);
assert(docs.testing.includes("pnpm docs:check"), "testing-guide.md must mention docs check");
assert(docs.testing.includes("pnpm coverage"), "testing-guide.md must document pnpm coverage");
assert(
  docs.development.includes("docs/contribution-guide.md"),
  "development-guide.md must point to contribution-guide.md",
);
for (const phrase of [
  "Spring Framework",
  "55 characters",
  "Pull Request Rules",
  "Understanding` section",
]) {
  assert(docs.contribution.includes(phrase), `contribution-guide.md must include: ${phrase}`);
}
for (const phrase of [
  "AI-Assisted Change Handoff",
  "correctness evidence",
  "active participation check",
  "immutable intent revision",
  "next clean boundary",
  "entire generated bundle",
]) {
  assert(docs.development.includes(phrase), `development-guide.md must include: ${phrase}`);
}
for (const phrase of ["## Understanding", "Behavior path", "Active reviewer check"]) {
  assert(
    docs.pullRequestTemplate.includes(phrase),
    `pull request template must include: ${phrase}`,
  );
}
assert(
  docs.agents.includes("AI 코드 변경 이해 인계"),
  "AGENTS.md must route AI change understanding work",
);
assert(docs.readme.includes("README.ko.md"), "README.md must link README.ko.md");
assert(docs.readmeKo.includes("README.md"), "README.ko.md must link README.md");

for (const phrase of [
  "https://github.com/dkstm95/hope",
  "$hope:align",
  "$hope:diff",
  "Do not commit generated bundles by default",
]) {
  assert(docs.readme.includes(phrase), `README.md must describe external Hope: ${phrase}`);
}

for (const file of collectMarkdownFiles(".")) {
  const lineCount = read(file).trimEnd().split("\n").length;
  assert(lineCount <= markdownLineLimit, `${file} is too long: ${lineCount} lines`);
}

console.log("docs check passed");

function read(path) {
  return readFileSync(path, "utf8");
}

async function assertExists(path) {
  try {
    await access(path);
  } catch {
    throw new Error(`Required file is missing: ${path}`);
  }
}

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

function collectMarkdownFiles(root) {
  const ignored = new Set([".git", "coverage", "dist", "node_modules"]);
  const files = [];
  for (const entry of readdirSync(root)) {
    if (ignored.has(entry)) {
      continue;
    }
    const path = root === "." ? entry : `${root}/${entry}`;
    const stat = statSync(path);
    if (stat.isDirectory()) {
      files.push(...collectMarkdownFiles(path));
    } else if (path.endsWith(".md")) {
      files.push(path);
    }
  }
  return files;
}
