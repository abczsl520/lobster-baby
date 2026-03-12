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
import './Lobster.css';

const LEVEL_SKINS: Record<number, string> = {
  1: level1, 2: level2, 3: level3, 4: level4, 5: level5,
  6: level6, 7: level7, 8: level8, 9: level9, 10: level10,
};

interface LobsterProps {
  status: OpenClawStatus;
  levelInfo: LevelInfo;
  onClick: () => void;
  onDoubleClick: () => void;
}

export const Lobster: React.FC<LobsterProps> = ({ status, levelInfo, onClick, onDoubleClick }) => {
  const [isClicked, setIsClicked] = useState(false);
  const [tokenDelta, setTokenDelta] = useState<number | null>(null);
  const [showLevelUp, setShowLevelUp] = useState(false);
  const timeoutRef = useRef<NodeJS.Timeout | null>(null);
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
      setShowLevelUp(true);
      window.electronAPI.notifyLevelUp(levelInfo.level);
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
    onClick();
  };

  const skinSrc = LEVEL_SKINS[levelInfo.level] || level1;

  return (
    <div
      className={`lobster-container ${status} ${isClicked ? 'clicked' : ''}`}
      onClick={handleClick}
      onDoubleClick={onDoubleClick}
    >
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
      <img
        src={skinSrc}
        alt="龙虾宝宝"
        className={`lobster-img ${levelInfo.hasGlow ? 'glow' : ''} ${levelInfo.isRainbow ? 'rainbow' : ''}`}
        draggable={false}
      />

      {/* Status indicator dot */}
      <div className={`status-dot status-${status}`} />
    </div>
  );
};
