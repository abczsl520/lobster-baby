import { BrowserWindow } from 'electron';
import { exec } from 'child_process';
import { log } from './logger';
import { readStore, writeStore } from './store';
import { scanRealTokenUsage } from './scanner';
import { RemoteStatusProvider, RemoteStatusData } from './remote-status';

let isCheckingStatus = false;
let lastStatusPayload = '';
let statusCheckInterval: NodeJS.Timeout | null = null;

let _openclawPath: string | null = null;
let _mainWindow: (() => BrowserWindow | null) | null = null;

// Remote mode
let remoteProvider: RemoteStatusProvider | null = null;

export function initStatus(openclawPath: string | null, mainWindowGetter: () => BrowserWindow | null) {
  _openclawPath = openclawPath;
  _mainWindow = mainWindowGetter;
}

function getWin(): BrowserWindow | null {
  return _mainWindow ? _mainWindow() : null;
}

// Broadcast to all windows (main + panel)
function broadcastStatus(channel: string, data: any) {
  for (const win of BrowserWindow.getAllWindows()) {
    if (!win.isDestroyed()) {
      try { win.webContents.send(channel, data); } catch { /* closing */ }
    }
  }
}

// ─── Local mode (original) ───
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
            const hasRecentActivity = sessions.some((s: any) => s.ageMs < 60000);
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
        broadcastStatus('openclaw-status', {
          status, activeSessions, tokenInfo: { daily: dailyTokens, total: totalTokens },
        });
      } catch { /* window might be closing */ }
    })
    .catch((err) => log(`Status check error: ${err}`))
    .finally(() => { isCheckingStatus = false; });
}

// ─── Remote mode ───
function startRemoteStatus(socialToken: string) {
  if (remoteProvider) remoteProvider.stop();

  remoteProvider = new RemoteStatusProvider(socialToken);
  remoteProvider.start((data: RemoteStatusData) => {
    broadcastStatus('openclaw-status', {
      status: data.status,
      activeSessions: data.activeSessions,
      tokenInfo: { daily: data.dailyTokens, total: data.totalTokens },
      remote: true,
      offlineReason: data.offlineReason,
      lastHeartbeat: data.lastHeartbeat,
    });
  });

  log('Remote status provider started');
}

function stopRemoteStatus() {
  if (remoteProvider) {
    remoteProvider.stop();
    remoteProvider = null;
  }
}

// ─── Mode-aware start/stop ───
export function startStatusCheck() {
  const store = readStore();
  const mode = store.settings?.statusMode || 'local';

  if (mode === 'remote' && store.socialToken) {
    startRemoteStatus(store.socialToken);
  } else {
    checkOpenClawStatus();
    statusCheckInterval = setInterval(checkOpenClawStatus, 5000);
  }
}

export function stopStatusCheck() {
  if (statusCheckInterval) { clearInterval(statusCheckInterval); statusCheckInterval = null; }
  stopRemoteStatus();
}

// ─── Runtime mode switch ───
export function switchStatusMode(mode: 'local' | 'remote') {
  stopStatusCheck();
  const store = readStore();
  store.settings = { ...store.settings, statusMode: mode };
  writeStore(store);

  if (mode === 'remote' && store.socialToken) {
    startRemoteStatus(store.socialToken);
  } else {
    checkOpenClawStatus();
    statusCheckInterval = setInterval(checkOpenClawStatus, 5000);
  }

  log(`Status mode switched to: ${mode}`);
}

export function getStatusMode(): string {
  return readStore().settings?.statusMode || 'local';
}
