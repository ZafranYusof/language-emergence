import React, { useState, useEffect, useRef, useCallback } from 'react';
import * as api from '../utils/api';
import { ensureSprites, drawSprite, drawSpeechBubble, ParticleSystem, C as PC, SPRITE_NAMES, hashCoord } from '../utils/pixelEngine';

/* ───── colour palette ───── */
const C = {
  bg: '#0a0a1a',
  panel: '#1a1a2e',
  panelLight: '#22223a',
  green: '#00ff88',
  amber: '#ffaa00',
  cyan: '#00ddff',
  red: '#ff4444',
  purple: '#aa66ff',
  dim: '#555577',
  text: '#ccccdd',
  textBright: '#eeeef5',
  speaker: '#4488ff',
  listener: '#ff6644',
  success: '#00ff88',
  fail: '#ff4444',
};

/* ───── keyframes ───── */
const styleId = 'narrator-keyframes';
if (typeof document !== 'undefined' && !document.getElementById(styleId)) {
  const el = document.createElement('style');
  el.id = styleId;
  el.textContent = `
    @keyframes tn-fadeIn { from{opacity:0;transform:translateY(8px)} to{opacity:1;transform:translateY(0)} }
    @keyframes tn-slideIn { from{opacity:0;transform:translateX(-20px)} to{opacity:1;transform:translateX(0)} }
    @keyframes tn-pulse { 0%,100%{opacity:1} 50%{opacity:0.4} }
    @keyframes tn-glow { 0%,100%{filter:drop-shadow(0 0 4px var(--glow,C.green))} 50%{filter:drop-shadow(0 0 14px var(--glow,C.green))} }
    @keyframes tn-scan { 0%{background-position:0% 0%} 100%{background-position:0% 100%} }
    @keyframes tn-type { from{max-width:0} to{max-width:800px} }
    @keyframes tn-cursor { 0%,100%{border-right-color:transparent} 50%{border-right-color:currentColor} }
    @keyframes tn-blink { 0%,100%{opacity:1} 50%{opacity:0.3} }
    @keyframes tn-wave { 0%,100%{transform:scaleY(0.3)} 50%{transform:scaleY(1)} }
    @keyframes tn-pop { 0%{transform:scale(0)} 60%{transform:scale(1.2)} 100%{transform:scale(1)} }
    @keyframes tn-entry-pop { 0%{opacity:0;transform:translateY(12px) scale(0.95)} 100%{opacity:1;transform:translateY(0) scale(1)} }
  `;
  document.head.appendChild(el);
}

/* ───── helpers ───── */
const pct = (v) => `${Math.round((v || 0) * 100)}%`;

/* ───── Synthetic narration events ───── */
const NARRATION_TEMPLATES = [
  {
    template: (ctx) => `Speaker ${ctx.speakerName} encoded object with features [${ctx.features}]`,
    type: 'encode', icon: '🔵', actor: 'speaker',
  },
  {
    template: (ctx) => `Speaker tried symbol ${ctx.symbol}, transmitting to Listener...`,
    type: 'transmit', icon: '📡', actor: 'speaker',
  },
  {
    template: (ctx) => `Listener ${ctx.listenerName} received ${ctx.symbolCount} symbols`,
    type: 'receive', icon: '🔴', actor: 'listener',
  },
  {
    template: (ctx) => `Listener decoded symbols and selected object #${ctx.choice}`,
    type: 'decode', icon: '🔍', actor: 'listener',
  },
  {
    template: (ctx) => ctx.correct
      ? `✅ CORRECT! Listener guessed right — reward +${ctx.reward}`
      : `❌ WRONG! Listener chose #${ctx.choice}, expected #${ctx.target} — reward ${ctx.reward}`,
    type: 'result', icon: (ctx) => ctx.correct ? '🎉' : '💔', actor: 'system',
  },
  {
    template: (ctx) => `Speaker adjusted strategy based on ${ctx.correct ? 'success' : 'failure'}`,
    type: 'strategy', icon: '🧠', actor: 'speaker',
  },
  {
    template: (ctx) => `Listener emotion: ${ctx.emotion} (intensity: ${pct(ctx.intensity)})`,
    type: 'emotion', icon: (ctx) => ctx.emotionIcon, actor: 'listener',
  },
  {
    template: (ctx) => `Vocabulary update: ${ctx.vocabSize} unique symbols in use`,
    type: 'vocab', icon: '📚', actor: 'system',
  },
  {
    template: (ctx) => `Episode ${ctx.episode} complete — running accuracy: ${pct(ctx.accuracy)}`,
    type: 'episode', icon: '📊', actor: 'system',
  },
  {
    template: (ctx) => `Speaker ${ctx.speakerName} sending symbol sequence: [${ctx.sequence}]`,
    type: 'sequence', icon: '📨', actor: 'speaker',
  },
  {
    template: (ctx) => `Listener ${ctx.listenerName} guessed wrong — symbol meaning unclear`,
    type: 'fail_detail', icon: '❓', actor: 'listener',
  },
  {
    template: (ctx) => `Trust score adjusted: ${ctx.trustScore > 0.5 ? '↑' : '↓'} now ${pct(ctx.trustScore)}`,
    type: 'trust', icon: '🤝', actor: 'system',
  },
];

