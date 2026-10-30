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

test("external links accept only explicit HTTP and HTTPS URLs", () => {
  const { externalURL } = require("../src/policy.cjs");
  assert.equal(
    externalURL("https://example.com/docs?q=hello#part"),
    "https://example.com/docs?q=hello#part",
  );
  assert.equal(externalURL("http://localhost:3000/"), "http://localhost:3000/");
  for (const url of [
    "javascript:alert(1)",
    "file:///tmp/a",
    "data:text/html,hi",
    "mailto:a@example.com",
    "vscode://file/tmp/a",
    "//example.com",
    "/local",
    "invalid",
    undefined,
    {},
    "https://",
  ]) {
    assert.equal(externalURL(url), undefined, String(url));
  }
});
