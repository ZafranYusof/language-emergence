import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { API_URL } from '../config';
import { ensureSprites, drawSprite, drawSpeechBubble, ParticleSystem, C as PC, SPRITE_NAMES, hashCoord } from '../utils/pixelEngine';
import EmptyCanvas from '../components/EmptyCanvas';

// ─── COLOR CONSTANTS ───────────────────────────────────────────
const C = {
  bg: '#0a0a1a', panel: '#0d0d22', border: '#00ff88',
  green: '#00ff88', amber: '#ffaa00', cyan: '#00ddff',
  red: '#ff4444', text: '#e0e0e0', muted: '#888',
};

// ─── FEATURE → HUMAN READABLE ─────────────────────────────────
function featureToName(features) {
  if (!features || features.length < 8) return 'Unknown Object';
  const [hue, size, opacity, border, rotation, shape, saturation, lightness] = features;

  const hueNames = [
    [0.06, 'Red'], [0.18, 'Orange'], [0.32, 'Yellow'],
    [0.5, 'Green'], [0.65, 'Cyan'], [0.75, 'Blue'],
    [0.85, 'Purple'], [1.01, 'Pink'],
  ];
  const colorName = hueNames.find(([max]) => hue <= max)?.[1] || 'Red';

  const shapeNames = ['Circle', 'Square', 'Triangle', 'Diamond', 'Pentagon'];
  const shapeIdx = Math.min(Math.floor(shape * 1.2), shapeNames.length - 1);
  const shapeName = shapeNames[shapeIdx];

  const sizeName = size > 0.7 ? 'Large' : size > 0.4 ? 'Medium' : 'Small';
  const brightName = lightness > 0.6 ? 'Bright' : lightness < 0.4 ? 'Dim' : '';

  return [brightName, sizeName, colorName, shapeName].filter(Boolean).join(' ');
}

function featureToEmoji(features) {
  if (!features || features.length < 8) return '🔮';
  const hue = features[0];
  if (hue < 0.12) return '🔴';
  if (hue < 0.25) return '🟠';
  if (hue < 0.4) return '🟡';
  if (hue < 0.55) return '🟢';
  if (hue < 0.7) return '🔵';
  if (hue < 0.85) return '🟣';
  return '🩷';
}

function generateSpeakerDescription(features, episode) {
  if (!features || features.length < 8) return 'Examining the target object...';
  const [hue, size, opacity, , , shape] = features;
  const name = featureToName(features);
  const templates = [
    `Analyzing the ${name}. Its hue is ${hue.toFixed(2)}, size ${size.toFixed(2)}. Shape stands out clearly — I need to encode this precisely.`,
    `The target is a ${name}. I observe strong color at ${hue.toFixed(2)} and ${size > 0.6 ? 'large' : 'compact'} dimensions. Let me craft a clear message.`,
    `Focusing on the ${name}. The ${shape < 0.3 ? 'circular' : shape < 0.7 ? 'angular' : 'pointed'} form and ${opacity > 0.7 ? 'high' : 'moderate'} opacity are key features to transmit.`,
    `Target acquired: ${name}. Encoding shape and color first, then size. Confidence is ${opacity > 0.8 ? 'high' : 'moderate'}.`,
    `I see the ${name}. Its features are distinctive — hue at ${hue.toFixed(2)}, light at ${features[7]?.toFixed(2)}. Generating symbol sequence now.`,
  ];
  return templates[episode % templates.length];
}

function generateListenerInterpretation(features, targetFeatures, correct, episode) {
  const chosenName = featureToName(features);
  const targetName = featureToName(targetFeatures);
  if (correct) {
    const templates = [
      `The message symbols clearly indicate the ${targetName}. My analysis matches — selecting with confidence.`,
      `Decoding the symbol sequence... Shape and color patterns point to the ${targetName}. Confirmed.`,
      `The symbol frequency suggests ${targetName}. Cross-referencing with candidate set — match found!`,
      `Pattern recognition complete. The symbols encode a ${targetName}. High certainty.`,
    ];
    return templates[episode % templates.length];
  } else {
    const templates = [
      `The symbols are ambiguous between the ${targetName} and ${chosenName}. I'll go with ${chosenName}.`,
      `Decoding... I think it's the ${chosenName}. The symbol pattern is noisy, but this feels right.`,
      `The message could represent the ${chosenName}. Some features overlap with ${targetName}. Choosing best guess.`,
      `Signal quality is low. The symbols suggest ${chosenName}, but ${targetName} was also possible. Selected.`,
    ];
    return templates[episode % templates.length];
  }
}

// ─── CRT OVERLAY ───────────────────────────────────────────────
function CRTOverlay() {
  return (
    <div style={{
      position: 'fixed', inset: 0, pointerEvents: 'none', zIndex: 9999,
      background: `repeating-linear-gradient(
        0deg, transparent, transparent 2px, rgba(0,0,0,0.15) 2px, rgba(0,0,0,0.15) 4px
      )`,
      mixBlendMode: 'multiply',
    }} />
  );
}

// ─── TYPEWRITER TEXT ───────────────────────────────────────────
function TypewriterText({ text, speed = 30, onComplete, style }) {
  const [displayed, setDisplayed] = useState('');
  const idxRef = useRef(0);

  useEffect(() => {
    setDisplayed('');
    idxRef.current = 0;
    if (!text) return;
    const interval = setInterval(() => {
      idxRef.current += 1;
      if (idxRef.current >= text.length) {
        setDisplayed(text);
        clearInterval(interval);
        onComplete?.();
      } else {
        setDisplayed(text.slice(0, idxRef.current));
      }
    }, speed);
    return () => clearInterval(interval);
  }, [text, speed]);

  return <span style={style}>{displayed}<span style={{ opacity: 0.5, animation: 'blink 1s step-end infinite' }}>▌</span></span>;
}

// ─── OBJECT VISUAL ─────────────────────────────────────────────
function ObjectVisual({ features, size = 100, glowing }) {
  if (!features || features.length === 0) return <div style={{ width: size, height: size }} />;
  const shapeIdx = Math.floor((features[0] || 0) * 5);
  const scale = 0.5 + (features[1] || 0.5) * 1.0;
  const r = Math.round((features[2] || 0.5) * 255);
  const g = Math.round((features[3] || 0.5) * 255);
  const b = Math.round((features[4] || 0.5) * 255);
  const rotation = (features[7] || 0) * 360;
  const shapeStyles = ['50%', '0%', '0%', '50%', '8px 8px 0% 0%'];
  const borderRadius = shapeStyles[shapeIdx] || '50%';
  const isTriangle = shapeIdx === 2;
  const isDiamond = shapeIdx === 3;
  const shapeSize = size * scale * 0.8;
  const bgColor = `rgb(${r},${g},${b})`;

  return (
    <div style={{
      width: size, height: size, display: 'flex', alignItems: 'center', justifyContent: 'center',
      border: `2px solid ${glowing ? C.green : '#333'}`, borderRadius: 8,
      background: 'rgba(10,10,30,0.8)', position: 'relative',
      boxShadow: glowing ? `0 0 20px ${C.green}44, inset 0 0 10px ${C.green}22` : 'none',
    }}>
      <div style={{
        width: shapeSize, height: shapeSize,
        borderRadius: isTriangle ? '0%' : (isDiamond ? '0%' : borderRadius),
        backgroundColor: isTriangle ? 'transparent' : bgColor,
        border: isTriangle ? 'none' : '2px solid rgba(255,255,255,0.25)',
        transform: `rotate(${isDiamond ? 45 : rotation}deg)`,
        clipPath: isTriangle ? 'polygon(50% 0%, 0% 100%, 100% 100%)' : 'none',
        ...(isTriangle ? { backgroundColor: bgColor } : {}),
      }} />
    </div>
  );
}

