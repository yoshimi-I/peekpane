import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";
import { render } from "../src/render.js";
const require = createRequire(import.meta.url);
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "peekpane-text-"));
const runtime = path.join(
  path.dirname(require.resolve("@zenbu-labs/pixel/package.json")),
  "electron",
  "dist",
  ...(process.platform === "darwin"
    ? ["Electron.app", "Contents", "MacOS", "pixel"]
    : ["pixel"]),
);
const themed = path.join(tmp, "themed.html");
const html = path.join(tmp, "copy.html"),
  output = path.join(tmp, "result.json");
const env = { ...process.env };
delete env.ELECTRON_RUN_AS_NODE;
try {
  fs.writeFileSync(
    html,
    render({
      file: path.join(tmp, "copy.md"),
      type: "markdown",
      content:
        "# Copy test\n\n" +
        Array.from(
          { length: 200 },
          (_, i) => `Paragraph ${i}: selectable **text**.\n\n`,
        ).join(""),
    }),
  );
  fs.writeFileSync(
    themed,
    render({
      file: path.join(tmp, "themed.html"),
      type: "html",
      content: `<!doctype html><html lang="ja" dir="rtl"><head><style>body.dark{background:rgb(12,34,56)}</style></head><body class="dark" style="color:white" data-note="a>b"><h1>Themed</h1><script>document.body.dataset.sample='<body class="sample">';</script></body></html>`,
    }),
  );
  const result = spawnSync(
    runtime,
    [
      fileURLToPath(new URL("./check-text.cjs", import.meta.url)),
      html,
      output,
      themed,
    ],
    { env, encoding: "utf8", timeout: 15000 },
  );
  if (result.status !== 0)
    throw Error(
      fs.existsSync(output) ? fs.readFileSync(output, "utf8") : result.stderr,
    );
  console.log(
    "PASS: visible DOM selection, copy, native scrolling, HTML attributes and lossless frames",
  );
} finally {
  fs.rmSync(tmp, {
    recursive: true,
    force: true,
    maxRetries: 5,
    retryDelay: 100,
  });
}
