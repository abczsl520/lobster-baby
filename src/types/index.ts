export type OpenClawStatus = 'active' | 'idle' | 'error';

export interface TokenInfo {
  daily: number;
  total: number;
}

export interface StatusData {
  status: OpenClawStatus;
  tokenInfo: TokenInfo;
  activeSessions: number;
}

export interface LevelInfo {
  level: number;
  currentTokens: number;
  nextLevelTokens: number;
  progress: number;
  color: string;
  hasCrown: boolean;
  hasGlow: boolean;
  hasParticles: boolean;
  isRainbow: boolean;
}

declare global {
  interface Window {
    electronAPI: {
      onOpenClawStatus: (callback: (data: StatusData) => void) => () => void;
      onUpdateAvailable: (callback: (data: any) => void) => () => void;
      onTogglePanel: (callback: () => void) => () => void;
      onToggleChart: (callback: () => void) => () => void;
      onShowAchievements: (callback: () => void) => () => void;
      onShowSocial: (callback: () => void) => () => void;
      onDockStateChanged: (callback: (state: string | null) => void) => () => void;
      toggleAlwaysOnTop: () => Promise<boolean>;
      getLevelData: () => Promise<{ totalTokens: number }>;
      getDailyTokens: () => Promise<Record<string, number>>;
      getSettings: () => Promise<{ autoFadeEnabled: boolean; idleOpacity?: number }>;
      updateSettings: (settings: Record<string, any>) => Promise<any>;
      showPanel: (route?: string) => Promise<void>;
      hidePanel: () => Promise<void>;
      closePanel: () => Promise<void>;
      onNavigatePanel: (callback: (route: string) => void) => () => void;
      quitApp: () => Promise<void>;
      moveWindow: (deltaX: number, deltaY: number) => void;
      dragEnd: () => void;
      openExternal: (url: string) => Promise<void>;
      notifyLevelUp: (level: number) => Promise<void>;
      undock: () => Promise<void>;
      redock: () => Promise<void>;
      // Social features
      socialRegister: (nickname: string) => Promise<any>;
      socialLogin: () => Promise<any>;
      socialSync: () => Promise<any>;
      socialLeaderboard: (type: string, page: number) => Promise<any>;
      socialPKCreate: () => Promise<any>;
      socialPKJoin: (code: string) => Promise<any>;
      socialProfile: () => Promise<any>;
      socialUpdateProfile: (data: Record<string, any>) => Promise<any>;
      socialDeleteAccount: () => Promise<any>;
      socialGetLocal: () => Promise<{ lobsterId: string | null; nickname: string | null; hasToken: boolean }>;
      socialStats: () => Promise<any>;
      // Plugin features
      pluginList: () => Promise<any[]>;
      pluginEnable: (id: string) => Promise<boolean>;
      pluginDisable: (id: string) => Promise<void>;
      pluginUninstall: (id: string) => Promise<void>;
      pluginInstallUrl: (url: string) => Promise<{ success: boolean; pluginId?: string; error?: string }>;
      pluginFeatured: () => Promise<any[]>;
      pluginSearch: (query: string) => Promise<any[]>;
      pluginMenuItems: () => Promise<any[]>;
      pluginMenuClick: (menuId: string) => Promise<void>;
      onShowPlugins: (callback: () => void) => () => void;
      onPluginToast: (callback: (data: { message: string; duration: number }) => void) => () => void;
      // Remote status
      remoteGenerateToken: () => Promise<{ token?: string; lobsterId?: string; error?: string }>;
      remoteRevokeToken: () => Promise<{ ok?: boolean; error?: string }>;
      remoteGetInfo: () => Promise<{ hasReporterToken: boolean; tokenIssuedAt: string | null; lastHeartbeat: string | null; reporterVersion: string | null; error?: string }>;
      remoteGetStatus: () => Promise<any>;
      remoteSwitchMode: (mode: string) => Promise<{ ok?: boolean; mode?: string; error?: string }>;
      remoteGetMode: () => Promise<{ mode: string }>;
      // SSH Remote Control
      sshGetServers: () => Promise<any[]>;
      sshAddServer: (data: { name: string; host: string; port: number; username: string; authType: string; credential: string }) => Promise<any>;
      sshRemoveServer: (id: string) => Promise<{ success: boolean }>;
      sshConnect: (id: string) => Promise<{ success: boolean; error?: string }>;
      sshDisconnect: (id: string) => Promise<{ success: boolean }>;
      sshTestConnection: (data: { host: string; port: number; username: string; authType: string; credential: string }) => Promise<{ success: boolean; error?: string }>;
      sshOpenClawStatus: (serverId: string) => Promise<any>;
      sshProcessList: (serverId: string) => Promise<any[]>;
      sshSystemInfo: (serverId: string) => Promise<any>;
      sshProcessLogs: (serverId: string, processName: string, lines?: number) => Promise<{ logs?: string; error?: string }>;
      sshRestartProcess: (serverId: string, processName: string) => Promise<{ success: boolean; error?: string }>;
      sshListDir: (serverId: string, path: string) => Promise<{ output?: string; error?: string }>;
      sshReadFile: (serverId: string, path: string) => Promise<{ content?: string; error?: string }>;
      getAutoStart: () => Promise<boolean>;
      setAutoStart: (enabled: boolean) => Promise<boolean>;
    };
  }
}
