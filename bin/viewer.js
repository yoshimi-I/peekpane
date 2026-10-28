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
const dir = process.argv[2],
  cache = path.dirname(dir),
  socketPath = path.join(cache, "renderer.sock");
const snapshot =
  JSON.parse(fs.readFileSync(path.join(dir, "options.json"), "utf8"))
    .display === "window";
const tty = snapshot
  ? null
  : execFileSync("tty", {
      stdio: ["inherit", "pipe", "ignore"],
      encoding: "utf8",
    }).trim();
const { connect } = await import("node:net");
function connection() {
  return new Promise((resolve, reject) => {
    const socket = connect(socketPath);
    socket.once("error", reject);
    socket.once("connect", () => {
      socket.removeListener("error", reject);
      resolve(socket);
    });
  });
}
let socket;
try {
  socket = await connection();
} catch {
  const env = {
    ...process.env,
    NODE_ENV: "production",
    PIXEL_FPS: process.env.PIXEL_FPS || "30",
  };
  delete env.ELECTRON_RUN_AS_NODE;
  delete env.PIXEL_TTY;
  const args = [
    fileURLToPath(new URL("../src/viewer.cjs", import.meta.url)),
    cache,
  ];
  if (process.platform === "linux" && !env.DISPLAY && !env.WAYLAND_DISPLAY)
    args.push("--ozone-platform=headless", "--screen-info={8192x8192}");
  const log = fs.openSync(path.join(cache, "renderer.stderr.log"), "a", 0o600);
  const child = spawn(executable, args, {
    env,
    detached: true,
    stdio: ["ignore", "ignore", log],
  });
  fs.closeSync(log);
  child.on("error", (error) => {
    console.error("peekpane: " + error.message);
    process.exit(1);
  });
  child.unref();
  for (let i = 0; i < 160; i++) {
    try {
      socket = await connection();
      break;
    } catch {
      await new Promise((r) => setTimeout(r, 50));
    }
  }
  if (!socket) {
    console.error(
      "peekpane: renderer failed to start; see " +
        path.join(cache, "renderer.stderr.log"),
    );
    process.exit(1);
  }
}
const sessionEnv = {};
for (const [key, value] of Object.entries(process.env))
  if (
    /^(TMUX|TERM|COLORTERM|GHOSTTY|KITTY|WEZTERM|PIXEL|XDG|PEEKPANE_SMOKE)/.test(
      key,
    )
  )
    sessionEnv[key] = value;
socket.on("error", (error) => {
  console.error(error.message);
  process.exit(1);
});
socket.on("data", (data) => {
  try {
    const message = JSON.parse(String(data));
    if (message.error) console.error(message.error);
  } catch {
    /* Closure may contain no message. */
  }
});
socket.on("close", () => process.exit(0));
socket.write(JSON.stringify({ dir, tty, env: sessionEnv, snapshot }) + "\n");
for (const signal of ["SIGINT", "SIGTERM", "SIGHUP"])
  process.on(signal, () => socket.end());
