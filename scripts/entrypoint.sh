#!/bin/bash
set -e

DATA_DIR="${OPENCLAW_DATA_DIR:-/data}"
STATE_DIR="${OPENCLAW_STATE_DIR:-$DATA_DIR/.openclaw}"
WORKSPACE_DIR="${OPENCLAW_WORKSPACE_DIR:-$DATA_DIR/workspace}"
HOMEBREW_CACHE_DIR="$DATA_DIR/.homebrew-cache"

echo "[entrypoint] OpenClaw Akash - Starting..."

# Create required directories
mkdir -p "$STATE_DIR/agents/main/sessions"
mkdir -p "$STATE_DIR/credentials"
mkdir -p "$STATE_DIR/extensions"
mkdir -p "$WORKSPACE_DIR/memory"
mkdir -p "$WORKSPACE_DIR/skills"
mkdir -p "$HOMEBREW_CACHE_DIR"

# Setup Homebrew environment
export HOME=/root
export HOMEBREW_PREFIX=/home/linuxbrew/.linuxbrew
export HOMEBREW_CACHE="$HOMEBREW_CACHE_DIR"
export HOMEBREW_CELLAR="${HOMEBREW_PREFIX}/Cellar"
export HOMEBREW_REPOSITORY="${HOMEBREW_PREFIX}/Homebrew"
export HOMEBREW_NO_AUTO_UPDATE=1
export HOMEBREW_NO_ANALYTICS=1
export HOMEBREW_NO_INSTALL_CLEANUP=1
export PATH="${HOMEBREW_PREFIX}/bin:${HOMEBREW_PREFIX}/sbin:${PATH}"

# Make Homebrew Cellar persistent by symlinking to /data
PERSISTENT_CELLAR="$DATA_DIR/.homebrew-cellar"
mkdir -p "$PERSISTENT_CELLAR"
if [ -d "${HOMEBREW_PREFIX}/Cellar" ] && [ ! -L "${HOMEBREW_PREFIX}/Cellar" ]; then
    # First run: move any existing packages to persistent storage
    mv "${HOMEBREW_PREFIX}/Cellar"/* "$PERSISTENT_CELLAR/" 2>/dev/null || true
    rm -rf "${HOMEBREW_PREFIX}/Cellar"
    ln -sf "$PERSISTENT_CELLAR" "${HOMEBREW_PREFIX}/Cellar"
    echo "[entrypoint] Linked Homebrew Cellar to persistent storage"
elif [ ! -e "${HOMEBREW_PREFIX}/Cellar" ]; then
    ln -sf "$PERSISTENT_CELLAR" "${HOMEBREW_PREFIX}/Cellar"
    echo "[entrypoint] Linked Homebrew Cellar to persistent storage"
fi

# Make Homebrew directories writable by linuxbrew user
chown -R linuxbrew:linuxbrew "$HOMEBREW_CACHE_DIR" 2>/dev/null || true
chown -R linuxbrew:linuxbrew "$PERSISTENT_CELLAR" 2>/dev/null || true
chown -R linuxbrew:linuxbrew /home/linuxbrew 2>/dev/null || true

# Relink all installed brew packages (recreates bin symlinks after restart)
if [ -d "$PERSISTENT_CELLAR" ] && [ "$(ls -A $PERSISTENT_CELLAR 2>/dev/null)" ]; then
    echo "[entrypoint] Relinking Homebrew packages..."
    su linuxbrew -c "${HOMEBREW_PREFIX}/bin/brew link --force --overwrite \$(${HOMEBREW_PREFIX}/bin/brew list --formula)" 2>/dev/null || true
fi

# Setup npm directories
export NPM_CONFIG_CACHE="$DATA_DIR/.npm-cache"
export NPM_CONFIG_PREFIX="$DATA_DIR/.npm-global"
mkdir -p "$NPM_CONFIG_CACHE" "$NPM_CONFIG_PREFIX/bin"
export PATH="$NPM_CONFIG_PREFIX/bin:${PATH}"

# Setup persistent pip packages
export PIP_TARGET="$DATA_DIR/.pip-packages"
export PYTHONPATH="$PIP_TARGET:${PYTHONPATH:-}"
mkdir -p "$PIP_TARGET/bin"
export PATH="$PIP_TARGET/bin:${PATH}"

# Export state directories
export OPENCLAW_STATE_DIR="$STATE_DIR"
export OPENCLAW_WORKSPACE_DIR="$WORKSPACE_DIR"

echo "[entrypoint] State dir: $STATE_DIR"
echo "[entrypoint] Workspace dir: $WORKSPACE_DIR"
echo "[entrypoint] Homebrew prefix: $HOMEBREW_PREFIX"
echo "[entrypoint] npm global prefix: $NPM_CONFIG_PREFIX"
echo "[entrypoint] pip packages: $PIP_TARGET"

# Virtual display for Chromium
Xvfb :99 -screen 0 1280x800x24 -nolisten tcp &
export DISPLAY=:99

exec "$@"
