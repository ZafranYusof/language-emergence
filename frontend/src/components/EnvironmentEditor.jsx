import React, { useState, useRef, useCallback, useMemo, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Settings, Play, Square, RotateCcw, Layers, MessageSquare, Hash, Gauge, Cpu,
  GitBranch, Thermometer, Activity, Zap, AlertCircle,
  Save, Trash2, ChevronDown, Brain,
  TrendingUp, Star, Target,
  Eye, BarChart3, ArrowRight, AlertTriangle,
} from 'lucide-react';

// ─── DEFAULT CONFIG ─────────────────────────────────────────────────────────
const DEFAULT_CONFIG = {
  name: 'New Experiment',
  game_type: 'referential',
  num_objects: 10,
  feature_dim: 8,
  vocab_size: 20,
  message_length: 5,
  learning_rate: 0.001,
  hidden_dim: 128,
  num_episodes: 1000,
  gumbel_temp_start: 1.0,
  gumbel_temp_end: 0.5,
  entropy_coeff: 0.01,
  log_interval: 10,
  use_attention: false,
  curriculum_learning: false,
  reward_type: 'standard',
  optimizer: 'adam',
  noise_level: 0.0,
  batch_size: 32,
};

const VALIDATION = {
  num_objects: { min: 2, max: 100 },
  feature_dim: { min: 1, max: 64 },
  vocab_size: { min: 2, max: 256 },
  message_length: { min: 1, max: 20 },
  learning_rate: { min: 0.00001, max: 0.1 },
  hidden_dim: { min: 16, max: 2048 },
  num_episodes: { min: 100, max: 1000000 },
  gumbel_temp_start: { min: 0.1, max: 10.0 },
  gumbel_temp_end: { min: 0.01, max: 5.0 },
  entropy_coeff: { min: 0.0, max: 1.0 },
  log_interval: { min: 1, max: 10000 },
  noise_level: { min: 0.0, max: 1.0 },
  batch_size: { min: 1, max: 1024 },
};

// ─── PRESETS ────────────────────────────────────────────────────────────────
const PRESETS = [
  {
    id: 'quick_test',
    name: 'Quick Test',
    icon: Zap,
    color: '#00ff88',
    description: 'Fast iteration for debugging',
    stats: { episodes: '100', vocab: '10', time: '~30s' },
    config: {
      name: 'Quick Test Run',
      num_objects: 5,
      feature_dim: 4,
      vocab_size: 10,
      message_length: 3,
      learning_rate: 0.005,
      hidden_dim: 64,
      num_episodes: 100,
      gumbel_temp_start: 1.0,
      gumbel_temp_end: 0.5,
      entropy_coeff: 0.01,
      log_interval: 10,
      use_attention: false,
      curriculum_learning: false,
      reward_type: 'standard',
      optimizer: 'adam',
      noise_level: 0.0,
      batch_size: 16,
    },
  },
  {
    id: 'standard',
    name: 'Standard',
    icon: Target,
    color: '#00ddff',
    description: 'Balanced training run',
    stats: { episodes: '1K', vocab: '20', time: '~5 min' },
    config: {
      name: 'Standard Training',
      num_objects: 10,
      feature_dim: 8,
      vocab_size: 20,
      message_length: 5,
      learning_rate: 0.001,
      hidden_dim: 128,
      num_episodes: 1000,
      gumbel_temp_start: 1.0,
      gumbel_temp_end: 0.5,
      entropy_coeff: 0.01,
      log_interval: 10,
      use_attention: false,
      curriculum_learning: false,
      reward_type: 'standard',
      optimizer: 'adam',
      noise_level: 0.0,
      batch_size: 32,
    },
  },
  {
    id: 'deep_learning',
    name: 'Deep Learning',
    icon: Brain,
    color: '#ffaa00',
    description: 'Large-scale with attention',
    stats: { episodes: '5K', vocab: '64', time: '~25 min' },
    config: {
      name: 'Deep Learning Run',
      num_objects: 25,
      feature_dim: 16,
      vocab_size: 64,
      message_length: 8,
      learning_rate: 0.0003,
      hidden_dim: 512,
      num_episodes: 5000,
      gumbel_temp_start: 1.5,
      gumbel_temp_end: 0.3,
      entropy_coeff: 0.02,
      log_interval: 50,
      use_attention: true,
      curriculum_learning: false,
      reward_type: 'shaped',
      optimizer: 'adamw',
      noise_level: 0.05,
      batch_size: 64,
    },
  },
  {
    id: 'curriculum',
    name: 'Curriculum',
    icon: TrendingUp,
    color: '#a855f7',
    description: 'Progressive difficulty',
    stats: { episodes: '3K', vocab: '32', time: '~15 min' },
    config: {
      name: 'Curriculum Training',
      num_objects: 15,
      feature_dim: 12,
      vocab_size: 32,
      message_length: 6,
      learning_rate: 0.0005,
      hidden_dim: 256,
      num_episodes: 3000,
      gumbel_temp_start: 2.0,
      gumbel_temp_end: 0.2,
      entropy_coeff: 0.015,
      log_interval: 25,
      use_attention: true,
      curriculum_learning: true,
      reward_type: 'progressive',
      optimizer: 'adam',
      noise_level: 0.02,
      batch_size: 48,
    },
  },
];

// ─── SHAPES FOR ENVIRONMENT PREVIEW ─────────────────────────────────────────
const SHAPE_TYPES = ['circle', 'square', 'triangle'];
const PREVIEW_COLORS = ['#00ff88', '#00ddff', '#ffaa00', '#ff3333', '#a855f7', '#ff6b9d', '#4ade80', '#facc15'];

