import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { motion } from 'framer-motion';
import { Grid3X3, Play, Pause, Info } from 'lucide-react';
import * as api from '../utils/api';
import { ensureSprites, drawSprite, ParticleSystem, C as PC, SPRITE_NAMES } from '../utils/pixelEngine';

const NUM_SYMBOLS = 20;
const NUM_FEATURES = 8;
const SYMBOL_LABELS = Array.from({ length: NUM_SYMBOLS }, (_, i) => `s${i}`);
const FEATURE_LABELS = Array.from({ length: NUM_FEATURES }, (_, i) => `f${i}`);

function generateDemoConversations() {
  const conversations = [];
  for (let i = 0; i < 50; i++) {
    // Early: mostly random noise
    // Later: structured compositionality emerges
    const progress = i / 49;
    const compositionalStrength = progress * progress; // quadratic emergence
    const features = Array.from({ length: NUM_FEATURES }, () => Math.random());
    const highFeatureIndices = features
      .map((f, fi) => ({ fi, val: f }))
      .filter(f => f.val > 0.5)
      .map(f => f.fi);

    const msgLen = 2 + Math.floor(Math.random() * 3);
    const message = [];
    for (let m = 0; m < msgLen; m++) {
      if (m < 2 && highFeatureIndices.length > 0 && Math.random() < compositionalStrength) {
        // Compositional: each high feature maps to a consistent symbol
        const fi = highFeatureIndices[m % highFeatureIndices.length];
        message.push(fi * 2 + m); // deterministic mapping
      } else {
        message.push(Math.floor(Math.random() * NUM_SYMBOLS));
      }
    }
    conversations.push({
      episode: i * 50,
      message,
      speaker_msg: message,
      listener_choice: features,
      target: { features },
      correct: Math.random() < compositionalStrength * 0.8,
    });
  }
  return conversations;
}

function computeCompositionalityScore(conversations, symbolFeatureMap) {
  if (conversations.length === 0) return 0;
  // Measure how consistently each symbol maps to the same feature set
  const symbolFeatureCounts = Array.from({ length: NUM_SYMBOLS }, () =>
    Array.from({ length: NUM_FEATURES }, () => 0)
  );
  conversations.forEach(conv => {
    const features = conv.target?.features || conv.listener_choice || [];
    const highFeatureIndices = [];
    features.forEach((f, fi) => {
      const val = typeof f === 'number' ? f : parseFloat(f);
      if (!isNaN(val) && val > 0.5) highFeatureIndices.push(fi);
    });
    const message = conv.speaker_msg || conv.message || [];
    message.forEach(sym => {
      const symIdx = typeof sym === 'number' ? sym : parseInt(sym);
      if (isNaN(symIdx) || symIdx < 0 || symIdx >= NUM_SYMBOLS) return;
      highFeatureIndices.forEach(fi => {
        if (fi < NUM_FEATURES) symbolFeatureCounts[symIdx][fi] += 1;
      });
    });
  });

  // Entropy-based compositionality: lower entropy per symbol = more compositional
  let totalEntropy = 0;
  let activeSymbols = 0;
  symbolFeatureCounts.forEach(row => {
    const sum = row.reduce((a, b) => a + b, 0);
    if (sum === 0) return;
    activeSymbols++;
    const entropy = -row.reduce((acc, count) => {
      if (count === 0) return acc;
      const p = count / sum;
      return acc + p * Math.log2(p);
    }, 0);
    totalEntropy += entropy;
  });
  if (activeSymbols === 0) return 0;
  const avgEntropy = totalEntropy / activeSymbols;
  const maxEntropy = Math.log2(NUM_FEATURES);
  return Math.max(0, 1 - avgEntropy / maxEntropy);
}

