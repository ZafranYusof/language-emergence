import React from 'react';

export default function LoadingScreen() {
  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        minHeight: '60vh',
        backgroundColor: '#0a0a0a',
        fontFamily: "'JetBrains Mono', 'Fira Code', monospace",
      }}
    >
      <div style={{ textAlign: 'center' }}>
        <div
          style={{
            fontSize: '1.25rem',
            color: '#00ff88',
            letterSpacing: '0.15em',
            textTransform: 'uppercase',
            animation: 'loadingPulse 1.5s ease-in-out infinite',
          }}
        >
          LOADING
          <span className="loading-dots">...</span>
        </div>
        <div
          style={{
            marginTop: '12px',
            fontSize: '0.7rem',
            color: '#00ff88',
            opacity: 0.4,
            letterSpacing: '0.1em',
          }}
        >
          LANG_EMERGENCE
        </div>
      </div>
      <style>{`
        @keyframes loadingPulse {
          0%, 100% { opacity: 0.4; }
          50% { opacity: 1; }
        }
        .loading-dots {
          display: inline-block;
          animation: loadingDots 1.5s steps(4, end) infinite;
          overflow: hidden;
          vertical-align: bottom;
        }
        @keyframes loadingDots {
          0% { width: 0; }
          100% { width: 1.5em; }
        }
      `}</style>
    </div>
  );
}
