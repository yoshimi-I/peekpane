// Real Ghostty screen recording on macOS, using FFmpeg's AVFoundation input.
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawn, execFileSync } from "node:child_process";
import { once } from "node:events";
const root = process.cwd();
const ffmpeg = process.env.FFMPEG || "ffmpeg";
const run = (cmd, args, opts = {}) =>
  execFileSync(cmd, args, { encoding: "utf8", timeout: 10000, ...opts });
const pause = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const quote = (s) => `'${String(s).replace(/'/g, "'\\''")}'`;
if (process.platform !== "darwin")
  throw Error("This real screen recording workflow requires macOS.");
run(ffmpeg, ["-version"], { stdio: "ignore" });
const access = run("swift", [
  "-e",
  "import CoreGraphics; print(CGPreflightScreenCaptureAccess())",
]).trim();
if (access !== "true")
  throw Error(
    "Enable Ghostty in macOS Privacy & Security > Screen Recording before recording.",
  );
const nvim = run("which", ["nvim"]).trim(),
  tmux = run("which", ["tmux"]).trim();
if (!process.env.TMUX) throw Error("Run this recorder inside tmux in Ghostty.");
const image =
  process.env.IMAGE_NVIM_PATH ||
  path.join(os.homedir(), ".local/share/nvim/lazy/image.nvim");
if (!fs.existsSync(path.join(image, "lua/image/init.lua")))
  throw Error("Set IMAGE_NVIM_PATH to an image.nvim checkout.");
const out = path.join(root, "docs/demo/terminal-demo.mp4");
if (fs.existsSync(out) && !process.argv.includes("--replace"))
  throw Error("Recording exists; use --replace to record a replacement.");
const tmp = fs.mkdtempSync("/tmp/peekpane-terminal-demo-");
const sock = path.join(tmp, "nvim.sock");
const config = path.join(tmp, "settings.json");
fs.writeFileSync(
  config,
  JSON.stringify({
    repo: root,
    image,
    node: process.execPath,
    path: process.env.PATH,
  }),
  { mode: 0o600 },
);
fs.writeFileSync(
  path.join(tmp, "demo.md"),
  `# peekpane\n\nBeautiful local documents, inside your terminal.\n\n## Markdown, with real CSS\n\n| Content | Preview |\n| --- | --- |\n| Markdown | Styled text and tables |\n| Mermaid | Real diagrams |\n| HTML | Your local CSS |\n\n- [x] Stay inside your workspace\n- [x] Switch with one shortcut\n- [x] Select and copy rendered text\n\n## From edit to preview\n\n\`\`\`mermaid\ngraph LR\n  A[Write in Neovim] --> B[Preview in place]\n  B --> C[Read and copy]\n  C --> A\n\`\`\`\n\n## Math and code\n\n$E = mc^2$\n\n\`\`\`js\nconsole.log('Hello, peekpane');\n\`\`\`\n\n## Live preview\n\nEdit this document and switch back to see your changes.\n`,
);
fs.copyFileSync("examples/demo.html", path.join(tmp, "html-demo.html"));
const command = `exec env ${[
  `PEEKPANE_RECORD_CONFIG=${config}`,
  `XDG_CACHE_HOME=${path.join(tmp, "cache")}`,
  `XDG_CONFIG_HOME=${path.join(tmp, "config")}`,
  "PEEKPANE_SMOKE=1",
  "LANG=en_US.UTF-8",
  `PATH=${process.env.PATH}`,
]
  .map(quote)
  .join(
    " ",
  )} ${quote(nvim)} --listen ${quote(sock)} -u ${quote(path.join(root, "docs/demo/terminal-init.lua"))} demo.md`;
