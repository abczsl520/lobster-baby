import { app, BrowserWindow, ipcMain, screen, Menu, shell, Notification, globalShortcut } from 'electron';
import path from 'path';
import https from 'https';
import { log } from './logger';
import { readStore, writeStore } from './store';
import { findOpenClaw, scanRealTokenUsage } from './scanner';
import * as dock from './dock';
import { createTray, updateTrayMenu, setMainWindowGetter as setTrayMainWindow } from './tray';
import { initStatus, startStatusCheck, stopStatusCheck } from './status';
import * as social from './social';
import * as plugins from './plugins';

log('=== Lobster Baby starting ===');

const openclawPath = findOpenClaw();

let mainWindow: BrowserWindow | null = null;
let savePositionTimeout: NodeJS.Timeout | null = null;

const SNAP_DISTANCE = 15;
const NORMAL_SIZE = { width: 200, height: 250 };
const PANEL_SIZE = { width: 320, height: 680 };

// Provide mainWindow getter to modules
const getMainWindow = () => mainWindow;

function clampToScreen(x: number, y: number, w: number, h: number) {
  const display = screen.getDisplayNearestPoint({ x, y }).workArea;
  return {
    x: Math.max(display.x, Math.min(x, display.x + display.width - w)),
    y: Math.max(display.y, Math.min(y, display.y + display.height - h)),
    width: w, height: h,
  };
}

