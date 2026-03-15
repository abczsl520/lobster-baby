import React, { useState, useEffect, useCallback, useRef } from 'react';
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

type Tab = 'servers' | 'status' | 'processes' | 'system' | 'logs';

export const SSHPanel: React.FC = () => {
  const [servers, setServers] = useState<SSHServer[]>([]);
  const [activeServer, setActiveServer] = useState<string | null>(null);
  const [tab, setTab] = useState<Tab>('servers');
  const [showAddForm, setShowAddForm] = useState(false);
  const [connecting, setConnecting] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  
  // Status data
  const [openclawStatus, setOpenclawStatus] = useState<any>(null);
  const [processes, setProcesses] = useState<ProcessInfo[]>([]);
  const [systemInfo, setSystemInfo] = useState<SystemInfo | null>(null);
  const [logs, setLogs] = useState<string>('');
  const [selectedProcess, setSelectedProcess] = useState<string>('');
  const [loading, setLoading] = useState(false);
  
  // Refresh timer
  const refreshRef = useRef<NodeJS.Timeout | null>(null);

  const loadServers = useCallback(async () => {
    const result = await window.electronAPI.sshGetServers();
    setServers(result);
  }, []);

  useEffect(() => {
    loadServers();
    return () => { if (refreshRef.current) clearInterval(refreshRef.current); };
  }, [loadServers]);

  // Auto-refresh when connected
  useEffect(() => {
    if (refreshRef.current) clearInterval(refreshRef.current);
    if (activeServer) {
      const refresh = async () => {
        if (tab === 'status') await loadOpenClawStatus();
        else if (tab === 'processes') await loadProcesses();
        else if (tab === 'system') await loadSystemInfo();
      };
      refreshRef.current = setInterval(refresh, 15000);
    }
    return () => { if (refreshRef.current) clearInterval(refreshRef.current); };
  }, [activeServer, tab]);

  const handleConnect = async (serverId: string) => {
    setConnecting(serverId);
    setError(null);
    const result = await window.electronAPI.sshConnect(serverId);
    if (result.success) {
      setActiveServer(serverId);
      setTab('status');
      await loadServers();
      await loadOpenClawStatus();
    } else {
      setError(result.error || 'Connection failed');
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
    const result = await window.electronAPI.sshOpenClawStatus(activeServer);
    setOpenclawStatus(result);
    setLoading(false);
  };

  const loadProcesses = async () => {
    if (!activeServer) return;
    setLoading(true);
    const result = await window.electronAPI.sshProcessList(activeServer);
    setProcesses(result);
    setLoading(false);
  };

  const loadSystemInfo = async () => {
    if (!activeServer) return;
    setLoading(true);
    const result = await window.electronAPI.sshSystemInfo(activeServer);
    setSystemInfo(result);
    setLoading(false);
  };

  const loadLogs = async (processName: string) => {
    if (!activeServer) return;
    setLoading(true);
    const result = await window.electronAPI.sshProcessLogs(activeServer, processName, 100);
    setLogs(result.logs || result.error || '');
    setLoading(false);
  };

  const handleRestart = async (processName: string) => {
    if (!activeServer || !confirm(`Restart ${processName}?`)) return;
    setLoading(true);
    const result = await window.electronAPI.sshRestartProcess(activeServer, processName);
    if (result.success) {
      setTimeout(loadProcesses, 2000);
    } else {
      setError(result.error || 'Restart failed');
    }
    setLoading(false);
  };

  const handleTabChange = async (newTab: Tab) => {
    setTab(newTab);
    if (newTab === 'status') await loadOpenClawStatus();
    else if (newTab === 'processes') await loadProcesses();
    else if (newTab === 'system') await loadSystemInfo();
  };

  const activeServerObj = servers.find(s => s.id === activeServer);

  return (
    <div className="ssh-panel">
      <div className="ssh-header">
        <span className="ssh-title">🖥️ Remote Control</span>
        {activeServerObj && (
          <span className="ssh-connected-badge">
            🟢 {activeServerObj.name}
          </span>
        )}
      </div>

      {/* Tab bar — only show when connected */}
      {activeServer && (
        <div className="ssh-tabs">
          {(['status', 'processes', 'system', 'logs', 'servers'] as Tab[]).map(t => (
            <button
              key={t}
              className={`ssh-tab ${tab === t ? 'active' : ''}`}
              onClick={() => handleTabChange(t)}
            >
              {t === 'status' && '📊'}
              {t === 'processes' && '⚙️'}
              {t === 'system' && '💻'}
              {t === 'logs' && '📜'}
              {t === 'servers' && '🔌'}
              {' '}{t.charAt(0).toUpperCase() + t.slice(1)}
            </button>
          ))}
        </div>
      )}

      {error && <div className="ssh-error">{error} <button onClick={() => setError(null)}>✕</button></div>}

      {/* Server list */}
      {tab === 'servers' && (
        <div className="ssh-server-list">
          {servers.map(s => (
            <div key={s.id} className={`ssh-server-card ${s.isConnected ? 'connected' : ''}`}>
              <div className="ssh-server-info">
                <div className="ssh-server-name">
                  {s.isConnected ? '🟢' : '⚫'} {s.name}
                </div>
                <div className="ssh-server-host">{s.username}@{s.host}:{s.port}</div>
              </div>
              <div className="ssh-server-actions">
                {s.isConnected ? (
                  <button className="ssh-btn danger-sm" onClick={() => handleDisconnect(s.id)}>
                    Disconnect
                  </button>
                ) : (
                  <button 
                    className="ssh-btn primary-sm" 
                    onClick={() => handleConnect(s.id)}
                    disabled={connecting === s.id}
                  >
                    {connecting === s.id ? '...' : 'Connect'}
                  </button>
                )}
                <button className="ssh-btn text-sm" onClick={() => handleRemove(s.id)}>🗑️</button>
              </div>
            </div>
          ))}

          {servers.length === 0 && !showAddForm && (
            <div className="ssh-empty">
              No servers configured yet
            </div>
          )}

          {!showAddForm ? (
            <button className="ssh-btn primary" onClick={() => setShowAddForm(true)}>
              + Add Server
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

      {/* OpenClaw Status */}
      {tab === 'status' && activeServer && (
        <div className="ssh-status-view">
          {loading && <div className="ssh-loading">Loading...</div>}
          {openclawStatus && (
            <>
              <div className="ssh-status-card">
                <div className="ssh-status-row">
                  <span>Status</span>
                  <span className={`ssh-status-badge ${openclawStatus.status === 'active' ? 'active' : 'inactive'}`}>
                    {openclawStatus.status || 'unknown'}
                  </span>
                </div>
                {openclawStatus.activeSessions !== undefined && (
                  <div className="ssh-status-row">
                    <span>Sessions</span>
                    <span>{openclawStatus.activeSessions}</span>
                  </div>
                )}
                {openclawStatus.totalTokens !== undefined && (
                  <div className="ssh-status-row">
                    <span>Total Tokens</span>
                    <span>{(openclawStatus.totalTokens / 1e6).toFixed(1)}M</span>
                  </div>
                )}
                {openclawStatus.uptime && (
                  <div className="ssh-status-row">
                    <span>Uptime</span>
                    <span>{openclawStatus.uptime}</span>
                  </div>
                )}
              </div>
              {openclawStatus.error && (
                <div className="ssh-error-inline">{openclawStatus.error}</div>
              )}
            </>
          )}
          <button className="ssh-btn refresh" onClick={loadOpenClawStatus} disabled={loading}>
            🔄 Refresh
          </button>
        </div>
      )}

      {/* Process list */}
      {tab === 'processes' && activeServer && (
        <div className="ssh-process-view">
          {loading && <div className="ssh-loading">Loading...</div>}
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
                <button className="ssh-btn text-sm" onClick={() => { setSelectedProcess(p.name); setTab('logs'); loadLogs(p.name); }}>
                  📜
                </button>
                <button className="ssh-btn warning-sm" onClick={() => handleRestart(p.name)}>
                  🔄
                </button>
              </div>
            </div>
          ))}
          {processes.length === 0 && !loading && (
            <div className="ssh-empty">No PM2 processes found</div>
          )}
          <button className="ssh-btn refresh" onClick={loadProcesses} disabled={loading}>
            🔄 Refresh
          </button>
        </div>
      )}

      {/* System info */}
      {tab === 'system' && activeServer && (
        <div className="ssh-system-view">
          {loading && <div className="ssh-loading">Loading...</div>}
          {systemInfo && (
            <div className="ssh-system-card">
              <div className="ssh-status-row">
                <span>🏠 Hostname</span>
                <span>{systemInfo.hostname}</span>
              </div>
              <div className="ssh-status-row">
                <span>⏱️ Uptime</span>
                <span>{systemInfo.uptime}</span>
              </div>
              <div className="ssh-status-row">
                <span>📊 Load</span>
                <span>{systemInfo.loadAvg}</span>
              </div>
              <div className="ssh-meter-row">
                <span>🧠 Memory</span>
                <div className="ssh-meter">
                  <div className="ssh-meter-fill" style={{ width: `${systemInfo.memPercent}%`, background: systemInfo.memPercent > 80 ? '#e74c3c' : '#3498db' }} />
                </div>
                <span>{systemInfo.memUsed}/{systemInfo.memTotal} ({systemInfo.memPercent}%)</span>
              </div>
              <div className="ssh-meter-row">
                <span>💾 Disk</span>
                <div className="ssh-meter">
                  <div className="ssh-meter-fill" style={{ width: `${systemInfo.diskPercent}%`, background: systemInfo.diskPercent > 85 ? '#e74c3c' : '#2ecc71' }} />
                </div>
                <span>{systemInfo.diskUsed}/{systemInfo.diskTotal} ({systemInfo.diskPercent}%)</span>
              </div>
            </div>
          )}
          <button className="ssh-btn refresh" onClick={loadSystemInfo} disabled={loading}>
            🔄 Refresh
          </button>
        </div>
      )}

      {/* Logs */}
      {tab === 'logs' && activeServer && (
        <div className="ssh-logs-view">
          <div className="ssh-logs-header">
            <select
              value={selectedProcess}
              onChange={(e) => { setSelectedProcess(e.target.value); if (e.target.value) loadLogs(e.target.value); }}
              className="ssh-select"
            >
              <option value="">Select process...</option>
              {processes.map(p => (
                <option key={p.name} value={p.name}>{p.name}</option>
              ))}
            </select>
            <button className="ssh-btn refresh-sm" onClick={() => selectedProcess && loadLogs(selectedProcess)} disabled={loading || !selectedProcess}>
              🔄
            </button>
          </div>
          <pre className="ssh-logs-content">{logs || 'Select a process to view logs'}</pre>
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
    const result = await window.electronAPI.sshTestConnection({ host, port, username, authType, credential });
    setTestResult(result.success ? '✅ Connected!' : `❌ ${result.error}`);
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
      <div className="ssh-form-title">Add Server</div>
      
      <label>Name</label>
      <input value={name} onChange={e => setName(e.target.value)} placeholder="My Cloud Server" />
      
      <label>Host</label>
      <input value={host} onChange={e => setHost(e.target.value)} placeholder="192.168.1.100" />
      
      <div className="ssh-form-row">
        <div>
          <label>Port</label>
          <input type="number" value={port} onChange={e => setPort(parseInt(e.target.value) || 22)} />
        </div>
        <div>
          <label>Username</label>
          <input value={username} onChange={e => setUsername(e.target.value)} />
        </div>
      </div>
      
      <label>Auth Type</label>
      <div className="ssh-auth-toggle">
        <button className={authType === 'password' ? 'active' : ''} onClick={() => setAuthType('password')}>
          🔑 Password
        </button>
        <button className={authType === 'key' ? 'active' : ''} onClick={() => setAuthType('key')}>
          🔐 SSH Key
        </button>
      </div>
      
      <label>{authType === 'password' ? 'Password' : 'Private Key (paste content)'}</label>
      {authType === 'password' ? (
        <input type="password" value={credential} onChange={e => setCredential(e.target.value)} />
      ) : (
        <textarea
          value={credential}
          onChange={e => setCredential(e.target.value)}
          placeholder="-----BEGIN OPENSSH PRIVATE KEY-----\n..."
          rows={4}
        />
      )}
      
      {testResult && <div className="ssh-test-result">{testResult}</div>}
      
      <div className="ssh-form-actions">
        <button className="ssh-btn secondary" onClick={onCancel}>Cancel</button>
        <button className="ssh-btn secondary" onClick={handleTest} disabled={testing || !host || !username || !credential}>
          {testing ? 'Testing...' : 'Test Connection'}
        </button>
        <button className="ssh-btn primary" onClick={handleSubmit} disabled={saving || !name || !host || !username || !credential}>
          {saving ? 'Saving...' : 'Save'}
        </button>
      </div>
    </div>
  );
};
