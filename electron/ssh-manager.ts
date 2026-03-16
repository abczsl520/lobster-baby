// electron/ssh-manager.ts — SSH connection manager for Lobster Baby
// Provides secure SSH connections to remote servers for OpenClaw monitoring

// ssh2 is loaded at runtime via require() to avoid Vite/Rollup bundling issues
// with native .node binaries
let ssh2Module: any = null;
function getSSH2() {
  if (!ssh2Module) {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    ssh2Module = require('ssh2');
  }
  return ssh2Module;
}

import { safeStorage } from 'electron';
import { log } from './logger';
import { readStore, writeStore } from './store';

// ─── Types ───

export interface SSHServer {
  id: string;
  name: string;
  host: string;
  port: number;
  username: string;
  authType: 'password' | 'key';
  // Encrypted at rest via safeStorage
  encryptedCredential?: string;
  lastConnected?: string;
  lastStatus?: 'online' | 'offline' | 'error';
  lastError?: string;
}

export interface SSHCommandResult {
  stdout: string;
  stderr: string;
  code: number;
}

export interface OpenClawRemoteStatus {
  connected: boolean;
  server?: string;
  status?: string;
  activeSessions?: number;
  totalTokens?: number;
  uptime?: string;
  processes?: ProcessInfo[];
  systemInfo?: SystemInfo;
  error?: string;
}

export interface ProcessInfo {
  name: string;
  pid: number;
  status: string;
  cpu: string;
  memory: string;
  uptime: string;
}

export interface SystemInfo {
  hostname: string;
  uptime: string;
  loadAvg: string;
  memTotal: string;
  memUsed: string;
  memPercent: number;
  diskTotal: string;
  diskUsed: string;
  diskPercent: number;
}

// ─── Command Whitelist ───

const SAFE_COMMANDS: Record<string, RegExp> = {
  'openclaw-status':     /^openclaw status --json --log-level silent$/,
  'openclaw-cron':       /^openclaw cron list --json --log-level silent$/,
  'sessions-json':       /^cat ~\/.openclaw\/agents\/main\/sessions\/sessions\.json$/,
  'pm2-list':            /^pm2 jlist$/,
  'uptime':              /^uptime$/,
  'memory':              /^cat \/proc\/meminfo$/,
  'disk':                /^df -h$/,
  'hostname':            /^hostname$/,
  'load':                /^cat \/proc\/loadavg$/,
  // S1 FIX: tail-log restricted to /opt/apps/ only, no path traversal (..)
  'tail-log':            /^tail -n \d{1,4} \/opt\/apps\/[a-zA-Z0-9_-]+\/[a-zA-Z0-9_.-]+\.log$/,
  'ls-dir':              /^ls -la \/opt\/apps\/[a-zA-Z0-9_-]+\/?$/,
  // S2 FIX: cat-file NO .env/.conf/.cfg (secrets!), single subdir only, no path traversal
  'cat-file':            /^cat \/opt\/apps\/[a-zA-Z0-9_-]+\/[a-zA-Z0-9_.-]+\.(js|ts|json|md|txt|yml|yaml)$/,
  // S9 FIX: process name max 50 chars
  'pm2-restart':         /^pm2 restart [a-zA-Z0-9_-]{1,50}$/,
  'pm2-stop':            /^pm2 stop [a-zA-Z0-9_-]{1,50}$/,
  'pm2-logs':            /^pm2 logs [a-zA-Z0-9_-]{1,50} --lines \d{1,4} --nostream$/,
};

// Dangerous patterns — always rejected
const FORBIDDEN_PATTERNS = [
  /rm\s/i, /rmdir/i, /dd\s/i, /mkfs/i,
  /chmod/i, /chown/i, /chgrp/i,
  /curl\s.*\|\s*(bash|sh)/i, /wget\s.*\|\s*(bash|sh)/i,
  />\s*\//, />>/, /\|/, /;/, /&&/, /\|\|/, /\$\(/, /`/,
  /sudo/i, /su\s/i,
  /passwd/i, /shadow/i, /\.ssh\//,
  /eval\s/i, /exec\s/i, /source\s/i,
  /\.\./, // S1/S2/S3: block path traversal
  /\.env/i, // S8: block any .env files (even .env.json, .env.backup)
];

