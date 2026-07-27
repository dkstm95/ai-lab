import { unlink, writeFile } from "node:fs/promises";
import process from "node:process";
import { setTimeout } from "node:timers";

let input = "";
for await (const chunk of process.stdin) {
  input += chunk;
}

const request = JSON.parse(input);
const mode = process.argv[2] ?? "success";
const marker = process.argv[3];
if (marker !== undefined) {
  await writeFile(marker, "spawned\n");
}

if (mode === "replace-output") {
  const output = process.argv[4];
  await unlink(output);
  await writeFile(output, "replacement\n");
}

if (mode === "timeout") {
  await new Promise((resolve) => setTimeout(resolve, 10_000));
}

const prompt = request.request.messages.at(-1)?.content ?? "";
const schemaPrefix = "Required result schema: ";
const schemaLine = prompt.split("\n").find((line) => line.startsWith(schemaPrefix));
const result = JSON.parse(schemaLine?.slice(schemaPrefix.length) ?? "{}");
result.summary = "Runner produced durable knowledge.";
result.acceptedClaims[0].text = "Runner produced durable knowledge.";

const response = {
  protocol: "ai-lab.external-runner",
  version: 1,
  requestId: request.requestId,
  output: mode === "invalid-result" ? "{}" : JSON.stringify(result),
};

process.stdout.write(`${JSON.stringify(response)}\n`);
