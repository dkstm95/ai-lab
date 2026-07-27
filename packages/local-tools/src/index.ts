import type { ToolCall, ToolDefinition, ToolResult } from "@ai-lab/protocol";
import {
  addWikiSource,
  initWiki,
  lintWiki,
  prepareWikiAnswerProposalFromTask,
  prepareWikiAnswerTask,
  prepareWikiEvolve,
  prepareWikiIngest,
  prepareWikiQuery,
  prepareWikiReflectionTask,
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

export class PrepareWikiReflectionTool implements LocalTool {
  readonly definition = {
    name: "wiki.reflect.prepare",
    description:
      "Creates a portable reflection task from an explicitly selected local run or summary.",
  };

  constructor(private readonly workspace: Workspace) {}

  async execute(call: ToolCall): Promise<ToolResult> {
    const task = await prepareWikiReflectionTask(this.workspace, call.input);
    return { name: this.definition.name, output: task };
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

export class PrepareWikiAnswerTaskTool implements LocalTool {
  readonly definition = {
    name: "wiki.answer.prepare",
    description: "Creates a portable, source-bound answer task for an LLM Wiki.",
  };

  constructor(private readonly workspace: Workspace) {}

  async execute(call: ToolCall): Promise<ToolResult> {
    const task = await prepareWikiAnswerTask(this.workspace, wikiAnswerTaskInput(call));
    return { name: this.definition.name, output: task };
  }
}

export class ProposeWikiAnswerTool implements LocalTool {
  readonly definition = {
    name: "wiki.answer.propose",
    description: "Prepares a task-bound answer proposal without changing the live wiki.",
  };

  constructor(private readonly workspace: Workspace) {}

  async execute(call: ToolCall): Promise<ToolResult> {
    const result = await prepareWikiAnswerProposalFromTask(
      this.workspace,
      requiredStructuredInput(call, "task"),
      requiredStructuredInput(call, "result"),
    );
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

function wikiAnswerTaskInput(call: ToolCall) {
  const title = optionalInput(call, "title");
  const input = {
    question: requiredInput(call, "question"),
    sourceIds: requiredStringList(call, "sourceIds"),
  };
  return title === undefined ? input : { ...input, title };
}

function requiredStringList(call: ToolCall, key: string): string[] {
  const value = call.input[key];
  if (!Array.isArray(value) || value.length === 0) {
    throw new Error(`${call.name} requires ${key}`);
  }
  return value.map((item) => requiredStringItem(call, key, item));
}

function requiredStringItem(call: ToolCall, key: string, value: unknown): string {
  if (typeof value !== "string" || value.trim().length === 0) {
    throw new Error(`${call.name} requires non-empty ${key}`);
  }
  return value;
}

function requiredStructuredInput(call: ToolCall, key: string): object {
  const value = call.input[key];
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new Error(`${call.name} requires ${key}`);
  }
  return value;
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
