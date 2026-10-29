import { execFileSync, spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import path from "node:path";
import fs from "node:fs";
import { root, atomic, json } from "./store.js";
const run = (cmd, args, env = process.env) =>
  execFileSync(cmd, args, {
    env,
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
const tmuxRun = (session, args) =>
  run("tmux", [
    ...(session.origin?.socket ? ["-S", session.origin.socket] : []),
    ...args,
  ]);
export function show(s) {
  if (process.env.PEEKPANE_HEADLESS === "1") return;
  if (s.display !== "toggle") return;
  if (!s.pane) throw new Error("Toggle display requires tmux");
  fullscreen(s.pane, s);
}
function fullscreen(pane, session) {
  const run = (_cmd, args) => tmuxRun(session, args);
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
export async function launch(page, opts, target) {
  if (process.env.PEEKPANE_HEADLESS === "1") return { display: opts.display };
  if (opts.display === "toggle" && target?.kind !== "tmux")
    throw new Error("Toggle display requires tmux");
  const dir = path.dirname(page);
  const runner = fileURLToPath(new URL("../bin/viewer.js", import.meta.url));
  if (opts.display === "window") {
    const child = spawn(process.execPath, [runner, dir], {
      detached: true,
      stdio: "ignore",
    });
    child.unref();
    return waitForViewer(dir, { display: "window", external: true });
  }
  if (target?.kind === "tmux") {
    const run = (cmd, args) =>
      execFileSync(cmd, ["-S", target.socket, ...args], {
        encoding: "utf8",
        env: target.env,
      }).trim();
    const editor = run("tmux", [
      "display-message",
      "-p",
      "-t",
      target.pane,
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
      target.pane,
      "-l",
      `${Math.round(opts.size * 100)}%`,
    ];
    if (process.env.PEEKPANE_SMOKE === "1") args.push("-e", "PEEKPANE_SMOKE=1");
    args.push(["left", "right"].includes(opts.split) ? "-h" : "-v");
    if (["left", "up"].includes(opts.split)) args.push("-b");
    args.push(`exec ${quote(process.execPath)} ${quote(runner)} ${quote(dir)}`);
    const result = await waitForViewer(dir, {
      origin: target.identity,
      pane: run("tmux", args),
      editor,
      editorZoomed,
      display: opts.display,
    });
    show(result);
    return result;
  }
  const { terminal, from, tty } = target;
  const before = target.listSurfaces ? await target.listSurfaces() : [];
  await terminal.split({
    from,
    direction: opts.split,
    size: opts.size,
    tty,
    command: [
      "/usr/bin/env",
      "-u",
      "TMUX",
      "-u",
      "TMUX_PANE",
      ...(target.env.TERM_PROGRAM
        ? [`TERM_PROGRAM=${target.env.TERM_PROGRAM}`]
        : []),
      process.execPath,
      runner,
      dir,
    ],
  });
  const after = target.listSurfaces ? await target.listSurfaces() : [];
  const added = after.filter(
    (surface) => !before.some((old) => old.id === surface.id),
  );
  return waitForViewer(dir, {
    external: true,
    display: opts.display,
    origin: target.identity,
    viewerPane: added.length === 1 ? added[0].id : undefined,
  });
}
export async function stop(s) {
  const dir = path.dirname(s.page);
  // Never signal a cached viewer PID: it may be stale, or identify the shared
  // host serving other previews. Closing a view is always cooperative.
  if (fs.existsSync(dir)) {
    atomic(path.join(dir, "viewer-close"), "close");
    if (fs.existsSync(path.join(dir, "viewer-shared"))) {
      for (let i = 0; i < 60; i++) {
        if (fs.existsSync(path.join(dir, "viewer-stopped"))) break;
        await new Promise((r) => setTimeout(r, 25));
      }
    }
  }
  if (s.pane) {
    try {
      run("tmux", [
        ...(s.origin?.socket ? ["-S", s.origin.socket] : []),
        "kill-pane",
        "-t",
        s.pane,
      ]);
    } catch {
      /* Pane may already be closed. */
    }
  }
  if (s.display === "toggle" && s.editor) {
    const run = (_cmd, args) => tmuxRun(s, args);
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
export function sessionForPane(list, pane) {
  if (!pane) return list[0];
  const direct = list.find((s) => s.pane === pane || s.editor === pane);
  if (direct) return direct;
  const windowFor = (target) => {
    try {
      return run("tmux", [
        "display-message",
        "-p",
        "-t",
        target,
        "#{window_id}",
      ]);
    } catch {
      return undefined;
    }
  };
  const currentWindow = windowFor(pane);
  return (
    currentWindow &&
    list.find((s) => s.pane && windowFor(s.pane) === currentWindow)
  );
}
export function focus(s, zoom = false, pane) {
  const run = (_cmd, args) => tmuxRun(s, args);
  if (!s?.pane) throw new Error("Focus and zoom require a tmux preview");
  if (zoom) {
    run("tmux", ["resize-pane", "-Z", "-t", s.pane]);
    return;
  }
  const current = pane || run("tmux", ["display-message", "-p", "#{pane_id}"]);
  const target = current === s.pane ? s.editor : s.pane;
  if (s.display === "toggle") fullscreen(target, s);
  else run("tmux", ["select-pane", "-t", target]);
}
export function bindings(opts, enable) {
  if (enable && (opts.display === "window" || opts.origin?.kind === "native"))
    return;
  if (!process.env.TMUX || process.env.PEEKPANE_HEADLESS === "1") return;
  const file = path.join(root, "bindings.json");
  let server;
  try {
    server = run("tmux", ["display-message", "-p", "#{socket_path}:#{pid}"]);
  } catch {
    fs.rmSync(file, { force: true });
    return;
  }
  let previous;
  try {
    previous = json(file);
  } catch {
    /* Missing or obsolete metadata cannot restore bindings. */
  }
  if (previous && previous.server !== server) {
    fs.rmSync(file, { force: true });
    previous = undefined;
  }
  if (enable) {
    if (previous) return;
    const saved = {};
    for (const [key, command] of [
      [opts.focus_key, "focus"],
      [opts.zoom_key, "zoom"],
    ]) {
      if (!key) continue;
      try {
        saved[key] = run("tmux", ["list-keys", "-T", "root", key]);
        // tmux 3.7 can send a single result to the status line rather than stdout.
        if (!saved[key])
          saved[key] =
            run("tmux", ["list-keys", "-T", "root"])
              .split("\n")
              .find((line) => {
                const fields = line.trim().split(/\s+/),
                  table = fields.indexOf("-T");
                return (
                  fields[table + 1] === "root" && fields[table + 2] === key
                );
              }) || "";
      } catch {
        saved[key] = "";
      }
      const cli = fileURLToPath(new URL("../bin/peekpane.js", import.meta.url));
      run("tmux", [
        "bind-key",
        "-n",
        key,
        "run-shell",
        `${quote(process.execPath)} ${quote(cli)} ${command} --pane ${quote("#{pane_id}")}`,
      ]);
    }
    atomic(file, JSON.stringify({ server, keys: saved }));
  } else if (previous) {
    try {
      for (const [key, binding] of Object.entries(previous.keys)) {
        run("tmux", ["unbind-key", "-n", key]);
        if (binding) {
          const temp = path.join(root, "restore.tmux");
          atomic(temp, binding + "\n");
          try {
            run("tmux", ["source-file", temp]);
          } finally {
            fs.rmSync(temp, { force: true });
          }
        }
      }
    } catch (error) {
      // The server can disappear between identity lookup and restoration.
      try {
        run("tmux", ["display-message", "-p", "#{pid}"]);
      } catch {
        return;
      }
      throw error;
    } finally {
      fs.rmSync(file, { force: true });
    }
  }
}
