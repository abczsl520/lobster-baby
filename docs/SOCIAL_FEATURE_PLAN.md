# 龙虾宝宝社交功能 — 完整技术方案

> 版本目标：v2.0.0 | 预计工期：3-5天（分阶段交付）

---

## 一、整体架构

```
┌─────────────────────┐         ┌──────────────────────────┐
│   Electron 客户端    │  HTTPS  │   API 服务器 (Node.js)    │
│   (lobster-baby)    │ ◄─────► │   8.138.104.108:3900     │
│                     │         │                          │
│  ┌───────────────┐  │         │  ┌────────────────────┐  │
│  │ 注册/登录模块  │  │         │  │ /api/v1/register   │  │
│  │ 排行榜面板    │  │         │  │ /api/v1/leaderboard│  │
│  │ PK 对战面板   │  │         │  │ /api/v1/pk         │  │
│  │ 设置面板扩展  │  │         │  │ /api/v1/profile    │  │
│  └───────────────┘  │         │  └────────────────────┘  │
└─────────────────────┘         │           │              │
                                │     ┌─────▼─────┐       │
                                │     │ PostgreSQL │       │
                                │     │  (已有PG16) │       │
                                │     └───────────┘       │
                                └──────────────────────────┘
```

**技术选型：**
- 后端：Node.js + Express + PostgreSQL（新服务器已有 PG16）
- 通信：HTTPS REST API（简单可靠，无需 WebSocket）
- 认证：设备指纹 + JWT token
- 部署：PM2 管理，Nginx 反代

---

## 二、数据库设计

### 2.1 用户表 `lobster_users`

```sql
CREATE TABLE lobster_users (
  id            SERIAL PRIMARY KEY,
  lobster_id    VARCHAR(10) UNIQUE NOT NULL,    -- 'LB-000001' 格式
  nickname      VARCHAR(20) NOT NULL,            -- 用户自定义昵称
  device_hash   VARCHAR(64) UNIQUE NOT NULL,     -- 设备指纹SHA256（不可逆）
  avatar_level  INT DEFAULT 1,                   -- 当前等级（1-10）
  total_tokens  BIGINT DEFAULT 0,                -- 总token数
  daily_tokens  BIGINT DEFAULT 0,                -- 今日token数
  achievements  INT DEFAULT 0,                   -- 已解锁成就数
  online_days   INT DEFAULT 0,                   -- 累计在线天数
  streak_days   INT DEFAULT 0,                   -- 连续在线天数
  last_sync_at  TIMESTAMPTZ,                     -- 最后同步时间
  last_online_date DATE,                         -- 最后在线日期（算连续天数）
  show_on_leaderboard BOOLEAN DEFAULT FALSE,     -- 是否参与排行榜
  privacy_agreed BOOLEAN DEFAULT FALSE,          -- 是否同意隐私协议
  privacy_agreed_at TIMESTAMPTZ,                 -- 同意时间
  privacy_version VARCHAR(10),                   -- 同意的隐私协议版本
  created_at    TIMESTAMPTZ DEFAULT NOW(),
  updated_at    TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_users_leaderboard ON lobster_users (show_on_leaderboard, total_tokens DESC)
  WHERE show_on_leaderboard = TRUE;
CREATE INDEX idx_users_device ON lobster_users (device_hash);
```

### 2.2 PK 对战表 `lobster_pk`

```sql
CREATE TABLE lobster_pk (
  id            SERIAL PRIMARY KEY,
  pk_code       VARCHAR(6) UNIQUE NOT NULL,      -- 6位PK码
  creator_id    INT REFERENCES lobster_users(id),
  challenger_id INT REFERENCES lobster_users(id), -- 匹配后填入
  status        VARCHAR(10) DEFAULT 'waiting',    -- waiting/matched/completed/expired
  -- 创建者快照
  creator_level     INT,
  creator_tokens    BIGINT,
  creator_achievements INT,
  creator_online_days  INT,
  -- 挑战者快照
  challenger_level     INT,
  challenger_tokens    BIGINT,
  challenger_achievements INT,
  challenger_online_days  INT,
  -- 结果
  winner_id     INT REFERENCES lobster_users(id),
  result_detail JSONB,                            -- 详细对比数据
  expires_at    TIMESTAMPTZ NOT NULL,             -- 过期时间（创建后5分钟）
  matched_at    TIMESTAMPTZ,
  completed_at  TIMESTAMPTZ,
  created_at    TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_pk_code ON lobster_pk (pk_code) WHERE status = 'waiting';
CREATE INDEX idx_pk_expire ON lobster_pk (expires_at) WHERE status = 'waiting';
```

