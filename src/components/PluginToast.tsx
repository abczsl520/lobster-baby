import React, { useState, useEffect } from 'react';
import './PluginToast.css';

export const PluginToast: React.FC = () => {
  const [toast, setToast] = useState<{ message: string; id: number } | null>(null);
  const [leaving, setLeaving] = useState(false);

  useEffect(() => {
    const cleanup = window.electronAPI.onPluginToast((data) => {
      setLeaving(false);
      setToast({ message: data.message, id: Date.now() });

      setTimeout(() => setLeaving(true), Math.max(1000, data.duration - 400));
      setTimeout(() => setToast(null), data.duration);
    });
    return cleanup;
  }, []);

  if (!toast) return null;

  return (
    <div key={toast.id} className={`plugin-toast ${leaving ? 'leaving' : ''}`}>
      {toast.message}
    </div>
  );
};
