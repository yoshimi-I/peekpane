import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";
const tick = () => new Promise((resolve) => setImmediate(resolve));
test("content updates wait for fonts and a painted frame; cursor updates do not", async () => {
  const frames = [];
  let fontsReady;
  const preview = { replaceChildren() {} };
  const dom = {
    head: { querySelectorAll: () => [] },
    querySelector: () => ({ childNodes: [] }),
  };
  const document = {
    fonts: {
      ready: new Promise((resolve) => {
        fontsReady = resolve;
      }),
    },
    currentScript: { src: "file:///client.js" },
    querySelectorAll: () => [],
    querySelector: (selector) => {
      if (selector.includes("peekpane-revision")) return { content: "1" };
      if (selector.includes("peekpane-type")) return { content: "markdown" };
      return selector === "#preview" ? preview : null;
    },
  };
  const window = { addEventListener() {}, scrollTo() {} };
  const code = fs
    .readFileSync(new URL("../src/client.js", import.meta.url), "utf8")
    .replace(/^import .*;\n/, "")
    .replace("installInteraction();", "");
  vm.runInNewContext(code, {
    window,
    document,
    console,
    URL,
    scrollY: 0,
    location: { href: "file:///preview.html" },
    sessionStorage: { getItem: () => null },
    DOMParser: class {
      parseFromString() {
        return dom;
      }
    },
    requestAnimationFrame: (callback) => {
      frames.push(callback);
    },
  });
  await window.peekpaneReady;
  let complete = false;
  const update = window
    .peekpaneUpdate({ revision: 2, line: 0 }, { revision: 2, html: "updated" })
    .then(() => {
      complete = true;
    });
  await tick();
  assert.equal(complete, false, "update returned before new fonts were ready");
  assert.equal(frames.length, 0);
  fontsReady();
  await tick();
  assert.equal(frames.length, 1);
  frames.shift()();
  await tick();
  assert.equal(
    complete,
    false,
    "one animation callback runs before paint, not after it",
  );
  assert.equal(frames.length, 1);
  frames.shift()();
  await update;
  assert.equal(complete, true);
  await window.peekpaneUpdate({ revision: 2, line: 3 });
  assert.equal(
    frames.length,
    0,
    "cursor-only updates must not wait for another painted frame",
  );
});
