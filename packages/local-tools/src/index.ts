import type { ToolCall, ToolDefinition, ToolResult } from "@ai-lab/protocol";
import {
  addWikiSource,
  initWiki,
  lintWiki,
  prepareWikiAnswerProposal,
  prepareWikiEvolve,
  prepareWikiIngest,
  prepareWikiQuery,
  recordWikiRun,
} from "@ai-lab/wiki";
import type { Workspace } from "@ai-lab/workspace";

export interface LocalTool {
  readonly definition: ToolDefinition;
  execute(call: ToolCall): Promise<ToolResult>;
}

export class EchoTool implements LocalTool {
  readonly definition = {
    name: "echo",
    description: "Returns the text input for smoke tests.",
  };

  async execute(call: ToolCall): Promise<ToolResult> {
    return {
      name: this.definition.name,
      output: String(call.input.text ?? ""),
    };
  }
}

export class InitWikiTool implements LocalTool {
  readonly definition = {
    name: "wiki.init",
    description: "Initializes the local LLM Wiki workspace.",
  };

  constructor(private readonly workspace: Workspace) {}

  async execute(_call: ToolCall): Promise<ToolResult> {
    return { name: this.definition.name, output: await initWiki(this.workspace) };
  }
}

export class AddWikiSourceTool implements LocalTool {
  readonly definition = {
    name: "wiki.source.add",
    description: "Registers a source file from inside the local workspace.",
  };

  constructor(private readonly workspace: Workspace) {}

  async execute(call: ToolCall): Promise<ToolResult> {
    const source = await addWikiSource(this.workspace, {
      path: requiredInput(call, "path"),
      title: requiredInput(call, "title"),
    });
    return { name: this.definition.name, output: source };
  }
}

export class LintWikiTool implements LocalTool {
  readonly definition = {
    name: "wiki.lint",
    description: "Runs deterministic LLM Wiki lint checks.",
  };

  constructor(private readonly workspace: Workspace) {}

  async execute(_call: ToolCall): Promise<ToolResult> {
    return { name: this.definition.name, output: await lintWiki(this.workspace) };
  }
}

export class PrepareWikiIngestTool implements LocalTool {
  readonly definition = {
    name: "wiki.ingest.prepare",
    description: "Creates a source ingest task packet for the LLM Wiki.",
  };

  constructor(private readonly workspace: Workspace) {}

  async execute(call: ToolCall): Promise<ToolResult> {
    const packet = await prepareWikiIngest(this.workspace, requiredInput(call, "sourceId"));
    return { name: this.definition.name, output: packet };
  }
}

export class PrepareWikiQueryTool implements LocalTool {
  readonly definition = {
    name: "wiki.query.prepare",
    description: "Creates a query task packet from relevant LLM Wiki pages.",
  };

  constructor(private readonly workspace: Workspace) {}

  async execute(call: ToolCall): Promise<ToolResult> {
    const packet = await prepareWikiQuery(this.workspace, requiredInput(call, "question"));
    return { name: this.definition.name, output: packet };
  }
}

export class PrepareWikiEvolveTool implements LocalTool {
  readonly definition = {
    name: "wiki.evolve.prepare",
    description: "Creates a manual or automated self-evolution task packet for the LLM Wiki.",
  };

  constructor(private readonly workspace: Workspace) {}

  async execute(_call: ToolCall): Promise<ToolResult> {
    const packet = await prepareWikiEvolve(this.workspace);
    return { name: this.definition.name, output: packet };
  }
}

export class RecordWikiRunTool implements LocalTool {
  readonly definition = {
    name: "wiki.run.record",
    description: "Records an agent run under the local LLM Wiki raw run log.",
  };

  constructor(private readonly workspace: Workspace) {}

  async execute(call: ToolCall): Promise<ToolResult> {
    const run = await recordWikiRun(this.workspace, wikiRunInput(call));
    return { name: this.definition.name, output: run };
  }
}

export class ProposeWikiAnswerTool implements LocalTool {
  readonly definition = {
    name: "wiki.answer.propose",
    description: "Prepares a source-backed answer proposal without changing the live wiki.",
  };

  constructor(private readonly workspace: Workspace) {}

  async execute(call: ToolCall): Promise<ToolResult> {
    const result = await prepareWikiAnswerProposal(this.workspace, wikiAnswerProposalInput(call));
    return { name: this.definition.name, output: result };
  }
}

export function createWorkspaceTools(workspace: Workspace): LocalTool[] {
  return [new EchoTool(), ...createWikiTools(workspace)];
}

export function createWikiTools(workspace: Workspace): LocalTool[] {
  return [
    new InitWikiTool(workspace),
    new LintWikiTool(workspace),
    new PrepareWikiIngestTool(workspace),
    new PrepareWikiQueryTool(workspace),
    new PrepareWikiEvolveTool(workspace),
    new RecordWikiRunTool(workspace),
    new ProposeWikiAnswerTool(workspace),
  ];
}

function wikiRunInput(call: ToolCall) {
  return {
    task: requiredInput(call, "task"),
    input: requiredInput(call, "input"),
    output: requiredInput(call, "output"),
  };
}

function wikiAnswerProposalInput(call: ToolCall) {
  const title = optionalInput(call, "title");
  const input = {
    question: requiredInput(call, "question"),
    summary: requiredInput(call, "summary"),
    acceptedClaims: acceptedClaimList(call),
  };
  return title === undefined ? input : { ...input, title };
}

function acceptedClaimList(call: ToolCall): { text: string; source: string }[] {
  const value = call.input.acceptedClaims;
  if (!Array.isArray(value) || value.length === 0) {
    throw new Error(`${call.name} requires acceptedClaims`);
  }
  return value.map((claim) => acceptedClaim(call, claim));
}

function acceptedClaim(call: ToolCall, value: unknown): { text: string; source: string } {
  if (typeof value !== "object" || value === null) {
    throw new Error(`${call.name} acceptedClaims require text and source`);
  }
  const claim = value as Record<string, unknown>;
  return {
    text: requiredValue(call, claim, "text"),
    source: requiredValue(call, claim, "source"),
  };
}

function requiredValue(call: ToolCall, value: Record<string, unknown>, key: string): string {
  const field = value[key];
  if (typeof field !== "string" || field.trim().length === 0) {
    throw new Error(`${call.name} acceptedClaims require ${key}`);
  }
  return field;
}

function requiredInput(call: ToolCall, key: string): string {
  const value = call.input[key];
  if (typeof value !== "string" || value.trim().length === 0) {
    throw new Error(`${call.name} requires ${key}`);
  }
  return value;
}

function optionalInput(call: ToolCall, key: string): string | undefined {
  const value = call.input[key];
  return typeof value === "string" && value.trim().length > 0 ? value : undefined;
}
