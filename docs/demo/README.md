# Terminal demo

- [Watch the real terminal recording (MP4)](terminal-demo.mp4): about 24 seconds, no audio.
- [README animation (GIF)](terminal-demo.gif).
- [Poster](terminal-demo.png).

The video records the actual Ghostty screen with Neovim and peekpane running inside tmux. It shows source/preview switching with `Space mp`, scrolling, selection and yank, unsaved edits, Mermaid, math, and local HTML/CSS. All demo content and editor labels are in English.

Recording uses the open-source [FFmpeg](https://ffmpeg.org/) with its [AVFoundation screen-capture input](https://ffmpeg.org/ffmpeg-devices.html#avfoundation). The GIF is exported from that screen recording. It is not reconstructed from document snapshots. Audio and mouse-pointer capture are disabled, and the recorded region contains only the dedicated demo terminal.

## Record again

Run inside an existing tmux session in Ghostty on macOS, with exactly one Ghostty window visible and tmux `allow-passthrough` enabled. Install the application dependencies with `npm ci`; Neovim, ImageMagick, image.nvim and FFmpeg must also be available. Enable Ghostty in macOS **Privacy & Security → Screen Recording**.

```sh
FFMPEG=/path/to/ffmpeg node scripts/record-demo.js --replace
```

Set `IMAGE_NVIM_PATH` if image.nvim is not installed at `~/.local/share/nvim/lazy/image.nvim`. `SCREEN_DEVICE` defaults to `Capture screen 0`.

The recorder creates its own tmux window, temporary documents, isolated preview cache and minimal [Neovim configuration](terminal-init.lua). It temporarily hides the tmux status bar and restores the previous window and status setting afterward. Its clipboard provider is isolated. The original editor buffers and dotfiles are not edited.

The repository's [MIT license](../../LICENSE) applies to the demo and recording scripts. Dependencies retain their own licenses.
