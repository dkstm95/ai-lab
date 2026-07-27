import {
  type AddWikiSourceInput,
  type PrepareWikiAnswerTaskInput,
  type WikiApplyResult,
  type WikiProposal,
  type WikiSnapshot,
  type WikiSource,
  addWikiSource,
  applyWikiProposal,
  initWiki,
  parseWikiProposal,
  prepareWikiAnswerProposalFromTask,
  prepareWikiAnswerTask,
} from "@ai-lab/wiki";
import type { Workspace } from "@ai-lab/workspace";

export interface ApplyReviewedWikiProposalInput {
  readonly acceptedDigest: string;
  readonly reviewedBy: string;
  readonly reviewedAt?: Date;
}

export class WikiAnswerWorkflow {
  constructor(private readonly workspace: Workspace) {}

  async initialize(): Promise<WikiSnapshot> {
    return initWiki(this.workspace);
  }

  async addSource(input: AddWikiSourceInput): Promise<WikiSource> {
    return addWikiSource(this.workspace, input);
  }

  async prepareTask(input: PrepareWikiAnswerTaskInput) {
    return prepareWikiAnswerTask(this.workspace, input);
  }

  async prepareProposal(
    task: unknown,
    result: unknown,
    now: Date = new Date(),
  ): Promise<WikiProposal> {
    return prepareWikiAnswerProposalFromTask(this.workspace, task, result, now);
  }

  reviewProposal(value: unknown): WikiProposal {
    return parseWikiProposal(value);
  }

  async applyReviewed(
    value: unknown,
    input: ApplyReviewedWikiProposalInput,
    now: Date = new Date(),
  ): Promise<WikiApplyResult> {
    const proposal = parseWikiProposal(value);
    const appliedAt = new Date(now.getTime());
    const reviewedAt = new Date(input.reviewedAt?.getTime() ?? appliedAt.getTime());
    return applyWikiProposal(
      this.workspace,
      proposal,
      {
        proposalId: proposal.id,
        digest: input.acceptedDigest,
        accepted: true,
        reviewedBy: input.reviewedBy,
        reviewedAt: reviewedAt.toISOString(),
      },
      appliedAt,
    );
  }
}
