import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "peekpane-toggle-"));
const env = {
  ...process.env,
  XDG_CACHE_HOME: tmp,
  XDG_CONFIG_HOME: tmp,
  NVIM: "",
};
delete env.PEEKPANE_HEADLESS;
const cli = (...args) =>
  execFileSync(process.execPath, ["bin/peekpane.js", ...args], {
    env,
    encoding: "utf8",
    timeout: 20000,
  });
const tmux = (...args) =>
  execFileSync("tmux", args, { encoding: "utf8" }).trim();
const active = () => tmux("display-message", "-p", "#{pane_id}");
const zoomed = () => tmux("display-message", "-p", "#{window_zoomed_flag}");
const editor = active(),
  originalZoom = zoomed();
try {
  const file = path.join(tmp, "demo.md");
  fs.writeFileSync(file, "# Toggle preview");
  cli(file, "--display", "toggle");
  const session = JSON.parse(cli("ls", "--json"))[0];
  assert.equal(active(), session.pane);
  assert.equal(zoomed(), "1");
  cli("focus");
  assert.equal(active(), editor);
  assert.equal(zoomed(), "1");
  cli("focus");
  assert.equal(active(), session.pane);
  assert.equal(zoomed(), "1");
  cli("close", file);
  assert.equal(active(), editor);
  assert.equal(zoomed(), originalZoom);
  console.log(
    "PASS: fullscreen open, editor/preview switching and original layout restoration",
  );
} finally {
  cli("close");
  fs.rmSync(tmp, { recursive: true, force: true });
}
