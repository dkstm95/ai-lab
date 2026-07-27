import { type ChildProcessWithoutNullStreams, spawn } from "node:child_process";
import { TextDecoder } from "node:util";
import type { NormalizedSubscriptionRunnerConfig, SubscriptionLauncher } from "./profile.js";

export interface TargetFile {
  readonly requestedPath: string;
  readonly realpath: string;
  readonly sha256: string;
}

export interface TargetProcessContext {
  readonly config: NormalizedSubscriptionRunnerConfig;
  readonly target: TargetFile;
  readonly stateRealpath: string;
  readonly cwd: string;
}

export interface TargetInvocation {
  readonly args: readonly string[];
  readonly input?: string;
  readonly timeoutMs?: number;
}

const maxOutputBytes = 1_100_000;

export async function invokeSubscriptionTarget(
  context: TargetProcessContext,
  invocation: TargetInvocation,
): Promise<string> {
  const command = targetCommand(context.config.launcher, context.target.realpath, invocation.args);
  const child = spawn(command.executable, command.args, {
    cwd: context.cwd,
    env: targetEnvironment(context),
    shell: false,
    windowsHide: true,
  });
  const output = await collectTargetOutput(
    child,
    invocation.input,
    invocation.timeoutMs ?? context.config.targetTimeoutMs,
  );
  return decodeTargetOutput(output);
}

function targetCommand(
  launcher: SubscriptionLauncher,
  target: string,
  args: readonly string[],
): { executable: string; args: string[] } {
  if (launcher === "node") {
    return { executable: process.execPath, args: [target, ...args] };
  }
  return { executable: target, args: [...args] };
}

function targetEnvironment(context: TargetProcessContext): NodeJS.ProcessEnv {
  const environment = {
    [context.config.profile === "codex" ? "CODEX_HOME" : "CLAUDE_CONFIG_DIR"]:
      context.stateRealpath,
    HOME: `${context.cwd}/home`,
    LANG: "C.UTF-8",
    LC_ALL: "C.UTF-8",
    TERM: "dumb",
    NO_COLOR: "1",
    TMPDIR: context.cwd,
  };
  return context.config.profile === "codex"
    ? { ...environment, CODEX_SQLITE_HOME: `${context.cwd}/state` }
    : { ...environment, ENABLE_CLAUDEAI_MCP_SERVERS: "false" };
}

function collectTargetOutput(
  child: ChildProcessWithoutNullStreams,
  input: string | undefined,
  timeoutMs: number,
): Promise<Buffer> {
  const collector = new TargetOutputCollector(child, timeoutMs);
  captureTargetStream(child.stdout, "stdout", collector);
  captureTargetStream(child.stderr, "stderr", collector);
  child.once("error", () => collector.fail(new Error("Subscription target failed")));
  child.once("close", (code, signal) => collector.close(code, signal));
  writeTargetInput(child, input);
  return collector.result();
}

function captureTargetStream(
  stream: NodeJS.ReadableStream,
  name: "stdout" | "stderr",
  collector: TargetOutputCollector,
): void {
  stream.on("data", (value: Buffer | string) => collector.capture(name, value));
  stream.on("error", () => collector.fail(new Error(`Subscription target ${name} failed`)));
}

function writeTargetInput(child: ChildProcessWithoutNullStreams, input?: string): void {
  child.stdin.on("error", () => undefined);
  child.stdin.end(input);
}

function targetExitError(code: number | null, signal: NodeJS.Signals | null): Error | undefined {
  if (signal !== null) {
    return new Error(`Subscription target terminated by signal ${signal}`);
  }
  return code === 0 ? undefined : new Error(`Subscription target exited with code ${String(code)}`);
}

function terminateTarget(child: ChildProcessWithoutNullStreams): void {
  try {
    child.kill("SIGKILL");
  } catch {
    // The process already exited.
  }
  child.stdin.destroy();
  child.stdout.destroy();
  child.stderr.destroy();
  child.unref();
}

class TargetOutputCollector {
  private readonly output: Buffer[] = [];
  private readonly sizes = { stdout: 0, stderr: 0 };
  private readonly completion: Promise<Buffer>;
  private readonly timer: NodeJS.Timeout;
  private resolve!: (value: Buffer) => void;
  private reject!: (error: Error) => void;
  private settled = false;

  constructor(
    private readonly child: ChildProcessWithoutNullStreams,
    timeoutMs: number,
  ) {
    this.completion = new Promise((resolve, reject) => {
      this.resolve = resolve;
      this.reject = reject;
    });
    this.timer = setTimeout(() => this.fail(new Error("Subscription target timed out")), timeoutMs);
  }

  result(): Promise<Buffer> {
    return this.completion;
  }

  capture(name: "stdout" | "stderr", value: Buffer | string): void {
    const chunk = Buffer.isBuffer(value) ? value : Buffer.from(value);
    this.sizes[name] += chunk.length;
    if (this.sizes[name] > maxOutputBytes) {
      this.fail(new Error(`Subscription target ${name} exceeds ${maxOutputBytes} bytes`));
    } else if (name === "stdout") {
      this.output.push(chunk);
    }
  }

  close(code: number | null, signal: NodeJS.Signals | null): void {
    this.settle(targetExitError(code, signal));
  }

  fail(error: Error): void {
    if (this.settled) return;
    this.settle(error);
    terminateTarget(this.child);
  }

  private settle(error?: Error): void {
    if (this.settled) return;
    this.settled = true;
    clearTimeout(this.timer);
    if (error === undefined) this.resolve(Buffer.concat(this.output));
    else this.reject(error);
  }
}

function decodeTargetOutput(output: Buffer | string | null): string {
  const value = typeof output === "string" ? Buffer.from(output) : (output ?? Buffer.alloc(0));
  try {
    return new TextDecoder("utf-8", { fatal: true }).decode(value);
  } catch {
    throw new Error("Subscription target stdout is not valid UTF-8");
  }
}
