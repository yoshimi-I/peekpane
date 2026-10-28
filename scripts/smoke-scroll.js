import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "peekpane-scroll-"));
const env = {
  ...process.env,
  XDG_CACHE_HOME: tmp,
  XDG_CONFIG_HOME: tmp,
  NVIM: "",
};
delete env.PEEKPANE_HEADLESS;
const cli = (...args) =>
  execFileSync(process.execPath, ["bin/peekpane.js", ...args], {
    env,
    encoding: "utf8",
    timeout: 20000,
  });
async function until(check) {
  for (let i = 0; i < 150; i++) {
    const value = check();
    if (value) return value;
    await new Promise((r) => setTimeout(r, 20));
  }
  throw Error("Scroll update timed out");
}
try {
  const file = path.join(tmp, "long.md");
  fs.writeFileSync(
    file,
    "# Scroll test\n\n" +
      Array.from({ length: 500 }, (_, i) => `Paragraph ${i}\n\n`).join(""),
  );
  cli(file, "--display", "window");
  const s = JSON.parse(cli("ls", "--json"))[0],
    dir = path.dirname(s.page);
  const frame = () =>
    JSON.parse(fs.readFileSync(path.join(dir, "frame.json"), "utf8"));
  assert.equal(frame().scrollY, 0);
  for (let i = 0; i < 20; i++) {
    const name = path.join(dir, `scroll-${String(i).padStart(8, "0")}.json`);
    fs.writeFileSync(name + ".tmp", JSON.stringify({ delta: 54 }));
    fs.renameSync(name + ".tmp", name);
  }
  await until(() => frame().scrollY === 1080);
  const back = path.join(dir, "scroll-back.json");
  fs.writeFileSync(back + ".tmp", JSON.stringify({ delta: -54 }));
  fs.renameSync(back + ".tmp", back);
  await until(() => frame().scrollY === 1026);
  console.log(
    "PASS: twenty rapid down-scroll requests preserved; up-scroll reverses exactly",
  );
} finally {
  cli("close");
  await new Promise((r) => setTimeout(r, 500));
  fs.rmSync(tmp, {
    recursive: true,
    force: true,
    maxRetries: 5,
    retryDelay: 100,
  });
}
