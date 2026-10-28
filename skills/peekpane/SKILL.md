---
name: peekpane
description: Show a local document, image, diagram or media file beside the terminal using peekpane, and scroll to source lines when explaining it.
---

When the user wants to see a local artifact you created, run `peekpane FILE`.
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

If the rendering runtime is missing, report that `npm ci` is needed in the peekpane checkout. Do not install a browser or change unrelated agent permissions. Preview trusted local files: raw HTML and local scripts execute in the viewer. External resource requests are blocked.
