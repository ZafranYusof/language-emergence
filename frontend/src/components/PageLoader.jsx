import React, { useState, useEffect } from 'react';

/**
 * PageLoader — Standardized loading indicator matching the retro pixel art theme.
 *
 * Props:
 *   name   — Page/section name shown alongside the loading animation
 *   inline — If true, renders as an inline block (for section-level loaders)
 *            instead of a full-page centered layout
 *   size   — 'sm' | 'md' | 'lg'  (default: 'md')
 */
export default function PageLoader({ name, inline = false, size = 'md' }) {
  const [dotCount, setDotCount] = useState(0);

  useEffect(() => {
    const id = setInterval(() => setDotCount((d) => (d + 1) % 4), 400);
    return () => clearInterval(id);
  }, []);

  const dots = '.'.repeat(dotCount);
  const label = name ? `LOADING ${name.toUpperCase()}${dots}` : `LOADING${dots}`;

  const fontSize = size === 'sm' ? 11 : size === 'lg' ? 15 : 13;

  /* Animated pixel progress bar */
  const barWidth = size === 'sm' ? 120 : size === 'lg' ? 240 : 180;

  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 16,
        fontFamily: "'JetBrains Mono', monospace",
        ...(inline
          ? { padding: '24px 0' }
          : { minHeight: '60vh', width: '100%' }),
      }}
    >
      {/* Blinking pixel cursor */}
      <div
        style={{
          width: 12,
          height: 12,
          background: '#00ff88',
          boxShadow: '0 0 12px rgba(0,255,136,0.6), 0 0 4px rgba(0,255,136,0.9)',
          animation: 'pageLoaderBlink 1s steps(1) infinite',
        }}
      />

      {/* Label */}
      <div
        style={{
          color: '#00ff88',
          fontSize,
          letterSpacing: 3,
          textShadow: '0 0 8px rgba(0,255,136,0.4)',
          textTransform: 'uppercase',
        }}
      >
        {label}
      </div>

      {/* Pixel progress bar */}
      <div
        style={{
          width: barWidth,
          height: 6,
          background: '#1a1a2e',
          border: '1px solid #00ff8833',
          overflow: 'hidden',
          position: 'relative',
        }}
      >
        <div
          style={{
            position: 'absolute',
            top: 0,
            left: 0,
            height: '100%',
            width: '40%',
            background: 'linear-gradient(90deg, transparent, #00ff88, transparent)',
            animation: 'pageLoaderSweep 1.2s ease-in-out infinite',
          }}
        />
      </div>

      {/* Keyframes injected once */}
      <style>{`
        @keyframes pageLoaderBlink {
          0%, 49% { opacity: 1; }
          50%, 100% { opacity: 0; }
        }
        @keyframes pageLoaderSweep {
          0%   { transform: translateX(-100%); }
          100% { transform: translateX(350%); }
        }
      `}</style>
    </div>
  );
}
