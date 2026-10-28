// Real renderer regression: a selection-held update must finish before the yank frame.
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "peekpane-deferred-"));
const env = {
  ...process.env,
  XDG_CACHE_HOME: tmp,
  XDG_CONFIG_HOME: tmp,
  NVIM: "",
  PEEKPANE_SMOKE: "1",
};
delete env.PEEKPANE_HEADLESS;
const cli = (args, input) =>
  execFileSync(process.execPath, ["bin/peekpane.js", ...args], {
    env,
    input,
    encoding: "utf8",
    timeout: 20000,
  });
const pause = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
async function until(check, message) {
  const deadline = Date.now() + 15000;
  while (Date.now() < deadline) {
    if (check()) return;
    await pause(25);
  }
  throw Error(message);
}
try {
  const file = path.join(tmp, "pending.md");
  fs.writeFileSync(file, "# Original\n\nSelectable text.");
  cli([file, "--display", "window"]);
  const dir = path.dirname(JSON.parse(cli(["ls", "--json"]))[0].page);
  const frame = () =>
    JSON.parse(fs.readFileSync(path.join(dir, "frame.json"), "utf8"));
  const snapshot = () =>
    JSON.parse(fs.readFileSync(path.join(dir, "viewer-snapshot.json"), "utf8"));
  let sequence = 0;
  const action = (key) => {
    const name = path.join(
      dir,
      `action-${String(++sequence).padStart(8, "0")}.json`,
    );
    fs.writeFileSync(name + ".tmp", JSON.stringify({ key }));
    fs.renameSync(name + ".tmp", name);
  };
  action("v");
  await until(
    () => frame().selectionLength > 0,
    "Visual selection did not start",
  );
  cli(
    ["push", file],
    "# Updated\n\n```mermaid\ngraph TD; A-->B; B-->C; C-->D\n```\n",
  );
  await until(
    () => frame().revision === 2,
    "Pending content did not reach renderer",
  );
  assert.equal(
    frame().selectionLength > 0,
    true,
    "Pending update cleared selection",
  );
  const heldPath = frame().path;
  action("y");
  await until(
    () => frame().path !== heldPath && frame().selectionLength === 0,
    "Yank did not publish a new frame",
  );
  const finalFrame = frame();
  const pixels = fs.readFileSync(finalFrame.path);
  // The snapshot follows publication. No additional action may be needed to finish Mermaid.
  await until(
    () =>
      fs.existsSync(path.join(dir, "viewer-snapshot.json")) &&
      snapshot().revision === 2 &&
      snapshot().diagram,
    "Yank frame left the deferred Mermaid diagram unfinished",
  );
  await pause(300);
  assert.equal(
    frame().path,
    finalFrame.path,
    "Unexpected extra action was needed to publish completed content",
  );
  action("h"); // A no-op lets us compare the published frame with the fully settled DOM.
  await until(
    () => frame().path !== finalFrame.path,
    "Reference capture did not complete",
  );
  assert.ok(
    pixels.equals(fs.readFileSync(frame().path)),
    "Yank frame was captured before deferred diagram enhancement finished",
  );
  console.log(
    "PASS: deferred Mermaid update completes in the yank frame without another key",
  );
} finally {
  cli(["close"]);
  await pause(300);
  fs.rmSync(tmp, {
    recursive: true,
    force: true,
    maxRetries: 5,
    retryDelay: 100,
  });
}
