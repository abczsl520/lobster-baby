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

interface RemoteInfo {
  hasReporterToken: boolean;
  tokenIssuedAt: string | null;
  lastHeartbeat: string | null;
  reporterVersion: string | null;
}

type Tab = 'overview' | 'servers' | 'status' | 'processes' | 'system' | 'logs';

interface SSHPanelProps {
  visible: boolean;
  onClose: () => void;
}

export const SSHPanel: React.FC<SSHPanelProps> = ({ visible, onClose }) => {
  const { t } = useTranslation();
  const [servers, setServers] = useState<SSHServer[]>([]);
  const [activeServer, setActiveServer] = useState<string | null>(null);
  const [tab, setTab] = useState<Tab>('overview');
  const [showAddForm, setShowAddForm] = useState(false);
  const [connecting, setConnecting] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  
  // Remote mode state
  const [remoteMode, setRemoteMode] = useState<'local' | 'remote'>('local');
  const [remoteInfo, setRemoteInfo] = useState<RemoteInfo | null>(null);
  const [generatedToken, setGeneratedToken] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [remoteLoading, setRemoteLoading] = useState(false);
  
  // Status data
  const [openclawStatus, setOpenclawStatus] = useState<any>(null);
  const [processes, setProcesses] = useState<ProcessInfo[]>([]);
  const [systemInfo, setSystemInfo] = useState<SystemInfo | null>(null);
  const [logs, setLogs] = useState<string>('');
  const [selectedProcess, setSelectedProcess] = useState<string>('');
  const [loading, setLoading] = useState(false);
  
  const refreshRef = useRef<NodeJS.Timeout | null>(null);

  const loadServers = useCallback(async () => {
    try {
      const result = await window.electronAPI.sshGetServers();
      setServers(result);
    } catch {}
  }, []);

  useEffect(() => {
    if (visible) {
      loadServers();
      loadRemoteMode();
      loadRemoteInfo();
    }
    return () => { if (refreshRef.current) clearInterval(refreshRef.current); };
  }, [visible, loadServers]);

  const loadRemoteMode = async () => {
    try {
      const result = await window.electronAPI.remoteGetMode();
      if (result.mode === 'local' || result.mode === 'remote') setRemoteMode(result.mode);
    } catch {}
  };

  const loadRemoteInfo = async () => {
    try {
      const result = await window.electronAPI.remoteGetInfo();
      if (!result.error) setRemoteInfo(result);
    } catch {}
  };

  const handleModeSwitch = async (newMode: 'local' | 'remote') => {
    setError(null);
    if (newMode === 'remote') {
      const local = await window.electronAPI.socialGetLocal();
      if (!local.hasToken) { setError(t('remote.needRegister')); return; }
    }
    const result = await window.electronAPI.remoteSwitchMode(newMode);
    if (result.error) { setError(result.error); return; }
    setRemoteMode(newMode);
  };

  const handleGenerateToken = async () => {
    setRemoteLoading(true); setError(null);
    try {
      const result = await window.electronAPI.remoteGenerateToken();
      if (result.error) { setError(result.error); return; }
      setGeneratedToken(result.token || null);
      await loadRemoteInfo();
    } catch (e: any) { setError(e.message); }
    finally { setRemoteLoading(false); }
  };

  const handleRevokeToken = async () => {
    setRemoteLoading(true); setError(null);
    try {
      const result = await window.electronAPI.remoteRevokeToken();
      if (result.error) { setError(result.error); return; }
      setGeneratedToken(null); setRemoteInfo(null); setRemoteMode('local');
      await loadRemoteInfo();
    } catch (e: any) { setError(e.message); }
    finally { setRemoteLoading(false); }
  };

  const handleCopyToken = async (text: string) => {
    try { await navigator.clipboard.writeText(text); setCopied(true); setTimeout(() => setCopied(false), 2000); } catch {}
  };

  const formatTimeAgo = (isoStr: string | null) => {
    if (!isoStr) return '-';
    const diff = Date.now() - new Date(isoStr).getTime();
    if (diff < 60_000) return `${Math.floor(diff / 1000)}s ago`;
    if (diff < 3_600_000) return `${Math.floor(diff / 60_000)}m ago`;
    return `${Math.floor(diff / 3_600_000)}h ago`;
  };

  // Auto-refresh when connected
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

  const handleConnect = async (serverId: string) => {
    setConnecting(serverId);
    setError(null);
    try {
      const result = await window.electronAPI.sshConnect(serverId);
      if (result.success) {
        setActiveServer(serverId);
        setTab('status');
        await loadServers();
        await loadOpenClawStatus();
      } else {
        setError(result.error || t('ssh.connectFailed'));
      }
    } catch (e: any) {
      setError(e.message);
    }
    setConnecting(null);
  };

  const handleDisconnect = async (serverId: string) => {
    await window.electronAPI.sshDisconnect(serverId);
    if (activeServer === serverId) {
      setActiveServer(null);
      setTab('servers');
      setOpenclawStatus(null);
      setProcesses([]);
      setSystemInfo(null);
    }
    await loadServers();
  };

  const handleRemove = async (serverId: string) => {
    await window.electronAPI.sshRemoveServer(serverId);
    if (activeServer === serverId) {
      setActiveServer(null);
      setTab('servers');
    }
    await loadServers();
  };

  const loadOpenClawStatus = async () => {
    if (!activeServer) return;
    setLoading(true);
    try {
      const result = await window.electronAPI.sshOpenClawStatus(activeServer);
      setOpenclawStatus(result);
    } catch {}
    setLoading(false);
  };

  const loadProcesses = async () => {
    if (!activeServer) return;
    setLoading(true);
    try {
      const result = await window.electronAPI.sshProcessList(activeServer);
      setProcesses(result);
    } catch {}
    setLoading(false);
  };

  const loadSystemInfo = async () => {
    if (!activeServer) return;
    setLoading(true);
    try {
      const result = await window.electronAPI.sshSystemInfo(activeServer);
      setSystemInfo(result);
    } catch {}
    setLoading(false);
  };

  const loadLogs = async (processName: string) => {
    if (!activeServer) return;
    setLoading(true);
    try {
      const result = await window.electronAPI.sshProcessLogs(activeServer, processName, 100);
      setLogs(result.logs || result.error || '');
    } catch {}
    setLoading(false);
  };

  const handleRestart = async (processName: string) => {
    if (!activeServer) return;
    setLoading(true);
    try {
      const result = await window.electronAPI.sshRestartProcess(activeServer, processName);
      if (result.success) {
        setTimeout(loadProcesses, 2000);
      } else {
        setError(result.error || t('ssh.restartFailed'));
      }
    } catch (e: any) {
      setError(e.message);
    }
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

  return (
    <div className="ssh-panel">
      {/* Header with back button */}
      <div className="ssh-header">
        <button className="ssh-back-btn" onClick={onClose}>←</button>
        <span className="ssh-title">🖥️ {t('ssh.title')}</span>
        {activeServerObj && (
          <span className="ssh-connected-badge">
            🟢 {activeServerObj.name}
          </span>
        )}
      </div>

      {/* Tab bar — show when connected */}
      {activeServer && (
        <div className="ssh-tabs">
          {(['status', 'processes', 'system', 'logs', 'servers'] as Tab[]).map(tabName => (
            <button
              key={tabName}
              className={`ssh-tab ${tab === tabName ? 'active' : ''}`}
              onClick={() => handleTabChange(tabName)}
            >
              {tabName === 'status' && '📊'}
              {tabName === 'processes' && '⚙️'}
              {tabName === 'system' && '💻'}
              {tabName === 'logs' && '📜'}
              {tabName === 'servers' && '🔌'}
              {' '}{t(`ssh.tab.${tabName}`)}
            </button>
          ))}
        </div>
      )}

      {/* Tab bar when not connected */}
      {!activeServer && (
        <div className="ssh-tabs">
          <button className={`ssh-tab ${tab === 'overview' ? 'active' : ''}`} onClick={() => setTab('overview')}>
            🏠 {t('ssh.tab.overview')}
          </button>
          <button className={`ssh-tab ${tab === 'servers' ? 'active' : ''}`} onClick={() => setTab('servers')}>
            🔌 {t('ssh.tab.servers')}
          </button>
        </div>
      )}

      {error && (
        <div className="ssh-error">
          {error}
          <button onClick={() => setError(null)}>✕</button>
        </div>
      )}

      {/* ── Overview — Remote Mode + Quick Access ── */}
      {tab === 'overview' && (
        <div className="ssh-overview">
          {/* Remote Mode Section */}
          <div className="ssh-section-card">
            <div className="ssh-section-title">☁️ {t('remote.title')}</div>
            <div className="ssh-mode-selector">
              <button 
                className={`ssh-mode-btn ${remoteMode === 'local' ? 'active' : ''}`}
                onClick={() => handleModeSwitch('local')}
              >
                🏠 {t('remote.local')}
              </button>
              <button 
                className={`ssh-mode-btn ${remoteMode === 'remote' ? 'active' : ''}`}
                onClick={() => handleModeSwitch('remote')}
              >
                ☁️ {t('remote.remoteServer')}
              </button>
            </div>

            {remoteInfo?.hasReporterToken && (
              <div className="ssh-remote-status">
                <span className={remoteInfo.lastHeartbeat ? 'online' : 'offline'}>
                  {remoteInfo.lastHeartbeat ? '🟢 ' + t('remote.connected') : '🔴 ' + t('remote.disconnected')}
                </span>
                {remoteInfo.lastHeartbeat && (
                  <span className="ssh-remote-time">{formatTimeAgo(remoteInfo.lastHeartbeat)}</span>
                )}
              </div>
            )}

            <div className="ssh-remote-actions">
              {!remoteInfo?.hasReporterToken ? (
                <button className="ssh-btn primary-sm" onClick={handleGenerateToken} disabled={remoteLoading}>
                  {remoteLoading ? '...' : t('remote.generateToken')}
                </button>
              ) : (
                <button className="ssh-btn danger-sm" onClick={handleRevokeToken} disabled={remoteLoading}>
                  {remoteLoading ? '...' : t('remote.revokeToken')}
                </button>
              )}
            </div>

            {generatedToken && (
              <div className="ssh-token-block">
                <div className="ssh-token-hint">{t('remote.installHint')}</div>
                <code className="ssh-token-cmd">
                  curl -sSL https://lbhub.ai/reporter/install.sh | bash -s -- --token {generatedToken}
                </code>
                <button className="ssh-btn text-sm" onClick={() => handleCopyToken(`curl -sSL https://lbhub.ai/reporter/install.sh | bash -s -- --token ${generatedToken}`)}>
                  {copied ? '✅' : '📋'} {copied ? t('remote.copied') : t('remote.copyToken')}
                </button>
              </div>
            )}
          </div>

          {/* SSH Quick Access */}
          <div className="ssh-section-card">
            <div className="ssh-section-title">🖥️ SSH {t('ssh.tab.servers')}</div>
            {servers.length > 0 ? (
              <>
                {servers.map(s => (
                  <div key={s.id} className="ssh-quick-server" onClick={() => s.isConnected ? (setActiveServer(s.id), setTab('status')) : handleConnect(s.id)}>
                    <span>{s.isConnected ? '🟢' : '⚫'} {s.name}</span>
                    <span className="ssh-quick-host">{s.host}</span>
                  </div>
                ))}
                <button className="ssh-btn text-sm" onClick={() => setTab('servers')}>
                  {t('ssh.manageServers')} →
                </button>
              </>
            ) : (
              <div className="ssh-overview-empty">
                <p>{t('ssh.welcome.desc')}</p>
                <button className="ssh-btn primary-sm" onClick={() => { setTab('servers'); setShowAddForm(true); }}>
                  + {t('ssh.addServer')}
                </button>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ── Welcome / Empty State ── */}
      {tab === 'servers' && servers.length === 0 && !showAddForm && (
        <div className="ssh-welcome">
          <div className="ssh-welcome-icon">🖥️</div>
          <div className="ssh-welcome-title">{t('ssh.welcome.title')}</div>
          <div className="ssh-welcome-desc">{t('ssh.welcome.desc')}</div>
          <div className="ssh-welcome-features">
            <div className="ssh-welcome-feature">
              <span>📊</span> {t('ssh.welcome.feature1')}
            </div>
            <div className="ssh-welcome-feature">
              <span>⚙️</span> {t('ssh.welcome.feature2')}
            </div>
            <div className="ssh-welcome-feature">
              <span>💻</span> {t('ssh.welcome.feature3')}
            </div>
            <div className="ssh-welcome-feature">
              <span>📜</span> {t('ssh.welcome.feature4')}
            </div>
          </div>
          <button className="ssh-btn primary" onClick={() => setShowAddForm(true)}>
            + {t('ssh.addServer')}
          </button>
          <div className="ssh-welcome-hint">{t('ssh.welcome.hint')}</div>
        </div>
      )}

      {/* ── Server list ── */}
      {tab === 'servers' && (servers.length > 0 || showAddForm) && (
        <div className="ssh-server-list">
          {servers.length > 0 && (
            <div className="ssh-server-summary">
              {t('ssh.serverCount', { total: servers.length, connected: connectedCount })}
            </div>
          )}

          {servers.map(s => (
            <div key={s.id} className={`ssh-server-card ${s.isConnected ? 'connected' : ''}`}>
              <div className="ssh-server-info">
                <div className="ssh-server-name">
                  {s.isConnected ? '🟢' : (s.lastStatus === 'error' ? '🔴' : '⚫')} {s.name}
                </div>
                <div className="ssh-server-host">{s.username}@{s.host}:{s.port}</div>
                {s.lastConnected && !s.isConnected && (
                  <div className="ssh-server-last">{t('ssh.lastConnected')}: {new Date(s.lastConnected).toLocaleString()}</div>
                )}
              </div>
              <div className="ssh-server-actions">
                {s.isConnected ? (
                  <button className="ssh-btn danger-sm" onClick={() => handleDisconnect(s.id)}>
                    {t('ssh.disconnect')}
                  </button>
                ) : (
                  <button 
                    className="ssh-btn primary-sm" 
                    onClick={() => handleConnect(s.id)}
                    disabled={connecting === s.id}
                  >
                    {connecting === s.id ? '⏳' : t('ssh.connect')}
                  </button>
                )}
                <button className="ssh-btn text-sm" onClick={() => handleRemove(s.id)} title={t('ssh.remove')}>🗑️</button>
              </div>
            </div>
          ))}

          {!showAddForm ? (
            <button className="ssh-btn primary" onClick={() => setShowAddForm(true)}>
              + {t('ssh.addServer')}
            </button>
          ) : (
            <AddServerForm
              onAdd={async (data) => {
                const result = await window.electronAPI.sshAddServer(data);
                if (result.error) setError(result.error);
                else {
                  setShowAddForm(false);
                  await loadServers();
                }
              }}
              onCancel={() => setShowAddForm(false)}
            />
          )}
        </div>
      )}

      {/* ── OpenClaw Status ── */}
      {tab === 'status' && activeServer && (
        <div className="ssh-status-view">
          <div className="ssh-section-hint">{t('ssh.statusHint')}</div>
          {loading && <div className="ssh-loading">{t('ssh.loading')}</div>}
          {openclawStatus && (
            <>
              <div className="ssh-status-card">
                <div className="ssh-status-row">
                  <span>{t('ssh.field.status')}</span>
                  <span className={`ssh-status-badge ${openclawStatus.status === 'active' ? 'active' : (openclawStatus.status === 'openclaw-not-found' ? 'notfound' : 'inactive')}`}>
                    {openclawStatus.status === 'openclaw-not-found' ? t('ssh.notInstalled') : (openclawStatus.status || 'unknown')}
                  </span>
                </div>
                {openclawStatus.activeSessions !== undefined && (
                  <div className="ssh-status-row">
                    <span>{t('ssh.field.sessions')}</span>
                    <span>{openclawStatus.activeSessions}</span>
                  </div>
                )}
                {openclawStatus.totalTokens !== undefined && (
                  <div className="ssh-status-row">
                    <span>{t('ssh.field.tokens')}</span>
                    <span>{(openclawStatus.totalTokens / 1e6).toFixed(1)}M</span>
                  </div>
                )}
                {openclawStatus.uptime && (
                  <div className="ssh-status-row">
                    <span>{t('ssh.field.uptime')}</span>
                    <span>{openclawStatus.uptime}</span>
                  </div>
                )}
              </div>
              {openclawStatus.error && (
                <div className="ssh-error-inline">⚠️ {openclawStatus.error}</div>
              )}
            </>
          )}
          <button className="ssh-btn refresh" onClick={loadOpenClawStatus} disabled={loading}>
            🔄 {t('ssh.refresh')}
          </button>
        </div>
      )}

      {/* ── Process list ── */}
      {tab === 'processes' && activeServer && (
        <div className="ssh-process-view">
          <div className="ssh-section-hint">{t('ssh.processHint')}</div>
          {loading && <div className="ssh-loading">{t('ssh.loading')}</div>}
          {processes.length > 0 && (
            <div className="ssh-process-summary">
              {t('ssh.processCount', { 
                total: processes.length, 
                online: processes.filter(p => p.status === 'online').length 
              })}
            </div>
          )}
          {processes.map(p => (
            <div key={p.name} className={`ssh-process-card ${p.status}`}>
              <div className="ssh-process-info">
                <div className="ssh-process-name">
                  {p.status === 'online' ? '🟢' : '🔴'} {p.name}
                </div>
                <div className="ssh-process-meta">
                  PID:{p.pid} | CPU:{p.cpu} | MEM:{p.memory} | ⏱️{p.uptime}
                </div>
              </div>
              <div className="ssh-process-actions">
                <button className="ssh-btn text-sm" onClick={() => { setSelectedProcess(p.name); handleTabChange('logs'); loadLogs(p.name); }} title={t('ssh.viewLogs')}>
                  📜
                </button>
                <button className="ssh-btn warning-sm" onClick={() => handleRestart(p.name)} title={t('ssh.restart')}>
                  🔄
                </button>
              </div>
            </div>
          ))}
          {processes.length === 0 && !loading && (
            <div className="ssh-empty">{t('ssh.noProcesses')}</div>
          )}
          <button className="ssh-btn refresh" onClick={loadProcesses} disabled={loading}>
            🔄 {t('ssh.refresh')}
          </button>
        </div>
      )}

      {/* ── System info ── */}
      {tab === 'system' && activeServer && (
        <div className="ssh-system-view">
          <div className="ssh-section-hint">{t('ssh.systemHint')}</div>
          {loading && <div className="ssh-loading">{t('ssh.loading')}</div>}
          {systemInfo && (
            <div className="ssh-system-card">
              <div className="ssh-status-row">
                <span>🏠 {t('ssh.field.hostname')}</span>
                <span>{systemInfo.hostname}</span>
              </div>
              <div className="ssh-status-row">
                <span>⏱️ {t('ssh.field.uptime')}</span>
                <span>{systemInfo.uptime}</span>
              </div>
              <div className="ssh-status-row">
                <span>📊 {t('ssh.field.load')}</span>
                <span>{systemInfo.loadAvg}</span>
              </div>
              <div className="ssh-meter-row">
                <span>🧠 {t('ssh.field.memory')}</span>
                <div className="ssh-meter">
                  <div className="ssh-meter-fill" style={{ width: `${systemInfo.memPercent}%`, background: systemInfo.memPercent > 80 ? '#e74c3c' : '#3498db' }} />
                </div>
                <span>{systemInfo.memUsed}/{systemInfo.memTotal} ({systemInfo.memPercent}%)</span>
              </div>
              <div className="ssh-meter-row">
                <span>💾 {t('ssh.field.disk')}</span>
                <div className="ssh-meter">
                  <div className="ssh-meter-fill" style={{ width: `${systemInfo.diskPercent}%`, background: systemInfo.diskPercent > 85 ? '#e74c3c' : '#2ecc71' }} />
                </div>
                <span>{systemInfo.diskUsed}/{systemInfo.diskTotal} ({systemInfo.diskPercent}%)</span>
              </div>
            </div>
          )}
          <button className="ssh-btn refresh" onClick={loadSystemInfo} disabled={loading}>
            🔄 {t('ssh.refresh')}
          </button>
        </div>
      )}

      {/* ── Logs ── */}
      {tab === 'logs' && activeServer && (
        <div className="ssh-logs-view">
          <div className="ssh-section-hint">{t('ssh.logsHint')}</div>
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
            <button className="ssh-btn refresh-sm" onClick={() => selectedProcess && loadLogs(selectedProcess)} disabled={loading || !selectedProcess}>
              🔄
            </button>
          </div>
          <pre className="ssh-logs-content">{logs || t('ssh.selectProcessHint')}</pre>
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
    setTesting(true);
    setTestResult(null);
    try {
      const result = await window.electronAPI.sshTestConnection({ host, port, username, authType, credential });
      setTestResult(result.success ? `✅ ${t('ssh.testSuccess')}` : `❌ ${result.error}`);
    } catch (e: any) {
      setTestResult(`❌ ${e.message}`);
    }
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
      <div className="ssh-form-title">{t('ssh.addServer')}</div>
      
      <label>{t('ssh.form.name')}</label>
      <input value={name} onChange={e => setName(e.target.value)} placeholder={t('ssh.form.namePlaceholder')} />
      
      <label>{t('ssh.form.host')}</label>
      <input value={host} onChange={e => setHost(e.target.value)} placeholder="192.168.1.100" />
      
      <div className="ssh-form-row">
        <div>
          <label>{t('ssh.form.port')}</label>
          <input type="number" value={port} onChange={e => setPort(parseInt(e.target.value) || 22)} />
        </div>
        <div>
          <label>{t('ssh.form.username')}</label>
          <input value={username} onChange={e => setUsername(e.target.value)} />
        </div>
      </div>
      
      <label>{t('ssh.form.authType')}</label>
      <div className="ssh-auth-toggle">
        <button className={authType === 'password' ? 'active' : ''} onClick={() => setAuthType('password')}>
          🔑 {t('ssh.form.password')}
        </button>
        <button className={authType === 'key' ? 'active' : ''} onClick={() => setAuthType('key')}>
          🔐 {t('ssh.form.sshKey')}
        </button>
      </div>
      
      <label>{authType === 'password' ? t('ssh.form.password') : t('ssh.form.privateKey')}</label>
      {authType === 'password' ? (
        <input type="password" value={credential} onChange={e => setCredential(e.target.value)} />
      ) : (
        <textarea
          value={credential}
          onChange={e => setCredential(e.target.value)}
          placeholder="-----BEGIN OPENSSH PRIVATE KEY-----&#10;..."
          rows={4}
        />
      )}
      
      {testResult && <div className="ssh-test-result">{testResult}</div>}
      
      <div className="ssh-form-actions">
        <button className="ssh-btn secondary" onClick={onCancel}>{t('ssh.form.cancel')}</button>
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
