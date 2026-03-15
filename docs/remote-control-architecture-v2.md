# 龙虾宝宝 v2.0 — 远程控制平台架构文档

> **定位转变**：从"桌面宠物 + 状态显示"到"OpenClaw 远程控制面板 + 插件生态"
> 
> 文档版本：v1.0 | 2026-03-15 | 作者：豆包

---

## 0. 批判性前置思考

### 0.1 我们在做什么？
龙虾宝宝从一个本地桌面宠物，进化成能通过插件远程控制云端 OpenClaw 的多功能载体。

### 0.2 先问三个致命问题

**Q1: 为什么用户不直接 SSH？**
A: 因为 SSH 体验差。龙虾宝宝提供的是：可视化 + 一键操作 + 插件生态 + 可爱的交互外壳。目标用户是"会用 OpenClaw 但不想天天 SSH"的人。

**Q2: 为什么不做成 Web 面板？**
A: 可以做，但龙虾宝宝已经有桌面端用户基础，Electron 可以做到 Web 做不到的事（系统托盘、快捷键、本地文件操作、跨平台通知）。Web 版可以作为后续扩展。

**Q3: "远程控制"和"远程查看"的安全差距有多大？**
A: 指数级。查看 = 只读 = 泄露最差情况是信息暴露。控制 = 读写执行 = 最差情况是服务器被完全接管。这决定了整个安全架构必须从零设计。

---

## 1. 系统架构

### 1.1 角色定义

```
┌─────────────────────────────────────────────────────────────────────┐
│                         龙虾宝宝生态                                  │
│                                                                     │
│  ┌──────────┐     ┌──────────────┐     ┌──────────────────────┐    │
│  │ 桌面客户端 │────→│ Relay Server │←────│ Agent (云端 OpenClaw) │    │
│  │ (Electron)│←────│ (中继服务器)   │────→│ (替代原 Reporter)      │    │
│  └──────────┘     └──────────────┘     └──────────────────────┘    │
│       │                  │                        │                 │
│       │           ┌──────────┐            ┌──────────────┐         │
│       └──────────→│ Plugin   │            │ OpenClaw CLI │         │
│                   │ Market   │            │ / Gateway    │         │
│                   │ (lbhub)  │            └──────────────┘         │
│                   └──────────┘                                     │
└─────────────────────────────────────────────────────────────────────┘
```

| 角色 | 职责 | 信任级别 |
|------|------|---------|
| **Client** (桌面端) | 展示 UI、安装插件、发送指令 | 不信任（可被逆向/篡改）|
| **Relay** (中继服务器) | 转发指令、鉴权、审计、限流 | 半信任（我们控制，但暴露在公网）|
| **Agent** (云端) | 执行指令、返回结果、上报状态 | 半信任（在用户服务器上，环境不可控）|
| **Plugin Market** (lbhub) | 插件分发、审核、签名 | 信任（我们完全控制）|

### 1.2 核心设计原则

1. **零信任客户端**：所有权限判断在 Relay 和 Agent，不在 Client
2. **最小权限**：每个插件声明需要的能力，Agent 端按白名单执行
3. **双重确认**：危险操作需要用户二次确认（Client 弹窗 + Agent 端验证）
4. **全链路审计**：每个指令都记录 who/what/when/result
5. **可撤销**：token 可随时撤销、插件可随时禁用、Agent 可随时断开

---

## 2. 通信协议

### 2.1 为什么不用 WebSocket？

| 方案 | 优点 | 缺点 |
|------|------|------|
| **WebSocket** | 双向实时 | Agent 端需要开端口/穿透 NAT |
| **SSE + REST** | Agent 主动出连接，无需开端口 | 延迟较高，指令需轮询 |
| **Long Polling** | 最兼容 | 延迟最高 |
| **MQTT** | IoT 标准，轻量 | 多一个中间件依赖 |

**选择：SSE (Agent→Relay) + REST (Client→Relay→Agent)**

