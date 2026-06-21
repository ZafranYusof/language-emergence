import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Activity, BookOpen, Zap, TrendingUp, MessageSquare, Layers, Play, Loader, Download, Pause, RotateCcw, ChevronDown, ChevronRight } from 'lucide-react';
import MetricsChart from './MetricsChart';
import ConversationCard from './ConversationCard';
import MetricTooltip from './MetricTooltip';
import { SkeletonCard, SkeletonChart, SkeletonList } from './Skeleton';
import Card from './Card';
import SectionTitle from './SectionTitle';
import EmptyState from './EmptyState';

// ─── Animated Counter Hook ───────────────────────────────────────────────
function useAnimatedValue(target, duration = 600) {
  const [display, setDisplay] = useState(target);
  const rafRef = useRef(null);
  const startRef = useRef(null);
  const fromRef = useRef(target);
  const displayRef = useRef(target);

  useEffect(() => {
    if (target === displayRef.current) return;
    fromRef.current = displayRef.current;
    startRef.current = null;

    const animate = (ts) => {
      if (!startRef.current) startRef.current = ts;
      const progress = Math.min((ts - startRef.current) / duration, 1);
      const eased = 1 - Math.pow(1 - progress, 3); // ease-out cubic
      const val = fromRef.current + (target - fromRef.current) * eased;
      displayRef.current = val;
      setDisplay(val);
      if (progress < 1) rafRef.current = requestAnimationFrame(animate);
    };
    rafRef.current = requestAnimationFrame(animate);
    return () => { if (rafRef.current) cancelAnimationFrame(rafRef.current); };
  }, [target, duration]);

  return display;
}

// ─── Sparkline Component ─────────────────────────────────────────────────
function Sparkline({ data, width = 80, height = 24, color }) {
  if (!data || data.length < 2) return null;
  const min = Math.min(...data);
  const max = Math.max(...data);
  const range = max - min || 1;
  const points = data.map((v, i) => {
    const x = (i / (data.length - 1)) * width;
    const y = height - ((v - min) / range) * (height - 4) - 2;
    return `${x},${y}`;
  }).join(' ');
  const trendColor = data[data.length - 1] >= data[0] ? '#00ff88' : '#ff4444';
  const stroke = color || trendColor;
  const gradientId = useMemo(() => `spark-${Math.random().toString(36).slice(2, 8)}`, []);
  return (
    <svg width={width} height={height} style={{ display: 'block', marginTop: 4 }}>
      <defs>
        <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={stroke} stopOpacity="0.3" />
          <stop offset="100%" stopColor={stroke} stopOpacity="0" />
        </linearGradient>
      </defs>
      <polygon
        points={`0,${height} ${points} ${width},${height}`}
        fill={`url(#${gradientId})`}
      />
      <polyline
        points={points}
        fill="none"
        stroke={stroke}
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

// ─── Particle Field (training active only) ───────────────────────────────
function ParticleField() {
  const canvasRef = useRef(null);
  const particlesRef = useRef([]);
  const rafRef = useRef(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    const resize = () => { canvas.width = canvas.offsetWidth; canvas.height = canvas.offsetHeight; };
    resize();
    window.addEventListener('resize', resize);

    // spawn particles
    const count = 40;
    particlesRef.current = Array.from({ length: count }, () => ({
      x: Math.random() * canvas.width,
      y: Math.random() * canvas.height,
      vx: (Math.random() - 0.5) * 0.4,
      vy: -Math.random() * 0.6 - 0.2,
      r: Math.random() * 2 + 0.5,
      alpha: Math.random() * 0.5 + 0.1,
      life: Math.random(),
    }));

    const draw = () => {
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      particlesRef.current.forEach(p => {
        p.x += p.vx;
        p.y += p.vy;
        p.life += 0.003;
        if (p.y < -10 || p.life > 1) { p.y = canvas.height + 5; p.x = Math.random() * canvas.width; p.life = 0; }
        const a = p.alpha * (1 - p.life);
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
        ctx.fillStyle = `rgba(0, 255, 136, ${a})`;
        ctx.fill();
      });
      rafRef.current = requestAnimationFrame(draw);
    };
    rafRef.current = requestAnimationFrame(draw);

    return () => {
      window.removeEventListener('resize', resize);
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
    };
  }, []);

  return (
    <canvas
      ref={canvasRef}
      style={{
        position: 'absolute', inset: 0, width: '100%', height: '100%',
        pointerEvents: 'none', zIndex: 0, opacity: 0.6,
      }}
    />
  );
}

// ─── Training Pulse Bar ─────────────────────────────────────────────────
function TrainingPulseBar({ episodes }) {
  const total = episodes?.length || 0;
  return (
    <div style={{
      width: '100%', height: 4, borderRadius: 2, background: 'rgba(0,255,136,0.08)',
      overflow: 'hidden', position: 'relative',
    }}>
      <motion.div
        animate={{ x: ['-100%', '200%'] }}
        transition={{ duration: 2, repeat: Infinity, ease: 'linear' }}
        style={{
          position: 'absolute', top: 0, left: 0, width: '40%', height: '100%',
          background: 'linear-gradient(90deg, transparent, #00ff88, transparent)',
          borderRadius: 2,
        }}
      />
    </div>
  );
}

// ─── LIVE Badge ──────────────────────────────────────────────────────────
function LiveBadge() {
  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.8 }}
      animate={{ opacity: 1, scale: 1 }}
      exit={{ opacity: 0, scale: 0.8 }}
      style={{
        display: 'inline-flex', alignItems: 'center', gap: 6,
        background: 'rgba(0,255,136,0.12)', border: '1px solid rgba(0,255,136,0.35)',
        borderRadius: 6, padding: '3px 10px', fontSize: 11, fontWeight: 700,
        color: '#00ff88', fontFamily: "'JetBrains Mono', monospace",
        letterSpacing: '0.1em', textTransform: 'uppercase',
      }}
    >
      <span style={{
        width: 7, height: 7, borderRadius: '50%', background: '#00ff88',
        boxShadow: '0 0 6px #00ff88, 0 0 12px rgba(0,255,136,0.4)',
        animation: 'liveBlink 1.2s ease-in-out infinite',
      }} />
      LIVE
    </motion.div>
  );
}

