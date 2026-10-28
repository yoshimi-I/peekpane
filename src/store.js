import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import crypto from "node:crypto";
import { execFileSync } from "node:child_process";
export const root = path.join(
  process.env.XDG_CACHE_HOME || path.join(os.homedir(), ".cache"),
  "peekpane",
);
export function init() {
  fs.mkdirSync(root, { recursive: true, mode: 0o700 });
  fs.chmodSync(root, 0o700);
}
export const idFor = (file) =>
  crypto.createHash("sha256").update(file).digest("hex").slice(0, 24);
export function atomic(file, data) {
  const tmp = `${file}.${process.pid}.${crypto.randomBytes(6).toString("hex")}`;
  fs.writeFileSync(tmp, data, { mode: 0o600 });
  fs.renameSync(tmp, file);
}
export function json(file) {
  return JSON.parse(fs.readFileSync(file, "utf8"));
}
export function alive(pid) {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}
// A PID may have been recycled after a crash or reboot. The per-run token is
// also present in the live worker argv, so stale metadata cannot claim it.
export function processCommand(pid) {
  if (!Number.isSafeInteger(pid) || pid <= 1) return undefined;
  try {
    return execFileSync("ps", ["-ww", "-p", String(pid), "-o", "command="], {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
      timeout: 1000,
    }).trim();
  } catch {
    return undefined;
  }
}
export function workerAlive(session) {
  if (!/^[a-f0-9]{32}$/.test(session.workerToken || "")) return false;
  const command = processCommand(session.pid);
  return !!command && command.split(/\s+/).includes(session.workerToken);
}
export async function stopWorker(session) {
  if (!workerAlive(session)) return;
  const dir = path.dirname(session.page);
  atomic(
    path.join(dir, "worker-close"),
    JSON.stringify({ token: session.workerToken }),
  );
  const deadline = Date.now() + 4000;
  while (Date.now() < deadline) {
    try {
      if (json(path.join(dir, "worker-stopped")).token === session.workerToken)
        return;
    } catch {
      /* Worker may not have consumed the stop marker yet. */
    }
    if (!workerAlive(session)) return;
    await new Promise((resolve) => setTimeout(resolve, 40));
  }
  throw new Error("Worker did not acknowledge shutdown");
}
export function sessions() {
  init();
  return fs
    .readdirSync(root, { withFileTypes: true })
    .filter((d) => d.isDirectory())
    .flatMap((d) => {
      try {
        const s = json(path.join(root, d.name, "session.json"));
        return workerAlive(s) ? [s] : [];
      } catch {
        return [];
      }
    });
}
export function config() {
  try {
    return json(
      path.join(
        process.env.XDG_CONFIG_HOME || path.join(os.homedir(), ".config"),
        "peekpane/config.json",
      ),
    );
  } catch (e) {
    if (e.code === "ENOENT") return {};
    throw e;
  }
}
