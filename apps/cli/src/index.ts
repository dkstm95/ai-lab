import { createDefaultAgentRuntime } from "@ai-lab/agent-runtime";
import {
  type Workspace,
  createDefaultWorkspace,
  createIdea,
  createWorkspace,
  listIdeas,
} from "@ai-lab/workspace";
import { type CAC, cac } from "cac";

export async function runCli(argv: string[], root?: string): Promise<void> {
  const cli = cac("ai-lab");
  const workspace = root === undefined ? createDefaultWorkspace() : createWorkspace(root);

  registerIdeaCommand(cli, workspace);
  registerRunCommand(cli);
  cli.help();
  cli.parse(normalizeArgv(argv), { run: false });
  await cli.runMatchedCommand();
}

interface IdeaOptions {
  readonly source?: string;
  readonly notes?: string;
}

function registerIdeaCommand(cli: CAC, workspace: Workspace): void {
  cli
    .command("idea <action> [title]", "Add or list idea markdown documents")
    .option("--source <source>", "Source URL or reference")
    .option("--notes <notes>", "Initial notes")
    .action((action: string, title: string | undefined, options: IdeaOptions) =>
      handleIdeaCommand(workspace, action, title, options),
    );
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

async function handleIdeaCommand(
  workspace: Workspace,
  action: string,
  title: string | undefined,
  options: IdeaOptions,
): Promise<void> {
  if (action === "list") {
    await printIdeas(workspace);
    return;
  }
  if (action !== "add" || title === undefined) {
    throw new Error("Use `idea add <title>` or `idea list`");
  }
  const idea = await createIdea(workspace, ideaInput(title, options));
  console.log(`created ${idea.metadata.slug}`);
}

async function printIdeas(workspace: Workspace): Promise<void> {
  const ideas = await listIdeas(workspace);
  for (const idea of ideas) {
    console.log(`${idea.metadata.slug}\t${idea.metadata.title}`);
  }
}

function ideaInput(title: string, options: IdeaOptions) {
  return {
    title,
    ...(options.source === undefined ? {} : { source: options.source }),
    ...(options.notes === undefined ? {} : { notes: options.notes }),
  };
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
