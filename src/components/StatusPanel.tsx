import React, { useState, useEffect, useRef, lazy, Suspense } from 'react';
import { useTranslation } from 'react-i18next';
import { OpenClawStatus, LevelInfo } from '../types';
import { formatTokens } from '../utils/levels';
import { TokenChart } from './TokenChart';
import { AchievementList } from './AchievementList';
const SocialPanel = lazy(() => import('./SocialPanel').then(m => ({ default: m.SocialPanel })));
const PluginPanel = lazy(() => import('./PluginPanel').then(m => ({ default: m.PluginPanel })));
const SSHPanel = lazy(() => import('./SSHPanel').then(m => ({ default: m.SSHPanel })));
import './StatusPanel.css';

const APP_VERSION = __APP_VERSION__;

function formatETA(minutes: number): string {
  if (minutes < 60) return `${Math.round(minutes)}m`;
  if (minutes < 1440) return `${Math.round(minutes / 60)}h`;
  return `${Math.round(minutes / 1440)}d`;
}

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
  const [autoStartEnabled, setAutoStartEnabled] = useState(true);
  const [idleOpacity, setIdleOpacity] = useState(30);
  const { t, i18n } = useTranslation();

  // Token rate calculation (tokens/min over last 60s)
  const tokenHistoryRef = useRef<Array<{ time: number; tokens: number }>>([]);
  const [tokenRate, setTokenRate] = useState(0);

  useEffect(() => {
    const now = Date.now();
    tokenHistoryRef.current.push({ time: now, tokens: tokenInfo.total });
    // Keep only last 5 minutes
    tokenHistoryRef.current = tokenHistoryRef.current.filter(e => now - e.time < 300_000);
    if (tokenHistoryRef.current.length >= 2) {
      const oldest = tokenHistoryRef.current[0];
      const elapsed = (now - oldest.time) / 60_000; // minutes
      if (elapsed > 0.1) {
        setTokenRate(Math.round((tokenInfo.total - oldest.tokens) / elapsed));
      }
    }
  }, [tokenInfo.total]);

  React.useEffect(() => {
    window.electronAPI.getAutoStart?.().then((v: boolean) => setAutoStartEnabled(v)).catch(() => {});
    window.electronAPI.getSettings?.().then((s: any) => {
      if (s?.idleOpacity) {
        setIdleOpacity(s.idleOpacity);
        document.documentElement.style.setProperty('--idle-opacity', String(s.idleOpacity / 100));
      }
    }).catch(() => {});
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
        <Suspense fallback={<div className="panel-loading">⏳</div>}><PluginPanel visible={true} onClose={closePlugins} /></Suspense>
      </div>
    );
  }

  if (showSocial) {
    return <Suspense fallback={<div className="panel-loading">⏳</div>}><SocialPanel visible={true} onClose={closeSocial} /></Suspense>;
  }

  if (showSSH) {
    return (
      <div className="status-panel" onClick={(e) => e.stopPropagation()}>
        <Suspense fallback={<div className="panel-loading">⏳</div>}><SSHPanel visible={true} onClose={() => setShowSSH(false)} /></Suspense>
      </div>
    );
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
              <div className="level-remaining">
                {t('status.needTokens', { tokens: formatTokens(tokensToNextLevel) })}
                {tokenRate > 0 && (
                  <span className="level-eta"> · ~{formatETA(tokensToNextLevel / tokenRate)}</span>
                )}
              </div>
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
              <span className="stat-chip-label">{t('status.rate')}</span>
              <span className="stat-chip-value">{tokenRate > 0 ? `${formatTokens(tokenRate)}/m` : '—'}</span>
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
            {autoFadeEnabled && (
              <div className="setting-row">
                <span className="setting-label">{t('settings.idleOpacity')}</span>
                <div className="opacity-slider">
                  <input
                    type="range"
                    min="10"
                    max="80"
                    value={idleOpacity}
                    onChange={(e) => {
                      const val = Number(e.target.value);
                      setIdleOpacity(val);
                      document.documentElement.style.setProperty('--idle-opacity', String(val / 100));
                      window.electronAPI.updateSettings({ idleOpacity: val });
                    }}
                  />
                  <span className="opacity-value">{idleOpacity}%</span>
                </div>
              </div>
            )}
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
            <div className="setting-row">
              <span className="setting-label">{t('settings.theme')}</span>
              <select
                className="lang-select"
                value={localStorage.getItem('lobster-theme') || 'lobster-red'}
                onChange={(e) => {
                  const theme = e.target.value;
                  localStorage.setItem('lobster-theme', theme);
                  document.documentElement.setAttribute('data-theme', theme);
                }}
              >
                <option value="lobster-red">🦞 {t('theme.lobsterRed')}</option>
                <option value="ocean-blue">🌊 {t('theme.oceanBlue')}</option>
                <option value="forest-green">🌲 {t('theme.forestGreen')}</option>
                <option value="sunset-purple">🌅 {t('theme.sunsetPurple')}</option>
                <option value="golden-luxe">✨ {t('theme.goldenLuxe')}</option>
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
            <span className="shortcut-hint">⌘⇧L</span>
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
