import { createDefaultAgentRuntime } from "@ai-lab/agent-runtime";
import { type CAC, cac } from "cac";

export async function runCli(argv: string[], root?: string): Promise<void> {
  const cli = cac("ai-lab");
  void root;

  registerRunCommand(cli);
  cli.help();
  cli.parse(normalizeArgv(argv), { run: false });
  await cli.runMatchedCommand();
}

function registerRunCommand(cli: CAC): void {
  cli
    .command("run <target> [input]", "Run a deterministic hello agent flow")
    .action(async (target: string, input?: string) => {
      if (target !== "hello") {
        throw new Error("Only `run hello [input]` is available");
      }
      const runtime = createDefaultAgentRuntime();
      const result = await runtime.run({ task: "general", input: input ?? "hello" });
      console.log(result.output);
    });
}

function normalizeArgv(argv: string[]): string[] {
  if (argv[2] === "--") {
    return [argv[0] ?? "node", argv[1] ?? "ai-lab", ...argv.slice(3)];
  }
  return argv;
}

/* v8 ignore next 3 */
if (import.meta.url === `file://${process.argv[1]}`) {
  await runCli(process.argv);
}
