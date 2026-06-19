import React, { useRef, useEffect, useState, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Radio, Check, X, Clock, Wifi, WifiOff, Search, Filter, SlidersHorizontal } from 'lucide-react';
import SymbolVisualizer from './SymbolVisualizer';
import VoiceControls from './VoiceControls';
import { getSymbolColor, stringToColorIndex } from '../utils/colors';

// ─── ObjectVisual: renders a colored shape from a feature array ───
// features: [shape, size, color_r, color_g, color_b, texture, position, rotation]
function ObjectVisual({ features, size = 40, borderColor, title }) {
  if (!features || features.length === 0) return null;

  const shapeIdx = Math.floor((features[0] || 0) * 5);  // 0-4 shape index
  const scale = 0.5 + (features[1] || 0.5) * 1.0;        // size scaling
  const r = Math.round((features[2] || 0.5) * 255);       // red
  const g = Math.round((features[3] || 0.5) * 255);       // green
  const b = Math.round((features[4] || 0.5) * 255);       // blue
  const rotation = (features[7] || 0) * 360;               // rotation

  const shapeStyles = [
    '50%',              // circle
    '0%',               // square
    '0%',               // triangle (handled via clip-path)
    '50%',              // diamond (rotated square)
    '8px 8px 0% 0%',   // rounded-corner square
  ];
  const borderRadius = shapeStyles[shapeIdx] || '50%';
  const isTriangle = shapeIdx === 2;
  const isDiamond = shapeIdx === 3;

  const shapeSize = size * scale * 0.8;
  const bgColor = `rgb(${r}, ${g}, ${b})`;

  // Tooltip text for hover details
  const tooltipText = features.map((f, i) => {
    const labels = ['shape', 'size', 'R', 'G', 'B', 'texture', 'pos', 'rot'];
    return `${labels[i]}: ${typeof f === 'number' ? f.toFixed(2) : f}`;
  }).join('\n');

  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        gap: 4,
      }}
      title={tooltipText}
    >
      {title && (
        <span style={{
          fontSize: '9px',
          fontFamily: "'JetBrains Mono', monospace",
          letterSpacing: '0.1em',
          textTransform: 'uppercase',
          color: borderColor || '#888',
          fontWeight: 600,
        }}>
          {title}
        </span>
      )}
      <div style={{
        width: size,
        height: size,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        border: `2px solid ${borderColor || '#333'}`,
        borderRadius: 6,
        backgroundColor: 'rgba(10,10,10,0.6)',
      }}>
        <div style={{
          width: shapeSize,
          height: shapeSize,
          borderRadius: isTriangle ? '0%' : (isDiamond ? '0%' : borderRadius),
          backgroundColor: isTriangle ? 'transparent' : bgColor,
          border: isTriangle ? 'none' : `2px solid rgba(255,255,255,0.25)`,
          transform: `rotate(${isDiamond ? 45 : rotation}deg)`,
          transition: 'all 0.3s',
          clipPath: isTriangle
            ? 'polygon(50% 0%, 0% 100%, 100% 100%)'
            : 'none',
          backgroundImage: isTriangle
            ? `linear-gradient(135deg, ${bgColor}, ${bgColor})`
            : 'none',
          backgroundClip: isTriangle ? 'content-box' : 'border-box',
          ...(isTriangle ? {
            backgroundColor: bgColor,
            borderRadius: '0%',
            clipPath: 'polygon(50% 0%, 0% 100%, 100% 100%)',
          } : {}),
        }} />
      </div>
    </div>
  );
}

