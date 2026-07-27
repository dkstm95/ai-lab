import { type ExternalRunnerConfig, ExternalRunnerModelProvider } from "@ai-lab/model-providers";
import {
  type AddWikiSourceInput,
  type PrepareWikiAnswerTaskInput,
  type WikiAnswerResult,
  type WikiAnswerTask,
  type WikiApplyResult,
  type WikiProposal,
  type WikiSnapshot,
  type WikiSource,
  addWikiSource,
  applyWikiProposal,
  initWiki,
  parseWikiAnswerResultForTask,
  parseWikiProposal,
  prepareWikiAnswerProposalFromTask,
  prepareWikiAnswerTask,
  validateCurrentWikiAnswerTask,
} from "@ai-lab/wiki";
import type { Workspace } from "@ai-lab/workspace";

export interface ApplyReviewedWikiProposalInput {
  readonly acceptedDigest: string;
  readonly reviewedBy: string;
  readonly reviewedAt?: Date;
}

export interface WikiAnswerRunnerResult {
  readonly result: WikiAnswerResult;
  readonly runner: {
    readonly id: string;
  };
}

export interface WikiAnswerRunnerOptions {
  readonly signal?: AbortSignal;
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

  async validateTask(value: unknown): Promise<WikiAnswerTask> {
    return validateCurrentWikiAnswerTask(this.workspace, value);
  }

  async runTaskWithExternalRunner(
    taskValue: unknown,
    config: ExternalRunnerConfig,
    options: WikiAnswerRunnerOptions = {},
  ): Promise<WikiAnswerRunnerResult> {
    const provider = new ExternalRunnerModelProvider(config);
    const task = await this.validateTask(taskValue);
    const result = await runExternalWikiTask(provider, task, options.signal);
    await this.validateTask(task);
    return { result, runner: { id: provider.provider } };
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

async function runExternalWikiTask(
  provider: ExternalRunnerModelProvider,
  task: WikiAnswerTask,
  signal?: AbortSignal,
): Promise<WikiAnswerResult> {
  const response = await provider.generate(
    runnerRequest(task),
    runnerProfile(provider.provider),
    signal,
  );
  return parseWikiAnswerResultForTask(task, runnerOutput(response.output));
}

function runnerRequest(task: WikiAnswerTask) {
  return {
    task: "reasoning" as const,
    messages: [{ role: "user" as const, content: task.prompt }],
  };
}

function runnerProfile(provider: string) {
  return {
    task: "reasoning" as const,
    kind: "external-runner" as const,
    provider,
  };
}

function runnerOutput(output: string): unknown {
  try {
    return JSON.parse(output);
  } catch {
    throw new Error("External runner returned an invalid Wiki answer JSON object");
  }
}
