import React, { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import './UpdateNotification.css';

interface UpdaterStatus {
  status: 'checking' | 'available' | 'up-to-date' | 'downloading' | 'downloaded' | 'error';
  version?: string;
  percent?: number;
  transferred?: number;
  total?: number;
  bytesPerSecond?: number;
  error?: string;
  releaseNotes?: string;
}

interface Props {
  onDismiss: () => void;
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes}B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)}KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)}MB`;
}

export const UpdateNotification: React.FC<Props> = ({ onDismiss }) => {
  const { t } = useTranslation();
  const [status, setStatus] = useState<UpdaterStatus | null>(null);

  useEffect(() => {
    const cleanup = window.electronAPI.onUpdaterStatus((data: UpdaterStatus) => {
      setStatus(data);
    });
    return cleanup;
  }, []);

  if (!status || status.status === 'up-to-date' || status.status === 'checking') return null;

  if (status.status === 'error') {
    return (
      <div className="update-notification update-error">
        <div className="update-content">
          <div className="update-icon">⚠️</div>
          <div className="update-text">
            <div className="update-title">{t('update.error', 'Update failed')}</div>
            <div className="update-detail">{status.error}</div>
          </div>
        </div>
        <div className="update-actions">
          <button className="update-btn secondary" onClick={onDismiss}>OK</button>
        </div>
      </div>
    );
  }

  if (status.status === 'available') {
    return (
      <div className="update-notification">
        <div className="update-content">
          <div className="update-icon">🎉</div>
          <div className="update-text">
            <div className="update-title">{t('update.newVersion', 'New version available')}</div>
            <div className="update-version">v{status.version}</div>
          </div>
        </div>
        <div className="update-actions">
          <button className="update-btn primary" onClick={() => window.electronAPI.updaterDownload()}>
            {t('update.download', 'Download')}
          </button>
          <button className="update-btn secondary" onClick={onDismiss}>
            {t('update.remindLater', 'Later')}
          </button>
        </div>
      </div>
    );
  }

  if (status.status === 'downloading') {
    const pct = status.percent || 0;
    const speed = status.bytesPerSecond ? formatBytes(status.bytesPerSecond) + '/s' : '';
    const progress = status.transferred && status.total
      ? `${formatBytes(status.transferred)} / ${formatBytes(status.total)}`
      : '';
    return (
      <div className="update-notification">
        <div className="update-content">
          <div className="update-icon">⬇️</div>
          <div className="update-text">
            <div className="update-title">{t('update.downloading', 'Downloading...')}</div>
            <div className="update-detail">{progress} {speed}</div>
          </div>
        </div>
        <div className="update-progress">
          <div className="update-progress-bar" style={{ width: `${pct}%` }} />
        </div>
        <div className="update-percent">{pct}%</div>
      </div>
    );
  }

  if (status.status === 'downloaded') {
    return (
      <div className="update-notification update-ready">
        <div className="update-content">
          <div className="update-icon">✅</div>
          <div className="update-text">
            <div className="update-title">{t('update.ready', 'Ready to install')}</div>
            <div className="update-version">v{status.version}</div>
          </div>
        </div>
        <div className="update-actions">
          <button className="update-btn primary" onClick={() => window.electronAPI.updaterInstall()}>
            {t('update.installNow', 'Install & Restart')}
          </button>
          <button className="update-btn secondary" onClick={onDismiss}>
            {t('update.installLater', 'Install on quit')}
          </button>
        </div>
      </div>
    );
  }

  return null;
};
