module.exports = {
  forbidden: [
    {
      name: "protocol-no-internal-or-runtime-deps",
      severity: "error",
      from: { path: "^packages/protocol/src" },
      to: {
        path: "^(packages/(config|model-providers|agent-runtime|workspace|local-tools)|apps/|node:fs|node:child_process|hono|@modelcontextprotocol|openai|@anthropic-ai)",
      },
    },
    {
      name: "config-only-depends-on-protocol",
      severity: "error",
      from: { path: "^packages/config/src" },
      to: { path: "^packages/(model-providers|agent-runtime|workspace|local-tools)/src" },
    },
    {
      name: "workspace-does-not-know-agent-or-tools",
      severity: "error",
      from: { path: "^packages/workspace/src" },
      to: { path: "^packages/(agent-runtime|local-tools|model-providers)/src" },
    },
    {
      name: "local-tools-does-not-know-agent",
      severity: "error",
      from: { path: "^packages/local-tools/src" },
      to: { path: "^packages/(agent-runtime|model-providers)/src" },
    },
    {
      name: "agent-runtime-does-not-know-apps",
      severity: "error",
      from: { path: "^packages/agent-runtime/src" },
      to: { path: "^apps/" },
    },
    {
      name: "apps-do-not-import-vendor-sdks",
      severity: "error",
      from: { path: "^apps/" },
      to: { path: "^(openai|@anthropic-ai|@google/generative-ai|@modelcontextprotocol)" },
    },
  ],
  options: {
    doNotFollow: { path: "node_modules" },
    tsPreCompilationDeps: true,
    tsConfig: { fileName: "tsconfig.json" },
  },
};
