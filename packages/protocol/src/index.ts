import { z } from "zod";

export const providerKindSchema = z.enum(["api", "external-runner", "manual", "fake"]);
export type ProviderKind = z.infer<typeof providerKindSchema>;

export const modelTaskSchema = z.enum(["general", "code", "reasoning", "cheap", "creative"]);
export type ModelTask = z.infer<typeof modelTaskSchema>;

export const modelProfileSchema = z.object({
  task: modelTaskSchema,
  kind: providerKindSchema,
  provider: z.string().min(1),
  model: z.string().min(1).optional(),
});
export type ModelProfile = z.infer<typeof modelProfileSchema>;

export const modelMessageSchema = z.object({
  role: z.enum(["system", "user", "assistant", "tool"]),
  content: z.string(),
});
export type ModelMessage = z.infer<typeof modelMessageSchema>;

export const modelRequestSchema = z.object({
  task: modelTaskSchema.default("general"),
  messages: z.array(modelMessageSchema).min(1),
});
export type ModelRequest = z.infer<typeof modelRequestSchema>;

export const modelResponseSchema = z.object({
  profile: modelProfileSchema,
  output: z.string(),
  metadata: z.record(z.string(), z.unknown()).default({}),
});
export type ModelResponse = z.infer<typeof modelResponseSchema>;

export const toolDefinitionSchema = z.object({
  name: z.string().min(1),
  description: z.string().min(1),
});
export type ToolDefinition = z.infer<typeof toolDefinitionSchema>;

export const toolCallSchema = z.object({
  name: z.string().min(1),
  input: z.record(z.string(), z.unknown()).default({}),
});
export type ToolCall = z.infer<typeof toolCallSchema>;

export const toolResultSchema = z.object({
  name: z.string().min(1),
  output: z.unknown(),
});
export type ToolResult = z.infer<typeof toolResultSchema>;

export const agentRunRequestSchema = z.object({
  input: z.string().min(1),
  task: modelTaskSchema.default("general"),
});
export type AgentRunRequest = z.infer<typeof agentRunRequestSchema>;

export const agentRunResultSchema = z.object({
  output: z.string(),
  model: modelResponseSchema,
  tools: z.array(toolResultSchema).default([]),
});
export type AgentRunResult = z.infer<typeof agentRunResultSchema>;

export const ideaDocumentMetadataSchema = z.object({
  title: z.string().min(1),
  slug: z.string().min(1),
  source: z.string().optional(),
  createdAt: z.string().datetime(),
});
export type IdeaDocumentMetadata = z.infer<typeof ideaDocumentMetadataSchema>;
