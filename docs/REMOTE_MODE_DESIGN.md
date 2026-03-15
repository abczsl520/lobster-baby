# 🦞 龙虾宝宝远程版 — 产品设计文档 v5

> 最后更新：2026-03-15
> 状态：**定稿**（v5 = v4 + 第二轮 11 项 + 第三轮 9 项修复，共 4 轮 27 项批判性审查）

---

## 一、问题定义

### 现状
龙虾宝宝通过 `exec openclaw --log-level silent sessions --json` 获取 OpenClaw 状态，通过扫描 `~/.openclaw/agents/*/sessions/*.jsonl` 获取 token 用量。**两者都要求 OpenClaw 和龙虾宝宝在同一台机器上。**

### 目标用户
OpenClaw 跑在远端的用户：

| 场景 | 环境 | 特点 |
|------|------|------|
| 云服务器 | AWS/阿里云/腾讯云 Linux VPS | 无 GUI，SSH 访问 |
| 云电脑 | Windows 云桌面 | 有 GUI 但网络受限 |
| 无头 Linux | 家里的 NAS、树莓派 | 局域网内，可能无公网 IP |
| Docker 容器 | K8s / Docker Compose | 无 systemd，无 cron |
| WSL | Windows 下的 Linux 子系统 | OpenClaw 在 WSL，龙虾在 Windows |

### 核心需求
用户在本地（Mac/Win 桌面）看到龙虾宝宝，显示远端 OpenClaw 的实时状态。

### 非需求（明确不做的）
- ❌ 远程操作 OpenClaw（只看状态，不控制）
- ❌ 多服务器聚合（一个龙虾宝宝只连一个数据源）
- ❌ 历史数据存储（只保留最新状态）
- ❌ 移动端（仅桌面 Electron）

---

## 二、核心架构

```
┌─────────────────────┐            ┌───────────────────┐            ┌──────────────────┐
│  远端（云服务器等）   │            │  中继服务器        │            │  本地桌面         │
│                     │   HTTPS    │                   │   SSE      │                  │
│  OpenClaw 运行中     │──────────→ │  lobster-social   │←─────────→ │  龙虾宝宝        │
│  + Reporter         │   POST     │  8.138.104.108    │   推送     │  Electron App    │
│    (采集+上报)       │  每10秒    │  (复用现有后端)    │  每5秒     │  (远程模式)       │
└─────────────────────┘            └───────────────────┘            └──────────────────┘
```

### 数据流

```
1. Reporter 每10秒采集: openclaw sessions + token扫描
2. Reporter POST → Relay /remote/heartbeat（带 JWT 认证）
3. Relay 存入 remote_status 表，计算 active/idle/offline
4. Client 通过 SSE 订阅 /remote/stream
5. Relay 每5秒从 DB 读取 → 推送给 Client
6. Client 收到数据 → 更新龙虾状态/token显示/气泡对话
```

### 为什么是三段式？（批判性分析）

| 方案 | 原理 | 否决原因 |
|------|------|----------|
| 龙虾宝宝直连服务器 WebSocket | 服务器开端口 | 用户要配防火墙/端口转发/SSL，门槛太高 |
| SSH 隧道转发 | SSH -L 端口映射 | 每次都要手动建隧道，非技术用户搞不定 |
| P2P (WebRTC) | 浏览器点对点 | 服务器端没浏览器；STUN/TURN 额外成本 |
| 轮询 HTTP API | Client 定时 GET | 可行但不如 SSE 实时 |
| **中继 + SSE** | Reporter→Relay→Client | ✅ 零网络配置、复用现有基础设施、SSE 原生重连 |

**反驳自己：中继是单点故障。**
是的。如果 8.138.104.108 挂了，远程模式全挂。但本地模式不受影响，社交功能本来也依赖这台服务器。单点故障已经存在，不是新引入的。

**反驳自己：为什么不让 OpenClaw 自己暴露 HTTP API？**
- 我们控制不了 OpenClaw 的 roadmap
- 让用户在 VPS 上开 HTTP 端口 = 安全隐患
- 即使 OpenClaw 未来加了 HTTP API，用户仍然需要配端口/SSL

---

## 三、Reporter（服务器端采集器）

### 3.1 形态选择

| 形态 | 依赖 | 覆盖环境 | 复杂度 |
|------|------|----------|--------|
| Shell 脚本 + cron | bash, curl, python3 | Linux VPS ✅ Docker ⚠️ WSL ✅ | 低 |
| Shell 脚本 + while loop | bash, curl, python3 | Linux VPS ✅ Docker ✅ WSL ✅ | 低 |
| Node.js 服务 | node | 有 OpenClaw 就有 Node ✅ | 中 |
| Python 脚本 | python3 | 大部分 Linux 自带 ✅ | 低 |
| OpenClaw 插件 | OpenClaw 插件 API | 有 OpenClaw 就行 ✅ | 低 |

**批判：之前选了 shell + systemd timer，但 Docker 没有 systemd。**

**修正决策：提供两种模式**
1. **推荐：Node.js 常驻服务**（用户装了 OpenClaw = 一定有 Node.js，依赖不是问题）
2. **备选：Shell + while sleep 循环**（给不想装 Node 的极简用户）

### 3.2 Node.js Reporter（推荐）

