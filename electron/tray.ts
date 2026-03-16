import { BrowserWindow, Menu, Tray, nativeImage, app } from 'electron';
import path from 'path';
import { t } from './i18n-main';

let tray: Tray | null = null;
let _mainWindow: (() => BrowserWindow | null) | null = null;

let _panelCallback: ((route?: string) => void) | null = null;

export function setMainWindowGetter(getter: () => BrowserWindow | null) {
  _mainWindow = getter;
}

export function setPanelCallback(cb: (route?: string) => void) {
  _panelCallback = cb;
}

function getWin(): BrowserWindow | null {
  return _mainWindow ? _mainWindow() : null;
}

export function updateTrayMenu() {
  if (!tray) return;
  const win = getWin();
  const isOnTop = win?.isAlwaysOnTop() ?? true;
  const contextMenu = Menu.buildFromTemplate([
    {
      label: t('menu.showLobster'),
      click: () => { if (win) { win.show(); win.focus(); } },
    },
    {
      label: isOnTop ? t('menu.unpin') : t('menu.pin'),
      click: () => {
        if (win) {
          win.setAlwaysOnTop(!isOnTop);
          updateTrayMenu();
        }
      },
    },
    { type: 'separator' },
    { label: t('menu.status'), click: () => _panelCallback?.('status') },
    { label: t('menu.remote'), click: () => _panelCallback?.('remote') },
    { type: 'separator' },
    { label: t('menu.reload'), click: () => win?.reload() },
    { label: t('menu.quit'), click: () => app.quit() },
  ]);
  tray.setContextMenu(contextMenu);
}

export function createTray() {
  // Use lobster icon from assets — path resolves differently in dev vs packaged
  const basePath = app.isPackaged 
    ? path.join(process.resourcesPath, 'tray-icon.png')
    : path.join(__dirname, '..', 'electron', 'assets', 'tray-icon.png');
  
  let icon: Electron.NativeImage;
  try {
    icon = nativeImage.createFromPath(basePath);
    // Resize for tray (16x16 template on macOS)
    icon = icon.resize({ width: 18, height: 18 });
    icon.setTemplateImage(true);
  } catch {
    // Fallback to inline base64
    icon = nativeImage.createFromDataURL(
      'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAABAAAAAQCAYAAAAf8/9hAAAA2ElEQVQ4T2NkoBAwUqifgWoGMDIyNjAyMv5nYGD4T8gFjP///2dgZGRsYGJiagBpxmcIyGBGRsYGJiamBmJcADKYiYmpgZGRsQGfIf8ZGBgbmJiYGhgZGRvwGQIKBiYmpgZGRsYGfIaAgoGJiamBkZGxAZ8h/xkYGBuYmJgaGBkZG/AZAgoGJiamBkZGxgZ8hoCCgYmJqYGRkbEBnyH/GRgYG5iYmBoYGRkb8BkCCgYmJqYGRkbGBnyGgIKBiYmpgZGRsQGfIaBgYGJiamBkZGzAZwgAqFBBEQmNF/IAAAAASUVORK5CYII='
    );
  }

  tray = new Tray(icon);
  tray.setToolTip('🦞 Lobster Baby');
  updateTrayMenu();

  tray.on('click', () => {
    const win = getWin();
    if (win) {
      if (win.isVisible()) { win.hide(); }
      else { win.show(); win.focus(); }
    }
  });
}
