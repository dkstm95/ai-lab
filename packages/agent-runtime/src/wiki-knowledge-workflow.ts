import {
  type WikiKnowledgeContext,
  prepareWikiKnowledgeContext,
  validateCurrentWikiKnowledgeContext,
} from "@ai-lab/wiki";
import type { Workspace } from "@ai-lab/workspace";

export class WikiKnowledgeWorkflow {
  constructor(private readonly workspace: Workspace) {}

  async prepareContext(query: string, now: Date = new Date()): Promise<WikiKnowledgeContext> {
    return prepareWikiKnowledgeContext(this.workspace, query, now);
  }

  async validateContext(value: unknown, now: Date = new Date()): Promise<WikiKnowledgeContext> {
    return validateCurrentWikiKnowledgeContext(this.workspace, value, now);
  }
}
