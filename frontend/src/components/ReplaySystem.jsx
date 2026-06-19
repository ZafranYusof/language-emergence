import React, { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  History, ChevronLeft, ChevronRight, SkipBack, SkipForward,
  ArrowLeftRight, Play, Pause, Search, Filter, Gauge,
  X, Zap, Target, MessageSquare
} from 'lucide-react';
import SymbolVisualizer from './SymbolVisualizer';
import { getSymbolColor, stringToColorIndex } from '../utils/colors';
import { getMetrics, getConversations } from '../utils/api';

// ─── Mini sparkline / chart components (inline, no deps) ────────────────────

function MiniLineChart({ data, color = '#00ff88', width = 200, height = 40, label }) {
  if (!data || data.length < 2) return null;
  const min = Math.min(...data);
  const max = Math.max(...data);
  const range = max - min || 1;
  const points = data.map((v, i) => {
    const x = (i / (data.length - 1)) * width;
    const y = height - ((v - min) / range) * (height - 4) - 2;
    return `${x},${y}`;
  }).join(' ');
  return (
    <div className="flex flex-col items-center">
      {label && <span className="text-[10px] text-retro-muted mb-1 uppercase tracking-wider">{label}</span>}
      <svg width={width} height={height} className="overflow-visible">
        <defs>
          <linearGradient id={`grad-${color.replace('#','')}`} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={color} stopOpacity="0.3" />
            <stop offset="100%" stopColor={color} stopOpacity="0" />
          </linearGradient>
        </defs>
        <polyline
          points={points}
          fill="none"
          stroke={color}
          strokeWidth="1.5"
          strokeLinejoin="round"
        />
        <polygon
          points={`0,${height} ${points} ${width},${height}`}
          fill={`url(#grad-${color.replace('#','')})`}
        />
      </svg>
    </div>
  );
}

function MiniHistogram({ data, color = '#ffaa00', width = 200, height = 40, bins = 20, label }) {
  if (!data || data.length === 0) return null;
  const min = Math.min(...data);
  const max = Math.max(...data);
  const range = max - min || 1;
  const binCounts = new Array(bins).fill(0);
  data.forEach(v => {
    const idx = Math.min(bins - 1, Math.floor(((v - min) / range) * bins));
    binCounts[idx]++;
  });
  const maxCount = Math.max(...binCounts) || 1;
  const barW = width / bins;
  return (
    <div className="flex flex-col items-center">
      {label && <span className="text-[10px] text-retro-muted mb-1 uppercase tracking-wider">{label}</span>}
      <svg width={width} height={height}>
        {binCounts.map((c, i) => {
          const barH = (c / maxCount) * (height - 2);
          return (
            <rect
              key={i}
              x={i * barW + 1}
              y={height - barH}
              width={barW - 2}
              height={barH}
              fill={color}
              opacity={0.6}
              rx="1"
            />
          );
        })}
      </svg>
    </div>
  );
}

// ─── Feature shapes for detail panel ────────────────────────────────────────

function FeatureShape({ feature, index, isGuess }) {
  const colorIdx = typeof feature === 'number' ? feature : stringToColorIndex(String(feature));
  const color = getSymbolColor(colorIdx);
  const shapes = ['circle', 'square', 'diamond', 'triangle'];
  const shape = shapes[colorIdx % shapes.length];
  const size = 20;

  return (
    <div className="flex flex-col items-center gap-1">
      <div
        style={{
          width: size,
          height: size,
          backgroundColor: color,
          borderRadius: shape === 'circle' ? '50%' : shape === 'diamond' ? '2px' : '3px',
          transform: shape === 'diamond' ? 'rotate(45deg)' : shape === 'triangle' ? 'rotate(0)' : 'none',
          clipPath: shape === 'triangle' ? 'polygon(50% 0%, 0% 100%, 100% 100%)' : 'none',
          boxShadow: `0 0 8px ${color}80`,
          opacity: isGuess ? 0.7 : 1,
          border: isGuess ? '2px dashed rgba(255,255,255,0.4)' : '2px solid rgba(255,255,255,0.2)',
        }}
      />
      <span className="text-[9px] text-retro-muted font-mono">
        {typeof feature === 'number' ? `F${feature}` : feature}
      </span>
    </div>
  );
}

// ─── 3D Timeline Card ──────────────────────────────────────────────────────

