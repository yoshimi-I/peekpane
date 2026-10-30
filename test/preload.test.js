import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";
const source = fs.readFileSync(
  new URL("../src/preload.cjs", import.meta.url),
  "utf8",
);
function preload(active) {
  let api;
  const calls = [];
  vm.runInNewContext(source, {
    navigator: { userActivation: { isActive: active } },
    require: () => ({
      contextBridge: {
        exposeInMainWorld(_name, value) {
          api = value;
        },
      },
      ipcRenderer: {
        send() {},
        invoke(...args) {
          calls.push(args);
          return Promise.resolve(true);
        },
      },
    }),
  });
  return { api, calls };
}
test("preload does not open external URLs without a user activation", async () => {
  const { api, calls } = preload(false);
  assert.equal(await api.openExternal("https://example.com/"), false);
  assert.equal(calls.length, 0);
});
test("preload forwards an activated external URL using a dedicated IPC channel", async () => {
  const { api, calls } = preload(true);
  assert.equal(await api.openExternal("https://example.com/"), true);
  assert.deepEqual(calls, [["peekpane-open-external", "https://example.com/"]]);
});