function isCommandAllowed(cmd: string): { allowed: boolean; level: number; reason?: string } {
  const trimmed = cmd.trim();
  
  // Check forbidden patterns first
  for (const pattern of FORBIDDEN_PATTERNS) {
    if (pattern.test(trimmed)) {
      return { allowed: false, level: 3, reason: `Forbidden pattern: ${pattern}` };
    }
  }
  
  // Check whitelist
  for (const [name, regex] of Object.entries(SAFE_COMMANDS)) {
    if (regex.test(trimmed)) {
      // Determine level
      if (name.startsWith('pm2-restart') || name.startsWith('pm2-stop')) {
        return { allowed: true, level: 2 }; // Dangerous — needs confirm
      }
      if (name.startsWith('tail-') || name.startsWith('ls-') || name.startsWith('cat-') || name.startsWith('pm2-logs')) {
        return { allowed: true, level: 1 }; // Moderate
      }
      return { allowed: true, level: 0 }; // Safe
    }
  }
  
  return { allowed: false, level: 3, reason: 'Command not in whitelist' };
}

// ─── Credential Encryption ───

function encryptCredential(plaintext: string): string {
  if (!safeStorage.isEncryptionAvailable()) {
    throw new Error('System encryption unavailable — cannot safely store credentials');
  }
  return safeStorage.encryptString(plaintext).toString('base64');
}

function decryptCredential(encrypted: string): string {
  if (!safeStorage.isEncryptionAvailable()) {
    throw new Error('System encryption unavailable — cannot decrypt credentials');
  }
  return safeStorage.decryptString(Buffer.from(encrypted, 'base64'));
}

// ─── SSH Manager Class ───

export class SSHManager {
  private connections: Map<string, any> = new Map();  // ssh2.Client instances
  private connecting: Map<string, boolean> = new Map();
  
  // ─── Server CRUD ───
  
  getServers(): SSHServer[] {
    const store = readStore();
    return store.sshServers || [];
  }
  