### 2.3 同步日志表 `lobster_sync_log`（审计用）

```sql
CREATE TABLE lobster_sync_log (
  id          SERIAL PRIMARY KEY,
  user_id     INT REFERENCES lobster_users(id),
  old_tokens  BIGINT,
  new_tokens  BIGINT,
  old_level   INT,
  new_level   INT,
  ip_hash     VARCHAR(64),                       -- IP的SHA256（不存明文）
  created_at  TIMESTAMPTZ DEFAULT NOW()
);

-- 自动清理30天前的日志
-- CRON: DELETE FROM lobster_sync_log WHERE created_at < NOW() - INTERVAL '30 days';
```

---

## 三、API 设计

### 3.1 认养注册

```
POST /api/v1/register
```

**请求：**
```json
{
  "nickname": "小龙虾爱好者",        // 2-20字符，过滤敏感词
  "device_fingerprint": "sha256...", // 客户端生成的设备指纹
  "proof": {                         // 认养证明（防刷）
    "total_tokens": 50000000,        // 当前总token数（必须>0）
    "level": 2,                      // 当前等级
    "app_version": "1.5.1",          // 客户端版本
    "uptime_hours": 48,              // 累计运行小时数
    "signature": "hmac-sha256..."    // 客户端用内置密钥签名的proof
  },
  "privacy_consent": {
    "agreed": true,
    "version": "1.0"
  }
}
```

**响应：**
```json
{
  "success": true,
  "lobster_id": "LB-000001",
  "token": "jwt...",                 // 后续请求用的认证token
  "message": "恭喜！你的龙虾宝宝编号是 LB-000001"
}
```

**注册条件检查（全部通过才允许）：**
1. ✅ `total_tokens > 0` — 证明真实使用过
2. ✅ `uptime_hours >= 1` — 至少运行1小时
3. ✅ `privacy_consent.agreed === true` — 同意隐私协议
4. ✅ `device_fingerprint` 未被注册过 — 一机一号
5. ✅ `signature` 验证通过 — 防伪造请求
6. ✅ `nickname` 通过敏感词过滤 — 合规
7. ✅ 同一IP 24小时内注册不超过3次 — 防批量注册

### 3.2 数据同步（心跳）

```
POST /api/v1/sync
Authorization: Bearer <jwt>
```

**请求：**
```json
{
  "total_tokens": 200000000,
  "level": 3,
  "achievements": 5,
  "daily_tokens": 30000000,
  "signature": "hmac-sha256..."
}
```

**响应：**
```json
{
  "success": true,
  "online_days": 15,
  "streak_days": 7,
  "rank": 42                         // 当前排名（如果参与排行榜）
}
```

**同步频率：** 每小时一次（客户端定时器），不实时
**防作弊：**
- token数只能增不能减（允许±5%浮动，因为缓存统计可能有误差）
- 单次增长不超过 10B（异常增长拒绝并标记）
- signature 验证

### 3.3 排行榜

```
GET /api/v1/leaderboard?type=tokens&page=1&limit=20
Authorization: Bearer <jwt>  (可选，有token时返回自己的排名)
```

**响应：**
```json
{
  "type": "tokens",
  "total": 156,
  "page": 1,
  "items": [
    {
      "rank": 1,
      "lobster_id": "LB-000003",
      "nickname": "Token大户",
      "level": 8,
      "total_tokens": 12000000000,
      "online_days": 90,
      "streak_days": 45
    }
  ],
  "my_rank": 42                      // 仅登录用户可见
}
```

**排行榜类型：**
- `tokens` — 总token数排行（默认）
- `level` — 等级排行
- `streak` — 连续在线天数排行
- `achievements` — 成就数排行

**缓存策略：** Redis 缓存排行榜数据，每10分钟刷新一次

### 3.4 PK 对战

**创建PK：**
```
POST /api/v1/pk/create
Authorization: Bearer <jwt>
```

**响应：**
```json
{
  "pk_code": "A3X9K2",
  "expires_at": "2026-03-13T13:00:00Z",
  "expires_in": 300
}
```

**加入PK：**
```
POST /api/v1/pk/join
Authorization: Bearer <jwt>
Body: { "pk_code": "A3X9K2" }
```

