import { describe, expect, it } from "vitest";
import {
  agentRunRequestSchema,
  modelProfileSchema,
  modelRequestSchema,
  providerKindSchema,
  toolCallSchema,
} from "../src/index.js";

describe("protocol schemas", () => {
  it("accepts provider kinds needed for API, runner, manual, and fake execution", () => {
    expect(providerKindSchema.options).toContain("api");
    expect(providerKindSchema.options).toContain("external-runner");
    expect(providerKindSchema.options).toContain("manual");
    expect(providerKindSchema.options).toContain("fake");
  });

  it("validates a model profile", () => {
    expect(
      modelProfileSchema.parse({
        task: "code",
        kind: "fake",
        provider: "fake",
        model: "fake-code",
      }),
    ).toMatchObject({ task: "code", kind: "fake" });
  });

  it("applies defaults for common request schemas", () => {
    expect(
      modelRequestSchema.parse({
        messages: [{ role: "user", content: "hello" }],
      }).task,
    ).toBe("general");
    expect(toolCallSchema.parse({ name: "echo" }).input).toEqual({});
  });

  it("rejects empty agent run input", () => {
    expect(() => agentRunRequestSchema.parse({ task: "general", input: "" })).toThrow();
  });
});
