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
  dockState: string | null;
}

export const Lobster: React.FC<LobsterProps> = ({ status, levelInfo, onClick, dockState }) => {
  const [isClicked, setIsClicked] = useState(false);
  const [tokenDelta, setTokenDelta] = useState<number | null>(null);
  const [showLevelUp, setShowLevelUp] = useState(false);
  const [skinTransition, setSkinTransition] = useState(false);
  const [prevSkin, setPrevSkin] = useState<string | null>(null);
  const [comboEffect, setComboEffect] = useState<string | null>(null);
  const [comboBadge, setComboBadge] = useState<number | null>(null);
  const [showStarBurst, setShowStarBurst] = useState(false);
  const [starBurstKey, setStarBurstKey] = useState(0);
  const timeoutRef = useRef<NodeJS.Timeout | null>(null);
  const clickCountRef = useRef(0);
  const comboTimerRef = useRef<NodeJS.Timeout | null>(null);
  const lastTokensRef = useRef<number>(levelInfo.currentTokens);
  const lastLevelRef = useRef<number>(0);
  const startTimeRef = useRef<number>(Date.now());

  useEffect(() => {
    return () => {
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
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
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
    }
    timeoutRef.current = setTimeout(() => {
      setIsClicked(false);
      timeoutRef.current = null;
    }, 500);

    // Combo click tracking
    clickCountRef.current += 1;
    if (comboTimerRef.current) clearTimeout(comboTimerRef.current);
    comboTimerRef.current = setTimeout(() => {
      clickCountRef.current = 0;
    }, 800); // Reset combo after 800ms of no clicks

    const count = clickCountRef.current;
    if (count === 5) {
      setComboEffect('spin');
      setComboBadge(5);
      setTimeout(() => { setComboEffect(null); setComboBadge(null); }, 1000);
    } else if (count === 10) {
      setComboEffect('dance');
      setComboBadge(10);
      setShowStarBurst(true);
      setStarBurstKey(k => k + 1);
      setTimeout(() => { setComboEffect(null); setComboBadge(null); setShowStarBurst(false); }, 2000);
    } else if (count === 15) {
      setComboEffect('rainbow-burst');
      setComboBadge(15);
      setShowStarBurst(true);
      setStarBurstKey(k => k + 1);
      setTimeout(() => { setComboEffect(null); setComboBadge(null); setShowStarBurst(false); }, 2500);
    } else if (count >= 20) {
      setComboEffect('mega-spin');
      setComboBadge(20);
      setShowStarBurst(true);
      setStarBurstKey(k => k + 1);
      setTimeout(() => { setComboEffect(null); setComboBadge(null); setShowStarBurst(false); }, 3000);
      clickCountRef.current = 0;
    }

    onClick();
  };

  const skinSrc = dockState
    ? (DOCK_SKINS[levelInfo.level] || dock1)
    : (LEVEL_SKINS[levelInfo.level] || level1);

  // Generate star burst positions
  const burstStars = Array.from({ length: 10 }, (_, i) => {
    const angle = (Math.PI * 2 * i) / 10;
    return {
      id: `${starBurstKey}-${i}`,
      x: `${Math.cos(angle) * 60}px`,
      y: `${Math.sin(angle) * 60}px`,
      delay: `${i * 0.02}s`,
    };
  });

  return (
    <div
      className={`lobster-container ${status} ${isClicked ? 'clicked' : ''} ${dockState ? `docked-${dockState}` : ''} ${comboEffect ? `combo-${comboEffect}` : ''}`}
      onClick={handleClick}
    >
      {/* Combo badge */}
      {comboBadge !== null && (
        <div className="combo-badge">×{comboBadge}</div>
      )}

      {/* Star burst effect */}
      {showStarBurst && (
        <div className="combo-starburst">
          {burstStars.map(star => (
            <div
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

      {/* Main lobster image - uses level-specific skin */}
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

      {/* Status indicator dot */}
      <div className={`status-dot status-${status}`} />
    </div>
  );
};
