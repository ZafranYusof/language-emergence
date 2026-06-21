import React from 'react';

export default function EmptyState({ icon, message, hint, style = {} }) {
  return (
    <div style={{
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      justifyContent: 'center',
      padding: 32,
      position: 'relative',
      textAlign: 'center',
      ...style,
    }}>
      {/* Subtle grid background */}
      <div style={{
        position: 'absolute', inset: 0, borderRadius: 8,
        backgroundImage: `
          linear-gradient(rgba(0,255,136,0.03) 1px, transparent 1px),
          linear-gradient(90deg, rgba(0,255,136,0.03) 1px, transparent 1px)
        `,
        backgroundSize: '20px 20px',
        pointerEvents: 'none',
      }} />
      {icon && (
        <div style={{
          fontSize: 28,
          marginBottom: 12,
          opacity: 0.4,
          filter: 'grayscale(0.5)',
        }}>
          {icon}
        </div>
      )}
      <p style={{
        fontFamily: "'JetBrains Mono', monospace",
        fontSize: 12,
        color: '#555',
        margin: 0,
        position: 'relative',
      }}>
        {message}
      </p>
      {hint && (
        <p style={{
          fontFamily: "'JetBrains Mono', monospace",
          fontSize: 10,
          color: '#3a3a4a',
          margin: '6px 0 0',
          position: 'relative',
        }}>
          {hint}
        </p>
      )}
    </div>
  );
}
