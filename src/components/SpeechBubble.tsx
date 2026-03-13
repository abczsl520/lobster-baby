import React, { useState, useEffect, useRef, useCallback } from 'react';
import { OpenClawStatus, LevelInfo, TokenInfo } from '../types';
import './SpeechBubble.css';

interface SpeechBubbleProps {
  status: OpenClawStatus;
  levelInfo: LevelInfo;
  tokenInfo: TokenInfo;
  isPanelOpen: boolean;
}

const IDLE_LINES = [
  '好无聊啊…', '主人去哪了？', '💤 打个盹…', '有人吗？',
  '摸鱼中~', '好安静啊', '想吃小鱼干', '🫧',
  '等主人回来…', '发呆.jpg',
];

const ACTIVE_LINES = [
  '又在烧钱了！', '🔥 token 在燃烧', '加油加油！', '主人好勤奋~',
  '代码写得不错嘛', '💪 冲冲冲', 'API 嗡嗡响', '今天效率真高',
  '钱包在哭泣…', '⚡ 全力输出中',
];

const OFFLINE_LINES = [
  '主人？你在吗？', '😢 连接断了', '好冷…',
  '翻肚了…', '救命啊！', '信号丢失…',
];

function getSpecialLine(levelInfo: LevelInfo, tokenInfo: TokenInfo): string | null {
  const { level } = levelInfo;
  const { daily } = tokenInfo;

  if (daily > 500_000_000) return '今天烧了 5 亿 token！💸';
  if (daily > 200_000_000) return '今天 2 亿 token 了！';
  if (daily > 100_000_000) return '今天已经 1 亿 token 了';
  if (daily > 50_000_000) return '今天 5000 万 token 了~';

  if (level >= 9) return '我已经是传说级龙虾了 🌈';
  if (level >= 7) return '等级好高，主人真厉害';
  if (level >= 5) return '金冠龙虾，闪闪发光 ✨';

  return null;
}

function getRandomLine(status: OpenClawStatus): string {
  let pool: string[];
  switch (status) {
    case 'active': pool = ACTIVE_LINES; break;
    case 'error': pool = OFFLINE_LINES; break;
    default: pool = IDLE_LINES;
  }
  return pool[Math.floor(Math.random() * pool.length)];
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
        const special = getSpecialLine(levelInfo, tokenInfo);
        if (special && special !== lastSpecialRef.current && Math.random() < 0.3) {
          lastSpecialRef.current = special;
          showBubble(special);
        } else {
          showBubble(getRandomLine(status));
        }
        scheduleNext();
      }, delay);
    };

    clearTimers();
    setBubble(null);

    // First bubble after 10-20 seconds
    const initialDelay = 10_000 + Math.random() * 10_000;
    scheduleRef.current = window.setTimeout(() => {
      showBubble(getRandomLine(status));
      scheduleNext();
    }, initialDelay);

    return clearTimers;
  }, [status, isPanelOpen, levelInfo, tokenInfo, clearTimers]);

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
