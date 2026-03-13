import { useState, useCallback, useRef, useEffect } from 'react';
import { Lobster } from './components/Lobster';
import { StatusPanel } from './components/StatusPanel';
import { EmojiBubble, getRandomEmoji } from './components/EmojiBubble';
import { UpdateNotification } from './components/UpdateNotification';
import { Achievement, MILESTONES, Milestone } from './components/Achievement';
import { useOpenClawStatus } from './hooks/useOpenClawStatus';
import { useLevelSystem } from './hooks/useLevelSystem';
import { useUpdateChecker } from './hooks/useUpdateChecker';
import { SpeechBubble } from './components/SpeechBubble';
import { DRAG } from './constants';
import './App.css';

function App() {
  const { status, tokenInfo } = useOpenClawStatus();
  const levelInfo = useLevelSystem();
  const { updateInfo } = useUpdateChecker();
  const [showPanel, setShowPanel] = useState(false);
  const [showChart, setShowChart] = useState(false);
  const [showAchievements, setShowAchievements] = useState(false);
  const [showSocial, setShowSocial] = useState(false);
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
      if (rafId.current !== null) {
        cancelAnimationFrame(rafId.current);
      }
      if (fadeCheckIntervalRef.current) {
        clearInterval(fadeCheckIntervalRef.current);
      }
    };
  }, []);

  // Load settings on mount
  useEffect(() => {
    window.electronAPI.getSettings().then(settings => {
      setAutoFadeEnabled(settings.autoFadeEnabled ?? false);
    });
  }, []);

  // Auto-fade after 30 seconds of no interaction (only if enabled)
  useEffect(() => {
    if (!autoFadeEnabled) {
      setIsAutoFaded(false);
      return;
    }

    const AUTO_FADE_DELAY = 30_000; // 30 seconds
    
    fadeCheckIntervalRef.current = setInterval(() => {
      const elapsed = Date.now() - lastInteractionRef.current;
      if (elapsed > AUTO_FADE_DELAY && !showPanel) {
        setIsAutoFaded(true);
      }
    }, 5000); // Check every 5 seconds

    return () => {
      if (fadeCheckIntervalRef.current) {
        clearInterval(fadeCheckIntervalRef.current);
      }
    };
  }, [showPanel, autoFadeEnabled]);

  // Reset auto-fade on any interaction
  const resetAutoFade = useCallback(() => {
    lastInteractionRef.current = Date.now();
    setIsAutoFaded(false);
  }, []);

  // Show update notification when available
  useEffect(() => {
    if (updateInfo?.hasUpdate) {
      setShowUpdateNotification(true);
    }
  }, [updateInfo]);

  // Check milestones when token count changes
  useEffect(() => {
    const totalTokens = tokenInfo.total;
    if (totalTokens <= 0) return;

    for (const milestone of MILESTONES) {
      if (totalTokens >= milestone.tokens && !unlockedMilestones.has(milestone.id)) {
        setUnlockedMilestones(prev => new Set([...prev, milestone.id]));
        // Only show achievement popup for newly crossed milestones
        // (not ones already passed on startup)
        if (unlockedMilestones.size > 0 || totalTokens < milestone.tokens * 1.1) {
          setCurrentAchievement(milestone);
        }
        break; // Show one at a time
      }
    }
  }, [tokenInfo.total, unlockedMilestones]);

  // Listen for right-click menu toggle events
  useEffect(() => {
    const cleanupPanel = window.electronAPI.onTogglePanel(() => {
      setShowPanel(prev => {
        if (!prev) window.electronAPI.showPanel();
        else window.electronAPI.hidePanel();
        return !prev;
      });
    });
    const cleanupChart = window.electronAPI.onToggleChart(() => {
      setShowPanel(true);
      window.electronAPI.showPanel();
      setShowChart(prev => !prev);
    });
    const cleanupAchievements = window.electronAPI.onShowAchievements(() => {
      setShowPanel(true);
      window.electronAPI.showPanel();
      setShowAchievements(true);
    });
    const cleanupSocial = window.electronAPI.onShowSocial(() => {
      setShowPanel(true);
      window.electronAPI.showPanel();
      setShowSocial(true);
    });
    const cleanupDockState = window.electronAPI.onDockStateChanged((state) => {
      setDockState(state);
    });
    return () => { cleanupPanel(); cleanupChart(); cleanupAchievements(); cleanupSocial(); cleanupDockState(); };
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
      // Accumulate delta
      accumulatedDelta.current.x += dx;
      accumulatedDelta.current.y += dy;

      // Cancel previous frame if still pending
      if (rafId.current !== null) {
        cancelAnimationFrame(rafId.current);
      }

      // Batch updates: only send IPC when accumulated delta is significant
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
    // Flush any remaining accumulated delta BEFORE canceling rafId
    const hasAccumulated = accumulatedDelta.current.x !== 0 || accumulatedDelta.current.y !== 0;
    
    if (rafId.current !== null) {
      cancelAnimationFrame(rafId.current);
      rafId.current = null;
    }

    // Send remaining delta if any
    if (isDragging.current && hasAccumulated) {
      window.electronAPI.moveWindow(accumulatedDelta.current.x, accumulatedDelta.current.y);
      accumulatedDelta.current = { x: 0, y: 0 };
    }

    // Notify main process drag ended
    if (isDragging.current) {
      window.electronAPI.dragEnd();
    }

    dragStart.current = null;
    
    setTimeout(() => {
      isDragging.current = false;
      setIsDraggingState(false);
    }, 50);
  }, []);

  const handleClick = useCallback(() => {
    if (isDragging.current) return;
    setEmoji(getRandomEmoji(status));
  }, [status]);

  const handleClosePanel = useCallback(async () => {
    await window.electronAPI.hidePanel();
    setShowPanel(false);
  }, []);

  return (
    <div
      className={`app ${showPanel ? 'panel-open' : ''} ${isDraggingState ? 'dragging' : ''} ${isAutoFaded ? 'auto-faded' : ''}`}
      onMouseDown={handleMouseDown}
      onMouseMove={handleMouseMove}
      onMouseUp={handleMouseUp}
      onMouseLeave={() => {
        handleMouseUp();
        // Only redock if not dragging
        if (!isDragging.current) {
          window.electronAPI.redock();
        }
      }}
      onMouseEnter={() => {
        resetAutoFade();
        // Only undock if not dragging
        if (!isDragging.current) {
          window.electronAPI.undock();
        }
      }}
    >
      {showUpdateNotification && updateInfo && (
        <UpdateNotification
          updateInfo={updateInfo}
          onDismiss={() => setShowUpdateNotification(false)}
        />
      )}

      {currentAchievement && (
        <Achievement
          title={currentAchievement.title}
          description={currentAchievement.description}
          icon={currentAchievement.icon}
          onComplete={() => setCurrentAchievement(null)}
        />
      )}

      {emoji && <EmojiBubble emoji={emoji} onComplete={() => setEmoji(null)} />}

      <div className="lobster-area">
        <SpeechBubble
          status={status}
          levelInfo={levelInfo}
          tokenInfo={tokenInfo}
          isPanelOpen={showPanel}
        />
        <Lobster
          status={status}
          levelInfo={levelInfo}
          onClick={handleClick}
          dockState={dockState}
        />
      </div>

      {showPanel && (
        <StatusPanel
          status={status}
          levelInfo={levelInfo}
          tokenInfo={tokenInfo}
          onClose={handleClosePanel}
          showChart={showChart}
          onToggleChart={() => setShowChart(prev => !prev)}
          autoFadeEnabled={autoFadeEnabled}
          onToggleAutoFade={() => {
            const newVal = !autoFadeEnabled;
            setAutoFadeEnabled(newVal);
            window.electronAPI.updateSettings({ autoFadeEnabled: newVal });
          }}
          updateInfo={updateInfo}
          showAchievements={showAchievements}
          onToggleAchievements={() => setShowAchievements(prev => !prev)}
          showSocial={showSocial}
          onCloseSocial={() => setShowSocial(false)}
        />
      )}
    </div>
  );
}

export default App;
