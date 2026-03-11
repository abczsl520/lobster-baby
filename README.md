# 🦞 龙虾宝宝 Lobster Baby

<div align="center">

![Lobster Baby](src/assets/lobster-nobg.png)

**一个可爱的桌面宠物，实时监控你的 OpenClaw 编程助手状态**

[![GitHub release](https://img.shields.io/github/v/release/abczsl520/lobster-baby)](https://github.com/abczsl520/lobster-baby/releases)
[![License](https://img.shields.io/github/license/abczsl520/lobster-baby)](LICENSE)
[![Platform](https://img.shields.io/badge/platform-macOS-lightgrey)](https://github.com/abczsl520/lobster-baby)

[English](#english) | [中文](#中文)

</div>

---

## 中文

### ✨ 特性

- 🎨 **AI 生成的精美龙虾形象** - 独特可爱的设计
- 🎬 **多状态动画** - 空闲浮动 / 活跃摇摆 / 离线翻肚
- 📊 **实时状态监控** - 显示 OpenClaw 运行状态和 Token 消耗
- 🎯 **10 级成长系统** - 根据累计 Token 升级，最高 50 亿 Token
- 🖱️ **流畅拖动** - 磁吸边缘，自动吸附屏幕边界
- 🎯 **托盘图标** - 最小化到系统托盘，右键菜单快捷操作
- 🚀 **开机自启动** - 打包后自动开机启动
- 💾 **位置记忆** - 记住窗口位置，下次启动恢复
- 🛡️ **崩溃恢复** - 自动检测崩溃并重启
- 🔔 **自动更新** - 检测新版本并提示更新

### 📸 截图

<div align="center">

| 空闲状态 | 活跃状态 | 状态面板 |
|---------|---------|---------|
| ![Idle](docs/screenshots/idle.png) | ![Active](docs/screenshots/active.png) | ![Panel](docs/screenshots/panel.png) |

</div>

### 🎮 等级系统

| 等级 | 所需 Token | 特效 |
|------|-----------|------|
| Lv.1 | 0 | 基础红色 |
| Lv.2 | 10M | - |
| Lv.3 | 50M | 👑 皇冠 |
| Lv.4 | 150M | - |
| Lv.5 | 350M | ✨ 光晕 |
| Lv.6 | 700M | - |
| Lv.7 | 1.3B | 💫 粒子特效 |
| Lv.8 | 2.2B | - |
| Lv.9 | 3.5B | 🌈 彩虹渐变 |
| Lv.10 | 5B | 满级！ |

### 📦 安装

#### 系统要求

- **macOS 10.12+** (Sierra 或更高版本)
- **OpenClaw** 已安装并配置
- 支持所有 OpenClaw 通信渠道：**Discord / Telegram / Slack / Signal / WhatsApp / IRC** 等

> ⚠️ **重要提示**：当前版本仅支持 **macOS 平台**。Windows/Linux 支持正在开发中。

#### 下载安装

1. 前往 [Releases](https://github.com/abczsl520/lobster-baby/releases) 页面
2. 下载对应架构的安装包：
   - **Apple Silicon (M1/M2/M3)**: `龙虾宝宝-1.0.0-arm64.dmg`
   - **Intel**: `龙虾宝宝-1.0.0-x64.dmg`
3. 打开 DMG 文件，拖动「龙虾宝宝.app」到「应用程序」文件夹
4. 首次打开需要右键点击 → 选择「打开」（绕过 Gatekeeper 安全检查）

#### 从源码构建

```bash
# 克隆仓库
git clone https://github.com/abczsl520/lobster-baby.git
cd lobster-baby

# 安装依赖
npm install

# 开发模式
npm run dev

# 打包
npm run electron:build
```

### 🚀 使用

1. **启动应用** - 双击「龙虾宝宝.app」或从启动台打开
2. **拖动位置** - 鼠标拖动龙虾到任意位置，靠近边缘会自动吸附
3. **查看状态** - 双击龙虾打开状态面板，查看详细信息
4. **托盘菜单** - 点击菜单栏图标显示/隐藏窗口
5. **右键菜单** - 右键点击龙虾快速操作（置顶、重新加载、退出）

### 🎨 状态说明

| 状态 | 动画 | 说明 |
|------|------|------|
| 🟢 活跃 | 兴奋摇摆 | OpenClaw 正在处理任务 |
| 🟡 空闲 | 轻柔浮动 | OpenClaw 在线但无活动 |
| 🔴 离线 | 翻肚抽搐 | OpenClaw 未运行或离线 |

### 🛠️ 技术栈

- **Electron 28** - 跨平台桌面应用框架
- **React 18** - UI 框架
- **TypeScript** - 类型安全
- **Vite 5** - 快速构建工具
- **electron-builder** - 应用打包

### 📝 开发路线图

- [ ] Windows 平台支持
- [ ] Linux 平台支持
- [x] ~~所有通信渠道支持（Discord/Telegram/Slack/Signal 等）~~
- [ ] 更多动画和交互
- [ ] 自定义主题
- [ ] 多语言支持
- [ ] 插件系统

### 🤝 贡献

欢迎贡献代码、报告问题或提出建议！

1. Fork 本仓库
2. 创建特性分支 (`git checkout -b feature/AmazingFeature`)
3. 提交更改 (`git commit -m 'Add some AmazingFeature'`)
4. 推送到分支 (`git push origin feature/AmazingFeature`)
5. 开启 Pull Request

### 📄 许可证

本项目采用 MIT 许可证 - 详见 [LICENSE](LICENSE) 文件

### 🙏 致谢

- 龙虾图像由 AI 生成
- 灵感来自经典的 QQ 宠物

---

## English

### ✨ Features

- 🎨 **AI-Generated Lobster Design** - Unique and adorable
- 🎬 **Multi-State Animations** - Idle floating / Active shaking / Offline flipped
- 📊 **Real-Time Status Monitoring** - Display OpenClaw status and token consumption
- 🎯 **10-Level Progression System** - Level up based on cumulative tokens, max 5B tokens
- 🖱️ **Smooth Dragging** - Magnetic edge snapping
- 🎯 **Tray Icon** - Minimize to system tray with context menu
- 🚀 **Auto-Launch** - Start automatically on boot (when packaged)
- 💾 **Position Memory** - Remember window position
- 🛡️ **Crash Recovery** - Auto-detect crashes and restart
- 🔔 **Auto-Update** - Check for new versions and prompt to update

### 📦 Installation

#### Requirements

- **macOS 10.12+** (Sierra or later)
- **OpenClaw** installed and configured
- Supports all OpenClaw channels: **Discord / Telegram / Slack / Signal / WhatsApp / IRC** etc.

> ⚠️ **Important**: Current version only supports **macOS**. Windows/Linux support is under development.

#### Download & Install

1. Go to [Releases](https://github.com/abczsl520/lobster-baby/releases)
2. Download the installer for your architecture:
   - **Apple Silicon (M1/M2/M3)**: `龙虾宝宝-1.0.0-arm64.dmg`
   - **Intel**: `龙虾宝宝-1.0.0-x64.dmg`
3. Open DMG file, drag "龙虾宝宝.app" to Applications folder
4. Right-click → Open (bypass Gatekeeper on first launch)

### 🚀 Usage

1. **Launch** - Double-click "龙虾宝宝.app" or open from Launchpad
2. **Drag** - Drag the lobster anywhere, it will snap to screen edges
3. **View Status** - Double-click to open status panel
4. **Tray Menu** - Click menu bar icon to show/hide window
5. **Context Menu** - Right-click for quick actions

### 🛠️ Tech Stack

- **Electron 28** - Cross-platform desktop framework
- **React 18** - UI framework
- **TypeScript** - Type safety
- **Vite 5** - Fast build tool
- **electron-builder** - App packaging

### 📝 Roadmap

- [ ] Windows support
- [ ] Linux support
- [x] ~~All communication channels (Discord/Telegram/Slack/Signal etc.)~~
- [ ] More animations and interactions
- [ ] Custom themes
- [ ] Multi-language support
- [ ] Plugin system

### 🤝 Contributing

Contributions are welcome! Feel free to submit issues or pull requests.

### 📄 License

MIT License - see [LICENSE](LICENSE) file

---

<div align="center">

**如果觉得有用，请给个 ⭐️ Star！**

**If you find it useful, please give it a ⭐️ Star!**

Made with ❤️ by Lobster Baby Team

</div>