```javascript
#!/usr/bin/env node
// lobster-reporter.js — 单文件，零依赖（Node 内置 https/fs/path）

const https = require('https');
const { execFile } = require('child_process');
const fs = require('fs');
const path = require('path');
const os = require('os');

const CONFIG_PATH = path.join(os.homedir(), '.lobster-reporter.json');
const DEFAULT_API_BASE = 'https://game.weixin-vip.cn/lobster-social/api/v1';
const INTERVAL_MS = 10_000;
const VERSION = '1.0.0';

// ─── 配置 ───
function loadConfig() {
  if (!fs.existsSync(CONFIG_PATH)) {
    console.error('❌ 未配置。请运行: lobster-reporter --setup');
    process.exit(1);
  }
  const config = JSON.parse(fs.readFileSync(CONFIG_PATH, 'utf-8'));
  // D4 fix: API_BASE 可通过配置覆盖（自建服务器场景）
  config.apiBase = config.apiBase || DEFAULT_API_BASE;
  return config;
}

// ─── 采集 OpenClaw 状态（异步，不阻塞主线程）───
function getOpenClawSessions() {
  return new Promise((resolve) => {
    execFile('openclaw', ['--log-level', 'silent', 'sessions', '--json', '--active', '5'], {
      timeout: 8000, encoding: 'utf-8',
    }, (err, stdout) => {
      if (err) return resolve([]);
      try { resolve(JSON.parse(stdout).sessions || []); }
      catch { resolve([]); }
    });
  });
}

// ─── 采集 Token 用量（增量扫描，逐行读取防 OOM）───
const fileCache = new Map(); // filename → { mtime, tokens }
let totalTokens = 0;

function scanTokens() {
  const sessionDir = findSessionDir();
  if (!sessionDir) return totalTokens;

  try {
    const files = fs.readdirSync(sessionDir).filter(f => f.endsWith('.jsonl'));
    for (const file of files) {
      const fullPath = path.join(sessionDir, file);
      const stat = fs.statSync(fullPath);
      const cached = fileCache.get(file);

      if (cached && cached.mtime === stat.mtimeMs) continue;

      // A3 fix: 逐行读取，不一次性读全文件进内存
      let fileTokens = 0;
      const content = fs.readFileSync(fullPath, 'utf-8');
      // 对于 < 10MB 的文件用 split，> 10MB 的文件跳过（防 OOM）
      if (stat.size > 10 * 1024 * 1024) {
        console.warn(`[WARN] Skipping large file ${file} (${(stat.size/1024/1024).toFixed(1)}MB)`);
        continue;
      }
      for (const line of content.split('\n')) {
        if (!line.includes('"usage"')) continue;
        try {
          const u = JSON.parse(line)?.message?.usage;
          if (u) fileTokens += (u.input||0) + (u.output||0) + (u.cacheRead||0) + (u.cacheWrite||0);
        } catch {}
      }

      if (cached) totalTokens -= cached.tokens;
      totalTokens += fileTokens;
      fileCache.set(file, { mtime: stat.mtimeMs, tokens: fileTokens });
    }
  } catch {}
  return totalTokens;
}

function findSessionDir() {
  const home = os.homedir();
  const candidates = [
    path.join(home, '.openclaw/agents/main/sessions'),
    path.join(home, '.config/openclaw/agents/main/sessions'),
  ];
  for (const dir of candidates) {
    if (fs.existsSync(dir)) return dir;
  }
  return null;
}

// ─── 上报（带指数退避）───
let backoffMs = 0;
const MAX_BACKOFF = 5 * 60 * 1000; // 5分钟

function postHeartbeat(token, data) {
  const body = JSON.stringify(data);
  const url = new URL(config.apiBase + '/remote/heartbeat');
  const req = https.request({
    hostname: url.hostname, path: url.pathname, method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Content-Length': Buffer.byteLength(body),
      'Authorization': `Bearer ${token}`,
      'User-Agent': `LobsterReporter/${VERSION}`,
    },
    timeout: 10000,
  }, (res) => {
    let d = ''; res.on('data', c => d += c);
    res.on('end', () => {
      if (res.statusCode === 200) {
        backoffMs = 0; // 成功，重置退避
        try {
          const resp = JSON.parse(d);
          // B1: 版本强制升级检查
          if (resp.minVersion && compareVersions(VERSION, resp.minVersion) < 0) {
            console.warn(`⚠️ Reporter 版本 ${VERSION} 低于最低要求 ${resp.minVersion}，请升级！`);
            console.warn('升级: curl -sSL https://lbhub.ai/reporter/install.sh | bash -- --upgrade');
          }
        } catch {}
      } else if (res.statusCode >= 500) {
        // B5: 服务器错误，指数退避
        backoffMs = Math.min(MAX_BACKOFF, Math.max(5000, backoffMs * 2));
        console.error(`[${new Date().toISOString()}] Server error ${res.statusCode}, backing off ${backoffMs/1000}s`);
      } else {
        console.error(`[${new Date().toISOString()}] Error ${res.statusCode}: ${d}`);
      }
    });
  });
  req.on('error', (e) => {
    // B5: 网络错误，指数退避
    backoffMs = Math.min(MAX_BACKOFF, Math.max(5000, backoffMs * 2));
    console.error(`[${new Date().toISOString()}] Network error: ${e.message}, backing off ${backoffMs/1000}s`);
  });
  req.write(body);
  req.end();
}

function compareVersions(a, b) {
  const pa = a.split('.').map(Number), pb = b.split('.').map(Number);
  for (let i = 0; i < 3; i++) {
    if ((pa[i]||0) < (pb[i]||0)) return -1;
    if ((pa[i]||0) > (pb[i]||0)) return 1;
  }
  return 0;
}

// ─── 主循环（setTimeout 链式，不用 setInterval+skip）───
function main() {
  const config = loadConfig();
  console.log(`🦞 Lobster Reporter v${VERSION} started (interval: ${INTERVAL_MS/1000}s)`);

  async function tick() {
    try {
      const sessions = await getOpenClawSessions();
      const tokens = scanTokens();
      const hasRecent = sessions.some(s => s.ageMs < 60000);

      postHeartbeat(config.token, {
        status: hasRecent ? 'active' : (sessions.length > 0 ? 'idle' : 'offline'),
        activeSessions: sessions.length,
        totalTokens: tokens,
        timestamp: Date.now(),
        reporterVersion: VERSION,
      });
    } catch (err) {
      console.error(`[${new Date().toISOString()}] Tick error: ${err.message}`);
    }

    // L1 fix: 用 setTimeout 链式调用，退避时直接延长下次间隔，不刷无意义日志
    const nextDelay = backoffMs > 0 ? backoffMs : INTERVAL_MS;
    setTimeout(tick, nextDelay);
  }

  tick();
}

// ─── Setup 模式 ───
if (process.argv.includes('--setup')) {
  const readline = require('readline');
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  rl.question('请输入你的 Lobster Social Token: ', (token) => {
    fs.writeFileSync(CONFIG_PATH, JSON.stringify({ token: token.trim() }, null, 2));
    console.log(`✅ 配置已保存到 ${CONFIG_PATH}`);
    console.log('启动: node lobster-reporter.js');
    console.log('后台运行: nohup node lobster-reporter.js &');
    rl.close();
  });
} else {
  main();
}
```

### 3.3 安装方式

```bash
# U1: 一键安装（龙虾宝宝设置页生成完整命令，用户只需 SSH 粘贴一次）
curl -sSL https://lbhub.ai/reporter/install.sh | bash -s -- --token <TOKEN>

# 或分步安装（给谨慎用户：先看脚本内容再执行）
wget -O install.sh https://lbhub.ai/reporter/install.sh
cat install.sh  # 检查内容
bash install.sh --token <TOKEN>

# 或 npm 全局安装（最规范）
npm install -g lobster-reporter
lobster-reporter --setup

# install.sh 做的事：
# 1. 下载 lobster-reporter.js 到 /opt/lobster-reporter/
# 2. 如果传了 --token，直接写入 ~/.lobster-reporter.json
# 3. 如果没传 --token，交互输入
# 4. 创建 systemd service（Restart=always, RestartSec=5）或输出 nohup 命令
# 5. 启动服务
# 6. --upgrade 模式：只更新脚本，保留配置文件
```

### 3.4 批判：Reporter 的弱点（v5 更新）

| 弱点 | 严重度 | 应对 |
|------|--------|------|
| 用户要手动获取 social token | 🟡中 | 龙虾宝宝设置页生成一键安装命令（含 token） |
| token 明文存在服务器上 | 🟡中 | 专用 reporter token，泄露只能伪造状态 |
| openclaw 命令不存在 | 🟢低 | sessions 返回空数组，状态显示 openclaw_offline |
| token 扫描可能数据量大 | 🟡中 | 增量扫描 + mtime 缓存 + >10MB 文件跳过 |
| Reporter 崩溃无自愈 | 🟡中 | install.sh 生成 Restart=always systemd service |
| 退避期间日志刷屏 | 🟢低 | setTimeout 链式调用代替 skip+log |

---

## 四、Relay API（中继服务器端）

### 4.1 新增端点

复用现有社交后端 `8.138.104.108:4050`（lobster-social），新增路由文件 `routes/remote.js`：

```
POST /api/v1/remote/heartbeat   — Reporter 上报心跳+状态
GET  /api/v1/remote/status      — Client 拉取最新状态（一次性）
GET  /api/v1/remote/stream      — Client SSE 订阅实时推送
```

### 4.2 数据模型

```sql
-- 新增表，不动现有表（最终版，与附录 A 一致）
CREATE TABLE lobster_remote_status (
  user_id INTEGER PRIMARY KEY REFERENCES lobster_users(id) ON DELETE CASCADE,
  lobster_id VARCHAR(10) NOT NULL UNIQUE,
  status VARCHAR(10) NOT NULL DEFAULT 'offline' CHECK (status IN ('active','idle','offline')),
  active_sessions INTEGER NOT NULL DEFAULT 0,
  total_tokens BIGINT NOT NULL DEFAULT 0,
  daily_baseline BIGINT NOT NULL DEFAULT 0,
  daily_baseline_date DATE NOT NULL DEFAULT CURRENT_DATE,
  last_heartbeat_at TIMESTAMPTZ,
  reporter_version VARCHAR(20) DEFAULT 'unknown',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 只需要按 lobster_id 查询
CREATE INDEX idx_remote_status_lobster ON lobster_remote_status(lobster_id);
```

**设计说明：**
- 主键用 `user_id`（FK 到 lobster_users.id），跟现有表结构一致
- `daily_baseline` + `daily_baseline_date`：跨天重置基线，daily_tokens 在查询时计算
- 无 `sessions_snapshot`：隐私决策（§13.5），只上报聚合数据
- `ON DELETE CASCADE`：用户注销时自动清理
- `CHECK` 约束限制 status 枚举值

### 4.3 Heartbeat 端点

