import { BrowserWindow } from 'electron';
import { exec } from 'child_process';
import { log } from './logger';
import { scanRealTokenUsage, getTodayTokens } from './scanner';
import { readStore, writeStore } from './store';
import { updateTrayTooltip } from './tray';

let isCheckingStatus = false;
let lastStatusPayload = '';
let statusCheckInterval: NodeJS.Timeout | null = null;

let _openclawPath: string | null = null;
let _mainWindow: (() => BrowserWindow | null) | null = null;

export function initStatus(openclawPath: string | null, mainWindowGetter: () => BrowserWindow | null) {
  _openclawPath = openclawPath;
  _mainWindow = mainWindowGetter;
}

function getWin(): BrowserWindow | null {
  return _mainWindow ? _mainWindow() : null;
}

// Broadcast to all windows (main + panel)
function broadcastStatus(channel: string, data: Record<string, unknown>) {
  for (const win of BrowserWindow.getAllWindows()) {
    if (!win.isDestroyed()) {
      try { win.webContents.send(channel, data); } catch { /* closing */ }
    }
  }
}

export function checkOpenClawStatus() {
  const win = getWin();
  if (!win || win.isDestroyed() || isCheckingStatus) return;

  if (!_openclawPath) {
    broadcastStatus('openclaw-status', {
      status: 'error', activeSessions: 0, tokenInfo: { daily: 0, total: 0 },
    });
    return;
  }

  isCheckingStatus = true;

  const isWin = process.platform === 'win32';
  const env = {
    ...process.env,
    ...(isWin ? {} : { PATH: `/opt/homebrew/bin:/usr/local/bin:${process.env.PATH || '/usr/bin:/bin:/usr/sbin:/sbin'}` }),
  };
  const suppress = isWin ? '2>NUL' : '2>/dev/null';

  Promise.all([
    new Promise<{ status: string; activeSessions: number }>((resolve) => {
      const cmd = isWin
        ? `"${_openclawPath}" --log-level silent sessions --json --active 1 ${suppress}`
        : `${_openclawPath} --log-level silent sessions --json --active 1 ${suppress}`;
      exec(cmd, { timeout: 8000, env, shell: isWin ? 'cmd.exe' : '/bin/sh' }, (error, stdout) => {
        let status: 'active' | 'idle' | 'error' = 'error';
        let activeSessions = 0;

        if (!error && stdout) {
          try {
            const data = JSON.parse(stdout);
            const sessions = data.sessions || [];
            activeSessions = sessions.length;
            const hasRecentActivity = sessions.some((s: { ageMs: number }) => s.ageMs < 60000);
            status = hasRecentActivity ? 'active' : 'idle';
            log(`OpenClaw status: ${status}, sessions: ${activeSessions}`);
          } catch (e) {
            log(`Failed to parse OpenClaw output: ${e}`);
          }
        } else if (error) {
          log(`OpenClaw check failed: ${error.message}`);
        }

        resolve({ status, activeSessions });
      });
    }),
    new Promise<number>((resolve) => {
      try { resolve(scanRealTokenUsage()); }
      catch { resolve(0); }
    }),
  ])
    .then(([{ status, activeSessions }, realTokens]) => {
      const w = getWin();
      if (!w || w.isDestroyed()) return;

      const totalTokens = realTokens;
      const dailyTokens = getTodayTokens();

      // Track streak
      const today = new Date().toISOString().slice(0, 10);
      const store = readStore();
      if (store.lastActiveDate !== today && (status === 'active' || status === 'idle')) {
        const yesterday = new Date(Date.now() - 86400000).toISOString().slice(0, 10);
        if (store.lastActiveDate === yesterday) {
          store.streakDays = (store.streakDays || 1) + 1;
        } else if (store.lastActiveDate !== today) {
          store.streakDays = 1;
        }
        store.onlineDays = (store.onlineDays || 0) + 1;
        store.lastActiveDate = today;
        writeStore(store);
        log(`Streak: ${store.streakDays} days, total online: ${store.onlineDays}`);
      }

      const newPayload = JSON.stringify({ status, totalTokens, dailyTokens });
      if (newPayload !== lastStatusPayload) {
        lastStatusPayload = newPayload;
      }

      try {
        broadcastStatus('openclaw-status', {
          status, activeSessions, tokenInfo: { daily: dailyTokens, total: totalTokens },
        });
        updateTrayTooltip(status, totalTokens);
      } catch { /* window might be closing */ }
    })
    .catch((err) => log(`Status check error: ${err}`))
    .finally(() => { isCheckingStatus = false; });
}

export function startStatusCheck() {
  checkOpenClawStatus();
  statusCheckInterval = setInterval(checkOpenClawStatus, 5000);
}

export function stopStatusCheck() {
  if (statusCheckInterval) { clearInterval(statusCheckInterval); statusCheckInterval = null; }
}