function TimelineCard({ conv, index, focusIndex, total, onClick }) {
  const offset = index - focusIndex;
  const absOffset = Math.abs(offset);

  // Perspective math
  const zDepth = -absOffset * 120;
  const scale = Math.max(0.4, 1 - absOffset * 0.12);
  const opacity = Math.max(0.15, 1 - absOffset * 0.2);
  const rotY = offset * -5;
  const translateX = offset * 40;

  const isFocused = absOffset === 0;
  const isCorrect = conv.correct;

  return (
    <motion.div
      layout
      initial={false}
      animate={{
        scale,
        opacity,
        x: translateX,
        z: zDepth,
        rotateY: rotY,
      }}
      transition={{ type: 'spring', stiffness: 120, damping: 20 }}
      onClick={() => onClick(index)}
      className={`absolute cursor-pointer select-none ${isFocused ? 'z-30' : 'z-10'}`}
      style={{
        perspective: '800px',
        transformStyle: 'preserve-3d',
        left: '50%',
        marginLeft: '-140px',
        width: '280px',
      }}
    >
      <div
        className={`rounded-xl p-4 border transition-all duration-300 ${
          isFocused
            ? 'border-cyan-400/60 bg-steel-dark/95 shadow-[0_0_30px_rgba(0,221,255,0.3)]'
            : isCorrect
              ? 'border-neon-green/20 bg-steel-dark/70'
              : 'border-retro-error/20 bg-steel-dark/70'
        }`}
        style={{
          backdropFilter: 'blur(8px)',
          boxShadow: isFocused
            ? '0 0 40px rgba(0,221,255,0.25), 0 0 80px rgba(0,221,255,0.1), inset 0 1px 0 rgba(255,255,255,0.05)'
            : '0 4px 20px rgba(0,0,0,0.4)',
        }}
      >
        {/* Episode badge */}
        <div className="flex items-center justify-between mb-2">
          <span className="text-[10px] font-mono text-cyan-400 bg-cyan-400/10 px-2 py-0.5 rounded-full">
            EP {conv.episode?.toLocaleString() || '?'}
          </span>
          <span className={`text-sm font-bold ${isCorrect ? 'text-neon-green' : 'text-retro-error'}`}>
            {isCorrect ? '✓' : '✗'}
          </span>
        </div>

        {/* Message preview */}
        <div className="flex items-center gap-2 mt-1">
          <span className="text-[10px] text-retro-muted">MSG:</span>
          <SymbolVisualizer symbols={conv.message} size="sm" interactive={false} />
        </div>

        {/* Reward bar */}
        <div className="mt-2 flex items-center gap-2">
          <span className="text-[10px] text-retro-muted">RWD:</span>
          <div className="flex-1 h-1.5 bg-black/40 rounded-full overflow-hidden">
            <div
              className="h-full rounded-full transition-all duration-500"
              style={{
                width: `${Math.max(0, Math.min(100, (conv.reward || 0) * 100))}%`,
                background: isCorrect
                  ? 'linear-gradient(90deg, #22c55e, #00ff88)'
                  : 'linear-gradient(90deg, #ef4444, #f97316)',
              }}
            />
          </div>
          <span className="text-[10px] font-mono text-retro-muted">
            {(conv.reward || 0).toFixed(1)}
          </span>
        </div>

        {/* Listener choice */}
        <div className="mt-1.5">
          <span className="text-[10px] text-retro-muted">Choice: </span>
          <span className={`text-[11px] font-mono ${isCorrect ? 'text-neon-green' : 'text-retro-error'}`}>
            {conv.listener_choice || '?'}
          </span>
        </div>
      </div>
    </motion.div>
  );
}

// ─── Conversation Detail Panel ─────────────────────────────────────────────