  addServer(server: Omit<SSHServer, 'id' | 'encryptedCredential'>, credential: string): SSHServer {
    const store = readStore();
    if (!store.sshServers) store.sshServers = [];
    
    // Limit to 10 servers
    if (store.sshServers.length >= 10) {
      throw new Error('Maximum 10 servers allowed');
    }
    
    // S6 FIX: Input validation
    if (!server.name || server.name.length > 50) throw new Error('Server name must be 1-50 characters');
    if (!server.host || server.host.length > 255) throw new Error('Invalid host');
    if (!/^[a-zA-Z0-9._-]+$/.test(server.host)) throw new Error('Host contains invalid characters');
    if (!server.username || server.username.length > 64) throw new Error('Invalid username');
    if (!/^[a-zA-Z0-9._-]+$/.test(server.username)) throw new Error('Username contains invalid characters');
    if (!server.port || server.port < 1 || server.port > 65535) throw new Error('Port must be 1-65535');
    if (!credential || credential.length > 16384) throw new Error('Credential too large (max 16KB)');
    if (server.authType !== 'password' && server.authType !== 'key') throw new Error('Invalid auth type');
    
    const newServer: SSHServer = {
      ...server,
      id: `srv_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
      encryptedCredential: encryptCredential(credential),
    };
    
    store.sshServers.push(newServer);
    writeStore(store);
    log(`SSH: Added server ${newServer.name} (${newServer.host})`);
    return newServer;
  }
  
  updateServer(id: string, updates: Partial<SSHServer>, newCredential?: string): SSHServer | null {
    const store = readStore();
    const servers = store.sshServers || [];
    const idx = servers.findIndex((s: SSHServer) => s.id === id);
    if (idx === -1) return null;
    
    // Don't allow updating id or encryptedCredential directly
    const { id: _id, encryptedCredential: _enc, ...safeUpdates } = updates;
    Object.assign(servers[idx], safeUpdates);
    
    if (newCredential) {
      servers[idx].encryptedCredential = encryptCredential(newCredential);
    }
    
    writeStore(store);
    log(`SSH: Updated server ${servers[idx].name}`);
    return servers[idx];
  }
  
  removeServer(id: string): boolean {
    // Disconnect first
    this.disconnect(id);
    
    const store = readStore();
    const servers = store.sshServers || [];
    const idx = servers.findIndex((s: SSHServer) => s.id === id);
    if (idx === -1) return false;
    
    const removed = servers.splice(idx, 1)[0];
    writeStore(store);
    log(`SSH: Removed server ${removed.name}`);
    return true;
  }
  
  // ─── Connection Management ───
  
  async connect(serverId: string): Promise<{ success: boolean; error?: string }> {
    if (this.connections.has(serverId)) {
      return { success: true };
    }
    if (this.connecting.get(serverId)) {
      return { success: false, error: 'Connection in progress' };
    }
    
    const servers = this.getServers();
    const server = servers.find(s => s.id === serverId);
    if (!server) return { success: false, error: 'Server not found' };
    if (!server.encryptedCredential) return { success: false, error: 'No credential stored' };
    
    this.connecting.set(serverId, true);
    
    try {
      const credential = decryptCredential(server.encryptedCredential);
      const config: any = {
        host: server.host,
        port: server.port || 22,
        username: server.username,
        readyTimeout: 15000,
        keepaliveInterval: 30000,
        keepaliveCountMax: 3,
      };
      
      if (server.authType === 'password') {
        config.password = credential;
      } else {
        config.privateKey = credential;
      }
      
      const { Client: SSHClient } = getSSH2();
      const client = new SSHClient();
      
      await new Promise<void>((resolve, reject) => {
        const timeout = setTimeout(() => {
          client.end();
          reject(new Error('Connection timeout (15s)'));
        }, 15000);
        
        client.on('ready', () => {
          clearTimeout(timeout);
          resolve();
        });
        
        client.on('error', (err) => {
          clearTimeout(timeout);
          reject(err);
        });
        
        client.connect(config);
      });
      
      // Store connection
      this.connections.set(serverId, client);
      
      // Handle disconnect
      client.on('close', () => {
        log(`SSH: Connection closed for ${server.name}`);
        this.connections.delete(serverId);
        this.updateServerStatus(serverId, 'offline');
      });
      
      client.on('error', (err) => {
        log(`SSH: Connection error for ${server.name}: ${err.message}`);
        this.connections.delete(serverId);
        this.updateServerStatus(serverId, 'error', err.message);
      });
      
      // Update status
      this.updateServerStatus(serverId, 'online');
      log(`SSH: Connected to ${server.name} (${server.host})`);
      
      return { success: true };
    } catch (err: any) {
      this.updateServerStatus(serverId, 'error', err.message);
      log(`SSH: Failed to connect to ${server.name}: ${err.message}`);
      return { success: false, error: err.message };
    } finally {
      this.connecting.delete(serverId);
    }
  }
  
  disconnect(serverId: string): void {
    const client = this.connections.get(serverId);
    if (client) {
      try { client.end(); } catch {}
      this.connections.delete(serverId);
      this.updateServerStatus(serverId, 'offline');
      log(`SSH: Disconnected from ${serverId}`);
    }
  }
  
  disconnectAll(): void {
    for (const [id] of this.connections) {
      this.disconnect(id);
    }
  }
  
  isConnected(serverId: string): boolean {
    return this.connections.has(serverId);
  }
  
  // ─── Command Execution ───
  
  async exec(serverId: string, command: string): Promise<SSHCommandResult> {
    // Security check
    const check = isCommandAllowed(command);
    if (!check.allowed) {
      log(`SSH: Command blocked: ${command} (${check.reason})`);
      throw new Error(`Command not allowed: ${check.reason}`);
    }
    
    const client = this.connections.get(serverId);
    if (!client) throw new Error('Not connected');
    
    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        reject(new Error('Command timeout (30s)'));
      }, 30000);
      
      client.exec(command, (err, stream) => {
        if (err) {
          clearTimeout(timeout);
          reject(err);
          return;
        }
        
        let stdout = '';
        let stderr = '';
        let totalSize = 0;
        const MAX_OUTPUT = 512 * 1024; // 512KB max
        
        stream.on('data', (data: Buffer) => {
          totalSize += data.length;
          if (totalSize > MAX_OUTPUT) {
            stream.close();
            clearTimeout(timeout);
            reject(new Error('Output too large (>512KB)'));
            return;
          }
          stdout += data.toString();
        });
        
        stream.stderr.on('data', (data: Buffer) => {
          totalSize += data.length;
          if (totalSize > MAX_OUTPUT) {
            stream.close();
            clearTimeout(timeout);
            reject(new Error('Output too large (>512KB)'));
            return;
          }
          stderr += data.toString();
        });
        
        stream.on('close', (code: number) => {
          clearTimeout(timeout);
          resolve({ stdout, stderr, code: code || 0 });
        });
      });
    });
  }
  
  // ─── High-Level Status Commands ───
  
  async getOpenClawStatus(serverId: string): Promise<OpenClawRemoteStatus> {
    try {
      // Try openclaw status first
      const result = await this.exec(serverId, 'openclaw status --json --log-level silent');
      if (result.code === 0 && result.stdout.trim()) {
        // Extract JSON from possible noisy output
        const jsonMatch = result.stdout.match(/\{[\s\S]*\}/);
        if (jsonMatch) {
          const data = JSON.parse(jsonMatch[0]);
          return {
            connected: true,
            server: serverId,
            status: data.status || 'unknown',
            activeSessions: data.activeSessions || 0,
            totalTokens: data.totalTokens || 0,
            uptime: data.uptime || '',
          };
        }
      }
      
      // Fallback: try reading sessions.json
      const sessResult = await this.exec(serverId, 'cat ~/.openclaw/agents/main/sessions/sessions.json');
      if (sessResult.code === 0) {
        try {
          const sessions = JSON.parse(sessResult.stdout);
          const count = Array.isArray(sessions) ? sessions.length : Object.keys(sessions).length;
          return {
            connected: true,
            server: serverId,
            status: 'active',
            activeSessions: count,
          };
        } catch {}
      }
      
      return { connected: true, server: serverId, status: 'openclaw-not-found' };
    } catch (err: any) {
      return { connected: false, server: serverId, error: err.message };
    }
  }

  async getRemoteTokens(serverId: string): Promise<{ total: number; daily: number; error?: string }> {
    try {
      const today = new Date().toISOString().slice(0, 10);
      // Use node for speed — it's guaranteed to exist on OpenClaw servers
      const script = `node -e "
const fs=require('fs'),p=require('path');
const d=p.join(require('os').homedir(),'.openclaw/agents/main/sessions');
if(!fs.existsSync(d)){console.log(JSON.stringify({total:0,daily:0}));process.exit(0)}
let total=0,daily=0;const today='${today}';
for(const f of fs.readdirSync(d).filter(x=>x.endsWith('.jsonl'))){
  const fp=p.join(d,f);let ft=0;
  try{
    const lines=fs.readFileSync(fp,'utf-8').split('\\\\n');
    for(const l of lines){
      if(!l.includes('usage'))continue;
      try{const o=JSON.parse(l),u=o?.message?.usage;
        if(u)ft+=(u.input||0)+(u.output||0)+(u.cacheRead||0)+(u.cacheWrite||0);
      }catch{}
    }
    total+=ft;
    const mt=fs.statSync(fp).mtime.toISOString().slice(0,10);
    if(mt===today)daily+=ft;
  }catch{}
}
console.log(JSON.stringify({total,daily}));
"`;

      const result = await this.exec(serverId, script);
      if (result.code === 0 && result.stdout.trim()) {
        const jsonMatch = result.stdout.match(/\{[^}]+\}/);
        if (jsonMatch) {
          const data = JSON.parse(jsonMatch[0]);
          return { total: data.total || 0, daily: data.daily || 0 };
        }
      }
      return { total: 0, daily: 0, error: 'Failed to parse token data' };
    } catch (err: any) {
      return { total: 0, daily: 0, error: err.message };
    }
  }
  
  async getProcessList(serverId: string): Promise<ProcessInfo[]> {
    try {
      const result = await this.exec(serverId, 'pm2 jlist');
      if (result.code !== 0) return [];
      
      const processes = JSON.parse(result.stdout);
      return processes.map((p: any) => ({
        name: p.name,
        pid: p.pid,
        status: p.pm2_env?.status || 'unknown',
        cpu: `${p.monit?.cpu || 0}%`,
        memory: formatBytes(p.monit?.memory || 0),
        uptime: formatUptime(p.pm2_env?.pm_uptime ? Date.now() - p.pm2_env.pm_uptime : 0),
      }));
    } catch {
      return [];
    }
  }
  
  async getSystemInfo(serverId: string): Promise<SystemInfo | null> {
    try {
      const [hostnameR, uptimeR, loadR, memR, diskR] = await Promise.all([
        this.exec(serverId, 'hostname'),
        this.exec(serverId, 'uptime'),
        this.exec(serverId, 'cat /proc/loadavg'),
        this.exec(serverId, 'cat /proc/meminfo'),
        this.exec(serverId, 'df -h'),
      ]);
      
      // Parse memory
      const memLines = memR.stdout.split('\n');
      const memTotal = parseInt(memLines.find(l => l.startsWith('MemTotal'))?.split(/\s+/)[1] || '0') / 1024;
      const memAvail = parseInt(memLines.find(l => l.startsWith('MemAvailable'))?.split(/\s+/)[1] || '0') / 1024;
      const memUsed = memTotal - memAvail;
      
      // Parse disk (root partition)
      const diskLines = diskR.stdout.split('\n');
      const rootDisk = diskLines.find(l => l.endsWith(' /')) || diskLines.find(l => l.includes('/dev/'));
      const diskParts = rootDisk?.split(/\s+/) || [];
      
      return {
        hostname: hostnameR.stdout.trim(),
        uptime: uptimeR.stdout.trim().split(',')[0].replace(/.*up\s+/, ''),
        loadAvg: loadR.stdout.trim().split(' ').slice(0, 3).join(', '),
        memTotal: `${Math.round(memTotal)}MB`,
        memUsed: `${Math.round(memUsed)}MB`,
        memPercent: memTotal > 0 ? Math.round((memUsed / memTotal) * 100) : 0,
        diskTotal: diskParts[1] || '?',
        diskUsed: diskParts[2] || '?',
        diskPercent: parseInt(diskParts[4] || '0'),
      };
    } catch {
      return null;
    }
  }
  
  async getProcessLogs(serverId: string, processName: string, lines: number = 50): Promise<string> {
    // Sanitize inputs
    if (!/^[a-zA-Z0-9_-]+$/.test(processName)) throw new Error('Invalid process name');
    const safeLines = Math.min(Math.max(1, Math.floor(lines)), 500);
    
    const result = await this.exec(serverId, `pm2 logs ${processName} --lines ${safeLines} --nostream`);
    return result.stdout + (result.stderr ? '\n' + result.stderr : '');
  }
  
  async restartProcess(serverId: string, processName: string): Promise<{ success: boolean; error?: string }> {
    if (!/^[a-zA-Z0-9_-]+$/.test(processName)) return { success: false, error: 'Invalid process name' };
    
    try {
      const result = await this.exec(serverId, `pm2 restart ${processName}`);
      return { success: result.code === 0, error: result.code !== 0 ? result.stderr : undefined };
    } catch (err: any) {
      return { success: false, error: err.message };
    }
  }
  
  // ─── Private Helpers ───
  
  private updateServerStatus(serverId: string, status: 'online' | 'offline' | 'error', error?: string): void {
    const store = readStore();
    const servers = store.sshServers || [];
    const server = servers.find((s: SSHServer) => s.id === serverId);
    if (server) {
      server.lastStatus = status;
      server.lastError = error || undefined;
      if (status === 'online') server.lastConnected = new Date().toISOString();
      writeStore(store);
    }
  }
}

// ─── Helpers ───

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes}B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)}KB`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)}MB`;
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(1)}GB`;
}

function formatUptime(ms: number): string {
  if (ms <= 0) return '0s';
  const days = Math.floor(ms / 86400000);
  const hours = Math.floor((ms % 86400000) / 3600000);
  const mins = Math.floor((ms % 3600000) / 60000);
  if (days > 0) return `${days}d ${hours}h`;
  if (hours > 0) return `${hours}h ${mins}m`;
  return `${mins}m`;
}

// ─── Singleton ───
export const sshManager = new SSHManager();