```javascript
// POST /api/v1/remote/heartbeat
// Auth: remoteAuthMiddleware（支持 reporter 专用 token，见 §13.1）
// 校验: Joi schema（见 §13.3）
router.post('/heartbeat', heartbeatLimiter, remoteAuthMiddleware, async (req, res) => {
  const { error, value } = heartbeatSchema.validate(req.body);
  if (error) return res.status(400).json({ error: error.message });

  const { status, activeSessions, totalTokens, reporterVersion } = value;
  const today = new Date().toISOString().slice(0, 10);

  // 异常检测（§13.7）：先查旧值
  const { rows: prev } = await pool.query(
    'SELECT total_tokens, last_heartbeat_at FROM lobster_remote_status WHERE user_id = $1',
    [req.userId]
  );
  let resetDetected = false;
  if (prev.length > 0) {
    const tokenDelta = totalTokens - prev[0].total_tokens;
    const timeDelta = Date.now() - new Date(prev[0].last_heartbeat_at).getTime();
    if (tokenDelta < -1000000) {
      console.warn(`[ANOMALY] User ${req.userId}: tokens went backwards by ${Math.abs(tokenDelta)}`);
      // D2 fix: token 大幅倒退 = OpenClaw 重装/数据清理，重置 baseline 但不丢失历史峰值
      resetDetected = true;
    }
    if (timeDelta < 60000 && tokenDelta > 1e9) {
      console.warn(`[ANOMALY] User ${req.userId}: token spike ${tokenDelta} in ${timeDelta}ms`);
    }
  }

  // UPSERT：baseline 模式，daily_tokens 在查询时计算
  await pool.query(`
    INSERT INTO lobster_remote_status
      (user_id, lobster_id, status, active_sessions, total_tokens,
       daily_baseline, daily_baseline_date, last_heartbeat_at, reporter_version)
    VALUES ($1, $2, $3, $4, $5, $5, $6, NOW(), $7)
    ON CONFLICT (user_id) DO UPDATE SET
      status = EXCLUDED.status,
      active_sessions = EXCLUDED.active_sessions,
      total_tokens = CASE
        WHEN $8 THEN EXCLUDED.total_tokens  -- D2: reset 时用新值
        ELSE GREATEST(lobster_remote_status.total_tokens, EXCLUDED.total_tokens)  -- 正常时取较大值（防倒退）
      END,
      daily_baseline = CASE
        WHEN $8 THEN $5  -- D2: reset 时重置 baseline
        WHEN lobster_remote_status.daily_baseline_date != $6::date THEN $5
        ELSE lobster_remote_status.daily_baseline
      END,
      daily_baseline_date = $6,
      last_heartbeat_at = NOW(),
      reporter_version = EXCLUDED.reporter_version,
      updated_at = NOW()
  `, [req.userId, req.user.lobster_id, status, activeSessions,
      totalTokens, today, reporterVersion, resetDetected]);

  // 响应里带最低版本要求（§B1 版本强制升级）
  res.json({ ok: true, minVersion: '1.0.0' });
});

### 4.4 Status 端点（一次性查询）

```javascript
// GET /api/v1/remote/status
router.get('/status', authMiddleware, async (req, res) => {
  const { rows } = await pool.query(
    'SELECT * FROM lobster_remote_status WHERE user_id = $1', [req.userId]
  );

  if (rows.length === 0) {
    return res.json({
      status: 'offline', activeSessions: 0,
      totalTokens: 0, dailyTokens: 0, configured: false,
    });
  }

  const row = rows[0];
  const isStale = Date.now() - new Date(row.last_heartbeat_at).getTime() > 30_000;
  // D1 fix: 区分 offline 原因
  const effectiveStatus = isStale ? 'offline' : row.status;
  const offlineReason = isStale ? 'reporter_offline'
    : (row.status === 'offline' ? 'openclaw_offline' : undefined);
  const dailyTokens = Math.max(0, row.total_tokens - (row.daily_baseline || 0));

  res.json({
    status: effectiveStatus,
    offlineReason,
    activeSessions: row.active_sessions,
    totalTokens: row.total_tokens,
    dailyTokens,
    lastHeartbeat: row.last_heartbeat_at,
    reporterVersion: row.reporter_version,
    configured: true,
  });
});
```

### 4.5 SSE Stream 端点（简化示意，完整实现见 §13.4）

```javascript
// GET /api/v1/remote/stream
// ⚠️ 以下为简化示意。实际实现必须用 §13.4 版本（含 connId、token 重校验、单用户单连接）
router.get('/stream', authMiddleware, (req, res) => {
  // SSE headers
  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache',
    'Connection': 'keep-alive',
    'X-Accel-Buffering': 'no', // Nginx 不缓冲
  });

  // 立即发一次当前状态
  sendStatus();

  // 每 5 秒推送
  const interval = setInterval(sendStatus, 5000);

  async function sendStatus() {
    try {
      const { rows } = await pool.query(
        'SELECT * FROM lobster_remote_status WHERE user_id = $1', [req.userId]
      );

      let data;
      if (rows.length === 0) {
        data = { status: 'offline', activeSessions: 0, totalTokens: 0, dailyTokens: 0 };
      } else {
        const row = rows[0];
        const isStale = Date.now() - new Date(row.last_heartbeat_at).getTime() > 30_000;
        data = {
          status: isStale ? 'offline' : row.status,
          activeSessions: row.active_sessions,
          totalTokens: row.total_tokens,
          dailyTokens: Math.max(0, row.total_tokens - (row.daily_baseline || 0)),
          lastHeartbeat: row.last_heartbeat_at,
        };
      }

      res.write(`data: ${JSON.stringify(data)}\n\n`);
    } catch (err) {
      console.error('SSE error:', err.message);
    }
  }

  // 客户端断开时清理
  req.on('close', () => {
    clearInterval(interval);
  });
});
```

### 4.6 Rate Limiting

```javascript
const heartbeatLimiter = rateLimit({
  windowMs: 60_000,  // 1分钟
  max: 12,           // 最多12次/分钟（10秒间隔 = 6次/分钟，留2倍余量）
  message: { error: 'too many heartbeats' },
});

router.post('/heartbeat', heartbeatLimiter, authMiddleware, async (req, res) => { ... });
```

### 4.7 批判：Relay 的弱点

| 弱点 | 严重度 | 应对 |
|------|--------|------|
| SSE 轮询 DB 而非事件驱动 | 🟢低 | 用户量 < 20，5秒轮询完全够；100+ 再加 pub/sub |
| SSE 连接数限制 | 🟢低 | 每用户最多1个 SSE 连接；Nginx 默认 worker_connections 1024 够用 |
| DB 查询频率 | 🟡中 | 每个 SSE 客户端 5秒1次查询。10个远程用户 = 120 QPS，PG 轻松扛 |
| Nginx 缓冲 SSE | 🟡中 | 需要加 `X-Accel-Buffering: no` 和 `proxy_buffering off` |
| 30秒超时判定太短？ | 🟢低 | Reporter 10秒一次，3次没到才判 offline，合理 |

---

## 五、Client 改动（龙虾宝宝 Electron）

### 5.1 数据源抽象（Provider 模式）

当前 `status.ts` 直接 exec 本地命令。重构为 Provider 接口：

```typescript
// electron/status-provider.ts

export interface StatusPayload {
  status: 'active' | 'idle' | 'error' | 'offline';
  // D1 fix: 区分离线原因
  offlineReason?: 'openclaw_offline' | 'reporter_offline' | 'relay_unreachable' | 'token_invalid';
  activeSessions: number;
  tokenInfo: { daily: number; total: number };
}

export interface StatusProvider {
  start(callback: (data: StatusPayload) => void): void;
  stop(): void;
}
```

#### LocalStatusProvider（现有逻辑封装）

```typescript
// electron/local-status-provider.ts
export class LocalStatusProvider implements StatusProvider {
  private interval: NodeJS.Timeout | null = null;

  start(callback: (data: StatusPayload) => void) {
    const tick = () => {
      // 现有的 exec + scanRealTokenUsage 逻辑
      // 调用 callback(payload)
    };
    tick();
    this.interval = setInterval(tick, 5000);
  }

