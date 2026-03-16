import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { OpenClawStatus, LevelInfo, TokenInfo } from '../types';
import './SpeechBubble.css';

interface SpeechBubbleProps {
  status: OpenClawStatus;
  levelInfo: LevelInfo;
  tokenInfo: TokenInfo;
  isPanelOpen: boolean;
}

function getSpecialLine(t: (key: string) => string, levelInfo: LevelInfo, tokenInfo: TokenInfo): string | null {
  const { level } = levelInfo;
  const { daily } = tokenInfo;

  // Token-based specials (highest priority)
  if (daily > 500_000_000) return t('speech.special.tokens500m');
  if (daily > 200_000_000) return t('speech.special.tokens200m');
  if (daily > 100_000_000) return t('speech.special.tokens100m');
  if (daily > 50_000_000) return t('speech.special.tokens50m');

  // Level-based specials
  if (level >= 9) return t('speech.special.level9');
  if (level >= 7) return t('speech.special.level7');
  if (level >= 5) return t('speech.special.level5');

  // Time-based specials (lower priority, random chance)
  const hour = new Date().getHours();
  const day = new Date().getDay();
  if (hour >= 5 && hour < 8 && Math.random() < 0.4) return t('speech.special.morning');
  if (hour >= 23 || hour < 3) return t('speech.special.night');
  if ((day === 0 || day === 6) && Math.random() < 0.3) return t('speech.special.weekend');

  // New Year (Jan 1 or Chinese New Year area)
  const month = new Date().getMonth();
  if (month === 0 && new Date().getDate() === 1) return t('speech.special.newYear');

  // Long session (4+ hours)
  if (typeof window !== 'undefined' && performance.now() > 4 * 60 * 60 * 1000 && Math.random() < 0.3) {
    return t('speech.special.longSession');
  }

  return null;
}

function getRandomLine(lines: string[]): string {
  return lines[Math.floor(Math.random() * lines.length)];
}

interface BubbleState {
  id: number;
  text: string;
  offsetX: number;
  leaving: boolean;
}

export const SpeechBubble: React.FC<SpeechBubbleProps> = ({ status, levelInfo, tokenInfo, isPanelOpen }) => {
  const [bubble, setBubble] = useState<BubbleState | null>(null);
  const scheduleRef = useRef<number | null>(null);
  const exitRef = useRef<number | null>(null);
  const clearRef = useRef<number | null>(null);
  const lastSpecialRef = useRef<string | null>(null);
  const { t } = useTranslation();

  const idleLines = t('speech.idle', { returnObjects: true }) as string[];
  const activeLines = t('speech.active', { returnObjects: true }) as string[];
  const errorLines = t('speech.error', { returnObjects: true }) as string[];

  const clearTimers = useCallback(() => {
    if (scheduleRef.current !== null) { window.clearTimeout(scheduleRef.current); scheduleRef.current = null; }
    if (exitRef.current !== null) { window.clearTimeout(exitRef.current); exitRef.current = null; }
    if (clearRef.current !== null) { window.clearTimeout(clearRef.current); clearRef.current = null; }
  }, []);

  useEffect(() => {
    if (isPanelOpen) {
      clearTimers();
      setBubble(null);
      return;
    }

    const getPool = () => {
      switch (status) {
        case 'active': return activeLines;
        case 'error': return errorLines;
        default: return idleLines;
      }
    };

    const showBubble = (text: string) => {
      const id = Date.now();
      setBubble({ id, text, offsetX: Math.random() * 30 - 15, leaving: false });

      exitRef.current = window.setTimeout(() => {
        setBubble(cur => cur?.id === id ? { ...cur, leaving: true } : cur);
      }, 3500);

      clearRef.current = window.setTimeout(() => {
        setBubble(cur => cur?.id === id ? null : cur);
      }, 4000);
    };

    const scheduleNext = () => {
      const delay = 30_000 + Math.random() * 30_000;
      scheduleRef.current = window.setTimeout(() => {
        const special = getSpecialLine(t, levelInfo, tokenInfo);
        if (special && special !== lastSpecialRef.current && Math.random() < 0.3) {
          lastSpecialRef.current = special;
          showBubble(special);
        } else {
          showBubble(getRandomLine(getPool()));
        }
        scheduleNext();
      }, delay);
    };

    clearTimers();
    setBubble(null);

    const initialDelay = 10_000 + Math.random() * 10_000;
    scheduleRef.current = window.setTimeout(() => {
      showBubble(getRandomLine(getPool()));
      scheduleNext();
    }, initialDelay);

    return clearTimers;
  }, [status, isPanelOpen, levelInfo, tokenInfo, clearTimers, t, idleLines, activeLines, errorLines]);

  if (!bubble) return null;

  return (
    <div
      key={bubble.id}
      className={`speech-bubble ${bubble.leaving ? 'leaving' : ''}`}
      style={{ '--bubble-offset': `${bubble.offsetX}px` } as React.CSSProperties}
    >
      <span className="speech-text">{bubble.text}</span>
    </div>
  );
};
