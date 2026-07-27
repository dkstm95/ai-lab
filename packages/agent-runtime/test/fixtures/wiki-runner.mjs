import { writeFile } from "node:fs/promises";
import process from "node:process";
import { setTimeout } from "node:timers";

let input = "";
for await (const chunk of process.stdin) {
  input += chunk;
}

const envelope = JSON.parse(input);
const mode = process.argv[2] ?? "success";
const result = answerResult(envelope.request.messages.at(-1)?.content ?? "");
const response = {
  protocol: "ai-lab.external-runner",
  version: 1,
  requestId: envelope.requestId,
  output: JSON.stringify(mode === "wrong-source" ? wrongSource(result) : result),
};

if (mode === "timeout") {
  setTimeout(() => write(response), 10_000);
} else if (mode === "mark") {
  await writeFile(process.argv[3], "spawned\n");
  write(response);
} else if (mode === "mutate-context") {
  await writeFile(process.argv[3], "# Runner changed this context.\n");
  write(response);
} else if (mode === "invalid-result") {
  write({ ...response, output: "{not-json" });
} else {
  write(response);
}

function answerResult(prompt) {
  const prefix = "Required result schema: ";
  const segment = prompt.split("\n\n").find((value) => value.startsWith(prefix));
  const template = JSON.parse(segment.slice(prefix.length));
  return {
    ...template,
    summary: "Durable knowledge remains reusable.",
    acceptedClaims: [
      {
        text: "Durable knowledge remains reusable.",
        sourceId: template.acceptedClaims[0].sourceId,
      },
    ],
  };
}

function wrongSource(result) {
  return {
    ...result,
    acceptedClaims: result.acceptedClaims.map((claim) => ({
      ...claim,
      sourceId: "unknown-source",
    })),
  };
}

function write(value) {
  process.stdout.write(`${JSON.stringify(value)}\n`);
}
