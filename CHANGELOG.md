# Changelog

All notable changes follow Keep a Changelog and Semantic Versioning.

## [Unreleased]

### Added
- Local file preview rendering, CLI sessions and live updates.
- Markdown, Mermaid, math, HTML, images, PDF, media, tables and data trees.
- Neovim commands with unsaved-buffer synchronization.
- Local assets, MIT license, bilingual documentation and CI configuration.

### Changed
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
