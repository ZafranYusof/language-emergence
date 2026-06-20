import React, { useState, useEffect, useMemo, useRef } from 'react';
import { motion } from 'framer-motion';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell } from 'recharts';
import * as api from '../utils/api';
import { ensureSprites, drawSprite, drawSpeechBubble, ParticleSystem, C as PC, SPRITE_NAMES } from '../utils/pixelEngine';

const NUM_SYMBOLS = 20;
const NUM_FEATURES = 8;
const FEATURE_NAMES = ['hue', 'size', 'opacity', 'border', 'rotation', 'shape', 'saturation', 'lightness'];
const FEATURE_ICONS = ['🎨', '📐', '👁', '🔲', '🔄', '⬡', '💧', '☀'];

function computeCorrelations(conversations) {
  const symbolFeatureSum = {};
  const symbolCount = {};
  const symbolPositions = {};

  for (const conv of conversations) {
    const features = conv.target?.features || conv.target_features || [];
    const message = conv.message || [];

    const seen = new Set();
    message.forEach((symbol, pos) => {
      if (!symbolFeatureSum[symbol]) {
        symbolFeatureSum[symbol] = new Array(Math.max(features.length, NUM_FEATURES)).fill(0);
        symbolCount[symbol] = 0;
        symbolPositions[symbol] = new Array(5).fill(0);
      }
      if (!seen.has(symbol)) {
        features.forEach((f, fi) => {
          symbolFeatureSum[symbol][fi] += f;
        });
        symbolCount[symbol]++;
        seen.add(symbol);
      }
      if (pos < 5) symbolPositions[symbol][pos]++;
    });
  }

  const correlations = {};
  for (const [symbol, sums] of Object.entries(symbolFeatureSum)) {
    correlations[symbol] = sums.map(s => s / (symbolCount[symbol] || 1));
  }
  return { correlations, symbolCount, symbolPositions };
}

function generateDemoConversations() {
  const conversations = [];
  for (let i = 0; i < 200; i++) {
    const features = Array.from({ length: NUM_FEATURES }, () => Math.random() * 2 - 1);
    const msgLen = 2 + Math.floor(Math.random() * 4);
    const message = [];
    for (let m = 0; m < msgLen; m++) {
      if (m < 2) {
        const highFi = features.findIndex(f => f > 0.3);
        message.push(highFi >= 0 ? (highFi * 2 + m) % NUM_SYMBOLS : Math.floor(Math.random() * NUM_SYMBOLS));
      } else {
        message.push(Math.floor(Math.random() * NUM_SYMBOLS));
      }
    }
    conversations.push({ episode: i * 50, message, target: { features } });
  }
  return conversations;
}

function correlationColor(value) {
  const intensity = Math.min(Math.abs(value), 1);
  if (value > 0) {
    return `rgba(0, 255, 136, ${0.15 + intensity * 0.85})`;
  } else {
    return `rgba(255, 170, 0, ${0.15 + intensity * 0.85})`;
  }
}

function correlationTextColor(value) {
  const intensity = Math.min(Math.abs(value), 1);
  if (intensity < 0.3) return '#555';
  return value > 0 ? '#00ff88' : '#ffaa00';
}

// ─── PIXEL ART STAT BAR ───

function PixelStatBar({ label, value, max, color }) {
  const pct = Math.max(0, Math.min(100, (Math.abs(value) / max) * 100));
  const segments = 10;
  const filled = Math.round((pct / 100) * segments);
  return (
    <div style={{ marginBottom: 6 }}>
      <div style={{
        display: 'flex',
        justifyContent: 'space-between',
        fontFamily: "'Press Start 2P', monospace",
        fontSize: 7,
        color: '#888',
        marginBottom: 3,
      }}>
        <span>{label}</span>
        <span style={{ color }}>{(value > 0 ? '+' : '') + value.toFixed(2)}</span>
      </div>
      <div style={{ display: 'flex', gap: 2 }}>
        {Array.from({ length: segments }, (_, i) => (
          <div key={i} style={{
            width: 12,
            height: 8,
            background: i < filled ? color : '#1a1a2e',
            border: `1px solid ${i < filled ? color : '#333'}`,
            boxShadow: i < filled ? `0 0 4px ${color}40` : 'none',
            transition: 'all 0.2s',
          }} />
        ))}
      </div>
    </div>
  );
}

// ─── PIXEL ART POSITION NODE ───

function PositionNode({ pos, pct, color }) {
  return (
    <div style={{
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      gap: 2,
    }}>
      <div style={{
        width: 28,
        height: 28,
        background: pct > 20 ? color : '#1a1a2e',
        border: `2px solid ${pct > 20 ? color : '#333'}`,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        fontFamily: "'Press Start 2P', monospace",
        fontSize: 7,
        color: pct > 20 ? '#000' : '#555',
        boxShadow: pct > 20 ? `0 0 8px ${color}40, inset 0 0 4px ${color}20` : 'none',
        position: 'relative',
      }}>
        {pos}
        {pct > 40 && (
          <div style={{
            position: 'absolute',
            top: -4,
            right: -4,
            width: 6,
            height: 6,
            background: '#ffcc00',
            boxShadow: '0 0 4px #ffcc00',
          }} />
        )}
      </div>
      <span style={{
        fontFamily: "'JetBrains Mono', monospace",
        fontSize: 7,
        color: pct > 20 ? color : '#444',
      }}>
        {pct.toFixed(0)}%
      </span>
    </div>
  );
}

