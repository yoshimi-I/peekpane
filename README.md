# peekpane

[![CI](https://github.com/yoshimi-I/peekpane/actions/workflows/ci.yml/badge.svg)](https://github.com/yoshimi-I/peekpane/actions/workflows/ci.yml)

<p align="center">
  <img src="docs/brand/icon.png" width="160" alt="peekpane owl peeking over a terminal pane">
</p>

Preview local files with CSS inside your terminal. Use the standalone CLI or the Neovim plugin; both share the same local rendering engine. Early development release; not published to npm.

[日本語](README.ja.md) · [MIT](LICENSE) · Node.js 20+

Choose how you want to use peekpane:

| Use it from | Start here | What you install |
| --- | --- | --- |
| A terminal or AI agent CLI | [Terminal CLI](#terminal-cli) | Standalone command; agent rules are optional. Neovim is not required. |
| Neovim | [Neovim plugin](#neovim-plugin) | Install with lazy.nvim; the plugin runs its bundled CLI. No global CLI installation is required. |

Both paths need a [compatible terminal](#terminal-compatibility).

## Demo

![Real Ghostty and Neovim demo: source, CSS preview and live edits](docs/demo/terminal-demo.gif)

The GIF above plays automatically and loops. [Recording setup](docs/demo/README.md).

Recorded in Ghostty with Neovim. The demo shows Markdown, Mermaid, text selection, unsaved edits and local HTML — entirely in English.

## Requirements

Requires macOS or Linux and a terminal with Kitty graphics support. peekpane does not work in every terminal; tmux provides pane management but does not add graphics support to an incompatible terminal. `npm ci` installs the [Pixel](https://github.com/zenbu-labs/terminal-browser/tree/main/pixel) rendering library and its patched Electron runtime. No separate browser installation is needed. The first install downloads the runtime; opening local files does not use a server.

### Terminal compatibility

| Environment | Split requirements | Verification |
| --- | --- | --- |
| macOS + Ghostty 1.3+ | Native Ghostty splits; tmux is not required. Includes Quick Terminal. | Markdown and HTML verified on Ghostty 1.3.1 without tmux. |
| macOS + Ghostty + tmux 3.2+ | Kitty graphics and tmux pane splitting. | Verified with tmux. |
| Linux + Ghostty | tmux 3.2+ is required for splitting; Kitty graphics is still required. | Linux CI is not an interactive terminal compatibility test. |
| Other macOS/Linux terminals | Kitty graphics plus a supported native split adapter or tmux 3.2+. | Not all terminals have been tested; adapter availability is not a compatibility guarantee. |
| Windows | Not supported by the current CLI. | Not verified. |

Installing an agent rule or skill does not provide terminal graphics or split support. See [terminal requirements and verification limits](docs/installation.md#terminal-compatibility).

Open previews share one Electron host, GPU process and network service. The host exits when its final preview closes. Rendering is capped at 30fps by default for document previews. Communication uses a permission-restricted Unix socket inside the cache directory; no TCP port is opened.

The viewer displays only the document: no tabs, address bar, browser shell, or remote debugging port. Renderer assets are checked in under `assets/`; no build or CDN access is needed when previewing.

## Terminal CLI

Use this path to preview files from a shell, Codex, Claude Code, or Kiro CLI. Neovim is not required.

### Install the CLI

```sh
git clone https://github.com/yoshimi-I/peekpane.git
cd peekpane
./install.sh
peekpane README.md
```

This installs the terminal command only. To let an AI agent open previews when asked, add the optional [agent rules](#ai-agent-integration-optional). See the [installation guide](docs/installation.md) for dry runs, project scope, and uninstall.

### Usage

```sh
peekpane report.md:42 --split left --size 0.45
peekpane open image.png
peekpane scroll report.md 80
printf '# Unsaved\n' | peekpane push report.md --line 1
peekpane ls --json
peekpane focus
peekpane zoom
peekpane close report.md
peekpane close
```

The CLI and Neovim plugin support: Markdown/MDX (Markdown syntax only), Mermaid, HTML, images, PDF, video, audio, CSV/TSV, Excel, JSON/YAML and plain text. Markdown includes tables, tasks, footnotes, highlighted code and KaTeX math. Mermaid loads only when a diagram is present. Excel uses SheetJS CE 0.20.3 from its [official distribution](https://docs.sheetjs.com/docs/getting-started/installation/). A viewer cannot add codecs absent from Chromium.

Images have a Fit / Actual size button; CSV and Excel headers sort columns; Excel sheets have tabs. `--type markdown|mermaid|html|image|pdf|video|audio|csv|tsv|excel|json|yaml|text` overrides extension detection. `--css FILE` adds a local stylesheet.

Opening a file again reuses its preview. Filesystem change notifications trigger updates after a short debounce. The viewer receives changes directly; there is no page polling. Moving the cursor does not rerender unchanged content. Errors from rendering a changed file are recorded in its cache directory's `error.txt`; the last successful rendering remains visible. Exit codes: 0 success, 1 runtime error, 2 usage error.

### Closing a preview

To close a native Ghostty preview, click its pane and press **Cmd+W** (default `close_surface` binding); confirm if prompted. You can also run `peekpane close /absolute/path/to/file` from the source shell. `q` is not a split-view close shortcut.

### Text selection in the interactive viewer

The split viewer retains browser DOM text. Select text with the mouse and press `y` or Cmd+C to copy it. Keyboard selection also works: `v` starts selection at visible text, `h/l` extends by character, `w/b` by word and `j/k` by rendered line; `y` copies the selected rendered text. Escape clears selection. Outside selection mode, `j/k` scrolls the WebView directly. These controls apply to the interactive split/toggle viewer, not the experimental Neovim screenshot buffer.

Click an HTTP/HTTPS link in Markdown or local HTML to open it in your default browser while keeping the local preview in place. This also works with mouse forwarding in Neovim `window` mode. External images, stylesheets and scripts are not downloaded into the preview.

### CLI configuration

`~/.config/peekpane/config.json` (or `$XDG_CONFIG_HOME/peekpane/config.json`):

```json
{
  "display": "split",
  "split": "right",
  "size": 0.5,
  "focus_key": "M-p",
  "zoom_key": "M-P",
  "css": "/absolute/path/to/custom.css"
}
```

CLI flags take precedence. Set either key to `false` to disable its binding. In tmux the bindings exist while previews are open, then original bindings are restored on `close`. Outside tmux, Pixel’s terminal adapter opens the split; focus and zoom are unavailable. Bindings are server-wide, so avoid simultaneously managing previews from multiple tmux servers with a shared cache. Ghostty Cmd-key translation belongs in your dotfiles.

### AI agent integration (optional)

Install persistent preview rules into Codex's `AGENTS.md`, Claude Code's `CLAUDE.md`, or Kiro CLI's steering directory:

```sh
node scripts/install-agents.js --agent all --scope user --dry-run
node scripts/install-agents.js --agent all --scope user
```

`--scope user` installs instructions for the configured agent and current OS user across local projects and terminal sessions on the same machine. It does not configure other users, machines, or independently configured agent profiles. `--scope project --project DIR` limits the instructions to that project. Start a new agent session after installation.

These rules tell an agent to run peekpane when asked to preview a local file. They do not automatically preview every response, and switching terminal applications still requires a compatible terminal. Rule installation and optional skill installation are separate; `install.sh --agent all --scope user` installs the persistent rules, not the optional skills.

Kiro steering-file installation is tested; actual Kiro CLI loading has not been verified on the development machine.

The installer preserves existing instructions, supports project scope and uninstall, and uses absolute CLI paths. Kiro custom agents must include the installed steering file in their resources. See the [complete installation guide](docs/installation.md) and [agent templates](integrations). The [portable skill](skills/peekpane/SKILL.md) is an optional alternative; neither approach changes agent permissions.

## Neovim plugin

Use this path to preview the current buffer and follow unsaved changes or cursor movement. Install the plugin directly; you do not need to run `install.sh`, link a global `peekpane` command, or install agent rules.

### Install with lazy.nvim

Requires Neovim 0.10+, Node.js 20+, npm, and a compatible terminal. Mouse forwarding in `window` mode requires Neovim 0.11+. Add this to your lazy.nvim configuration:

```lua
{
  'yoshimi-I/peekpane',
  main = 'peekpane',
  -- dependencies = { '3rd/image.nvim' }, -- required for display='window'
  build = 'npm ci',
  cmd = { 'Peek', 'PeekScroll', 'PeekFocus', 'PeekZoom' },
  keys = {
    { '<leader>mp', '<cmd>Peek toggle<cr>', desc = 'Preview: toggle' },
  },
  opts = function(plugin)
    return {
      display = 'split', split = 'right', size = 0.45, follow_cursor = true,
      cmd = { 'node', plugin.dir .. '/bin/peekpane.js' },
    }
  end,
}
```

The build step installs dependencies in the plugin checkout, and `cmd` runs its bundled CLI. Node.js and npm must be on Neovim's PATH. The example binds `<leader>mp` to toggle a side-by-side preview; `split` is the default display mode.

### Display modes and controls

Choose a display style in `setup` / lazy.nvim `opts`:

```lua
display = 'window' -- replace only the current Neovim window with a preview
-- display = 'toggle' -- switch the whole tmux window to fullscreen preview
-- display = 'split' -- show both side by side (default)
```

`window` mode requires image.nvim (configured with a Kitty-compatible backend and ImageMagick). It displays a locally rendered image in a scratch buffer inside the same Neovim window: `<leader>mp` is the only preview key that switches back to source; `i`, `q` and Alt+P keep the preview open. `j/k` scrolls; `v` starts selection of HTML text, `h/l`, `w/b` and `j/k` extend it, and `y` copies the DOM text into Neovim’s unnamed/yank registers and clipboard. Escape clears selection. Ctrl-d/u scrolls by half a page. Other Neovim windows stay unchanged. Window mode transfers rendered frames to the terminal, while keyboard selection operates on the retained HTML DOM. It implements the listed Vim-style controls, not every native Vim motion or text object. On Neovim 0.11+, mouse clicks, wheel scrolling and drag text selection are forwarded to the HTML view; buttons, checkboxes, sheet tabs and in-page links can be operated with the mouse. Press `y`, Ctrl+C or Cmd+C to copy selected text. Mouse coordinates have terminal-cell precision. Neovim mouse options are enabled only while a preview is visible and restored afterward. Use `split` for continuously playing video or animation. `:Peek close` releases the renderer.

Toggle mode uses tmux window zoom, so it covers the whole tmux window, including other panes. Alt+P / `:PeekFocus` switches between the full-screen views. `:Peek close` restores the layout from before opening. `split` and `size` control the side-by-side layout and are otherwise secondary to toggle mode. Toggle mode currently requires tmux; this is a view switch, not a Neovim buffer replacement.

`:Peek [open|close|toggle] [left|right|up|down]`, `:PeekScroll [line]`, `:PeekFocus`, `:PeekZoom`. Unsaved changes and cursor movements are debounced by 150ms. Save a new buffer once before opening. Only previews owned by this Neovim are closed on exit. No editor keymaps are installed automatically.

## Privacy and current limitations

Peekpane uses `file://` pages, atomic cache files and no server or listening port of its own. Cache directories use mode 700 and files use 600, under `$XDG_CACHE_HOME/peekpane` or `~/.cache/peekpane`. `peekpane close` removes preview contents.

The viewer permits only `file:`, `data:`, `blob:` and `about:` resource requests, blocks external navigation inside the viewer and popups, and denies camera, microphone and other permission requests. User-activated HTTP/HTTPS links open in the default browser through a dedicated bridge; other external URL schemes are not opened. The runtime is started directly without a TCP debugging port. Unix-domain IPC used by the rendering library stays local. Local HTML scripts can run, so open trusted documents only; local resources are not isolated from one another.

Validated on macOS with Ghostty/tmux: Markdown, math/Mermaid, live unsaved updates, PNG/SVG, local HTML/CSS/JS, CSV, Excel, PDF and an MP4 sample. Plain-view startup was approximately 1.5s; a 5,001-line Markdown render took a median 14ms in the local backend benchmark. These are measurements on one machine, not universal guarantees. Chromium still requires memory for CSS rendering. Media coverage and Linux CI status are recorded in [docs/validation.md](docs/validation.md).

## License

[MIT](LICENSE). Third-party licenses and attributions are listed in [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md).

## Development

See [CONTRIBUTING.md](CONTRIBUTING.md) for checkout setup, checks for CLI/renderer/Neovim changes, isolated test state, asset regeneration, and the pull-request workflow.

```sh
npm ci
npm test
npm run lint
PEEKPANE_HEADLESS=1 npm run test:nvim
npm run vendor
node scripts/benchmark.js
node scripts/smoke-viewer.js # opens and closes real terminal panes
stylua --check lua plugin test/nvim.lua
luacheck lua plugin test/nvim.lua
```

`npm run vendor` bundles the browser assets and regenerates [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md), including dependency versions and licenses. Commit `package-lock.json` and generated assets together. `PEEKPANE_HEADLESS=1` skips browser/pane operations for integration tests; it is not a preview mode.
