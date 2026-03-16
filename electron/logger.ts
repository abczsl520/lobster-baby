import path from 'path';
import fs from 'fs';
import os from 'os';

const logFile = path.join(os.homedir(), 'lobster-baby-debug.log');
const MAX_LOG_SIZE = 512 * 1024;

type LogLevel = 'debug' | 'info' | 'warn' | 'error';
const LEVEL_PRIORITY: Record<LogLevel, number> = { debug: 0, info: 1, warn: 2, error: 3 };
const LEVEL_TAG: Record<LogLevel, string> = { debug: 'DBG', info: 'INF', warn: 'WRN', error: 'ERR' };

// Default to 'info' in production, 'debug' in dev
let currentLevel: LogLevel = process.env.NODE_ENV === 'development' ? 'debug' : 'info';

export function setLogLevel(level: LogLevel) {
  currentLevel = level;
}

function writeLog(level: LogLevel, msg: string) {
  if (LEVEL_PRIORITY[level] < LEVEL_PRIORITY[currentLevel]) return;
  
  const line = `[${new Date().toISOString()}] [${LEVEL_TAG[level]}] ${msg}\n`;
  try {
    const stat = fs.statSync(logFile);
    if (stat.size > MAX_LOG_SIZE) {
      const oldLog = logFile + '.old';
      try { fs.unlinkSync(oldLog); } catch { /* ok */ }
      fs.renameSync(logFile, oldLog);
    }
  } catch { /* file doesn't exist yet */ }
  fs.appendFileSync(logFile, line);
}

// Backward compatible — log() defaults to info level
export function log(msg: string) { writeLog('info', msg); }
export function logDebug(msg: string) { writeLog('debug', msg); }
export function logWarn(msg: string) { writeLog('warn', msg); }
export function logError(msg: string) { writeLog('error', msg); }
