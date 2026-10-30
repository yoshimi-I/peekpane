# peekpane terminal previews

When the user asks to preview, display, or open a local document (including an existing README), execute the command below instead of returning a Markdown link alone.

```sh
{{PEEKPANE_COMMAND}} open "PATH_TO_FILE" --display split --split right
```

Resolve the requested file in the user's current project, use its absolute path, quote it, and preserve the requested display direction. Do not rewrite a document just to preview it. Reopening the same file reuses its preview in the current source context; file edits appear automatically.

These rules provide agent instructions, not terminal graphics or split support. macOS Ghostty 1.3+ supports native splits, verified on 1.3.1 including Quick Terminal. Other macOS/Linux terminals need Kitty graphics and a supported split adapter or tmux; tmux does not add graphics to an incompatible terminal. See the [compatibility guide](https://github.com/yoshimi-I/peekpane/blob/main/docs/installation.md#terminal-compatibility).

If the source terminal is missing or ambiguous, report the actual error and have the command run directly in the intended compatible terminal. Do not guess an unrelated/last pane or use `PEEKPANE_HEADLESS=1` as a visible-preview workaround.

A successful command is required before reporting success. Check `{{PEEKPANE_COMMAND}} ls --json` when needed and match the requested file and source terminal, not just any cached session. If the visible result is in doubt, check the actual pane when possible and state what was verified; a ready file, process, or session entry alone is not a screen check.

Close only the requested file with `{{PEEKPANE_COMMAND}} close "PATH_TO_FILE"`. Do not close other previews. For a separate native Ghostty preview pane, focus that pane and use Cmd+W (default `close_surface` binding), confirming if prompted. `q` is not a split-view close shortcut. A same-window Neovim preview uses `:Peek close`; Cmd+W would close the editor's terminal pane.

Preview trusted local files; HTML and local scripts can execute. External resources remain blocked inside the preview; HTTP/HTTPS links in Markdown/HTML open in the default browser when clicked. This integration does not authorize changes to agent permissions or sandbox settings.
