// electron/updater.ts — Auto-update via electron-updater (GitHub Releases)
import { ipcMain, BrowserWindow } from 'electron';
import { autoUpdater, UpdateInfo } from 'electron-updater';
import { log, logError } from './logger';

let mainWindowGetter: () => BrowserWindow | null = () => null;

function send(channel: string, data: any) {
  const win = mainWindowGetter();
  if (win && !win.isDestroyed()) win.webContents.send(channel, data);
}

export function initAutoUpdater(getMainWindow: () => BrowserWindow | null) {
  mainWindowGetter = getMainWindow;

  autoUpdater.autoDownload = false;
  autoUpdater.autoInstallOnAppQuit = true;
  autoUpdater.allowDowngrade = false;

  autoUpdater.on('checking-for-update', () => {
    log('Updater: checking for update...');
    send('updater-status', { status: 'checking' });
  });

  autoUpdater.on('update-available', (info: UpdateInfo) => {
    log(`Updater: update available — v${info.version}`);
    send('updater-status', {
      status: 'available',
      version: info.version,
      releaseNotes: typeof info.releaseNotes === 'string' ? info.releaseNotes : '',
      releaseDate: info.releaseDate,
    });
  });

  autoUpdater.on('update-not-available', () => {
    log('Updater: up to date');
    send('updater-status', { status: 'up-to-date' });
  });

  autoUpdater.on('download-progress', (progress) => {
    send('updater-status', {
      status: 'downloading',
      percent: Math.round(progress.percent),
      transferred: progress.transferred,
      total: progress.total,
      bytesPerSecond: progress.bytesPerSecond,
    });
  });

  autoUpdater.on('update-downloaded', (info: UpdateInfo) => {
    log(`Updater: downloaded v${info.version}, ready to install`);
    send('updater-status', {
      status: 'downloaded',
      version: info.version,
    });
  });

  autoUpdater.on('error', (err) => {
    logError(`Updater error: ${err.message}`);
    send('updater-status', { status: 'error', error: err.message });
  });

  // IPC handlers
  ipcMain.handle('updater-check', async () => {
    try {
      const result = await autoUpdater.checkForUpdates();
      return { ok: true, version: result?.updateInfo?.version };
    } catch (err: any) {
      return { ok: false, error: err.message };
    }
  });

  ipcMain.handle('updater-download', async () => {
    try {
      await autoUpdater.downloadUpdate();
      return { ok: true };
    } catch (err: any) {
      return { ok: false, error: err.message };
    }
  });

  ipcMain.handle('updater-install', () => {
    autoUpdater.quitAndInstall(false, true);
  });
}

export function checkForUpdatesQuiet() {
  autoUpdater.checkForUpdates().catch(() => {});
}