function generatePreviewObjects(config) {
  const count = Math.min(Math.max(config.num_objects, 3), 12);
  const objects = [];
  for (let i = 0; i < count; i++) {
    const angle = (2 * Math.PI * i) / count;
    const radius = 70;
    objects.push({
      id: i,
      x: 130 + radius * Math.cos(angle),
      y: 110 + radius * Math.sin(angle),
      shape: SHAPE_TYPES[i % SHAPE_TYPES.length],
      color: PREVIEW_COLORS[i % PREVIEW_COLORS.length],
      size: 12 + (config.feature_dim || 8) * 0.5,
      label: `F${i}`,
    });
  }
  return objects;
}

// ─── HELPER: LCD VALUE DISPLAY ──────────────────────────────────────────────
function LcdDisplay({ value, unit, warning }) {
  const displayVal = typeof value === 'number'
    ? (value < 0.01 ? value.toExponential(1) : value >= 1000 ? `${(value / 1000).toFixed(1)}K` : String(value))
    : String(value);
  return (
    <div className={`
      inline-flex items-center gap-1 px-2 py-0.5 rounded
      font-mono text-xs tracking-wider
      ${warning
        ? 'bg-retro-error/10 border border-retro-error/30 text-retro-error'
        : 'bg-black/60 border border-neon-green/20 text-neon-green'
      }
    `}
      style={{ textShadow: warning ? 'none' : '0 0 6px rgba(0,255,136,0.5)' }}
    >
      <span className="opacity-70">[</span>
      <span>{displayVal}</span>
      {unit && <span className="opacity-50 text-[10px]">{unit}</span>}
      <span className="opacity-70">]</span>
      {warning && <AlertTriangle size={10} className="ml-0.5" />}
    </div>
  );
}

// ─── HELPER: SLIDER CONTROL ─────────────────────────────────────────────────
function SliderControl({ label, icon: Icon, value, min, max, step, onChange, description, warning }) {
  const pct = ((value - min) / (max - min)) * 100;
  const isLogScale = min > 0 && max / min > 100;
  return (
    <div className="space-y-1.5">
      <div className="flex items-center justify-between">
        <label className="flex items-center gap-1.5 text-[11px] uppercase tracking-widest text-retro-muted font-medium">
          {Icon && <Icon size={11} className="text-neon-green/60" />}
          {label}
        </label>
        <LcdDisplay value={value} warning={warning} />
      </div>
      <div className="relative group">
        <div className="h-1.5 rounded-full bg-black/60 border border-steel-border overflow-hidden">
          <motion.div
            className="h-full rounded-full"
            style={{
              background: warning
                ? 'linear-gradient(90deg, #ff3333, #ff6666)'
                : 'linear-gradient(90deg, #00ff88, #00ddff)',
              boxShadow: warning
                ? '0 0 8px rgba(255,51,51,0.4)'
                : '0 0 8px rgba(0,255,136,0.4)',
            }}
            animate={{ width: `${Math.max(1, Math.min(100, pct))}%` }}
            transition={{ duration: 0.15 }}
          />
        </div>
        <input
          type="range"
          min={min}
          max={max}
          step={step}
          value={value}
          onChange={e => onChange(parseFloat(e.target.value))}
          className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
        />
        <div
          className="absolute top-1/2 -translate-y-1/2 w-3 h-3 rounded-full bg-neon-green border-2 border-steel-dark shadow-glow-green opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none"
          style={{ left: `calc(${pct}% - 6px)` }}
        />
      </div>
      <div className="flex justify-between text-[9px] font-mono text-retro-muted/50">
        <span>{min}</span>
        <span className="text-retro-muted/30">{description}</span>
        <span>{max}</span>
      </div>
    </div>
  );
}

// ─── HELPER: TOGGLE SWITCH ──────────────────────────────────────────────────
function ToggleSwitch({ label, icon: Icon, value, onChange, description }) {
  return (
    <div className="flex items-center justify-between py-1">
      <div className="flex items-center gap-2">
        {Icon && <Icon size={12} className="text-neon-green/60" />}
        <div>
          <span className="text-[11px] uppercase tracking-widest text-retro-muted font-medium block">{label}</span>
          {description && <span className="text-[9px] text-retro-muted/50">{description}</span>}
        </div>
      </div>
      <button
        type="button"
        onClick={() => onChange(!value)}
        className={`
          relative w-10 h-5 rounded-full transition-all duration-300 border
          ${value
            ? 'bg-neon-green/20 border-neon-green/50 shadow-glow-green'
            : 'bg-black/40 border-steel-border'
          }
        `}
      >
        <motion.div
          className={`
            absolute top-0.5 w-3.5 h-3.5 rounded-full
            ${value ? 'bg-neon-green' : 'bg-retro-muted'}
          `}
          animate={{ left: value ? 22 : 2 }}
          transition={{ type: 'spring', stiffness: 500, damping: 30 }}
          style={value ? { boxShadow: '0 0 6px rgba(0,255,136,0.6)' } : {}}
        />
      </button>
    </div>
  );
}

// ─── HELPER: SELECT CONTROL ─────────────────────────────────────────────────
function SelectControl({ label, icon: Icon, value, options, onChange, description }) {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);
  useEffect(() => {
    const handler = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false); };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);
  const current = options.find(o => o.value === value);
  return (
    <div className="space-y-1" ref={ref}>
      <label className="flex items-center gap-1.5 text-[11px] uppercase tracking-widest text-retro-muted font-medium">
        {Icon && <Icon size={11} className="text-neon-green/60" />}
        {label}
      </label>
      <div className="relative">
        <button
          type="button"
          onClick={() => setOpen(!open)}
          className="w-full flex items-center justify-between px-3 py-1.5 bg-black/40 border border-steel-border rounded-lg text-xs font-mono text-retro-text hover:border-neon-green/30 transition-colors"
        >
          <span>{current?.label || value}</span>
          <ChevronDown size={12} className={`text-retro-muted transition-transform ${open ? 'rotate-180' : ''}`} />
        </button>
        <AnimatePresence>
          {open && (
            <motion.div
              initial={{ opacity: 0, y: -4 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -4 }}
              className="absolute z-50 top-full mt-1 w-full bg-steel-dark border border-steel-border rounded-lg overflow-hidden shadow-xl"
            >
              {options.map(opt => (
                <button
                  key={opt.value}
                  type="button"
                  onClick={() => { onChange(opt.value); setOpen(false); }}
                  className={`
                    w-full text-left px-3 py-1.5 text-xs font-mono transition-colors
                    ${opt.value === value
                      ? 'text-neon-green bg-neon-green/10'
                      : 'text-retro-text hover:bg-neon-green/5 hover:text-neon-green'
                    }
                  `}
                >
                  {opt.label}
                </button>
              ))}
            </motion.div>
          )}
        </AnimatePresence>
      </div>
      {description && <p className="text-[9px] text-retro-muted/50">{description}</p>}
    </div>
  );
}