理由：
- Agent 主动连接 Relay（出站），**不需要在用户服务器开任何端口**
- 用户服务器可能在防火墙/NAT 后面，WebSocket 需要穿透，这是巨大的用户体验障碍
- SSE 足够实时（状态推送 ≤1s 延迟）
- REST 指令通过 Relay 转发给 Agent 的下一次心跳/SSE 回调

### 2.2 通信流程

#### 状态上报（只读，已有）
```
Agent ──(SSE keepalive)──→ Relay ──(SSE push)──→ Client
        每30s心跳               实时转发
```

#### 指令下发（新增，核心）
```
Client ──(REST POST)──→ Relay ──(排队)──→ Agent ──(执行)──→ Relay ──(SSE push)──→ Client
  ① 发送指令         ② 验证+入队      ③ 拉取+执行     ④ 返回结果        ⑤ 推送结果
```

关键：Agent **拉取**指令（Pull），不是 Relay 推送给 Agent。这样 Agent 完全控制执行节奏，不会被 DDoS。

#### 指令队列设计
```json
// Relay 端指令队列（内存 + Redis 持久化）
{
  "commandId": "cmd-20260315-001",
  "userId": 14,
  "pluginId": "file-browser",
  "action": "listDir",
  "params": { "path": "/opt/apps" },
  "permission": "fs:read",
  "createdAt": "2026-03-15T11:00:00Z",
  "expiresAt": "2026-03-15T11:05:00Z",  // 5分钟过期
  "status": "pending",  // pending → executing → completed → expired
  "requireConfirm": false
}
```

### 2.3 Agent 拉取指令流程
```
Agent 每 5s GET /remote/commands/pending
  → Relay 返回待执行指令列表
  → Agent 逐个验证权限 → 执行 → POST /remote/commands/{id}/result
  → Relay 通过 SSE 推送结果给 Client
```

---

## 3. 安全模型

### 3.1 认证体系（三层 Token）

```
┌──────────────────────────────────────────────┐
│ Layer 1: Social Token (用户身份)               │
│   - 用途：登录、查看资料、排行榜               │
│   - 权限：只读社交功能                         │
│   - 有效期：30天                              │
│   - 颁发：注册/登录时                         │
├──────────────────────────────────────────────┤
│ Layer 2: Agent Token (设备绑定)               │
│   - 用途：Agent 连接 Relay                    │
│   - 权限：上报状态 + 拉取指令 + 返回结果       │
│   - 有效期：1年（可随时撤销）                  │
│   - 颁发：用户在客户端点"绑定设备"             │
│   - 限制：每用户最多 5 个 Agent Token          │
├──────────────────────────────────────────────┤
│ Layer 3: Command Token (指令签名)             │
│   - 用途：每个指令的一次性验证                 │
│   - 权限：仅限该指令声明的操作                 │
│   - 有效期：5分钟（一次性）                    │
│   - 颁发：Relay 在转发指令时签发               │
│   - Agent 验证后立即销毁                      │
└──────────────────────────────────────────────┘
```

### 3.2 为什么需要三层？

**批判性分析每一层：**

| 如果缺少… | 后果 |
|-----------|------|
| Layer 1 | 任何人可以冒充用户发指令 |
| Layer 2 | 攻击者可以伪造 Agent 连接，接收真实指令 |
| Layer 3 | 重放攻击：截获一条指令反复执行 |

**如果只用 Layer 1+2（没有 Command Token）：**
- 中间人截获指令 → 5分钟内可重放
- Agent Token 泄露 → 攻击者伪造 Agent 接收所有指令
- 加了 Layer 3 → 每条指令独立签名、一次性、5分钟过期、绑定特定操作

### 3.3 指令权限模型 (Capability-Based)

**不用角色（RBAC），用能力（Capability）。**

为什么？因为插件需要细粒度权限，RBAC 太粗。

