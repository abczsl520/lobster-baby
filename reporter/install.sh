#!/bin/bash
# 🦞 Lobster Reporter — 一键安装脚本
# Usage: curl -sSL https://lbhub.ai/reporter/install.sh | bash -s -- --token <TOKEN>
# Upgrade: curl -sSL https://lbhub.ai/reporter/install.sh | bash -s -- --upgrade

set -e

INSTALL_DIR="/opt/lobster-reporter"
SCRIPT_URL="https://lbhub.ai/reporter/lobster-reporter.js"
SERVICE_NAME="lobster-reporter"
CONFIG_PATH="$HOME/.lobster-reporter.json"
VERSION="1.0.0"

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

log()   { echo -e "${GREEN}[🦞]${NC} $1"; }
warn()  { echo -e "${YELLOW}[⚠️]${NC} $1"; }
error() { echo -e "${RED}[❌]${NC} $1"; exit 1; }

# Parse args
TOKEN=""
UPGRADE=false
API_BASE=""

while [[ $# -gt 0 ]]; do
  case "$1" in
    --token)   TOKEN="$2"; shift 2 ;;
    --upgrade) UPGRADE=true; shift ;;
    --api)     API_BASE="$2"; shift 2 ;;
    -h|--help)
      echo "🦞 Lobster Reporter Installer v${VERSION}"
      echo ""
      echo "Usage:"
      echo "  curl -sSL https://lbhub.ai/reporter/install.sh | bash -s -- --token <TOKEN>"
      echo ""
      echo "Options:"
      echo "  --token <TOKEN>   Reporter token (from Lobster Baby settings)"
      echo "  --upgrade         Upgrade script only, keep config"
      echo "  --api <URL>       Custom API base URL"
      echo "  -h, --help        Show this help"
      exit 0
      ;;
    *) warn "Unknown option: $1"; shift ;;
  esac
done

# Check Node.js
if ! command -v node &>/dev/null; then
  error "需要 Node.js。请先安装: https://nodejs.org/"
fi

NODE_VER=$(node -v | sed 's/v//' | cut -d. -f1)
if [ "$NODE_VER" -lt 14 ]; then
  error "Node.js 版本过低 ($NODE_VER)，需要 >= 14"
fi

log "Node.js $(node -v) ✅"

# Create install directory
if [ ! -d "$INSTALL_DIR" ]; then
  log "创建安装目录: $INSTALL_DIR"
  sudo mkdir -p "$INSTALL_DIR"
  sudo chown "$(whoami)" "$INSTALL_DIR"
fi

# Download script
log "下载 Reporter 脚本..."
if command -v curl &>/dev/null; then
  curl -sSL "$SCRIPT_URL" -o "$INSTALL_DIR/lobster-reporter.js"
elif command -v wget &>/dev/null; then
  wget -qO "$INSTALL_DIR/lobster-reporter.js" "$SCRIPT_URL"
else
  error "需要 curl 或 wget"
fi
chmod +x "$INSTALL_DIR/lobster-reporter.js"
log "脚本已安装到 $INSTALL_DIR/lobster-reporter.js"

# If upgrade mode, just update script and restart
if [ "$UPGRADE" = true ]; then
  log "升级模式：脚本已更新"
  if systemctl is-active --quiet "$SERVICE_NAME" 2>/dev/null; then
    sudo systemctl restart "$SERVICE_NAME"
    log "服务已重启 ✅"
  else
    warn "服务未运行，请手动启动: node $INSTALL_DIR/lobster-reporter.js"
  fi
  exit 0
fi

# Write config
if [ -n "$TOKEN" ]; then
  CONFIG="{\"token\":\"$TOKEN\""
  if [ -n "$API_BASE" ]; then
    CONFIG="$CONFIG,\"apiBase\":\"$API_BASE\""
  fi
  CONFIG="$CONFIG}"
  echo "$CONFIG" | python3 -m json.tool > "$CONFIG_PATH" 2>/dev/null || echo "$CONFIG" > "$CONFIG_PATH"
  chmod 600 "$CONFIG_PATH"
  log "配置已保存到 $CONFIG_PATH (权限 600)"
elif [ ! -f "$CONFIG_PATH" ]; then
  # Interactive setup
  echo ""
  read -p "请输入你的 Reporter Token: " TOKEN
  if [ -z "$TOKEN" ]; then
    error "Token 不能为空"
  fi
  CONFIG="{\"token\":\"$TOKEN\"}"
  echo "$CONFIG" | python3 -m json.tool > "$CONFIG_PATH" 2>/dev/null || echo "$CONFIG" > "$CONFIG_PATH"
  chmod 600 "$CONFIG_PATH"
  log "配置已保存到 $CONFIG_PATH"
else
  log "已有配置文件 $CONFIG_PATH，跳过配置"
fi

# Create symlink
if [ ! -f "/usr/local/bin/lobster-reporter" ]; then
  sudo ln -sf "$INSTALL_DIR/lobster-reporter.js" /usr/local/bin/lobster-reporter 2>/dev/null || true
fi

# Setup systemd service (if available)
if command -v systemctl &>/dev/null; then
  log "配置 systemd 服务..."

  cat << EOF | sudo tee /etc/systemd/system/${SERVICE_NAME}.service > /dev/null
[Unit]
Description=Lobster Reporter - OpenClaw Status Reporter
After=network.target

[Service]
Type=simple
User=$(whoami)
WorkingDirectory=$INSTALL_DIR
ExecStart=$(which node) $INSTALL_DIR/lobster-reporter.js
Restart=always
RestartSec=5
StandardOutput=journal
StandardError=journal
SyslogIdentifier=$SERVICE_NAME
Environment=NODE_ENV=production

[Install]
WantedBy=multi-user.target
EOF

  sudo systemctl daemon-reload
  sudo systemctl enable "$SERVICE_NAME"
  sudo systemctl start "$SERVICE_NAME"

  sleep 2
  if systemctl is-active --quiet "$SERVICE_NAME"; then
    log "服务启动成功 ✅"
    echo ""
    log "常用命令:"
    echo "  查看状态:  systemctl status $SERVICE_NAME"
    echo "  查看日志:  journalctl -u $SERVICE_NAME -f"
    echo "  重启服务:  sudo systemctl restart $SERVICE_NAME"
    echo "  停止服务:  sudo systemctl stop $SERVICE_NAME"
  else
    warn "服务启动失败，请查看日志: journalctl -u $SERVICE_NAME -n 20"
  fi
else
  # No systemd — output manual instructions
  log "未检测到 systemd，请手动启动:"
  echo ""
  echo "  前台运行: node $INSTALL_DIR/lobster-reporter.js"
  echo "  后台运行: nohup node $INSTALL_DIR/lobster-reporter.js > ~/lobster-reporter.log 2>&1 &"
  echo ""
  warn "建议配置开机自启（crontab 或 supervisor）"
fi

echo ""
log "🎉 Lobster Reporter v${VERSION} 安装完成！"
log "诊断检查: node $INSTALL_DIR/lobster-reporter.js --check"