// ─── PERSONALITY BADGE ─────────────────────────────────────────
function PersonalityBadge({ label, color, traits }) {
  return (
    <motion.div
      initial={{ scale: 0.8, opacity: 0 }}
      animate={{ scale: 1, opacity: 1 }}
      style={{
        display: 'inline-flex', flexWrap: 'wrap', gap: 4, padding: '4px 10px',
        background: `${color}0d`, border: `1px solid ${color}33`,
        borderRadius: 6, fontSize: 10, fontFamily: "'JetBrains Mono', monospace",
      }}
    >
      <span style={{ color, fontWeight: 'bold', marginRight: 4 }}>{label}</span>
      {traits && Object.entries(traits).map(([key, val]) => (
        <span key={key} style={{
          padding: '1px 6px', borderRadius: 4,
          background: `${C.cyan}18`,
          color: C.cyan, border: `1px solid ${C.cyan}33`,
        }}>
          {key}
        </span>
      ))}
    </motion.div>
  );
}

// ─── SPINNER ───────────────────────────────────────────────────
function Spinner({ color = C.green, size = 24 }) {
  return (
    <motion.div
      animate={{ rotate: 360 }}
      transition={{ repeat: Infinity, duration: 1, ease: 'linear' }}
      style={{
        width: size, height: size, border: `2px solid ${color}33`,
        borderTop: `2px solid ${color}`, borderRadius: '50%',
      }}
    />
  );
}

// ─── SUMMARY CARD ──────────────────────────────────────────────
function SummaryCard({ label, value, color }) {
  return (
    <motion.div
      initial={{ y: 20, opacity: 0 }}
      animate={{ y: 0, opacity: 1 }}
      style={{
        padding: '16px 20px', borderRadius: 10,
        background: `${color}0a`, border: `1px solid ${color}33`,
      }}
    >
      <div style={{ fontSize: 26, fontWeight: 'bold', color, fontFamily: "'JetBrains Mono', monospace" }}>{value}</div>
      <div style={{ fontSize: 9, color: '#888', letterSpacing: 1, marginTop: 4, textTransform: 'uppercase' }}>{label}</div>
    </motion.div>
  );
}

