#!/usr/bin/env node
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
const checkout = fileURLToPath(new URL("..", import.meta.url));
const begin = "<!-- peekpane:begin -->";
const end = "<!-- peekpane:end -->";
const agents = ["codex", "claude", "kiro"];
class UsageError extends Error {}
function options(args) {
  const opts = { scope: "user", project: process.cwd() };
  for (let i = 0; i < args.length; i++) {
    const key = args[i];
    if (["--help", "--dry-run", "--uninstall"].includes(key)) {
      opts[key.slice(2)] = true;
    } else if (
      ["--agent", "--scope", "--project"].includes(key) &&
      args[i + 1] &&
      !args[i + 1].startsWith("--")
    ) {
      opts[key.slice(2)] = args[++i];
    } else throw new UsageError(`Invalid option or missing value: ${key}`);
  }
  if (opts.help) return opts;
  if (![...agents, "all"].includes(opts.agent))
    throw new UsageError("Choose --agent codex|claude|kiro|all");
  if (!["user", "project"].includes(opts.scope))
    throw new UsageError("Choose --scope user|project");
  if (args.includes("--project") && opts.scope !== "project")
    throw new UsageError("--project requires --scope project");
  opts.project = path.resolve(opts.project);
  if (opts.scope === "project" && !fs.statSync(opts.project).isDirectory())
    throw new UsageError("Project must be an existing directory");
  return opts;
}
const quote = (s) => `'${s.replaceAll("'", "'\\''")}'`;
function changes(opts) {
  const home = os.homedir();
  const targets =
    opts.scope === "user"
      ? {
          codex: path.join(
            process.env.CODEX_HOME || path.join(home, ".codex"),
            "AGENTS.md",
          ),
          claude: path.join(home, ".claude", "CLAUDE.md"),
          kiro: path.join(home, ".kiro", "steering", "peekpane.md"),
        }
      : {
          codex: path.join(opts.project, "AGENTS.md"),
          claude: path.join(opts.project, "CLAUDE.md"),
          kiro: path.join(opts.project, ".kiro", "steering", "peekpane.md"),
        };
  const command = [process.execPath, path.join(checkout, "bin", "peekpane.js")]
    .map(quote)
    .join(" ");
  const selected = opts.agent === "all" ? agents : [opts.agent];
  return selected.map((agent) => {
    const file = targets[agent];
    let previous = "";
    try {
      previous = fs.readFileSync(file, "utf8");
    } catch (error) {
      if (error.code !== "ENOENT") throw error;
    }
    const start = previous.indexOf(begin),
      finish = previous.indexOf(end);
    const managed = start !== -1;
    if (
      managed !== (finish !== -1) ||
      finish < start ||
      previous.indexOf(begin, start + begin.length) !== -1 ||
      previous.indexOf(end, finish + end.length) !== -1
    )
      throw Error(`Incomplete or malformed peekpane markers in ${file}`);
    if (agent === "kiro" && previous && !managed)
      throw Error(`Refusing to replace unrelated steering file: ${file}`);
    let before = previous,
      after = "";
    if (managed) {
      const separator =
        previous.slice(Math.max(0, start - 2), start) === "\n\n" ? 2 : 0;
      before = previous.slice(0, start - separator);
      let stop = finish + end.length;
      if (previous[stop] === "\n") stop++;
      after = previous.slice(stop);
    }
    let next;
    if (opts.uninstall) {
      next = managed ? before + after : previous;
      if (agent === "kiro" && next.trim() === "---\ninclusion: always\n---")
        next = "";
    } else {
      const source = path.join(
        checkout,
        "integrations",
        agent,
        agent === "codex"
          ? "AGENTS.md"
          : agent === "claude"
            ? "CLAUDE.md"
            : "peekpane.md",
      );
      const rule = fs
        .readFileSync(source, "utf8")
        .replaceAll("{{PEEKPANE_COMMAND}}", command)
        .trimEnd();
      if (agent === "kiro" && !previous)
        before = "---\ninclusion: always\n---\n";
      next = before + "\n\n" + begin + "\n" + rule + "\n" + end + "\n" + after;
    }
    return {
      agent,
      file,
      previous,
      next,
      remove: opts.uninstall && agent === "kiro" && managed && next === "",
    };
  });
}
function main() {
  const opts = options(process.argv.slice(2));
  if (opts.help) {
    console.log(`Install peekpane agent rules (existing instructions are preserved).
Usage: node scripts/install-agents.js --agent codex|claude|kiro|all [options]
  --scope user|project  Default: user; all projects for this account
  --project DIR         Existing project directory (requires --scope project)
  --dry-run             Print planned changes without writing files
  --uninstall           Remove only peekpane's managed instructions
  --help                Show this help
Rules use absolute Node/peekpane paths. Reinstall after moving the checkout or Node.
Kiro custom agents must include the installed steering file in their resources.
CLI installation: ./install.sh --agent all (npm ci, npm link, then these rules).`);
    return;
  }
  const plan = changes(opts); // Validate every destination before writing any file.
  for (const change of plan) {
    const { file, previous, next, remove } = change;
    const action = remove
      ? "remove"
      : previous === next
        ? "unchanged"
        : opts.uninstall
          ? "uninstall"
          : "install";
    console.log(`${opts["dry-run"] ? "Would " : ""}${action}: ${file}`);
    if (opts["dry-run"] || previous === next) continue;
    fs.mkdirSync(path.dirname(file), { recursive: true });
    if (previous) {
      const backup = `${file}.peekpane-backup-${Date.now()}-${process.pid}`;
      fs.writeFileSync(backup, previous, { flag: "wx", mode: 0o600 });
      console.log(`backup: ${backup}`);
    }
    if (remove) fs.unlinkSync(file);
    else {
      // Write through existing symlinks; do not detach dotfiles-managed files.
      fs.writeFileSync(file, next, { mode: 0o600 });
    }
  }
  if (!opts.uninstall) {
    console.log(
      "Start a new agent session to load the rules, then ask: Preview README.md.",
    );
    if (["all", "kiro"].includes(opts.agent))
      console.log(
        "Kiro custom agents: include the printed steering path in resources; see docs/installation.md.",
      );
  }
}
try {
  main();
} catch (error) {
  console.error(`peekpane installer: ${error.message}`);
  process.exitCode = error instanceof UsageError ? 2 : 1;
}
