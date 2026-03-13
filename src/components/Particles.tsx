import React, { useEffect, useMemo, useRef } from 'react';
import { OpenClawStatus } from '../types';
import './Particles.css';

interface ParticlesProps {
  status: OpenClawStatus;
  level: number;
}

interface ParticleState {
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
  maxLife: number;
  size: number;
  rotation: number;
  rotationSpeed: number;
  wobblePhase: number;
  wobbleSpeed: number;
  drift: number;
}

const clampLevel = (level: number) => Math.max(1, Math.min(10, level));

const getLevelTier = (level: number) => {
  if (level >= 10) return 4;
  if (level >= 7) return 3;
  if (level >= 4) return 2;
  return 1;
};

const getParticleCount = (status: OpenClawStatus, level: number) => {
  const tier = getLevelTier(level);

  switch (status) {
    case 'active':
      return Math.min(8 + (tier - 1), 10);
    case 'error':
      return Math.min(2 + Math.floor((tier - 1) / 2), 4);
    case 'idle':
    default:
      return Math.min(4 + (tier - 1), 7);
  }
};

const randomBetween = (min: number, max: number) => min + Math.random() * (max - min);

const createParticle = (
  status: OpenClawStatus,
  level: number,
  width: number,
  height: number
): ParticleState => {
  const tier = getLevelTier(level);
  const sizeScale = tier === 1 ? 1 : tier === 2 ? 1.15 : tier === 3 ? 1.3 : 1.45;

  if (status === 'active') {
    return {
      x: randomBetween(width * 0.18, width * 0.82),
      y: randomBetween(height * 0.2, height * 0.78),
      vx: randomBetween(-1.1, 1.1),
      vy: randomBetween(-1.35, 0.2),
      life: 0,
      maxLife: randomBetween(38, 64),
      size: randomBetween(8, 14) * sizeScale,
      rotation: randomBetween(0, 360),
      rotationSpeed: randomBetween(-8, 8),
      wobblePhase: randomBetween(0, Math.PI * 2),
      wobbleSpeed: randomBetween(0.12, 0.2),
      drift: randomBetween(0.12, 0.28),
    };
  }

  if (status === 'error') {
    return {
      x: randomBetween(width * 0.22, width * 0.78),
      y: randomBetween(-18, height * 0.2),
      vx: randomBetween(-0.18, 0.18),
      vy: randomBetween(0.28, 0.62),
      life: 0,
      maxLife: randomBetween(140, 210),
      size: randomBetween(16, 24) * sizeScale,
      rotation: randomBetween(-20, 20),
      rotationSpeed: randomBetween(-0.35, 0.35),
      wobblePhase: randomBetween(0, Math.PI * 2),
      wobbleSpeed: randomBetween(0.02, 0.05),
      drift: randomBetween(0.2, 0.42),
    };
  }

  return {
    x: randomBetween(width * 0.18, width * 0.82),
    y: randomBetween(height * 0.48, height * 0.92),
    vx: randomBetween(-0.2, 0.2),
    vy: randomBetween(-0.52, -0.22),
    life: 0,
    maxLife: randomBetween(150, 240),
    size: randomBetween(10, 18) * sizeScale,
    rotation: randomBetween(-12, 12),
    rotationSpeed: randomBetween(-0.15, 0.15),
    wobblePhase: randomBetween(0, Math.PI * 2),
    wobbleSpeed: randomBetween(0.03, 0.06),
    drift: randomBetween(0.18, 0.35),
  };
};

