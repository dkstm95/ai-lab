import { spawnSync } from "node:child_process";
import { resolve } from "node:path";
import process from "node:process";

const cli = run("apps/cli/dist/index.js", ["run", "hello", "smoke"]);
assert(cli.status === 0, `Built CLI exited with ${String(cli.status)}: ${cli.stderr}`);
assert(cli.stdout === "[fake:fake-general] smoke\n", "Built CLI output is invalid");
assert(cli.stderr === "", `Built CLI wrote stderr: ${cli.stderr}`);

const runner = run("packages/model-providers/dist/subscription-runner.js", []);
assert(runner.status === 1, "Subscription runner entrypoint must reject an empty command");
assert(
  runner.stderr.trim() === "Subscription runner requires `inspect` or `run`",
  `Subscription runner entrypoint error is invalid: ${runner.stderr}`,
);

console.log("built CLI smoke check passed");

function run(path, args) {
  return spawnSync(process.execPath, [resolve(path), ...args], {
    encoding: "utf8",
    env: {},
  });
}

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}
