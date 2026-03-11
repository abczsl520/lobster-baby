import { LevelInfo } from '../types';
import { LEVEL_THRESHOLDS } from '../constants';

export { LEVEL_THRESHOLDS };

export function calculateLevel(totalTokens: number): LevelInfo {
  // Defensive: ensure non-negative
  const tokens = Math.max(0, totalTokens || 0);
  
  let level = 1;
  for (let i = LEVEL_THRESHOLDS.length - 1; i >= 0; i--) {
    if (tokens >= LEVEL_THRESHOLDS[i]) {
      level = i + 1;
      break;
    }
  }

  const currentThreshold = LEVEL_THRESHOLDS[level - 1];
  const nextThreshold = level < 10 ? LEVEL_THRESHOLDS[level] : LEVEL_THRESHOLDS[9];
  const range = nextThreshold - currentThreshold;
  const progress = level < 10 && range > 0
    ? Math.min(100, Math.max(0, ((tokens - currentThreshold) / range) * 100))
    : 100;

  let color = '#ff4444';
  let hasCrown = false;
  let hasGlow = false;
  let hasParticles = false;
  let isRainbow = false;

  if (level >= 9) {
    isRainbow = true;
    hasCrown = true;
    hasGlow = true;
    hasParticles = true;
  } else if (level >= 7) {
    color = '#9b59b6';
    hasCrown = true;
    hasGlow = true;
    hasParticles = true;
  } else if (level >= 5) {
    color = '#f1c40f';
    hasCrown = true;
    hasGlow = true;
  } else if (level >= 3) {
    color = '#ff8c00';
    hasCrown = true;
  }

  return {
    level,
    currentTokens: tokens,
    nextLevelTokens: nextThreshold,
    progress,
    color,
    hasCrown,
    hasGlow,
    hasParticles,
    isRainbow,
  };
}

export function formatTokens(tokens: number): string {
  if (tokens >= 1_000_000_000) {
    return `${(tokens / 1_000_000_000).toFixed(2)}B`;
  } else if (tokens >= 1_000_000) {
    return `${(tokens / 1_000_000).toFixed(2)}M`;
  } else if (tokens >= 1_000) {
    return `${(tokens / 1_000).toFixed(2)}K`;
  }
  return tokens.toString();
}
