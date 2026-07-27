import { defineConfig } from "tsup";

export default defineConfig({
  entry: ["src/index.ts", "src/subscription-runner.ts"],
  format: ["esm"],
  splitting: false,
  clean: true,
  noExternal: ["@ai-lab/protocol", "zod"],
});
