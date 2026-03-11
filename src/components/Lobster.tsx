import React, { useState, useEffect, useRef } from 'react';
import { OpenClawStatus, LevelInfo } from '../types';
import lobsterImg from '../assets/lobster-nobg.png';
import './Lobster.css';

interface LobsterProps {
  status: OpenClawStatus;
  levelInfo: LevelInfo;
  onClick: () => void;
  onDoubleClick: () => void;
}

export const Lobster: React.FC<LobsterProps> = ({ status, levelInfo, onClick, onDoubleClick }) => {
  const [isClicked, setIsClicked] = useState(false);
  const timeoutRef = useRef<NodeJS.Timeout | null>(null);

  useEffect(() => {
    // Cleanup timeout on unmount
    return () => {
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
      }
    };
  }, []);

  const handleClick = () => {
    setIsClicked(true);
    
    // Clear previous timeout if exists
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
    }
    
    timeoutRef.current = setTimeout(() => {
      setIsClicked(false);
      timeoutRef.current = null;
    }, 500);
    
    onClick();
  };

  return (
    <div
      className={`lobster-container ${status} ${isClicked ? 'clicked' : ''}`}
      onClick={handleClick}
      onDoubleClick={onDoubleClick}
    >
      {/* Level indicator */}
      <div className="level-badge">Lv.{levelInfo.level}</div>

      {/* Crown for high levels */}
      {levelInfo.hasCrown && <div className="crown-emoji">👑</div>}

      {/* Main lobster image */}
      <img
        src={lobsterImg}
        alt="龙虾宝宝"
        className={`lobster-img ${levelInfo.hasGlow ? 'glow' : ''} ${levelInfo.isRainbow ? 'rainbow' : ''}`}
        draggable={false}
      />

      {/* Particles for high levels */}
      {levelInfo.hasParticles && (
        <div className="particles">
          <span className="particle p1">✨</span>
          <span className="particle p2">⭐</span>
          <span className="particle p3">✨</span>
          <span className="particle p4">💫</span>
        </div>
      )}

      {/* Status indicator dot */}
      <div className={`status-dot status-${status}`} />
    </div>
  );
};
