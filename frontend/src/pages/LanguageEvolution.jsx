import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { ensureSprites, drawSprite, drawSpeechBubble, ParticleSystem, C as PC, SPRITE_NAMES } from '../utils/pixelEngine';

/* ───── colour palette ───── */
const C = {
  bg: '#0a0a0a',
  panel: '#1a1a2e',
  panelLight: '#22223a',
  green: '#00ff88',
  amber: '#ffaa00',
  cyan: '#00ddff',
  red: '#ff4444',
  dim: '#555577',
  text: '#ccccdd',
  textBright: '#eeeef5',
  purple: '#aa66ff',
};

/* ───── keyframes (injected once) ───── */
const styleId = 'lang-evolution-keyframes';
if (typeof document !== 'undefined' && !document.getElementById(styleId)) {
  const el = document.createElement('style');
  el.id = styleId;
  el.textContent = `
    @keyframes le-fadeIn { from{opacity:0;transform:translateY(10px)} to{opacity:1;transform:translateY(0)} }
    @keyframes le-pulse { 0%,100%{transform:scale(1);opacity:0.8} 50%{transform:scale(1.15);opacity:1} }
    @keyframes le-glow { 0%,100%{filter:drop-shadow(0 0 3px var(--glow))} 50%{filter:drop-shadow(0 0 12px var(--glow))} }
    @keyframes le-scan { 0%{transform:translateX(-100%)} 100%{transform:translateX(100%)} }
    @keyframes le-bar-fill { from{width:0} }
    @keyframes le-drift { 0%,100%{opacity:0.5} 50%{opacity:1} }
    @keyframes le-emerge { 0%{r:0;opacity:0} 60%{r:8;opacity:1} 100%{r:5;opacity:0.9} }
    @keyframes le-blink { 0%,100%{opacity:1} 50%{opacity:0.3} }
    @keyframes le-sweep { from{stroke-dashoffset:1000} to{stroke-dashoffset:0} }
  `;
  document.head.appendChild(el);
}

/* ───── helpers ───── */
const clamp01 = (v) => Math.max(0, Math.min(1, v || 0));
const lerp = (a, b, t) => a + (b - a) * t;
const pct = (v) => `${Math.round((v || 0) * 100)}%`;

/* ───── synthetic data generators ───── */
function generateSymbolTimeline(epochs = 60) {
  const symbols = ['▲', '●', '■', '◆', '★', '✦', '◈', '⊕', '⊗', '⊘'];
  const data = [];
  let activeSymbols = new Set([0, 1, 2]);

  for (let ep = 0; ep < epochs; ep++) {
    const entry = { epoch: ep, symbols: {} };

    // Symbols emerge over time
    if (ep > 5 && Math.random() < 0.15) {
      const newSym = Math.floor(Math.random() * symbols.length);
      activeSymbols.add(newSym);
    }

    activeSymbols.forEach((idx) => {
      const base = 0.3 + Math.random() * 0.4;
      const noise = (Math.random() - 0.5) * 0.15;
      const trend = idx < 3 ? 0.002 * ep : -0.001 * ep;
      entry.symbols[symbols[idx]] = clamp01(base + noise + trend);
    });

    data.push(entry);
  }
  return { symbols, data };
}

function generateConvergenceData(epochs = 60) {
  const data = [];
  for (let ep = 0; ep < epochs; ep++) {
    const t = ep / epochs;
    data.push({
      epoch: ep,
      convergence: clamp01(0.2 + 0.6 * (1 - Math.exp(-3 * t)) + (Math.random() - 0.5) * 0.08),
      divergence: clamp01(0.7 - 0.5 * (1 - Math.exp(-2.5 * t)) + (Math.random() - 0.5) * 0.06),
      entropy: clamp01(0.8 - 0.55 * (1 - Math.exp(-2 * t)) + (Math.random() - 0.5) * 0.05),
      compositionality: clamp01(0.1 + 0.7 * (1 - Math.exp(-3.5 * t)) + (Math.random() - 0.5) * 0.04),
    });
  }
  return data;
}

