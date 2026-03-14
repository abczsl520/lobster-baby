import { BrowserWindow, Menu, Tray, nativeImage, app } from 'electron';
import { t } from './i18n-main';

let tray: Tray | null = null;
let _mainWindow: (() => BrowserWindow | null) | null = null;

export function setMainWindowGetter(getter: () => BrowserWindow | null) {
  _mainWindow = getter;
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
    { label: t('menu.reload'), click: () => win?.reload() },
    { label: t('menu.quit'), click: () => app.quit() },
  ]);
  tray.setContextMenu(contextMenu);
}

export function createTray() {
  const icon = nativeImage.createFromDataURL(
    'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAABAAAAAQCAYAAAAf8/9hAAAA2ElEQVQ4T2NkoBAwUqifgWoGMDIyNjAyMv5nYGD4T8gFjP///2dgZGRsYGJiagBpxmcIyGBGRsYGJiamBmJcADKYiYmpgZGRsQGfIf8ZGBgbmJiYGhgZGRvwGQIKBiYmpgZGRsYGfIaAgoGJiamBkZGxAZ8h/xkYGBuYmJgaGBkZG/AZAgoGJiamBkZGxgZ8hoCCgYmJqYGRkbEBnyH/GRgYG5iYmBoYGRkb8BkCCgYmJqYGRkbGBnyGgIKBiYmpgZGRsQGfIaBgYGJiamBkZGzAZwgAqFBBEQmNF/IAAAAASUVORK5CYII='
  );

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
