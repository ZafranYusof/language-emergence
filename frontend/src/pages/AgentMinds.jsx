import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { fetchMinds } from '../utils/api';
import { ensureSprites, drawSprite, drawSpeechBubble, ParticleSystem, C as PC } from '../utils/pixelEngine';
import EmptyCanvas from '../components/EmptyCanvas';

/* ───── colour palette ───── */
const C = {
  bg: '#0a0a0a', panel: '#1a1a2e', panelLight: '#22223a',
  green: '#00ff88', amber: '#ffaa00', cyan: '#00ddff',
  red: '#ff4444', dim: '#555577', text: '#ccccdd',
  textBright: '#eeeef5', purple: '#aa66ff', pink: '#ff66aa',
};

/* ───── keyframes (injected once) ───── */
const styleId = 'agent-minds-keyframes';
if (typeof document !== 'undefined' && !document.getElementById(styleId)) {
  const el = document.createElement('style');
  el.id = styleId;
  el.textContent = `
    @keyframes am-pulse { 0%,100%{transform:scale(1)} 50%{transform:scale(1.06)} }
    @keyframes am-glow  { 0%,100%{filter:drop-shadow(0 0 4px ${C.green})} 50%{filter:drop-shadow(0 0 14px ${C.green})} }
    @keyframes am-glow-amber { 0%,100%{filter:drop-shadow(0 0 4px ${C.amber})} 50%{filter:drop-shadow(0 0 14px ${C.amber})} }
    @keyframes am-scan { 0%{background-position:0% 0%} 100%{background-position:0% 100%} }
    @keyframes am-fadeIn { from{opacity:0;transform:translateY(8px)} to{opacity:1;transform:translateY(0)} }
    @keyframes am-typewriter { from{max-width:0} to{max-width:600px} }
    @keyframes am-blink { 0%,100%{opacity:1} 50%{opacity:0.3} }
    @keyframes am-bar-fill { from{width:0} to{width:var(--fill)} }
    @keyframes am-thought-glow {
      0% { box-shadow: 0 0 8px var(--glow-color, ${C.cyan}44); opacity: 0; transform: translateY(12px); }
      30% { box-shadow: 0 0 18px var(--glow-color, ${C.cyan}66); opacity: 1; transform: translateY(0); }
      100% { box-shadow: 0 0 4px var(--glow-color, ${C.cyan}22); opacity: 1; transform: translateY(0); }
    }
    @keyframes am-pop-in { 0% { transform: scale(0); opacity: 0; } 60% { transform: scale(1.3); opacity: 1; } 100% { transform: scale(1); opacity: 1; } }
    @keyframes am-rel-bar { from { width: 0; } }
    @keyframes am-shimmer { 0% { background-position: -200% 0; } 100% { background-position: 200% 0; } }
    @keyframes am-cursor-blink { 0%, 100% { border-right-color: transparent; } 50% { border-right-color: currentColor; } }
    @keyframes am-radar-transition { from { opacity: 0.5; } to { opacity: 1; } }
    @keyframes am-drift-pulse { 0%, 100% { opacity: 0.6; } 50% { opacity: 1; } }
  `;
  document.head.appendChild(el);
}

/* ───── tiny helpers ───── */
const pct = (v) => `${Math.round((v || 0) * 100)}%`;
const clamp01 = (v) => Math.max(0, Math.min(1, v || 0));
const lerp = (a, b, t) => a + (b - a) * t;

const qualityColor = (q) => {
  const map = { terrible: C.red, poor: '#ff6644', mediocre: C.amber, good: C.green, excellent: C.cyan };
  return map[q] || C.dim;
};
const qualityLabel = (q) => (q || 'unknown').toUpperCase();
const stars = (score) => {
  const n = Math.round(clamp01(score) * 5);
  return '★'.repeat(n) + '☆'.repeat(5 - n);
};
const thoughtIcon = (type) => {
  if (type === 'partner_eval' || type === 'partner_evaluation') return '⚖️';
  if (type === 'strategy' || type === 'strategy_adapt') return '🔄';
  return '💭';
};
const thoughtColor = (type) => {
  if (type === 'partner_eval' || type === 'partner_evaluation') return C.amber;
  if (type === 'strategy' || type === 'strategy_adapt') return C.green;
  return C.cyan;
};
const emotionIcons = {
  happy: '😊', curious: '🧐', confused: '😕', excited: '🤩',
  worried: '😟', confident: '😎', frustrated: '😤', neutral: '😐',
  focused: '🎯', satisfied: '😌',
};
const emotionIconFor = (text) => {
  const t = (text || '').toLowerCase();
  if (t.includes('happy') || t.includes('joy') || t.includes('great')) return emotionIcons.happy;
  if (t.includes('curious') || t.includes('wonder') || t.includes('interesting')) return emotionIcons.curious;
  if (t.includes('confus') || t.includes('uncertain') || t.includes('unclear')) return emotionIcons.confused;
  if (t.includes('excit') || t.includes('breakthrough') || t.includes('amazing')) return emotionIcons.excited;
  if (t.includes('worri') || t.includes('concern') || t.includes('risk')) return emotionIcons.worried;
  if (t.includes('confiden') || t.includes('sure') || t.includes('certain')) return emotionIcons.confident;
  if (t.includes('frustrat') || t.includes('fail') || t.includes('stuck')) return emotionIcons.frustrated;
  return emotionIcons.neutral;
};

/* ───── Synthetic thought generator ───── */
const syntheticThoughts = {
  speaker: [
    { text: 'Analyzing listener response patterns...', icon: '🧐', emotion: 'curious' },
    { text: 'Symbol frequency suggests higher engagement', icon: '😎', emotion: 'confident' },
    { text: 'Adapting communication strategy for clarity', icon: '🔄', emotion: 'focused' },
    { text: 'Detecting semantic drift in shared vocabulary', icon: '😕', emotion: 'confused' },
    { text: 'Reward signal indicates successful transmission', icon: '🤩', emotion: 'excited' },
    { text: 'Considering alternative encoding schemes', icon: '💭', emotion: 'curious' },
    { text: 'Trust metrics trending upward this session', icon: '😊', emotion: 'happy' },
    { text: 'Pattern recognition threshold approaching...', icon: '🎯', emotion: 'focused' },
  ],
  listener: [
    { text: 'Decoding speaker intent from symbol sequence...', icon: '🧐', emotion: 'curious' },
    { text: 'Semantic mapping confidence: 73%', icon: '😎', emotion: 'confident' },
    { text: 'Ambiguity detected in last transmission', icon: '😕', emotion: 'confused' },
    { text: 'Reinforcement learning update applied', icon: '🤩', emotion: 'excited' },
    { text: 'Cross-referencing with memory patterns', icon: '💭', emotion: 'neutral' },
    { text: 'Novel symbol combination observed', icon: '🧐', emotion: 'curious' },
    { text: 'Communication efficiency improving', icon: '😊', emotion: 'happy' },
    { text: 'Uncertain about sender\'s intended meaning', icon: '😟', emotion: 'worried' },
  ],
};

function useSyntheticThoughts(agent, interval = [3000, 5000]) {
  const [thoughts, setThoughts] = useState([]);
  const idx = useRef(0);
  useEffect(() => {
    const pool = syntheticThoughts[agent] || syntheticThoughts.speaker;
    const tick = () => {
      const t = pool[idx.current % pool.length];
      idx.current++;
      setThoughts(prev => [{ ...t, id: Date.now() + Math.random(), timestamp: Date.now() }, ...prev].slice(0, 10));
      const delay = interval[0] + Math.random() * (interval[1] - interval[0]);
      timer = setTimeout(tick, delay);
    };
    let timer = setTimeout(tick, 1000 + Math.random() * 2000);
    return () => clearTimeout(timer);
  }, [agent]);
  return thoughts;
}

