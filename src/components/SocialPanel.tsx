import React, { useState, useEffect, useCallback } from 'react';
import './SocialPanel.css';

type SocialView = 'home' | 'register' | 'leaderboard' | 'pk' | 'profile';

interface SocialPanelProps {
  visible: boolean;
  onClose: () => void;
}

export const SocialPanel: React.FC<SocialPanelProps> = ({ visible, onClose }) => {
  const [view, setView] = useState<SocialView>('home');
  const [localData, setLocalData] = useState<{ lobsterId: string | null; nickname: string | null; hasToken: boolean }>({ lobsterId: null, nickname: null, hasToken: false });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  // Leaderboard state
  const [lbType, setLbType] = useState('tokens');
  const [lbData, setLbData] = useState<any>(null);
  const [lbPage, setLbPage] = useState(1);

  // PK state
  const [pkCode, setPkCode] = useState('');
  const [pkResult, setPkResult] = useState<any>(null);
  const [myPkCode, setMyPkCode] = useState('');

  // Register state
  const [nickname, setNickname] = useState('');
  const [privacyAgreed, setPrivacyAgreed] = useState(false);

  // Profile state
  const [profile, setProfile] = useState<any>(null);
  const [stats, setStats] = useState<any>(null);

  const loadLocal = useCallback(async () => {
    const data = await window.electronAPI.socialGetLocal();
    setLocalData(data);
  }, []);

  useEffect(() => {
    if (visible) {
      loadLocal();
      loadStats();
    }
  }, [visible, loadLocal]);

  // Load profile when switching to profile view
  useEffect(() => {
    if (view === 'profile' && !profile && !loading) {
      loadProfile();
    }
  }, [view]);

  const loadStats = async () => {
    const s = await window.electronAPI.socialStats();
    if (!s.error) setStats(s);
  };

  const handleRegister = async () => {
    if (!nickname.trim()) { setError('请输入昵称'); return; }
    if (nickname.trim().length < 2) { setError('昵称至少2个字符'); return; }
    if (!privacyAgreed) { setError('请同意隐私协议'); return; }
    setLoading(true);
    setError('');
    const result = await window.electronAPI.socialRegister(nickname.trim());
    setLoading(false);
    if (result.error) {
      setError(result.error);
    } else {
      setLocalData({ lobsterId: result.lobster_id, nickname: nickname.trim(), hasToken: true });
      setView('home');
    }
  };

  const loadLeaderboard = async (type?: string, page?: number) => {
    const t = type || lbType;
    const p = page || 1;
    setLoading(true);
    setError('');
    const data = await window.electronAPI.socialLeaderboard(t, p);
    setLoading(false);
    if (data.error) {
      setError(data.error);
    } else {
      setLbData(data);
      setLbType(t);
      setLbPage(p);
    }
  };

  const handleCreatePK = async () => {
    setLoading(true);
    setError('');
    const result = await window.electronAPI.socialPKCreate();
    setLoading(false);
    if (result.error) {
      setError(result.error);
    } else {
      setMyPkCode(result.pk_code);
    }
  };

  const handleJoinPK = async () => {
    if (!pkCode.trim() || pkCode.trim().length !== 6) { setError('请输入6位PK码'); return; }
    setLoading(true);
    setError('');
    const result = await window.electronAPI.socialPKJoin(pkCode.trim().toUpperCase());
    setLoading(false);
    if (result.error) {
      setError(result.error);
    } else {
      setPkResult(result.result);
    }
  };

  const loadProfile = async () => {
    setLoading(true);
    const data = await window.electronAPI.socialProfile();
    setLoading(false);
    if (!data.error) setProfile(data);
  };

  const handleToggleLeaderboard = async () => {
    if (!profile) return;
    setLoading(true);
    await window.electronAPI.socialUpdateProfile({ show_on_leaderboard: !profile.show_on_leaderboard });
    await loadProfile();
    setLoading(false);
  };

  const handleDeleteAccount = async () => {
    setLoading(true);
    const result = await window.electronAPI.socialDeleteAccount();
    setLoading(false);
    if (!result.error) {
      setLocalData({ lobsterId: null, nickname: null, hasToken: false });
      setView('home');
    }
  };

  if (!visible) return null;

  const formatTokens = (n: number) => {
    if (n >= 1e9) return (n / 1e9).toFixed(1) + 'B';
    if (n >= 1e6) return (n / 1e6).toFixed(1) + 'M';
    if (n >= 1e3) return (n / 1e3).toFixed(0) + 'K';
    return String(n);
  };

  // ─── Register View ───
  if (view === 'register') {
    return (
      <div className="social-panel">
        <div className="social-header">
          <button className="social-back" onClick={() => { setError(''); setView('home'); }}>←</button>
          <h3>🦞 注册龙虾社区</h3>
        </div>
        <div className="social-body">
          <div className="register-form">
            <div className="form-group">
              <label>给你的龙虾起个名字</label>
              <input
                type="text"
                value={nickname}
                onChange={(e) => setNickname(e.target.value)}
                placeholder="2-20个字符"
                maxLength={20}
                className="social-input"
              />
            </div>

            <div className="privacy-section">
              <label className="privacy-check">
                <input
                  type="checkbox"
                  checked={privacyAgreed}
                  onChange={(e) => setPrivacyAgreed(e.target.checked)}
                />
                <span>我同意</span>
                <a className="privacy-link" onClick={() => setError('仅收集昵称、等级、token数。不收集IP、文件、对话内容。设备指纹为不可逆哈希。')}>
                  隐私协议
                </a>
              </label>
            </div>

            {error && <div className="social-error">{error}</div>}

            <button
              className="social-btn primary"
              onClick={handleRegister}
              disabled={loading}
            >
              {loading ? '注册中...' : '🦞 注册'}
            </button>

            <div className="register-note">
              注册后可以查看排行榜、和其他龙虾PK
            </div>
          </div>
        </div>
      </div>
    );
  }

  // ─── Leaderboard View ───
  if (view === 'leaderboard') {
    return (
      <div className="social-panel">
        <div className="social-header">
          <button className="social-back" onClick={() => { setError(''); setView('home'); }}>←</button>
          <h3>🏆 排行榜</h3>
        </div>
        <div className="social-body">
          {/* Leaderboard visibility toggle */}
          {localData.hasToken && (
            <div className="lb-visibility-toggle">
              <span>参与排行榜</span>
              <label className="toggle-switch">
                <input
                  type="checkbox"
                  checked={profile?.show_on_leaderboard ?? true}
                  onChange={handleToggleLeaderboard}
                  disabled={loading}
                />
                <span className="toggle-slider" />
              </label>
            </div>
          )}

          <div className="lb-tabs">
            {[
              { key: 'tokens', label: '💰 Token' },
              { key: 'level', label: '⭐ 等级' },
              { key: 'streak', label: '🔥 连续' },
              { key: 'achievements', label: '🏅 成就' },
            ].map(t => (
              <button
                key={t.key}
                className={`lb-tab ${lbType === t.key ? 'active' : ''}`}
                onClick={() => loadLeaderboard(t.key)}
              >
                {t.label}
              </button>
            ))}
          </div>

          {loading && <div className="social-loading">加载中...</div>}
          {error && !loading && <div className="social-error">{error}</div>}

          {lbData && !loading && (
            <div className="lb-list">
              {lbData.items?.length === 0 && (
                <div className="lb-empty">还没有人上榜，快去注册吧~</div>
              )}
              {lbData.items?.map((item: any) => (
                <div key={item.lobster_id} className={`lb-item ${item.lobster_id === localData.lobsterId ? 'me' : ''}`}>
                  <span className="lb-rank">
                    {item.rank <= 3 ? ['🥇', '🥈', '🥉'][item.rank - 1] : `#${item.rank}`}
                  </span>
                  <span className="lb-name">
                    <span className="lb-nickname">{item.nickname}</span>
                    <span className="lb-id">{item.lobster_id}</span>
                  </span>
                  <span className="lb-value">
                    {lbType === 'tokens' ? formatTokens(item.total_tokens) :
                     lbType === 'streak' ? `${item.streak_days}天` :
                     lbType === 'achievements' ? `${item.achievements}个` :
                     `Lv.${item.level}`}
                  </span>
                </div>
              ))}

              {lbData.my_rank && (
                <div className="lb-my-rank">我的排名: #{lbData.my_rank}</div>
              )}

              <div className="lb-pagination">
                <button className="social-btn small" disabled={lbPage <= 1} onClick={() => loadLeaderboard(lbType, lbPage - 1)}>上一页</button>
                <span className="lb-page-info">第 {lbPage} 页</span>
                <button className="social-btn small" disabled={!lbData.items || lbData.items.length < 20} onClick={() => loadLeaderboard(lbType, lbPage + 1)}>下一页</button>
              </div>
            </div>
          )}
        </div>
      </div>
    );
  }

  // ─── PK View ───
  if (view === 'pk') {
    return (
      <div className="social-panel">
        <div className="social-header">
          <button className="social-back" onClick={() => { setError(''); setView('home'); setPkResult(null); setMyPkCode(''); setPkCode(''); }}>←</button>
          <h3>⚔️ PK 对战</h3>
        </div>
        <div className="social-body">
          {pkResult ? (
            <div className="pk-result">
              <div className={`pk-winner ${pkResult.winner === 'draw' ? 'draw' : ''}`}>
                {pkResult.winner === 'draw' ? '🤝 平局！' :
                 (pkResult.winner === 'creator' && pkResult.creator.lobster_id === localData.lobsterId) ||
                 (pkResult.winner === 'challenger' && pkResult.challenger.lobster_id === localData.lobsterId)
                   ? '🎉 你赢了！' : '😢 你输了...'}
              </div>

              <div className="pk-compare">
                <div className="pk-side">
                  <div className="pk-name">{pkResult.creator.nickname}</div>
                  <div className="pk-score">{pkResult.creator.score}分</div>
                  <div className="pk-detail">
                    <div>等级: {pkResult.creator.breakdown.level.score}/{pkResult.creator.breakdown.level.max}</div>
                    <div>Token: {pkResult.creator.breakdown.tokens.score}/{pkResult.creator.breakdown.tokens.max}</div>
                    <div>成就: {pkResult.creator.breakdown.achievements.score}/{pkResult.creator.breakdown.achievements.max}</div>
                    <div>在线: {pkResult.creator.breakdown.online_days.score}/{pkResult.creator.breakdown.online_days.max}</div>
                  </div>
                </div>
                <div className="pk-vs">VS</div>
                <div className="pk-side">
                  <div className="pk-name">{pkResult.challenger.nickname}</div>
                  <div className="pk-score">{pkResult.challenger.score}分</div>
                  <div className="pk-detail">
                    <div>等级: {pkResult.challenger.breakdown.level.score}/{pkResult.challenger.breakdown.level.max}</div>
                    <div>Token: {pkResult.challenger.breakdown.tokens.score}/{pkResult.challenger.breakdown.tokens.max}</div>
                    <div>成就: {pkResult.challenger.breakdown.achievements.score}/{pkResult.challenger.breakdown.achievements.max}</div>
                    <div>在线: {pkResult.challenger.breakdown.online_days.score}/{pkResult.challenger.breakdown.online_days.max}</div>
                  </div>
                </div>
              </div>

              <button className="social-btn primary" onClick={() => { setPkResult(null); setMyPkCode(''); setPkCode(''); }}>
                再来一局
              </button>
            </div>
          ) : (
            <div className="pk-actions">
              <div className="pk-section">
                <h4>发起 PK</h4>
                <p>生成PK码，分享给朋友</p>
                {myPkCode ? (
                  <div className="pk-code-display">
                    <span className="pk-code-text">{myPkCode}</span>
                    <div className="pk-code-hint">5分钟内有效，分享给朋友输入</div>
                  </div>
                ) : (
                  <button className="social-btn primary" onClick={handleCreatePK} disabled={loading}>
                    {loading ? '生成中...' : '⚔️ 生成PK码'}
                  </button>
                )}
              </div>

              <div className="pk-divider">— 或者 —</div>

              <div className="pk-section">
                <h4>加入 PK</h4>
                <p>输入朋友的PK码</p>
                <div className="pk-join-form">
                  <input
                    type="text"
                    value={pkCode}
                    onChange={(e) => setPkCode(e.target.value.toUpperCase())}
                    placeholder="输入6位PK码"
                    maxLength={6}
                    className="social-input pk-input"
                  />
                  <button className="social-btn primary" onClick={handleJoinPK} disabled={loading || pkCode.length !== 6}>
                    {loading ? '匹配中...' : '加入'}
                  </button>
                </div>
              </div>

              {error && <div className="social-error">{error}</div>}
            </div>
          )}
        </div>
      </div>
    );
  }

  // ─── Profile View ───
  if (view === 'profile') {
    return (
      <div className="social-panel">
        <div className="social-header">
          <button className="social-back" onClick={() => { setError(''); setView('home'); }}>←</button>
          <h3>👤 我的资料</h3>
        </div>
        <div className="social-body">
          {loading && <div className="social-loading">加载中...</div>}
          {profile && (
            <div className="profile-info">
              <div className="profile-id">{profile.lobster_id}</div>
              <div className="profile-name">{profile.nickname}</div>

              <div className="profile-stats">
                <div className="profile-stat">
                  <span className="stat-value">Lv.{profile.level}</span>
                  <span className="stat-label">等级</span>
                </div>
                <div className="profile-stat">
                  <span className="stat-value">{formatTokens(profile.total_tokens)}</span>
                  <span className="stat-label">Token</span>
                </div>
                <div className="profile-stat">
                  <span className="stat-value">{profile.online_days}</span>
                  <span className="stat-label">在线天数</span>
                </div>
                <div className="profile-stat">
                  <span className="stat-value">{profile.streak_days}</span>
                  <span className="stat-label">连续天数</span>
                </div>
              </div>

              <div className="profile-toggle">
                <span>显示在排行榜</span>
                <label className="toggle-switch">
                  <input
                    type="checkbox"
                    checked={profile.show_on_leaderboard}
                    onChange={handleToggleLeaderboard}
                  />
                  <span className="toggle-slider" />
                </label>
              </div>

              <button className="social-btn danger" onClick={handleDeleteAccount} disabled={loading}>
                注销账号
              </button>
            </div>
          )}
        </div>
      </div>
    );
  }

  // ─── Home View ───
  return (
    <div className="social-panel">
      <div className="social-header">
        <button className="social-back" onClick={onClose}>←</button>
        <h3>🌐 龙虾社区</h3>
      </div>
      <div className="social-body">
        {localData.hasToken ? (
          <>
            <div className="social-welcome">
              <span className="welcome-id">{localData.lobsterId}</span>
              <span className="welcome-name">{localData.nickname}</span>
            </div>

            <div className="social-menu">
              <button className="social-menu-item" onClick={() => { loadLeaderboard(); if (!profile) loadProfile(); setView('leaderboard'); }}>
                <span className="menu-icon">🏆</span>
                <span className="menu-text">排行榜</span>
                <span className="menu-arrow">›</span>
              </button>
              <button className="social-menu-item" onClick={() => setView('pk')}>
                <span className="menu-icon">⚔️</span>
                <span className="menu-text">PK 对战</span>
                <span className="menu-arrow">›</span>
              </button>
              <button className="social-menu-item" onClick={() => { loadProfile(); setView('profile'); }}>
                <span className="menu-icon">👤</span>
                <span className="menu-text">我的资料</span>
                <span className="menu-arrow">›</span>
              </button>
            </div>
          </>
        ) : (
          <div className="social-unregistered">
            <div className="unregistered-icon">🦞</div>
            <div className="unregistered-text">
              <p>加入龙虾社区，和其他龙虾主人比拼！</p>
            </div>
            <button className="social-btn primary" onClick={() => setView('register')}>
              🦞 注册社区
            </button>
          </div>
        )}

        {stats && (
          <div className="social-stats-bar">
            <span>🦞 {stats.total_users} 只龙虾</span>
            <span>🟢 {stats.active_24h} 活跃</span>
            <span>⚔️ {stats.total_pks} 场PK</span>
          </div>
        )}
      </div>
    </div>
  );
};
