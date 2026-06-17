import { EchoTool } from "@ai-lab/local-tools";
import { FakeModelProvider, ModelRouter } from "@ai-lab/model-providers";
import { describe, expect, it } from "vitest";
import { DefaultAgentRuntime, createDefaultAgentRuntime } from "../src/index.js";

describe("agent runtime", () => {
  it("runs a hello flow through model routing and local tools", async () => {
    const router = new ModelRouter({
      providers: [new FakeModelProvider()],
      profiles: [{ task: "general", kind: "fake", provider: "fake", model: "fake-general" }],
    });
    const runtime = new DefaultAgentRuntime(router, [new EchoTool()]);

    const result = await runtime.run({ task: "general", input: "hello" });

    expect(result.output).toBe("[fake:fake-general] hello");
    expect(result.tools).toEqual([{ name: "echo", output: "agent-runtime-ready" }]);
  });

  it("runs without local tools", async () => {
    const router = new ModelRouter({
      providers: [new FakeModelProvider()],
      profiles: [{ task: "general", kind: "fake", provider: "fake", model: "fake-general" }],
    });
    const runtime = new DefaultAgentRuntime(router);

    const result = await runtime.run({ task: "general", input: "hello" });

    expect(result.tools).toEqual([]);
  });

  it("creates a default runtime backed by fake providers", async () => {
    const runtime = createDefaultAgentRuntime();

    const result = await runtime.run({ task: "creative", input: "draw" });

    expect(result.output).toBe("[fake:fake-creative] draw");
  });
});
