# Changelog

All notable changes follow Keep a Changelog and Semantic Versioning.

## [Unreleased]

### Added
- CLI installation with optional user/project preview rules for Codex, Claude Code and Kiro CLI, plus separate portable skill integration.
- Native macOS Ghostty split previews, including Quick Terminal, verified with Ghostty 1.3.1 without tmux.
- Neovim 0.11+ mouse forwarding for same-window previews, including clicks, wheel scrolling, drag selection and copying rendered text.
- User-activated HTTP/HTTPS links open in the default browser from terminal and Neovim previews, while the local document remains visible.
- Neovim `display=window` for source/preview switching inside one existing window using image.nvim, with keyboard scrolling.
- Configurable `display: split|toggle` for side-by-side or fullscreen view switching in tmux.
- Local file preview rendering, CLI sessions and live updates.
- Markdown, Mermaid, math, HTML, images, PDF, media, tables and data trees.
- Neovim commands with unsaved-buffer synchronization.
- Local assets, MIT license, bilingual documentation and CI configuration.

### Fixed
- Route detached agent previews to the verified source terminal instead of trusting stale inherited tmux variables; reject ambiguous source terminals.
- Exclude empty working directories and known viewer surfaces when locating a Ghostty source; retain source identity when reopening previews.
- Publish inspection snapshots atomically before viewer readiness to prevent partial-JSON reads in the renderer checks.
- Preserve existing paths ending in `:NUMBER`, avoid remote Neovim focus handoff from the plugin, and skip source-buffer pushes for binary/media formats.
- Reuse external terminal splits and scope tmux focus/binding restoration to the owning pane/server.
- Clear loading text and hide end-of-buffer markers once a Neovim preview frame is ready.
- Recover from transient offscreen capture failures after resize with bounded capture-only retries.
- Reject stale cached worker identities and stop workers cooperatively, without signaling unrelated reused PIDs.
- Recreate the viewer when switching an existing file between split and same-window display modes.
- Decode filesystem paths when constructing tmux shortcut commands.
- Cancel Neovim opens whose target window or buffer changed; recover previews after window closure and clamp restored cursors after source shrinkage.
- Preserve local HTML root and body attributes, including CSS classes, inline styles and data attributes.
- Start keyboard selection at visible text within a scrolled paragraph.
- Wait for deferred document enhancement before publishing replacement frames after copying.
- Show external Markdown images as text labels in offline previews, preserving badge links without broken-image icons.
- Serialize Neovim content pushes so a slow initial snapshot cannot overwrite newer unsaved edits.
- Route Neovim window-preview selection and yank actions to the HTML DOM, copying rendered text into Vim registers and the clipboard.
- Keep the visible Neovim frame until its replacement is ready; bound long-hold rendering to one pending and one latest frame, and pin images during asynchronous transforms.
- Preserve rapid Neovim preview scroll requests instead of overwriting them; honor counted motions such as `5j`.

### Changed
- Validate feature pull requests once per update; retain main pushes and manual CI dispatch with the existing ten required checks.
- Separate Terminal CLI and Neovim plugin onboarding while keeping terminal compatibility requirements shared.
- Reduce Neovim window scroll latency with fast lossless PNG frames, batched DOM actions and one paint synchronization per capture.
- Share the Electron host and auxiliary processes across previews, while retaining independent close and update behavior.
- Default document rendering to 30fps.
- Replaced the full browser shell with a standalone local CSS viewer using Pixel.
- Removed polling from the page and source watcher; updates use filesystem events.
- Load Mermaid, math, syntax highlighting and spreadsheet engines only when needed.
- Avoid reading media files into the Node process and rerendering cursor-only updates.
- Deny external resource requests and launch without a remote debugging TCP port.

### Known limitations
- Hosted macOS/Linux CI runs successfully; interactive Linux terminal rendering and native adapters beyond the recorded macOS Ghostty setup still need real-device verification.
- Kiro rule-file installation is tested, but actual Kiro CLI session loading remains unverified on the development machine.
- Chromium-based CSS rendering still has a baseline memory cost.