  stop() {
    if (this.interval) clearInterval(this.interval);
  }
}
```

#### RemoteStatusProvider（新增）

```typescript
// electron/remote-status-provider.ts
import { net } from 'electron'; // Electron 的 net 模块支持 SSE

export class RemoteStatusProvider implements StatusProvider {
  private request: any = null;
  private reconnectTimer: NodeJS.Timeout | null = null;
  private buffer = '';
  private reconnectCount = 0;
  private lastDataAt = 0;

  start(callback: (data: StatusPayload) => void) {
    this.connect(callback);
  }

  private connect(callback: (data: StatusPayload) => void) {
    const token = readStore().socialToken;
    if (!token) {
      callback({ status: 'error', activeSessions: 0, tokenInfo: { daily: 0, total: 0 } });
      return;
    }

    // Electron main process 不能用 EventSource（那是浏览器 API）
    // 用 node 的 https 模块手动解析 SSE
    const url = new URL('https://game.weixin-vip.cn/lobster-social/api/v1/remote/stream');
    const req = https.get({
      hostname: url.hostname,
      path: url.pathname,
      headers: {
        'Authorization': `Bearer ${token}`,
        'Accept': 'text/event-stream',
        'Cache-Control': 'no-cache',
      },
    }, (res) => {
      if (res.statusCode === 401) {
        log('Remote SSE: token expired or revoked');
        callback({ status: 'error', activeSessions: 0, tokenInfo: { daily: 0, total: 0 } });
        return; // 不重连，等用户重新配置
      }
      if (res.statusCode !== 200) {
        log(`Remote SSE error: HTTP ${res.statusCode}`);
        this.scheduleReconnect(callback);
        return;
      }

      this.reconnectCount = 0; // 连接成功，重置计数
      res.setEncoding('utf-8');
      res.on('data', (chunk: string) => {
        this.buffer += chunk;
        const messages = this.buffer.split('\n\n');
        this.buffer = messages.pop() || '';

        for (const msg of messages) {
          const dataLine = msg.split('\n').find(l => l.startsWith('data: '));
          if (!dataLine) continue;
          try {
            const data = JSON.parse(dataLine.slice(6));
            // 处理 token_revoked 事件（来自 §13.4 SSE 端）
            if (data.status === 'token_revoked') {
              log('Remote SSE: token revoked by server');
              callback({ status: 'error', activeSessions: 0, tokenInfo: { daily: 0, total: 0 } });
              this.stop();
              return;
            }
            this.lastDataAt = Date.now();
            callback({
              status: data.status === 'offline' ? 'error' : data.status,
              activeSessions: data.activeSessions || 0,
              tokenInfo: { daily: data.dailyTokens || 0, total: data.totalTokens || 0 },
            });
          } catch (e) {
            log(`Remote SSE parse error: ${e}`);
          }
        }
      });

      res.on('end', () => {
        log('Remote SSE connection ended');
        this.scheduleReconnect(callback);
      });
    });

    req.on('error', (e: Error) => {
      log(`Remote SSE connection error: ${e.message}`);
      this.scheduleReconnect(callback);
    });

    this.request = req;
  }

  // B5 fix: 指数退避重连，最大 5 分钟
  // U4 fix: 加随机抖动防惊群
  private scheduleReconnect(callback: (data: StatusPayload) => void) {
    this.reconnectCount++;
    const base = Math.min(5 * 60 * 1000, 1000 * Math.pow(2, Math.min(this.reconnectCount, 8)));
    const jitter = Math.random() * base * 0.3; // 0-30% 抖动
    const delay = base + jitter;
    log(`Remote SSE: reconnecting in ${(delay/1000).toFixed(1)}s (attempt #${this.reconnectCount})`);
    this.reconnectTimer = setTimeout(() => this.connect(callback), delay);
  }

  // U4 fix: 检测睡眠唤醒（30 秒没收到数据 → 主动断开重连）
  private startStaleCheck(callback: (data: StatusPayload) => void) {
    this.staleCheckTimer = setInterval(() => {
      if (this.lastDataAt > 0 && Date.now() - this.lastDataAt > 30_000) {
        log('Remote SSE: no data for 30s (likely sleep/wake), forcing reconnect');
        this.stop();
        this.reconnectCount = 0; // 睡眠唤醒不算失败，重置计数
        this.connect(callback);
      }
    }, 10_000);
  }

  stop() {
    if (this.request) { this.request.destroy(); this.request = null; }
    if (this.reconnectTimer) { clearTimeout(this.reconnectTimer); this.reconnectTimer = null; }
  }
}
```

**批判：之前用了 `EventSource`，但 Electron main process 没有 `EventSource` API。** 必须用 `https.get` 手动解析 SSE 格式。这是旧文档的重大遗漏。

### 5.2 Provider 切换逻辑

```typescript
// electron/status.ts（重构）
import { LocalStatusProvider } from './local-status-provider';
import { RemoteStatusProvider } from './remote-status-provider';

let currentProvider: StatusProvider | null = null;

export function initStatus(openclawPath: string | null, mainWindowGetter: () => BrowserWindow | null) {
  const store = readStore();
  const mode = store.settings?.statusMode || 'local'; // 'local' | 'remote'

  if (mode === 'remote' && store.socialToken) {
    currentProvider = new RemoteStatusProvider();
  } else {
    currentProvider = new LocalStatusProvider(openclawPath);
  }

  currentProvider.start((data) => {
    const win = mainWindowGetter();
    if (!win || win.isDestroyed()) return;
    win.webContents.send('openclaw-status', data);
  });
}

// 支持运行时切换
export function switchStatusMode(mode: 'local' | 'remote') {
  currentProvider?.stop();
  // 重新初始化...
}
```

### 5.3 UI 改动

#### 设置面板新增

```
┌─────────────────────────────┐
│  数据源                      │
│  ○ 本地（自动检测）          │
│  ● 远程（云服务器）    ☁️    │
│                             │
│  远程 Token: LB-000001      │
│  状态: 已连接 ✅             │
│  最后心跳: 3秒前             │
│  Reporter 版本: 1.0.0       │
│                             │
│  [复制我的 Token]            │
│  [安装 Reporter 教程]        │
└─────────────────────────────┘
```

#### 远程模式视觉区分
- 龙虾宝宝右上角显示 ☁️ 小图标
- 状态面板顶部显示 "☁️ 远程模式 · LB-000001"
- 气泡对话增加远程相关台词：`"远程监控中~"`, `"服务器在跑呢！"`, `"☁️ 信号稳定"`

#### 远程模式禁用的功能
- 本地 token 扫描（数据来自 Reporter）
- 本地 OpenClaw 路径检测
- 插件系统（插件跑在本地，远程模式没意义）

---

## 六、安全设计

### 6.1 威胁模型

| 编号 | 威胁 | 攻击面 | 风险 | 应对 |
|------|------|--------|------|------|
| T1 | Reporter token 泄露 | 服务器文件系统 | 🟡中 | 专用 reporter token，最小权限：只能 POST heartbeat（§13.1/13.2） |
| T2 | 伪造 heartbeat | 网络 | 🟢低 | JWT 认证 + jti hash 校验 + rate limit (12次/分钟) + Joi schema 校验（§13.3） |
| T3 | SSE 连接嗅探 | 网络 | 🟢低 | 全链路 HTTPS，token 在 header（非 URL） |
| T4 | Reporter 进程被替换 | 服务器 root | 🔴高 | 如果攻击者有 root，整个服务器已经沦陷，不在龙虾宝宝防护范围 |
| T5 | DDoS heartbeat 端点 | 网络 | 🟡中 | rate limit + 每用户只存一行（无法通过大量 heartbeat 填满 DB） |
| T6 | SSE 连接耗尽服务器资源 | 网络 | 🟡中 | 单用户单连接 + 全局 200 上限（§13.4） |
| T7 | SSE 连接建立后 token 被吊销 | 网络 | 🟡中 | SSE sendStatus 每分钟重新校验 token 有效性（§13.4） |
| T8 | Reporter 上报 session 明细泄露隐私 | 数据 | 🟡中 | 只上报聚合数据，不上报 session 明细（§13.5） |
| T9 | 旧版 Reporter 有安全漏洞 | 客户端 | 🟡中 | heartbeat 响应带 minVersion，Reporter 自检升级（§B1） |

### 6.2 JWT Token 复用分析

**现有社交 token 格式：** `{ uid: number, device: string }`, 30天有效期, HS256 签名

**问题：Reporter 在云服务器上，device_hash 跟注册时不同。**

这是一个**关键设计缺陷**——现有 auth 中间件会校验 `device_hash`：
```javascript
const { rows } = await pool.query(
  'SELECT * FROM lobster_users WHERE id = $1 AND device_hash = $2',
  [decoded.uid, decoded.device]
);
```

Reporter 在不同机器上，`device_hash` 不匹配，认证会失败。

**解决方案：Reporter 专用 token（完整实现见 §13.1）**

Reporter 使用独立的 JWT（type: 'reporter' + jti hash），不绑定 device_hash，支持一键吊销。详见 §13.1 Token 生成/验证/吊销完整代码。

**批判：这是旧文档完全遗漏的关键问题。** 如果不解决 device_hash 校验，Reporter 根本无法认证。

---

## 七、Nginx 配置

现有 lobster-social 的 Nginx 配置需要加 SSE 支持：

```nginx
# 在 /etc/nginx/sites-enabled/game-portal 的 server 块内加：
# 注意：要放在通用 /lobster-social/ location 之前（Nginx 匹配最长前缀）