/* ───── CANVAS HEADER: Agent Brain Landscape ───── */
function AgentBrainCanvas({ speaker, listener, selectedAgent, onSelectAgent }) {
  const canvasRef = useRef(null);
  const animRef = useRef(null);
  const particlesRef = useRef(new ParticleSystem());
  const [spritesLoaded, setSpritesLoaded] = useState(false);
  const selectedRef = useRef(selectedAgent);

  useEffect(() => { selectedRef.current = selectedAgent; }, [selectedAgent]);
  useEffect(() => { ensureSprites().then(() => setSpritesLoaded(true)); }, []);

  // Handle click to select agent
  const handleClick = useCallback((e) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const scaleX = 800 / rect.width;
    const x = (e.clientX - rect.left) * scaleX;
    // Speaker is at ~200, Listener at ~600
    if (x < 400) onSelectAgent(selectedRef.current === 'speaker' ? null : 'speaker');
    else onSelectAgent(selectedRef.current === 'listener' ? null : 'listener');
  }, [onSelectAgent]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');

    const draw = () => {
      const W = 800, H = 200;
      const now = Date.now();
      ctx.clearRect(0, 0, W, H);

      // ── Background: brain landscape ──
      ctx.fillStyle = PC.bg;
      ctx.fillRect(0, 0, W, H);

      // Neural network background lines
      ctx.strokeStyle = 'rgba(0,221,255,0.04)';
      ctx.lineWidth = 1;
      for (let i = 0; i < 15; i++) {
        const x1 = (i * 67 + 23) % W;
        const y1 = (i * 43 + 17) % (H * 0.7);
        const x2 = (i * 97 + 41) % W;
        const y2 = (i * 53 + 29) % (H * 0.7);
        ctx.beginPath();
        ctx.moveTo(x1, y1);
        ctx.lineTo(x2, y2);
        ctx.stroke();
      }

      // Neural nodes (background dots)
      for (let i = 0; i < 20; i++) {
        const nx = (i * 137 + 53) % W;
        const ny = (i * 97 + 31) % (H * 0.7);
        const pulse = Math.sin(now / 1000 + i) * 0.3 + 0.4;
        ctx.globalAlpha = pulse;
        ctx.fillStyle = i % 3 === 0 ? C.cyan : i % 3 === 1 ? C.purple : C.green;
        ctx.beginPath();
        ctx.arc(nx, ny, 2, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.globalAlpha = 1;

      // Ground line with gradient
      const groundY = H * 0.75;
      const groundGrad = ctx.createLinearGradient(0, groundY - 10, 0, H);
      groundGrad.addColorStop(0, '#1a1a2e');
      groundGrad.addColorStop(1, '#0a0a15');
      ctx.fillStyle = groundGrad;
      ctx.fillRect(0, groundY, W, H - groundY);

      // Grid lines on ground
      ctx.strokeStyle = 'rgba(0,255,136,0.06)';
      for (let gx = 0; gx < W; gx += 25) {
        ctx.beginPath(); ctx.moveTo(gx, groundY); ctx.lineTo(gx, H); ctx.stroke();
      }
      for (let gy = groundY; gy < H; gy += 15) {
        ctx.beginPath(); ctx.moveTo(0, gy); ctx.lineTo(W, gy); ctx.stroke();
      }

      // Horizon glow
      const horizGrad = ctx.createLinearGradient(0, groundY - 15, 0, groundY + 15);
      horizGrad.addColorStop(0, 'rgba(0,221,255,0.06)');
      horizGrad.addColorStop(1, 'transparent');
      ctx.fillStyle = horizGrad;
      ctx.fillRect(0, groundY - 15, W, 30);

      // ── Agent sprites ──
      const speakerX = 200, listenerX = 600;
      const agentY = groundY + 5;
      const selected = selectedRef.current;

      // Speaker walk bob
      const spkBob = Math.sin(now / 400) * 3;
      const lstBob = Math.sin(now / 400 + 1.5) * 3;

      // Mood glows
      const spkMood = speaker?.current_emotion;
      const lstMood = listener?.current_emotion;
      const spkGlowColor = spkMood ? qualityColor(getMoodCategory(spkMood.emotion)) : null;
      const lstGlowColor = lstMood ? qualityColor(getMoodCategory(lstMood.emotion)) : null;

      // Selection highlight
      const spkFlash = selected === 'speaker' ? '#00ddff' : null;
      const lstFlash = selected === 'listener' ? '#ffaa00' : null;

      drawSprite(ctx, 'oracle', speakerX, agentY, {
        scale: 2, bobY: spkBob, glow: spkGlowColor || (selected === 'speaker' ? C.cyan : undefined),
        flash: spkFlash,
      });
      drawSprite(ctx, 'assassin', listenerX, agentY, {
        scale: 2, bobY: lstBob, flip: true, glow: lstGlowColor || (selected === 'listener' ? C.amber : undefined),
        flash: lstFlash,
      });

      // ── Name labels ──
      ctx.save();
      ctx.font = 'bold 10px JetBrains Mono, monospace';
      ctx.textAlign = 'center';
      ctx.fillStyle = selected === 'speaker' ? C.cyan : C.dim;
      ctx.shadowColor = selected === 'speaker' ? C.cyan : 'transparent';
      ctx.shadowBlur = selected === 'speaker' ? 8 : 0;
      ctx.fillText('SPEAKER', speakerX, agentY - 70);
      ctx.fillStyle = selected === 'listener' ? C.amber : C.dim;
      ctx.shadowColor = selected === 'listener' ? C.amber : 'transparent';
      ctx.fillText('LISTENER', listenerX, agentY - 70);
      ctx.shadowBlur = 0;
      ctx.restore();

      // ── Mood emoji indicators ──
      if (spkMood) {
        ctx.save();
        ctx.font = '16px sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText(spkMood.emoji || '😐', speakerX, agentY - 52);
        ctx.restore();
      }
      if (lstMood) {
        ctx.save();
        ctx.font = '16px sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText(lstMood.emoji || '😐', listenerX, agentY - 52);
        ctx.restore();
      }

      // ── Thought bubbles ──
      const spkThought = speaker?.recent_thoughts?.[0];
      const lstThought = listener?.recent_thoughts?.[0];
      if (spkThought) {
        const text = spkThought.content || spkThought.text || '';
        if (text) drawSpeechBubble(ctx, speakerX, agentY - 80, text.slice(0, 50), { color: C.cyan, alpha: 0.85, maxWidth: 130 });
      }
      if (lstThought) {
        const text = lstThought.content || lstThought.text || '';
        if (text) drawSpeechBubble(ctx, listenerX, agentY - 80, text.slice(0, 50), { color: C.amber, alpha: 0.85, maxWidth: 130 });
      }

      // ── Connection spark between agents ──
      ctx.save();
      const sparkAlpha = Math.sin(now / 500) * 0.15 + 0.2;
      ctx.globalAlpha = sparkAlpha;
      ctx.strokeStyle = C.purple;
      ctx.lineWidth = 1;
      ctx.setLineDash([4, 8]);
      ctx.beginPath();
      ctx.moveTo(speakerX + 40, agentY - 30);
      ctx.quadraticCurveTo((speakerX + listenerX) / 2, agentY - 60, listenerX - 40, agentY - 30);
      ctx.stroke();
      ctx.setLineDash([]);
      ctx.globalAlpha = 1;
      ctx.restore();

      // ── Ambient neural spark particles ──
      if (Math.random() < 0.03) {
        const fromSpeaker = Math.random() > 0.5;
        particlesRef.current.add({
          x: fromSpeaker ? speakerX + 30 : listenerX - 30,
          y: agentY - 25 - Math.random() * 20,
          vx: fromSpeaker ? 30 + Math.random() * 20 : -30 - Math.random() * 20,
          vy: -10 - Math.random() * 15,
          color: fromSpeaker ? C.cyan : C.amber,
          size: 2,
          life: 2,
          type: 'firefly',
        });
      }

      // ── Particles ──
      particlesRef.current.update();
      particlesRef.current.draw(ctx);

      // ── "Click to select" hint ──
      ctx.save();
      ctx.font = '8px JetBrains Mono, monospace';
      ctx.textAlign = 'center';
      ctx.fillStyle = '#444';
      ctx.fillText('[ click agent to inspect ]', W / 2, H - 8);
      ctx.restore();

      animRef.current = requestAnimationFrame(draw);
    };

    animRef.current = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(animRef.current);
  }, [spritesLoaded, speaker, listener]);

  return (
    <canvas
      ref={canvasRef}
      width={800}
      height={200}
      onClick={handleClick}
      style={{
        width: '100%', maxWidth: 800, height: 200,
        borderRadius: 12, border: `1px solid ${C.cyan}22`,
        imageRendering: 'pixelated', display: 'block',
        margin: '0 auto 24px', cursor: 'pointer',
        background: C.bg,
      }}
    />
  );
}

