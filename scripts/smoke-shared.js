import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "peekpane-shared-"));
const env = {
  ...process.env,
  XDG_CACHE_HOME: tmp,
  XDG_CONFIG_HOME: tmp,
  NVIM: "",
  PEEKPANE_SMOKE: "1",
};
delete env.PEEKPANE_HEADLESS;
const cli = (...args) =>
  execFileSync(process.execPath, ["bin/peekpane.js", ...args], {
    env,
    encoding: "utf8",
    timeout: 20000,
  });
try {
  const md = path.join(tmp, "a.md"),
    html = path.join(tmp, "b.html");
  fs.writeFileSync(md, "# Shared Markdown");
  fs.writeFileSync(html, "<h1>Shared HTML</h1>");
  const display = process.env.PEEKPANE_TEST_DISPLAY || "split";
  cli(md, "--display", display);
  cli(html, "--display", display);
  const opened = JSON.parse(cli("ls", "--json"));
  const pids = opened.map((s) =>
    Number(
      fs.readFileSync(path.join(path.dirname(s.page), "viewer.pid"), "utf8"),
    ),
  );
  assert.equal(pids[0], pids[1], "Previews must share one Electron host");
  for (const session of opened) {
    const snapshot = JSON.parse(
      fs.readFileSync(
        path.join(path.dirname(session.page), "viewer-snapshot.json"),
        "utf8",
      ),
    );
    assert.equal(snapshot.copyBridge, true, "real WebView copy bridge missing");
  }
  cli("close", md);
  assert.equal(JSON.parse(cli("ls", "--json")).length, 1);
  process.kill(pids[1], 0);
  fs.writeFileSync(html, "<h1>Updated surviving HTML</h1>");
  const snapshot = path.join(
    path.dirname(opened.find((s) => s.file.endsWith("b.html")).page),
    "viewer-snapshot.json",
  );
  let updated = false;
  for (let i = 0; i < 100; i++) {
    try {
      if (
        JSON.parse(fs.readFileSync(snapshot, "utf8")).heading ===
        "Updated surviving HTML"
      ) {
        updated = true;
        break;
      }
    } catch {
      /* The snapshot may still be loading. */
    }
    await new Promise((r) => setTimeout(r, 50));
  }
  assert.ok(
    updated,
    "Closing one preview must preserve live updates in the other",
  );
  console.log("PASS: shared runtime and independent close/live updates");
} finally {
  cli("close");
  fs.rmSync(tmp, {
    recursive: true,
    force: true,
    maxRetries: 5,
    retryDelay: 100,
  });
}
