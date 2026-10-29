import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { spawn, spawnSync } from "node:child_process";
import { once } from "node:events";
const repo = path.resolve(".");
const pause = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
async function until(check) {
  const deadline = Date.now() + 5000;
  while (Date.now() < deadline) {
    if (check()) return;
    await pause(20);
  }
  throw Error("Backend condition timed out");
}
function setup() {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "peekpane-backend-"));
  const env = {
    ...process.env,
    XDG_CACHE_HOME: tmp,
    XDG_CONFIG_HOME: tmp,
    PEEKPANE_HEADLESS: "1",
    NVIM: "",
  };
  const cli = (args, input) => {
    const result = spawnSync(
      process.execPath,
      [path.join(repo, "bin/peekpane.js"), ...args],
      { env, input, encoding: "utf8", timeout: 15000 },
    );
    assert.equal(result.status, 0, result.stderr);
    return result.stdout;
  };
  return {
    tmp,
    env,
    cli,
    cleanup() {
      cli(["close"]);
      fs.rmSync(tmp, { recursive: true, force: true });
    },
  };
}
test("display backend switches retain unsaved content and line", async () => {
  const s = setup();
  const file = path.join(s.tmp, "example.md");
  fs.writeFileSync(file, "# Saved\n");
  try {
    s.cli([file, "--display", "window"]);
    let session = JSON.parse(s.cli(["ls", "--json"]))[0];
    s.cli(["push", file, "--line", "7"], "# Unsaved\n");
    await until(() =>
      fs.readFileSync(session.page, "utf8").includes("Unsaved"),
    );
    for (const display of ["split", "toggle", "window"]) {
      const previous = session;
      s.cli([file, "--display", display]);
      session = JSON.parse(s.cli(["ls", "--json"]))[0];
      const dir = path.dirname(session.page);
      const options = JSON.parse(
        fs.readFileSync(path.join(dir, "options.json"), "utf8"),
      );
      assert.equal(session.display, display);
      assert.equal(options.display, display);
      assert.notEqual(session.workerToken, previous.workerToken);
      assert.match(fs.readFileSync(session.page, "utf8"), /Unsaved/);
      assert.match(
        fs.readFileSync(path.join(dir, "state.js"), "utf8"),
        /"line":7/,
      );
      assert.equal(fs.readFileSync(file, "utf8"), "# Saved\n");
    }
  } finally {
    s.cleanup();
  }
});
test("stale worker and viewer PIDs never receive termination signals", async () => {
  const s = setup();
  const unrelated = spawn(
    process.execPath,
    ["-e", "setInterval(()=>{},1000)"],
    { stdio: "ignore" },
  );
  const gone = once(unrelated, "exit");
  try {
    const root = path.join(s.tmp, "peekpane"),
      dir = path.join(root, "stale");
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(
      path.join(dir, "session.json"),
      JSON.stringify({
        id: "stale",
        file: path.join(s.tmp, "old.md"),
        page: path.join(dir, "index.html"),
        pid: unrelated.pid,
        workerToken: "e".repeat(32),
        display: "window",
      }),
    );
    fs.writeFileSync(path.join(dir, "viewer.pid"), String(unrelated.pid));
    assert.deepEqual(JSON.parse(s.cli(["ls", "--json"])), []);
    s.cli(["close"]);
    const code = `const {stop}=await import(${JSON.stringify(pathToFileURL(path.join(repo, "src/terminal.js")).href)});await stop({page:${JSON.stringify(path.join(dir, "index.html"))}});`;
    const result = spawnSync(
      process.execPath,
      ["--input-type=module", "-e", code],
      { env: s.env, encoding: "utf8", timeout: 10000 },
    );
    assert.equal(result.status, 0, result.stderr);
    await pause(50);
    assert.equal(unrelated.exitCode, null);
    assert.equal(unrelated.signalCode, null, "cached viewer PID was signalled");
    process.kill(unrelated.pid, 0);
  } finally {
    if (unrelated.exitCode === null && unrelated.signalCode === null)
      unrelated.kill();
    await gone;
    s.cleanup();
  }
});
test("tmux bindings decode checkout file URLs", () => {
  const s = setup();
  try {
    const checkout = path.join(s.tmp, "code space あ"),
      src = path.join(checkout, "src"),
      bin = path.join(s.tmp, "fake-bin"),
      trace = path.join(s.tmp, "trace");
    fs.mkdirSync(src, { recursive: true });
    fs.mkdirSync(bin);
    fs.writeFileSync(path.join(checkout, "package.json"), '{"type":"module"}');
    for (const name of ["terminal.js", "store.js"])
      fs.copyFileSync(path.join(repo, "src", name), path.join(src, name));
    fs.writeFileSync(
      path.join(bin, "tmux"),
      '#!/bin/sh\nprintf "%s\\n" "$@" >> "$TRACE"\nif [ "$1" = "list-keys" ]; then exit 1; fi\n',
      { mode: 0o755 },
    );
    const env = {
      ...s.env,
      PATH: bin + path.delimiter + process.env.PATH,
      TMUX: "fake",
      TRACE: trace,
    };
    delete env.PEEKPANE_HEADLESS;
    const code = `const store=await import(${JSON.stringify(pathToFileURL(path.join(src, "store.js")).href)});store.init();const terminal=await import(${JSON.stringify(pathToFileURL(path.join(src, "terminal.js")).href)});terminal.bindings({display:"split",focus_key:"M-p",zoom_key:false},true);`;
    const result = spawnSync(
      process.execPath,
      ["--input-type=module", "-e", code],
      { env, encoding: "utf8" },
    );
    assert.equal(result.status, 0, result.stderr);
    assert.ok(
      fs
        .readFileSync(trace, "utf8")
        .includes(path.join(checkout, "bin/peekpane.js")),
    );
    assert.ok(!fs.readFileSync(trace, "utf8").includes("%20"));
  } finally {
    s.cleanup();
  }
});
test("unsupported toggle conversion leaves the original session running", () => {
  const s = setup();
  const file = path.join(s.tmp, "source.md");
  fs.writeFileSync(file, "# Keep this preview");
  try {
    s.cli([file, "--display", "window"]);
    const before = JSON.parse(s.cli(["ls", "--json"]))[0];
    const env = { ...s.env };
    delete env.TMUX;
    delete env.PEEKPANE_HEADLESS;
    const result = spawnSync(
      process.execPath,
      [path.join(repo, "bin/peekpane.js"), file, "--display", "toggle"],
      { env, encoding: "utf8", timeout: 15000 },
    );
    assert.equal(result.status, 1);
    assert.match(result.stderr, /Toggle display requires tmux/);
    const after = JSON.parse(s.cli(["ls", "--json"]))[0];
    assert.equal(
      after?.workerToken,
      before.workerToken,
      "failed conversion closed the original preview",
    );
  } finally {
    s.cleanup();
  }
});

