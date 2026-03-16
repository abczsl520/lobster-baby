import path from 'path';
import fs from 'fs';
import os from 'os';
import { execSync } from 'child_process';
import { log } from './logger';
import { readStore, writeStore } from './store';

// ─── OpenClaw Discovery ───

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
      if (fs.existsSync(p)) { log(`Found openclaw at: ${p}`); return p; }
    } catch { /* ignore */ }
  }

  try {
    const cmd = isWin ? 'where openclaw' : 'which openclaw';
    const result = execSync(cmd, { timeout: 3000, encoding: 'utf-8' }).trim().split('\n')[0].trim();
    if (result) { log(`Found openclaw via ${isWin ? 'where' : 'which'}: ${result}`); return result; }
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

// ─── Token Extraction Helper ───

interface UsageLine {
  tokens: number;
  date: string; // YYYY-MM-DD
}

/** Parse a single JSONL line and extract token usage + date */
function parseUsageLine(line: string, fallbackDate: string): UsageLine | null {
  try {
    const obj = JSON.parse(line);
    const usage = obj?.message?.usage;
    if (!usage) return null;
    const tokens = (usage.input || 0) + (usage.output || 0)
      + (usage.cacheRead || 0) + (usage.cacheWrite || 0);
    if (tokens === 0) return null;

    // Prefer message timestamp for accurate daily attribution
    const ts = obj?.timestamp || obj?.message?.created_at || obj?.created_at;
    const date = (ts && typeof ts === 'string' && ts.length >= 10)
      ? ts.slice(0, 10)
      : fallbackDate;
    return { tokens, date };
  } catch { return null; }
}

/** Scan a single file for usage lines (only lines containing "usage") */
function scanFileUsage(filePath: string): { total: number; daily: Record<string, number> } {
  const fallbackDate = fs.statSync(filePath).mtime.toISOString().slice(0, 10);
  const content = fs.readFileSync(filePath, 'utf-8');
  let total = 0;
  const daily: Record<string, number> = {};

  for (const line of content.split('\n')) {
    if (!line.includes('"usage"')) continue;
    const parsed = parseUsageLine(line, fallbackDate);
    if (!parsed) continue;
    total += parsed.tokens;
    daily[parsed.date] = (daily[parsed.date] || 0) + parsed.tokens;
  }
  return { total, daily };
}

// ─── Unified Incremental Cache ───
// One cache serves both total and daily queries — scan each file once.

interface FileCache {
  mtime: number;
  total: number;
  daily: Record<string, number>; // date => tokens for this file
}

let fileCache: Map<string, FileCache> = new Map();
let cachedTotal = 0;
let cachedDaily: Record<string, number> = {};
let lastScanTime = 0;
const SCAN_CACHE_MS = 15_000; // 15s cache for total
let scanInitialized = false;

/** Force-dirty daily cache to rescan on next dailyTokens call */
let lastDailyScanTime = 0;
const DAILY_SCAN_CACHE_MS = 60_000;

/**
 * Core incremental scan — updates fileCache, cachedTotal, cachedDaily.
 * Only re-reads files whose mtime has changed. O(changed files) not O(all files).
 */
function incrementalScan(): void {
  const sessionDir = findOpenClawSessionDir();
  if (!sessionDir) return;

  try {
    const files = fs.readdirSync(sessionDir).filter(f => f.endsWith('.jsonl'));
    const fileSet = new Set(files);

    // Remove deleted files
    for (const [name, entry] of fileCache) {
      if (!fileSet.has(name)) {
        cachedTotal -= entry.total;
        for (const [date, tokens] of Object.entries(entry.daily)) {
          cachedDaily[date] = (cachedDaily[date] || 0) - tokens;
          if (cachedDaily[date] <= 0) delete cachedDaily[date];
        }
        fileCache.delete(name);
      }
    }

    // Scan new/modified files
    for (const file of files) {
      const fullPath = path.join(sessionDir, file);
      let mtime: number;
      try { mtime = fs.statSync(fullPath).mtimeMs; } catch { continue; }

      const cached = fileCache.get(file);
      if (cached && cached.mtime === mtime) continue;

      // Remove old data for this file
      if (cached) {
        cachedTotal -= cached.total;
        for (const [date, tokens] of Object.entries(cached.daily)) {
          cachedDaily[date] = (cachedDaily[date] || 0) - tokens;
          if (cachedDaily[date] <= 0) delete cachedDaily[date];
        }
      }

      // Scan file
      try {
        const { total, daily } = scanFileUsage(fullPath);
        cachedTotal += total;
        for (const [date, tokens] of Object.entries(daily)) {
          cachedDaily[date] = (cachedDaily[date] || 0) + tokens;
        }
        fileCache.set(file, { mtime, total, daily });
      } catch { continue; }
    }
  } catch (e) {
    log(`Token scan error: ${e}`);
  }

  scanInitialized = true;
}

// ─── Public API ───

/**
 * Get total token usage (incremental, cached 15s).
 */
export function scanRealTokenUsage(): number {
  const now = Date.now();
  if (now - lastScanTime < SCAN_CACHE_MS && scanInitialized) return cachedTotal;

  incrementalScan();
  lastScanTime = now;

  log(`Token scan: ${cachedTotal.toLocaleString()} total (${fileCache.size} files)`);
  return cachedTotal;
}

/**
 * Get per-day token breakdown (timestamp-based, cached 60s).
 * Returns Record<date, tokens> for last N days.
 */
export function scanDailyTokens(days: number = 30): Record<string, number> {
  const now = Date.now();

  // Ensure base data is fresh
  if (now - lastScanTime >= SCAN_CACHE_MS || !scanInitialized) {
    incrementalScan();
    lastScanTime = now;
  }

  // Return cached if recent enough
  if (now - lastDailyScanTime < DAILY_SCAN_CACHE_MS && Object.keys(cachedDaily).length > 0) {
    return filterDays(cachedDaily, days);
  }

  lastDailyScanTime = now;

  // Persist to store for offline access
  const store = readStore();
  store.dailyTokens = cachedDaily;
  writeStore(store);

  const today = new Date().toISOString().slice(0, 10);
  log(`Daily scan: ${Object.keys(cachedDaily).length} days, today=${(cachedDaily[today] || 0).toLocaleString()}`);
  return filterDays(cachedDaily, days);
}

/**
 * Get today's token usage.
 */
export function getTodayTokens(): number {
  // Ensure data is fresh (will use cache if <15s)
  scanRealTokenUsage();
  const today = new Date().toISOString().slice(0, 10);
  return cachedDaily[today] || 0;
}

/** Filter to last N days */
function filterDays(data: Record<string, number>, days: number): Record<string, number> {
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - days);
  const cutoffStr = cutoff.toISOString().slice(0, 10);
  const result: Record<string, number> = {};
  for (const [date, tokens] of Object.entries(data)) {
    if (date >= cutoffStr) result[date] = tokens;
  }
  return result;
}