function computeMatrix(conversations) {
  const mat = Array.from({ length: NUM_SYMBOLS }, () => Array(NUM_FEATURES).fill(0));
  conversations.forEach(conv => {
    const features = conv.target?.features || conv.listener_choice || [];
    const highFeatureIndices = [];
    features.forEach((f, fi) => {
      const val = typeof f === 'number' ? f : parseFloat(f);
      if (!isNaN(val) && val > 0.5) highFeatureIndices.push(fi);
    });
    (conv.speaker_msg || conv.message || []).forEach(sym => {
      const symIdx = typeof sym === 'number' ? sym : parseInt(sym);
      if (isNaN(symIdx) || symIdx < 0 || symIdx >= NUM_SYMBOLS) return;
      highFeatureIndices.forEach(fi => {
        if (fi < NUM_FEATURES) mat[symIdx][fi] += 1;
      });
    });
  });

  let globalMax = 0;
  for (let r = 0; r < NUM_SYMBOLS; r++) {
    for (let c = 0; c < NUM_FEATURES; c++) {
      if (mat[r][c] > globalMax) globalMax = mat[r][c];
    }
  }

  return {
    raw: mat,
    normalized: mat.map(row => row.map(val => globalMax > 0 ? val / globalMax : 0)),
    max: globalMax,
  };
}