function generateSymbolEmergence() {
  return [
    { symbol: '▲', name: 'TRIANGLE', firstEpoch: 0, prevalence: 0.85, meaning: 'Red objects', status: 'stable' },
    { symbol: '●', name: 'CIRCLE', firstEpoch: 0, prevalence: 0.78, meaning: 'Blue objects', status: 'stable' },
    { symbol: '■', name: 'SQUARE', firstEpoch: 2, prevalence: 0.72, meaning: 'Green objects', status: 'stable' },
    { symbol: '◆', name: 'DIAMOND', firstEpoch: 8, prevalence: 0.45, meaning: 'Large objects', status: 'emerging' },
    { symbol: '★', name: 'STAR', firstEpoch: 15, prevalence: 0.32, meaning: 'Novel objects', status: 'emerging' },
    { symbol: '✦', name: 'SPARKLE', firstEpoch: 22, prevalence: 0.15, meaning: 'Complex shapes', status: 'fading' },
    { symbol: '◈', name: 'BULLSEYE', firstEpoch: 30, prevalence: 0.08, meaning: 'Ambiguous', status: 'fading' },
    { symbol: '⊕', name: 'CROSS', firstEpoch: 12, prevalence: 0.22, meaning: 'Contrast', status: 'emerging' },
  ];
}

/* ───── SVG Line Chart ───── */
function LineChart({ data, lines, width = 700, height = 220, title, showSlider, sliderValue, onSliderChange }) {
  const pad = { top: 20, bottom: 30, left: 45, right: 20 };
  const chartW = width - pad.left - pad.right;
  const chartH = height - pad.top - pad.bottom;

  const maxEpoch = data.length - 1;
  const visibleData = showSlider ? data.slice(0, sliderValue + 1) : data;

  const getX = (ep) => pad.left + (ep / Math.max(maxEpoch, 1)) * chartW;
  const getY = (val) => pad.top + (1 - clamp01(val)) * chartH;

  return (
    <div style={{ animation: 'le-fadeIn 0.5s ease-out' }}>
      {title && (
        <div style={{
          fontSize: 10, color: C.cyan, letterSpacing: 2, marginBottom: 8,
          display: 'flex', alignItems: 'center', gap: 6,
        }}>
          <span style={{ animation: 'le-blink 2s ease-in-out infinite' }}>◈</span>
          {title}
        </div>
      )}
      <svg width="100%" viewBox={`0 0 ${width} ${height}`} style={{
        background: `${C.bg}88`, border: `1px solid ${C.dim}22`, borderRadius: 8,
      }}>
        {/* Grid lines */}
        {[0, 0.25, 0.5, 0.75, 1].map((v, i) => (
          <g key={i}>
            <line
              x1={pad.left} y1={getY(v)} x2={width - pad.right} y2={getY(v)}
              stroke={`${C.dim}22`} strokeWidth={0.5}
            />
            <text x={pad.left - 6} y={getY(v) + 3} fill={C.dim} fontSize={8}
              fontFamily="JetBrains Mono" textAnchor="end">
              {(v * 100).toFixed(0)}
            </text>
          </g>
        ))}
        {/* X-axis labels */}
        {[0, Math.floor(maxEpoch * 0.25), Math.floor(maxEpoch * 0.5), Math.floor(maxEpoch * 0.75), maxEpoch].map((ep, i) => (
          <text key={i} x={getX(ep)} y={height - 6} fill={C.dim} fontSize={8}
            fontFamily="JetBrains Mono" textAnchor="middle">
            {ep}
          </text>
        ))}
        {/* Data lines */}
        {lines.map((line) => {
          const points = visibleData.map((d, i) => `${getX(i)},${getY(d[line.key])}`).join(' ');
          return (
            <g key={line.key}>
              {/* Glow */}
              <polyline points={points} fill="none" stroke={`${line.color}33`}
                strokeWidth={4} strokeLinejoin="round" />
              {/* Line */}
              <polyline points={points} fill="none" stroke={line.color}
                strokeWidth={1.5} strokeLinejoin="round"
                strokeDasharray={line.dashed ? '4,3' : 'none'}
                style={{ animation: 'le-sweep 1s ease-out forwards' }} />
            </g>
          );
        })}
        {/* Slider indicator */}
        {showSlider && (
          <line
            x1={getX(sliderValue)} y1={pad.top}
            x2={getX(sliderValue)} y2={height - pad.bottom}
            stroke={C.amber} strokeWidth={1} strokeDasharray="3,3" opacity={0.6}
          />
        )}
        {/* Endpoints */}
        {lines.map((line) => {
          const lastVal = visibleData[visibleData.length - 1]?.[line.key];
          if (lastVal === undefined) return null;
          return (
            <circle key={line.key}
              cx={getX(visibleData.length - 1)} cy={getY(lastVal)}
              r={3} fill={line.color}
              style={{ '--glow': line.color, animation: 'le-pulse 2s ease-in-out infinite' }}
            />
          );
        })}
      </svg>
    </div>
  );
}

