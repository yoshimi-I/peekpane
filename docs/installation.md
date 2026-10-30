# Install peekpane and connect your agent

peekpane is an early development release installed from this repository. It is not published to npm: do not use `npm install -g peekpane` or `npx peekpane`.

## Requirements

- Node.js 20 or newer, npm, and Git.
- macOS or Linux and a terminal that supports Kitty graphics.
- For splits across supported platforms, tmux 3.2 or newer. Native splits without tmux have been tested on macOS with Ghostty 1.3.1; Ghostty's native automation requires 1.3 or newer. Ghostty on Linux requires tmux for splitting.
- Agent CLIs are installed separately. The installer does not install Codex, Claude Code, or Kiro CLI and does not change their permission settings.

## Terminal compatibility

peekpane does not support every terminal. Kitty graphics support and pane splitting are separate requirements: tmux can provide splitting, but cannot make an incompatible terminal display Kitty graphics. Installing agent instructions or an optional skill changes neither requirement.

| Environment | Split requirements | Verification |
| --- | --- | --- |
| macOS + Ghostty 1.3+ | Native splits, including Quick Terminal; no tmux required. | Markdown and HTML verified on Ghostty 1.3.1 without tmux. |
| macOS + Ghostty + tmux 3.2+ | Kitty graphics and tmux splitting. | Verified with tmux. |
| Linux + Ghostty | tmux 3.2+ for splitting; Kitty graphics remains required. | Linux CI covers automated checks, not interactive display in every terminal. |
| Other macOS/Linux terminals | Kitty graphics, plus either a supported native split adapter or tmux 3.2+. | Not universally tested. A dependency's adapter list is not proof of end-to-end compatibility. |
| Windows | Not supported by the current CLI. | Not verified. |

`display=toggle` specifically requires tmux. Neovim's `display=window` uses image.nvim with a Kitty-compatible backend and ImageMagick instead of a native terminal split; it does not remove the graphics requirement. See [validation records](validation.md) for test coverage.

## Install the CLI and agent rules together

```sh
git clone https://github.com/yoshimi-I/peekpane.git
cd peekpane
./install.sh --agent all --scope user
```

This runs `npm ci`, links the terminal command with `npm link`, and installs persistent preview instructions for all three agents. The first install downloads Pixel's Electron runtime. Keep this checkout: both the terminal command and the agent instructions reference it.

Choose one agent with `--agent codex`, `--agent claude`, or `--agent kiro`. Omit all arguments to install only the CLI:

```sh
./install.sh --agent codex --scope user
./install.sh
```

Inspect changes without downloading dependencies, linking commands, or changing configuration:

```sh
./install.sh --agent all --scope user --dry-run
```

If `npm link` cannot write to its global prefix, use a user-managed Node.js installation. Alternatively, install dependencies and the agent rules without a global command:

```sh
npm ci
node scripts/install-agents.js --agent all --scope user
node bin/peekpane.js examples/demo.md --display split
```

Installed rules use absolute paths to Node and this checkout's CLI, so they do not depend on the agent finding a global `peekpane` executable. Reinstall the rules after moving the checkout or replacing the Node.js installation.

## Where the rules go

These are the default agent configuration locations. The installer fills in command placeholders in the templates; use it rather than copying the raw template files.

| Agent       | `--scope user`: every local project                     | `--scope project --project DIR`: one project | Template                                        |
| ----------- | ------------------------------------------------------- | -------------------------------------------- | ----------------------------------------------- |
| Codex       | `~/.codex/AGENTS.md` (`$CODEX_HOME/AGENTS.md` when set) | `DIR/AGENTS.md`                              | [AGENTS.md](../integrations/codex/AGENTS.md)    |
| Claude Code | `~/.claude/CLAUDE.md`                                   | `DIR/CLAUDE.md`                              | [CLAUDE.md](../integrations/claude/CLAUDE.md)   |
| Kiro CLI    | `~/.kiro/steering/peekpane.md`                          | `DIR/.kiro/steering/peekpane.md`             | [peekpane.md](../integrations/kiro/peekpane.md) |

`--scope user` applies to the current OS user and configured agent across local projects and terminal sessions on the same machine. It does not automatically configure another machine, OS user, or independently configured agent profile. `--scope project --project DIR` applies only to the chosen project. Start a new agent session after installation so the instructions can be loaded. Changing terminal applications does not remove the terminal compatibility requirements above.

Rules apply when you ask to preview a local file; they do not automatically preview every agent answer or every file edit. They tell the agent to execute the preview command and check its result instead of returning a file link alone.

The installer appends or updates only the section between `<!-- peekpane:begin -->` and `<!-- peekpane:end -->`. It preserves existing instructions and symlinks to dotfiles. Before changing an existing file it saves a neighboring `.peekpane-backup-*` copy. Repeating installation produces no additional changes or duplicate sections. Unbalanced markers and an unrelated existing Kiro `peekpane.md` cause an error before any agent files are written.

For a project-only installation, pass the target explicitly:

