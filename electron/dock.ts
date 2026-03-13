import { BrowserWindow, screen } from 'electron';
import { log } from './logger';

// ─── Edge Docking State ───
export let isDockedLeft = false;
export let isDockedRight = false;
export let isDraggingWindow = false;
export let isDockingInProgress = false;
export let isPanelResizing = false;
export let hoverUndocked = false;

let dockTimeout: NodeJS.Timeout | null = null;
let dockAnimTimer: NodeJS.Timeout | null = null;
let hoverCheckInterval: NodeJS.Timeout | null = null;
let undockedX = 0;

// Setters for external modules
export function setIsDockedLeft(v: boolean) { isDockedLeft = v; }
export function setIsDockedRight(v: boolean) { isDockedRight = v; }
export function setIsDraggingWindow(v: boolean) { isDraggingWindow = v; }
export function setIsPanelResizing(v: boolean) { isPanelResizing = v; }

// Easing functions
function easeOutCubic(t: number): number { return 1 - Math.pow(1 - t, 3); }
function easeOutBack(t: number): number {
  const c1 = 1.70158;
  const c3 = c1 + 1;
  return 1 + c3 * Math.pow(t - 1, 3) + c1 * Math.pow(t - 1, 2);
}
function easeInCubic(t: number): number { return t * t * t; }

export function cancelDockAnimation() {
  if (dockAnimTimer) { clearInterval(dockAnimTimer); dockAnimTimer = null; }
  isDockingInProgress = false;
}

export function clearDockTimeout() {
  if (dockTimeout) { clearTimeout(dockTimeout); dockTimeout = null; }
}

export function scheduleDock(delayMs: number) {
  clearDockTimeout();
  dockTimeout = setTimeout(() => dockToEdge(), delayMs);
}

function animateWindowX(win: BrowserWindow, startX: number, endX: number, duration: number, easing: (t: number) => number, onDone?: () => void) {
  if (win.isDestroyed()) return;
  cancelDockAnimation();

  const FRAME_MS = 16;
  const totalFrames = Math.max(1, Math.round(duration / FRAME_MS));
  let frame = 0;
  const bounds = win.getBounds();

  isDockingInProgress = true;

  dockAnimTimer = setInterval(() => {
    frame++;
    const progress = Math.min(1, frame / totalFrames);
    const easedProgress = easing(progress);
    const currentX = Math.round(startX + (endX - startX) * easedProgress);

    if (!win.isDestroyed()) {
      win.setBounds({ x: currentX, y: bounds.y, width: bounds.width, height: bounds.height });
    }

    if (progress >= 1) {
      if (dockAnimTimer) { clearInterval(dockAnimTimer); dockAnimTimer = null; }
      isDockingInProgress = false;
      if (onDone) onDone();
    }
  }, FRAME_MS);
}

export function notifyDockState(win: BrowserWindow | null, state: 'left' | 'right' | null) {
  if (win && !win.isDestroyed()) {
    win.webContents.send('dock-state-changed', state);
  }
}

let _mainWindow: (() => BrowserWindow | null) | null = null;
export function setMainWindowGetter(getter: () => BrowserWindow | null) {
  _mainWindow = getter;
}
function getWin(): BrowserWindow | null {
  return _mainWindow ? _mainWindow() : null;
}

export function dockToEdge() {
  const win = getWin();
  if (!win || win.isDestroyed()) return;
  if (isDockingInProgress) return;
  const bounds = win.getBounds();
  const display = screen.getDisplayNearestPoint({ x: bounds.x, y: bounds.y }).workArea;

  const atLeftEdge = bounds.x <= display.x + 5;
  const atRightEdge = bounds.x + bounds.width >= display.x + display.width - 5;

  if (atLeftEdge && !isDockedLeft) {
    undockedX = bounds.x;
    isDockedLeft = true;
    isDockedRight = false;
    const targetX = display.x - Math.floor(bounds.width * 0.3);
    animateWindowX(win, bounds.x, targetX, 300, easeOutCubic, () => {
      startHoverCheck();
      notifyDockState(win, 'left');
      log('Docked to left edge');
    });
  } else if (atRightEdge && !isDockedRight) {
    undockedX = bounds.x;
    isDockedRight = true;
    isDockedLeft = false;
    const targetX = display.x + display.width - Math.floor(bounds.width * 0.7);
    animateWindowX(win, bounds.x, targetX, 300, easeOutCubic, () => {
      startHoverCheck();
      notifyDockState(win, 'right');
      log('Docked to right edge');
    });
  }
}

