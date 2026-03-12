import { useState, useEffect } from 'react';
import { checkForUpdates, UpdateInfo } from '../utils/updater';

const APP_VERSION = '1.5.0';

export function useUpdateChecker() {
  const [updateInfo, setUpdateInfo] = useState<UpdateInfo | null>(null);
  const [isChecking, setIsChecking] = useState(false);

  useEffect(() => {
    const checkUpdates = async () => {
      setIsChecking(true);
      const info = await checkForUpdates(APP_VERSION);
      if (info.hasUpdate) {
        setUpdateInfo(info);
      }
      setIsChecking(false);
    };

    // Check on mount
    checkUpdates();

    // Check every 6 hours
    const interval = setInterval(checkUpdates, 6 * 60 * 60 * 1000);

    return () => clearInterval(interval);
  }, []);

  return { updateInfo, isChecking };
}
