import { createDefaultAgentRuntime } from "@ai-lab/agent-runtime";
import { createDefaultWorkspace, createWorkspace } from "@ai-lab/workspace";
import { serve } from "@hono/node-server";
import { Hono } from "hono";

export function createApp(root?: string): Hono {
  const app = new Hono();
  const workspace = root === undefined ? createDefaultWorkspace() : createWorkspace(root);
  const runtime = createDefaultAgentRuntime();

  registerHealthRoute(app);
  void workspace;
  registerAgentRoutes(app, runtime);
  return app;
}

function registerHealthRoute(app: Hono): void {
  app.get("/health", (context) => context.json({ status: "ok" }));
}

function registerAgentRoutes(
  app: Hono,
  runtime: ReturnType<typeof createDefaultAgentRuntime>,
): void {
  app.post("/agent/hello", async (context) => {
    const body = await context.req.json<{ input?: string }>().catch((): { input?: string } => ({}));
    const result = await runtime.run({ task: "general", input: body.input ?? "hello" });
    return context.json(result);
  });
}

/* v8 ignore next 5 */
if (import.meta.url === `file://${process.argv[1]}`) {
  const port = Number(process.env.AI_LAB_SERVICE_PORT ?? 3000);
  serve({ fetch: createApp().fetch, port });
  console.log(`ai-lab service listening on http://localhost:${port}`);
}