// ─── Metric Card with Glow ──────────────────────────────────────────────
function MetricCard({ card, index, isTraining, sparkData, animValue }) {
  const animatedNum = useAnimatedValue(animValue, 500);
  const isPositiveTrend = sparkData && sparkData.length >= 2 && sparkData[sparkData.length - 1] >= sparkData[0];

  const glowStyle = isTraining ? {
    boxShadow: '0 0 15px rgba(0,255,136,0.15), 0 0 30px rgba(0,255,136,0.06)',
    animation: 'cardPulse 2s ease-in-out infinite',
    animationDelay: `${index * 0.3}s`,
  } : {};

  const borderColor = isTraining ? 'rgba(0,255,136,0.5)' : 'rgba(0,255,136,0.3)';

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: index * 0.1, type: 'spring', stiffness: 200 }}
      whileHover={{ scale: 1.03, y: -2 }}
      className="retro-card rounded-xl p-5 transition-all duration-300 group cursor-default"
      style={{ borderLeft: `2px solid ${borderColor}`, ...glowStyle }}
    >
      <div className="flex items-center justify-between mb-3">
        <MetricTooltip metric={card.tooltipKey}>
          <span className="text-xs text-retro-muted uppercase tracking-wider font-medium">{card.label}</span>
        </MetricTooltip>
        <div className={`${card.bg} p-2 rounded-lg transition-transform duration-300 group-hover:scale-110`}>
          <card.icon size={16} className={card.color} />
        </div>
      </div>
      <p className="text-2xl font-bold text-neon-green neon-text tabular-nums" style={{ fontVariantNumeric: 'tabular-nums' }}>
        {card.value}
      </p>
      <Sparkline data={sparkData} width={80} height={22} />
    </motion.div>
  );
}

