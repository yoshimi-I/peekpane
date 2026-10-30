// Real offscreen Chromium input, including native text selection and default controls.
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "peekpane-mouse-"));
const env = {
  ...process.env,
  XDG_CACHE_HOME: tmp,
  XDG_CONFIG_HOME: tmp,
  NVIM: "",
  PEEKPANE_SMOKE: "1",
};
delete env.PEEKPANE_HEADLESS;
const cli = (...args) =>
  execFileSync(process.execPath, ["bin/peekpane.js", ...args], {
    env,
    encoding: "utf8",
    timeout: 20000,
  });
const pause = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
async function until(check, message) {
  const deadline = Date.now() + 12000;
  while (Date.now() < deadline) {
    if (check()) return;
    await pause(25);
  }
  throw Error(message);
}
let host;
try {
  const file = path.join(tmp, "mouse.html");
  fs.writeFileSync(
    file,
    `<!doctype html><html><head><style>
    body{margin:0;height:3000px}#copy{position:absolute;left:20px;top:100px;margin:0;font:20px/28px monospace}
    #check{position:absolute;left:20px;top:20px;width:25px;height:25px;margin:0}
    #sheet{position:absolute;left:20px;top:160px;width:120px;height:40px;margin:0}
    #jump{position:absolute;left:20px;top:220px}#anchor{position:absolute;top:1500px}
    </style></head><body>
    <input id="check" type="checkbox" onchange="document.body.dataset.local='checked:'+this.checked">
    <p id="copy">Selectable preview text</p>
    <button id="sheet" data-sheet="second" onclick="setTimeout(()=>document.body.dataset.local='sheet:'+document.querySelector('[data-sheet-panel=second]').hidden)">Second sheet</button>
    <section data-sheet-panel="first">First sheet</section><section data-sheet-panel="second" hidden>Second sheet contents</section>
    <a id="jump" href="#anchor">Jump to anchor</a><h2 id="anchor">Anchor target</h2>
    <a id="external" style="position:absolute;left:20px;top:280px" href="https://example.com/docs"><span>External documentation</span></a>
    <a id="blank" style="position:absolute;left:20px;top:330px" href="https://example.com/blank" target="_blank">New window link</a>
    <button style="position:absolute;left:20px;top:380px" onclick="document.querySelector('#external').click()">Synthetic link click</button>
    <button style="position:absolute;left:20px;top:430px" onclick="window.peekpaneHost.openExternal?.('file:///tmp/should-not-open')">Unsupported scheme</button>
    <script>setTimeout(()=>window.peekpaneHost.openExternal?.('https://example.com/automatic'),0)</script>
    </body></html>`,
  );
  cli(file, "--display", "window");
  const dir = path.dirname(JSON.parse(cli("ls", "--json"))[0].page);
  host = Number(fs.readFileSync(path.join(dir, "viewer.pid"), "utf8"));
  const read = (name) =>
    JSON.parse(fs.readFileSync(path.join(dir, name), "utf8"));
  const frame = () => read("frame.json");
  const snapshot = () => read("viewer-snapshot.json");
  let sequence = 0;
  const actions = async (events) => {
    const previous = frame().path;
    for (const event of events) {
      const f = path.join(
        dir,
        `action-${String(++sequence).padStart(8, "0")}.json`,
      );
      fs.writeFileSync(f + ".tmp", JSON.stringify(event));
      fs.renameSync(f + ".tmp", f);
    }
    await until(
      () => frame().path !== previous,
      "Mouse input did not publish a frame",
    );
  };
  const mouse = (type, x, y, extra = {}) => ({
    kind: "mouse",
    type,
    x,
    y,
    ...extra,
  });
  const click = (x, y) =>
    actions([
      mouse("mouseDown", x, y, { button: "left" }),
      mouse("mouseUp", x, y, { button: "left" }),
    ]);
  await click(30, 30);
  await until(
    () => snapshot().localScript === "checked:true",
    "Native checkbox click was not delivered",
  );
  await click(60, 180);
  await until(
    () => snapshot().localScript === "sheet:false",
    "Mouse click did not switch the actual sheet panel",
  );
  await actions([
    mouse("mouseDown", 21, 113, { button: "left" }),
    mouse("mouseMove", 100, 113, {
      button: "left",
      modifiers: ["leftButtonDown"],
    }),
    mouse("mouseMove", 185, 113, {
      button: "left",
      modifiers: ["leftButtonDown"],
    }),
    mouse("mouseUp", 185, 113, { button: "left" }),
  ]);
  await until(
    () => frame().selectionLength > 0,
    "Native drag did not select DOM text",
  );
  await actions([{ key: "y" }]);
  await until(
    () => fs.existsSync(path.join(dir, "yank.json")),
    "Mouse-selected text was not copied",
  );
  assert.match(read("yank.json").text, /Selectable/);
  assert.equal(fs.existsSync(path.join(dir, "external-links.json")), false);
  await click(50, 289);
  await until(
    () => fs.existsSync(path.join(dir, "external-links.json")),
    "Native external link click did not reach the browser opener",
  );
  assert.deepEqual(read("external-links.json").urls, [
    "https://example.com/docs",
  ]);
  await click(50, 339);
  await until(
    () => read("external-links.json").urls.length === 2,
    "A target=_blank link did not reach the browser opener",
  );
  assert.deepEqual(read("external-links.json").urls, [
    "https://example.com/docs",
    "https://example.com/blank",
  ]);
  await actions([
    mouse("mouseDown", 50, 289, { button: "middle" }),
    mouse("mouseUp", 50, 289, { button: "middle" }),
  ]);
  await until(
    () => read("external-links.json").urls.length === 3,
    "A middle-clicked external link did not reach the browser opener",
  );
  await click(50, 390);
  await click(50, 440);
  assert.equal(
    read("external-links.json").urls.length,
    3,
    "Synthetic clicks and unsupported schemes must not launch a browser",
  );
  assert.match(
    snapshot().text,
    /Selectable preview text/,
    "External link clicks must retain the local document",
  );
  await click(50, 235);
  await until(
    () => frame().scrollY > 1000,
    "Native anchor click did not navigate within the document",
  );
  const beforeWheel = frame().scrollY;
  await actions([mouse("mouseWheel", 200, 200, { deltaY: -160 })]);
  await until(
    () => frame().scrollY > beforeWheel,
    "Native mouse wheel did not scroll the document",
  );
  console.log(
    "PASS: native mouse controls, selection/copy, scrolling, and external link dispatch",
  );
} finally {
  cli("close");
  const deadline = Date.now() + 10000;
  while (host && Date.now() < deadline) {
    try {
      process.kill(host, 0);
    } catch {
      break;
    }
    await pause(50);
  }
  fs.rmSync(tmp, {
    recursive: true,
    force: true,
    maxRetries: 5,
    retryDelay: 100,
  });
}