const session = run(tmux, ["display-message", "-p", "#{session_name}"]).trim();
const originalWindow = run(tmux, [
  "display-message",
  "-p",
  "#{window_id}",
]).trim();
const originalStatus = run(tmux, [
  "show-option",
  "-v",
  "-t",
  session,
  "status",
]).trim();
let demoWindow;
const info = path.join(tmp, "windows.swift");
fs.writeFileSync(
  info,
  `import CoreGraphics\nimport Foundation\nlet all=CGWindowListCopyWindowInfo([.optionOnScreenOnly,.excludeDesktopElements],kCGNullWindowID) as? [[String:Any]] ?? []\nlet windows=all.filter{($0[kCGWindowOwnerName as String] as? String)=="Ghostty"}.map{w in ["id":w[kCGWindowNumber as String] ?? 0,"name":w[kCGWindowName as String] ?? "","bounds":w[kCGWindowBounds as String] ?? [:]]}\nlet d=CGMainDisplayID();let b=CGDisplayBounds(d)\nlet value:[String:Any]=["windows":windows,"display":["width":b.width,"height":b.height,"pixelWidth":CGDisplayPixelsWide(d),"pixelHeight":CGDisplayPixelsHigh(d)]]\nlet data=try JSONSerialization.data(withJSONObject:value);print(String(data:data,encoding:.utf8)!)\n`,
);
const rpc = (code) =>
  JSON.parse(
    run(nvim, [
      "--server",
      sock,
      "--remote-expr",
      `json_encode(luaeval(${JSON.stringify(code)}))`,
    ]).trim(),
  );
const key = (value) => run(nvim, ["--server", sock, "--remote-send", value]);
async function until(check, message, ms = 15000) {
  const end = Date.now() + ms;
  while (Date.now() < end) {
    try {
      if (check()) return;
    } catch {
      /* Application may still be starting. */
    }
    await pause(100);
  }
  throw Error(message);
}
async function preview() {
  key("<Esc> mp");
  await until(
    () => rpc("vim.bo.filetype") === "peekpane",
    "Preview failed to open",
  );
  await until(
    () =>
      rpc(
        '(function() for _,i in ipairs(require("image").get_images()) do if i.is_rendered then return true end end; return false end)()',
      ) === true,
    "Preview image was not presented",
  );
  await pause(500);
}
let recorder,
  log = "",
  window;
