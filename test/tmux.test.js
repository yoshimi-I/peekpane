import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { spawnSync, execFileSync } from "node:child_process";
import { pathToFileURL } from "node:url";
const available = spawnSync("tmux", ["-V"]).status === 0;
const quote = (s) => `'${s.replaceAll("'", "'\\''")}'`;
async function fixture() {
  const tmp = fs.mkdtempSync("/tmp/peekpane-bindings-");
  const socket = path.join(tmp, "tmux.sock");
  const tmux = (...args) =>
    execFileSync("tmux", ["-f", "/dev/null", "-S", socket, ...args], {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
    }).trim();
  const env = {
    ...process.env,
    XDG_CACHE_HOME: tmp,
    PEEKPANE_HEADLESS: "",
    TMUX: `${socket},0,0`,
  };
  const start = async () => {
    const deadline = Date.now() + 5000;
    while (true) {
      try {
        tmux(
          "new-session",
          "-d",
          "-s",
          "test",
          "-x",
          "120",
          "-y",
          "40",
          `${quote(process.execPath)} -e 'setInterval(()=>{},1000)'`,
        );
        env.TMUX = `${socket},${tmux("display-message", "-p", "#{pid}")},0`;
        return;
      } catch (error) {
        if (Date.now() >= deadline) throw error;
        await new Promise((resolve) => setTimeout(resolve, 50));
      }
    }
  };
  const bind = (enable) => {
    const code = `const store=await import(${JSON.stringify(pathToFileURL(path.resolve("src/store.js")).href)});store.init();const {bindings}=await import(${JSON.stringify(pathToFileURL(path.resolve("src/terminal.js")).href)});bindings({display:"split",focus_key:"M-p",zoom_key:false},${enable});`;
    const result = spawnSync(
      process.execPath,
      ["--input-type=module", "-e", code],
      { env, encoding: "utf8" },
    );
    assert.equal(result.status, 0, result.stderr);
  };
  await start();
  return {
    tmp,
    tmux,
    start,
    bind,
    cleanup() {
      try {
        tmux("kill-server");
      } catch {
        /* Already stopped. */
      }
      fs.rmSync(tmp, {
        recursive: true,
        force: true,
        maxRetries: 5,
        retryDelay: 100,
      });
    },
  };
}
test(
  "bindings from a stopped tmux server are replaced and restore the new server's keys",
  { skip: !available },
  async () => {
    const s = await fixture();
    try {
      s.tmux("bind-key", "-n", "M-p", "display-message", "FIRST");
      s.bind(true);
      s.tmux("kill-server");
      await s.start();
      s.tmux("bind-key", "-n", "M-p", "display-message", "SECOND");
      s.bind(true);
      assert.match(s.tmux("list-keys", "-T", "root"), /peekpane\.js/);
      s.bind(false);
      assert.match(s.tmux("list-keys", "-T", "root"), /SECOND/);
    } finally {
      s.cleanup();
    }
  },
);
test(
  "missing tmux servers do not prevent binding metadata cleanup",
  { skip: !available },
  async () => {
    const s = await fixture();
    try {
      s.bind(true);
      s.tmux("kill-server");
      s.bind(false);
      assert.equal(
        fs.existsSync(path.join(s.tmp, "peekpane", "bindings.json")),
        false,
      );
    } finally {
      s.cleanup();
    }
  },
);
test(
  "closing stale bindings never changes keys in a replacement server",
  { skip: !available },
  async () => {
    const s = await fixture();
    try {
      s.bind(true);
      s.tmux("kill-server");
      await s.start();
      s.tmux("bind-key", "-n", "M-p", "display-message", "SECOND");
      s.bind(false);
      assert.match(s.tmux("list-keys", "-T", "root"), /SECOND/);
    } finally {
      s.cleanup();
    }
  },
);
