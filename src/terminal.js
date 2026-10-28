import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import path from "node:path";
import fs from "node:fs";
import { root, atomic, json } from "./store.js";
const run = (cmd, args) =>
  execFileSync(cmd, args, {
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  }).trim();
const quote = (s) => `'${String(s).replace(/'/g, "'\\''")}'`;
async function waitForViewer(dir, terminal) {
  for (let i = 0; i < 160; i++) {
    if (fs.existsSync(path.join(dir, "viewer-ready"))) return terminal;
    await new Promise((r) => setTimeout(r, 50));
  }
  await stop({ ...terminal, page: path.join(dir, "index.html") });
  let error = "Viewer failed to start";
  for (const log of [
    path.join(dir, "viewer.stderr.log"),
    path.join(path.dirname(dir), "renderer.stderr.log"),
  ]) {
    try {
      error += ": " + fs.readFileSync(log, "utf8").slice(-2000);
      break;
    } catch {
      /* Runtime may fail before writing a log. */
    }
  }
  throw new Error(error);
}
export function show(s) {
  if (process.env.PEEKPANE_HEADLESS === "1") return;
  if (s.display !== "toggle") return;
  if (!s.pane) throw new Error("Toggle display requires tmux");
  fullscreen(s.pane);
}
function fullscreen(pane) {
  run("tmux", ["select-pane", "-Z", "-t", pane]);
  if (
    run("tmux", [
      "display-message",
      "-p",
      "-t",
      pane,
      "#{window_zoomed_flag}",
    ]) !== "1"
  )
    run("tmux", ["resize-pane", "-Z", "-t", pane]);
}
export async function launch(page, opts) {
  if (process.env.PEEKPANE_HEADLESS === "1") return { display: opts.display };
  if (opts.display === "toggle" && !process.env.TMUX)
    throw new Error("Toggle display requires tmux");
  const dir = path.dirname(page);
  const runner = fileURLToPath(new URL("../bin/viewer.js", import.meta.url));
  if (process.env.TMUX) {
    const editor = run("tmux", [
      "display-message",
      "-p",
      "-t",
      process.env.TMUX_PANE || "{last}",
      "#{pane_id}",
    ]);
    const editorZoomed =
      run("tmux", [
        "display-message",
        "-p",
        "-t",
        editor,
        "#{window_zoomed_flag}",
      ]) === "1";
    const args = [
      "split-window",
      "-d",
      "-P",
      "-F",
      "#{pane_id}",
      "-t",
      process.env.TMUX_PANE || "{last}",
      "-l",
      `${Math.round(opts.size * 100)}%`,
    ];
    if (process.env.PEEKPANE_SMOKE === "1") args.push("-e", "PEEKPANE_SMOKE=1");
    args.push(["left", "right"].includes(opts.split) ? "-h" : "-v");
    if (["left", "up"].includes(opts.split)) args.push("-b");
    args.push(`exec ${quote(process.execPath)} ${quote(runner)} ${quote(dir)}`);
    const result = await waitForViewer(dir, {
      pane: run("tmux", args),
      editor,
      editorZoomed,
      display: opts.display,
    });
    show(result);
    return result;
  }
  const { detect, callerTty } = await import("@zenbu-labs/pixel/terminal");
  const terminal = detect();
  await terminal?.prepare?.();
  const tty = callerTty().path;
  const from = await terminal?.getCurrentPane?.({ tty, cwd: process.cwd() });
  if (!from || !terminal?.split)
    throw new Error(
      "This terminal cannot split panes; run peekpane inside tmux",
    );
  await terminal.split({
    from,
    direction: opts.split,
    size: opts.size,
    tty,
    command: [process.execPath, runner, dir],
  });
  return waitForViewer(dir, { external: true });
}
export async function stop(s) {
  const dir = path.dirname(s.page);
  if (fs.existsSync(path.join(dir, "viewer-shared"))) {
    atomic(path.join(dir, "viewer-close"), "close");
    for (let i = 0; i < 60; i++) {
      if (fs.existsSync(path.join(dir, "viewer-stopped"))) break;
      await new Promise((r) => setTimeout(r, 25));
    }
  } else {
    try {
      const pid = Number(
        fs.readFileSync(path.join(path.dirname(s.page), "viewer.pid"), "utf8"),
      );
      if (Number.isSafeInteger(pid) && pid > 1) process.kill(pid, "SIGTERM");
    } catch {
      /* Viewer may already be closed. */
    }
  }
  if (s.pane) {
    try {
      run("tmux", ["kill-pane", "-t", s.pane]);
    } catch {
      /* Pane may already be closed. */
    }
  }
  if (s.display === "toggle" && s.editor) {
    try {
      run("tmux", ["select-pane", "-Z", "-t", s.editor]);
      const zoomed =
        run("tmux", [
          "display-message",
          "-p",
          "-t",
          s.editor,
          "#{window_zoomed_flag}",
        ]) === "1";
      if (zoomed !== s.editorZoomed)
        run("tmux", ["resize-pane", "-Z", "-t", s.editor]);
    } catch {
      /* Editor may have closed independently. */
    }
  }
}
export function focus(s, zoom = false) {
  if (!s?.pane) throw new Error("Focus and zoom require a tmux preview");
  if (zoom) {
    run("tmux", ["resize-pane", "-Z", "-t", s.pane]);
    return;
  }
  const current = run("tmux", ["display-message", "-p", "#{pane_id}"]);
  const target = current === s.pane ? s.editor : s.pane;
  if (s.display === "toggle") fullscreen(target);
  else run("tmux", ["select-pane", "-t", target]);
}
export function bindings(opts, enable) {
  if (!process.env.TMUX || process.env.PEEKPANE_HEADLESS === "1") return;
  const file = path.join(root, "bindings.json");
  if (enable) {
    if (fs.existsSync(file)) return;
    const saved = {};
    for (const [key, command] of [
      [opts.focus_key, "focus"],
      [opts.zoom_key, "zoom"],
    ]) {
      if (!key) continue;
      try {
        saved[key] = run("tmux", ["list-keys", "-T", "root", key]);
      } catch {
        saved[key] = "";
      }
      const cli = path.resolve(
        new URL("../bin/peekpane.js", import.meta.url).pathname,
      );
      run("tmux", [
        "bind-key",
        "-n",
        key,
        "run-shell",
        `${quote(process.execPath)} ${quote(cli)} ${command}`,
      ]);
    }
    atomic(file, JSON.stringify(saved));
  } else if (fs.existsSync(file)) {
    const saved = json(file);
    for (const [key, binding] of Object.entries(saved)) {
      run("tmux", ["unbind-key", "-n", key]);
      if (binding) {
        const temp = path.join(root, "restore.tmux");
        atomic(temp, binding + "\n");
        run("tmux", ["source-file", temp]);
        fs.unlinkSync(temp);
      }
    }
    fs.unlinkSync(file);
  }
}
