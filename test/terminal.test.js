import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { test } from "node:test";
import assert from "node:assert/strict";
import { render } from "../src/render.js";
import { parse } from "../src/options.js";
test("user HTML policy precedes scripts and removes hostile base tags", () => {
  const s = render({
    file: "/tmp/a.html",
    type: "html",
    content:
      '<html><head><base href="https://evil.test/"><script src="https://evil.test/x.js"></script></head><body>hi</body></html>',
  });
  assert.ok(
    s.indexOf("Content-Security-Policy") < s.indexOf("https://evil.test/x.js"),
  );
  assert.equal((s.match(/<base /g) || []).length, 1);
});
test("colon in file names is preserved unless followed by a line", () => {
  assert.equal(parse(["a:b.md"]).file, "a:b.md");
});

test("existing filenames ending in digits after a colon take precedence over line shorthand", () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "peekpane-colon-"));
  const base = path.join(tmp, "build"),
    file = base + ":2024";
  try {
    fs.writeFileSync(file, "literal filename");
    fs.writeFileSync(base, "base file");
    assert.equal(parse([file]).file, file);
    assert.equal(parse([file]).line, undefined);
    assert.deepEqual(parse([file, "--line", "3"]), {
      command: "open",
      file,
      line: 3,
    });
    assert.deepEqual(parse([base + ":12"]), {
      command: "open",
      file: base,
      line: 12,
    });
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
});
