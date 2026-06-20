import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { API_URL, WS_URL } from '../config';
import { ensureSprites, drawSprite, drawSpeechBubble, drawBar, ParticleSystem, C as PC } from '../utils/pixelEngine';

const FEATURES = [
  { name: 'hue', label: 'Hue', icon: '🎨' },
  { name: 'size', label: 'Size', icon: '📐' },
  { name: 'opacity', label: 'Opacity', icon: '👁' },
  { name: 'border', label: 'Border', icon: '🔲' },
  { name: 'rotation', label: 'Rotation', icon: '🔄' },
  { name: 'shape', label: 'Shape', icon: '⬡' },
  { name: 'saturation', label: 'Sat', icon: '💧' },
  { name: 'lightness', label: 'Light', icon: '☀' },
];

// ─── DEMO DATA GENERATORS ───

function generateDemoObjects() {
  return [
    [0.0, 0.7, 0.9, 0.2, 0.0, 0.0, 0.9, 0.5],
    [0.6, 0.6, 0.8, 0.8, 0.0, 1.0, 0.8, 0.4],
    [0.3, 0.4, 0.5, 0.4, 0.5, 2.0, 0.7, 0.6],
    [0.8, 0.9, 1.0, 0.1, 0.0, 0.0, 0.5, 0.7],
    [0.12, 0.3, 0.6, 1.0, 0.25, 1.0, 1.0, 0.3],
    [0.5, 0.5, 0.4, 0.6, 0.75, 0.0, 0.3, 0.8],
    [0.75, 0.8, 0.7, 0.3, 0.5, 2.0, 0.9, 0.5],
    [0.9, 0.5, 1.0, 0.5, 0.0, 1.0, 0.6, 0.4],
  ];
}

function generateDemoConversations() {
  const candidates = generateDemoObjects();
  const conversations = [];
  const emotions = [
    { mood: 'excited', emoji: '🔥', color: '#ff4444', energy: 0.9 },
    { mood: 'confident', emoji: '💪', color: '#00ff88', energy: 0.8 },
    { mood: 'curious', emoji: '🧐', color: '#ffaa00', energy: 0.7 },
    { mood: 'focused', emoji: '🎯', color: '#00ddff', energy: 0.6 },
    { mood: 'neutral', emoji: '😐', color: '#888', energy: 0.5 },
    { mood: 'surprised', emoji: '😮', color: '#ff88ff', energy: 0.85 },
    { mood: 'worried', emoji: '😰', color: '#ff6644', energy: 0.4 },
    { mood: 'happy', emoji: '😊', color: '#44ff88', energy: 0.75 },
  ];
  const judgments = [
    { category: 'terrible', score: 0.1, text: 'The symbols were completely misleading...' },
    { category: 'poor', score: 0.3, text: 'Poor signal quality led to confusion.' },
    { category: 'average', score: 0.5, text: 'Ambiguous communication, could go either way.' },
    { category: 'good', score: 0.75, text: 'Clear signal with minor noise.' },
    { category: 'excellent', score: 0.95, text: 'Perfect compositional alignment!' },
  ];
  const thoughts = {
    speaker: [
      'I need to describe the red circle clearly...',
      'Focus on the shape feature — it\'s unique!',
      'Color and size should be enough to identify it.',
      'My symbol mapping is getting stronger!',
      'The rotation is tricky to encode...',
      'Let me try a different symbol combination.',
      'I remember this pattern working before!',
      'Communicating the big purple one...',
    ],
    listener: [
      'The symbols suggest a blue object...',
      'I think the first symbol means circle...',
      'This feels like the red target!',
      'Let me focus on size and shape.',
      'The message matches the small orange one.',
      'Hmm, hard to tell between these two...',
      'I\'m picking up on the pattern now!',
      'The symbol sequence is clear this time.',
    ],
  };
  const personalityTraits = [
    { speaker: { bold: 0.8, analytical: 0.6, creative: 0.7 }, listener: { cautious: 0.7, precise: 0.8, adaptive: 0.5 } },
    { speaker: { creative: 0.9, bold: 0.5, analytical: 0.4 }, listener: { adaptive: 0.9, cautious: 0.4, precise: 0.6 } },
    { speaker: { analytical: 0.9, precise: 0.7, creative: 0.3 }, listener: { precise: 0.9, cautious: 0.6, adaptive: 0.7 } },
  ];
  const symbolPool = ['◆', '●', '▲', '■', '★', '♦', '○', '□', '◇', '△'];
  for (let i = 0; i < 50; i++) {
    const targetIdx = Math.floor(Math.random() * 8);
    const target = candidates[targetIdx];
    const correct = Math.random() < 0.6;
    let selectedIdx;
    if (correct) { selectedIdx = targetIdx; }
    else { do { selectedIdx = Math.floor(Math.random() * 8); } while (selectedIdx === targetIdx); }
    const msgLen = 2 + Math.floor(Math.random() * 3);
    const message = [];
    for (let m = 0; m < msgLen; m++) message.push(symbolPool[Math.floor(Math.random() * symbolPool.length)]);
    const progress = i / 49;
    const judgmentIdx = correct
      ? (progress < 0.3 ? 3 : progress < 0.7 ? 3 : 4)
      : (progress < 0.3 ? 0 : progress < 0.6 ? 1 : 2);
    conversations.push({
      episode: i + 1,
      target_features: [...target],
      target_index: targetIdx,
      candidate_features: candidates.map(c => [...c]),
      message,
      speaker_msg: message,
      listener_choice: [...candidates[selectedIdx]],
      selected_features: [...candidates[selectedIdx]],
      selected_index: selectedIdx,
      correct,
      reward: correct ? 1 : 0,
      thought_before: thoughts.speaker[i % thoughts.speaker.length],
      thought_after: thoughts.listener[i % thoughts.listener.length],
      speaker_emotion: emotions[Math.floor(Math.random() * emotions.length)],
      listener_emotion: emotions[Math.floor(Math.random() * emotions.length)],
      speaker_judgment: correct ? judgments[judgmentIdx] : judgments[Math.min(judgmentIdx, 2)],
      listener_judgment: correct ? null : judgments[Math.min(judgmentIdx + 1, 4)],
      personality_traits: personalityTraits[i % personalityTraits.length],
    });
  }
  return conversations;
}