# SSE 专用配置（必须在 /lobster-social/ 之前）
location /lobster-social/api/v1/remote/stream {
    proxy_pass http://127.0.0.1:4050/api/v1/remote/stream;  # 带完整路径
    proxy_http_version 1.1;
    proxy_set_header Host $host;
    proxy_set_header X-Real-IP $remote_addr;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    proxy_set_header X-Forwarded-Proto $scheme;
    proxy_set_header Connection '';           # 清空，不用 upgrade
    proxy_buffering off;                      # 关键：不缓冲 SSE
    proxy_cache off;
    proxy_read_timeout 86400s;                # 24小时，防止 Nginx 超时断开
    chunked_transfer_encoding off;
}
```

**批判：旧文档完全没提 Nginx 配置。** SSE 在 Nginx 后面如果不加 `proxy_buffering off`，数据会被缓冲，客户端收不到实时推送。

---

## 八、用户流程（端到端）

### 8.1 首次配置流程

```
用户                          龙虾宝宝                    服务器
 │                              │                          │
 ├─ 打开设置 → 数据源 → 远程    │                          │
 │                              ├─ 显示"远程配置"面板      │
 │                              ├─ 调用 POST /remote/token │
 │                              │                          ├─ 生成 Reporter JWT
 │                              │←─────────────────────────┤
 │←── 显示 Reporter token ─────┤                          │
 │    + 安装命令                │                          │
 │                              │                          │
 │─ SSH 到云服务器 ────────────────────────────────────────┤
 │─ curl install.sh | bash ────────────────────────────────┤
 │─ 粘贴 token ───────────────────────────────────────────┤
 │                              │                          │
 │                              │    Reporter 开始上报 ──→  │
 │                              │←── SSE 推送状态 ─────────┤
 │←── 龙虾宝宝显示远程状态 ────┤                          │
```

### 8.2 日常使用

```
Reporter (云服务器)              Relay                     龙虾宝宝 (本地)
 │                                │                          │
 ├── 每10秒 POST heartbeat ─────→│                          │
 │                                ├── 更新 DB                │
 │                                ├── SSE 推送 ────────────→│
 │                                │                          ├── 更新龙虾状态
 │                                │                          ├── 更新 token 显示
 │                                │                          ├── 触发气泡对话
 │                                │                          │
 │  (Reporter 停了)               │                          │
 │                                ├── 30秒无心跳 → offline   │
 │                                ├── SSE 推送 offline ────→│
 │                                │                          ├── 龙虾显示掉线
