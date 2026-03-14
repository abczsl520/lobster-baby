import React from 'react';
import { useTranslation } from 'react-i18next';
import { MILESTONES } from './Achievement';
import './AchievementList.css';

interface AchievementListProps {
  currentTokens: number;
  visible: boolean;
}

export const AchievementList: React.FC<AchievementListProps> = ({ currentTokens, visible }) => {
  const { t } = useTranslation();
  if (!visible) return null;

  return (
    <div className="achievement-list">
      {MILESTONES.map((m) => {
        const unlocked = currentTokens >= m.tokens;
        const progress = Math.min(100, (currentTokens / m.tokens) * 100);
        return (
          <div key={m.id} className={`achievement-item ${unlocked ? 'unlocked' : 'locked'}`}>
            <div className="achievement-item-icon">{unlocked ? m.icon : '🔒'}</div>
            <div className="achievement-item-info">
              <div className="achievement-item-title">{t(m.titleKey)}</div>
              <div className="achievement-item-desc">{t(m.descKey)}</div>
              {!unlocked && (
                <div className="achievement-item-progress">
                  <div className="achievement-item-bar">
                    <div className="achievement-item-fill" style={{ width: `${progress}%` }} />
                  </div>
                  <span className="achievement-item-pct">{progress.toFixed(0)}%</span>
                </div>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
};
