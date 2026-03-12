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
    toggleAlwaysOnTop: () => ipcRenderer.invoke('toggle-always-on-top'),
    getLevelData: () => ipcRenderer.invoke('get-level-data'),
    getDailyTokens: () => ipcRenderer.invoke('get-daily-tokens'),
    getSettings: () => ipcRenderer.invoke('get-settings'),
    updateSettings: (settings) => ipcRenderer.invoke('update-settings', settings),
    showPanel: () => ipcRenderer.invoke('show-panel'),
    hidePanel: () => ipcRenderer.invoke('hide-panel'),
    quitApp: () => ipcRenderer.invoke('quit-app'),
    moveWindow: (deltaX, deltaY) => ipcRenderer.send('move-window', deltaX, deltaY),
    openExternal: (url) => ipcRenderer.invoke('open-external', url),
    notifyLevelUp: (level) => ipcRenderer.invoke('notify-level-up', level),
    undock: () => ipcRenderer.invoke('undock'),
    redock: () => ipcRenderer.invoke('redock'),
});