// ─── HELPER: ESTIMATE IMPACT ────────────────────────────────────────────────
function estimateImpact(config) {
  const ep = config.num_episodes || 1000;
  const hd = config.hidden_dim || 128;
  const vs = config.vocab_size || 20;
  const bs = config.batch_size || 32;
  const attn = config.use_attention ? 1.5 : 1.0;
  const lr = config.learning_rate || 0.001;

  const timeSec = (ep / 1000) * (hd / 128) * (vs / 20) * attn * 300;
  const memMB = (hd * hd * vs * 4) / (1024 * 1024) * attn + 50;
  const convergence = Math.min(95, Math.max(20,
    50 + (ep / 200) + (vs > 50 ? -10 : 5) + (lr > 0.01 ? -15 : lr < 0.0001 ? -10 : 5) + (attn > 1 ? 10 : 0)
  ));

  const warnings = [];
  if (lr > 0.01) warnings.push('Learning rate may be too high — risk of divergence');
  if (lr < 0.00005) warnings.push('Learning rate very low — training may be slow');
  if (hd > 1024) warnings.push('Large hidden dim — high memory usage');
  if (ep > 50000) warnings.push('Very long training — consider checkpointing');
  if (vs > 128) warnings.push('Large vocabulary — harder convergence');

  return {
    time: timeSec < 60 ? `~${Math.round(timeSec)}s` : timeSec < 3600 ? `~${Math.round(timeSec / 60)} min` : `~${(timeSec / 3600).toFixed(1)} hr`,
    convergence: `~${Math.round(convergence)}%`,
    memory: memMB < 1024 ? `~${Math.round(memMB)}MB` : `~${(memMB / 1024).toFixed(1)}GB`,
    timeBar: Math.min(100, (timeSec / 1800) * 100),
    convBar: convergence,
    memBar: Math.min(100, (memMB / 2048) * 100),
    warnings,
  };
}

// ─── ENVIRONMENT PREVIEW ────────────────────────────────────────────────────
function EnvironmentPreview({ config }) {
  const [objects, setObjects] = useState(() => generatePreviewObjects(config));
  const [dragging, setDragging] = useState(null);
  const svgRef = useRef(null);

  useEffect(() => {
    setObjects(generatePreviewObjects(config));
  }, [config.num_objects, config.feature_dim]);

  const handleMouseDown = useCallback((id, e) => {
    e.preventDefault();
    setDragging(id);
  }, []);

  const handleMouseMove = useCallback((e) => {
    if (dragging === null || !svgRef.current) return;
    const rect = svgRef.current.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    setObjects(prev => prev.map(obj =>
      obj.id === dragging ? { ...obj, x: Math.max(15, Math.min(245, x)), y: Math.max(15, Math.min(205, y)) } : obj
    ));
  }, [dragging]);

  const handleMouseUp = useCallback(() => setDragging(null), []);

  const renderShape = (obj) => {
    const glowFilter = `drop-shadow(0 0 ${3 + config.feature_dim * 0.2}px ${obj.color}80)`;
    const style = { filter: glowFilter, cursor: 'grab' };
    switch (obj.shape) {
      case 'circle':
        return <circle cx={obj.x} cy={obj.y} r={obj.size / 2} fill={obj.color} fillOpacity={0.7} style={style} />;
      case 'square':
        return <rect x={obj.x - obj.size / 2} y={obj.y - obj.size / 2} width={obj.size} height={obj.size} fill={obj.color} fillOpacity={0.7} rx={2} style={style} />;
      case 'triangle': {
        const s = obj.size / 2;
        const pts = `${obj.x},${obj.y - s} ${obj.x - s},${obj.y + s} ${obj.x + s},${obj.y + s}`;
        return <polygon points={pts} fill={obj.color} fillOpacity={0.7} style={style} />;
      }
      default:
        return null;
    }
  };

  return (
    <div className="bg-black/40 rounded-xl border border-steel-border overflow-hidden">
      <div className="flex items-center gap-2 px-3 py-2 border-b border-steel-border">
        <Eye size={12} className="text-cyber-cyan" />
        <span className="text-[10px] uppercase tracking-widest text-retro-muted">Environment Preview</span>
        <span className="text-[9px] font-mono text-retro-muted/50 ml-auto">{objects.length} objects · {config.feature_dim}d</span>
      </div>
      <svg
        ref={svgRef}
        viewBox="0 0 260 220"
        className="w-full"
        style={{ background: 'linear-gradient(180deg, #0a0a1a, #0d0d24)' }}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
        onMouseLeave={handleMouseUp}
      >
        {/* Grid */}
        {Array.from({ length: 11 }).map((_, i) => (
          <line key={`h${i}`} x1={10} y1={i * 20 + 10} x2={250} y2={i * 20 + 10} stroke="#1a1a2e" strokeWidth={0.5} />
        ))}
        {Array.from({ length: 13 }).map((_, i) => (
          <line key={`v${i}`} x1={i * 20 + 10} y1={10} x2={i * 20 + 10} y2={210} stroke="#1a1a2e" strokeWidth={0.5} />
        ))}
        {/* Axis labels */}
        {[0, 2, 4, 6, 8, 10].map(i => (
          <text key={`xl${i}`} x={i * 24 + 10} y={218} fill="#666680" fontSize={7} textAnchor="middle" fontFamily="monospace">{i}</text>
        ))}
        {[0, 2, 4, 6, 8, 10].map(i => (
          <text key={`yl${i}`} x={5} y={i * 20 + 13} fill="#666680" fontSize={7} textAnchor="end" fontFamily="monospace">{i}</text>
        ))}
        {/* Connection lines between nearby objects */}
        {objects.map((a, i) =>
          objects.slice(i + 1).map((b, j) => {
            const dist = Math.sqrt((a.x - b.x) ** 2 + (a.y - b.y) ** 2);
            if (dist < 80) {
              return (
                <line
                  key={`line-${i}-${j}`}
                  x1={a.x} y1={a.y} x2={b.x} y2={b.y}
                  stroke="#00ff8820"
                  strokeWidth={0.5}
                  strokeDasharray="2,2"
                />
              );
            }
            return null;
          })
        )}
        {/* Objects */}
        {objects.map(obj => (
          <g
            key={obj.id}
            onMouseDown={(e) => handleMouseDown(obj.id, e)}
            style={{ cursor: dragging === obj.id ? 'grabbing' : 'grab' }}
          >
            <motion.g
              animate={{
                scale: [1, 1 + 0.05 * (config.feature_dim / 8), 1],
              }}
              transition={{ duration: 2, repeat: Infinity, delay: obj.id * 0.2 }}
              style={{ transformOrigin: `${obj.x}px ${obj.y}px` }}
            >
              {renderShape(obj)}
            </motion.g>
            <text
              x={obj.x}
              y={obj.y + obj.size / 2 + 10}
              fill="#666680"
              fontSize={7}
              textAnchor="middle"
              fontFamily="monospace"
            >
              {obj.label}
            </text>
          </g>
        ))}
      </svg>
    </div>
  );
}

