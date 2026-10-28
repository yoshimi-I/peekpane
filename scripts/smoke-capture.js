// Inject a compositor failure into an isolated real host; production has no test hook.
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { spawn, execFileSync } from "node:child_process";
import { once } from "node:events";
const require = createRequire(import.meta.url);
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "peekpane-capture-"));
const cache = path.join(tmp, "peekpane");
fs.mkdirSync(cache, { mode: 0o700 });
const env = {
  ...process.env,
  XDG_CACHE_HOME: tmp,
  XDG_CONFIG_HOME: tmp,
  NVIM: "",
};
for (const key of [
  "ELECTRON_RUN_AS_NODE",
  "PEEKPANE_HEADLESS",
  "PEEKPANE_SMOKE",
])
  delete env[key];
const runtime = path.join(
  path.dirname(require.resolve("@zenbu-labs/pixel/package.json")),
  "electron",
  "dist",
  ...(process.platform === "darwin"
    ? ["Electron.app", "Contents", "MacOS", "pixel"]
    : ["pixel"]),
);
const fixture = path.join(tmp, "fault-host.cjs");
const injected = path.join(tmp, "capture-injected");
fs.writeFileSync(
  fixture,
  `const {app}=require("electron");
const fs=require("node:fs");
app.on("web-contents-created",(_event,contents)=>{
  const capture=contents.capturePage.bind(contents);let calls=0;
  contents.capturePage=async(...args)=>{
    if(++calls===2){fs.writeFileSync(${JSON.stringify(injected)},"UnknownVizError");throw Error("UnknownVizError");}
    return capture(...args);
  };
});
require(${JSON.stringify(path.resolve("src/viewer.cjs"))});
`,
);
const host = spawn(runtime, [fixture, cache], {
  env,
  stdio: ["ignore", "ignore", "pipe"],
});
let log = "",
  startupError;
host.stderr.on("data", (data) => (log += data));
host.on("error", (error) => (startupError = error));
const exited = once(host, "exit").catch(() => []);
const pause = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
async function until(check, message) {
  const deadline = Date.now() + 15000;
  while (Date.now() < deadline) {
    if (startupError) throw startupError;
    if (host.exitCode !== null || host.signalCode !== null)
      throw Error(`Capture host exited: ${log}`);
    if (check()) return;
    await pause(25);
  }
  throw Error(`${message}: ${log}`);
}
const cli = (...args) =>
  execFileSync(process.execPath, ["bin/peekpane.js", ...args], {
    env,
    encoding: "utf8",
    timeout: 20000,
  });
try {
  await until(
    () => fs.existsSync(path.join(cache, "renderer.sock")),
    "Host socket did not start",
  );
  const file = path.join(tmp, "document.md");
  fs.writeFileSync(
    file,
    "# Resize recovery\n\n" + "Paragraph.\n\n".repeat(100),
  );
  cli(file, "--display", "window");
  const dir = path.dirname(JSON.parse(cli("ls", "--json"))[0].page);
  const frame = () =>
    JSON.parse(fs.readFileSync(path.join(dir, "frame.json"), "utf8"));
  const initial = frame().path;
  const viewport = path.join(dir, "viewport.json");
  fs.writeFileSync(
    viewport + ".tmp",
    JSON.stringify({
      width: 600,
      height: 400,
      pixelWidth: 900,
      pixelHeight: 600,
    }),
  );
  fs.renameSync(viewport + ".tmp", viewport);
  await until(
    () =>
      frame().path !== initial &&
      frame().width === 900 &&
      frame().height === 600,
    "Resize remained frozen after a transient capture rejection",
  );
  assert.equal(
    fs.readFileSync(injected, "utf8"),
    "UnknownVizError",
    "Fault was not exercised",
  );
  assert.ok(fs.statSync(frame().path).size > 0, "Recovered frame was empty");
  assert.ok(
    !fs.existsSync(path.join(dir, "viewer-error.txt")),
    "Successful recovery left a viewer error",
  );
  assert.equal(
    fs.readdirSync(dir).some((name) => name.startsWith("action-")),
    false,
    "Test must not send another action to unfreeze capture",
  );
  console.log(
    "PASS: viewport resize publishes a real frame after an injected capture rejection without another action",
  );
} finally {
  try {
    cli("close");
  } catch {
    /* Startup may have failed before a session existed. */
  }
  if (host.exitCode === null && host.signalCode === null) {
    host.kill("SIGTERM");
    if (
      !(await Promise.race([
        exited.then(() => true),
        pause(1000).then(() => false),
      ]))
    )
      host.kill("SIGKILL");
  }
  await exited;
  fs.rmSync(tmp, {
    recursive: true,
    force: true,
    maxRetries: 5,
    retryDelay: 100,
  });
}
