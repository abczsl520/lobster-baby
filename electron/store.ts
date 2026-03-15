import { app } from 'electron';
import path from 'path';
import fs from 'fs';

const storePath = path.join(app.getPath('userData'), 'lobster-data.json');
let storeCache: Record<string, any> | null = null;

export function readStore(): Record<string, any> {
  if (storeCache) return storeCache;
  try {
    storeCache = JSON.parse(fs.readFileSync(storePath, 'utf-8'));
    return storeCache!;
  } catch {
    storeCache = {};
    return storeCache;
  }
}

export function writeStore(data: Record<string, any>) {
  storeCache = data;
  fs.writeFileSync(storePath, JSON.stringify(data, null, 2), { mode: 0o600 });
}
