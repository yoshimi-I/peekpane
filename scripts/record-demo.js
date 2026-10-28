// Records the real offscreen preview output, not a terminal screen capture.
// Usage: FFMPEG=/path/to/ffmpeg node scripts/record-demo.js
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawn, execFileSync } from "node:child_process";
import { once } from "node:events";
import { pathToFileURL } from "node:url";

const encoder = process.env.FFMPEG || "ffmpeg";
execFileSync(encoder, ["-version"], { stdio: "ignore" });
const output = path.resolve("docs/demo/peekpane-demo.mp4");
if (fs.existsSync(output))
  throw Error("Demo already exists; move it aside before recording again");
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "peekpane-record-"));
const env = {
  ...process.env,
  XDG_CACHE_HOME: tmp,
  XDG_CONFIG_HOME: tmp,
  NVIM: "",
  PEEKPANE_SMOKE: "1",
};
delete env.PEEKPANE_HEADLESS;
fs.mkdirSync(path.dirname(output), { recursive: true });
const cli = (args, input) =>
  execFileSync(process.execPath, ["bin/peekpane.js", ...args], {
    env,
    input,
    encoding: "utf8",
    timeout: 20000,
  });
const pause = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
async function until(check) {
  const limit = Date.now() + 20000;
  while (Date.now() < limit) {
    if (check()) return;
    await pause(25);
  }
  throw Error("Timed out waiting for a rendered demo frame");
}
function atomic(file, data) {
  fs.writeFileSync(file + ".tmp", data);
  fs.renameSync(file + ".tmp", file);
}
const icon = pathToFileURL(path.resolve("docs/brand/icon.png")).href;
const markdown = `<img src="${icon}" width="82" align="right">\n\n# peekpane\n\n**Beautiful documents, inside your terminal.**\n\nPreview local Markdown, diagrams and HTML without leaving your workspace.\n\n| What you write | What you see |\n| --- | --- |\n| Markdown | Styled headings, tables and code |\n| Mermaid | Real diagrams |\n| Local HTML | Your CSS, rendered locally |\n\n- [x] Local files; no web server\n- [x] Neovim and standalone CLI\n- [x] Rendered text selection and copy\n\n## Your document, live\n\nChanges appear here without reopening the preview.\n\n\`\`\`js\nconsole.log('Hello, peekpane');\n\`\`\`\n`;
const diagram = `# From edit to preview\n\nMarkdown + Mermaid + math, rendered together.\n\n\`\`\`mermaid\ngraph LR\n  A[Write in Neovim] --> B[Preview in place]\n  B --> C[Read and copy]\n  C --> A\n\`\`\`\n\n## Keep your focus\n\nOne shortcut to switch. Your other windows stay where they are.\n\nInline math: $E = mc^2$\n\n| Editor | Preview |\n| --- | --- |\n| Source text | HTML / CSS |\n| Unsaved changes | Live updates |\n`;
const files = [
  path.join(tmp, "overview.md"),
  path.join(tmp, "diagrams.md"),
  path.join(tmp, "local.html"),
];
fs.writeFileSync(files[0], markdown);
fs.writeFileSync(files[1], diagram);
fs.copyFileSync("examples/demo.html", files[2]);
let processEncoder;
try {
  for (const file of files) cli([file, "--display", "window"]);
  const sessions = JSON.parse(cli(["ls", "--json"]));
  const dirs = files.map((file) =>
    path.dirname(sessions.find((s) => s.file === fs.realpathSync(file)).page),
  );
  const frame = (dir) =>
    JSON.parse(fs.readFileSync(path.join(dir, "frame.json"), "utf8"));
  for (const dir of dirs) {
    atomic(
      path.join(dir, "viewport.json"),
      JSON.stringify({
        width: 1280,
        height: 720,
        pixelWidth: 1280,
        pixelHeight: 720,
      }),
    );
    await until(() => frame(dir).width === 1280 && frame(dir).height === 720);
  }
  // Allow lazy Mermaid/math enhancement and fonts to settle before recording.
  await pause(500);
  fs.copyFileSync(frame(dirs[0]).path, "docs/demo/poster.png");
  processEncoder = spawn(
    encoder,
    [
      "-hide_banner",
      "-loglevel",
      "error",
      "-f",
      "image2pipe",
      "-vcodec",
      "png",
      "-framerate",
      "15",
      "-i",
      "pipe:0",
      "-an",
      "-c:v",
      "libx264",
      "-preset",
      "fast",
      "-crf",
      "22",
      "-pix_fmt",
      "yuv420p",
      "-movflags",
      "+faststart",
      output,
    ],
    { stdio: ["pipe", "ignore", "pipe"] },
  );
  let errors = "";
  processEncoder.stderr.on("data", (chunk) => (errors += chunk));
  processEncoder.stdin.on("error", () => {});
  const finished = once(processEncoder, "close");
  let sequence = 0,
    scene = 0,
    lastPath,
    lastPNG;
  const action = (key, count = 1) =>
    atomic(
      path.join(dirs[0], `action-${String(++sequence).padStart(8, "0")}.json`),
      JSON.stringify({ key, count }),
    );
  const started = performance.now();
  for (let tick = 0; tick < 270; tick++) {
    if (tick === 30) action("v");
    if (tick === 38) action("w");
    if (tick === 53) action("y");
    if (tick === 67) action("j", 3);
    if (tick === 83) action("k", 3);
    if (tick === 95)
      cli(
        ["push", files[0]],
        markdown
          .replace("Your document, live", "Updated without saving")
          .replace(
            "Changes appear here without reopening the preview.",
            "This text arrived through peekpane push — the source file was not saved.",
          ),
      );
    if (tick === 135) scene = 1;
    if (tick === 202) scene = 2;
    const current = frame(dirs[scene]);
    if (current.path !== lastPath) {
      lastPNG = fs.readFileSync(current.path);
      lastPath = current.path;
    }
    if (!processEncoder.stdin.write(lastPNG))
      await once(processEncoder.stdin, "drain");
    await pause(
      Math.max(0, started + ((tick + 1) * 1000) / 15 - performance.now()),
    );
  }
  processEncoder.stdin.end();
  const [code] = await finished;
  if (code !== 0) throw Error(errors || `Video encoder exited ${code}`);
  console.log(`Recorded 18 seconds of real preview output: ${output}`);
} finally {
  processEncoder?.stdin.end();
  try {
    cli(["close"]);
  } catch {
    /* Own temporary sessions may already be closed. */
  }
  await pause(300);
  fs.rmSync(tmp, {
    recursive: true,
    force: true,
    maxRetries: 5,
    retryDelay: 100,
  });
}