// ─── CANVAS ARENA ───

const SPRITE_W = 200;
const SPRITE_H = 200;

function ArenaCanvas({ current, step, showResult, formattedMessage }) {
  const canvasRef = useRef(null);
  const animRef = useRef(null);
  const stateRef = useRef({ step: 'idle', showResult: null, current: null, flyingProgress: 0, flyingStart: 0 });
  const particlesRef = useRef(new ParticleSystem());
  const [spritesLoaded, setSpritesLoaded] = useState(false);

  useEffect(() => {
    ensureSprites().then(() => setSpritesLoaded(true));
  }, []);

  useEffect(() => {
    stateRef.current.step = step;
    stateRef.current.showResult = showResult;
    stateRef.current.current = current;
    if (step === 'flying') {
      stateRef.current.flyingStart = Date.now();
      stateRef.current.flyingProgress = 0;
    }
    // Spawn particles on result
    const ps = particlesRef.current;
    if (step === 'result' && showResult === 'correct') {
      for (let i = 0; i < 12; i++) {
        ps.add({ x: 380 + Math.random() * 40, y: 140 + Math.random() * 20, vx: (Math.random() - 0.5) * 60, vy: -30 - Math.random() * 40, color: '#00ff88', size: 3, life: 1.5, type: 'sparkle' });
      }
    } else if (step === 'result' && showResult === 'wrong') {
      for (let i = 0; i < 8; i++) {
        ps.add({ x: 400, y: 200, vx: (Math.random() - 0.5) * 30, vy: -10 - Math.random() * 20, color: '#ff4444', size: 4, life: 1.2, type: 'smoke' });
      }
    } else if (step === 'speaking') {
      for (let i = 0; i < 5; i++) {
        ps.add({ x: 180, y: 140, vx: (Math.random() - 0.5) * 20, vy: -20 - Math.random() * 15, color: '#4488ff', size: 2, life: 0.8, type: 'spark' });
      }
    }
    if (current?.correct && step === 'result') {
      for (let i = 0; i < 6; i++) {
        ps.add({ x: 350 + Math.random() * 100, y: 100 + Math.random() * 50, vx: (Math.random() - 0.5) * 20, vy: -15, color: '#ff66aa', size: 3, life: 2, type: 'sparkle' });
      }
    }
  }, [step, showResult, current]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');

    const draw = () => {
      const W = 800, H = 300;
      const st = stateRef.current;
      const now = Date.now();
      ctx.clearRect(0, 0, W, H);

      // ── Background ──
      ctx.fillStyle = PC.bg;
      ctx.fillRect(0, 0, W, H);

      // Gradient sky
      const skyGrad = ctx.createLinearGradient(0, 0, 0, H * 0.6);
      skyGrad.addColorStop(0, '#0a0a1a');
      skyGrad.addColorStop(1, '#1a0a2e');
      ctx.fillStyle = skyGrad;
      ctx.fillRect(0, 0, W, H * 0.6);

      // Stars
      for (let i = 0; i < 30; i++) {
        const sx = ((i * 137 + 53) % W);
        const sy = ((i * 97 + 31) % (H * 0.5));
        const twinkle = Math.sin(now / 800 + i * 0.7) * 0.3 + 0.5;
        ctx.globalAlpha = twinkle;
        ctx.fillStyle = '#fff';
        ctx.fillRect(sx, sy, 2, 2);
      }
      ctx.globalAlpha = 1;

      // Grid floor
      const floorY = H * 0.55;
      ctx.fillStyle = '#0f1a0f';
      ctx.fillRect(0, floorY, W, H - floorY);
      ctx.strokeStyle = 'rgba(0,255,136,0.12)';
      ctx.lineWidth = 1;
      for (let gx = 0; gx < W; gx += 20) {
        ctx.beginPath();
        ctx.moveTo(gx, floorY);
        ctx.lineTo(gx, H);
        ctx.stroke();
      }
      for (let gy = floorY; gy < H; gy += 20) {
        ctx.beginPath();
        ctx.moveTo(0, gy);
        ctx.lineTo(W, gy);
        ctx.stroke();
      }

      // Floor horizon glow
      const floorGrad = ctx.createLinearGradient(0, floorY, 0, floorY + 30);
      floorGrad.addColorStop(0, 'rgba(0,255,136,0.08)');
      floorGrad.addColorStop(1, 'transparent');
      ctx.fillStyle = floorGrad;
      ctx.fillRect(0, floorY, W, 30);

      // ── Arena pillars ──
      const drawPillar = (px) => {
        ctx.fillStyle = '#1a1a2e';
        ctx.fillRect(px - 8, floorY - 120, 16, 120);
        ctx.fillStyle = '#22223a';
        ctx.fillRect(px - 12, floorY - 125, 24, 10);
        ctx.fillRect(px - 12, floorY - 5, 24, 10);
        // Glow top
        ctx.fillStyle = 'rgba(0,255,136,0.3)';
        ctx.beginPath();
        ctx.arc(px, floorY - 125, 6, 0, Math.PI * 2);
        ctx.fill();
      };
      drawPillar(60);
      drawPillar(740);
      drawPillar(400);

      // ── VS / Result text ──
      const centerX = W / 2;
      if (st.showResult === 'correct') {
        ctx.save();
        ctx.font = 'bold 20px JetBrains Mono, monospace';
        ctx.fillStyle = '#00ff88';
        ctx.shadowColor = '#00ff88';
        ctx.shadowBlur = 20;
        ctx.textAlign = 'center';
        ctx.fillText('HIT!', centerX, 80);
        ctx.shadowBlur = 0;
        ctx.font = '10px JetBrains Mono, monospace';
        ctx.fillStyle = '#888';
        ctx.fillText('+10 XP', centerX, 96);
        ctx.restore();
      } else if (st.showResult === 'wrong') {
        ctx.save();
        ctx.font = 'bold 20px JetBrains Mono, monospace';
        ctx.fillStyle = '#ff4444';
        ctx.shadowColor = '#ff4444';
        ctx.shadowBlur = 20;
        ctx.textAlign = 'center';
        ctx.fillText('MISS!', centerX, 80);
        ctx.shadowBlur = 0;
        ctx.font = '10px JetBrains Mono, monospace';
        ctx.fillStyle = '#888';
        ctx.fillText('-5 HP', centerX, 96);
        ctx.restore();
      } else {
        ctx.save();
        ctx.font = 'bold 20px JetBrains Mono, monospace';
        ctx.fillStyle = '#333';
        ctx.textAlign = 'center';
        ctx.fillText('VS', centerX, 85);
        ctx.restore();
      }

      // ── Agent sprites ──
      const speakerX = 180, speakerY = floorY + 5;
      const listenerX = 620, listenerY = floorY + 5;

      // Speaker animation
      let spkBobY = 0, spkFlash = null;
      if (st.step === 'speaking' || st.step === 'flying') {
        spkBobY = Math.sin(now / 120) * 5;
      }
      if (st.showResult === 'correct') spkFlash = '#00ff88';
      if (st.showResult === 'wrong') spkFlash = '#ff4444';

      // Listener animation
      let lstBobY = 0, lstFlash = null;
      if (st.step === 'listening') {
        lstBobY = Math.sin(now / 100) * 3;
      }
      if (st.step === 'result') {
        if (st.showResult === 'correct') lstBobY = Math.sin(now / 80) * 4;
        if (st.showResult === 'wrong') lstBobY = Math.sin(now / 50) * 6;
      }
      if (st.showResult === 'correct') lstFlash = '#00ff88';
      if (st.showResult === 'wrong') lstFlash = '#ff4444';

      // Speaker glow
      const spkGlow = st.step === 'speaking' || st.step === 'flying' ? '#4488ff' : null;
      const lstGlow = st.step === 'listening' ? '#00ddff' : null;

      drawSprite(ctx, 'mage', speakerX, speakerY, { scale: 2.2, bobY: spkBobY, flash: spkFlash, glow: spkGlow });
      drawSprite(ctx, 'ranger', listenerX, listenerY, { scale: 2.2, bobY: lstBobY, flip: true, flash: lstFlash, glow: lstGlow });

      // ── Name plates ──
      ctx.save();
      ctx.font = 'bold 11px JetBrains Mono, monospace';
      ctx.textAlign = 'center';
      ctx.fillStyle = '#4488ff';
      ctx.shadowColor = '#4488ff';
      ctx.shadowBlur = 8;
      ctx.fillText('SPEAKER', speakerX, speakerY - 85);
      ctx.fillStyle = '#ff4444';
      ctx.shadowColor = '#ff4444';
      ctx.fillText('LISTENER', listenerX, listenerY - 85);
      ctx.shadowBlur = 0;
      ctx.restore();

      // ── Thinking bubbles ──
      if (st.step === 'speaking' && st.current?.thought_before) {
        drawSpeechBubble(ctx, speakerX, speakerY - 95, st.current.thought_before, { color: '#4488ff', alpha: 0.9, maxWidth: 150 });
      }
      if (st.step === 'result' && st.current?.thought_after) {
        drawSpeechBubble(ctx, listenerX, listenerY - 95, st.current.thought_after, { color: '#ffaa00', alpha: 0.9, maxWidth: 150 });
      }

      // ── Emotion indicators ──
      if (st.current?.speaker_emotion) {
        ctx.save();
        ctx.font = '14px sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText(st.current.speaker_emotion.emoji || '😐', speakerX, speakerY - 68);
        ctx.restore();
      }
      if (st.current?.listener_emotion) {
        ctx.save();
        ctx.font = '14px sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText(st.current.listener_emotion.emoji || '😐', listenerX, listenerY - 68);
        ctx.restore();
      }

      // ── Flying message spell ──
      if (st.step === 'flying' && formattedMessage?.length > 0) {
        const elapsed = (now - (st.flyingStart || now)) / 1000;
        const msg = formattedMessage;
        ctx.save();
        ctx.font = '14px JetBrains Mono, monospace';
        ctx.textAlign = 'center';
        for (let i = 0; i < msg.length; i++) {
          const delay = i * 0.15;
          const p = Math.max(0, Math.min((elapsed - delay) / 0.8, 1));
          const mx = speakerX + (listenerX - speakerX) * p;
          const my = speakerY - 60 - Math.sin(p * Math.PI) * 80;
          const alpha = p < 0.1 ? p * 10 : p > 0.9 ? (1 - p) * 10 : 1;
          ctx.globalAlpha = alpha;
          ctx.fillStyle = '#ffcc00';
          ctx.shadowColor = '#ffcc00';
          ctx.shadowBlur = 8;
          ctx.fillText(msg[i], mx, my);
        }
        ctx.shadowBlur = 0;
        ctx.globalAlpha = 1;
        ctx.restore();
      }

      // ── Speech indicator dots ──
      if (st.step === 'speaking') {
        ctx.save();
        ctx.fillStyle = '#ffcc00';
        for (let i = 0; i < 3; i++) {
          const dy = Math.sin(now / 200 + i * 0.8) * 3;
          ctx.beginPath();
          ctx.arc(speakerX + 25 + i * 8, speakerY - 50 + dy, 3, 0, Math.PI * 2);
          ctx.fill();
        }
        ctx.restore();
      }

      // ── Listening notes ──
      if (st.step === 'listening') {
        ctx.save();
        ctx.fillStyle = '#00ddff';
        ctx.font = '12px sans-serif';
        ctx.textAlign = 'center';
        for (let i = 0; i < 3; i++) {
          const dy = Math.sin(now / 200 + i * 1.2) * 4 - i * 8;
          ctx.globalAlpha = 0.6 + Math.sin(now / 300 + i) * 0.3;
          ctx.fillText('♪', listenerX - 25 - i * 10, listenerY - 45 + dy);
        }
        ctx.globalAlpha = 1;
        ctx.restore();
      }

      // ── Particles ──
      particlesRef.current.update();
      particlesRef.current.draw(ctx);

      // ── HUD bars ──
      ctx.save();
      ctx.font = '8px JetBrains Mono, monospace';
      ctx.textAlign = 'left';
      // Speaker HP bar
      drawBar(ctx, speakerX - 30, speakerY - 45, 60, 6, 100, 100, '#4488ff');
      ctx.fillStyle = '#4488ff';
      ctx.fillText('SPEAKER', speakerX - 30, speakerY - 48);
      // Listener HP bar
      drawBar(ctx, listenerX - 30, listenerY - 45, 60, 6, 100, 100, '#ff4444');
      ctx.fillStyle = '#ff4444';
      ctx.fillText('LISTENER', listenerX - 30, listenerY - 48);
      ctx.restore();

      // ── Ambient fireflies ──
      if (Math.random() < 0.02) {
        particlesRef.current.add({
          x: Math.random() * W,
          y: Math.random() * H * 0.6,
          vx: (Math.random() - 0.5) * 10,
          vy: -5 - Math.random() * 10,
          color: Math.random() > 0.5 ? '#00ff88' : '#00ddff',
          size: 1.5,
          life: 3,
          type: 'firefly',
        });
      }

      animRef.current = requestAnimationFrame(draw);
    };

    animRef.current = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(animRef.current);
  }, [spritesLoaded, formattedMessage]);

  return (
    <canvas
      ref={canvasRef}
      width={800}
      height={300}
      style={{
        width: '100%',
        maxWidth: 800,
        height: 300,
        borderRadius: 12,
        border: '2px solid #333',
        imageRendering: 'pixelated',
        display: 'block',
        margin: '0 auto',
      }}
    />
  );
}