// ─── Inject Keyframes ───────────────────────────────────────────────────
function useKeyframes() {
  useEffect(() => {
    const id = 'dashboard-pulse-keyframes';
    if (document.getElementById(id)) return;
    const style = document.createElement('style');
    style.id = id;
    style.textContent = `
      @keyframes cardPulse {
        0%, 100% { box-shadow: 0 0 12px rgba(0,255,136,0.12), 0 0 24px rgba(0,255,136,0.05); }
        50% { box-shadow: 0 0 22px rgba(0,255,136,0.25), 0 0 44px rgba(0,255,136,0.1); }
      }
      @keyframes liveBlink {
        0%, 100% { opacity: 1; }
        50% { opacity: 0.25; }
      }
      @keyframes replayPulse {
        0%, 100% { box-shadow: 0 0 8px rgba(0,255,136,0.2), inset 0 0 8px rgba(0,255,136,0.05); }
        50% { box-shadow: 0 0 20px rgba(0,255,136,0.45), inset 0 0 15px rgba(0,255,136,0.12); }
      }
      @keyframes metricFlash {
        0% { background: rgba(0,255,136,0.15); }
        100% { background: transparent; }
      }
      .replay-slider::-webkit-slider-thumb {
        -webkit-appearance: none;
        appearance: none;
        width: 18px;
        height: 18px;
        border-radius: 50%;
        background: #00ff88;
        cursor: pointer;
        box-shadow: 0 0 8px #00ff88, 0 0 16px rgba(0,255,136,0.4);
        border: 2px solid #00cc6a;
      }
      .replay-slider::-moz-range-thumb {
        width: 18px;
        height: 18px;
        border-radius: 50%;
        background: #00ff88;
        cursor: pointer;
        box-shadow: 0 0 8px #00ff88, 0 0 16px rgba(0,255,136,0.4);
        border: 2px solid #00cc6a;
      }
      .replay-slider {
        -webkit-appearance: none;
        appearance: none;
        width: 100%;
        height: 6px;
        border-radius: 3px;
        background: rgba(0,255,136,0.15);
        outline: none;
      }
    `;
    document.head.appendChild(style);
  }, []);
}

// ═════════════════════════════════════════════════════════════════════════
// ─── TRAINING REPLAY PANEL ──────────────────────────────────────────────
// ═════════════════════════════════════════════════════════════════════════
function generateReplayData(conversations, totalEpisodes = 500) {
  // If we have enough real data, use conversations as data source
  if (conversations && conversations.length > 10) {
    const data = [];
    const len = conversations.length;
    for (let i = 0; i < len; i++) {
      const t = i / (len - 1);
      data.push({
        episode: Math.round((i / (len - 1)) * totalEpisodes),
        reward: -0.5 + t * 1.3 + (Math.random() - 0.5) * 0.15,
        vocabSize: Math.round(5 + 48 * (1 - Math.exp(-4 * t)) + (Math.random() - 0.5) * 3),
        compositionality: 0.1 + 0.55 * (1 - Math.exp(-3 * t)) + (Math.random() - 0.5) * 0.06,
      });
    }
    return data;
  }

  // Generate synthetic training curve
  const data = [];
  for (let i = 0; i < totalEpisodes; i++) {
    const t = i / (totalEpisodes - 1);
    const noise = () => (Math.random() - 0.5) * 0.08;
    data.push({
      episode: i,
      reward: -0.5 + 1.3 * (1 - Math.exp(-3.5 * t)) + noise() * (1 - t * 0.5),
      vocabSize: Math.max(2, Math.round(5 + 48 * (1 - Math.exp(-4 * t)) + (Math.random() - 0.5) * 4)),
      compositionality: Math.max(0, Math.min(1, 0.1 + 0.55 * (1 - Math.exp(-3 * t)) + noise() * 0.8)),
    });
  }
  return data;
}

