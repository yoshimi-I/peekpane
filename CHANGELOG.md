# Changelog

All notable changes follow Keep a Changelog and Semantic Versioning.

## [Unreleased]

### Added
- Neovim `display=window` for source/preview switching inside one existing window using image.nvim, with keyboard scrolling.
- Configurable `display: split|toggle` for side-by-side or fullscreen view switching in tmux.
- Local file preview rendering, CLI sessions and live updates.
- Markdown, Mermaid, math, HTML, images, PDF, media, tables and data trees.
- Neovim commands with unsaved-buffer synchronization.
- Local assets, MIT license, bilingual documentation and CI configuration.

### Fixed
- Show external Markdown images as text labels in offline previews, preserving badge links without broken-image icons.
- Serialize Neovim content pushes so a slow initial snapshot cannot overwrite newer unsaved edits.
- Route Neovim window-preview selection and yank actions to the HTML DOM, copying rendered text into Vim registers and the clipboard.
- Keep the visible Neovim frame until its replacement is ready; bound long-hold rendering to one pending and one latest frame, and pin images during asynchronous transforms.
- Preserve rapid Neovim preview scroll requests instead of overwriting them; honor counted motions such as `5j`.

### Changed
- Reduce Neovim window scroll latency with fast lossless PNG frames, batched DOM actions and one paint synchronization per capture.
- Share the Electron host and auxiliary processes across previews, while retaining independent close and update behavior.
- Default document rendering to 30fps.
- Replaced the full browser shell with a standalone local CSS viewer using Pixel.
- Removed polling from the page and source watcher; updates use filesystem events.
- Load Mermaid, math, syntax highlighting and spreadsheet engines only when needed.
- Avoid reading media files into the Node process and rerendering cursor-only updates.
- Deny external resource requests and launch without a remote debugging TCP port.

### Known limitations
- Hosted CI and Linux rendering have not been exercised locally.
- Chromium-based CSS rendering still has a baseline memory cost.
