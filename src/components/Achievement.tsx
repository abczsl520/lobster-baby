import React, { useEffect, useState } from 'react';
import './Achievement.css';

interface AchievementProps {
  title: string;
  description: string;
  icon: string;
  onComplete: () => void;
}

export const Achievement: React.FC<AchievementProps> = ({ title, description, icon, onComplete }) => {
  const [phase, setPhase] = useState<'enter' | 'show' | 'exit'>('enter');

  useEffect(() => {
    const t1 = setTimeout(() => setPhase('show'), 100);
    const t2 = setTimeout(() => setPhase('exit'), 3500);
    const t3 = setTimeout(onComplete, 4200);
    return () => { clearTimeout(t1); clearTimeout(t2); clearTimeout(t3); };
  }, [onComplete]);

  return (
    <div className={`achievement achievement-${phase}`}>
      <div className="achievement-icon">{icon}</div>
      <div className="achievement-text">
        <div className="achievement-title">{title}</div>
        <div className="achievement-desc">{description}</div>
      </div>
    </div>
  );
};

// Milestone definitions
export interface Milestone {
  id: string;
  tokens: number;
  title: string;
  description: string;
  icon: string;
}

export const MILESTONES: Milestone[] = [
  { id: 'first-million', tokens: 1_000_000, title: '百万起步', description: '累计消耗 1M tokens', icon: '🎯' },
  { id: 'ten-million', tokens: 10_000_000, title: '千万俱乐部', description: '累计消耗 10M tokens', icon: '🔥' },
  { id: 'hundred-million', tokens: 100_000_000, title: '亿级玩家', description: '累计消耗 100M tokens', icon: '💎' },
  { id: 'one-billion', tokens: 1_000_000_000, title: '十亿大佬', description: '累计消耗 1B tokens', icon: '🏆' },
  { id: 'five-billion', tokens: 5_000_000_000, title: '五十亿传说', description: '累计消耗 5B tokens', icon: '👑' },
  { id: 'ten-billion', tokens: 10_000_000_000, title: '百亿神话', description: '累计消耗 10B tokens', icon: '🌟' },
  { id: 'fifty-billion', tokens: 50_000_000_000, title: '五百亿永恒', description: '累计消耗 50B tokens', icon: '🦞' },
];