test("external terminal adapters reuse an existing split preview", () => {
  const s = setup();
  const file = path.join(s.tmp, "external.md");
  const adapter = path.join(s.tmp, "adapter.mjs"),
    loader = path.join(s.tmp, "loader.mjs");
  fs.writeFileSync(file, "# External adapter");
  fs.writeFileSync(
    adapter,
    `import fs from "node:fs"; import path from "node:path";
    export const callerTty = () => ({path:"/dev/null"});
    export const detect = () => ({ getCurrentPane: async () => "fixture-pane", split: async ({command}) => {
      fs.appendFileSync(${JSON.stringify(path.join(s.tmp, "splits"))}, "split\\n");
      fs.writeFileSync(path.join(command.at(-1), "viewer-ready"), "ready");
    }});`,
  );
  fs.writeFileSync(
    loader,
    `export async function resolve(specifier, context, next) {
    if(specifier === "@zenbu-labs/pixel/terminal") return {url:${JSON.stringify(pathToFileURL(adapter).href)},shortCircuit:true};
    return next(specifier,context);
  }`,
  );
  delete s.env.PEEKPANE_HEADLESS;
  delete s.env.TMUX;
  delete s.env.TMUX_PANE;
  s.env.NODE_OPTIONS = `--experimental-loader=${pathToFileURL(loader).href}`;
  try {
    s.cli([file]);
    const first = JSON.parse(s.cli(["ls", "--json"]))[0];
    s.cli([file]);
    const second = JSON.parse(s.cli(["ls", "--json"]))[0];
    assert.equal(
      second.workerToken,
      first.workerToken,
      "reopening must retain the worker",
    );
    assert.equal(second.display, "split");
    assert.equal(
      fs.readFileSync(path.join(s.tmp, "splits"), "utf8"),
      "split\n",
    );
  } finally {
    s.cleanup();
  }
});
