import {
  type PrepareWikiRebuildTaskInput,
  type WikiRebuildApplyResult,
  type WikiRebuildReport,
  type WikiRebuildTask,
  applyWikiRebuild,
  parseWikiRebuildReport,
  prepareWikiRebuildReport,
  prepareWikiRebuildTask,
  validateCurrentWikiRebuildTask,
} from "@ai-lab/wiki";
import type { Workspace } from "@ai-lab/workspace";

export interface ApplyReviewedWikiRebuildInput {
  readonly task: unknown;
  readonly result: unknown;
  readonly report: unknown;
  readonly acceptedDigest: string;
  readonly reviewedBy: string;
  readonly reviewedAt?: Date;
}

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

  async applyReviewed(
    input: ApplyReviewedWikiRebuildInput,
    now: Date = new Date(),
  ): Promise<WikiRebuildApplyResult> {
    const report = parseWikiRebuildReport(input.report);
    const appliedAt = new Date(now.getTime());
    const reviewedAt = new Date(input.reviewedAt?.getTime() ?? appliedAt.getTime());
    return applyWikiRebuild(
      this.workspace,
      {
        task: input.task,
        result: input.result,
        report,
        approval: {
          reportId: report.id,
          digest: input.acceptedDigest,
          accepted: true,
          reviewedBy: input.reviewedBy,
          reviewedAt: reviewedAt.toISOString(),
        },
      },
      appliedAt,
    );
  }
}
