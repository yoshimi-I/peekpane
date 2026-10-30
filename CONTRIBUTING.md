# Contributing to peekpane

peekpane has a standalone CLI and a Neovim plugin backed by the same renderer. Keep changes focused on one issue, and describe which entry point and display mode you verified.

## Set up a checkout

Use macOS or Linux with Node.js 20+ and npm. CI uses Node 20/22 and stable/nightly Neovim. For the full local checks, have Neovim, tmux 3.2+, and Python 3 available; the TUI mouse fixture uses Python's standard library. Mouse forwarding requires Neovim 0.11+. Review test skips when a tool is missing.

Fork first if you need your own remote for a PR; substitute your fork's URL below. For a local upstream checkout:

```sh
git clone https://github.com/yoshimi-I/peekpane.git
cd peekpane
npm ci
```

The first install downloads Pixel's patched Electron runtime. For checks that do not use the real renderer, `PIXEL_SKIP_DOWNLOAD=1 npm ci` skips that download; rerun `npm ci` without the flag before real-renderer checks. No global `npm link`, agent-rule installation, or changes to your normal editor configuration are needed to contribute. Invoke the checkout's CLI with `node bin/peekpane.js`.

Neovim `window` mode on a real terminal additionally needs configured image.nvim, ImageMagick, and a Kitty-compatible backend. Headless tests that stub image.nvim do not verify physical image presentation. See [installation and terminal compatibility](docs/installation.md) and [verification evidence and limits](docs/validation.md).

## Find the relevant code

| Path | Responsibility |
| --- | --- |
| `bin/peekpane.js`, `bin/viewer.js` | CLI commands and rendering-runtime launcher. |
| `src/options.js`, `src/render.js`, `src/store.js`, `src/worker.js` | Arguments, local document rendering, sessions and live updates. |
| `src/terminal*.js` | Source-terminal detection, native/tmux splits and pane lifecycle. |
| `src/viewer.cjs`, `src/preload.cjs`, `src/interaction.js`, `src/input.cjs` | Electron host, DOM interaction, copy/link bridge and input forwarding. |
| `lua/peekpane/`, `plugin/` | Neovim setup, commands, buffers, mouse and frame presentation. |
| `test/`, `scripts/smoke-*.js` | Node/Lua fixtures and real-renderer/terminal checks. |
| `assets/`, `scripts/vendor.js`, `THIRD_PARTY_NOTICES.md` | Checked-in runtime assets, bundle generation and dependency notices. |
| `skills/`, `integrations/`, `scripts/install-agents.js`, `install.sh` | Optional agent skill, managed rules and installation. |
| `doc/peekpane.txt`, `docs/`, `README*.md` | Neovim help, detailed guides and the two user entry points. |

The English README is canonical; keep Japanese guidance consistent when user-facing behavior changes. `requirements.md` and dated files under `docs/plans/` preserve initial requirements/design history. Use the current READMEs and installation/validation guides for present setup and supported behavior.

## Choose checks for the change

Run commands from the checkout root. Start with the checks covering the affected behavior; avoid launching terminal panes or recording the screen for a documentation-only edit.

| Change | Useful checks | What they establish |
| --- | --- | --- |
| CLI arguments, rendering, policies, sessions or terminal routing | `npm test`, `npm run lint` | Node behavior and available tool integrations; injected routing cases do not prove graphics on every terminal. |
| Agent rules or installer | `node --test test/install-agents.test.js` | Isolated installation, preservation, repeatability, scopes and uninstall. |
| Neovim commands/lifecycle | `npm run test:nvim`, `npm run test:nvim:window`, `npm run test:nvim:lifecycle` | Headless buffer/window/ownership behavior; image APIs may be stubbed. |
| Neovim presentation/mouse routing | `nvim --headless -u NONE -l test/presenter.lua`, `nvim --headless -u NONE -l test/mouse.lua`, `npm test` | Frame lifetime and input routing, including the available Python PTY fixture. |
| DOM text, lossless frames or capture recovery | `node scripts/smoke-text.js`, `node scripts/smoke-capture.js`, `node scripts/smoke-scroll.js` | Actual Electron DOM, PNG/capture and queued scrolling behavior. |
| Mouse, links or Neovim DOM interaction | `node scripts/smoke-mouse.js`, `npm run test:nvim:text`, `npm run test:nvim:mouse` | Real renderer input and Neovim forwarding; not every physical terminal. |
| Shared host or deferred updates | `PEEKPANE_TEST_DISPLAY=window node scripts/smoke-shared.js`, `node scripts/smoke-window-updates.js` | Independent closure, surviving updates and deferred rendering without native pane splitting. |
| Native terminal routing or display | `node scripts/smoke-viewer.js` from the intended terminal | Opens/closes its own preview panes; inspect actual displayed content as well. |
| Documentation/help | Check relative links and heading anchors; open changed CLI help and Neovim help tags | Commands/examples remain usable without needing a full graphical setup. |

