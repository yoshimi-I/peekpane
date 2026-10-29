#!/bin/sh
set -eu
peekpane_checkout=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)
if ! command -v node >/dev/null 2>&1; then
  printf '%s\n' 'Node.js 20 or newer is required. Install Node.js, then rerun this script.' >&2
  exit 1
fi
node -e 'if (Number(process.versions.node.split(".")[0]) < 20) { console.error("Node.js 20 or newer is required"); process.exit(1); }'
peekpane_install_cli=true
for peekpane_argument in "$@"; do
  case "$peekpane_argument" in
    --help|--dry-run|--uninstall) peekpane_install_cli=false ;;
  esac
done
# Validate arguments and configuration before downloading or installing anything.
if [ "$#" -gt 0 ]; then
  node "$peekpane_checkout/scripts/install-agents.js" "$@" --dry-run >/dev/null
fi
if [ "$peekpane_install_cli" = true ]; then
  if ! command -v npm >/dev/null 2>&1; then
    printf '%s\n' 'npm is required to install peekpane.' >&2
    exit 1
  fi
  (cd "$peekpane_checkout" && npm ci && npm link)
fi
if [ "$#" -gt 0 ]; then
  exec node "$peekpane_checkout/scripts/install-agents.js" "$@"
fi
printf '%s\n' 'CLI installed. To add agent rules: node scripts/install-agents.js --agent all --scope user'
