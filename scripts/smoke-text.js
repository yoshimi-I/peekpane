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
  const result = spawnSync(
    runtime,
    [fileURLToPath(new URL("./check-text.cjs", import.meta.url)), html, output],
    { env, encoding: "utf8", timeout: 15000 },
  );
  if (result.status !== 0)
    throw Error(
      fs.existsSync(output) ? fs.readFileSync(output, "utf8") : result.stderr,
    );
  console.log(
    "PASS: real DOM text selection, visual word selection, copy bridge and native scrolling",
  );
} finally {
  fs.rmSync(tmp, {
    recursive: true,
    force: true,
    maxRetries: 5,
    retryDelay: 100,
  });
}
