import { Buffer } from "node:buffer";
import { spawn } from "node:child_process";
import process from "node:process";
import { setTimeout } from "node:timers";

let input = "";
for await (const chunk of process.stdin) {
  input += chunk;
}

const request = JSON.parse(input);
const mode = process.argv[2] ?? "success";
const response = {
  protocol: "ai-lab.external-runner",
  version: 1,
  requestId: request.requestId,
  output: request.request.messages.at(-1)?.content ?? "",
};

if (mode === "timeout") {
  setTimeout(() => write(response), 10_000);
} else if (mode === "inherited-pipe") {
  spawn(process.execPath, ["-e", "setTimeout(() => {}, 1500)"], {
    detached: true,
    stdio: ["ignore", process.stdout, process.stderr],
  });
  setTimeout(() => write(response), 10_000);
} else if (mode === "oversized-stdout") {
  process.stdout.write("x".repeat(16_384));
} else if (mode === "oversized-stderr") {
  process.stderr.write("x".repeat(16_384));
  write(response);
} else if (mode === "malformed") {
  process.stdout.write("{not-json");
} else if (mode === "invalid-utf8") {
  process.stdout.write(Buffer.from([0xff]));
} else if (mode === "unknown-field") {
  write({ ...response, metadata: { runner: true } });
} else if (mode === "wrong-protocol") {
  write({ ...response, protocol: "other.protocol" });
} else if (mode === "wrong-version") {
  write({ ...response, version: 2 });
} else if (mode === "invalid-output") {
  write({ ...response, output: { value: "not a string" } });
} else if (mode === "wrong-request") {
  write({ ...response, requestId: "wrong-request-id" });
} else if (mode === "nonzero") {
  process.exitCode = 7;
} else if (mode === "signal") {
  process.kill(process.pid, "SIGTERM");
} else if (mode === "inspect") {
  write({
    ...response,
    output: JSON.stringify({
      request,
      cwd: process.cwd(),
      allowed: process.env.ALLOWED_RUNNER_VALUE ?? null,
      secret: process.env.SECRET_RUNNER_VALUE ?? null,
    }),
  });
} else {
  write(response);
}

function write(value) {
  process.stdout.write(`${JSON.stringify(value)}\n`);
}
