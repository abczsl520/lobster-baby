/**
 * Social IPC Handlers — registration, login, sync, leaderboard, PK, profile
 */
import { ipcMain } from 'electron';
import { readStore, writeStore } from '../store';
import { scanRealTokenUsage } from '../scanner';
import * as social from '../social';
import { t } from '../i18n-main';

const THRESHOLDS = [0, 50000000, 200000000, 500000000, 1000000000, 2500000000, 5000000000, 10000000000, 25000000000, 50000000000];
const ACHIEVEMENT_THRESHOLDS = [1e6, 1e7, 1e8, 1e9, 5e9, 1e10, 5e10];

export function calcLevel(tokens: number): number {
  let level = 1;
  for (let i = THRESHOLDS.length - 1; i >= 0; i--) {
    if (tokens >= THRESHOLDS[i]) { level = i + 1; break; }
  }
  return level;
}

export { ACHIEVEMENT_THRESHOLDS };

export function registerSocialIPC() {
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
      if (!store.socialToken) return { error: t('social.notRegistered') };
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
      if (!store.socialToken) return { error: t('social.notRegistered') };
      return await social.socialCreatePK(store.socialToken);
    } catch (err: any) { return { error: err.message }; }
  });

  ipcMain.handle('social-pk-join', async (_event, code: string) => {
    try {
      const store = readStore();
      if (!store.socialToken) return { error: t('social.notRegistered') };
      return await social.socialJoinPK(store.socialToken, code);
    } catch (err: any) { return { error: err.message }; }
  });

  ipcMain.handle('social-profile', async () => {
    try {
      const store = readStore();
      if (!store.socialToken) return { error: t('social.notRegistered') };
      return await social.socialGetProfile(store.socialToken);
    } catch (err: any) { return { error: err.message }; }
  });

  ipcMain.handle('social-update-profile', async (_event, data: Record<string, any>) => {
    try {
      const store = readStore();
      if (!store.socialToken) return { error: t('social.notRegistered') };
      return await social.socialUpdateProfile(store.socialToken, data);
    } catch (err: any) { return { error: err.message }; }
  });

  ipcMain.handle('social-delete-account', async () => {
    try {
      const store = readStore();
      if (!store.socialToken) return { error: t('social.notRegistered') };
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
}

/** Auto-sync social data every hour */
export function startSocialSync() {
  const store = readStore();
  if (!store.socialToken && !store.lobsterId) {
    social.socialLogin().then(result => {
      if (result.success) {
        const s = readStore();
        s.socialToken = result.token; s.lobsterId = result.lobster_id; s.socialNickname = result.nickname;
        writeStore(s);
      }
    }).catch(() => {});
  }

  const doSync = async () => {
    try {
      const store = readStore();
      if (!store.socialToken) return;
      const realTokens = scanRealTokenUsage();
      const level = calcLevel(realTokens);
      const achievements = ACHIEVEMENT_THRESHOLDS.filter(t => realTokens >= t).length;
      const dailyTokens = Math.max(0, realTokens - (store.dailyTokensBaseline || 0));
      await social.socialSync(store.socialToken, realTokens, level, achievements, dailyTokens);
    } catch { /* ignore */ }
  };

  setTimeout(doSync, 30000);
  setInterval(doSync, 60 * 60 * 1000);
}
