import { app, BrowserWindow, ipcMain, screen, Menu, Tray, nativeImage, shell, Notification } from 'electron';
import path from 'path';
import { exec } from 'child_process';
import fs from 'fs';
import https from 'https';

// ─── Logging ───
const logFile = path.join(process.env.HOME || '/tmp', 'lobster-baby-debug.log');
function log(msg: string) {
  const line = `[${new Date().toISOString()}] ${msg}\n`;
  fs.appendFileSync(logFile, line);
}
log('=== Lobster Baby starting ===');

// ─── Find OpenClaw ───
function findOpenClaw(): string | null {
  const possiblePaths = [
    '/opt/homebrew/bin/openclaw',
    '/usr/local/bin/openclaw',
    path.join(process.env.HOME || '', '.local/bin/openclaw'),
    'openclaw', // Try PATH
  ];

  for (const p of possiblePaths) {
    try {
      if (p === 'openclaw') {
        // Will use PATH
        return 'openclaw';
      }
      if (fs.existsSync(p)) {
        log(`Found openclaw at: ${p}`);
        return p;
      }
    } catch { /* ignore */ }
  }

  log('OpenClaw not found in any known location');
  return null;
}

const openclawPath = findOpenClaw();

// ─── Store ───
const storePath = path.join(app.getPath('userData'), 'lobster-data.json');
let storeCache: Record<string, any> | null = null;

function readStore(): Record<string, any> {
  if (storeCache) return storeCache;
  try {
    storeCache = JSON.parse(fs.readFileSync(storePath, 'utf-8'));
    return storeCache!;
  } catch {
    storeCache = {};
    return storeCache;
  }
}

function writeStore(data: Record<string, any>) {
  storeCache = data;
  fs.writeFileSync(storePath, JSON.stringify(data, null, 2));
}

let mainWindow: BrowserWindow | null = null;
let tray: Tray | null = null;
let statusCheckInterval: NodeJS.Timeout | null = null;
let savePositionTimeout: NodeJS.Timeout | null = null;

const SNAP_DISTANCE = 15;
const NORMAL_SIZE = { width: 200, height: 250 };
const PANEL_SIZE = { width: 320, height: 450 };

