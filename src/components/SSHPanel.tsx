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

type Tab = 'home' | 'status' | 'processes' | 'system' | 'logs' | 'servers' | 'guide';

interface SSHPanelProps {
  visible: boolean;
  onClose: () => void;
}

export const SSHPanel: React.FC<SSHPanelProps> = ({ visible, onClose }) => {
  const { t } = useTranslation();
  const [servers, setServers] = useState<SSHServer[]>([]);
  const [activeServer, setActiveServer] = useState<string | null>(null);
  const [tab, setTab] = useState<Tab>('home');
  const [showAddForm, setShowAddForm] = useState(false);
  const [connecting, setConnecting] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  // SSH data
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

  // ── Init ──
  useEffect(() => {
    if (visible) { loadServers(); }
    return () => { if (refreshRef.current) clearInterval(refreshRef.current); };
  }, [visible, loadServers]);

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

  // ── SSH handlers ──
  const handleConnect = async (serverId: string) => {
    setConnecting(serverId); setError(null);
    try {
      const r = await window.electronAPI.sshConnect(serverId);
      if (r.success) {
        setActiveServer(serverId); setTab('status');
        await loadServers(); await loadOpenClawStatus();
      } else { setError(r.error || t('ssh.connectFailed')); }
    } catch (e: any) { setError(e.message); }
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
    } catch (e: any) { setError(e.message); }
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
      {/* ── Header ── */}
      <div className="ssh-header">
        <button className="ssh-back-btn" onClick={onClose}>←</button>
        <span className="ssh-title">🖥️ {t('ssh.title')}</span>
        {activeServerObj && (
          <span className="ssh-connected-badge">🟢 {activeServerObj.name}</span>
        )}
        <button
          className={`ssh-guide-btn ${tab === 'guide' ? 'active' : ''}`}
          onClick={() => setTab(tab === 'guide' ? 'home' : 'guide')}
          title={t('ssh.guide.title')}
        >❓</button>
      </div>

      {/* ── Tab Navigation ── */}
      <div className="ssh-tabs">
        <button className={`ssh-tab ${tab === 'home' ? 'active' : ''}`} onClick={() => setTab('home')}>
          🏠
        </button>
        {activeServer && (
          <>
            <button className={`ssh-tab ${tab === 'status' ? 'active' : ''}`} onClick={() => handleTabChange('status')}>
              📊 {t('ssh.tab.status')}
            </button>
            <button className={`ssh-tab ${tab === 'processes' ? 'active' : ''}`} onClick={() => handleTabChange('processes')}>
              ⚙️ {t('ssh.tab.processes')}
            </button>
            <button className={`ssh-tab ${tab === 'system' ? 'active' : ''}`} onClick={() => handleTabChange('system')}>
              💻 {t('ssh.tab.system')}
            </button>
            <button className={`ssh-tab ${tab === 'logs' ? 'active' : ''}`} onClick={() => handleTabChange('logs')}>
              📜 {t('ssh.tab.logs')}
            </button>
          </>
        )}
      </div>

      {error && (
        <div className="ssh-error">
          {error}
          <button onClick={() => setError(null)}>✕</button>
        </div>
      )}

      {/* ━━━━━━━━ HOME TAB ━━━━━━━━ */}
      {tab === 'home' && (
        <div className="ssh-home">

          {/* ── SSH 服务器 ── */}
          <div className="ssh-card">
            <div className="ssh-card-header">
              <span className="ssh-card-title">{t('ssh.home.sshServers')}</span>
              <span className="ssh-card-badge">{servers.length > 0 ? `${connectedCount}/${servers.length}` : '0'}</span>
            </div>
            <div className="ssh-card-desc">{t('ssh.home.sshDesc')}</div>

            {servers.length > 0 ? (
              <div className="ssh-server-quick-list">
                {servers.map(s => (
                  <div key={s.id} className={`ssh-server-row ${s.isConnected ? 'connected' : ''}`}>
                    <div className="ssh-server-row-info">
                      <span className="ssh-server-dot">{s.isConnected ? '🟢' : (s.lastStatus === 'error' ? '🔴' : '⚫')}</span>
                      <div>
                        <div className="ssh-server-row-name">{s.name}</div>
                        <div className="ssh-server-row-host">{s.username}@{s.host}</div>
                      </div>
                    </div>
                    <div className="ssh-server-row-actions">
                      {s.isConnected ? (
                        <>
                          <button className="ssh-link-btn" onClick={() => { setActiveServer(s.id); handleTabChange('status'); }}>
                            {t('ssh.home.viewStatus')} →
                          </button>
                          <button className="ssh-link-btn danger" onClick={() => handleDisconnect(s.id)}>
                            {t('ssh.disconnect')}
                          </button>
                        </>
                      ) : (
                        <button
                          className="ssh-btn primary-sm"
                          onClick={() => handleConnect(s.id)}
                          disabled={connecting === s.id}
                        >
                          {connecting === s.id ? '⏳' : t('ssh.connect')}
                        </button>
                      )}
                      <button className="ssh-icon-btn" onClick={() => handleRemove(s.id)} title={t('ssh.remove')}>🗑️</button>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="ssh-empty-hint">{t('ssh.home.noServers')}</div>
            )}

            {!showAddForm ? (
              <button className="ssh-btn outline" onClick={() => setShowAddForm(true)}>
                + {t('ssh.addServer')}
              </button>
            ) : (
              <AddServerForm
                onAdd={async (data) => {
                  const r = await window.electronAPI.sshAddServer(data);
                  if (r.error) setError(r.error);
                  else { setShowAddForm(false); await loadServers(); }
                }}
                onCancel={() => setShowAddForm(false)}
              />
            )}
          </div>

          {/* ── Security note ── */}
          <div className="ssh-security-note">
            🔒 {t('ssh.home.securityNote')}
          </div>
        </div>
      )}

      {/* ━━━━━━━━ GUIDE TAB ━━━━━━━━ */}
      {tab === 'guide' && (
        <div className="ssh-guide">
          <div className="ssh-guide-title">{t('ssh.guide.title')}</div>

          {/* Guide 1: Data source */}
          <div className="ssh-guide-section">
            <div className="ssh-guide-num">1</div>
            <div className="ssh-guide-content">
              <div className="ssh-guide-heading">{t('ssh.guide.s1Title')}</div>
              <p>{t('ssh.guide.s1Desc')}</p>
              <div className="ssh-guide-comparison">
                <div className="ssh-guide-col">
                  <strong>🏠 {t('ssh.home.localMode')}</strong>
                  <ul>
                    <li>{t('ssh.guide.localP1')}</li>
                    <li>{t('ssh.guide.localP2')}</li>
                    <li>{t('ssh.guide.localP3')}</li>
                  </ul>
                </div>
                <div className="ssh-guide-col">
                  <strong>☁️ {t('ssh.home.cloudMode')}</strong>
                  <ul>
                    <li>{t('ssh.guide.cloudP1')}</li>
                    <li>{t('ssh.guide.cloudP2')}</li>
                    <li>{t('ssh.guide.cloudP3')}</li>
                  </ul>
                </div>
              </div>
            </div>
          </div>

          {/* Guide 2: Cloud Reporter */}
          <div className="ssh-guide-section">
            <div className="ssh-guide-num">2</div>
            <div className="ssh-guide-content">
              <div className="ssh-guide-heading">{t('ssh.guide.s2Title')}</div>
              <p>{t('ssh.guide.s2Desc')}</p>
              <div className="ssh-guide-steps">
                <div className="ssh-guide-step">
                  <span className="ssh-step-num">①</span>
                  <span>{t('ssh.guide.s2Step1')}</span>
                </div>
                <div className="ssh-guide-step">
                  <span className="ssh-step-num">②</span>
                  <span>{t('ssh.guide.s2Step2')}</span>
                </div>
                <div className="ssh-guide-step">
                  <span className="ssh-step-num">③</span>
                  <span>{t('ssh.guide.s2Step3')}</span>
                </div>
              </div>
            </div>
          </div>

          {/* Guide 3: SSH Direct */}
          <div className="ssh-guide-section">
            <div className="ssh-guide-num">3</div>
            <div className="ssh-guide-content">
              <div className="ssh-guide-heading">{t('ssh.guide.s3Title')}</div>
              <p>{t('ssh.guide.s3Desc')}</p>
              <div className="ssh-guide-features">
                <span>📊 {t('ssh.guide.feat1')}</span>
                <span>⚙️ {t('ssh.guide.feat2')}</span>
                <span>💻 {t('ssh.guide.feat3')}</span>
                <span>📜 {t('ssh.guide.feat4')}</span>
                <span>🔄 {t('ssh.guide.feat5')}</span>
              </div>
            </div>
          </div>

          {/* Guide 4: Security */}
          <div className="ssh-guide-section">
            <div className="ssh-guide-num">🔒</div>
            <div className="ssh-guide-content">
              <div className="ssh-guide-heading">{t('ssh.guide.s4Title')}</div>
              <ul className="ssh-guide-security-list">
                <li>{t('ssh.guide.sec1')}</li>
                <li>{t('ssh.guide.sec2')}</li>
                <li>{t('ssh.guide.sec3')}</li>
                <li>{t('ssh.guide.sec4')}</li>
                <li>{t('ssh.guide.sec5')}</li>
              </ul>
            </div>
          </div>

          <button className="ssh-btn primary" onClick={() => setTab('home')}>
            {t('ssh.guide.gotIt')}
          </button>
        </div>
      )}

      {/* ━━━━━━━━ STATUS TAB ━━━━━━━━ */}
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
                {remoteTokens && (
                  <>
                    <div className="ssh-status-row">
                      <span>{t('ssh.field.dailyTokens')}</span>
                      <span>{(remoteTokens.daily / 1e6).toFixed(1)}M</span>
                    </div>
                    <div className="ssh-status-row">
                      <span>{t('ssh.field.totalTokensScanned')}</span>
                      <span>{(remoteTokens.total / 1e6).toFixed(1)}M</span>
                    </div>
                  </>
                )}
                {openclawStatus.uptime && (
                  <div className="ssh-status-row">
                    <span>{t('ssh.field.uptime')}</span>
                    <span>{openclawStatus.uptime}</span>
                  </div>
                )}
              </div>
              {openclawStatus.error && <div className="ssh-error-inline">⚠️ {openclawStatus.error}</div>}
            </>
          )}
          <button className="ssh-btn refresh" onClick={loadOpenClawStatus} disabled={loading}>
            🔄 {t('ssh.refresh')}
          </button>
        </div>
      )}

      {/* ━━━━━━━━ PROCESSES TAB ━━━━━━━━ */}
      {tab === 'processes' && activeServer && (
        <div className="ssh-process-view">
          <div className="ssh-section-hint">{t('ssh.processHint')}</div>
          {loading && <div className="ssh-loading">{t('ssh.loading')}</div>}
          {processes.length > 0 && (
            <div className="ssh-process-summary">
              {t('ssh.processCount', { total: processes.length, online: processes.filter(p => p.status === 'online').length })}
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
                <button className="ssh-icon-btn" onClick={() => { setSelectedProcess(p.name); handleTabChange('logs'); loadLogs(p.name); }} title={t('ssh.viewLogs')}>📜</button>
                <button className="ssh-icon-btn" onClick={() => handleRestart(p.name)} title={t('ssh.restart')}>🔄</button>
              </div>
            </div>
          ))}
          {processes.length === 0 && !loading && <div className="ssh-empty">{t('ssh.noProcesses')}</div>}
          <button className="ssh-btn refresh" onClick={loadProcesses} disabled={loading}>🔄 {t('ssh.refresh')}</button>
        </div>
      )}

      {/* ━━━━━━━━ SYSTEM TAB ━━━━━━━━ */}
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
          <button className="ssh-btn refresh" onClick={loadSystemInfo} disabled={loading}>🔄 {t('ssh.refresh')}</button>
        </div>
      )}

      {/* ━━━━━━━━ LOGS TAB ━━━━━━━━ */}
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
            <button className="ssh-btn refresh-sm" onClick={() => selectedProcess && loadLogs(selectedProcess)} disabled={loading || !selectedProcess}>🔄</button>
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
    setTesting(true); setTestResult(null);
    try {
      const r = await window.electronAPI.sshTestConnection({ host, port, username, authType, credential });
      setTestResult(r.success ? `✅ ${t('ssh.testSuccess')}` : `❌ ${r.error}`);
    } catch (e: any) { setTestResult(`❌ ${e.message}`); }
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
        <textarea value={credential} onChange={e => setCredential(e.target.value)} placeholder="-----BEGIN OPENSSH PRIVATE KEY-----&#10;..." rows={4} />
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
