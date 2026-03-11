import { useState, useEffect } from 'react';
import { LevelInfo } from '../types';
import { calculateLevel } from '../utils/levels';

export function useLevelSystem() {
  const [levelInfo, setLevelInfo] = useState<LevelInfo>({
    level: 1,
    currentTokens: 0,
    nextLevelTokens: 10_000_000,
    progress: 0,
    color: '#ff4444',
    hasCrown: false,
    hasGlow: false,
    hasParticles: false,
    isRainbow: false,
  });

  useEffect(() => {
    const loadLevelData = async () => {
      const data = await window.electronAPI.getLevelData();
      const info = calculateLevel(data.totalTokens);
      setLevelInfo(info);
    };

    loadLevelData();
    const interval = setInterval(loadLevelData, 5000);

    return () => clearInterval(interval);
  }, []);

  return levelInfo;
}
