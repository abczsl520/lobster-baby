import { contextBridge, ipcRenderer } from 'electron';

contextBridge.exposeInMainWorld('electronAPI', {
  onOpenClawStatus: (callback: (data: any) => void) => {
    const handler = (_event: any, data: any) => callback(data);
    ipcRenderer.on('openclaw-status', handler);
    // Return cleanup function
    return () => ipcRenderer.removeListener('openclaw-status', handler);
  },
  onUpdateAvailable: (callback: (data: any) => void) => {
    const handler = (_event: any, data: any) => callback(data);
    ipcRenderer.on('update-available', handler);
    return () => ipcRenderer.removeListener('update-available', handler);
  },
  onTogglePanel: (callback: () => void) => {
    const handler = () => callback();
    ipcRenderer.on('toggle-panel', handler);
    return () => ipcRenderer.removeListener('toggle-panel', handler);
  },
  onToggleChart: (callback: () => void) => {
    const handler = () => callback();
    ipcRenderer.on('toggle-chart', handler);
    return () => ipcRenderer.removeListener('toggle-chart', handler);
  },
  onShowAchievements: (callback: () => void) => {
    const handler = () => callback();
    ipcRenderer.on('show-achievements', handler);
    return () => ipcRenderer.removeListener('show-achievements', handler);
  },
  onDockStateChanged: (callback: (state: string | null) => void) => {
    const handler = (_event: any, state: string | null) => callback(state);
    ipcRenderer.on('dock-state-changed', handler);
    return () => ipcRenderer.removeListener('dock-state-changed', handler);
  },
  toggleAlwaysOnTop: () => ipcRenderer.invoke('toggle-always-on-top'),
  getLevelData: () => ipcRenderer.invoke('get-level-data'),
  getDailyTokens: () => ipcRenderer.invoke('get-daily-tokens'),
  getSettings: () => ipcRenderer.invoke('get-settings'),
  updateSettings: (settings: Record<string, any>) => ipcRenderer.invoke('update-settings', settings),
  showPanel: () => ipcRenderer.invoke('show-panel'),
  hidePanel: () => ipcRenderer.invoke('hide-panel'),
  quitApp: () => ipcRenderer.invoke('quit-app'),
  moveWindow: (deltaX: number, deltaY: number) => ipcRenderer.send('move-window', deltaX, deltaY),
  dragEnd: () => ipcRenderer.send('drag-end'),
  openExternal: (url: string) => ipcRenderer.invoke('open-external', url),
  notifyLevelUp: (level: number) => ipcRenderer.invoke('notify-level-up', level),
  undock: () => ipcRenderer.invoke('undock'),
  redock: () => ipcRenderer.invoke('redock'),
  // Social features
  socialRegister: (nickname: string) => ipcRenderer.invoke('social-register', nickname),
  socialLogin: () => ipcRenderer.invoke('social-login'),
  socialSync: () => ipcRenderer.invoke('social-sync'),
  socialLeaderboard: (type: string, page: number) => ipcRenderer.invoke('social-leaderboard', type, page),
  socialPKCreate: () => ipcRenderer.invoke('social-pk-create'),
  socialPKJoin: (code: string) => ipcRenderer.invoke('social-pk-join', code),
  socialProfile: () => ipcRenderer.invoke('social-profile'),
  socialUpdateProfile: (data: Record<string, any>) => ipcRenderer.invoke('social-update-profile', data),
  socialDeleteAccount: () => ipcRenderer.invoke('social-delete-account'),
  socialGetLocal: () => ipcRenderer.invoke('social-get-local'),
  socialStats: () => ipcRenderer.invoke('social-stats'),
});