function createWindow() {
  const { width, height } = screen.getPrimaryDisplay().workAreaSize;
  const store = readStore();

  const savedX = store.windowX ?? (width - 250);
  const savedY = store.windowY ?? (height - 300);

  mainWindow = new BrowserWindow({
    width: NORMAL_SIZE.width,
    height: NORMAL_SIZE.height,
    transparent: true,
    frame: false,
    alwaysOnTop: true,
    resizable: false,
    skipTaskbar: true,
    hasShadow: false,
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
    },
    x: savedX,
    y: savedY,
  });

  if (process.env.VITE_DEV_SERVER_URL) {
    mainWindow.loadURL(process.env.VITE_DEV_SERVER_URL);
  } else {
    mainWindow.loadFile(path.join(__dirname, '../dist/index.html'));
  }

  // Logging
  mainWindow.webContents.on('did-finish-load', () => log('Page loaded successfully'));
  mainWindow.webContents.on('did-fail-load', (_e, code, desc) => log(`Page failed: ${code} ${desc}`));
  mainWindow.webContents.on('render-process-gone', (_e, details) => {
    log(`Renderer crashed: ${JSON.stringify(details)}`);
    if (details.reason !== 'clean-exit') {
      log('Attempting to restart...');
      setTimeout(() => {
        if (mainWindow && !mainWindow.isDestroyed()) {
          mainWindow.reload();
        } else {
          createWindow();
        }
      }, 1000);
    }
  });
  mainWindow.webContents.on('unresponsive', () => log('Renderer became unresponsive'));
  mainWindow.webContents.on('responsive', () => log('Renderer became responsive again'));

  // Save position on move + edge snapping (debounced)
  mainWindow.on('moved', () => {
    if (!mainWindow) return;
    const bounds = mainWindow.getBounds();
    const display = screen.getPrimaryDisplay().workAreaSize;

    let newX = bounds.x;
    let newY = bounds.y;
    let snapped = false;

    if (bounds.x < SNAP_DISTANCE) { newX = 0; snapped = true; }
    if (bounds.y < SNAP_DISTANCE) { newY = 0; snapped = true; }
    if (bounds.x + bounds.width > display.width - SNAP_DISTANCE) {
      newX = display.width - bounds.width; snapped = true;
    }
    if (bounds.y + bounds.height > display.height - SNAP_DISTANCE) {
      newY = display.height - bounds.height; snapped = true;
    }

    if (snapped) {
      mainWindow.setBounds({ x: newX, y: newY, width: bounds.width, height: bounds.height });
    }

    // Debounce position saving
    if (savePositionTimeout) clearTimeout(savePositionTimeout);
    savePositionTimeout = setTimeout(() => {
      const s = readStore();
      s.windowX = snapped ? newX : bounds.x;
      s.windowY = snapped ? newY : bounds.y;
      writeStore(s);
      savePositionTimeout = null;
    }, 500);
  });

  mainWindow.on('closed', () => {
    if (savePositionTimeout) {
      clearTimeout(savePositionTimeout);
      savePositionTimeout = null;
    }
    mainWindow = null;
  });

  // Right-click context menu
  mainWindow.webContents.on('context-menu', () => {
    const isOnTop = mainWindow?.isAlwaysOnTop() ?? true;
    const menu = Menu.buildFromTemplate([
      {
        label: isOnTop ? '📌 取消置顶' : '📌 置顶',
        click: () => mainWindow?.setAlwaysOnTop(!isOnTop),
      },
      { type: 'separator' },
      { label: '🔄 重新加载', click: () => mainWindow?.reload() },
      { label: '❌ 退出龙虾宝宝', click: () => app.quit() },
    ]);
    menu.popup();
  });

  startStatusCheck();
  log('Window created');
  createTray();
}

// ─── FIX #3: Dynamic tray menu ───
function updateTrayMenu() {
  if (!tray) return;
  const isOnTop = mainWindow?.isAlwaysOnTop() ?? true;
  const contextMenu = Menu.buildFromTemplate([
    {
      label: '🦞 显示龙虾宝宝',
      click: () => {
        if (mainWindow) { mainWindow.show(); mainWindow.focus(); }
      },
    },
    {
      label: isOnTop ? '📌 取消置顶' : '📌 置顶',
      click: () => {
        if (mainWindow) {
          mainWindow.setAlwaysOnTop(!isOnTop);
          updateTrayMenu(); // Refresh menu after toggle
        }
      },
    },
    { type: 'separator' },
    { label: '🔄 重新加载', click: () => mainWindow?.reload() },
    { label: '❌ 退出', click: () => app.quit() },
  ]);
  tray.setContextMenu(contextMenu);
}

function createTray() {
  const icon = nativeImage.createFromDataURL(
    'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAABAAAAAQCAYAAAAf8/9hAAAA2ElEQVQ4T2NkoBAwUqifgWoGMDIyNjAyMv5nYGD4T8gFjP///2dgZGRsYGJiagBpxmcIyGBGRsYGJiamBmJcADKYiYmpgZGRsQGfIf8ZGBgbmJiYGhgZGRvwGQIKBiYmpgZGRsYGfIaAgoGJiamBkZGxAZ8h/xkYGBuYmJgaGBkZG/AZAgoGJiamBkZGxgZ8hoCCgYmJqYGRkbEBnyH/GRgYG5iYmBoYGRkb8BkCCgYmJqYGRkbGBnyGgIKBiYmpgZGRsQGfIaBgYGJiamBkZGzAZwgAqFBBEQmNF/IAAAAASUVORK5CYII='
  );

  tray = new Tray(icon);
  tray.setToolTip('龙虾宝宝 🦞');
  updateTrayMenu();

  tray.on('click', () => {
    if (mainWindow) {
      if (mainWindow.isVisible()) {
        mainWindow.hide();
      } else {
        mainWindow.show();
        mainWindow.focus();
      }
    }
  });
}

