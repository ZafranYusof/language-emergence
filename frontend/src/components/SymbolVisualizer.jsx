import React from 'react';
import { getSymbolColor, stringToColorIndex } from '../utils/colors';
import { motion } from 'framer-motion';

export default function SymbolVisualizer({ symbols, interactive = true, size = 'md' }) {
  const [hoveredIndex, setHoveredIndex] = React.useState(null);

  const sizeClasses = {
    sm: 'w-6 h-6 text-xs',
    md: 'w-8 h-8 text-sm',
    lg: 'w-10 h-10 text-base',
  };

  if (!symbols || symbols.length === 0) {
    return <span className="text-retro-muted font-mono text-sm">∅</span>;
  }

  return (
    <div className="flex items-center gap-1.5">
      {symbols.map((symbol, i) => {
        const colorIdx = typeof symbol === 'number' ? symbol : stringToColorIndex(String(symbol));
        const color = getSymbolColor(colorIdx);
        const isHovered = hoveredIndex === i;

        return (
          <motion.div
            key={`${i}-${symbol}`}
            initial={{ scale: 0, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            transition={{ delay: i * 0.05, duration: 0.2, type: 'spring', stiffness: 300 }}
            className={`
              ${sizeClasses[size]} rounded-lg flex items-center justify-center
              font-mono font-bold cursor-default select-none
              transition-all duration-200
              ${interactive ? 'hover:scale-110 hover:-translate-y-0.5' : ''}
              ${isHovered ? 'ring-2 ring-white/30' : ''}
            `}
            style={{
              backgroundColor: color,
              color: '#000',
              boxShadow: isHovered
                ? `0 0 16px 4px ${color}80, 0 0 32px 8px ${color}40, inset 0 1px 0 rgba(255,255,255,0.2)`
                : `inset 0 1px 0 rgba(255,255,255,0.15), 0 2px 4px rgba(0,0,0,0.3)`,
              textShadow: '0 1px 2px rgba(0,0,0,0.1)',
            }}
            onMouseEnter={() => interactive && setHoveredIndex(i)}
            onMouseLeave={() => setHoveredIndex(null)}
            title={hoveredIndex === i ? `Symbol: ${symbol}\nColor index: ${colorIdx}\nPosition: #${i + 1}` : undefined}
          >
            {typeof symbol === 'string' ? symbol : `S${symbol}`}
          </motion.div>
        );
      })}
    </div>
  );
}