```
权限格式：<domain>:<action>[:<scope>]

示例：
  status:read          — 读取 OpenClaw 状态
  session:list         — 列出会话
  session:send         — 向会话发消息
  cron:list            — 列出定时任务
  cron:create          — 创建定时任务
  fs:read:/opt/apps    — 读取 /opt/apps 下的文件
  fs:write:/opt/apps   — 写入 /opt/apps 下的文件（危险！）
  process:list         — 列出进程
  process:restart      — 重启进程（危险！）
  shell:exec           — 执行 shell 命令（极危险！）
```

### 3.4 权限分级

```
┌─────────────────────────────────────────────────┐
│ Level 0: SAFE — 自动放行                         │
│   status:read, session:list, cron:list           │
│   → 纯只读，无副作用                              │
├─────────────────────────────────────────────────┤
│ Level 1: MODERATE — 用户授权一次                  │
│   session:send, cron:create, cron:delete          │
│   fs:read, process:list                           │
│   → 有副作用但可撤销，首次使用时弹窗确认            │
├─────────────────────────────────────────────────┤
│ Level 2: DANGEROUS — 每次确认                     │
│   fs:write, process:restart, process:kill          │
│   → 不可撤销的修改，每次执行都弹窗                  │
├─────────────────────────────────────────────────┤
│ Level 3: FORBIDDEN — 永不允许                     │
│   shell:exec, fs:write:/, fs:delete:/              │
│   → 任意 shell 执行、根目录写入/删除               │
│   → 即使用户确认也不执行                           │
└─────────────────────────────────────────────────┘
```

### 3.5 Agent 端安全沙箱

Agent 不盲目执行 Relay 转发的指令。Agent 有自己的安全层：

```javascript
// Agent 端指令处理
async function executeCommand(cmd) {
  // 1. 验证 Command Token 签名
  if (!verifyCommandToken(cmd.token)) return reject('invalid token');
  
  // 2. 检查本地权限白名单
  if (!localPolicy.allows(cmd.permission)) return reject('denied by local policy');
  
  // 3. 检查指令是否过期
  if (Date.now() > cmd.expiresAt) return reject('expired');
  
  // 4. 检查速率限制（本地）
  if (rateLimiter.isExceeded(cmd.pluginId)) return reject('rate limited');
  
  // 5. 执行并沙箱化
  const result = await sandbox.run(cmd.action, cmd.params, {
    timeout: 30_000,
    maxOutput: 100_000,  // 100KB
    allowedPaths: cmd.scope ? [cmd.scope] : [],
  });
  
  return result;
}
```

**Agent 端本地策略文件**（用户可编辑）：
```yaml
# ~/.lobster-agent/policy.yml
version: 1
permissions:
  # 自动允许
  - status:read
  - session:list
  - cron:list
  
  # 需要确认（Agent 端 CLI 确认或自动放行）
  - session:send
  - fs:read:/opt/apps
  
  # 明确禁止（即使 Relay 发来也拒绝）
  deny:
    - shell:exec
    - fs:write:/
    - process:kill
```

这意味着即使 Relay 被入侵，Agent 也不会执行超出本地策略的指令。**安全边界在 Agent 端，不在 Relay。**

---

## 4. 插件体系 v2

### 4.1 插件类型

现有插件（v1）只运行在客户端。v2 引入双端插件：

| 类型 | 运行位置 | 示例 |
|------|---------|------|
| **Client Plugin** | 只在桌面端 | 主题、动画、本地工具 |
| **Remote Plugin** | 客户端 + Agent 端 | 文件浏览、日志查看、进程管理 |

### 4.2 Remote Plugin 结构

```
my-plugin/
├── manifest.json          # 插件声明（权限、类型、版本）
├── client/
│   ├── index.js           # 客户端入口（UI + 指令发送）
│   └── panel.html         # 可选：自定义面板 UI
└── agent/
    ├── index.js           # Agent 端入口（指令处理）
    └── handlers.js        # 具体操作实现
```

