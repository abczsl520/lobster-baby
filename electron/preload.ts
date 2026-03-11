import { contextBridge, ipcRenderer } from 'electron';

contextBridge.exposeInMainWorld('electronAPI', {
  onOpenClawStatus: (callback: (data: any) => void) => {
    const handler = (_event: any, data: any) => callback(data);
    ipcRenderer.on('openclaw-status', handler);
    // Return cleanup function
    return () => ipcRenderer.removeListener('openclaw-status', handler);
  },
  toggleAlwaysOnTop: () => ipcRenderer.invoke('toggle-always-on-top'),
  getLevelData: () => ipcRenderer.invoke('get-level-data'),
  showPanel: () => ipcRenderer.invoke('show-panel'),
  hidePanel: () => ipcRenderer.invoke('hide-panel'),
  quitApp: () => ipcRenderer.invoke('quit-app'),
  moveWindow: (deltaX: number, deltaY: number) => ipcRenderer.send('move-window', deltaX, deltaY),
});
