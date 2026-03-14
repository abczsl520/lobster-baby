# 🦞 龙虾宝宝 Lobster Baby

<div align="center">

![Lobster Baby](src/assets/lobster-nobg.png)

**一个可爱的桌面宠物，实时监控你的 OpenClaw 编程助手状态**

**A cute desktop pet that monitors your OpenClaw coding assistant in real-time**

[![GitHub release](https://img.shields.io/github/v/release/abczsl520/lobster-baby)](https://github.com/abczsl520/lobster-baby/releases)
[![License](https://img.shields.io/github/license/abczsl520/lobster-baby)](LICENSE)
[![Platform](https://img.shields.io/badge/platform-macOS%20%7C%20Windows-lightgrey)](https://github.com/abczsl520/lobster-baby)

[中文](#-特性) | [English](#-features)

</div>

---

## ✨ 特性

- 🎨 **10 级龙虾皮肤** — AI 生成，从粉色宝宝到龙虾之王
- 📊 **真实 API 用量** — 扫描 OpenClaw session 文件，精确统计
- 🌐 **龙虾社区** — 注册编号、排行榜、PK 对战
- 🏆 **成就系统** — Token 里程碑解锁
- 📈 **趋势图表** — 每日 Token 消耗可视化
- 🖱️ **边缘吸附** — 拖到屏幕边缘自动停靠，专属停靠动画
- 🔔 **自动更新** — 检测新版本并提示
- 🧩 **插件系统** — 安装/开发插件扩展功能，权限沙箱保护
- 🌍 **多语言** — 中文/English，自动检测系统语言

## ✨ Features

- 🎨 **10-Level Skins** — AI-generated, from pink baby to Lobster King
- 📊 **Real API Usage** — Scans OpenClaw session files for accurate stats
- 🌐 **Lobster Community** — Registration, leaderboards, PK battles
- 🏆 **Achievements** — Token milestone unlocks
- 📈 **Trend Charts** — Daily token consumption visualization
- 🖱️ **Edge Docking** — Drag to screen edge, auto-dock with custom animations
- 🔔 **Auto Update** — Detects new versions and prompts
- 🧩 **Plugin System** — Install/develop plugins with sandboxed permissions
- 🌍 **i18n** — Chinese/English, auto-detects system language

## 📦 下载安装 / Download

### 🖥️ 终端一键安装 / Terminal Install (Mac, recommended)

```bash
curl -fsSL https://raw.githubusercontent.com/abczsl520/lobster-baby/main/install.sh | bash
```

自动检测芯片架构、下载最新版、安装到 /Applications、清除隔离标记（不会弹"已损坏"提示）。

Auto-detects chip architecture, downloads latest release, installs to /Applications, and clears quarantine flag (no "damaged" warning).

### 📥 手动下载 / Manual Download

前往 [Releases](https://github.com/abczsl520/lobster-baby/releases/latest) 下载：

**Mac:**
- `arm64.dmg` — Apple Silicon (M1/M2/M3/M4)
- `x64.dmg` — Intel Mac

**Windows:**
- `win-x64-setup.exe` — 安装版 / Installer (recommended)
- `win-x64-portable.exe` — 免安装版 / Portable

### ⚠️ Mac 手动安装提示"已损坏"？ / Mac "damaged" warning?

> 终端安装不会有这个问题。手动下载 DMG 安装的话需要执行：
> Terminal install avoids this. For manual DMG installs:

```bash
xattr -cr /Applications/Lobster\ Baby.app
```

### ⚠️ Windows SmartScreen 提示？

首次运行点击「更多信息」→「仍要运行」/ Click "More info" → "Run anyway"

## 🚀 使用 / Usage

1. **启动** — 双击打开，龙虾出现在屏幕角落 / Launch and lobster appears on screen
2. **拖动** — 鼠标拖动到任意位置 / Drag to any position
3. **双击** — 打开状态面板 / Double-click to open status panel
4. **右键** — 快捷菜单 / Right-click for menu (community, trends, achievements, plugins)
5. **边缘停靠** — 拖到屏幕边缘自动挂靠 / Drag to edge for auto-docking

## 🌐 龙虾社区 / Community

- **注册** — 给龙虾起名，获得专属编号（LB-000001）/ Name your lobster, get a unique ID
- **排行榜** — Token / 等级 / 连续在线 / 成就 四种排行 / 4 leaderboard types
- **PK 对战** — 生成 6 位 PK 码，和朋友比拼 / Generate PK code, battle friends (100-point system)
- **隐私保护** — 仅收集昵称和游戏数据 / Only collects nickname and game data

## 🧩 插件系统 / Plugin System

v1.8.0 新增插件系统，支持通过插件扩展龙虾宝宝功能。

Plugin system added in v1.8.0 — extend Lobster Baby with community plugins.

- **安装** — 右键龙虾 → 🧩 插件 → 导入链接或 zip / Right-click → Plugins → Import URL or zip
- **插件库** — [lbhub.ai](https://lbhub.ai) 浏览和发布插件 / Browse & publish at [lbhub.ai](https://lbhub.ai)
- **开发** — 只需 `manifest.json` + `index.js`，详见 [API 文档](https://lbhub.ai/#api-docs)

```js
// manifest.json
{
  "id": "my-plugin",
  "name": "My Plugin",
  "version": "1.0.0",
  "entry": "index.js",
  "permissions": ["notification"]
}

// index.js
module.exports = {
  activate(lobster) {
    lobster.menu.add({
      label: '🎉 Hello',
      onClick: () => lobster.ui.toast('Hello from plugin!')
    });
  },
  deactivate() {}
};
```

**安全机制 / Security:**
- 权限声明 + 用户确认 / Permission declarations + user consent
- Shell 命令黑名单 / Command blacklist
- 30s 超时 / 10KB 输出限制 / Timeouts and output limits
- 路径穿越防护 / Path traversal prevention
- 私有 IP 屏蔽 / Private IP blocking

## 🎮 等级系统 / Level System

| 等级/Level | Token | 皮肤/Skin |
|------|-----------|------|
| Lv.1 | 0 | 粉色小宝宝 Pink Baby 🍼 |
| Lv.2 | 50M | 活泼小龙虾 Lively Lobster |
| Lv.3 | 200M | 戴皇冠 Crown 👑 |
| Lv.4 | 500M | 肌肉猛男 Muscle 💪 |
| Lv.5 | 1B | 金冠金链 Gold Chain ✨ |
| Lv.6 | 2.5B | 银甲骑士 Silver Knight 🛡️ |
| Lv.7 | 5B | 紫色魔法师 Purple Mage 🧙 |
| Lv.8 | 10B | 金甲将军 Gold General ⚔️ |
| Lv.9 | 25B | 彩虹龙虾 Rainbow 🌈 |
| Lv.10 | 50B | 龙虾之王 Lobster King 👑 |

## 🛠️ 从源码构建 / Build from Source

```bash
git clone https://github.com/abczsl520/lobster-baby.git
cd lobster-baby
npm install
npm run dev          # Dev mode
npm run build        # Build
npx electron-builder --mac --arm64  # Package Mac
npx electron-builder --win --x64    # Package Windows
```

## 📄 许可证 / License

MIT License

---

<div align="center">

**觉得有趣？给个 ⭐️ Star 吧！/ Like it? Give a ⭐️ Star!**

Made with ❤️ and 🦞

</div>