Real-renderer checks require the downloaded Pixel/Electron runtime. They run on macOS CI. Successful offscreen or Linux headless checks do not establish interactive Linux terminal compatibility. Ordinary native split checks also need a [compatible terminal](docs/installation.md#terminal-compatibility); tmux does not supply missing graphics support.

For Lua changes, install StyLua and luacheck and use the same scopes as CI:

```sh
stylua --check lua plugin test
luacheck lua plugin test/*.lua test/fixtures/*.lua
```

Use [the workflow](.github/workflows/ci.yml) for the exact current CI command list. Report what you ran, what passed or skipped, and any relevant real-device behavior you could not verify. For a visible-preview fix, a process, ready file, or session listing alone is not a screen check: match the requested document and originating terminal to the displayed result.

## Keep test state separate

Node/installer fixtures and renderer smoke scripts allocate temporary directories. Installer tests use temporary project or user configuration locations, and renderer scripts use isolated `XDG_CACHE_HOME`/`XDG_CONFIG_HOME` values. Neovim tests run with `-u NONE` and isolated fixtures; graphical tests document where image APIs are stubbed.

Do not run `install.sh --agent all --scope user` merely to test template changes. The installer suite exercises managed blocks without replacing your normal Codex/Claude/Kiro settings. If you manually test installation, use a temporary project and `--scope project --project /path/to/temporary-project`, inspecting `--dry-run` first.

The real-renderer smoke scripts set `PEEKPANE_SMOKE=1`; external browser requests are recorded, and copy/yank checks use test output or isolated clipboard providers. A regular preview without smoke mode uses the actual browser/clipboard behavior. Do not force `PEEKPANE_HEADLESS=1` globally for checks intended to exercise a real renderer or native split; the appropriate fixtures select their own mode.

For extra manual preview checks, set cache/config paths to temporary directories and use the same environment for open, inspect and file-specific close. Close only your test documents. Leave unrelated previews and user buffers alone, and allow the isolated renderer to exit before removing its temporary cache.

## Regenerate runtime assets when needed

Changes to `src/client.js` or `src/interaction.js` must reach the checked-in client bundle. After changing bundled client/dependency code, run:

```sh
npm run vendor
```

Review and commit the resulting `assets/client.js`, `assets/mermaid.js`/license output, and `THIRD_PARTY_NOTICES.md` changes as applicable. Runtime previews use these local assets, not a CDN or an on-demand build. Do not hand-edit generated JavaScript. Assets such as `assets/style.css` are maintained separately; dependency upgrades may also require reviewing checked-in CSS/font assets.

Documentation-only and Lua-only edits normally do not require regeneration. Keep dependency notices consistent when changing dependencies.

## Submit a pull request

1. Work on a focused branch (or isolated worktree) and keep unrelated local changes out of the commit.
2. Explain the triggering problem, resulting behavior, and verification in the PR. Link the issue; use `Closes #N` when its acceptance criteria are satisfied.
3. Update user documentation, help, changelog or validation records when behavior/coverage changes. Keep verified results distinct from intended or untested support.
4. Open the PR and let the ten required CI checks complete. Main is protected and requires the branch to be up to date; do not bypass protection or push changes directly to main.

Feature-branch pushes do not start a duplicate push workflow. PR creation/updates run the check suite once, and newer revisions supersede older runs for that PR. Main pushes run their own checks. Before opening a PR, you can use the Actions manual workflow dispatch for your branch. Fork PRs retain the unprivileged pull-request workflow; normal repository approval requirements still apply.

The matrix covers macOS/Linux, Node 20/22 and stable/nightly Neovim. The separate macOS real-renderer job covers actual Electron behavior; it does not replace recorded terminal/device verification. See [validation records](docs/validation.md) for current limits.
