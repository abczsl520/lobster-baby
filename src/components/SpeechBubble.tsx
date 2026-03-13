import React, { useEffect, useRef, useState } from 'react';
import { OpenClawStatus } from '../types';
import './SpeechBubble.css';

interface SpeechBubbleProps {
  status: OpenClawStatus;
}

interface BubbleState {
  id: number;
  text: string;
  offsetX: number;
  leaving: boolean;
}

const LINES: Record<OpenClawStatus, string[]> = {
  active: ['在烧钱了...🔥', '疯狂输出中！', 'Token 刷刷刷~', '老板又在写代码了', '我的钱包在哭泣💸'],
  idle: ['好无聊啊~', '主人去哪了？', '💤 打个盹...', '有人吗？', '想吃小鱼干'],
  error: ['救命！我断线了😵', '主人快回来！', '呜呜呜...', '信号丢了...'],
};

const INTERVALS: Record<OpenClawStatus, [number, number]> = {
  active: [20_000, 30_000],
  idle: [15_000, 25_000],
  error: [10_000, 15_000],
};

const randomBetween = (min: number, max: number) => min + Math.random() * (max - min);

const pickLine = (status: OpenClawStatus) => {
  const pool = LINES[status];
  return pool[Math.floor(Math.random() * pool.length)];
};

export const SpeechBubble: React.FC<SpeechBubbleProps> = ({ status }) => {
  const [bubble, setBubble] = useState<BubbleState | null>(null);
  const scheduleRef = useRef<number | null>(null);
  const exitRef = useRef<number | null>(null);
  const clearRef = useRef<number | null>(null);

  useEffect(() => {
    const clearTimers = () => {
      if (scheduleRef.current !== null) {
        window.clearTimeout(scheduleRef.current);
        scheduleRef.current = null;
      }
      if (exitRef.current !== null) {
        window.clearTimeout(exitRef.current);
        exitRef.current = null;
      }
      if (clearRef.current !== null) {
        window.clearTimeout(clearRef.current);
        clearRef.current = null;
      }
    };

    const scheduleNext = () => {
      const [minDelay, maxDelay] = INTERVALS[status];
      scheduleRef.current = window.setTimeout(() => {
        const id = Date.now();
        setBubble({
          id,
          text: pickLine(status),
          offsetX: randomBetween(-18, 18),
          leaving: false,
        });

        exitRef.current = window.setTimeout(() => {
          setBubble(current => (current?.id === id ? { ...current, leaving: true } : current));
        }, 2000);

        clearRef.current = window.setTimeout(() => {
          setBubble(current => (current?.id === id ? null : current));
        }, 2500);

        scheduleNext();
      }, randomBetween(minDelay, maxDelay));
    };

    clearTimers();
    setBubble(null);
    scheduleNext();

    return clearTimers;
  }, [status]);

  if (!bubble) return null;

  return (
    <div
      key={bubble.id}
      className={`speech-bubble ${bubble.leaving ? 'leaving' : ''}`}
      style={{ '--bubble-offset': `${bubble.offsetX}px` } as React.CSSProperties}
      aria-live="polite"
    >
      <div className="speech-bubble-text">{bubble.text}</div>
    </div>
  );
};