**响应：**
```json
{
  "matched": true,
  "result": {
    "creator": {
      "lobster_id": "LB-000001",
      "nickname": "小龙虾",
      "level": 5,
      "tokens": 1200000000,
      "achievements": 8,
      "online_days": 30,
      "score": 72
    },
    "challenger": {
      "lobster_id": "LB-000042",
      "nickname": "大龙虾",
      "level": 7,
      "tokens": 6000000000,
      "achievements": 12,
      "online_days": 60,
      "score": 91
    },
    "winner": "challenger",
    "score_breakdown": {
      "level":        { "creator": 15, "challenger": 25, "max": 30 },
      "tokens":       { "creator": 25, "challenger": 30, "max": 30 },
      "achievements": { "creator": 16, "challenger": 20, "max": 20 },
      "online_days":  { "creator": 16, "challenger": 16, "max": 20 }
    }
  }
}
```

**PK 评分规则（总分100）：**
| 维度 | 满分 | 计算方式 |
|------|------|---------|
| 等级 | 30分 | `level / 10 * 30` |
| Token数 | 30分 | `min(tokens / 50B, 1) * 30` |
| 成就数 | 20分 | `min(achievements / 15, 1) * 20` |
| 在线天数 | 20分 | `min(online_days / 365, 1) * 20` |

### 3.5 个人资料

```
GET /api/v1/profile
Authorization: Bearer <jwt>
```

```
PATCH /api/v1/profile
Authorization: Bearer <jwt>
Body: { "nickname": "新昵称", "show_on_leaderboard": true }
```

---

## 四、客户端改造

### 4.1 设备指纹生成

```typescript
// 基于不可变硬件信息生成，不含隐私数据
function generateDeviceFingerprint(): string {
  const os = require('os');
  const crypto = require('crypto');
  
  const raw = [
    os.hostname(),           // 机器名
    os.cpus()[0]?.model,     // CPU型号
    os.totalmem(),           // 总内存
    os.platform(),           // 操作系统
    os.arch(),               // 架构
  ].join('|');
  
  // SHA256 不可逆，服务端无法还原原始信息
  return crypto.createHash('sha256').update(raw).digest('hex');
}
```

### 4.2 新增 UI 面板

**设置面板扩展（StatusPanel.tsx）：**
```
┌─────────────────────────┐
│ 🦞 龙虾宝宝 Lv.5       │
│ LB-000042 · 小龙虾      │  ← 注册后显示编号
│ ─────────────────────── │
│ 📊 排行榜    [开关]     │  ← 参与排行榜开关
│ 🏆 我的排名: #42        │
│ ─────────────────────── │
│ ⚔️ PK 对战              │
│ [生成PK码] [输入PK码]   │
│ ─────────────────────── │
│ 📈 Token趋势            │
│ 🏅 成就列表             │
└─────────────────────────┘
```

**排行榜面板（新建 Leaderboard.tsx）：**
```
┌─────────────────────────────┐
│ 🏆 排行榜          [切换▼] │
│ ─────────────────────────── │
│ 🥇 LB-000003 Token大户  L8 │
│    12.00B tokens · 90天     │
│ 🥈 LB-000007 虾王     L7   │
│    8.50B tokens · 75天      │
│ 🥉 LB-000001 小龙虾   L5   │
│    1.20B tokens · 30天      │
│ ─────────────────────────── │
│ 📍 你的排名: #42           │
└─────────────────────────────┘
```

**PK 对战面板（新建 PKBattle.tsx）：**
```
┌─────────────────────────────┐
│ ⚔️ 龙虾PK                  │
│                             │
│ [生成PK码]  或  [输入PK码]  │
│                             │
│ ── 匹配成功后 ──           │
│                             │
│  🦞 小龙虾    VS   大龙虾 🦞│
│  Lv.5              Lv.7    │
│  1.2B              6.0B    │
│  8成就              12成就  │
│  30天               60天   │
│  ─────────────────────     │
│  总分: 72    VS    91      │
│                             │
│       🎉 大龙虾 获胜！      │
└─────────────────────────────┘
```