/* ───── Symbol Emergence Grid ───── */
function SymbolEmergenceGrid({ symbols }) {
  const statusColors = { stable: C.green, emerging: C.cyan, fading: C.amber };

  return (
    <div style={{
      display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))',
      gap: 10, animation: 'le-fadeIn 0.6s ease-out',
    }}>
      {symbols.map((sym, i) => (
        <div key={sym.symbol} style={{
          background: `linear-gradient(135deg, ${C.panel}, ${C.panelLight})`,
          border: `1px solid ${statusColors[sym.status]}33`,
          borderRadius: 10, padding: '12px 14px',
          animation: `le-fadeIn 0.4s ease-out ${i * 0.06}s both`,
        }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
            <span style={{ fontSize: 24, color: statusColors[sym.status],
              '--glow': statusColors[sym.status],
              animation: sym.status === 'emerging' ? 'le-pulse 2s ease-in-out infinite' : 'none',
              filter: `drop-shadow(0 0 4px ${statusColors[sym.status]})`,
            }}>
              {sym.symbol}
            </span>
            <span style={{
              fontSize: 7, color: statusColors[sym.status], letterSpacing: 1.5,
              textTransform: 'uppercase', padding: '2px 6px',
              border: `1px solid ${statusColors[sym.status]}44`, borderRadius: 4,
              background: `${statusColors[sym.status]}11`,
            }}>
              {sym.status}
            </span>
          </div>
          <div style={{ fontSize: 9, color: C.textBright, fontFamily: 'JetBrains Mono', marginBottom: 4 }}>
            {sym.name}
          </div>
          <div style={{ fontSize: 8, color: C.dim, marginBottom: 8 }}>
            Meaning: {sym.meaning}
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
            <span style={{ fontSize: 7, color: C.dim }}>PREVALENCE</span>
            <span style={{ fontSize: 9, color: C.green, fontFamily: 'JetBrains Mono' }}>
              {pct(sym.prevalence)}
            </span>
          </div>
          <div style={{ height: 4, background: `${C.dim}33`, borderRadius: 2, overflow: 'hidden' }}>
            <div style={{
              height: '100%', width: pct(sym.prevalence),
              background: `linear-gradient(90deg, ${statusColors[sym.status]}, ${statusColors[sym.status]}88)`,
              borderRadius: 2,
              '--fill': pct(sym.prevalence),
              animation: 'le-bar-fill 1s ease-out',
            }} />
          </div>
          <div style={{ fontSize: 7, color: C.dim, marginTop: 6 }}>
            Emerged at epoch {sym.firstEpoch}
          </div>
        </div>
      ))}
    </div>
  );
}

/* ───── Entropy Gauge ───── */
function EntropyGauge({ value, label, color = C.cyan }) {
  const angle = -135 + clamp01(value) * 270;
  const r = 36;
  const cx = 45, cy = 45;

  return (
    <div style={{ textAlign: 'center' }}>
      <svg width={90} height={70} viewBox="0 0 90 70">
        {/* Background arc */}
        <path
          d={`M ${cx + r * Math.cos((-135 * Math.PI) / 180)} ${cy + r * Math.sin((-135 * Math.PI) / 180)} A ${r} ${r} 0 1 1 ${cx + r * Math.cos((135 * Math.PI) / 180)} ${cy + r * Math.sin((135 * Math.PI) / 180)}`}
          fill="none" stroke={`${C.dim}33`} strokeWidth={4} strokeLinecap="round"
        />
        {/* Value arc */}
        <path
          d={`M ${cx + r * Math.cos((-135 * Math.PI) / 180)} ${cy + r * Math.sin((-135 * Math.PI) / 180)} A ${r} ${r} 0 ${angle > 0 ? 1 : 0} 1 ${cx + r * Math.cos((angle * Math.PI) / 180)} ${cy + r * Math.sin((angle * Math.PI) / 180)}`}
          fill="none" stroke={color} strokeWidth={4} strokeLinecap="round"
          style={{ filter: `drop-shadow(0 0 4px ${color})` }}
        />
        {/* Value text */}
        <text x={cx} y={cy + 6} fill={C.textBright} fontSize={14} fontFamily="JetBrains Mono"
          fontWeight="bold" textAnchor="middle">
          {(clamp01(value) * 100).toFixed(0)}%
        </text>
      </svg>
      <div style={{ fontSize: 8, color: C.dim, letterSpacing: 1, marginTop: -4 }}>
        {label}
      </div>
    </div>
  );
}

