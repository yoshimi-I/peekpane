import { execFileSync } from "node:child_process";
import fs from "node:fs";
const execute = (command, args) =>
  execFileSync(command, args, {
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
    timeout: 5000,
  }).trim();
const canonical = (value) => {
  if (!value) return value;
  try {
    return fs.realpathSync(value);
  } catch {
    return value;
  }
};
export async function ghosttySurfaces() {
  return JSON.parse(
    execute("osascript", [
      "-l",
      "JavaScript",
      "-e",
      'JSON.stringify(Application("Ghostty").terminals().map(t => ({id:t.id(),cwd:t.workingDirectory()})))',
    ]),
  );
}
export async function locateTerminal({
  env = process.env,
  cwd = process.cwd(),
  pid = process.pid,
  platform = process.platform,
  run = execute,
  pixel,
  ghosttySurfaces: listSurfaces = ghosttySurfaces,
  sessions = [],
} = {}) {
  const ttys = new Set();
  try {
    const processes = new Map(
      run("ps", ["-axo", "pid=,ppid=,tty="])
        .split("\n")
        .map((line) => {
          const [id, parent, tty] = line.trim().split(/\s+/);
          return [Number(id), { parent: Number(parent), tty }];
        }),
    );
    const seen = new Set();
    while (pid > 1 && !seen.has(pid)) {
      seen.add(pid);
      const entry = processes.get(pid);
      if (!entry) break;
      if (entry.tty && entry.tty !== "??" && entry.tty !== "?")
        ttys.add(`/dev/${entry.tty}`);
      pid = entry.parent;
    }
  } catch {
    /* Native adapters can still locate a terminal without ps. */
  }
  const inherited = env.TMUX?.match(/^(.*),(\d+),(\d+)$/);
  let panes = [];
  if (inherited) {
    try {
      panes = run("tmux", [
        "-S",
        inherited[1],
        "list-panes",
        "-a",
        "-F",
        "#{pane_id}\t#{pane_tty}\t#{pane_current_path}\t#{pid}",
      ])
        .split("\n")
        .map((line) => {
          const [pane, tty, directory, serverPid] = line.split("\t");
          return { pane, tty, directory, serverPid: Number(serverPid) };
        });
    } catch {
      /* A daemon can inherit an expired tmux socket. */
    }
    const match = panes.find((pane) => ttys.has(pane.tty));
    if (match) return tmuxContext(match);
  }
  function tmuxContext(pane) {
    const socket = inherited[1];
    const identity = {
      kind: "tmux",
      socket,
      serverPid: pane.serverPid,
      pane: pane.pane,
    };
    return {
      ...identity,
      identity,
      env: {
        ...env,
        TMUX: `${socket},${pane.serverPid},${inherited[3]}`,
        TMUX_PANE: pane.pane,
      },
    };
  }
  const nativeEnv = { ...env };
  delete nativeEnv.TMUX;
  delete nativeEnv.TMUX_PANE;
  if (nativeEnv.GHOSTTY_RESOURCES_DIR) nativeEnv.TERM_PROGRAM = "ghostty";
  pixel ??= await import("@zenbu-labs/pixel/terminal");
  const terminal = pixel.detect(nativeEnv);
  await terminal?.prepare?.();
  const tty = pixel.callerTty().path;
  let from;
  try {
    from = await terminal?.getCurrentPane?.({ tty, cwd });
  } catch {
    /* Quick Terminal is missing from older adapters' window lists. */
  }
  const ghostty =
    platform === "darwin" &&
    (terminal?.name?.toLowerCase() === "ghostty" ||
      nativeEnv.GHOSTTY_RESOURCES_DIR);
  if (!from && ghostty) {
    const viewers = new Set(sessions.map((session) => session.viewerPane));
    const candidates = (await listSurfaces()).filter(
      (surface) =>
        !viewers.has(surface.id) && canonical(surface.cwd) === canonical(cwd),
    );
    if (candidates.length > 1)
      throw new Error(
        "Multiple Ghostty terminals use this directory; source terminal is ambiguous. Run peekpane directly in the intended terminal.",
      );
    from = candidates[0];
  }
  if (from && terminal?.split) {
    const identity = {
      kind: "native",
      terminal: terminal.name || "native",
      pane: typeof from === "string" ? from : from.id,
    };
    return {
      kind: "native",
      identity,
      terminal,
      from,
      tty,
      env: nativeEnv,
      listSurfaces: ghostty ? listSurfaces : undefined,
    };
  }
  // Detached tmux callers need both a live server identity and a matching cwd.
  const explicit =
    inherited &&
    panes.find(
      (pane) =>
        pane.pane === env.TMUX_PANE &&
        pane.serverPid === Number(inherited[2]) &&
        canonical(pane.directory) === canonical(cwd),
    );
  if (explicit) return tmuxContext(explicit);
  throw new Error(
    "Cannot identify the source terminal. Run peekpane directly in Ghostty or inside tmux; inherited tmux variables alone are insufficient.",
  );
}
export function sameTerminal(session, target) {
  if (!target) return true;
  if (session.origin)
    return ["kind", "terminal", "socket", "serverPid", "pane"].every(
      (key) => session.origin[key] === target.identity[key],
    );
  return target.kind === "tmux" && session.editor === target.pane;
}
