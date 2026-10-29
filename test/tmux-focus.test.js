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
  const serverEnv = {
    ...process.env,
    XDG_CACHE_HOME: tmp,
    XDG_CONFIG_HOME: tmp,
    TMUX: "",
    TMUX_PANE: "",
    NVIM: "",
  };
  const tmux = (...args) =>
    execFileSync("tmux", ["-f", "/dev/null", "-S", socket, ...args], {
      encoding: "utf8",
      env: serverEnv,
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
    const code = `const store=await import(${JSON.stringify(pathToFileURL(path.resolve("src/store.js")).href)});store.init();const {bindings}=await import(${JSON.stringify(pathToFileURL(path.resolve("src/terminal.js")).href)});bindings({display:"split",focus_key:"M-p",zoom_key:"M-P"},${enable});`;
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
    env,
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
  "tmux bindings target the current window even when another preview opened later",
  { skip: !available },
  async () => {
    const s = await fixture();
    const cli = (args) => {
      const r = spawnSync(
        process.execPath,
        [path.resolve("bin/peekpane.js"), ...args],
        {
          env: {
            ...s.env,
            XDG_CONFIG_HOME: s.tmp,
            PEEKPANE_HEADLESS: "1",
            NVIM: "",
          },
          encoding: "utf8",
          timeout: 15000,
        },
      );
      assert.equal(r.status, 0, r.stderr);
      return r.stdout;
    };
    try {
      const editorA = s.tmux("display-message", "-p", "#{pane_id}");
      const previewA = s.tmux(
        "split-window",
        "-d",
        "-P",
        "-F",
        "#{pane_id}",
        "-t",
        editorA,
        "sleep 120",
      );
      const extraA = s.tmux(
        "split-window",
        "-d",
        "-P",
        "-F",
        "#{pane_id}",
        "-t",
        editorA,
        "sleep 120",
      );
      const editorB = s.tmux(
        "new-window",
        "-d",
        "-P",
        "-F",
        "#{pane_id}",
        "sleep 120",
      );
      const previewB = s.tmux(
        "split-window",
        "-d",
        "-P",
        "-F",
        "#{pane_id}",
        "-t",
        editorB,
        "sleep 120",
      );
      for (const [name, editor, pane] of [
        ["a", editorA, previewA],
        ["b", editorB, previewB],
      ]) {
        const file = path.join(s.tmp, name + ".md");
        fs.writeFileSync(file, "# " + name);
        cli([file]);
        const session = JSON.parse(cli(["ls", "--json"])).find(
          (item) => item.file === fs.realpathSync(file),
        );
        Object.assign(session, {
          editor,
          pane,
          display: "split",
          openedAt: name === "b" ? Date.now() + 10000 : Date.now(),
        });
        fs.writeFileSync(
          path.join(path.dirname(session.page), "session.json"),
          JSON.stringify(session),
        );
      }
      s.bind(true);
      const invoke = (key, pane) => {
        s.tmux("select-pane", "-t", pane);
        const line = s
          .tmux("list-keys", "-T", "root")
          .split("\n")
          .find((line) => line.trim().split(/\s+/).includes(key));
        assert.ok(line, "missing test binding");
        const command = line.slice(
          line.indexOf("run-shell") + "run-shell".length,
        );
        const config = path.join(s.tmp, "invoke.tmux");
        fs.writeFileSync(config, `run-shell -t ${pane} ${command}\n`);
        s.tmux("source-file", config);
      };
      const active = (pane) =>
        s
          .tmux("list-panes", "-t", pane, "-F", "#{pane_id} #{pane_active}")
          .split("\n")
          .find((line) => line.endsWith(" 1"))
          .split(" ")[0];
      invoke("M-p", editorA);
      assert.equal(
        active(editorA),
        previewA,
        "focus must select this window's preview, not the newest one",
      );
      invoke("M-p", previewA);
      assert.equal(
        active(editorA),
        editorA,
        "focus from preview must return to its editor",
      );
      invoke("M-p", extraA);
      assert.equal(
        active(editorA),
        previewA,
        "another pane must find the preview in its own window",
      );
      invoke("M-P", editorA);
      assert.equal(
        s.tmux("display-message", "-p", "-t", editorA, "#{window_zoomed_flag}"),
        "1",
      );
      assert.equal(
        s.tmux("display-message", "-p", "-t", editorB, "#{window_zoomed_flag}"),
        "0",
      );
    } finally {
      cli(["close"]);
      s.cleanup();
    }
  },
);
