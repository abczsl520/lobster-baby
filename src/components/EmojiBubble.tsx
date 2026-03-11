import React from 'react';
import './EmojiBubble.css';

interface EmojiBubbleProps {
  emoji: string;
  onComplete: () => void;
}

const IDLE_EMOJIS = ['😴', '💤', '🌙', '☁️', '🫧'];
const ACTIVE_EMOJIS = ['🔥', '⚡', '💪', '🚀', '✨', '💻', '🧠'];
const CLICK_EMOJIS = ['❤️', '😊', '🎉', '✨', '🌟', '💪', '🔥', '👍', '🦞', '💖'];
const ERROR_EMOJIS = ['😵', '💀', '🆘', '❌', '😢'];

export const EmojiBubble: React.FC<EmojiBubbleProps> = ({ emoji, onComplete }) => {
  React.useEffect(() => {
    const timer = setTimeout(onComplete, 1800);
    return () => clearTimeout(timer);
  }, [onComplete]);

  return (
    <div className="emoji-bubble">
      {emoji}
    </div>
  );
};

export function getRandomEmoji(status?: string): string {
  let pool = CLICK_EMOJIS;
  if (status === 'active') pool = ACTIVE_EMOJIS;
  else if (status === 'error') pool = ERROR_EMOJIS;
  else if (status === 'idle') pool = [...CLICK_EMOJIS, ...IDLE_EMOJIS];
  return pool[Math.floor(Math.random() * pool.length)];
}
