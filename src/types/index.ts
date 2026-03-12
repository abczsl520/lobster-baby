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
      toggleAlwaysOnTop: () => Promise<boolean>;
      getLevelData: () => Promise<{ totalTokens: number }>;
      getDailyTokens: () => Promise<Record<string, number>>;
      showPanel: () => Promise<void>;
      hidePanel: () => Promise<void>;
      quitApp: () => Promise<void>;
      moveWindow: (deltaX: number, deltaY: number) => void;
      openExternal: (url: string) => Promise<void>;
      notifyLevelUp: (level: number) => Promise<void>;
    };
  }
}
