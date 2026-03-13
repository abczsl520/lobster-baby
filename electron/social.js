// electron/social.ts — Social features for Lobster Baby
import * as crypto from 'crypto';
import * as os from 'os';
import * as https from 'https';
import * as http from 'http';
import { app } from 'electron';
const API_BASE = 'https://game.weixin-vip.cn/lobster-social/api/v1';
const PROOF_SECRET = 'lobster-baby-proof-v1-REDACTED';
// ─── Device Fingerprint ───
export function generateDeviceFingerprint() {
    const raw = [
        os.hostname(),
        os.cpus()[0]?.model || 'unknown',
        os.totalmem().toString(),
        os.platform(),
        os.arch(),
    ].join('|');
    return crypto.createHash('sha256').update(raw).digest('hex');
}
// ─── HMAC Signature ───
export function signProof(data) {
    const payload = JSON.stringify(data);
    return crypto.createHmac('sha256', PROOF_SECRET).update(payload).digest('hex');
}
// ─── HTTP Helper ───
function apiRequest(method, path, body, token) {
    return new Promise((resolve, reject) => {
        const url = new URL(API_BASE + path);
        const isHttps = url.protocol === 'https:';
        const lib = isHttps ? https : http;
        const options = {
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
            res.on('data', (chunk) => { data += chunk; });
            res.on('end', () => {
                try {
                    const json = JSON.parse(data);
                    if (res.statusCode && res.statusCode >= 400) {
                        reject(new Error(json.error || `HTTP ${res.statusCode}`));
                    }
                    else {
                        resolve(json);
                    }
                }
                catch (e) {
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
export async function socialRegister(nickname, totalTokens, level, uptimeHours) {
    const deviceFingerprint = generateDeviceFingerprint();
    const proofData = {
        total_tokens: totalTokens,
        level,
        app_version: app.getVersion(),
        uptime_hours: uptimeHours,
    };
    const signature = signProof(proofData);
    return apiRequest('POST', '/register', {
        nickname,
        device_fingerprint: deviceFingerprint,
        proof: { ...proofData, signature },
        privacy_consent: { agreed: true, version: '1.0' },
    });
}
export async function socialLogin() {
    const deviceFingerprint = generateDeviceFingerprint();
    return apiRequest('POST', '/register/login', {
        device_fingerprint: deviceFingerprint,
    });
}
export async function socialSync(token, totalTokens, level, achievements, dailyTokens) {
    return apiRequest('POST', '/sync', {
        total_tokens: totalTokens,
        level,
        achievements,
        daily_tokens: dailyTokens,
    }, token);
}
export async function socialGetLeaderboard(token, type, page) {
    const query = `?type=${type}&page=${page}&limit=20`;
    return apiRequest('GET', '/leaderboard' + query, undefined, token || undefined);
}
export async function socialCreatePK(token) {
    return apiRequest('POST', '/pk/create', {}, token);
}
export async function socialJoinPK(token, pkCode) {
    return apiRequest('POST', '/pk/join', { pk_code: pkCode }, token);
}
export async function socialGetProfile(token) {
    return apiRequest('GET', '/profile', undefined, token);
}
export async function socialUpdateProfile(token, data) {
    return apiRequest('PATCH', '/profile', data, token);
}
export async function socialDeleteAccount(token) {
    return apiRequest('DELETE', '/profile', {}, token);
}
export async function socialGetStats() {
    return apiRequest('GET', '/stats');
}
