import { test } from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";
const require = createRequire(import.meta.url);
const { dispatchInput } = require("../src/input.cjs");
test("mouse moves coalesce without losing clicks, wheel deltas, or key ordering", async () => {
  const received = [];
  const contents = {
    sendInputEvent: (event) => received.push(event),
    executeJavaScript: async (code) => {
      if (code.includes('"y"')) received.push("y");
    },
  };
  const mouse = (type, x, extra = {}) => ({
    kind: "mouse",
    type,
    x,
    y: 30,
    ...extra,
  });
  await dispatchInput(contents, [
    mouse("mouseDown", 10, { button: "left" }),
    mouse("mouseMove", 15, { button: "left" }),
    mouse("mouseMove", 30, { button: "left" }),
    mouse("mouseUp", 30, { button: "left" }),
    { key: "y" },
    mouse("mouseWheel", 40, { deltaY: -120 }),
    mouse("mouseWheel", 40, { deltaY: -120 }),
  ]);
  assert.deepEqual(
    received.map((e) => (typeof e === "string" ? e : [e.type, e.x, e.deltaY])),
    [
      ["mouseDown", 10, undefined],
      ["mouseMove", 30, undefined],
      ["mouseUp", 30, undefined],
      "y",
      ["mouseWheel", 40, -240],
    ],
  );
});
test("malformed native input is ignored without preventing the next valid input", async () => {
  const received = [];
  const contents = {
    sendInputEvent: (e) => received.push(e),
    executeJavaScript: async () => {},
  };
  await dispatchInput(contents, [
    null,
    {
      kind: "mouse",
      type: "mouseDown",
      x: 0,
      y: 0,
      button: "left",
      clickCount: NaN,
    },
    { kind: "mouse", type: "keyDown", x: 0, y: 0 },
    { kind: "mouse", type: "mouseDown", x: NaN, y: 0, button: "left" },
    { kind: "mouse", type: "mouseDown", x: 0, y: 0, button: "invalid" },
    { kind: "mouse", type: "mouseWheel", x: 0, y: 0, deltaY: Infinity },
    { kind: "mouse", type: "mouseUp", x: 10, y: 20, button: "left" },
  ]);
  assert.equal(received.length, 1);
  assert.equal(received[0].type, "mouseUp");
});