export default function LiveFeed({ conversations, isConnected, isTraining }) {
  const scrollRef = useRef(null);
  const [symbolFreq, setSymbolFreq] = useState({});
  const [searchText, setSearchText] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [showFilters, setShowFilters] = useState(false);
  const [episodeMin, setEpisodeMin] = useState('');
  const [episodeMax, setEpisodeMax] = useState('');
  const [rewardThreshold, setRewardThreshold] = useState('');
  const [messagePattern, setMessagePattern] = useState('');
  const [autoSpeak, setAutoSpeak] = useState(false);
  const prevConvCountRef = useRef(0);

  // Debounce search input
  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedSearch(searchText);
    }, 300);
    return () => clearTimeout(timer);
  }, [searchText]);

  // Track symbol frequencies
  useEffect(() => {
    const freq = {};
    conversations.forEach(conv => {
      (conv.message || []).forEach(s => {
        const key = String(s);
        freq[key] = (freq[key] || 0) + 1;
      });
    });
    setSymbolFreq(freq);
  }, [conversations]);

  // Auto-scroll on new messages
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = 0;
    }
  }, [conversations.length]);

  // Auto-speak new conversations
  useEffect(() => {
    if (!autoSpeak || !('speechSynthesis' in window)) return;
    if (conversations.length > prevConvCountRef.current && conversations.length > 0) {
      const latest = conversations[0]; // newest first
      if (latest) {
        const thought = latest.thought_before || '';
        const symbols = (latest.message || []).join(' ');
        const result = latest.correct ? 'correct' : 'wrong';
        const text = `Agent says: ${thought}. Message sent: ${symbols}. Result: ${result}`;
        window.speechSynthesis.cancel();
        const utterance = new SpeechSynthesisUtterance(text);
        utterance.rate = 1.0;
        utterance.pitch = 1.0;
        utterance.volume = 0.7;
        window.speechSynthesis.speak(utterance);
      }
    }
    prevConvCountRef.current = conversations.length;
  }, [conversations.length, autoSpeak]);

  // Filter conversations
  const filteredConversations = useMemo(() => {
    return conversations.filter(conv => {
      // Text search (in message symbols or target features)
      if (debouncedSearch) {
        const search = debouncedSearch.toLowerCase();
        const msgStr = (conv.message || []).join(' ').toLowerCase();
        const featureStr = (conv.target?.features || []).join(' ').toLowerCase();
        if (!msgStr.includes(search) && !featureStr.includes(search)) return false;
      }

      // Episode range filter
      if (episodeMin && conv.episode < parseInt(episodeMin)) return false;
      if (episodeMax && conv.episode > parseInt(episodeMax)) return false;

      // Reward threshold
      if (rewardThreshold && (conv.reward ?? 0) < parseFloat(rewardThreshold)) return false;

      // Message pattern
      if (messagePattern) {
        const pattern = messagePattern.toLowerCase();
        const msgStr = (conv.message || []).join(' ').toLowerCase();
        if (!msgStr.includes(pattern)) return false;
      }

      return true;
    });
  }, [conversations, debouncedSearch, episodeMin, episodeMax, rewardThreshold, messagePattern]);

  const activeFilterCount = [episodeMin, episodeMax, rewardThreshold, messagePattern].filter(Boolean).length;

  return (
    <div className="space-y-6 animate-slide-in">
      <div className="flex items-center justify-between flex-wrap gap-4">
        <div>
          <h1 className="text-2xl font-bold section-header font-heading uppercase tracking-wider">LIVE FEED</h1>
          <p className="text-sm text-retro-muted mt-1">Real-time agent communication</p>
        </div>
        <div className="flex items-center gap-3 flex-wrap">
          <div className={`flex items-center gap-1.5 text-xs font-mono ${isConnected ? 'text-retro-text' : 'text-retro-muted'}`}>
            <span className={isConnected ? 'led-dot' : 'led-dot-red'} />
            <span>{isConnected ? 'Connected' : 'Disconnected'}</span>
          </div>
          {isTraining && (
            <div className="flex items-center gap-2 text-xs text-neon-green bg-neon-green/10 px-2.5 py-1 rounded-full border border-neon-green/20">
              <span className="led-dot" />
              <span className="font-medium">LIVE</span>
            </div>
          )}
        </div>
      </div>

      {/* Voice Controls */}
      <VoiceControls autoSpeak={autoSpeak} onAutoSpeakChange={setAutoSpeak} />

      {/* Search & Filter Bar */}
      <div className="retro-card rounded-xl p-4 space-y-3">
        <div className="flex items-center gap-3">
          <div className="relative flex-1">
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-retro-muted" />
            <input
              type="text"
              value={searchText}
              onChange={e => setSearchText(e.target.value)}
              placeholder="Search messages or features..."
              className="w-full bg-retro-bg border border-steel-border rounded-lg pl-9 pr-4 py-2 text-sm text-retro-text placeholder-retro-muted focus:border-neon-green focus:outline-none transition-colors"
            />
          </div>
          <button
            onClick={() => setShowFilters(!showFilters)}
            className={`flex items-center gap-2 px-3 py-2 rounded-lg text-sm transition-colors border ${
              showFilters || activeFilterCount > 0
                ? 'bg-neon-green/10 border-neon-green/30 text-neon-green'
                : 'bg-retro-bg border-steel-border text-retro-muted hover:text-retro-text'
            }`}
          >
            <SlidersHorizontal size={14} />
            Filters
            {activeFilterCount > 0 && (
              <span className="bg-neon-green/20 text-neon-green text-[10px] rounded-full w-4 h-4 flex items-center justify-center">
                {activeFilterCount}
              </span>
            )}
          </button>
        </div>

        {/* Expandable Filters */}
        <AnimatePresence>
          {showFilters && (
            <motion.div
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: 'auto', opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              transition={{ duration: 0.2 }}
              className="overflow-hidden"
            >
              <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-3 pt-3 border-t border-steel-border">
                <div>
                  <label className="text-[10px] text-retro-muted uppercase tracking-wider font-medium mb-1 block">Episode Min</label>
                  <input
                    type="number"
                    value={episodeMin}
                    onChange={e => setEpisodeMin(e.target.value)}
                    placeholder="0"
                    className="w-full bg-retro-bg border border-steel-border rounded-lg px-3 py-1.5 text-sm text-retro-text focus:border-neon-green focus:outline-none"
                  />
                </div>
                <div>
                  <label className="text-[10px] text-retro-muted uppercase tracking-wider font-medium mb-1 block">Episode Max</label>
                  <input
                    type="number"
                    value={episodeMax}
                    onChange={e => setEpisodeMax(e.target.value)}
                    placeholder="∞"
                    className="w-full bg-retro-bg border border-steel-border rounded-lg px-3 py-1.5 text-sm text-retro-text focus:border-neon-green focus:outline-none"
                  />
                </div>
                <div>
                  <label className="text-[10px] text-retro-muted uppercase tracking-wider font-medium mb-1 block">Min Reward</label>
                  <input
                    type="number"
                    step="0.1"
                    min="0"
                    max="1"
                    value={rewardThreshold}
                    onChange={e => setRewardThreshold(e.target.value)}
                    placeholder="0"
                    className="w-full bg-retro-bg border border-steel-border rounded-lg px-3 py-1.5 text-sm text-retro-text focus:border-neon-green focus:outline-none"
                  />
                </div>
                <div>
                  <label className="text-[10px] text-retro-muted uppercase tracking-wider font-medium mb-1 block">Message Pattern</label>
                  <input
                    type="text"
                    value={messagePattern}
                    onChange={e => setMessagePattern(e.target.value)}
                    placeholder="e.g. α β"
                    className="w-full bg-retro-bg border border-steel-border rounded-lg px-3 py-1.5 text-sm text-retro-text focus:border-neon-green focus:outline-none"
                  />
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Active filters summary */}
        {(debouncedSearch || activeFilterCount > 0) && (
          <div className="flex items-center gap-2 text-xs text-retro-muted">
            <Filter size={12} />
            <span>
              Showing {filteredConversations.length} of {conversations.length} conversations
            </span>
            <button
              onClick={() => {
                setSearchText('');
                setEpisodeMin('');
                setEpisodeMax('');
                setRewardThreshold('');
                setMessagePattern('');
              }}
              className="text-neon-green hover:text-neon-green/80 ml-2"
            >
              Clear all
            </button>
          </div>
        )}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Conversation Stream */}
        <div className="lg:col-span-2 space-y-3">
          <h3 className="text-sm font-medium text-retro-muted font-heading uppercase tracking-wider">
            Conversation Stream
            {filteredConversations.length !== conversations.length && (
              <span className="text-retro-muted ml-2">({filteredConversations.length} filtered)</span>
            )}
          </h3>
          <div ref={scrollRef} className="space-y-3 max-h-[600px] overflow-y-auto pr-2">
            <AnimatePresence mode="popLayout">
              {filteredConversations.map((conv, i) => (
                <motion.div
                  key={conv.id || i}
                  initial={{ opacity: 0, x: -20 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0 }}
                  className={`
                    retro-card rounded-lg p-4 border-l-4
                    ${conv.correct ? 'border-l-neon-green' : 'border-l-retro-error'}
                  `}
                >
                  <div className="flex items-start justify-between mb-2">
                    <div className="flex items-center gap-2">
                      <span className="text-xs text-retro-muted font-mono">EP {conv.episode}</span>
                      <Clock size={12} className="text-retro-muted" />
                    </div>
                    <span className={`flex items-center gap-1 text-xs ${conv.correct ? 'text-neon-green' : 'text-retro-error'}`}>
                      {conv.correct ? <Check size={12} /> : <X size={12} />}
                      {conv.correct ? 'Correct' : 'Wrong'}
                    </span>
                  </div>

                  <div className="flex items-center gap-3 mt-3">
                    {/* Speaker Target Object */}
                    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
                      {conv.target?.features && conv.target.features.length > 0 ? (
                        <ObjectVisual
                          features={conv.target.features}
                          size={44}
                          borderColor="#00ddff"
                          title="TARGET"
                        />
                      ) : (
                        <span className="text-xs text-retro-muted font-mono">—</span>
                      )}
                      {conv.speaker_emotion && (
                        <span
                          className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded-full font-mono mt-1"
                          style={{
                            backgroundColor: (conv.speaker_emotion.color || '#888') + '22',
                            color: conv.speaker_emotion.color || '#888',
                            fontSize: '9px',
                            lineHeight: '12px',
                          }}
                        >
                          {conv.speaker_emotion.emoji} {conv.speaker_emotion.mood}
                        </span>
                      )}
                    </div>

                    {/* Arrow */}
                    <span style={{
                      fontSize: '18px',
                      color: conv.correct ? '#00ff88' : '#ff4444',
                      lineHeight: 1,
                      fontWeight: 'bold',
                    }}>→</span>

                    {/* Message */}
                    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4 }}>
                      <span style={{
                        fontSize: '9px',
                        fontFamily: "'JetBrains Mono', monospace",
                        letterSpacing: '0.1em',
                        textTransform: 'uppercase',
                        color: '#888',
                        fontWeight: 600,
                      }}>MESSAGE</span>
                      <SymbolVisualizer symbols={conv.message} size="sm" />
                    </div>

                    {/* Arrow */}
                    <span style={{
                      fontSize: '18px',
                      color: conv.correct ? '#00ff88' : '#ff4444',
                      lineHeight: 1,
                      fontWeight: 'bold',
                    }}>→</span>

                    {/* Listener Choice Object */}
                    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
                      {conv.listener_choice_features && conv.listener_choice_features.length > 0 ? (
                        <ObjectVisual
                          features={conv.listener_choice_features}
                          size={44}
                          borderColor={conv.correct ? '#00ff88' : '#ff4444'}
                          title="CHOICE"
                        />
                      ) : (
                        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4 }}>
                          <span style={{
                            fontSize: '9px',
                            fontFamily: "'JetBrains Mono', monospace",
                            letterSpacing: '0.1em',
                            textTransform: 'uppercase',
                            color: conv.correct ? '#00ff88' : '#ff4444',
                            fontWeight: 600,
                          }}>CHOICE</span>
                          <div style={{
                            width: 44,
                            height: 44,
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            border: `2px solid ${conv.correct ? '#00ff88' : '#ff4444'}`,
                            borderRadius: 6,
                            backgroundColor: 'rgba(10,10,10,0.6)',
                          }}>
                            <span style={{
                              fontFamily: "'JetBrains Mono', monospace",
                              fontSize: '16px',
                              fontWeight: 'bold',
                              color: conv.correct ? '#00ff88' : '#ff4444',
                            }}>
                              {conv.listener_choice ?? '—'}
                            </span>
                          </div>
                        </div>
                      )}
                      {conv.listener_emotion && (
                        <span
                          className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded-full font-mono mt-1"
                          style={{
                            backgroundColor: (conv.listener_emotion.color || '#888') + '22',
                            color: conv.listener_emotion.color || '#888',
                            fontSize: '9px',
                            lineHeight: '12px',
                          }}
                        >
                          {conv.listener_emotion.emoji} {conv.listener_emotion.mood}
                        </span>
                      )}
                    </div>

                    {/* Correct/Wrong Badge */}
                    <span
                      className="inline-flex items-center gap-1 px-2 py-1 rounded font-mono font-bold"
                      style={{
                        fontSize: '10px',
                        letterSpacing: '0.05em',
                        backgroundColor: conv.correct ? 'rgba(0,255,136,0.12)' : 'rgba(255,68,68,0.12)',
                        color: conv.correct ? '#00ff88' : '#ff4444',
                        border: `1px solid ${conv.correct ? 'rgba(0,255,136,0.3)' : 'rgba(255,68,68,0.3)'}`,
                      }}
                    >
                      {conv.correct ? <Check size={10} /> : <X size={10} />}
                      {conv.correct ? 'CORRECT' : 'WRONG'}
                    </span>
                  </div>

                  {/* Expandable raw feature numbers */}
                  <details className="mt-2">
                    <summary className="text-[10px] text-retro-muted cursor-pointer hover:text-retro-text transition-colors font-mono uppercase tracking-wider">
                      Raw Features
                    </summary>
                    <div className="grid grid-cols-2 gap-4 mt-2">
                      <div>
                        <span className="text-[9px] text-retro-muted font-mono uppercase tracking-wider">Target:</span>
                        <div className="flex flex-wrap gap-1 mt-1">
                          {(conv.target?.features || []).map((f, fi) => (
                            <span key={fi} className="text-[10px] bg-cyber-cyan/20 text-cyber-cyan px-1 py-0.5 rounded font-mono">
                              {typeof f === 'number' ? f.toFixed(2) : f}
                            </span>
                          ))}
                        </div>
                      </div>
                      <div>
                        <span className="text-[9px] text-retro-muted font-mono uppercase tracking-wider">Choice:</span>
                        <div className="flex flex-wrap gap-1 mt-1">
                          {conv.listener_choice_features ? (
                            conv.listener_choice_features.map((f, fi) => (
                              <span key={fi} className="text-[10px] bg-retro-error/20 text-retro-error px-1 py-0.5 rounded font-mono">
                                {typeof f === 'number' ? f.toFixed(2) : f}
                              </span>
                            ))
                          ) : (
                            <span className="text-[10px] text-retro-muted font-mono">
                              index: {conv.listener_choice ?? '—'}
                            </span>
                          )}
                        </div>
                      </div>
                    </div>
                  </details>

                  {/* Thinking Process */}
                  {(conv.thought_before || conv.thought_after) && (
                    <div className="mt-3 pt-3 border-t border-steel-border/50 space-y-2">
                      {conv.thought_before && (
                        <motion.div
                          initial={{ opacity: 0, y: 5 }}
                          animate={{ opacity: 1, y: 0 }}
                          transition={{ duration: 0.3 }}
                          className="rounded-lg px-3 py-2 text-xs italic font-mono"
                          style={{ backgroundColor: 'rgba(0, 122, 255, 0.08)', borderLeft: '3px solid rgba(0, 122, 255, 0.4)' }}
                        >
                          <span className="text-[9px] uppercase tracking-widest not-italic font-medium" style={{ color: 'rgba(0, 150, 255, 0.7)' }}>
                            💭 Before Speaking
                          </span>
                          <p className="text-retro-text/80 mt-0.5">{conv.thought_before}</p>
                        </motion.div>
                      )}
                      {conv.thought_after && (
                        <motion.div
                          initial={{ opacity: 0, y: 5 }}
                          animate={{ opacity: 1, y: 0 }}
                          transition={{ duration: 0.3, delay: 0.1 }}
                          className="rounded-lg px-3 py-2 text-xs italic font-mono"
                          style={{ backgroundColor: 'rgba(255, 170, 0, 0.08)', borderLeft: '3px solid rgba(255, 170, 0, 0.4)' }}
                        >
                          <span className="text-[9px] uppercase tracking-widest not-italic font-medium" style={{ color: 'rgba(255, 170, 0, 0.8)' }}>
                            🔄 After Result
                          </span>
                          <p className="text-retro-text/80 mt-0.5">{conv.thought_after}</p>
                        </motion.div>
                      )}
                    </div>
                  )}

                  {/* Judgment Badge */}
                  {conv.speaker_judgment && (
                    <div className="mt-2 flex items-center gap-2">
                      {(() => {
                        const category = (conv.speaker_judgment.category || '').toLowerCase();
                        const judgmentColorMap = {
                          terrible: '#ff4444', poor: '#ff6644', mediocre: '#ffaa00',
                          good: '#00ff88', excellent: '#00ddff',
                        };
                        const color = judgmentColorMap[category] || '#888888';
                        const score = conv.speaker_judgment.score ?? 0;
                        const stars = Math.max(1, Math.min(5, Math.round(score * 5)));
                        return (
                          <>
                            <span
                              className="inline-flex items-center px-2 py-0.5 rounded text-[10px] font-mono uppercase tracking-wider font-medium"
                              style={{ backgroundColor: color + '18', color, border: `1px solid ${color}33` }}
                            >
                              {category || 'unknown'}
                            </span>
                            <span className="text-[10px] font-mono" style={{ color }}>
                              {'★'.repeat(stars)}{'☆'.repeat(5 - stars)}
                            </span>
                            {conv.speaker_judgment.text && (
                              <span className="text-[10px] text-retro-muted italic truncate max-w-[180px]">
                                "{conv.speaker_judgment.text}"
                              </span>
                            )}
                          </>
                        );
                      })()}
                    </div>
                  )}
                </motion.div>
              ))}
            </AnimatePresence>

            {filteredConversations.length === 0 && conversations.length > 0 && (
              <div className="text-center text-retro-muted py-12">
                <Search size={32} className="mx-auto mb-3 text-retro-muted" />
                <p>No conversations match your filters</p>
                <p className="text-xs text-retro-muted mt-1">Try adjusting your search criteria</p>
              </div>
            )}

            {conversations.length === 0 && (
              <div className="text-center text-retro-muted py-12">
                <Radio size={32} className="mx-auto mb-3 text-retro-muted" />
                <p>Waiting for conversations...</p>
                <p className="text-xs text-retro-muted mt-1">Start training to see live agent communication</p>
              </div>
            )}
          </div>
        </div>

        {/* Symbol Frequency Heatmap */}
        <div className="space-y-3">
          <h3 className="text-sm font-medium text-retro-muted">Symbol Frequency</h3>
          <div className="bg-steel-dark rounded-lg p-4 border border-steel-border">
            {Object.keys(symbolFreq).length === 0 ? (
              <p className="text-retro-muted text-sm">No symbols observed yet</p>
            ) : (
              <div className="space-y-2">
                {Object.entries(symbolFreq)
                  .sort((a, b) => b[1] - a[1])
                  .map(([symbol, count]) => {
                    const maxCount = Math.max(...Object.values(symbolFreq));
                    const pct = (count / maxCount) * 100;
                    const colorIdx = stringToColorIndex(symbol);
                    const color = getSymbolColor(colorIdx);

                    return (
                      <div key={symbol} className="space-y-1">
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-2">
                            <div
                              className="w-4 h-4 rounded font-mono text-xs flex items-center justify-center text-black font-bold"
                              style={{ backgroundColor: color }}
                            >
                              {symbol}
                            </div>
                            <span className="text-xs text-retro-text font-mono">{symbol}</span>
                          </div>
                          <span className="text-xs text-retro-muted">{count}</span>
                        </div>
                        <div className="w-full bg-steel-dark rounded-full h-1.5">
                          <motion.div
                            initial={{ width: 0 }}
                            animate={{ width: `${pct}%` }}
                            transition={{ duration: 0.5 }}
                            className="h-full rounded-full"
                            style={{ backgroundColor: color }}
                          />
                        </div>
                      </div>
                    );
                  })}
              </div>
            )}
          </div>

          {/* Reward Summary */}
          <div className="bg-steel-dark rounded-lg p-4 border border-steel-border">
            <h4 className="text-xs text-retro-muted uppercase tracking-wider mb-3">Reward Summary</h4>
            <div className="grid grid-cols-2 gap-3">
              <div className="text-center">
                <p className="text-2xl font-bold text-neon-green">
                  {conversations.filter(c => c.correct).length}
                </p>
                <p className="text-xs text-retro-muted">Correct</p>
              </div>
              <div className="text-center">
                <p className="text-2xl font-bold text-retro-error">
                  {conversations.filter(c => !c.correct).length}
                </p>
                <p className="text-xs text-retro-muted">Wrong</p>
              </div>
            </div>
            {conversations.length > 0 && (
              <div className="mt-3 pt-3 border-t border-steel-border">
                <div className="flex justify-between text-xs text-retro-muted">
                  <span>Success Rate</span>
                  <span className="text-neon-green font-medium">
                    {((conversations.filter(c => c.correct).length / conversations.length) * 100).toFixed(1)}%
                  </span>
                </div>
                <div className="w-full bg-steel-dark rounded-full h-2 mt-2">
                  <div
                    className="bg-neon-green h-full rounded-full transition-all duration-500"
                    style={{
                      width: `${(conversations.filter(c => c.correct).length / conversations.length) * 100}%`,
                    }}
                  />
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

