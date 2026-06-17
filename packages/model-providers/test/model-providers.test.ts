import { describe, expect, it } from "vitest";
import {
  FakeModelProvider,
  ModelRouter,
  createDefaultModelRouter,
  createFakeModelProfiles,
} from "../src/index.js";

describe("model providers", () => {
  it("routes a task to the configured fake provider", async () => {
    const router = new ModelRouter({
      providers: [new FakeModelProvider()],
      profiles: [{ task: "code", kind: "fake", provider: "fake", model: "fake-code" }],
    });

    const result = await router.generate({
      task: "code",
      messages: [{ role: "user", content: "write code" }],
    });

    expect(result.output).toBe("[fake:fake-code] write code");
  });

  it("uses the default fake profiles for every supported task", async () => {
    const router = createDefaultModelRouter(createFakeModelProfiles());

    const result = await router.generate({
      task: "reasoning",
      messages: [{ role: "user", content: "think" }],
    });

    expect(result.output).toBe("[fake:fake-reasoning] think");
  });

  it("returns an empty response when no user message exists", async () => {
    const provider = new FakeModelProvider();

    const result = await provider.generate(
      {
        task: "general",
        messages: [{ role: "system", content: "system prompt" }],
      },
      { task: "general", kind: "fake", provider: "fake" },
    );

    expect(result.output).toBe("[fake:general] ");
  });

  it("fails when no provider matches the selected profile", async () => {
    const router = new ModelRouter({
      providers: [],
      profiles: [{ task: "general", kind: "fake", provider: "fake", model: "fake-general" }],
    });

    await expect(
      router.generate({
        task: "general",
        messages: [{ role: "user", content: "hello" }],
      }),
    ).rejects.toThrow("No model provider registered");
  });
});
