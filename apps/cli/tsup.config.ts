import { defineConfig } from "tsup";

export default defineConfig({
  entry: ["src/index.ts"],
  format: ["esm"],
  dts: true,
  noExternal: [
    "@ai-lab/agent-runtime",
    "@ai-lab/workspace",
    "@ai-lab/protocol",
    "@ai-lab/model-providers",
    "@ai-lab/local-tools",
    "@ai-lab/config",
  ],
});
