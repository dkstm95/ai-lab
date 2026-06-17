import { profileForTask } from "@ai-lab/config";
import type { ModelProfile, ModelRequest, ModelResponse, ModelTask } from "@ai-lab/protocol";

export interface ModelProvider {
  readonly kind: ModelProfile["kind"];
  readonly provider: string;
  generate(request: ModelRequest, profile: ModelProfile): Promise<ModelResponse>;
}

export class FakeModelProvider implements ModelProvider {
  readonly kind = "fake";
  readonly provider = "fake";

  async generate(request: ModelRequest, profile: ModelProfile): Promise<ModelResponse> {
    const lastUserMessage = [...request.messages]
      .reverse()
      .find((message) => message.role === "user");
    const input = lastUserMessage?.content ?? "";
    return {
      profile,
      output: `[fake:${profile.model ?? profile.task}] ${input}`,
      metadata: {
        deterministic: true,
      },
    };
  }
}

export class ModelRouter {
  private readonly providers: readonly ModelProvider[];
  private readonly profiles: readonly ModelProfile[];

  constructor(args: { providers: readonly ModelProvider[]; profiles: readonly ModelProfile[] }) {
    this.providers = args.providers;
    this.profiles = args.profiles;
  }

  async generate(request: ModelRequest): Promise<ModelResponse> {
    const profile = profileForTask(this.profiles, request.task);
    const provider = this.providers.find(
      (candidate) => candidate.kind === profile.kind && candidate.provider === profile.provider,
    );
    if (!provider) {
      throw new Error(`No model provider registered for ${profile.kind}:${profile.provider}`);
    }
    return provider.generate(request, profile);
  }
}

export function createDefaultModelRouter(profiles: readonly ModelProfile[]): ModelRouter {
  return new ModelRouter({
    profiles,
    providers: [new FakeModelProvider()],
  });
}

export function createFakeModelProfiles(): ModelProfile[] {
  const tasks: ModelTask[] = ["general", "code", "reasoning", "cheap", "creative"];
  return tasks.map((task) => ({
    task,
    kind: "fake",
    provider: "fake",
    model: `fake-${task}`,
  }));
}
