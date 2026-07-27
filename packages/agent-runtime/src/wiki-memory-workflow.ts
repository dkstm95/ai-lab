import {
  type WikiMemoryContext,
  type WikiMemoryEvaluationRecord,
  type WikiMemoryEvaluationSummary,
  prepareWikiMemoryContext,
  recordWikiMemoryEvaluation,
  summarizeWikiMemoryEvaluations,
  validateCurrentWikiMemoryContext,
} from "@ai-lab/wiki";
import type { Workspace } from "@ai-lab/workspace";

export class WikiMemoryWorkflow {
  constructor(private readonly workspace: Workspace) {}

  async prepareContext(query: string, now: Date = new Date()): Promise<WikiMemoryContext> {
    return prepareWikiMemoryContext(this.workspace, query, now);
  }

  async validateContext(value: unknown, now: Date = new Date()): Promise<WikiMemoryContext> {
    return validateCurrentWikiMemoryContext(this.workspace, value, now);
  }

  async recordEvaluation(
    task: unknown,
    input: unknown,
    now: Date = new Date(),
  ): Promise<WikiMemoryEvaluationRecord> {
    return recordWikiMemoryEvaluation(this.workspace, task, input, now);
  }

  async summarizeEvaluations(): Promise<WikiMemoryEvaluationSummary> {
    return summarizeWikiMemoryEvaluations(this.workspace);
  }
}
