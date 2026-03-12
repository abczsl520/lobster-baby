import React, { useEffect, useState } from 'react';
import './LevelUpEffect.css';

interface LevelUpEffectProps {
  level: number;
  onComplete: () => void;
}

export const LevelUpEffect: React.FC<LevelUpEffectProps> = ({ level, onComplete }) => {
  const [phase, setPhase] = useState<'flash' | 'text' | 'done'>('flash');

  useEffect(() => {
    const t1 = setTimeout(() => setPhase('text'), 400);
    const t2 = setTimeout(() => {
      setPhase('done');
      onComplete();
    }, 2500);
    return () => { clearTimeout(t1); clearTimeout(t2); };
  }, [onComplete]);

  if (phase === 'done') return null;

  return (
    <div className="levelup-overlay">
      {/* Flash ring */}
      <div className={`levelup-ring ${phase}`} />

      {/* Sparkle particles */}
      {Array.from({ length: 8 }).map((_, i) => (
        <div
          key={i}
          className="levelup-sparkle"
          style={{
            '--angle': `${i * 45}deg`,
            '--delay': `${i * 0.05}s`,
          } as React.CSSProperties}
        />
      ))}

      {/* Level text */}
      {phase === 'text' && (
        <div className="levelup-text">
          <div className="levelup-label">LEVEL UP!</div>
          <div className="levelup-number">Lv.{level}</div>
        </div>
      )}
    </div>
  );
};