export function undockFromEdge() {
  const win = getWin();
  if (!win || win.isDestroyed()) return;
  if (!isDockedLeft && !isDockedRight) return;

  stopHoverCheck();
  const bounds = win.getBounds();
  const display = screen.getDisplayNearestPoint({ x: bounds.x, y: bounds.y }).workArea;

  if (isDockedLeft) {
    const targetX = display.x;
    animateWindowX(win, bounds.x, targetX, 250, easeOutBack, () => {
      isDockedLeft = false;
      hoverUndocked = false;
      notifyDockState(win, null);
      log('Undocked from left edge');
    });
  } else if (isDockedRight) {
    const targetX = display.x + display.width - bounds.width;
    animateWindowX(win, bounds.x, targetX, 250, easeOutBack, () => {
      isDockedRight = false;
      hoverUndocked = false;
      notifyDockState(win, null);
      log('Undocked from right edge');
    });
  }
}

function startHoverCheck() {
  stopHoverCheck();
  hoverCheckInterval = setInterval(() => {
    const win = getWin();
    if (!win || win.isDestroyed()) return;
    if (isDraggingWindow || isDockingInProgress) return;
    if (!isDockedLeft && !isDockedRight) { stopHoverCheck(); return; }

    const mousePos = screen.getCursorScreenPoint();
    const bounds = win.getBounds();
    const display = screen.getDisplayNearestPoint({ x: bounds.x, y: bounds.y }).workArea;
    const inVerticalRange = mousePos.y >= bounds.y - 20 && mousePos.y <= bounds.y + bounds.height + 20;
    const PEEK_ZONE = 15;

    if (isDockedLeft) {
      const mouseNearLeftEdge = mousePos.x <= display.x + PEEK_ZONE;
      if (mouseNearLeftEdge && inVerticalRange && !hoverUndocked) {
        hoverUndocked = true;
        animateWindowX(win, bounds.x, display.x, 200, easeOutBack);
      } else if (!mouseNearLeftEdge && hoverUndocked && !isDockingInProgress) {
        const mouseAway = mousePos.x > display.x + bounds.width + 30 || !inVerticalRange;
        if (mouseAway) {
          hoverUndocked = false;
          animateWindowX(win, bounds.x, display.x - Math.floor(bounds.width * 0.3), 300, easeInCubic);
        }
      }
    } else if (isDockedRight) {
      const mouseNearRightEdge = mousePos.x >= display.x + display.width - PEEK_ZONE;
      if (mouseNearRightEdge && inVerticalRange && !hoverUndocked) {
        hoverUndocked = true;
        animateWindowX(win, bounds.x, display.x + display.width - bounds.width, 200, easeOutBack);
      } else if (!mouseNearRightEdge && hoverUndocked && !isDockingInProgress) {
        const mouseAway = mousePos.x < display.x + display.width - bounds.width - 30 || !inVerticalRange;
        if (mouseAway) {
          hoverUndocked = false;
          animateWindowX(win, bounds.x, display.x + display.width - Math.floor(bounds.width * 0.7), 300, easeInCubic);
        }
      }
    }
  }, 100);
}

export function stopHoverCheck() {
  if (hoverCheckInterval) { clearInterval(hoverCheckInterval); hoverCheckInterval = null; }
  hoverUndocked = false;
}
