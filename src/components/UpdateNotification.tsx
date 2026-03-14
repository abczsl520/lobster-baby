import React from 'react';
import { useTranslation } from 'react-i18next';
import { UpdateInfo } from '../utils/updater';
import './UpdateNotification.css';

interface UpdateNotificationProps {
  updateInfo: UpdateInfo;
  onDismiss: () => void;
}

export const UpdateNotification: React.FC<UpdateNotificationProps> = ({ updateInfo, onDismiss }) => {
  const { t } = useTranslation();

  const handleUpdate = () => {
    window.electronAPI.openExternal(updateInfo.downloadUrl);
    onDismiss();
  };

  return (
    <div className="update-notification">
      <div className="update-content">
        <div className="update-icon">🎉</div>
        <div className="update-text">
          <div className="update-title">{t('update.newVersion')}</div>
          <div className="update-version">v{updateInfo.latestVersion}</div>
        </div>
      </div>
      <div className="update-actions">
        <button className="update-btn primary" onClick={handleUpdate}>
          {t('update.updateNow')}
        </button>
        <button className="update-btn secondary" onClick={onDismiss}>
          {t('update.remindLater')}
        </button>
      </div>
    </div>
  );
};
