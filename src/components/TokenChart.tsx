import React, { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { formatTokens } from '../utils/levels';
import './TokenChart.css';

interface TokenChartProps {
  visible: boolean;
}

export const TokenChart: React.FC<TokenChartProps> = ({ visible }) => {
  const { t } = useTranslation();
  const [dailyData, setDailyData] = useState<Record<string, number>>({});
  const [animated, setAnimated] = useState(false);

  useEffect(() => {
    if (!visible) { setAnimated(false); return; }
    window.electronAPI.getDailyTokens().then(data => {
      setDailyData(data);
      // Trigger animation after data loads
      requestAnimationFrame(() => setTimeout(() => setAnimated(true), 50));
    });
  }, [visible]);

  if (!visible) return null;

  const today = new Date();
  const days: { label: string; date: string; tokens: number; isToday: boolean }[] = [];
  for (let i = 6; i >= 0; i--) {
    const d = new Date(today);
    d.setDate(d.getDate() - i);
    const dateStr = d.toISOString().split('T')[0];
    const label = i === 0 ? t('chart.today') : i === 1 ? t('chart.yesterday') : `${d.getMonth() + 1}/${d.getDate()}`;
    days.push({ label, date: dateStr, tokens: dailyData[dateStr] || 0, isToday: i === 0 });
  }

  const maxTokens = Math.max(...days.map(d => d.tokens), 1);
  const totalWeek = days.reduce((sum, d) => sum + d.tokens, 0);
  const avgDay = totalWeek / 7;
  const peakDay = days.reduce((max, d) => d.tokens > max.tokens ? d : max, days[0]);

  // Week-over-week: compare last 7 days total with previous 7 days
  const prevWeekDays: number[] = [];
  for (let i = 13; i >= 7; i--) {
    const d = new Date(today);
    d.setDate(d.getDate() - i);
    const dateStr = d.toISOString().split('T')[0];
    prevWeekDays.push(dailyData[dateStr] || 0);
  }
  const prevWeekTotal = prevWeekDays.reduce((s, v) => s + v, 0);
  const weekChange = prevWeekTotal > 0 ? ((totalWeek - prevWeekTotal) / prevWeekTotal * 100) : 0;

  // Color based on relative height
  const getBarColor = (tokens: number) => {
    const ratio = tokens / maxTokens;
    if (ratio > 0.8) return 'linear-gradient(180deg, #ff6b6b, #ff4444)';
    if (ratio > 0.5) return 'linear-gradient(180deg, #ffa726, #ff7043)';
    if (ratio > 0.2) return 'linear-gradient(180deg, #42a5f5, #5c6bc0)';
    return 'linear-gradient(180deg, #78909c, #607d8b)';
  };

  return (
    <div className="token-chart">
      <div className="chart-header">
        <span className="chart-title">📈 {t('chart.trend7d')}</span>
        <div className="chart-header-right">
          <span className="chart-avg">{t('chart.dailyAvg')} {formatTokens(avgDay)}</span>
          <button className="chart-export-btn" onClick={() => window.electronAPI.exportTokenCSV()} title={t('chart.export')}>📥</button>
        </div>
      </div>

      <div className="chart-bars">
        {/* Average line */}
        {avgDay > 0 && (
          <div
            className="chart-avg-line"
            style={{ bottom: `${Math.max(4, (avgDay / maxTokens) * 100)}%` }}
          >
            <span className="chart-avg-label">avg</span>
          </div>
        )}
        {days.map((day, i) => {
          const heightPct = Math.max(4, (day.tokens / maxTokens) * 100);
          return (
            <div key={day.date} className={`chart-bar-group ${day.isToday ? 'today' : ''}`}>
              <div className="chart-value">
                {day.tokens > 0 ? formatTokens(day.tokens) : '-'}
              </div>
              <div className="chart-bar-bg">
                <div
                  className="chart-bar-fill"
                  style={{
                    height: animated ? `${heightPct}%` : '0%',
                    background: getBarColor(day.tokens),
                    transitionDelay: `${i * 60}ms`,
                  }}
                />
              </div>
              <div className="chart-label">{day.label}</div>
            </div>
          );
        })}
      </div>

      <div className="chart-footer">
        <div className="chart-stat">
          <span className="chart-stat-label">{t('chart.weekTotal')}</span>
          <span className="chart-stat-value">{formatTokens(totalWeek)}</span>
        </div>
        <div className="chart-stat">
          <span className="chart-stat-label">{t('chart.peak')}</span>
          <span className="chart-stat-value">{peakDay.label} ({formatTokens(peakDay.tokens)})</span>
        </div>
        {weekChange !== 0 && (
          <div className="chart-stat">
            <span className="chart-stat-label">{t('chart.vsLastWeek')}</span>
            <span className={`chart-stat-value ${weekChange > 0 ? 'trend-up' : 'trend-down'}`}>
              {weekChange > 0 ? '↑' : '↓'} {Math.abs(weekChange).toFixed(0)}%
            </span>
          </div>
        )}
      </div>
    </div>
  );
};
