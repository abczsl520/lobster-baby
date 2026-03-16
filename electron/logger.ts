import path from 'path';
import fs from 'fs';
import os from 'os';

const logFile = path.join(os.homedir(), 'lobster-baby-debug.log');
const MAX_LOG_SIZE = 512 * 1024;
const MAX_OLD_FILES = 2;

type LogLevel = 'debug' | 'info' | 'warn' | 'error';
const LEVEL_PRIORITY: Record<LogLevel, number> = { debug: 0, info: 1, warn: 2, error: 3 };
const LEVEL_TAG: Record<LogLevel, string> = { debug: 'DBG', info: 'INF', warn: 'WRN', error: 'ERR' };

let currentLevel: LogLevel = process.env.NODE_ENV === 'development' ? 'debug' : 'info';
const startTime = Date.now();
let logCount = 0;
let errorCount = 0;

export function setLogLevel(level: LogLevel) {
  currentLevel = level;
}

function rotateLog() {
  try {
    const stat = fs.statSync(logFile);
    if (stat.size > MAX_LOG_SIZE) {
      // Rotate: .old.2 → delete, .old.1 → .old.2, .old → .old.1
      for (let i = MAX_OLD_FILES; i >= 1; i--) {
        const from = i === 1 ? logFile + '.old' : logFile + `.old.${i - 1}`;
        const to = logFile + `.old.${i}`;
        try { if (i === MAX_OLD_FILES) fs.unlinkSync(to); } catch { /* ok */ }
        try { fs.renameSync(from, to); } catch { /* ok */ }
      }
      fs.renameSync(logFile, logFile + '.old');
    }
  } catch { /* file doesn't exist yet */ }
}

function writeLog(level: LogLevel, msg: string) {
  if (LEVEL_PRIORITY[level] < LEVEL_PRIORITY[currentLevel]) return;
  
  logCount++;
  if (level === 'error') errorCount++;
  
  const line = `[${new Date().toISOString()}] [${LEVEL_TAG[level]}] ${msg}\n`;
  rotateLog();
  fs.appendFileSync(logFile, line);
}

export function log(msg: string) { writeLog('info', msg); }
export function logDebug(msg: string) { writeLog('debug', msg); }
export function logWarn(msg: string) { writeLog('warn', msg); }
export function logError(msg: string) { writeLog('error', msg); }

export function logSessionSummary() {
  const uptime = Math.round((Date.now() - startTime) / 1000);
  const h = Math.floor(uptime / 3600);
  const m = Math.floor((uptime % 3600) / 60);
  log(`=== Session ended: ${h}h${m}m uptime, ${logCount} logs, ${errorCount} errors ===`);
}
