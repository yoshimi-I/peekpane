# peekpane terminal previews

When the user asks to preview, display, or open a local document (including an existing README), run the terminal preview command below. Requests such as “READMEをプレビュー表示して” should execute the command, rather than return a Markdown link alone.

```sh
{{PEEKPANE_COMMAND}} open "PATH_TO_FILE" --display split --split right
```

Resolve the requested file in the user's current project, quote its path, and preserve any display direction the user requests. Do not rewrite the document just to preview it. Opening the same file reuses its preview; file edits appear automatically.

Only report that the preview opened after the command succeeds. Verify it with `{{PEEKPANE_COMMAND}} ls --json` when needed. Report the actual error if opening fails; a clickable file link does not establish that a preview was opened.

Close only the requested file with `{{PEEKPANE_COMMAND}} close "PATH_TO_FILE"`. Do not close other previews. Preview trusted local files; HTML and local scripts can execute. This integration does not authorize changes to agent permissions or sandbox settings.