**注册弹窗（新建 RegisterModal.tsx）：**
```
┌─────────────────────────────┐
│ 🦞 认养你的龙虾宝宝         │
│                             │
│ 给你的龙虾起个名字：        │
│ ┌─────────────────────┐    │
│ │ 小龙虾爱好者         │    │
│ └─────────────────────┘    │
│                             │
│ ☑ 我已阅读并同意《隐私协议》│
│                             │
│ 上传数据说明：              │
│ ✅ 昵称、等级、token数      │
│ ✅ 匿名设备标识（不可逆）   │
│ ❌ 不会上传：IP地址、文件   │
│    路径、个人信息、对话内容  │
│                             │
│      [认养并注册]           │
└─────────────────────────────┘
```

### 4.3 隐私协议内容要点

```
《龙虾宝宝隐私协议》v1.0

1. 我们收集什么：
   - 你设置的昵称
   - 龙虾等级和token统计数据
   - 匿名设备标识（SHA256哈希，无法还原）
   - 成就解锁数量

2. 我们不收集：
   - 你的真实姓名、邮箱、手机号
   - 你的IP地址（仅用于频率限制，不存储明文）
   - 你的文件、代码、对话内容
   - 你的OpenClaw配置或API密钥

3. 数据用途：
   - 生成龙虾编号
   - 排行榜展示（可随时关闭）
   - 好友PK对比

4. 数据删除：
   - 你可以随时在设置中注销账号
   - 注销后所有数据在7天内永久删除

5. 数据安全：
   - 所有通信使用HTTPS加密
   - 设备标识使用SHA256不可逆哈希
   - 服务器不存储任何可识别个人身份的信息
```

### 4.4 新增 electronAPI 接口

```typescript
// preload.ts 新增
socialRegister: (nickname: string) => Promise<RegisterResult>;
socialSync: () => Promise<SyncResult>;
socialGetLeaderboard: (type: string, page: number) => Promise<LeaderboardResult>;
socialCreatePK: () => Promise<PKCreateResult>;
socialJoinPK: (code: string) => Promise<PKJoinResult>;
socialGetProfile: () => Promise<ProfileResult>;
socialUpdateProfile: (data: Partial<Profile>) => Promise<void>;
socialDeleteAccount: () => Promise<void>;
```

---

## 五、安全机制

### 5.1 防刷/防作弊

| 威胁 | 防御措施 |
|------|---------|
| 批量注册 | 设备指纹唯一 + IP频率限制(3次/24h) |
| 伪造token数 | HMAC签名验证 + 增长速率检查 |
| 重放攻击 | JWT含时间戳 + nonce |
| 暴力猜PK码 | 6位字母数字(36^6=2.1B组合) + 5次/分钟限制 |
| 刷排行榜 | token数只增不减 + 异常增长标记 |
| 中间人攻击 | HTTPS + 证书固定(可选) |

### 5.2 签名机制

```typescript
// 客户端内置密钥（混淆存储）
const PROOF_SECRET = 'lobster-baby-proof-v1-xxxx';

function signProof(data: object): string {
  const payload = JSON.stringify(data) + Date.now().toString();
  return crypto.createHmac('sha256', PROOF_SECRET)
    .update(payload)
    .digest('hex');
}
```

### 5.3 JWT 认证

```
Header: { "alg": "HS256" }
Payload: {
  "sub": "LB-000042",
  "uid": 42,
  "device": "sha256...",
  "iat": 1773580800,
  "exp": 1776172800  // 30天有效期
}
```

---

## 六、监测机制

### 6.1 客户端监测

```typescript
// 注册前检查清单
async function canRegister(): Promise<{ ok: boolean; reason?: string }> {
  // 1. OpenClaw 是否在运行
  const status = await checkOpenClawStatus();
  if (status === 'error') return { ok: false, reason: 'OpenClaw 未运行' };
  
  // 2. 是否有真实token数据
  const { totalTokens } = await window.electronAPI.getLevelData();
  if (totalTokens <= 0) return { ok: false, reason: '还没有使用记录，先用一会儿再来注册吧' };
  
  // 3. 运行时长检查
  const uptime = getAppUptime();
  if (uptime < 3600) return { ok: false, reason: '至少运行1小时后才能注册' };
  
  // 4. 是否已注册
  const profile = await getLocalProfile();
  if (profile?.lobsterId) return { ok: false, reason: '已经注册过了' };
  
  return { ok: true };
}
```

### 6.2 服务端监测