const EMOTION_POOL = [
  { emotion: 'curious', icon: '🧐', intensity: 0.6 },
  { emotion: 'confident', icon: '😎', intensity: 0.8 },
  { emotion: 'confused', icon: '😕', intensity: 0.5 },
  { emotion: 'excited', icon: '🤩', intensity: 0.9 },
  { emotion: 'frustrated', icon: '😤', intensity: 0.7 },
  { emotion: 'focused', icon: '🎯', intensity: 0.75 },
  { emotion: 'happy', icon: '😊', intensity: 0.85 },
  { emotion: 'worried', icon: '😟', intensity: 0.4 },
];

const SPEAKER_NAMES = ['Observer Mage', 'Scholar Sage', 'Healer Cleric', 'Artificer Engineer'];
const LISTENER_NAMES = ['Worker Knight', 'Scout Ranger', 'Rogue Assassin', 'Mystic Oracle'];

function randomFrom(arr) { return arr[Math.floor(Math.random() * arr.length)]; }
function randomInt(min, max) { return min + Math.floor(Math.random() * (max - min + 1)); }
function randomSymbols(n) { return Array.from({ length: n }, () => randomInt(1, 25)); }

function generateEvent(episode, step) {
  const template = randomFrom(NARRATION_TEMPLATES);
  const emo = randomFrom(EMOTION_POOL);
  const correct = Math.random() > 0.35;
  const symbols = randomSymbols(randomInt(2, 5));
  const target = randomInt(0, 5);
  const choice = correct ? target : (target + randomInt(1, 5)) % 6;

  const ctx = {
    speakerName: randomFrom(SPEAKER_NAMES),
    listenerName: randomFrom(LISTENER_NAMES),
    features: `${(Math.random()).toFixed(2)}, ${(Math.random()).toFixed(2)}, ${(Math.random()).toFixed(2)}`,
    symbol: String(symbols[0]),
    symbolCount: symbols.length,
    sequence: symbols.join(', '),
    choice, target, correct,
    reward: correct ? 1 : 0,
    episode,
    step,
    accuracy: 0.3 + Math.random() * 0.5,
    vocabSize: 15 + Math.floor(Math.random() * 15),
    emotion: emo.emotion, emotionIcon: emo.icon, intensity: emo.intensity,
    trustScore: 0.3 + Math.random() * 0.5,
  };

  return {
    id: `evt-${episode}-${step}-${Date.now()}`,
    timestamp: Date.now(),
    text: template.template(ctx),
    type: template.type,
    icon: typeof template.icon === 'function' ? template.icon(ctx) : template.icon,
    actor: template.actor,
    episode,
    step,
    correct,
  };
}

/* ───── Event Entry ───── */
function EventEntry({ event, isLatest, index }) {
  const actorColor = {
    speaker: C.speaker,
    listener: C.listener,
    system: C.green,
  }[event.actor] || C.dim;

  const typeBg = {
    result: event.correct ? `${C.green}10` : `${C.red}10`,
    fail_detail: `${C.red}08`,
    strategy: `${C.purple}08`,
    emotion: `${C.amber}08`,
    episode: `${C.cyan}08`,
  }[event.type] || 'transparent';

  const typeBorder = {
    result: event.correct ? `${C.green}33` : `${C.red}33`,
    fail_detail: `${C.red}22`,
    strategy: `${C.purple}22`,
    emotion: `${C.amber}22`,
    episode: `${C.cyan}22`,
  }[event.type] || 'transparent';

  return (
    <div style={{
      display: 'flex', gap: 10, alignItems: 'flex-start',
      padding: '8px 12px', marginBottom: 4,
      background: isLatest ? `${actorColor}08` : typeBg,
      borderRadius: 4,
      border: `1px solid ${isLatest ? actorColor + '33' : typeBorder}`,
      animation: isLatest ? 'tn-entry-pop 0.3s ease-out' : 'none',
      transition: 'background 0.3s ease',
    }}>
      {/* Timeline dot */}
      <div style={{
        width: 8, height: 8, borderRadius: '50%',
        background: actorColor, flexShrink: 0, marginTop: 5,
        boxShadow: isLatest ? `0 0 8px ${actorColor}` : 'none',
        animation: isLatest ? 'tn-pulse 1.5s ease-in-out infinite' : 'none',
      }} />

      {/* Icon */}
      <span style={{ fontSize: 14, flexShrink: 0, marginTop: 1 }}>
        {event.icon}
      </span>

      {/* Content */}
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{
          fontSize: 11, fontFamily: 'JetBrains Mono, monospace',
          color: isLatest ? C.textBright : C.text,
          lineHeight: 1.5,
        }}>
          {event.text}
        </div>
        <div style={{
          display: 'flex', gap: 8, marginTop: 3,
          fontSize: 8, color: C.dim, fontFamily: 'JetBrains Mono, monospace',
        }}>
          <span>ep.{event.episode}</span>
          <span>step.{event.step}</span>
          <span style={{
            color: actorColor, padding: '0 4px',
            background: `${actorColor}15`, borderRadius: 2,
          }}>
            {event.actor}
          </span>
          <span>{new Date(event.timestamp).toLocaleTimeString()}</span>
        </div>
      </div>

      {/* Result indicator */}
      {event.type === 'result' && (
        <span style={{
          fontSize: 7, fontFamily: "'Press Start 2P', monospace",
          color: event.correct ? '#000' : '#fff',
          background: event.correct ? C.green : C.red,
          padding: '2px 6px', borderRadius: 3, flexShrink: 0,
        }}>
          {event.correct ? 'HIT' : 'MISS'}
        </span>
      )}
    </div>
  );
}

