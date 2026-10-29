import { test } from "node:test";
import assert from "node:assert/strict";
import { locateTerminal, sameTerminal } from "../src/terminal-context.js";
function fixture({
  ttys = false,
  panes = "%0\t/dev/ttys001\t/other-project\t1000",
  surfaces = [{ id: "quick", cwd: "/project" }],
  env = {},
} = {}) {
  const native = {
    name: "ghostty",
    getCurrentPane: async () => {
      throw Error("quick terminal omitted by normal window collection");
    },
    split() {},
  };
  return {
    env: {
      TMUX: "/tmp/old-socket,999,0",
      TMUX_PANE: "%0",
      GHOSTTY_RESOURCES_DIR: "/Ghostty/resources",
      ...env,
    },
    cwd: "/project",
    pid: 10,
    platform: "darwin",
    run: (command) =>
      command === "ps"
        ? ttys
          ? "10 20 ??\n20 1 ttys001\n"
          : "10 1 ??\n"
        : panes,
    pixel: { detect: () => native, callerTty: () => ({ path: null }) },
    ghosttySurfaces: async () => surfaces,
  };
}
test("stale tmux variables do not redirect a detached caller away from its Ghostty quick terminal", async () => {
  const ctx = await locateTerminal(fixture());
  assert.equal(ctx.kind, "native");
  assert.equal(ctx.from.id, "quick");
  assert.equal(ctx.env.TMUX, undefined);
  assert.equal(ctx.env.TMUX_PANE, undefined);
  assert.equal(ctx.env.TERM_PROGRAM, "ghostty");
});
test("a real ancestor pane TTY recovers the correct tmux server despite an outdated server PID", async () => {
  const ctx = await locateTerminal(fixture({ ttys: true }));
  assert.equal(ctx.kind, "tmux");
  assert.equal(ctx.pane, "%0");
  assert.equal(ctx.serverPid, 1000);
});
test("ambiguous native surfaces fail instead of selecting another pane", async () => {
  await assert.rejects(
    locateTerminal(
      fixture({
        surfaces: [
          { id: "a", cwd: "/project" },
          { id: "b", cwd: "/project" },
        ],
      }),
    ),
    /ambiguous|multiple/i,
  );
});
test("known viewer surfaces are excluded when finding the source terminal", async () => {
  const ctx = await locateTerminal({
    ...fixture({
      surfaces: [
        { id: "quick", cwd: "/project" },
        { id: "viewer", cwd: "/project" },
      ],
    }),
    sessions: [{ viewerPane: "viewer" }],
  });
  assert.equal(ctx.from.id, "quick");
});
test("an old preview on tmux is not silently reused for a native terminal request", () => {
  assert.equal(
    sameTerminal(
      { pane: "%9", editor: "%0", display: "split" },
      {
        kind: "native",
        identity: { kind: "native", terminal: "ghostty", pane: "quick" },
      },
    ),
    false,
  );
  assert.equal(
    sameTerminal(
      { origin: { kind: "native", terminal: "ghostty", pane: "quick" } },
      {
        kind: "native",
        identity: { kind: "native", terminal: "ghostty", pane: "quick" },
      },
    ),
    true,
  );
});

test("an expired tmux server cannot be trusted just because its pane has the same cwd", async () => {
  await assert.rejects(
    locateTerminal({
      ...fixture({ panes: "%0\t/dev/ttys001\t/project\t1000", surfaces: [] }),
      pixel: { detect: () => null, callerTty: () => ({ path: null }) },
    }),
    /Cannot identify/,
  );
});
test("a detached tmux caller requires a live server identity and explicit pane in the same directory", async () => {
  const ctx = await locateTerminal({
    ...fixture({ panes: "%0\t/dev/ttys001\t/project\t999" }),
    pixel: { detect: () => null, callerTty: () => ({ path: null }) },
  });
  assert.equal(ctx.kind, "tmux");
  assert.equal(ctx.pane, "%0");
});
test("failure to identify the source never falls back to the last tmux pane", async () => {
  await assert.rejects(
    locateTerminal({
      ...fixture({ env: { TMUX_PANE: undefined } }),
      pixel: { detect: () => null, callerTty: () => ({ path: null }) },
    }),
    /Cannot identify/,
  );
});