function getMoodCategory(emotion) {
  const e = (emotion || '').toUpperCase();
  if (e.includes('HAPPY') || e.includes('EXCITED') || e.includes('SATISF')) return 'good';
  if (e.includes('CURIOUS') || e.includes('FOCUSED')) return 'good';
  if (e.includes('CONFID')) return 'excellent';
  if (e.includes('CONFUSED') || e.includes('WORRI')) return 'mediocre';
  if (e.includes('FRUSTRAT')) return 'poor';
  return 'mediocre';
}

/* ───── Typewriter text component ───── */
function TypewriterText({ text, speed = 30, color = C.text, onComplete }) {
  const [displayed, setDisplayed] = useState('');
  const [done, setDone] = useState(false);
  useEffect(() => {
    setDisplayed(''); setDone(false);
    let i = 0;
    const interval = setInterval(() => {
      i++;
      setDisplayed(text.slice(0, i));
      if (i >= text.length) { clearInterval(interval); setDone(true); onComplete?.(); }
    }, speed);
    return () => clearInterval(interval);
  }, [text, speed]);
  return (
    <span style={{
      color, fontFamily: 'JetBrains Mono, monospace', fontSize: 11,
      borderRight: done ? 'none' : `2px solid ${color}`,
      animation: done ? 'none' : 'am-cursor-blink 0.8s step-end infinite',
      paddingRight: done ? 0 : 2,
    }}>{displayed}</span>
  );
}

/* ───── CONSCIOUSNESS STREAM ───── */
function ConsciousnessStream({ speaker, listener }) {
  const synSpeaker = useSyntheticThoughts('speaker', [3000, 5000]);
  const synListener = useSyntheticThoughts('listener', [3500, 5500]);
  const realSpeakerThoughts = speaker?.recent_thoughts || [];
  const realListenerThoughts = listener?.recent_thoughts || [];
  const sThoughts = realSpeakerThoughts.length > 0
    ? realSpeakerThoughts.slice(0, 10).map((t, i) => ({ id: `rs-${i}`, text: t.content, icon: thoughtIcon(t.type), emotion: emotionIconFor(t.content) }))
    : synSpeaker.map(t => ({ id: t.id, text: t.text, icon: t.icon, emotion: t.emotion }));
  const lThoughts = realListenerThoughts.length > 0
    ? realListenerThoughts.slice(0, 10).map((t, i) => ({ id: `rl-${i}`, text: t.content, icon: thoughtIcon(t.type), emotion: emotionIconFor(t.content) }))
    : synListener.map(t => ({ id: t.id, text: t.text, icon: t.icon, emotion: t.emotion }));

  return (
    <div style={{
      background: `linear-gradient(135deg, ${C.panel}, ${C.panelLight})`,
      border: `1px solid ${C.cyan}22`, borderRadius: 14, padding: 20,
      marginBottom: 28, animation: 'am-fadeIn 0.6s ease-out',
    }}>
      <div style={{
        fontSize: 12, color: C.cyan, letterSpacing: 3, marginBottom: 16,
        borderBottom: `1px solid ${C.cyan}22`, paddingBottom: 8,
        display: 'flex', alignItems: 'center', gap: 8,
      }}>
        <span style={{ animation: 'am-blink 2s ease-in-out infinite' }}>◉</span>
        CONSCIOUSNESS STREAM
        <span style={{ animation: 'am-blink 2s ease-in-out infinite', animationDelay: '1s' }}>◉</span>
        <span style={{ marginLeft: 'auto', fontSize: 8, color: C.dim }}>LIVE</span>
        <span style={{ width: 6, height: 6, borderRadius: '50%', background: C.green, animation: 'am-pulse 1.5s ease-in-out infinite', boxShadow: `0 0 6px ${C.green}` }} />
      </div>
      <div style={{ display: 'flex', gap: 16 }}>
        <ThoughtColumn label="SPEAKER" color={C.cyan} thoughts={sThoughts} icon="🔵" />
        <ThoughtColumn label="LISTENER" color={C.amber} thoughts={lThoughts} icon="🔴" />
      </div>
    </div>
  );
}

function ThoughtColumn({ label, color, thoughts, icon }) {
  return (
    <div style={{ flex: 1, minWidth: 0 }}>
      <div style={{ fontSize: 9, color, fontFamily: 'JetBrains Mono, monospace', letterSpacing: 2, marginBottom: 10, display: 'flex', alignItems: 'center', gap: 6 }}>
        {icon} {label} THOUGHTS
      </div>
      <div style={{ maxHeight: 260, overflowY: 'auto', paddingRight: 4 }}>
        {thoughts.length === 0 ? (
          <EmptyCanvas title="Awaiting consciousness data..." subtitle="Start training to visualize agent minds" icon="🧠" />
        ) : thoughts.map((t, i) => (
          <div key={t.id} style={{
            display: 'flex', gap: 8, alignItems: 'flex-start', marginBottom: 8,
            padding: '8px 10px',
            background: i === 0 ? `${color}10` : 'transparent',
            borderRadius: 8,
            border: i === 0 ? `1px solid ${color}33` : '1px solid transparent',
            animation: i === 0 ? `am-thought-glow 1.5s ease-out forwards` : 'none',
            '--glow-color': `${color}66`,
            transition: 'background 0.5s ease',
          }}>
            <span style={{ fontSize: 16, lineHeight: '18px', flexShrink: 0 }}>{t.icon || t.emotion}</span>
            <div style={{ flex: 1, minWidth: 0 }}>
              {i === 0 ? (
                <TypewriterText text={t.text} speed={25} color={C.textBright} />
              ) : (
                <span style={{ fontSize: 11, fontFamily: 'JetBrains Mono, monospace', color: C.text }}>{t.text}</span>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

/* ───── EMOTION OSCILLOSCOPE ───── */
function useEmotionHistory(speaker, listener, maxPoints = 30) {
  const [history, setHistory] = useState([]);
  useEffect(() => {
    const interval = setInterval(() => {
      setHistory(prev => {
        const now = Date.now();
        const sEmo = speaker?.current_emotion || {};
        const lEmo = listener?.current_emotion || {};
        const emotionToValues = (emo) => {
          const name = (emo.emotion || 'NEUTRAL').toLowerCase();
          const intensity = emo.intensity || 0.5;
          return {
            confidence: name.includes('confiden') ? intensity : name.includes('frustrat') ? 0.2 : 0.4 + Math.random() * 0.2,
            curiosity: name.includes('curious') ? intensity : 0.3 + Math.random() * 0.3,
            frustration: name.includes('frustrat') ? intensity : 0.1 + Math.random() * 0.15,
            excitement: name.includes('excit') ? intensity : 0.2 + Math.random() * 0.2,
          };
        };
        const point = { t: now, speaker: emotionToValues(sEmo), listener: emotionToValues(lEmo) };
        const next = [...prev, point];
        return next.length > maxPoints ? next.slice(next.length - maxPoints) : next;
      });
    }, 1000);
    return () => clearInterval(interval);
  }, [speaker?.current_emotion, listener?.current_emotion, maxPoints]);
  return history;
}

function EmotionOscilloscope({ speaker, listener }) {
  const history = useEmotionHistory(speaker, listener);
  const canvasRef = useRef(null);
  const [selectedEmotion, setSelectedEmotion] = useState('confidence');
  const emotions = ['confidence', 'curiosity', 'frustration', 'excitement'];
  const emotionColors = { confidence: C.cyan, curiosity: C.green, frustration: C.red, excitement: C.amber };

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || history.length < 2) return;
    const rafId = requestAnimationFrame(() => {
      const ctx = canvas.getContext('2d');
      if (!ctx) return;
      const w = canvas.width, h = canvas.height;
      const pad = { top: 10, bottom: 20, left: 30, right: 10 };
      ctx.clearRect(0, 0, w, h);

      // Grid
      ctx.strokeStyle = `${C.dim}33`; ctx.lineWidth = 0.5;
    for (let i = 0; i <= 4; i++) {
      const y = pad.top + ((h - pad.top - pad.bottom) / 4) * i;
      ctx.beginPath(); ctx.moveTo(pad.left, y); ctx.lineTo(w - pad.right, y); ctx.stroke();
    }
    const step = (w - pad.left - pad.right) / Math.max(history.length - 1, 1);
    for (let i = 0; i < history.length; i += 5) {
      const x = pad.left + i * step;
      ctx.beginPath(); ctx.moveTo(x, pad.top); ctx.lineTo(x, h - pad.bottom); ctx.stroke();
    }
    ctx.fillStyle = C.dim; ctx.font = '8px JetBrains Mono'; ctx.textAlign = 'right';
    for (let i = 0; i <= 4; i++) {
      const val = (1 - i / 4).toFixed(1);
      const y = pad.top + ((h - pad.top - pad.bottom) / 4) * i;
      ctx.fillText(val, pad.left - 4, y + 3);
    }

    const drawLine = (data, color) => {
      if (data.length < 2) return;
      ctx.beginPath(); ctx.strokeStyle = color; ctx.lineWidth = 1.5; ctx.lineJoin = 'round';
      data.forEach((val, i) => {
        const x = pad.left + i * step;
        const y = pad.top + (1 - clamp01(val)) * (h - pad.top - pad.bottom);
        if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
      });
      ctx.stroke();
      ctx.strokeStyle = `${color}44`; ctx.lineWidth = 4; ctx.beginPath();
      data.forEach((val, i) => {
        const x = pad.left + i * step;
        const y = pad.top + (1 - clamp01(val)) * (h - pad.top - pad.bottom);
        if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
      });
      ctx.stroke();
      const lastVal = data[data.length - 1];
      const lx = pad.left + (data.length - 1) * step;
      const ly = pad.top + (1 - clamp01(lastVal)) * (h - pad.top - pad.bottom);
      ctx.beginPath(); ctx.arc(lx, ly, 3, 0, Math.PI * 2); ctx.fillStyle = color; ctx.fill();
    };
    drawLine(history.map(p => p.speaker[selectedEmotion] || 0), C.cyan);
    drawLine(history.map(p => p.listener[selectedEmotion] || 0), C.amber);
    });
    return () => cancelAnimationFrame(rafId);
  }, [history, selectedEmotion]);

  return (
    <div style={{ background: C.panel, border: `1px solid ${C.cyan}22`, borderRadius: 12, padding: 16, marginBottom: 28, animation: 'am-fadeIn 0.6s ease-out' }}>
      <div style={{ fontSize: 11, color: C.cyan, letterSpacing: 3, marginBottom: 12, borderBottom: `1px solid ${C.cyan}22`, paddingBottom: 8, display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 8 }}>
        <span>◈ EMOTION OSCILLOSCOPE ◈</span>
        <div style={{ display: 'flex', gap: 4 }}>
          {emotions.map(e => (
            <button key={e} onClick={() => setSelectedEmotion(e)} style={{
              fontSize: 8, fontFamily: 'JetBrains Mono, monospace',
              padding: '3px 8px', borderRadius: 4, cursor: 'pointer',
              border: `1px solid ${selectedEmotion === e ? emotionColors[e] : C.dim}44`,
              background: selectedEmotion === e ? `${emotionColors[e]}22` : 'transparent',
              color: selectedEmotion === e ? emotionColors[e] : C.dim,
              transition: 'all 0.3s ease', textTransform: 'uppercase', letterSpacing: 0.5,
            }}>{e}</button>
          ))}
        </div>
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 16, marginBottom: 8 }}>
        <span style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 9, color: C.cyan, fontFamily: 'JetBrains Mono, monospace' }}>
          <span style={{ width: 12, height: 2, background: C.cyan, display: 'inline-block', borderRadius: 1 }} /> Speaker
        </span>
        <span style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 9, color: C.amber, fontFamily: 'JetBrains Mono, monospace' }}>
          <span style={{ width: 12, height: 2, background: C.amber, display: 'inline-block', borderRadius: 1 }} /> Listener
        </span>
      </div>
      <canvas ref={canvasRef} width={600} height={150} style={{ width: '100%', height: 150, borderRadius: 8, background: `${C.bg}88`, border: `1px solid ${C.dim}22` }} />
    </div>
  );
}

