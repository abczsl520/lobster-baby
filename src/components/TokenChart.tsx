import React, { useEffect, useState } from 'react';
import { formatTokens } from '../utils/levels';
import './TokenChart.css';

interface TokenChartProps {
  visible: boolean;
}

export const TokenChart: React.FC<TokenChartProps> = ({ visible }) => {
  const [dailyData, setDailyData] = useState<Record<string, number>>({});

  useEffect(() => {
    if (!visible) return;
    window.electronAPI.getDailyTokens().then(setDailyData);
  }, [visible]);

  if (!visible) return null;

  // Get last 7 days
  const today = new Date();
  const days: { label: string; date: string; tokens: number }[] = [];
  for (let i = 6; i >= 0; i--) {
    const d = new Date(today);
    d.setDate(d.getDate() - i);
    const dateStr = d.toISOString().split('T')[0];
    const label = i === 0 ? '今天' : i === 1 ? '昨天' : `${d.getMonth() + 1}/${d.getDate()}`;
    days.push({ label, date: dateStr, tokens: dailyData[dateStr] || 0 });
  }

  const maxTokens = Math.max(...days.map(d => d.tokens), 1);
  const totalWeek = days.reduce((sum, d) => sum + d.tokens, 0);
  const avgDay = totalWeek / 7;

  return (
    <div className="token-chart">
      <div className="chart-header">
        <span className="chart-title">📈 7 天趋势</span>
        <span className="chart-avg">日均 {formatTokens(avgDay)}</span>
      </div>

      <div className="chart-bars">
        {days.map((day) => {
          const height = Math.max(2, (day.tokens / maxTokens) * 48);
          return (
            <div key={day.date} className="chart-bar-group">
              <div className="chart-value">
                {day.tokens > 0 ? formatTokens(day.tokens) : '-'}
              </div>
              <div className="chart-bar-bg">
                <div
                  className="chart-bar-fill"
                  style={{ height: `${height}px` }}
                />
              </div>
              <div className="chart-label">{day.label}</div>
            </div>
          );
        })}
      </div>

      <div className="chart-total">
        本周合计: {formatTokens(totalWeek)}
      </div>
    </div>
  );
};
