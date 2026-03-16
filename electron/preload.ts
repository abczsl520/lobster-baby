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
  onShowSocial: (callback: () => void) => {
    const handler = () => callback();
    ipcRenderer.on('show-social', handler);
    return () => ipcRenderer.removeListener('show-social', handler);
  },
  onDockStateChanged: (callback: (state: string | null) => void) => {
    const handler = (_event: any, state: string | null) => callback(state);
    ipcRenderer.on('dock-state-changed', handler);
    return () => ipcRenderer.removeListener('dock-state-changed', handler);
  },
  toggleAlwaysOnTop: () => ipcRenderer.invoke('toggle-always-on-top'),
  getLevelData: () => ipcRenderer.invoke('get-level-data'),
  getDailyTokens: () => ipcRenderer.invoke('get-daily-tokens'),
  exportTokenCSV: () => ipcRenderer.invoke('export-token-csv'),
  backupData: () => ipcRenderer.invoke('backup-data'),
  restoreData: () => ipcRenderer.invoke('restore-data'),
  getSettings: () => ipcRenderer.invoke('get-settings'),
  updateSettings: (settings: Record<string, any>) => ipcRenderer.invoke('update-settings', settings),
  showPanel: (route?: string) => ipcRenderer.invoke('show-panel', route),
  hidePanel: () => ipcRenderer.invoke('hide-panel'),
  closePanel: () => ipcRenderer.invoke('close-panel'),
  onNavigatePanel: (callback: (route: string) => void) => {
    const handler = (_event: any, route: string) => callback(route);
    ipcRenderer.on('navigate-panel', handler);
    return () => ipcRenderer.removeListener('navigate-panel', handler);
  },
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
  // Plugin features
  pluginList: () => ipcRenderer.invoke('plugin-list'),
  pluginEnable: (id: string) => ipcRenderer.invoke('plugin-enable', id),
  pluginDisable: (id: string) => ipcRenderer.invoke('plugin-disable', id),
  pluginUninstall: (id: string) => ipcRenderer.invoke('plugin-uninstall', id),
  pluginInstallUrl: (url: string) => ipcRenderer.invoke('plugin-install-url', url),
  pluginFeatured: () => ipcRenderer.invoke('plugin-featured'),
  pluginSearch: (query: string) => ipcRenderer.invoke('plugin-search', query),
  pluginMenuItems: () => ipcRenderer.invoke('plugin-menu-items'),
  pluginMenuClick: (menuId: string) => ipcRenderer.invoke('plugin-menu-click', menuId),
  onShowPlugins: (callback: () => void) => {
    const handler = () => callback();
    ipcRenderer.on('show-plugins', handler);
    return () => ipcRenderer.removeListener('show-plugins', handler);
  },
  onPluginToast: (callback: (data: { message: string; duration: number }) => void) => {
    const handler = (_event: any, data: any) => callback(data);
    ipcRenderer.on('plugin-toast', handler);
    return () => ipcRenderer.removeListener('plugin-toast', handler);
  },
  // SSH Remote Control
  sshGetServers: () => ipcRenderer.invoke('ssh-get-servers'),
  sshAddServer: (data: { name: string; host: string; port: number; username: string; authType: string; credential: string }) => ipcRenderer.invoke('ssh-add-server', data),
  sshRemoveServer: (id: string) => ipcRenderer.invoke('ssh-remove-server', id),
  sshConnect: (id: string) => ipcRenderer.invoke('ssh-connect', id),
  sshDisconnect: (id: string) => ipcRenderer.invoke('ssh-disconnect', id),
  sshTestConnection: (data: { host: string; port: number; username: string; authType: string; credential: string }) => ipcRenderer.invoke('ssh-test-connection', data),
  sshOpenClawStatus: (serverId: string) => ipcRenderer.invoke('ssh-openclaw-status', serverId),
  sshRemoteTokens: (serverId: string) => ipcRenderer.invoke('ssh-remote-tokens', serverId),
  sshProcessList: (serverId: string) => ipcRenderer.invoke('ssh-process-list', serverId),
  sshSystemInfo: (serverId: string) => ipcRenderer.invoke('ssh-system-info', serverId),
  sshProcessLogs: (serverId: string, processName: string, lines?: number) => ipcRenderer.invoke('ssh-process-logs', serverId, processName, lines),
  sshRestartProcess: (serverId: string, processName: string) => ipcRenderer.invoke('ssh-restart-process', serverId, processName),
  sshListDir: (serverId: string, path: string) => ipcRenderer.invoke('ssh-list-dir', serverId, path),
  sshReadFile: (serverId: string, path: string) => ipcRenderer.invoke('ssh-read-file', serverId, path),
  // Settings
  getAutoStart: () => ipcRenderer.invoke('get-auto-start'),
  setAutoStart: (enabled: boolean) => ipcRenderer.invoke('set-auto-start', enabled),
});
