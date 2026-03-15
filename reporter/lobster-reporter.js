#!/usr/bin/env node
/**
 * 🦞 Lobster Reporter v1.0.0
 * 运行在云服务器上，采集 OpenClaw 状态并上报到龙虾宝宝社交后端
 *
 * 安装: curl -sSL https://lbhub.ai/reporter/install.sh | bash -s -- --token <TOKEN>
 * 手动: node lobster-reporter.js --setup
 * 文档: https://lbhub.ai/docs/reporter
 */

const fs = require('fs');
const os = require('os');
const path = require('path');
const https = require('https');
const http = require('http');
const { execFile } = require('child_process');

const CONFIG_PATH = path.join(os.homedir(), '.lobster-reporter.json');
const DEFAULT_API_BASE = 'https://game.weixin-vip.cn/lobster-social/api/v1';
const INTERVAL_MS = 10_000;
const MAX_BACKOFF = 5 * 60 * 1000; // 5 minutes
const VERSION = '1.0.0';

// ─── Config ───
function loadConfig() {
  if (!fs.existsSync(CONFIG_PATH)) {
    console.error('❌ 未配置。请运行: lobster-reporter --setup');
    process.exit(1);
  }
  let config;
  try {
    config = JSON.parse(fs.readFileSync(CONFIG_PATH, 'utf-8'));
  } catch (e) {
    console.error(`❌ 配置文件格式错误 (${CONFIG_PATH}): ${e.message}`);
    console.error('   请删除后重新配置: rm ~/.lobster-reporter.json && lobster-reporter --setup');
    process.exit(1);
  }
  if (!config.token) {
    console.error('❌ 配置缺少 token。请运行: lobster-reporter --setup');
    process.exit(1);
  }
  config.apiBase = config.apiBase || DEFAULT_API_BASE;
  return config;
}

// ─── OpenClaw sessions detection (async, non-blocking) ───
function getOpenClawSessions() {
  return new Promise((resolve) => {
    // Find openclaw binary
    const candidates = [
      '/usr/local/bin/openclaw',
      '/opt/homebrew/bin/openclaw',
      path.join(os.homedir(), '.npm-global/bin/openclaw'),
      'openclaw', // PATH fallback
    ];

    let binary = null;
    for (const c of candidates) {
      if (c === 'openclaw' || fs.existsSync(c)) { binary = c; break; }
    }
    if (!binary) {
      return resolve([]);
    }

    execFile(binary, ['--log-level', 'silent', 'sessions', '--json', '--active', '1'], {
      timeout: 8000,
      env: { ...process.env, NODE_NO_WARNINGS: '1' },
    }, (err, stdout) => {
      if (err) {
        // openclaw not installed or not running
        return resolve([]);
      }
      try {
        const sessions = JSON.parse(stdout.trim());
        return resolve(Array.isArray(sessions) ? sessions.map(s => ({
          id: s.id || s.key,
          ageMs: s.ageMs || (Date.now() - new Date(s.lastActivity || 0).getTime()),
        })) : []);
      } catch {
        return resolve([]);
      }
    });
  });
}

// ─── Token scanning (incremental, skip >10MB) ───
const tokenCache = { mtime: 0, tokens: 0 };

function scanTokens() {
  // OpenClaw stores token usage in sessions
  const sessionsDir = path.join(os.homedir(), '.openclaw', 'agents', 'main', 'sessions');
  if (!fs.existsSync(sessionsDir)) return 0;

  try {
    const metaFile = path.join(sessionsDir, 'sessions.json');
    if (!fs.existsSync(metaFile)) return 0;

    const stat = fs.statSync(metaFile);
    // Incremental: skip if not modified
    if (stat.mtimeMs === tokenCache.mtime) return tokenCache.tokens;
    // Skip >10MB files
    if (stat.size > 10 * 1024 * 1024) {
      console.warn(`[${ts()}] sessions.json > 10MB (${(stat.size / 1024 / 1024).toFixed(1)}MB), skipping`);
      return tokenCache.tokens;
    }

    const data = JSON.parse(fs.readFileSync(metaFile, 'utf-8'));
    let totalTokens = 0;
    if (Array.isArray(data)) {
      for (const s of data) {
        totalTokens += (s.totalTokens || s.tokens || 0);
      }
    } else if (typeof data === 'object') {
      // Handle both array and object formats
      for (const key of Object.keys(data)) {
        const s = data[key];
        if (s && typeof s === 'object') {
          totalTokens += (s.totalTokens || s.tokens || 0);
        }
      }
    }

    tokenCache.mtime = stat.mtimeMs;
    tokenCache.tokens = totalTokens;
    return totalTokens;
  } catch (err) {
    console.error(`[${ts()}] Token scan error: ${err.message}`);
    return tokenCache.tokens;
  }
}

// ─── HTTP POST heartbeat (with exponential backoff) ───
let backoffMs = 0;