/* ───── SVG: Radar chart for personality ───── */
function PersonalityRadar({ personality, color, size = 160, initialPersonality, showDrift = false }) {
  const traits = ['creativity', 'precision', 'patience', 'curiosity', 'sociability'];
  const cx = size / 2, cy = size / 2, r = size / 2 - 20;
  const angleStep = (2 * Math.PI) / traits.length;
  const startAngle = -Math.PI / 2;
  const getPoint = (i, val) => {
    const angle = startAngle + i * angleStep;
    return [cx + r * val * Math.cos(angle), cy + r * val * Math.sin(angle)];
  };
  const gridLevels = [0.25, 0.5, 0.75, 1.0];
  const dataPoints = traits.map((t, i) => getPoint(i, clamp01(personality?.[t])));
  const dataPath = dataPoints.map((p, i) => `${i === 0 ? 'M' : 'L'}${p[0]},${p[1]}`).join(' ') + 'Z';
  const drift = initialPersonality ? traits.reduce((sum, t) => sum + Math.abs((personality?.[t] || 0) - (initialPersonality?.[t] || 0)), 0) / traits.length : 0;

  return (
    <div style={{ position: 'relative' }}>
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} style={{ display: 'block', margin: '0 auto', animation: 'am-radar-transition 0.8s ease' }}>
        {gridLevels.map((lv) => {
          const pts = traits.map((_, i) => getPoint(i, lv));
          const d = pts.map((p, i) => `${i === 0 ? 'M' : 'L'}${p[0]},${p[1]}`).join(' ') + 'Z';
          return <path key={lv} d={d} fill="none" stroke={C.dim} strokeWidth={0.5} opacity={0.4} />;
        })}
        {traits.map((t, i) => {
          const [ex, ey] = getPoint(i, 1);
          const [lx, ly] = getPoint(i, 1.18);
          return (
            <g key={t}>
              <line x1={cx} y1={cy} x2={ex} y2={ey} stroke={C.dim} strokeWidth={0.5} opacity={0.5} />
              <text x={lx} y={ly} fill={C.dim} fontSize={8} textAnchor="middle" dominantBaseline="middle" fontFamily="JetBrains Mono, monospace">{t.slice(0, 4)}</text>
            </g>
          );
        })}
        <path d={dataPath} fill={color} fillOpacity={0.15} stroke={color} strokeWidth={1.5} style={{ transition: 'd 0.8s ease' }} />
        {dataPoints.map(([x, y], i) => <circle key={i} cx={x} cy={y} r={3} fill={color} style={{ transition: 'cx 0.8s ease, cy 0.8s ease' }} />)}
      </svg>
      {showDrift && initialPersonality && (
        <div style={{
          textAlign: 'center', marginTop: 4, fontSize: 9, fontFamily: 'JetBrains Mono, monospace',
          color: drift > 0.15 ? C.amber : drift > 0.05 ? C.cyan : C.dim,
          animation: drift > 0.1 ? 'am-drift-pulse 2s ease-in-out infinite' : 'none',
        }}>
          DRIFT: {pct(drift)}{drift > 0.15 && ' ⚠'}{drift > 0.05 && drift <= 0.15 && ' ~'}
        </div>
      )}
    </div>
  );
}

/* ───── SVG: Circular gauge ───── */
function CircularGauge({ value, size = 100, strokeWidth = 8, color = C.green, label, sublabel, animate = false }) {
  const r = (size - strokeWidth) / 2;
  const circ = 2 * Math.PI * r;
  const fill = clamp01(value) * circ;
  const cx = size / 2, cy = size / 2;
  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} style={{ display: 'block', margin: '0 auto', animation: animate ? 'am-glow 3s ease-in-out infinite' : undefined }}>
      <circle cx={cx} cy={cy} r={r} fill="none" stroke={C.panelLight} strokeWidth={strokeWidth} />
      <circle cx={cx} cy={cy} r={r} fill="none" stroke={color} strokeWidth={strokeWidth} strokeDasharray={`${fill} ${circ - fill}`} strokeLinecap="round" transform={`rotate(-90 ${cx} ${cy})`} style={{ transition: 'stroke-dasharray 1s ease' }} />
      <text x={cx} y={sublabel ? cy - 4 : cy + 2} textAnchor="middle" fill={color} fontSize={size > 80 ? 18 : 13} fontFamily="JetBrains Mono, monospace" fontWeight="bold">{pct(value)}</text>
      {sublabel && <text x={cx} y={cy + 14} textAnchor="middle" fill={C.dim} fontSize={8} fontFamily="JetBrains Mono, monospace">{sublabel}</text>}
    </svg>
  );
}

