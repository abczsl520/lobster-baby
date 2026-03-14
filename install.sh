#!/bin/bash
# Lobster Baby Installer
# Usage: curl -fsSL https://raw.githubusercontent.com/abczsl520/lobster-baby/main/install.sh | bash

set -e

REPO="abczsl520/lobster-baby"
APP_NAME="Lobster Baby"
INSTALL_DIR="/Applications"

echo "🦞 Lobster Baby Installer"
echo "========================="

# Detect architecture
ARCH=$(uname -m)
if [ "$ARCH" = "arm64" ]; then
  SUFFIX="arm64"
  echo "✅ Detected Apple Silicon (arm64)"
elif [ "$ARCH" = "x86_64" ]; then
  SUFFIX="x64"
  echo "✅ Detected Intel (x64)"
else
  echo "❌ Unsupported architecture: $ARCH"
  exit 1
fi

# Get latest release
echo "📡 Fetching latest release..."
LATEST=$(curl -fsSL "https://api.github.com/repos/$REPO/releases/latest" | grep '"tag_name"' | sed -E 's/.*"([^"]+)".*/\1/')
VERSION="${LATEST#v}"
echo "📦 Latest version: $LATEST"

# Download DMG
DMG_NAME="LobsterBaby-${VERSION}-${SUFFIX}.dmg"
DMG_URL="https://github.com/$REPO/releases/download/$LATEST/$DMG_NAME"
TMP_DMG="/tmp/$DMG_NAME"

echo "⬇️  Downloading $DMG_NAME..."
curl -fSL --progress-bar -o "$TMP_DMG" "$DMG_URL"

# Mount DMG
echo "📀 Mounting..."
MOUNT_DIR=$(hdiutil attach "$TMP_DMG" -nobrowse -quiet | grep "/Volumes" | awk -F'\t' '{print $NF}')

# Copy to Applications
echo "📁 Installing to $INSTALL_DIR..."
if [ -d "$INSTALL_DIR/$APP_NAME.app" ]; then
  echo "   Removing old version..."
  rm -rf "$INSTALL_DIR/$APP_NAME.app"
fi
cp -R "$MOUNT_DIR/$APP_NAME.app" "$INSTALL_DIR/"

# Unmount
hdiutil detach "$MOUNT_DIR" -quiet 2>/dev/null || true
rm -f "$TMP_DMG"

# Remove quarantine (bypass Gatekeeper "damaged" warning)
echo "🔓 Removing quarantine flag..."
xattr -cr "$INSTALL_DIR/$APP_NAME.app"

echo ""
echo "✅ Lobster Baby $LATEST installed successfully!"
echo "🚀 Opening..."
open "$INSTALL_DIR/$APP_NAME.app"
