import { test } from "node:test";
import assert from "node:assert/strict";
import { parse, classify } from "../src/options.js";
import { render } from "../src/render.js";
test("CLI accepts file line and options", () => {
  const o = parse(["open", "a.md:12", "--split", "left", "--size", "0.4"]);
  assert.equal(o.file, "a.md");
  assert.equal(o.line, 12);
  assert.equal(o.size, 0.4);
});
test("CLI rejects bad options and ranges", () => {
  for (const args of [
    ["a", "--size", "1"],
    ["a", "--split", "foo"],
    ["a", "--wat"],
    ["scroll", "a", "0"],
    ["open"],
  ])
    assert.throws(() => parse(args));
});
test("classifies extensions and overrides", () => {
  assert.equal(classify("a.mmd"), "mermaid");
  assert.equal(classify("a.xlsx"), "excel");
  assert.equal(classify("a.zz"), "text");
  assert.equal(classify("a.md", "html"), "html");
});
test("markdown renders tables tasks footnotes math mermaid and source anchors", () => {
  const s = render({
    file: "/tmp/a.md",
    type: "markdown",
    content:
      "# Hello\n\n- [x] yes\n\n| A | B |\n|---|---|\n| 1 | 2 |\n\nFoot[^1]\n\n[^1]: note\n\n$x^2$\n\n```mermaid\ngraph TD; A-->B\n```",
  });
  for (const pattern of [
    "<table",
    "checkbox",
    "footnote",
    "katex",
    "mermaid",
    'data-line="1"',
    "Content-Security-Policy",
  ])
    assert.ok(s.includes(pattern), pattern);
  assert.ok(!s.includes("https://cdn"));
});
test("HTML preserves relative base and blocks remote connections", () => {
  const s = render({
    file: "/tmp/docs/a.html",
    type: "html",
    content: '<img src="a.png">',
  });
  assert.ok(s.includes("file:///tmp/docs/"));
  assert.ok(s.includes("connect-src 'none'"));
});
test("media and text escape unsafe file names/content", () => {
  assert.ok(render({ file: "/tmp/a.mp4", type: "video" }).includes("<video"));
  assert.ok(
    render({
      file: "/tmp/a.txt",
      type: "text",
      content: "<script>x</script>",
    }).includes("&lt;script&gt;"),
  );
});
test("PDF wrapper permits the local viewer frame without allowing remote frames", () => {
  const page = render({ file: "/tmp/a.pdf", type: "pdf" });
  assert.ok(page.includes("frame-src file:"));
  assert.ok(!page.includes("frame-src https:"));
});
test("CLI supports configured split and toggle display modes", () => {
  assert.equal(parse(["a.md", "--display", "toggle"]).display, "toggle");
  assert.equal(parse(["a.md", "--display", "split"]).display, "split");
  assert.throws(() => parse(["a.md", "--display", "other"]));
});
test("window display prepares a Neovim-local preview", () => {
  assert.equal(parse(["a.md", "--display", "window"]).display, "window");
});
test("offline previews retain badge links and local icons without broken remote images", () => {
  const page = render({
    file: "/tmp/README.md",
    type: "markdown",
    content:
      "[![CI](https://github.com/owner/repo/badge.svg)](https://github.com/owner/repo/actions)\n\n![Local](docs/icon.png)\n\n![Embedded](data:image/png;base64,AA)",
  });
  assert.match(
    page,
    /<a href="https:\/\/github.com\/owner\/repo\/actions"><span class="offline-image"[^>]*>CI<\/span><\/a>/,
  );
  assert.ok(!page.includes('<img src="https://'));
  assert.ok(page.includes('<img src="docs/icon.png"'));
  assert.ok(page.includes('<img src="data:image/png;base64,AA"'));
  assert.ok(page.includes("connect-src 'none'"));
});
test("HTML wrapper retains root and body attributes without disturbing raw script text", () => {
  const page = render({
    file: "/tmp/theme.html",
    type: "html",
    content: `<!doctype html><html lang="ja" dir="rtl"><head><base href="https://wrong.invalid/"><style>body.dark{background:rgb(12,34,56)}</style></head><body class="dark" style="color:white" data-note="a>b"><h1>Themed</h1><script>document.body.dataset.sample='<body class="sample">';</script></body></html>`,
  });
  assert.match(page, /<html lang="ja" dir="rtl">/);
  assert.match(page, /<body class="dark" style="color:white" data-note="a>b">/);
  assert.ok(
    page.includes(`document.body.dataset.sample='<body class="sample">';`),
  );
  assert.ok(!page.includes('href="https://wrong.invalid/"'));
  assert.ok(page.indexOf("Content-Security-Policy") < page.indexOf("<style>"));
});
