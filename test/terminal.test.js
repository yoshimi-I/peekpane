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
