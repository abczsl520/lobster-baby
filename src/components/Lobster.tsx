import React, { useState, useEffect, useRef } from 'react';
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
  onDoubleClick: () => void;
  dockState: string | null;
}

type ComboThreshold = 3 | 5 | 7 | 10;

const COMBO_RESET_MS = 1000;
const COMBO_THRESHOLD_ORDER: ComboThreshold[] = [3, 5, 7, 10];

export const Lobster: React.FC<LobsterProps> = ({ status, levelInfo, onClick, onDoubleClick, dockState }) => {
  const [isClicked, setIsClicked] = useState(false);
  const [tokenDelta, setTokenDelta] = useState<number | null>(null);
  const [showLevelUp, setShowLevelUp] = useState(false);
  const [comboBadge, setComboBadge] = useState<ComboThreshold | null>(null);
  const [isComboSpin, setIsComboSpin] = useState(false);
  const [isComboBounce, setIsComboBounce] = useState(false);
  const [isComboRainbow, setIsComboRainbow] = useState(false);
  const [isComboDance, setIsComboDance] = useState(false);
  const [showStarBurst, setShowStarBurst] = useState(false);
  const [starBurstKey, setStarBurstKey] = useState(0);
  const [showScreenFlash, setShowScreenFlash] = useState(false);
  const [screenFlashKey, setScreenFlashKey] = useState(0);
  const timeoutRef = useRef<NodeJS.Timeout | null>(null);
  const comboResetRef = useRef<NodeJS.Timeout | null>(null);
  const comboBadgeRef = useRef<NodeJS.Timeout | null>(null);
  const comboSpinRef = useRef<NodeJS.Timeout | null>(null);
  const comboBounceRef = useRef<NodeJS.Timeout | null>(null);
  const comboRainbowRef = useRef<NodeJS.Timeout | null>(null);
  const comboDanceRef = useRef<NodeJS.Timeout | null>(null);
  const starBurstRef = useRef<NodeJS.Timeout | null>(null);
  const screenFlashRef = useRef<NodeJS.Timeout | null>(null);
  const comboCountRef = useRef(0);
  const triggeredCombosRef = useRef<Set<ComboThreshold>>(new Set());
  const lastTokensRef = useRef<number>(levelInfo.currentTokens);
  const lastLevelRef = useRef<number>(0);
  const startTimeRef = useRef<number>(Date.now());

  useEffect(() => {
    return () => {
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
      }
      if (comboResetRef.current) {
        clearTimeout(comboResetRef.current);
      }
      if (comboBadgeRef.current) {
        clearTimeout(comboBadgeRef.current);
      }
      if (comboSpinRef.current) {
        clearTimeout(comboSpinRef.current);
      }
      if (comboBounceRef.current) {
        clearTimeout(comboBounceRef.current);
      }
      if (comboRainbowRef.current) {
        clearTimeout(comboRainbowRef.current);
      }
      if (comboDanceRef.current) {
        clearTimeout(comboDanceRef.current);
      }
      if (starBurstRef.current) {
        clearTimeout(starBurstRef.current);
      }
      if (screenFlashRef.current) {
        clearTimeout(screenFlashRef.current);
      }
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
      setShowLevelUp(true);
      window.electronAPI.notifyLevelUp(levelInfo.level);
    }
    lastLevelRef.current = levelInfo.level;
  }, [levelInfo.level]);

  const showComboBadge = (threshold: ComboThreshold) => {
    setComboBadge(threshold);
    if (comboBadgeRef.current) {
      clearTimeout(comboBadgeRef.current);
    }
    comboBadgeRef.current = setTimeout(() => {
      setComboBadge(null);
      comboBadgeRef.current = null;
    }, 900);
  };

  const triggerComboEffect = (threshold: ComboThreshold) => {
    showComboBadge(threshold);

    switch (threshold) {
      case 3:
        setIsComboSpin(true);
        if (comboSpinRef.current) {
          clearTimeout(comboSpinRef.current);
        }
        comboSpinRef.current = setTimeout(() => {
          setIsComboSpin(false);
          comboSpinRef.current = null;
        }, 700);
        break;
      case 5:
        setIsComboBounce(true);
        setShowStarBurst(true);
        setStarBurstKey(prev => prev + 1);
        if (comboBounceRef.current) {
          clearTimeout(comboBounceRef.current);
        }
        if (starBurstRef.current) {
          clearTimeout(starBurstRef.current);
        }
        comboBounceRef.current = setTimeout(() => {
          setIsComboBounce(false);
          comboBounceRef.current = null;
        }, 850);
        starBurstRef.current = setTimeout(() => {
          setShowStarBurst(false);
          starBurstRef.current = null;
        }, 850);
        break;
      case 7:
        setIsComboRainbow(true);
        setShowScreenFlash(true);
        setScreenFlashKey(prev => prev + 1);
        if (comboRainbowRef.current) {
          clearTimeout(comboRainbowRef.current);
        }
        if (screenFlashRef.current) {
          clearTimeout(screenFlashRef.current);
        }
        comboRainbowRef.current = setTimeout(() => {
          setIsComboRainbow(false);
          comboRainbowRef.current = null;
        }, 1200);
        screenFlashRef.current = setTimeout(() => {
          setShowScreenFlash(false);
          screenFlashRef.current = null;
        }, 550);
        break;
      case 10:
        setIsComboDance(true);
        if (comboDanceRef.current) {
          clearTimeout(comboDanceRef.current);
        }
        comboDanceRef.current = setTimeout(() => {
          setIsComboDance(false);
          comboDanceRef.current = null;
        }, 3000);
        break;
      default:
        break;
    }
  };

  const handleClick = () => {
    setIsClicked(true);
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
    }
    timeoutRef.current = setTimeout(() => {
      setIsClicked(false);
      timeoutRef.current = null;
    }, 500);

    comboCountRef.current += 1;
    if (comboResetRef.current) {
      clearTimeout(comboResetRef.current);
    }
    comboResetRef.current = setTimeout(() => {
      comboCountRef.current = 0;
      triggeredCombosRef.current.clear();
      comboResetRef.current = null;
    }, COMBO_RESET_MS);

    const nextThreshold = COMBO_THRESHOLD_ORDER.find(
      threshold => comboCountRef.current >= threshold && !triggeredCombosRef.current.has(threshold)
    );
    if (nextThreshold) {
      triggeredCombosRef.current.add(nextThreshold);
      triggerComboEffect(nextThreshold);
    }

    onClick();
  };

  const skinSrc = dockState
    ? (DOCK_SKINS[levelInfo.level] || dock1)
    : (LEVEL_SKINS[levelInfo.level] || level1);

  const burstStars = Array.from({ length: 10 }, (_, index) => {
    const angle = (Math.PI * 2 * index) / 10;
    return {
      id: `${starBurstKey}-${index}`,
      x: `${Math.cos(angle) * 64}px`,
      y: `${Math.sin(angle) * 64}px`,
      delay: `${index * 0.02}s`,
    };
  });

  return (
    <div
      className={`lobster-container ${status} ${isClicked ? 'clicked' : ''} ${dockState ? `docked-${dockState}` : ''}`}
      onClick={handleClick}
      onDoubleClick={onDoubleClick}
    >
      {showScreenFlash && <div key={screenFlashKey} className="combo-screen-flash" />}

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

      {comboBadge !== null && (
        <div className="combo-badge">x{comboBadge}</div>
      )}

      {showStarBurst && (
        <div key={starBurstKey} className="combo-starburst" aria-hidden="true">
          {burstStars.map(star => (
            <span
              key={star.id}
              className="combo-star"
              style={{
                '--burst-x': star.x,
                '--burst-y': star.y,
                '--burst-delay': star.delay,
              } as React.CSSProperties}
            />
          ))}
        </div>
      )}

      {/* Main lobster image - uses level-specific skin */}
      <div className={`lobster-dance-shell ${isComboDance ? 'combo-dance' : ''}`}>
        <div className={`lobster-rainbow-shell ${isComboRainbow ? 'combo-rainbow' : ''}`}>
          <div className={`lobster-spin-shell ${isComboSpin ? 'combo-spin' : ''}`}>
            <div className={`lobster-burst-shell ${isComboBounce ? 'combo-mega-bounce' : ''}`}>
              <img
                src={skinSrc}
                alt="龙虾宝宝"
                className={`lobster-img ${levelInfo.hasGlow ? 'glow' : ''} ${levelInfo.isRainbow ? 'rainbow' : ''}`}
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