try {
  demoWindow = run(tmux, [
    "new-window",
    "-d",
    "-P",
    "-F",
    "#{window_id}",
    "-n",
    "peekpane-demo",
    "-c",
    tmp,
    command,
  ]).trim();
  run(tmux, ["set-option", "-w", "-t", demoWindow, "window-size", "manual"]);
  run(tmux, ["resize-window", "-t", demoWindow, "-x", "120", "-y", "38"]);
  run(tmux, ["set-option", "-t", session, "status", "off"]);
  run(tmux, ["select-window", "-t", demoWindow]);
  run("open", ["-a", "Ghostty"]);
  await until(
    () => fs.existsSync(sock),
    "Dedicated Neovim did not start",
    30000,
  );
  await until(
    () => rpc("vim.bo.filetype") === "markdown",
    "Demo source did not load",
  );
  const metadata = JSON.parse(run("swift", [info]));
  const candidates = metadata.windows.filter(
    (w) => w.bounds.Width > 400 && w.bounds.Height > 400,
  );
  if (candidates.length !== 1)
    throw Error(
      "Keep exactly one Ghostty window visible during recording to capture only the demo.",
    );
  window = candidates[0];
  if (!window) throw Error("Cannot find the dedicated Ghostty demo window.");
  const b = window.bounds;
  const clientTTY = run(tmux, [
    "display-message",
    "-p",
    "#{client_tty}",
  ]).trim();
  const paneTTY = run(tmux, [
    "display-message",
    "-p",
    "-t",
    demoWindow,
    "#{pane_tty}",
  ]).trim();
  // tmux manual-size windows can lose pixel dimensions. Restore the real
  // client's cell metrics so Kitty image placement and the recording agree.
  const metrics = JSON.parse(
    run("python3", [
      "-c",
      `import sys,fcntl,termios,struct,json
with open(sys.argv[1],'rb',buffering=0) as f:r,c,x,y=struct.unpack('HHHH',fcntl.ioctl(f,termios.TIOCGWINSZ,b'\\0'*8))
w,h=x//c,y//r
with open(sys.argv[2],'r+b',buffering=0) as f:fcntl.ioctl(f,termios.TIOCSWINSZ,struct.pack('HHHH',38,120,w*120,h*38))
print(json.dumps({'width':w*120,'height':h*38,'clientWidth':x,'clientHeight':y}))`,
      clientTTY,
      paneTTY,
    ]),
  );
  rpc('vim.api.nvim_exec_autocmds("VimResized",{})');
  await pause(300);
  run("screencapture", [
    "-x",
    "-o",
    "-l",
    String(window.id),
    path.join(tmp, "start.png"),
  ]);
  fs.copyFileSync(
    path.join(tmp, "start.png"),
    "/tmp/peekpane-terminal-demo-start.png",
  );
  const png = fs.readFileSync(path.join(tmp, "start.png"));
  const sx = png.readUInt32BE(16) / b.Width,
    sy = png.readUInt32BE(20) / b.Height;
  const even = (n) => Math.floor(n / 2) * 2;
  const crop = {
    x: even(b.X * sx),
    y: even(b.Y * sy),
    width: even(metrics.width + (b.Width * sx - metrics.clientWidth) / 2),
    height: even(metrics.height),
  };
  const args = [
    "-hide_banner",
    "-loglevel",
    "warning",
    "-f",
    "avfoundation",
    "-framerate",
    "30",
    "-pixel_format",
    "bgr0",
    "-capture_cursor",
    "0",
    "-i",
    `${process.env.SCREEN_DEVICE || "Capture screen 0"}:none`,
    "-vf",
    `crop=${crop.width}:${crop.height}:${crop.x}:${crop.y},scale=1280:-2:flags=lanczos`,
    "-an",
    "-c:v",
    "libx264",
    "-preset",
    "veryfast",
    "-crf",
    "20",
    "-pix_fmt",
    "yuv420p",
    "-movflags",
    "+faststart",
    "-progress",
    "pipe:2",
    "-stats_period",
    "0.2",
    "-y",
    out,
  ];
  recorder = spawn(ffmpeg, args, { stdio: ["pipe", "ignore", "pipe"] });
  recorder.stderr.on("data", (chunk) => (log += chunk));
  const completed = once(recorder, "close");
  await until(
    () => /frame=[1-9]/.test(log),
    "Screen recorder failed to receive real screen frames: " + log,
    15000,
  );
  await pause(1400);
  await preview();
  await pause(2500);
  for (let i = 0; i < 3; i++) {
    key("j");
    await pause(180);
  }
  await pause(700);
  for (let i = 0; i < 3; i++) {
    key("k");
    await pause(180);
  }
  await pause(500);
  key("v");
  await pause(250);
  key("w");
  await pause(1200);
  key("y");
  await pause(800);
  key(" mp");
  await pause(600);
  key("Go");
  for (const char of "Live updates, without saving.") {
    key(char);
    await pause(45);
  }
  key("<Esc>");
  await pause(900);
  await preview();
  key("G");
  await pause(2400);
  key(" mp");
  await pause(300);
  key(":edit! html-demo.html<CR>");
  await pause(700);
  await preview();
  await pause(3500);
  recorder.stdin.write("q\n");
  const [code] = await completed;
  if (code !== 0) throw Error("Screen recording failed: " + log);
  const gif = path.join(root, "docs/demo/terminal-demo.gif");
  run(ffmpeg, [
    "-hide_banner",
    "-loglevel",
    "error",
    "-i",
    out,
    "-filter_complex",
    "[0:v]fps=10,scale=960:-1:flags=lanczos,split[a][b];[a]palettegen=stats_mode=diff[p];[b][p]paletteuse=dither=bayer:bayer_scale=5:diff_mode=rectangle[v]",
    "-map",
    "[v]",
    "-loop",
    "0",
    "-y",
    gif,
  ]);
  run(ffmpeg, [
    "-hide_banner",
    "-loglevel",
    "error",
    "-ss",
    "1",
    "-i",
    out,
    "-frames:v",
    "1",
    "-y",
    path.join(root, "docs/demo/terminal-demo.png"),
  ]);
  fs.writeFileSync(path.join(tmp, "recording.log"), log);
  console.log("Recorded real Ghostty + Neovim screen:", out);
  console.log("README animation:", gif);
} finally {
  if (recorder?.exitCode === null) {
    recorder.stdin.write("q\n");
    await pause(400);
  }
  try {
    rpc('require("peekpane").close()');
    key(":qa!<CR>");
  } catch {
    /* Dedicated session may already be closed. */
  }
  try {
    run(tmux, ["kill-window", "-t", demoWindow], { stdio: "ignore" });
  } catch {
    /* Own server may have exited with Neovim. */
  }
  try {
    run(tmux, ["set-option", "-t", session, "status", originalStatus]);
    run(tmux, ["select-window", "-t", originalWindow]);
  } catch {
    /* Original client may have changed independently. */
  }
  fs.rmSync(tmp, {
    recursive: true,
    force: true,
    maxRetries: 8,
    retryDelay: 150,
  });
}
