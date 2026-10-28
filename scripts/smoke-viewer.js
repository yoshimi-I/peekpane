// Real terminal integration check for the standalone CSS viewer (no browser UI).
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "peekpane-smoke-"));
const env = {
  ...process.env,
  XDG_CACHE_HOME: tmp,
  XDG_CONFIG_HOME: tmp,
  NVIM: "",
  PEEKPANE_SMOKE: "1",
};
delete env.PEEKPANE_HEADLESS;
const cli = (args, input) =>
  execFileSync(process.execPath, ["bin/peekpane.js", ...args], {
    env,
    input,
    encoding: "utf8",
    timeout: 15000,
  }).trim();
const pause = (ms) => new Promise((r) => setTimeout(r, ms));
async function until(check) {
  for (let i = 0; i < 100; i++) {
    try {
      const result = check();
      if (result) return result;
    } catch {
      /* Viewer may still be loading. */
    }
    await pause(50);
  }
  throw new Error("Viewer timed out");
}
try {
  const source = path.join(tmp, "source.md");
  fs.writeFileSync(source, "# Lightweight preview\n\nHello.");
  const start = performance.now();
  cli([source]);
  const s = JSON.parse(cli(["ls", "--json"]))[0];
  const dir = path.dirname(s.page);
  const snapshot = () =>
    JSON.parse(fs.readFileSync(path.join(dir, "viewer-snapshot.json"), "utf8"));
  const initial = await until(() => {
    const value = snapshot();
    return value.heading === "Lightweight preview" && value;
  });
  assert.equal(initial.mermaidLoaded, false);
  assert.equal(initial.debugPort, "");
  console.log(`Viewer ready: ${Math.round(performance.now() - start)} ms`);
  if (process.platform !== "win32") {
    const result = execFileSync(
      "sh",
      ["-c", `lsof -a -p ${initial.pid} -iTCP -sTCP:LISTEN || true`],
      { encoding: "utf8" },
    );
    assert.equal(result.trim(), "", "Viewer opened a TCP listener");
  }
  const update = performance.now();
  cli(
    ["push", source],
    "# Updated\n\n$x^2$\n\n```mermaid\ngraph LR\nA-->B\n```",
  );
  await until(() => {
    const v = snapshot();
    return v.heading === "Updated" && v.math && v.diagram;
  });
  console.log(
    `Math + Mermaid update: ${Math.round(performance.now() - update)} ms`,
  );
  const before = snapshot().revision;
  cli(["scroll", source, "8"]);
  await pause(150);
  assert.equal(snapshot().revision, before);
  await fs.promises.writeFile(source + ".new", "# Saved replacement");
  await fs.promises.rename(source + ".new", source);
  await until(() => snapshot().heading === "Saved replacement");
  await until(() => fs.existsSync(path.join(dir, "preview.png")));
  fs.copyFileSync(
    path.join(dir, "preview.png"),
    "/tmp/peekpane-latest-preview.png",
  );
  cli(["close", source]);
  fs.writeFileSync(
    path.join(tmp, "pixel.png"),
    Buffer.from(
      "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jRZkAAAAASUVORK5CYII=",
      "base64",
    ),
  );
  async function check(name, content, predicate) {
    const file = path.join(tmp, name);
    fs.writeFileSync(file, content);
    cli([file]);
    const opened = JSON.parse(cli(["ls", "--json"]))[0];
    const cache = path.dirname(opened.page);
    try {
      await until(() => {
        const v = JSON.parse(
          fs.readFileSync(path.join(cache, "viewer-snapshot.json"), "utf8"),
        );
        return predicate(v);
      });
      console.log(`PASS: ${name}`);
    } finally {
      cli(["close", file]);
    }
  }
  await check(
    "image.png",
    fs.readFileSync(path.join(tmp, "pixel.png")),
    (v) => v.images[0]?.width === 1,
  );
  await check(
    "image.svg",
    '<svg xmlns="http://www.w3.org/2000/svg" width="20" height="10"><rect width="20" height="10" fill="red"/></svg>',
    (v) => v.images[0]?.width === 20,
  );
  fs.writeFileSync(
    path.join(tmp, "local.js"),
    "document.body.dataset.local='loaded'",
  );
  fs.writeFileSync(path.join(tmp, "local.css"), "h1{color:rgb(1,2,3)}");
  await check(
    "local.html",
    '<!doctype html><html><head><link rel="stylesheet" href="./local.css"></head><body><h1>Local HTML</h1><img src="./pixel.png"><script src="./local.js"></script></body></html>',
    (v) =>
      v.heading === "Local HTML" &&
      v.localScript === "loaded" &&
      v.images[0]?.width === 1 &&
      v.headingColor === "rgb(1, 2, 3)",
  );
  await check(
    "table.csv",
    "Name,Value\nBeta,2\nAlpha,1",
    (v) => v.tables === 1 && v.text.includes("Beta"),
  );
  const XLSX = await import("xlsx");
  const book = XLSX.utils.book_new();
  for (const name of ["First", "Second"])
    XLSX.utils.book_append_sheet(
      book,
      XLSX.utils.aoa_to_sheet([
        ["Name", "Value"],
        ["Alpha", 1],
      ]),
      name,
    );
  await check(
    "book.xlsx",
    XLSX.write(book, { type: "buffer", bookType: "xlsx" }),
    (v) => v.sheets === 2 && v.tables === 2,
  );
  const large = path.join(tmp, "large.md");
  const paragraphs = Array.from(
    { length: 1000 },
    (_, i) => `## Section ${i}\n\nA **formatted** paragraph.\n\n- item\n`,
  ).join("");
  fs.writeFileSync(large, "# Large document\n" + paragraphs);
  cli([large]);
  const largeSession = JSON.parse(cli(["ls", "--json"]))[0];
  const largeSnapshot = () =>
    JSON.parse(
      fs.readFileSync(
        path.join(path.dirname(largeSession.page), "viewer-snapshot.json"),
        "utf8",
      ),
    );
  await until(() => largeSnapshot().heading === "Large document");
  const largeStart = performance.now();
  cli(["push", large], "# Updated large document\n" + paragraphs);
  await until(() => largeSnapshot().heading === "Updated large document");
  console.log(
    `PASS: 5000-line live update ${Math.round(performance.now() - largeStart)} ms`,
  );
  cli(["close", large]);
  await check(
    "simple.pdf",
    fs.readFileSync("test/fixtures/simple.pdf"),
    (v) => v.pdf,
  );
  if (process.env.PEEKPANE_TEST_VIDEO)
    await check(
      "clip.mp4",
      fs.readFileSync(process.env.PEEKPANE_TEST_VIDEO),
      (v) => v.video?.ready >= 2 && !v.video.error,
    );
  console.log(
    "PASS: local CSS rendering, lazy diagrams, math, push, atomic saves, scroll and no TCP listener",
  );
} finally {
  cli(["close"]);
  fs.rmSync(tmp, { recursive: true, force: true });
}
