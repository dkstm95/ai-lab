import type { WikiReflectionResultPage } from "./reflection-result.js";

export function reflectionPagePath(page: WikiReflectionResultPage): string {
  return `pages/${reflectionDirectory(page.kind)}/${page.slug}.md`;
}

export function renderReflectionBody(page: WikiReflectionResultPage): string {
  const sections = [
    textSection("Summary", page.summary),
    ...kindSections(page),
    hypothesesSection(page.hypotheses),
    linksSection(page.links),
  ].filter((value) => value.length > 0);
  return `${sections.join("\n\n")}\n`;
}

export function reflectionIndexSection(kind: WikiReflectionResultPage["kind"]): string {
  if (kind === "failure") return "Failures";
  if (kind === "playbook") return "Playbooks";
  return "Decisions";
}

export function reflectionIndexEntry(page: WikiReflectionResultPage, path: string): string {
  return `- [${markdownText(page.title)}](${path}) - ${markdownText(page.summary)}`;
}

function reflectionDirectory(kind: WikiReflectionResultPage["kind"]): string {
  if (kind === "failure") return "failures";
  if (kind === "playbook") return "playbooks";
  return "decisions";
}

function kindSections(page: WikiReflectionResultPage): string[] {
  if (page.kind === "failure") {
    return [
      textSection("Failure", page.failure),
      textSection("Trigger", page.trigger),
      stepsSection("Correction", page.correction),
      bulletsSection("Prevention Check", page.preventionChecks),
    ];
  }
  if (page.kind === "playbook") {
    return [
      textSection("When to Use", page.whenToUse),
      stepsSection("Steps", page.steps),
      bulletsSection("Checks", page.checks),
    ];
  }
  return [
    textSection("Decision", page.decision),
    bulletsSection("Reasoning", page.reasoning),
    bulletsSection("Consequences", page.consequences),
  ];
}

function textSection(title: string, content: string): string {
  return `## ${title}\n\n${markdownText(content)}`;
}

function stepsSection(title: string, values: readonly string[]): string {
  return `## ${title}\n\n${values
    .map((value, index) => `${index + 1}. ${markdownText(value)}`)
    .join("\n")}`;
}

function bulletsSection(title: string, values: readonly string[]): string {
  return `## ${title}\n\n${values.map((value) => `- ${markdownText(value)}`).join("\n")}`;
}

function hypothesesSection(hypotheses: readonly string[]): string {
  return hypotheses.length === 0
    ? ""
    : `## Hypotheses\n\n${hypotheses
        .map((hypothesis) => `- hypothesis: ${markdownText(hypothesis)}`)
        .join("\n")}`;
}

function linksSection(links: readonly string[]): string {
  return `## Links\n\n${links.map((link) => `- [[${link}]]`).join("\n")}`;
}

function markdownText(value: string): string {
  return value.replaceAll("\\", "\\\\").replace(/([`*_[\]<>|])/g, "\\$1");
}
