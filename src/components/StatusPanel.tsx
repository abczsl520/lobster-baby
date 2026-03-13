import React, { useState, useEffect } from 'react';
import { OpenClawStatus, LevelInfo } from '../types';
import { formatTokens } from '../utils/levels';
import { TokenChart } from './TokenChart';
import { AchievementList } from './AchievementList';
import { SocialPanel } from './SocialPanel';
import './StatusPanel.css';

const APP_VERSION = '1.6.0';

interface StatusPanelProps {
  status: OpenClawStatus;
  levelInfo: LevelInfo;
  tokenInfo: { daily: number; total: number };
  onClose: () => void;
  showChart?: boolean;
  onToggleChart?: () => void;
  autoFadeEnabled?: boolean;
  onToggleAutoFade?: () => void;
  updateInfo?: { hasUpdate: boolean; latestVersion?: string; downloadUrl?: string } | null;
  showAchievements?: boolean;
  onToggleAchievements?: () => void;
  showSocial?: boolean;
  onCloseSocial?: () => void;
}

export const StatusPanel: React.FC<StatusPanelProps> = ({
  status, levelInfo, tokenInfo, onClose,
  showChart: externalShowChart, onToggleChart,
  autoFadeEnabled = false, onToggleAutoFade,
  updateInfo,
  showAchievements: externalShowAchievements, onToggleAchievements,
  showSocial: externalShowSocial, onCloseSocial,
}) => {
  const [internalShowChart, setInternalShowChart] = useState(false);
  const [internalShowAchievements, setInternalShowAchievements] = useState(false);
  const [internalShowSocial, setInternalShowSocial] = useState(false);
  const [socialStats, setSocialStats] = useState<{ total_users: number } | null>(null);
  const showChart = externalShowChart ?? internalShowChart;
  const toggleChart = onToggleChart ?? (() => setInternalShowChart(!internalShowChart));
  const showAchievements = externalShowAchievements ?? internalShowAchievements;
  const toggleAchievements = onToggleAchievements ?? (() => setInternalShowAchievements(!internalShowAchievements));
  const showSocial = externalShowSocial ?? internalShowSocial;
  const closeSocial = onCloseSocial ?? (() => setInternalShowSocial(false));
  const openSocial = () => { setInternalShowSocial(true); };

  useEffect(() => {
    window.electronAPI.socialStats().then(s => {
      if (!s.error) setSocialStats(s);
    }).catch(() => {});
  }, []);

  const statusColor: Record<OpenClawStatus, string> = {
    active: '#00e676',
    idle: '#ffc107',
    error: '#ff5252',
  };

  const statusDot: Record<OpenClawStatus, string> = {
    active: '🟢',
    idle: '🟡',
    error: '🔴',
  };

  const tokensToNextLevel = levelInfo.nextLevelTokens - levelInfo.currentTokens;
  const progressPercent = Math.min(100, levelInfo.progress);

  if (showSocial) {
    return <SocialPanel visible={true} onClose={closeSocial} />;
  }

  return (
    <div className="status-panel" onClick={(e) => e.stopPropagation()}>
      {/* Header */}
      <div className="status-panel-header">
        <div className="header-left">
          <h3>🦞 Lv.{levelInfo.level}</h3>
          <span className="header-status" style={{ color: statusColor[status] }}>
            {statusDot[status]}
          </span>
        </div>
        <button className="close-btn" onClick={onClose}>×</button>
      </div>

      <div className="status-panel-scroll">
        <div className="status-panel-content">

          {/* ── Level Progress Card ── */}
          <div className="card level-card">
            <div className="progress-bar">
              <div
                className="progress-fill"
                style={{
                  width: `${progressPercent}%`,
                  backgroundColor: levelInfo.isRainbow ? '#ff4444' : levelInfo.color,
                }}
              />
            </div>
            <div className="level-stats">
              <span className="level-current">{formatTokens(levelInfo.currentTokens)}</span>
              <span className="level-divider">/</span>
              <span className="level-target">{formatTokens(levelInfo.nextLevelTokens)}</span>
            </div>
            {levelInfo.level < 10 && (
              <div className="level-remaining">还需 {formatTokens(tokensToNextLevel)} 升级</div>
            )}
            {levelInfo.level === 10 && (
              <div className="level-remaining" style={{ color: '#ffd700' }}>🎉 满级 · 龙虾之王</div>
            )}
          </div>

          {/* ── Token Stats ── */}
          <div className="stats-row">
            <div className="stat-chip">
              <span className="stat-chip-label">今日</span>
              <span className="stat-chip-value">{formatTokens(tokenInfo.daily)}</span>
            </div>
            <div className="stat-chip">
              <span className="stat-chip-label">累计</span>
              <span className="stat-chip-value">{formatTokens(tokenInfo.total)}</span>
            </div>
            <div className="stat-chip">
              <span className="stat-chip-label">进度</span>
              <span className="stat-chip-value">{progressPercent.toFixed(1)}%</span>
            </div>
          </div>

          {/* ── Feature Entries ── */}
          <div className="feature-grid">
            <button className="feature-card" onClick={toggleChart}>
              <span className="feature-icon">{showChart ? '📊' : '📈'}</span>
              <span className="feature-label">趋势</span>
            </button>
            <button className="feature-card" onClick={toggleAchievements}>
              <span className="feature-icon">🏆</span>
              <span className="feature-label">成就</span>
            </button>
            <button className="feature-card social-card" onClick={openSocial}>
              <span className="feature-icon">🌐</span>
              <span className="feature-label">社交</span>
              {socialStats && socialStats.total_users > 0 && (
                <span className="feature-badge">{socialStats.total_users}</span>
              )}
            </button>
          </div>

          {/* ── Expandable Content ── */}
          <TokenChart visible={showChart} />
          <AchievementList currentTokens={tokenInfo.total} visible={showAchievements} />

          {/* ── Settings ── */}
          <div className="settings-section">
            <div className="setting-row">
              <span className="setting-label">自动隐藏</span>
              <label className="toggle-switch">
                <input
                  type="checkbox"
                  checked={autoFadeEnabled}
                  onChange={onToggleAutoFade}
                />
                <span className="toggle-slider" />
              </label>
            </div>
            <div className="action-row">
              <button className="action-btn" onClick={() => window.electronAPI.toggleAlwaysOnTop()}>
                📌 置顶
              </button>
              <button className="action-btn danger" onClick={() => window.electronAPI.quitApp()}>
                退出
              </button>
            </div>
          </div>

          {/* ── Footer ── */}
          <div className="panel-footer">
            <span className="version-text">v{APP_VERSION}</span>
            {updateInfo?.hasUpdate ? (
              <button
                className="update-pill"
                onClick={() => updateInfo.downloadUrl && window.electronAPI.openExternal(updateInfo.downloadUrl)}
              >
                🆕 v{updateInfo.latestVersion}
              </button>
            ) : (
              <span className="version-text">✓ 最新</span>
            )}
          </div>

        </div>
      </div>
    </div>
  );
};
