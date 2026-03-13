import { app, BrowserWindow, ipcMain, screen, Menu, Tray, nativeImage, shell, Notification, globalShortcut } from 'electron';
import path from 'path';
import { exec } from 'child_process';
import fs from 'fs';
import https from 'https';
import os from 'os';
import * as social from './social';
// ─── Logging ───
const logFile = path.join(os.homedir(), 'lobster-baby-debug.log');
const MAX_LOG_SIZE = 512 * 1024; // 512KB max
function log(msg) {
    const line = `[${new Date().toISOString()}] ${msg}\n`;
    try {
        // Rotate if too large
        const stat = fs.statSync(logFile);
        if (stat.size > MAX_LOG_SIZE) {
            const oldLog = logFile + '.old';
            try {
                fs.unlinkSync(oldLog);
            }
            catch { /* ok */ }
            fs.renameSync(logFile, oldLog);
        }
    }
    catch { /* file doesn't exist yet, ok */ }
    fs.appendFileSync(logFile, line);
}
log('=== Lobster Baby starting ===');
// ─── Find OpenClaw ───
function findOpenClaw() {
    const home = os.homedir();
    const possiblePaths = [
        // macOS / Linux
        '/opt/homebrew/bin/openclaw',
        '/usr/local/bin/openclaw',
        path.join(home, '.local/bin/openclaw'),
        // Windows
        path.join(home, 'AppData/Roaming/npm/openclaw.cmd'),
        path.join(home, 'AppData/Roaming/npm/openclaw'),
        'openclaw', // Try PATH
    ];
    for (const p of possiblePaths) {
        try {
            if (p === 'openclaw') {
                // Will use PATH
                return 'openclaw';
            }
            if (fs.existsSync(p)) {
                log(`Found openclaw at: ${p}`);
                return p;
            }
        }
        catch { /* ignore */ }
    }
    log('OpenClaw not found in any known location');
    return null;
}
const openclawPath = findOpenClaw();
// ─── Store ───
const storePath = path.join(app.getPath('userData'), 'lobster-data.json');
let storeCache = null;
function readStore() {
    if (storeCache)
        return storeCache;
    try {
        storeCache = JSON.parse(fs.readFileSync(storePath, 'utf-8'));
        return storeCache;
    }
    catch {
        storeCache = {};
        return storeCache;
    }
}
function writeStore(data) {
    storeCache = data;
    fs.writeFileSync(storePath, JSON.stringify(data, null, 2));
}
// ─── Real API Token Scanner ───
// Scans OpenClaw session JSONL files for actual API usage data
// Uses incremental scanning: only re-reads files that changed since last scan
function findOpenClawSessionDir() {
    const home = os.homedir();
    const candidates = [
        path.join(home, '.openclaw/agents/main/sessions'),
        path.join(home, '.config/openclaw/agents/main/sessions'),
        // Windows
        path.join(home, 'AppData/Local/openclaw/agents/main/sessions'),
    ];
    for (const dir of candidates) {
        try {
            if (fs.existsSync(dir) && fs.statSync(dir).isDirectory())
                return dir;
        }
        catch { /* ignore */ }
    }
    return null;
}
// Incremental scan state
let scanTotal = 0; // Running total
let scanFileCache = new Map();
let lastScanTime = 0;
const SCAN_CACHE_MS = 30000; // Re-scan at most every 30s
let scanInitialized = false;
function scanRealTokenUsage() {
    const now = Date.now();
    if (now - lastScanTime < SCAN_CACHE_MS && scanInitialized) {
        return scanTotal;
    }
    const sessionDir = findOpenClawSessionDir();
    if (!sessionDir) {
        log('Session dir not found, falling back to store');
        return scanTotal || 0;
    }
    try {
        const files = fs.readdirSync(sessionDir).filter(f => f.endsWith('.jsonl'));
        // Remove entries for deleted files
        for (const [cachedFile] of scanFileCache) {
            if (!files.includes(cachedFile)) {
                const entry = scanFileCache.get(cachedFile);
                scanTotal -= entry.tokens;
                scanFileCache.delete(cachedFile);
            }
        }
        for (const file of files) {
            const fullPath = path.join(sessionDir, file);
            let mtime;
            try {
                mtime = fs.statSync(fullPath).mtimeMs;
            }
            catch {
                continue;
            }
            const cached = scanFileCache.get(file);
            if (cached && cached.mtime === mtime)
                continue; // File unchanged, skip
            // File is new or modified — scan it
            let fileTokens = 0;
            try {
                const content = fs.readFileSync(fullPath, 'utf-8');
                for (const line of content.split('\n')) {
                    if (!line.includes('"usage"'))
                        continue; // Fast pre-filter
                    try {
                        const obj = JSON.parse(line);
                        const usage = obj?.message?.usage;
                        if (usage) {
                            fileTokens += (usage.input || 0)
                                + (usage.output || 0)
                                + (usage.cacheRead || 0)
                                + (usage.cacheWrite || 0);
                        }
                    }
                    catch { /* skip malformed lines */ }
                }
            }
            catch {
                continue;
            }
            // Update running total
            if (cached) {
                scanTotal -= cached.tokens; // Remove old count for this file
            }
            scanTotal += fileTokens;
            scanFileCache.set(file, { mtime, tokens: fileTokens });
        }
    }
    catch (e) {
        log(`Token scan error: ${e}`);
        return scanTotal || 0;
    }
    lastScanTime = now;
    scanInitialized = true;
    // Track daily tokens
    trackDailyTokens(scanTotal);
    log(`Token scan: ${scanTotal.toLocaleString()} total API tokens (${scanFileCache.size} files)`);
    return scanTotal;
}
// ─── Daily Token Tracking ───
function trackDailyTokens(currentTotal) {
    const store = readStore();
    const today = new Date().toISOString().split('T')[0]; // YYYY-MM-DD
    if (!store.dailyTokens)
        store.dailyTokens = {};
    if (!store.lastTotalTokens) {
        // First run: initialize baseline, don't count history as "today"
        store.lastTotalTokens = currentTotal;
        writeStore(store);
        return;
    }
    const delta = currentTotal - store.lastTotalTokens;
    if (delta > 0) {
        store.dailyTokens[today] = (store.dailyTokens[today] || 0) + delta;
        store.lastTotalTokens = currentTotal;
        // Keep only last 30 days
        const dates = Object.keys(store.dailyTokens).sort();
        if (dates.length > 30) {
            for (let i = 0; i < dates.length - 30; i++) {
                delete store.dailyTokens[dates[i]];
            }
        }
        writeStore(store);
    }
}
let mainWindow = null;
let tray = null;
let statusCheckInterval = null;
let savePositionTimeout = null;
const SNAP_DISTANCE = 15;
const NORMAL_SIZE = { width: 200, height: 250 };
const PANEL_SIZE = { width: 320, height: 680 };
// ─── Edge Docking (QQ Pet style - Smooth Animation) ───
let isDockedLeft = false;
let isDockedRight = false;
let dockTimeout = null;
let undockedX = 0; // Remember position before docking
let isDraggingWindow = false; // True while user is actively dragging
let isDockingInProgress = false; // Prevent moved event loop during dock/undock
let dockAnimTimer = null; // Animation frame timer
let hoverCheckInterval = null; // Mouse hover polling
let hoverUndocked = false; // True when temporarily undocked by hover
let isPanelResizing = false; // True during show-panel/hide-panel to suppress moved event
// Easing functions
function easeOutCubic(t) { return 1 - Math.pow(1 - t, 3); }
function easeOutBack(t) {
    const c1 = 1.70158;
    const c3 = c1 + 1;
    return 1 + c3 * Math.pow(t - 1, 3) + c1 * Math.pow(t - 1, 2);
}
function easeInCubic(t) { return t * t * t; }
// Animated window move: smoothly transitions x from startX to endX
function cancelDockAnimation() {
    if (dockAnimTimer) {
        clearInterval(dockAnimTimer);
        dockAnimTimer = null;
    }
    isDockingInProgress = false;
}
function animateWindowX(startX, endX, duration, easing, onDone) {
    if (!mainWindow || mainWindow.isDestroyed())
        return;
    cancelDockAnimation(); // Cancel any in-progress animation (and reset isDockingInProgress)
    const FRAME_MS = 16; // ~60fps
    const totalFrames = Math.max(1, Math.round(duration / FRAME_MS));
    let frame = 0;
    const bounds = mainWindow.getBounds();
    isDockingInProgress = true;
    dockAnimTimer = setInterval(() => {
        frame++;
        const progress = Math.min(1, frame / totalFrames);
        const easedProgress = easing(progress);
        const currentX = Math.round(startX + (endX - startX) * easedProgress);
        if (mainWindow && !mainWindow.isDestroyed()) {
            mainWindow.setBounds({ x: currentX, y: bounds.y, width: bounds.width, height: bounds.height });
        }
        if (progress >= 1) {
            if (dockAnimTimer) {
                clearInterval(dockAnimTimer);
                dockAnimTimer = null;
            }
            isDockingInProgress = false;
            if (onDone)
                onDone();
        }
    }, FRAME_MS);
}
function dockToEdge() {
    if (!mainWindow || mainWindow.isDestroyed())
        return;
    if (isDockingInProgress)
        return;
    const bounds = mainWindow.getBounds();
    const display = screen.getDisplayNearestPoint({ x: bounds.x, y: bounds.y }).workArea;
    const atLeftEdge = bounds.x <= display.x + 5;
    const atRightEdge = bounds.x + bounds.width >= display.x + display.width - 5;
    if (atLeftEdge && !isDockedLeft) {
        undockedX = bounds.x;
        isDockedLeft = true;
        isDockedRight = false;
        const targetX = display.x - Math.floor(bounds.width * 0.3);
        animateWindowX(bounds.x, targetX, 300, easeOutCubic, () => {
            startHoverCheck();
            notifyDockState('left');
            log('Docked to left edge (animated)');
        });
    }
    else if (atRightEdge && !isDockedRight) {
        undockedX = bounds.x;
        isDockedRight = true;
        isDockedLeft = false;
        const targetX = display.x + display.width - Math.floor(bounds.width * 0.7);
        animateWindowX(bounds.x, targetX, 300, easeOutCubic, () => {
            startHoverCheck();
            notifyDockState('right');
            log('Docked to right edge (animated)');
        });
    }
}
function undockFromEdge() {
    if (!mainWindow || mainWindow.isDestroyed())
        return;
    if (!isDockedLeft && !isDockedRight)
        return;
    stopHoverCheck();
    const bounds = mainWindow.getBounds();
    const display = screen.getDisplayNearestPoint({ x: bounds.x, y: bounds.y }).workArea;
    if (isDockedLeft) {
        const targetX = display.x;
        animateWindowX(bounds.x, targetX, 250, easeOutBack, () => {
            isDockedLeft = false;
            hoverUndocked = false;
            notifyDockState(null);
            log('Undocked from left edge (animated)');
        });
    }
    else if (isDockedRight) {
        const targetX = display.x + display.width - bounds.width;
        animateWindowX(bounds.x, targetX, 250, easeOutBack, () => {
            isDockedRight = false;
            hoverUndocked = false;
            notifyDockState(null);
            log('Undocked from right edge (animated)');
        });
    }
}
// Hover peek: mouse near edge → slide out; mouse leaves → slide back
function startHoverCheck() {
    stopHoverCheck();
    hoverCheckInterval = setInterval(() => {
        if (!mainWindow || mainWindow.isDestroyed())
            return;
        if (isDraggingWindow || isDockingInProgress)
            return;
        if (!isDockedLeft && !isDockedRight) {
            stopHoverCheck();
            return;
        }
        const mousePos = screen.getCursorScreenPoint();
        const bounds = mainWindow.getBounds();
        const display = screen.getDisplayNearestPoint({ x: bounds.x, y: bounds.y }).workArea;
        // Check if mouse is near the docked edge and within vertical range
        const inVerticalRange = mousePos.y >= bounds.y - 20 && mousePos.y <= bounds.y + bounds.height + 20;
        const PEEK_ZONE = 15; // pixels from screen edge to trigger peek
        if (isDockedLeft) {
            const mouseNearLeftEdge = mousePos.x <= display.x + PEEK_ZONE;
            if (mouseNearLeftEdge && inVerticalRange && !hoverUndocked) {
                // Slide out
                hoverUndocked = true;
                const targetX = display.x;
                animateWindowX(bounds.x, targetX, 200, easeOutBack);
            }
            else if (!mouseNearLeftEdge && hoverUndocked && !isDockingInProgress) {
                // Check if mouse is far enough away to slide back
                const mouseAwayFromWindow = mousePos.x > display.x + bounds.width + 30 || !inVerticalRange;
                if (mouseAwayFromWindow) {
                    hoverUndocked = false;
                    const targetX = display.x - Math.floor(bounds.width * 0.3);
                    animateWindowX(bounds.x, targetX, 300, easeInCubic);
                }
            }
        }
        else if (isDockedRight) {
            const mouseNearRightEdge = mousePos.x >= display.x + display.width - PEEK_ZONE;
            if (mouseNearRightEdge && inVerticalRange && !hoverUndocked) {
                hoverUndocked = true;
                const targetX = display.x + display.width - bounds.width;
                animateWindowX(bounds.x, targetX, 200, easeOutBack);
            }
            else if (!mouseNearRightEdge && hoverUndocked && !isDockingInProgress) {
                const mouseAwayFromWindow = mousePos.x < display.x + display.width - bounds.width - 30 || !inVerticalRange;
                if (mouseAwayFromWindow) {
                    hoverUndocked = false;
                    const targetX = display.x + display.width - Math.floor(bounds.width * 0.7);
                    animateWindowX(bounds.x, targetX, 300, easeInCubic);
                }
            }
        }
    }, 100); // Check every 100ms
}
function stopHoverCheck() {
    if (hoverCheckInterval) {
        clearInterval(hoverCheckInterval);
        hoverCheckInterval = null;
    }
    hoverUndocked = false;
}
// Notify renderer about dock state for visual feedback
function notifyDockState(state) {
    if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.webContents.send('dock-state-changed', state);
    }
}
function createWindow() {
    const { width, height } = screen.getPrimaryDisplay().workAreaSize;
    const store = readStore();
    const savedX = store.windowX ?? (width - 250);
    const savedY = store.windowY ?? (height - 300);
    mainWindow = new BrowserWindow({
        width: NORMAL_SIZE.width,
        height: NORMAL_SIZE.height,
        transparent: true,
        frame: false,
        alwaysOnTop: true,
        resizable: false,
        skipTaskbar: true,
        hasShadow: false,
        backgroundColor: '#00000000',
        webPreferences: {
            preload: path.join(__dirname, 'preload.cjs'),
            contextIsolation: true,
            nodeIntegration: false,
            backgroundThrottling: false, // Keep animations smooth when not focused
        },
        x: savedX,
        y: savedY,
    });
    if (process.env.VITE_DEV_SERVER_URL) {
        mainWindow.loadURL(process.env.VITE_DEV_SERVER_URL);
    }
    else {
        mainWindow.loadFile(path.join(__dirname, '../dist/index.html'));
    }
    // Logging
    mainWindow.webContents.on('did-finish-load', () => log('Page loaded successfully'));
    mainWindow.webContents.on('did-fail-load', (_e, code, desc) => log(`Page failed: ${code} ${desc}`));
    mainWindow.webContents.on('render-process-gone', (_e, details) => {
        log(`Renderer crashed: ${JSON.stringify(details)}`);
        if (details.reason !== 'clean-exit') {
            log('Attempting to restart...');
            setTimeout(() => {
                if (mainWindow && !mainWindow.isDestroyed()) {
                    mainWindow.reload();
                }
                else {
                    createWindow();
                }
            }, 1000);
        }
    });
    mainWindow.webContents.on('unresponsive', () => log('Renderer became unresponsive'));
    mainWindow.webContents.on('responsive', () => log('Renderer became responsive again'));
    // Save position on move + edge snapping (debounced)
    mainWindow.on('moved', () => {
        if (!mainWindow)
            return;
        if (isDockingInProgress || isPanelResizing)
            return; // Skip if dock/undock or panel resize is in progress
        const bounds = mainWindow.getBounds();
        const display = screen.getDisplayNearestPoint({ x: bounds.x, y: bounds.y }).workArea;
        // If we were docked and user moved, undock first
        if (isDockedLeft || isDockedRight) {
            isDockedLeft = false;
            isDockedRight = false;
            stopHoverCheck();
            notifyDockState(null);
        }
        let newX = bounds.x;
        let newY = bounds.y;
        let snapped = false;
        if (bounds.x - display.x < SNAP_DISTANCE) {
            newX = display.x;
            snapped = true;
        }
        if (bounds.y - display.y < SNAP_DISTANCE) {
            newY = display.y;
            snapped = true;
        }
        if (bounds.x + bounds.width > display.x + display.width - SNAP_DISTANCE) {
            newX = display.x + display.width - bounds.width;
            snapped = true;
        }
        if (bounds.y + bounds.height > display.y + display.height - SNAP_DISTANCE) {
            newY = display.y + display.height - bounds.height;
            snapped = true;
        }
        if (snapped) {
            mainWindow.setBounds({ x: newX, y: newY, width: bounds.width, height: bounds.height });
        }
        // Schedule edge docking after 1.5 seconds at edge (only if not actively dragging)
        if (dockTimeout)
            clearTimeout(dockTimeout);
        if (!isDraggingWindow) {
            const finalX = snapped ? newX : bounds.x;
            const atEdge = (finalX <= display.x + 5) || (finalX + bounds.width >= display.x + display.width - 5);
            if (atEdge) {
                dockTimeout = setTimeout(() => dockToEdge(), 1500);
            }
        }
        // Debounce position saving
        if (savePositionTimeout)
            clearTimeout(savePositionTimeout);
        savePositionTimeout = setTimeout(() => {
            const s = readStore();
            s.windowX = snapped ? newX : bounds.x;
            s.windowY = snapped ? newY : bounds.y;
            writeStore(s);
            savePositionTimeout = null;
        }, 500);
    });
    mainWindow.on('closed', () => {
        if (savePositionTimeout) {
            clearTimeout(savePositionTimeout);
            savePositionTimeout = null;
        }
        mainWindow = null;
    });
    // Right-click context menu
    mainWindow.webContents.on('context-menu', () => {
        const isOnTop = mainWindow?.isAlwaysOnTop() ?? true;
        const menu = Menu.buildFromTemplate([
            {
                label: isOnTop ? '📌 取消置顶' : '📌 置顶',
                click: () => {
                    mainWindow?.setAlwaysOnTop(!isOnTop);
                    updateTrayMenu();
                },
            },
            { type: 'separator' },
            {
                label: '📊 状态面板',
                click: () => mainWindow?.webContents.send('toggle-panel'),
            },
            {
                label: '🌐 龙虾社区',
                click: () => mainWindow?.webContents.send('show-social'),
            },
            { type: 'separator' },
            {
                label: '📈 查看趋势',
                click: () => mainWindow?.webContents.send('toggle-chart'),
            },
            {
                label: '🏆 查看成就',
                click: () => mainWindow?.webContents.send('show-achievements'),
            },
            { type: 'separator' },
            {
                label: '🔄 重新加载',
                click: () => mainWindow?.reload(),
            },
            {
                label: '📂 数据目录',
                click: () => shell.openPath(app.getPath('userData')),
            },
            { type: 'separator' },
            {
                label: '❌ 退出',
                click: () => app.quit(),
            },
        ]);
        menu.popup();
    });
    startStatusCheck();
    log('Window created');
    createTray();
}
// ─── FIX #3: Dynamic tray menu ───
function updateTrayMenu() {
    if (!tray)
        return;
    const isOnTop = mainWindow?.isAlwaysOnTop() ?? true;
    const contextMenu = Menu.buildFromTemplate([
        {
            label: '🦞 显示龙虾宝宝',
            click: () => {
                if (mainWindow) {
                    mainWindow.show();
                    mainWindow.focus();
                }
            },
        },
        {
            label: isOnTop ? '📌 取消置顶' : '📌 置顶',
            click: () => {
                if (mainWindow) {
                    mainWindow.setAlwaysOnTop(!isOnTop);
                    updateTrayMenu(); // Refresh menu after toggle
                }
            },
        },
        { type: 'separator' },
        { label: '🔄 重新加载', click: () => mainWindow?.reload() },
        { label: '❌ 退出', click: () => app.quit() },
    ]);
    tray.setContextMenu(contextMenu);
}
function createTray() {
    const icon = nativeImage.createFromDataURL('data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAABAAAAAQCAYAAAAf8/9hAAAA2ElEQVQ4T2NkoBAwUqifgWoGMDIyNjAyMv5nYGD4T8gFjP///2dgZGRsYGJiagBpxmcIyGBGRsYGJiamBmJcADKYiYmpgZGRsQGfIf8ZGBgbmJiYGhgZGRvwGQIKBiYmpgZGRsYGfIaAgoGJiamBkZGxAZ8h/xkYGBuYmJgaGBkZG/AZAgoGJiamBkZGxgZ8hoCCgYmJqYGRkbEBnyH/GRgYG5iYmBoYGRkb8BkCCgYmJqYGRkbGBnyGgIKBiYmpgZGRsQGfIaBgYGJiamBkZGzAZwgAqFBBEQmNF/IAAAAASUVORK5CYII=');
    tray = new Tray(icon);
    tray.setToolTip('龙虾宝宝 🦞');
    updateTrayMenu();
    tray.on('click', () => {
        if (mainWindow) {
            if (mainWindow.isVisible()) {
                mainWindow.hide();
            }
            else {
                mainWindow.show();
                mainWindow.focus();
            }
        }
    });
}
// ─── OpenClaw Status Detection ───
let isCheckingStatus = false;
let lastStatusPayload = ''; // FIX #5: Only write when data changes
function checkOpenClawStatus() {
    if (!mainWindow || mainWindow.isDestroyed() || isCheckingStatus)
        return;
    // If openclaw not found, report error immediately
    if (!openclawPath) {
        if (mainWindow && !mainWindow.isDestroyed()) {
            try {
                mainWindow.webContents.send('openclaw-status', {
                    status: 'error',
                    activeSessions: 0,
                    tokenInfo: { daily: 0, total: 0 },
                });
            }
            catch { /* ignore */ }
        }
        return;
    }
    isCheckingStatus = true;
    // Set PATH to include Homebrew bin directories
    const env = {
        ...process.env,
        PATH: `/opt/homebrew/bin:/usr/local/bin:${process.env.PATH || '/usr/bin:/bin:/usr/sbin:/sbin'}`,
    };
    Promise.all([
        new Promise((resolve) => {
            exec(`${openclawPath} sessions --json --active 1 2>/dev/null`, { timeout: 8000, env }, (error, stdout) => {
                let status = 'error';
                let activeSessions = 0;
                if (error) {
                    log(`OpenClaw command error: ${error.message}`);
                }
                if (!error && stdout) {
                    try {
                        const data = JSON.parse(stdout);
                        const sessions = data.sessions || [];
                        activeSessions = sessions.length;
                        // --active 1 already filters to sessions active in last 1 minute
                        // If any session has recent activity (ageMs < 60s), OpenClaw is working
                        const hasRecentActivity = sessions.some((s) => s.ageMs < 60000);
                        status = hasRecentActivity ? 'active' : 'idle';
                        log(`OpenClaw status: ${status}, sessions: ${activeSessions}`);
                    }
                    catch (e) {
                        log(`Failed to parse OpenClaw output: ${e}`);
                        status = 'error';
                    }
                }
                resolve({ status, activeSessions });
            });
        }),
        new Promise((resolve) => {
            // Scan real API token usage from session JSONL files
            try {
                const realTokens = scanRealTokenUsage();
                resolve(realTokens);
            }
            catch {
                resolve(0);
            }
        }),
    ])
        .then(([{ status, activeSessions }, realTokens]) => {
        if (!mainWindow || mainWindow.isDestroyed())
            return;
        const store = readStore();
        const today = new Date().toISOString().slice(0, 10);
        // Real API tokens from JSONL scan (already cumulative)
        const totalTokens = realTokens;
        // Daily tracking
        if (store.lastDate !== today) {
            store.dailyTokensBaseline = totalTokens;
            store.lastDate = today;
        }
        if (!store.dailyTokensBaseline)
            store.dailyTokensBaseline = totalTokens;
        const dailyTokens = Math.max(0, totalTokens - (store.dailyTokensBaseline || 0));
        // Only write store when data actually changes
        const newPayload = JSON.stringify({ status, totalTokens, dailyTokens });
        if (newPayload !== lastStatusPayload) {
            lastStatusPayload = newPayload;
            store.totalTokens = totalTokens; // Store for getLevelData
            writeStore(store);
        }
        try {
            mainWindow.webContents.send('openclaw-status', {
                status,
                activeSessions,
                tokenInfo: { daily: dailyTokens, total: totalTokens },
            });
        }
        catch { /* window might be closing */ }
    })
        .catch((err) => {
        log(`Status check error: ${err}`);
    })
        .finally(() => {
        isCheckingStatus = false;
    });
}
function startStatusCheck() {
    checkOpenClawStatus();
    statusCheckInterval = setInterval(checkOpenClawStatus, 5000);
}
function stopStatusCheck() {
    if (statusCheckInterval) {
        clearInterval(statusCheckInterval);
        statusCheckInterval = null;
    }
}
// ─── IPC Handlers ───
ipcMain.removeAllListeners('move-window');
ipcMain.on('move-window', (event, deltaX, deltaY) => {
    // FIX #6: Validate IPC parameters
    if (typeof deltaX !== 'number' || typeof deltaY !== 'number')
        return;
    if (!isFinite(deltaX) || !isFinite(deltaY))
        return;
    // Clamp to reasonable range (max 500px per frame)
    const dx = Math.max(-500, Math.min(500, Math.round(deltaX)));
    const dy = Math.max(-500, Math.min(500, Math.round(deltaY)));
    // Cancel any pending dock when user is actively dragging
    if (dockTimeout) {
        clearTimeout(dockTimeout);
        dockTimeout = null;
    }
    if (isDockedLeft || isDockedRight) {
        isDockedLeft = false;
        isDockedRight = false;
        stopHoverCheck();
        cancelDockAnimation();
        notifyDockState(null);
    }
    isDraggingWindow = true;
    const win = BrowserWindow.fromWebContents(event.sender);
    if (!win || win.isDestroyed())
        return;
    const [x, y] = win.getPosition();
    const bounds = win.getBounds();
    const display = screen.getDisplayNearestPoint({ x, y }).workArea;
    let newX = x + dx;
    let newY = y + dy;
    // Real-time magnetic snapping (within 30px of edge)
    const MAGNETIC_DISTANCE = 30;
    const SNAP_STRENGTH = 0.3;
    const leftDist = newX - display.x;
    if (leftDist < MAGNETIC_DISTANCE && leftDist > -bounds.width / 2) {
        const pull = (MAGNETIC_DISTANCE - leftDist) / MAGNETIC_DISTANCE;
        newX = Math.round(newX - (leftDist * pull * SNAP_STRENGTH));
    }
    const topDist = newY - display.y;
    if (topDist < MAGNETIC_DISTANCE && topDist > -bounds.height / 2) {
        const pull = (MAGNETIC_DISTANCE - topDist) / MAGNETIC_DISTANCE;
        newY = Math.round(newY - (topDist * pull * SNAP_STRENGTH));
    }
    const rightDist = (display.x + display.width) - (newX + bounds.width);
    if (rightDist < MAGNETIC_DISTANCE && rightDist > -bounds.width / 2) {
        const pull = (MAGNETIC_DISTANCE - rightDist) / MAGNETIC_DISTANCE;
        newX = Math.round(newX + (rightDist * pull * SNAP_STRENGTH));
    }
    const bottomDist = (display.y + display.height) - (newY + bounds.height);
    if (bottomDist < MAGNETIC_DISTANCE && bottomDist > -bounds.height / 2) {
        const pull = (MAGNETIC_DISTANCE - bottomDist) / MAGNETIC_DISTANCE;
        newY = Math.round(newY + (bottomDist * pull * SNAP_STRENGTH));
    }
    win.setPosition(newX, newY);
});
ipcMain.on('drag-end', () => {
    isDraggingWindow = false;
    // After drag ends, check if at edge and schedule docking
    if (!mainWindow || mainWindow.isDestroyed())
        return;
    const bounds = mainWindow.getBounds();
    const display = screen.getDisplayNearestPoint({ x: bounds.x, y: bounds.y }).workArea;
    const atLeftEdge = bounds.x <= display.x + 5;
    const atRightEdge = bounds.x + bounds.width >= display.x + display.width - 5;
    if (atLeftEdge || atRightEdge) {
        if (dockTimeout)
            clearTimeout(dockTimeout);
        dockTimeout = setTimeout(() => dockToEdge(), 1500);
    }
});
ipcMain.handle('toggle-always-on-top', () => {
    if (!mainWindow || mainWindow.isDestroyed())
        return false;
    const isOnTop = mainWindow.isAlwaysOnTop();
    mainWindow.setAlwaysOnTop(!isOnTop);
    updateTrayMenu(); // FIX #3: Update tray menu after toggle
    return !isOnTop;
});
ipcMain.handle('get-level-data', () => {
    // Use real API token scan, fall back to stored value
    const realTokens = scanRealTokenUsage();
    if (realTokens > 0)
        return { totalTokens: realTokens };
    const store = readStore();
    return { totalTokens: store.totalTokens || 0 };
});
ipcMain.handle('get-daily-tokens', () => {
    const store = readStore();
    return store.dailyTokens || {};
});
ipcMain.handle('get-settings', () => {
    const store = readStore();
    return store.settings || { autoFadeEnabled: false };
});
ipcMain.handle('update-settings', (_event, settings) => {
    const store = readStore();
    store.settings = { ...store.settings, ...settings };
    writeStore(store);
    return store.settings;
});
ipcMain.handle('undock', () => {
    undockFromEdge();
});
ipcMain.handle('redock', () => {
    // Re-dock after a delay if still at edge
    if (dockTimeout)
        clearTimeout(dockTimeout);
    dockTimeout = setTimeout(() => dockToEdge(), 2000);
});
// ─── Social Feature IPC Handlers ───
ipcMain.handle('social-register', async (_event, nickname) => {
    try {
        const realTokens = scanRealTokenUsage();
        const THRESHOLDS = [0, 50000000, 200000000, 500000000, 1000000000, 2500000000, 5000000000, 10000000000, 25000000000, 50000000000];
        let level = 1;
        for (let i = THRESHOLDS.length - 1; i >= 0; i--) {
            if (realTokens >= THRESHOLDS[i]) {
                level = i + 1;
                break;
            }
        }
        const uptimeHours = Math.floor(process.uptime() / 3600);
        const result = await social.socialRegister(nickname, realTokens, level, Math.max(1, uptimeHours));
        // Save token locally
        const store = readStore();
        store.socialToken = result.token;
        store.lobsterId = result.lobster_id;
        store.socialNickname = nickname;
        writeStore(store);
        return result;
    }
    catch (err) {
        return { error: err.message };
    }
});
ipcMain.handle('social-login', async () => {
    try {
        const result = await social.socialLogin();
        const store = readStore();
        store.socialToken = result.token;
        store.lobsterId = result.lobster_id;
        store.socialNickname = result.nickname;
        writeStore(store);
        return result;
    }
    catch (err) {
        return { error: err.message };
    }
});
ipcMain.handle('social-sync', async () => {
    try {
        const store = readStore();
        if (!store.socialToken)
            return { error: '未注册' };
        const realTokens = scanRealTokenUsage();
        const THRESHOLDS = [0, 50000000, 200000000, 500000000, 1000000000, 2500000000, 5000000000, 10000000000, 25000000000, 50000000000];
        let level = 1;
        for (let i = THRESHOLDS.length - 1; i >= 0; i--) {
            if (realTokens >= THRESHOLDS[i]) {
                level = i + 1;
                break;
            }
        }
        // Count achievements based on token milestones
        const ACHIEVEMENT_THRESHOLDS = [1e6, 1e7, 1e8, 1e9, 5e9, 1e10, 5e10];
        const achievements = ACHIEVEMENT_THRESHOLDS.filter(t => realTokens >= t).length;
        // Daily tokens
        const dailyTokens = Math.max(0, realTokens - (store.dailyTokensBaseline || 0));
        const result = await social.socialSync(store.socialToken, realTokens, level, achievements, dailyTokens);
        return result;
    }
    catch (err) {
        return { error: err.message };
    }
});
ipcMain.handle('social-leaderboard', async (_event, type, page) => {
    try {
        const store = readStore();
        return await social.socialGetLeaderboard(store.socialToken || null, type, page);
    }
    catch (err) {
        return { error: err.message };
    }
});
ipcMain.handle('social-pk-create', async () => {
    try {
        const store = readStore();
        if (!store.socialToken)
            return { error: '未注册' };
        return await social.socialCreatePK(store.socialToken);
    }
    catch (err) {
        return { error: err.message };
    }
});
ipcMain.handle('social-pk-join', async (_event, code) => {
    try {
        const store = readStore();
        if (!store.socialToken)
            return { error: '未注册' };
        return await social.socialJoinPK(store.socialToken, code);
    }
    catch (err) {
        return { error: err.message };
    }
});
ipcMain.handle('social-profile', async () => {
    try {
        const store = readStore();
        if (!store.socialToken)
            return { error: '未注册' };
        return await social.socialGetProfile(store.socialToken);
    }
    catch (err) {
        return { error: err.message };
    }
});
ipcMain.handle('social-update-profile', async (_event, data) => {
    try {
        const store = readStore();
        if (!store.socialToken)
            return { error: '未注册' };
        return await social.socialUpdateProfile(store.socialToken, data);
    }
    catch (err) {
        return { error: err.message };
    }
});
ipcMain.handle('social-delete-account', async () => {
    try {
        const store = readStore();
        if (!store.socialToken)
            return { error: '未注册' };
        const result = await social.socialDeleteAccount(store.socialToken);
        // Clear local social data
        delete store.socialToken;
        delete store.lobsterId;
        delete store.socialNickname;
        writeStore(store);
        return result;
    }
    catch (err) {
        return { error: err.message };
    }
});
ipcMain.handle('social-get-local', () => {
    const store = readStore();
    return {
        lobsterId: store.lobsterId || null,
        nickname: store.socialNickname || null,
        hasToken: !!store.socialToken,
    };
});
ipcMain.handle('social-stats', async () => {
    try {
        return await social.socialGetStats();
    }
    catch (err) {
        return { error: err.message };
    }
});
// FIX #7: Clamp panel position to screen bounds (multi-monitor aware)
function clampToScreen(x, y, w, h) {
    const display = screen.getDisplayNearestPoint({ x, y }).workArea;
    return {
        x: Math.max(display.x, Math.min(x, display.x + display.width - w)),
        y: Math.max(display.y, Math.min(y, display.y + display.height - h)),
        width: w,
        height: h,
    };
}
ipcMain.handle('show-panel', () => {
    if (!mainWindow || mainWindow.isDestroyed())
        return;
    isPanelResizing = true;
    const bounds = mainWindow.getBounds();
    const newX = bounds.x - (PANEL_SIZE.width - NORMAL_SIZE.width) / 2;
    const newY = bounds.y - (PANEL_SIZE.height - NORMAL_SIZE.height);
    mainWindow.setBounds(clampToScreen(newX, newY, PANEL_SIZE.width, PANEL_SIZE.height));
    setTimeout(() => { isPanelResizing = false; }, 100);
});
ipcMain.handle('hide-panel', () => {
    if (!mainWindow || mainWindow.isDestroyed())
        return;
    isPanelResizing = true;
    const bounds = mainWindow.getBounds();
    const newX = bounds.x + (PANEL_SIZE.width - NORMAL_SIZE.width) / 2;
    const newY = bounds.y + (PANEL_SIZE.height - NORMAL_SIZE.height);
    mainWindow.setBounds(clampToScreen(newX, newY, NORMAL_SIZE.width, NORMAL_SIZE.height));
    setTimeout(() => { isPanelResizing = false; }, 100);
});
ipcMain.handle('quit-app', () => app.quit());
ipcMain.handle('open-external', async (_event, url) => {
    if (typeof url !== 'string' || !url.startsWith('http'))
        return;
    await shell.openExternal(url);
});
// ─── Level Up Notification ───
const LEVEL_NAMES = {
    1: '粉色宝宝', 2: '活泼小虾', 3: '皇冠龙虾', 4: '肌肉猛男',
    5: '金冠金链', 6: '银甲骑士', 7: '紫色魔法师', 8: '金甲将军',
    9: '彩虹龙虾', 10: '龙虾之王',
};
ipcMain.handle('notify-level-up', (_event, level) => {
    if (typeof level !== 'number' || level < 1 || level > 10)
        return;
    const name = LEVEL_NAMES[level] || `Lv.${level}`;
    log(`Level up! Now Lv.${level} (${name})`);
    if (Notification.isSupported()) {
        const notification = new Notification({
            title: `🦞 龙虾宝宝升级了！`,
            body: `恭喜！你的龙虾宝宝升到了 Lv.${level}「${name}」🎉`,
            silent: false,
        });
        notification.show();
    }
});
// ─── Auto Update Check (System Notification) ───
const APP_VERSION = '1.6.0';
let updateCheckInterval = null;
function fetchJSON(url) {
    return new Promise((resolve, reject) => {
        https.get(url, { headers: { 'User-Agent': 'LobsterBaby' } }, (res) => {
            // Follow redirects
            if (res.statusCode === 301 || res.statusCode === 302) {
                return fetchJSON(res.headers.location).then(resolve).catch(reject);
            }
            let data = '';
            res.on('data', (chunk) => data += chunk);
            res.on('end', () => {
                try {
                    resolve(JSON.parse(data));
                }
                catch {
                    reject(new Error('Invalid JSON'));
                }
            });
        }).on('error', reject);
    });
}
function compareVersions(v1, v2) {
    const p1 = v1.split('.').map(Number);
    const p2 = v2.split('.').map(Number);
    for (let i = 0; i < Math.max(p1.length, p2.length); i++) {
        const a = p1[i] || 0, b = p2[i] || 0;
        if (a > b)
            return 1;
        if (a < b)
            return -1;
    }
    return 0;
}
async function checkForUpdatesMain() {
    try {
        const data = await fetchJSON('https://api.github.com/repos/abczsl520/lobster-baby/releases/latest');
        const latest = (data.tag_name || '').replace(/^v/, '');
        if (!latest || compareVersions(latest, APP_VERSION) <= 0)
            return;
        log(`New version available: ${latest} (current: ${APP_VERSION})`);
        // Send to renderer (in-app notification)
        if (mainWindow && !mainWindow.isDestroyed()) {
            mainWindow.webContents.send('update-available', {
                version: latest,
                url: data.html_url,
            });
        }
        // System notification
        if (Notification.isSupported()) {
            const notification = new Notification({
                title: '🦞 Lobster Baby 有新版本！',
                body: `v${latest} 已发布，点击查看更新`,
                silent: false,
            });
            notification.on('click', () => {
                shell.openExternal(data.html_url);
            });
            notification.show();
        }
    }
    catch (err) {
        log(`Update check failed: ${err}`);
    }
}
function startUpdateCheck() {
    // Check after 10 seconds (let app settle first)
    setTimeout(checkForUpdatesMain, 10000);
    // Then every 6 hours
    updateCheckInterval = setInterval(checkForUpdatesMain, 6 * 60 * 60 * 1000);
}
function stopUpdateCheck() {
    if (updateCheckInterval) {
        clearInterval(updateCheckInterval);
        updateCheckInterval = null;
    }
}
// ─── Social Auto-Sync ───
let socialSyncInterval = null;
async function doSocialSync() {
    try {
        const store = readStore();
        if (!store.socialToken)
            return;
        const realTokens = scanRealTokenUsage();
        const THRESHOLDS = [0, 50000000, 200000000, 500000000, 1000000000, 2500000000, 5000000000, 10000000000, 25000000000, 50000000000];
        let level = 1;
        for (let i = THRESHOLDS.length - 1; i >= 0; i--) {
            if (realTokens >= THRESHOLDS[i]) {
                level = i + 1;
                break;
            }
        }
        const ACHIEVEMENT_THRESHOLDS = [1e6, 1e7, 1e8, 1e9, 5e9, 1e10, 5e10];
        const achievements = ACHIEVEMENT_THRESHOLDS.filter(t => realTokens >= t).length;
        const dailyTokens = Math.max(0, realTokens - (store.dailyTokensBaseline || 0));
        await social.socialSync(store.socialToken, realTokens, level, achievements, dailyTokens);
        log('Social sync completed');
    }
    catch (err) {
        log(`Social sync failed: ${err.message}`);
    }
}
function startSocialSync() {
    // Auto-login on startup
    const store = readStore();
    if (!store.socialToken && !store.lobsterId) {
        // Try to login with device fingerprint (in case registered on another session)
        social.socialLogin().then(result => {
            if (result.success) {
                const s = readStore();
                s.socialToken = result.token;
                s.lobsterId = result.lobster_id;
                s.socialNickname = result.nickname;
                writeStore(s);
                log(`Social auto-login: ${result.lobster_id}`);
            }
        }).catch(() => { });
    }
    // Sync every hour
    setTimeout(doSocialSync, 30000); // First sync after 30s
    socialSyncInterval = setInterval(doSocialSync, 60 * 60 * 1000);
}
// ─── App Lifecycle ───
app.whenReady().then(() => {
    createWindow();
    startUpdateCheck();
    startSocialSync();
    // Global shortcuts
    globalShortcut.register('CommandOrControl+Shift+L', () => {
        if (!mainWindow)
            return;
        if (mainWindow.isVisible()) {
            mainWindow.hide();
        }
        else {
            mainWindow.show();
            mainWindow.focus();
        }
    });
    // Multi-monitor: reposition if display config changes
    screen.on('display-removed', () => {
        if (!mainWindow || mainWindow.isDestroyed())
            return;
        const bounds = mainWindow.getBounds();
        const clamped = clampToScreen(bounds.x, bounds.y, bounds.width, bounds.height);
        mainWindow.setBounds(clamped);
        log('Display removed, repositioned window');
    });
    screen.on('display-metrics-changed', () => {
        if (!mainWindow || mainWindow.isDestroyed())
            return;
        const bounds = mainWindow.getBounds();
        const clamped = clampToScreen(bounds.x, bounds.y, bounds.width, bounds.height);
        mainWindow.setBounds(clamped);
    });
});
if (app.isPackaged) {
    app.setLoginItemSettings({ openAtLogin: true, openAsHidden: false });
}
app.on('window-all-closed', () => {
    stopStatusCheck();
    if (process.platform !== 'darwin')
        app.quit();
});
app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0)
        createWindow();
});
app.on('before-quit', () => {
    stopStatusCheck();
    stopUpdateCheck();
    globalShortcut.unregisterAll();
    if (savePositionTimeout)
        clearTimeout(savePositionTimeout);
});
// Global error handlers
process.on('uncaughtException', (error) => {
    log(`Uncaught exception: ${error.message}`);
    log(error.stack || '');
});
process.on('unhandledRejection', (reason) => {
    log(`Unhandled rejection: ${reason}`);
});
