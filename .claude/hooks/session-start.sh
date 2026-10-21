#!/bin/bash
# Installs REA (reverse engineer anything) with the Hopper provider and
# registers its MCP server and skill with Claude Code in cloud sessions.
set -euo pipefail

if [ "${CLAUDE_CODE_REMOTE:-}" != "true" ]; then
  exit 0
fi

REA_VERSION="${REA_VERSION:-6.7.0}"

rea_ready() {
  dpkg -s hopper >/dev/null 2>&1 \
    && [ -f "$HOME/.claude/skills/reverse-engineer-anything/SKILL.md" ] \
    && grep -q "rea-agents@${REA_VERSION}" "$HOME/.claude.json" 2>/dev/null
}

if rea_ready; then
  echo "REA ${REA_VERSION} already installed" >&2
  exit 0
fi

# Hopper's .deb depends on Qt6 packages that are only resolvable after a
# fresh package index.
apt-get update -qq >&2

npx -y "rea-agents@${REA_VERSION}" setup \
  --client claude_code \
  --install-hopper \
  --yes \
  --format json >/dev/null

rea_ready
echo "REA ${REA_VERSION} installed" >&2