export const Particles: React.FC<ParticlesProps> = ({ status, level }) => {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const particleRefs = useRef<Array<HTMLDivElement | null>>([]);
  const particlesRef = useRef<ParticleState[]>([]);
  const frameRef = useRef<number | null>(null);
  const lastTimeRef = useRef<number | null>(null);

  const safeLevel = clampLevel(level);
  const levelTier = getLevelTier(safeLevel);
  const particleCount = useMemo(() => getParticleCount(status, safeLevel), [status, safeLevel]);
  const particleIds = useMemo(
    () => Array.from({ length: particleCount }, (_, index) => `${status}-${safeLevel}-${index}`),
    [particleCount, safeLevel, status]
  );

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const rect = container.getBoundingClientRect();
    const width = rect.width || 220;
    const height = rect.height || 220;

    particlesRef.current = particleIds.map(() => createParticle(status, safeLevel, width, height));

    particleRefs.current.forEach((node, index) => {
      const particle = particlesRef.current[index];
      if (!node || !particle) return;
      node.style.width = `${particle.size}px`;
      node.style.height = `${particle.size}px`;
      node.style.opacity = '0';
    });
  }, [particleIds, safeLevel, status]);

  useEffect(() => {
    const updateParticles = (timestamp: number) => {
      const container = containerRef.current;
      if (!container) return;

      const rect = container.getBoundingClientRect();
      const width = rect.width || 220;
      const height = rect.height || 220;
      const previousTime = lastTimeRef.current ?? timestamp;
      const deltaFactor = Math.min((timestamp - previousTime) / 16.67, 2);
      lastTimeRef.current = timestamp;

      particlesRef.current.forEach((particle, index) => {
        const node = particleRefs.current[index];
        if (!particle || !node) return;

        particle.life += deltaFactor;
        particle.rotation += particle.rotationSpeed * deltaFactor;
        particle.wobblePhase += particle.wobbleSpeed * deltaFactor;

        if (status === 'active') {
          particle.x += (particle.vx + Math.sin(particle.wobblePhase) * particle.drift) * deltaFactor;
          particle.y += (particle.vy + Math.cos(particle.wobblePhase * 1.4) * 0.08) * deltaFactor;
        } else if (status === 'error') {
          particle.x += (particle.vx + Math.sin(particle.wobblePhase) * 0.22) * deltaFactor;
          particle.y += (particle.vy + Math.cos(particle.wobblePhase) * particle.drift * 0.06) * deltaFactor;
        } else {
          particle.x += (particle.vx + Math.sin(particle.wobblePhase) * particle.drift) * deltaFactor;
          particle.y += particle.vy * deltaFactor;
        }

        const progress = particle.life / particle.maxLife;
        const fadeIn = Math.min(progress / 0.18, 1);
        const fadeOut = Math.min((1 - progress) / 0.2, 1);
        const opacityBase = status === 'active' ? 0.95 : status === 'idle' ? 0.7 : 0.45;
        const opacity = Math.max(0, Math.min(fadeIn, fadeOut)) * opacityBase;
        const pulse = status === 'active'
          ? 0.92 + Math.sin(particle.wobblePhase * 2.2) * 0.12
          : 1 + Math.sin(particle.wobblePhase) * 0.04;

        node.style.transform = `translate3d(${particle.x}px, ${particle.y}px, 0) scale(${pulse}) rotate(${particle.rotation}deg)`;
        node.style.opacity = `${opacity}`;

        const isOutOfBounds = status === 'error'
          ? particle.y > height + 42
          : particle.y < -42 || particle.x < -48 || particle.x > width + 48;

        if (progress >= 1 || isOutOfBounds) {
          const nextParticle = createParticle(status, safeLevel, width, height);
          particlesRef.current[index] = nextParticle;
          node.style.width = `${nextParticle.size}px`;
          node.style.height = `${nextParticle.size}px`;
        }
      });

      frameRef.current = requestAnimationFrame(updateParticles);
    };

    lastTimeRef.current = null;
    frameRef.current = requestAnimationFrame(updateParticles);

    return () => {
      if (frameRef.current !== null) {
        cancelAnimationFrame(frameRef.current);
        frameRef.current = null;
      }
      lastTimeRef.current = null;
    };
  }, [safeLevel, status]);

  return (
    <div
      ref={containerRef}
      className={`particles-layer particles-${status} particles-tier-${levelTier}`}
      aria-hidden="true"
    >
      {particleIds.map((particleId, index) => (
        <div
          key={particleId}
          ref={node => {
            particleRefs.current[index] = node;
          }}
          className="particle-node"
        >
          <span
            className={[
              'particle-core',
              `particle-${status}`,
              levelTier >= 2 ? 'particle-enhanced' : '',
              levelTier >= 3 ? 'particle-trail' : '',
              safeLevel >= 10 ? 'particle-rainbow' : '',
            ].filter(Boolean).join(' ')}
          />
        </div>
      ))}
    </div>
  );
};