// ─── OBJECT VISUALIZATION ───

function ObjectVisual({ features, highlight, size = 60, borderColor }) {
  if (!features) return null;
  const hue = (features[0] || 0) * 360;
  const scale = 0.5 + (features[1] || 0.5) * 1.0;
  const opacity = 0.3 + (features[2] || 0.5) * 0.7;
  const borderWidth = (features[3] || 0.5) * 4;
  const rotation = (features[4] || 0) * 360;
  const shapeIdx = Math.floor((features[5] || 0) * 5);
  const saturation = 30 + (features[6] || 0.5) * 70;
  const lightness = 30 + (features[7] || 0.5) * 40;
  const shapes = ['50%', '0%', '50% 0% 0% 50%', '0%', '0%'];
  const borderRadius = shapes[shapeIdx] || '50%';
  return (
    <div style={{ width: size, height: size, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <div style={{
        width: size * scale * 0.8, height: size * scale * 0.8, borderRadius,
        backgroundColor: `hsl(${hue}, ${saturation}%, ${lightness}%)`, opacity,
        border: `${Math.max(borderWidth, 2)}px solid ${borderColor || 'rgba(255,255,255,0.5)'}`,
        transform: `rotate(${rotation}deg)`, transition: 'all 0.3s',
        boxShadow: highlight ? `0 0 16px ${highlight}` : 'none',
      }} />
    </div>
  );
}

// ─── HP BAR ───

function HPBar({ current, max, label, color }) {
  const pct = Math.max(0, Math.min(100, (current / max) * 100));
  return (
    <div style={{ width: '100%' }}>
      <div style={{
        display: 'flex', justifyContent: 'space-between',
        fontFamily: "'Press Start 2P', monospace", fontSize: 8, color: '#aaa', marginBottom: 3,
      }}>
        <span>{label}</span>
        <span>{current}/{max}</span>
      </div>
      <div style={{ height: 10, background: '#1a1a2e', border: '2px solid #333', borderRadius: 2, overflow: 'hidden' }}>
        <div style={{
          width: `${pct}%`, height: '100%',
          background: pct > 50 ? color : pct > 25 ? '#ffaa00' : '#ff4444',
          transition: 'width 0.3s', boxShadow: `0 0 8px ${color}40`,
        }} />
      </div>
    </div>
  );
}

// ─── EMOTION HUD ───

function EmotionHUD({ emotion }) {
  if (!emotion) return null;
  const { mood, emoji, color, energy } = emotion;
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
      <span style={{ fontSize: 14, lineHeight: 1 }}>{emoji || '😐'}</span>
      <div>
        <div style={{
          fontFamily: "'Press Start 2P', monospace", fontSize: 6,
          color: color || '#888', textTransform: 'uppercase', letterSpacing: 1,
        }}>
          {mood || 'neutral'}
        </div>
        <div style={{ width: 30, height: 3, background: '#222', borderRadius: 2, overflow: 'hidden', marginTop: 2 }}>
          <div style={{ width: `${((energy || 0.5) * 100)}%`, height: '100%', background: color || '#888', transition: 'width 0.5s' }} />
        </div>
      </div>
    </div>
  );
}

// ─── JUDGMENT POPUP ───

const JUDGMENT_QUALITY = {
  terrible: { label: 'TERRIBLE', color: '#ff4444', stars: 1 },
  poor: { label: 'POOR', color: '#ff8844', stars: 2 },
  average: { label: 'MEDIOCRE', color: '#ffaa00', stars: 3 },
  good: { label: 'GOOD', color: '#88cc44', stars: 4 },
  excellent: { label: 'EXCELLENT', color: '#00ff88', stars: 5 },
};

function JudgmentPopup({ judgment, visible }) {
  if (!judgment || !visible) return null;
  const { category, score, text } = judgment;
  const quality = JUDGMENT_QUALITY[category] || JUDGMENT_QUALITY.average;
  const stars = Math.max(1, Math.min(5, Math.round((score || 0.5) * 5)));
  return (
    <div style={{
      position: 'absolute', bottom: 80, left: '50%', transform: 'translateX(-50%)',
      width: 220, padding: 12,
      background: 'rgba(10,10,26,0.95)', border: `2px solid ${quality.color}80`,
      borderRadius: 8, zIndex: 25, pointerEvents: 'none', backdropFilter: 'blur(8px)',
    }}>
      <div style={{
        fontFamily: "'Press Start 2P', monospace", fontSize: 8,
        color: quality.color, marginBottom: 6, textAlign: 'center',
        textShadow: `0 0 8px ${quality.color}60`,
      }}>
        ⚖ JUDGMENT: {quality.label}
      </div>
      <div style={{ textAlign: 'center', marginBottom: 6, fontSize: 14, letterSpacing: 2 }}>
        {Array.from({ length: 5 }).map((_, i) => (
          <span key={i} style={{
            color: i < stars ? quality.color : '#333',
            textShadow: i < stars ? `0 0 4px ${quality.color}60` : 'none',
          }}>★</span>
        ))}
      </div>
      <div style={{
        width: '100%', height: 6, background: '#1a1a2e',
        border: '1px solid #333', borderRadius: 3, overflow: 'hidden', marginBottom: 8,
      }}>
        <div style={{
          width: `${(score || 0) * 100}%`, height: '100%',
          background: `linear-gradient(90deg, ${quality.color}60, ${quality.color})`,
          transition: 'width 0.6s ease-out', boxShadow: `0 0 6px ${quality.color}40`,
        }} />
      </div>
      <div style={{
        fontFamily: "'JetBrains Mono', monospace", fontSize: 8,
        color: '#888', lineHeight: 1.3, textAlign: 'center', fontStyle: 'italic',
      }}>
        "{text}"
      </div>
    </div>
  );
}

// ─── PERSONALITY BADGE ───

function PersonalityBadge({ traits, color }) {
  if (!traits) return null;
  const entries = Object.entries(traits);
  if (entries.length === 0) return null;
  const [dominant] = entries.reduce((a, b) => b[1] > a[1] ? b : a);
  return (
    <div style={{
      fontFamily: "'Press Start 2P', monospace", fontSize: 6, color,
      background: `${color}15`, border: `1px solid ${color}30`,
      borderRadius: 3, padding: '2px 6px', textTransform: 'uppercase',
      letterSpacing: 1, opacity: 0.7,
    }}>
      ◆ {dominant}
    </div>
  );
}

// ─── BATTLE LOG COMPONENT ───

function BattleLog({ battles }) {
  if (!battles || battles.length === 0) return null;
  return (
    <div style={{ marginTop: 16, background: '#0a0a1a', border: '1px solid #333', borderRadius: 8, overflow: 'hidden' }}>
      <div style={{
        padding: '8px 12px',
        background: 'linear-gradient(90deg, #1a1a2e, #16213e)',
        borderBottom: '1px solid #333', display: 'flex', alignItems: 'center', gap: 8,
      }}>
        <span style={{ fontFamily: "'Press Start 2P', monospace", fontSize: 9, color: '#ffaa00' }}>⚔ BATTLE LOG</span>
        <span style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 9, color: '#666' }}>Last {battles.length} rounds</span>
      </div>
      <div style={{ maxHeight: 280, overflowY: 'auto' }}>
        {battles.map((battle, i) => (
          <div key={battle.episode || i} style={{
            padding: '6px 12px', borderBottom: '1px solid #1a1a2e',
            display: 'flex', alignItems: 'center', gap: 12,
            background: i === 0 ? 'rgba(255,204,0,0.03)' : 'transparent',
            transition: 'background 0.3s',
          }}>
            <span style={{ fontFamily: "'Press Start 2P', monospace", fontSize: 8, color: '#666', minWidth: 50 }}>
              EP {battle.episode || '?'}
            </span>
            <div style={{ width: 20, height: 20, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              {battle.target_features && (
                <div style={{
                  width: 16, height: 16,
                  borderRadius: Math.floor((battle.target_features[5] || 0) * 5) === 0 ? '50%' : Math.floor((battle.target_features[5] || 0) * 5) === 1 ? '0%' : '50% 0% 0% 50%',
                  backgroundColor: `hsl(${(battle.target_features[0] || 0) * 360}, ${30 + (battle.target_features[6] || 0.5) * 70}%, ${30 + (battle.target_features[7] || 0.5) * 40}%)`,
                  border: `2px solid ${battle.correct ? '#00ff88' : '#ff4444'}`,
                }} />
              )}
            </div>
            <div style={{ display: 'flex', gap: 2, flex: 1 }}>
              {battle.message?.slice(0, 4).map((sym, j) => (
                <span key={j} style={{
                  fontFamily: "'Press Start 2P', monospace", fontSize: 8,
                  color: '#ffcc00', opacity: 0.8,
                }}>{sym}</span>
              ))}
              {battle.message?.length > 4 && (
                <span style={{ fontSize: 8, color: '#555' }}>+{battle.message.length - 4}</span>
              )}
            </div>
            <span style={{
              fontFamily: "'Press Start 2P', monospace", fontSize: 8,
              color: battle.correct ? '#00ff88' : '#ff4444', minWidth: 20, textAlign: 'center',
            }}>
              {battle.correct ? '✓' : '✗'}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

// ─── CANDIDATES BAR (canvas-based) ───

function CandidatesBar({ current, showResult, step }) {
  if (!current?.candidate_features?.length) return null;
  return (
    <div style={{
      display: 'flex', gap: 6, justifyContent: 'center', flexWrap: 'wrap',
      marginTop: 12, padding: '8px 0',
    }}>
      {current.candidate_features.slice(0, 10).map((feat, i) => {
        const isTarget = i === current.target_index;
        const isSelected = i === current.selected_index;
        return (
          <div key={i} style={{
            padding: 4, borderRadius: 6,
            border: `2px solid ${
              isSelected && showResult === 'correct' ? '#00ff88' :
              isSelected && showResult === 'wrong' ? '#ff4444' :
              isTarget && step === 'result' ? '#ffcc00' :
              '#222'
            }`,
            background: isSelected ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.4)',
            transition: 'all 0.3s',
          }}>
            <ObjectVisual features={feat} size={28} />
          </div>
        );
      })}
    </div>
  );
}

// ─── MAIN ARENA ───

export default function CommunicationArena({ sessionId }) {
  const [conversations, setConversations] = useState([]);
  const [currentIdx, setCurrentIdx] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [showResult, setShowResult] = useState(null);
  const [step, setStep] = useState('idle');
  const [isDemo, setIsDemo] = useState(!sessionId);
  const [liveMode, setLiveMode] = useState(false);
  const timerRef = useRef(null);
  const wsRef = useRef(null);
  const arenaEndRef = useRef(null);

  const normalizeConversation = useCallback((c) => {
    let message = c.speaker_message || c.speaker_msg || c.message || [];
    const reward = c.reward ?? (c.correct ? 1 : 0);
    const correct = reward >= 1 || c.correct === true;
    const selectedFeatures = c.selected_features || c.listener_choice_features || [];
    const selectedIndex = c.selected_index ?? c.listener_choice_index ?? -1;
    return {
      episode: c.episode,
      target_features: c.target_features || c.target?.features || [],
      target_index: c.target_index ?? -1,
      candidate_features: c.candidate_features || c.candidates?.map(ct => ct.features) || [],
      message,
      speaker_message: c.speaker_message || c.speaker_msg || [],
      listener_message: c.listener_message || c.listener_msg || [],
      selected_features: selectedFeatures,
      selected_index: selectedIndex,
      listener_choice: c.listener_choice || selectedFeatures,
      correct, reward,
      thought_before: c.thought_before || null,
      thought_after: c.thought_after || null,
      speaker_emotion: c.speaker_emotion || null,
      listener_emotion: c.listener_emotion || null,
      speaker_judgment: c.speaker_judgment || null,
      listener_judgment: c.listener_judgment || null,
      personality_traits: c.personality_traits || null,
    };
  }, []);

  useEffect(() => {
    if (!sessionId) {
      setConversations(generateDemoConversations());
      setCurrentIdx(0);
      setIsDemo(true);
      return;
    }
    setIsDemo(false);
    fetch(`${API_URL}/sessions/${sessionId}/conversations?limit=50`)
      .then(r => {
        if (!r.ok) throw new Error('Failed to load conversations: ' + r.status);
        return r.json();
      })
      .then(data => {
        const raw = Array.isArray(data) ? data : (data?.data || data?.conversations || []);
        const convs = raw.map(normalizeConversation);
        const hasFeatures = convs.some(c => c.target_features && c.target_features.length > 0);
        if (convs.length === 0 || !hasFeatures) {
          setConversations(generateDemoConversations());
          setCurrentIdx(0);
          setIsDemo(true);
        } else {
          setConversations(convs);
          if (convs.length > 0) setCurrentIdx(0);
        }
      })
      .catch(() => {
        setConversations(generateDemoConversations());
        setCurrentIdx(0);
        setIsDemo(true);
      });
  }, [sessionId, normalizeConversation]);

  useEffect(() => {
    if (!sessionId || !liveMode) {
      if (wsRef.current) { wsRef.current.close(); wsRef.current = null; }
      return;
    }
    try {
      const wsProto = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
      const wsHost = WS_URL || `${wsProto}//${window.location.host}`;
      const ws = new WebSocket(`${wsHost}/ws/${sessionId}`);
      ws.onopen = () => console.log('[Arena] WebSocket connected');
      ws.onmessage = (e) => {
        try {
          const msg = JSON.parse(e.data);
          if (msg.type === 'new_conversation') {
            const mapped = normalizeConversation(msg.data);
            setConversations(prev => [...prev, mapped].slice(-100));
            setCurrentIdx(prev => prev + 1);
          }
        } catch (err) { console.warn('[Arena] WS parse error:', err); }
      };
      ws.onerror = (err) => console.warn('[Arena] WS error:', err);
      ws.onclose = () => console.log('[Arena] WS closed');
      wsRef.current = ws;
      return () => ws.close();
    } catch (err) { console.warn('[Arena] WS connect failed:', err); }
  }, [sessionId, liveMode, normalizeConversation]);

  useEffect(() => {
    if (liveMode && arenaEndRef.current) arenaEndRef.current.scrollIntoView({ behavior: 'smooth' });
  }, [currentIdx, liveMode]);

  const current = conversations[currentIdx];

  useEffect(() => {
    if (!playing) { clearInterval(timerRef.current); return; }
    timerRef.current = setInterval(() => {
      setCurrentIdx(prev => {
        if (prev >= conversations.length - 1) { setPlaying(false); return prev; }
        return prev + 1;
      });
      setStep('speaking');
      setTimeout(() => setStep('flying'), 500);
      setTimeout(() => setStep('listening'), 1500);
      setTimeout(() => {
        setCurrentIdx(ci => {
          const conv = conversations[ci];
          setShowResult(conv?.correct ? 'correct' : 'wrong');
          return ci;
        });
        setStep('result');
      }, 2000);
      setTimeout(() => { setShowResult(null); setStep('idle'); }, 2800);
    }, 3000);
    return () => clearInterval(timerRef.current);
  }, [playing, conversations.length]);

  useEffect(() => {
    if (!current || playing) return;
    setStep('idle');
    setShowResult(null);
  }, [currentIdx]);

  const handleStep = useCallback(() => {
    if (step === 'idle') {
      setStep('speaking');
      setTimeout(() => setStep('flying'), 600);
      setTimeout(() => setStep('listening'), 1800);
      setTimeout(() => {
        setShowResult(current?.correct ? 'correct' : 'wrong');
        setStep('result');
      }, 2300);
      setTimeout(() => { setShowResult(null); setStep('idle'); }, 3200);
    }
  }, [step, current]);

  const correctCount = conversations.filter(c => c.correct).length;
  const totalCount = conversations.length;
  const accuracy = totalCount > 0 ? Math.round(correctCount / totalCount * 100) : 0;
  const battleHistory = useMemo(() => conversations.slice(-10).reverse(), [conversations]);
  const formatMessage = useCallback((msg) => {
    if (!msg || msg.length === 0) return [];
    return msg.map(s => typeof s === 'number' ? `#${s}` : String(s));
  }, []);

  return (
    <div style={{ padding: 24, maxWidth: 900, margin: '0 auto' }}>
      {/* CRT Header */}
      <div style={{
        background: 'linear-gradient(135deg, #1a1a2e 0%, #16213e 100%)',
        border: '2px solid #00ff88', borderRadius: 8,
        padding: '16px 20px', marginBottom: 20,
        position: 'relative', overflow: 'hidden',
      }}>
        <div style={{
          position: 'absolute', inset: 0,
          background: 'repeating-linear-gradient(0deg, transparent, transparent 2px, rgba(0,255,136,0.03) 2px, rgba(0,255,136,0.03) 4px)',
          pointerEvents: 'none',
        }} />
        <h2 style={{
          fontFamily: "'Press Start 2P', monospace", fontSize: 14,
          color: '#00ff88', margin: 0, textShadow: '0 0 10px rgba(0,255,136,0.5)',
        }}>
          ◆ COMMUNICATION ARENA
        </h2>
        {isDemo && (
          <span style={{
            position: 'absolute', top: 12, right: 16,
            fontFamily: "'Press Start 2P', monospace", fontSize: 8, color: '#ffaa00',
            background: 'rgba(255,170,0,0.15)', border: '1px solid rgba(255,170,0,0.4)',
            borderRadius: 4, padding: '3px 8px', letterSpacing: 2,
          }}>DEMO</span>
        )}
        {liveMode && !isDemo && (
          <span style={{
            position: 'absolute', top: 12, right: isDemo ? 80 : 16,
            fontFamily: "'Press Start 2P', monospace", fontSize: 8, color: '#ff4444',
            background: 'rgba(255,68,68,0.15)', border: '1px solid rgba(255,68,68,0.5)',
            borderRadius: 4, padding: '3px 8px', letterSpacing: 2,
            display: 'flex', alignItems: 'center', gap: 6,
          }}>
            <span style={{
              display: 'inline-block', width: 6, height: 6, borderRadius: '50%',
              background: '#ff4444', animation: 'livePulse 1s ease-in-out infinite',
              boxShadow: '0 0 6px #ff4444',
            }} />
            LIVE
          </span>
        )}
        <p style={{
          fontFamily: "'JetBrains Mono', monospace", fontSize: 11,
          color: '#666', margin: '6px 0 0',
        }}>
          Watch agents battle with symbols{isDemo ? ' (demo data)' : liveMode ? ' (live session)' : ''}
        </p>
      </div>

      {/* Controls */}
      <div style={{ display: 'flex', gap: 8, marginBottom: 16, alignItems: 'center', flexWrap: 'wrap' }}>
        <button onClick={() => setPlaying(!playing)} disabled={conversations.length === 0 || liveMode} style={{
          fontFamily: "'Press Start 2P', monospace", fontSize: 10,
          padding: '8px 16px', background: playing ? '#ff4444' : '#00ff88',
          color: '#000', border: 'none', borderRadius: 4, cursor: 'pointer',
          opacity: (conversations.length === 0 || liveMode) ? 0.3 : 1,
        }}>
          {playing ? '■ STOP' : '▶ AUTO'}
        </button>
        <button onClick={() => setCurrentIdx(Math.max(0, currentIdx - 1))} disabled={currentIdx <= 0 || liveMode} style={{
          fontFamily: "'Press Start 2P', monospace", fontSize: 10,
          padding: '8px 12px', background: '#1a1a2e', color: '#ffaa00',
          border: '1px solid #ffaa00', borderRadius: 4, cursor: 'pointer',
          opacity: (currentIdx <= 0 || liveMode) ? 0.3 : 1,
        }}>◀</button>
        <span style={{
          fontFamily: "'Press Start 2P', monospace", fontSize: 10,
          color: '#00ddff', minWidth: 80, textAlign: 'center',
        }}>
          {currentIdx + 1}/{conversations.length || 0}
        </span>
        <button onClick={() => setCurrentIdx(Math.min(conversations.length - 1, currentIdx + 1))} disabled={currentIdx >= conversations.length - 1 || liveMode} style={{
          fontFamily: "'Press Start 2P', monospace", fontSize: 10,
          padding: '8px 12px', background: '#1a1a2e', color: '#ffaa00',
          border: '1px solid #ffaa00', borderRadius: 4, cursor: 'pointer',
          opacity: (currentIdx >= conversations.length - 1 || liveMode) ? 0.3 : 1,
        }}>▶</button>
        <button onClick={handleStep} disabled={step !== 'idle' || !current || liveMode} style={{
          fontFamily: "'Press Start 2P', monospace", fontSize: 10,
          padding: '8px 16px', background: step !== 'idle' ? '#333' : '#ffaa00',
          color: '#000', border: 'none', borderRadius: 4, cursor: 'pointer',
          opacity: (step !== 'idle' || liveMode) ? 0.3 : 1,
        }}>⚡ STEP</button>
        {!isDemo && sessionId && (
          <button onClick={() => setLiveMode(!liveMode)} style={{
            fontFamily: "'Press Start 2P', monospace", fontSize: 10,
            padding: '8px 16px', background: liveMode ? '#ff4444' : '#1a1a2e',
            color: liveMode ? '#fff' : '#ff4444',
            border: `1px solid ${liveMode ? '#ff4444' : '#ff444480'}`,
            borderRadius: 4, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6,
          }}>
            {liveMode && (
              <span style={{
                display: 'inline-block', width: 6, height: 6, borderRadius: '50%',
                background: '#fff', animation: 'livePulse 1s ease-in-out infinite',
              }} />
            )}
            {liveMode ? '■ STOP LIVE' : '● LIVE'}
          </button>
        )}
        <div style={{ marginLeft: 'auto', display: 'flex', gap: 12, alignItems: 'center' }}>
          <HPBar current={correctCount} max={totalCount || 1} label="ACCURACY" color="#00ff88" />
          <span style={{
            fontFamily: "'Press Start 2P', monospace", fontSize: 12,
            color: accuracy >= 70 ? '#00ff88' : accuracy >= 40 ? '#ffaa00' : '#ff4444',
          }}>{accuracy}%</span>
        </div>
      </div>

      {/* ─── CANVAS ARENA ─── */}
      <div style={{ position: 'relative', marginBottom: 12 }}>
        <ArenaCanvas
          current={current}
          step={step}
          showResult={showResult}
          formattedMessage={formatMessage(current?.message)}
        />
        <JudgmentPopup judgment={current?.speaker_judgment} visible={step === 'result' && showResult === 'wrong'} />
      </div>

      {/* Candidates + Personality row */}
      <div style={{ display: 'flex', gap: 16, alignItems: 'flex-start', marginBottom: 12 }}>
        <div style={{ flex: 1 }}>
          <div style={{ display: 'flex', gap: 8, marginBottom: 4 }}>
            <PersonalityBadge traits={current?.personality_traits?.speaker} color="#00ddff" />
            <EmotionHUD emotion={current?.speaker_emotion} />
          </div>
        </div>
        <div style={{ display: 'flex', gap: 6, alignItems: 'center', justifyContent: 'center', flexWrap: 'wrap', flex: 2 }}>
          <div style={{
            fontFamily: "'Press Start 2P', monospace", fontSize: 7,
            color: '#666', textAlign: 'center', width: '100%',
          }}>CANDIDATES</div>
          <CandidatesBar current={current} showResult={showResult} step={step} />
        </div>
        <div style={{ flex: 1, textAlign: 'right' }}>
          <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginBottom: 4 }}>
            <EmotionHUD emotion={current?.listener_emotion} />
            <PersonalityBadge traits={current?.personality_traits?.listener} color="#ff4444" />
          </div>
        </div>
      </div>

      {/* Message Display */}
      {current && (
        <div style={{
          marginTop: 16, background: '#111', border: '1px solid #333',
          borderRadius: 8, padding: '12px 16px',
          display: 'flex', alignItems: 'center', gap: 16,
        }}>
          <div style={{ fontFamily: "'Press Start 2P', monospace", fontSize: 8, color: '#666' }}>MESSAGE</div>
          <div style={{ display: 'flex', gap: 6 }}>
            {formatMessage(current.message).map((sym, i) => (
              <span key={i} style={{
                fontFamily: "'Press Start 2P', monospace", fontSize: 16, color: '#ffcc00',
                background: 'rgba(255,204,0,0.1)', padding: '4px 8px', borderRadius: 4,
                border: '1px solid rgba(255,204,0,0.3)',
              }}>{sym}</span>
            ))}
          </div>
          <div style={{
            marginLeft: 'auto', fontFamily: "'Press Start 2P', monospace", fontSize: 10,
            color: current.correct ? '#00ff88' : '#ff4444',
          }}>
            {current.correct ? '✓ CORRECT' : '✗ WRONG'}
          </div>
        </div>
      )}

      {/* Battle History Log */}
      <BattleLog battles={battleHistory} />

      {/* Feature Legend */}
      <div style={{ marginTop: 12, display: 'flex', flexWrap: 'wrap', gap: 8, justifyContent: 'center' }}>
        {FEATURES.map(f => (
          <div key={f.name} style={{
            fontFamily: "'JetBrains Mono', monospace", fontSize: 9,
            color: '#666', background: '#111', padding: '3px 8px',
            borderRadius: 4, border: '1px solid #222',
          }}>
            {f.icon} {f.label}
          </div>
        ))}
      </div>

      {/* CSS Animations */}
      <style>{`
        @keyframes livePulse {
          0%, 100% { opacity: 1; transform: scale(1); }
          50% { opacity: 0.3; transform: scale(0.7); }
        }
      `}</style>
    </div>
  );
}
