import React, { useState, useEffect, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
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
  const [lbType, setLbType] = useState('tokens');
  const [lbData, setLbData] = useState<any>(null);
  const [lbPage, setLbPage] = useState(1);
  const [pkCode, setPkCode] = useState('');
  const [pkResult, setPkResult] = useState<any>(null);
  const [myPkCode, setMyPkCode] = useState('');
  const [nickname, setNickname] = useState('');
  const [privacyAgreed, setPrivacyAgreed] = useState(false);
  const [profile, setProfile] = useState<any>(null);
  const [stats, setStats] = useState<any>(null);
  const { t } = useTranslation();

  const loadLocal = useCallback(async () => {
    const data = await window.electronAPI.socialGetLocal();
    setLocalData(data);
  }, []);

  useEffect(() => {
    if (visible) { loadLocal(); loadStats(); }
    // Auto-refresh stats every 30s when visible
    if (!visible) return;
    const interval = setInterval(loadStats, 30000);
    return () => clearInterval(interval);
  }, [visible, loadLocal]);

  useEffect(() => {
    if (view === 'profile' && !profile && !loading) loadProfile();
  }, [view]);

  const loadStats = async () => {
    const s = await window.electronAPI.socialStats();
    if (!s.error) setStats(s);
  };

  const handleRegister = async () => {
    if (!nickname.trim()) { setError(t('social.nicknameMinLength')); return; }
    if (nickname.trim().length < 2) { setError(t('social.nicknameMinLength')); return; }
    if (!privacyAgreed) { setError(t('social.agreePrivacy')); return; }
    setLoading(true); setError('');
    const result = await window.electronAPI.socialRegister(nickname.trim());
    setLoading(false);
    if (result.error) { setError(result.error); }
    else { setLocalData({ lobsterId: result.lobster_id, nickname: nickname.trim(), hasToken: true }); setView('home'); }
  };

  const loadLeaderboard = async (type?: string, page?: number) => {
    const tp = type || lbType; const p = page || 1;
    setLoading(true); setError('');
    const data = await window.electronAPI.socialLeaderboard(tp, p);
    setLoading(false);
    if (data.error) { setError(data.error); }
    else { setLbData(data); setLbType(tp); setLbPage(p); }
  };

  const handleCreatePK = async () => {
    setLoading(true); setError('');
    const result = await window.electronAPI.socialPKCreate();
    setLoading(false);
    if (result.error) { setError(result.error); } else { setMyPkCode(result.pk_code); }
  };

  const handleJoinPK = async () => {
    if (!pkCode.trim() || pkCode.trim().length !== 6) { setError(t('social.pkCodeRequired')); return; }
    setLoading(true); setError('');
    const result = await window.electronAPI.socialPKJoin(pkCode.trim().toUpperCase());
    setLoading(false);
    if (result.error) { setError(result.error); } else { setPkResult(result.result); }
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
    if (!result.error) { setLocalData({ lobsterId: null, nickname: null, hasToken: false }); setView('home'); }
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
      <div className="social-panel" role="dialog" aria-label="Social Panel">
        <div className="social-header">
          <button className="social-back" onClick={() => { setError(''); setView('home'); }}>←</button>
          <h3>{t('social.registerTitle')}</h3>
        </div>
        <div className="social-body">
          <div className="register-form">
            <div className="form-group">
              <label>{t('social.nicknamePlaceholder')}</label>
              <input type="text" value={nickname} onChange={(e) => setNickname(e.target.value)} placeholder={t('social.namePlaceholder')} maxLength={20} className="social-input" />
            </div>
            <div className="privacy-section">
              <label className="privacy-check">
                <input type="checkbox" checked={privacyAgreed} onChange={(e) => setPrivacyAgreed(e.target.checked)} />
                <span>{t('social.privacyAgree')}</span>
                <a className="privacy-link" onClick={() => setError(t('social.privacyNote'))}>{t('social.privacyLink')}</a>
              </label>
            </div>
            {error && <div className="social-error">{error}</div>}
            <button className="social-btn primary" onClick={handleRegister} disabled={loading}>
              {loading ? t('social.registering') : t('social.registerAction')}
            </button>
            <div className="register-note">{t('social.registerNote')}</div>
          </div>
        </div>
      </div>
    );
  }

  // ─── Leaderboard View ───
  if (view === 'leaderboard') {
    return (
      <div className="social-panel" role="dialog" aria-label="Social Panel">
        <div className="social-header">
          <button className="social-back" onClick={() => { setError(''); setView('home'); }}>←</button>
          <h3>{t('social.leaderboardTitle')}</h3>
        </div>
        <div className="social-body">
          {localData.hasToken && (
            <div className="lb-visibility-toggle">
              <span>{t('social.joinLeaderboard')}</span>
              <label className="toggle-switch">
                <input type="checkbox" checked={profile?.show_on_leaderboard ?? true} onChange={handleToggleLeaderboard} disabled={loading} />
                <span className="toggle-slider" />
              </label>
            </div>
          )}
          <div className="lb-tabs">
            {[
              { key: 'tokens', label: t('social.lbTokens') },
              { key: 'level', label: t('social.lbLevel') },
              { key: 'streak', label: t('social.lbStreak') },
              { key: 'achievements', label: t('social.lbAchievements') },
            ].map(tab => (
              <button key={tab.key} className={`lb-tab ${lbType === tab.key ? 'active' : ''}`} onClick={() => loadLeaderboard(tab.key)}>{tab.label}</button>
            ))}
          </div>
          {loading && <div className="social-loading">{t('social.loading')}</div>}
          {error && !loading && <div className="social-error">{error}</div>}
          {lbData && !loading && (
            <div className="lb-list">
              {lbData.items?.length === 0 && <div className="lb-empty">{t('social.lbEmpty')}</div>}
              {lbData.items?.map((item: { lobster_id: string; nickname: string; rank: number; total_tokens?: number; level?: number; streak_days?: number; achievements?: number }) => (
                <div key={item.lobster_id} className={`lb-item ${item.lobster_id === localData.lobsterId ? 'me' : ''}`}>
                  <span className="lb-rank">{item.rank <= 3 ? ['🥇', '🥈', '🥉'][item.rank - 1] : `#${item.rank}`}</span>
                  <span className="lb-name">
                    <span className="lb-nickname">{item.nickname}</span>
                    <span className="lb-id">{item.lobster_id}</span>
                  </span>
                  <span className="lb-value">
                    {lbType === 'tokens' ? formatTokens(item.total_tokens ?? 0) :
                     lbType === 'streak' ? t('social.streakDays', { days: item.streak_days ?? 0 }) :
                     lbType === 'achievements' ? t('social.achievementCount', { count: item.achievements ?? 0 }) :
                     `Lv.${item.level}`}
                  </span>
                </div>
              ))}
              {lbData.my_rank && <div className="lb-my-rank">{t('social.myRank', { rank: lbData.my_rank })}</div>}
              <div className="lb-pagination">
                <button className="social-btn small" disabled={lbPage <= 1} onClick={() => loadLeaderboard(lbType, lbPage - 1)}>{t('social.prevPage')}</button>
                <span className="lb-page-info">{t('social.pageInfo', { page: lbPage })}</span>
                <button className="social-btn small" disabled={!lbData.items || lbData.items.length < 20} onClick={() => loadLeaderboard(lbType, lbPage + 1)}>{t('social.nextPage')}</button>
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
      <div className="social-panel" role="dialog" aria-label="Social Panel">
        <div className="social-header">
          <button className="social-back" onClick={() => { setError(''); setView('home'); setPkResult(null); setMyPkCode(''); setPkCode(''); }}>←</button>
          <h3>{t('social.pkTitle')}</h3>
        </div>
        <div className="social-body">
          {pkResult ? (
            <div className="pk-result">
              <div className={`pk-winner ${pkResult.winner === 'draw' ? 'draw' : ''}`}>
                {pkResult.winner === 'draw' ? t('social.pkDraw') :
                 (pkResult.winner === 'creator' && pkResult.creator.lobster_id === localData.lobsterId) ||
                 (pkResult.winner === 'challenger' && pkResult.challenger.lobster_id === localData.lobsterId)
                   ? t('social.pkWin') : t('social.pkLose')}
              </div>
              <div className="pk-compare">
                <div className="pk-side">
                  <div className="pk-name">{pkResult.creator.nickname}</div>
                  <div className="pk-score">{pkResult.creator.score}</div>
                  <div className="pk-detail">
                    <div>{t('social.pkLevelLabel')}: {pkResult.creator.breakdown.level.score}/{pkResult.creator.breakdown.level.max}</div>
                    <div>{t('social.pkTokenLabel')}: {pkResult.creator.breakdown.tokens.score}/{pkResult.creator.breakdown.tokens.max}</div>
                    <div>{t('social.pkAchLabel')}: {pkResult.creator.breakdown.achievements.score}/{pkResult.creator.breakdown.achievements.max}</div>
                    <div>{t('social.pkOnlineLabel')}: {pkResult.creator.breakdown.online_days.score}/{pkResult.creator.breakdown.online_days.max}</div>
                  </div>
                </div>
                <div className="pk-vs">VS</div>
                <div className="pk-side">
                  <div className="pk-name">{pkResult.challenger.nickname}</div>
                  <div className="pk-score">{pkResult.challenger.score}</div>
                  <div className="pk-detail">
                    <div>{t('social.pkLevelLabel')}: {pkResult.challenger.breakdown.level.score}/{pkResult.challenger.breakdown.level.max}</div>
                    <div>{t('social.pkTokenLabel')}: {pkResult.challenger.breakdown.tokens.score}/{pkResult.challenger.breakdown.tokens.max}</div>
                    <div>{t('social.pkAchLabel')}: {pkResult.challenger.breakdown.achievements.score}/{pkResult.challenger.breakdown.achievements.max}</div>
                    <div>{t('social.pkOnlineLabel')}: {pkResult.challenger.breakdown.online_days.score}/{pkResult.challenger.breakdown.online_days.max}</div>
                  </div>
                </div>
              </div>
              <button className="social-btn primary" onClick={() => { setPkResult(null); setMyPkCode(''); setPkCode(''); }}>{t('social.pkPlayAgain')}</button>
            </div>
          ) : (
            <div className="pk-actions">
              <div className="pk-section">
                <h4>{t('social.pkCreateTitle')}</h4>
                <p>{t('social.pkCreateDesc')}</p>
                {myPkCode ? (
                  <div className="pk-code-display">
                    <span className="pk-code-text">{myPkCode}</span>
                    <div className="pk-code-hint">{t('social.pkCodeHint')}</div>
                  </div>
                ) : (
                  <button className="social-btn primary" onClick={handleCreatePK} disabled={loading}>
                    {loading ? t('social.pkGenerating') : t('social.pkGenerate')}
                  </button>
                )}
              </div>
              <div className="pk-divider">{t('social.pkOr')}</div>
              <div className="pk-section">
                <h4>{t('social.pkJoinTitle')}</h4>
                <p>{t('social.pkJoinDesc')}</p>
                <div className="pk-join-form">
                  <input type="text" value={pkCode} onChange={(e) => setPkCode(e.target.value.toUpperCase())} placeholder={t('social.pkCodePlaceholder')} maxLength={6} className="social-input pk-input" />
                  <button className="social-btn primary" onClick={handleJoinPK} disabled={loading || pkCode.length !== 6}>
                    {loading ? t('social.pkMatching') : t('social.pkJoinBtn')}
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
      <div className="social-panel" role="dialog" aria-label="Social Panel">
        <div className="social-header">
          <button className="social-back" onClick={() => { setError(''); setView('home'); }}>←</button>
          <h3>{t('social.profileTitle')}</h3>
        </div>
        <div className="social-body">
          {loading && <div className="social-loading">{t('social.loading')}</div>}
          {profile && (
            <div className="profile-info">
              <div className="profile-id">{profile.lobster_id}</div>
              <div className="profile-name">{profile.nickname}</div>
              <div className="profile-stats">
                <div className="profile-stat">
                  <span className="stat-value">Lv.{profile.level}</span>
                  <span className="stat-label">{t('social.level')}</span>
                </div>
                <div className="profile-stat">
                  <span className="stat-value">{formatTokens(profile.total_tokens)}</span>
                  <span className="stat-label">{t('social.tokens')}</span>
                </div>
                <div className="profile-stat">
                  <span className="stat-value">{profile.online_days}</span>
                  <span className="stat-label">{t('social.onlineDays')}</span>
                </div>
                <div className="profile-stat">
                  <span className="stat-value">{profile.streak_days}</span>
                  <span className="stat-label">{t('social.streakLabel')}</span>
                </div>
              </div>
              <div className="profile-toggle">
                <span>{t('social.showOnLeaderboard')}</span>
                <label className="toggle-switch">
                  <input type="checkbox" checked={profile.show_on_leaderboard} onChange={handleToggleLeaderboard} />
                  <span className="toggle-slider" />
                </label>
              </div>
              <button className="social-btn danger" onClick={handleDeleteAccount} disabled={loading}>{t('social.deleteAccount')}</button>
            </div>
          )}
        </div>
      </div>
    );
  }

  // ─── Home View ───
  return (
    <div className="social-panel" role="dialog" aria-label="Social Panel">
      <div className="social-header">
        <button className="social-back" onClick={onClose} aria-label="Back">←</button>
        <h3>{t('social.communityTitle')}</h3>
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
                <span className="menu-text">{t('social.menuLeaderboard')}</span>
                <span className="menu-arrow">›</span>
              </button>
              <button className="social-menu-item" onClick={() => setView('pk')}>
                <span className="menu-icon">⚔️</span>
                <span className="menu-text">{t('social.menuPK')}</span>
                <span className="menu-arrow">›</span>
              </button>
              <button className="social-menu-item" onClick={() => { loadProfile(); setView('profile'); }}>
                <span className="menu-icon">👤</span>
                <span className="menu-text">{t('social.menuProfile')}</span>
                <span className="menu-arrow">›</span>
              </button>
            </div>
          </>
        ) : (
          <div className="social-unregistered">
            <div className="unregistered-icon">🦞</div>
            <div className="unregistered-text"><p>{t('social.unregisteredText')}</p></div>
            <button className="social-btn primary" onClick={() => setView('register')}>{t('social.registerCommunity')}</button>
          </div>
        )}
        {stats && (
          <div className="social-stats-card">
            <div className="social-stat-item">
              <span className="social-stat-value">{stats.total_users ?? 0}</span>
              <span className="social-stat-label">🦞 {t('social.statLobsters')}</span>
            </div>
            <div className="social-stat-item">
              <span className="social-stat-value">{stats.active_24h ?? 0}</span>
              <span className="social-stat-label">🟢 {t('social.statActive')}</span>
            </div>
            <div className="social-stat-item">
              <span className="social-stat-value">{stats.total_pks ?? 0}</span>
              <span className="social-stat-label">⚔️ {t('social.statPKs')}</span>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