function postHeartbeat(config, payload) {
  const body = JSON.stringify(payload);
  const url = new URL(config.apiBase + '/remote/heartbeat');
  const transport = url.protocol === 'https:' ? https : http;

  const req = transport.request({
    hostname: url.hostname,
    port: url.port || (url.protocol === 'https:' ? 443 : 80),
    path: url.pathname,
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Content-Length': Buffer.byteLength(body),
      'Authorization': `Bearer ${config.token}`,
      'User-Agent': `LobsterReporter/${VERSION}`,
    },
    timeout: 10000,
  }, (res) => {
    let d = '';
    res.on('data', chunk => d += chunk);
    res.on('end', () => {
      if (res.statusCode === 200) {
        backoffMs = 0; // Success, reset backoff
        try {
          const resp = JSON.parse(d);
          if (resp.minVersion && compareVersions(VERSION, resp.minVersion) < 0) {
            console.warn(`[${ts()}] ⚠️ Reporter 版本过低 (${VERSION} < ${resp.minVersion})，请升级: curl -sSL https://lbhub.ai/reporter/install.sh | bash -s -- --upgrade`);
          }
        } catch {}
      } else if (res.statusCode === 401) {
        console.error(`[${ts()}] ❌ Token 无效或已被吊销。请在龙虾宝宝设置里重新生成。`);
        backoffMs = MAX_BACKOFF; // Max backoff for auth errors
      } else if (res.statusCode === 429) {
        backoffMs = Math.min(MAX_BACKOFF, Math.max(10000, backoffMs * 2 || 10000));
        console.warn(`[${ts()}] Rate limited, backing off ${backoffMs / 1000}s`);
      } else if (res.statusCode >= 500) {
        backoffMs = Math.min(MAX_BACKOFF, Math.max(5000, backoffMs * 2 || 5000));
        console.error(`[${ts()}] Server error ${res.statusCode}, backing off ${backoffMs / 1000}s`);
      } else {
        console.error(`[${ts()}] Error ${res.statusCode}: ${d}`);
      }
    });
  });

  req.on('error', (e) => {
    backoffMs = Math.min(MAX_BACKOFF, Math.max(5000, backoffMs * 2 || 5000));
    console.error(`[${ts()}] Network error: ${e.message}, backing off ${backoffMs / 1000}s`);
  });

  req.on('timeout', () => {
    req.destroy();
    backoffMs = Math.min(MAX_BACKOFF, Math.max(5000, backoffMs * 2 || 5000));
    console.error(`[${ts()}] Request timeout, backing off ${backoffMs / 1000}s`);
  });

  req.write(body);
  req.end();
}

// ─── Helpers ───
function ts() { return new Date().toISOString(); }

function compareVersions(a, b) {
  const pa = a.split('.').map(Number), pb = b.split('.').map(Number);
  for (let i = 0; i < 3; i++) {
    if ((pa[i] || 0) < (pb[i] || 0)) return -1;
    if ((pa[i] || 0) > (pb[i] || 0)) return 1;
  }
  return 0;
}

// ─── Main loop (setTimeout chain, not setInterval) ───
function main() {
  const config = loadConfig();
  console.log(`🦞 Lobster Reporter v${VERSION} started`);
  console.log(`   API: ${config.apiBase}`);
  console.log(`   Interval: ${INTERVAL_MS / 1000}s`);
  console.log(`   Config: ${CONFIG_PATH}`);
  console.log(`   PID: ${process.pid}`);

  async function tick() {
    try {
      const sessions = await getOpenClawSessions();
      const tokens = scanTokens();
      const hasRecent = sessions.some(s => s.ageMs < 60000);

      postHeartbeat(config, {
        status: hasRecent ? 'active' : (sessions.length > 0 ? 'idle' : 'offline'),
        activeSessions: sessions.length,
        totalTokens: tokens,
        timestamp: Date.now(),
        reporterVersion: VERSION,
      });
    } catch (err) {
      console.error(`[${ts()}] Tick error: ${err.message}`);
    }

    // L1 fix: setTimeout chain — backoff extends next interval, no log spam
    const nextDelay = backoffMs > 0 ? backoffMs : INTERVAL_MS;
    setTimeout(tick, nextDelay);
  }

  tick();
}

// ─── Setup mode ───
if (process.argv.includes('--setup')) {
  const readline = require('readline');
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });

  console.log('🦞 Lobster Reporter 配置向导\n');

  rl.question('请输入你的 Reporter Token: ', (token) => {
    token = token.trim();
    if (!token) {
      console.error('❌ Token 不能为空');
      process.exit(1);
    }

    const config = { token };

    rl.question(`API 地址 (默认 ${DEFAULT_API_BASE}): `, (apiBase) => {
      apiBase = apiBase.trim();
      if (apiBase) config.apiBase = apiBase;

      fs.writeFileSync(CONFIG_PATH, JSON.stringify(config, null, 2));
      console.log(`\n✅ 配置已保存到 ${CONFIG_PATH}`);
      console.log('\n启动方式:');
      console.log('  直接运行: node lobster-reporter.js');
      console.log('  后台运行: nohup node lobster-reporter.js > ~/lobster-reporter.log 2>&1 &');
      console.log('  systemd:  见 install.sh 自动配置');
      rl.close();
    });
  });
} else if (process.argv.includes('--version') || process.argv.includes('-v')) {
  console.log(`Lobster Reporter v${VERSION}`);
} else if (process.argv.includes('--check')) {
  // Diagnostic mode
  console.log(`🦞 Lobster Reporter v${VERSION} — 诊断模式\n`);
  console.log(`Config: ${fs.existsSync(CONFIG_PATH) ? '✅ ' + CONFIG_PATH : '❌ 未配置'}`);
  (async () => {
    const sessions = await getOpenClawSessions();
    console.log(`OpenClaw: ${sessions.length > 0 ? `✅ ${sessions.length} sessions` : '❌ 无活跃 session'}`);
    const tokens = scanTokens();
    console.log(`Tokens: ${tokens.toLocaleString()}`);
    if (fs.existsSync(CONFIG_PATH)) {
      const config = loadConfig();
      console.log(`API: ${config.apiBase}`);
      console.log('\n尝试发送心跳...');
      postHeartbeat(config, {
        status: 'idle', activeSessions: sessions.length,
        totalTokens: tokens, timestamp: Date.now(), reporterVersion: VERSION,
      });
      setTimeout(() => {
        console.log(backoffMs > 0 ? `❌ 心跳失败 (backoff: ${backoffMs / 1000}s)` : '✅ 心跳成功');
      }, 3000);
    }
  })();
} else {
  main();
}