/* ───── Symbol Frequency Heatmap (SVG) ───── */
function SymbolHeatmap({ data, symbols }) {
  const cellW = 14;
  const cellH = 20;
  const epochs = data.length;
  const w = Math.min(epochs * cellW + 60, 720);
  const h = symbols.length * cellH + 40;

  const getColor = (val) => {
    const r = Math.round(lerp(26, 0, val));
    const g = Math.round(lerp(26, 255, val));
    const b = Math.round(lerp(46, 136, val));
    const a = 0.3 + val * 0.7;
    return `rgba(${r},${g},${b},${a})`;
  };

  return (
    <div style={{ overflowX: 'auto' }}>
      <div style={{ fontSize: 10, color: C.cyan, letterSpacing: 2, marginBottom: 8 }}>
        ◈ SYMBOL FREQUENCY MATRIX
      </div>
      <svg width="100%" viewBox={`0 0 ${w} ${h}`} style={{
        background: `${C.bg}88`, border: `1px solid ${C.dim}22`, borderRadius: 8,
      }}>
        {/* Row labels */}
        {symbols.map((sym, si) => (
          <text key={si} x={4} y={28 + si * cellH + 4} fill={C.text} fontSize={10}
            fontFamily="JetBrains Mono" dominantBaseline="middle">
            {sym}
          </text>
        ))}
        {/* Cells */}
        {data.slice(0, Math.floor((w - 60) / cellW)).map((entry, ep) =>
          symbols.map((sym, si) => {
            const val = entry.symbols[sym] || 0;
            return (
              <rect key={`${ep}-${si}`}
                x={30 + ep * cellW} y={18 + si * cellH}
                width={cellW - 1} height={cellH - 2}
                rx={2} fill={getColor(val)}
                style={{ transition: 'fill 0.3s' }}
              >
                <title>{`${sym} @ epoch ${ep}: ${(val * 100).toFixed(1)}%`}</title>
              </rect>
            );
          })
        )}
      </svg>
    </div>
  );
}

