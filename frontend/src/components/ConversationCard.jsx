import React from 'react';
import { motion } from 'framer-motion';
import { Check, X, Award } from 'lucide-react';
import SymbolVisualizer from './SymbolVisualizer';

export default function ConversationCard({ conversation, index = 0 }) {
  if (!conversation) return null;

  const { target, message, listener_choice, correct, reward, episode } = conversation;

  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: index * 0.05, duration: 0.3 }}
      whileHover={{ y: -1 }}
      className={`
        bg-steel-dark/80 backdrop-blur-sm rounded-lg p-4 border transition-all duration-200
        ${correct ? 'border-emerald-500/30 hover:border-emerald-500/50 hover:shadow-emerald-500/5' : 'border-red-500/30 hover:border-red-500/50 hover:shadow-red-500/5'}
        hover:shadow-md
      `}
    >
      <div className="flex items-start justify-between mb-3">
        <div className="flex items-center gap-2">
          <span className="text-xs text-retro-muted font-mono">EP {episode}</span>
          {target?.label && (
            <span className="text-xs bg-steel-dark text-retro-text px-2 py-0.5 rounded-full">
              {target.label}
            </span>
          )}
        </div>
        <div className={`flex items-center gap-2 ${correct ? 'text-neon-green' : 'text-retro-error'}`}>
          {correct ? <Check size={16} /> : <X size={16} />}
          <div className="flex items-center gap-1">
            <Award size={14} />
            <span className="text-sm font-bold">{reward?.toFixed(2) ?? '0.00'}</span>
          </div>
        </div>
      </div>

      {/* Target features */}
      <div className="mb-3">
        <span className="text-xs text-retro-muted uppercase tracking-wider">Target Features</span>
        <div className="flex flex-wrap gap-1 mt-1">
          {(target?.features || []).map((f, i) => (
            <span key={i} className="text-xs bg-cyber-cyan/20 text-cyber-cyan px-2 py-0.5 rounded font-mono">
              {typeof f === 'number' ? f.toFixed(2) : f}
            </span>
          ))}
        </div>
      </div>

      {/* Speaker message */}
      <div className="mb-3">
        <span className="text-xs text-retro-muted uppercase tracking-wider">Speaker Message</span>
        <div className="mt-1">
          <SymbolVisualizer symbols={message} size="sm" />
        </div>
      </div>

      {/* Listener prediction */}
      <div>
        <span className="text-xs text-retro-muted uppercase tracking-wider">Listener Choice</span>
        <div className="mt-1">
          <span className={`text-sm font-mono tabular-nums ${correct ? 'text-neon-green' : 'text-retro-error'}`}>
            {typeof listener_choice === 'number' ? listener_choice.toFixed(2) : (listener_choice ?? '—')}
          </span>
        </div>
      </div>
    </motion.div>
  );
}