// ─── OpenClaw Status Detection ───
let isCheckingStatus = false;
let lastStatusPayload = ''; // FIX #5: Only write when data changes

function checkOpenClawStatus() {
  if (!mainWindow || mainWindow.isDestroyed() || isCheckingStatus) return;
  
  // If openclaw not found, report error immediately
  if (!openclawPath) {
    if (mainWindow && !mainWindow.isDestroyed()) {
      try {
        mainWindow.webContents.send('openclaw-status', {
          status: 'error',
          activeSessions: 0,
          tokenInfo: { daily: 0, total: 0 },
        });
      } catch { /* ignore */ }
    }
    return;
  }

  isCheckingStatus = true;

  // Set PATH to include Homebrew bin directories
  const env = {
    ...process.env,
    PATH: `/opt/homebrew/bin:/usr/local/bin:${process.env.PATH || '/usr/bin:/bin:/usr/sbin:/sbin'}`,
  };

  Promise.all([
    new Promise<{ status: string; activeSessions: number }>((resolve) => {
      exec(`${openclawPath} sessions --json --active 1 2>/dev/null`, { timeout: 8000, env }, (error, stdout) => {
        let status: 'active' | 'idle' | 'error' = 'error';
        let activeSessions = 0;

        if (error) {
          log(`OpenClaw command error: ${error.message}`);
        }

        if (!error && stdout) {
          try {
            const data = JSON.parse(stdout);
            const sessions = data.sessions || [];
            activeSessions = sessions.length;

            const hasRecentActivity = sessions.some((s: any) =>
              s.ageMs < 30000 && (s.inputTokens > 0 || s.outputTokens > 0)
            );

            status = hasRecentActivity ? 'active' : 'idle';
            log(`OpenClaw status: ${status}, sessions: ${activeSessions}`);
          } catch (e) {
            log(`Failed to parse OpenClaw output: ${e}`);
            status = 'error';
          }
        }

        resolve({ status, activeSessions });
      });
    }),
    new Promise<number>((resolve) => {
      exec(`${openclawPath} sessions --json 2>/dev/null`, { timeout: 8000, env }, (err, stdout) => {
        let allTokens = 0;
        if (!err && stdout) {
          try {
            const data = JSON.parse(stdout);
            for (const s of (data.sessions || [])) {
              if (s.totalTokens) allTokens += s.totalTokens;
            }
          } catch { /* ignore */ }
        }
        resolve(allTokens);
      });
    }),
  ])
    .then(([{ status, activeSessions }, allTokens]) => {
      if (!mainWindow || mainWindow.isDestroyed()) return;

      const store = readStore();
      const today = new Date().toISOString().slice(0, 10);
      if (store.lastDate !== today) {
        store.dailyTokensBaseline = allTokens;
        store.lastDate = today;
      }
      if (!store.dailyTokensBaseline) store.dailyTokensBaseline = allTokens;

      const dailyTokens = Math.max(0, allTokens - (store.dailyTokensBaseline || 0));

      // FIX #5: Only write store when data actually changes
      const newPayload = JSON.stringify({ status, allTokens, dailyTokens });
      if (newPayload !== lastStatusPayload) {
        lastStatusPayload = newPayload;
        store.totalTokensFromSessions = allTokens;
        writeStore(store);
      }

      try {
        mainWindow.webContents.send('openclaw-status', {
          status,
          activeSessions,
          tokenInfo: { daily: dailyTokens, total: allTokens },
        });
      } catch { /* window might be closing */ }
    })
    .catch((err) => {
      log(`Status check error: ${err}`);
    })
    .finally(() => {
      isCheckingStatus = false;
    });
}

function startStatusCheck() {
  checkOpenClawStatus();
  statusCheckInterval = setInterval(checkOpenClawStatus, 5000);
}