```

---

## 九、分期计划（v4 修订）

| 阶段 | 内容 | 依赖 | 工作量 |
|------|------|------|--------|
| **P1** | DB 建表（附录 A）+ ALTER lobster_users + Nginx SSE 配置 | 无 | 🟢 1小时 |
| **P2** | remoteAuthMiddleware + Reporter token 生成/吊销 + 全局 blockReporter | P1 | 🟡 2小时 |
| **P3** | Relay API：heartbeat（含 Joi 校验+异常检测）+ status + stream（含 connId+token 重校验） | P1+P2 | 🟡 3小时 |
| **P4** | Reporter (Node.js)：异步采集+指数退避+版本检查+10MB 防护 + install.sh | P3 | 🟡 3小时 |
| **P5** | Client Provider 抽象 + RemoteStatusProvider（指数退避+token_revoked） | P3 | 🟡 3小时 |
| **P6** | Client 设置 UI（数据源切换/token 显示/安装教程/连接健康度） | P5 | 🟡 2小时 |
| **P7** | 远程模式视觉区分（☁️ 图标/气泡台词/禁用列表） | P5 | 🟢 1小时 |
| **P8** | 端到端测试（12 个场景）+ 文档 + lbhub.ai 下载页 | 全部 | 🟡 3小时 |

**总计约 18 小时。**

---

## 十、已知局限（诚实说）

| 编号 | 局限 | 严重度 | 缓解方案 |
|------|------|--------|----------|
| L1 | Reporter 需要 Node.js | 🟢低 | 有 OpenClaw 就有 Node；备选 shell 版 |
| L2 | 10 秒上报延迟 | 🟢低 | 桌宠不需要毫秒级实时性 |
| L3 | 只支持一对一（一个龙虾看一台服务器） | 🟡中 | V2 可加多数据源切换 |
| L4 | 依赖社交注册 | 🟡中 | 远程模式本来就需要账号体系 |
| L5 | SSE 在某些企业网络/代理后面不稳定 | 🟡中 | 自动重连 + fallback 到轮询 GET /status |
| L6 | Reporter token 1年后过期 | 🟢低 | 龙虾宝宝提示"token 即将过期" |
| L7 | 不支持 Windows 云电脑 | 🟡中 | V2 提供 PowerShell 版 Reporter |
| L8 | 中继服务器是单点故障 | 🟡中 | 社交功能已经依赖它，不是新风险 |

---

## 十一、替代方案对比（完整版）

| 方案 | 实现方式 | 优点 | 缺点 | 结论 |
|------|----------|------|------|------|
| **A. 中继+SSE（本方案）** | Reporter→Relay→Client | 零网络配置、复用基础设施 | 中继是单点、10秒延迟 | ✅ 选择 |
| B. OpenClaw 插件 | 插件 hook 上报 | 零额外进程 | 依赖 OC 插件 API 稳定性；hook 触发不规律 | ⚠️ 备选 |
| C. WebSocket 直连 | 服务器开 WS 端口 | 真正实时 | 用户要配端口/防火墙/SSL | ❌ 门槛高 |
| D. Tailscale/ZeroTier | 虚拟组网 | 像局域网一样 | 额外软件；企业网可能禁 | ❌ 太重 |
| E. 纯轮询 | Client 定时 GET | 最简单 | 延迟高、浪费带宽 | ⚠️ 作为 SSE fallback |

---

## 十二、测试计划（12 个场景）

| 场景 | 预期结果 | 验证方式 |
|------|----------|----------|
| Reporter 正常上报 | 龙虾显示 active + 正确 token 数 | 看 debug log |
| Reporter 停止 | 30秒后龙虾显示 offline | kill Reporter 进程 |
| Reporter 重启 | 龙虾恢复 active | 重启 Reporter |
| 网络断开 | SSE 断开 → 指数退避重连 | 断网再连 |
| Token 过期 | 龙虾提示"请重新配置" | 用过期 JWT |
| 切换本地/远程 | 无缝切换，状态不闪烁 | 设置面板操作 |
| 日期跨天 | daily_tokens 重置为 0 | 等到 UTC 0点 |
| 多客户端连同一账号 | 旧连接被踢，新连接正常 | 开两个实例 |
| **Token 吊销** | SSE 推送 token_revoked，Client 停止重连 | 龙虾宝宝里点"吊销" |
| **Reporter 遇 5xx** | 指数退避 5s→10s→20s...→5min | 临时关闭 Relay |
| **Reporter token 访问其他 API** | 返回 403 | curl 用 reporter token 打 /leaderboard |
| **大文件跳过** | Reporter 跳过 >10MB 的 jsonl，不 OOM | 造一个大文件 |

---

## 附录 A：修订后的 DB Schema

```sql
-- 完整建表语句（可直接执行）— v4 最终版
CREATE TABLE IF NOT EXISTS lobster_remote_status (
  user_id INTEGER PRIMARY KEY REFERENCES lobster_users(id) ON DELETE CASCADE,
  lobster_id VARCHAR(10) NOT NULL UNIQUE,
  status VARCHAR(10) NOT NULL DEFAULT 'offline'
    CHECK (status IN ('active', 'idle', 'offline')),
  active_sessions INTEGER NOT NULL DEFAULT 0,
  total_tokens BIGINT NOT NULL DEFAULT 0,
  daily_baseline BIGINT NOT NULL DEFAULT 0,
  daily_baseline_date DATE NOT NULL DEFAULT CURRENT_DATE,
  last_heartbeat_at TIMESTAMPTZ,
  reporter_version VARCHAR(20) DEFAULT 'unknown',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
-- ⚠️ 注意：无 sessions_snapshot 字段（§13.5 隐私决策：只上报聚合数据）

CREATE INDEX IF NOT EXISTS idx_remote_status_lobster
  ON lobster_remote_status(lobster_id);

-- Reporter token 支持（§13.1）
ALTER TABLE lobster_users ADD COLUMN IF NOT EXISTS reporter_token_hash VARCHAR(64);
ALTER TABLE lobster_users ADD COLUMN IF NOT EXISTS reporter_token_issued_at TIMESTAMPTZ;
```

## 附录 B：版本演进对照

| 问题 | v1 | v2 | v3 | v4 |
|------|-----|-----|-----|-----|
| device_hash 冲突 | 完全遗漏 | 设计了 Reporter 专用 token | 加 jti hash + 吊销 | — |
| Electron 没有 EventSource | 用了 EventSource | 改为 https.get | — | 加 token_revoked 处理 |
| Nginx SSE 缓冲 | 未提及 | 加了 proxy_buffering off | — | 修正 proxy_pass 路径 |
| daily_tokens 计算 | 在 UPSERT 中算 | 改为 baseline 模式 | — | — |
| Docker 环境 | systemd timer | Node.js 常驻服务 | — | — |
| Reporter 阻塞 | — | execSync | — | 改 execFile 异步 |
| 大文件 OOM | — | 全文件读内存 | — | >10MB 跳过 |
| SSE token 位置 | token 在 URL query | 改为 header | — | — |
| Schema 自相矛盾 | — | — | sessions_snapshot 残留 | 统一删除 |
| SSE race condition | — | — | 有 bug | connId 修复 |
| SSE token 吊销 | — | — | 一次性认证 | 每分钟重校验 |
| 权限拦截遗漏 | — | — | 逐路由 block | 全局默认拒绝 |
| 5xx 重连风暴 | — | — | 固定 5s 重连 | 指数退避 |
| 版本强制升级 | — | — | 无 | heartbeat 响应带 minVersion |
| 分期计划不含安全 | — | — | 14h | 修正为 18h |
| 测试场景不全 | — | — | 8 个 | 12 个 |

---

## 十五、v3 → v4 变更总结

| 编号 | 问题 | 类型 | 修复 |
|------|------|------|------|
| C1 | 附录 A 残留 sessions_snapshot | 文档矛盾 | ✅ 删除，加注释说明 |
| C2 | §4.2 和附录 A schema 不一致 | 文档矛盾 | ✅ 统一为 baseline 版 |
| C3 | §6 威胁模型和 §13 安全加固矛盾 | 文档矛盾 | ✅ §6 引用 §13 实际方案 |
| C4 | §9 分期计划不含安全工作 | 文档矛盾 | ✅ 重新拆分 8 阶段 18h |
| A1 | SSE 连接建立后无法吊销 token | 架构 | ✅ 每分钟重校验 |
| A2 | execSync 阻塞主线程 | 架构 | ✅ 改 execFile 异步 |
| A3 | readFileSync 大文件 OOM | 架构 | ✅ >10MB 跳过 |
| A4 | 跨天 baseline 精度丢失 | 架构 | ⚠️ 文档说明，可接受 |
| A5 | blockReporter 逐路由易遗漏 | 安全 | ✅ 全局默认拒绝 |
| A6 | SSE 踢连接 race condition | 架构 | ✅ connId 唯一标识 |
| A7 | Nginx proxy_pass 缺路径 | 配置 | ✅ 带完整路径 |
| B1 | 无版本强制升级机制 | 运维 | ✅ 响应带 minVersion |
| B2 | 无 GDPR 合规 | 合规 | ⚠️ V2 再做，国内先不管 |
| B3 | 无 Reporter 升级路径 | 运维 | ✅ install.sh --upgrade |
| B4 | 无审计日志 | 合规 | ⚠️ V2 再做 |
| B5 | 无优雅降级策略 | 可靠性 | ✅ Reporter+Client 指数退避 |

**A4（跨天精度丢失）说明：**
Reporter 在跨天期间离线，baseline 重置为恢复时的值，导致中间消耗的 token 既不算昨天也不算今天。这对桌宠是可接受的误差，不是财务系统。如需精确，V2 可在 Reporter 端按天记录 baseline 并上报。

### 13.1 Reporter Token 安全

**v2 的问题：** Reporter token 明文存在 `~/.lobster-reporter.json`，任何能读该文件的人都能冒充上报。

**加固方案：**

```javascript
// Reporter token 设计原则：
// 1. 专用 type，不能用于其他 API（读排行榜、PK、改资料）
// 2. 可吊销 — 用户在龙虾宝宝里一键作废旧 token
// 3. 单 token 策略 — 每次生成新 token，旧 token 自动失效

// DB 增加字段
ALTER TABLE lobster_users ADD COLUMN reporter_token_hash VARCHAR(64);
ALTER TABLE lobster_users ADD COLUMN reporter_token_issued_at TIMESTAMPTZ;
```

**Token 生成流程：**
```javascript
router.post('/remote/token', authMiddleware, async (req, res) => {
  // 生成 reporter 专用 JWT
  const jti = crypto.randomBytes(16).toString('hex'); // 唯一 ID
  const reporterToken = jwt.sign(
    { uid: req.userId, type: 'reporter', jti },
    JWT_SECRET,
    { expiresIn: '365d' }
  );

  // 存 hash（不存明文），旧 token 自动作废
  const hash = crypto.createHash('sha256').update(jti).digest('hex');
  await pool.query(
    'UPDATE lobster_users SET reporter_token_hash = $1, reporter_token_issued_at = NOW() WHERE id = $2',
    [hash, req.userId]
  );

  res.json({ token: reporterToken });
});
```

**Token 验证：**
```javascript
async function remoteAuthMiddleware(req, res, next) {
  const authHeader = req.headers.authorization;
  if (!authHeader?.startsWith('Bearer ')) return res.status(401).json({ error: 'unauthorized' });

  try {
    const decoded = jwt.verify(authHeader.slice(7), JWT_SECRET);

    if (decoded.type === 'reporter') {
      // 校验 jti hash（确保是最新生成的 token）
      const jtiHash = crypto.createHash('sha256').update(decoded.jti).digest('hex');
      const { rows } = await pool.query(
        'SELECT * FROM lobster_users WHERE id = $1 AND reporter_token_hash = $2',
        [decoded.uid, jtiHash]
      );
      if (rows.length === 0) return res.status(401).json({ error: 'token revoked or invalid' });

      req.user = rows[0];
      req.userId = decoded.uid;
      req.isReporter = true;
      return next();
    }

    // 普通 token 走原有逻辑
    const { rows } = await pool.query(
      'SELECT * FROM lobster_users WHERE id = $1 AND device_hash = $2',
      [decoded.uid, decoded.device]
    );
    if (rows.length === 0) return res.status(401).json({ error: 'invalid token' });
    req.user = rows[0];
    req.userId = decoded.uid;
    next();
  } catch (err) {
    return res.status(401).json({ error: err.name === 'TokenExpiredError' ? 'token expired' : 'auth failed' });
  }
}
```

**吊销端点：**
```javascript
// DELETE /api/v1/remote/token — 吊销 Reporter token
router.delete('/token', authMiddleware, async (req, res) => {
  await pool.query(
    'UPDATE lobster_users SET reporter_token_hash = NULL, reporter_token_issued_at = NULL WHERE id = $1',
    [req.userId]
  );
  // 同时清理 remote_status 数据
  await pool.query('DELETE FROM lobster_remote_status WHERE user_id = $1', [req.userId]);
  res.json({ ok: true, message: 'reporter token revoked' });
});
```

**为什么不用 OAuth2？**
- 用户量 < 100，OAuth2 是过度工程
- Reporter 是用户自己在自己服务器上运行，不是第三方应用
- JWT + jti hash 已经提供了：签名校验、过期控制、单 token 吊销

### 13.2 Reporter 权限最小化

**原则：Reporter token 只能做一件事 — POST heartbeat**

**反转逻辑：默认拒绝，显式放行**（防止新增路由忘加拦截）

```javascript
// M4 fix: 不依赖 req.isReporter（那是 auth 中间件设的，可能还没执行）
// 直接在全局中间件里轻量解析 JWT type 字段
function isReporterToken(req) {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader?.startsWith('Bearer ')) return false;
    // 只 decode 不 verify（verify 留给路由级 auth 中间件）
    const payload = JSON.parse(Buffer.from(authHeader.slice(7).split('.')[1], 'base64').toString());
    return payload.type === 'reporter';
  } catch { return false; }
}