/* ───── Main Component ───── */
export default function LanguageEvolution() {
  const [epoch, setEpoch] = useState(59);
  const [isPlaying, setIsPlaying] = useState(false);
  const [selectedMetric, setSelectedMetric] = useState('all');
  const playRef = useRef(null);
 
  /* ───── Pixel Art Timeline Canvas ───── */
  const tlCanvasRef = useRef(null);
  const tlPSRef = useRef(new ParticleSystem());
  const tlRafRef = useRef(null);
 
  useEffect(() => {
    ensureSprites();
    const canvas = tlCanvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    const ps = tlPSRef.current;
    const W = canvas.width, H = canvas.height;
 
    const draw = () => {
      ctx.clearRect(0, 0, W, H);
      ctx.fillStyle = PC.bg;
      ctx.fillRect(0, 0, W, H);
 
      // Pixel art road/path from left to right
      const roadY = H - 45;
      // Road base
      ctx.fillStyle = '#2a2a3a';
      ctx.fillRect(0, roadY - 8, W, 16);
      // Road dashes
      ctx.fillStyle = PC.dim;
      for (let dx = 0; dx < W; dx += 20) {
        ctx.fillRect(dx, roadY - 1, 10, 2);
      }
      // Road edges
      ctx.fillStyle = PC.panelLight;
      ctx.fillRect(0, roadY - 10, W, 2);
      ctx.fillRect(0, roadY + 8, W, 2);
 
      // Era markers and agent avatars
      const eras = [
        { pos: 0.1, label: 'Epoch 0', word: '▲ ● ■', color: PC.green },
        { pos: 0.3, label: 'Epoch 15', word: '◆ ★', color: PC.cyan },
        { pos: 0.5, label: 'Epoch 30', word: '✦ ◈', color: PC.amber },
        { pos: 0.7, label: 'Epoch 45', word: '⊕ ▲●', color: PC.purple },
        { pos: 0.9, label: 'Epoch 60', word: '★◆✦⊕', color: PC.red },
      ];
 
      eras.forEach((era, i) => {
        const ex = W * era.pos;
        // Glowing orb marker
        const orbR = 4 + Math.sin(Date.now() / 400 + i) * 1.5;
        ctx.beginPath();
        ctx.arc(ex, roadY, orbR, 0, Math.PI * 2);
        ctx.fillStyle = era.color;
        ctx.shadowColor = era.color;
        ctx.shadowBlur = 10;
        ctx.fill();
        ctx.shadowBlur = 0;
 
        // Era label
        ctx.font = '7px JetBrains Mono, monospace';
        ctx.textAlign = 'center';
        ctx.fillStyle = PC.dim;
        ctx.fillText(era.label, ex, roadY + 20);
 
        // Agent sprite above road
        drawSprite(ctx, SPRITE_NAMES[i % SPRITE_NAMES.length], ex, roadY - 14, { scale: 1.1, glow: era.color });
 
        // Speech bubble with sample word
        drawSpeechBubble(ctx, ex, roadY - 60, era.word, { color: era.color, maxWidth: 80 });
      });
 
      // Current time marker
      const markerX = W * 0.05 + (epoch / 59) * W * 0.9;
      ctx.fillStyle = PC.amber;
      ctx.shadowColor = PC.amber;
      ctx.shadowBlur = 8;
      ctx.fillRect(markerX - 1, roadY + 10, 2, 20);
      ctx.shadowBlur = 0;
      // Triangle pointer
      ctx.beginPath();
      ctx.moveTo(markerX - 4, roadY + 10);
      ctx.lineTo(markerX + 4, roadY + 10);
      ctx.lineTo(markerX, roadY + 5);
      ctx.closePath();
      ctx.fill();
      // Epoch label
      ctx.font = '9px JetBrains Mono, monospace';
      ctx.textAlign = 'center';
      ctx.fillStyle = PC.textBright;
      ctx.fillText(`EP ${epoch}`, markerX, roadY + 38);
 
      // Particle trail connecting eras
      if (Math.random() < 0.08) {
        ps.add({
          x: Math.random() * W,
          y: roadY - 5 + (Math.random() - 0.5) * 8,
          vx: 8 + Math.random() * 15,
          vy: (Math.random() - 0.5) * 3,
          color: [PC.green, PC.cyan, PC.amber][Math.floor(Math.random() * 3)],
          size: 1 + Math.random(),
          life: 2.5,
          type: 'firefly',
        });
      }
 
      // Fireflies / ambient
      if (Math.random() < 0.04) {
        ps.add({
          x: Math.random() * W,
          y: 5 + Math.random() * (roadY - 30),
          vx: (Math.random() - 0.5) * 6,
          vy: (Math.random() - 0.5) * 4,
          color: '#ffffaa',
          size: 1,
          life: 3,
          type: 'firefly',
        });
      }
 
      ps.update();
      ps.draw(ctx);
 
      // Title
      ctx.font = '10px JetBrains Mono, monospace';
      ctx.fillStyle = PC.green;
      ctx.textAlign = 'left';
      ctx.fillText('◈ LANGUAGE TIMELINE', 10, 16);
 
      tlRafRef.current = requestAnimationFrame(draw);
    };
    draw();
    return () => { if (tlRafRef.current) cancelAnimationFrame(tlRafRef.current); };
  }, [epoch]);

  const { symbols, data: symbolTimeline } = useMemo(() => generateSymbolTimeline(60), []);
  const convergenceData = useMemo(() => generateConvergenceData(60), []);
  const symbolEmergence = useMemo(() => generateSymbolEmergence(), []);

  // Auto-play timeline
  useEffect(() => {
    if (isPlaying) {
      playRef.current = setInterval(() => {
        setEpoch((prev) => prev >= 59 ? 59 : prev + 1);
      }, 200);
    }
    return () => { if (playRef.current) clearInterval(playRef.current); };
  }, [isPlaying]);

  useEffect(() => {
    if (epoch >= 59 && isPlaying) setIsPlaying(false);
  }, [epoch, isPlaying]);

  const convergenceLines = [
    { key: 'convergence', color: C.green, label: 'Convergence' },
    { key: 'divergence', color: C.red, label: 'Divergence' },
    { key: 'entropy', color: C.amber, label: 'Entropy' },
    { key: 'compositionality', color: C.cyan, label: 'Compositionality' },
  ];

  const filteredLines = selectedMetric === 'all'
    ? convergenceLines
    : convergenceLines.filter((l) => l.key === selectedMetric);

  return (
    <div style={{ padding: 0 }}>
      {/* Pixel Art Timeline */}
      <div style={{ marginBottom: 20, borderRadius: 10, overflow: 'hidden', border: `1px solid ${C.dim}22` }}>
        <canvas ref={tlCanvasRef} width={800} height={150} style={{ width: '100%', display: 'block', imageRendering: 'pixelated' }} />
      </div>

      {/* Header */}
      <div style={{
        display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start',
        marginBottom: 24, flexWrap: 'wrap', gap: 12,
      }}>
        <div>
          <h2 style={{
            fontSize: 18, color: C.green, fontFamily: 'JetBrains Mono', fontWeight: 700,
            letterSpacing: 1, margin: 0,
            textShadow: `0 0 8px ${C.green}66`,
          }}>
            ◈ LANGUAGE EVOLUTION
          </h2>
          <div style={{ fontSize: 10, color: C.dim, marginTop: 4, letterSpacing: 1 }}>
            REAL-TIME SYMBOL EMERGENCE · CONVERGENCE · DIVERGENCE
          </div>
        </div>

        {/* Live indicator */}
        <div style={{
          display: 'flex', alignItems: 'center', gap: 6, fontSize: 9,
          color: C.green, fontFamily: 'JetBrains Mono',
        }}>
          <span style={{
            width: 6, height: 6, borderRadius: '50%', background: C.green,
            animation: 'le-pulse 1.5s ease-in-out infinite',
            boxShadow: `0 0 6px ${C.green}`,
          }} />
          LIVE MONITORING
        </div>
      </div>

      {/* Timeline Controls */}
      <div style={{
        background: C.panel, border: `1px solid ${C.cyan}22`, borderRadius: 10,
        padding: '14px 18px', marginBottom: 20, animation: 'le-fadeIn 0.4s ease-out',
      }}>
        <div style={{
          display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap',
        }}>
          <span style={{ fontSize: 9, color: C.cyan, letterSpacing: 2 }}>TIMELINE</span>

          <button onClick={() => setEpoch(0)} style={{
            fontSize: 9, fontFamily: 'JetBrains Mono', padding: '3px 8px',
            border: `1px solid ${C.dim}44`, borderRadius: 4,
            background: 'transparent', color: C.dim, cursor: 'pointer',
          }}>⏮</button>

          <button onClick={() => setIsPlaying(!isPlaying)} style={{
            fontSize: 9, fontFamily: 'JetBrains Mono', padding: '3px 10px',
            border: `1px solid ${isPlaying ? C.amber : C.green}44`, borderRadius: 4,
            background: `${isPlaying ? C.amber : C.green}11`,
            color: isPlaying ? C.amber : C.green, cursor: 'pointer',
          }}>
            {isPlaying ? '⏸ PAUSE' : '▶ PLAY'}
          </button>

          <button onClick={() => setEpoch(59)} style={{
            fontSize: 9, fontFamily: 'JetBrains Mono', padding: '3px 8px',
            border: `1px solid ${C.dim}44`, borderRadius: 4,
            background: 'transparent', color: C.dim, cursor: 'pointer',
          }}>⏭</button>

          <input
            type="range" min={0} max={59} value={epoch}
            onChange={(e) => setEpoch(parseInt(e.target.value))}
            style={{
              flex: 1, minWidth: 200, accentColor: C.green, height: 4,
              cursor: 'pointer',
            }}
          />

          <span style={{
            fontSize: 12, color: C.textBright, fontFamily: 'JetBrains Mono',
            fontWeight: 'bold', minWidth: 60, textAlign: 'right',
          }}>
            EP {epoch.toString().padStart(3, '0')}
          </span>
        </div>

        {/* Metric filter buttons */}
        <div style={{ display: 'flex', gap: 4, marginTop: 10, flexWrap: 'wrap' }}>
          {[{ key: 'all', label: 'ALL', color: C.text }, ...convergenceLines].map((m) => (
            <button key={m.key} onClick={() => setSelectedMetric(m.key)} style={{
              fontSize: 7, fontFamily: 'JetBrains Mono', letterSpacing: 0.5,
              padding: '3px 8px', borderRadius: 4, cursor: 'pointer', textTransform: 'uppercase',
              border: `1px solid ${selectedMetric === m.key ? m.color : C.dim}44`,
              background: selectedMetric === m.key ? `${m.color}22` : 'transparent',
              color: selectedMetric === m.key ? m.color : C.dim,
              transition: 'all 0.2s',
            }}>
              {m.label}
            </button>
          ))}
        </div>
      </div>

      {/* Convergence/Divergence Chart */}
      <div style={{
        background: C.panel, border: `1px solid ${C.dim}22`, borderRadius: 10,
        padding: 16, marginBottom: 20,
      }}>
        <LineChart
          data={convergenceData}
          lines={filteredLines}
          title="CONVERGENCE / DIVERGENCE METRICS"
          showSlider
          sliderValue={epoch}
        />
        {/* Legend */}
        <div style={{ display: 'flex', gap: 16, marginTop: 10, flexWrap: 'wrap' }}>
          {convergenceLines.map((line) => (
            <span key={line.key} style={{
              display: 'flex', alignItems: 'center', gap: 5, fontSize: 8,
              color: line.color, fontFamily: 'JetBrains Mono',
            }}>
              <span style={{
                width: 10, height: 2, background: line.color, display: 'inline-block', borderRadius: 1,
              }} />
              {line.label}
            </span>
          ))}
        </div>
      </div>

      {/* Gauge row */}
      <div style={{
        display: 'flex', justifyContent: 'center', gap: 32, flexWrap: 'wrap',
        marginBottom: 20, animation: 'le-fadeIn 0.6s ease-out',
      }}>
        <EntropyGauge
          value={convergenceData[epoch]?.convergence || 0}
          label="CONVERGENCE"
          color={C.green}
        />
        <EntropyGauge
          value={convergenceData[epoch]?.divergence || 0}
          label="DIVERGENCE"
          color={C.red}
        />
        <EntropyGauge
          value={convergenceData[epoch]?.entropy || 0}
          label="ENTROPY"
          color={C.amber}
        />
        <EntropyGauge
          value={convergenceData[epoch]?.compositionality || 0}
          label="COMPOSITIONALITY"
          color={C.cyan}
        />
      </div>

      {/* Symbol Frequency Heatmap */}
      <div style={{
        background: C.panel, border: `1px solid ${C.dim}22`, borderRadius: 10,
        padding: 16, marginBottom: 20,
      }}>
        <SymbolHeatmap data={symbolTimeline.slice(0, epoch + 1)} symbols={symbols} />
      </div>

      {/* Symbol Emergence Grid */}
      <div style={{
        background: C.panel, border: `1px solid ${C.dim}22`, borderRadius: 10,
        padding: 16, marginBottom: 20,
      }}>
        <div style={{ fontSize: 10, color: C.cyan, letterSpacing: 2, marginBottom: 12 }}>
          ◈ SYMBOL EMERGENCE REGISTRY
        </div>
        <SymbolEmergenceGrid symbols={symbolEmergence} />
      </div>

      {/* Stats footer */}
      <div style={{
        display: 'flex', gap: 16, flexWrap: 'wrap', animation: 'le-fadeIn 0.7s ease-out',
      }}>
        {[
          { label: 'ACTIVE SYMBOLS', value: symbolEmergence.filter((s) => s.status !== 'fading').length, color: C.green },
          { label: 'EMERGING', value: symbolEmergence.filter((s) => s.status === 'emerging').length, color: C.cyan },
          { label: 'FADING', value: symbolEmergence.filter((s) => s.status === 'fading').length, color: C.amber },
          { label: 'CURRENT EPOCH', value: epoch, color: C.text },
          { label: 'VOCAB SIZE', value: symbols.length, color: C.purple },
        ].map((stat, i) => (
          <div key={i} style={{
            flex: '1 1 120px', background: C.panel, border: `1px solid ${stat.color}22`,
            borderRadius: 8, padding: '10px 14px', textAlign: 'center',
          }}>
            <div style={{ fontSize: 7, color: C.dim, letterSpacing: 1.5, marginBottom: 4 }}>
              {stat.label}
            </div>
            <div style={{
              fontSize: 20, color: stat.color, fontFamily: 'JetBrains Mono', fontWeight: 'bold',
              textShadow: `0 0 8px ${stat.color}44`,
            }}>
              {stat.value}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
