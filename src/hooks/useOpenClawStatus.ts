import { useState, useEffect } from 'react';
import { OpenClawStatus, StatusData } from '../types';

export function useOpenClawStatus() {
  const [status, setStatus] = useState<OpenClawStatus>('idle');
  const [tokenInfo, setTokenInfo] = useState({ daily: 0, total: 0 });
  const [activeSessions, setActiveSessions] = useState(0);

  useEffect(() => {
    const cleanup = window.electronAPI.onOpenClawStatus((data: StatusData) => {
      setStatus(data.status);
      setTokenInfo(data.tokenInfo);
      setActiveSessions(data.activeSessions || 0);
    });

    return cleanup;
  }, []);

  return { status, tokenInfo, activeSessions };
}