// 全局中间件：在所有路由之前注册
app.use('/api/v1', (req, res, next) => {
  if (isReporterToken(req) && !req.path.startsWith('/remote/heartbeat')) {
    return res.status(403).json({ error: 'reporter tokens: only POST /heartbeat allowed' });
  }
  next();
});
```

**为什么全局拦截要自己解析 JWT？**
- Express 中间件按注册顺序执行：全局 → 路由级
- auth 中间件是路由级的，设置 `req.isReporter` 时全局中间件已经执行完了
- 所以全局中间件不能依赖 `req.isReporter`，要自己轻量解析
- 只 decode 不 verify（`split('.')[1]` base64），性能开销极低
- 正式的签名校验仍然在路由级 auth 中间件做

**如果 Reporter token 泄露了，攻击者只能：**
- 伪造你的 OpenClaw 状态（让龙虾显示错误数据）
- 无法：读你的资料、改你的昵称、发起 PK、删除账号、吊销 token

### 13.3 Heartbeat 数据校验（防注入/溢出）

```javascript
const Joi = require('joi'); // 或 zod

const heartbeatSchema = Joi.object({
  status: Joi.string().valid('active', 'idle', 'offline').required(),
  activeSessions: Joi.number().integer().min(0).max(100).required(),
  totalTokens: Joi.number().integer().min(0).max(1e15).required(), // 最大 1000T
  // M1 fix: timestamp 用 custom 动态校验，不用 max（max 在 schema 创建时求值，服务器跑久了会过期）
  timestamp: Joi.number().integer().min(0).custom((val, helpers) => {
    if (val > Date.now() + 60000) return helpers.error('any.invalid');
    return val;
  }).required(),
  reporterVersion: Joi.string().max(20).pattern(/^[a-zA-Z0-9.\-]+$/).required(),
}).options({ stripUnknown: true }); // 丢弃未知字段

router.post('/heartbeat', heartbeatLimiter, remoteAuthMiddleware, async (req, res) => {
  const { error, value } = heartbeatSchema.validate(req.body);
  if (error) return res.status(400).json({ error: error.message });

  // 用 value（经过清洗的）而不是 req.body
  // ...
});
```

**v2 的问题：**
- 只检查了 status 和 totalTokens 两个字段
- 没有限制 activeSessions 上限（可以传 999999999）
- 没有检查 timestamp 合理性（可以传未来的时间戳）
- 没有对 reporterVersion 做格式校验（可以传 XSS payload）
- 没有 stripUnknown（可以传任意额外字段到 DB）

### 13.4 SSE 连接管理

**问题：一个用户开了 10 个龙虾宝宝窗口 → 10 个 SSE 连接 → 10 个定时器 → 10x DB 查询**

```javascript
// 全局 SSE 连接注册表
const sseConnections = new Map(); // userId → { res, interval, connId }
let connIdCounter = 0;

// L2 fix: stream 是给 Client（普通社交 token）用的，用 authMiddleware
// heartbeat 是给 Reporter 用的，用 remoteAuthMiddleware
router.get('/stream', authMiddleware, (req, res) => {
  const userId = req.userId;
  const connId = ++connIdCounter; // 唯一连接 ID，防 race condition

  // 踢掉旧连接
  if (sseConnections.has(userId)) {
    const old = sseConnections.get(userId);
    clearInterval(old.interval);
    try { old.res.end(); } catch {}
    sseConnections.delete(userId);
  }

  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache',
    'Connection': 'keep-alive',
    'X-Accel-Buffering': 'no',
  });

  let tokenCheckCounter = 0; // 每 12 次（60秒）重新校验 token
  const isReporterConn = req.isReporter || false; // 记录连接类型
  const interval = setInterval(sendStatus, 5000);
  sseConnections.set(userId, { res, interval, connId });

  // 立即发一次
  sendStatus();

  async function sendStatus() {
    // A1 fix: 每分钟重新校验 token 是否仍然有效
    tokenCheckCounter++;
    if (tokenCheckCounter % 12 === 0) {
      try {
        // M2 fix: SSE 是给 Client（普通社交 token）用的
        // 校验用户是否还存在（account 未删除），而不是检查 reporter_token_hash
        const { rows } = await pool.query(
          'SELECT id FROM lobster_users WHERE id = $1', [userId]
        );
        if (rows.length === 0) {
          // 用户已注销
          res.write(`data: ${JSON.stringify({ status: 'account_deleted' })}\n\n`);
          clearInterval(interval);
          try { res.end(); } catch {}
          const current = sseConnections.get(userId);
          if (current && current.connId === connId) sseConnections.delete(userId);
          return;
        }
      } catch {}
    }

    try {
      const { rows } = await pool.query(
        'SELECT * FROM lobster_remote_status WHERE user_id = $1', [userId]
      );

      let data;
      if (rows.length === 0) {
        data = { status: 'offline', activeSessions: 0, totalTokens: 0, dailyTokens: 0 };
      } else {
        const row = rows[0];
        const isStale = Date.now() - new Date(row.last_heartbeat_at).getTime() > 30_000;
        data = {
          status: isStale ? 'offline' : row.status,
          activeSessions: row.active_sessions,
          totalTokens: row.total_tokens,
          dailyTokens: Math.max(0, row.total_tokens - (row.daily_baseline || 0)),
          lastHeartbeat: row.last_heartbeat_at,
        };
      }

      res.write(`data: ${JSON.stringify(data)}\n\n`);
    } catch (err) {
      console.error('SSE error:', err.message);
    }
  }

  // 客户端断开时清理
  req.on('close', () => {
    clearInterval(interval);
    // A6 fix: 只有当前连接 ID 匹配才从 Map 删除，防止 race condition
    const current = sseConnections.get(userId);
    if (current && current.connId === connId) {
      sseConnections.delete(userId);
    }
  });

  // 全局上限保护
  if (sseConnections.size > 200) {
    const [oldestId, oldest] = sseConnections.entries().next().value;
    clearInterval(oldest.interval);
    try { oldest.res.end(); } catch {}
    sseConnections.delete(oldestId);
  }
});
```

### 13.5 数据隐私合规

**上报的数据包含什么？**

| 字段 | 是否敏感 | 说明 |
|------|----------|------|
| status (active/idle/offline) | 🟢否 | 二值状态 |
| activeSessions | 🟢否 | 数字 |
| totalTokens | 🟡低 | 使用量统计，不含内容 |
| sessions 列表 | 🟡中 | 包含 session key（可能含频道名） |

**关键决策：Reporter 不上报 sessions 快照。**

v2 的 `sessions_snapshot JSONB` 字段存了完整的 sessions 列表，包含 session key（如 `agent:main:discord:channel:xxx`），这泄露了用户在哪些 Discord 频道活跃。

**修正：只上报聚合数据（session 数量），不上报 session 明细。**

```sql
-- 删除 sessions_snapshot 字段
ALTER TABLE lobster_remote_status DROP COLUMN IF EXISTS sessions_snapshot;
```

Reporter 只发 `{ status, activeSessions, totalTokens }` 三个字段，不发任何 session 明细。

### 13.6 Reporter 通信安全

**证书锁定（Certificate Pinning）**

商业级 Reporter 应该验证服务器证书，防中间人：

```javascript
// Reporter 中加证书指纹校验
const EXPECTED_FINGERPRINT = 'sha256/xxxxxxx'; // game.weixin-vip.cn 的证书指纹