function stopStatusCheck() {
  if (statusCheckInterval) {
    clearInterval(statusCheckInterval);
    statusCheckInterval = null;
  }
}

// ─── IPC Handlers ───
ipcMain.removeAllListeners('move-window');
ipcMain.on('move-window', (event, deltaX: number, deltaY: number) => {
  // FIX #6: Validate IPC parameters
  if (typeof deltaX !== 'number' || typeof deltaY !== 'number') return;
  if (!isFinite(deltaX) || !isFinite(deltaY)) return;
  // Clamp to reasonable range (max 500px per frame)
  const dx = Math.max(-500, Math.min(500, Math.round(deltaX)));
  const dy = Math.max(-500, Math.min(500, Math.round(deltaY)));

  const win = BrowserWindow.fromWebContents(event.sender);
  if (!win || win.isDestroyed()) return;

  const [x, y] = win.getPosition();
  const bounds = win.getBounds();
  const display = screen.getPrimaryDisplay().workAreaSize;

  let newX = x + dx;
  let newY = y + dy;

  // Real-time magnetic snapping (within 30px of edge)
  const MAGNETIC_DISTANCE = 30;
  const SNAP_STRENGTH = 0.3;

  if (newX < MAGNETIC_DISTANCE && newX > -bounds.width / 2) {
    const pull = (MAGNETIC_DISTANCE - newX) / MAGNETIC_DISTANCE;
    newX = Math.round(newX - (newX * pull * SNAP_STRENGTH));
  }
  if (newY < MAGNETIC_DISTANCE && newY > -bounds.height / 2) {
    const pull = (MAGNETIC_DISTANCE - newY) / MAGNETIC_DISTANCE;
    newY = Math.round(newY - (newY * pull * SNAP_STRENGTH));
  }
  const rightDist = display.width - (newX + bounds.width);
  if (rightDist < MAGNETIC_DISTANCE && rightDist > -bounds.width / 2) {
    const pull = (MAGNETIC_DISTANCE - rightDist) / MAGNETIC_DISTANCE;
    newX = Math.round(newX + (rightDist * pull * SNAP_STRENGTH));
  }
  const bottomDist = display.height - (newY + bounds.height);
  if (bottomDist < MAGNETIC_DISTANCE && bottomDist > -bounds.height / 2) {
    const pull = (MAGNETIC_DISTANCE - bottomDist) / MAGNETIC_DISTANCE;
    newY = Math.round(newY + (bottomDist * pull * SNAP_STRENGTH));
  }

  win.setPosition(newX, newY);
});

ipcMain.handle('toggle-always-on-top', () => {
  if (!mainWindow || mainWindow.isDestroyed()) return false;
  const isOnTop = mainWindow.isAlwaysOnTop();
  mainWindow.setAlwaysOnTop(!isOnTop);
  updateTrayMenu(); // FIX #3: Update tray menu after toggle
  return !isOnTop;
});

ipcMain.handle('get-level-data', () => {
  const store = readStore();
  return { totalTokens: store.totalTokensFromSessions || 0 };
});

// FIX #7: Clamp panel position to screen bounds
function clampToScreen(x: number, y: number, w: number, h: number) {
  const display = screen.getPrimaryDisplay().workAreaSize;
  return {
    x: Math.max(0, Math.min(x, display.width - w)),
    y: Math.max(0, Math.min(y, display.height - h)),
    width: w,
    height: h,
  };
}

ipcMain.handle('show-panel', () => {
  if (!mainWindow || mainWindow.isDestroyed()) return;
  const bounds = mainWindow.getBounds();
  const newX = bounds.x - (PANEL_SIZE.width - NORMAL_SIZE.width) / 2;
  const newY = bounds.y - (PANEL_SIZE.height - NORMAL_SIZE.height);
  mainWindow.setBounds(clampToScreen(newX, newY, PANEL_SIZE.width, PANEL_SIZE.height));
});

