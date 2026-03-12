import React from 'react';
import { OpenClawStatus, LevelInfo } from '../types';
import { formatTokens } from '../utils/levels';
import './StatusPanel.css';

const APP_VERSION = '1.2.0';

interface StatusPanelProps {
  status: OpenClawStatus;
  levelInfo: LevelInfo;
  tokenInfo: { daily: number; total: number };
  onClose: () => void;
}

export const StatusPanel: React.FC<StatusPanelProps> = ({ status, levelInfo, tokenInfo, onClose }) => {
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

  return (
    <div className="status-panel" onClick={(e) => e.stopPropagation()}>
      <div className="status-panel-header">
        <h3>🦞 龙虾宝宝 Lv.{levelInfo.level}</h3>
        <button className="close-btn" onClick={onClose}>×</button>
      </div>

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

        {/* Action buttons */}
        <div className="button-group">
          <button className="panel-btn" onClick={() => {
            window.electronAPI.toggleAlwaysOnTop();
          }}>
            📌 切换置顶
          </button>
          <button className="panel-btn danger" onClick={() => window.electronAPI.quitApp()}>
            ❌ 退出
          </button>
        </div>

        <div className="version-info">v{APP_VERSION}</div>
      </div>
    </div>
  );
};
