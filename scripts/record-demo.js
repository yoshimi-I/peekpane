// Entry point for the real terminal-screen demo recorder.
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
const result = spawnSync(
  process.execPath,
  [
    fileURLToPath(new URL("./record-terminal-demo.js", import.meta.url)),
    ...process.argv.slice(2),
  ],
  { env: process.env, stdio: "inherit" },
);
if (result.error) throw result.error;
process.exitCode = result.status ?? 1;
