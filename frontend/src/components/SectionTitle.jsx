import React from 'react';

export default function SectionTitle({ children, icon, color = '#00ff88', subtitle }) {
  return (
    <div style={{ marginBottom: 16 }}>
      <h2 style={{
        fontFamily: "'JetBrains Mono', monospace",
        fontSize: 14,
        fontWeight: 700,
        color,
        letterSpacing: '0.5px',
        margin: 0,
        display: 'flex',
        alignItems: 'center',
        gap: 8,
      }}>
        {icon && <span style={{ opacity: 0.7 }}>{icon}</span>}
        {children}
      </h2>
      {subtitle && (
        <p style={{
          fontFamily: "'JetBrains Mono', monospace",
          fontSize: 11,
          color: '#555',
          margin: '4px 0 0',
        }}>
          {subtitle}
        </p>
      )}
    </div>
  );
}
