import path from "node:path";
import fs from "node:fs";
export class UsageError extends Error {}
export function classify(file, override) {
  if (override) {
    const t = classify(`x.${override}`);
    return [
      "markdown",
      "mermaid",
      "image",
      "video",
      "audio",
      "excel",
      "text",
      "html",
      "pdf",
      "csv",
      "tsv",
      "json",
      "yaml",
    ].includes(override)
      ? override
      : t;
  }
  const ext = path.extname(file).slice(1).toLowerCase();
  const groups = {
    markdown: ["md", "mdx", "markdown"],
    mermaid: ["mmd"],
    html: ["html", "htm"],
    image: ["png", "jpg", "jpeg", "gif", "webp", "svg", "avif", "bmp", "ico"],
    pdf: ["pdf"],
    video: ["mp4", "webm", "mov", "m4v"],
    audio: ["mp3", "wav", "m4a", "ogg"],
    excel: ["xls", "xlsx"],
    csv: ["csv"],
    tsv: ["tsv"],
    json: ["json"],
    yaml: ["yaml", "yml"],
  };
  return Object.keys(groups).find((k) => groups[k].includes(ext)) || "text";
}
export function parse(args) {
  const commands = [
    "open",
    "scroll",
    "push",
    "focus",
    "zoom",
    "close",
    "ls",
    "help",
  ];
  const o = { command: "open" };
  const positional = [];
  if (commands.includes(args[0])) o.command = args.shift();
  for (let i = 0; i < args.length; i++) {
    const a = args[i];
    if (a === "--help" || a === "-h") {
      o.command = "help";
      continue;
    }
    if (a === "--version") {
      o.command = "version";
      continue;
    }
    if (a === "--json") {
      o.json = true;
      continue;
    }
    if (a.startsWith("-")) {
      const key = a.slice(2);
      if (
        ![
          "split",
          "display",
          "pane",
          "size",
          "type",
          "line",
          "css",
          "focus-key",
          "zoom-key",
        ].includes(key) ||
        !args[i + 1]
      )
        throw new UsageError(`Invalid option: ${a}`);
      o[key.replaceAll("-", "_")] = args[++i];
      if (o[key.replaceAll("-", "_")] === "false")
        o[key.replaceAll("-", "_")] = false;
    } else positional.push(a);
  }
  o.file = positional.shift();
  if (o.command === "scroll") o.line = positional.shift();
  if (positional.length) throw new UsageError("Too many arguments");
  if (o.file && o.command === "open") {
    const m = o.file.match(/:(\d+)$/);
    if (m && !fs.existsSync(o.file)) {
      o.line ??= m[1];
      o.file = o.file.slice(0, -m[0].length);
    }
  }
  if (["open", "scroll", "push"].includes(o.command) && !o.file)
    throw new UsageError("FILE is required");
  if (o.split && !["left", "right", "up", "down"].includes(o.split))
    throw new UsageError("Invalid split direction");
  if (
    o.display !== undefined &&
    !["split", "toggle", "window"].includes(o.display)
  )
    throw new UsageError("Display must be split, toggle or window");
  if (
    o.pane !== undefined &&
    (!["focus", "zoom"].includes(o.command) || !/^%\d+$/.test(o.pane))
  )
    throw new UsageError("--pane requires a tmux pane ID for focus or zoom");
  if (o.size !== undefined) {
    o.size = Number(o.size);
    if (!(o.size >= 0.2 && o.size <= 0.95))
      throw new UsageError("Size must be between 0.2 and 0.95");
  }
  if (o.line !== undefined) {
    o.line = Number(o.line);
    if (!Number.isInteger(o.line) || o.line < 1)
      throw new UsageError("LINE must be a positive integer");
  }
  if (o.command === "scroll" && !o.line)
    throw new UsageError("LINE is required");
  return o;
}
