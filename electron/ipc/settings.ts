/**
 * Settings & utility IPC Handlers
 */
import { ipcMain, app, shell, Notification, BrowserWindow } from 'electron';
import { readStore, writeStore } from '../store';
import { scanRealTokenUsage, scanDailyTokens } from '../scanner';
import * as dock from '../dock';
import { updateTrayMenu } from '../tray';
import { log } from '../logger';
import { t } from '../i18n-main';

export function registerSettingsIPC(getMainWindow: () => BrowserWindow | null) {
  ipcMain.handle('toggle-always-on-top', () => {
    const win = getMainWindow();
    if (!win || win.isDestroyed()) return false;
    const isOnTop = win.isAlwaysOnTop();
    win.setAlwaysOnTop(!isOnTop);
    updateTrayMenu();
    return !isOnTop;
  });

  ipcMain.handle('get-level-data', () => {
    const realTokens = scanRealTokenUsage();
    if (realTokens > 0) return { totalTokens: realTokens };
    return { totalTokens: readStore().totalTokens || 0 };
  });

  ipcMain.handle('get-daily-tokens', () => scanDailyTokens(30));

  ipcMain.handle('export-token-csv', async () => {
    const data = scanDailyTokens(90); // Last 90 days
    const rows = ['Date,Tokens'];
    const sorted = Object.entries(data).sort(([a], [b]) => a.localeCompare(b));
    for (const [date, tokens] of sorted) {
      rows.push(`${date},${tokens}`);
    }
    const csv = rows.join('\n');
    const { dialog } = await import('electron');
    const { filePath } = await dialog.showSaveDialog({
      defaultPath: `lobster-tokens-${new Date().toISOString().slice(0, 10)}.csv`,
      filters: [{ name: 'CSV', extensions: ['csv'] }],
    });
    if (filePath) {
      const fs = await import('fs');
      fs.writeFileSync(filePath, csv);
      return { success: true, path: filePath };
    }
    return { success: false };
  });

  ipcMain.handle('get-settings', () => readStore().settings || { autoFadeEnabled: false });

  ipcMain.handle('update-settings', (_event, settings: Record<string, any>) => {
    if (settings && typeof settings === 'object') {
      delete settings.__proto__;
      delete settings.constructor;
      delete settings.prototype;
    }
    const store = readStore();
    store.settings = { ...store.settings, ...settings };
    writeStore(store);
    return store.settings;
  });

  ipcMain.handle('undock', () => dock.undockFromEdge());
  ipcMain.handle('redock', () => dock.scheduleDock(2000));

  ipcMain.handle('quit-app', () => app.quit());
  ipcMain.handle('open-external', async (_event, url: string) => {
    if (typeof url !== 'string' || !(url.startsWith('https://') || url.startsWith('http://'))) return;
    await shell.openExternal(url);
  });

  ipcMain.handle('notify-level-up', (_event, level: number) => {
    if (typeof level !== 'number' || level < 1 || level > 10) return;
    const name = t(`levelName.${level}`) || `Lv.${level}`;
    log(`Level up! Now Lv.${level} (${name})`);
    if (Notification.isSupported()) {
      new Notification({ title: t('levelUp.title'), body: t('levelUp.body', { level, name }), silent: false }).show();
    }
  });

  ipcMain.handle('get-auto-start', () => app.getLoginItemSettings().openAtLogin);
  ipcMain.handle('set-auto-start', (_event, enabled: boolean) => {
    app.setLoginItemSettings({ openAtLogin: enabled, openAsHidden: false });
    const store = readStore();
    store.autoStartEnabled = enabled;
    writeStore(store);
    return enabled;
  });

  // ─── Backup / Restore ───
  ipcMain.handle('backup-data', async () => {
    const { dialog } = await import('electron');
    const fs = await import('fs');
    const path = await import('path');
    const userData = app.getPath('userData');
    const store = readStore();
    const backup = {
      version: 1,
      date: new Date().toISOString(),
      store,
      plugins: {} as Record<string, any>,
    };
    // Include plugin configs
    const configDir = path.join(userData, 'plugin-configs');
    try {
      if (fs.existsSync(configDir)) {
        for (const file of fs.readdirSync(configDir)) {
          if (file.endsWith('.json')) {
            backup.plugins[file] = JSON.parse(fs.readFileSync(path.join(configDir, file), 'utf-8'));
          }
        }
      }
    } catch { /* ok */ }
    const { filePath } = await dialog.showSaveDialog({
      defaultPath: `lobster-backup-${new Date().toISOString().slice(0, 10)}.json`,
      filters: [{ name: 'JSON', extensions: ['json'] }],
    });
    if (filePath) {
      fs.writeFileSync(filePath, JSON.stringify(backup, null, 2));
      return { success: true };
    }
    return { success: false };
  });

  ipcMain.handle('restore-data', async () => {
    const { dialog } = await import('electron');
    const fs = await import('fs');
    const { filePaths } = await dialog.showOpenDialog({
      filters: [{ name: 'JSON', extensions: ['json'] }],
      properties: ['openFile'],
    });
    if (!filePaths || filePaths.length === 0) return { success: false };
    try {
      const raw = JSON.parse(fs.readFileSync(filePaths[0], 'utf-8'));
      if (!raw.version || !raw.store) return { success: false, error: 'Invalid backup file' };
      writeStore(raw.store);
      log('Data restored from backup');
      return { success: true };
    } catch (e: any) {
      return { success: false, error: e.message };
    }
  });
}
