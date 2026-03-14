import { BrowserWindow } from 'electron';
import fs from 'fs';
import path from 'path';
import { log } from './logger';
import { readStore, writeStore } from './store';
import { scanRealTokenUsage, findOpenClawSessionDir } from './scanner';

let isCheckingStatus = false;
let lastStatusPayload = '';
let statusCheckInterval: NodeJS.Timeout | null = null;
let _mainWindow: (() => BrowserWindow | null) | null = null;

export function initStatus(_openclawPath: string | null, mainWindowGetter: () => BrowserWindow | null) {
  _mainWindow = mainWindowGetter;
}

function getWin(): BrowserWindow | null {
  return _mainWindow ? _mainWindow() : null;
}

/**
 * Read sessions.json directly — no subprocess, no stdout pollution.
 * Returns { status, activeSessions }.
 */
function readSessionStatus(): { status: 'active' | 'idle' | 'error'; activeSessions: number } {
  const sessionDir = findOpenClawSessionDir();
  if (!sessionDir) return { status: 'error', activeSessions: 0 };

  // sessions.json is in the parent of the sessions dir, or same dir
  // Try both: sessionDir/sessions.json and parentDir/sessions.json
  const candidates = [
    path.join(sessionDir, 'sessions.json'),
    path.join(path.dirname(sessionDir), 'sessions.json'),
  ];

  for (const filePath of candidates) {
    try {
      if (!fs.existsSync(filePath)) continue;

      const raw = fs.readFileSync(filePath, 'utf-8');
      const data = JSON.parse(raw);
      const now = Date.now();
      let activeSessions = 0;
      let hasRecentActivity = false;

      for (const [key, session] of Object.entries(data)) {
        if (typeof session !== 'object' || session === null) continue;
        const s = session as Record<string, any>;
        const updatedAt = s.updatedAt || 0;
        const ageMs = now - updatedAt;

        // Count sessions active in last 5 minutes
        if (ageMs < 300_000) {
          activeSessions++;
          // Activity in last 60 seconds = "active"
          if (ageMs < 60_000) {
            hasRecentActivity = true;
          }
        }
      }

      const status = hasRecentActivity ? 'active' : (activeSessions > 0 ? 'idle' : 'idle');
      log(`OpenClaw status: ${status}, sessions: ${activeSessions} (from file)`);
      return { status, activeSessions };
    } catch (e) {
      log(`Failed to read sessions.json at ${filePath}: ${e}`);
    }
  }

  return { status: 'error', activeSessions: 0 };
}

export function checkOpenClawStatus() {
  const win = getWin();
  if (!win || win.isDestroyed() || isCheckingStatus) return;

  isCheckingStatus = true;

  try {
    const { status, activeSessions } = readSessionStatus();
    const realTokens = scanRealTokenUsage();

    const store = readStore();
    const today = new Date().toISOString().slice(0, 10);
    const totalTokens = realTokens;

    if (store.lastDate !== today) {
      store.dailyTokensBaseline = totalTokens;
      store.lastDate = today;
    }
    if (!store.dailyTokensBaseline) store.dailyTokensBaseline = totalTokens;

    const dailyTokens = Math.max(0, totalTokens - (store.dailyTokensBaseline || 0));

    const newPayload = JSON.stringify({ status, totalTokens, dailyTokens });
    if (newPayload !== lastStatusPayload) {
      lastStatusPayload = newPayload;
      store.totalTokens = totalTokens;
      writeStore(store);
    }

    try {
      win.webContents.send('openclaw-status', {
        status, activeSessions, tokenInfo: { daily: dailyTokens, total: totalTokens },
      });
    } catch { /* window might be closing */ }
  } catch (err) {
    log(`Status check error: ${err}`);
  } finally {
    isCheckingStatus = false;
  }
}

export function startStatusCheck() {
  checkOpenClawStatus();
  statusCheckInterval = setInterval(checkOpenClawStatus, 5000);
}

export function stopStatusCheck() {
  if (statusCheckInterval) { clearInterval(statusCheckInterval); statusCheckInterval = null; }
}