```typescript
// 异常检测中间件
function anomalyDetection(req, res, next) {
  const { total_tokens, level } = req.body;
  const user = req.user;
  
  // 1. token数暴增检测（单次同步增长超过10B）
  if (user.total_tokens > 0 && total_tokens - user.total_tokens > 10_000_000_000) {
    log.warn(`Anomaly: ${user.lobster_id} tokens jumped ${total_tokens - user.total_tokens}`);
    return res.status(400).json({ error: 'token数据异常' });
  }
  
  // 2. token数倒退检测（允许5%浮动）
  if (total_tokens < user.total_tokens * 0.95) {
    log.warn(`Anomaly: ${user.lobster_id} tokens decreased`);
    // 不拒绝，但不更新token数
    req.skipTokenUpdate = true;
  }
  
  // 3. 等级与token不匹配
  const expectedLevel = calculateExpectedLevel(total_tokens);
  if (Math.abs(level - expectedLevel) > 1) {
    log.warn(`Anomaly: ${user.lobster_id} level mismatch`);
  }
  
  next();
}
```

### 6.3 运维监控

- PM2 进程监控 + 自动重启
- PostgreSQL 连接池监控
- API 响应时间 P99 < 200ms
- 每日自动清理过期PK码
- 每月自动清理30天前的同步日志

---

## 七、实施计划

### Phase 1: 后端基础（Day 1）
- [ ] 创建数据库表
- [ ] 搭建 Express API 服务器
- [ ] 实现注册 + JWT认证
- [ ] 实现数据同步接口
- [ ] Nginx 反代 + HTTPS
- [ ] PM2 部署

### Phase 2: 客户端注册（Day 2）
- [ ] 设备指纹生成
- [ ] 注册弹窗 UI（RegisterModal）
- [ ] 隐私协议展示
- [ ] preload 新增 API
- [ ] 本地存储 JWT + lobster_id
- [ ] 自动同步定时器（每小时）

### Phase 3: 排行榜（Day 3）
- [ ] 排行榜 API（4种排行）
- [ ] 排行榜面板 UI（Leaderboard）
- [ ] 设置面板加排行榜开关
- [ ] Redis 缓存

### Phase 4: PK 对战（Day 4）
- [ ] PK 创建/加入 API
- [ ] PK 面板 UI（PKBattle）
- [ ] 评分算法
- [ ] 胜负动画
- [ ] 过期自动清理

### Phase 5: 打磨 + 发布（Day 5）
- [ ] 全面测试
- [ ] 边界情况处理
- [ ] 错误提示优化
- [ ] v2.0.0 发布

---

## 八、文件结构预览

```
lobster-baby/
├── src/
│   ├── components/
│   │   ├── RegisterModal.tsx      # 新：注册弹窗
│   │   ├── RegisterModal.css
│   │   ├── Leaderboard.tsx        # 新：排行榜面板
│   │   ├── Leaderboard.css
│   │   ├── PKBattle.tsx           # 新：PK对战面板
│   │   ├── PKBattle.css
│   │   ├── PrivacyPolicy.tsx      # 新：隐私协议展示
│   │   └── ... (现有组件)
│   ├── hooks/
│   │   ├── useSocial.ts           # 新：社交功能hook
│   │   └── ... (现有hooks)
│   ├── utils/
│   │   ├── social-api.ts          # 新：API调用封装
│   │   └── ... (现有utils)
│   └── types/
│       └── index.ts               # 扩展：社交相关类型
├── electron/
│   ├── main.ts                    # 扩展：社交API代理
│   ├── preload.ts                 # 扩展：新增IPC接口
│   └── social.ts                  # 新：社交功能主进程逻辑
└── server/                        # 新：后端服务（独立部署）
    ├── package.json
    ├── server.js                  # Express 入口
    ├── routes/
    │   ├── register.js
    │   ├── sync.js
    │   ├── leaderboard.js
    │   ├── pk.js
    │   └── profile.js
    ├── middleware/
    │   ├── auth.js                # JWT验证
    │   ├── rateLimit.js           # 频率限制
    │   └── anomaly.js             # 异常检测
    ├── db/
    │   ├── init.sql               # 建表SQL
    │   └── pool.js                # PG连接池
    └── ecosystem.config.js        # PM2配置
```

---

## 九、成本评估

| 项目 | 成本 |
|------|------|
| 服务器 | 0（复用新服务器 8.138.104.108） |
| 数据库 | 0（复用已有 PostgreSQL 16） |
| 域名/SSL | 0（可用服务器IP + Let's Encrypt） |
| Redis | 0（复用已有 Redis 7） |
| 带宽 | 极低（每用户每小时1次同步，<1KB/次） |

**总成本：0元**（全部复用现有基础设施）
