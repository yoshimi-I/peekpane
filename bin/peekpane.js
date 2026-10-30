#!/usr/bin/env node
import { locateTerminal, sameTerminal } from "../src/terminal-context.js";
import fs from "node:fs";
import crypto from "node:crypto";
import path from "node:path";
import { spawn, execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { parse, classify, UsageError } from "../src/options.js";
import {
  root,
  init,
  idFor,
  atomic,
  sessions,
  config,
  alive,
  processCommand,
  stopWorker,
} from "../src/store.js";
import {
  launch,
  stop,
  focus,
  bindings,
  show,
  sessionForPane,
} from "../src/terminal.js";
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
// Legacy metadata has no trustworthy process identity. Close its view through
// the local marker only, and never kill cached pane/PID identifiers. If its old
// worker still exists, let it observe the removed directory before reusing it.
async function discardOldDirectory(dir) {
  if (!fs.existsSync(dir)) return;
  let old;
  try {
    old = JSON.parse(fs.readFileSync(path.join(dir, "session.json"), "utf8"));
  } catch {
    /* Incomplete cache. */
  }
  const previous = old && processCommand(old.pid);
  const workerPath = fileURLToPath(
    new URL("../src/worker.js", import.meta.url),
  );
  const isWorker = previous?.includes(workerPath) && previous.includes(dir);
  await stop({ page: path.join(dir, "index.html"), display: "window" });
  fs.rmSync(dir, { recursive: true, force: true });
  if (isWorker) {
    const deadline = Date.now() + 5000;
    while (processCommand(old.pid) === previous && Date.now() < deadline)
      await sleep(50);
    if (processCommand(old.pid) === previous)
      throw new Error("Previous worker has not stopped; retry opening shortly");
  }
}
let release;
try {
  const raw = parse(process.argv.slice(2));
  if (raw.command === "help") {
    console.log(
      `peekpane - local file previews in your terminal or Neovim

Usage:
  peekpane FILE[:LINE] [options]
  peekpane open FILE[:LINE] [options]
  peekpane scroll FILE LINE
  peekpane push FILE [--line N] < STDIN
  peekpane close [FILE]              Close FILE, or all previews if omitted
  peekpane ls [--json]
  peekpane focus | zoom              tmux previews only
  peekpane help | --help | -h | --version

Options:
  --display split|toggle|window      Default: split
  --split left|right|up|down         Default: right
  --size 0.2-0.95                    Default: 0.5
  --type TYPE                       Override file type detection
  --css FILE                        Add a local stylesheet
  --line N                          Start at a source line
  --focus-key KEY|false             tmux focus shortcut (default: M-p)
  --zoom-key KEY|false              tmux zoom shortcut (default: M-P)

Display modes:
  split   Native terminal split, or tmux 3.2+ with Kitty graphics.
          macOS Ghostty 1.3+ supports native splits without tmux.
          Ghostty on Linux requires tmux for splitting.
  toggle  Fullscreen switching using tmux window zoom; requires tmux.
  window  Neovim same-window frame backend; requires image.nvim
          (Kitty-compatible backend) and ImageMagick.

Examples:
  peekpane open "./README.md" --display split --split right
  peekpane close "/absolute/path/to/README.md"
  peekpane ls --json

Closing:
  In a native Ghostty split, click the preview pane and press Cmd+W
  (default close_surface binding); confirm if prompted.
  q is not a split-view close shortcut. In Neovim, use :Peek close.

Requirements:
  Node.js 20+, macOS/Linux, and a Kitty-graphics-capable terminal.
  tmux does not add graphics support to an incompatible terminal.
  Neovim plugin: Neovim 0.10+; window-mode mouse forwarding needs 0.11+.
  The plugin can run its bundled CLI without a global npm link.

HTTP/HTTPS links in Markdown/HTML open in your default browser.
Setup, verified terminals, and limitations: docs/installation.md`,
    );
    process.exit(0);
  }
  if (raw.command === "version") {
    console.log("0.1.0");
    process.exit(0);
  }
  const configured = config();
  const opts = {
    display: "split",
    split: "right",
    size: 0.5,
    focus_key: "M-p",
    zoom_key: "M-P",
    ...configured,
    ...raw,
  };
  // Validate configured defaults through the same parser as command-line options.
  parse([
    "x",
    "--split",
    opts.split,
    "--size",
    String(opts.size),
    "--display",
    opts.display,
  ]);
  if (opts.css) opts.css = path.resolve(opts.css);
  init();
  if (["open", "close"].includes(opts.command)) {
    const lock = path.join(root, ".lock");
    let locked = false;
    for (let i = 0; i < 150; i++) {
      try {
        fs.writeFileSync(lock, String(process.pid), {
          flag: "wx",
          mode: 0o600,
        });
        locked = true;
        break;
      } catch (e) {
        if (e.code !== "EEXIST") throw e;
        try {
          const pid = Number(fs.readFileSync(lock, "utf8"));
          if (pid && !alive(pid)) {
            fs.unlinkSync(lock);
            continue;
          }
        } catch {
          /* The file may have been removed concurrently. */
        }
        await sleep(20);
      }
    }
    if (!locked) throw new Error("Another preview operation is busy");
    release = () => {
      try {
        fs.unlinkSync(lock);
      } catch {
        /* The file may have been removed concurrently. */
      }
    };
  }
  let list = sessions().sort((a, b) => (b.openedAt || 0) - (a.openedAt || 0));
  let file;
  if (opts.file) {
    file = path.resolve(opts.file);
    try {
      file = fs.realpathSync(file);
    } catch (e) {
      if (!["close", "scroll", "push"].includes(opts.command)) throw e;
      try {
        file = path.join(
          fs.realpathSync(path.dirname(file)),
          path.basename(file),
        );
      } catch {
        /* The file may have been removed concurrently. */
      }
    }
    opts.file = file;
  }
  let found = list.find((s) => s.file === file);
  let target;
  if (
    opts.command === "open" &&
    opts.display !== "window" &&
    process.env.PEEKPANE_HEADLESS !== "1"
  ) {
    if (opts.display === "toggle" && !process.env.TMUX)
      throw new Error("Toggle display requires tmux");
    target = await locateTerminal({ sessions: list });
    if (opts.display === "toggle" && target.kind !== "tmux")
      throw new Error("Toggle display requires tmux");
    opts.origin = target.identity;
  }
  let resumed;
  if (
    opts.command === "open" &&
    found &&
    (opts.display !== found.display || !sameTerminal(found, target))
  ) {
    if (
      opts.display === "toggle" &&
      !process.env.TMUX &&
      process.env.PEEKPANE_HEADLESS !== "1"
    )
      throw new Error("Toggle display requires tmux");
    // Recreate both worker and viewer: the launch mode is selected from options
    // at startup. Flush pending pushes before taking the resumable source data.
    await stopWorker(found);
    const dir = path.dirname(found.page);
    const previous = JSON.parse(
      fs.readFileSync(path.join(dir, "options.json"), "utf8"),
    );
    for (const key of ["type", "split", "size", "css", "focus_key", "zoom_key"])
      if (
        raw[key] === undefined &&
        configured[key] === undefined &&
        previous[key] !== undefined
      )
        opts[key] = previous[key];
    if (raw.line === undefined) {
      try {
        const state = fs.readFileSync(path.join(dir, "state.js"), "utf8");
        opts.line = JSON.parse(state.slice(state.indexOf("=") + 1, -1)).line;
      } catch {
        opts.line = previous.line;
      }
    }
    if (fs.existsSync(path.join(dir, "source.bin")))
      resumed = fs.readFileSync(path.join(dir, "source.bin"));
    await stop(found);
    fs.rmSync(dir, { recursive: true, force: true });
    if (sessions().length === 0) bindings(opts, false);
    found = undefined;
  }
  const command = (s, data) =>
    atomic(
      path.join(root, s.id, `command-${Date.now()}-${process.pid}.json`),
      JSON.stringify(data),
    );
  if (opts.command === "ls")
    console.log(
      opts.json
        ? JSON.stringify(list)
        : list.map((s) => `${s.file}\t${s.pane || "browser"}`).join("\n"),
    );
  else if (opts.command === "focus" || opts.command === "zoom")
    focus(
      found || sessionForPane(list, opts.pane || process.env.TMUX_PANE),
      opts.command === "zoom",
      opts.pane || process.env.TMUX_PANE,
    );
  else if (opts.command === "close") {
    for (const s of list.filter((s) => !file || s.file === file)) {
      await stopWorker(s);
      await stop(s);
      fs.rmSync(path.join(root, s.id), { recursive: true, force: true });
    }
    if (sessions().length === 0) bindings(opts, false);
  } else if (opts.command === "scroll" || opts.command === "push") {
    if (!found) throw new Error("Preview is not open");
    const content =
      opts.command === "push" ? fs.readFileSync(0, "utf8") : undefined;
    command(found, { content, line: opts.line });
  } else if (found) {
    found.openedAt = Date.now();
    atomic(path.join(root, found.id, "session.json"), JSON.stringify(found));
    show(found);
    if (opts.line) command(found, { line: opts.line });
  } else {
    opts.type = classify(file, opts.type);
    const id = idFor(file),
      dir = path.join(root, id);
    await discardOldDirectory(dir);
    fs.mkdirSync(dir, { recursive: true, mode: 0o700 });
    opts.workerToken = crypto.randomBytes(16).toString("hex");
    if (resumed !== undefined) {
      opts.resume = true;
      atomic(path.join(dir, "resume.bin"), resumed);
    }
    atomic(path.join(dir, "options.json"), JSON.stringify(opts));
    const child = spawn(
      process.execPath,
      [
        fileURLToPath(new URL("../src/worker.js", import.meta.url)),
        dir,
        opts.workerToken,
      ],
      { detached: true, stdio: "ignore", env: target?.env || process.env },
    );
    child.unref();
    try {
      let ready = false;
      for (let i = 0; i < 100; i++) {
        if (fs.existsSync(path.join(dir, "ready"))) {
          ready = true;
          break;
        }
        await sleep(20);
      }
      if (!ready) throw new Error("Renderer failed to start");
      if (fs.existsSync(path.join(dir, "error.txt")))
        throw new Error(fs.readFileSync(path.join(dir, "error.txt"), "utf8"));
      const page = path.join(dir, "index.html");
      const terminal = await launch(page, opts, target);
      atomic(
        path.join(dir, "session.json"),
        JSON.stringify({
          id,
          file,
          page,
          pid: child.pid,
          workerToken: opts.workerToken,
          openedAt: Date.now(),
          ...terminal,
        }),
      );
      bindings(opts, true);
      if (
        process.env.NVIM &&
        opts.display !== "window" &&
        process.env.PEEKPANE_HEADLESS !== "1"
      ) {
        try {
          execFileSync(
            "nvim",
            ["--server", process.env.NVIM, "--remote", file],
            { stdio: "ignore", timeout: 1500 },
          );
        } catch {
          /* Preview works without remote editing. */
        }
      }
    } catch (e) {
      await stopWorker({
        pid: child.pid,
        workerToken: opts.workerToken,
        page: path.join(dir, "index.html"),
      });
      fs.rmSync(dir, { recursive: true, force: true });
      throw e;
    }
  }
} catch (e) {
  console.error(`peekpane: ${e.message}`);
  process.exitCode = e instanceof UsageError ? 2 : 1;
} finally {
  release?.();
}