function createWindow() {
  const { width, height } = screen.getPrimaryDisplay().workAreaSize;
  const store = readStore();
  const savedX = store.windowX ?? (width - 250);
  const savedY = store.windowY ?? (height - 300);

  mainWindow = new BrowserWindow({
    width: NORMAL_SIZE.width, height: NORMAL_SIZE.height,
    transparent: true, frame: false, alwaysOnTop: true,
    resizable: false, skipTaskbar: true, hasShadow: false,
    backgroundColor: '#00000000',
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      contextIsolation: true, nodeIntegration: false,
      backgroundThrottling: false,
    },
    x: savedX, y: savedY,
  });

  if (process.env.VITE_DEV_SERVER_URL) {
    mainWindow.loadURL(process.env.VITE_DEV_SERVER_URL);
  } else {
    mainWindow.loadFile(path.join(__dirname, '../dist/index.html'));
  }

  // Logging
  mainWindow.webContents.on('did-finish-load', () => log('Page loaded'));
  mainWindow.webContents.on('did-fail-load', (_e, code, desc) => log(`Page failed: ${code} ${desc}`));
  mainWindow.webContents.on('render-process-gone', (_e, details) => {
    log(`Renderer crashed: ${JSON.stringify(details)}`);
    if (details.reason !== 'clean-exit') {
      setTimeout(() => {
        if (mainWindow && !mainWindow.isDestroyed()) mainWindow.reload();
        else createWindow();
      }, 1000);
    }
  });
  mainWindow.webContents.on('unresponsive', () => log('Renderer unresponsive'));
  mainWindow.webContents.on('responsive', () => log('Renderer responsive'));

  // Save position on move + edge snapping
  mainWindow.on('moved', () => {
    if (!mainWindow) return;
    if (dock.isDockingInProgress || dock.isPanelResizing) return;

    const bounds = mainWindow.getBounds();
    const display = screen.getDisplayNearestPoint({ x: bounds.x, y: bounds.y }).workArea;

    if (dock.isDockedLeft || dock.isDockedRight) {
      dock.setIsDockedLeft(false);
      dock.setIsDockedRight(false);
      dock.stopHoverCheck();
      dock.notifyDockState(mainWindow, null);
    }

    let newX = bounds.x, newY = bounds.y, snapped = false;
    if (bounds.x - display.x < SNAP_DISTANCE) { newX = display.x; snapped = true; }
    if (bounds.y - display.y < SNAP_DISTANCE) { newY = display.y; snapped = true; }
    if (bounds.x + bounds.width > display.x + display.width - SNAP_DISTANCE) {
      newX = display.x + display.width - bounds.width; snapped = true;
    }
    if (bounds.y + bounds.height > display.y + display.height - SNAP_DISTANCE) {
      newY = display.y + display.height - bounds.height; snapped = true;
    }
    if (snapped) mainWindow.setBounds({ x: newX, y: newY, width: bounds.width, height: bounds.height });

    dock.clearDockTimeout();
    if (!dock.isDraggingWindow) {
      const finalX = snapped ? newX : bounds.x;
      const atEdge = (finalX <= display.x + 5) || (finalX + bounds.width >= display.x + display.width - 5);
      if (atEdge) dock.scheduleDock(1500);
    }

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
    if (savePositionTimeout) { clearTimeout(savePositionTimeout); savePositionTimeout = null; }
    mainWindow = null;
  });

  // Right-click context menu
  mainWindow.webContents.on('context-menu', () => {
    const isOnTop = mainWindow?.isAlwaysOnTop() ?? true;

    // Build plugin menu items dynamically
    const pluginMenuItems = plugins.getMenuItems();
    const pluginSubMenu: Electron.MenuItemConstructorOptions[] = pluginMenuItems.length > 0
      ? [
          { type: 'separator' },
          ...pluginMenuItems.map(item => ({
            label: item.label,
            click: async () => { try { await item.onClick(); } catch (e) { log(`Plugin menu error: ${e}`); } },
          })),
        ]
      : [];

    const menu = Menu.buildFromTemplate([
      { label: isOnTop ? '📌 取消置顶' : '📌 置顶', click: () => { mainWindow?.setAlwaysOnTop(!isOnTop); updateTrayMenu(); } },
      { type: 'separator' },
      { label: '📊 状态面板', click: () => mainWindow?.webContents.send('toggle-panel') },
      { label: '🌐 龙虾社区', click: () => mainWindow?.webContents.send('show-social') },
      { label: '🧩 插件', click: () => mainWindow?.webContents.send('show-plugins') },
      { type: 'separator' },
      { label: '📈 查看趋势', click: () => mainWindow?.webContents.send('toggle-chart') },
      { label: '🏆 查看成就', click: () => mainWindow?.webContents.send('show-achievements') },
      ...pluginSubMenu,
      { type: 'separator' },
      { label: '🔄 重新加载', click: () => mainWindow?.reload() },
      { label: '📂 数据目录', click: () => shell.openPath(app.getPath('userData')) },
      { type: 'separator' },
      { label: '❌ 退出', click: () => app.quit() },
    ]);
    menu.popup();
  });

  // Init modules with mainWindow getter
  dock.setMainWindowGetter(getMainWindow);
  setTrayMainWindow(getMainWindow);
  initStatus(openclawPath, getMainWindow);

  startStatusCheck();
  createTray();
  log('Window created');
}

