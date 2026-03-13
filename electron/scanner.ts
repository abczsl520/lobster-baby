import path from 'path';
import fs from 'fs';
import os from 'os';
import { log } from './logger';
import { readStore, writeStore } from './store';

export function findOpenClaw(): string | null {
  const home = os.homedir();
  const possiblePaths = [
    '/opt/homebrew/bin/openclaw',
    '/usr/local/bin/openclaw',
    path.join(home, '.local/bin/openclaw'),
    path.join(home, 'AppData/Roaming/npm/openclaw.cmd'),
    path.join(home, 'AppData/Roaming/npm/openclaw'),
    'openclaw',
  ];

  for (const p of possiblePaths) {
    try {
      if (p === 'openclaw') return 'openclaw';
      if (fs.existsSync(p)) {
        log(`Found openclaw at: ${p}`);
        return p;
      }
    } catch { /* ignore */ }
  }

  log('OpenClaw not found in any known location');
  return null;
}

export function findOpenClawSessionDir(): string | null {
  const home = os.homedir();
  const candidates = [
    path.join(home, '.openclaw/agents/main/sessions'),
    path.join(home, '.config/openclaw/agents/main/sessions'),
    path.join(home, 'AppData/Local/openclaw/agents/main/sessions'),
  ];
  for (const dir of candidates) {
    try {
      if (fs.existsSync(dir) && fs.statSync(dir).isDirectory()) return dir;
    } catch { /* ignore */ }
  }
  return null;
}

// Incremental scan state
let scanTotal = 0;
let scanFileCache: Map<string, { mtime: number; tokens: number }> = new Map();
let lastScanTime = 0;
const SCAN_CACHE_MS = 30_000;
let scanInitialized = false;

export function scanRealTokenUsage(): number {
  const now = Date.now();
  if (now - lastScanTime < SCAN_CACHE_MS && scanInitialized) {
    return scanTotal;
  }

  const sessionDir = findOpenClawSessionDir();
  if (!sessionDir) {
    log('Session dir not found, falling back to store');
    return scanTotal || 0;
  }

  try {
    const files = fs.readdirSync(sessionDir).filter(f => f.endsWith('.jsonl'));

    for (const [cachedFile] of scanFileCache) {
      if (!files.includes(cachedFile)) {
        const entry = scanFileCache.get(cachedFile)!;
        scanTotal -= entry.tokens;
        scanFileCache.delete(cachedFile);
      }
    }

    for (const file of files) {
      const fullPath = path.join(sessionDir, file);
      let mtime: number;
      try {
        mtime = fs.statSync(fullPath).mtimeMs;
      } catch { continue; }

      const cached = scanFileCache.get(file);
      if (cached && cached.mtime === mtime) continue;

      let fileTokens = 0;
      try {
        const content = fs.readFileSync(fullPath, 'utf-8');
        for (const line of content.split('\n')) {
          if (!line.includes('"usage"')) continue;
          try {
            const obj = JSON.parse(line);
            const usage = obj?.message?.usage;
            if (usage) {
              fileTokens += (usage.input || 0)
                + (usage.output || 0)
                + (usage.cacheRead || 0)
                + (usage.cacheWrite || 0);
            }
          } catch { /* skip malformed lines */ }
        }
      } catch { continue; }

      if (cached) {
        scanTotal -= cached.tokens;
      }
      scanTotal += fileTokens;
      scanFileCache.set(file, { mtime, tokens: fileTokens });
    }
  } catch (e) {
    log(`Token scan error: ${e}`);
    return scanTotal || 0;
  }

  lastScanTime = now;
  scanInitialized = true;

  trackDailyTokens(scanTotal);

  log(`Token scan: ${scanTotal.toLocaleString()} total API tokens (${scanFileCache.size} files)`);
  return scanTotal;
}

function trackDailyTokens(currentTotal: number) {
  const store = readStore();
  const today = new Date().toISOString().split('T')[0];

  if (!store.dailyTokens) store.dailyTokens = {};
  if (!store.lastTotalTokens) {
    store.lastTotalTokens = currentTotal;
    writeStore(store);
    return;
  }

  const delta = currentTotal - store.lastTotalTokens;
  if (delta > 0) {
    store.dailyTokens[today] = (store.dailyTokens[today] || 0) + delta;
    store.lastTotalTokens = currentTotal;

    const dates = Object.keys(store.dailyTokens).sort();
    if (dates.length > 30) {
      for (let i = 0; i < dates.length - 30; i++) {
        delete store.dailyTokens[dates[i]];
      }
    }

    writeStore(store);
  }
}
