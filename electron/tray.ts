import { BrowserWindow, Menu, Tray, nativeImage, shell, app } from 'electron';

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
      label: '🦞 显示龙虾宝宝',
      click: () => { if (win) { win.show(); win.focus(); } },
    },
    {
      label: isOnTop ? '📌 取消置顶' : '📌 置顶',
      click: () => {
        if (win) {
          win.setAlwaysOnTop(!isOnTop);
          updateTrayMenu();
        }
      },
    },
    { type: 'separator' },
    { label: '🔄 重新加载', click: () => win?.reload() },
    { label: '❌ 退出', click: () => app.quit() },
  ]);
  tray.setContextMenu(contextMenu);
}

export function createTray() {
  const icon = nativeImage.createFromDataURL(
    'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAABAAAAAQCAYAAAAf8/9hAAAA2ElEQVQ4T2NkoBAwUqifgWoGMDIyNjAyMv5nYGD4T8gFjP///2dgZGRsYGJiagBpxmcIyGBGRsYGJiamBmJcADKYiYmpgZGRsQGfIf8ZGBgbmJiYGhgZGRvwGQIKBiYmpgZGRsYGfIaAgoGJiamBkZGxAZ8h/xkYGBuYmJgaGBkZG/AZAgoGJiamBkZGxgZ8hoCCgYmJqYGRkbEBnyH/GRgYG5iYmBoYGRkb8BkCCgYmJqYGRkbGBnyGgIKBiYmpgZGRsQGfIaBgYGJiamBkZGzAZwgAqFBBEQmNF/IAAAAASUVORK5CYII='
  );

  tray = new Tray(icon);
  tray.setToolTip('龙虾宝宝 🦞');
  updateTrayMenu();

  tray.on('click', () => {
    const win = getWin();
    if (win) {
      if (win.isVisible()) { win.hide(); }
      else { win.show(); win.focus(); }
    }
  });
}
