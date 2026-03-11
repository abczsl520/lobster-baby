import { contextBridge, ipcRenderer } from 'electron';
contextBridge.exposeInMainWorld('electronAPI', {
    onOpenClawStatus: (callback) => {
        const handler = (_event, data) => callback(data);
        ipcRenderer.on('openclaw-status', handler);
        // Return cleanup function
        return () => ipcRenderer.removeListener('openclaw-status', handler);
    },
    toggleAlwaysOnTop: () => ipcRenderer.invoke('toggle-always-on-top'),
    getLevelData: () => ipcRenderer.invoke('get-level-data'),
    showPanel: () => ipcRenderer.invoke('show-panel'),
    hidePanel: () => ipcRenderer.invoke('hide-panel'),
    quitApp: () => ipcRenderer.invoke('quit-app'),
    moveWindow: (deltaX, deltaY) => ipcRenderer.send('move-window', deltaX, deltaY),
    openExternal: (url) => ipcRenderer.invoke('open-external', url),
});
