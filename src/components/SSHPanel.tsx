import React, { useState, useEffect, useCallback, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import './SSHPanel.css';

interface SSHServer {
  id: string;
  name: string;
  host: string;
  port: number;
  username: string;
  authType: 'password' | 'key';
  lastConnected?: string;
  lastStatus?: 'online' | 'offline' | 'error';
  lastError?: string;
  isConnected: boolean;
}

interface ProcessInfo {
  name: string;
  pid: number;
  status: string;
  cpu: string;
  memory: string;
  uptime: string;
}

interface SystemInfo {
  hostname: string;
  uptime: string;
  loadAvg: string;
  memTotal: string;
  memUsed: string;
  memPercent: number;
  diskTotal: string;
  diskUsed: string;
  diskPercent: number;
}

type Tab = 'home' | 'status' | 'processes' | 'system' | 'logs';

interface SSHPanelProps {
  visible: boolean;
  onClose: () => void;
}

// ─── Circular Progress ───
const CircleProgress: React.FC<{ percent: number; size?: number; color?: string; label: string; detail: string }> = ({
  percent, size = 64, color = '#3498db', label, detail
}) => {
  const r = (size - 8) / 2;
  const circ = 2 * Math.PI * r;
  const offset = circ - (percent / 100) * circ;
  return (
    <div className="ssh-circle-wrap">
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
        <circle cx={size/2} cy={size/2} r={r} fill="none" stroke="rgba(255,255,255,0.06)" strokeWidth="6" />
        <circle cx={size/2} cy={size/2} r={r} fill="none" stroke={color} strokeWidth="6"
          strokeDasharray={circ} strokeDashoffset={offset} strokeLinecap="round"
          transform={`rotate(-90 ${size/2} ${size/2})`} style={{ transition: 'stroke-dashoffset 0.8s ease' }} />
        <text x={size/2} y={size/2 - 2} textAnchor="middle" fill="white" fontSize="13" fontWeight="600">{percent}%</text>
        <text x={size/2} y={size/2 + 12} textAnchor="middle" fill="rgba(255,255,255,0.4)" fontSize="8">{label}</text>
      </svg>
      <div className="ssh-circle-detail">{detail}</div>
    </div>
  );
};

export const SSHPanel: React.FC<SSHPanelProps> = ({ visible, onClose }) => {
  const { t } = useTranslation();
  const [servers, setServers] = useState<SSHServer[]>([]);
  const [activeServer, setActiveServer] = useState<string | null>(null);
  const [tab, setTab] = useState<Tab>('home');
  const [showAddModal, setShowAddModal] = useState(false);
  const [connecting, setConnecting] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [showTailscaleHint, setShowTailscaleHint] = useState(false);

  const [openclawStatus, setOpenclawStatus] = useState<any>(null);
  const [remoteTokens, setRemoteTokens] = useState<{ total: number; daily: number } | null>(null);
  const [processes, setProcesses] = useState<ProcessInfo[]>([]);
  const [systemInfo, setSystemInfo] = useState<SystemInfo | null>(null);
  const [logs, setLogs] = useState<string>('');
  const [selectedProcess, setSelectedProcess] = useState<string>('');
  const [loading, setLoading] = useState(false);
  const refreshRef = useRef<NodeJS.Timeout | null>(null);

  // ── Data loaders ──
  const loadServers = useCallback(async () => {
    try { setServers(await window.electronAPI.sshGetServers()); } catch {}
  }, []);

  const loadOpenClawStatus = async () => {
    if (!activeServer) return;
    setLoading(true);
    try {
      const [status, tokens] = await Promise.all([
        window.electronAPI.sshOpenClawStatus(activeServer),
        window.electronAPI.sshRemoteTokens(activeServer),
      ]);
      setOpenclawStatus(status);
      if (!tokens.error) setRemoteTokens(tokens);
    } catch {}
    setLoading(false);
  };

  const loadProcesses = async () => {
    if (!activeServer) return;
    setLoading(true);
    try { setProcesses(await window.electronAPI.sshProcessList(activeServer)); } catch {}
    setLoading(false);
  };

  const loadSystemInfo = async () => {
    if (!activeServer) return;
    setLoading(true);
    try { setSystemInfo(await window.electronAPI.sshSystemInfo(activeServer)); } catch {}
    setLoading(false);
  };

  const loadLogs = async (processName: string) => {
    if (!activeServer) return;
    setLoading(true);
    try {
      const r = await window.electronAPI.sshProcessLogs(activeServer, processName, 100);
      setLogs(r.logs || r.error || '');
    } catch {}
    setLoading(false);
  };

  useEffect(() => {
    if (visible) loadServers();
    return () => { if (refreshRef.current) clearInterval(refreshRef.current); };
  }, [visible, loadServers]);

  useEffect(() => {
    if (refreshRef.current) clearInterval(refreshRef.current);
    if (activeServer && visible) {
      const refresh = async () => {
        if (tab === 'status') await loadOpenClawStatus();
        else if (tab === 'processes') await loadProcesses();
        else if (tab === 'system') await loadSystemInfo();
      };
      refreshRef.current = setInterval(refresh, 15000);
    }
    return () => { if (refreshRef.current) clearInterval(refreshRef.current); };
  }, [activeServer, tab, visible]);

  // ── Handlers ──
  const handleConnect = async (serverId: string) => {
    setConnecting(serverId); setError(null); setShowTailscaleHint(false);
    try {
      const r = await window.electronAPI.sshConnect(serverId);
      if (r.success) {
        setActiveServer(serverId); setTab('status');
        await loadServers(); await loadOpenClawStatus();
      } else {
        const errMsg = r.error || t('ssh.connectFailed');
        const isNetworkIssue = /timeout|timed out|handshake|connection lost|ECONNREFUSED|EHOSTUNREACH|ENETUNREACH/i.test(errMsg);
        setError(errMsg);
        if (isNetworkIssue) setShowTailscaleHint(true);
      }
    } catch (e: unknown) { setError((e as Error).message); }
    setConnecting(null);
  };

  const handleDisconnect = async (serverId: string) => {
    await window.electronAPI.sshDisconnect(serverId);
    if (activeServer === serverId) {
      setActiveServer(null); setTab('home');
      setOpenclawStatus(null); setRemoteTokens(null); setProcesses([]); setSystemInfo(null);
    }
    await loadServers();
  };

  const handleRemove = async (serverId: string) => {
    await window.electronAPI.sshRemoveServer(serverId);
    if (activeServer === serverId) { setActiveServer(null); setTab('home'); }
    await loadServers();
  };

  const handleRestart = async (processName: string) => {
    if (!activeServer) return;
    setLoading(true);
    try {
      const r = await window.electronAPI.sshRestartProcess(activeServer, processName);
      if (r.success) setTimeout(loadProcesses, 2000);
      else setError(r.error || t('ssh.restartFailed'));
    } catch (e: unknown) { setError((e as Error).message); }
    setLoading(false);
  };

  const handleTabChange = async (newTab: Tab) => {
    setTab(newTab);
    if (newTab === 'status') await loadOpenClawStatus();
    else if (newTab === 'processes') await loadProcesses();
    else if (newTab === 'system') await loadSystemInfo();
  };

  if (!visible) return null;

  const activeServerObj = servers.find(s => s.id === activeServer);
  const connectedCount = servers.filter(s => s.isConnected).length;
  const errorCount = servers.filter(s => s.lastStatus === 'error').length;

  const tabs: { key: Tab; icon: string; label: string; needsServer?: boolean }[] = [
    { key: 'home', icon: '🏠', label: t('ssh.tab.home', 'Servers') },
    { key: 'status', icon: '📊', label: t('ssh.tab.status'), needsServer: true },
    { key: 'processes', icon: '⚙️', label: t('ssh.tab.processes'), needsServer: true },
    { key: 'system', icon: '💻', label: t('ssh.tab.system'), needsServer: true },
    { key: 'logs', icon: '📜', label: t('ssh.tab.logs'), needsServer: true },
  ];

  return (
    <div className="ssh-panel">
      {/* ── Header ── */}
      <div className="ssh-header">
        <button className="ssh-back-btn" onClick={onClose} aria-label="Back">←</button>
        <div className="ssh-header-info">
          <span className="ssh-title">🖥️ {t('ssh.title')}</span>
          {activeServerObj && (
            <span className="ssh-connected-badge">🟢 {activeServerObj.name}</span>
          )}
        </div>
      </div>

      {/* ── Tab Bar ── */}
      <div className="ssh-tabs">
        {tabs.map(tb => (
          (!tb.needsServer || activeServer) && (
            <button
              key={tb.key}
              className={`ssh-tab ${tab === tb.key ? 'active' : ''}`}
              onClick={() => tb.needsServer ? handleTabChange(tb.key) : setTab(tb.key)}
              title={tb.label}
            >
              <span className="ssh-tab-icon">{tb.icon}</span>
              <span className="ssh-tab-label">{tb.label}</span>
            </button>
          )
        ))}
      </div>

      {/* ── Error + Tailscale ── */}
      {error && (
        <div className="ssh-error">
          <span>{error}</span>
          <button onClick={() => { setError(null); setShowTailscaleHint(false); }}>✕</button>
        </div>
      )}

      {showTailscaleHint && (
        <div className="ssh-tailscale-hint">
          <div className="ssh-tailscale-header">
            <span>🌐 {t('ssh.tailscale.title', 'Different network? Try Tailscale')}</span>
            <button onClick={() => setShowTailscaleHint(false)}>✕</button>
          </div>
          <p>{t('ssh.tailscale.desc', 'Tailscale creates a free encrypted tunnel between devices on different networks.')}</p>
          <div className="ssh-tailscale-steps">
            <div className="ssh-tailscale-step"><span className="ssh-step-num">1</span><span>{t('ssh.tailscale.step1', 'Install on both machines')}</span></div>
            <div className="ssh-tailscale-step"><span className="ssh-step-num">2</span><span>{t('ssh.tailscale.step2', 'Sign in same account')}</span></div>
            <div className="ssh-tailscale-step"><span className="ssh-step-num">3</span><span>{t('ssh.tailscale.step3', 'Use 100.x.x.x IP')}</span></div>
          </div>
          <button className="ssh-btn accent-sm" onClick={() => window.electronAPI.openExternal('https://tailscale.com/download')}>
            {t('ssh.tailscale.download', 'Get Tailscale →')}
          </button>
        </div>
      )}

      <div className="ssh-content">
        {/* ━━━ HOME ━━━ */}
        {tab === 'home' && (
          <div className="ssh-home">
            {/* Overview bar */}
            {servers.length > 0 && (
              <div className="ssh-overview">
                <div className="ssh-overview-item">
                  <span className="ssh-overview-num">{servers.length}</span>
                  <span className="ssh-overview-label">{t('ssh.overview.total', 'Servers')}</span>
                </div>
                <div className="ssh-overview-divider" />
                <div className="ssh-overview-item">
                  <span className="ssh-overview-num ssh-num-green">{connectedCount}</span>
                  <span className="ssh-overview-label">{t('ssh.overview.connected', 'Connected')}</span>
                </div>
                {errorCount > 0 && (
                  <>
                    <div className="ssh-overview-divider" />
                    <div className="ssh-overview-item">
                      <span className="ssh-overview-num ssh-num-red">{errorCount}</span>
                      <span className="ssh-overview-label">{t('ssh.overview.issues', 'Issues')}</span>
                    </div>
                  </>
                )}
              </div>
            )}

            {/* Server cards */}
            {servers.length > 0 ? (
              <div className="ssh-server-list">
                {servers.map(s => (
                  <div key={s.id} className={`ssh-server-card ${s.isConnected ? 'connected' : ''} ${s.lastStatus === 'error' ? 'has-error' : ''}`}>
                    <div className="ssh-server-card-top">
                      <div className="ssh-server-status-dot">
                        {s.isConnected ? '🟢' : (s.lastStatus === 'error' ? '🔴' : '⚫')}
                      </div>
                      <div className="ssh-server-info">
                        <div className="ssh-server-name">{s.name}</div>
                        <div className="ssh-server-host">{s.username}@{s.host}:{s.port || 22}</div>
                      </div>
                      <button className="ssh-server-delete" onClick={() => handleRemove(s.id)} title={t('ssh.remove')}>🗑️</button>
                    </div>
                    {s.lastConnected && !s.isConnected && (
                      <div className="ssh-server-last">{t('ssh.lastSeen')}: {new Date(s.lastConnected).toLocaleString()}</div>
                    )}
                    <div className="ssh-server-card-actions">
                      {s.isConnected ? (
                        <>
                          <button className="ssh-btn accent-sm" onClick={() => { setActiveServer(s.id); handleTabChange('status'); }}>
                            {t('ssh.home.viewStatus', 'Dashboard')} →
                          </button>
                          <button className="ssh-btn danger-sm" onClick={() => handleDisconnect(s.id)}>
                            {t('ssh.disconnect')}
                          </button>
                        </>
                      ) : (
                        <button
                          className="ssh-btn accent-sm full"
                          onClick={() => handleConnect(s.id)}
                          disabled={connecting === s.id}
                        >
                          {connecting === s.id ? '⏳ ...' : `🔗 ${t('ssh.connect')}`}
                        </button>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="ssh-empty-state">
                <div className="ssh-empty-icon">🖥️</div>
                <div className="ssh-empty-text">{t('ssh.home.noServers', 'No servers yet')}</div>
                <div className="ssh-empty-hint">{t('ssh.home.addHint', 'Add a server to monitor your OpenClaw instances remotely')}</div>
              </div>
            )}

            <button className="ssh-btn outline full" onClick={() => setShowAddModal(true)}>
              + {t('ssh.addServer')}
            </button>

            <div className="ssh-security-note">🔒 {t('ssh.home.securityNote')}</div>
          </div>
        )}

        {/* ━━━ STATUS ━━━ */}
        {tab === 'status' && activeServer && (
          <div className="ssh-status-view">
            {loading && <div className="ssh-loading">⏳</div>}
            {openclawStatus && (
              <div className="ssh-dashboard">
                <div className="ssh-dash-card">
                  <div className="ssh-dash-label">{t('ssh.field.status')}</div>
                  <div className={`ssh-dash-badge ${openclawStatus.status === 'active' ? 'active' : (openclawStatus.status === 'openclaw-not-found' ? 'warn' : 'inactive')}`}>
                    {openclawStatus.status === 'openclaw-not-found' ? t('ssh.notInstalled') : (openclawStatus.status || '?')}
                  </div>
                </div>
                {openclawStatus.activeSessions !== undefined && (
                  <div className="ssh-dash-card">
                    <div className="ssh-dash-label">{t('ssh.field.sessions')}</div>
                    <div className="ssh-dash-value">{openclawStatus.activeSessions}</div>
                  </div>
                )}
                {remoteTokens && (
                  <>
                    <div className="ssh-dash-card">
                      <div className="ssh-dash-label">{t('ssh.field.dailyTokens')}</div>
                      <div className="ssh-dash-value">{(remoteTokens.daily / 1e6).toFixed(1)}M</div>
                    </div>
                    <div className="ssh-dash-card">
                      <div className="ssh-dash-label">{t('ssh.field.totalTokensScanned')}</div>
                      <div className="ssh-dash-value">{(remoteTokens.total / 1e6).toFixed(1)}M</div>
                    </div>
                  </>
                )}
                {openclawStatus.uptime && (
                  <div className="ssh-dash-card">
                    <div className="ssh-dash-label">{t('ssh.field.uptime')}</div>
                    <div className="ssh-dash-value">{openclawStatus.uptime}</div>
                  </div>
                )}
              </div>
            )}
            {openclawStatus?.error && <div className="ssh-error-inline">⚠️ {openclawStatus.error}</div>}
            <button className="ssh-btn refresh full" onClick={loadOpenClawStatus} disabled={loading}>🔄 {t('ssh.refresh')}</button>
          </div>
        )}

        {/* ━━━ PROCESSES ━━━ */}
        {tab === 'processes' && activeServer && (
          <div className="ssh-process-view">
            {loading && <div className="ssh-loading">⏳</div>}
            {processes.length > 0 && (
              <div className="ssh-process-summary">
                <span className="ssh-pill green">{processes.filter(p => p.status === 'online').length} online</span>
                <span className="ssh-pill red">{processes.filter(p => p.status !== 'online').length} stopped</span>
              </div>
            )}
            {processes.map(p => (
              <div key={p.name} className={`ssh-process-card ${p.status}`}>
                <div className="ssh-process-top">
                  <span className={`ssh-pill ${p.status === 'online' ? 'green' : 'red'}`}>{p.status}</span>
                  <span className="ssh-process-name">{p.name}</span>
                  <div className="ssh-process-btns">
                    <button className="ssh-icon-btn" onClick={() => { setSelectedProcess(p.name); handleTabChange('logs'); loadLogs(p.name); }} title={t('ssh.viewLogs')}>📜</button>
                    <button className="ssh-icon-btn" onClick={() => handleRestart(p.name)} title={t('ssh.restart')}>🔄</button>
                  </div>
                </div>
                <div className="ssh-process-meta">
                  <span>PID {p.pid}</span>
                  <span>CPU {p.cpu}</span>
                  <span>MEM {p.memory}</span>
                  <span>⏱️ {p.uptime}</span>
                </div>
              </div>
            ))}
            {processes.length === 0 && !loading && <div className="ssh-empty">{t('ssh.noProcesses')}</div>}
            <button className="ssh-btn refresh full" onClick={loadProcesses} disabled={loading}>🔄 {t('ssh.refresh')}</button>
          </div>
        )}

        {/* ━━━ SYSTEM ━━━ */}
        {tab === 'system' && activeServer && (
          <div className="ssh-system-view">
            {loading && <div className="ssh-loading">⏳</div>}
            {systemInfo && (
              <>
                <div className="ssh-sys-header">
                  <div className="ssh-sys-hostname">🏠 {systemInfo.hostname}</div>
                  <div className="ssh-sys-meta">⏱️ {systemInfo.uptime} · 📊 Load {systemInfo.loadAvg}</div>
                </div>
                <div className="ssh-circles">
                  <CircleProgress
                    percent={systemInfo.memPercent}
                    color={systemInfo.memPercent > 80 ? '#e74c3c' : '#3498db'}
                    label="RAM"
                    detail={`${systemInfo.memUsed} / ${systemInfo.memTotal}`}
                  />
                  <CircleProgress
                    percent={systemInfo.diskPercent}
                    color={systemInfo.diskPercent > 85 ? '#e74c3c' : '#2ecc71'}
                    label="Disk"
                    detail={`${systemInfo.diskUsed} / ${systemInfo.diskTotal}`}
                  />
                </div>
              </>
            )}
            <button className="ssh-btn refresh full" onClick={loadSystemInfo} disabled={loading}>🔄 {t('ssh.refresh')}</button>
          </div>
        )}

        {/* ━━━ LOGS ━━━ */}
        {tab === 'logs' && activeServer && (
          <div className="ssh-logs-view">
            <div className="ssh-logs-header">
              <select
                value={selectedProcess}
                onChange={(e) => { setSelectedProcess(e.target.value); if (e.target.value) loadLogs(e.target.value); }}
                className="ssh-select"
              >
                <option value="">{t('ssh.selectProcess')}</option>
                {processes.map(p => (
                  <option key={p.name} value={p.name}>{p.status === 'online' ? '🟢' : '🔴'} {p.name}</option>
                ))}
              </select>
              <button className="ssh-btn refresh-sm" onClick={() => selectedProcess && loadLogs(selectedProcess)} disabled={loading || !selectedProcess}>🔄</button>
            </div>
            <pre className="ssh-logs-content">{logs || t('ssh.selectProcessHint')}</pre>
          </div>
        )}
      </div>

      {/* ── Add Server Modal ── */}
      {showAddModal && (
        <div className="ssh-modal-overlay" onClick={() => setShowAddModal(false)}>
          <div className="ssh-modal" onClick={e => e.stopPropagation()}>
            <AddServerForm
              onAdd={async (data) => {
                const r = await window.electronAPI.sshAddServer(data);
                if (r.error) setError(r.error);
                else { setShowAddModal(false); await loadServers(); }
              }}
              onCancel={() => setShowAddModal(false)}
            />
          </div>
        </div>
      )}
    </div>
  );
};

// ─── Add Server Form ───
const AddServerForm: React.FC<{
  onAdd: (data: any) => Promise<void>;
  onCancel: () => void;
}> = ({ onAdd, onCancel }) => {
  const { t } = useTranslation();
  const [name, setName] = useState('');
  const [host, setHost] = useState('');
  const [port, setPort] = useState(22);
  const [username, setUsername] = useState('root');
  const [authType, setAuthType] = useState<'password' | 'key'>('password');
  const [credential, setCredential] = useState('');
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const handleTest = async () => {
    setTesting(true); setTestResult(null);
    try {
      const r = await window.electronAPI.sshTestConnection({ host, port, username, authType, credential });
      setTestResult(r.success ? `✅ ${t('ssh.testSuccess')}` : `❌ ${r.error}`);
    } catch (e: unknown) { setTestResult(`❌ ${(e as Error).message}`); }
    setTesting(false);
  };

  const handleSubmit = async () => {
    if (!name || !host || !username || !credential) return;
    setSaving(true);
    await onAdd({ name, host, port, username, authType, credential });
    setSaving(false);
  };

  return (
    <div className="ssh-add-form">
      <div className="ssh-form-header">
        <span className="ssh-form-title">{t('ssh.addServer')}</span>
        <button className="ssh-modal-close" onClick={onCancel}>✕</button>
      </div>
      <label>{t('ssh.form.name')}</label>
      <input value={name} onChange={e => setName(e.target.value)} placeholder={t('ssh.form.namePlaceholder')} />
      <label>{t('ssh.form.host')}</label>
      <input value={host} onChange={e => setHost(e.target.value)} placeholder="192.168.1.100 or 100.x.x.x" />
      <div className="ssh-form-row">
        <div><label>{t('ssh.form.port')}</label><input type="number" value={port} onChange={e => setPort(parseInt(e.target.value) || 22)} /></div>
        <div><label>{t('ssh.form.username')}</label><input value={username} onChange={e => setUsername(e.target.value)} /></div>
      </div>
      <label>{t('ssh.form.authType')}</label>
      <div className="ssh-auth-toggle">
        <button className={authType === 'password' ? 'active' : ''} onClick={() => setAuthType('password')}>🔑 {t('ssh.form.password')}</button>
        <button className={authType === 'key' ? 'active' : ''} onClick={() => setAuthType('key')}>🔐 {t('ssh.form.sshKey')}</button>
      </div>
      <label>{authType === 'password' ? t('ssh.form.password') : t('ssh.form.privateKey')}</label>
      {authType === 'password' ? (
        <input type="password" value={credential} onChange={e => setCredential(e.target.value)} />
      ) : (
        <textarea value={credential} onChange={e => setCredential(e.target.value)} placeholder="-----BEGIN OPENSSH PRIVATE KEY-----&#10;..." rows={3} />
      )}
      {testResult && <div className="ssh-test-result">{testResult}</div>}
      <div className="ssh-form-actions">
        <button className="ssh-btn secondary" onClick={handleTest} disabled={testing || !host || !username || !credential}>
          {testing ? '⏳' : t('ssh.form.test')}
        </button>
        <button className="ssh-btn primary" onClick={handleSubmit} disabled={saving || !name || !host || !username || !credential}>
          {saving ? '⏳' : t('ssh.form.save')}
        </button>
      </div>
    </div>
  );
};
