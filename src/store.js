import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import crypto from "node:crypto";
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
export function sessions() {
  init();
  return fs
    .readdirSync(root, { withFileTypes: true })
    .filter((d) => d.isDirectory())
    .flatMap((d) => {
      try {
        const s = json(path.join(root, d.name, "session.json"));
        return alive(s.pid) ? [s] : [];
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
