#!/usr/bin/env node
// Launch the rendering runtime directly, with no browser shell or debug port.
import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import { spawn, execFileSync } from "node:child_process";
const require = createRequire(import.meta.url);
const pkg = path.dirname(require.resolve("@zenbu-labs/pixel/package.json"));
const executable = path.join(
  pkg,
  "electron",
  "dist",
  ...(process.platform === "darwin"
    ? ["Electron.app", "Contents", "MacOS", "pixel"]
    : ["pixel"]),
);
if (!fs.existsSync(executable)) {
  console.error("peekpane: rendering runtime missing; run npm ci");
  process.exit(1);
}
const tty = execFileSync("tty", {
  stdio: ["inherit", "pipe", "ignore"],
  encoding: "utf8",
}).trim();
const env = { ...process.env, PIXEL_TTY: tty, NODE_ENV: "production" };
delete env.ELECTRON_RUN_AS_NODE;
const args = [
  fileURLToPath(new URL("../src/viewer.cjs", import.meta.url)),
  process.argv[2],
];
if (process.platform === "linux" && !env.DISPLAY && !env.WAYLAND_DISPLAY)
  args.push("--ozone-platform=headless", "--screen-info={8192x8192}");
const errorLog = fs.openSync(
  path.join(process.argv[2], "viewer.stderr.log"),
  "a",
  0o600,
);
const child = spawn(executable, args, {
  env,
  stdio: ["inherit", "inherit", errorLog],
});
fs.closeSync(errorLog);
child.on("error", (e) => {
  console.error(e.message);
  process.exitCode = 1;
});
child.on("exit", (code) => process.exit(code ?? 1));
for (const signal of ["SIGINT", "SIGTERM", "SIGHUP"])
  process.on(signal, () => child.kill(signal));
