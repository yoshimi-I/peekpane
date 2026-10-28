import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { bindings } from "./terminal.js";
import { render } from "./render.js";
import { atomic, json, sessions, alive } from "./store.js";
const dir = process.argv[2];
const opts = json(path.join(dir, "options.json"));
const media = ["image", "pdf", "video", "audio"].includes(opts.type);
let revision = 0,
  last = "",
  line = opts.line || 1,
  lastContent;
let diskTimer, commandTimer;
function state() {
  atomic(
    path.join(dir, "state.js"),
    `window.peekpaneState=${JSON.stringify({ revision, line })};`,
  );
}
function publish(content) {
  const buffer = Buffer.isBuffer(content) ? content : Buffer.from(content);
  if (!media && lastContent?.equals(buffer)) return;
  try {
    const html = render({ ...opts, content }).replace(
      "</head>",
      `<meta name="peekpane-revision" content="${revision + 1}"></head>`,
    );
    atomic(path.join(dir, "index.html"), html);
    atomic(
      path.join(dir, "content.js"),
      `window.peekpaneContent=${JSON.stringify({ html, revision: ++revision }).replace(/</g, "\\u003c")};`,
    );
    lastContent = buffer;
    fs.rmSync(path.join(dir, "error.txt"), { force: true });
    state();
  } catch (e) {
    atomic(path.join(dir, "error.txt"), e.message);
  }
}
function disk() {
  try {
    const stat = fs.statSync(opts.file);
    const signature = `${stat.mtimeMs}:${stat.size}`;
    if (signature !== last) {
      last = signature;
      publish(media ? "" : fs.readFileSync(opts.file));
    }
  } catch (e) {
    atomic(path.join(dir, "error.txt"), e.message);
  }
}
function commands() {
  if (!fs.existsSync(dir)) return end();
  for (const file of fs
    .readdirSync(dir)
    .filter((f) => f.startsWith("command-") && f.endsWith(".json"))
    .sort()) {
    try {
      const cmd = json(path.join(dir, file));
      if (cmd.content !== undefined) publish(cmd.content);
      if (cmd.line && cmd.line !== line) {
        line = cmd.line;
        state();
      }
      fs.unlinkSync(path.join(dir, file));
    } catch (e) {
      atomic(path.join(dir, "error.txt"), e.message);
    }
  }
}
const sourceWatch = fs.watch(path.dirname(opts.file), (_event, file) => {
  if (file && String(file) !== path.basename(opts.file)) return;
  clearTimeout(diskTimer);
  diskTimer = setTimeout(disk, 30);
});
const commandWatch = fs.watch(dir, (_event, file) => {
  if (
    !file ||
    !String(file).startsWith("command-") ||
    !String(file).endsWith(".json")
  )
    return;
  clearTimeout(commandTimer);
  commandTimer = setTimeout(commands, 10);
});
sourceWatch.on("error", end);
commandWatch.on("error", end);
disk();
commands();
atomic(path.join(dir, "ready"), "ready");
const health = setInterval(() => {
  if (!fs.existsSync(dir)) return end();
  if (fs.existsSync(path.join(dir, "viewer-stopped"))) {
    fs.rmSync(dir, { recursive: true, force: true });
    if (sessions().length === 0) bindings(opts, false);
    return end();
  }
  if (process.env.PEEKPANE_HEADLESS === "1") return;
  let session;
  try {
    session = json(path.join(dir, "session.json"));
  } catch {
    return;
  }
  if (session.external) {
    try {
      const pid = Number(fs.readFileSync(path.join(dir, "viewer.pid"), "utf8"));
      if (!alive(pid)) {
        fs.rmSync(dir, { recursive: true, force: true });
        end();
      }
    } catch {
      /* Viewer may still be starting. */
    }
  }
  if (session.pane) {
    try {
      execFileSync(
        "tmux",
        ["display-message", "-p", "-t", session.pane, "#{pane_id}"],
        { stdio: "ignore", timeout: 1000 },
      );
    } catch {
      fs.rmSync(dir, { recursive: true, force: true });
      if (sessions().length === 0) bindings(opts, false);
      end();
    }
  }
}, 3000);
function end() {
  sourceWatch.close();
  commandWatch.close();
  clearTimeout(diskTimer);
  clearTimeout(commandTimer);
  clearInterval(health);
  process.exit(0);
}
process.on("SIGTERM", end);
process.on("SIGINT", end);
