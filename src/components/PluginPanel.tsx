import React, { useState, useEffect, useCallback } from 'react';
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

const PERM_LABELS: Record<string, { icon: string; label: string; level: string }> = {
  shell: { icon: '⚠️', label: '执行命令', level: 'high' },
  notification: { icon: '🔔', label: '系统通知', level: 'low' },
  network: { icon: '🌐', label: '网络请求', level: 'medium' },
  clipboard: { icon: '📋', label: '剪贴板', level: 'medium' },
};

export const PluginPanel: React.FC<PluginPanelProps> = ({ visible, onClose }) => {
  const [view, setView] = useState<PluginView>('installed');
  const [installedPlugins, setInstalledPlugins] = useState<InstalledPlugin[]>([]);
  const [featuredPlugins, setFeaturedPlugins] = useState<FeaturedPlugin[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [importUrl, setImportUrl] = useState('');
  const [confirmInstall, setConfirmInstall] = useState<{ url: string; permissions?: string[] } | null>(null);
  const [searchQuery, setSearchQuery] = useState('');

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

  const handleUninstall = async (id: string, _name: string) => {
    setLoading(true);
    setError('');
    await window.electronAPI.pluginUninstall(id);
    await loadInstalled();
    setLoading(false);
  };

  const handleInstall = async (url: string) => {
    setLoading(true);
    setError('');
    setConfirmInstall(null);
    const result = await window.electronAPI.pluginInstallUrl(url);
    setLoading(false);
    if (result.success) {
      setImportUrl('');
      setView('installed');
      await loadInstalled();
    } else {
      setError(result.error || '安装失败');
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
      <div className="plugin-panel">
        <div className="plugin-header">
          <button className="plugin-back" onClick={() => setConfirmInstall(null)}>←</button>
          <h3>🔒 权限确认</h3>
        </div>
        <div className="plugin-body">
          <div className="perm-confirm">
            {hasHighRisk && (
              <div className="perm-warning">
                ⚠️ 此插件需要高危权限，请确认来源可信
              </div>
            )}
            <div className="perm-list">
              {perms.length === 0 && <div className="perm-item safe">✅ 无需特殊权限</div>}
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
              <button className="plugin-btn" onClick={() => setConfirmInstall(null)}>取消</button>
              <button className="plugin-btn primary" onClick={() => handleInstall(confirmInstall.url)} disabled={loading}>
                {loading ? '安装中...' : '确认安装'}
              </button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="plugin-panel">
      <div className="plugin-header">
        <button className="plugin-back" onClick={onClose}>←</button>
        <h3>🧩 插件</h3>
      </div>

      {/* Tabs */}
      <div className="plugin-tabs">
        {(['installed', 'store', 'import'] as PluginView[]).map(tab => (
          <button
            key={tab}
            className={`plugin-tab ${view === tab ? 'active' : ''}`}
            onClick={() => { setView(tab); setError(''); }}
          >
            {tab === 'installed' ? '已安装' : tab === 'store' ? '插件库' : '导入'}
          </button>
        ))}
      </div>

      <div className="plugin-body">
        {error && <div className="plugin-error">{error}</div>}

        {/* ─── Installed Tab ─── */}
        {view === 'installed' && (
          <div className="plugin-list">
            {installedPlugins.length === 0 && (
              <div className="plugin-empty">
                <div className="empty-icon">🧩</div>
                <p>还没有安装插件</p>
                <button className="plugin-btn primary" onClick={() => setView('store')}>
                  去插件库看看
                </button>
              </div>
            )}
            {installedPlugins.map(p => (
              <div key={p.id} className={`plugin-card ${p.active ? 'active' : 'inactive'}`}>
                <div className="plugin-card-header">
                  <div className="plugin-card-info">
                    <span className="plugin-name">{p.manifest.name}</span>
                    <span className="plugin-version">v{p.manifest.version}</span>
                  </div>
                  <label className="toggle-switch small">
                    <input
                      type="checkbox"
                      checked={p.record.enabled}
                      onChange={() => handleToggle(p.id, p.record.enabled)}
                      disabled={loading}
                    />
                    <span className="toggle-slider" />
                  </label>
                </div>
                <div className="plugin-card-desc">{p.manifest.description}</div>
                <div className="plugin-card-footer">
                  <span className="plugin-author">by {p.manifest.author}</span>
                  <div className="plugin-card-perms">
                    {p.manifest.permissions.map(perm => (
                      <span key={perm} className={`perm-badge ${perm}`} title={PERM_LABELS[perm]?.label || perm}>
                        {PERM_LABELS[perm]?.icon || '❓'}
                      </span>
                    ))}
                  </div>
                  <button
                    className="plugin-btn danger small"
                    onClick={() => handleUninstall(p.id, p.manifest.name)}
                    disabled={loading}
                  >
                    卸载
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* ─── Store Tab ─── */}
        {view === 'store' && (
          <div className="plugin-store">
            <div className="store-search">
              <input
                type="text"
                value={searchQuery}
                onChange={e => setSearchQuery(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && handleSearch()}
                placeholder="搜索插件..."
                className="plugin-input"
              />
              <button className="plugin-btn small" onClick={handleSearch}>搜索</button>
            </div>

            {loading && <div className="plugin-loading">加载中...</div>}

            {!loading && featuredPlugins.length === 0 && (
              <div className="plugin-empty">
                <p>暂无精选插件</p>
                <p className="empty-hint">在 lbhub.ai 发现更多插件~</p>
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
                      <span className="installed-badge">已安装</span>
                    ) : (
                      <button
                        className="plugin-btn primary small"
                        onClick={() => setConfirmInstall({ url: p.downloadUrl, permissions: p.permissions })}
                        disabled={loading}
                      >
                        安装
                      </button>
                    )}
                  </div>
                  <div className="plugin-card-desc">{p.description}</div>
                  <div className="plugin-card-footer">
                    <span className="plugin-author">by {p.author}</span>
                    <span className="plugin-downloads">📥 {p.downloads}</span>
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {/* ─── Import Tab ─── */}
        {view === 'import' && (
          <div className="plugin-import">
            <div className="import-section">
              <h4>从链接安装</h4>
              <p className="import-hint">支持 GitHub 仓库 URL 或 zip 下载链接</p>
              <div className="import-form">
                <input
                  type="text"
                  value={importUrl}
                  onChange={e => setImportUrl(e.target.value)}
                  placeholder="https://github.com/user/plugin 或 .zip 链接"
                  className="plugin-input"
                />
                <button
                  className="plugin-btn primary"
                  onClick={() => {
                    if (!importUrl.trim()) { setError('请输入链接'); return; }
                    setConfirmInstall({ url: importUrl.trim() });
                  }}
                  disabled={loading || !importUrl.trim()}
                >
                  {loading ? '安装中...' : '导入'}
                </button>
              </div>
            </div>

            <div className="import-section">
              <h4>开发者？</h4>
              <p className="import-hint">
                创建插件很简单：一个 manifest.json + 一个 index.js。
                <br />
                上传到 GitHub 或 lbhub.ai 分享给其他龙虾主人~
              </p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
