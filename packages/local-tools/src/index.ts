import type { ToolCall, ToolDefinition, ToolResult } from "@ai-lab/protocol";
import { type Workspace, createIdea, listIdeas } from "@ai-lab/workspace";

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

export class CreateIdeaTool implements LocalTool {
  readonly definition = {
    name: "createIdea",
    description: "Creates an idea markdown document in the workspace.",
  };

  constructor(private readonly workspace: Workspace) {}

  async execute(call: ToolCall): Promise<ToolResult> {
    const title = String(call.input.title ?? "");
    if (title.trim().length === 0) {
      throw new Error("createIdea requires a title");
    }
    const idea = await createIdea(this.workspace, ideaInput(title, call));
    return {
      name: this.definition.name,
      output: idea.metadata,
    };
  }
}

export class ListIdeasTool implements LocalTool {
  readonly definition = {
    name: "listIdeas",
    description: "Lists idea markdown documents from the workspace.",
  };

  constructor(private readonly workspace: Workspace) {}

  async execute(_call: ToolCall): Promise<ToolResult> {
    const ideas = await listIdeas(this.workspace);
    return {
      name: this.definition.name,
      output: ideas.map((idea) => idea.metadata),
    };
  }
}

export function createWorkspaceTools(workspace: Workspace): LocalTool[] {
  return [new EchoTool(), new CreateIdeaTool(workspace), new ListIdeasTool(workspace)];
}

function ideaInput(title: string, call: ToolCall) {
  const source = call.input.source === undefined ? undefined : String(call.input.source);
  const notes = call.input.notes === undefined ? undefined : String(call.input.notes);
  return {
    title,
    ...(source === undefined ? {} : { source }),
    ...(notes === undefined ? {} : { notes }),
  };
}
