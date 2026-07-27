import {
  type PrepareWikiRebuildTaskInput,
  type WikiRebuildReport,
  type WikiRebuildTask,
  parseWikiRebuildReport,
  prepareWikiRebuildReport,
  prepareWikiRebuildTask,
  validateCurrentWikiRebuildTask,
} from "@ai-lab/wiki";
import type { Workspace } from "@ai-lab/workspace";

export class WikiRebuildWorkflow {
  constructor(private readonly workspace: Workspace) {}

  async prepareTask(
    input: PrepareWikiRebuildTaskInput,
    now: Date = new Date(),
  ): Promise<WikiRebuildTask> {
    return prepareWikiRebuildTask(this.workspace, input, now);
  }

  async validateTask(value: unknown): Promise<WikiRebuildTask> {
    return validateCurrentWikiRebuildTask(this.workspace, value);
  }

  async prepareReport(task: unknown, result: unknown): Promise<WikiRebuildReport> {
    return prepareWikiRebuildReport(this.workspace, task, result);
  }

  reviewReport(value: unknown): WikiRebuildReport {
    return parseWikiRebuildReport(value);
  }
}
