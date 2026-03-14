import React, { useState, useEffect, useRef, useReducer } from 'react';
import { OpenClawStatus, LevelInfo } from '../types';
import { TokenFly } from './TokenFly';
import { LevelUpEffect } from './LevelUpEffect';
// Level skin imports
import level1 from '../assets/levels/level1.png';
import level2 from '../assets/levels/level2.png';
import level3 from '../assets/levels/level3.png';
import level4 from '../assets/levels/level4.png';
import level5 from '../assets/levels/level5.png';
import level6 from '../assets/levels/level6.png';
import level7 from '../assets/levels/level7.png';
import level8 from '../assets/levels/level8.png';
import level9 from '../assets/levels/level9.png';
import level10 from '../assets/levels/level10.png';
// Dock skin imports (peeking from edge)
import dock1 from '../assets/dock/dock1.png';
import dock2 from '../assets/dock/dock2.png';
import dock3 from '../assets/dock/dock3.png';
import dock4 from '../assets/dock/dock4.png';
import dock5 from '../assets/dock/dock5.png';
import dock6 from '../assets/dock/dock6.png';
import dock7 from '../assets/dock/dock7.png';
import dock8 from '../assets/dock/dock8.png';
import dock9 from '../assets/dock/dock9.png';
import dock10 from '../assets/dock/dock10.png';
import './Lobster.css';

const LEVEL_SKINS: Record<number, string> = {
  1: level1, 2: level2, 3: level3, 4: level4, 5: level5,
  6: level6, 7: level7, 8: level8, 9: level9, 10: level10,
};

const DOCK_SKINS: Record<number, string> = {
  1: dock1, 2: dock2, 3: dock3, 4: dock4, 5: dock5,
  6: dock6, 7: dock7, 8: dock8, 9: dock9, 10: dock10,
};

interface LobsterProps {
  status: OpenClawStatus;
  levelInfo: LevelInfo;
  onClick: () => void;
  dockState: string | null;
}

// ─── Combo System ───
type ComboTier = 3 | 5 | 7 | 10;
const COMBO_TIERS: ComboTier[] = [3, 5, 7, 10];
const COMBO_RESET_MS = 1000;

interface ComboState {
  spin: boolean;
  bounce: boolean;
  rainbow: boolean;
  dance: boolean;
  badge: ComboTier | null;
  starBurst: boolean;
  starBurstKey: number;
  screenFlash: boolean;
  screenFlashKey: number;
}

const COMBO_INIT: ComboState = {
  spin: false, bounce: false, rainbow: false, dance: false,
  badge: null, starBurst: false, starBurstKey: 0,
  screenFlash: false, screenFlashKey: 0,
};

type ComboAction =
  | { type: 'TRIGGER'; tier: ComboTier }
  | { type: 'CLEAR_SPIN' }
  | { type: 'CLEAR_BOUNCE' }
  | { type: 'CLEAR_RAINBOW' }
  | { type: 'CLEAR_DANCE' }
  | { type: 'CLEAR_BADGE' }
  | { type: 'CLEAR_STARBURST' }
  | { type: 'CLEAR_FLASH' }
  | { type: 'RESET' };

function comboReducer(state: ComboState, action: ComboAction): ComboState {
  switch (action.type) {
    case 'TRIGGER': {
      const s = { ...state, badge: action.tier };
      switch (action.tier) {
        case 3: return { ...s, spin: true };
        case 5: return { ...s, bounce: true, starBurst: true, starBurstKey: state.starBurstKey + 1 };
        case 7: return { ...s, rainbow: true, screenFlash: true, screenFlashKey: state.screenFlashKey + 1 };
        case 10: return { ...s, dance: true, starBurst: true, starBurstKey: state.starBurstKey + 1, screenFlash: true, screenFlashKey: state.screenFlashKey + 1 };
      }
      return s;
    }
    case 'CLEAR_SPIN': return { ...state, spin: false };
    case 'CLEAR_BOUNCE': return { ...state, bounce: false };
    case 'CLEAR_RAINBOW': return { ...state, rainbow: false };
    case 'CLEAR_DANCE': return { ...state, dance: false };
    case 'CLEAR_BADGE': return { ...state, badge: null };
    case 'CLEAR_STARBURST': return { ...state, starBurst: false };
    case 'CLEAR_FLASH': return { ...state, screenFlash: false };
    case 'RESET': return COMBO_INIT;
    default: return state;
  }
}