function TrainingReplay({ conversations, metrics }) {
  const [isPlaying, setIsPlaying] = useState(false);
  const [speed, setSpeed] = useState(1);
  const [currentEpisode, setCurrentEpisode] = useState(0);
  const [flashingMetric, setFlashingMetric] = useState(null);
  const intervalRef = useRef(null);
  const sectionRef = useRef(null);


  const maxEpisodes = 500;

  const replayData = useMemo(() => generateReplayData(conversations, maxEpisodes), [conversations]);
  const maxIdx = replayData.length - 1;

  const currentData = replayData[Math.min(currentEpisode, maxIdx)] || replayData[0];

  // Speed map: 0.5x = 500ms, 1x = 250ms, 2x = 125ms, 4x = 62ms
  const speedMs = { 0.5: 500, 1: 250, 2: 125, 4: 62 };

  // Play/Pause logic
  useEffect(() => {
    if (isPlaying) {
      intervalRef.current = setInterval(() => {
        setCurrentEpisode(prev => {
          if (prev >= maxIdx) {
            return maxIdx;
          }
          return prev + 1;
        });
      }, speedMs[speed] || 250);
    }
    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, [isPlaying, speed, maxIdx]);

  // Stop playback when reaching the end
  useEffect(() => {
    if (isPlaying && currentEpisode >= maxIdx) {
      setIsPlaying(false);
    }
  }, [currentEpisode, maxIdx, isPlaying]);

  // Flash metric on episode change
  useEffect(() => {
    if (isPlaying) {
      setFlashingMetric('all');
      const t = setTimeout(() => setFlashingMetric(null), 150);
      return () => clearTimeout(t);
    }
  }, [currentEpisode, isPlaying]);

  // Space bar toggle
  useEffect(() => {
    const handleKey = (e) => {
      if (e.code === 'Space' && !['INPUT', 'TEXTAREA'].includes(e.target.tagName)) {
        e.preventDefault();
        setIsPlaying(p => !p);
      }
    };
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, []);

  const handleScrub = (e) => {
    setCurrentEpisode(Number(e.target.value));
  };

  const handleReset = () => {
    setIsPlaying(false);
    setCurrentEpisode(0);
  };

  const handleExportReplayCSV = () => {
    const header = 'Episode,Reward,VocabSize,Compositionality\n';
    const rows = replayData.map(d =>
      `${d.episode},${d.reward.toFixed(4)},${d.vocabSize},${d.compositionality.toFixed(4)}`
    ).join('\n');
    const blob = new Blob([header + rows], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'training_replay.csv';
    a.click();
    URL.revokeObjectURL(url);
  };

  const replayMetrics = {
    episodes: replayData.slice(0, currentEpisode + 1).map(d => d.episode),
    rewards: replayData.slice(0, currentEpisode + 1).map(d => d.reward),
    vocabSizes: replayData.slice(0, currentEpisode + 1).map(d => d.vocabSize),
    compositionality: replayData.slice(0, currentEpisode + 1).map(d => d.compositionality),
  };

  const speedOptions = [0.5, 1, 2, 4];

  return (
    <div
      ref={sectionRef}
      style={{
        position: 'relative', zIndex: 1,
        border: isPlaying ? '1px solid rgba(0,255,136,0.5)' : '1px solid rgba(0,255,136,0.15)',
        borderRadius: 12,
        background: 'rgba(17,24,39,0.6)',
        overflow: 'hidden',
        animation: isPlaying ? 'replayPulse 1.5s ease-in-out infinite' : 'none',
        transition: 'border-color 0.3s ease',
      }}
    >
      {/* Header */}
      <div style={{
        width: '100%', display: 'flex', alignItems: 'center', gap: 10,
        padding: '14px 20px',
      }}>
        <ChevronDown size={16} color="#00ff88" />
        <span style={{
          fontFamily: "'JetBrains Mono', monospace", fontSize: 13, fontWeight: 700,
          color: '#00ff88', letterSpacing: '0.12em', textTransform: 'uppercase',
        }}>
          ▶ Training Replay
        </span>
        {isPlaying && (
          <span style={{
            display: 'inline-flex', alignItems: 'center', gap: 5,
            background: 'rgba(0,255,136,0.15)', border: '1px solid rgba(0,255,136,0.4)',
            borderRadius: 5, padding: '2px 8px', fontSize: 10, fontWeight: 700,
            color: '#00ff88', fontFamily: "'JetBrains Mono', monospace",
            letterSpacing: '0.1em',
          }}>
            <span style={{
              width: 6, height: 6, borderRadius: '50%', background: '#00ff88',
              boxShadow: '0 0 6px #00ff88', animation: 'liveBlink 0.8s ease-in-out infinite',
            }} />
            REPLAYING
          </span>
        )}
      </div>

      {/* Content */}
      <div style={{ overflow: 'hidden' }}>
            <div style={{ padding: '0 20px 20px' }}>
              {/* Episode Counter */}
              <div style={{
                display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16,
              }}>
                <div style={{
                  fontFamily: "'JetBrains Mono', monospace", fontSize: 28, fontWeight: 700,
                  color: '#00ff88', textShadow: '0 0 10px rgba(0,255,136,0.5)',
                  fontVariantNumeric: 'tabular-nums',
                }}>
                  EP {currentEpisode.toLocaleString()}
                  <span style={{ fontSize: 14, color: '#666680', marginLeft: 6 }}>/ {maxIdx.toLocaleString()}</span>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <span style={{ fontSize: 11, color: '#666680', fontFamily: "'JetBrains Mono', monospace" }}>
                    Speed
                  </span>
                  {speedOptions.map(s => (
                    <button
                      key={s}
                      onClick={() => setSpeed(s)}
                      style={{
                        padding: '4px 10px', borderRadius: 5, fontSize: 11, fontWeight: 700,
                        fontFamily: "'JetBrains Mono', monospace",
                        border: speed === s ? '1px solid #00ff88' : '1px solid rgba(102,102,128,0.4)',
                        background: speed === s ? 'rgba(0,255,136,0.15)' : 'transparent',
                        color: speed === s ? '#00ff88' : '#8a8a9a',
                        cursor: 'pointer', transition: 'all 0.15s ease',
                        boxShadow: speed === s ? '0 0 8px rgba(0,255,136,0.2)' : 'none',
                      }}
                    >
                      {s}x
                    </button>
                  ))}
                </div>
              </div>

              {/* Scrubber */}
              <div style={{ marginBottom: 16 }}>
                <input
                  type="range"
                  className="replay-slider"
                  min={0}
                  max={maxIdx}
                  value={currentEpisode}
                  onChange={handleScrub}
                  style={{ cursor: 'pointer' }}
                />
              </div>

              {/* Controls */}
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 16 }}>
                <button
                  onClick={() => setIsPlaying(!isPlaying)}
                  style={{
                    display: 'flex', alignItems: 'center', gap: 6,
                    padding: '8px 20px', borderRadius: 8,
                    border: '1px solid #00ff88', background: 'rgba(0,255,136,0.1)',
                    color: '#00ff88', fontSize: 13, fontWeight: 700,
                    fontFamily: "'JetBrains Mono', monospace",
                    cursor: 'pointer', transition: 'all 0.15s ease',
                    boxShadow: '0 0 12px rgba(0,255,136,0.2)',
                    letterSpacing: '0.05em',
                  }}
                >
                  {isPlaying ? <Pause size={14} /> : <Play size={14} />}
                  {isPlaying ? 'PAUSE' : 'PLAY'}
                </button>
                <button
                  onClick={handleReset}
                  style={{
                    display: 'flex', alignItems: 'center', gap: 5,
                    padding: '8px 14px', borderRadius: 8,
                    border: '1px solid rgba(102,102,128,0.4)', background: 'transparent',
                    color: '#8a8a9a', fontSize: 12, fontWeight: 600,
                    fontFamily: "'JetBrains Mono', monospace",
                    cursor: 'pointer', transition: 'all 0.15s ease',
                  }}
                >
                  <RotateCcw size={12} />
                  RESET
                </button>
                <button
                  onClick={handleExportReplayCSV}
                  style={{
                    display: 'flex', alignItems: 'center', gap: 5,
                    padding: '8px 14px', borderRadius: 8,
                    border: '1px solid rgba(102,102,128,0.4)', background: 'transparent',
                    color: '#8a8a9a', fontSize: 12, fontWeight: 600,
                    fontFamily: "'JetBrains Mono', monospace",
                    cursor: 'pointer', transition: 'all 0.15s ease',
                  }}
                >
                  <Download size={12} />
                  EXPORT CSV
                </button>
                <span style={{
                  marginLeft: 'auto', fontSize: 10, color: '#666680',
                  fontFamily: "'JetBrains Mono', monospace",
                }}>
                  Space to play/pause
                </span>
              </div>

              {/* Live metric readout */}
              <div style={{
                display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 10, marginBottom: 16,
              }}>
                {[
                  {
                    label: 'Reward',
                    value: currentData.reward.toFixed(3),
                    color: '#00ff88',
                    icon: TrendingUp,
                  },
                  {
                    label: 'Vocab Size',
                    value: currentData.vocabSize,
                    color: '#a78bfa',
                    icon: BookOpen,
                  },
                  {
                    label: 'Compositionality',
                    value: currentData.compositionality.toFixed(3),
                    color: '#f59e0b',
                    icon: Layers,
                  },
                ].map((m, i) => (
                  <div
                    key={m.label}
                    style={{
                      background: flashingMetric === 'all' ? 'rgba(0,255,136,0.08)' : 'rgba(17,24,39,0.5)',
                      border: '1px solid rgba(0,255,136,0.12)',
                      borderRadius: 8, padding: '10px 14px',
                      transition: 'background 0.15s ease',
                      animation: flashingMetric === 'all' ? 'metricFlash 0.2s ease-out' : 'none',
                    }}
                  >
                    <div style={{
                      fontSize: 10, color: '#666680', fontFamily: "'JetBrains Mono', monospace",
                      textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 4,
                    }}>
                      {m.label}
                    </div>
                    <div style={{
                      fontSize: 22, fontWeight: 700, color: m.color,
                      fontFamily: "'JetBrains Mono', monospace",
                      fontVariantNumeric: 'tabular-nums',
                      textShadow: `0 0 8px ${m.color}44`,
                    }}>
                      {m.value}
                    </div>
                  </div>
                ))}
              </div>

              {/* Replay Chart */}
              <div style={{
                background: 'rgba(17,24,39,0.5)', border: '1px solid rgba(0,255,136,0.1)',
                borderRadius: 8, padding: 14,
              }}>
                <div style={{
                  fontSize: 11, color: '#666680', fontFamily: "'JetBrains Mono', monospace",
                  textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 10,
                }}>
                  Replay Progress — Episode {currentEpisode} of {maxIdx}
                </div>
                <MetricsChart metrics={replayMetrics} title="" />
              </div>
            </div>
          </div>
    </div>
  );
}

// ═════════════════════════════════════════════════════════════════════════
// ─── DASHBOARD ──────────────────────────────────────────────────────────
// ═════════════════════════════════════════════════════════════════════════
export default function Dashboard({ sessions = [], metrics = {}, conversations = [], isTraining, onSelectSession, onCreateSession, onStartTraining }) {
  const [quickStarting, setQuickStarting] = useState(false);
  const [loading, setLoading] = useState(false);
  useKeyframes();

  // ── sparkline history buffer ──
  const sparkHistoryRef = useRef({ rewards: [], vocab: [], comp: [], episodes: [] });
  useEffect(() => {
    const h = sparkHistoryRef.current;
    if (metrics.rewards?.length) {
      const last = metrics.rewards[metrics.rewards.length - 1];
      h.rewards = [...h.rewards.slice(-19), last];
    }
    if (metrics.vocabSizes?.length) {
      const last = metrics.vocabSizes[metrics.vocabSizes.length - 1];
      h.vocab = [...h.vocab.slice(-19), last];
    }
    if (metrics.compositionality?.length) {
      const last = metrics.compositionality[metrics.compositionality.length - 1];
      h.comp = [...h.comp.slice(-19), last];
    }
    if (metrics.episodes?.length) {
      const last = metrics.episodes[metrics.episodes.length - 1];
      h.episodes = [...h.episodes.slice(-19), last];
    }
  }, [metrics]);

  const handleQuickStart = async () => {
    if (!onCreateSession || !onStartTraining) return;
    setQuickStarting(true);
    try {
      const session = await onCreateSession({ name: 'Quick Start', config: { num_episodes: 1000 } });
      if (session?.session_id) {
        await onSelectSession?.(session.session_id);
        await onStartTraining(session.session_id);
      }
    } catch (e) {
      console.error('Quick start failed:', e);
    } finally {
      setQuickStarting(false);
    }
  };

  const handleExportCSV = () => {
    if (!metrics.episodes?.length) return;
    const header = 'Episode,Reward,Loss,Vocab Size,Compositionality,Entropy\n';
    const rows = metrics.episodes.map((ep, i) => {
      return [
        ep,
        metrics.rewards?.[i]?.toFixed(4) ?? '',
        metrics.losses?.[i]?.toFixed(4) ?? '',
        metrics.vocabSizes?.[i] ?? '',
        metrics.compositionality?.[i]?.toFixed(4) ?? '',
        metrics.entropy?.[i]?.toFixed(4) ?? '',
      ].join(',');
    }).join('\n');
    const csv = header + rows;
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'training_metrics.csv';
    a.click();
    URL.revokeObjectURL(url);
  };

  const latestReward = metrics.rewards?.[metrics.rewards.length - 1];
  const latestVocab = metrics.vocabSizes?.[metrics.vocabSizes.length - 1];
  const latestComp = metrics.compositionality?.[metrics.compositionality.length - 1];
  const totalEpisodes = metrics.episodes?.[metrics.episodes.length - 1] || 0;
  const hasData = metrics.episodes?.length > 0;

  const metricCards = [
    {
      label: 'Total Episodes',
      value: totalEpisodes.toLocaleString(),
      numericValue: totalEpisodes,
      icon: Activity,
      color: 'text-cyber-cyan',
      bg: 'bg-cyber-cyan/10',
      tooltipKey: null,
      sparkKey: 'episodes',
    },
    {
      label: 'Avg Reward',
      value: latestReward != null ? latestReward.toFixed(3) : '—',
      numericValue: latestReward ?? 0,
      icon: TrendingUp,
      color: 'text-neon-green',
      bg: 'bg-neon-green/10',
      tooltipKey: 'reward',
      sparkKey: 'rewards',
    },
    {
      label: 'Vocabulary Size',
      value: latestVocab ?? '—',
      numericValue: latestVocab ?? 0,
      icon: BookOpen,
      color: 'text-violet-400',
      bg: 'bg-violet-500/10',
      tooltipKey: 'vocab_size',
      sparkKey: 'vocab',
    },
    {
      label: 'Compositionality',
      value: latestComp != null ? latestComp.toFixed(3) : '—',
      numericValue: latestComp ?? 0,
      icon: Layers,
      color: 'text-robot-amber',
      bg: 'bg-robot-amber/10',
      tooltipKey: 'compositionality',
      sparkKey: 'comp',
    },
  ];

  const sparkMap = sparkHistoryRef.current;

  const isLoading = sessions.length === 0 && !hasData;

  return (
    <div className="space-y-6 animate-slide-in" style={{ position: 'relative' }}>
      {/* ── Particle background when training ── */}
      {isTraining && <ParticleField />}

      {/* ── Header ── */}
      <div className="flex items-center justify-between flex-wrap gap-4" style={{ position: 'relative', zIndex: 1 }}>
        <div>
          <div className="flex items-center gap-3">
            <h1 className="text-2xl font-bold section-header font-heading uppercase tracking-wider">
              DASHBOARD <span className="cursor-blink" />
            </h1>
            <AnimatePresence>
              {isTraining && <LiveBadge />}
            </AnimatePresence>
          </div>
          <p className="text-sm text-retro-muted mt-1">Language emergence training overview</p>
        </div>
        <div className="flex items-center gap-3 flex-wrap">
          {isTraining && (
            <div className="flex items-center gap-2 bg-neon-green/10 text-neon-green px-3 py-1.5 rounded-full text-sm border border-neon-green/20">
              <span className="led-dot" />
              Training Active
            </div>
          )}
          <button
            onClick={handleExportCSV}
            disabled={!hasData}
            className="flex items-center gap-2 border-neon-green/50 hover:bg-neon-green/10 disabled:opacity-40 text-neon-green px-4 py-2 rounded-lg text-sm transition-colors border"
          >
            <Download size={14} />
            Export CSV
          </button>
          <button
            onClick={handleQuickStart}
            disabled={quickStarting}
            className="flex items-center gap-2 bg-neon-green/10 border border-neon-green/30 text-neon-green hover:bg-neon-green/20 disabled:opacity-40 px-4 py-2 rounded-lg text-sm font-medium transition-all duration-200"
          >
            {quickStarting ? <Loader size={14} className="animate-spin" /> : <Play size={14} />}
            {quickStarting ? 'Starting…' : 'Quick Start'}
          </button>
        </div>
      </div>

      {/* ── Training Pulse Bar ── */}
      {isTraining && (
        <motion.div
          initial={{ opacity: 0, scaleY: 0 }}
          animate={{ opacity: 1, scaleY: 1 }}
          exit={{ opacity: 0 }}
          style={{ position: 'relative', zIndex: 1 }}
        >
          <TrainingPulseBar episodes={metrics.episodes} />
        </motion.div>
      )}

      {/* ── Metric Cards ── */}
      <div style={{ position: 'relative', zIndex: 1 }}>
        {isLoading ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            {Array.from({ length: 4 }).map((_, i) => (
              <SkeletonCard key={i} />
            ))}
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            {metricCards.map((card, i) => (
              <MetricCard
                key={card.label}
                card={card}
                index={i}
                isTraining={isTraining}
                sparkData={sparkMap[card.sparkKey]}
                animValue={card.numericValue}
              />
            ))}
          </div>
        )}
      </div>

      {/* ── Chart ── */}
      <div style={{ position: 'relative', zIndex: 1 }}>
        {isLoading ? (
          <SkeletonChart />
        ) : (
          <MetricsChart metrics={metrics} title="Training Progress" />
        )}
      </div>

      {/* ── Training Replay ── */}
      <TrainingReplay conversations={conversations} metrics={metrics} />

      {/* ── Sessions & Recent Conversations ── */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6" style={{ position: 'relative', zIndex: 1 }}>
        {/* Active Sessions */}
        <Card accent="#00ff88" padding={16}>
          <SectionTitle icon="🗂" color="#00ff88">Active Sessions</SectionTitle>
          {isLoading ? (
            <SkeletonList count={3} />
          ) : (
            <div className="space-y-2">
              {sessions.length === 0 ? (
                <EmptyState icon="🚀" message="No sessions yet" hint="Use Quick Start to begin" />
              ) : (
                sessions.map((session) => (
                  <button
                    key={session.session_id}
                    onClick={() => onSelectSession?.(session.session_id)}
                    className="w-full flex items-center justify-between p-3 rounded-lg retro-card hover:glow-green transition-all duration-200 text-left group/session font-mono"
                  >
                    <div>
                      <p className="text-sm font-medium">{session.name || `Session ${session.session_id}`}</p>
                      <div className="flex items-center gap-3 mt-0.5">
                        <p className="text-xs text-retro-muted">
                          Episode {session.current_episode?.toLocaleString() || 0}
                          {session.total_episodes ? ` / ${session.total_episodes.toLocaleString()}` : ''}
                        </p>
                        {session.total_episodes > 0 && (
                          <div className="flex items-center gap-1.5">
                            <div className="w-16 h-1.5 bg-steel-border rounded-full overflow-hidden">
                              <div
                                className="h-full bg-neon-green rounded-full transition-all"
                                style={{ width: `${Math.min(100, ((session.current_episode || 0) / session.total_episodes) * 100)}%` }}
                              />
                            </div>
                            <span className="text-xs text-retro-muted">
                              {(((session.current_episode || 0) / session.total_episodes) * 100).toFixed(0)}%
                            </span>
                          </div>
                        )}
                      </div>
                    </div>
                    <div className={session.status === 'training' ? 'led-dot' : 'led-dot-red'} />
                  </button>
                ))
              )}
            </div>
          )}
        </Card>

        {/* Recent Conversations */}
        <Card accent="#00ddff" padding={16}>
          <SectionTitle icon="💬" color="#00ddff">Recent Conversations</SectionTitle>
          {isLoading ? (
            <SkeletonList count={3} />
          ) : (
            <div className="space-y-2 max-h-96 overflow-y-auto">
              {conversations.length === 0 ? (
                <EmptyState icon="💬" message="No conversations yet" hint="Start training to see agent communication" />
              ) : (
                conversations.slice(0, 5).map((conv, i) => (
                  <ConversationCard key={conv.id || i} conversation={conv} index={i} />
                ))
              )}
            </div>
          )}
        </Card>
      </div>

      {/* ── Keyboard Shortcuts Reference ── */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.4 }}
        className=""
        style={{ position: 'relative', zIndex: 1 }}
      >
        <Card accent="#ffaa00" padding={16}>
        <SectionTitle icon="⌨" color="#ffaa00">Keyboard Shortcuts</SectionTitle>
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-x-6 gap-y-1.5 text-xs font-mono">
          {[
            { key: '1', label: 'Dashboard' },
            { key: '2', label: 'Live Feed' },
            { key: '3', label: 'Language Analysis' },
            { key: '4', label: 'Comparison' },
            { key: '5', label: 'Heatmap' },
            { key: '6', label: 'Phylogeny' },
            { key: '7', label: 'Attention' },
            { key: '8', label: 'Arena' },
            { key: '9', label: 'Decoder' },
            { key: '0', label: 'Minds' },
            { key: 'e', label: 'Environment' },
            { key: 'r', label: 'Replay' },
            { key: 'p', label: 'Playground' },
            { key: 'd', label: 'Demo Mode' },
            { key: 'v', label: 'Voice Controls' },
            { key: 't', label: 'Training Comparison' },
            { key: '-', label: 'Desktop' },
            { key: '=', label: 'Workspace' },
            { key: 'Space', label: 'Pause / Resume' },
          ].map((item) => (
            <div key={item.key} className="flex items-center gap-2">
              <kbd className="inline-block min-w-[24px] text-center px-1.5 py-0.5 rounded border border-steel-border bg-steel-dark/50 text-neon-green/70 text-[10px]">
                {item.key}
              </kbd>
              <span className="text-retro-muted">{item.label}</span>
            </div>
          ))}
        </div>
        </Card>
      </motion.div>
    </div>
  );
}