// ─── PIXEL CHARACTER (Mini, for decoration) ───

function MiniPixelChar({ type }) {
  const isBlue = type === 'speaker';
  const hair = isBlue ? '#4488ff' : '#ff4444';
  const skin = '#f8d0b0';
  const outfit = isBlue ? '#2244aa' : '#aa2222';
  const px = 3;

  const pixels = [
    [null,null,hair,hair,hair,hair,null,null],
    [null,hair,hair,hair,hair,hair,hair,null],
    [null,hair,skin,skin,skin,skin,hair,null],
    [null,null,skin,'#fff',skin,'#fff',null,null],
    [null,null,null,skin,skin,null,null,null],
    [null,outfit,outfit,outfit,outfit,outfit,outfit,null],
    [null,null,outfit,outfit,outfit,outfit,null,null],
    [null,null,outfit,null,null,outfit,null,null],
  ];

  return (
    <div style={{ position: 'relative', width: 8 * px, height: 8 * px, imageRendering: 'pixelated' }}>
      {pixels.map((row, y) =>
        row.map((color, x) =>
          color ? (
            <div key={`${y}-${x}`} style={{
              position: 'absolute',
              left: x * px,
              top: y * px,
              width: px,
              height: px,
              backgroundColor: color,
            }} />
          ) : null
        )
      )}
    </div>
  );
}

// ─── FLOATING PARTICLES ───

function FloatingParticles() {
  const particles = useMemo(() =>
    Array.from({ length: 30 }, (_, i) => ({
      id: i,
      left: `${Math.random() * 100}%`,
      top: `${Math.random() * 100}%`,
      size: 1 + Math.random() * 2,
      opacity: 0.1 + Math.random() * 0.3,
      duration: 3 + Math.random() * 4,
      delay: Math.random() * 3,
      color: ['#00ff88', '#00ddff', '#ffaa00', '#4488ff'][Math.floor(Math.random() * 4)],
    })), []);

  return (
    <div style={{ position: 'fixed', inset: 0, pointerEvents: 'none', zIndex: 0, overflow: 'hidden' }}>
      {particles.map(p => (
        <div key={p.id} style={{
          position: 'absolute',
          left: p.left,
          top: p.top,
          width: p.size,
          height: p.size,
          borderRadius: '50%',
          background: p.color,
          opacity: p.opacity,
          animation: `floatParticle ${p.duration}s ease-in-out infinite`,
          animationDelay: `${p.delay}s`,
        }} />
      ))}
    </div>
  );
}

// ─── MAIN COMPONENT ───