### 4.3 manifest.json（Remote Plugin 版）

```json
{
  "id": "file-browser",
  "name": "文件浏览器",
  "version": "1.0.0",
  "type": "remote",
  "permissions": [
    "fs:read:/opt/apps",
    "fs:read:/home"
  ],
  "commands": [
    {
      "id": "listDir",
      "description": "列出目录内容",
      "permission": "fs:read",
      "level": 1,
      "params": {
        "path": { "type": "string", "required": true }
      },
      "timeout": 10000,
      "maxResponseSize": 50000
    },
    {
      "id": "readFile",
      "description": "读取文件内容",
      "permission": "fs:read",
      "level": 1,
      "params": {
        "path": { "type": "string", "required": true },
        "maxSize": { "type": "number", "default": 100000 }
      }
    }
  ],
  "rateLimit": {
    "maxPerMinute": 30,
    "maxPerHour": 500
  }
}
```

### 4.4 插件安装流程（Remote Plugin）

```
用户在客户端安装插件
  → 客户端下载插件包（从 lbhub.ai）
  → 客户端安装 client/ 部分（本地）
  → 客户端通过 Relay 通知 Agent："安装插件 file-browser"
  → Agent 从 lbhub.ai 下载 agent/ 部分
  → Agent 验证签名 → 检查 manifest 权限 → 安装
  → Agent 提示用户确认权限（CLI/日志）
  → 安装完成
```

**批判性问题：Agent 端安装插件 = 远程代码执行？**

是的。这是最大的安全风险。缓解措施：

1. **插件必须由 lbhub.ai 签名**（GPG 签名，Agent 验证）
2. **Agent 端插件在 vm2/isolated-vm 沙箱中运行**
3. **插件只能通过声明的 handlers 交互，不能直接访问 Node.js API**
4. **lbhub.ai 上架审核**（至少人工 review manifest 权限）
5. **用户可以在 Agent 端禁止自动安装远程插件**（policy.yml 配置）

### 4.5 插件沙箱 API

Agent 端插件不直接使用 `fs`、`child_process` 等 Node.js 模块。它们通过受限 API 操作：

```javascript
// Agent 端插件 API
module.exports = {
  activate(agent) {
    // 注册指令处理器
    agent.registerHandler('listDir', async (params) => {
      // agent.fs 是受限的文件系统 API
      // 只能访问 manifest 声明的路径
      const files = await agent.fs.readdir(params.path);
      return files.map(f => ({
        name: f.name,
        size: f.size,
        isDir: f.isDirectory,
        modified: f.mtime,
      }));
    });

    agent.registerHandler('readFile', async (params) => {
      const content = await agent.fs.readFile(params.path, {
        maxSize: params.maxSize || 100_000,
      });
      return { content, encoding: 'utf-8' };
    });
  },

  deactivate(agent) {
    agent.unregisterHandler('listDir');
    agent.unregisterHandler('readFile');
  },
};
```

---

## 5. Agent 设计（替代 Reporter）

### 5.1 从 Reporter 到 Agent

| 对比 | Reporter v1 | Agent v2 |
|------|------------|----------|
| 功能 | 只上报状态 | 上报状态 + 执行指令 + 安装插件 |
| 通信 | 单向推送 | 双向（SSE 上行 + Pull 指令下行）|
| 安全 | JWT 认证 | JWT + Command Token + 本地策略 |
| 部署 | 独立脚本 | npm 包（`npm install -g lobster-agent`）|
| 配置 | 环境变量 | policy.yml + CLI 交互 |

### 5.2 Agent 安装方式

```bash
# 方式1: npm 全局安装（推荐）
npm install -g lobster-agent
lobster-agent init          # 交互式配置（输入 Agent Token）
lobster-agent start         # 启动（自动 pm2 管理）

# 方式2: 一键脚本
curl -fsSL https://lbhub.ai/install-agent.sh | bash
# ⚠️ 脚本只做 npm install -g + 引导 init，不直接执行任意代码
```

