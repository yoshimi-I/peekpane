import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
const installer = path.resolve("scripts/install-agents.js");
function fixture() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "peekpane-agent-install-"));
  const run = (...args) =>
    spawnSync(
      process.execPath,
      [installer, "--scope", "project", "--project", dir, ...args],
      { encoding: "utf8" },
    );
  return {
    dir,
    run,
    cleanup: () => fs.rmSync(dir, { recursive: true, force: true }),
  };
}
test("agent installation preserves existing rules, is repeatable, and uninstalls its own block", () => {
  const s = fixture();
  const codex = path.join(s.dir, "AGENTS.md"),
    claude = path.join(s.dir, "CLAUDE.md"),
    kiro = path.join(s.dir, ".kiro/steering/peekpane.md");
  const original =
    "# Existing rules\nKeep these instructions, without a final newline.";
  fs.writeFileSync(codex, original);
  fs.writeFileSync(claude, "# Personal Claude rules\n");
  try {
    const dry = s.run("--agent", "all", "--dry-run");
    assert.equal(dry.status, 0, dry.stderr);
    assert.equal(fs.readFileSync(codex, "utf8"), original);
    assert.equal(fs.existsSync(path.dirname(kiro)), false);
    const install = s.run("--agent", "all");
    assert.equal(install.status, 0, install.stderr);
    assert.ok(fs.readFileSync(codex, "utf8").startsWith(original));
    assert.ok(
      fs.readFileSync(claude, "utf8").startsWith("# Personal Claude rules\n"),
    );
    assert.match(fs.readFileSync(kiro, "utf8"), /^---\ninclusion: always\n---/);
    const first = [codex, claude, kiro].map((f) => fs.readFileSync(f, "utf8"));
    assert.ok(
      first.every((text) => text.includes(path.resolve("bin/peekpane.js"))),
    );
    assert.equal(s.run("--agent", "all").status, 0);
    assert.deepEqual(
      [codex, claude, kiro].map((f) => fs.readFileSync(f, "utf8")),
      first,
    );
    fs.appendFileSync(claude, "\n# Added after installation\n");
    const uninstall = s.run("--agent", "all", "--uninstall");
    assert.equal(uninstall.status, 0, uninstall.stderr);
    assert.equal(fs.readFileSync(codex, "utf8"), original);
    assert.equal(
      fs.readFileSync(claude, "utf8"),
      "# Personal Claude rules\n\n# Added after installation\n",
    );
    assert.equal(fs.existsSync(kiro), false);
    assert.equal(s.run("--agent", "all", "--uninstall").status, 0);
  } finally {
    s.cleanup();
  }
});
test("installer validates every destination before writing any agent's rules", () => {
  const s = fixture();
  try {
    fs.writeFileSync(path.join(s.dir, "AGENTS.md"), "existing");
    fs.writeFileSync(
      path.join(s.dir, "CLAUDE.md"),
      "<!-- peekpane:begin -->\nunfinished block",
    );
    const result = s.run("--agent", "all");
    assert.notEqual(result.status, 0);
    assert.match(result.stderr, /incomplete|malformed|marker/i);
    assert.equal(
      fs.readFileSync(path.join(s.dir, "AGENTS.md"), "utf8"),
      "existing",
    );
    assert.equal(s.run("--agent", "unknown").status, 2);
    assert.equal(s.run("--agent", "codex", "--scope", "invalid").status, 2);
    assert.equal(fs.existsSync(path.join(s.dir, ".kiro")), false);
  } finally {
    s.cleanup();
  }
});
test("installer preserves symlinked rule files and rejects an unrelated Kiro file", () => {
  const s = fixture();
  try {
    const target = path.join(s.dir, "dotfiles.md"),
      link = path.join(s.dir, "AGENTS.md");
    fs.writeFileSync(target, "# Dotfiles\n", { mode: 0o640 });
    fs.symlinkSync(target, link);
    assert.equal(s.run("--agent", "codex").status, 0);
    assert.equal(fs.lstatSync(link).isSymbolicLink(), true);
    assert.match(fs.readFileSync(target, "utf8"), /peekpane:begin/);
    assert.equal(fs.statSync(target).mode & 0o777, 0o640);
    assert.equal(s.run("--agent", "codex", "--uninstall").status, 0);
    assert.equal(fs.readFileSync(target, "utf8"), "# Dotfiles\n");
    const kiro = path.join(s.dir, ".kiro/steering/peekpane.md");
    fs.mkdirSync(path.dirname(kiro), { recursive: true });
    fs.writeFileSync(kiro, "Unrelated existing instructions");
    assert.notEqual(s.run("--agent", "kiro").status, 0);
    assert.equal(
      fs.readFileSync(kiro, "utf8"),
      "Unrelated existing instructions",
    );
  } finally {
    s.cleanup();
  }
});