/* ───── Emotion bar ───── */
function EmotionBar({ emotion, color }) {
  const intensity = clamp01(emotion?.intensity);
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 6 }}>
      <span style={{ fontSize: 20, animation: 'am-pulse 2s ease-in-out infinite' }}>{emotion?.emoji || '😐'}</span>
      <div style={{ flex: 1 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 3 }}>
          <span style={{ color: C.textBright, fontSize: 11, fontFamily: 'JetBrains Mono, monospace', fontWeight: 'bold' }}>{(emotion?.emotion || 'NEUTRAL').replace(/_/g, ' ')}</span>
          <span style={{ color: C.dim, fontSize: 10, fontFamily: 'JetBrains Mono, monospace' }}>{pct(intensity)}</span>
        </div>
        <div style={{ height: 6, background: C.panelLight, borderRadius: 3, overflow: 'hidden' }}>
          <div style={{ height: '100%', width: pct(intensity), borderRadius: 3, background: `linear-gradient(90deg, ${color}, ${color}88)`, transition: 'width 0.8s ease' }} />
        </div>
      </div>
    </div>
  );
}

/* ───── RELATIONSHIP METER ───── */
function RelationshipMeter({ relationship }) {
  if (!relationship) return null;
  const trust = clamp01(relationship.trust_level);
  const compat = clamp01(relationship.compatibility);
  const strength = (trust * 2 - 1);
  const commEff = clamp01(compat);
  const sharedVocab = clamp01(trust * 0.8 + compat * 0.2);
  const barPos = ((strength + 1) / 2) * 100;
  const barColor = strength < -0.3 ? C.red : strength < 0.3 ? C.amber : C.green;
  const label = strength < -0.3 ? 'HOSTILE' : strength < 0.3 ? 'NEUTRAL' : 'ALLIED';

  return (
    <div style={{ background: `linear-gradient(135deg, ${C.panel}, ${C.panelLight})`, border: `1px solid ${barColor}22`, borderRadius: 14, padding: 24, marginBottom: 28, animation: 'am-fadeIn 0.7s ease-out' }}>
      <div style={{ fontSize: 11, color: C.cyan, letterSpacing: 3, marginBottom: 20, borderBottom: `1px solid ${C.cyan}22`, paddingBottom: 8, textAlign: 'center' }}>◈ RELATIONSHIP METER ◈</div>
      <div style={{ marginBottom: 16 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6, fontSize: 9, fontFamily: 'JetBrains Mono, monospace', color: C.dim }}>
          <span>HOSTILE</span><span>NEUTRAL</span><span>ALLIED</span>
        </div>
        <div style={{ height: 12, borderRadius: 6, position: 'relative', background: `linear-gradient(90deg, ${C.red}, ${C.amber}88, ${C.green})`, border: `1px solid ${C.dim}33` }}>
          <div style={{
            position: 'absolute', top: -4, left: `${barPos}%`, transform: 'translateX(-50%)',
            width: 20, height: 20, borderRadius: '50%', background: barColor,
            border: `2px solid ${C.bg}`, boxShadow: `0 0 10px ${barColor}66`,
            transition: 'left 1s ease, background 1s ease', animation: 'am-pulse 2s ease-in-out infinite',
          }} />
        </div>
        <div style={{ textAlign: 'center', marginTop: 8, fontSize: 14, fontWeight: 'bold', fontFamily: 'JetBrains Mono, monospace', color: barColor, letterSpacing: 3, textShadow: `0 0 10px ${barColor}44`, transition: 'color 1s ease' }}>{label}</div>
      </div>
      <div style={{ display: 'flex', gap: 16, justifyContent: 'center', flexWrap: 'wrap' }}>
        <RelMetric label="TRUST" value={trust} color={trust > 0.5 ? C.green : C.amber} />
        <RelMetric label="COMM EFF" value={commEff} color={C.cyan} />
        <RelMetric label="SHARED VOCAB" value={sharedVocab} color={C.purple} />
      </div>
    </div>
  );
}

function RelMetric({ label, value, color }) {
  return (
    <div style={{ background: C.panelLight, borderRadius: 8, padding: '8px 14px', border: `1px solid ${color}22`, textAlign: 'center', minWidth: 100 }}>
      <div style={{ fontSize: 8, color: C.dim, fontFamily: 'JetBrains Mono, monospace', letterSpacing: 1 }}>{label}</div>
      <div style={{ fontSize: 16, fontWeight: 'bold', color, fontFamily: 'JetBrains Mono, monospace', marginTop: 2, textShadow: `0 0 8px ${color}33` }}>{pct(value)}</div>
      <div style={{ height: 3, background: `${C.dim}22`, borderRadius: 2, marginTop: 4 }}>
        <div style={{ height: '100%', width: pct(value), borderRadius: 2, background: color, transition: 'width 0.8s ease' }} />
      </div>
    </div>
  );
}

/* ───── MEMORY PALACE ───── */
function MemoryPalace({ speaker, listener }) {
  const [hoveredMemory, setHoveredMemory] = useState(null);
  const buildMemories = (agent, agentName) => {
    if (!agent) return [];
    const mem = agent.memory || {};
    const nodes = [];
    const total = mem.total_interactions || 0;
    const avgReward = mem.avg_reward || 0;
    const nodeCount = Math.min(Math.max(total, 5), 30);
    for (let i = 0; i < nodeCount; i++) {
      const seed = (i * 7 + (agentName === 'speaker' ? 0 : 100)) % 100;
      const isFailure = seed < (1 - avgReward) * 40;
      const isSuccess = seed > 60 && avgReward > 0.3;
      nodes.push({
        id: `${agentName}-${i}`, type: isFailure ? 'failure' : isSuccess ? 'success' : 'neutral',
        importance: 0.3 + (seed / 100) * 0.7,
        content: isFailure ? `Failed interaction #${i + 1}: Communication breakdown`
          : isSuccess ? `Successful exchange #${i + 1}: High reward received`
          : `Interaction #${i + 1}: Standard exchange`,
        agent: agentName,
      });
    }
    (mem.preferred_symbols || []).forEach((s, i) => {
      nodes.push({ id: `${agentName}-sym-${i}`, type: 'success', importance: 0.8, content: `Preferred symbol: ${s}`, agent: agentName });
    });
    return nodes;
  };
  const allMemories = [...buildMemories(speaker, 'speaker'), ...buildMemories(listener, 'listener')];
  const typeColors = { success: C.green, failure: C.red, neutral: C.dim };

  return (
    <div style={{ background: C.panel, border: `1px solid ${C.purple}22`, borderRadius: 14, padding: 20, marginBottom: 28, animation: 'am-fadeIn 0.6s ease-out' }}>
      <div style={{ fontSize: 11, color: C.purple, letterSpacing: 3, marginBottom: 16, borderBottom: `1px solid ${C.purple}22`, paddingBottom: 8, textAlign: 'center' }}>◈ MEMORY PALACE ◈</div>
      <div style={{ display: 'flex', gap: 12, marginBottom: 12, justifyContent: 'center', fontSize: 9, fontFamily: 'JetBrains Mono, monospace' }}>
        <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}><span style={{ width: 8, height: 8, borderRadius: '50%', background: C.green }} /> Success</span>
        <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}><span style={{ width: 8, height: 8, borderRadius: '50%', background: C.red }} /> Failure</span>
        <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}><span style={{ width: 8, height: 8, borderRadius: '50%', background: C.dim }} /> Neutral</span>
      </div>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, justifyContent: 'center', position: 'relative', minHeight: 80 }}>
        {allMemories.map((mem, i) => {
          const size = 8 + mem.importance * 16;
          const color = typeColors[mem.type];
          const isHovered = hoveredMemory?.id === mem.id;
          return (
            <div key={mem.id} onMouseEnter={() => setHoveredMemory(mem)} onMouseLeave={() => setHoveredMemory(null)} style={{
              width: size, height: size, borderRadius: '50%', background: color,
              opacity: mem.agent === 'speaker' ? 0.8 : 0.6, cursor: 'pointer',
              transition: 'transform 0.3s ease, opacity 0.3s ease',
              transform: isHovered ? 'scale(1.5)' : 'scale(1)',
              boxShadow: isHovered ? `0 0 12px ${color}` : `0 0 4px ${color}44`,
              animation: `am-pop-in 0.4s ease-out ${i * 0.03}s both`,
              border: mem.agent === 'listener' ? `1px solid ${C.amber}44` : `1px solid ${C.cyan}44`,
            }} />
          );
        })}
        {hoveredMemory && (
          <div style={{
            position: 'absolute', bottom: '100%', left: '50%', transform: 'translateX(-50%)',
            background: C.panelLight, border: `1px solid ${typeColors[hoveredMemory.type]}44`,
            borderRadius: 8, padding: '8px 12px', marginBottom: 8,
            fontSize: 10, fontFamily: 'JetBrains Mono, monospace', color: C.textBright,
            whiteSpace: 'nowrap', zIndex: 10, boxShadow: `0 4px 12px ${C.bg}88`,
            animation: 'am-fadeIn 0.2s ease-out',
          }}>
            <div style={{ color: typeColors[hoveredMemory.type], fontWeight: 'bold', marginBottom: 2 }}>
              {hoveredMemory.type.toUpperCase()} • {hoveredMemory.agent.toUpperCase()}
            </div>
            {hoveredMemory.content}
          </div>
        )}
      </div>
    </div>
  );
}

