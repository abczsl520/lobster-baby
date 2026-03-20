import { app, BrowserWindow, ipcMain, screen, Menu, shell, globalShortcut } from 'electron';
import path from 'path';
import { log, logError, logWarn, logDebug, logSessionSummary } from './logger';
import { readStore, writeStore } from './store';
import { findOpenClaw, scanRealTokenUsage } from './scanner';
import * as dock from './dock';
import { createTray, updateTrayMenu, updateTrayTooltip, setMainWindowGetter as setTrayMainWindow, setPanelCallback } from './tray';
import { initStatus, startStatusCheck, stopStatusCheck } from './status';
import * as plugins from './plugins';
import { sshManager } from './ssh-manager';
import { t } from './i18n-main';
import { registerSocialIPC, startSocialSync, calcLevel } from './ipc/social';
import { registerPluginIPC } from './ipc/plugins';
import { registerSSHIPC } from './ipc/ssh';
import { registerSettingsIPC } from './ipc/settings';

const startupTime = Date.now();
log(`=== Lobster Baby starting ===`);

const openclawPath = findOpenClaw();

let mainWindow: BrowserWindow | null = null;
let panelWindow: BrowserWindow | null = null;
let savePositionTimeout: NodeJS.Timeout | null = null;

const SNAP_DISTANCE = 15;
const NORMAL_SIZE = { width: 200, height: 250 };
const PANEL_SIZE = { width: 340, height: 700 };

const getMainWindow = () => mainWindow;

function clampToScreen(x: number, y: number, w: number, h: number) {
  const display = screen.getDisplayNearestPoint({ x, y }).workArea;
  return {
    x: Math.max(display.x, Math.min(x, display.x + display.width - w)),
    y: Math.max(display.y, Math.min(y, display.y + display.height - h)),
    width: w, height: h,
  };
}

// ─── Main Window ───

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

  mainWindow.webContents.on('did-finish-load', () => log(`Page loaded (${Date.now() - startupTime}ms startup)`));
  mainWindow.webContents.on('did-fail-load', (_e, code, desc) => logError(`Page failed: ${code} ${desc}`));

  // S22: Block external navigation
  mainWindow.webContents.on('will-navigate', (event, url) => {
    const allowed = process.env.VITE_DEV_SERVER_URL || `file://${path.join(__dirname, '../dist/')}`;
    if (!url.startsWith(allowed) && !url.startsWith('file://')) {
      logWarn(`Blocked navigation to: ${url}`);
      event.preventDefault();
    }
  });
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    logWarn(`Blocked window.open: ${url}`);
    return { action: 'deny' };
  });

  mainWindow.webContents.on('render-process-gone', (_e, details) => {
    logError(`Renderer crashed: ${JSON.stringify(details)}`);
    if (details.reason !== 'clean-exit') {
      setTimeout(() => {
        if (mainWindow && !mainWindow.isDestroyed()) mainWindow.reload();
        else createWindow();
      }, 1000);
    }
  });
  mainWindow.webContents.on('unresponsive', () => logWarn('Renderer unresponsive'));
  mainWindow.webContents.on('responsive', () => log('Renderer responsive'));

  // Edge snapping + position save
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
    const pluginMenuItems = plugins.getMenuItems();
    const pluginSubMenu: Electron.MenuItemConstructorOptions[] = pluginMenuItems.length > 0
      ? [{ type: 'separator' }, ...pluginMenuItems.map(item => ({
          label: item.label,
          click: async () => { try { await item.onClick(); } catch (e) { logError(`Plugin menu error: ${e}`); } },
        }))]
      : [];

    Menu.buildFromTemplate([
      { label: isOnTop ? t('menu.unpin') : t('menu.pin'), click: () => { mainWindow?.setAlwaysOnTop(!isOnTop); updateTrayMenu(); } },
      { type: 'separator' },
      { label: t('menu.status'), click: () => createPanelWindow('status') },
      { label: t('menu.community'), click: () => createPanelWindow('social') },
      { label: t('menu.plugins'), click: () => createPanelWindow('plugins') },
      { label: t('menu.remote'), click: () => createPanelWindow('remote') },
      { type: 'separator' },
      { label: t('menu.trends'), click: () => createPanelWindow('chart') },
      { label: t('menu.achievements'), click: () => createPanelWindow('achievements') },
      ...pluginSubMenu,
      { type: 'separator' },
      { label: t('menu.reload'), click: () => { mainWindow?.reload(); if (panelWindow && !panelWindow.isDestroyed()) panelWindow.reload(); } },
      { label: t('menu.dataDir'), click: () => shell.openPath(app.getPath('userData')) },
      { type: 'separator' },
      { label: t('menu.quit'), click: () => app.quit() },
    ]).popup();
  });

  // Init modules
  dock.setMainWindowGetter(getMainWindow);
  setTrayMainWindow(getMainWindow);
  setPanelCallback(createPanelWindow);
  initStatus(openclawPath, getMainWindow);
  startStatusCheck();
  createTray();
  log('Window created');
}

