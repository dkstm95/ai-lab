import {
  type WikiReflectionTask,
  prepareWikiReflectionTask,
  validateCurrentWikiReflectionTask,
} from "@ai-lab/wiki";
import type { Workspace } from "@ai-lab/workspace";

export class WikiReflectionWorkflow {
  constructor(private readonly workspace: Workspace) {}

  async prepareTask(input: unknown): Promise<WikiReflectionTask> {
    return prepareWikiReflectionTask(this.workspace, input);
  }

  async validateTask(value: unknown): Promise<WikiReflectionTask> {
    return validateCurrentWikiReflectionTask(this.workspace, value);
  }
}
