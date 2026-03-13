import React, { useState } from 'react';
import { OpenClawStatus, LevelInfo } from '../types';
import { formatTokens } from '../utils/levels';
import { TokenChart } from './TokenChart';
import { AchievementList } from './AchievementList';
import { SocialPanel } from './SocialPanel';
import './StatusPanel.css';

const APP_VERSION = '1.5.1';

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
}

export const StatusPanel: React.FC<StatusPanelProps> = ({
  status, levelInfo, tokenInfo, onClose,
  showChart: externalShowChart, onToggleChart,
  autoFadeEnabled = false, onToggleAutoFade,
  updateInfo,
  showAchievements: externalShowAchievements, onToggleAchievements,
}) => {
  const [internalShowChart, setInternalShowChart] = useState(false);
  const [internalShowAchievements, setInternalShowAchievements] = useState(false);
  const [showSocial, setShowSocial] = useState(false);
  const showChart = externalShowChart ?? internalShowChart;
  const toggleChart = onToggleChart ?? (() => setInternalShowChart(!internalShowChart));
  const showAchievements = externalShowAchievements ?? internalShowAchievements;
  const toggleAchievements = onToggleAchievements ?? (() => setInternalShowAchievements(!internalShowAchievements));

  const statusText: Record<OpenClawStatus, string> = {
    active: '🟢 工作中',
    idle: '🟡 空闲',
    error: '🔴 离线',
  };

  const statusColor: Record<OpenClawStatus, string> = {
    active: '#00e676',
    idle: '#ffc107',
    error: '#ff5252',
  };

  const tokensToNextLevel = levelInfo.nextLevelTokens - levelInfo.currentTokens;
  const progressPercent = Math.min(100, levelInfo.progress);

  if (showSocial) {
    return <SocialPanel visible={true} onClose={() => setShowSocial(false)} />;
  }

  return (
    <div className="status-panel" onClick={(e) => e.stopPropagation()}>
      <div className="status-panel-header">
        <h3>🦞 龙虾宝宝 Lv.{levelInfo.level}</h3>
        <button className="close-btn" onClick={onClose}>×</button>
      </div>

      <div className="status-panel-scroll">
        <div className="status-panel-content">
          {/* Status */}
          <div className="status-item">
            <span className="label">OpenClaw</span>
            <span className="value" style={{ color: statusColor[status] }}>
              {statusText[status]}
            </span>
          </div>

          {/* Level progress */}
          <div className="status-item">
            <span className="label">等级进度</span>
            <span className="value">{progressPercent.toFixed(1)}%</span>
          </div>

          <div className="progress-bar">
            <div
              className="progress-fill"
              style={{
                width: `${progressPercent}%`,
                backgroundColor: levelInfo.isRainbow ? '#ff4444' : levelInfo.color,
              }}
            />
          </div>
          <div className="progress-text">
            {formatTokens(levelInfo.currentTokens)} / {formatTokens(levelInfo.nextLevelTokens)}
            {levelInfo.level < 10 && ` (还需 ${formatTokens(tokensToNextLevel)})`}
          </div>

          {/* Daily tokens */}
          <div className="status-item">
            <span className="label">今日消耗</span>
            <span className="value">{formatTokens(tokenInfo.daily)}</span>
          </div>

          {/* Total tokens */}
          <div className="status-item">
            <span className="label">累计消耗</span>
            <span className="value">{formatTokens(tokenInfo.total)}</span>
          </div>

          {/* Token chart toggle */}
          <div className="button-group" style={{ marginTop: '4px' }}>
            <button className="panel-btn" onClick={toggleChart}>
              {showChart ? '📊 隐藏趋势' : '📈 查看趋势'}
            </button>
            <button className="panel-btn" onClick={toggleAchievements}>
              {showAchievements ? '🏆 隐藏成就' : '🏆 查看成就'}
            </button>
            <button className="panel-btn" onClick={() => setShowSocial(true)}>
              🌐 社交
            </button>
          </div>

          <TokenChart visible={showChart} />
          <AchievementList currentTokens={tokenInfo.total} visible={showAchievements} />

          {/* Level info */}
          {levelInfo.level === 10 ? (
            <div className="status-item" style={{ marginTop: '4px' }}>
              <span className="label">🎉 满级</span>
              <span className="value" style={{ color: '#ffd700' }}>龙虾之王</span>
            </div>
          ) : (
            <div className="status-item" style={{ marginTop: '4px' }}>
              <span className="label">下一级</span>
              <span className="value">Lv.{levelInfo.level + 1}</span>
            </div>
          )}

          {/* Settings section */}
          <div className="panel-section-title">⚙️ 设置</div>

          <div className="status-item">
            <span className="label">自动隐藏</span>
            <label className="toggle-switch">
              <input
                type="checkbox"
                checked={autoFadeEnabled}
                onChange={onToggleAutoFade}
              />
              <span className="toggle-slider" />
            </label>
          </div>

          {/* Action buttons */}
          <div className="button-group">
            <button className="panel-btn" onClick={() => window.electronAPI.toggleAlwaysOnTop()}>
              📌 切换置顶
            </button>
            <button className="panel-btn danger" onClick={() => window.electronAPI.quitApp()}>
              ❌ 退出
            </button>
          </div>

          {/* Version & Update */}
          <div className="version-section">
            <div className="version-info">v{APP_VERSION}</div>
            {updateInfo?.hasUpdate && (
              <div className="update-available">
                <span>🆕 新版本 v{updateInfo.latestVersion} 可用</span>
                {updateInfo.downloadUrl && (
                  <button
                    className="update-btn"
                    onClick={() => window.electronAPI.openExternal(updateInfo.downloadUrl!)}
                  >
                    下载更新
                  </button>
                )}
              </div>
            )}
            {!updateInfo?.hasUpdate && (
              <div className="version-info">已是最新版本 ✓</div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