function ConversationDetail({ conv, onClose }) {
  if (!conv) return null;

  const isCorrect = conv.correct;
  const targetFeatures = conv.target?.features || [];
  const listenerGuess = conv.listener_choice != null
    ? (typeof conv.listener_choice === 'object' ? conv.listener_choice : [conv.listener_choice])
    : [];

  return (
    <motion.div
      initial={{ opacity: 0, y: 20, scale: 0.95 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      exit={{ opacity: 0, y: 20, scale: 0.95 }}
      transition={{ type: 'spring', stiffness: 200, damping: 20 }}
      className="bg-steel-dark/95 rounded-2xl border border-steel-border p-6 backdrop-blur-lg shadow-2xl"
      style={{
        boxShadow: isCorrect
          ? '0 0 40px rgba(0,255,136,0.15), 0 0 80px rgba(0,255,136,0.05)'
          : '0 0 40px rgba(239,68,68,0.15), 0 0 80px rgba(239,68,68,0.05)',
      }}
    >
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-3">
          <span className="text-xs font-mono text-cyan-400 bg-cyan-400/10 px-2.5 py-1 rounded-full">
            Episode {conv.episode?.toLocaleString()}
          </span>
          <motion.div
            initial={{ scale: 0 }}
            animate={{ scale: 1 }}
            transition={{ delay: 0.2, type: 'spring', stiffness: 400 }}
            className={`text-lg font-bold ${isCorrect ? 'text-neon-green' : 'text-retro-error'}`}
          >
            {isCorrect ? '✓ CORRECT' : '✗ WRONG'}
          </motion.div>
        </div>
        <button
          onClick={onClose}
          className="p-1.5 rounded-lg text-retro-muted hover:text-white hover:bg-white/10 transition-colors"
        >
          <X size={16} />
        </button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* Target Features */}
        <div>
          <h4 className="text-xs text-retro-muted uppercase tracking-wider mb-3 flex items-center gap-2">
            <Target size={12} /> Target Features
          </h4>
          <div className="flex gap-3 flex-wrap">
            {targetFeatures.length > 0 ? targetFeatures.map((f, i) => (
              <FeatureShape key={i} feature={f} index={i} isGuess={false} />
            )) : <span className="text-xs text-retro-muted italic">No features</span>}
          </div>
        </div>

        {/* Listener Guess */}
        <div>
          <h4 className="text-xs text-retro-muted uppercase tracking-wider mb-3 flex items-center gap-2">
            <Zap size={12} /> Listener Guess
          </h4>
          <div className="flex gap-3 flex-wrap">
            {listenerGuess.length > 0 ? listenerGuess.map((f, i) => (
              <FeatureShape key={i} feature={f} index={i} isGuess={true} />
            )) : <span className="text-xs text-retro-muted italic">No guess</span>}
          </div>
        </div>

        {/* Messages */}
        <div>
          <h4 className="text-xs text-retro-muted uppercase tracking-wider mb-3 flex items-center gap-2">
            <MessageSquare size={12} /> Symbol Message
          </h4>
          <div className="bg-black/30 rounded-lg p-3">
            <SymbolVisualizer symbols={conv.message} size="md" interactive={true} />
            <div className="mt-2 text-[10px] font-mono text-retro-muted">
              Raw: [{(conv.message || []).join(', ')}]
            </div>
          </div>
        </div>

        {/* Reward & Details */}
        <div>
          <h4 className="text-xs text-retro-muted uppercase tracking-wider mb-3 flex items-center gap-2">
            <Gauge size={12} /> Reward & Details
          </h4>
          <div className="bg-black/30 rounded-lg p-3 space-y-2">
            <div className="flex justify-between">
              <span className="text-xs text-retro-muted">Reward</span>
              <span className={`text-sm font-bold font-mono ${isCorrect ? 'text-neon-green' : 'text-retro-error'}`}>
                {(conv.reward || 0).toFixed(2)}
              </span>
            </div>
            <div className="flex justify-between">
              <span className="text-xs text-retro-muted">Target Index</span>
              <span className="text-xs font-mono text-retro-text">{conv.target_index ?? '—'}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-xs text-retro-muted">Listener Choice</span>
              <span className="text-xs font-mono text-retro-text">{conv.listener_choice ?? '—'}</span>
            </div>
          </div>
        </div>
      </div>

      {/* Agent Mind State (if available) */}
      {(conv.thought_before || conv.thought_after || conv.speaker_emotion || conv.listener_emotion) && (
        <div className="mt-5 pt-4 border-t border-steel-border">
          <h4 className="text-xs text-retro-muted uppercase tracking-wider mb-3 flex items-center gap-2">
            🧠 Agent Mind State
          </h4>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {conv.thought_before && (
              <div className="bg-violet-500/10 border border-violet-500/20 rounded-lg p-3">
                <span className="text-[10px] text-violet-400 uppercase">Speaker Thought (Before)</span>
                <p className="text-xs text-retro-text mt-1">{conv.thought_before}</p>
              </div>
            )}
            {conv.thought_after && (
              <div className="bg-violet-500/10 border border-violet-500/20 rounded-lg p-3">
                <span className="text-[10px] text-violet-400 uppercase">Speaker Thought (After)</span>
                <p className="text-xs text-retro-text mt-1">{conv.thought_after}</p>
              </div>
            )}
            {conv.speaker_emotion && (
              <div className="bg-amber-500/10 border border-amber-500/20 rounded-lg p-3">
                <span className="text-[10px] text-amber-400 uppercase">Speaker Emotion</span>
                <p className="text-xs text-retro-text mt-1">
                  {typeof conv.speaker_emotion === 'object'
                    ? JSON.stringify(conv.speaker_emotion)
                    : conv.speaker_emotion}
                </p>
              </div>
            )}
            {conv.listener_emotion && (
              <div className="bg-cyan-500/10 border border-cyan-500/20 rounded-lg p-3">
                <span className="text-[10px] text-cyan-400 uppercase">Listener Emotion</span>
                <p className="text-xs text-retro-text mt-1">
                  {typeof conv.listener_emotion === 'object'
                    ? JSON.stringify(conv.listener_emotion)
                    : conv.listener_emotion}
                </p>
              </div>
            )}
          </div>
        </div>
      )}
    </motion.div>
  );
}

// ─── Main Component ────────────────────────────────────────────────────────

export default function ReplaySystem({ activeSession }) {
  const [metricsData, setMetricsData] = useState(null);
  const [conversationsData, setConversationsData] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [focusIndex, setFocusIndex] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);
  const [playSpeed, setPlaySpeed] = useState(1);
  const [filter, setFilter] = useState('all');
  const [searchEp, setSearchEp] = useState('');
  const [selectedConv, setSelectedConv] = useState(null);
  const [compareMode, setCompareMode] = useState(false);
  const [compareIndex, setCompareIndex] = useState(0);
  const timelineRef = useRef(null);

  const sessionId = activeSession?.session_id;

  // ── Data fetching (preserves original logic) ──

  useEffect(() => {
    if (!sessionId) {
      setLoading(false);
      return;
    }
    let cancelled = false;
    setLoading(true);
    setError(null);

    Promise.all([
      getMetrics(sessionId),
      getConversations(sessionId, 500),
    ])
      .then(([metrics, conversations]) => {
        if (cancelled) return;
        setMetricsData(metrics);
        setConversationsData(conversations);
        setFocusIndex(0);
        setCompareIndex(0);
      })
      .catch((err) => {
        if (cancelled) return;
        setError(err.message || 'Failed to load replay data');
      })
      .finally(() => {
        if (cancelled) return;
        setLoading(false);
      });

    return () => { cancelled = true; };
  }, [sessionId]);

  // ── Checkpoints (preserves original logic) ──

  const checkpoints = useMemo(() => {
    if (!metricsData || !metricsData.episodes.length) return [];
    const episodes = metricsData.episodes;
    const rewards = metricsData.rewards;
    const vocabSizes = metricsData.vocabSizes;
    const compositionality = metricsData.compositionality;

    return episodes.map((episode, i) => {
      const windowSize = Math.max(500, Math.ceil(
        episodes.length > 1 ? (episodes[episodes.length - 1] - episodes[0]) / 20 : 500
      ));
      const nearbyConvs = conversationsData.filter(
        (c) => Math.abs(c.episode - episode) <= windowSize
      );
      const successRate = nearbyConvs.length > 0
        ? nearbyConvs.filter((c) => c.correct).length / nearbyConvs.length
        : 0;

      return {
        episode,
        successRate,
        reward: rewards[i],
        vocabSize: vocabSizes[i],
        compositionality: compositionality[i],
        conversations: nearbyConvs.slice(0, 3).map((c, ci) => ({
          id: `${episode}-${ci}`,
          target: c.target,
          message: c.message,
          listener_choice: c.listener_choice,
          correct: c.correct,
          reward: c.reward,
          target_index: c.target_index,
          thought_before: c.thought_before,
          thought_after: c.thought_after,
          speaker_emotion: c.speaker_emotion,
          listener_emotion: c.listener_emotion,
        })),
      };
    });
  }, [metricsData, conversationsData]);

  // ── Filtered conversations for 3D timeline ──

  const filteredConversations = useMemo(() => {
    let filtered = conversationsData;
    if (filter === 'correct') filtered = filtered.filter(c => c.correct);
    else if (filter === 'wrong') filtered = filtered.filter(c => !c.correct);
    else if (filter === 'high_reward') filtered = filtered.filter(c => (c.reward || 0) >= 0.8);

    if (searchEp.trim()) {
      const ep = parseInt(searchEp, 10);
      if (!isNaN(ep)) filtered = filtered.filter(c => c.episode === ep);
    }
    return filtered;
  }, [conversationsData, filter, searchEp]);

  // ── Clamp index ──

  useEffect(() => {
    if (filteredConversations.length === 0) return;
    setFocusIndex(prev => Math.min(prev, filteredConversations.length - 1));
  }, [filteredConversations.length]);

  useEffect(() => {
    if (checkpoints.length === 0) return;
    setCompareIndex(prev => Math.min(prev, checkpoints.length - 1));
  }, [checkpoints.length]);

  // ── Auto-play ──

  useEffect(() => {
    if (!isPlaying || filteredConversations.length === 0) return;
    const ms = 800 / playSpeed;
    const interval = setInterval(() => {
      setFocusIndex(prev => {
        if (prev >= filteredConversations.length - 1) {
          setIsPlaying(false);
          return prev;
        }
        return prev + 1;
      });
    }, ms);
    return () => clearInterval(interval);
  }, [isPlaying, playSpeed, filteredConversations.length]);

  // ── Keyboard navigation ──

  useEffect(() => {
    const handler = (e) => {
      if (e.target.tagName === 'INPUT') return;
      if (e.key === 'ArrowLeft') setFocusIndex(p => Math.max(0, p - 1));
      if (e.key === 'ArrowRight') setFocusIndex(p => Math.min(filteredConversations.length - 1, p + 1));
      if (e.key === 'Enter') setSelectedConv(filteredConversations[focusIndex]);
      if (e.key === 'Escape') setSelectedConv(null);
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [filteredConversations, focusIndex]);

  // ── Scroll handler for 3D timeline ──

  const handleWheel = useCallback((e) => {
    e.preventDefault();
    const delta = Math.sign(e.deltaY);
    setFocusIndex(prev => Math.max(0, Math.min(filteredConversations.length - 1, prev + delta)));
  }, [filteredConversations.length]);

  // ── Accuracy running data for chart ──

  const accuracyData = useMemo(() => {
    const windowSize = Math.max(1, Math.floor(filteredConversations.length / 40));
    const result = [];
    for (let i = 0; i < filteredConversations.length; i += windowSize) {
      const slice = filteredConversations.slice(i, i + windowSize);
      const acc = slice.filter(c => c.correct).length / slice.length;
      result.push(acc);
    }
    return result;
  }, [filteredConversations]);

  const rewardData = useMemo(() =>
    filteredConversations.map(c => c.reward || 0),
    [filteredConversations]
  );

  // ── Loading / Error / Empty states ──

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-center">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-500 mx-auto mb-3" />
          <p className="text-sm text-retro-muted">Loading replay data...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-center">
          <p className="text-retro-error mb-2">Failed to load replay data</p>
          <p className="text-sm text-retro-muted">{error}</p>
        </div>
      </div>
    );
  }

  if (!sessionId || (checkpoints.length === 0 && conversationsData.length === 0)) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-center">
          <History className="mx-auto mb-3 text-retro-muted" size={32} />
          <p className="text-retro-muted">No training data available</p>
          <p className="text-sm text-retro-muted mt-1">Start a training session to generate replay data</p>
        </div>
      </div>
    );
  }

  const current = checkpoints[Math.min(focusIndex, checkpoints.length - 1)] || checkpoints[0];
  const compare = compareMode ? checkpoints[Math.min(compareIndex, checkpoints.length - 1)] : null;

  const pct = filteredConversations.length > 1
    ? (focusIndex / (filteredConversations.length - 1)) * 100
    : 0;

  const maxEpisode = checkpoints.length > 0
    ? checkpoints[checkpoints.length - 1].episode
    : 0;
  const tickCount = 5;
  const ticks = Array.from({ length: tickCount + 1 }, (_, i) => {
    const ep = Math.round((maxEpisode / tickCount) * i);
    return ep >= 1000 ? `${(ep / 1000).toFixed(0)}k` : String(ep);
  });

  const currentConv = filteredConversations[focusIndex];

  return (
    <div className="space-y-4 animate-slide-in">
      {/* ── Header ── */}
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div>
          <h1 className="text-2xl font-bold">Replay System</h1>
          <p className="text-sm text-retro-muted mt-1">3D Timeline · {filteredConversations.length} conversations</p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setCompareMode(!compareMode)}
            className={`flex items-center gap-2 px-3 py-1.5 rounded-lg text-sm transition-colors ${
              compareMode
                ? 'bg-violet-500/20 text-violet-400 border border-violet-500/50'
                : 'bg-steel-dark text-retro-muted border border-steel-border'
            }`}
          >
            <ArrowLeftRight size={14} />
            Compare
          </button>
        </div>
      </div>

      {/* ── Visual Metrics Row ── */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
        <div className="bg-steel-dark rounded-xl p-3 border border-steel-border">
          <MiniLineChart data={accuracyData} color="#00ff88" label="Running Accuracy" width={180} height={36} />
        </div>
        <div className="bg-steel-dark rounded-xl p-3 border border-steel-border">
          <MiniHistogram data={rewardData} color="#ffaa00" label="Reward Distribution" width={180} height={36} />
        </div>
        <div className="bg-steel-dark rounded-xl p-3 border border-steel-border text-center">
          <span className="text-[10px] text-retro-muted uppercase tracking-wider">Current Episode</span>
          <p className="text-xl font-bold text-cyan-400 mt-1">{currentConv?.episode?.toLocaleString() || '—'}</p>
        </div>
        <div className="bg-steel-dark rounded-xl p-3 border border-steel-border text-center">
          <span className="text-[10px] text-retro-muted uppercase tracking-wider">Session Accuracy</span>
          <p className="text-xl font-bold text-neon-green mt-1">
            {filteredConversations.length > 0
              ? `${((filteredConversations.filter(c => c.correct).length / filteredConversations.length) * 100).toFixed(1)}%`
              : '—'}
          </p>
        </div>
      </div>

      {/* ── Timeline Controls ── */}
      <div className="bg-steel-dark rounded-xl p-4 border border-steel-border space-y-3">
        {/* Row 1: Playback + Filter + Search */}
        <div className="flex items-center flex-wrap gap-3">
          {/* Transport controls */}
          <div className="flex items-center gap-1">
            <button onClick={() => setFocusIndex(0)} className="p-1.5 rounded-lg text-retro-muted hover:text-white hover:bg-white/10 transition-all">
              <SkipBack size={16} />
            </button>
            <button onClick={() => setFocusIndex(Math.max(0, focusIndex - 1))} className="p-1.5 rounded-lg text-retro-muted hover:text-white hover:bg-white/10 transition-all">
              <ChevronLeft size={16} />
            </button>
            <button
              onClick={() => setIsPlaying(!isPlaying)}
              className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-all flex items-center gap-1.5 ${
                isPlaying
                  ? 'bg-red-500/20 text-retro-error ring-1 ring-red-500/30'
                  : 'bg-neon-green/20 text-neon-green ring-1 ring-emerald-500/30'
              }`}
            >
              {isPlaying ? <><Pause size={14} /> Pause</> : <><Play size={14} /> Play</>}
            </button>
            <button onClick={() => setFocusIndex(Math.min(filteredConversations.length - 1, focusIndex + 1))} className="p-1.5 rounded-lg text-retro-muted hover:text-white hover:bg-white/10 transition-all">
              <ChevronRight size={16} />
            </button>
            <button onClick={() => setFocusIndex(filteredConversations.length - 1)} className="p-1.5 rounded-lg text-retro-muted hover:text-white hover:bg-white/10 transition-all">
              <SkipForward size={16} />
            </button>
          </div>

          {/* Speed control */}
          <div className="flex items-center gap-1 bg-black/30 rounded-lg px-2 py-1">
            <Gauge size={12} className="text-retro-muted" />
            {[0.5, 1, 2].map(s => (
              <button
                key={s}
                onClick={() => setPlaySpeed(s)}
                className={`px-2 py-0.5 rounded text-xs font-mono transition-colors ${
                  playSpeed === s ? 'bg-cyan-400/20 text-cyan-400' : 'text-retro-muted hover:text-white'
                }`}
              >
                {s}x
              </button>
            ))}
          </div>

          {/* Divider */}
          <div className="h-6 w-px bg-steel-border" />

          {/* Filter */}
          <div className="flex items-center gap-1 bg-black/30 rounded-lg px-2 py-1">
            <Filter size={12} className="text-retro-muted" />
            {[
              { key: 'all', label: 'All' },
              { key: 'correct', label: '✓' },
              { key: 'wrong', label: '✗' },
              { key: 'high_reward', label: '★' },
            ].map(f => (
              <button
                key={f.key}
                onClick={() => { setFilter(f.key); setFocusIndex(0); }}
                className={`px-2 py-0.5 rounded text-xs transition-colors ${
                  filter === f.key
                    ? f.key === 'correct' ? 'bg-neon-green/20 text-neon-green'
                      : f.key === 'wrong' ? 'bg-red-500/20 text-retro-error'
                      : f.key === 'high_reward' ? 'bg-amber-500/20 text-amber-400'
                      : 'bg-cyan-400/20 text-cyan-400'
                    : 'text-retro-muted hover:text-white'
                }`}
              >
                {f.label}
              </button>
            ))}
          </div>

          {/* Search */}
          <div className="flex items-center gap-1 bg-black/30 rounded-lg px-2 py-1 ml-auto">
            <Search size={12} className="text-retro-muted" />
            <input
              type="number"
              value={searchEp}
              onChange={(e) => { setSearchEp(e.target.value); setFocusIndex(0); }}
              placeholder="Episode #"
              className="bg-transparent text-xs text-retro-text w-24 outline-none placeholder:text-retro-muted/50"
            />
            {searchEp && (
              <button onClick={() => setSearchEp('')} className="text-retro-muted hover:text-white">
                <X size={12} />
              </button>
            )}
          </div>

          {/* Position indicator */}
          <span className="text-xs text-retro-muted font-mono">
            {focusIndex + 1} / {filteredConversations.length}
          </span>
        </div>

        {/* Row 2: Scrubber bar */}
        <div className="space-y-1.5">
          <div
            className="relative w-full bg-black/40 rounded-full h-2.5 cursor-pointer group"
            onClick={(e) => {
              const rect = e.currentTarget.getBoundingClientRect();
              const x = e.clientX - rect.left;
              const idx = Math.floor((x / rect.width) * (filteredConversations.length - 1));
              setFocusIndex(Math.max(0, Math.min(filteredConversations.length - 1, idx)));
            }}
          >
            <motion.div
              className="bg-gradient-to-r from-cyan-600 to-cyan-400 h-full rounded-full relative"
              animate={{ width: `${pct}%` }}
              transition={{ duration: 0.1, ease: 'easeOut' }}
            >
              <div className="absolute right-0 top-1/2 -translate-y-1/2 w-3.5 h-3.5 bg-white rounded-full shadow-lg shadow-cyan-500/30 opacity-0 group-hover:opacity-100 transition-opacity scale-75 group-hover:scale-100 transform" />
            </motion.div>
            {compareMode && compare && checkpoints.length > 1 && (
              <div
                className="absolute top-0 w-0.5 h-full bg-violet-400 rounded-full"
                style={{ left: `${(compareIndex / (checkpoints.length - 1)) * 100}%` }}
              />
            )}
          </div>
          <div className="flex justify-between">
            {ticks.map((label, i) => (
              <span key={i} className="text-[10px] text-retro-muted font-mono">{label}</span>
            ))}
          </div>
        </div>
      </div>

      {/* ── 3D Timeline Stage ── */}
      <div
        ref={timelineRef}
        onWheel={handleWheel}
        className="relative overflow-hidden rounded-2xl border border-steel-border"
        style={{
          height: '340px',
          perspective: '1000px',
          perspectiveOrigin: '50% 50%',
          background: `
            radial-gradient(ellipse at 50% 50%, rgba(0,221,255,0.04) 0%, transparent 70%),
            linear-gradient(180deg, #0a0a1a 0%, #0d0d24 100%)
          `,
        }}
      >
        {/* Parallax background grid */}
        <div
          className="absolute inset-0 pointer-events-none opacity-[0.07]"
          style={{
            backgroundImage: `
              linear-gradient(rgba(0,221,255,0.5) 1px, transparent 1px),
              linear-gradient(90deg, rgba(0,221,255,0.5) 1px, transparent 1px)
            `,
            backgroundSize: '40px 40px',
            transform: `translateY(${(focusIndex * 2) % 40}px)`,
            transition: 'transform 0.3s ease-out',
          }}
        />

        {/* Depth fade overlays */}
        <div className="absolute inset-y-0 left-0 w-24 bg-gradient-to-r from-[#0a0a1a] to-transparent z-20 pointer-events-none" />
        <div className="absolute inset-y-0 right-0 w-24 bg-gradient-to-l from-[#0a0a1a] to-transparent z-20 pointer-events-none" />

        {/* 3D card container */}
        <div
          className="absolute inset-0 flex items-center justify-center"
          style={{
            transformStyle: 'preserve-3d',
          }}
        >
          {filteredConversations.length === 0 ? (
            <p className="text-retro-muted text-sm">No conversations match filter</p>
          ) : (
            filteredConversations.slice(
              Math.max(0, focusIndex - 8),
              Math.min(filteredConversations.length, focusIndex + 9)
            ).map((conv, i) => {
              const realIndex = Math.max(0, focusIndex - 8) + i;
              return (
                <TimelineCard
                  key={conv.episode + '-' + realIndex}
                  conv={conv}
                  index={realIndex}
                  focusIndex={focusIndex}
                  total={filteredConversations.length}
                  onClick={(idx) => {
                    if (idx === focusIndex) {
                      setSelectedConv(filteredConversations[idx]);
                    } else {
                      setFocusIndex(idx);
                    }
                  }}
                />
              );
            })
          )}
        </div>

        {/* Focus ring indicator */}
        <div className="absolute bottom-3 left-1/2 -translate-x-1/2 z-20 flex items-center gap-2">
          <span className="text-[10px] text-cyan-400/60 font-mono bg-black/40 px-2 py-0.5 rounded-full backdrop-blur">
            ← scroll or arrow keys →
          </span>
        </div>
      </div>

      {/* ── Detail Panel (expand on click / enter) ── */}
      <AnimatePresence>
        {selectedConv && (
          <ConversationDetail conv={selectedConv} onClose={() => setSelectedConv(null)} />
        )}
      </AnimatePresence>

      {/* ── Snapshot Metrics (preserved) ── */}
      {current && (
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          {[
            { label: 'Success Rate', value: `${((current.successRate || 0) * 100).toFixed(1)}%`, color: 'text-neon-green' },
            { label: 'Vocabulary Size', value: current.vocabSize ?? '—', color: 'text-violet-400' },
            { label: 'Compositionality', value: (current.compositionality ?? 0).toFixed(3), color: 'text-cyber-cyan' },
          ].map(m => (
            <div key={m.label} className="bg-steel-dark rounded-xl p-4 border border-steel-border text-center">
              <p className="text-xs text-retro-muted uppercase tracking-wider">{m.label}</p>
              <p className={`text-2xl font-bold mt-1 ${m.color}`}>{m.value}</p>
            </div>
          ))}
        </div>
      )}

      {/* ── Conversation Snapshots (preserved from original) ── */}
      {current && (
        <div className={`grid ${compareMode ? 'grid-cols-2' : 'grid-cols-1'} gap-6`}>
          <div>
            <h3 className="text-sm font-medium text-retro-muted mb-3">
              Episode {current.episode?.toLocaleString()} Conversations
            </h3>
            <AnimatePresence mode="wait">
              <motion.div
                key={current.episode}
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -8 }}
                transition={{ duration: 0.2 }}
                className="space-y-3"
              >
                {current.conversations.length === 0 && (
                  <p className="text-sm text-retro-muted italic">No conversations recorded near this episode</p>
                )}
                {current.conversations.map((conv, ci) => (
                  <motion.div
                    key={conv.id}
                    initial={{ opacity: 0, x: -10 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ delay: ci * 0.06 }}
                    className="bg-steel-dark rounded-lg p-4 border border-steel-border hover:border-steel-border transition-colors"
                  >
                    <div className="flex items-center justify-between mb-2">
                      <div className="flex gap-1">
                        {(conv.target?.features || []).map((f, fi) => (
                          <span key={fi} className="text-xs bg-blue-500/20 text-blue-300 px-1.5 py-0.5 rounded font-mono">
                            {f}
                          </span>
                        ))}
                      </div>
                      <span className={`text-xs ${conv.correct ? 'text-neon-green' : 'text-retro-error'}`}>
                        {conv.correct ? '✓' : '✗'}
                      </span>
                    </div>
                    <div className="flex items-center gap-3 mt-2">
                      <span className="text-xs text-retro-muted">Message:</span>
                      <SymbolVisualizer symbols={conv.message} size="sm" />
                    </div>
                    <div className="mt-1.5">
                      <span className="text-xs text-retro-muted">Choice: </span>
                      <span className={`text-xs font-mono ${conv.correct ? 'text-neon-green' : 'text-retro-error'}`}>
                        {conv.listener_choice}
                      </span>
                    </div>
                  </motion.div>
                ))}
              </motion.div>
            </AnimatePresence>
          </div>

          {compareMode && compare && (
            <div>
              <h3 className="text-sm font-medium text-retro-muted mb-3">
                Episode {compare.episode?.toLocaleString()} Conversations
              </h3>
              <AnimatePresence mode="wait">
                <motion.div
                  key={compare.episode}
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -8 }}
                  transition={{ duration: 0.2 }}
                  className="space-y-3"
                >
                  {compare.conversations.length === 0 && (
                    <p className="text-sm text-retro-muted italic">No conversations recorded near this episode</p>
                  )}
                  {compare.conversations.map((conv, ci) => (
                    <motion.div
                      key={conv.id}
                      initial={{ opacity: 0, x: -10 }}
                      animate={{ opacity: 1, x: 0 }}
                      transition={{ delay: ci * 0.06 }}
                      className="bg-steel-dark rounded-lg p-4 border border-steel-border hover:border-steel-border transition-colors"
                    >
                      <div className="flex items-center justify-between mb-2">
                        <div className="flex gap-1">
                          {(conv.target?.features || []).map((f, fi) => (
                            <span key={fi} className="text-xs bg-blue-500/20 text-blue-300 px-1.5 py-0.5 rounded font-mono">
                              {f}
                            </span>
                          ))}
                        </div>
                        <span className={`text-xs ${conv.correct ? 'text-neon-green' : 'text-retro-error'}`}>
                          {conv.correct ? '✓' : '✗'}
                        </span>
                      </div>
                      <div className="flex items-center gap-3 mt-2">
                        <span className="text-xs text-retro-muted">Message:</span>
                        <SymbolVisualizer symbols={conv.message} size="sm" />
                      </div>
                      <div className="mt-1.5">
                        <span className="text-xs text-retro-muted">Choice: </span>
                        <span className={`text-xs font-mono ${conv.correct ? 'text-neon-green' : 'text-retro-error'}`}>
                          {conv.listener_choice}
                        </span>
                      </div>
                    </motion.div>
                  ))}
                </motion.div>
              </AnimatePresence>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
