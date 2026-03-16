import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { OpenClawStatus, LevelInfo } from '../types';
import { formatTokens } from '../utils/levels';
import { TokenChart } from './TokenChart';
import { AchievementList } from './AchievementList';
import { SocialPanel } from './SocialPanel';
import { PluginPanel } from './PluginPanel';
import { SSHPanel } from './SSHPanel';
import './StatusPanel.css';

const APP_VERSION = __APP_VERSION__;

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
  onOpenSocial?: () => void;
  showPlugins?: boolean;
  onOpenPlugins?: () => void;
  onClosePlugins?: () => void;
  showRemote?: boolean;
  onOpenRemote?: () => void;
  onCloseRemote?: () => void;
  isPanelWindow?: boolean;
}

export const StatusPanel: React.FC<StatusPanelProps> = ({
  status, levelInfo, tokenInfo, onClose,
  showChart: externalShowChart, onToggleChart,
  autoFadeEnabled = false, onToggleAutoFade,
  updateInfo,
  showAchievements: externalShowAchievements, onToggleAchievements,
  showSocial: externalShowSocial, onCloseSocial, onOpenSocial,
  showPlugins: externalShowPlugins, onOpenPlugins, onClosePlugins,
  showRemote, onOpenRemote: _onOpenRemote, onCloseRemote: _onCloseRemote,
  isPanelWindow: _isPanelWindow = false,
}) => {
  const [internalShowChart, setInternalShowChart] = useState(false);
  const [internalShowAchievements, setInternalShowAchievements] = useState(false);
  const [internalShowSocial, setInternalShowSocial] = useState(false);
  const [internalShowPlugins, setInternalShowPlugins] = useState(false);
  const [showSSH, setShowSSH] = useState(showRemote ?? false);
  const [statusMode, setStatusMode] = useState<string>('local');
  const [autoStartEnabled, setAutoStartEnabled] = useState(true);
  const { t, i18n } = useTranslation();

  // Check remote mode on mount
  React.useEffect(() => {
    window.electronAPI.remoteGetMode?.().then((r: any) => setStatusMode(r?.mode || 'local')).catch(() => {});
    window.electronAPI.getAutoStart?.().then((v: boolean) => setAutoStartEnabled(v)).catch(() => {});
  }, []);
  const showChart = externalShowChart !== undefined ? externalShowChart : internalShowChart;
  const toggleChart = onToggleChart ?? (() => setInternalShowChart(!internalShowChart));
  const showAchievements = externalShowAchievements !== undefined ? externalShowAchievements : internalShowAchievements;
  const toggleAchievements = onToggleAchievements ?? (() => setInternalShowAchievements(!internalShowAchievements));
  const showSocial = externalShowSocial !== undefined ? externalShowSocial : internalShowSocial;
  const closeSocial = onCloseSocial ?? (() => setInternalShowSocial(false));
  const openSocial = onOpenSocial ?? (() => setInternalShowSocial(true));
  const showPlugins = externalShowPlugins !== undefined ? externalShowPlugins : internalShowPlugins;
  const closePlugins = onClosePlugins ?? (() => setInternalShowPlugins(false));
  const openPlugins = onOpenPlugins ?? (() => setInternalShowPlugins(true));

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

  // Full-screen sub-panels
  if (showPlugins) {
    return (
      <div className="status-panel">
        <PluginPanel visible={true} onClose={closePlugins} />
      </div>
    );
  }

  if (showSocial) {
    return <SocialPanel visible={true} onClose={closeSocial} />;
  }

  if (showSSH) {
    return (
      <div className="status-panel" onClick={(e) => e.stopPropagation()}>
        <SSHPanel visible={true} onClose={() => setShowSSH(false)} />
      </div>
    );
  }

  return (
    <div className="status-panel" onClick={(e) => e.stopPropagation()}>
      {/* Header */}
      <div className="status-panel-header">
        <div className="header-left">
          <h3>{statusMode === 'remote' ? '☁️' : '🦞'} Lv.{levelInfo.level}</h3>
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
              <div className="level-remaining">{t('status.needTokens', { tokens: formatTokens(tokensToNextLevel) })}</div>
            )}
            {levelInfo.level === 10 && (
              <div className="level-remaining" style={{ color: '#ffd700' }}>{t('status.maxLevel')}</div>
            )}
          </div>

          {/* ── Token Stats ── */}
          <div className="stats-row">
            <div className="stat-chip">
              <span className="stat-chip-label">{t('status.today')}</span>
              <span className="stat-chip-value">{formatTokens(tokenInfo.daily)}</span>
            </div>
            <div className="stat-chip">
              <span className="stat-chip-label">{t('status.total')}</span>
              <span className="stat-chip-value">{formatTokens(tokenInfo.total)}</span>
            </div>
            <div className="stat-chip">
              <span className="stat-chip-label">{t('status.progress')}</span>
              <span className="stat-chip-value">{progressPercent.toFixed(1)}%</span>
            </div>
          </div>

          {/* ── Feature Entries (2×3 grid) ── */}
          <div className="feature-grid">
            <button className="feature-card" onClick={toggleChart}>
              <span className="feature-icon">{showChart ? '📊' : '📈'}</span>
              <span className="feature-label">{t('status.trends')}</span>
            </button>
            <button className="feature-card" onClick={toggleAchievements}>
              <span className="feature-icon">🏆</span>
              <span className="feature-label">{t('status.achievements')}</span>
            </button>
            <button className="feature-card" onClick={openSocial}>
              <span className="feature-icon">🌐</span>
              <span className="feature-label">{t('status.social')}</span>
            </button>
            <button className="feature-card" onClick={openPlugins}>
              <span className="feature-icon">🧩</span>
              <span className="feature-label">{t('status.plugins')}</span>
            </button>
            <button className="feature-card" onClick={() => setShowSSH(true)}>
              <span className="feature-icon">🖥️</span>
              <span className="feature-label">{t('status.remote')}</span>
            </button>
          </div>

          {/* ── Expandable Content ── */}
          <TokenChart visible={showChart} />
          <AchievementList currentTokens={tokenInfo.total} visible={showAchievements} />

          {/* ── Settings ── */}
          <div className="settings-section">
            <div className="setting-row">
              <span className="setting-label">{t('status.autoHide')}</span>
              <label className="toggle-switch">
                <input
                  type="checkbox"
                  checked={autoFadeEnabled}
                  onChange={onToggleAutoFade}
                />
                <span className="toggle-slider" />
              </label>
            </div>
            <div className="setting-row">
              <span className="setting-label">{t('settings.autoStart')}</span>
              <label className="toggle-switch">
                <input
                  type="checkbox"
                  checked={autoStartEnabled}
                  onChange={async () => {
                    const newVal = !autoStartEnabled;
                    setAutoStartEnabled(newVal);
                    await window.electronAPI.setAutoStart?.(newVal);
                  }}
                />
                <span className="toggle-slider" />
              </label>
            </div>
            <div className="setting-row">
              <span className="setting-label">{t('settings.language')}</span>
              <select
                className="lang-select"
                value={i18n.language?.startsWith('zh') ? 'zh-CN' : 'en'}
                onChange={(e) => {
                  i18n.changeLanguage(e.target.value);
                  localStorage.setItem('lobster-lang', e.target.value);
                }}
              >
                <option value="zh-CN">{t('settings.chinese')}</option>
                <option value="en">{t('settings.english')}</option>
              </select>
            </div>
            <div className="action-row">
              <button className="action-btn" onClick={() => window.electronAPI.toggleAlwaysOnTop()}>
                {t('status.pinToTop')}
              </button>
              <button className="action-btn danger" onClick={() => window.electronAPI.quitApp()}>
                {t('status.quit')}
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
              <span className="version-text">{t('status.upToDate')}</span>
            )}
          </div>

        </div>
      </div>
    </div>
  );
};
