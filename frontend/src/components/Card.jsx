import React from 'react';

export default function Card({ children, accent, padding = 16, style = {}, className = '', ...props }) {
  return (
    <div
      className={`retro-card rounded-xl ${className}`}
      style={{
        padding,
        position: 'relative',
        overflow: 'hidden',
        ...style,
      }}
      {...props}
    >
      {accent && (
        <div style={{
          position: 'absolute', top: 0, left: 0, right: 0,
          height: 2,
          background: `linear-gradient(90deg, ${accent}, transparent)`,
        }} />
      )}
      {children}
    </div>
  );
}
