import {
  type WikiReflectionApplyResult,
  type WikiReflectionReport,
  type WikiReflectionTask,
  applyWikiReflection,
  parseWikiReflectionReport,
  prepareWikiReflectionReport,
  prepareWikiReflectionTask,
  validateCurrentWikiReflectionTask,
} from "@ai-lab/wiki";
import type { Workspace } from "@ai-lab/workspace";

export interface ApplyReviewedWikiReflectionInput {
  readonly task: unknown;
  readonly result: unknown;
  readonly report: unknown;
  readonly acceptedDigest: string;
  readonly reviewedBy: string;
  readonly reviewedAt?: Date;
}

export class WikiReflectionWorkflow {
  constructor(private readonly workspace: Workspace) {}

  async prepareTask(input: unknown): Promise<WikiReflectionTask> {
    return prepareWikiReflectionTask(this.workspace, input);
  }

  async validateTask(value: unknown): Promise<WikiReflectionTask> {
    return validateCurrentWikiReflectionTask(this.workspace, value);
  }

  async prepareReport(
    task: unknown,
    result: unknown,
    now: Date = new Date(),
  ): Promise<WikiReflectionReport> {
    return prepareWikiReflectionReport(this.workspace, task, result, now);
  }

  reviewReport(value: unknown): WikiReflectionReport {
    return parseWikiReflectionReport(value);
  }

  async applyReviewed(
    input: ApplyReviewedWikiReflectionInput,
    now: Date = new Date(),
  ): Promise<WikiReflectionApplyResult> {
    const report = parseWikiReflectionReport(input.report);
    const appliedAt = new Date(now.getTime());
    const reviewedAt = new Date(input.reviewedAt?.getTime() ?? appliedAt.getTime());
    return applyWikiReflection(
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