// ─── IPC Handlers ───
ipcMain.removeAllListeners('move-window');
ipcMain.on('move-window', (event, deltaX: number, deltaY: number) => {
  if (typeof deltaX !== 'number' || typeof deltaY !== 'number') return;
  if (!isFinite(deltaX) || !isFinite(deltaY)) return;
  const dx = Math.max(-500, Math.min(500, Math.round(deltaX)));
  const dy = Math.max(-500, Math.min(500, Math.round(deltaY)));

  dock.clearDockTimeout();
  if (dock.isDockedLeft || dock.isDockedRight) {
    dock.setIsDockedLeft(false);
    dock.setIsDockedRight(false);
    dock.stopHoverCheck();
    dock.cancelDockAnimation();
    dock.notifyDockState(mainWindow, null);
  }
  dock.setIsDraggingWindow(true);

  const win = BrowserWindow.fromWebContents(event.sender);
  if (!win || win.isDestroyed()) return;

  const [x, y] = win.getPosition();
  const bounds = win.getBounds();
  const display = screen.getDisplayNearestPoint({ x, y }).workArea;

  let newX = x + dx, newY = y + dy;
  const MAGNETIC_DISTANCE = 30;
  const SNAP_STRENGTH = 0.3;

  const leftDist = newX - display.x;
  if (leftDist < MAGNETIC_DISTANCE && leftDist > -bounds.width / 2) {
    newX = Math.round(newX - (leftDist * ((MAGNETIC_DISTANCE - leftDist) / MAGNETIC_DISTANCE) * SNAP_STRENGTH));
  }
  const topDist = newY - display.y;
  if (topDist < MAGNETIC_DISTANCE && topDist > -bounds.height / 2) {
    newY = Math.round(newY - (topDist * ((MAGNETIC_DISTANCE - topDist) / MAGNETIC_DISTANCE) * SNAP_STRENGTH));
  }
  const rightDist = (display.x + display.width) - (newX + bounds.width);
  if (rightDist < MAGNETIC_DISTANCE && rightDist > -bounds.width / 2) {
    newX = Math.round(newX + (rightDist * ((MAGNETIC_DISTANCE - rightDist) / MAGNETIC_DISTANCE) * SNAP_STRENGTH));
  }
  const bottomDist = (display.y + display.height) - (newY + bounds.height);
  if (bottomDist < MAGNETIC_DISTANCE && bottomDist > -bounds.height / 2) {
    newY = Math.round(newY + (bottomDist * ((MAGNETIC_DISTANCE - bottomDist) / MAGNETIC_DISTANCE) * SNAP_STRENGTH));
  }

  win.setPosition(newX, newY);
});

ipcMain.on('drag-end', () => {
  dock.setIsDraggingWindow(false);
  if (!mainWindow || mainWindow.isDestroyed()) return;
  const bounds = mainWindow.getBounds();
  const display = screen.getDisplayNearestPoint({ x: bounds.x, y: bounds.y }).workArea;
  const atEdge = bounds.x <= display.x + 5 || bounds.x + bounds.width >= display.x + display.width - 5;
  if (atEdge) dock.scheduleDock(1500);
});

ipcMain.handle('toggle-always-on-top', () => {
  if (!mainWindow || mainWindow.isDestroyed()) return false;
  const isOnTop = mainWindow.isAlwaysOnTop();
  mainWindow.setAlwaysOnTop(!isOnTop);
  updateTrayMenu();
  return !isOnTop;
});

ipcMain.handle('get-level-data', () => {
  const realTokens = scanRealTokenUsage();
  if (realTokens > 0) return { totalTokens: realTokens };
  return { totalTokens: readStore().totalTokens || 0 };
});

ipcMain.handle('get-daily-tokens', () => readStore().dailyTokens || {});

ipcMain.handle('get-settings', () => readStore().settings || { autoFadeEnabled: false });

ipcMain.handle('update-settings', (_event, settings: Record<string, any>) => {
  const store = readStore();
  store.settings = { ...store.settings, ...settings };
  writeStore(store);
  return store.settings;
});

ipcMain.handle('undock', () => dock.undockFromEdge());
ipcMain.handle('redock', () => dock.scheduleDock(2000));

// ─── Social IPC ───
const THRESHOLDS = [0, 50000000, 200000000, 500000000, 1000000000, 2500000000, 5000000000, 10000000000, 25000000000, 50000000000];
const ACHIEVEMENT_THRESHOLDS = [1e6, 1e7, 1e8, 1e9, 5e9, 1e10, 5e10];

function calcLevel(tokens: number): number {
  let level = 1;
  for (let i = THRESHOLDS.length - 1; i >= 0; i--) {
    if (tokens >= THRESHOLDS[i]) { level = i + 1; break; }
  }
  return level;
}

ipcMain.handle('social-register', async (_event, nickname: string) => {
  try {
    const realTokens = scanRealTokenUsage();
    const level = calcLevel(realTokens);
    const uptimeHours = Math.max(1, Math.floor(process.uptime() / 3600));
    const result = await social.socialRegister(nickname, realTokens, level, uptimeHours);
    const store = readStore();
    store.socialToken = result.token;
    store.lobsterId = result.lobster_id;
    store.socialNickname = nickname;
    writeStore(store);
    return result;
  } catch (err: any) { return { error: err.message }; }
});

