import React, { useEffect } from 'react';

interface TokenFlyProps {
  tokens: number;
  onComplete: () => void;
}

export const TokenFly: React.FC<TokenFlyProps> = ({ tokens, onComplete }) => {
  useEffect(() => {
    const timer = setTimeout(onComplete, 2000); // Match animation duration
    return () => clearTimeout(timer);
  }, [onComplete]);

  const formatTokens = (t: number): string => {
    if (t >= 1_000_000) return `+${(t / 1_000_000).toFixed(1)}M`;
    if (t >= 1_000) return `+${(t / 1_000).toFixed(1)}K`;
    return `+${t}`;
  };

  return (
    <div className="token-fly">
      <div className="token-fly-number">{formatTokens(tokens)}</div>
    </div>
  );
};