/* ───── Agent Profile Card ───── */
function AgentCard({ agent, name, icon, color }) {
  if (!agent) return null;
  const { personality, current_emotion, memory } = agent;
  const radarPersonality = {
    creativity: personality?.creativity ?? 0.5,
    precision: personality?.confidence ?? 0.5,
    patience: personality?.patience ?? 0.5,
    curiosity: personality?.curiosity ?? 0.5,
    sociability: personality?.sociability ?? 0.5,
  };
  const initialPersonality = useRef(radarPersonality); // useRef is valid here: AgentCard is a React component
  const traits = ['creativity', 'precision', 'patience', 'curiosity', 'sociability'];

  return (
    <div style={{ flex: 1, minWidth: 280, background: `linear-gradient(135deg, ${C.panel}, ${C.panelLight})`, border: `1px solid ${color}33`, borderRadius: 12, padding: 20, animation: 'am-fadeIn 0.6s ease-out' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 16, borderBottom: `1px solid ${color}22`, paddingBottom: 12 }}>
        <span style={{ fontSize: 13, fontFamily: 'JetBrains Mono, monospace', fontWeight: 'bold', color, letterSpacing: 2 }}>{icon} {name}</span>
        <span style={{ marginLeft: 'auto', fontSize: 9, fontFamily: 'JetBrains Mono, monospace', color: C.bg, background: color, padding: '2px 8px', borderRadius: 4, fontWeight: 'bold' }}>{personality?.dominant_trait?.toUpperCase() || 'UNKNOWN'}</span>
      </div>
      <PersonalityRadar personality={radarPersonality} color={color} size={170} initialPersonality={initialPersonality.current} showDrift={true} />
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, margin: '10px 0' }}>
        {traits.map((t) => (
          <div key={t} style={{ flex: '1 0 45%', display: 'flex', justifyContent: 'space-between', fontSize: 9, fontFamily: 'JetBrains Mono, monospace', color: C.dim, padding: '2px 4px', background: `${C.panelLight}88`, borderRadius: 3 }}>
            <span>{t.slice(0, 4)}</span><span style={{ color }}>{pct(radarPersonality[t])}</span>
          </div>
        ))}
      </div>
      <div style={{ marginTop: 12 }}>
        <div style={{ fontSize: 9, color: C.dim, fontFamily: 'JetBrains Mono, monospace', marginBottom: 4, letterSpacing: 1 }}>CURRENT EMOTION</div>
        <EmotionBar emotion={current_emotion} color={color} />
      </div>
      <div style={{ marginTop: 16 }}>
        <div style={{ fontSize: 9, color: C.dim, fontFamily: 'JetBrains Mono, monospace', marginBottom: 8, letterSpacing: 1 }}>MEMORY BANK</div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6 }}>
          <StatMini label="Interactions" value={memory?.total_interactions ?? '—'} color={color} />
          <StatMini label="Avg Reward" value={memory?.avg_reward != null ? pct(memory.avg_reward) : '—'} color={C.amber} />
          <StatMini label="Trust" value={memory?.trust_score != null ? pct(memory.trust_score) : '—'} color={C.green} />
          <StatMini label="Trend" value={memory?.success_trend || '—'} color={C.cyan} />
        </div>
        {memory?.preferred_symbols?.length > 0 && (
          <div style={{ marginTop: 8, display: 'flex', gap: 4, flexWrap: 'wrap' }}>
            {memory.preferred_symbols.map((s) => (
              <span key={s} style={{ fontSize: 9, fontFamily: 'JetBrains Mono, monospace', color, background: `${color}15`, border: `1px solid ${color}33`, padding: '2px 6px', borderRadius: 4 }}>{s}</span>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function StatMini({ label, value, color }) {
  return (
    <div style={{ background: C.panelLight, borderRadius: 6, padding: '6px 8px', border: `1px solid ${C.dim}22` }}>
      <div style={{ fontSize: 8, color: C.dim, fontFamily: 'JetBrains Mono, monospace', letterSpacing: 0.5 }}>{label}</div>
      <div style={{ fontSize: 13, color, fontFamily: 'JetBrains Mono, monospace', fontWeight: 'bold', marginTop: 2 }}>{value}</div>
    </div>
  );
}

/* ───── Thought Bubble ───── */
function ThoughtBubble({ thought, agentColor }) {
  const icon = thoughtIcon(thought.type);
  const color = thoughtColor(thought.type);
  return (
    <div style={{ display: 'flex', gap: 10, alignItems: 'flex-start', marginBottom: 10, animation: 'am-fadeIn 0.4s ease-out' }}>
      <span style={{ fontSize: 18, lineHeight: '20px' }}>{icon}</span>
      <div style={{ flex: 1, background: `${color}10`, border: `1px solid ${color}33`, borderRadius: '0 10px 10px 10px', padding: '10px 14px', position: 'relative' }}>
        <div style={{ position: 'absolute', top: -1, left: -1, fontSize: 8, fontFamily: 'JetBrains Mono, monospace', color: C.bg, background: color, padding: '1px 6px', borderRadius: '0 0 6px 0', fontWeight: 'bold' }}>EP.{thought.episode ?? '?'}</div>
        <div style={{ fontSize: 11, fontFamily: 'JetBrains Mono, monospace', color: C.text, marginTop: 4, lineHeight: 1.5, overflow: 'hidden', whiteSpace: 'nowrap', borderRight: '2px solid transparent', animation: 'am-typewriter 2s steps(60,end) forwards' }}>{thought.content}</div>
        <div style={{ fontSize: 8, fontFamily: 'JetBrains Mono, monospace', color: C.dim, marginTop: 4, textTransform: 'uppercase', letterSpacing: 1 }}>{thought.type?.replace(/_/g, ' ')}</div>
      </div>
    </div>
  );
}

/* ───── Judgment Card ───── */
function JudgmentCard({ judgment, judgeColor, judgeLabel }) {
  if (!judgment) return null;
  const qColor = qualityColor(judgment.quality);
  return (
    <div style={{ background: C.panel, border: `1px solid ${qColor}33`, borderRadius: 10, padding: 16, flex: 1, minWidth: 240, animation: 'am-fadeIn 0.5s ease-out' }}>
      <div style={{ fontSize: 9, fontFamily: 'JetBrains Mono, monospace', color: C.dim, letterSpacing: 1, marginBottom: 8 }}>{judgeLabel} JUDGES {judgment.target?.toUpperCase() || 'OTHER'}</div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 10 }}>
        <span style={{ fontSize: 12, fontFamily: 'JetBrains Mono, monospace', fontWeight: 'bold', color: qColor, background: `${qColor}15`, padding: '3px 10px', borderRadius: 6, border: `1px solid ${qColor}33` }}>{qualityLabel(judgment.quality)}</span>
        <span style={{ color: C.amber, fontSize: 14, letterSpacing: 2 }}>{stars(judgment.score)}</span>
      </div>
      <div style={{ fontSize: 11, fontFamily: 'JetBrains Mono, monospace', color: C.text, lineHeight: 1.5, fontStyle: 'italic', marginBottom: 12 }}>"{judgment.reason || 'No reason given'}"</div>
      <CircularGauge value={clamp01(judgment.score)} size={80} strokeWidth={6} color={qColor} sublabel="SCORE" />
    </div>
  );
}

/* ───── Relationship Map ───── */
function RelationshipMap({ relationship }) {
  if (!relationship) return null;
  const trust = clamp01(relationship.trust_level);
  const compat = clamp01(relationship.compatibility);
  const s2l = relationship.speaker_to_listener;
  const l2s = relationship.listener_to_speaker;

  return (
    <div style={{ background: `linear-gradient(135deg, ${C.panel}, ${C.panelLight})`, border: `1px solid ${C.cyan}22`, borderRadius: 14, padding: 24, textAlign: 'center', animation: 'am-fadeIn 0.7s ease-out' }}>
      <div style={{ fontSize: 11, fontFamily: 'JetBrains Mono, monospace', color: C.cyan, letterSpacing: 3, marginBottom: 20 }}>◈ RELATIONSHIP MAP ◈</div>
      <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', gap: 20, flexWrap: 'wrap' }}>
        <div style={{ textAlign: 'center' }}>
          <div style={{ width: 60, height: 60, borderRadius: '50%', border: `2px solid ${C.cyan}`, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 24, background: `${C.cyan}15`, margin: '0 auto' }}>🔵</div>
          <div style={{ fontSize: 9, fontFamily: 'JetBrains Mono, monospace', color: C.cyan, marginTop: 6 }}>SPEAKER</div>
        </div>
        <svg width={200} height={80} viewBox="0 0 200 80" style={{ overflow: 'visible' }}>
          <line x1={10} y1={40} x2={190} y2={40} stroke={C.cyan} strokeWidth={2} strokeDasharray="6 3" opacity={0.5} />
          <polygon points="180,34 195,40 180,46" fill={qualityColor(s2l?.quality)} opacity={0.8} />
          <text x={100} y={28} textAnchor="middle" fill={qualityColor(s2l?.quality)} fontSize={9} fontFamily="JetBrains Mono, monospace">{qualityLabel(s2l?.quality)} ({pct(s2l?.score)})</text>
          <polygon points="20,46 5,40 20,34" fill={qualityColor(l2s?.quality)} opacity={0.8} />
          <text x={100} y={60} textAnchor="middle" fill={qualityColor(l2s?.quality)} fontSize={9} fontFamily="JetBrains Mono, monospace">{qualityLabel(l2s?.quality)} ({pct(l2s?.score)})</text>
        </svg>
        <div style={{ textAlign: 'center' }}>
          <div style={{ width: 60, height: 60, borderRadius: '50%', border: `2px solid ${C.red}`, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 24, background: `${C.red}15`, margin: '0 auto' }}>🔴</div>
          <div style={{ fontSize: 9, fontFamily: 'JetBrains Mono, monospace', color: C.red, marginTop: 6 }}>LISTENER</div>
        </div>
      </div>
      <div style={{ display: 'flex', justifyContent: 'center', gap: 40, marginTop: 24, flexWrap: 'wrap' }}>
        <div>
          <CircularGauge value={trust} size={100} strokeWidth={8} color={trust > 0.5 ? C.green : trust > 0.25 ? C.amber : C.red} label="TRUST" sublabel="LEVEL" animate />
          <div style={{ fontSize: 9, fontFamily: 'JetBrains Mono, monospace', color: C.dim, marginTop: 6 }}>TRUST LEVEL</div>
        </div>
        <div>
          <CircularGauge value={compat} size={100} strokeWidth={8} color={compat > 0.5 ? C.green : compat > 0.25 ? C.amber : C.red} label="COMPAT" sublabel="IBILITY" />
          <div style={{ fontSize: 9, fontFamily: 'JetBrains Mono, monospace', color: C.dim, marginTop: 6 }}>COMPATIBILITY</div>
        </div>
      </div>
    </div>
  );
}

/* ───── Emotion Summary ───── */
function EmotionSummary({ speaker, listener }) {
  const emotions = {};
  [speaker, listener].forEach((agent) => {
    if (agent?.current_emotion) {
      const e = agent.current_emotion.emotion || 'NEUTRAL';
      emotions[e] = (emotions[e] || 0) + (agent.current_emotion.intensity || 0.5);
    }
  });
  const entries = Object.entries(emotions);
  if (entries.length === 0) return null;
  const maxVal = Math.max(...entries.map(([, v]) => v), 1);
  const emotionColors = { FRUSTRATED: C.red, EXCITED: C.amber, CURIOUS: C.cyan, FOCUSED: C.green, CONFUSED: '#aa66ff', SATISFIED: C.green, NEUTRAL: C.dim };
  return (
    <div style={{ background: C.panel, border: `1px solid ${C.dim}22`, borderRadius: 10, padding: 16, animation: 'am-fadeIn 0.6s ease-out' }}>
      <div style={{ fontSize: 9, fontFamily: 'JetBrains Mono, monospace', color: C.dim, letterSpacing: 2, marginBottom: 12 }}>EMOTION SPECTRUM</div>
      <div style={{ display: 'flex', gap: 8, alignItems: 'flex-end', height: 50 }}>
        {entries.map(([emo, val]) => {
          const h = (val / maxVal) * 100;
          const col = emotionColors[emo] || C.cyan;
          return (
            <div key={emo} style={{ flex: 1, textAlign: 'center' }}>
              <div style={{ height: `${h}%`, minHeight: 4, background: `linear-gradient(180deg, ${col}, ${col}66)`, borderRadius: '4px 4px 0 0', transition: 'height 0.6s ease' }} />
              <div style={{ fontSize: 7, fontFamily: 'JetBrains Mono, monospace', color: C.dim, marginTop: 4 }}>{emo.slice(0, 6)}</div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

/* ───── normalize API data ───── */
function normalizeMindsData(raw) {
  if (!raw) return null;
  const normalizeAgent = (agent) => {
    if (!agent) return null;
    const rel = agent.relationship || {};
    const emo = agent.emotion || {};
    return {
      personality: agent.personality || {},
      dominant_trait: agent.dominant_trait || 'unknown',
      current_emotion: { emotion: (emo.mood || 'neutral').toUpperCase(), emoji: emo.emoji || '😊', intensity: emo.energy ?? 0.5 },
      recent_thoughts: rel.thought ? [{ type: 'strategy', content: rel.thought, episode: null }] : [],
      recent_judgments: rel.judgment ? [{ target: agent.agent_id === 'speaker' ? 'listener' : 'speaker', quality: rel.judgment.category || 'unknown', score: rel.judgment.score || 0, reason: rel.judgment.text || '' }] : [],
      memory: {
        total_interactions: rel.total_interactions ?? 0,
        avg_reward: rel.success_rate ?? 0,
        trust_score: rel.trust ?? 0,
        preferred_symbols: (agent.preferred_symbols || []).map(s => 'S' + s.symbol),
        success_trend: rel.trend > 0.05 ? 'improving' : rel.trend < -0.05 ? 'declining' : 'stable',
      },
    };
  };
  const speaker = normalizeAgent(raw.speaker);
  const listener = normalizeAgent(raw.listener);
  const sRel = raw.speaker?.relationship || {};
  const lRel = raw.listener?.relationship || {};
  return {
    speaker, listener,
    relationship: {
    trust_level: sRel.trust ?? 0,
    compatibility: ((sRel.success_rate ?? 0) + (lRel.success_rate ?? 0)) / 2,
    speaker_to_listener: sRel.judgment ? { quality: sRel.judgment.category || 'unknown', score: sRel.judgment.score || 0 } : { quality: 'unknown', score: 0 },
    listener_to_speaker: lRel.judgment ? { quality: lRel.judgment.category || 'unknown', score: lRel.judgment.score || 0 } : { quality: 'unknown', score: 0 },
    },
    recent_interactions: raw.recent_interactions ?? 0,
  };
}

/* ───── main component ───── */
export default function AgentMinds({ sessionId }) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [selectedAgent, setSelectedAgent] = useState(null);

  useEffect(() => {
    if (!sessionId) { setData(null); setError(null); return; }
    let cancelled = false;
    setLoading(true); setError(null);
    fetchMinds(sessionId)
      .then((d) => { if (!cancelled) setData(d); })
      .catch((e) => { if (!cancelled) setError(e.message); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [sessionId]);

  if (!sessionId) {
    return (
      <div style={{ minHeight: '80vh', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', fontFamily: 'JetBrains Mono, monospace' }}>
        <div style={{ fontSize: 48, marginBottom: 16, opacity: 0.3 }}>🧠</div>
        <div style={{ color: C.dim, fontSize: 14, letterSpacing: 2 }}>SELECT A SESSION TO SCAN AGENT MINDS</div>
      </div>
    );
  }

  if (loading) {
    return (
      <div style={{ minHeight: '80vh', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', fontFamily: 'JetBrains Mono, monospace' }}>
        <div style={{ fontSize: 32, animation: 'am-pulse 1.5s ease-in-out infinite', marginBottom: 16 }}>🧠</div>
        <div style={{ color: C.green, fontSize: 13, letterSpacing: 2, animation: 'am-blink 1.5s ease-in-out infinite' }}>SCANNING AGENT MINDS...</div>
        <div style={{ color: C.dim, fontSize: 10, marginTop: 8 }}>Analyzing neural patterns</div>
      </div>
    );
  }

  if (error) {
    return (
      <div style={{ minHeight: '80vh', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', fontFamily: 'JetBrains Mono, monospace' }}>
        <div style={{ fontSize: 40, marginBottom: 16 }}>⚠️</div>
        <div style={{ color: C.red, fontSize: 13, letterSpacing: 1 }}>MIND SCAN FAILED</div>
        <div style={{ color: C.dim, fontSize: 11, marginTop: 8 }}>{error}</div>
      </div>
    );
  }

  if (!data || (!data.speaker && !data.listener)) {
    return (
      <div style={{ minHeight: '80vh', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', fontFamily: 'JetBrains Mono, monospace' }}>
        <div style={{ fontSize: 40, marginBottom: 16, opacity: 0.3 }}>🧠</div>
        <div style={{ color: C.dim, fontSize: 13, letterSpacing: 1 }}>NO MIND DATA AVAILABLE</div>
        <div style={{ color: C.dim, fontSize: 10, marginTop: 8 }}>Run some episodes first</div>
      </div>
    );
  }

  const normalized = normalizeMindsData(data);
  const speaker = normalized?.speaker;
  const listener = normalized?.listener;
  const relationship = normalized?.relationship;
  const allThoughts = [
    ...(speaker?.recent_thoughts || []).map((t) => ({ ...t, agent: 'speaker' })),
    ...(listener?.recent_thoughts || []).map((t) => ({ ...t, agent: 'listener' })),
  ].sort((a, b) => (b.episode || 0) - (a.episode || 0));

  return (
    <div style={{ minHeight: '100vh', background: C.bg, color: C.text, fontFamily: 'JetBrains Mono, monospace', padding: 24 }}>
      {/* ── Header ── */}
      <div style={{ marginBottom: 32, textAlign: 'center' }}>
        <div style={{ fontSize: 24, fontWeight: 'bold', color: C.green, letterSpacing: 4, textShadow: `0 0 20px ${C.green}44` }}>🧠 ◆ AGENT MINDS</div>
        <div style={{ fontSize: 11, color: C.dim, marginTop: 6, letterSpacing: 2 }}>How agents think, feel, and judge</div>
        <div style={{ width: 200, height: 1, margin: '12px auto 0', background: `linear-gradient(90deg, transparent, ${C.green}44, transparent)` }} />
      </div>

      {/* ── Canvas Header: Brain Landscape ── */}
      <AgentBrainCanvas speaker={speaker} listener={listener} selectedAgent={selectedAgent} onSelectAgent={setSelectedAgent} />

      {/* ── Selected Agent Detail ── */}
      {selectedAgent && (
        <div style={{
          background: `linear-gradient(135deg, ${C.panel}, ${C.panelLight})`,
          border: `1px solid ${selectedAgent === 'speaker' ? C.cyan : C.amber}33`,
          borderRadius: 12, padding: 20, marginBottom: 28,
          animation: 'am-fadeIn 0.4s ease-out',
        }}>
          <div style={{
            fontSize: 12, letterSpacing: 2, marginBottom: 12,
            color: selectedAgent === 'speaker' ? C.cyan : C.amber,
            borderBottom: `1px solid ${selectedAgent === 'speaker' ? C.cyan : C.amber}22`,
            paddingBottom: 8, display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          }}>
            <span>◈ {selectedAgent.toUpperCase()} DETAILS</span>
            <button onClick={() => setSelectedAgent(null)} style={{
              background: 'transparent', border: `1px solid ${C.dim}44`, borderRadius: 4,
              color: C.dim, fontSize: 9, cursor: 'pointer', padding: '2px 8px',
              fontFamily: 'JetBrains Mono, monospace',
            }}>CLOSE</button>
          </div>
          <AgentCard
            agent={selectedAgent === 'speaker' ? speaker : listener}
            name={selectedAgent.toUpperCase()}
            icon={selectedAgent === 'speaker' ? '🔵' : '🔴'}
            color={selectedAgent === 'speaker' ? C.cyan : C.red}
          />
        </div>
      )}

      {/* ── 1. Consciousness Stream ── */}
      <ConsciousnessStream speaker={speaker} listener={listener} />

      {/* ── 2. Emotion Oscilloscope ── */}
      <EmotionOscilloscope speaker={speaker} listener={listener} />

      {/* ── Agent Profile Cards ── */}
      {!selectedAgent && (
        <div style={{ display: 'flex', gap: 20, marginBottom: 28, flexWrap: 'wrap' }}>
          <AgentCard agent={speaker} name="SPEAKER" icon="🔵" color={C.cyan} />
          <AgentCard agent={listener} name="LISTENER" icon="🔴" color={C.red} />
        </div>
      )}

      {/* ── 4. Relationship Meter ── */}
      <RelationshipMeter relationship={relationship} />

      {/* ── Relationship Map ── */}
      <div style={{ marginBottom: 28 }}>
        <RelationshipMap relationship={relationship} />
      </div>

      {/* ── 5. Memory Palace ── */}
      <MemoryPalace speaker={speaker} listener={listener} />

      {/* ── Thinking Process Feed ── */}
      <div style={{ marginBottom: 28 }}>
        <div style={{ fontSize: 12, color: C.amber, letterSpacing: 3, marginBottom: 14, borderBottom: `1px solid ${C.amber}22`, paddingBottom: 8 }}>◈ THINKING PROCESS FEED ◈</div>
        {allThoughts.length === 0 ? (
          <div style={{ color: C.dim, fontSize: 11, padding: 20, textAlign: 'center' }}>No recent thoughts recorded</div>
        ) : (
          <div style={{ maxHeight: 300, overflowY: 'auto', paddingRight: 4 }}>
            {allThoughts.map((t, i) => <ThoughtBubble key={i} thought={t} agentColor={t.agent === 'speaker' ? C.cyan : C.red} />)}
          </div>
        )}
      </div>

      {/* ── Judgment Panel ── */}
      <div style={{ marginBottom: 28 }}>
        <div style={{ fontSize: 12, color: C.red, letterSpacing: 3, marginBottom: 14, borderBottom: `1px solid ${C.red}22`, paddingBottom: 8 }}>◈ JUDGMENT PANEL ◈</div>
        <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap' }}>
          <JudgmentCard judgment={speaker?.recent_judgments?.[0]} judgeColor={C.cyan} judgeLabel="SPEAKER" />
          <JudgmentCard judgment={listener?.recent_judgments?.[0]} judgeColor={C.red} judgeLabel="LISTENER" />
        </div>
      </div>

      {/* ── Emotion Summary ── */}
      <EmotionSummary speaker={speaker} listener={listener} />

      {/* ── Footer ── */}
      <div style={{ textAlign: 'center', marginTop: 32, paddingTop: 16, borderTop: `1px solid ${C.dim}22`, fontSize: 9, color: C.dim, letterSpacing: 1 }}>
        NEURAL PATTERN ANALYSIS • SESSION {sessionId}
      </div>
    </div>
  );
}