### 5.3 Agent 架构

```
lobster-agent/
├── src/
│   ├── index.js            # 入口：连接 Relay + 心跳
│   ├── auth.js             # Token 管理 + 签名验证
│   ├── command-runner.js   # 指令拉取 + 执行 + 结果上报
│   ├── plugin-manager.js   # 远程插件安装/卸载/沙箱
│   ├── policy.js           # 本地安全策略
│   ├── sandbox.js          # 插件执行沙箱
│   └── status.js           # OpenClaw 状态采集（原 reporter 逻辑）
├── policy.yml              # 用户可编辑的安全策略
└── package.json
```

---

## 6. Relay Server 扩展

### 6.1 新增端点

```
# 指令相关
POST   /api/v1/remote/commands          — Client 发送指令
GET    /api/v1/remote/commands/pending   — Agent 拉取待执行指令
POST   /api/v1/remote/commands/:id/result — Agent 上报执行结果
GET    /api/v1/remote/commands/:id       — Client 查询指令状态

# Agent 管理
GET    /api/v1/remote/agents            — 列出已绑定的 Agent
DELETE /api/v1/remote/agents/:id        — 解绑 Agent
GET    /api/v1/remote/agents/:id/plugins — 查看 Agent 已装插件

# 插件同步
POST   /api/v1/remote/plugins/install   — 通知 Agent 安装插件
POST   /api/v1/remote/plugins/uninstall — 通知 Agent 卸载插件
```

### 6.2 Relay 端安全检查

每条指令经过 Relay 时的检查链：

```
Client POST /commands
  → ① 验证 Social Token（用户身份）
  → ② 检查用户是否有活跃 Agent
  → ③ 检查插件是否已安装（Client + Agent 双端）
  → ④ 检查指令权限级别
  →    Level 0: 直接放行
  →    Level 1: 检查用户是否已授权该插件的该权限
  →    Level 2: 返回 "requireConfirm: true"，等 Client 二次确认
  →    Level 3: 直接拒绝
  → ⑤ 签发 Command Token（绑定 commandId + permission + 5min TTL）
  → ⑥ 入队（Redis 队列，按 Agent 分组）
  → ⑦ 记录审计日志
```

---

## 7. 数据库扩展

### 7.1 新增表

