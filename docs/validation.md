# Local validation

Tested on macOS with Ghostty, tmux and Pixel 0.2.9.

## Automated checks

- `node --test`: CLI parsing, renderers, local resource policy, lazy loading, session reuse, unsaved push, cursor-only updates, atomic saves and exit codes.
- Tests executed with Node 20, 22 and the host Node 23.
- `npm run test:nvim`: commands, actual unsaved-buffer propagation, close/reopen and `:bdelete` cleanup in headless Neovim.
- ESLint, StyLua and luacheck.
- GitHub Actions runs on push, pull requests and manual dispatch: macOS/Linux, Node 20/22 and Neovim stable/nightly. A separate macOS job uses the real Electron runtime for DOM selection, PNG round trips, scrolling and Neovim register integration. CI execution status is available from the README badge.

## Real terminal checks

`node scripts/smoke-viewer.js` opens the standalone viewer in temporary terminal panes, checks actual document state and closes its own previews. It does not launch a browser app.

Verified: Markdown, math, Mermaid, PNG/SVG, local HTML with relative CSS/JS/images, CSV, a two-sheet Excel workbook and PDF embedding. PDF page content was additionally verified visually using the included `test/fixtures/simple.pdf`.

MP4 metadata/first-frame decoding (`readyState >= 2`, no media error) was verified using a locally downloaded CC0 sample from Mozilla's interactive examples. Repeat with:

```sh
PEEKPANE_TEST_VIDEO=/path/to/sample.mp4 node scripts/smoke-viewer.js
```

This does not establish support for every video codec or audio output on every platform.

Separate tmux checks verified focus toggling, zoom/unzoom and exact restoration of both original key bindings after closing the final preview.

## Performance and local-only operation

- Plain viewer startup: approximately 1.4–1.9 seconds in local runs.
- Math plus Mermaid live update: approximately 0.36–0.57 seconds, including initial lazy loading and test overhead.
- Full 5,000-line live update: about 161ms in the standalone viewer.
- Backend benchmark: 5,001 Markdown lines, median about 14ms, max about 28ms across ten renders. This measures HTML generation, not terminal painting.
- Plain renderer module load: approximately 16ms and 49MiB process RSS, compared with approximately 131ms and 147MiB before deferring optional engines. Chromium and graphics processes use additional memory.
- Source and viewer updates use file notifications. The viewer has no polling loop or remote debugging port. `lsof` confirmed no TCP listening socket on the viewer process.
- Resource policy tests allow only local schemes and reject HTTP, HTTPS, WebSocket and FTP. Electron request filtering applies the policy to every session. No CDN libraries are loaded at preview time.

## Remaining coverage

Linux rendering, terminal-native splits outside tmux, MOV/M4V/AVIF and other codec variants, audio output, and very large Excel workbooks require additional real-device testing. Raw local HTML/JavaScript is supported; use trusted inputs.

## Shared runtime optimization

Two active previews (the Markdown and HTML demos) now share one Electron host and auxiliary processes. A local before/after sample of worker/host process trees dropped from 12 to 8 processes and aggregate RSS from 964MiB to 836MiB. These are point-in-time sums of process RSS, exclude the pane-launcher Node processes, and double-count shared pages; they are not physical-memory footprint measurements or a universal reduction estimate. Static document rendering defaults to 30fps.

`node scripts/smoke-shared.js` verifies a shared host PID, independent preview closure and continued live HTML updates after closing Markdown. The regular viewer smoke suite also passed with the shared host, including a 5,000-line update in approximately 156ms. The host exits shortly after its last view closes; it uses a mode-600 Unix socket inside the mode-700 cache, with no TCP listener.

## Toggle display

`node scripts/smoke-toggle.js` verified fullscreen opening, fullscreen editor/preview focus switching, and restoration of the original zoom state and source pane on close. Neovim headless tests verify that `display='toggle'` reaches CLI options. The mode uses tmux window zoom; native terminal splits outside tmux retain split mode.

