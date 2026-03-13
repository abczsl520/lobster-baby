// ─── Plugin System Types ───

export type PluginPermission = 'shell' | 'notification' | 'network' | 'clipboard';

export interface PluginManifest {
  id: string;
  name: string;
  version: string;
  description: string;
  author: string;
  homepage?: string;
  entry: string;
  minAppVersion?: string;
  permissions: PluginPermission[];
  icon?: string;
}

export interface PluginRecord {
  version: string;
  enabled: boolean;
  installedAt: string;
  source: 'lbhub' | 'github' | 'url' | 'local';
  sourceUrl?: string;
  permissions: PluginPermission[];
}

export interface InstalledPlugins {
  plugins: Record<string, PluginRecord>;
}

export interface PluginMenuItem {
  id: string;
  label: string;
  pluginId: string;
  onClick: () => void | Promise<void>;
}

export interface PluginModule {
  activate: (api: PluginAPI) => void | Promise<void>;
  deactivate?: () => void | Promise<void>;
}

// The API surface exposed to plugins
export interface PluginAPI {
  menu: {
    add: (item: { label: string; onClick: () => void | Promise<void> }) => string;
    remove: (id: string) => void;
  };
  notify: (message: string, options?: { title?: string; silent?: boolean }) => void;
  shell: {
    exec: (cmd: string) => Promise<{ code: number; stdout: string; stderr: string }>;
  };
  status: {
    get: () => { status: string; level: number; totalTokens: number; dailyTokens: number };
  };
  config: {
    get: (key: string) => any;
    set: (key: string, value: any) => void;
    getAll: () => Record<string, any>;
  };
  on: (event: string, handler: (...args: any[]) => void) => () => void;
  ui: {
    toast: (message: string, duration?: number) => void;
  };
  fetch: (url: string, options?: { method?: string; headers?: Record<string, string>; body?: string }) => Promise<{ status: number; body: string }>;
  fs: {
    readPluginFile: (relativePath: string) => string | null;
  };
  log: (message: string) => void;
}