// ─── IMPACT PREVIEW ─────────────────────────────────────────────────────────
function ImpactPreview({ config }) {
  const impact = useMemo(() => estimateImpact(config), [config]);

  const bars = [
    { label: 'TRAIN TIME', value: impact.timeBar, display: impact.time, color: '#00ddff' },
    { label: 'CONVERGENCE', value: impact.convBar, display: impact.convergence, color: '#00ff88' },
    { label: 'MEMORY', value: impact.memBar, display: impact.memory, color: '#ffaa00' },
  ];

  return (
    <div className="bg-black/40 rounded-xl border border-steel-border p-3 space-y-3">
      <div className="flex items-center gap-2">
        <BarChart3 size={12} className="text-robot-amber" />
        <span className="text-[10px] uppercase tracking-widest text-retro-muted">Impact Estimate</span>
      </div>
      {bars.map((bar, i) => (
        <div key={bar.label} className="space-y-1">
          <div className="flex items-center justify-between">
            <span className="text-[9px] uppercase tracking-wider text-retro-muted">{bar.label}</span>
            <span className="text-[10px] font-mono" style={{ color: bar.color }}>{bar.display}</span>
          </div>
          <div className="h-1.5 bg-black/60 rounded-full overflow-hidden border border-steel-border/50">
            <motion.div
              className="h-full rounded-full"
              style={{ background: bar.color, boxShadow: `0 0 6px ${bar.color}60` }}
              initial={{ width: 0 }}
              animate={{ width: `${Math.max(2, Math.min(100, bar.value))}%` }}
              transition={{ duration: 0.5, delay: i * 0.1 }}
            />
          </div>
        </div>
      ))}
      {impact.warnings.length > 0 && (
        <div className="space-y-1 pt-1">
          {impact.warnings.map((w, i) => (
            <motion.div
              key={i}
              initial={{ opacity: 0, x: -8 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ delay: i * 0.1 }}
              className="flex items-start gap-1.5 text-[9px] text-robot-amber/80"
            >
              <AlertTriangle size={9} className="flex-shrink-0 mt-0.5" />
              <span>{w}</span>
            </motion.div>
          ))}
        </div>
      )}
    </div>
  );
}

// ─── CONFIG COMPARISON ──────────────────────────────────────────────────────
function ConfigComparison({ current, lastUsed, onReset }) {
  const keys = Object.keys(DEFAULT_CONFIG);
  const differences = keys.filter(k => current[k] !== lastUsed[k]);
  const [showAll, setShowAll] = useState(false);
  const displayKeys = showAll ? keys : keys.slice(0, 8);

  return (
    <div className="bg-black/40 rounded-xl border border-steel-border p-3 space-y-2">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <GitBranch size={12} className="text-cyber-cyan" />
          <span className="text-[10px] uppercase tracking-widest text-retro-muted">Config Diff</span>
          {differences.length > 0 && (
            <span className="text-[9px] font-mono px-1.5 py-0.5 rounded bg-neon-green/10 text-neon-green border border-neon-green/20">
              {differences.length} changed
            </span>
          )}
        </div>
        <button
          type="button"
          onClick={onReset}
          className="text-[9px] uppercase tracking-wider text-retro-muted hover:text-robot-amber transition-colors flex items-center gap-1"
        >
          <RotateCcw size={9} /> RESET
        </button>
      </div>
      <div className="space-y-0.5 max-h-48 overflow-y-auto">
        {displayKeys.map(key => {
          const changed = current[key] !== lastUsed[key];
          return (
            <div
              key={key}
              className={`
                flex items-center justify-between px-2 py-1 rounded text-[9px] font-mono
                ${changed ? 'bg-neon-green/5 border border-neon-green/10' : 'opacity-50'}
              `}
            >
              <span className={changed ? 'text-neon-green' : 'text-retro-muted'}>{key}</span>
              <div className="flex items-center gap-1">
                {changed && (
                  <span className="text-retro-muted/40 line-through">{String(lastUsed[key])}</span>
                )}
                <ArrowRight size={8} className={changed ? 'text-neon-green/60' : 'text-retro-muted/20'} />
                <span className={changed ? 'text-neon-green' : 'text-retro-muted'}>{String(current[key])}</span>
              </div>
            </div>
          );
        })}
      </div>
      {keys.length > 8 && (
        <button
          type="button"
          onClick={() => setShowAll(!showAll)}
          className="text-[9px] text-retro-muted hover:text-cyber-cyan transition-colors w-full text-center"
        >
          {showAll ? 'Show less' : `Show all ${keys.length} params`}
        </button>
      )}
    </div>
  );
}

