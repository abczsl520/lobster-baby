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

- 🎨 **10 级 AI 生成龙虾皮肤** - 从粉色宝宝到龙虾之王，每级独特设计
- 🎬 **智能状态动画** - 工作时平滑摇摆，空闲时轻柔呼吸，离线时翻肚
- 💚 **实时 Token 飞字** - 工作时头顶飘出绿色 token 消耗数字
- 📊 **真实 API 用量统计** - 直接扫描 session JSONL，精确到每个 API 调用
- 🎯 **10 级成长系统** - 基于全网数据设计，面向典型 OpenClaw 用户
- 🖱️ **流畅拖动** - 磁吸边缘，自动吸附屏幕边界
- 🎯 **托盘图标** - 最小化到系统托盘，右键菜单快捷操作
- 🚀 **开机自启动** - 打包后自动开机启动
- 💾 **位置记忆** - 记住窗口位置，下次启动恢复
- 🛡️ **崩溃恢复** - 自动检测崩溃并重启
- 🔔 **自动更新** - 检测新版本并提示更新
- ⚡ **增量扫描** - 只读变化的文件，性能优化

### 🆕 v1.1.0 新特性

- ✨ **真实 API Token 统计** - 不再依赖 `openclaw sessions --json`，直接扫描 JSONL 文件的 usage 字段
- 🎨 **10 级龙虾皮肤** - AI 生成的独特等级皮肤（粉色宝宝 → 金冠龙虾 → 彩虹龙虾 → 龙虾之王）
- 💚 **Token 飞字效果** - 工作时头顶实时显示 token 消耗（+1.2M 格式）
- 🎭 **优化动画** - 工作/空闲状态动画明显区分，更柔和不刺眼
- 📈 **等级曲线重设计** - 基于全网 Claude API 用量数据，面向典型 OpenClaw 用户（~100M/天）
- ⚡ **增量扫描优化** - 只读变化的 session 文件，从 3.7 秒降至几乎瞬间
- 🎯 **状态检测优化** - 从 30 秒提升到 60 秒窗口，更准确判断工作状态

### 📸 截图

<div align="center">

| 空闲状态 | 工作状态 | 状态面板 |
|---------|---------|---------|
| 轻柔呼吸，透明度 85% | 平滑摇摆，绿色发光 | 详细统计信息 |
| ![Idle](docs/screenshots/idle.png) | ![Active](docs/screenshots/active.png) | ![Panel](docs/screenshots/panel.png) |

</div>

### 🎮 等级系统

基于真实 API token 消耗（包含 input + output + cacheRead + cacheWrite）

| 等级 | 所需 Token | 典型用户时长 | 皮肤主题 |
|------|-----------|------------|---------|
| Lv.1 | 0 | 即刻 | 粉色小宝宝 🍼 |
| Lv.2 | 50M | ~半天 | 活泼小龙虾 |
| Lv.3 | 200M | ~2天 | 戴皇冠 👑 |
| Lv.4 | 500M | ~5天 | 肌肉猛男 💪 |
| Lv.5 | 1B | ~1.5周 | 金冠金链 ✨ |
| Lv.6 | 2.5B | ~3.5周 | 银甲骑士 🛡️ |
| Lv.7 | 5B | ~1.7月 | 紫色魔法师 🧙‍♂️ |
| Lv.8 | 10B | ~3.3月 | 金甲将军 ⚔️ |
| Lv.9 | 25B | ~8月 | 彩虹龙虾 🌈 |
| Lv.10 | 50B | ~1.4年 | 龙虾之王 👑 |

> 💡 **时长说明**：基于典型 OpenClaw 用户 ~100M tokens/天计算。实际时长因使用频率而异。

### 📦 安装

#### 系统要求

- **macOS 10.12+** (Sierra 或更高版本)
- **OpenClaw** 已安装并配置
- 支持所有 OpenClaw 通信渠道：**Discord / Telegram / Slack / Signal / WhatsApp / IRC** 等

> ⚠️ **重要提示**：当前版本仅支持 **macOS 平台**。Windows/Linux 支持正在开发中。

#### 下载安装

