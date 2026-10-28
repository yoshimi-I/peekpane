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
    "<style>::-webkit-scrollbar{display:none}</style>\n\n# Scroll test\n\n" +
      Array.from({ length: 500 }, (_, i) => `Paragraph ${i}\n\n`).join(""),
  );
  cli(file, "--display", "window");
  const s = JSON.parse(cli("ls", "--json"))[0],
    dir = path.dirname(s.page);
  const frame = () =>
    JSON.parse(fs.readFileSync(path.join(dir, "frame.json"), "utf8"));
  assert.equal(frame().scrollY, 0);
  fs.writeFileSync(
    path.join(dir, "viewport.json.tmp"),
    JSON.stringify({
      width: 600,
      height: 400,
      pixelWidth: 900,
      pixelHeight: 600,
    }),
  );
  fs.renameSync(
    path.join(dir, "viewport.json.tmp"),
    path.join(dir, "viewport.json"),
  );
  await until(() => frame().width === 900 && frame().height === 600);
  const top = fs.readFileSync(frame().path);
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
  const send = (id, key, count) => {
    const name = path.join(dir, `action-${id}.json`);
    fs.writeFileSync(name + ".tmp", JSON.stringify({ key, count }));
    fs.renameSync(name + ".tmp", name);
  };
  send("0000", "k", 100);
  await until(() => frame().scrollY === 0);
  assert.ok(
    fs.readFileSync(frame().path).equals(top),
    "capture did not return to the original pixels",
  );
  for (let i = 1; i <= 60; i++) send(String(i).padStart(4, "0"), "j", 1);
  await until(() => frame().scrollY === 2880);
  assert.ok(
    !fs.readFileSync(frame().path).equals(top),
    "scroll metadata advanced without updating pixels",
  );
  send("9999", "k", 60);
  await until(() => frame().scrollY === 0);
  assert.ok(
    fs.readFileSync(frame().path).equals(top),
    "batched reverse actions lost pixels or position",
  );
  console.log(
    "PASS: scroll queue, sixty held-key actions, exact reverse position and captured pixels",
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