// ─── Drag IPC ───

ipcMain.removeAllListeners('move-window');
ipcMain.on('move-window', (event, deltaX: number, deltaY: number) => {
  if (typeof deltaX !== 'number' || typeof deltaY !== 'number') return;
  if (!isFinite(deltaX) || !isFinite(deltaY)) return;
  const dx = Math.max(-500, Math.min(500, Math.round(deltaX)));
  const dy = Math.max(-500, Math.min(500, Math.round(deltaY)));

  dock.clearDockTimeout();
  if (dock.isDockedLeft || dock.isDockedRight) {
    dock.setIsDockedLeft(false); dock.setIsDockedRight(false);
    dock.stopHoverCheck(); dock.cancelDockAnimation();
    dock.notifyDockState(mainWindow, null);
  }
  dock.setIsDraggingWindow(true);

  const win = BrowserWindow.fromWebContents(event.sender);
  if (!win || win.isDestroyed()) return;

  const [x, y] = win.getPosition();
  const bounds = win.getBounds();
  const display = screen.getDisplayNearestPoint({ x, y }).workArea;

  let newX = x + dx, newY = y + dy;
  const MAG = 30, SNAP = 0.3;

  const leftDist = newX - display.x;
  if (leftDist < MAG && leftDist > -bounds.width / 2) newX = Math.round(newX - (leftDist * ((MAG - leftDist) / MAG) * SNAP));
  const topDist = newY - display.y;
  if (topDist < MAG && topDist > -bounds.height / 2) newY = Math.round(newY - (topDist * ((MAG - topDist) / MAG) * SNAP));
  const rightDist = (display.x + display.width) - (newX + bounds.width);
  if (rightDist < MAG && rightDist > -bounds.width / 2) newX = Math.round(newX + (rightDist * ((MAG - rightDist) / MAG) * SNAP));
  const bottomDist = (display.y + display.height) - (newY + bounds.height);
  if (bottomDist < MAG && bottomDist > -bounds.height / 2) newY = Math.round(newY + (bottomDist * ((MAG - bottomDist) / MAG) * SNAP));

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

// ─── Register modular IPC handlers ───
registerSettingsIPC(getMainWindow);
registerSocialIPC();
registerPluginIPC();
registerSSHIPC();

// ─── Panel Window ───

function createPanelWindow(route?: string) {
  if (panelWindow && !panelWindow.isDestroyed()) {
    panelWindow.focus();
    if (route) panelWindow.webContents.send('navigate-panel', route);
    return;
  }

  const mainBounds = mainWindow?.getBounds();
  const display = mainBounds
    ? screen.getDisplayNearestPoint({ x: mainBounds.x, y: mainBounds.y }).workArea
    : screen.getPrimaryDisplay().workArea;

  let panelX = display.x + Math.round((display.width - PANEL_SIZE.width) / 2);
  let panelY = display.y + Math.round((display.height - PANEL_SIZE.height) / 2);

  if (mainBounds) {
    const gap = 8;
    const spaceRight = display.x + display.width - (mainBounds.x + mainBounds.width);
    const spaceLeft = mainBounds.x - display.x;
    const idealY = mainBounds.y + mainBounds.height - PANEL_SIZE.height;

    if (spaceRight >= PANEL_SIZE.width + gap) { panelX = mainBounds.x + mainBounds.width + gap; panelY = idealY; }
    else if (spaceLeft >= PANEL_SIZE.width + gap) { panelX = mainBounds.x - PANEL_SIZE.width - gap; panelY = idealY; }
    else { panelX = mainBounds.x + Math.round((mainBounds.width - PANEL_SIZE.width) / 2); panelY = mainBounds.y - PANEL_SIZE.height - gap; }
  }

  panelX = Math.max(display.x, Math.min(panelX, display.x + display.width - PANEL_SIZE.width));
  panelY = Math.max(display.y, Math.min(panelY, display.y + display.height - PANEL_SIZE.height));

  panelWindow = new BrowserWindow({
    width: PANEL_SIZE.width, height: PANEL_SIZE.height,
    x: panelX, y: panelY,
    frame: false, transparent: true, resizable: false, alwaysOnTop: true,
    skipTaskbar: true, hasShadow: true, backgroundColor: '#00000000',
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      contextIsolation: true, nodeIntegration: false, backgroundThrottling: false,
    },
  });

  const panelRoute = route || 'status';
  if (process.env.VITE_DEV_SERVER_URL) {
    panelWindow.loadURL(`${process.env.VITE_DEV_SERVER_URL}?panel=${panelRoute}`);
  } else {
    panelWindow.loadFile(path.join(__dirname, '../dist/index.html'), { search: `panel=${panelRoute}` });
  }

  panelWindow.webContents.on('will-navigate', (event, url) => {
    const allowed = process.env.VITE_DEV_SERVER_URL || `file://${path.join(__dirname, '../dist/')}`;
    if (!url.startsWith(allowed) && !url.startsWith('file://')) { logWarn(`Panel: Blocked nav: ${url}`); event.preventDefault(); }
  });
  panelWindow.webContents.setWindowOpenHandler(({ url }) => { logWarn(`Panel: Blocked window.open: ${url}`); return { action: 'deny' }; });
  panelWindow.on('closed', () => { panelWindow = null; });
  panelWindow.webContents.on('before-input-event', (event, input) => {
    if (input.key === 'Escape' && !input.alt && !input.control && !input.meta) { closePanelWindow(); event.preventDefault(); }
  });

  logDebug(`Panel window created (route: ${panelRoute})`);
}

function closePanelWindow() {
  if (panelWindow && !panelWindow.isDestroyed()) { panelWindow.close(); panelWindow = null; }
}

ipcMain.handle('show-panel', (_event, route?: string) => createPanelWindow(route));
ipcMain.handle('hide-panel', () => closePanelWindow());
ipcMain.handle('close-panel', () => closePanelWindow());

// ─── Auto Update (electron-updater) ───

import { initAutoUpdater, checkForUpdatesQuiet } from './updater';
const APP_VERSION = app.getVersion();
let updateCheckInterval: NodeJS.Timeout | null = null;

// ─── App Lifecycle ───

app.whenReady().then(async () => {
  log(`v${APP_VERSION} on Electron ${process.versions.electron}`);
  createWindow();

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

  // Auto-update: init + periodic check
  initAutoUpdater(getMainWindow);
  setTimeout(checkForUpdatesQuiet, 10000);
  updateCheckInterval = setInterval(checkForUpdatesQuiet, 6 * 60 * 60 * 1000);
  startSocialSync();

  globalShortcut.register('CommandOrControl+Shift+L', () => {
    if (!mainWindow) return;
    if (mainWindow.isVisible()) mainWindow.hide();
    else { mainWindow.show(); mainWindow.focus(); }
  });

  globalShortcut.register('CommandOrControl+Shift+P', () => {
    createPanelWindow('status');
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

if (app.isPackaged) {
  const store = readStore();
  app.setLoginItemSettings({ openAtLogin: store.autoStartEnabled !== false, openAsHidden: false });
}

app.on('window-all-closed', () => { stopStatusCheck(); if (process.platform !== 'darwin') app.quit(); });
app.on('activate', () => { if (BrowserWindow.getAllWindows().length === 0) createWindow(); });
app.on('before-quit', () => {
  logSessionSummary();
  stopStatusCheck();
  closePanelWindow();
  sshManager.disconnectAll();
  plugins.shutdownPlugins().catch(() => {});
  if (updateCheckInterval) clearInterval(updateCheckInterval);
  globalShortcut.unregisterAll();
  if (savePositionTimeout) clearTimeout(savePositionTimeout);
});

process.on('uncaughtException', (error) => { log(`Uncaught: ${error.message}`); log(error.stack || ''); });
process.on('unhandledRejection', (reason) => { log(`Unhandled rejection: ${reason}`); });
