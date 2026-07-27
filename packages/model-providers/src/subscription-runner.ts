#!/usr/bin/env node
import { realpathSync } from "node:fs";
import { basename } from "node:path";
import { fileURLToPath } from "node:url";
import { runSubscriptionRunnerCli } from "./subscription-runner/cli.js";

export {
  inspectSubscriptionRunner,
  runSubscriptionRunner,
} from "./subscription-runner/runtime.js";
export {
  subscriptionRunnerManifestVersion,
  subscriptionRunnerVersion,
} from "./subscription-runner/manifest.js";
export type { SubscriptionRunnerManifest } from "./subscription-runner/manifest.js";
export {
  reasoningEfforts,
  subscriptionLaunchers,
  subscriptionProfileIds,
} from "./subscription-runner/profile.js";
export type {
  ReasoningEffort,
  SubscriptionLauncher,
  SubscriptionProfileId,
  SubscriptionRunnerConfig,
} from "./subscription-runner/profile.js";

/* v8 ignore start -- process entrypoint delegates to the tested CLI adapter */
const adapterPath = fileURLToPath(import.meta.url);

async function main(): Promise<void> {
  try {
    await runSubscriptionRunnerCli(process.argv.slice(2), adapterPath, {
      readInput: readBoundedStdin,
      writeOutput: (value) => process.stdout.write(value),
    });
  } catch (error) {
    process.stderr.write(`${publicError(error)}\n`);
    process.exitCode = 1;
  }
}

async function readBoundedStdin(): Promise<string> {
  const chunks: Buffer[] = [];
  let bytes = 0;
  for await (const value of process.stdin) {
    const chunk = Buffer.isBuffer(value) ? value : Buffer.from(value);
    bytes += chunk.length;
    if (bytes > 1_100_000) {
      throw new Error("Subscription runner stdin exceeds 1100000 bytes");
    }
    chunks.push(chunk);
  }
  return new TextDecoder("utf-8", { fatal: true }).decode(Buffer.concat(chunks));
}

function publicError(error: unknown): string {
  if (error instanceof Error && error.message.startsWith("Subscription")) {
    return error.message;
  }
  return "Subscription runner rejected invalid input";
}

function isDirectInvocation(): boolean {
  try {
    return (
      ["subscription-runner.js", "subscription-runner.ts"].includes(basename(adapterPath)) &&
      process.argv[1] !== undefined &&
      realpathSync(process.argv[1]) === realpathSync(adapterPath)
    );
  } catch {
    return false;
  }
}

/* v8 ignore next 3 */
if (isDirectInvocation()) {
  await main();
}
/* v8 ignore stop */