ipcMain.handle('social-login', async () => {
  try {
    const result = await social.socialLogin();
    const store = readStore();
    store.socialToken = result.token;
    store.lobsterId = result.lobster_id;
    store.socialNickname = result.nickname;
    writeStore(store);
    return result;
  } catch (err: any) { return { error: err.message }; }
});

ipcMain.handle('social-sync', async () => {
  try {
    const store = readStore();
    if (!store.socialToken) return { error: '未注册' };
    const realTokens = scanRealTokenUsage();
    const level = calcLevel(realTokens);
    const achievements = ACHIEVEMENT_THRESHOLDS.filter(t => realTokens >= t).length;
    const dailyTokens = Math.max(0, realTokens - (store.dailyTokensBaseline || 0));
    return await social.socialSync(store.socialToken, realTokens, level, achievements, dailyTokens);
  } catch (err: any) { return { error: err.message }; }
});

ipcMain.handle('social-leaderboard', async (_event, type: string, page: number) => {
  try { return await social.socialGetLeaderboard(readStore().socialToken || null, type, page); }
  catch (err: any) { return { error: err.message }; }
});

ipcMain.handle('social-pk-create', async () => {
  try {
    const store = readStore();
    if (!store.socialToken) return { error: '未注册' };
    return await social.socialCreatePK(store.socialToken);
  } catch (err: any) { return { error: err.message }; }
});

ipcMain.handle('social-pk-join', async (_event, code: string) => {
  try {
    const store = readStore();
    if (!store.socialToken) return { error: '未注册' };
    return await social.socialJoinPK(store.socialToken, code);
  } catch (err: any) { return { error: err.message }; }
});

ipcMain.handle('social-profile', async () => {
  try {
    const store = readStore();
    if (!store.socialToken) return { error: '未注册' };
    return await social.socialGetProfile(store.socialToken);
  } catch (err: any) { return { error: err.message }; }
});

ipcMain.handle('social-update-profile', async (_event, data: Record<string, any>) => {
  try {
    const store = readStore();
    if (!store.socialToken) return { error: '未注册' };
    return await social.socialUpdateProfile(store.socialToken, data);
  } catch (err: any) { return { error: err.message }; }
});

ipcMain.handle('social-delete-account', async () => {
  try {
    const store = readStore();
    if (!store.socialToken) return { error: '未注册' };
    const result = await social.socialDeleteAccount(store.socialToken);
    delete store.socialToken; delete store.lobsterId; delete store.socialNickname;
    writeStore(store);
    return result;
  } catch (err: any) { return { error: err.message }; }
});

ipcMain.handle('social-get-local', () => {
  const store = readStore();
  return { lobsterId: store.lobsterId || null, nickname: store.socialNickname || null, hasToken: !!store.socialToken };
});

ipcMain.handle('social-stats', async () => {
  try { return await social.socialGetStats(); }
  catch (err: any) { return { error: err.message }; }
});

// ─── Plugin IPC ───
ipcMain.handle('plugin-list', () => plugins.getInstalledPlugins());
ipcMain.handle('plugin-enable', async (_event, id: string) => plugins.enablePlugin(id));
ipcMain.handle('plugin-disable', async (_event, id: string) => plugins.disablePlugin(id));
ipcMain.handle('plugin-uninstall', async (_event, id: string) => plugins.uninstallPlugin(id));
ipcMain.handle('plugin-install-url', async (_event, url: string) => plugins.installFromUrl(url));
ipcMain.handle('plugin-featured', async () => plugins.fetchFeaturedPlugins());
ipcMain.handle('plugin-search', async (_event, query: string) => plugins.searchPlugins(query));
ipcMain.handle('plugin-menu-items', () => {
  return plugins.getMenuItems().map(m => ({ id: m.id, label: m.label, pluginId: m.pluginId }));
});
ipcMain.handle('plugin-menu-click', async (_event, menuId: string) => {
  const item = plugins.getMenuItems().find(m => m.id === menuId);
  if (item) { try { await item.onClick(); } catch (e) { log(`Plugin menu click error: ${e}`); } }
});

