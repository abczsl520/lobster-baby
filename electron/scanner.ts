import path from 'path';
import fs from 'fs';
import os from 'os';
import { execSync } from 'child_process';
import { log } from './logger';
import { readStore, writeStore } from './store';

export function findOpenClaw(): string | null {
  const home = os.homedir();
  const isWin = process.platform === 'win32';

  const possiblePaths = isWin ? [
    path.join(home, 'AppData/Roaming/npm/openclaw.cmd'),
    path.join(home, 'AppData/Local/npm/openclaw.cmd'),
    'C:\\nvm4w\\nodejs\\openclaw.cmd',
    'C:\\Program Files\\nodejs\\openclaw.cmd',
  ] : [
    '/opt/homebrew/bin/openclaw',
    '/usr/local/bin/openclaw',
    path.join(home, '.local/bin/openclaw'),
  ];

  for (const p of possiblePaths) {
    try {
      if (fs.existsSync(p)) {
        log(`Found openclaw at: ${p}`);
        return p;
      }
    } catch { /* ignore */ }
  }

  try {
    const cmd = isWin ? 'where openclaw' : 'which openclaw';
    const result = execSync(cmd, { timeout: 3000, encoding: 'utf-8' }).trim().split('\n')[0].trim();
    if (result) {
      log(`Found openclaw via ${isWin ? 'where' : 'which'}: ${result}`);
      return result;
    }
  } catch { /* not in PATH */ }

  log('OpenClaw not found in any known location');
  return null;
}

export function findOpenClawSessionDir(): string | null {
  const home = os.homedir();
  const candidates = [
    path.join(home, '.openclaw/agents/main/sessions'),
    path.join(home, '.config/openclaw/agents/main/sessions'),
    path.join(home, 'AppData/Local/openclaw/agents/main/sessions'),
    path.join(home, 'AppData/Roaming/openclaw/agents/main/sessions'),
    path.join(home, '.openclaw/workspace'),
  ];
  for (const dir of candidates) {
    try {
      if (fs.existsSync(dir) && fs.statSync(dir).isDirectory()) return dir;
    } catch { /* ignore */ }
  }
  return null;
}

// ─── Incremental token scan with per-file cache ───
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

    // Remove deleted files from cache
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
      try { mtime = fs.statSync(fullPath).mtimeMs; } catch { continue; }

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

      if (cached) scanTotal -= cached.tokens;
      scanTotal += fileTokens;
      scanFileCache.set(file, { mtime, tokens: fileTokens });
    }
  } catch (e) {
    log(`Token scan error: ${e}`);
    return scanTotal || 0;
  }

  lastScanTime = now;
  scanInitialized = true;

  log(`Token scan: ${scanTotal.toLocaleString()} total API tokens (${scanFileCache.size} files)`);
  return scanTotal;
}

// ─── Precise daily token calculation (timestamp-based) ───
// Cache: { date => tokens } computed from session files
let dailyTokensCache: Record<string, number> = {};
let lastDailyScanTime = 0;
const DAILY_SCAN_CACHE_MS = 60_000; // Rescan at most once per minute

/**
 * Scan session files and compute per-day token usage based on message timestamps.
 * Returns a Record<date, tokens> for the last N days (default 30).
 * This is the source of truth for the chart — no more delta tracking.
 */
export function scanDailyTokens(days: number = 30): Record<string, number> {
  const now = Date.now();
  if (now - lastDailyScanTime < DAILY_SCAN_CACHE_MS && Object.keys(dailyTokensCache).length > 0) {
    return dailyTokensCache;
  }

  const sessionDir = findOpenClawSessionDir();
  if (!sessionDir) return dailyTokensCache;

  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - days);
  const cutoffStr = cutoff.toISOString().slice(0, 10);

  const result: Record<string, number> = {};

  try {
    const files = fs.readdirSync(sessionDir).filter(f => f.endsWith('.jsonl'));

    for (const file of files) {
      const fullPath = path.join(sessionDir, file);
      
      // Skip files not modified in the last N days (optimization)
      try {
        const mtime = fs.statSync(fullPath).mtime;
        if (mtime.toISOString().slice(0, 10) < cutoffStr) continue;
      } catch { continue; }

      try {
        const content = fs.readFileSync(fullPath, 'utf-8');
        for (const line of content.split('\n')) {
          if (!line.includes('"usage"')) continue;
          try {
            const obj = JSON.parse(line);
            const usage = obj?.message?.usage;
            if (!usage) continue;

            const tokens = (usage.input || 0)
              + (usage.output || 0)
              + (usage.cacheRead || 0)
              + (usage.cacheWrite || 0);
            if (tokens === 0) continue;

            // Extract date from timestamp
            const ts = obj?.timestamp || obj?.message?.created_at || obj?.created_at;
            let date: string;
            if (ts && typeof ts === 'string' && ts.length >= 10) {
              date = ts.slice(0, 10);
            } else {
              // Fallback: use file mtime (less accurate but better than nothing)
              date = fs.statSync(fullPath).mtime.toISOString().slice(0, 10);
            }

            if (date >= cutoffStr) {
              result[date] = (result[date] || 0) + tokens;
            }
          } catch { /* skip */ }
        }
      } catch { /* skip unreadable files */ }
    }
  } catch (e) {
    log(`Daily token scan error: ${e}`);
    return dailyTokensCache;
  }

  dailyTokensCache = result;
  lastDailyScanTime = now;

  // Also persist to store for offline access
  const store = readStore();
  store.dailyTokens = result;
  writeStore(store);

  log(`Daily token scan: ${Object.keys(result).length} days, today=${(result[new Date().toISOString().slice(0, 10)] || 0).toLocaleString()}`);
  return result;
}

/**
 * Get today's token usage (precise, timestamp-based).
 */
export function getTodayTokens(): number {
  const daily = scanDailyTokens(7); // Only need recent days for today
  const today = new Date().toISOString().slice(0, 10);
  return daily[today] || 0;
}