## Neovim window display

`nvim --headless -u NONE -l test/window.lua` verifies that source/preview toggling changes only the original window buffer, preserves the conversation buffer, restores source window options and cleans up stale sessions without repeated errors. The image API is stubbed in this headless test. Separate real-Electron checks generated a local CSS frame and exercised viewport resize/scroll. In the running Neovim, image.nvim reported a rendered image bound to window 1000 while the conversation buffer remained in window 1005; no split was added. Window mode uses offscreen image frames and is not an interactive webview.

## Scroll queue regression

The Neovim window test exercises rapid `j` callbacks, a real `5j` mapping and `k`, checking that every delta survives. `node scripts/smoke-scroll.js` verifies actual browser scroll position after twenty queued requests (1080 CSS pixels) and one reverse request (1026 pixels). Each motion uses a distinct atomic request file, and the renderer processes them in order before capturing a frame.

## Continuous frame presentation

`nvim --headless -u NONE -l test/presenter.lua` uses a deliberately asynchronous fake image backend. It checks that the previous image remains visible until replacement readiness, 100 incoming frames cause only one active transform plus the latest waiting frame, and source PNG deletion cannot invalidate pinned inputs. Preview closure removes pinned frames. The real scroll smoke test also verifies output-sized capture frames to avoid a redundant ImageMagick resize in Neovim.

In the running Neovim, 60 down-scroll callbacks at 20ms intervals produced the expected 3240 CSS-pixel movement. During 140 samples at 20ms intervals, the image.nvim count of rendered images stayed at one (minimum one, maximum one), and one pinned PNG remained after settling. This verifies image-layer continuity and bounded presentation state, not native-browser scroll animation smoothness.

## Interactive DOM text

`node scripts/smoke-text.js` uses the real Electron rendering engine and preload bridge. It verifies rendered heading selection, `v`/`w` word selection, copied text arriving over the copy IPC channel, and direct `j/k` page scroll positions. The test captures copy requests without replacing the user's system clipboard. Shared-view smoke tests verify that the real Pixel WebViews receive the copy bridge. This does not validate a replacement for the raster-based Neovim window mode.

## Same-window DOM interaction

`nvim --headless -u NONE -l test/window-text.lua` runs the real local HTML renderer and real Neovim key mappings. After `Space m p`'s open path, `vwy` selects the rendered heading word `Copy` (without Markdown syntax) and places it in unnamed and yank registers and an isolated clipboard provider. The image API is stubbed for headless operation, and the backend's smoke mode avoids modifying the user's clipboard. The test also checks source/preview toggling and that the conversation window remains unchanged. This validates the supported Vim-style DOM controls, not full native Vim text editing semantics.

## Window scroll latency

On the running macOS/Ghostty/tmux setup, twelve scroll samples (six down, six up) at a 1445×1749 output viewport reduced request-to-frame latency from a warm median of about 151ms to about 100ms. Frame metadata includes per-stage timings; PNG generation fell from about 73ms to about 40ms. These timings include local RPC overhead and end at frame publication, before terminal presentation. They are local measurements, not a frame-rate guarantee.

Transient frames use a fixed PNG filter and low compression. The encoder detects the runtime bitmap channel order and premultiplication using a known pixel, and falls back to the native encoder for unsupported layouts or dimensions. The real-Electron text smoke test verifies bitmap-exact opaque-frame round trips, color and transparency, and DOM selection/copy. The native PNG reference may differ by one color level because of its color conversion rounding. No image downsampling was added. The scroll smoke test verifies sixty queued keyboard actions, reverse movement and exact restoration of the original captured pixels.

A live Neovim hold simulation issued sixty `j` actions at 20ms intervals, then reversed them with sixty `k` actions. The down movement was exactly 2880 CSS pixels; across 240 image-state samples, the rendered-image count remained one, and the conversation buffer remained unchanged.