// ─── Panel resize ───
ipcMain.handle('show-panel', () => {
  if (!mainWindow || mainWindow.isDestroyed()) return;
  dock.setIsPanelResizing(true);
  const bounds = mainWindow.getBounds();
  mainWindow.setBounds(clampToScreen(
    bounds.x - (PANEL_SIZE.width - NORMAL_SIZE.width) / 2,
    bounds.y - (PANEL_SIZE.height - NORMAL_SIZE.height),
    PANEL_SIZE.width, PANEL_SIZE.height
  ));
  setTimeout(() => dock.setIsPanelResizing(false), 100);
});

ipcMain.handle('hide-panel', () => {
  if (!mainWindow || mainWindow.isDestroyed()) return;
  dock.setIsPanelResizing(true);
  const bounds = mainWindow.getBounds();
  mainWindow.setBounds(clampToScreen(
    bounds.x + (PANEL_SIZE.width - NORMAL_SIZE.width) / 2,
    bounds.y + (PANEL_SIZE.height - NORMAL_SIZE.height),
    NORMAL_SIZE.width, NORMAL_SIZE.height
  ));
  setTimeout(() => dock.setIsPanelResizing(false), 100);
});

ipcMain.handle('quit-app', () => app.quit());
ipcMain.handle('open-external', async (_event, url: string) => {
  if (typeof url !== 'string' || !url.startsWith('http')) return;
  await shell.openExternal(url);
});

// ─── Level Up Notification ───
const LEVEL_NAMES: Record<number, string> = {
  1: '粉色宝宝', 2: '活泼小虾', 3: '皇冠龙虾', 4: '肌肉猛男',
  5: '金冠金链', 6: '银甲骑士', 7: '紫色魔法师', 8: '金甲将军',
  9: '彩虹龙虾', 10: '龙虾之王',
};

ipcMain.handle('notify-level-up', (_event, level: number) => {
  if (typeof level !== 'number' || level < 1 || level > 10) return;
  const name = LEVEL_NAMES[level] || `Lv.${level}`;
  log(`Level up! Now Lv.${level} (${name})`);
  if (Notification.isSupported()) {
    new Notification({ title: '🦞 龙虾宝宝升级了！', body: `恭喜！升到了 Lv.${level}「${name}」🎉`, silent: false }).show();
  }
});

// ─── Auto Update Check ───
const APP_VERSION = '1.8.0';
let updateCheckInterval: NodeJS.Timeout | null = null;

function fetchJSON(url: string): Promise<any> {
  return new Promise((resolve, reject) => {
    https.get(url, { headers: { 'User-Agent': 'LobsterBaby' } }, (res) => {
      if (res.statusCode === 301 || res.statusCode === 302) return fetchJSON(res.headers.location!).then(resolve).catch(reject);
      let data = '';
      res.on('data', (chunk) => data += chunk);
      res.on('end', () => { try { resolve(JSON.parse(data)); } catch { reject(new Error('Invalid JSON')); } });
    }).on('error', reject);
  });
}

function compareVersions(v1: string, v2: string): number {
  const p1 = v1.split('.').map(Number), p2 = v2.split('.').map(Number);
  for (let i = 0; i < Math.max(p1.length, p2.length); i++) {
    const a = p1[i] || 0, b = p2[i] || 0;
    if (a > b) return 1; if (a < b) return -1;
  }
  return 0;
}