test("installed commands work from a checkout whose path contains spaces and quotes", () => {
  const s = fixture();
  try {
    const checkout = path.join(s.dir, "checkout space 'quoted");
    fs.mkdirSync(path.join(checkout, "scripts"), { recursive: true });
    fs.mkdirSync(path.join(checkout, "bin"));
    fs.cpSync(
      path.resolve("integrations"),
      path.join(checkout, "integrations"),
      { recursive: true },
    );
    fs.copyFileSync(
      installer,
      path.join(checkout, "scripts/install-agents.js"),
    );
    fs.writeFileSync(path.join(checkout, "package.json"), '{"type":"module"}');
    fs.writeFileSync(
      path.join(checkout, "bin/peekpane.js"),
      "console.log(JSON.stringify(process.argv.slice(2)));",
    );
    const result = spawnSync(
      process.execPath,
      [
        path.join(checkout, "scripts/install-agents.js"),
        "--agent",
        "codex",
        "--scope",
        "project",
        "--project",
        s.dir,
      ],
      { encoding: "utf8" },
    );
    assert.equal(result.status, 0, result.stderr);
    const text = fs.readFileSync(path.join(s.dir, "AGENTS.md"), "utf8");
    const command = text.split("```sh\n")[1].split(' open "PATH_TO_FILE"')[0];
    const invoked = spawnSync("/bin/sh", ["-c", command + " --version"], {
      encoding: "utf8",
    });
    assert.equal(invoked.status, 0, invoked.stderr);
    assert.deepEqual(JSON.parse(invoked.stdout), ["--version"]);
  } finally {
    s.cleanup();
  }
});

test("bootstrap validates first, skips npm in dry-run, and installs from its own checkout", () => {
  const s = fixture();
  try {
    const bin = path.join(s.dir, "fake-bin"),
      trace = path.join(s.dir, "npm-trace");
    fs.mkdirSync(bin);
    fs.writeFileSync(
      path.join(bin, "npm"),
      '#!/bin/sh\nprintf "%s\t%s\n" "$PWD" "$*" >> "$PEEKPANE_INSTALL_TEST_TRACE"\n',
      { mode: 0o755 },
    );
    const invoke = (...extra) =>
      spawnSync(
        "/bin/sh",
        [
          path.resolve("install.sh"),
          "--agent",
          "codex",
          "--scope",
          "project",
          "--project",
          s.dir,
          ...extra,
        ],
        {
          cwd: s.dir,
          encoding: "utf8",
          env: {
            ...process.env,
            PATH: bin + path.delimiter + process.env.PATH,
            PEEKPANE_INSTALL_TEST_TRACE: trace,
          },
        },
      );
    assert.equal(invoke("--bad-option").status, 2);
    assert.equal(fs.existsSync(trace), false);
    const dry = invoke("--dry-run");
    assert.equal(dry.status, 0, dry.stderr);
    assert.equal(fs.existsSync(trace), false);
    assert.equal(fs.existsSync(path.join(s.dir, "AGENTS.md")), false);
    const install = invoke();
    assert.equal(install.status, 0, install.stderr);
    const calls = fs
      .readFileSync(trace, "utf8")
      .trim()
      .split("\n")
      .map((line) => line.split("\t"));
    assert.deepEqual(calls, [
      [fs.realpathSync(process.cwd()), "ci"],
      [fs.realpathSync(process.cwd()), "link"],
    ]);
    assert.match(
      fs.readFileSync(path.join(s.dir, "AGENTS.md"), "utf8"),
      /peekpane:begin/,
    );
    assert.equal(invoke("--uninstall").status, 0);
    assert.equal(
      fs.readFileSync(trace, "utf8").trim().split("\n").length,
      2,
      "uninstall must not reinstall npm dependencies",
    );
  } finally {
    s.cleanup();
  }
});