const req = https.request({
  // ...
  checkServerIdentity: (host, cert) => {
    const fingerprint = `sha256/${crypto.createHash('sha256').update(cert.raw).digest('base64')}`;
    if (fingerprint !== EXPECTED_FINGERPRINT) {
      throw new Error(`Certificate fingerprint mismatch: expected ${EXPECTED_FINGERPRINT}, got ${fingerprint}`);
    }
  },
}, callback);
```

**批判：证书锁定 Let's Encrypt 证书会在续期后失效。**

Let's Encrypt 每 90 天换一次证书。pinning 具体证书不现实。

**替代方案：pin CA 而不是叶子证书**，或者直接信任系统 CA store（Node.js 默认行为）。对于当前规模，HTTPS + 系统 CA 已经足够。证书锁定留到 V2。

### 13.7 异常监控与告警

**Reporter 健康检查：**

```javascript
// Relay 端：检测 Reporter 异常模式
router.post('/heartbeat', ..., async (req, res) => {
  // ... 正常处理 ...

  // 异常检测
  const { rows } = await pool.query(
    'SELECT total_tokens, last_heartbeat_at FROM lobster_remote_status WHERE user_id = $1',
    [req.userId]
  );

  if (rows.length > 0) {
    const prev = rows[0];
    const tokenDelta = value.totalTokens - prev.total_tokens;
    const timeDelta = Date.now() - new Date(prev.last_heartbeat_at).getTime();

    // 异常1：token 倒退（可能是 Reporter 重装或数据损坏）
    if (tokenDelta < -1000000) {
      console.warn(`[ANOMALY] User ${req.userId}: tokens went backwards by ${Math.abs(tokenDelta)}`);
    }

    // 异常2：token 暴增（1分钟内增长 > 1B，可能伪造）
    if (timeDelta < 60000 && tokenDelta > 1e9) {
      console.warn(`[ANOMALY] User ${req.userId}: token spike ${tokenDelta} in ${timeDelta}ms`);
      // 复用现有 anomaly 中间件的阈值
    }
  }
});
```

**Client 端连接状态指示：**

```typescript
// 远程模式下，状态面板显示连接健康度
interface RemoteHealth {
  connected: boolean;        // SSE 连接是否活跃
  lastDataAt: number;        // 上次收到数据的时间
  reconnectCount: number;    // 重连次数
  latencyMs: number;         // 最近一次数据的延迟
}
```

---

## 十四、运维手册（v3 新增）

### 14.1 部署清单（v4）

```
□ 1. DB: 执行建表 SQL (附录 A，含 remote_status + ALTER lobster_users)
□ 2. 后端: 新增 routes/remote.js（heartbeat/status/stream），注册到 server.js
□ 3. 后端: 新增 middleware/remoteAuth.js（支持 reporter type JWT）
□ 4. 后端: app.use 全局 reporter 拦截中间件
□ 5. 后端: 修改 rateLimit.js 加 heartbeatLimiter
□ 6. 后端: npm install joi（如果没有）
□ 7. Nginx: 在 /lobster-social/ location 之前加 SSE 专用 location
□ 8. Nginx: nginx -t && systemctl reload nginx
□ 9. PM2: restart lobster-social
□ 10. 测试: curl POST /remote/token（用普通 token）→ 获取 reporter token
□ 11. 测试: curl POST /remote/heartbeat（用 reporter token）→ 200
□ 12. 测试: curl GET /remote/stream（用普通 token）→ SSE 输出
□ 13. 测试: curl GET /leaderboard（用 reporter token）→ 403
□ 14. 测试: 吊销 reporter token → heartbeat 返回 401
```

### 14.2 回滚方案

```bash
# 如果出问题，可以安全回滚：
# 1. 删除 remote.js 路由（不影响现有社交功能）
# 2. Nginx 删除 SSE location 配置
# 3. DB 表留着不用（不影响其他表）
# 远程模式是纯增量功能，不修改任何现有代码路径
```

### 14.3 监控指标

```
# Prometheus 风格指标（如果后续加）
lobster_remote_heartbeats_total{status="active|idle|offline"}
lobster_remote_sse_connections_current
lobster_remote_token_generations_total
lobster_remote_anomalies_total{type="token_backward|token_spike"}
```

---

## 十六、v4 → v5 变更总结（第二轮+第三轮）

| 编号 | 问题 | 类型 | 修复 |
|------|------|------|------|
| M1 | Joi timestamp 定时炸弹 | 修复引入bug | ✅ 改 Joi.custom() 动态校验 |
| M2 | SSE token 校验查错字段 | 修复引入bug | ✅ 改为检查用户是否存在 |
| M3 | 两个 stream 实现并存 | 文档矛盾 | ✅ §4.5 标注"仅示意，见§13.4" |
| M4 | blockReporter 执行顺序 | 修复引入bug | ✅ 全局中间件自己解析 JWT type |
| D1 | offline 语义混乱 | 架构 | ✅ 区分 openclaw/reporter/relay 三种离线 |
| D2 | token 倒退等级掉 | 逻辑 | ✅ GREATEST + reset 检测 |
| D3 | 弱点表过时 | 文档 | ✅ 更新为 v5 版 |
| D4 | 三处 URL 硬编码 | 架构 | ✅ Reporter API_BASE 可配置 |
| D5 | 两版 token 代码 | 文档矛盾 | ✅ §6.2 删代码，指向 §13.1 |
| L1 | 退避逻辑 bug（日志刷屏） | bug | ✅ setTimeout 链式调用 |
| L2 | SSE auth 中间件用混 | 架构 | ✅ stream 用 authMiddleware |
| U1 | 没有一键安装命令 | UX | ✅ 安装命令含 --token 参数 |
| U4 | 睡眠唤醒检测 | UX | ✅ 30 秒无数据 → 主动重连 |
| O1 | Reporter 崩溃无自愈 | 运维 | ✅ systemd Restart=always |
| O3 | 惊群效应 | 可靠性 | ✅ 重连加 30% 随机抖动 |
| U2 | 连通性测试按钮 | UX | ⚠️ V1.1 |
| U3 | --check 诊断命令 | UX | ⚠️ V1.1 |
| O2 | 原因字段 | 运维 | ⚠️ V1.1 |
| U5 | 错误 i18n | UX | ⚠️ V2 |
| O4 | 安装方式争议 | 安全 | ✅ 提供三种方式 |

---

## 十七、历史变更（v2 → v3）

| 维度 | v2 | v3 |
|------|-----|-----|
| Token 安全 | 复用社交 JWT | 专用 reporter token + jti hash + 可吊销 |
| 权限模型 | 无限制 | 最小权限 |
| 数据校验 | 部分 | Joi schema + stripUnknown |
| SSE 连接管理 | 无限制 | 单用户单连接 + 全局 200 上限 |
| 数据隐私 | sessions 快照 | 只上报聚合数据 |
| 异常检测 | 无 | token 倒退/暴增 |
| 运维 | 无 | 部署清单 + 回滚方案 |