// Durations per tier: [badge, effect]
const COMBO_DURATIONS: Record<ComboTier, { badge: number; effect: number; starBurst?: number; flash?: number }> = {
  3:  { badge: 900, effect: 700 },
  5:  { badge: 900, effect: 850, starBurst: 850 },
  7:  { badge: 900, effect: 1200, flash: 550 },
  10: { badge: 900, effect: 3000, starBurst: 1000, flash: 550 },
};

export const Lobster: React.FC<LobsterProps> = ({ status, levelInfo, onClick, dockState }) => {
  const [isClicked, setIsClicked] = useState(false);
  const [tokenDelta, setTokenDelta] = useState<number | null>(null);
  const [showLevelUp, setShowLevelUp] = useState(false);
  const [skinTransition, setSkinTransition] = useState(false);
  const [prevSkin, setPrevSkin] = useState<string | null>(null);
  const [combo, dispatchCombo] = useReducer(comboReducer, COMBO_INIT);
  const timeoutRef = useRef<NodeJS.Timeout | null>(null);
  const clickCountRef = useRef(0);
  const comboResetRef = useRef<NodeJS.Timeout | null>(null);
  const triggeredRef = useRef<Set<ComboTier>>(new Set());
  const comboTimersRef = useRef<NodeJS.Timeout[]>([]);
  const lastTokensRef = useRef<number>(levelInfo.currentTokens);
  const lastLevelRef = useRef<number>(0);
  const startTimeRef = useRef<number>(Date.now());

  // Cleanup all combo timers
  const clearComboTimers = () => {
    comboTimersRef.current.forEach(t => clearTimeout(t));
    comboTimersRef.current = [];
  };

  const scheduleCombo = (fn: () => void, ms: number) => {
    comboTimersRef.current.push(setTimeout(fn, ms));
  };

  useEffect(() => {
    return () => {
      if (timeoutRef.current) clearTimeout(timeoutRef.current);
      if (comboResetRef.current) clearTimeout(comboResetRef.current);
      clearComboTimers();
    };
  }, []);

  // Track token changes and show fly effect when active
  useEffect(() => {
    if (status === 'active') {
      const delta = levelInfo.currentTokens - lastTokensRef.current;
      if (delta > 0 && delta < 100_000_000) { // Reasonable delta (< 100M)
        setTokenDelta(delta);
      }
    }
    lastTokensRef.current = levelInfo.currentTokens;
  }, [levelInfo.currentTokens, status]);

  // Detect level up (skip first 10 seconds after startup to avoid false triggers)
  useEffect(() => {
    const elapsed = Date.now() - startTimeRef.current;
    if (elapsed < 10_000) {
      // Still in startup phase, just track the level
      lastLevelRef.current = levelInfo.level;
      return;
    }
    if (levelInfo.level > lastLevelRef.current && lastLevelRef.current > 0) {
      // Save old skin for crossfade
      const oldSkin = LEVEL_SKINS[lastLevelRef.current] || level1;
      setPrevSkin(oldSkin);
      setSkinTransition(true);

      setShowLevelUp(true);
      window.electronAPI.notifyLevelUp(levelInfo.level);

      // End crossfade after animation
      setTimeout(() => {
        setSkinTransition(false);
        setPrevSkin(null);
      }, 1200);
    }
    lastLevelRef.current = levelInfo.level;
  }, [levelInfo.level]);

  const handleClick = () => {
    setIsClicked(true);
    if (timeoutRef.current) clearTimeout(timeoutRef.current);
    timeoutRef.current = setTimeout(() => {
      setIsClicked(false);
      timeoutRef.current = null;
    }, 500);

    // Combo tracking
    clickCountRef.current += 1;
    if (comboResetRef.current) clearTimeout(comboResetRef.current);
    comboResetRef.current = setTimeout(() => {
      clickCountRef.current = 0;
      triggeredRef.current.clear();
      comboResetRef.current = null;
    }, COMBO_RESET_MS);

    // Check thresholds (ascending, trigger each once per combo chain)
    for (const tier of COMBO_TIERS) {
      if (clickCountRef.current >= tier && !triggeredRef.current.has(tier)) {
        triggeredRef.current.add(tier);
        triggerCombo(tier);
        break; // Only trigger one per click
      }
    }

    // Reset at 20 for looping
    if (clickCountRef.current >= 20) {
      clickCountRef.current = 0;
      triggeredRef.current.clear();
    }

    onClick();
  };

  const triggerCombo = (tier: ComboTier) => {
    dispatchCombo({ type: 'TRIGGER', tier });
    const dur = COMBO_DURATIONS[tier];

    scheduleCombo(() => dispatchCombo({ type: 'CLEAR_BADGE' }), dur.badge);

    switch (tier) {
      case 3:
        scheduleCombo(() => dispatchCombo({ type: 'CLEAR_SPIN' }), dur.effect);
        break;
      case 5:
        scheduleCombo(() => dispatchCombo({ type: 'CLEAR_BOUNCE' }), dur.effect);
        scheduleCombo(() => dispatchCombo({ type: 'CLEAR_STARBURST' }), dur.starBurst!);
        break;
      case 7:
        scheduleCombo(() => dispatchCombo({ type: 'CLEAR_RAINBOW' }), dur.effect);
        scheduleCombo(() => dispatchCombo({ type: 'CLEAR_FLASH' }), dur.flash!);
        break;
      case 10:
        scheduleCombo(() => dispatchCombo({ type: 'CLEAR_DANCE' }), dur.effect);
        scheduleCombo(() => dispatchCombo({ type: 'CLEAR_STARBURST' }), dur.starBurst!);
        scheduleCombo(() => dispatchCombo({ type: 'CLEAR_FLASH' }), dur.flash!);
        break;
    }
  };

  const skinSrc = dockState
    ? (DOCK_SKINS[levelInfo.level] || dock1)
    : (LEVEL_SKINS[levelInfo.level] || level1);

  // Generate star burst positions
  const burstStars = Array.from({ length: 10 }, (_, i) => {
    const angle = (Math.PI * 2 * i) / 10;
    return {
      id: `${combo.starBurstKey}-${i}`,
      x: `${Math.cos(angle) * 64}px`,
      y: `${Math.sin(angle) * 64}px`,
      delay: `${i * 0.02}s`,
    };
  });

  return (
    <div
      className={`lobster-container ${status} ${isClicked ? 'clicked' : ''} ${dockState ? `docked-${dockState}` : ''}`}
      onClick={handleClick}
    >
      {/* Screen flash (fixed, outside lobster) */}
      {combo.screenFlash && <div key={combo.screenFlashKey} className="combo-screen-flash" />}

      {/* Combo badge */}
      {combo.badge !== null && (
        <div className="combo-badge">×{combo.badge}</div>
      )}

      {/* Star burst effect */}
      {combo.starBurst && (
        <div key={combo.starBurstKey} className="combo-starburst">
          {burstStars.map(star => (
            <span
              key={star.id}
              className="combo-star"
              style={{
                '--burst-x': star.x,
                '--burst-y': star.y,
                '--burst-delay': star.delay,
                animationDelay: star.delay,
              } as React.CSSProperties}
            />
          ))}
        </div>
      )}

      {/* Level indicator */}
      <div className="level-badge">Lv.{levelInfo.level}</div>

      {/* Token fly effect */}
      {tokenDelta !== null && (
        <TokenFly tokens={tokenDelta} onComplete={() => setTokenDelta(null)} />
      )}

      {/* Level up effect */}
      {showLevelUp && (
        <LevelUpEffect level={levelInfo.level} onComplete={() => setShowLevelUp(false)} />
      )}

      {/* Main lobster image - nested shells for stackable combo animations */}
      <div className={`combo-shell-dance ${combo.dance ? 'combo-dance' : ''}`}>
        <div className={`combo-shell-rainbow ${combo.rainbow ? 'combo-rainbow' : ''}`}>
          <div className={`combo-shell-spin ${combo.spin ? 'combo-spin' : ''}`}>
            <div className={`combo-shell-bounce ${combo.bounce ? 'combo-mega-bounce' : ''}`}>
              {/* Old skin fading out during level transition */}
              {skinTransition && prevSkin && (
                <img
                  src={prevSkin}
                  alt=""
                  className="lobster-img lobster-img-old"
                  draggable={false}
                />
              )}
              <img
                src={skinSrc}
                alt="龙虾宝宝"
                className={`lobster-img ${levelInfo.hasGlow ? 'glow' : ''} ${levelInfo.isRainbow ? 'rainbow' : ''} ${skinTransition ? 'lobster-img-new' : ''}`}
                draggable={false}
              />
            </div>
          </div>
        </div>
      </div>

      {/* Status indicator dot */}
      <div className={`status-dot status-${status}`} />
    </div>
  );
};