```sql
-- Agent 设备表
CREATE TABLE lobster_agents (
  id SERIAL PRIMARY KEY,
  user_id INTEGER REFERENCES lobster_users(id) ON DELETE CASCADE,
  agent_token_hash VARCHAR(64) NOT NULL,  -- SHA256(token)
  agent_name VARCHAR(50),                 -- 用户给设备起的名字
  hostname VARCHAR(100),                  -- 设备 hostname
  os VARCHAR(50),                         -- linux/darwin/win32
  node_version VARCHAR(20),
  agent_version VARCHAR(20),
  last_heartbeat_at TIMESTAMP,
  status VARCHAR(20) DEFAULT 'offline',   -- online/offline/idle
  policy_hash VARCHAR(64),                -- SHA256(policy.yml) 用于检测策略变更
  created_at TIMESTAMP DEFAULT NOW(),
  revoked_at TIMESTAMP                    -- NULL = 有效
);
CREATE INDEX idx_agents_user ON lobster_agents(user_id);
CREATE INDEX idx_agents_token ON lobster_agents(agent_token_hash);

-- 指令队列表
CREATE TABLE lobster_commands (
  id VARCHAR(36) PRIMARY KEY,             -- UUID
  user_id INTEGER REFERENCES lobster_users(id),
  agent_id INTEGER REFERENCES lobster_agents(id),
  plugin_id VARCHAR(50) NOT NULL,
  action VARCHAR(50) NOT NULL,
  params JSONB,
  permission VARCHAR(100) NOT NULL,
  level INTEGER NOT NULL,                 -- 0-3
  status VARCHAR(20) DEFAULT 'pending',   -- pending/executing/completed/failed/expired/cancelled
  command_token_hash VARCHAR(64),
  result JSONB,
  error TEXT,
  created_at TIMESTAMP DEFAULT NOW(),
  executed_at TIMESTAMP,
  completed_at TIMESTAMP,
  expires_at TIMESTAMP NOT NULL
);
CREATE INDEX idx_commands_agent_status ON lobster_commands(agent_id, status);
CREATE INDEX idx_commands_user ON lobster_commands(user_id);

-- 审计日志表
CREATE TABLE lobster_audit_log (
  id BIGSERIAL PRIMARY KEY,
  user_id INTEGER,
  agent_id INTEGER,
  plugin_id VARCHAR(50),
  action VARCHAR(50),
  permission VARCHAR(100),
  level INTEGER,
  status VARCHAR(20),                     -- allowed/denied/expired/error
  ip_hash VARCHAR(64),
  details JSONB,
  created_at TIMESTAMP DEFAULT NOW()
);
CREATE INDEX idx_audit_user ON lobster_audit_log(user_id);
CREATE INDEX idx_audit_created ON lobster_audit_log(created_at);

-- 已安装远程插件（Agent 端）
CREATE TABLE lobster_agent_plugins (
  agent_id INTEGER REFERENCES lobster_agents(id) ON DELETE CASCADE,
  plugin_id VARCHAR(50) NOT NULL,
  version VARCHAR(20) NOT NULL,
  permissions JSONB,                      -- 实际授予的权限
  installed_at TIMESTAMP DEFAULT NOW(),
  PRIMARY KEY (agent_id, plugin_id)
);
```

---

## 8. 客户端 UI 设计

### 8.1 远程模式入口

```
设置面板
  └── 远程控制
        ├── [我的设备] — 列表展示已绑定的 Agent
        │     └── 设备卡片：名称 / 状态 / 最后心跳 / 已装插件数
        ├── [+ 绑定新设备] — 生成 Agent Token + 安装引导
        │     ├── Step 1: 自动生成 token
        │     ├── Step 2: 显示安装命令（可一键复制）
        │     └── Step 3: 等待 Agent 首次心跳 → "连接成功！"
        └── [指令历史] — 审计日志
```

### 8.2 插件面板扩展

```
插件面板
  ├── 本地插件（现有）
  └── 远程插件（新增）
        ├── 已安装：显示 Client + Agent 双端状态
        ├── 权限管理：查看/修改已授予权限
        └── 安装：从 lbhub.ai 安装，自动同步到 Agent
```

### 8.3 指令交互 UX

```
用户点击"文件浏览器"插件
  → 显示目录树（数据来自 Agent）
  → 点击文件 → 显示内容（Level 1，首次确认）
  → 点击"下载" → 弹窗确认（Level 2）
  → 所有操作有加载状态 + 超时提示
  → 错误显示友好消息（"设备离线" / "权限不足" / "操作超时"）
```

---

## 9. 攻击面分析与缓解

### 9.1 威胁模型

| # | 威胁 | 攻击者 | 影响 | 缓解 |
|---|------|--------|------|------|
| T1 | Client 被逆向，提取 Social Token | 本地攻击者 | 可以查看用户数据、发送指令 | Token 30天过期 + 设备指纹绑定 |
| T2 | Agent Token 泄露 | 服务器入侵 | 伪造 Agent 接收指令 | Token 可撤销 + Agent 端 IP 绑定 |
| T3 | Relay 被入侵 | 远程攻击者 | 可以向所有 Agent 发任意指令 | Agent 端本地策略拒绝超权限操作 |
| T4 | 中间人截获指令 | 网络攻击者 | 重放指令 | HTTPS + Command Token 一次性 |
| T5 | 恶意插件 | 供应链攻击 | Agent 端代码执行 | lbhub 签名 + 沙箱 + 权限声明 |
| T6 | DDoS Agent | 远程攻击者 | Agent 资源耗尽 | Agent 端限流 + 指令队列长度限制 |
| T7 | Relay 数据库泄露 | 远程攻击者 | 用户数据 + Token hash | Token hash (SHA256) 不可逆 + 无明文存储 |