1. 前往 [Releases](https://github.com/abczsl520/lobster-baby/releases) 页面
2. 下载对应架构的安装包：
   - **Apple Silicon (M1/M2/M3/M4)**: `LobsterBaby-1.1.0-arm64.dmg`
   - **Intel**: `LobsterBaby-1.1.0-x64.dmg`
3. 打开 DMG 文件，拖动「Lobster Baby.app」到「应用程序」文件夹
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

1. **启动应用** - 双击「Lobster Baby.app」或从启动台打开
2. **拖动位置** - 鼠标拖动龙虾到任意位置，靠近边缘会自动吸附
3. **查看状态** - 双击龙虾打开状态面板，查看详细信息
4. **托盘菜单** - 点击菜单栏图标显示/隐藏窗口
5. **右键菜单** - 右键点击龙虾快速操作（置顶、重新加载、退出）
6. **观察工作** - 工作时龙虾会摇摆，头顶飘出绿色 token 数字

### 🎨 状态说明

| 状态 | 动画 | 视觉效果 | 说明 |
|------|------|---------|------|
| 🟢 工作中 | 平滑摇摆 | 绿色发光 + token 飞字 + 绿色徽章 | OpenClaw 正在处理任务 |
| 🟡 空闲 | 轻柔呼吸 | 透明度 85% + 黄色状态点 | OpenClaw 在线但无活动 |
| 🔴 离线 | 翻肚抽搐 | 灰度 60% + 红色闪烁 | OpenClaw 未运行或离线 |

### 🛠️ 技术栈

- **Electron 28** - 跨平台桌面应用框架
- **React 18** - UI 框架
- **TypeScript** - 类型安全
- **Vite 5** - 快速构建工具
- **electron-builder** - 应用打包

### 🔧 技术亮点

#### 真实 API Token 统计

不依赖 `openclaw sessions --json` 的 `totalTokens`（只是 session 文件的 token 计数），而是：

1. 扫描 `~/.openclaw/agents/main/sessions/*.jsonl` 所有文件
2. 解析每条 assistant 消息的 `usage` 字段
3. 累加 `input + output + cacheRead + cacheWrite`
4. 增量扫描：只读修改过的文件，性能优化

**结果**：真实 API 消耗 vs session totalTokens 差距可达 **2500 倍**！

#### 增量扫描算法

```typescript
// 记录每个文件的 mtime 和 token 数
// 只重新扫描 mtime 变化的文件
// 累加到全局 total
// 30 秒缓存避免频繁 IO
```

从全量扫描 3.7 秒降至增量扫描几乎瞬间完成。

### 📝 开发路线图

#### 近期计划
- [ ] 升级动画（换皮肤时的过渡效果）
- [ ] 设置面板（自定义刷新间隔、动画速度）
- [ ] Token 趋势图（每日/每周统计）
- [ ] 快捷键支持
- [ ] 通知系统（升级提醒、里程碑）

#### 长期计划
- [ ] Windows 平台支持
- [ ] Linux 平台支持
- [ ] 主题系统（自定义颜色）
- [ ] 插件系统
- [ ] 多语言支持

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

- 龙虾图像由 Gemini API 生成，BiRefNet 去白底
- 灵感来自经典的 QQ 宠物
- 等级曲线基于全网 Claude API 用量数据设计

---

## English

### ✨ Features

- 🎨 **10-Level AI-Generated Lobster Skins** - From pink baby to lobster king
- 🎬 **Smart State Animations** - Smooth sway when working, gentle breathing when idle
- 💚 **Real-Time Token Fly Effect** - Green token numbers float up from head when working
- 📊 **True API Usage Stats** - Scan session JSONL files directly, accurate to every API call
- 🎯 **10-Level Progression System** - Designed based on real-world data for typical OpenClaw users
- 🖱️ **Smooth Dragging** - Magnetic edge snapping
- 🎯 **Tray Icon** - Minimize to system tray with context menu
- 🚀 **Auto-Launch** - Start automatically on boot (when packaged)
- 💾 **Position Memory** - Remember window position
- 🛡️ **Crash Recovery** - Auto-detect crashes and restart
- 🔔 **Auto-Update** - Check for new versions and prompt to update
- ⚡ **Incremental Scanning** - Only read changed files, performance optimized

### 🆕 v1.1.0 New Features

- ✨ **True API Token Stats** - Scan JSONL usage fields directly, not `openclaw sessions --json`
- 🎨 **10 Level Skins** - AI-generated unique skins for each level
- 💚 **Token Fly Effect** - Real-time token consumption display (+1.2M format)
- 🎭 **Optimized Animations** - Clear distinction between working/idle, softer visuals
- 📈 **Redesigned Level Curve** - Based on real Claude API usage data (~100M/day typical user)
- ⚡ **Incremental Scan** - From 3.7s to near-instant by only reading changed files
- 🎯 **Better Status Detection** - 60s window instead of 30s for more accurate working state

### 📦 Installation

#### Requirements

- **macOS 10.12+** (Sierra or later)
- **OpenClaw** installed and configured
- Supports all OpenClaw channels: **Discord / Telegram / Slack / Signal / WhatsApp / IRC** etc.

> ⚠️ **Important**: Current version only supports **macOS**. Windows/Linux support is under development.

#### Download & Install

1. Go to [Releases](https://github.com/abczsl520/lobster-baby/releases)
2. Download the installer for your architecture:
   - **Apple Silicon (M1/M2/M3/M4)**: `LobsterBaby-1.1.0-arm64.dmg`
   - **Intel**: `LobsterBaby-1.1.0-x64.dmg`
3. Open DMG file, drag "Lobster Baby.app" to Applications folder
4. Right-click → Open (bypass Gatekeeper on first launch)

### 🚀 Usage

1. **Launch** - Double-click "Lobster Baby.app" or open from Launchpad
2. **Drag** - Drag the lobster anywhere, it will snap to screen edges
3. **View Status** - Double-click to open status panel
4. **Tray Menu** - Click menu bar icon to show/hide window
5. **Context Menu** - Right-click for quick actions
6. **Watch It Work** - Lobster sways and shows green token numbers when working

### 🛠️ Tech Stack

- **Electron 28** - Cross-platform desktop framework
- **React 18** - UI framework
- **TypeScript** - Type safety
- **Vite 5** - Fast build tool
- **electron-builder** - App packaging

### 📝 Roadmap

#### Near-term
- [ ] Level-up animation (transition effect when changing skins)
- [ ] Settings panel (customize refresh interval, animation speed)
- [ ] Token trend chart (daily/weekly stats)
- [ ] Keyboard shortcuts
- [ ] Notification system (level-up alerts, milestones)

#### Long-term
- [ ] Windows support
- [ ] Linux support
- [ ] Theme system (custom colors)
- [ ] Plugin system
- [ ] Multi-language support

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
