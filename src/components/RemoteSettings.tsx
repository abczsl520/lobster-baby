import React, { useState, useEffect, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import './RemoteSettings.css';

interface RemoteInfo {
  hasReporterToken: boolean;
  tokenIssuedAt: string | null;
  lastHeartbeat: string | null;
  reporterVersion: string | null;
}

export const RemoteSettings: React.FC = () => {
  const { t } = useTranslation();
  const [mode, setMode] = useState<'local' | 'remote'>('local');
  const [info, setInfo] = useState<RemoteInfo | null>(null);
  const [generatedToken, setGeneratedToken] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadMode = useCallback(async () => {
    try {
      const result = await window.electronAPI.remoteGetMode();
      const m = result.mode;
      if (m === 'local' || m === 'remote') setMode(m);
    } catch {}
  }, []);

  const loadInfo = useCallback(async () => {
    try {
      const result = await window.electronAPI.remoteGetInfo();
      if (!result.error) setInfo(result);
    } catch {}
  }, []);

  useEffect(() => {
    loadMode();
    loadInfo();
  }, [loadMode, loadInfo]);

  const handleModeSwitch = async (newMode: 'local' | 'remote') => {
    setError(null);
    if (newMode === 'remote') {
      // Check if user has social token
      const local = await window.electronAPI.socialGetLocal();
      if (!local.hasToken) {
        setError(t('remote.needRegister'));
        return;
      }
    }
    const result = await window.electronAPI.remoteSwitchMode(newMode);
    if (result.error) { setError(result.error); return; }
    setMode(newMode);
  };

  const handleGenerateToken = async () => {
    setLoading(true);
    setError(null);
    try {
      const result = await window.electronAPI.remoteGenerateToken();
      if (result.error) { setError(result.error); return; }
      setGeneratedToken(result.token || null);
      await loadInfo();
    } catch (e: any) { setError(e.message); }
    finally { setLoading(false); }
  };

  const handleRevokeToken = async () => {
    setLoading(true);
    setError(null);
    try {
      const result = await window.electronAPI.remoteRevokeToken();
      if (result.error) { setError(result.error); return; }
      setGeneratedToken(null);
      setInfo(null);
      setMode('local');
      await loadInfo();
    } catch (e: any) { setError(e.message); }
    finally { setLoading(false); }
  };

  const handleCopy = async (text: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {}
  };

  const installCmd = generatedToken
    ? `curl -sSL https://lbhub.ai/reporter/install.sh | bash -s -- --token ${generatedToken}`
    : '';

  const formatTimeAgo = (isoStr: string | null) => {
    if (!isoStr) return '-';
    const diff = Date.now() - new Date(isoStr).getTime();
    if (diff < 60_000) return t('remote.secondsAgo', { seconds: Math.floor(diff / 1000) });
    if (diff < 3_600_000) return t('remote.minutesAgo', { minutes: Math.floor(diff / 60_000) });
    return t('remote.hoursAgo', { hours: Math.floor(diff / 3_600_000) });
  };

  return (
    <div className="remote-settings">
      <div className="remote-title">{t('remote.title')}</div>

      {/* Mode selector */}
      <div className="remote-mode-selector">
        <label className="remote-mode-option">
          <input
            type="radio"
            name="statusMode"
            value="local"
            checked={mode === 'local'}
            onChange={() => handleModeSwitch('local')}
          />
          <span>{t('remote.local')}</span>
        </label>
        <label className="remote-mode-option">
          <input
            type="radio"
            name="statusMode"
            value="remote"
            checked={mode === 'remote'}
            onChange={() => handleModeSwitch('remote')}
          />
          <span>{t('remote.remoteServer')} ☁️</span>
        </label>
      </div>

      {error && <div className="remote-error">{error}</div>}

      {/* Reporter info */}
      {info?.hasReporterToken && (
        <div className="remote-info-card">
          <div className="remote-info-row">
            <span className="remote-info-label">{t('remote.status')}</span>
            <span className={`remote-info-value ${info.lastHeartbeat ? 'connected' : 'disconnected'}`}>
              {info.lastHeartbeat ? t('remote.connected') + ' ✅' : t('remote.disconnected')}
            </span>
          </div>
          {info.lastHeartbeat && (
            <div className="remote-info-row">
              <span className="remote-info-label">{t('remote.lastHeartbeat')}</span>
              <span className="remote-info-value">{formatTimeAgo(info.lastHeartbeat)}</span>
            </div>
          )}
          {info.reporterVersion && (
            <div className="remote-info-row">
              <span className="remote-info-label">{t('remote.reporterVersion')}</span>
              <span className="remote-info-value">v{info.reporterVersion}</span>
            </div>
          )}
        </div>
      )}

      {/* Actions */}
      <div className="remote-actions">
        {!info?.hasReporterToken ? (
          <button
            className="remote-btn primary"
            onClick={handleGenerateToken}
            disabled={loading}
          >
            {loading ? '...' : t('remote.generateToken')}
          </button>
        ) : (
          <button
            className="remote-btn danger"
            onClick={handleRevokeToken}
            disabled={loading}
          >
            {loading ? '...' : t('remote.revokeToken')}
          </button>
        )}
      </div>

      {/* Generated token + install command */}
      {generatedToken && (
        <div className="remote-token-section">
          <div className="remote-token-label">{t('remote.installHint')}</div>
          <div className="remote-install-cmd">
            <code>{installCmd}</code>
            <button
              className="remote-copy-btn"
              onClick={() => handleCopy(installCmd)}
            >
              {copied ? t('remote.copied') : t('remote.copyToken')}
            </button>
          </div>
        </div>
      )}
    </div>
  );
};
