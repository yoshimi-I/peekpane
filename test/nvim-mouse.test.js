import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
const version = spawnSync("nvim", ["--version"], {
  encoding: "utf8",
}).stdout?.match(/NVIM v(\d+)\.(\d+)/);
const available =
  version &&
  (Number(version[1]) > 0 || Number(version[2]) >= 11) &&
  spawnSync("python3", ["--version"]).status === 0;

test(
  "real Neovim TUI routes first-click, drag, release and wheel into the preview",
  { skip: !available },
  () => {
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "peekpane-mouse-tui-"));
    const output = path.join(tmp, "result.json");
    const nvim = [
      "nvim",
      "-u",
      "NONE",
      "-i",
      "NONE",
      "-n",
      "--cmd",
      "lua dofile('test/fixtures/mouse-tui.lua')",
    ];
    const args = [path.resolve("test/fixtures/mouse-tui.py"), ...nvim];
    try {
      const result = spawnSync("python3", args, {
        env: {
          ...process.env,
          TERM: "xterm-256color",
          PEEKPANE_MOUSE_RESULT: output,
        },
        encoding: "utf8",
        timeout: 15000,
      });
      assert.equal(result.status, 0, result.error?.message || result.stderr);
      assert.ok(
        fs.existsSync(output),
        "Neovim did not finish the mouse fixture",
      );
      const actual = JSON.parse(fs.readFileSync(output, "utf8"));
      assert.equal(actual.ok, true, actual.error);
      assert.deepEqual(
        actual.events.map((e) => e.type),
        ["mouseDown", "mouseMove", "mouseUp", "mouseWheel"],
      );
    } finally {
      fs.rmSync(tmp, { recursive: true, force: true });
    }
  },
);
