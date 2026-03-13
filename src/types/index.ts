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
      onDockStateChanged: (callback: (state: string | null) => void) => () => void;
      toggleAlwaysOnTop: () => Promise<boolean>;
      getLevelData: () => Promise<{ totalTokens: number }>;
      getDailyTokens: () => Promise<Record<string, number>>;
      getSettings: () => Promise<{ autoFadeEnabled: boolean }>;
      updateSettings: (settings: Record<string, any>) => Promise<any>;
      showPanel: () => Promise<void>;
      hidePanel: () => Promise<void>;
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
    };
  }
}