async function checkForUpdatesMain() {
  try {
    const data = await fetchJSON('https://api.github.com/repos/abczsl520/lobster-baby/releases/latest');
    const latest = (data.tag_name || '').replace(/^v/, '');
    if (!latest || compareVersions(latest, APP_VERSION) <= 0) return;
    log(`New version: ${latest}`);
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send('update-available', { version: latest, url: data.html_url });
    }
    if (Notification.isSupported()) {
      const n = new Notification({ title: '🦞 有新版本！', body: `v${latest} 已发布`, silent: false });
      n.on('click', () => shell.openExternal(data.html_url));
      n.show();
    }
  } catch (err) { log(`Update check failed: ${err}`); }
}

// ─── Social Auto-Sync ───
let socialSyncInterval: NodeJS.Timeout | null = null;

async function doSocialSync() {
  try {
    const store = readStore();
    if (!store.socialToken) return;
    const realTokens = scanRealTokenUsage();
    const level = calcLevel(realTokens);
    const achievements = ACHIEVEMENT_THRESHOLDS.filter(t => realTokens >= t).length;
    const dailyTokens = Math.max(0, realTokens - (store.dailyTokensBaseline || 0));
    await social.socialSync(store.socialToken, realTokens, level, achievements, dailyTokens);
    log('Social sync completed');
  } catch (err: any) { log(`Social sync failed: ${err.message}`); }
}

function startSocialSync() {
  const store = readStore();
  if (!store.socialToken && !store.lobsterId) {
    social.socialLogin().then(result => {
      if (result.success) {
        const s = readStore();
        s.socialToken = result.token; s.lobsterId = result.lobster_id; s.socialNickname = result.nickname;
        writeStore(s);
        log(`Social auto-login: ${result.lobster_id}`);
      }
    }).catch(() => {});
  }
  setTimeout(doSocialSync, 30000);
  socialSyncInterval = setInterval(doSocialSync, 60 * 60 * 1000);
}

// ─── App Lifecycle ───
app.whenReady().then(async () => {
  createWindow();

  // Init plugin system
  plugins.setStatusGetter(() => {
    const store = readStore();
    const realTokens = scanRealTokenUsage();
    return {
      status: 'active',
      level: calcLevel(realTokens),
      totalTokens: realTokens,
      dailyTokens: Math.max(0, realTokens - (store.dailyTokensBaseline || 0)),
    };
  });
  plugins.setToastSender((msg, duration) => {
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send('plugin-toast', { message: msg, duration: duration || 3000 });
    }
  });
  await plugins.initPlugins();

  setTimeout(checkForUpdatesMain, 10000);
  updateCheckInterval = setInterval(checkForUpdatesMain, 6 * 60 * 60 * 1000);
  startSocialSync();

  globalShortcut.register('CommandOrControl+Shift+L', () => {
    if (!mainWindow) return;
    if (mainWindow.isVisible()) mainWindow.hide();
    else { mainWindow.show(); mainWindow.focus(); }
  });

  screen.on('display-removed', () => {
    if (!mainWindow || mainWindow.isDestroyed()) return;
    const b = mainWindow.getBounds();
    mainWindow.setBounds(clampToScreen(b.x, b.y, b.width, b.height));
  });
  screen.on('display-metrics-changed', () => {
    if (!mainWindow || mainWindow.isDestroyed()) return;
    const b = mainWindow.getBounds();
    mainWindow.setBounds(clampToScreen(b.x, b.y, b.width, b.height));
  });
});

if (app.isPackaged) app.setLoginItemSettings({ openAtLogin: true, openAsHidden: false });

app.on('window-all-closed', () => { stopStatusCheck(); if (process.platform !== 'darwin') app.quit(); });
app.on('activate', () => { if (BrowserWindow.getAllWindows().length === 0) createWindow(); });
app.on('before-quit', () => {
  stopStatusCheck();
  plugins.shutdownPlugins().catch(() => {});
  if (updateCheckInterval) clearInterval(updateCheckInterval);
  globalShortcut.unregisterAll();
  if (savePositionTimeout) clearTimeout(savePositionTimeout);
});

process.on('uncaughtException', (error) => { log(`Uncaught: ${error.message}`); log(error.stack || ''); });
process.on('unhandledRejection', (reason) => { log(`Unhandled rejection: ${reason}`); });
