# 🦞 龙虾宝宝 Lobster Baby

一个可爱的桌面宠物，实时监控 OpenClaw 状态。

## 功能特性

- 🎨 AI 生成的精美龙虾形象
- 🎬 多状态动画（空闲/活跃/离线）
- 📊 实时显示 OpenClaw 状态和 Token 消耗
- 🎯 10 级成长系统（基于累计 Token）
- 🖱️ 流畅拖动 + 磁吸边缘
- 🎯 托盘图标 + 右键菜单
- 🚀 开机自启动（打包后）
- 💾 窗口位置记忆
- 🛡️ 崩溃自动恢复

## 开发

```bash
# 安装依赖
npm install

# 开发模式
npm run dev

# 打包
npm run electron:build
```

## 技术栈

- Electron 28
- React 18
- TypeScript
- Vite 5

## 项目结构

```
src/
├── components/      # React 组件
│   ├── Lobster.tsx       # 龙虾主体
│   ├── StatusPanel.tsx   # 状态面板
│   ├── EmojiBubble.tsx   # Emoji 气泡
│   └── ErrorBoundary.tsx # 错误边界
├── hooks/          # React Hooks
│   ├── useOpenClawStatus.ts  # OpenClaw 状态
│   └── useLevelSystem.ts     # 等级系统
├── utils/          # 工具函数
│   └── levels.ts         # 等级计算
├── types/          # TypeScript 类型
├── constants.ts    # 常量配置
└── assets/         # 静态资源

electron/
├── main.ts         # Electron 主进程
└── preload.ts      # 预加载脚本
```

## 性能优化

- ✅ 图片优化（675KB → 42KB）
- ✅ CSS GPU 加速（will-change + backface-visibility）
- ✅ 批量处理拖动事件（减少 IPC 调用）
- ✅ 防抖保存位置（500ms）
- ✅ 并发检查锁（防止重复执行）
- ✅ IPC 监听器正确清理

## 内存占用

- 主进程：~70MB
- 渲染进程：~100MB
- GPU 进程：~40MB
- **总计：~210MB**

## 许可证

MIT
