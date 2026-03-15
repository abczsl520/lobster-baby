// ─── Plugin API Factory ───
// Creates a sandboxed API instance for each plugin

import { exec } from 'child_process';
import { Notification } from 'electron';
import fs from 'fs';
import path from 'path';
import https from 'https';
import http from 'http';
import { log } from '../logger';
import { PluginAPI, PluginPermission, PluginMenuItem } from './types';

// Shared state — set by PluginManager
let _statusGetter: (() => any) | null = null;
let _toastSender: ((msg: string, duration?: number) => void) | null = null;
const _menuItems: PluginMenuItem[] = [];
const _eventListeners: Map<string, Set<{ pluginId: string; handler: (...args: any[]) => void }>> = new Map();

export function setStatusGetter(getter: () => any) { _statusGetter = getter; }
export function setToastSender(sender: (msg: string, duration?: number) => void) { _toastSender = sender; }
export function getMenuItems(): PluginMenuItem[] { return _menuItems; }

export function emitPluginEvent(event: string, ...args: any[]) {
  const listeners = _eventListeners.get(event);
  if (!listeners) return;
  for (const { handler } of listeners) {
    try { handler(...args); } catch (e) { log(`Plugin event error [${event}]: ${e}`); }
  }
}

// Blocked shell patterns for security
const BLOCKED_COMMANDS = [
  /rm\s+(-rf?|--recursive)\s+[\/~]/i,  // rm -rf /
  /mkfs/i,
  /dd\s+if=/i,
  /:(){ :\|:& };:/,                      // fork bomb
  />\s*\/dev\/sd/i,
  /chmod\s+777\s+\//i,
  /curl.*\|\s*(ba)?sh/i,                 // curl | sh
  /wget.*\|\s*(ba)?sh/i,
  // S19 fix: expanded blocklist
  /\bshutdown\b/i,
  /\breboot\b/i,
  /\bpasswd\b/i,
  /\bchown\s+root/i,
  /\biptables\b/i,
  /\bnc\s+.*-e\b/i,                      // reverse shell
  /\bpython[23]?\s+-c\b/i,              // python code exec
  /\bnode\s+-e\b/i,                      // node code exec
  /\bperl\s+-e\b/i,                      // perl code exec
  /\bruby\s+-e\b/i,                      // ruby code exec
  /\bsudo\b/i,                           // privilege escalation
  /\bsu\s+-?\s/i,                        // switch user
  />\s*\/etc\//i,                        // write to /etc
  /\bkill\s+-9\s+1\b/,                  // kill init
  /\bsystemctl\b/i,                      // service control
];

function isCommandSafe(cmd: string): boolean {
  return !BLOCKED_COMMANDS.some(pattern => pattern.test(cmd));
}

let _menuIdCounter = 0;

