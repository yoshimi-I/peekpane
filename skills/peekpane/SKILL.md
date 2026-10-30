---
name: peekpane
description: Show a local document, image, diagram or media file beside the terminal using peekpane, and scroll to source lines when explaining it.
---

When the user asks to preview or display an existing or newly created local file (including a README), execute `peekpane open "FILE" --display split --split right`. Use an absolute file path, quote it, and preserve the requested direction. Do not rewrite the document or substitute a clickable Markdown link for opening it.

## Terminal requirements

The skill supplies instructions, not terminal graphics or split support. Native splits are verified on macOS Ghostty 1.3.1, including Quick Terminal, without tmux. Other macOS/Linux terminals need Kitty graphics plus a supported split adapter or tmux. tmux cannot add graphics to an incompatible terminal. See the [compatibility guide](https://github.com/yoshimi-I/peekpane/blob/main/docs/installation.md#terminal-compatibility).

If the source terminal is missing or ambiguous, report the actual error and direct execution in the intended compatible terminal. Do not guess an unrelated/last pane or use `PEEKPANE_HEADLESS=1` as a user-visible preview workaround.

## Verify and navigate

Only report success after the command succeeds. Use `peekpane ls --json` when needed, matching the requested file and source terminal. An unrelated cached preview is not evidence of success. If visibility is in doubt, inspect the actual pane when possible and state what was verified; process/ready/session metadata alone is not a screen check.

Use `peekpane FILE:LINE` or `peekpane scroll FILE LINE` when explaining a source line. Reopening the same path reuses its preview in the current source context. Use `peekpane push FILE --line N` with stdin for unsaved editor content.

```sh
peekpane open "/absolute/path/to/report.md" --display split --split right
peekpane scroll "/absolute/path/to/report.md" 42
peekpane ls --json
peekpane close "/absolute/path/to/report.md"
```

## Close

Close only the requested file; leave other previews alone. A separate native Ghostty preview pane can also be closed by focusing it and pressing Cmd+W (default `close_surface` binding), confirming if prompted. `q` is not a split-view close shortcut. A same-window Neovim preview uses `:Peek close`; do not suggest closing the editor's terminal pane with Cmd+W.

## Installation and limits

The CLI and optional skill are installed separately. If the command or rendering runtime is missing, report that the repository installation or `npm ci` in the checkout is needed; do not install a separate browser for local rendering or change agent permissions. To refresh existing skills/rules while preserving custom instructions, follow the [refresh guide](https://github.com/yoshimi-I/peekpane/blob/main/docs/installation.md#refresh-existing-agent-integrations).

Previewing does not publish or upload the artifact. Preview trusted files: local HTML/scripts execute. External resource requests remain blocked in the preview; user-clicked HTTP/HTTPS links in Markdown/HTML open in the default browser.