export default function MessageHeatmap() {
  const [sessions, setSessions] = useState([]);
  const [selectedSession, setSelectedSession] = useState('');
  const [conversations, setConversations] = useState([]);
  const [loading, setLoading] = useState(false);
  const [hoveredCell, setHoveredCell] = useState(null);
  const [usingDemo, setUsingDemo] = useState(false);
 
  /* ───── Pixel Art Heat Grid Canvas refs ───── */
  const gridRef = useRef(null);
  const gridPSRef = useRef(new ParticleSystem());
  const gridRafRef = useRef(null);
  const gridHoverRef = useRef(null);

  // Temporal animation state
  const [rangeEnd, setRangeEnd] = useState(100); // percentage 0-100
  const [isPlaying, setIsPlaying] = useState(false);
  const [speed, setSpeed] = useState(1);
  const playRef = useRef(null);

  useEffect(() => {
    (async () => {
      try {
        const data = await api.fetchSessions();
        setSessions(data);
        if (data.length > 0) setSelectedSession(data[0].session_id);
      } catch {
        setSessions([{ session_id: '1', name: 'Demo Session' }]);
        setSelectedSession('1');
        setUsingDemo(true);
      }
    })();
  }, []);

  const fetchConversations = useCallback(async () => {
    if (!selectedSession) return;
    setLoading(true);
    try {
      const data = await api.getConversations(selectedSession, 500);
      setConversations(data);
      setUsingDemo(false);
    } catch {
      setConversations(generateDemoConversations());
      setUsingDemo(true);
    } finally {
      setLoading(false);
    }
  }, [selectedSession]);

  useEffect(() => {
    fetchConversations();
  }, [fetchConversations]);

  // Sort conversations by episode
  const sortedConversations = useMemo(() => {
    return [...conversations].sort((a, b) => (a.episode || 0) - (b.episode || 0));
  }, [conversations]);

  // Slice conversations based on range slider
  const visibleCount = Math.max(1, Math.round((rangeEnd / 100) * sortedConversations.length));
  const visibleConversations = sortedConversations.slice(0, visibleCount);

  // Current matrix (up to rangeEnd%)
  const currentMatrix = useMemo(() => computeMatrix(visibleConversations), [visibleConversations]);

  // Final matrix (100%) for ghost overlay
  const finalMatrix = useMemo(() => computeMatrix(sortedConversations), [sortedConversations]);

  /* ───── Pixel Art Heat Grid Canvas ───── */
  useEffect(() => {
    ensureSprites();
    const canvas = gridRef.current;
    if (!canvas || !currentMatrix) return;
    const ctx = canvas.getContext('2d');
    const ps = gridPSRef.current;
    const W = canvas.width, H = canvas.height;
    const gridCols = NUM_SYMBOLS;
    const gridRows = NUM_FEATURES;
    const cellW = (W - 60) / gridCols;
    const cellH = (H - 60) / gridRows;
    const offX = 30, offY = 30;

    const draw = () => {
      ctx.clearRect(0, 0, W, H);
      ctx.fillStyle = PC.bg;
      ctx.fillRect(0, 0, W, H);

      // Column labels (features)
      ctx.font = '7px JetBrains Mono, monospace';
      ctx.textAlign = 'center';
      for (let c = 0; c < gridCols; c++) {
        ctx.fillStyle = PC.dim;
        ctx.fillText(`s${c}`, offX + c * cellW + cellW / 2, 12);
      }
      // Row labels (symbols)
      ctx.textAlign = 'right';
      for (let r = 0; r < gridRows; r++) {
        ctx.fillStyle = PC.dim;
        ctx.fillText(`f${r}`, offX - 4, offY + r * cellH + cellH / 2 + 3);
      }

      // Grid cells
      const hover = gridHoverRef.current;
      for (let r = 0; r < gridRows; r++) {
        for (let c = 0; c < gridCols; c++) {
          const val = currentMatrix.normalized[c]?.[r] || 0;
          const raw = currentMatrix.raw[c]?.[r] || 0;
          const cx = offX + c * cellW;
          const cy = offY + r * cellH;

          // Color by intensity
          const intensity = val;
          const gr = Math.round(intensity * 255);
          const gg = Math.round(intensity * 180);
          ctx.fillStyle = `rgba(${gr}, ${gg}, ${Math.round(100 + intensity * 100)}, ${0.15 + intensity * 0.85})`;
          ctx.fillRect(cx + 1, cy + 1, cellW - 2, cellH - 2);

          // Pulse effect on hot cells
          if (intensity > 0.6) {
            const pulse = 0.3 + Math.sin(Date.now() / 300 + c + r) * 0.15;
            ctx.fillStyle = `rgba(0, 255, 136, ${pulse})`;
            ctx.fillRect(cx, cy, cellW, cellH);
          }

          // Hover highlight
          if (hover && hover.r === c && hover.c === r) {
            ctx.strokeStyle = '#00ff88';
            ctx.lineWidth = 2;
            ctx.strokeRect(cx, cy, cellW, cellH);
          }
        }
      }

      // Agents around the edges
      for (let i = 0; i < Math.min(4, SPRITE_NAMES.length); i++) {
        const positions = [
          { x: offX + gridCols * cellW / 2, y: offY - 8 },
          { x: offX + gridCols * cellW + 10, y: offY + gridRows * cellH / 2 },
          { x: offX + gridCols * cellW / 2, y: offY + gridRows * cellH + 15 },
          { x: offX - 15, y: offY + gridRows * cellH / 2 },
        ];
        const pos = positions[i];
        drawSprite(ctx, SPRITE_NAMES[i], pos.x, pos.y, { scale: 0.9, glow: [PC.green, PC.cyan, PC.amber, PC.purple][i] });
      }

      // Flowing particles along high-activity paths
      if (Math.random() < 0.1) {
        const hotCells = [];
        for (let r = 0; r < gridRows; r++) {
          for (let c = 0; c < gridCols; c++) {
            if ((currentMatrix.normalized[c]?.[r] || 0) > 0.5) hotCells.push({ c, r });
          }
        }
        if (hotCells.length > 0) {
          const hc = hotCells[Math.floor(Math.random() * hotCells.length)];
          ps.add({
            x: offX + hc.c * cellW + cellW / 2,
            y: offY + hc.r * cellH + cellH / 2,
            vx: (Math.random() - 0.5) * 20,
            vy: (Math.random() - 0.5) * 20,
            color: '#00ff88',
            size: 1.5,
            life: 1.5,
            type: 'firefly',
          });
        }
      }

      ps.update();
      ps.draw(ctx);

      // Title
      ctx.font = '10px JetBrains Mono, monospace';
      ctx.fillStyle = PC.cyan;
      ctx.textAlign = 'left';
      ctx.fillText('◈ PIXEL HEAT GRID', 10, H - 6);

      gridRafRef.current = requestAnimationFrame(draw);
    };
    draw();
    return () => { if (gridRafRef.current) cancelAnimationFrame(gridRafRef.current); };
  }, [currentMatrix]);

  // Compositionality score for visible range
  const compositionalityScore = useMemo(
    () => computeCompositionalityScore(visibleConversations),
    [visibleConversations]
  );

  // Current episode display
  const currentEpisode = visibleConversations.length > 0
    ? visibleConversations[visibleConversations.length - 1].episode || 0
    : 0;
  const maxEpisode = sortedConversations.length > 0
    ? sortedConversations[sortedConversations.length - 1].episode || 0
    : 0;

  // Play/Pause animation
  useEffect(() => {
    if (!isPlaying) {
      if (playRef.current) clearInterval(playRef.current);
      return;
    }
    const intervalMs = 80 / speed; // base 80ms per step
    playRef.current = setInterval(() => {
      setRangeEnd(prev => {
        if (prev >= 100) {
          setIsPlaying(false);
          return 100;
        }
        return Math.min(100, prev + 1);
      });
    }, intervalMs);
    return () => clearInterval(playRef.current);
  }, [isPlaying, speed]);

  const handlePlayPause = () => {
    if (rangeEnd >= 100) {
      setRangeEnd(0);
      setTimeout(() => setIsPlaying(true), 50);
    } else {
      setIsPlaying(!isPlaying);
    }
  };

  const getColor = (value) => {
    if (value < 0.5) {
      const t = value * 2;
      const r = Math.round(26 + (0 - 26) * t);
      const g = Math.round(26 + (255 - 26) * t);
      const b = Math.round(46 + (136 - 46) * t);
      return `rgb(${r}, ${g}, ${b})`;
    } else {
      const t = (value - 0.5) * 2;
      const r = Math.round(0 + (255 - 0) * t);
      const g = Math.round(255 + (170 - 255) * t);
      const b = Math.round(136 + (0 - 136) * t);
      return `rgb(${r}, ${g}, ${b})`;
    }
  };

  const scoreColor = compositionalityScore > 0.6 ? '#00ff88' : compositionalityScore > 0.3 ? '#ffaa00' : '#ff4444';

  return (
    <div className="space-y-6 animate-slide-in">
      {/* Pixel Art Heat Grid */}
      <div style={{ marginBottom: 20, borderRadius: 10, overflow: 'hidden', border: '1px solid rgba(85,85,125,0.2)' }}>
        <canvas
          ref={gridRef}
          width={400}
          height={400}
          style={{ width: '100%', maxWidth: 400, display: 'block', imageRendering: 'pixelated' }}
          onMouseMove={(e) => {
            const rect = e.target.getBoundingClientRect();
            const scale = 400 / rect.width;
            const mx = (e.clientX - rect.left) * scale;
            const my = (e.clientY - rect.top) * scale;
            const offX = 30, offY = 30;
            const cellW = (400 - 60) / NUM_SYMBOLS;
            const cellH = (400 - 60) / NUM_FEATURES;
            const c = Math.floor((mx - offX) / cellW);
            const r = Math.floor((my - offY) / cellH);
            if (c >= 0 && c < NUM_SYMBOLS && r >= 0 && r < NUM_FEATURES) {
              gridHoverRef.current = { r: c, c: r };
            } else {
              gridHoverRef.current = null;
            }
          }}
          onMouseLeave={() => { gridHoverRef.current = null; }}
        />
      </div>

      <div>
        <h1 className="text-2xl font-bold flex items-center gap-2 section-header">
          <Grid3X3 size={24} className="text-neon-green" />
          MESSAGE HEATMAP
        </h1>
        <p className="text-sm text-retro-muted mt-1">Symbol-to-feature mapping visualization</p>
      </div>

      {usingDemo && (
        <div className="bg-robot-amber/10 border border-robot-amber/30 text-robot-amber px-4 py-2 rounded-lg text-sm">
          Using demo data — backend not available
        </div>
      )}

      {/* Session Selector */}
      <div className="retro-card rounded-xl p-4">
        <label className="text-xs text-retro-muted uppercase tracking-wider font-medium mb-2 block">Session</label>
        <select
          value={selectedSession}
          onChange={e => setSelectedSession(e.target.value)}
          className="bg-retro-bg border border-steel-border rounded-lg px-3 py-2 text-sm text-retro-text focus:border-neon-green focus:outline-none"
        >
          {sessions.map(s => (
            <option key={s.session_id} value={s.session_id}>{s.name || `Session ${s.session_id}`}</option>
          ))}
        </select>
      </div>

      {/* Heatmap */}
      <div className="retro-card rounded-xl p-6" style={{ position: 'relative' }}>
        {/* Compositionality score badge */}
        <div style={{
          position: 'absolute',
          top: 16,
          right: 16,
          background: 'rgba(10, 10, 10, 0.85)',
          border: `1px solid ${scoreColor}`,
          borderRadius: 8,
          padding: '8px 14px',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          zIndex: 20,
        }}>
          <span style={{ fontSize: 10, color: '#666', fontFamily: 'JetBrains Mono, monospace', textTransform: 'uppercase', letterSpacing: 1 }}>
            Compositionality
          </span>
          <span style={{ fontSize: 22, fontWeight: 700, color: scoreColor, fontFamily: 'JetBrains Mono, monospace', lineHeight: 1.3 }}>
            {(compositionalityScore * 100).toFixed(1)}%
          </span>
        </div>

        <div className="flex items-center justify-between mb-4">
          <h3 className="text-sm font-medium text-retro-muted">Symbol × Feature Co-occurrence</h3>
          <div className="flex items-center gap-3 text-xs text-retro-muted font-mono">
            <span>Episode {currentEpisode} / {maxEpisode}</span>
            <span>·</span>
            <span>{visibleConversations.length} / {sortedConversations.length} conversations</span>
          </div>
        </div>

        {loading ? (
          <div className="h-64 flex items-center justify-center">
            <div className="animate-pulse text-retro-muted">Loading heatmap data...</div>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <div className="inline-block min-w-full">
              {/* Column headers */}
              <div className="flex">
                <div className="w-12 flex-shrink-0" />
                {FEATURE_LABELS.map((label, ci) => (
                  <div key={ci} className="flex-1 min-w-[48px] text-center text-xs text-retro-muted font-mono px-1">
                    {label}
                  </div>
                ))}
              </div>

              {/* Rows */}
              {SYMBOL_LABELS.map((label, ri) => (
                <div key={ri} className="flex items-center">
                  <div className="w-12 flex-shrink-0 text-xs text-retro-muted font-mono text-right pr-2">{label}</div>
                  {Array.from({ length: NUM_FEATURES }).map((_, ci) => {
                    const value = currentMatrix.normalized[ri][ci];
                    const raw = currentMatrix.raw[ri][ci];
                    const ghostValue = finalMatrix.normalized[ri][ci];
                    const isHovered = hoveredCell?.r === ri && hoveredCell?.c === ci;
                    return (
                      <div
                        key={ci}
                        className="flex-1 min-w-[48px] aspect-square p-0.5"
                        style={{ position: 'relative' }}
                        onMouseEnter={() => setHoveredCell({ r: ri, c: ci, raw, value, ghostValue })}
                        onMouseLeave={() => setHoveredCell(null)}
                      >
                        {/* Ghost overlay: dim version of final state */}
                        <div
                          style={{
                            position: 'absolute',
                            inset: 0,
                            margin: '0.5px',
                            borderRadius: 2,
                            backgroundColor: getColor(ghostValue),
                            opacity: 0.12,
                            pointerEvents: 'none',
                          }}
                        />
                        {/* Current state cell */}
                        <motion.div
                          initial={{ opacity: 0, scale: 0.5 }}
                          animate={{ opacity: 1, scale: 1 }}
                          transition={{ delay: (ri * NUM_FEATURES + ci) * 0.002 }}
                          className="w-full h-full rounded-sm cursor-pointer relative"
                          style={{
                            backgroundColor: getColor(value),
                            boxShadow: isHovered ? '0 0 8px rgba(0, 255, 136, 0.5)' : 'none',
                            transition: 'background-color 0.35s ease, box-shadow 0.2s ease',
                          }}
                          title={`${label} × ${FEATURE_LABELS[ci]}: ${raw} co-occurrences (${(value * 100).toFixed(1)}%)`}
                        />
                      </div>
                    );
                  })}
                </div>
              ))}
            </div>

            {/* Hover tooltip */}
            {hoveredCell && (
              <motion.div
                initial={{ opacity: 0, y: 5 }}
                animate={{ opacity: 1, y: 0 }}
                className="mt-3 retro-card rounded-lg px-3 py-2 text-sm inline-block border-neon-green/20"
              >
                <span className="text-neon-green font-mono">{SYMBOL_LABELS[hoveredCell.r]}</span>
                <span className="text-retro-muted mx-1">×</span>
                <span className="text-robot-amber font-mono">{FEATURE_LABELS[hoveredCell.c]}</span>
                <span className="text-retro-muted mx-2">→</span>
                <span className="text-retro-text font-bold">{hoveredCell.raw}</span>
                <span className="text-retro-muted ml-1">co-occurrences</span>
                <span className="text-retro-muted/60 ml-2">({(hoveredCell.value * 100).toFixed(1)}%)</span>
                <span className="text-retro-muted/40 ml-3" style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: 11 }}>
                  final: {(hoveredCell.ghostValue * 100).toFixed(1)}%
                </span>
              </motion.div>
            )}
          </div>
        )}

        {/* Legend */}
        <div className="flex items-center gap-3 mt-4 pt-4 border-t border-steel-border">
          <span className="text-xs text-retro-muted">Low</span>
          <div className="flex h-3 rounded overflow-hidden flex-1 max-w-xs">
            {Array.from({ length: 20 }).map((_, i) => (
              <div
                key={i}
                className="flex-1 h-full"
                style={{ backgroundColor: getColor(i / 19) }}
              />
            ))}
          </div>
          <span className="text-xs text-retro-muted">High</span>
          <div className="flex items-center gap-1 ml-4">
            <div style={{ width: 10, height: 10, borderRadius: 2, backgroundColor: '#00ff88', opacity: 0.15 }} />
            <span className="text-xs text-retro-muted/60">ghost (final state)</span>
          </div>
        </div>

        {/* Temporal controls */}
        <div style={{
          marginTop: 20,
          padding: '14px 16px',
          background: 'rgba(26, 26, 46, 0.5)',
          borderRadius: 8,
          border: '1px solid rgba(0, 255, 136, 0.15)',
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 10 }}>
            {/* Play/Pause button */}
            <button
              onClick={handlePlayPause}
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                width: 36,
                height: 36,
                borderRadius: '50%',
                border: '1.5px solid #00ff88',
                background: isPlaying ? 'rgba(0, 255, 136, 0.15)' : 'transparent',
                color: '#00ff88',
                cursor: 'pointer',
                transition: 'all 0.2s ease',
                flexShrink: 0,
              }}
              title={isPlaying ? 'Pause' : 'Play'}
            >
              {isPlaying ? <Pause size={16} /> : <Play size={16} style={{ marginLeft: 2 }} />}
            </button>

            {/* Range slider */}
            <div style={{ flex: 1, position: 'relative' }}>
              <input
                type="range"
                min={1}
                max={100}
                value={rangeEnd}
                onChange={e => {
                  setIsPlaying(false);
                  setRangeEnd(Number(e.target.value));
                }}
                style={{
                  width: '100%',
                  height: 6,
                  borderRadius: 3,
                  outline: 'none',
                  WebkitAppearance: 'none',
                  appearance: 'none',
                  background: `linear-gradient(to right, #00ff88 0%, #00ff88 ${rangeEnd}%, #1a1a2e ${rangeEnd}%, #1a1a2e 100%)`,
                  cursor: 'pointer',
                  transition: isPlaying ? 'none' : 'background 0.15s ease',
                }}
              />
              <style>{`
                input[type="range"]::-webkit-slider-thumb {
                  -webkit-appearance: none;
                  width: 16px;
                  height: 16px;
                  border-radius: 50%;
                  background: #00ff88;
                  box-shadow: 0 0 6px rgba(0,255,136,0.5);
                  cursor: pointer;
                }
                input[type="range"]::-moz-range-thumb {
                  width: 16px;
                  height: 16px;
                  border-radius: 50%;
                  background: #00ff88;
                  box-shadow: 0 0 6px rgba(0,255,136,0.5);
                  border: none;
                  cursor: pointer;
                }
              `}</style>
            </div>

            {/* Speed controls */}
            <div style={{ display: 'flex', gap: 4, flexShrink: 0 }}>
              {[0.5, 1, 2].map(s => (
                <button
                  key={s}
                  onClick={() => setSpeed(s)}
                  style={{
                    padding: '3px 8px',
                    fontSize: 11,
                    fontFamily: 'JetBrains Mono, monospace',
                    borderRadius: 4,
                    border: `1px solid ${speed === s ? '#00ff88' : '#333'}`,
                    background: speed === s ? 'rgba(0, 255, 136, 0.12)' : 'transparent',
                    color: speed === s ? '#00ff88' : '#666',
                    cursor: 'pointer',
                    transition: 'all 0.15s ease',
                  }}
                >
                  {s}x
                </button>
              ))}
            </div>
          </div>

          {/* Episode / conversation counters */}
          <div style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            fontSize: 11,
            fontFamily: 'JetBrains Mono, monospace',
            color: '#666',
          }}>
            <span>
              <span style={{ color: '#00ff88' }}>{rangeEnd}%</span> of timeline
            </span>
            <span>
              Episode <span style={{ color: '#ffaa00' }}>{currentEpisode}</span> / {maxEpisode}
            </span>
            <span>
              <span style={{ color: '#00ddff' }}>{visibleConversations.length}</span> / {sortedConversations.length} conversations
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}