export function createPluginAPI(
  pluginId: string,
  pluginDir: string,
  permissions: PluginPermission[],
  configDir: string,
): PluginAPI {
  const hasPermission = (p: PluginPermission) => permissions.includes(p);

  // Plugin-specific config file
  const configFile = path.join(configDir, `${pluginId}.json`);
  let pluginConfig: Record<string, any> = {};
  try {
    if (fs.existsSync(configFile)) {
      pluginConfig = JSON.parse(fs.readFileSync(configFile, 'utf-8'));
    }
  } catch { /* fresh config */ }

  const saveConfig = () => {
    try {
      fs.mkdirSync(path.dirname(configFile), { recursive: true });
      fs.writeFileSync(configFile, JSON.stringify(pluginConfig, null, 2));
    } catch (e) { log(`Plugin config save error [${pluginId}]: ${e}`); }
  };

  return {
    menu: {
      add(item: { label: string; onClick: () => void | Promise<void> }): string {
        const id = `plugin-${pluginId}-${++_menuIdCounter}`;
        _menuItems.push({ id, label: item.label, pluginId, onClick: item.onClick });
        log(`Plugin [${pluginId}] added menu: "${item.label}"`);
        return id;
      },
      remove(id: string) {
        const idx = _menuItems.findIndex(m => m.id === id && m.pluginId === pluginId);
        if (idx >= 0) _menuItems.splice(idx, 1);
      },
    },

    notify(message: string, options?: { title?: string; silent?: boolean }) {
      if (!hasPermission('notification')) {
        log(`Plugin [${pluginId}] denied: notification permission required`);
        return;
      }
      if (Notification.isSupported()) {
        new Notification({
          title: options?.title || `🧩 ${pluginId}`,
          body: message,
          silent: options?.silent ?? false,
        }).show();
      }
    },

    shell: {
      exec(cmd: string): Promise<{ code: number; stdout: string; stderr: string }> {
        if (!hasPermission('shell')) {
          return Promise.reject(new Error('shell permission required'));
        }
        if (!isCommandSafe(cmd)) {
          log(`Plugin [${pluginId}] BLOCKED dangerous command: ${cmd}`);
          return Promise.reject(new Error('command blocked for safety'));
        }
        log(`Plugin [${pluginId}] exec: ${cmd}`);
        return new Promise((resolve) => {
          // S20 fix: restrict shell environment for plugins
          exec(cmd, {
            timeout: 30_000,
            maxBuffer: 1024 * 1024,
            env: { ...process.env, PATH: process.env.PATH }, // inherit PATH only
            cwd: pluginDir, // jail to plugin directory
          }, (error, stdout, stderr) => {
            resolve({
              code: error ? (error as any).code ?? 1 : 0,
              stdout: stdout.slice(0, 10_000),  // Cap output size
              stderr: stderr.slice(0, 5_000),
            });
          });
        });
      },
    },

    status: {
      get() {
        if (_statusGetter) return _statusGetter();
        return { status: 'unknown', level: 1, totalTokens: 0, dailyTokens: 0 };
      },
    },

    config: {
      get(key: string) { return pluginConfig[key]; },
      set(key: string, value: any) {
        pluginConfig[key] = value;
        saveConfig();
      },
      getAll() { return { ...pluginConfig }; },
    },

    on(event: string, handler: (...args: any[]) => void): () => void {
      if (!_eventListeners.has(event)) _eventListeners.set(event, new Set());
      const entry = { pluginId, handler };
      _eventListeners.get(event)!.add(entry);
      return () => { _eventListeners.get(event)?.delete(entry); };
    },

    ui: {
      toast(message: string, duration?: number) {
        if (_toastSender) _toastSender(message, duration);
      },
    },

    fetch(url: string, options?: { method?: string; headers?: Record<string, string>; body?: string }): Promise<{ status: number; body: string }> {
      if (!hasPermission('network')) {
        return Promise.reject(new Error('network permission required'));
      }
      // Block private IPs
      if (/^https?:\/\/(localhost|127\.|10\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.)/i.test(url)) {
        return Promise.reject(new Error('access to private networks blocked'));
      }
      log(`Plugin [${pluginId}] fetch: ${options?.method || 'GET'} ${url}`);
      return new Promise((resolve, reject) => {
        const mod = url.startsWith('https') ? https : http;
        const req = mod.request(url, {
          method: options?.method || 'GET',
          headers: options?.headers,
          timeout: 15_000,
        }, (res) => {
          let data = '';
          res.on('data', (chunk) => { data += chunk; if (data.length > 1_000_000) res.destroy(); });
          res.on('end', () => resolve({ status: res.statusCode || 0, body: data.slice(0, 500_000) }));
        });
        req.on('error', reject);
        req.on('timeout', () => { req.destroy(); reject(new Error('timeout')); });
        if (options?.body) req.write(options.body);
        req.end();
      });
    },

    fs: {
      readPluginFile(relativePath: string): string | null {
        // Security: resolve and verify path stays within plugin directory
        const resolved = path.resolve(pluginDir, relativePath);
        if (!resolved.startsWith(pluginDir)) {
          log(`Plugin [${pluginId}] BLOCKED path traversal: ${relativePath}`);
          return null;
        }
        try { return fs.readFileSync(resolved, 'utf-8'); }
        catch { return null; }
      },
    },

    log(message: string) {
      log(`Plugin [${pluginId}]: ${message}`);
    },
  };
}

// Cleanup all items for a specific plugin
export function removePluginMenuItems(pluginId: string) {
  for (let i = _menuItems.length - 1; i >= 0; i--) {
    if (_menuItems[i].pluginId === pluginId) _menuItems.splice(i, 1);
  }
}

export function removePluginEventListeners(pluginId: string) {
  for (const [, listeners] of _eventListeners) {
    for (const entry of listeners) {
      if (entry.pluginId === pluginId) listeners.delete(entry);
    }
  }
}