```sh
node scripts/install-agents.js --agent all --scope project --project /path/to/your-project --dry-run
node scripts/install-agents.js --agent all --scope project --project /path/to/your-project
```

Do not commit machine-specific installed rules containing absolute checkout paths to a shared repository. For team distribution, commit the templates and have each developer run the installer in their own checkout, or replace the generated command with the team's globally installed `peekpane` command.

### Kiro custom agents

Default Kiro agents load steering according to the agent's version and configuration. Custom agents must explicitly include the installed steering file in their existing `resources` array. Add an entry; preserve the other resources and permissions:

```json
{
  "resources": ["file://~/.kiro/steering/peekpane.md"]
}
```

For project scope use `file://.kiro/steering/peekpane.md`. This is a fragment to merge into your custom agent configuration, not a replacement agent definition. The installer prints the steering path but never rewrites custom agents or tool allowlists. Kiro CLI is not installed in the development machine used for this integration: its file installation is tested; actual Kiro session loading must be verified on a machine with Kiro installed.

See [Kiro's steering documentation](https://kiro.dev/docs/steering/) for custom-agent resource loading. Codex uses [AGENTS.md instructions](https://developers.openai.com/codex/guides/agents-md); Claude Code uses [CLAUDE.md instructions](https://code.claude.com/docs/en/memory).

## Try it

First test the CLI from your Ghostty or tmux shell:

```sh
peekpane /absolute/path/to/README.md --display split --split right
peekpane ls --json
```

Then start a new Codex, Claude Code, or Kiro CLI session in your project and ask:

```text
READMEをプレビュー表示して
```

The agent should execute a command ending in `open ".../README.md" --display split --split right`; a preview should open beside the terminal. A reply containing only a Markdown link has not opened peekpane. File edits update an open preview automatically. Close just that document with `peekpane close /absolute/path/to/README.md`.

The separate [portable skill](../skills/peekpane/SKILL.md) remains available for skill-based integration. Rule installation above does not install or replace any existing skills; it works without an explicit skill invocation. To add the optional Codex skill, copy or symlink `skills/peekpane` into `~/.agents/skills/peekpane`; Claude Code uses `~/.claude/skills/peekpane`. Do not overwrite an existing skill folder. Codex then supports `$peekpane` and Claude Code supports `/peekpane`. Start a new session after adding integrations if the current session does not reload them.

## Open external links

Click an HTTP/HTTPS link in a Markdown or local HTML preview to open it in the default browser. The preview stays on the local document. Normal links, links with `target="_blank"`, and middle clicks use the same bridge; Neovim `window` mode supports it through mouse forwarding on Neovim 0.11+.

Only user-activated HTTP/HTTPS URLs are passed to the browser. External images, scripts, stylesheets, and other network resources remain blocked inside the preview. No local server is required.

## Close a preview

For a native Ghostty split, click the preview pane and press **Cmd+W**, the default `close_surface` binding. Confirm closing if Ghostty prompts. This closes the focused pane, so select the preview first. A customized Ghostty keymap may use a different shortcut. The split viewer does not bind `q` to close.

Alternatively, run this from the source shell, using the previewed file's absolute path so the command is independent of the current directory:

```sh
peekpane close /absolute/path/to/file
```

## Troubleshooting

- **The agent returns only a file link:** check the installed rule path and start a new agent session. For Kiro custom agents, check `resources`. You can explicitly ask it to execute the command printed in the installed rule.
- **`peekpane: command not found`:** add your npm global bin directory to the shell's PATH, or use `node /path/to/peekpane/bin/peekpane.js FILE`. Installed agent rules already use absolute commands.
- **Automation error on macOS:** check the reported macOS Automation permission for the process controlling Ghostty. For a terminal-independent alternative, run the agent inside tmux.
- **Ghostty Quick Terminal:** supported on macOS, including native splits without tmux. Detached agents locate it by the project directory. If multiple terminals use that directory, run the command directly in the intended terminal. Stale inherited tmux variables do not select another session. Reopening a file moves an old preview to the current source terminal.
- **Cannot split or cannot identify the terminal:** run from the actual Ghostty/tmux session. A background task or detached agent may have no originating terminal to split. Ghostty on Linux needs tmux.
- **The checkout or Node moved:** rerun `node scripts/install-agents.js --agent all --scope user` from the checkout's new location.
- **A rule file has incomplete markers:** restore the file from its `.peekpane-backup-*` copy or repair only the marked section, then rerun. The installer intentionally refuses to guess which user instructions to remove.

## Uninstall

Remove the installed rules with the same agent and scope used for installation:

```sh
node scripts/install-agents.js --agent all --scope user --uninstall --dry-run
node scripts/install-agents.js --agent all --scope user --uninstall
node scripts/install-agents.js --agent all --scope project --project /path/to/your-project --uninstall
```

Uninstallation removes only peekpane's marked section, preserving text added before or after it. An otherwise empty managed Kiro steering file is removed. Backup files and any separately installed skills remain available for manual inspection. It does not close running previews, remove dependencies, or delete the checkout.

To remove the globally linked CLI separately:

```sh
npm unlink --global peekpane
```
