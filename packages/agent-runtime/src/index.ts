import type { LocalTool } from "@ai-lab/local-tools";
import { EchoTool } from "@ai-lab/local-tools";
import {
  type ModelRouter,
  createDefaultModelRouter,
  createFakeModelProfiles,
} from "@ai-lab/model-providers";
import type { AgentRunRequest, AgentRunResult, ToolResult } from "@ai-lab/protocol";

export interface AgentRuntime {
  run(request: AgentRunRequest): Promise<AgentRunResult>;
}

export class DefaultAgentRuntime implements AgentRuntime {
  constructor(
    private readonly router: ModelRouter,
    private readonly tools: readonly LocalTool[] = [],
  ) {}

  async run(request: AgentRunRequest): Promise<AgentRunResult> {
    const toolResults = await this.runSmokeTools();
    const model = await this.router.generate({
      task: request.task,
      messages: [{ role: "user", content: request.input }],
    });
    return {
      output: model.output,
      model,
      tools: toolResults,
    };
  }

  private async runSmokeTools(): Promise<ToolResult[]> {
    const echo = this.tools.find((tool) => tool.definition.name === "echo");
    if (!echo) {
      return [];
    }
    return [await echo.execute({ name: "echo", input: { text: "agent-runtime-ready" } })];
  }
}

export function createDefaultAgentRuntime(): AgentRuntime {
  return new DefaultAgentRuntime(createDefaultModelRouter(createFakeModelProfiles()), [
    new EchoTool(),
  ]);
}
