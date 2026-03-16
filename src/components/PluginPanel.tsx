import React, { useState, useEffect, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import './PluginPanel.css';

type PluginView = 'installed' | 'store' | 'import';

interface PluginPanelProps {
  visible: boolean;
  onClose: () => void;
}

interface InstalledPlugin {
  id: string;
  manifest: { id: string; name: string; version: string; description: string; author: string; permissions: string[] };
  record: { enabled: boolean; installedAt: string; source: string; sourceUrl?: string };
  active: boolean;
}

interface FeaturedPlugin {
  id: string;
  name: string;
  version: string;
  description: string;
  author: string;
  downloads: number;
  downloadUrl: string;
  permissions: string[];
}

export const PluginPanel: React.FC<PluginPanelProps> = ({ visible, onClose }) => {
  const [view, setView] = useState<PluginView>('installed');
  const [installedPlugins, setInstalledPlugins] = useState<InstalledPlugin[]>([]);
  const [featuredPlugins, setFeaturedPlugins] = useState<FeaturedPlugin[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [importUrl, setImportUrl] = useState('');
  const [confirmInstall, setConfirmInstall] = useState<{ url: string; permissions?: string[] } | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const { t } = useTranslation();

  const PERM_LABELS: Record<string, { icon: string; label: string; level: string }> = {
    shell: { icon: '⚠️', label: t('perm.shell'), level: 'high' },
    notification: { icon: '🔔', label: t('perm.notification'), level: 'low' },
    network: { icon: '🌐', label: t('perm.network'), level: 'medium' },
    clipboard: { icon: '📋', label: t('perm.clipboard'), level: 'medium' },
  };

  const loadInstalled = useCallback(async () => {
    const list = await window.electronAPI.pluginList();
    setInstalledPlugins(list);
  }, []);

  const loadFeatured = useCallback(async () => {
    setLoading(true);
    const list = await window.electronAPI.pluginFeatured();
    setFeaturedPlugins(list);
    setLoading(false);
  }, []);

  useEffect(() => {
    if (visible) {
      loadInstalled();
      if (view === 'store') loadFeatured();
    }
  }, [visible, view, loadInstalled, loadFeatured]);

  const handleToggle = async (id: string, enabled: boolean) => {
    setLoading(true);
    if (enabled) await window.electronAPI.pluginDisable(id);
    else await window.electronAPI.pluginEnable(id);
    await loadInstalled();
    setLoading(false);
  };

  const handleUninstall = async (id: string) => {
    setLoading(true); setError('');
    await window.electronAPI.pluginUninstall(id);
    await loadInstalled();
    setLoading(false);
  };

  const handleInstall = async (url: string) => {
    setLoading(true); setError(''); setConfirmInstall(null);
    const result = await window.electronAPI.pluginInstallUrl(url);
    setLoading(false);
    if (result.success) {
      setImportUrl(''); setView('installed'); await loadInstalled();
    } else {
      setError(t('plugin.installFailed', { error: result.error || 'unknown' }));
    }
  };

  const handleSearch = async () => {
    if (!searchQuery.trim()) { loadFeatured(); return; }
    setLoading(true);
    const results = await window.electronAPI.pluginSearch(searchQuery.trim());
    setFeaturedPlugins(results);
    setLoading(false);
  };

  if (!visible) return null;

  // ─── Permission Confirm Dialog ───
  if (confirmInstall) {
    const perms = confirmInstall.permissions || [];
    const hasHighRisk = perms.includes('shell');
    return (
      <div className="plugin-panel" role="dialog" aria-label="Plugin Panel">
        <div className="plugin-header">
          <button className="plugin-back" onClick={() => setConfirmInstall(null)}>←</button>
          <h3>🔒 {t('plugin.confirmInstall')}</h3>
        </div>
        <div className="plugin-body">
          <div className="perm-confirm">
            {hasHighRisk && <div className="perm-warning">{t('plugin.highRiskWarning')}</div>}
            <div className="perm-list">
              {perms.length === 0 && <div className="perm-item safe">✅ {t('plugin.noPermsNeeded', 'No special permissions needed')}</div>}
              {perms.map(p => {
                const info = PERM_LABELS[p] || { icon: '❓', label: p, level: 'unknown' };
                return (
                  <div key={p} className={`perm-item ${info.level}`}>
                    <span className="perm-icon">{info.icon}</span>
                    <span className="perm-label">{info.label}</span>
                  </div>
                );
              })}
            </div>
            <div className="perm-actions">
              <button className="plugin-btn" onClick={() => setConfirmInstall(null)}>←</button>
              <button className="plugin-btn primary" onClick={() => handleInstall(confirmInstall.url)} disabled={loading}>
                {loading ? t('plugin.installing') : t('plugin.confirmInstall')}
              </button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="plugin-panel" role="dialog" aria-label="Plugin Panel">
      <div className="plugin-header">
        <button className="plugin-back" onClick={onClose} aria-label="Back">←</button>
        <h3>🧩 {t('status.plugins')}</h3>
      </div>

      <div className="plugin-tabs">
        {(['installed', 'store', 'import'] as PluginView[]).map(tab => (
          <button key={tab} className={`plugin-tab ${view === tab ? 'active' : ''}`} onClick={() => { setView(tab); setError(''); }}>
            {tab === 'installed' ? t('plugin.installed') : tab === 'store' ? t('plugin.store') : t('plugin.import')}
          </button>
        ))}
      </div>

      <div className="plugin-body">
        {error && <div className="plugin-error">{error}</div>}

        {view === 'installed' && (
          <div className="plugin-list">
            {installedPlugins.length === 0 && (
              <div className="plugin-empty">
                <div className="empty-icon">🧩</div>
                <p>{t('plugin.noPlugins')}</p>
                <button className="plugin-btn primary" onClick={() => setView('store')}>{t('plugin.goStore')}</button>
              </div>
            )}
            {installedPlugins.map(p => (
              <div key={p.id} className={`plugin-card ${p.active ? 'active' : 'inactive'}`}>
                <div className="plugin-card-header">
                  <div className="plugin-card-info">
                    <span className="plugin-name">{p.manifest.name}</span>
                    <span className="plugin-version">v{p.manifest.version}</span>
                    {p.active && <span className="plugin-active-dot">●</span>}
                  </div>
                  <label className="toggle-switch small">
                    <input type="checkbox" checked={p.record.enabled} onChange={() => handleToggle(p.id, p.record.enabled)} disabled={loading} />
                    <span className="toggle-slider" />
                  </label>
                </div>
                <div className="plugin-card-desc">{p.manifest.description}</div>
                <div className="plugin-card-footer">
                  <span className="plugin-author">{t('plugin.by', { author: p.manifest.author })}</span>
                  <div className="plugin-card-perms">
                    {p.manifest.permissions.map(perm => (
                      <span key={perm} className={`perm-badge ${perm}`} title={PERM_LABELS[perm]?.label || perm}>{PERM_LABELS[perm]?.icon || '❓'}</span>
                    ))}
                  </div>
                  <button className="plugin-btn danger small" onClick={() => handleUninstall(p.id)} disabled={loading}>{t('plugin.uninstall')}</button>
                </div>
              </div>
            ))}
          </div>
        )}

        {view === 'store' && (
          <div className="plugin-store">
            <div className="store-search">
              <input type="text" value={searchQuery} onChange={e => setSearchQuery(e.target.value)} onKeyDown={e => e.key === 'Enter' && handleSearch()} placeholder={t('plugin.searchPlaceholder')} className="plugin-input" />
              <button className="plugin-btn small" onClick={handleSearch}>{t('plugin.search')}</button>
            </div>
            {loading && <div className="plugin-loading">{t('social.loading')}</div>}
            {!loading && featuredPlugins.length === 0 && (
              <div className="plugin-empty">
                <p>{t('plugin.featured')}</p>
                <p className="empty-hint">{t('plugin.importHint')}</p>
              </div>
            )}
            {featuredPlugins.map(p => {
              const isInstalled = installedPlugins.some(ip => ip.id === p.id);
              return (
                <div key={p.id} className="plugin-card store-card">
                  <div className="plugin-card-header">
                    <div className="plugin-card-info">
                      <span className="plugin-name">{p.name}</span>
                      <span className="plugin-version">v{p.version}</span>
                    </div>
                    {isInstalled ? (
                      <span className="installed-badge">{t('plugin.installed')}</span>
                    ) : (
                      <button className="plugin-btn primary small" onClick={() => setConfirmInstall({ url: p.downloadUrl, permissions: p.permissions })} disabled={loading}>{t('plugin.installBtn')}</button>
                    )}
                  </div>
                  <div className="plugin-card-desc">{p.description}</div>
                  <div className="plugin-card-footer">
                    <span className="plugin-author">{t('plugin.by', { author: p.author })}</span>
                    <span className="plugin-downloads">{t('plugin.downloads', { count: p.downloads })}</span>
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {view === 'import' && (
          <div className="plugin-import">
            <div className="import-section">
              <h4>{t('plugin.import')}</h4>
              <p className="import-hint">{t('plugin.importUrl')}</p>
              <div className="import-form">
                <input type="text" value={importUrl} onChange={e => setImportUrl(e.target.value)} placeholder="https://github.com/user/plugin" className="plugin-input" />
                <button className="plugin-btn primary" onClick={() => {
                  if (!importUrl.trim()) return;
                  setConfirmInstall({ url: importUrl.trim() });
                }} disabled={loading || !importUrl.trim()}>
                  {loading ? t('plugin.installing') : t('plugin.import')}
                </button>
              </div>
            </div>
            <div className="import-section">
              <p className="import-hint">{t('plugin.importHint')}</p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
