import { contextBridge, ipcRenderer } from 'electron';
contextBridge.exposeInMainWorld('electronAPI', {
    onOpenClawStatus: (callback) => {
        const handler = (_event, data) => callback(data);
        ipcRenderer.on('openclaw-status', handler);
        // Return cleanup function
        return () => ipcRenderer.removeListener('openclaw-status', handler);
    },
    onUpdateAvailable: (callback) => {
        const handler = (_event, data) => callback(data);
        ipcRenderer.on('update-available', handler);
        return () => ipcRenderer.removeListener('update-available', handler);
    },
    onTogglePanel: (callback) => {
        const handler = () => callback();
        ipcRenderer.on('toggle-panel', handler);
        return () => ipcRenderer.removeListener('toggle-panel', handler);
    },
    onToggleChart: (callback) => {
        const handler = () => callback();
        ipcRenderer.on('toggle-chart', handler);
        return () => ipcRenderer.removeListener('toggle-chart', handler);
    },
    onShowAchievements: (callback) => {
        const handler = () => callback();
        ipcRenderer.on('show-achievements', handler);
        return () => ipcRenderer.removeListener('show-achievements', handler);
    },
    onDockStateChanged: (callback) => {
        const handler = (_event, state) => callback(state);
        ipcRenderer.on('dock-state-changed', handler);
        return () => ipcRenderer.removeListener('dock-state-changed', handler);
    },
    toggleAlwaysOnTop: () => ipcRenderer.invoke('toggle-always-on-top'),
    getLevelData: () => ipcRenderer.invoke('get-level-data'),
    getDailyTokens: () => ipcRenderer.invoke('get-daily-tokens'),
    getSettings: () => ipcRenderer.invoke('get-settings'),
    updateSettings: (settings) => ipcRenderer.invoke('update-settings', settings),
    showPanel: () => ipcRenderer.invoke('show-panel'),
    hidePanel: () => ipcRenderer.invoke('hide-panel'),
    quitApp: () => ipcRenderer.invoke('quit-app'),
    moveWindow: (deltaX, deltaY) => ipcRenderer.send('move-window', deltaX, deltaY),
    dragEnd: () => ipcRenderer.send('drag-end'),
    openExternal: (url) => ipcRenderer.invoke('open-external', url),
    notifyLevelUp: (level) => ipcRenderer.invoke('notify-level-up', level),
    undock: () => ipcRenderer.invoke('undock'),
    redock: () => ipcRenderer.invoke('redock'),
    // Social features
    socialRegister: (nickname) => ipcRenderer.invoke('social-register', nickname),
    socialLogin: () => ipcRenderer.invoke('social-login'),
    socialSync: () => ipcRenderer.invoke('social-sync'),
    socialLeaderboard: (type, page) => ipcRenderer.invoke('social-leaderboard', type, page),
    socialPKCreate: () => ipcRenderer.invoke('social-pk-create'),
    socialPKJoin: (code) => ipcRenderer.invoke('social-pk-join', code),
    socialProfile: () => ipcRenderer.invoke('social-profile'),
    socialUpdateProfile: (data) => ipcRenderer.invoke('social-update-profile', data),
    socialDeleteAccount: () => ipcRenderer.invoke('social-delete-account'),
    socialGetLocal: () => ipcRenderer.invoke('social-get-local'),
    socialStats: () => ipcRenderer.invoke('social-stats'),
});