/* ───── Voice Controls ───── */
function VoiceControls({ isSpeaking, onToggleSpeech, speechRate, setSpeechRate, voice, setVoice }) {
  const [voices, setVoices] = useState([]);

  useEffect(() => {
    const loadVoices = () => {
      const v = window.speechSynthesis?.getVoices() || [];
      setVoices(v);
    };
    loadVoices();
    window.speechSynthesis?.addEventListener('voiceschanged', loadVoices);
    return () => window.speechSynthesis?.removeEventListener('voiceschanged', loadVoices);
  }, []);

  return (
    <div style={{
      background: `linear-gradient(135deg, ${C.panel}, ${C.panelLight})`,
      border: `1px solid ${C.purple}33`, borderRadius: 8, padding: 16, marginBottom: 16,
    }}>
      <div style={{
        fontFamily: "'Press Start 2P', monospace", fontSize: 8, color: C.purple,
        marginBottom: 12, letterSpacing: 2, display: 'flex', alignItems: 'center', gap: 8,
      }}>
        <span style={{ animation: isSpeaking ? 'tn-pulse 1s ease-in-out infinite' : 'none' }}>
          {isSpeaking ? '🔊' : '🔇'}
        </span>
        VOICE SYNTHESIS
        {isSpeaking && (
          <span style={{
            fontSize: 7, color: C.green, background: `${C.green}15`,
            padding: '1px 6px', borderRadius: 3, marginLeft: 4,
          }}>
            ACTIVE
          </span>
        )}
      </div>

      <div style={{ display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap' }}>
        {/* Toggle */}
        <button
          onClick={onToggleSpeech}
          style={{
            padding: '8px 16px', borderRadius: 4,
            background: isSpeaking ? C.red : C.green,
            border: 'none', color: '#000', cursor: 'pointer',
            fontFamily: "'Press Start 2P', monospace", fontSize: 9,
            boxShadow: `0 0 12px ${isSpeaking ? C.red : C.green}40`,
            transition: 'all 0.2s',
          }}
        >
          {isSpeaking ? '⏹ STOP' : '▶ SPEAK'}
        </button>

        {/* Rate */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <span style={{ fontSize: 8, color: C.dim, fontFamily: 'JetBrains Mono, monospace' }}>RATE</span>
          <input
            type="range" min={0.5} max={2} step={0.1}
            value={speechRate}
            onChange={e => setSpeechRate(Number(e.target.value))}
            style={{ width: 80, accentColor: C.cyan }}
          />
          <span style={{ fontSize: 10, color: C.cyan, fontFamily: 'JetBrains Mono, monospace', width: 28 }}>
            {speechRate.toFixed(1)}x
          </span>
        </div>

        {/* Voice selector */}
        {voices.length > 0 && (
          <select
            value={voice?.name || ''}
            onChange={e => {
              const v = voices.find(vv => vv.name === e.target.value);
              setVoice(v);
            }}
            style={{
              background: '#111', color: C.cyan, border: '1px solid #333',
              padding: '4px 8px', fontFamily: 'JetBrains Mono, monospace', fontSize: 9,
              borderRadius: 3, flex: 1, minWidth: 120,
            }}
          >
            <option value="">Default Voice</option>
            {voices.map(v => (
              <option key={v.name} value={v.name}>{v.name}</option>
            ))}
          </select>
        )}
      </div>

      {/* Waveform visualization */}
      {isSpeaking && (
        <div style={{
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          gap: 3, marginTop: 12, height: 24,
        }}>
          {Array.from({ length: 20 }, (_, i) => (
            <div key={i} style={{
              width: 3, height: 4 + Math.random() * 16,
              background: C.green, borderRadius: 1,
              animation: `tn-wave 0.${3 + i % 3}s ease-in-out infinite`,
              animationDelay: `${i * 0.05}s`,
              opacity: 0.6 + Math.random() * 0.4,
            }} />
          ))}
        </div>
      )}
    </div>
  );
}

/* ───── Stats Bar ───── */
function StatsBar({ events }) {
  const total = events.length;
  const hits = events.filter(e => e.type === 'result' && e.correct).length;
  const misses = events.filter(e => e.type === 'result' && !e.correct).length;
  const episodes = new Set(events.map(e => e.episode)).size;

  return (
    <div style={{
      display: 'flex', gap: 16, marginBottom: 16, flexWrap: 'wrap',
      padding: '12px', background: C.panel, borderRadius: 6,
      border: `1px solid ${C.dim}22`,
    }}>
      {[
        { label: 'Events', value: total, icon: '📝', color: C.cyan },
        { label: 'Episodes', value: episodes, icon: '📊', color: C.amber },
        { label: 'Hits', value: hits, icon: '✅', color: C.green },
        { label: 'Misses', value: misses, icon: '❌', color: C.red },
        { label: 'Accuracy', value: total > 0 ? pct(hits / Math.max(hits + misses, 1)) : '—', icon: '🎯', color: C.purple },
      ].map(stat => (
        <div key={stat.label} style={{
          flex: 1, minWidth: 80, textAlign: 'center',
          background: `${C.bg}88`, borderRadius: 4, padding: '8px',
          border: `1px solid ${stat.color}22`,
        }}>
          <div style={{ fontSize: 14 }}>{stat.icon}</div>
          <div style={{ fontFamily: "'Press Start 2P', monospace", fontSize: 11, color: stat.color, marginTop: 4 }}>
            {stat.value}
          </div>
          <div style={{ fontSize: 7, color: C.dim, fontFamily: 'JetBrains Mono, monospace', marginTop: 2 }}>
            {stat.label}
          </div>
        </div>
      ))}
    </div>
  );
}

/* ───── Filter buttons ───── */
function EventFilter({ filter, setFilter }) {
  const filters = [
    { id: 'all', label: 'ALL', icon: '📋', color: C.cyan },
    { id: 'speaker', label: 'SPEAKER', icon: '🔵', color: C.speaker },
    { id: 'listener', label: 'LISTENER', icon: '🔴', color: C.listener },
    { id: 'system', label: 'SYSTEM', icon: '⚙️', color: C.green },
    { id: 'result', label: 'RESULTS', icon: '🎯', color: C.amber },
  ];

  return (
    <div style={{
      display: 'flex', gap: 4, marginBottom: 12,
      padding: '8px', background: C.panel, borderRadius: 6,
      border: `1px solid ${C.dim}22`,
    }}>
      {filters.map(f => (
        <button
          key={f.id}
          onClick={() => setFilter(f.id)}
          style={{
            padding: '5px 12px', borderRadius: 4,
            background: filter === f.id ? f.color : 'transparent',
            border: `1px solid ${filter === f.id ? f.color : C.dim + '44'}`,
            color: filter === f.id ? '#000' : C.dim,
            fontSize: 7, fontFamily: "'Press Start 2P', monospace",
            cursor: 'pointer', transition: 'all 0.2s',
          }}
        >
          {f.icon} {f.label}
        </button>
      ))}
    </div>
  );
}

/* ───── Training Stage Canvas ───── */
function TrainingStageCanvas({ latestEvent }) {
  const canvasRef = useRef(null);
  const animRef = useRef(null);
  const stateRef = useRef({
    t: 0,
    particles: new ParticleSystem(),
    speakerX: 200, speakerY: 160, speakerBob: 0, speakerShake: 0,
    listenerX: 600, listenerY: 160, listenerBob: 0, listenerShake: 0,
    animState: 'idle', // idle | success | fail | levelup | symbol
    animTimer: 0,
    bubbleText: '',
    bubbleColor: '#00ff88',
    symbolText: '',
    symbolY: 0,
    ringRadius: 0,
  });

  useEffect(() => {
    ensureSprites();
  }, []);

  // React to latest event
  useEffect(() => {
    if (!latestEvent) return;
    const s = stateRef.current;
    s.animTimer = 2; // 2 seconds of animation

    if (latestEvent.type === 'result') {
      if (latestEvent.correct) {
        s.animState = 'success';
        s.bubbleText = '✓';
        s.bubbleColor = '#00ff88';
        // Add green sparkles
        for (let i = 0; i < 20; i++) {
          s.particles.add({
            x: s.speakerX + (s.listenerX - s.speakerX) * Math.random(),
            y: 100 + Math.random() * 60,
            vx: (Math.random() - 0.5) * 60, vy: -20 - Math.random() * 40,
            color: '#00ff88', size: 2 + Math.random() * 2, life: 1.5, type: 'sparkle', alpha: 0.8,
          });
        }
      } else {
        s.animState = 'fail';
        s.bubbleText = '✗';
        s.bubbleColor = '#ff4444';
        // Add red smoke
        for (let i = 0; i < 12; i++) {
          s.particles.add({
            x: s.speakerX + (s.listenerX - s.speakerX) * Math.random(),
            y: 140 + Math.random() * 30,
            vx: (Math.random() - 0.5) * 20, vy: -10 - Math.random() * 15,
            color: '#ff4444', size: 4 + Math.random() * 3, life: 2, type: 'smoke', alpha: 0.6,
          });
        }
      }
    } else if (latestEvent.type === 'episode') {
      s.animState = 'levelup';
      s.ringRadius = 0;
      // Golden ring expanding
      for (let i = 0; i < 16; i++) {
        const angle = (Math.PI * 2 * i) / 16;
        s.particles.add({
          x: 400, y: 140,
          vx: Math.cos(angle) * 40, vy: Math.sin(angle) * 40,
          color: '#ffaa00', size: 2, life: 1.5, type: 'sparkle', alpha: 0.9,
        });
      }
    } else if (latestEvent.type === 'vocab') {
      s.animState = 'symbol';
      s.symbolText = `S${Math.floor(Math.random() * 25)}`;
      s.symbolY = 0;
    } else {
      s.animState = 'idle';
    }
  }, [latestEvent]);

  // Animation loop
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');

    const animate = () => {
      const s = stateRef.current;
      const W = 800, H = 250;
      const dt = 0.016;
      s.t += dt;
      s.animTimer = Math.max(0, s.animTimer - dt);

      // Clear
      ctx.clearRect(0, 0, W, H);

      // Background gradient
      const bgGrad = ctx.createLinearGradient(0, 0, 0, H);
      bgGrad.addColorStop(0, '#0a0a1a');
      bgGrad.addColorStop(0.7, '#0d0d22');
      bgGrad.addColorStop(1, '#1a1a2e');
      ctx.fillStyle = bgGrad;
      ctx.fillRect(0, 0, W, H);

      // Stage floor with grid pattern
      ctx.fillStyle = '#0f0f28';
      ctx.fillRect(0, 180, W, 70);
      ctx.strokeStyle = '#2a2a40';
      ctx.lineWidth = 0.5;
      for (let x = 0; x < W; x += 30) {
        ctx.beginPath();
        ctx.moveTo(x, 180);
        ctx.lineTo(x, H);
        ctx.stroke();
      }
      for (let y = 180; y < H; y += 15) {
        ctx.beginPath();
        ctx.moveTo(0, y);
        ctx.lineTo(W, y);
        ctx.stroke();
      }

      // Stage edge highlight
      ctx.strokeStyle = '#4488ff33';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(0, 180);
      ctx.lineTo(W, 180);
      ctx.stroke();

      // Ambient particles (dust motes, neural sparks)
      if (Math.random() < 0.06) {
        s.particles.add({
          x: Math.random() * W, y: 20 + Math.random() * 140,
          vx: (Math.random() - 0.5) * 8, vy: Math.random() * 5,
          color: Math.random() > 0.5 ? '#4488ff22' : '#ff664422',
          size: 1 + Math.random(), life: 3 + Math.random() * 2, type: 'firefly', alpha: 0.3,
        });
      }
      // Neural sparks
      if (Math.random() < 0.03) {
        const sx = 300 + Math.random() * 200;
        s.particles.add({
          x: sx, y: 100 + Math.random() * 50,
          vx: (Math.random() - 0.5) * 30, vy: -Math.random() * 20,
          color: '#00ddff', size: 1.5, life: 1, type: 'spark', alpha: 0.6,
        });
      }

      // Animation state effects
      let speakerBob = 0, listenerBob = 0;
      let speakerShake = 0, listenerShake = 0;

      if (s.animState === 'success' && s.animTimer > 0) {
        // Both agents bounce
        speakerBob = Math.abs(Math.sin(s.t * 10)) * 15;
        listenerBob = Math.abs(Math.sin(s.t * 10 + 0.5)) * 15;
      } else if (s.animState === 'fail' && s.animTimer > 0) {
        // Agents shake
        speakerShake = Math.sin(s.t * 30) * 4;
        listenerShake = Math.sin(s.t * 30 + 1) * 4;
      } else if (s.animState === 'levelup' && s.animTimer > 0) {
        // Golden ring expanding
        s.ringRadius += dt * 80;
        ctx.strokeStyle = `rgba(255, 170, 0, ${Math.max(0, 1 - s.ringRadius / 80)})`;
        ctx.lineWidth = 3;
        ctx.beginPath();
        ctx.arc(s.speakerX, 140, s.ringRadius, 0, Math.PI * 2);
        ctx.stroke();
        ctx.beginPath();
        ctx.arc(s.listenerX, 140, s.ringRadius, 0, Math.PI * 2);
        ctx.stroke();
      } else if (s.animState === 'symbol' && s.animTimer > 0) {
        // Floating symbol text rising
        s.symbolY -= dt * 40;
        ctx.font = 'bold 16px JetBrains Mono, monospace';
        ctx.fillStyle = '#ffaa00';
        ctx.textAlign = 'center';
        ctx.globalAlpha = Math.max(0, s.animTimer / 2);
        ctx.fillText(s.symbolText, s.speakerX, 140 + s.symbolY);
        ctx.globalAlpha = 1;
      }

      // Draw speech bubbles for success/fail
      if ((s.animState === 'success' || s.animState === 'fail') && s.animTimer > 0) {
        drawSpeechBubble(ctx, s.speakerX, 110 - speakerBob, s.bubbleText, {
          color: s.bubbleColor, maxWidth: 60, alpha: Math.min(1, s.animTimer),
        });
        drawSpeechBubble(ctx, s.listenerX, 110 - listenerBob, s.bubbleText, {
          color: s.bubbleColor, maxWidth: 60, alpha: Math.min(1, s.animTimer),
        });
      }

      // Draw Speaker (blue sprite, mage) on left
      drawSprite(ctx, 'mage', s.speakerX + speakerShake, s.speakerY, {
        scale: 1.8, bobY: -speakerBob, flip: false,
        glow: s.animState === 'success' ? '#00ff88' : (s.animState === 'fail' ? '#ff4444' : '#4488ff'),
      });
      // Speaker label
      ctx.font = '10px JetBrains Mono, monospace';
      ctx.fillStyle = '#4488ff';
      ctx.textAlign = 'center';
      ctx.fillText('SPEAKER', s.speakerX, s.speakerY + 14);

      // Draw Listener (red sprite, cleric) on right
      drawSprite(ctx, 'cleric', s.listenerX + listenerShake, s.listenerY, {
        scale: 1.8, bobY: -listenerBob, flip: true,
        glow: s.animState === 'success' ? '#00ff88' : (s.animState === 'fail' ? '#ff4444' : '#ff6644'),
      });
      // Listener label
      ctx.font = '10px JetBrains Mono, monospace';
      ctx.fillStyle = '#ff6644';
      ctx.textAlign = 'center';
      ctx.fillText('LISTENER', s.listenerX, s.listenerY + 14);

      // Connection beam between agents (when active)
      if (s.animTimer > 0 && (s.animState === 'success' || s.animState === 'fail')) {
        const beamColor = s.animState === 'success' ? '#00ff8833' : '#ff444433';
        ctx.strokeStyle = beamColor;
        ctx.lineWidth = 3;
        ctx.setLineDash([6, 6]);
        ctx.beginPath();
        ctx.moveTo(s.speakerX + 30, s.speakerY - 30);
        ctx.lineTo(s.listenerX - 30, s.listenerY - 30);
        ctx.stroke();
        ctx.setLineDash([]);

        // Arrow along beam
        const arrowX = s.speakerX + 30 + ((s.listenerX - s.speakerX - 60) * ((s.t * 2) % 1));
        ctx.fillStyle = s.animState === 'success' ? '#00ff88' : '#ff4444';
        ctx.beginPath();
        ctx.moveTo(arrowX, s.speakerY - 30 - 4);
        ctx.lineTo(arrowX + 6, s.speakerY - 30);
        ctx.lineTo(arrowX, s.speakerY - 30 + 4);
        ctx.closePath();
        ctx.fill();
      }

      // Update & draw particles
      s.particles.update();
      s.particles.draw(ctx);

      // Label
      ctx.font = '9px JetBrains Mono, monospace';
      ctx.fillStyle = '#555577';
      ctx.textAlign = 'left';
      ctx.fillText('TRAINING STAGE', 10, 14);

      animRef.current = requestAnimationFrame(animate);
    };

    animRef.current = requestAnimationFrame(animate);
    return () => {
      if (animRef.current) cancelAnimationFrame(animRef.current);
    };
  }, []);

  return (
    <div style={{
      marginBottom: 16, borderRadius: 8, overflow: 'hidden',
      border: `1px solid #55557733`, position: 'relative',
    }}>
      <canvas
        ref={canvasRef}
        width={800}
        height={250}
        style={{ width: '100%', height: 250, display: 'block', imageRendering: 'pixelated' }}
      />
    </div>
  );
}

/* ───── Main Component ───── */
export default function TrainingNarrator({ sessionId }) {
  const [events, setEvents] = useState([]);
  const [isRunning, setIsRunning] = useState(false);
  const [filter, setFilter] = useState('all');
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [speechRate, setSpeechRate] = useState(1.0);
  const [voice, setVoice] = useState(null);
  const [sessions, setSessions] = useState([]);
  const [activeSession, setActiveSession] = useState(sessionId);
  const [episode, setEpisode] = useState(1);
  const [step, setStep] = useState(0);
  const [autoScroll, setAutoScroll] = useState(true);

  const feedRef = useRef(null);
  const intervalRef = useRef(null);
  const synthRef = useRef(null);

  useEffect(() => {
    api.fetchSessions().then(s => {
      setSessions(s);
      if (!activeSession && s.length > 0) setActiveSession(s[0].id);
    }).catch(() => {});
  }, []);

  // Speech synthesis
  useEffect(() => {
    synthRef.current = window.speechSynthesis;
  }, []);

  const speak = useCallback((text) => {
    if (!isSpeaking || !synthRef.current) return;
    synthRef.current.cancel();
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.rate = speechRate;
    utterance.pitch = 1.0;
    utterance.volume = 0.8;
    if (voice) utterance.voice = voice;
    synthRef.current.speak(utterance);
  }, [isSpeaking, speechRate, voice]);

  // Generate events
  const generateNextEvent = useCallback(() => {
    setStep(prev => {
      const nextStep = prev + 1;
      const newEvent = generateEvent(episode, nextStep);
      setEvents(prevEvents => {
        const updated = [...prevEvents, newEvent];
        return updated.slice(-200); // Keep last 200 events
      });

      // Speak significant events
      if (['result', 'episode', 'fail_detail'].includes(newEvent.type)) {
        speak(newEvent.text);
      }

      // Episode boundary
      if (nextStep >= 12) {
        setEpisode(ep => ep + 1);
        return 0;
      }
      return nextStep;
    });
  }, [episode, speak]);

  // Auto-play
  useEffect(() => {
    if (isRunning) {
      intervalRef.current = setInterval(generateNextEvent, 1500 + Math.random() * 1000);
    } else {
      if (intervalRef.current) clearInterval(intervalRef.current);
    }
    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, [isRunning, generateNextEvent]);

  // Auto-scroll
  useEffect(() => {
    if (autoScroll && feedRef.current) {
      feedRef.current.scrollTop = feedRef.current.scrollHeight;
    }
  }, [events, autoScroll]);

  // Clean up speech on unmount
  useEffect(() => {
    return () => {
      synthRef.current?.cancel();
    };
  }, []);

  // Filtered events
  const filteredEvents = events.filter(e => {
    if (filter === 'all') return true;
    if (filter === 'result') return e.type === 'result';
    return e.actor === filter;
  });

  // Latest event for canvas animation
  const latestEvent = events.length > 0 ? events[events.length - 1] : null;

  // Try to fetch real conversation data on session change
  useEffect(() => {
    if (!activeSession) return;
    api.getConversations(activeSession, 10).then(convs => {
      if (convs?.length > 0) {
        const realEvents = convs.flatMap((c, i) => [
          {
            id: `real-enc-${i}`, timestamp: Date.now() - (convs.length - i) * 5000,
            text: `Speaker encoded target features [${(c.target?.features || []).map(f => f?.toFixed(2)).join(', ')}]`,
            type: 'encode', icon: '🔵', actor: 'speaker',
            episode: c.episode || i, step: 0,
          },
          {
            id: `real-sym-${i}`, timestamp: Date.now() - (convs.length - i) * 5000 + 500,
            text: `Symbol sequence sent: [${(c.message || []).join(', ')}]`,
            type: 'transmit', icon: '📡', actor: 'speaker',
            episode: c.episode || i, step: 1,
          },
          {
            id: `real-res-${i}`, timestamp: Date.now() - (convs.length - i) * 5000 + 1000,
            text: c.correct
              ? `✅ CORRECT! Listener guessed right — reward +1`
              : `❌ WRONG! Listener chose #${c.listener_choice} — reward 0`,
            type: 'result', icon: c.correct ? '🎉' : '💔', actor: 'system',
            episode: c.episode || i, step: 2, correct: c.correct,
          },
        ]);
        setEvents(realEvents);
      }
    }).catch(() => {});
  }, [activeSession]);

  return (
    <div style={{ padding: 24, maxWidth: 1000, margin: '0 auto' }}>
      {/* CRT Header */}
      <div style={{
        background: 'linear-gradient(135deg, #1a1a2e, #16213e)',
        border: `2px solid ${C.purple}`, borderRadius: 4, padding: '14px 20px',
        marginBottom: 20, position: 'relative', overflow: 'hidden',
      }}>
        <div style={{
          position: 'absolute', inset: 0, pointerEvents: 'none',
          background: 'repeating-linear-gradient(0deg,transparent,transparent 2px,rgba(170,102,255,0.03) 2px,rgba(170,102,255,0.03) 4px)',
        }} />
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <span style={{ fontSize: 24, animation: isRunning ? 'tn-pulse 1s ease-in-out infinite' : 'none' }}>
            📢
          </span>
          <div>
            <h2 style={{
              fontFamily: "'Press Start 2P', monospace", fontSize: 13,
              color: C.purple, margin: 0, textShadow: '0 0 10px rgba(170,102,255,0.5)',
            }}>
              ◆ TRAINING NARRATOR
            </h2>
            <p style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: 10, color: '#555', margin: '4px 0 0' }}>
              Real-time narration of training events
            </p>
          </div>
          <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 12 }}>
            <div style={{ textAlign: 'right' }}>
              <div style={{ fontFamily: "'Press Start 2P', monospace", fontSize: 11, color: C.amber }}>
                EP.{episode}
              </div>
              <div style={{ fontSize: 8, color: C.dim, fontFamily: 'JetBrains Mono, monospace' }}>
                {events.length} events
              </div>
            </div>
            {isRunning && (
              <div style={{
                width: 10, height: 10, borderRadius: '50%', background: C.green,
                animation: 'tn-pulse 1s ease-in-out infinite',
                boxShadow: `0 0 8px ${C.green}`,
              }} />
            )}
          </div>
        </div>
      </div>

      {/* Session Selector */}
      {sessions.length > 0 && (
        <div style={{ marginBottom: 16 }}>
          <select
            value={activeSession || ''}
            onChange={e => setActiveSession(e.target.value)}
            style={{
              background: '#111', color: C.cyan, border: '1px solid #333',
              padding: '6px 10px', fontFamily: 'JetBrains Mono, monospace', fontSize: 10,
              borderRadius: 2, width: '100%',
            }}
          >
            {sessions.map(s => (
              <option key={s.id} value={s.id}>
                {s.name || s.id.slice(0, 8)} — {s.status} ({s.episode_count || 0} ep)
              </option>
            ))}
          </select>
        </div>
      )}

      {/* Pixel Art Training Stage Canvas */}
      <TrainingStageCanvas latestEvent={latestEvent} />

      {/* Voice Controls */}
      <VoiceControls
        isSpeaking={isSpeaking}
        onToggleSpeech={() => {
          if (isSpeaking) window.speechSynthesis?.cancel();
          setIsSpeaking(!isSpeaking);
        }}
        speechRate={speechRate}
        setSpeechRate={setSpeechRate}
        voice={voice}
        setVoice={setVoice}
      />

      {/* Play Controls */}
      <div style={{
        display: 'flex', gap: 8, marginBottom: 16, alignItems: 'center',
      }}>
        <button
          onClick={() => setIsRunning(!isRunning)}
          style={{
            padding: '10px 24px', borderRadius: 4,
            background: isRunning ? C.red : C.green,
            border: 'none', color: '#000', cursor: 'pointer',
            fontFamily: "'Press Start 2P', monospace", fontSize: 10,
            boxShadow: `0 0 16px ${isRunning ? C.red : C.green}40`,
            transition: 'all 0.2s',
          }}
        >
          {isRunning ? '⏹ STOP NARRATION' : '▶ START NARRATION'}
        </button>

        <button
          onClick={() => generateNextEvent()}
          disabled={isRunning}
          style={{
            padding: '10px 16px', borderRadius: 4,
            background: isRunning ? '#333' : C.amber,
            border: 'none', color: isRunning ? '#666' : '#000', cursor: isRunning ? 'default' : 'pointer',
            fontFamily: "'Press Start 2P', monospace", fontSize: 9,
            opacity: isRunning ? 0.5 : 1,
          }}
        >
          ⏭ STEP
        </button>

        <button
          onClick={() => { setEvents([]); setEpisode(1); setStep(0); }}
          style={{
            padding: '10px 16px', borderRadius: 4,
            background: 'transparent', border: `1px solid ${C.dim}44`,
            color: C.dim, cursor: 'pointer',
            fontFamily: "'Press Start 2P', monospace", fontSize: 9,
          }}
        >
          🗑 CLEAR
        </button>

        <div style={{ flex: 1 }} />

        <label style={{
          display: 'flex', alignItems: 'center', gap: 6,
          fontSize: 9, color: C.dim, fontFamily: 'JetBrains Mono, monospace',
          cursor: 'pointer',
        }}>
          <input
            type="checkbox"
            checked={autoScroll}
            onChange={e => setAutoScroll(e.target.checked)}
            style={{ accentColor: C.cyan }}
          />
          Auto-scroll
        </label>
      </div>

      {/* Stats */}
      <StatsBar events={events} />

      {/* Event Filter */}
      <EventFilter filter={filter} setFilter={setFilter} />

      {/* Event Feed */}
      <div
        ref={feedRef}
        style={{
          background: `${C.bg}cc`, borderRadius: 8,
          border: `1px solid ${C.dim}33`,
          maxHeight: 500, overflowY: 'auto', padding: 8,
          position: 'relative',
        }}
      >
        {/* Scanline overlay */}
        <div style={{
          position: 'sticky', top: 0, left: 0, right: 0, height: 0,
          pointerEvents: 'none', zIndex: 2,
        }}>
          <div style={{
            position: 'absolute', top: 0, left: 0, right: 0, height: 24,
            background: `linear-gradient(to bottom, ${C.bg}, transparent)`,
          }} />
        </div>

        {filteredEvents.length === 0 ? (
          <div style={{
            textAlign: 'center', padding: 60, color: C.dim,
            fontFamily: 'JetBrains Mono, monospace', fontSize: 12,
          }}>
            <div style={{ fontSize: 40, marginBottom: 12 }}>📢</div>
            <div style={{ fontFamily: "'Press Start 2P', monospace", fontSize: 10, color: C.dim, marginBottom: 8 }}>
              NO EVENTS YET
            </div>
            <div style={{ fontSize: 11, color: C.dim }}>
              Press ▶ START NARRATION to begin<br />
              or ⏭ STEP to advance one event
            </div>
          </div>
        ) : (
          filteredEvents.map((event, i) => (
            <EventEntry
              key={event.id}
              event={event}
              isLatest={i === filteredEvents.length - 1}
              index={i}
            />
          ))
        )}
      </div>
    </div>
  );
}
