import { describe, expect, it } from "vitest";
import { loadConfig, profileForTask } from "../src/index.js";

describe("config", () => {
  it("loads without API keys", () => {
    const config = loadConfig({ AI_LAB_WORKSPACE_ROOT: "/tmp/ai-lab-test" });
    expect(config.workspaceRoot).toBe("/tmp/ai-lab-test");
    expect(profileForTask(config.profiles, "general").kind).toBe("fake");
  });

  it("uses process cwd and default service port when env is empty", () => {
    const config = loadConfig({});

    expect(config.workspaceRoot).toBe(process.cwd());
    expect(config.servicePort).toBe(3000);
  });

  it("falls back to the general profile for unknown task-specific routing", () => {
    const profile = profileForTask(
      [{ task: "general", kind: "fake", provider: "fake", model: "fake-general" }],
      "code",
    );

    expect(profile.model).toBe("fake-general");
  });

  it("fails when no general fallback profile exists", () => {
    expect(() => profileForTask([], "code")).toThrow("No general model profile is configured");
  });
});
