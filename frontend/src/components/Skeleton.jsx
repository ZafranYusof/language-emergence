import React from 'react';

export function SkeletonLine({ width = '100%', height = '1rem', className = '' }) {
  return (
    <div
      className={`animate-pulse ${className}`}
      style={{ width, height, background: '#2d2d44', borderRadius: '2px' }}
    />
  );
}

export function SkeletonCard({ className = '' }) {
  return (
    <div className={`bg-steel-dark p-5 border border-steel-border ${className}`} style={{ borderRadius: '2px' }}>
      <div className="flex items-center justify-between mb-3">
        <SkeletonLine width="40%" height="0.75rem" />
        <div className="robot-eye" style={{ width: '16px', height: '16px' }} />
      </div>
      <SkeletonLine width="60%" height="1.75rem" className="mt-2" />
    </div>
  );
}

export function SkeletonChart({ className = '' }) {
  return (
    <div className={`bg-steel-dark p-6 border border-steel-border ${className}`} style={{ borderRadius: '2px' }}>
      <div className="flex items-center gap-2 mb-4">
        <div className="led-dot-amber" />
        <SkeletonLine width="30%" height="0.875rem" />
      </div>
      <div className="h-64 flex items-end gap-2 px-4">
        {Array.from({ length: 20 }).map((_, i) => (
          <div
            key={i}
            className="flex-1 animate-pulse"
            style={{ 
              height: `${20 + Math.random() * 80}%`, 
              animationDelay: `${i * 50}ms`,
              background: `linear-gradient(to top, #00ff8820, #00ff8808)`,
              borderRadius: '2px 2px 0 0',
            }}
          />
        ))}
      </div>
    </div>
  );
}

export function SkeletonList({ count = 3, className = '' }) {
  return (
    <div className={`space-y-3 ${className}`}>
      {Array.from({ length: count }).map((_, i) => (
        <div key={i} className="bg-steel-dark p-4 border border-steel-border animate-pulse" style={{ borderRadius: '2px' }}>
          <div className="flex items-center justify-between mb-2">
            <SkeletonLine width="25%" height="0.75rem" />
            <SkeletonLine width="15%" height="0.75rem" />
          </div>
          <div className="flex gap-4 mt-3">
            <SkeletonLine width="30%" height="1.5rem" />
            <SkeletonLine width="30%" height="1.5rem" />
            <SkeletonLine width="30%" height="1.5rem" />
          </div>
        </div>
      ))}
    </div>
  );
}
