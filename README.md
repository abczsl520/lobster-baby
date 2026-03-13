# 🦞 龙虾宝宝 Lobster Baby

<div align="center">

![Lobster Baby](src/assets/lobster-nobg.png)

**一个可爱的桌面宠物，实时监控你的 OpenClaw 编程助手状态**

[![GitHub release](https://img.shields.io/github/v/release/abczsl520/lobster-baby)](https://github.com/abczsl520/lobster-baby/releases)
[![License](https://img.shields.io/github/license/abczsl520/lobster-baby)](LICENSE)
[![Platform](https://img.shields.io/badge/platform-macOS%20%7C%20Windows-lightgrey)](https://github.com/abczsl520/lobster-baby)

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

## 📦 下载安装

前往 [Releases](https://github.com/abczsl520/lobster-baby/releases/latest) 下载最新版本：

**Mac:**
- `arm64.dmg` — Apple Silicon (M1/M2/M3/M4)
- `x64.dmg` — Intel Mac

**Windows:**
- `win-x64-setup.exe` — 安装版（推荐）
- `win-x64-portable.exe` — 免安装版

### ⚠️ Mac 打开提示"已损坏"？

这是因为应用没有 Apple 开发者签名。打开终端执行：

```bash
# 如果下载的是 DMG 文件
xattr -cr ~/Downloads/LobsterBaby-*.dmg

# 如果已经安装到应用程序
xattr -cr /Applications/Lobster\ Baby.app
```

然后重新打开即可。

### ⚠️ Windows SmartScreen 提示？

首次运行可能弹出 SmartScreen 警告，点击「更多信息」→「仍要运行」即可。

## 🚀 使用

1. **启动** — 双击打开，龙虾出现在屏幕角落
2. **拖动** — 鼠标拖动到任意位置
3. **双击** — 打开状态面板
4. **右键** — 快捷菜单（置顶、社区、趋势、成就）
5. **边缘停靠** — 拖到屏幕边缘，龙虾会挂在边上

## 🌐 龙虾社区

v1.6.0 新增社交功能：

- **注册** — 给龙虾起名，获得专属编号（LB-000001）
- **排行榜** — Token / 等级 / 连续在线 / 成就 四种排行
- **PK 对战** — 生成 6 位 PK 码，和朋友比拼（100 分制）
- **隐私保护** — 仅收集昵称和游戏数据，不收集 IP/文件/对话

## 🎮 等级系统

| 等级 | 所需 Token | 皮肤 |
|------|-----------|------|
| Lv.1 | 0 | 粉色小宝宝 🍼 |
| Lv.2 | 50M | 活泼小龙虾 |
| Lv.3 | 200M | 戴皇冠 👑 |
| Lv.4 | 500M | 肌肉猛男 💪 |
| Lv.5 | 1B | 金冠金链 ✨ |
| Lv.6 | 2.5B | 银甲骑士 🛡️ |
| Lv.7 | 5B | 紫色魔法师 🧙 |
| Lv.8 | 10B | 金甲将军 ⚔️ |
| Lv.9 | 25B | 彩虹龙虾 🌈 |
| Lv.10 | 50B | 龙虾之王 👑 |

## 🛠️ 从源码构建

```bash
git clone https://github.com/abczsl520/lobster-baby.git
cd lobster-baby
npm install
npm run dev          # 开发模式
npm run build        # 构建
npx electron-builder --mac --arm64  # 打包 Mac
npx electron-builder --win --x64    # 打包 Windows
```

## 📄 许可证

MIT License

---

<div align="center">

**觉得有趣？给个 ⭐️ Star 吧！**

Made with ❤️ and 🦞

</div>
