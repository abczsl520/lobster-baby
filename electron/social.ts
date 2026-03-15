// electron/social.ts — Social features for Lobster Baby
import * as crypto from 'crypto';
import * as os from 'os';
import * as https from 'https';
import * as http from 'http';
import { app } from 'electron';

const API_BASE = 'https://game.weixin-vip.cn/lobster-social/api/v1';

// ─── Device Fingerprint ───
export function generateDeviceFingerprint(): string {
  const raw = [
    os.hostname(),
    os.cpus()[0]?.model || 'unknown',
    os.totalmem().toString(),
    os.platform(),
    os.arch(),
  ].join('|');
  return crypto.createHash('sha256').update(raw).digest('hex');
}

// ─── HTTP Helper ───
function apiRequest(method: string, path: string, body?: any, token?: string): Promise<any> {
  return new Promise((resolve, reject) => {
    const url = new URL(API_BASE + path);
    const isHttps = url.protocol === 'https:';
    const lib = isHttps ? https : http;

    const options: any = {
      hostname: url.hostname,
      port: url.port || (isHttps ? 443 : 80),
      path: url.pathname + url.search,
      method,
      headers: {
        'Content-Type': 'application/json',
        'User-Agent': `LobsterBaby/${app.getVersion()}`,
      },
      timeout: 15000,
    };

    if (token) {
      options.headers['Authorization'] = `Bearer ${token}`;
    }

    const req = lib.request(options, (res) => {
      let data = '';
      res.on('data', (chunk: string) => { data += chunk; });
      res.on('end', () => {
        try {
          const json = JSON.parse(data);
          if (res.statusCode && res.statusCode >= 400) {
            reject(new Error(json.error || `HTTP ${res.statusCode}`));
          } else {
            resolve(json);
          }
        } catch (e) {
          reject(new Error(`Invalid response: ${data.slice(0, 100)}`));
        }
      });
    });

    req.on('error', reject);
    req.on('timeout', () => { req.destroy(); reject(new Error('Request timeout')); });

    if (body) {
      req.write(JSON.stringify(body));
    }
    req.end();
  });
}

// ─── API Functions ───

export async function socialRegister(nickname: string, totalTokens: number, level: number, uptimeHours: number): Promise<any> {
  const deviceFingerprint = generateDeviceFingerprint();

  // Step 1: Get one-time challenge nonce from server
  const { nonce } = await apiRequest('GET', '/register/challenge');

  const proofData = {
    total_tokens: totalTokens,
    level,
    app_version: app.getVersion(),
    uptime_hours: uptimeHours,
  };

  return apiRequest('POST', '/register', {
    nickname,
    device_fingerprint: deviceFingerprint,
    proof: proofData,
    nonce,
    privacy_consent: { agreed: true, version: '1.0' },
  });
}

export async function socialLogin(): Promise<any> {
  const deviceFingerprint = generateDeviceFingerprint();
  return apiRequest('POST', '/register/login', {
    device_fingerprint: deviceFingerprint,
  });
}

export async function socialSync(token: string, totalTokens: number, level: number, achievements: number, dailyTokens: number): Promise<any> {
  return apiRequest('POST', '/sync', {
    total_tokens: totalTokens,
    level,
    achievements,
    daily_tokens: dailyTokens,
  }, token);
}

export async function socialGetLeaderboard(token: string | null, type: string, page: number): Promise<any> {
  const query = `?type=${type}&page=${page}&limit=20`;
  return apiRequest('GET', '/leaderboard' + query, undefined, token || undefined);
}

export async function socialCreatePK(token: string): Promise<any> {
  return apiRequest('POST', '/pk/create', {}, token);
}

export async function socialJoinPK(token: string, pkCode: string): Promise<any> {
  return apiRequest('POST', '/pk/join', { pk_code: pkCode }, token);
}

export async function socialGetProfile(token: string): Promise<any> {
  return apiRequest('GET', '/profile', undefined, token);
}

export async function socialUpdateProfile(token: string, data: Record<string, any>): Promise<any> {
  return apiRequest('PATCH', '/profile', data, token);
}

export async function socialDeleteAccount(token: string): Promise<any> {
  return apiRequest('DELETE', '/profile', {}, token);
}

export async function socialGetStats(): Promise<any> {
  return apiRequest('GET', '/stats');
}
