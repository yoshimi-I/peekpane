# Local validation

Tested on macOS with Ghostty, tmux and Pixel 0.2.9. No GitHub repository has been created or published by this implementation.

## Automated checks

- `node --test`: CLI parsing, renderers, local resource policy, lazy loading, session reuse, unsaved push, cursor-only updates, atomic saves and exit codes.
- Tests executed with Node 20, 22 and the host Node 23.
- `npm run test:nvim`: commands, actual unsaved-buffer propagation, close/reopen and `:bdelete` cleanup in headless Neovim.
- ESLint, StyLua and luacheck.
- CI configured for macOS/Linux, Node 20/22 and Neovim stable/nightly. Hosted CI has not run yet.

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