export default function SymbolDecoder() {
  const [sessions, setSessions] = useState([]);
  const [selectedSession, setSelectedSession] = useState('');
  const [conversations, setConversations] = useState([]);
  const [loading, setLoading] = useState(false);
  const [usingDemo, setUsingDemo] = useState(false);
  const [hoveredCell, setHoveredCell] = useState(null);
  const [selectedSymbol, setSelectedSymbol] = useState(null);
 
  /* ───── Pixel Art Symbol Workshop Canvas ───── */
  const wsRef = useRef(null);
  const wsPSRef = useRef(new ParticleSystem());
  const wsRafRef = useRef(null);
 
  useEffect(() => {
    ensureSprites();
    const canvas = wsRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    const ps = wsPSRef.current;
    const W = canvas.width, H = canvas.height;
 
    const draw = () => {
      ctx.clearRect(0, 0, W, H);
      ctx.fillStyle = PC.bg;
      ctx.fillRect(0, 0, W, H);
 
      // Workshop bench/table
      ctx.fillStyle = '#2a2218';
      ctx.fillRect(20, H - 30, W - 40, 20);
      ctx.strokeStyle = '#4a3a28';
      ctx.lineWidth = 1;
      ctx.strokeRect(20, H - 30, W - 40, 20);
      // Bench top highlight
      ctx.fillStyle = '#3a3228';
      ctx.fillRect(20, H - 30, W - 40, 3);
      // Tools on bench
      ctx.fillStyle = '#666';
      ctx.fillRect(50, H - 28, 3, 12); // tool 1
      ctx.fillRect(60, H - 26, 8, 2); // tool 2
      ctx.fillRect(W - 70, H - 27, 6, 8); // tool 3
 
      // Floating symbols as colored shapes
      const symbols = topSymbols.length > 0
        ? topSymbols.map((s, i) => ({
            name: `s${s.symbol}`,
            x: 80 + i * (W - 160) / Math.max(1, topSymbols.length - 1),
            y: 50 + Math.sin(Date.now() / 800 + i * 1.5) * 12,
            color: [PC.green, PC.cyan, PC.amber, PC.purple, PC.red, PC.pink][i % 6],
            size: 6 + (s.count || 0) * 0.5,
          }))
        : Array.from({ length: 5 }, (_, i) => ({
            name: `s${i}`,
            x: 100 + i * 150,
            y: 50 + Math.sin(Date.now() / 800 + i * 1.5) * 12,
            color: [PC.green, PC.cyan, PC.amber, PC.purple, PC.red][i],
            size: 8,
          }));
 
      symbols.forEach((sym, i) => {
        // Draw colored shape (symbol)
        ctx.fillStyle = sym.color;
        ctx.shadowColor = sym.color;
        ctx.shadowBlur = 8;
        const shapes = ['rect', 'circle', 'diamond'];
        const shape = shapes[i % 3];
        if (shape === 'rect') {
          ctx.fillRect(sym.x - sym.size, sym.y - sym.size, sym.size * 2, sym.size * 2);
        } else if (shape === 'circle') {
          ctx.beginPath();
          ctx.arc(sym.x, sym.y, sym.size, 0, Math.PI * 2);
          ctx.fill();
        } else {
          ctx.beginPath();
          ctx.moveTo(sym.x, sym.y - sym.size);
          ctx.lineTo(sym.x + sym.size, sym.y);
          ctx.lineTo(sym.x, sym.y + sym.size);
          ctx.lineTo(sym.x - sym.size, sym.y);
          ctx.closePath();
          ctx.fill();
        }
        ctx.shadowBlur = 0;
 
        // Symbol label
        ctx.font = '8px JetBrains Mono, monospace';
        ctx.textAlign = 'center';
        ctx.fillStyle = sym.color;
        ctx.fillText(sym.name, sym.x, sym.y + sym.size + 10);
 
        // Connection lines to bench
        ctx.strokeStyle = sym.color + '33';
        ctx.lineWidth = 1;
        ctx.setLineDash([3, 3]);
        ctx.beginPath();
        ctx.moveTo(sym.x, sym.y + sym.size);
        ctx.lineTo(sym.x, H - 30);
        ctx.stroke();
        ctx.setLineDash([]);
      });
 
      // Agent sprites walking between symbols
      const agentCount = Math.min(3, SPRITE_NAMES.length);
      for (let ai = 0; ai < agentCount; ai++) {
        const t = (Date.now() / 2000 + ai * 1.5) % symbols.length;
        const idx = Math.floor(t);
        const frac = t - idx;
        const nextIdx = Math.min(idx + 1, symbols.length - 1);
        const ax = symbols[idx].x + (symbols[nextIdx].x - symbols[idx].x) * frac;
        const ay = symbols[idx].y + 20;
        const flip = nextIdx > idx;
        drawSprite(ctx, SPRITE_NAMES[ai + 2], ax, ay, { scale: 1.0, flip, glow: symbols[idx % symbols.length].color });
      }
 
      // Ambient particles (data streams)
      if (Math.random() < 0.08) {
        ps.add({
          x: Math.random() * W,
          y: 20 + Math.random() * 20,
          vx: (Math.random() - 0.5) * 8,
          vy: 2 + Math.random() * 5,
          color: [PC.cyan, PC.green, PC.amber][Math.floor(Math.random() * 3)],
          size: 1 + Math.random(),
          life: 2.5,
          type: 'spark',
        });
      }
 
      ps.update();
      ps.draw(ctx);
 
      // Title
      ctx.font = '10px JetBrains Mono, monospace';
      ctx.fillStyle = PC.green;
      ctx.textAlign = 'left';
      ctx.fillText('◈ SYMBOL WORKSHOP', 10, 16);
 
      wsRafRef.current = requestAnimationFrame(draw);
    };
    draw();
    return () => { if (wsRafRef.current) cancelAnimationFrame(wsRafRef.current); };
  }, [topSymbols]);

  useEffect(() => {
    (async () => {
      try {
        const data = await api.fetchSessions();
        setSessions(data);
        if (data.length > 0) setSelectedSession(data[0].session_id);
      } catch {
        setSessions([{ session_id: 'demo', name: 'Demo Session' }]);
        setSelectedSession('demo');
        setUsingDemo(true);
      }
    })();
  }, []);

  useEffect(() => {
    if (!selectedSession) return;
    setLoading(true);
    (async () => {
      try {
        const data = await api.getConversations(selectedSession, 500);
        setConversations(data);
        setUsingDemo(false);
      } catch {
        setConversations(generateDemoConversations());
        setUsingDemo(true);
      }
      setLoading(false);
    })();
  }, [selectedSession]);

  const { correlations, symbolCount, symbolPositions } = useMemo(
    () => computeCorrelations(conversations),
    [conversations]
  );

  const frequencyData = useMemo(() => {
    return Array.from({ length: NUM_SYMBOLS }, (_, i) => ({
      symbol: `s${i}`,
      count: symbolCount[i] || 0,
    }));
  }, [symbolCount]);

  const topSymbols = useMemo(() => {
    return Object.entries(symbolCount)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 3)
      .map(([sym, count]) => {
        const corr = correlations[sym] || [];
        const topFeatures = corr
          .map((v, i) => ({ feature: FEATURE_NAMES[i], value: v }))
          .sort((a, b) => Math.abs(b.value) - Math.abs(a.value))
          .slice(0, 3);
        return { symbol: sym, count, topFeatures };
      });
  }, [symbolCount, correlations]);

  const selectedSymbolData = useMemo(() => {
    if (selectedSymbol === null) return null;
    const corr = correlations[selectedSymbol] || [];
    const count = symbolCount[selectedSymbol] || 0;
    const positions = symbolPositions[selectedSymbol] || [0, 0, 0, 0, 0];
    const total = positions.reduce((a, b) => a + b, 0) || 1;
    return {
      symbol: selectedSymbol,
      count,
      correlations: corr,
      positions: positions.map(p => (p / total) * 100),
    };
  }, [selectedSymbol, correlations, symbolCount, symbolPositions]);

  // Stars background (deterministic)
  const stars = useMemo(() =>
    Array.from({ length: 40 }, (_, i) => ({
      id: i,
      left: `${(i * 37 + 13) % 100}%`,
      top: `${(i * 53 + 7) % 100}%`,
      size: (i % 3) + 1,
      opacity: 0.15 + (i % 5) * 0.1,
      delay: (i * 0.7) % 3,
    })), []);

  return (
    <div style={{ position: 'relative', minHeight: '100vh' }}>
      {/* Pixel Art Symbol Workshop */}
      <div style={{ marginBottom: 20, borderRadius: 10, overflow: 'hidden', border: '1px solid rgba(85,85,125,0.2)', position: 'relative', zIndex: 1 }}>
        <canvas ref={wsRef} width={800} height={180} style={{ width: '100%', display: 'block', imageRendering: 'pixelated' }} />
      </div>

      {/* Floating particles */}
      <FloatingParticles />

      {/* Star background */}
      <div style={{ position: 'fixed', inset: 0, pointerEvents: 'none', zIndex: 0 }}>
        {stars.map(s => (
          <div key={s.id} style={{
            position: 'absolute',
            left: s.left,
            top: s.top,
            width: s.size,
            height: s.size,
            borderRadius: '50%',
            background: '#fff',
            opacity: s.opacity,
            animation: `twinkle ${2 + (s.id % 3)}s ease-in-out infinite`,
            animationDelay: `${s.delay}s`,
          }} />
        ))}
      </div>

      <div style={{ position: 'relative', zIndex: 1, padding: 24, maxWidth: 1200, margin: '0 auto' }}>

        {/* ─── CRT HEADER ─── */}
        <div style={{
          background: 'linear-gradient(135deg, #1a1a2e 0%, #16213e 100%)',
          border: '2px solid #00ff88',
          borderRadius: 0,
          padding: '16px 20px',
          marginBottom: 20,
          position: 'relative',
          overflow: 'hidden',
          boxShadow: '0 0 20px rgba(0,255,136,0.15), inset 0 0 30px rgba(0,0,0,0.5)',
        }}>
          {/* CRT scanlines */}
          <div style={{
            position: 'absolute',
            inset: 0,
            background: 'repeating-linear-gradient(0deg, transparent, transparent 2px, rgba(0,255,136,0.03) 2px, rgba(0,255,136,0.03) 4px)',
            pointerEvents: 'none',
          }} />
          {/* Pixel border accent */}
          <div style={{
            position: 'absolute',
            top: 0,
            left: 0,
            right: 0,
            height: 4,
            background: 'repeating-linear-gradient(90deg, #00ff88 0px, #00ff88 4px, transparent 4px, transparent 8px)',
          }} />
          <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
            <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
              <MiniPixelChar type="speaker" />
              <MiniPixelChar type="listener" />
            </div>
            <div>
              <h2 style={{
                fontFamily: "'Press Start 2P', monospace",
                fontSize: 14,
                color: '#00ff88',
                margin: 0,
                textShadow: '0 0 10px rgba(0,255,136,0.5)',
              }}>
                ◆ SYMBOL DECODER
              </h2>
              <p style={{
                fontFamily: "'JetBrains Mono', monospace",
                fontSize: 11,
                color: '#666',
                margin: '6px 0 0',
              }}>
                Analyze emergent language patterns {usingDemo && <span style={{ color: '#ffaa00' }}>[DEMO MODE]</span>}
              </p>
            </div>
          </div>
        </div>

        {/* ─── SESSION SELECTOR ─── */}
        <div style={{
          background: '#1a1a2e',
          border: '2px solid #333',
          borderRadius: 0,
          padding: '12px 16px',
          marginBottom: 16,
          display: 'flex',
          alignItems: 'center',
          gap: 12,
          boxShadow: '0 0 10px rgba(0,0,0,0.3)',
        }}>
          <span style={{
            fontFamily: "'Press Start 2P', monospace",
            fontSize: 8,
            color: '#888',
          }}>
            SESSION:
          </span>
          <select
            value={selectedSession}
            onChange={e => setSelectedSession(e.target.value)}
            style={{
              background: '#0a0a1a',
              border: '2px solid #4488ff',
              borderRadius: 0,
              color: '#4488ff',
              padding: '6px 12px',
              fontFamily: "'JetBrains Mono', monospace",
              fontSize: 12,
              outline: 'none',
              cursor: 'pointer',
            }}
          >
            {sessions.map(s => (
              <option key={s.session_id} value={s.session_id}>{s.name || s.session_id}</option>
            ))}
          </select>
          <span style={{
            fontFamily: "'JetBrains Mono', monospace",
            fontSize: 11,
            color: '#555',
          }}>
            {conversations.length} conversations analyzed
          </span>
        </div>

        {loading ? (
          <div style={{
            textAlign: 'center',
            padding: 60,
            fontFamily: "'Press Start 2P', monospace",
            fontSize: 12,
            color: '#00ff88',
            textShadow: '0 0 10px rgba(0,255,136,0.5)',
            animation: 'pulse 1.5s ease-in-out infinite',
          }}>
            ◈ DECODING LANGUAGE DATA ◈
          </div>
        ) : (
          <>
            {/* ─── MAIN GRID ─── */}
            <div style={{ display: 'grid', gridTemplateColumns: '180px 1fr 240px', gap: 16 }}>

              {/* ── LEFT: SYMBOL FREQUENCY (RPG Inventory Style) ── */}
              <div style={{
                background: '#1a1a2e',
                border: '2px solid #333',
                borderRadius: 0,
                padding: 16,
                position: 'relative',
                boxShadow: '0 0 10px rgba(0,0,0,0.3)',
              }}>
                {/* Double border frame */}
                <div style={{
                  position: 'absolute',
                  inset: 3,
                  border: '1px solid #2d2d44',
                  pointerEvents: 'none',
                }} />
                <h3 style={{
                  fontFamily: "'Press Start 2P', monospace",
                  fontSize: 8,
                  color: '#00ff88',
                  margin: '0 0 12px',
                  textShadow: '0 0 6px rgba(0,255,136,0.4)',
                  letterSpacing: 1,
                }}>
                  ◇ FREQUENCY
                </h3>
                <ResponsiveContainer width="100%" height={400}>
                  <BarChart data={frequencyData} layout="vertical" margin={{ left: 0, right: 8 }}>
                    <XAxis type="number" hide />
                    <YAxis
                      type="category"
                      dataKey="symbol"
                      width={30}
                      tick={{ fill: '#888', fontSize: 9, fontFamily: "'JetBrains Mono', monospace" }}
                    />
                    <Tooltip
                      contentStyle={{
                        background: '#0a0a1a',
                        border: '2px solid #4488ff',
                        borderRadius: 0,
                        fontFamily: "'JetBrains Mono', monospace",
                        fontSize: 11,
                        color: '#ccc',
                      }}
                      cursor={{ fill: 'rgba(0,255,136,0.05)' }}
                    />
                    <Bar dataKey="count" radius={0}>
                      {frequencyData.map((entry, index) => (
                        <Cell
                          key={index}
                          fill={entry.count > 0 ? '#00ff88' : '#2d2d44'}
                          fillOpacity={entry.count > 0 ? 0.85 : 0.5}
                        />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </div>

              {/* ── CENTER: HEATMAP (RPG Stats Grid) ── */}
              <div style={{
                background: '#1a1a2e',
                border: '2px solid #333',
                borderRadius: 0,
                padding: 16,
                overflow: 'auto',
                position: 'relative',
                boxShadow: '0 0 10px rgba(0,0,0,0.3)',
              }}>
                <div style={{
                  position: 'absolute',
                  inset: 3,
                  border: '1px solid #2d2d44',
                  pointerEvents: 'none',
                }} />
                <h3 style={{
                  fontFamily: "'Press Start 2P', monospace",
                  fontSize: 8,
                  color: '#00ff88',
                  margin: '0 0 12px',
                  textShadow: '0 0 6px rgba(0,255,136,0.4)',
                  letterSpacing: 1,
                }}>
                  ◇ FEATURE CORRELATION MATRIX
                </h3>
                <div style={{ overflowX: 'auto' }}>
                  <div style={{ display: 'inline-block', minWidth: 400 }}>
                    {/* Column headers */}
                    <div style={{ display: 'flex', alignItems: 'center', gap: 1, marginBottom: 4 }}>
                      <div style={{ width: 36 }} />
                      {FEATURE_NAMES.map((name, i) => (
                        <div key={i} style={{
                          width: 48,
                          textAlign: 'center',
                          fontFamily: "'JetBrains Mono', monospace",
                          fontSize: 8,
                          color: '#666',
                        }}>
                          {FEATURE_ICONS[i]}<br />{name.slice(0, 4)}
                        </div>
                      ))}
                    </div>
                    {/* Heatmap rows */}
                    {Array.from({ length: NUM_SYMBOLS }, (_, sym) => (
                      <div key={sym} style={{ display: 'flex', alignItems: 'center', gap: 1, marginBottom: 1 }}>
                        <div
                          style={{
                            width: 36,
                            textAlign: 'right',
                            paddingRight: 6,
                            fontFamily: "'JetBrains Mono', monospace",
                            fontSize: 10,
                            color: selectedSymbol === sym ? '#00ff88' : '#666',
                            cursor: 'pointer',
                            textShadow: selectedSymbol === sym ? '0 0 6px rgba(0,255,136,0.5)' : 'none',
                          }}
                          onClick={() => setSelectedSymbol(selectedSymbol === sym ? null : sym)}
                        >
                          s{sym}
                        </div>
                        {Array.from({ length: NUM_FEATURES }, (_, fi) => {
                          const val = correlations[sym]?.[fi] ?? 0;
                          const isHovered = hoveredCell?.sym === sym && hoveredCell?.fi === fi;
                          const hasData = (symbolCount[sym] || 0) > 0;
                          return (
                            <motion.div
                              key={fi}
                              style={{
                                width: 48,
                                height: 26,
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                                fontFamily: "'JetBrains Mono', monospace",
                                fontSize: 9,
                                cursor: 'default',
                                backgroundColor: hasData ? correlationColor(val) : '#0a0a1a',
                                color: correlationTextColor(val),
                                border: `1px solid ${isHovered ? '#00ff88' : hasData ? 'rgba(255,255,255,0.05)' : '#1a1a2e'}`,
                                boxShadow: isHovered ? '0 0 8px rgba(0,255,136,0.3)' : 'none',
                                transition: 'border-color 0.15s, box-shadow 0.15s',
                              }}
                              onMouseEnter={() => setHoveredCell({ sym, fi, val })}
                              onMouseLeave={() => setHoveredCell(null)}
                              whileHover={{ scale: 1.08, zIndex: 2 }}
                            >
                              {hasData ? val.toFixed(2) : '—'}
                            </motion.div>
                          );
                        })}
                      </div>
                    ))}
                    {/* Legend */}
                    <div style={{ display: 'flex', gap: 16, marginTop: 12, justifyContent: 'center' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                        <div style={{ width: 10, height: 10, background: 'rgba(0, 255, 136, 0.7)', border: '1px solid #00ff88' }} />
                        <span style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 9, color: '#666' }}>Positive</span>
                      </div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                        <div style={{ width: 10, height: 10, background: 'rgba(255, 170, 0, 0.7)', border: '1px solid #ffaa00' }} />
                        <span style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 9, color: '#666' }}>Negative</span>
                      </div>
                      <span style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 9, color: '#444' }}>
                        Click row label for details
                      </span>
                    </div>
                  </div>
                </div>
              </div>

              {/* ── RIGHT: POSITION DISTRIBUTION (Skill Tree Nodes) ── */}
              <div style={{
                background: '#1a1a2e',
                border: '2px solid #333',
                borderRadius: 0,
                padding: 16,
                position: 'relative',
                boxShadow: '0 0 10px rgba(0,0,0,0.3)',
              }}>
                <div style={{
                  position: 'absolute',
                  inset: 3,
                  border: '1px solid #2d2d44',
                  pointerEvents: 'none',
                }} />
                <h3 style={{
                  fontFamily: "'Press Start 2P', monospace",
                  fontSize: 8,
                  color: '#00ddff',
                  margin: '0 0 12px',
                  textShadow: '0 0 6px rgba(0,221,255,0.4)',
                  letterSpacing: 1,
                }}>
                  ◇ POSITION TREE
                </h3>
                <div style={{ display: 'flex', justifyContent: 'center', gap: 6, marginBottom: 12 }}>
                  {['P0', 'P1', 'P2', 'P3', 'P4'].map((p, i) => (
                    <div key={p} style={{
                      fontFamily: "'Press Start 2P', monospace",
                      fontSize: 7,
                      color: '#555',
                      textAlign: 'center',
                      flex: 1,
                    }}>
                      {p}
                    </div>
                  ))}
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  {Object.entries(symbolPositions)
                    .sort((a, b) => (symbolCount[b[0]] || 0) - (symbolCount[a[0]] || 0))
                    .slice(0, 10)
                    .map(([sym, positions]) => {
                      const total = positions.reduce((a, b) => a + b, 0) || 1;
                      return (
                        <div key={sym} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                          <span style={{
                            fontFamily: "'JetBrains Mono', monospace",
                            fontSize: 9,
                            color: '#666',
                            width: 20,
                          }}>
                            s{sym}
                          </span>
                          <div style={{ display: 'flex', gap: 3, flex: 1 }}>
                            {positions.map((count, pos) => {
                              const pct = (count / total) * 100;
                              return (
                                <div key={pos} style={{ flex: 1 }}>
                                  <div style={{
                                    height: 20,
                                    background: '#0a0a1a',
                                    border: '1px solid #2d2d44',
                                    position: 'relative',
                                    overflow: 'hidden',
                                  }}>
                                    <div style={{
                                      position: 'absolute',
                                      bottom: 0,
                                      left: 0,
                                      right: 0,
                                      height: `${pct}%`,
                                      background: pct > 30
                                        ? 'linear-gradient(0deg, #00ddff, #0088aa)'
                                        : '#1a3a4e',
                                      boxShadow: pct > 30 ? '0 0 6px rgba(0,221,255,0.3)' : 'none',
                                    }} />
                                    {pct > 20 && (
                                      <div style={{
                                        position: 'absolute',
                                        top: 1,
                                        left: '50%',
                                        transform: 'translateX(-50%)',
                                        fontFamily: "'JetBrains Mono', monospace",
                                        fontSize: 7,
                                        color: '#000',
                                        fontWeight: 'bold',
                                        textShadow: '0 0 2px rgba(0,221,255,0.5)',
                                      }}>
                                        {pct.toFixed(0)}
                                      </div>
                                    )}
                                  </div>
                                </div>
                              );
                            })}
                          </div>
                        </div>
                      );
                    })}
                </div>
              </div>
            </div>

            {/* ─── SYMBOL DETAIL CARD (RPG Stat Screen) ─── */}
            {selectedSymbolData && (
              <motion.div
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                style={{
                  background: '#1a1a2e',
                  border: '2px solid #00ff88',
                  borderRadius: 0,
                  padding: 20,
                  marginTop: 16,
                  position: 'relative',
                  boxShadow: '0 0 20px rgba(0,255,136,0.15)',
                }}
              >
                {/* Double pixel frame */}
                <div style={{
                  position: 'absolute',
                  inset: 4,
                  border: '1px solid rgba(0,255,136,0.2)',
                  pointerEvents: 'none',
                }} />
                {/* Corner decorations */}
                {['top-left', 'top-right', 'bottom-left', 'bottom-right'].map(corner => {
                  const isTop = corner.includes('top');
                  const isLeft = corner.includes('left');
                  return (
                    <div key={corner} style={{
                      position: 'absolute',
                      [isTop ? 'top' : 'bottom']: -2,
                      [isLeft ? 'left' : 'right']: -2,
                      width: 8,
                      height: 8,
                      background: '#00ff88',
                      boxShadow: '0 0 6px #00ff88',
                    }} />
                  );
                })}
                <div style={{ display: 'flex', gap: 24, alignItems: 'flex-start' }}>
                  {/* Symbol identity */}
                  <div style={{ textAlign: 'center', minWidth: 120 }}>
                    <div style={{
                      fontFamily: "'Press Start 2P', monospace",
                      fontSize: 32,
                      color: '#00ff88',
                      textShadow: '0 0 20px rgba(0,255,136,0.6)',
                      marginBottom: 8,
                    }}>
                      s{selectedSymbolData.symbol}
                    </div>
                    <div style={{
                      fontFamily: "'JetBrains Mono', monospace",
                      fontSize: 11,
                      color: '#888',
                    }}>
                      Used <span style={{ color: '#00ddff' }}>{selectedSymbolData.count}</span> times
                    </div>
                    <div style={{ marginTop: 8 }}>
                      <MiniPixelChar type="speaker" />
                    </div>
                  </div>
                  {/* Stats */}
                  <div style={{ flex: 1 }}>
                    <h4 style={{
                      fontFamily: "'Press Start 2P', monospace",
                      fontSize: 8,
                      color: '#ffaa00',
                      margin: '0 0 10px',
                      textShadow: '0 0 6px rgba(255,170,0,0.4)',
                    }}>
                      ◆ FEATURE STATS
                    </h4>
                    {FEATURE_NAMES.map((name, i) => (
                      <PixelStatBar
                        key={name}
                        label={`${FEATURE_ICONS[i]} ${name}`}
                        value={selectedSymbolData.correlations[i] || 0}
                        max={1}
                        color={selectedSymbolData.correlations[i] > 0 ? '#00ff88' : '#ffaa00'}
                      />
                    ))}
                  </div>
                  {/* Position tree for this symbol */}
                  <div style={{ minWidth: 200 }}>
                    <h4 style={{
                      fontFamily: "'Press Start 2P', monospace",
                      fontSize: 8,
                      color: '#00ddff',
                      margin: '0 0 10px',
                      textShadow: '0 0 6px rgba(0,221,255,0.4)',
                    }}>
                      ◆ POSITION NODES
                    </h4>
                    <div style={{ display: 'flex', gap: 8, justifyContent: 'center' }}>
                      {selectedSymbolData.positions.map((pct, pos) => (
                        <PositionNode key={pos} pos={pos} pct={pct} color="#00ddff" />
                      ))}
                    </div>
                    {/* Connection lines (skill tree feel) */}
                    <div style={{
                      marginTop: 8,
                      height: 2,
                      background: 'linear-gradient(90deg, #00ddff20, #00ddff60, #00ddff20)',
                    }} />
                  </div>
                </div>
              </motion.div>
            )}

            {/* ─── TOP SYMBOL MEANINGS (RPG Inventory Table) ─── */}
            <div style={{
              background: '#1a1a2e',
              border: '2px solid #333',
              borderRadius: 0,
              padding: 16,
              marginTop: 16,
              position: 'relative',
              boxShadow: '0 0 10px rgba(0,0,0,0.3)',
            }}>
              <div style={{
                position: 'absolute',
                inset: 3,
                border: '1px solid #2d2d44',
                pointerEvents: 'none',
              }} />
              <h3 style={{
                fontFamily: "'Press Start 2P', monospace",
                fontSize: 8,
                color: '#ffaa00',
                margin: '0 0 12px',
                textShadow: '0 0 6px rgba(255,170,0,0.4)',
                letterSpacing: 1,
                display: 'flex',
                alignItems: 'center',
                gap: 8,
              }}>
                ◆ TOP SYMBOL INVENTORY
              </h3>
              <div style={{ overflowX: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontFamily: "'JetBrains Mono', monospace" }}>
                  <thead>
                    <tr>
                      {['SYMBOL', 'FREQ', 'STRONGEST CORRELATIONS', 'INTERPRETATION'].map(h => (
                        <th key={h} style={{
                          textAlign: 'left',
                          padding: '8px 12px',
                          fontFamily: "'Press Start 2P', monospace",
                          fontSize: 7,
                          color: '#555',
                          borderBottom: '2px solid #333',
                          letterSpacing: 1,
                        }}>
                          {h}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {topSymbols.map(({ symbol, count, topFeatures }) => (
                      <tr key={symbol} style={{
                        borderBottom: '1px solid #2d2d44',
                        cursor: 'pointer',
                        transition: 'background 0.15s',
                      }}
                        onClick={() => setSelectedSymbol(selectedSymbol === symbol ? null : Number(symbol))}
                        onMouseEnter={e => e.currentTarget.style.background = 'rgba(0,255,136,0.05)'}
                        onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
                      >
                        <td style={{
                          padding: '10px 12px',
                          color: '#00ff88',
                          fontFamily: "'Press Start 2P', monospace",
                          fontSize: 12,
                          textShadow: '0 0 6px rgba(0,255,136,0.4)',
                        }}>
                          s{symbol}
                        </td>
                        <td style={{ padding: '10px 12px', color: '#00ddff' }}>{count}</td>
                        <td style={{ padding: '10px 12px' }}>
                          {topFeatures.map((tf, i) => (
                            <span key={i} style={{ marginRight: 12 }}>
                              <span style={{ color: '#555' }}>{tf.feature}:</span>{' '}
                              <span style={{ color: tf.value > 0 ? '#00ff88' : '#ffaa00' }}>
                                {tf.value > 0 ? '+' : ''}{tf.value.toFixed(2)}
                              </span>
                            </span>
                          ))}
                        </td>
                        <td style={{ padding: '10px 12px', color: '#666', fontSize: 10 }}>
                          {topFeatures.filter(f => Math.abs(f.value) > 0.3).length > 0
                            ? `Encodes ${topFeatures.filter(f => Math.abs(f.value) > 0.3).map(f => f.feature).join(', ')}`
                            : '—'}
                        </td>
                      </tr>
                    ))}
                    {topSymbols.length === 0 && (
                      <tr>
                        <td colSpan={4} style={{
                          padding: 20,
                          textAlign: 'center',
                          color: '#555',
                          fontFamily: "'Press Start 2P', monospace",
                          fontSize: 9,
                        }}>
                          No symbol data available
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>

            {/* ─── HOVER TOOLTIP ─── */}
            {hoveredCell && (
              <div style={{
                position: 'fixed',
                bottom: 16,
                right: 16,
                background: '#0a0a1a',
                border: '2px solid #00ff88',
                borderRadius: 0,
                padding: '10px 14px',
                fontFamily: "'JetBrains Mono', monospace",
                fontSize: 11,
                zIndex: 50,
                boxShadow: '0 0 12px rgba(0,255,136,0.2)',
              }}>
                <span style={{ color: '#555' }}>Symbol:</span>{' '}
                <span style={{ color: '#00ff88' }}>s{hoveredCell.sym}</span>
                <span style={{ color: '#555', marginLeft: 12 }}>Feature:</span>{' '}
                <span style={{ color: '#00ddff' }}>{FEATURE_NAMES[hoveredCell.fi]}</span>
                <span style={{ color: '#555', marginLeft: 12 }}>Value:</span>{' '}
                <span style={{ color: hoveredCell.val > 0 ? '#00ff88' : '#ffaa00' }}>
                  {hoveredCell.val.toFixed(3)}
                </span>
              </div>
            )}
          </>
        )}
      </div>

      {/* ─── GLOBAL ANIMATIONS ─── */}
      <style>{`
        @keyframes pulse {
          0%, 100% { opacity: 0.5; }
          50% { opacity: 1; }
        }
        @keyframes twinkle {
          0%, 100% { opacity: 0.15; }
          50% { opacity: 0.6; }
        }
        @keyframes floatParticle {
          0% { transform: translateY(0) translateX(0); opacity: 0.2; }
          25% { transform: translateY(-15px) translateX(5px); opacity: 0.4; }
          50% { transform: translateY(-5px) translateX(-3px); opacity: 0.2; }
          75% { transform: translateY(-20px) translateX(8px); opacity: 0.3; }
          100% { transform: translateY(0) translateX(0); opacity: 0.2; }
        }
      `}</style>
    </div>
  );
}
