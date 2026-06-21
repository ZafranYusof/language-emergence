import React from 'react';

const GRID_SIZE = 20;

export default function EmptyCanvas({
  title = 'Waiting for data...',
  subtitle = 'Start training to see activity',
  icon = '◈',
}) {
  return (
    <div style={{
      background: '#0a0a0a',
      border: '1px solid #1a1a2e',
      borderRadius: 8,
      padding: '40px 20px',
      textAlign: 'center',
      position: 'relative',
      overflow: 'hidden',
      minHeight: 200,
    }}>
      {/* Animated grid background */}
      <div style={{
        position: 'absolute', inset: 0,
        backgroundImage:
          `linear-gradient(#1a1a2e 1px, transparent 1px), linear-gradient(90deg, #1a1a2e 1px, transparent 1px)`,
        backgroundSize: `${GRID_SIZE}px ${GRID_SIZE}px`,
        opacity: 0.3,
        animation: 'grid-drift 8s linear infinite',
      }} />

      {/* Floating pixel particles */}
      <div style={{
        position: 'absolute', inset: 0, pointerEvents: 'none',
      }}>
        {[0, 1, 2, 3, 4].map(i => (
          <div
            key={i}
            style={{
              position: 'absolute',
              width: 3, height: 3,
              background: '#00ff88',
              borderRadius: 1,
              opacity: 0.15,
              left: `${15 + i * 18}%`,
              top: `${30 + (i % 3) * 20}%`,
              animation: `float-particle ${3 + i * 0.7}s ease-in-out infinite`,
              animationDelay: `${i * 0.4}s`,
              boxShadow: '0 0 4px #00ff8844',
            }}
          />
        ))}
      </div>

      {/* Idle pixel art agent sprites */}
      <div style={{
        display: 'flex', justifyContent: 'center', gap: 24,
        marginBottom: 20, position: 'relative', zIndex: 1,
      }}>
        <PixelAgent color="#4477cc" delay={0} />
        <PixelAgent color="#cc4444" delay={0.5} />
        <PixelAgent color="#7744aa" delay={1.0} />
      </div>

      {/* Content */}
      <div style={{ position: 'relative', zIndex: 1 }}>
        <div style={{
          fontSize: 40, marginBottom: 16, opacity: 0.6,
          filter: 'drop-shadow(0 0 8px #00ff8833)',
        }}>
          {icon}
        </div>
        <div style={{
          color: '#555', fontFamily: "'JetBrains Mono', monospace",
          fontSize: 13, marginBottom: 8,
        }}>
          {title}
        </div>
        <div style={{
          color: '#333', fontFamily: "'JetBrains Mono', monospace",
          fontSize: 11,
        }}>
          {subtitle}
        </div>
      </div>

      {/* Keyframes injected once */}
      <style>{`
        @keyframes grid-drift {
          0% { transform: translate(0, 0); }
          100% { transform: translate(${GRID_SIZE}px, ${GRID_SIZE}px); }
        }
        @keyframes float-particle {
          0%, 100% { transform: translateY(0); opacity: 0.1; }
          50% { transform: translateY(-8px); opacity: 0.3; }
        }
      `}</style>
    </div>
  );
}

/* Tiny 8×8 pixel art agent character rendered via box-shadow */
function PixelAgent({ color = '#4477cc', delay = 0 }) {
  const c = color;
  const light = lighten(color, 40);
  const dark = darken(color, 30);

  // 8×8 grid: each char maps to a color
  const palette = { O: '#222', H: light, h: c, d: dark, S: '#ffe0b0', s: '#eebb88', W: '#fff', E: '#222', M: '#cc6666', F: dark };
  const grid = [
    '...OO...',
    '..OHHO..',
    '.OHHHhO.',
    '.OWSSWO.',
    '.OSEESEO',
    '..OSMO..',
    '..OhhO..',
    '.OFOOFO.',
  ];

  const px = 3; // pixel size
  const shadows = [];
  for (let y = 0; y < grid.length; y++) {
    for (let x = 0; x < grid[y].length; x++) {
      const ch = grid[y][x];
      if (ch === '.') continue;
      const col = palette[ch] || '#444';
      shadows.push(`${x * px}px ${y * px}px 0 0 ${col}`);
    }
  }

  return (
    <div style={{
      width: 8 * px, height: 8 * px,
      position: 'relative',
      animation: 'agent-idle 2s ease-in-out infinite',
      animationDelay: `${delay}s`,
    }}>
      <div style={{
        width: px, height: px,
        boxShadow: shadows.join(','),
        position: 'absolute', top: 0, left: 0,
        opacity: 0.7,
      }} />
      <style>{`
        @keyframes agent-idle {
          0%, 100% { transform: translateY(0); }
          50% { transform: translateY(-3px); }
        }
      `}</style>
    </div>
  );
}

function lighten(hex, amount) {
  const num = parseInt(hex.replace('#', ''), 16);
  const r = Math.min(255, (num >> 16) + amount);
  const g = Math.min(255, ((num >> 8) & 0xff) + amount);
  const b = Math.min(255, (num & 0xff) + amount);
  return `rgb(${r},${g},${b})`;
}

function darken(hex, amount) {
  const num = parseInt(hex.replace('#', ''), 16);
  const r = Math.max(0, (num >> 16) - amount);
  const g = Math.max(0, ((num >> 8) & 0xff) - amount);
  const b = Math.max(0, (num & 0xff) - amount);
  return `rgb(${r},${g},${b})`;
}
