// ─── Plugin Manager ───
// Core engine: load, install, uninstall, enable, disable plugins
import fs from 'fs';
import path from 'path';
import https from 'https';
import { app } from 'electron';
import { log } from '../logger';
import { createPluginAPI, removePluginMenuItems, removePluginEventListeners } from './plugin-api';
const PLUGINS_DIR = path.join(app.getPath('userData'), 'plugins');
const CONFIG_DIR = path.join(app.getPath('userData'), 'plugin-configs');
const INSTALLED_FILE = path.join(PLUGINS_DIR, 'installed.json');
const LBHUB_API = 'https://lbhub.ai/api';
// Active plugin instances
const activePlugins = new Map();
// ─── Helpers ───
function ensureDirs() {
    fs.mkdirSync(PLUGINS_DIR, { recursive: true });
    fs.mkdirSync(CONFIG_DIR, { recursive: true });
}
function readInstalled() {
    try {
        if (fs.existsSync(INSTALLED_FILE)) {
            return JSON.parse(fs.readFileSync(INSTALLED_FILE, 'utf-8'));
        }
    }
    catch (e) {
        log(`Failed to read installed.json: ${e}`);
    }
    return { plugins: {} };
}
function writeInstalled(data) {
    ensureDirs();
    fs.writeFileSync(INSTALLED_FILE, JSON.stringify(data, null, 2));
}
function readManifest(pluginDir) {
    const manifestPath = path.join(pluginDir, 'manifest.json');
    try {
        const raw = JSON.parse(fs.readFileSync(manifestPath, 'utf-8'));
        // Validate required fields
        if (!raw.id || !raw.name || !raw.version || !raw.entry) {
            log(`Invalid manifest in ${pluginDir}: missing required fields`);
            return null;
        }
        // Sanitize permissions
        const validPerms = ['shell', 'notification', 'network', 'clipboard'];
        raw.permissions = (raw.permissions || []).filter((p) => validPerms.includes(p));
        return raw;
    }
    catch (e) {
        log(`Failed to read manifest in ${pluginDir}: ${e}`);
        return null;
    }
}
// ─── Load / Unload ───
async function loadPlugin(pluginId) {
    if (activePlugins.has(pluginId))
        return true; // Already loaded
    const pluginDir = path.join(PLUGINS_DIR, pluginId);
    const manifest = readManifest(pluginDir);
    if (!manifest)
        return false;
    const entryPath = path.join(pluginDir, manifest.entry);
    if (!fs.existsSync(entryPath)) {
        log(`Plugin [${pluginId}] entry not found: ${entryPath}`);
        return false;
    }
    // Security: verify entry path is within plugin dir
    const resolvedEntry = path.resolve(entryPath);
    if (!resolvedEntry.startsWith(path.resolve(pluginDir))) {
        log(`Plugin [${pluginId}] BLOCKED: entry path escapes plugin directory`);
        return false;
    }
    try {
        // Clear require cache to allow reloading
        delete require.cache[require.resolve(resolvedEntry)];
        const pluginModule = require(resolvedEntry);
        if (typeof pluginModule.activate !== 'function') {
            log(`Plugin [${pluginId}] has no activate function`);
            return false;
        }
        const api = createPluginAPI(pluginId, pluginDir, manifest.permissions, CONFIG_DIR);
        await pluginModule.activate(api);
        activePlugins.set(pluginId, { module: pluginModule, manifest });
        log(`Plugin [${pluginId}] loaded successfully`);
        return true;
    }
    catch (e) {
        log(`Plugin [${pluginId}] failed to load: ${e}`);
        return false;
    }
}
async function unloadPlugin(pluginId) {
    const active = activePlugins.get(pluginId);
    if (!active)
        return;
    try {
        if (typeof active.module.deactivate === 'function') {
            await active.module.deactivate();
        }
    }
    catch (e) {
        log(`Plugin [${pluginId}] deactivate error: ${e}`);
    }
    removePluginMenuItems(pluginId);
    removePluginEventListeners(pluginId);
    activePlugins.delete(pluginId);
    log(`Plugin [${pluginId}] unloaded`);
}
// ─── Public API ───
export async function initPlugins() {
    ensureDirs();
    const installed = readInstalled();
    const loadPromises = [];
    for (const [id, record] of Object.entries(installed.plugins)) {
        if (record.enabled) {
            loadPromises.push(loadPlugin(id).then(ok => {
                if (!ok)
                    log(`Plugin [${id}] failed to initialize`);
            }));
        }
    }
    await Promise.allSettled(loadPromises);
    log(`Plugins initialized: ${activePlugins.size} active`);
}
export function getInstalledPlugins() {
    const installed = readInstalled();
    const result = [];
    for (const [id, record] of Object.entries(installed.plugins)) {
        const pluginDir = path.join(PLUGINS_DIR, id);
        const manifest = readManifest(pluginDir);
        if (manifest) {
            result.push({ id, manifest, record, active: activePlugins.has(id) });
        }
    }
    return result;
}
export async function enablePlugin(pluginId) {
    const installed = readInstalled();
    if (!installed.plugins[pluginId])
        return false;
    installed.plugins[pluginId].enabled = true;
    writeInstalled(installed);
    return loadPlugin(pluginId);
}
export async function disablePlugin(pluginId) {
    await unloadPlugin(pluginId);
    const installed = readInstalled();
    if (installed.plugins[pluginId]) {
        installed.plugins[pluginId].enabled = false;
        writeInstalled(installed);
    }
}
export async function uninstallPlugin(pluginId) {
    await unloadPlugin(pluginId);
    // Remove files
    const pluginDir = path.join(PLUGINS_DIR, pluginId);
    try {
        fs.rmSync(pluginDir, { recursive: true, force: true });
    }
    catch (e) {
        log(`Failed to remove plugin dir [${pluginId}]: ${e}`);
    }
    // Remove config
    const configFile = path.join(CONFIG_DIR, `${pluginId}.json`);
    try {
        fs.unlinkSync(configFile);
    }
    catch { /* ok */ }
    // Update installed.json
    const installed = readInstalled();
    delete installed.plugins[pluginId];
    writeInstalled(installed);
    log(`Plugin [${pluginId}] uninstalled`);
}
// ─── Install from various sources ───
function downloadFile(url, destPath) {
    return new Promise((resolve, reject) => {
        // Security: only allow HTTPS downloads
        if (!url.startsWith('https://')) {
            reject(new Error('Only HTTPS downloads are allowed'));
            return;
        }
        // S17 fix: block private/internal hostnames
        const isPrivateUrl = (u) => {
            try {
                const hostname = new URL(u).hostname;
                return /^(localhost|127\.|10\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.|0\.0\.0\.0|\[::1\])/i.test(hostname);
            }
            catch {
                return true;
            }
        };
        if (isPrivateUrl(url)) {
            reject(new Error('downloads from private networks blocked'));
            return;
        }
        const request = (targetUrl, redirects = 0) => {
            if (redirects > 5) {
                reject(new Error('too many redirects'));
                return;
            }
            if (!targetUrl.startsWith('https://')) {
                reject(new Error('redirect to non-HTTPS blocked'));
                return;
            }
            if (isPrivateUrl(targetUrl)) {
                reject(new Error('redirect to private network blocked'));
                return;
            }
            https.get(targetUrl, { headers: { 'User-Agent': 'LobsterBaby-PluginManager' }, timeout: 30000 }, (res) => {
                if (res.statusCode === 301 || res.statusCode === 302) {
                    const location = res.headers.location;
                    if (location) {
                        request(location, redirects + 1);
                        return;
                    }
                }
                if (res.statusCode !== 200) {
                    reject(new Error(`HTTP ${res.statusCode}`));
                    return;
                }
                const file = fs.createWriteStream(destPath);
                let size = 0;
                const MAX_SIZE = 10 * 1024 * 1024; // 10MB limit
                res.on('data', (chunk) => {
                    size += chunk.length;
                    if (size > MAX_SIZE) {
                        file.destroy();
                        res.destroy();
                        reject(new Error('plugin too large (>10MB)'));
                        return;
                    }
                    file.write(chunk);
                });
                res.on('end', () => { file.end(); resolve(); });
                res.on('error', reject);
            }).on('error', reject);
        };
        request(url);
    });
}
async function extractZip(zipPath, destDir) {
    // Use execFile (no shell) to prevent command injection
    const { execFile } = require('child_process');
    return new Promise((resolve, reject) => {
        execFile('unzip', ['-o', zipPath, '-d', destDir], { timeout: 30000 }, (error) => {
            if (error)
                reject(error);
            else
                resolve();
        });
    });
}
export async function installFromUrl(url, source = 'url') {
    ensureDirs();
    const tmpDir = path.join(PLUGINS_DIR, '_tmp_install');
    const tmpZip = path.join(PLUGINS_DIR, '_tmp_download.zip');
    try {
        // Cleanup previous tmp
        fs.rmSync(tmpDir, { recursive: true, force: true });
        try {
            fs.unlinkSync(tmpZip);
        }
        catch { /* ok */ }
        // Handle GitHub URLs → convert to zip download
        let downloadUrl = url;
        const ghMatch = url.match(/github\.com\/([^\/]+)\/([^\/]+?)(?:\.git)?(?:\/|$)/);
        if (ghMatch) {
            downloadUrl = `https://github.com/${ghMatch[1]}/${ghMatch[2]}/archive/refs/heads/main.zip`;
        }
        // Download
        log(`Downloading plugin from: ${downloadUrl}`);
        await downloadFile(downloadUrl, tmpZip);
        // Extract
        fs.mkdirSync(tmpDir, { recursive: true });
        await extractZip(tmpZip, tmpDir);
        // Find manifest.json (might be in a subdirectory)
        let manifestDir = tmpDir;
        if (!fs.existsSync(path.join(tmpDir, 'manifest.json'))) {
            const entries = fs.readdirSync(tmpDir);
            const subdir = entries.find(e => fs.existsSync(path.join(tmpDir, e, 'manifest.json')));
            if (subdir)
                manifestDir = path.join(tmpDir, subdir);
            else {
                return { success: false, error: '找不到 manifest.json' };
            }
        }
        const manifest = readManifest(manifestDir);
        if (!manifest)
            return { success: false, error: 'manifest.json 格式错误' };
        // Validate plugin ID (alphanumeric + hyphens only)
        if (!/^[a-z0-9][a-z0-9-]*[a-z0-9]$/.test(manifest.id) || manifest.id.length > 50) {
            return { success: false, error: '插件 ID 格式无效' };
        }
        // Check if already installed
        const installed = readInstalled();
        if (installed.plugins[manifest.id]) {
            await unloadPlugin(manifest.id);
            fs.rmSync(path.join(PLUGINS_DIR, manifest.id), { recursive: true, force: true });
        }
        // Move to final location
        const finalDir = path.join(PLUGINS_DIR, manifest.id);
        fs.renameSync(manifestDir, finalDir);
        // Register
        installed.plugins[manifest.id] = {
            version: manifest.version,
            enabled: true,
            installedAt: new Date().toISOString(),
            source,
            sourceUrl: url,
            permissions: manifest.permissions,
        };
        writeInstalled(installed);
        // Load immediately
        await loadPlugin(manifest.id);
        // Track install on lbhub.ai (fire-and-forget)
        try {
            const trackReq = https.request(`${LBHUB_API}/plugins/${manifest.id}/install`, {
                method: 'POST',
                headers: { 'User-Agent': 'LobsterBaby', 'Content-Length': '0' },
                timeout: 5000,
            });
            trackReq.on('error', () => { }); // ignore errors
            trackReq.end();
        }
        catch { /* ignore */ }
        log(`Plugin [${manifest.id}] installed from ${source}: ${url}`);
        return { success: true, pluginId: manifest.id, manifest };
    }
    catch (e) {
        log(`Plugin install failed: ${e.message}`);
        return { success: false, error: e.message };
    }
    finally {
        // Cleanup tmp
        fs.rmSync(tmpDir, { recursive: true, force: true });
        try {
            fs.unlinkSync(tmpZip);
        }
        catch { /* ok */ }
    }
}
// ─── lbhub.ai Integration ───
export async function fetchFeaturedPlugins() {
    return new Promise((resolve) => {
        https.get(`${LBHUB_API}/plugins/featured`, {
            headers: { 'User-Agent': 'LobsterBaby' },
            timeout: 10000,
        }, (res) => {
            let data = '';
            res.on('data', (chunk) => { data += chunk; });
            res.on('end', () => {
                try {
                    resolve(JSON.parse(data).plugins || []);
                }
                catch {
                    resolve([]);
                }
            });
        }).on('error', () => resolve([]));
    });
}
export async function searchPlugins(query) {
    return new Promise((resolve) => {
        const sanitized = query.slice(0, 100).trim();
        if (!sanitized) {
            resolve([]);
            return;
        }
        const encodedQuery = encodeURIComponent(sanitized);
        https.get(`${LBHUB_API}/plugins/search?q=${encodedQuery}`, {
            headers: { 'User-Agent': 'LobsterBaby' },
            timeout: 10000,
        }, (res) => {
            let data = '';
            res.on('data', (chunk) => { data += chunk; });
            res.on('end', () => {
                try {
                    resolve(JSON.parse(data).plugins || []);
                }
                catch {
                    resolve([]);
                }
            });
        }).on('error', () => resolve([]));
    });
}
export function isPluginActive(pluginId) {
    return activePlugins.has(pluginId);
}
export async function shutdownPlugins() {
    for (const [id] of activePlugins) {
        await unloadPlugin(id);
    }
    log('All plugins shut down');
}
