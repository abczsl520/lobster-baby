import { useState, useCallback, useRef, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { Lobster } from './components/Lobster';
import { StatusPanel } from './components/StatusPanel';
import { EmojiBubble, getRandomEmoji } from './components/EmojiBubble';
import { UpdateNotification } from './components/UpdateNotification';
import { Achievement, MILESTONES, Milestone } from './components/Achievement';
import { useOpenClawStatus } from './hooks/useOpenClawStatus';
import { useLevelSystem } from './hooks/useLevelSystem';
import { useUpdateChecker } from './hooks/useUpdateChecker';
import { SpeechBubble } from './components/SpeechBubble';
import { PluginToast } from './components/PluginToast';
import { DRAG } from './constants';
import './App.css';

// Detect if this is the panel window
function getPanelRoute(): string | null {
  const params = new URLSearchParams(window.location.search);
  return params.get('panel');
}

// ─── Panel Window App ───
function PanelApp() {
  const { status, tokenInfo } = useOpenClawStatus();
  const levelInfo = useLevelSystem();
  const { updateInfo } = useUpdateChecker();
  const [initialRoute, setInitialRoute] = useState<string>(getPanelRoute() || 'status');

  // Listen for navigation from main process
  useEffect(() => {
    const cleanup = window.electronAPI.onNavigatePanel?.((route: string) => {
      setInitialRoute(route);
    });
    return () => { cleanup?.(); };
  }, []);

  const handleClose = useCallback(() => {
    window.electronAPI.closePanel();
  }, []);

  return (
    <div className="app panel-window">
      <StatusPanel
        status={status}
        levelInfo={levelInfo}
        tokenInfo={tokenInfo}
        onClose={handleClose}
        showChart={initialRoute === 'chart'}
        onToggleChart={() => {}}
        autoFadeEnabled={false}
        onToggleAutoFade={() => {}}
        updateInfo={updateInfo}
        showAchievements={initialRoute === 'achievements'}
        onToggleAchievements={() => {}}
        showSocial={initialRoute === 'social'}
        onOpenSocial={() => setInitialRoute('social')}
        onCloseSocial={() => setInitialRoute('status')}
        showPlugins={initialRoute === 'plugins'}
        onOpenPlugins={() => setInitialRoute('plugins')}
        onClosePlugins={() => setInitialRoute('status')}
        showRemote={initialRoute === 'remote'}
        onOpenRemote={() => setInitialRoute('remote')}
        onCloseRemote={() => setInitialRoute('status')}
        isPanelWindow={true}
      />
      <PluginToast />
    </div>
  );
}

// ─── Main (Lobster) Window App ───
function LobsterApp() {
  const { status, tokenInfo } = useOpenClawStatus();
  const levelInfo = useLevelSystem();
  const { updateInfo } = useUpdateChecker();
  const { t } = useTranslation();
  const [emoji, setEmoji] = useState<string | null>(null);
  const [isDraggingState, setIsDraggingState] = useState(false);
  const [dockState, setDockState] = useState<string | null>(null);
  const [showUpdateNotification, setShowUpdateNotification] = useState(false);
  const [isAutoFaded, setIsAutoFaded] = useState(false);
  const [autoFadeEnabled, setAutoFadeEnabled] = useState(false);
  const [currentAchievement, setCurrentAchievement] = useState<Milestone | null>(null);
  const [unlockedMilestones, setUnlockedMilestones] = useState<Set<string>>(new Set());

  // Drag state
  const isDragging = useRef(false);
  const dragStart = useRef<{ screenX: number; screenY: number } | null>(null);
  const accumulatedDelta = useRef({ x: 0, y: 0 });
  const rafId = useRef<number | null>(null);

  // Auto-fade state
  const lastInteractionRef = useRef<number>(Date.now());
  const fadeCheckIntervalRef = useRef<NodeJS.Timeout | null>(null);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (rafId.current !== null) cancelAnimationFrame(rafId.current);
      if (fadeCheckIntervalRef.current) clearInterval(fadeCheckIntervalRef.current);
    };
  }, []);

  // Load settings on mount
  useEffect(() => {
    window.electronAPI.getSettings().then(settings => {
      setAutoFadeEnabled(settings.autoFadeEnabled ?? false);
      if (settings.idleOpacity) {
        document.documentElement.style.setProperty('--idle-opacity', String(settings.idleOpacity / 100));
      }
    }).catch(() => {});
  }, []);

  // Auto-fade after 30 seconds of no interaction
  useEffect(() => {
    if (!autoFadeEnabled) { setIsAutoFaded(false); return; }
    const AUTO_FADE_DELAY = 30_000;
    fadeCheckIntervalRef.current = setInterval(() => {
      if (Date.now() - lastInteractionRef.current > AUTO_FADE_DELAY) setIsAutoFaded(true);
    }, 5000);
    return () => { if (fadeCheckIntervalRef.current) clearInterval(fadeCheckIntervalRef.current); };
  }, [autoFadeEnabled]);

  const resetAutoFade = useCallback(() => {
    lastInteractionRef.current = Date.now();
    setIsAutoFaded(false);
  }, []);

  useEffect(() => {
    if (updateInfo?.hasUpdate) setShowUpdateNotification(true);
  }, [updateInfo]);

  // Check milestones
  useEffect(() => {
    const totalTokens = tokenInfo.total;
    if (totalTokens <= 0) return;
    for (const milestone of MILESTONES) {
      if (totalTokens >= milestone.tokens && !unlockedMilestones.has(milestone.id)) {
        setUnlockedMilestones(prev => new Set([...prev, milestone.id]));
        if (unlockedMilestones.size > 0 || totalTokens < milestone.tokens * 1.1) {
          setCurrentAchievement(milestone);
        }
        break;
      }
    }
  }, [tokenInfo.total, unlockedMilestones]);

  // Listen for dock state changes
  useEffect(() => {
    const cleanupDockState = window.electronAPI.onDockStateChanged((state) => setDockState(state));
    return () => { cleanupDockState(); };
  }, []);

  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    if (e.button !== 0) return;
    resetAutoFade();
    dragStart.current = { screenX: e.screenX, screenY: e.screenY };
    isDragging.current = false;
    accumulatedDelta.current = { x: 0, y: 0 };
  }, [resetAutoFade]);

  const handleMouseMove = useCallback((e: React.MouseEvent) => {
    if (!dragStart.current) return;
    const dx = e.screenX - dragStart.current.screenX;
    const dy = e.screenY - dragStart.current.screenY;
    if (!isDragging.current && (Math.abs(dx) > DRAG.THRESHOLD || Math.abs(dy) > DRAG.THRESHOLD)) {
      isDragging.current = true;
      setIsDraggingState(true);
    }
    if (isDragging.current) {
      accumulatedDelta.current.x += dx;
      accumulatedDelta.current.y += dy;
      if (rafId.current !== null) cancelAnimationFrame(rafId.current);
      const accumulated = accumulatedDelta.current;
      if (Math.abs(accumulated.x) >= 1 || Math.abs(accumulated.y) >= 1) {
        rafId.current = requestAnimationFrame(() => {
          window.electronAPI.moveWindow(accumulated.x, accumulated.y);
          accumulatedDelta.current = { x: 0, y: 0 };
          rafId.current = null;
        });
      }
      dragStart.current = { screenX: e.screenX, screenY: e.screenY };
    }
  }, []);

  const handleMouseUp = useCallback(() => {
    const hasAccumulated = accumulatedDelta.current.x !== 0 || accumulatedDelta.current.y !== 0;
    if (rafId.current !== null) { cancelAnimationFrame(rafId.current); rafId.current = null; }
    if (isDragging.current && hasAccumulated) {
      window.electronAPI.moveWindow(accumulatedDelta.current.x, accumulatedDelta.current.y);
      accumulatedDelta.current = { x: 0, y: 0 };
    }
    if (isDragging.current) window.electronAPI.dragEnd();
    dragStart.current = null;
    setTimeout(() => { isDragging.current = false; setIsDraggingState(false); }, 50);
  }, []);

  const handleClick = useCallback(() => {
    if (isDragging.current) return;
    setEmoji(getRandomEmoji(status));
  }, [status]);

  // Double-click opens panel
  const handleDoubleClick = useCallback(() => {
    window.electronAPI.showPanel('status');
  }, []);

  return (
    <div
      className={`app ${isDraggingState ? 'dragging' : ''} ${isAutoFaded ? 'auto-faded' : ''}`}
      onMouseDown={handleMouseDown}
      onMouseMove={handleMouseMove}
      onMouseUp={handleMouseUp}
      onMouseLeave={() => {
        handleMouseUp();
        if (!isDragging.current) window.electronAPI.redock();
      }}
      onMouseEnter={() => {
        resetAutoFade();
        if (!isDragging.current) window.electronAPI.undock();
      }}
    >
      {showUpdateNotification && updateInfo && (
        <UpdateNotification updateInfo={updateInfo} onDismiss={() => setShowUpdateNotification(false)} />
      )}

      {currentAchievement && (
        <Achievement
          title={t(currentAchievement.titleKey)}
          description={t(currentAchievement.descKey)}
          icon={currentAchievement.icon}
          onComplete={() => setCurrentAchievement(null)}
        />
      )}

      {emoji && <EmojiBubble emoji={emoji} onComplete={() => setEmoji(null)} />}

      <div className="lobster-area" onDoubleClick={handleDoubleClick}>
        <SpeechBubble
          status={status}
          levelInfo={levelInfo}
          tokenInfo={tokenInfo}
          isPanelOpen={false}
        />
        <Lobster
          status={status}
          levelInfo={levelInfo}
          onClick={handleClick}
          onDoubleClick={() => window.electronAPI.showPanel('status')}
          dockState={dockState}
        />
      </div>

      <PluginToast />
    </div>
  );
}

// ─── Router ───
function App() {
  const panelRoute = getPanelRoute();
  return panelRoute ? <PanelApp /> : <LobsterApp />;
}

export default App;
