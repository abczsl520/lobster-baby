import { BrowserWindow } from 'electron';
import { exec } from 'child_process';
import { log } from './logger';
import { readStore, writeStore } from './store';
import { scanRealTokenUsage } from './scanner';

let isCheckingStatus = false;
let lastStatusPayload = '';
let statusCheckInterval: NodeJS.Timeout | null = null;
let consecutiveFailures = 0;

let _openclawPath: string | null = null;
let _mainWindow: (() => BrowserWindow | null) | null = null;

export function initStatus(openclawPath: string | null, mainWindowGetter: () => BrowserWindow | null) {
  _openclawPath = openclawPath;
  _mainWindow = mainWindowGetter;
}

function getWin(): BrowserWindow | null {
  return _mainWindow ? _mainWindow() : null;
}

export function checkOpenClawStatus() {
  const win = getWin();
  if (!win || win.isDestroyed() || isCheckingStatus) return;

  if (!_openclawPath) {
    try {
      win.webContents.send('openclaw-status', {
        status: 'error', activeSessions: 0, tokenInfo: { daily: 0, total: 0 },
      });
    } catch { /* ignore */ }
    return;
  }

  isCheckingStatus = true;

  const isWin = process.platform === 'win32';
  const env = {
    ...process.env,
    ...(isWin ? {} : { PATH: `/opt/homebrew/bin:/usr/local/bin:${process.env.PATH || '/usr/bin:/bin:/usr/sbin:/sbin'}` }),
  };
  const suppress = isWin ? '2>NUL' : '2>/dev/null';

  // Normal: --log-level silent for clean JSON
  // After 3 consecutive failures: run once without silent to capture diagnostics
  const useSilent = consecutiveFailures < 3;
  const logLevel = useSilent ? '--log-level silent ' : '';

  Promise.all([
    new Promise<{ status: string; activeSessions: number }>((resolve) => {
      const cmd = isWin
        ? `"${_openclawPath}" ${logLevel}sessions --json --active 1 ${suppress}`
        : `${_openclawPath} ${logLevel}sessions --json --active 1 ${suppress}`;
      exec(cmd, { timeout: 8000, env, shell: isWin ? 'cmd.exe' : '/bin/sh' }, (error, stdout) => {
        let status: 'active' | 'idle' | 'error' = 'error';
        let activeSessions = 0;

        if (stdout) {
          // Try parsing stdout as JSON; if polluted, extract JSON block
          let jsonStr = stdout.trim();
          try {
            const data = JSON.parse(jsonStr);
            const sessions = data.sessions || [];
            activeSessions = sessions.length;
            const hasRecentActivity = sessions.some((s: any) => s.ageMs < 60000);
            status = hasRecentActivity ? 'active' : 'idle';
            consecutiveFailures = 0;
            log(`OpenClaw status: ${status}, sessions: ${activeSessions}`);
          } catch {
            // Fallback: extract JSON block from polluted output (diagnostic mode)
            const start = jsonStr.indexOf('{');
            const end = jsonStr.lastIndexOf('}');
            if (start >= 0 && end > start) {
              try {
                const data = JSON.parse(jsonStr.slice(start, end + 1));
                const sessions = data.sessions || [];
                activeSessions = sessions.length;
                const hasRecentActivity = sessions.some((s: any) => s.ageMs < 60000);
                status = hasRecentActivity ? 'active' : 'idle';
                consecutiveFailures = 0;
                log(`OpenClaw status: ${status}, sessions: ${activeSessions} (extracted)`);
              } catch (e2) {
                consecutiveFailures++;
                log(`Failed to parse OpenClaw output (attempt ${consecutiveFailures}): ${e2}`);
                if (!useSilent) {
                  // This was the diagnostic run — log full output for debugging
                  log(`Diagnostic stdout: ${stdout.slice(0, 500)}`);
                  consecutiveFailures = 0; // Reset to go back to silent mode
                }
              }
            } else {
              consecutiveFailures++;
              if (!useSilent) {
                log(`Diagnostic stdout (no JSON found): ${stdout.slice(0, 500)}`);
                consecutiveFailures = 0;
              }
            }
          }
        } else if (error) {
          consecutiveFailures++;
          log(`OpenClaw command error: ${error.message}`);
          if (!useSilent) {
            consecutiveFailures = 0;
          }
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
        w.webContents.send('openclaw-status', {
          status, activeSessions, tokenInfo: { daily: dailyTokens, total: totalTokens },
        });
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
