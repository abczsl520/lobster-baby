import React from 'react';
import { OpenClawStatus, LevelInfo } from '../types';
import { formatTokens } from '../utils/levels';
import './StatusPanel.css';

const APP_VERSION = '1.0.0';

interface StatusPanelProps {
  status: OpenClawStatus;
  levelInfo: LevelInfo;
  tokenInfo: { daily: number; total: number };
  onClose: () => void;
}

export const StatusPanel: React.FC<StatusPanelProps> = ({ status, levelInfo, tokenInfo, onClose }) => {
  const statusText: Record<OpenClawStatus, string> = {
    active: '🟢 运行中',
    idle: '🟡 空闲',
    error: '🔴 离线',
  };

  return (
    <div className="status-panel" onClick={(e) => e.stopPropagation()}>
      <div className="status-panel-header">
        <h3>🦞 龙虾宝宝 Lv.{levelInfo.level}</h3>
        <button className="close-btn" onClick={onClose}>×</button>
      </div>

      <div className="status-panel-content">
        <div className="status-item">
          <span className="label">OpenClaw</span>
          <span className="value">{statusText[status]}</span>
        </div>

        <div className="status-item">
          <span className="label">等级</span>
          <span className="value">Level {levelInfo.level} / 10</span>
        </div>

        <div className="progress-bar">
          <div
            className="progress-fill"
            style={{
              width: `${Math.min(100, levelInfo.progress)}%`,
              backgroundColor: levelInfo.isRainbow ? '#ff4444' : levelInfo.color,
            }}
          />
        </div>
        <div className="progress-text">
          {formatTokens(levelInfo.currentTokens)} / {formatTokens(levelInfo.nextLevelTokens)}
        </div>

        <div className="status-item">
          <span className="label">今日 Token</span>
          <span className="value">{formatTokens(tokenInfo.daily)}</span>
        </div>

        <div className="status-item">
          <span className="label">累计 Token</span>
          <span className="value">{formatTokens(tokenInfo.total)}</span>
        </div>

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
