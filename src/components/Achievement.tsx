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
    const t2 = setTimeout(() => setPhase('exit'), 2000);
    const t3 = setTimeout(onComplete, 2500);
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

// Milestone definitions — use i18n keys
export interface Milestone {
  id: string;
  tokens: number;
  titleKey: string;
  descKey: string;
  icon: string;
}

export const MILESTONES: Milestone[] = [
  { id: 'first-million', tokens: 1_000_000, titleKey: 'milestone.firstMillion', descKey: 'milestone.firstMillionDesc', icon: '🎯' },
  { id: 'ten-million', tokens: 10_000_000, titleKey: 'milestone.tenMillion', descKey: 'milestone.tenMillionDesc', icon: '🔥' },
  { id: 'hundred-million', tokens: 100_000_000, titleKey: 'milestone.hundredMillion', descKey: 'milestone.hundredMillionDesc', icon: '💎' },
  { id: 'one-billion', tokens: 1_000_000_000, titleKey: 'milestone.oneBillion', descKey: 'milestone.oneBillionDesc', icon: '🏆' },
  { id: 'five-billion', tokens: 5_000_000_000, titleKey: 'milestone.fiveBillion', descKey: 'milestone.fiveBillionDesc', icon: '👑' },
  { id: 'ten-billion', tokens: 10_000_000_000, titleKey: 'milestone.tenBillion', descKey: 'milestone.tenBillionDesc', icon: '🌟' },
  { id: 'fifty-billion', tokens: 50_000_000_000, titleKey: 'milestone.fiftyBillion', descKey: 'milestone.fiftyBillionDesc', icon: '🦞' },
];
