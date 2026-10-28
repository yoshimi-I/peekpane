#!/usr/bin/env node
import fs from "node:fs";
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
} from "../src/store.js";
import { launch, stop, focus, bindings } from "../src/terminal.js";
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let release;
try {
  const raw = parse(process.argv.slice(2));
  if (raw.command === "help") {
    console.log(
      "peekpane FILE[:LINE] [--split left|right|up|down] [--size 0.2–0.95] [--type TYPE] [--css FILE]\npeekpane open FILE | scroll FILE LINE | push FILE [--line N] < STDIN\npeekpane focus | zoom | close [FILE] | ls [--json] | --version",
    );
    process.exit(0);
  }
  if (raw.command === "version") {
    console.log("0.1.0");
    process.exit(0);
  }
  const opts = {
    split: "right",
    size: 0.5,
    focus_key: "M-p",
    zoom_key: "M-P",
    ...config(),
    ...raw,
  };
  // Validate configured defaults through the same parser as command-line options.
  parse(["x", "--split", opts.split, "--size", String(opts.size)]);
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
  let list = sessions();
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
  const found = list.find((s) => s.file === file);
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
      list.find(
        (s) =>
          s.editor === process.env.TMUX_PANE ||
          s.pane === process.env.TMUX_PANE,
      ) || list.at(-1),
      opts.command === "zoom",
    );
  else if (opts.command === "close") {
    for (const s of list.filter((s) => !file || s.file === file)) {
      await stop(s);
      try {
        process.kill(s.pid, "SIGTERM");
      } catch {
        /* Already stopped. */
      }
      fs.rmSync(path.join(root, s.id), { recursive: true, force: true });
    }
    if (sessions().length === 0) bindings(opts, false);
  } else if (opts.command === "scroll" || opts.command === "push") {
    if (!found) throw new Error("Preview is not open");
    const content =
      opts.command === "push" ? fs.readFileSync(0, "utf8") : undefined;
    command(found, { content, line: opts.line });
  } else if (found) {
    if (opts.line) command(found, { line: opts.line });
  } else {
    opts.type = classify(file, opts.type);
    const id = idFor(file),
      dir = path.join(root, id);
    fs.rmSync(dir, { recursive: true, force: true });
    fs.mkdirSync(dir, { recursive: true, mode: 0o700 });
    atomic(path.join(dir, "options.json"), JSON.stringify(opts));
    const child = spawn(
      process.execPath,
      [fileURLToPath(new URL("../src/worker.js", import.meta.url)), dir],
      { detached: true, stdio: "ignore" },
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
      const terminal = await launch(page, opts);
      atomic(
        path.join(dir, "session.json"),
        JSON.stringify({ id, file, page, pid: child.pid, ...terminal }),
      );
      bindings(opts, true);
      if (process.env.NVIM && process.env.PEEKPANE_HEADLESS !== "1") {
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
      try {
        process.kill(child.pid);
      } catch {
        /* Already exited. */
      }
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
