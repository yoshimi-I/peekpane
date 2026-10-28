import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import vm from "node:vm";
import path from "node:path";
import { execFileSync, spawnSync } from "node:child_process";
const cli = path.resolve("bin/peekpane.js");
test("preview process supports reuse, push, scroll, watch and close", async () => {
  const tmp = await fs.mkdtemp(path.join(os.tmpdir(), "peekpane-test-"));
  const env = {
    ...process.env,
    XDG_CACHE_HOME: tmp,
    XDG_CONFIG_HOME: tmp,
    PEEKPANE_HEADLESS: "1",
  };
  const file = path.join(tmp, "a.md");
  await fs.writeFile(file, "# First");
  const run = (...args) =>
    execFileSync(process.execPath, [cli, ...args], { env, encoding: "utf8" });
  try {
    run(file);
    const list = JSON.parse(run("ls", "--json"));
    assert.equal(list.length, 1);
    assert.equal(
      (await fs.stat(path.join(tmp, "peekpane"))).mode & 0o777,
      0o700,
    );
    run(file);
    assert.equal(JSON.parse(run("ls", "--json")).length, 1);
    const pushed = spawnSync(
      process.execPath,
      [cli, "push", file, "--line", "4"],
      { env, input: "# Unsaved", encoding: "utf8" },
    );
    assert.equal(pushed.status, 0, pushed.stderr);
    await new Promise((r) => setTimeout(r, 450));
    assert.match(await fs.readFile(list[0].page, "utf8"), /Unsaved/);
    const context = { window: {} };
    vm.runInNewContext(
      await fs.readFile(
        path.join(path.dirname(list[0].page), "content.js"),
        "utf8",
      ),
      context,
    );
    assert.match(context.window.peekpaneContent.html, /<h1[^>]*>Unsaved/);
    const revisionBefore = context.window.peekpaneContent.revision;
    const duplicate = spawnSync(
      process.execPath,
      [cli, "push", file, "--line", "7"],
      { env, input: "# Unsaved" },
    );
    assert.equal(duplicate.status, 0);
    await new Promise((r) => setTimeout(r, 100));
    vm.runInNewContext(
      await fs.readFile(
        path.join(path.dirname(list[0].page), "state.js"),
        "utf8",
      ),
      context,
    );
    assert.equal(
      context.window.peekpaneState.revision,
      revisionBefore,
      "Cursor updates must not rerender content",
    );
    run("scroll", file, "8");
    await new Promise((r) => setTimeout(r, 250));
    assert.match(
      await fs.readFile(
        path.join(path.dirname(list[0].page), "state.js"),
        "utf8",
      ),
      /"line":8/,
    );
    await fs.writeFile(file, "# Saved");
    await new Promise((r) => setTimeout(r, 500));
    assert.match(await fs.readFile(list[0].page, "utf8"), /Saved/);
    await fs.writeFile(file + ".new", "# Atomic replacement");
    await fs.rename(file + ".new", file);
    await new Promise((r) => setTimeout(r, 350));
    assert.match(await fs.readFile(list[0].page, "utf8"), /Atomic replacement/);
  } finally {
    run("close");
    await fs.rm(tmp, { recursive: true, force: true });
  }
});
test("CLI returns usage and runtime exit codes", () => {
  for (const [args, code] of [
    [["open"], 2],
    [["/does/not/exist.md"], 1],
  ]) {
    const r = spawnSync(process.execPath, [cli, ...args]);
    assert.equal(r.status, code);
  }
});