// ─── MAIN COMPONENT ─────────────────────────────────────────────────────────
export default function EnvironmentEditor({ onCreateSession, onStart, onStop, onReset, activeSession, isTraining }) {
  const [config, setConfig] = useState({ ...DEFAULT_CONFIG });
  const [lastUsedConfig, setLastUsedConfig] = useState({ ...DEFAULT_CONFIG });
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [errors, setErrors] = useState({});
  const [savedConfigs, setSavedConfigs] = useState([]);
  const [showSaveModal, setShowSaveModal] = useState(false);
  const [saveName, setSaveName] = useState('');
  const [activeTab, setActiveTab] = useState('controls');

  const handleChange = useCallback((key, value) => {
    setConfig(prev => ({ ...prev, [key]: value }));
    const err = validateField(key, value);
    setErrors(prev => ({ ...prev, [key]: err }));
  }, []);

  const validateField = (key, value) => {
    const v = VALIDATION[key];
    if (!v) return null;
    if (value < v.min) return `Min: ${v.min}`;
    if (value > v.max) return `Max: ${v.max}`;
    return null;
  };

  const loadPreset = useCallback((preset) => {
    setConfig(prev => ({ ...prev, ...preset.config }));
    setErrors({});
  }, []);

  const handleSubmit = async (e) => {
    e.preventDefault();
    const newErrors = {};
    for (const key of Object.keys(VALIDATION)) {
      const err = validateField(key, config[key]);
      if (err) newErrors[key] = err;
    }
    setErrors(newErrors);
    if (Object.keys(newErrors).length > 0) return;
    const { name, ...trainingConfig } = config;
    setLastUsedConfig({ ...config });
    await onCreateSession?.({ config: trainingConfig, name });
  };

  const handleSaveConfig = () => {
    if (!saveName.trim()) return;
    setSavedConfigs(prev => [...prev, { name: saveName, config: { ...config }, id: Date.now() }]);
    setSaveName('');
    setShowSaveModal(false);
  };

  const handleLoadConfig = (saved) => {
    setConfig({ ...saved.config });
    setErrors({});
  };

  const handleDeleteConfig = (id) => {
    setSavedConfigs(prev => prev.filter(c => c.id !== id));
  };

  const handleResetToDefaults = () => {
    setConfig({ ...DEFAULT_CONFIG });
    setErrors({});
  };

  const handleStartFromPreset = async (preset) => {
    const merged = { ...config, ...preset.config };
    setConfig(merged);
    const { name, ...trainingConfig } = merged;
    setLastUsedConfig({ ...merged });
    await onCreateSession?.({ config: trainingConfig, name });
  };

  const errorCount = Object.values(errors).filter(Boolean).length;

  // Group fields for visual controls
  const envFields = [
    { key: 'num_objects', label: 'Number of Objects', icon: Layers, step: 1, description: 'Distinct objects in env' },
    { key: 'feature_dim', label: 'Feature Dimensions', icon: Hash, step: 1, description: 'Visual features per object' },
    { key: 'vocab_size', label: 'Max Vocabulary', icon: MessageSquare, step: 1, description: 'Max symbols agents use' },
    { key: 'message_length', label: 'Message Length', icon: GitBranch, step: 1, description: 'Symbols per message' },
  ];

  const trainingFields = [
    { key: 'learning_rate', label: 'Learning Rate', icon: Gauge, step: 0.0001, description: 'RL step size' },
    { key: 'hidden_dim', label: 'Hidden Dimension', icon: Cpu, step: 32, description: 'NN hidden layer size' },
    { key: 'num_episodes', label: 'Num Episodes', icon: Settings, step: 1000, description: 'Training episode limit' },
    { key: 'batch_size', label: 'Batch Size', icon: Layers, step: 8, description: 'Training batch size' },
    { key: 'log_interval', label: 'Log Interval', icon: Activity, step: 1, description: 'Episodes between logs' },
    { key: 'noise_level', label: 'Noise Level', icon: Zap, step: 0.01, description: 'Observation noise' },
  ];

  const advancedFields = [
    { key: 'gumbel_temp_start', label: 'Gumbel Temp Start', icon: Thermometer, step: 0.1, description: 'Initial Gumbel temp' },
    { key: 'gumbel_temp_end', label: 'Gumbel Temp End', icon: Thermometer, step: 0.05, description: 'Final Gumbel temp' },
    { key: 'entropy_coeff', label: 'Entropy Coeff', icon: Zap, step: 0.005, description: 'Entropy bonus' },
  ];

  const booleanFields = [
    { key: 'use_attention', label: 'Attention Mechanism', icon: Eye, description: 'Use self-attention in agents' },
    { key: 'curriculum_learning', label: 'Curriculum Learning', icon: TrendingUp, description: 'Progressive difficulty' },
  ];

  const selectFields = [
    {
      key: 'reward_type', label: 'Reward Type', icon: Star,
      options: [
        { value: 'standard', label: 'Standard' },
        { value: 'shaped', label: 'Reward Shaped' },
        { value: 'progressive', label: 'Progressive' },
        { value: 'sparse', label: 'Sparse' },
      ],
      description: 'Reward function type',
    },
    {
      key: 'optimizer', label: 'Optimizer', icon: Cpu,
      options: [
        { value: 'adam', label: 'Adam' },
        { value: 'adamw', label: 'AdamW' },
        { value: 'sgd', label: 'SGD' },
        { value: 'rmsprop', label: 'RMSprop' },
      ],
      description: 'Optimization algorithm',
    },
  ];

  return (
    <div className="space-y-6 animate-slide-in">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Environment Editor</h1>
          <p className="text-sm text-retro-muted mt-1">Configure training environment and hyperparameters</p>
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => setShowSaveModal(true)}
            className="flex items-center gap-1.5 px-3 py-1.5 text-[10px] uppercase tracking-wider bg-steel-dark border border-steel-border rounded-lg text-retro-muted hover:text-neon-green hover:border-neon-green/30 transition-colors"
          >
            <Save size={11} /> Save Config
          </button>
          <button
            type="button"
            onClick={handleResetToDefaults}
            className="flex items-center gap-1.5 px-3 py-1.5 text-[10px] uppercase tracking-wider bg-steel-dark border border-steel-border rounded-lg text-retro-muted hover:text-robot-amber hover:border-robot-amber/30 transition-colors"
          >
            <RotateCcw size={11} /> Reset Defaults
          </button>
        </div>
      </div>

      {/* Training Scenarios Presets */}
      <div className="space-y-3">
        <div className="flex items-center gap-2">
          <div className="w-1 h-4 rounded-full bg-robot-amber" />
          <h2 className="text-[11px] uppercase tracking-widest text-retro-muted font-medium">Training Scenarios</h2>
        </div>
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          {PRESETS.map((preset, i) => (
            <motion.div
              key={preset.id}
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: i * 0.08 }}
              className="group relative bg-black/40 rounded-xl border border-steel-border hover:border-opacity-60 transition-all overflow-hidden"
              style={{ '--preset-color': preset.color }}
            >
              <div className="absolute inset-0 opacity-0 group-hover:opacity-100 transition-opacity"
                style={{ background: `radial-gradient(circle at 50% 120%, ${preset.color}08, transparent 60%)` }}
              />
              <div className="relative p-3 space-y-2">
                <div className="flex items-center gap-2">
                  <div className="w-6 h-6 rounded-lg flex items-center justify-center" style={{ background: `${preset.color}15`, border: `1px solid ${preset.color}30` }}>
                    <preset.icon size={12} style={{ color: preset.color }} />
                  </div>
                  <span className="text-xs font-medium text-retro-text">{preset.name}</span>
                </div>
                <p className="text-[9px] text-retro-muted">{preset.description}</p>
                <div className="flex gap-2 text-[8px] font-mono text-retro-muted/60">
                  <span>{preset.stats.episodes} ep</span>
                  <span>·</span>
                  <span>vocab {preset.stats.vocab}</span>
                  <span>·</span>
                  <span>{preset.stats.time}</span>
                </div>
                <div className="flex gap-1.5 pt-1">
                  <button
                    type="button"
                    onClick={() => loadPreset(preset)}
                    className="flex-1 px-2 py-1 text-[9px] uppercase tracking-wider rounded border border-steel-border text-retro-muted hover:text-neon-green hover:border-neon-green/30 transition-colors"
                  >
                    Load
                  </button>
                  <button
                    type="button"
                    onClick={() => handleStartFromPreset(preset)}
                    className="flex-1 flex items-center justify-center gap-1 px-2 py-1 text-[9px] uppercase tracking-wider rounded text-black font-medium transition-all"
                    style={{ background: preset.color, boxShadow: `0 0 12px ${preset.color}30` }}
                  >
                    <Play size={8} /> Start
                  </button>
                </div>
              </div>
            </motion.div>
          ))}
        </div>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-4 gap-6">
        {/* Main Config Area */}
        <div className="xl:col-span-3">
          <form onSubmit={handleSubmit} className="space-y-5">
            {/* Session Name & Game Type */}
            <div className="bg-black/40 rounded-xl p-4 border border-steel-border">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-[11px] uppercase tracking-widest text-retro-muted mb-1.5 font-medium">Experiment Name</label>
                  <input
                    type="text"
                    value={config.name}
                    onChange={e => handleChange('name', e.target.value)}
                    className="w-full bg-black/60 border border-steel-border rounded-lg px-3 py-2 text-sm font-mono focus:outline-none focus:border-neon-green/40 transition-colors"
                    placeholder="My Experiment"
                  />
                </div>
                <div>
                  <label className="block text-[11px] uppercase tracking-widest text-retro-muted mb-1.5 font-medium">Game Type</label>
                  <div className="flex gap-2">
                    {['referential', 'negotiation'].map(type => (
                      <button
                        key={type}
                        type="button"
                        onClick={() => handleChange('game_type', type)}
                        className={`
                          flex-1 px-3 py-2 rounded-lg text-sm capitalize transition-all
                          ${config.game_type === type
                            ? 'bg-cyber-cyan/15 text-cyber-cyan border border-cyber-cyan/40 shadow-glow-cyan'
                            : 'bg-black/40 text-retro-muted border border-steel-border hover:border-steel-border'
                          }
                        `}
                      >
                        {type}
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            </div>

            {/* Tab Controls */}
            <div className="flex items-center gap-1 bg-black/40 rounded-lg p-1 border border-steel-border w-fit">
              {[
                { id: 'controls', label: 'Parameters' },
                { id: 'advanced', label: 'Advanced' },
                { id: 'toggles', label: 'Toggles & Selects' },
              ].map(tab => (
                <button
                  key={tab.id}
                  type="button"
                  onClick={() => setActiveTab(tab.id)}
                  className={`
                    px-3 py-1.5 rounded-md text-[10px] uppercase tracking-wider transition-all
                    ${activeTab === tab.id
                      ? 'bg-neon-green/10 text-neon-green border border-neon-green/20'
                      : 'text-retro-muted hover:text-retro-text'
                    }
                  `}
                >
                  {tab.label}
                </button>
              ))}
            </div>

            {/* Environment & Training Sliders */}
            <AnimatePresence mode="wait">
              {activeTab === 'controls' && (
                <motion.div
                  key="controls"
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -8 }}
                  className="space-y-5"
                >
                  {/* Environment Parameters */}
                  <div className="bg-black/40 rounded-xl p-4 border border-steel-border space-y-4">
                    <div className="flex items-center gap-2">
                      <div className="w-1 h-4 rounded-full bg-cyber-cyan" />
                      <h3 className="text-[11px] uppercase tracking-widest text-retro-muted font-medium">Environment Parameters</h3>
                      <span className="text-[9px] text-retro-muted/50 bg-black/40 px-1.5 py-0.5 rounded font-mono border border-steel-border/50">{envFields.length} params</span>
                    </div>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-3">
                      {envFields.map(field => (
                        <SliderControl
                          key={field.key}
                          label={field.label}
                          icon={field.icon}
                          value={config[field.key]}
                          min={VALIDATION[field.key]?.min || 0}
                          max={VALIDATION[field.key]?.max || 100}
                          step={field.step}
                          onChange={v => handleChange(field.key, v)}
                          description={field.description}
                          warning={!!errors[field.key]}
                        />
                      ))}
                    </div>
                  </div>

                  {/* Training Parameters */}
                  <div className="bg-black/40 rounded-xl p-4 border border-steel-border space-y-4">
                    <div className="flex items-center gap-2">
                      <div className="w-1 h-4 rounded-full bg-neon-green" />
                      <h3 className="text-[11px] uppercase tracking-widest text-retro-muted font-medium">Training Hyperparameters</h3>
                      <span className="text-[9px] text-retro-muted/50 bg-black/40 px-1.5 py-0.5 rounded font-mono border border-steel-border/50">{trainingFields.length} params</span>
                    </div>
                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-x-6 gap-y-3">
                      {trainingFields.map(field => (
                        <SliderControl
                          key={field.key}
                          label={field.label}
                          icon={field.icon}
                          value={config[field.key]}
                          min={VALIDATION[field.key]?.min || 0}
                          max={VALIDATION[field.key]?.max || 100}
                          step={field.step}
                          onChange={v => handleChange(field.key, v)}
                          description={field.description}
                          warning={!!errors[field.key]}
                        />
                      ))}
                    </div>
                  </div>
                </motion.div>
              )}

              {activeTab === 'advanced' && (
                <motion.div
                  key="advanced"
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -8 }}
                  className="bg-black/40 rounded-xl p-4 border border-steel-border space-y-4"
                >
                  <div className="flex items-center gap-2">
                    <div className="w-1 h-4 rounded-full bg-purple-500" />
                    <h3 className="text-[11px] uppercase tracking-widest text-retro-muted font-medium">Advanced Settings</h3>
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-x-6 gap-y-3">
                    {advancedFields.map(field => (
                      <SliderControl
                        key={field.key}
                        label={field.label}
                        icon={field.icon}
                        value={config[field.key]}
                        min={VALIDATION[field.key]?.min || 0}
                        max={VALIDATION[field.key]?.max || 10}
                        step={field.step}
                        onChange={v => handleChange(field.key, v)}
                        description={field.description}
                        warning={!!errors[field.key]}
                      />
                    ))}
                  </div>
                </motion.div>
              )}

              {activeTab === 'toggles' && (
                <motion.div
                  key="toggles"
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -8 }}
                  className="space-y-5"
                >
                  {/* Boolean Toggles */}
                  <div className="bg-black/40 rounded-xl p-4 border border-steel-border space-y-3">
                    <div className="flex items-center gap-2">
                      <div className="w-1 h-4 rounded-full bg-neon-green" />
                      <h3 className="text-[11px] uppercase tracking-widest text-retro-muted font-medium">Feature Toggles</h3>
                    </div>
                    {booleanFields.map(field => (
                      <ToggleSwitch
                        key={field.key}
                        label={field.label}
                        icon={field.icon}
                        value={config[field.key]}
                        onChange={v => handleChange(field.key, v)}
                        description={field.description}
                      />
                    ))}
                  </div>

                  {/* Select Dropdowns */}
                  <div className="bg-black/40 rounded-xl p-4 border border-steel-border space-y-4">
                    <div className="flex items-center gap-2">
                      <div className="w-1 h-4 rounded-full bg-robot-amber" />
                      <h3 className="text-[11px] uppercase tracking-widest text-retro-muted font-medium">Categorical Options</h3>
                    </div>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                      {selectFields.map(field => (
                        <SelectControl
                          key={field.key}
                          label={field.label}
                          icon={field.icon}
                          value={config[field.key]}
                          options={field.options}
                          onChange={v => handleChange(field.key, v)}
                          description={field.description}
                        />
                      ))}
                    </div>
                  </div>
                </motion.div>
              )}
            </AnimatePresence>

            {/* Action Buttons */}
            <div className="flex items-center gap-3 pt-2">
              <button
                type="submit"
                className="flex items-center gap-2 px-5 py-2.5 bg-blue-600 hover:bg-cyber-cyan text-white rounded-lg text-sm font-medium transition-all shadow-lg shadow-blue-500/20 hover:shadow-blue-500/30"
              >
                <Settings size={16} />
                Create Session
              </button>
              {errorCount > 0 && (
                <span className="flex items-center gap-1.5 text-xs text-retro-error">
                  <AlertCircle size={12} />
                  Fix {errorCount} validation error(s)
                </span>
              )}
            </div>
          </form>
        </div>

        {/* Right Sidebar */}
        <div className="space-y-4">
          {/* Training Controls */}
          <div className="bg-black/40 rounded-xl p-4 border border-steel-border space-y-3">
            <div className="flex items-center gap-2">
              <div className="w-1 h-4 rounded-full bg-robot-amber" />
              <h3 className="text-[11px] uppercase tracking-widest text-retro-muted font-medium">Training Controls</h3>
            </div>
            <div className="space-y-2">
              <button
                onClick={() => activeSession && onStart?.(activeSession.session_id)}
                disabled={!activeSession || isTraining}
                className="w-full flex items-center justify-center gap-2 px-4 py-2.5 bg-neon-green hover:bg-neon-green disabled:bg-steel-dark disabled:text-retro-muted text-black rounded-lg text-sm font-medium transition-all shadow-lg shadow-emerald-500/10 hover:shadow-emerald-500/20 disabled:shadow-none"
              >
                <Play size={16} />
                Start Training
              </button>
              <button
                onClick={() => activeSession && onStop?.(activeSession.session_id)}
                disabled={!activeSession || !isTraining}
                className="w-full flex items-center justify-center gap-2 px-4 py-2.5 bg-red-600 hover:bg-retro-error disabled:bg-steel-dark disabled:text-retro-muted text-white rounded-lg text-sm font-medium transition-all shadow-lg shadow-red-500/10 hover:shadow-red-500/20 disabled:shadow-none"
              >
                <Square size={16} />
                Stop Training
              </button>
              <button
                onClick={() => activeSession && onReset?.(activeSession.session_id)}
                disabled={!activeSession}
                className="w-full flex items-center justify-center gap-2 px-4 py-2.5 bg-steel-dark hover:bg-steel-border disabled:bg-steel-dark disabled:text-retro-muted text-retro-text rounded-lg text-sm font-medium transition-all border border-steel-border"
              >
                <RotateCcw size={16} />
                Reset Session
              </button>
            </div>
          </div>

          {/* Environment Preview */}
          <EnvironmentPreview config={config} />

          {/* Impact Estimate */}
          <ImpactPreview config={config} />

          {/* Config Comparison */}
          <ConfigComparison
            current={config}
            lastUsed={lastUsedConfig}
            onReset={handleResetToDefaults}
          />

          {/* Saved Configs */}
          {savedConfigs.length > 0 && (
            <div className="bg-black/40 rounded-xl p-3 border border-steel-border space-y-2">
              <div className="flex items-center gap-2">
                <Save size={12} className="text-cyber-cyan" />
                <span className="text-[10px] uppercase tracking-widest text-retro-muted">Saved Configs</span>
              </div>
              {savedConfigs.map(saved => (
                <div key={saved.id} className="flex items-center gap-2 px-2 py-1.5 rounded bg-steel-dark/50 border border-steel-border/50">
                  <button
                    type="button"
                    onClick={() => handleLoadConfig(saved)}
                    className="flex-1 text-left text-[10px] font-mono text-retro-text hover:text-neon-green transition-colors truncate"
                  >
                    {saved.name}
                  </button>
                  <button
                    type="button"
                    onClick={() => handleDeleteConfig(saved.id)}
                    className="text-retro-muted hover:text-retro-error transition-colors"
                  >
                    <Trash2 size={10} />
                  </button>
                </div>
              ))}
            </div>
          )}

          {/* API Payload Preview */}
          <div className="bg-black/40 rounded-xl p-3 border border-steel-border">
            <h3 className="text-[10px] uppercase tracking-widest text-retro-muted mb-2">API Payload</h3>
            <pre className="text-[9px] text-retro-text font-mono bg-black/60 rounded-lg p-2 overflow-auto max-h-48 border border-steel-border/30">
              {JSON.stringify({
                config: {
                  game_type: config.game_type,
                  num_episodes: config.num_episodes,
                  learning_rate: config.learning_rate,
                  vocab_size: config.vocab_size,
                  message_length: config.message_length,
                  hidden_dim: config.hidden_dim,
                  feature_dim: config.feature_dim,
                  num_objects: config.num_objects,
                  use_attention: config.use_attention,
                  curriculum_learning: config.curriculum_learning,
                  reward_type: config.reward_type,
                  optimizer: config.optimizer,
                  batch_size: config.batch_size,
                  noise_level: config.noise_level,
                },
                name: config.name,
              }, null, 2)}
            </pre>
          </div>
        </div>
      </div>

      {/* Save Config Modal */}
      <AnimatePresence>
        {showSaveModal && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm"
            onClick={() => setShowSaveModal(false)}
          >
            <motion.div
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.9, opacity: 0 }}
              onClick={e => e.stopPropagation()}
              className="bg-steel-dark border border-steel-border rounded-xl p-5 w-full max-w-sm space-y-4"
            >
              <h3 className="text-sm font-medium text-retro-text">Save Configuration</h3>
              <input
                type="text"
                value={saveName}
                onChange={e => setSaveName(e.target.value)}
                placeholder="Config name..."
                className="w-full bg-black/60 border border-steel-border rounded-lg px-3 py-2 text-sm font-mono focus:outline-none focus:border-neon-green/40"
                autoFocus
                onKeyDown={e => e.key === 'Enter' && handleSaveConfig()}
              />
              <div className="flex gap-2 justify-end">
                <button
                  type="button"
                  onClick={() => setShowSaveModal(false)}
                  className="px-3 py-1.5 text-xs text-retro-muted hover:text-retro-text transition-colors"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={handleSaveConfig}
                  disabled={!saveName.trim()}
                  className="px-4 py-1.5 text-xs bg-neon-green text-black rounded-lg font-medium disabled:opacity-30 transition-opacity"
                >
                  Save
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
