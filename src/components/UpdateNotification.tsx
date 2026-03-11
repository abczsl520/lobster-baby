import React from 'react';
import { UpdateInfo } from '../utils/updater';
import './UpdateNotification.css';

interface UpdateNotificationProps {
  updateInfo: UpdateInfo;
  onDismiss: () => void;
}

export const UpdateNotification: React.FC<UpdateNotificationProps> = ({ updateInfo, onDismiss }) => {
  const handleUpdate = () => {
    window.electronAPI.openExternal(updateInfo.downloadUrl);
    onDismiss();
  };

  return (
    <div className="update-notification">
      <div className="update-content">
        <div className="update-icon">🎉</div>
        <div className="update-text">
          <div className="update-title">新版本可用！</div>
          <div className="update-version">v{updateInfo.latestVersion}</div>
        </div>
      </div>
      <div className="update-actions">
        <button className="update-btn primary" onClick={handleUpdate}>
          立即更新
        </button>
        <button className="update-btn secondary" onClick={onDismiss}>
          稍后提醒
        </button>
      </div>
    </div>
  );
};
