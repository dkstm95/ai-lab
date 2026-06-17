import { type ModelProfile, type ModelTask, modelProfileSchema } from "@ai-lab/protocol";
import { z } from "zod";

export const labConfigSchema = z.object({
  workspaceRoot: z.string().min(1).default(process.cwd()),
  servicePort: z.coerce.number().int().positive().default(3000),
  profiles: z.array(modelProfileSchema).default([
    { task: "general", kind: "fake", provider: "fake", model: "fake-general" },
    { task: "code", kind: "fake", provider: "fake", model: "fake-code" },
    { task: "reasoning", kind: "fake", provider: "fake", model: "fake-reasoning" },
    { task: "cheap", kind: "fake", provider: "fake", model: "fake-cheap" },
    { task: "creative", kind: "fake", provider: "fake", model: "fake-creative" },
  ]),
});

export type LabConfig = z.infer<typeof labConfigSchema>;

export function loadConfig(env: NodeJS.ProcessEnv = process.env): LabConfig {
  const workspaceRoot = env.AI_LAB_WORKSPACE_ROOT ?? process.cwd();
  const servicePort = env.AI_LAB_SERVICE_PORT ?? 3000;
  return labConfigSchema.parse({ workspaceRoot, servicePort });
}

export function profileForTask(profiles: readonly ModelProfile[], task: ModelTask): ModelProfile {
  const matching = profiles.find((profile) => profile.task === task);
  if (matching) {
    return matching;
  }
  const fallback = profiles.find((profile) => profile.task === "general");
  if (!fallback) {
    throw new Error("No general model profile is configured");
  }
  return fallback;
}
