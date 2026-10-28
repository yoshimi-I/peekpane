import { test } from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";
const require = createRequire(import.meta.url);
const { allowed } = require("../src/policy.cjs");
test("viewer only allows local resource schemes", () => {
  for (const url of [
    "file:///tmp/a.html",
    "data:image/png;base64,AA",
    "blob:file:///x",
    "about:blank",
  ])
    assert.equal(allowed(url), true, url);
  for (const url of [
    "https://example.com",
    "http://localhost:3000",
    "ws://localhost",
    "ftp://host/file",
    "javascript:alert(1)",
    "invalid",
    "file://remote.example/share/file.html",
  ])
    assert.equal(allowed(url), false, url);
});
