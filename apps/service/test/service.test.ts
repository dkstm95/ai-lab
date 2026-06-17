import { describe, expect, it } from "vitest";
import { createApp } from "../src/index.js";

describe("service", () => {
  it("responds to health checks", async () => {
    const response = await createApp().request("/health");
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ status: "ok" });
  });

  it("runs hello through the fake provider", async () => {
    const response = await createApp().request("/agent/hello", {
      method: "POST",
      body: JSON.stringify({ input: "hello service" }),
      headers: { "content-type": "application/json" },
    });

    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.output).toBe("[fake:fake-general] hello service");
  });

  it("uses default input when hello receives invalid JSON", async () => {
    const response = await createApp().request("/agent/hello", {
      method: "POST",
      body: "{",
      headers: { "content-type": "application/json" },
    });

    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.output).toBe("[fake:fake-general] hello");
  });
});
