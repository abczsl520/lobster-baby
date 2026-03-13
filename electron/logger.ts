import path from 'path';
import fs from 'fs';
import os from 'os';

const logFile = path.join(os.homedir(), 'lobster-baby-debug.log');
const MAX_LOG_SIZE = 512 * 1024;

export function log(msg: string) {
  const line = `[${new Date().toISOString()}] ${msg}\n`;
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
