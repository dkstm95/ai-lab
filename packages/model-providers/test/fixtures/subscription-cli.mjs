#!/usr/bin/env node
import { Buffer } from "node:buffer";
import { appendFileSync, readFileSync } from "node:fs";
import { join } from "node:path";
import process from "node:process";
import { setInterval } from "node:timers";

const stateDir = process.env.CODEX_HOME ?? process.env.CLAUDE_CONFIG_DIR;
if (!stateDir) process.exit(91);
const control = JSON.parse(readFileSync(join(stateDir, "fixture.json"), "utf8"));
const args = process.argv.slice(2);
const command = commandKind(control.profile, args);
const input = command === "run" ? readFileSync(0, "utf8") : "";
appendFileSync(
  join(stateDir, "trace.jsonl"),
  `${JSON.stringify({
    command,
    args,
    input,
    cwd: process.cwd(),
    envNames: Object.keys(process.env).sort(),
    claudeAiMcpServers: process.env.ENABLE_CLAUDEAI_MCP_SERVERS,
  })}\n`,
);

if (command === "version") {
  process.stdout.write(`${control.version}\n`);
} else if (command === "auth") {
  writeAuth(control);
} else if (command === "mcp") {
  process.stdout.write(`${JSON.stringify(control.mcp ?? [])}\n`);
} else {
  writeRun(control);
}

function commandKind(profile, values) {
  if (values.includes("--version")) return "version";
  if (values[0] === "login" || values[0] === "auth") return "auth";
  if (values[0] === "mcp") return "mcp";
  if (profile === "codex" && values.includes("exec")) return "run";
  if (profile === "claude" && values.includes("-p")) return "run";
  process.exit(92);
}

function writeAuth(value) {
  if (value.profile === "codex") {
    const status =
      value.auth === "subscription" ? "Logged in using ChatGPT" : "Logged in using an API key";
    process.stdout.write(`${status}\n`);
    return;
  }
  process.stdout.write(
    `${JSON.stringify({
      loggedIn: value.auth !== "api",
      authMethod: value.auth === "api" ? "api_key" : "claude.ai",
      apiProvider: "firstParty",
      subscriptionType: value.auth === "api" ? null : "max",
      ...(value.auth === "mixed" ? { apiKeySource: "apiKeyHelper" } : {}),
      email: "must-not-be-disclosed@example.invalid",
    })}\n`,
  );
}

function writeRun(value) {
  if (value.run === "timeout") {
    setInterval(() => undefined, 1000);
    return;
  }
  if (value.run === "nonzero") {
    process.stderr.write("private target failure");
    process.exit(7);
  }
  if (value.run === "stdout-limit" || value.run === "stderr-limit") {
    process[value.run === "stdout-limit" ? "stdout" : "stderr"].write(Buffer.alloc(1_100_001, "x"));
    return;
  }
  if (value.run === "invalid-utf8") {
    process.stdout.write(Buffer.from([0xc3, 0x28]));
    return;
  }
  const output =
    value.profile === "claude"
      ? {
          type: "result",
          subtype: "success",
          is_error: false,
          structured_output: value.result,
        }
      : value.result;
  process.stdout.write(
    value.run === "noise" ? `noise\n${JSON.stringify(output)}` : JSON.stringify(output),
  );
}