// ═══════════════════════════════════════════════════════════════
// PIXEL ART DEMO CANVAS
// ═══════════════════════════════════════════════════════════════
function DemoSceneCanvas({ phase, conv, currentIdx }) {
  const canvasRef = useRef(null);
  const animRef = useRef(null);
  const stateRef = useRef({
    t: 0,
    particles: new ParticleSystem(),
    weatherParticles: new ParticleSystem(),
    speakerX: 200, speakerY: 200,
    listenerX: 600, listenerY: 200,
    targetX: 400, targetY: 170,
    animTimer: 0,
    prevPhase: 'idle',
    trees: [],
    waterBodies: [],
    phase: 'idle',
    conv: null,
    currentIdx: 0,
  });

  // Sync props to stateRef for canvas + phase timeouts
  useEffect(() => {
    stateRef.current.phase = phase;
    stateRef.current.conv = conv;
    stateRef.current.currentIdx = currentIdx;
  }, [phase, conv, currentIdx]);

  useEffect(() => {
    ensureSprites();
    const s = stateRef.current;
    // Generate landscape features once
    s.trees = [];
    for (let i = 0; i < 8; i++) {
      s.trees.push({
        x: 50 + hashCoord(i, 7) * 700,
        y: 190 + hashCoord(i, 13) * 30,
        size: 0.6 + hashCoord(i, 3) * 0.6,
      });
    }
    s.waterBodies = [
      { x: 100, y: 230, w: 120, h: 20 },
      { x: 580, y: 235, w: 100, h: 15 },
    ];
  }, []);

  // React to phase changes
  useEffect(() => {
    if (!phase || phase === stateRef.current.prevPhase) return;
    const s = stateRef.current;
    s.prevPhase = phase;
    s.animTimer = 2;

    if (phase === 'result' && conv) {
      if (conv.correct) {
        // Success sparkles
        for (let i = 0; i < 25; i++) {
          s.particles.add({
            x: 300 + Math.random() * 200, y: 150 + Math.random() * 80,
            vx: (Math.random() - 0.5) * 80, vy: -20 - Math.random() * 50,
            color: '#00ff88', size: 2 + Math.random() * 2, life: 2, type: 'sparkle', alpha: 0.8,
          });
        }
      } else {
        // Fail smoke
        for (let i = 0; i < 15; i++) {
          s.particles.add({
            x: 300 + Math.random() * 200, y: 180 + Math.random() * 40,
            vx: (Math.random() - 0.5) * 20, vy: -10 - Math.random() * 15,
            color: '#ff4444', size: 4 + Math.random() * 3, life: 2, type: 'smoke', alpha: 0.5,
          });
        }
      }
    }
  }, [phase, conv]);

  // Animation loop
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');

    const animate = () => {
      const s = stateRef.current;
      const W = 800, H = 300;
      const dt = 0.016;
      s.t += dt;
      s.animTimer = Math.max(0, s.animTimer - dt);

      // Clear
      ctx.clearRect(0, 0, W, H);

      // Sky gradient
      const skyGrad = ctx.createLinearGradient(0, 0, 0, H * 0.7);
      skyGrad.addColorStop(0, '#0a0a1a');
      skyGrad.addColorStop(0.4, '#0d1025');
      skyGrad.addColorStop(1, '#1a1a3e');
      ctx.fillStyle = skyGrad;
      ctx.fillRect(0, 0, W, H);

      // Stars
      ctx.fillStyle = '#ffffff';
      for (let i = 0; i < 30; i++) {
        const sx = (hashCoord(i, 1) * W) | 0;
        const sy = (hashCoord(i, 2) * 100) | 0;
        const blink = 0.3 + Math.sin(s.t * 2 + i) * 0.4;
        ctx.globalAlpha = blink;
        ctx.fillRect(sx, sy, 1, 1);
      }
      ctx.globalAlpha = 1;

      // Terrain
      const terrainGrad = ctx.createLinearGradient(0, 180, 0, H);
      terrainGrad.addColorStop(0, '#1a2a1a');
      terrainGrad.addColorStop(0.5, '#0d1a0d');
      terrainGrad.addColorStop(1, '#0a150a');
      ctx.fillStyle = terrainGrad;
      ctx.beginPath();
      ctx.moveTo(0, H);
      for (let x = 0; x <= W; x += 3) {
        const y = 210 + Math.sin(x * 0.01 + s.t * 0.1) * 8 + Math.sin(x * 0.03) * 4;
        ctx.lineTo(x, y);
      }
      ctx.lineTo(W, H);
      ctx.closePath();
      ctx.fill();

      // Grass tufts
      ctx.fillStyle = '#2a4a2a';
      for (let x = 0; x < W; x += 12) {
        const h = hashCoord(x, 5);
        const gy = 208 + Math.sin(x * 0.01 + s.t * 0.1) * 8 + Math.sin(x * 0.03) * 4;
        ctx.fillRect(x, gy - h * 5, 2, h * 6);
      }

      // Water bodies
      s.waterBodies.forEach(wb => {
        const waterGrad = ctx.createLinearGradient(wb.x, wb.y, wb.x, wb.y + wb.h);
        waterGrad.addColorStop(0, '#1a3060aa');
        waterGrad.addColorStop(1, '#0a1830aa');
        ctx.fillStyle = waterGrad;
        ctx.fillRect(wb.x, wb.y, wb.w, wb.h);
        // Water shimmer
        ctx.fillStyle = '#4488ff22';
        for (let wx = wb.x; wx < wb.x + wb.w; wx += 8) {
          const wy = wb.y + Math.sin(wx * 0.1 + s.t * 3) * 2;
          ctx.fillRect(wx, wy, 4, 1);
        }
      });

      // Trees (pixel art trunks & canopy)
      s.trees.forEach(tree => {
        const tx = tree.x, ty = tree.y, ts = tree.size;
        // Trunk
        ctx.fillStyle = '#3a2a1a';
        ctx.fillRect(tx - 2 * ts, ty - 20 * ts, 4 * ts, 22 * ts);
        // Canopy
        ctx.fillStyle = '#1a4a1a';
        ctx.beginPath();
        ctx.arc(tx, ty - 24 * ts, 12 * ts, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = '#2a5a2a';
        ctx.beginPath();
        ctx.arc(tx - 3 * ts, ty - 28 * ts, 8 * ts, 0, Math.PI * 2);
        ctx.fill();
      });

      // Weather particles based on phase
      if (s.animTimer > 0) {
        if (phase === 'result' && conv?.correct) {
          // Golden dust for success
          if (Math.random() < 0.15) {
            s.weatherParticles.add({
              x: Math.random() * W, y: 0,
              vx: (Math.random() - 0.5) * 10, vy: 20 + Math.random() * 15,
              color: '#ffaa00', size: 1, life: 3, type: 'firefly', alpha: 0.5,
            });
          }
        }
      }

      // Ambient dust motes
      if (Math.random() < 0.04) {
        s.weatherParticles.add({
          x: Math.random() * W, y: Math.random() * H,
          vx: (Math.random() - 0.5) * 5, vy: (Math.random() - 0.5) * 3,
          color: '#ffffff', size: 0.5, life: 4, type: 'firefly', alpha: 0.15,
        });
      }

      // Object indicator for target
      if (conv && phase !== 'idle') {
        const targetHue = conv.target_features?.[0] || 0.5;
        const hueColor = targetHue < 0.15 ? '#ff4444' :
          targetHue < 0.3 ? '#ff8844' :
          targetHue < 0.45 ? '#ffaa00' :
          targetHue < 0.6 ? '#00ff88' :
          targetHue < 0.75 ? '#00ddff' :
          targetHue < 0.9 ? '#aa66ff' : '#ff66aa';

        // Draw pixel art object on pedestal
        ctx.fillStyle = '#2a2a40';
        ctx.fillRect(s.targetX - 15, s.targetY + 10, 30, 8);
        ctx.fillStyle = '#1a1a30';
        ctx.fillRect(s.targetX - 12, s.targetY + 6, 24, 6);

        // Object shape
        const shapeSize = 10 + (conv.target_features?.[1] || 0.5) * 10;
        ctx.fillStyle = hueColor;
        ctx.shadowColor = hueColor;
        ctx.shadowBlur = phase === 'object' || phase === 'speaker' ? 12 : 4;
        const shapeIdx = Math.floor((conv.target_features?.[5] || 0) * 5);
        if (shapeIdx <= 1) {
          // Circle
          ctx.beginPath();
          ctx.arc(s.targetX, s.targetY, shapeSize, 0, Math.PI * 2);
          ctx.fill();
        } else if (shapeIdx === 2) {
          // Triangle
          ctx.beginPath();
          ctx.moveTo(s.targetX, s.targetY - shapeSize);
          ctx.lineTo(s.targetX - shapeSize, s.targetY + shapeSize * 0.7);
          ctx.lineTo(s.targetX + shapeSize, s.targetY + shapeSize * 0.7);
          ctx.closePath();
          ctx.fill();
        } else {
          // Square/diamond
          ctx.save();
          ctx.translate(s.targetX, s.targetY);
          ctx.rotate(Math.PI / 4);
          ctx.fillRect(-shapeSize * 0.7, -shapeSize * 0.7, shapeSize * 1.4, shapeSize * 1.4);
          ctx.restore();
        }
        ctx.shadowBlur = 0;

        // Target label
        ctx.font = '9px JetBrains Mono, monospace';
        ctx.fillStyle = '#ccccdd';
        ctx.textAlign = 'center';
        const tName = featureToName(conv.target_features);
        ctx.fillText(tName, s.targetX, s.targetY - shapeSize - 8);
      }

      // Draw agents
      const speakerGlow = phase === 'speaker' || phase === 'object' ? '#00ddff' : '#4488ff';
      const listenerGlow = phase === 'listener' ? '#ffaa00' : '#ff6644';

      // Agents face each other during communication
      const speakerFlip = phase !== 'idle';
      const listenerFlip = phase === 'idle';

      // Speaker bounce during message
      const speakerBob = phase === 'message' ? Math.abs(Math.sin(s.t * 6)) * 5 : 0;
      const listenerBob = phase === 'result' ? Math.abs(Math.sin(s.t * 8)) * 5 : 0;

      drawSprite(ctx, 'mage', s.speakerX, s.speakerY, {
        scale: 1.6, bobY: -speakerBob, flip: speakerFlip, glow: speakerGlow,
      });
      ctx.font = '9px JetBrains Mono, monospace';
      ctx.fillStyle = '#00ddff';
      ctx.textAlign = 'center';
      ctx.fillText('SPEAKER', s.speakerX, s.speakerY + 10);

      drawSprite(ctx, 'cleric', s.listenerX, s.listenerY, {
        scale: 1.6, bobY: -listenerBob, flip: listenerFlip, glow: listenerGlow,
      });
      ctx.font = '9px JetBrains Mono, monospace';
      ctx.fillStyle = '#ff6644';
      ctx.textAlign = 'center';
      ctx.fillText('LISTENER', s.listenerX, s.listenerY + 10);

      // Message arrows (during message phase)
      if (phase === 'message' && conv?.message) {
        const symbols = Array.isArray(conv.message) ? conv.message : [];
        ctx.font = '11px JetBrains Mono, monospace';
        ctx.fillStyle = '#ffaa00';
        ctx.textAlign = 'center';
        const symStr = symbols.map(s => typeof s === 'number' ? `S${s}` : s).join(' ');
        ctx.fillText(symStr, 400, 160);

        // Arrow animation
        const arrowProgress = (s.t * 1.5) % 1;
        const arrowX = s.speakerX + 40 + (s.listenerX - s.speakerX - 80) * arrowProgress;
        ctx.fillStyle = '#00ff88';
        ctx.beginPath();
        ctx.moveTo(arrowX, 170);
        ctx.lineTo(arrowX + 8, 174);
        ctx.lineTo(arrowX, 178);
        ctx.closePath();
        ctx.fill();
      }

      // Speech bubbles
      if (phase === 'speaker' && s.animTimer > 0) {
        drawSpeechBubble(ctx, s.speakerX, s.speakerY - 50, 'Analyzing...', {
          color: '#00ddff', maxWidth: 100, alpha: Math.min(1, s.animTimer),
        });
      }
      if (phase === 'listener' && s.animTimer > 0) {
        drawSpeechBubble(ctx, s.listenerX, s.listenerY - 50, 'Interpreting...', {
          color: '#ffaa00', maxWidth: 100, alpha: Math.min(1, s.animTimer),
        });
      }
      if (phase === 'result' && conv && s.animTimer > 0) {
        const resultText = conv.correct ? '✓ CORRECT' : '✗ WRONG';
        const resultColor = conv.correct ? '#00ff88' : '#ff4444';
        drawSpeechBubble(ctx, 400, 140, resultText, {
          color: resultColor, maxWidth: 100, alpha: Math.min(1, s.animTimer),
        });
      }

      // Update & draw particles
      s.particles.update();
      s.particles.draw(ctx);
      s.weatherParticles.update();
      s.weatherParticles.draw(ctx);

      // Label
      ctx.font = '9px JetBrains Mono, monospace';
      ctx.fillStyle = '#555577';
      ctx.textAlign = 'left';
      ctx.fillText('DEMO SCENE', 10, 14);
      if (phase !== 'idle') {
        ctx.textAlign = 'right';
        ctx.fillStyle = '#555577';
        ctx.fillText(`EP ${currentIdx + 1} • ${phase.toUpperCase()}`, W - 10, 14);
      }

      animRef.current = requestAnimationFrame(animate);
    };

    animRef.current = requestAnimationFrame(animate);
    return () => {
      if (animRef.current) cancelAnimationFrame(animRef.current);
    };
  }, []); // phase/conv/currentIdx read from stateRef

  return (
    <div style={{
      flex: '0 0 auto', borderRadius: 0, overflow: 'hidden',
      borderBottom: '1px solid #1a1a2e', position: 'relative',
    }}>
      <canvas
        ref={canvasRef}
        width={800}
        height={300}
        style={{ width: '100%', height: 300, display: 'block', imageRendering: 'pixelated' }}
      />
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════
// MAIN COMPONENT
// ═══════════════════════════════════════════════════════════════
export default function DemoMode() {
  // ── Data fetching state ──
  const [sessions, setSessions] = useState([]);
  const [selectedSessionId, setSelectedSessionId] = useState('');
  const [conversations, setConversations] = useState([]);
  const [loadingSessions, setLoadingSessions] = useState(false);
  const [loadingConversations, setLoadingConversations] = useState(false);
  const [error, setError] = useState(null);

  // ── Playback state ──
  const [currentIdx, setCurrentIdx] = useState(0);
  const [phase, setPhase] = useState('idle'); // idle | object | speaker | message | listener | result
  const [playing, setPlaying] = useState(false);
  const [speed, setSpeed] = useState(1);
  const [autoAdvance, setAutoAdvance] = useState(true);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [showSummary, setShowSummary] = useState(false);
  const [history, setHistory] = useState([]);
  const [ttsEnabled, setTtsEnabled] = useState(true);
  const scrollRef = useRef(null);
  const timerRef = useRef(null);

  // ── Fetch sessions ──
  const selectedSessionIdRef = useRef(selectedSessionId);
  selectedSessionIdRef.current = selectedSessionId;
  const fetchSessions = useCallback(async () => {
    setLoadingSessions(true);
    setError(null);
    try {
      const res = await fetch(`${API_URL}/sessions`);
      if (!res.ok) throw new Error(`HTTP ${res.status}: Failed to fetch sessions`);
      const data = await res.json();
      const list = data.sessions || data || [];
      setSessions(list);
      if (list.length > 0 && !selectedSessionIdRef.current) {
        setSelectedSessionId(list[0].session_id);
      }
    } catch (err) {
      setError(err.message);
    } finally {
      setLoadingSessions(false);
    }
  }, []); // selectedSessionId read from ref

  // ── Fetch conversations ──
  const fetchConversations = useCallback(async (sessionId) => {
    if (!sessionId) return;
    setLoadingConversations(true);
    setError(null);
    try {
      // Try the nested endpoint first, fall back to query param style
      let res = await fetch(`${API_URL}/sessions/${sessionId}/conversations?limit=500`);
      if (!res.ok) {
        res = await fetch(`${API_URL}/conversations?session_id=${sessionId}&limit=500`);
      }
      if (!res.ok) throw new Error(`HTTP ${res.status}: Failed to fetch conversations`);
      const data = await res.json();
      const convos = data.data || data.conversations || data || [];
      setConversations(convos);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoadingConversations(false);
    }
  }, []);

  // ── Initial load ──
  useEffect(() => { fetchSessions(); }, []);

  // ── Load conversations when session selected ──
  useEffect(() => {
    if (selectedSessionId) {
      fetchConversations(selectedSessionId);
      reset();
    }
  }, [selectedSessionId]);

  // ── Auto-scroll history ──
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [history, phase]);

  const conv = conversations[currentIdx];
  const totalConvos = conversations.length;

  const phaseTimings = useMemo(() => ({
    object: 2500 / speed, speaker: 4000 / speed,
    message: 2000 / speed, listener: 4000 / speed, result: 3000 / speed,
  }), [speed]);

  // ── TTS ──
  const speak = useCallback((text) => {
    if (!ttsEnabled || !('speechSynthesis' in window) || !text) return;
    window.speechSynthesis.cancel();
    const utter = new SpeechSynthesisUtterance(text);
    utter.rate = Math.min(speed, 1.5);
    utter.pitch = 1;
    const voices = window.speechSynthesis.getVoices();
    const preferred = voices.find(v => v.name.includes('Google') && v.lang.startsWith('en'))
      || voices.find(v => v.lang.startsWith('en'));
    if (preferred) utter.voice = preferred;
    window.speechSynthesis.speak(utter);
  }, [speed, ttsEnabled]);

  // ── Phase progression ──
  useEffect(() => {
    if (!playing || !autoAdvance || showSummary || !conv) return;
    if (phase === 'idle') { setPhase('object'); return; }

    const timing = phaseTimings[phase];
    if (!timing) return;

    timerRef.current = setTimeout(() => {
      const sConv = stateRef.current.conv;
      const sIdx = stateRef.current.currentIdx;
      if (phase === 'object') {
        setPhase('speaker');
        const desc = generateSpeakerDescription(sConv?.target_features, sIdx);
        speak(`Speaker agent observes the target object. ${desc}`);
      } else if (phase === 'speaker') {
        setPhase('message');
        const msgSymbols = Array.isArray(sConv?.message) ? sConv.message.map(m => typeof m === 'number' ? `Symbol ${m}` : m) : [];
        speak(`Sending message: ${msgSymbols.join(', ')}`);
      } else if (phase === 'message') {
        setPhase('listener');
        const interp = generateListenerInterpretation(sConv?.candidates_features?.[sConv?.listener_choice], sConv?.target_features, sConv?.correct, sIdx);
        speak(`Listener interprets. ${interp}`);
      } else if (phase === 'listener') {
        setPhase('result');
        speak(sConv?.correct ? 'Correct match! The listener identified the right object.' : 'Incorrect. The listener chose the wrong object.');
      } else if (phase === 'result') {
        setHistory(prev => [...prev, { ...sConv, _episode: sIdx + 1 }]);
        if (sIdx < totalConvos - 1) {
          setCurrentIdx(prev => prev + 1);
          setPhase('object');
        } else {
          setShowSummary(true);
          setPlaying(false);
        }
      }
    }, timing);

    return () => clearTimeout(timerRef.current);
  }, [playing, autoAdvance, phase, currentIdx, conv, totalConvos, phaseTimings, speak, showSummary]);

  // ── Skip controls ──
  const skipNext = useCallback(() => {
    window.speechSynthesis?.cancel();
    clearTimeout(timerRef.current);
    if (currentIdx < totalConvos - 1) {
      setHistory(prev => conv ? [...prev, { ...conv, _episode: currentIdx + 1 }] : prev);
      setCurrentIdx(prev => prev + 1);
      setPhase('object');
    } else {
      setShowSummary(true);
      setPlaying(false);
    }
  }, [currentIdx, totalConvos, conv]);

  const skipPrev = useCallback(() => {
    window.speechSynthesis?.cancel();
    clearTimeout(timerRef.current);
    if (currentIdx > 0) {
      setCurrentIdx(prev => prev - 1);
      setPhase('object');
    }
  }, [currentIdx]);

  // ── Fullscreen ──
  const toggleFullscreen = useCallback(() => {
    if (!document.fullscreenElement) {
      document.documentElement.requestFullscreen?.().then(() => setIsFullscreen(true)).catch(() => {});
    } else {
      document.exitFullscreen?.().then(() => setIsFullscreen(false)).catch(() => {});
    }
  }, []);

  // ── Fullscreen change listener ──
  useEffect(() => {
    const handler = () => setIsFullscreen(!!document.fullscreenElement);
    document.addEventListener('fullscreenchange', handler);
    return () => document.removeEventListener('fullscreenchange', handler);
  }, []);

  // ── Reset ──
  const reset = useCallback(() => {
    setCurrentIdx(0); setPhase('idle'); setPlaying(false);
    setShowSummary(false); setHistory([]);
    window.speechSynthesis?.cancel();
    clearTimeout(timerRef.current);
  }, []);

  // ── Keyboard shortcuts ──
  useEffect(() => {
    const handler = (e) => {
      if (e.key === ' ') { e.preventDefault(); setPlaying(p => !p); }
      else if (e.key === 'ArrowRight') skipNext();
      else if (e.key === 'ArrowLeft') skipPrev();
      else if (e.key === 'f') toggleFullscreen();
      else if (e.key === 'r') reset();
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [skipNext, skipPrev, toggleFullscreen, reset]);

  // ── Stats ──
  const totalCorrect = conversations.filter(c => c.correct).length;
  const accuracy = totalConvos > 0 ? ((totalCorrect / totalConvos) * 100).toFixed(1) : '0';
  const allSymbols = new Set(conversations.flatMap(c => Array.isArray(c.message) ? c.message : []));

  // ── Derived display data ──
  const targetName = conv ? featureToName(conv.target_features) : '';
  const targetEmoji = conv ? featureToEmoji(conv.target_features) : '';
  const chosenName = conv ? featureToName(conv.candidates_features?.[conv.listener_choice]) : '';
  const speakerDesc = conv ? generateSpeakerDescription(conv.target_features, currentIdx) : '';
  const listenerInterp = conv ? generateListenerInterpretation(
    conv.candidates_features?.[conv.listener_choice], conv.target_features, conv.correct, currentIdx
  ) : '';
  const msgSymbols = conv && Array.isArray(conv.message) ? conv.message : [];

  // ═══════════════════════════════════════════════════════════════
  // RENDER
  // ═══════════════════════════════════════════════════════════════
  return (
    <div style={{
      width: '100%', minHeight: '100vh', background: C.bg,
      fontFamily: "'JetBrains Mono', monospace", color: C.text,
      display: 'flex', flexDirection: 'column', position: 'relative',
    }}>
      <CRTOverlay />
      <style>{`@keyframes blink { 50% { opacity: 0; } }`}</style>

      {/* ── TITLE BAR ────────────────────────────────────── */}
      <motion.div
        initial={{ y: -50, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        style={{
          flex: '0 0 50px', background: C.panel,
          borderBottom: `2px solid ${C.border}`, display: 'flex',
          alignItems: 'center', justifyContent: 'space-between',
          padding: '0 20px', zIndex: 10,
        }}
      >
        <div style={{
          fontSize: 16, color: C.green, fontWeight: 'bold',
          textShadow: `0 0 8px ${C.green}66`, letterSpacing: 3,
        }}>
          🤖 DEMO MODE
        </div>
        <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
          {totalConvos > 0 && (
            <>
              <span style={{ fontSize: 11, color: C.cyan }}>
                EP {currentIdx + 1}/{totalConvos}
              </span>
              <span style={{ fontSize: 11, color: playing ? C.green : C.muted }}>
                {playing ? '● PLAYING' : '○ PAUSED'}
              </span>
            </>
          )}
        </div>
      </motion.div>

      {/* ── SESSION SELECTOR & CONTROLS ───────────────────── */}
      <motion.div
        initial={{ y: -30, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        transition={{ delay: 0.1 }}
        style={{
          flex: '0 0 auto', background: 'rgba(13,13,34,0.9)',
          borderBottom: '1px solid #1a1a2e', display: 'flex',
          flexWrap: 'wrap', alignItems: 'center', padding: '8px 20px', gap: 10, zIndex: 10,
        }}
      >
        {/* Session selector */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <span style={{ fontSize: 10, color: C.amber, letterSpacing: 1 }}>SESSION:</span>
          {loadingSessions ? (
            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <Spinner size={14} color={C.amber} />
              <span style={{ fontSize: 10, color: C.muted }}>Loading...</span>
            </div>
          ) : (
            <select
              value={selectedSessionId}
              onChange={(e) => setSelectedSessionId(e.target.value)}
              style={{
                background: '#111', border: `1px solid ${C.amber}44`, color: C.text,
                padding: '4px 8px', borderRadius: 4, fontSize: 11,
                fontFamily: "'JetBrains Mono', monospace", outline: 'none',
                cursor: 'pointer', minWidth: 180,
              }}
            >
              {sessions.length === 0 && <option value="">No sessions found</option>}
              {sessions.map(s => (
                <option key={s.session_id} value={s.session_id}>
                  {s.name || s.session_id.slice(0, 12)} ({s.status})
                </option>
              ))}
            </select>
          )}
          <button onClick={fetchSessions} style={ctrlBtnStyle} title="Refresh sessions">↻</button>
        </div>

        <div style={{ width: 1, height: 24, background: '#333', margin: '0 4px' }} />

        {/* Playback controls */}
        <button
          onClick={() => setPlaying(!playing)}
          disabled={totalConvos === 0}
          style={{
            ...ctrlBtnStyle,
            background: playing ? 'rgba(255,68,68,0.1)' : 'rgba(0,255,136,0.1)',
            borderColor: playing ? C.red : C.green,
            color: playing ? C.red : C.green,
            opacity: totalConvos === 0 ? 0.3 : 1,
          }}
        >
          {playing ? '⏸ Pause' : '▶ Play'}
        </button>

        <button onClick={skipPrev} disabled={currentIdx === 0 || totalConvos === 0} style={{ ...ctrlBtnStyle, opacity: currentIdx === 0 ? 0.3 : 1 }}>
          ⏮ Prev
        </button>
        <button onClick={skipNext} disabled={totalConvos === 0} style={{ ...ctrlBtnStyle, opacity: totalConvos === 0 ? 0.3 : 1 }}>
          ⏭ Next
        </button>

        <div style={{ width: 1, height: 24, background: '#333', margin: '0 4px' }} />

        {/* Speed slider */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <span style={{ fontSize: 10, color: C.muted }}>Speed:</span>
          <input
            type="range" min={0.5} max={2} step={0.25} value={speed}
            onChange={(e) => setSpeed(parseFloat(e.target.value))}
            style={{ width: 80, accentColor: C.green, cursor: 'pointer' }}
          />
          <span style={{ fontSize: 10, color: C.green, minWidth: 30 }}>{speed}x</span>
        </div>

        <div style={{ width: 1, height: 24, background: '#333', margin: '0 4px' }} />

        {/* TTS toggle */}
        <button onClick={() => setTtsEnabled(!ttsEnabled)} style={{
          ...ctrlBtnStyle,
          background: ttsEnabled ? 'rgba(0,221,255,0.1)' : 'transparent',
          borderColor: ttsEnabled ? C.cyan : '#333',
          color: ttsEnabled ? C.cyan : C.muted,
        }}>
          {ttsEnabled ? '🔊 TTS' : '🔇 Muted'}
        </button>

        {/* Auto-advance toggle */}
        <button onClick={() => setAutoAdvance(!autoAdvance)} style={{
          ...ctrlBtnStyle,
          background: autoAdvance ? 'rgba(255,170,0,0.1)' : 'transparent',
          borderColor: autoAdvance ? C.amber : '#333',
          color: autoAdvance ? C.amber : C.muted,
        }}>
          {autoAdvance ? '⟳ Auto' : '⏸ Manual'}
        </button>

        {/* Fullscreen */}
        <button onClick={toggleFullscreen} style={ctrlBtnStyle}>
          {isFullscreen ? '⊡ Exit FS' : '⊞ Fullscreen'}
        </button>

        {/* Reset */}
        <button onClick={reset} style={ctrlBtnStyle}>↺ Reset</button>
      </motion.div>

      {/* ── PROGRESS BAR ──────────────────────────────────── */}
      {totalConvos > 0 && (
        <div style={{
          flex: '0 0 4px', background: '#111', position: 'relative', overflow: 'hidden',
        }}>
          <motion.div
            animate={{ width: `${((currentIdx + (phase === 'result' ? 1 : 0)) / totalConvos) * 100}%` }}
            transition={{ duration: 0.3 }}
            style={{
              height: '100%', background: `linear-gradient(90deg, ${C.green}, ${C.cyan})`,
              boxShadow: `0 0 8px ${C.green}66`,
            }}
          />
        </div>
      )}

      {/* ── ERROR STATE ───────────────────────────────────── */}
      {error && (
        <div style={{
          flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center',
          flexDirection: 'column', gap: 16,
        }}>
          <div style={{ fontSize: 40 }}>⚠️</div>
          <div style={{ color: C.red, fontSize: 14 }}>Error: {error}</div>
          <button onClick={() => { setError(null); fetchSessions(); }} style={{
            ...ctrlBtnStyle, padding: '8px 20px', borderColor: C.green, color: C.green,
          }}>
            ↻ Retry
          </button>
        </div>
      )}

      {/* ── LOADING STATE ─────────────────────────────────── */}
      {!error && loadingConversations && (
        <div style={{
          flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center',
          flexDirection: 'column', gap: 16,
        }}>
          <Spinner size={40} />
          <div style={{ color: C.muted, fontSize: 13, letterSpacing: 1 }}>Loading conversations...</div>
        </div>
      )}

      {/* ── EMPTY STATE ───────────────────────────────────── */}
      {!error && !loadingConversations && !loadingSessions && sessions.length === 0 && (
        <div style={{
          flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center',
          flexDirection: 'column', gap: 16,
        }}>
          <div style={{ fontSize: 48 }}>🤖</div>
          <div style={{ color: C.muted, fontSize: 14, letterSpacing: 1 }}>No sessions found</div>
          <div style={{ color: '#555', fontSize: 11 }}>Create a training session first to demo its conversations.</div>
          <button onClick={fetchSessions} style={{
            ...ctrlBtnStyle, padding: '8px 20px', borderColor: C.green, color: C.green,
          }}>
            ↻ Refresh
          </button>
        </div>
      )}

      {/* ── NO CONVERSATIONS STATE ────────────────────────── */}
      {!error && !loadingConversations && sessions.length > 0 && totalConvos === 0 && (
        <EmptyCanvas title="No conversations recorded" subtitle="This session has no conversations yet — train the agents first" icon="💬" />
      )}

      {/* ── MAIN CONTENT ──────────────────────────────────── */}
      {!error && !loadingConversations && totalConvos > 0 && !showSummary && (
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
          {/* ── Pixel Art Demo Canvas ──────────────────────── */}
          <DemoSceneCanvas phase={phase} conv={conv} currentIdx={currentIdx} />

          <div style={{ flex: 1, display: 'flex', overflow: 'hidden' }}>
          {/* ── Conversation Stage ──────────────────────────── */}
          <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>

            {/* Stage Area */}
            <div style={{
              flex: '0 0 auto', minHeight: 280, display: 'flex', alignItems: 'center',
              justifyContent: 'center', gap: 30, padding: '24px 20px',
              background: `radial-gradient(ellipse at center, rgba(0,255,136,0.03) 0%, transparent 70%)`,
              borderBottom: '1px solid #1a1a2e', position: 'relative', flexWrap: 'wrap',
            }}>
              {/* Speaker Side */}
              <AnimatePresence mode="wait">
                {phase !== 'idle' && conv && (
                  <motion.div
                    key={`speaker-${currentIdx}`}
                    initial={{ x: -60, opacity: 0 }}
                    animate={{ x: 0, opacity: 1 }}
                    exit={{ x: -60, opacity: 0 }}
                    transition={{ type: 'spring', damping: 20 }}
                    style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 10, minWidth: 140 }}
                  >
                    <div style={{
                      fontSize: 10, color: C.cyan, textTransform: 'uppercase',
                      letterSpacing: 2, fontWeight: 'bold',
                    }}>SPEAKER</div>
                    <PersonalityBadge
                      label="Speaker (analytical, curious)"
                      color={C.cyan}
                      traits={{ analytical: true, curious: true }}
                    />
                    <ObjectVisual
                      features={conv.target_features}
                      size={100}
                      glowing={phase === 'object' || phase === 'speaker'}
                    />
                    <div style={{
                      fontSize: 18, color: C.text, fontWeight: 'bold',
                      textShadow: `0 0 8px ${C.green}44`,
                    }}>
                      {targetEmoji} {targetName}
                    </div>
                    <div style={{ fontSize: 9, color: C.muted }}>TARGET OBJECT</div>
                  </motion.div>
                )}
              </AnimatePresence>

              {/* Message Arrow */}
              <AnimatePresence>
                {(phase === 'message' || phase === 'listener' || phase === 'result') && (
                  <motion.div
                    key={`msg-${currentIdx}`}
                    initial={{ scale: 0, opacity: 0 }}
                    animate={{ scale: 1, opacity: 1 }}
                    exit={{ scale: 0, opacity: 0 }}
                    style={{
                      display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8,
                    }}
                  >
                    <div style={{ fontSize: 10, color: C.amber, letterSpacing: 2, fontWeight: 'bold' }}>MESSAGE</div>
                    <div style={{
                      display: 'flex', gap: 6, padding: '10px 20px',
                      background: 'rgba(255,170,0,0.08)', border: `1px solid ${C.amber}33`,
                      borderRadius: 8,
                    }}>
                      {msgSymbols.map((sym, i) => (
                        <motion.span
                          key={i}
                          initial={{ y: -10, opacity: 0 }}
                          animate={{ y: 0, opacity: 1 }}
                          transition={{ delay: i * 0.1 }}
                          style={{
                            fontSize: 24, color: C.amber,
                            textShadow: `0 0 8px ${C.amber}66`,
                          }}
                        >
                          {typeof sym === 'number' ? `S${sym}` : sym}
                        </motion.span>
                      ))}
                    </div>
                    <motion.div
                      animate={{ x: [0, 12, 0] }}
                      transition={{ repeat: Infinity, duration: 1.5 }}
                      style={{ fontSize: 24, color: C.green }}
                    >
                      →
                    </motion.div>
                  </motion.div>
                )}
              </AnimatePresence>

              {/* Listener Side */}
              <AnimatePresence mode="wait">
                {phase !== 'idle' && conv && (
                  <motion.div
                    key={`listener-${currentIdx}`}
                    initial={{ x: 60, opacity: 0 }}
                    animate={{ x: 0, opacity: 1 }}
                    exit={{ x: 60, opacity: 0 }}
                    transition={{ type: 'spring', damping: 20 }}
                    style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 10, minWidth: 140 }}
                  >
                    <div style={{
                      fontSize: 10, color: C.amber, textTransform: 'uppercase',
                      letterSpacing: 2, fontWeight: 'bold',
                    }}>LISTENER</div>
                    <PersonalityBadge
                      label="Listener (methodical, skeptical)"
                      color={C.amber}
                      traits={{ methodical: true, skeptical: true }}
                    />
                    <ObjectVisual
                      features={conv.candidates_features?.[conv.listener_choice]}
                      size={100}
                      glowing={phase === 'result' && conv.correct}
                    />
                    <div style={{
                      fontSize: 18, color: conv.correct ? C.green : C.red,
                      fontWeight: 'bold',
                      textShadow: `0 0 8px ${conv.correct ? C.green : C.red}44`,
                    }}>
                      {conv.correct ? '✓' : '✗'} {chosenName}
                    </div>
                    <div style={{ fontSize: 9, color: C.muted }}>CHOSEN OBJECT</div>
                  </motion.div>
                )}
              </AnimatePresence>

              {/* Idle state */}
              {phase === 'idle' && (
                <motion.div
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  style={{
                    fontSize: 14, color: C.muted, textAlign: 'center',
                    display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 12,
                  }}
                >
                  <div style={{ fontSize: 40 }}>🤖</div>
                  <div>Press <span style={{ color: C.green }}>Play</span> to begin the demo</div>
                  <div style={{ fontSize: 10, color: '#555' }}>
                    {totalConvos} conversations to replay
                  </div>
                  <div style={{ fontSize: 9, color: '#444', marginTop: 8 }}>
                    Space = Play/Pause · ← → = Skip · F = Fullscreen · R = Reset
                  </div>
                </motion.div>
              )}

              {/* Result Badge */}
              <AnimatePresence>
                {phase === 'result' && (
                  <motion.div
                    key={`result-${currentIdx}`}
                    initial={{ scale: 0 }}
                    animate={{ scale: 1 }}
                    exit={{ scale: 0 }}
                    transition={{ type: 'spring', damping: 12 }}
                    style={{
                      position: 'absolute', top: 16, right: 16,
                      padding: '10px 24px', borderRadius: 8,
                      background: conv.correct ? 'rgba(0,255,136,0.15)' : 'rgba(255,68,68,0.15)',
                      border: `2px solid ${conv.correct ? C.green : C.red}`,
                      fontSize: 18, fontWeight: 'bold',
                      color: conv.correct ? C.green : C.red,
                      textShadow: `0 0 10px ${conv.correct ? C.green : C.red}66`,
                    }}
                  >
                    {conv.correct ? '✓ CORRECT' : '✗ WRONG'}
                  </motion.div>
                )}
              </AnimatePresence>
            </div>

            {/* ── Agent Thoughts Panel ──────────────────────── */}
            <div style={{
              flex: 1, padding: '16px 20px',
              background: 'rgba(13,13,34,0.6)',
              borderBottom: '1px solid #1a1a2e',
              display: 'flex', gap: 16, overflow: 'auto',
            }}>
              <AnimatePresence>
                {(phase === 'speaker' || phase === 'message' || phase === 'listener' || phase === 'result') && (
                  <motion.div
                    key={`speaker-thought-${currentIdx}`}
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    style={{
                      flex: 1, padding: '12px 16px', borderRadius: 8,
                      background: 'rgba(0,221,255,0.06)',
                      borderLeft: `3px solid ${C.cyan}66`,
                      fontSize: 12, color: C.text, lineHeight: 1.6,
                    }}
                  >
                    <div style={{ fontSize: 9, color: C.cyan, letterSpacing: 1, marginBottom: 6, textTransform: 'uppercase' }}>
                      💭 Speaker Description
                    </div>
                    <TypewriterText
                      text={speakerDesc}
                      speed={20 + (1 / speed) * 20}
                      style={{ color: C.text }}
                    />
                  </motion.div>
                )}
              </AnimatePresence>
              <AnimatePresence>
                {(phase === 'listener' || phase === 'result') && (
                  <motion.div
                    key={`listener-thought-${currentIdx}`}
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    style={{
                      flex: 1, padding: '12px 16px', borderRadius: 8,
                      background: 'rgba(255,170,0,0.06)',
                      borderLeft: `3px solid ${C.amber}66`,
                      fontSize: 12, color: C.text, lineHeight: 1.6,
                    }}
                  >
                    <div style={{ fontSize: 9, color: C.amber, letterSpacing: 1, marginBottom: 6, textTransform: 'uppercase' }}>
                      🔄 Listener Interpretation
                    </div>
                    <TypewriterText
                      text={listenerInterp}
                      speed={20 + (1 / speed) * 20}
                      style={{ color: C.text }}
                    />
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          </div>

          {/* ── History Sidebar ─────────────────────────────── */}
          <div style={{
            width: 260, background: C.panel,
            borderLeft: `1px solid ${C.border}33`,
            display: 'flex', flexDirection: 'column', overflow: 'hidden',
          }}>
            <div style={{
              padding: '10px 12px', borderBottom: `1px solid ${C.border}33`,
              fontSize: 10, color: C.amber, letterSpacing: 2, fontWeight: 'bold',
            }}>
              ▶ HISTORY ({history.length})
            </div>
            <div ref={scrollRef} style={{ flex: 1, overflowY: 'auto', padding: 8 }}>
              {history.map((h, i) => (
                <motion.div
                  key={i}
                  initial={{ opacity: 0, x: 20 }}
                  animate={{ opacity: 1, x: 0 }}
                  style={{
                    padding: '8px 10px', marginBottom: 6, borderRadius: 6,
                    background: h.correct ? 'rgba(0,255,136,0.05)' : 'rgba(255,68,68,0.05)',
                    borderLeft: `3px solid ${h.correct ? C.green : C.red}`,
                    fontSize: 10,
                  }}
                >
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
                    <span style={{ color: C.cyan }}>EP {h._episode || i + 1}</span>
                    <span style={{ color: h.correct ? C.green : C.red }}>
                      {h.correct ? '✓' : '✗'}
                    </span>
                  </div>
                  <div style={{ display: 'flex', gap: 2, marginBottom: 4 }}>
                    {(Array.isArray(h.message) ? h.message : []).map((s, si) => (
                      <span key={si} style={{ color: C.amber, fontSize: 12 }}>
                        {typeof s === 'number' ? `S${s}` : s}
                      </span>
                    ))}
                  </div>
                  <div style={{ color: '#555', fontSize: 9 }}>
                    {featureToName(h.target_features)} → {featureToName(h.candidates_features?.[h.listener_choice])}
                  </div>
                </motion.div>
              ))}
              {history.length === 0 && (
                <div style={{ color: '#444', fontSize: 10, textAlign: 'center', padding: 20 }}>
                  Conversations will appear here...
                </div>
              )}
            </div>
          </div>
          </div>
        </div>
      )}

      {/* ── END SCREEN / SUMMARY ─────────────────────────── */}
      <AnimatePresence>
        {showSummary && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            style={{
              position: 'fixed', inset: 0, zIndex: 1000,
              background: 'rgba(10,10,26,0.95)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              backdropFilter: 'blur(8px)',
            }}
          >
            <motion.div
              initial={{ scale: 0.8, y: 30 }}
              animate={{ scale: 1, y: 0 }}
              transition={{ type: 'spring', damping: 15 }}
              className="retro-card"
              style={{
                background: C.panel, border: `2px solid ${C.green}`,
                borderRadius: 16, padding: '40px 60px', textAlign: 'center',
                maxWidth: 520, boxShadow: `0 0 40px ${C.green}22`,
              }}
            >
              <div style={{ fontSize: 48, marginBottom: 16 }}>🎉</div>
              <h2 style={{
                fontSize: 22, color: C.green, marginBottom: 8,
                textShadow: `0 0 12px ${C.green}66`, letterSpacing: 3,
                fontFamily: "'JetBrains Mono', monospace",
              }} className="section-header">
                DEMO COMPLETE
              </h2>
              <p style={{ color: C.muted, fontSize: 12, marginBottom: 24, letterSpacing: 1 }}>
                Training Session Summary
              </p>
              <div style={{
                display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 16, marginBottom: 20,
              }}>
                <SummaryCard label="Conversations" value={totalConvos} color={C.cyan} />
                <SummaryCard label="Accuracy" value={`${accuracy}%`} color={C.green} />
                <SummaryCard label="Unique Symbols" value={allSymbols.size} color={C.amber} />
              </div>
              <div style={{
                display: 'flex', gap: 16, justifyContent: 'center', marginBottom: 24,
              }}>
                <SummaryCard label="Correct" value={totalCorrect} color={C.green} />
                <SummaryCard label="Wrong" value={totalConvos - totalCorrect} color={C.red} />
              </div>
              {allSymbols.size > 0 && (
                <div style={{
                  padding: '10px 16px', borderRadius: 8,
                  background: 'rgba(0,221,255,0.06)', border: `1px solid ${C.cyan}33`,
                  fontSize: 11, color: C.text, marginBottom: 24, lineHeight: 1.6,
                }}>
                  <div style={{ color: C.cyan, fontWeight: 'bold', marginBottom: 4, letterSpacing: 1 }}>
                    LEARNED SYMBOLS:
                  </div>
                  <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap', justifyContent: 'center' }}>
                    {[...allSymbols].map((s, i) => (
                      <span key={i} style={{
                        padding: '2px 8px', borderRadius: 4,
                        background: 'rgba(255,170,0,0.1)', color: C.amber,
                        border: `1px solid ${C.amber}33`,
                      }}>
                        {typeof s === 'number' ? `S${s}` : s}
                      </span>
                    ))}
                  </div>
                </div>
              )}
              <div style={{ display: 'flex', gap: 12, justifyContent: 'center' }}>
                <button
                  onClick={reset}
                  style={{
                    padding: '10px 28px', borderRadius: 8,
                    background: 'rgba(0,255,136,0.1)',
                    border: `1px solid ${C.green}66`,
                    color: C.green, fontSize: 13, fontWeight: 'bold',
                    cursor: 'pointer', letterSpacing: 2,
                    fontFamily: "'JetBrains Mono', monospace",
                  }}
                >
                  ▶ REPLAY DEMO
                </button>
                <button
                  onClick={() => { setShowSummary(false); }}
                  style={{
                    padding: '10px 28px', borderRadius: 8,
                    background: 'transparent',
                    border: `1px solid ${C.muted}66`,
                    color: C.muted, fontSize: 13,
                    cursor: 'pointer', letterSpacing: 1,
                    fontFamily: "'JetBrains Mono', monospace",
                  }}
                >
                  VIEW HISTORY
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

// ─── Styles ────────────────────────────────────────────────────
const ctrlBtnStyle = {
  padding: '5px 12px', borderRadius: 6,
  background: 'transparent', border: '1px solid #333',
  color: '#888', fontSize: 11, cursor: 'pointer',
  fontFamily: "'JetBrains Mono', monospace",
  transition: 'all 0.2s', letterSpacing: 0.5,
};
