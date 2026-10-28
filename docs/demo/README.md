# Preview demo

- [MP4](peekpane-demo.mp4): 18 seconds, 1280×720, H.264, 15fps, no audio.
- [README animation](peekpane-demo.gif): 960×540, 10fps.
- [Poster](poster.png).

This records actual frames produced by peekpane's local renderer. It shows Markdown tables and code, rendered text selection, an unsaved update through `peekpane push`, Mermaid and math, then local HTML/CSS. Cuts switch between real preview sessions. The clipboard is isolated during recording.

It is a recording of preview output, not a screen recording of Ghostty or Neovim. macOS screen-recording permission was unavailable during capture. For a view of the terminal UI, see the [standalone screenshot](../images/preview.png). This clip is not a scroll latency benchmark.

## Record again

From the repository root, install dependencies with `npm ci` and make FFmpeg available. It is a recording-time tool, not an application dependency. Move the existing MP4 aside before running this command; the script refuses to overwrite it.

```sh
FFMPEG=/path/to/ffmpeg node scripts/record-demo.js
```

The script opens isolated temporary sessions, captures the real output, encodes the MP4, and closes its own sessions. It does not change the user's active previews or system clipboard. It also writes the poster. Regenerate the README GIF with:

```sh
ffmpeg -i docs/demo/peekpane-demo.mp4 \
  -filter_complex '[0:v]fps=10,scale=960:-1:flags=lanczos,split[a][b];[a]palettegen=stats_mode=diff[p];[b][p]paletteuse=dither=bayer:bayer_scale=5:diff_mode=rectangle[v]' \
  -map '[v]' -loop 0 docs/demo/peekpane-demo.gif
```

The repository's [MIT license](../../LICENSE) applies to the demo and recording script. Dependencies retain their own licenses.
