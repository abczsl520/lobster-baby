// electron/remote-status.ts — Remote status provider for Lobster Baby
// Connects to Relay API via SSE to get cloud server OpenClaw status

import * as https from 'https';
import * as http from 'http';
import { log } from './logger';

const API_BASE = 'https://game.weixin-vip.cn/lobster-social/api/v1';

export interface RemoteStatusData {
  status: string;
  offlineReason?: string;
  activeSessions: number;
  totalTokens: number;
  dailyTokens: number;
  lastHeartbeat?: string;
}

export class RemoteStatusProvider {
  private request: http.ClientRequest | null = null;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private staleCheckTimer: ReturnType<typeof setInterval> | null = null;
  private reconnectCount = 0;
  private lastDataAt = 0;
  private stopped = false;
  private token: string;

  constructor(token: string) {
    this.token = token;
  }

  start(callback: (data: RemoteStatusData) => void) {
    this.stopped = false;
    this.connect(callback);
    this.startStaleCheck(callback);
  }

  private connect(callback: (data: RemoteStatusData) => void) {
    if (this.stopped) return;

    const url = new URL(API_BASE + '/remote/stream');
    const transport = url.protocol === 'https:' ? https : http;

    this.request = transport.get({
      hostname: url.hostname,
      port: url.port || (url.protocol === 'https:' ? 443 : 80),
      path: url.pathname,
      headers: {
        'Authorization': `Bearer ${this.token}`,
        'Accept': 'text/event-stream',
        'Cache-Control': 'no-cache',
      },
      timeout: 0, // No timeout for SSE
    }, (res) => {
      if (res.statusCode === 401) {
        log('Remote SSE: token invalid/expired, stopping');
        callback({ status: 'offline', offlineReason: 'token_invalid', activeSessions: 0, totalTokens: 0, dailyTokens: 0 });
        this.stop();
        return;
      }

      if (res.statusCode !== 200) {
        log(`Remote SSE: unexpected status ${res.statusCode}`);
        res.destroy();
        this.scheduleReconnect(callback);
        return;
      }

      this.reconnectCount = 0; // Connected successfully
      log('Remote SSE: connected');

      let buffer = '';
      res.on('data', (chunk: Buffer) => {
        this.lastDataAt = Date.now();
        buffer += chunk.toString();

        // Parse SSE events
        const parts = buffer.split('\n\n');
        buffer = parts.pop() || ''; // Keep incomplete event in buffer

        for (const part of parts) {
          const dataLine = part.split('\n').find(l => l.startsWith('data: '));
          if (!dataLine) continue;
          try {
            const data = JSON.parse(dataLine.slice(6));
            callback(data);
          } catch (e) {
            log(`Remote SSE: parse error: ${e}`);
          }
        }
      });

      res.on('end', () => {
        log('Remote SSE: stream ended');
        if (!this.stopped) this.scheduleReconnect(callback);
      });

      res.on('error', (err) => {
        log(`Remote SSE: stream error: ${err.message}`);
        if (!this.stopped) this.scheduleReconnect(callback);
      });
    });

    this.request.on('error', (err) => {
      log(`Remote SSE: connection error: ${err.message}`);
      if (!this.stopped) this.scheduleReconnect(callback);
    });
  }

  // B5 fix: exponential backoff with jitter
  private scheduleReconnect(callback: (data: RemoteStatusData) => void) {
    if (this.stopped) return;
    this.reconnectCount++;
    const base = Math.min(5 * 60 * 1000, 1000 * Math.pow(2, Math.min(this.reconnectCount, 8)));
    const jitter = Math.random() * base * 0.3;
    const delay = base + jitter;
    log(`Remote SSE: reconnecting in ${(delay / 1000).toFixed(1)}s (attempt #${this.reconnectCount})`);
    this.reconnectTimer = setTimeout(() => this.connect(callback), delay);
  }

  // U4 fix: detect sleep/wake (30s no data → force reconnect)
  private startStaleCheck(callback: (data: RemoteStatusData) => void) {
    this.staleCheckTimer = setInterval(() => {
      if (this.lastDataAt > 0 && Date.now() - this.lastDataAt > 30_000) {
        log('Remote SSE: no data for 30s (likely sleep/wake), forcing reconnect');
        this.destroyConnection();
        this.reconnectCount = 0; // Sleep/wake is not a failure
        this.connect(callback);
      }
    }, 10_000);
  }

  private destroyConnection() {
    if (this.request) {
      try { this.request.destroy(); } catch {}
      this.request = null;
    }
  }

  stop() {
    this.stopped = true;
    this.destroyConnection();
    if (this.reconnectTimer) { clearTimeout(this.reconnectTimer); this.reconnectTimer = null; }
    if (this.staleCheckTimer) { clearInterval(this.staleCheckTimer); this.staleCheckTimer = null; }
    log('Remote SSE: stopped');
  }

  isConnected(): boolean {
    return this.request !== null && !this.stopped;
  }
}

// ─── One-shot API calls ───
function apiRequest(method: string, path: string, token: string, body?: any): Promise<any> {
  return new Promise((resolve, reject) => {
    const url = new URL(API_BASE + path);
    const transport = url.protocol === 'https:' ? https : http;

    const req = transport.request({
      hostname: url.hostname,
      port: url.port || (url.protocol === 'https:' ? 443 : 80),
      path: url.pathname,
      method,
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json',
        ...(body ? { 'Content-Length': Buffer.byteLength(JSON.stringify(body)) } : {}),
      },
      timeout: 10000,
    }, (res) => {
      let data = '';
      res.on('data', (chunk) => data += chunk);
      res.on('end', () => {
        try {
          const json = JSON.parse(data);
          if (res.statusCode && res.statusCode >= 400) {
            reject(new Error(json.error || `HTTP ${res.statusCode}`));
          } else {
            resolve(json);
          }
        } catch { reject(new Error(`Invalid response: ${data.slice(0, 100)}`)); }
      });
    });

    req.on('error', reject);
    req.on('timeout', () => { req.destroy(); reject(new Error('timeout')); });
    if (body) req.write(JSON.stringify(body));
    req.end();
  });
}

export async function generateReporterToken(socialToken: string): Promise<{ token: string; lobsterId: string }> {
  return apiRequest('POST', '/remote/token', socialToken);
}

export async function revokeReporterToken(socialToken: string): Promise<void> {
  await apiRequest('DELETE', '/remote/token', socialToken);
}

export async function getRemoteInfo(socialToken: string): Promise<{
  hasReporterToken: boolean;
  tokenIssuedAt: string | null;
  lastHeartbeat: string | null;
  reporterVersion: string | null;
}> {
  return apiRequest('GET', '/remote/info', socialToken);
}

export async function getRemoteStatus(socialToken: string): Promise<RemoteStatusData & { configured: boolean }> {
  return apiRequest('GET', '/remote/status', socialToken);
}
