import { useState, useCallback, useRef, useEffect } from 'react';
import { Lobster } from './components/Lobster';
import { StatusPanel } from './components/StatusPanel';
import { EmojiBubble, getRandomEmoji } from './components/EmojiBubble';
import { useOpenClawStatus } from './hooks/useOpenClawStatus';
import { useLevelSystem } from './hooks/useLevelSystem';
import { DRAG } from './constants';
import './App.css';

function App() {
  const { status, tokenInfo } = useOpenClawStatus();
  const levelInfo = useLevelSystem();
  const [showPanel, setShowPanel] = useState(false);
  const [emoji, setEmoji] = useState<string | null>(null);
  const [isDraggingState, setIsDraggingState] = useState(false);

  // Drag state
  const isDragging = useRef(false);
  const dragStart = useRef<{ screenX: number; screenY: number } | null>(null);
  const accumulatedDelta = useRef({ x: 0, y: 0 });
  const rafId = useRef<number | null>(null);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (rafId.current !== null) {
        cancelAnimationFrame(rafId.current);
      }
    };
  }, []);

  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    if (e.button !== 0) return;
    dragStart.current = { screenX: e.screenX, screenY: e.screenY };
    isDragging.current = false;
    accumulatedDelta.current = { x: 0, y: 0 };
  }, []);

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

  const handleDoubleClick = useCallback(async () => {
    if (isDragging.current) return;
    if (!showPanel) {
      await window.electronAPI.showPanel();
      setShowPanel(true);
    }
  }, [showPanel]);

  const handleClosePanel = useCallback(async () => {
    await window.electronAPI.hidePanel();
    setShowPanel(false);
  }, []);

  return (
    <div
      className={`app ${showPanel ? 'panel-open' : ''} ${isDraggingState ? 'dragging' : ''}`}
      onMouseDown={handleMouseDown}
      onMouseMove={handleMouseMove}
      onMouseUp={handleMouseUp}
      onMouseLeave={handleMouseUp}
    >
      {emoji && <EmojiBubble emoji={emoji} onComplete={() => setEmoji(null)} />}

      <div className="lobster-area">
        <Lobster
          status={status}
          levelInfo={levelInfo}
          onClick={handleClick}
          onDoubleClick={handleDoubleClick}
        />
      </div>

      {showPanel && (
        <StatusPanel
          status={status}
          levelInfo={levelInfo}
          tokenInfo={tokenInfo}
          onClose={handleClosePanel}
        />
      )}
    </div>
  );
}

export default App;