ipcMain.handle('hide-panel', () => {
  if (!mainWindow || mainWindow.isDestroyed()) return;
  const bounds = mainWindow.getBounds();
  const newX = bounds.x + (PANEL_SIZE.width - NORMAL_SIZE.width) / 2;
  const newY = bounds.y + (PANEL_SIZE.height - NORMAL_SIZE.height);
  mainWindow.setBounds(clampToScreen(newX, newY, NORMAL_SIZE.width, NORMAL_SIZE.height));
});

ipcMain.handle('quit-app', () => app.quit());

ipcMain.handle('open-external', async (_event, url: string) => {
  if (typeof url !== 'string' || !url.startsWith('http')) return;
  await shell.openExternal(url);
});

// ─── Auto Update Check (System Notification) ───
const APP_VERSION = '1.0.0';
let updateCheckInterval: NodeJS.Timeout | null = null;

function fetchJSON(url: string): Promise<any> {
  return new Promise((resolve, reject) => {
    https.get(url, { headers: { 'User-Agent': 'LobsterBaby' } }, (res) => {
      // Follow redirects
      if (res.statusCode === 301 || res.statusCode === 302) {
        return fetchJSON(res.headers.location!).then(resolve).catch(reject);
      }
      let data = '';
      res.on('data', (chunk) => data += chunk);
      res.on('end', () => {
        try { resolve(JSON.parse(data)); }
        catch { reject(new Error('Invalid JSON')); }
      });
    }).on('error', reject);
  });
}

function compareVersions(v1: string, v2: string): number {
  const p1 = v1.split('.').map(Number);
  const p2 = v2.split('.').map(Number);
  for (let i = 0; i < Math.max(p1.length, p2.length); i++) {
    const a = p1[i] || 0, b = p2[i] || 0;
    if (a > b) return 1;
    if (a < b) return -1;
  }
  return 0;
}

async function checkForUpdatesMain() {
  try {
    const data = await fetchJSON('https://api.github.com/repos/abczsl520/lobster-baby/releases/latest');
    const latest = (data.tag_name || '').replace(/^v/, '');
    if (!latest || compareVersions(latest, APP_VERSION) <= 0) return;

    log(`New version available: ${latest} (current: ${APP_VERSION})`);

    // Send to renderer (in-app notification)
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send('update-available', {
        version: latest,
        url: data.html_url,
      });
    }

    // System notification
    if (Notification.isSupported()) {
      const notification = new Notification({
        title: '🦞 Lobster Baby 有新版本！',
        body: `v${latest} 已发布，点击查看更新`,
        silent: false,
      });
      notification.on('click', () => {
        shell.openExternal(data.html_url);
      });
      notification.show();
    }
  } catch (err) {
    log(`Update check failed: ${err}`);
  }
}

function startUpdateCheck() {
  // Check after 10 seconds (let app settle first)
  setTimeout(checkForUpdatesMain, 10000);
  // Then every 6 hours
  updateCheckInterval = setInterval(checkForUpdatesMain, 6 * 60 * 60 * 1000);
}

function stopUpdateCheck() {
  if (updateCheckInterval) {
    clearInterval(updateCheckInterval);
    updateCheckInterval = null;
  }
}

// ─── App Lifecycle ───
app.whenReady().then(() => {
  createWindow();
  startUpdateCheck();
});

if (app.isPackaged) {
  app.setLoginItemSettings({ openAtLogin: true, openAsHidden: false });
}

app.on('window-all-closed', () => {
  stopStatusCheck();
  if (process.platform !== 'darwin') app.quit();
});

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) createWindow();
});

app.on('before-quit', () => {
  stopStatusCheck();
  stopUpdateCheck();
  if (savePositionTimeout) clearTimeout(savePositionTimeout);
});

// Global error handlers
process.on('uncaughtException', (error) => {
  log(`Uncaught exception: ${error.message}`);
  log(error.stack || '');
});

process.on('unhandledRejection', (reason) => {
  log(`Unhandled rejection: ${reason}`);
});