### 9.2 最坏情况分析

**如果 Relay 服务器被完全入侵：**
- 攻击者可以看到所有指令和结果 → **数据泄露**
- 攻击者可以伪造指令 → **但 Agent 端策略会拒绝超权限操作**
- 攻击者不能执行 `shell:exec` → **Level 3 永远被 Agent 拒绝**
- 攻击者不能绕过 Agent 端沙箱 → **插件 API 是受限的**

**结论：即使 Relay 被入侵，Agent 端的安全边界仍然成立。** 这是整个架构最核心的安全设计。

**如果 Agent 服务器被完全入侵：**
- 攻击者已经有了那台机器的完全控制权 → 龙虾宝宝的安全模型已经不重要了
- 但至少不会影响其他用户的 Agent → **隔离**

---

## 10. 实施路线图

### Phase 1: 基础设施（1-2 周）
- [ ] Agent 核心：npm 包、连接 Relay、心跳、状态上报
- [ ] Relay 扩展：指令队列、Command Token、Agent 管理端点
- [ ] 数据库：新增 4 张表
- [ ] 客户端：设备绑定 UI + 安装引导

### Phase 2: 指令系统（1-2 周）
- [ ] Agent 指令执行框架 + 沙箱
- [ ] Agent 本地策略 (policy.yml)
- [ ] Relay 审计日志
- [ ] 客户端指令交互 UI（loading/error/confirm）

### Phase 3: 远程插件（2-3 周）
- [ ] 插件格式 v2（client/ + agent/）
- [ ] Agent 端插件安装/卸载
- [ ] 插件沙箱 API
- [ ] lbhub.ai 插件签名 + 远程插件类型支持

### Phase 4: 内置插件（1-2 周）
- [ ] 文件浏览器插件
- [ ] 日志查看插件
- [ ] 进程管理插件（PM2 状态/重启）
- [ ] 定时任务管理插件

### Phase 5: 安全加固（持续）
- [ ] 渗透测试
- [ ] 插件审核流程
- [ ] Agent IP 白名单
- [ ] 异常行为检测（指令频率异常、权限升级尝试）

---

## 11. 开放问题（需要决策）

### Q1: Agent 端是否支持交互式操作？
目前设计是 request-response 模式（发指令→等结果）。是否需要支持流式输出（如 tail -f 日志）？
- 支持：用户体验更好
- 不支持：简化设计，降低安全风险

### Q2: 是否允许用户自建 Relay？
如果用户不信任我们的 Relay 服务器，能否自己部署？
- 允许：更灵活，但增加维护复杂度
- 不允许：简化，但中心化依赖

### Q3: 跨 Agent 操作？
用户有多台服务器，是否支持一个指令同时发给多个 Agent？
- 支持：运维场景有用
- 不支持：简化，避免广播攻击

### Q4: 移动端？
龙虾宝宝是否需要移动端（iOS/Android）来远程控制？
- 需要：随时随地管理
- 不需要：桌面端足够，移动端安全问题更多

### Q5: 与 OpenClaw 原生能力的关系？
OpenClaw 本身有 sessions、cron 等工具。龙虾宝宝是封装这些能力还是独立实现？
- 封装：复用 OpenClaw CLI，Agent 调 `openclaw sessions list` 等
- 独立：直接读 sessions.json 等文件，不依赖 OpenClaw CLI
- **建议：封装** — 利用 OpenClaw 已有的权限和安全模型

---

*文档完成于 2026-03-15 19:40*
*待元宝决策开放问题后，进入 Phase 1 实施*
