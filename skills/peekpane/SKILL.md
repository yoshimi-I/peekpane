---
name: peekpane
description: Show a local document, image, diagram or media file beside the terminal using peekpane, and scroll to source lines when explaining it.
---

When the user asks to preview or display an existing or newly created local file (including a README), execute `peekpane open "FILE" --display split --split right`. Do not substitute a clickable Markdown link for opening the preview. Only say it opened after the command succeeds; report the actual error otherwise.
Use `peekpane FILE:LINE` or `peekpane scroll FILE LINE` when explaining a specific source line. Reopening the same path reuses its preview.

Examples:

```sh
peekpane ./report.md --split right
peekpane ./diagram.svg
peekpane scroll ./report.md 42
peekpane ls --json
peekpane close ./report.md
```

Quote paths with spaces. Use `peekpane push FILE --line N` with stdin for unsaved editor content. Previewing does not publish or upload the artifact.

If the rendering runtime is missing, report that `npm ci` is needed in the peekpane checkout. Do not install a browser or change unrelated agent permissions. Preview trusted local files: raw HTML and local scripts execute in the viewer. External resource requests are blocked inside the preview. In Markdown or local HTML, clicking an HTTP/HTTPS link opens the default browser while leaving the local document visible.
