import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { API_URL, WS_URL } from '../config';

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
  // 8 distinct recognizable objects with varied features
  return [
    [0.0, 0.7, 0.9, 0.2, 0.0, 0.0, 0.9, 0.5], // Red circle
    [0.6, 0.6, 0.8, 0.8, 0.0, 1.0, 0.8, 0.4], // Blue square
    [0.3, 0.4, 0.5, 0.4, 0.5, 2.0, 0.7, 0.6], // Green triangle
    [0.8, 0.9, 1.0, 0.1, 0.0, 0.0, 0.5, 0.7], // Purple circle (big)
    [0.12, 0.3, 0.6, 1.0, 0.25, 1.0, 1.0, 0.3], // Orange square (small)
    [0.5, 0.5, 0.4, 0.6, 0.75, 0.0, 0.3, 0.8], // Teal circle (dim)
    [0.75, 0.8, 0.7, 0.3, 0.5, 2.0, 0.9, 0.5], // Pink triangle
    [0.9, 0.5, 1.0, 0.5, 0.0, 1.0, 0.6, 0.4], // Yellow square (bright)
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
    const correct = Math.random() < 0.6; // 60% correct rate

    // Listener selects: correct target or a wrong one
    let selectedIdx;
    if (correct) {
      selectedIdx = targetIdx;
    } else {
      do { selectedIdx = Math.floor(Math.random() * 8); } while (selectedIdx === targetIdx);
    }

    // Generate a message of 2-4 symbols
    const msgLen = 2 + Math.floor(Math.random() * 3);
    const message = [];
    for (let m = 0; m < msgLen; m++) {
      message.push(symbolPool[Math.floor(Math.random() * symbolPool.length)]);
    }

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

// ─── PIXEL ART CHARACTERS (CSS box-shadow sprites) ───

function PixelCharacter({ type, speaking, correct, wrong }) {
  const isBlue = type === 'speaker';
  
  // Color palette
  const skin = '#f8d0b0';
  const hair = isBlue ? '#4488ff' : '#ff4444';
  const hairDark = isBlue ? '#2266cc' : '#cc2222';
  const outfit = isBlue ? '#2244aa' : '#aa2222';
  const outfitLight = isBlue ? '#3366dd' : '#dd3333';
  const outfitDark = isBlue ? '#1a3388' : '#881a1a';
  const outline = '#222';
  const eyes = '#fff';
  const pupil = '#222';
  const boots = '#553322';
  const cape = isBlue ? '#1a2d66' : '#661a1a';
  const capeLight = isBlue ? '#2a3d88' : '#882a2a';
  const accent = isBlue ? '#ffcc00' : '#ff6600';
  
  const px = 4; // pixel size
  
  // 16x24 sprite grid (each pixel = 4px rendered)
  // Row 0-2: Hair top
  // Row 3-5: Face
  // Row 6-7: Neck/shoulders
  // Row 8-14: Body
  // Row 15-17: Belt/hips
  // Row 18-23: Legs/boots
  
  const pixels = useMemo(() => {
    const p = [];
    const _ = null; // transparent
    const H = hair, HD = hairDark, S = skin, O = outfit, OL = outfitLight, OD = outfitDark;
    const E = eyes, P = pupil, B = boots, C = cape, CL = capeLight, A = accent, OL2 = outline;
    
    // Row 0: Hair crown
    p.push([_,_,_,_,_,H,H,H,H,H,H,_,_,_,_,_]);
    // Row 1: Hair
    p.push([_,_,_,_,H,H,H,H,H,H,H,H,_,_,_,_]);
    // Row 2: Hair sides
    p.push([_,_,_,H,H,H,H,H,H,H,H,H,H,_,_,_]);
    // Row 3: Face top - eyes
    p.push([_,_,_,H,S,S,S,S,S,S,S,S,H,_,_,_]);
    // Row 4: Face - eyes
    p.push([_,_,_,H,S,E,P,S,S,E,P,S,H,_,_,_]);
    // Row 5: Face - mouth
    p.push([_,_,_,_,S,S,S,HD,S,S,S,S,_,_,_,_]);
    // Row 6: Neck
    p.push([_,_,_,_,_,S,S,S,S,S,S,_,_,_,_,_]);
    // Row 7: Shoulders + cape
    p.push([_,_,C,OL,OL,O,O,O,O,O,O,OL,CL,_,_,_]);
    // Row 8: Body upper
    p.push([_,_,C,OL,O,O,A,O,O,A,O,O,CL,_,_,_]);
    // Row 9: Body mid
    p.push([_,_,C,OL,O,O,O,O,O,O,O,O,CL,_,_,_]);
    // Row 10: Body mid
    p.push([_,_,C,OL,O,O,O,O,O,O,O,O,CL,_,_,_]);
    // Row 11: Body lower
    p.push([_,_,_,OL,O,O,OD,OD,OD,O,O,O,OL,_,_,_]);
    // Row 12: Belt
    p.push([_,_,_,_,O,A,A,A,A,A,A,O,_,_,_,_]);
    // Row 13: Hips
    p.push([_,_,_,_,O,O,OD,_,OD,O,O,_,_,_,_,_]);
    // Row 14: Upper legs
    p.push([_,_,_,_,O,O,OD,_,OD,O,O,_,_,_,_,_]);
    // Row 15: Legs
    p.push([_,_,_,_,O,O,_,_,_,O,O,_,_,_,_,_]);
    // Row 16: Lower legs
    p.push([_,_,_,_,O,O,_,_,_,O,O,_,_,_,_,_]);
    // Row 17: Boots top
    p.push([_,_,_,_,B,B,_,_,_,B,B,_,_,_,_,_]);
    // Row 18: Boots
    p.push([_,_,_,_,B,B,_,_,_,B,B,_,_,_,_,_]);
    // Row 19: Boot soles
    p.push([_,_,_,B,B,B,_,_,_,B,B,B,_,_,_,_]);
    
    return p;
  }, [type]);
  
  // Animation state
  const [frame, setFrame] = useState(0);
  useEffect(() => {
    if (!speaking) { setFrame(0); return; }
    const t = setInterval(() => setFrame(f => (f + 1) % 4), 150);
    return () => clearInterval(t);
  }, [speaking]);
  
  // Bounce offset when speaking
  const bounceY = speaking ? [0, -2, 0, -1][frame] : 0;
  // Shake when hit
  const shakeX = wrong ? [0, -3, 3, -2, 2, 0][Math.min(frame, 5)] : 0;
  
  return (
    <div style={{
      position: 'relative',
      width: 16 * px,
      height: 20 * px,
      transform: `translate(${shakeX}px, ${bounceY}px)`,
      transition: wrong ? 'none' : 'transform 0.1s',
      imageRendering: 'pixelated',
    }}>
      {pixels.map((row, y) =>
        row.map((color, x) =>
          color ? (
            <div
              key={`${y}-${x}`}
              style={{
                position: 'absolute',
                left: x * px,
                top: y * px,
                width: px,
                height: px,
                backgroundColor: color,
              }}
            />
          ) : null
        )
      )}
      {/* Glow effect */}
      {speaking && (
        <div style={{
          position: 'absolute',
          inset: -4,
          border: `2px solid ${isBlue ? '#4488ff' : '#ff4444'}`,
          borderRadius: 4,
          opacity: 0.6,
          animation: 'pulse 0.8s ease-in-out infinite',
        }} />
      )}
      {/* Correct flash */}
      {correct && (
        <div style={{
          position: 'absolute',
          inset: -6,
          background: 'rgba(0,255,136,0.3)',
          borderRadius: 4,
          animation: 'flash 0.3s ease-out',
        }} />
      )}
      {/* Wrong flash */}
      {wrong && (
        <div style={{
          position: 'absolute',
          inset: -6,
          background: 'rgba(255,68,68,0.3)',
          borderRadius: 4,
          animation: 'flash 0.3s ease-out',
        }} />
      )}
    </div>
  );
}

// ─── ANIMATED MESSAGE SPELL ───

function MessageSpell({ symbols, flying, onComplete }) {
  const [progress, setProgress] = useState(0);
  
  useEffect(() => {
    if (!flying) { setProgress(0); return; }
    const start = Date.now();
    const duration = 1200;
    const animate = () => {
      const elapsed = Date.now() - start;
      const p = Math.min(elapsed / duration, 1);
      setProgress(p);
      if (p < 1) requestAnimationFrame(animate);
      else onComplete?.();
    };
    requestAnimationFrame(animate);
  }, [flying]);
  
  if (!flying || !symbols?.length) return null;
  
  // Arc path from left to right
  const startX = 0;
  const endX = 100;
  const arcHeight = 40;
  
  return (
    <div style={{
      position: 'absolute',
      left: '25%',
      right: '25%',
      top: '30%',
      height: 80,
      pointerEvents: 'none',
      zIndex: 10,
    }}>
      {symbols.map((sym, i) => {
        const delay = i * 0.12;
        const p = Math.max(0, Math.min((progress - delay) / (1 - delay * symbols.length * 0.3), 1));
        const x = p * 100;
        const y = 50 - Math.sin(p * Math.PI) * arcHeight;
        const opacity = p < 0.1 ? p * 10 : p > 0.9 ? (1 - p) * 10 : 1;
        const scale = 0.5 + p * 0.5;
        
        return (
          <div
            key={i}
            style={{
              position: 'absolute',
              left: `${x}%`,
              top: y,
              transform: `translate(-50%, -50%) scale(${scale})`,
              opacity,
              fontSize: 18,
              fontFamily: "'Press Start 2P', monospace",
              color: '#ffcc00',
              textShadow: '0 0 8px rgba(255,204,0,0.8), 0 0 2px #000',
              transition: 'none',
            }}
          >
            {sym}
          </div>
        );
      })}
      {/* Trail particles */}
      {progress > 0.1 && progress < 0.95 && (
        <div style={{
          position: 'absolute',
          left: `${progress * 100}%`,
          top: 50 - Math.sin(progress * Math.PI) * arcHeight,
          width: 6,
          height: 6,
          borderRadius: '50%',
          background: '#ffcc00',
          boxShadow: '0 0 12px 4px rgba(255,204,0,0.6)',
          transform: 'translate(-50%, -50%)',
        }} />
      )}
    </div>
  );
}

// ─── HP BAR ───

function HPBar({ current, max, label, color }) {
  const pct = Math.max(0, Math.min(100, (current / max) * 100));
  return (
    <div style={{ width: '100%' }}>
      <div style={{
        display: 'flex',
        justifyContent: 'space-between',
        fontFamily: "'Press Start 2P', monospace",
        fontSize: 8,
        color: '#aaa',
        marginBottom: 3,
      }}>
        <span>{label}</span>
        <span>{current}/{max}</span>
      </div>
      <div style={{
        height: 10,
        background: '#1a1a2e',
        border: '2px solid #333',
        borderRadius: 2,
        overflow: 'hidden',
      }}>
        <div style={{
          width: `${pct}%`,
          height: '100%',
          background: pct > 50 ? color : pct > 25 ? '#ffaa00' : '#ff4444',
          transition: 'width 0.3s',
          boxShadow: `0 0 8px ${color}40`,
        }} />
      </div>
    </div>
  );
}

// ─── THINKING BUBBLE ───

function ThinkingBubble({ text, visible, color = '#4488ff' }) {
  if (!text || !visible) return null;
  const isBlue = color === '#4488ff';
  return (
    <div style={{
      position: 'absolute',
      top: -68,
      left: '50%',
      transform: 'translateX(-50%)',
      maxWidth: 200,
      padding: '8px 12px',
      background: isBlue ? 'rgba(68,136,255,0.12)' : 'rgba(255,170,0,0.12)',
      border: `1px solid ${color}50`,
      borderRadius: 12,
      fontFamily: "'JetBrains Mono', monospace",
      fontSize: 9,
      color: color,
      lineHeight: 1.4,
      whiteSpace: 'normal',
      wordBreak: 'break-word',
      textAlign: 'center',
      zIndex: 20,
      animation: 'bubbleAppear 0.5s ease-out forwards',
      pointerEvents: 'none',
      backdropFilter: 'blur(4px)',
    }}>
      💭 {text}
      <div style={{
        position: 'absolute',
        bottom: -6,
        left: '50%',
        transform: 'translateX(-50%)',
        width: 0,
        height: 0,
        borderLeft: '6px solid transparent',
        borderRight: '6px solid transparent',
        borderTop: `6px solid ${color}50`,
      }} />
    </div>
  );
}

// ─── EMOTION HUD ───

function EmotionHUD({ emotion }) {
  if (!emotion) return null;
  const { mood, emoji, color, energy } = emotion;
  return (
    <div style={{
      display: 'flex',
      alignItems: 'center',
      gap: 4,
      animation: 'emotionPulse 0.6s ease-out',
    }}>
      <span style={{ fontSize: 14, lineHeight: 1 }}>{emoji || '😐'}</span>
      <div>
        <div style={{
          fontFamily: "'Press Start 2P', monospace",
          fontSize: 6,
          color: color || '#888',
          textTransform: 'uppercase',
          letterSpacing: 1,
        }}>
          {mood || 'neutral'}
        </div>
        <div style={{
          width: 30,
          height: 3,
          background: '#222',
          borderRadius: 2,
          overflow: 'hidden',
          marginTop: 2,
        }}>
          <div style={{
            width: `${((energy || 0.5) * 100)}%`,
            height: '100%',
            background: color || '#888',
            transition: 'width 0.5s',
          }} />
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
      position: 'absolute',
      bottom: 80,
      left: '50%',
      transform: 'translateX(-50%)',
      width: 220,
      padding: 12,
      background: 'rgba(10,10,26,0.95)',
      border: `2px solid ${quality.color}80`,
      borderRadius: 8,
      zIndex: 25,
      animation: 'judgmentSlideIn 0.4s ease-out forwards',
      pointerEvents: 'none',
      backdropFilter: 'blur(8px)',
    }}>
      <div style={{
        fontFamily: "'Press Start 2P', monospace",
        fontSize: 8,
        color: quality.color,
        marginBottom: 6,
        textAlign: 'center',
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
        width: '100%',
        height: 6,
        background: '#1a1a2e',
        border: '1px solid #333',
        borderRadius: 3,
        overflow: 'hidden',
        marginBottom: 8,
      }}>
        <div style={{
          width: `${(score || 0) * 100}%`,
          height: '100%',
          background: `linear-gradient(90deg, ${quality.color}60, ${quality.color})`,
          transition: 'width 0.6s ease-out',
          boxShadow: `0 0 6px ${quality.color}40`,
        }} />
      </div>
      <div style={{
        fontFamily: "'JetBrains Mono', monospace",
        fontSize: 8,
        color: '#888',
        lineHeight: 1.3,
        textAlign: 'center',
        fontStyle: 'italic',
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
      fontFamily: "'Press Start 2P', monospace",
      fontSize: 6,
      color: color,
      background: `${color}15`,
      border: `1px solid ${color}30`,
      borderRadius: 3,
      padding: '2px 6px',
      textTransform: 'uppercase',
      letterSpacing: 1,
      opacity: 0.7,
    }}>
      ◆ {dominant}
    </div>
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
    <div style={{
      width: size,
      height: size,
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
    }}>
      <div style={{
        width: size * scale * 0.8,
        height: size * scale * 0.8,
        borderRadius,
        backgroundColor: `hsl(${hue}, ${saturation}%, ${lightness}%)`,
        opacity,
        border: `${Math.max(borderWidth, 2)}px solid ${borderColor || 'rgba(255,255,255,0.5)'}`,
        transform: `rotate(${rotation}deg)`,
        transition: 'all 0.3s',
        boxShadow: highlight ? `0 0 16px ${highlight}` : 'none',
      }} />
    </div>
  );
}

// ─── BATTLE LOG COMPONENT ───

function BattleLog({ battles }) {
  if (!battles || battles.length === 0) return null;
  
  return (
    <div style={{
      marginTop: 16,
      background: '#0a0a1a',
      border: '1px solid #333',
      borderRadius: 8,
      overflow: 'hidden',
    }}>
      <div style={{
        padding: '8px 12px',
        background: 'linear-gradient(90deg, #1a1a2e, #16213e)',
        borderBottom: '1px solid #333',
        display: 'flex',
        alignItems: 'center',
        gap: 8,
      }}>
        <span style={{
          fontFamily: "'Press Start 2P', monospace",
          fontSize: 9,
          color: '#ffaa00',
        }}>
          ⚔ BATTLE LOG
        </span>
        <span style={{
          fontFamily: "'JetBrains Mono', monospace",
          fontSize: 9,
          color: '#666',
        }}>
          Last {battles.length} rounds
        </span>
      </div>
      <div style={{ maxHeight: 280, overflowY: 'auto' }}>
        {battles.map((battle, i) => (
          <div key={battle.episode || i} style={{
            padding: '6px 12px',
            borderBottom: '1px solid #1a1a2e',
            display: 'flex',
            alignItems: 'center',
            gap: 12,
            background: i === 0 ? 'rgba(255,204,0,0.03)' : 'transparent',
            transition: 'background 0.3s',
          }}>
            {/* Episode # */}
            <span style={{
              fontFamily: "'Press Start 2P', monospace",
              fontSize: 8,
              color: '#666',
              minWidth: 50,
            }}>
              EP {battle.episode || '?'}
            </span>
            
            {/* Mini target object */}
            <div style={{
              width: 20,
              height: 20,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}>
              {battle.target_features && (
                <div style={{
                  width: 16,
                  height: 16,
                  borderRadius: Math.floor((battle.target_features[5] || 0) * 5) === 0 ? '50%' : Math.floor((battle.target_features[5] || 0) * 5) === 1 ? '0%' : '50% 0% 0% 50%',
                  backgroundColor: `hsl(${(battle.target_features[0] || 0) * 360}, ${30 + (battle.target_features[6] || 0.5) * 70}%, ${30 + (battle.target_features[7] || 0.5) * 40}%)`,
                  border: `2px solid ${battle.correct ? '#00ff88' : '#ff4444'}`,
                }} />
              )}
            </div>
            
            {/* Message symbols */}
            <div style={{ display: 'flex', gap: 2, flex: 1 }}>
              {battle.message?.slice(0, 4).map((sym, j) => (
                <span key={j} style={{
                  fontFamily: "'Press Start 2P', monospace",
                  fontSize: 8,
                  color: '#ffcc00',
                  opacity: 0.8,
                }}>
                  {sym}
                </span>
              ))}
              {battle.message?.length > 4 && (
                <span style={{ fontSize: 8, color: '#555' }}>+{battle.message.length - 4}</span>
              )}
            </div>
            
            {/* Result */}
            <span style={{
              fontFamily: "'Press Start 2P', monospace",
              fontSize: 8,
              color: battle.correct ? '#00ff88' : '#ff4444',
              minWidth: 20,
              textAlign: 'center',
            }}>
              {battle.correct ? '✓' : '✗'}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

// ─── MAIN ARENA ───

export default function CommunicationArena({ sessionId }) {
  const [conversations, setConversations] = useState([]);
  const [currentIdx, setCurrentIdx] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [flying, setFlying] = useState(false);
  const [showResult, setShowResult] = useState(null); // 'correct' | 'wrong' | null
  const [step, setStep] = useState('idle'); // idle | speaking | flying | listening | result
  const [isDemo, setIsDemo] = useState(!sessionId);
  const [liveMode, setLiveMode] = useState(false);
  const timerRef = useRef(null);
  const wsRef = useRef(null);
  const arenaEndRef = useRef(null);

  // Normalize a raw API conversation into our internal format
  const normalizeConversation = useCallback((c) => {
    // Determine message - could be speaker_message, speaker_msg, or message
    let message = c.speaker_message || c.speaker_msg || c.message || [];
    // If message is numeric IDs, display them as symbol IDs
    if (message.length > 0 && typeof message[0] === 'number') {
      // Keep as-is; the display code will render numeric IDs
    }

    // Determine correct from reward or explicit field
    const reward = c.reward ?? (c.correct ? 1 : 0);
    const correct = reward >= 1 || c.correct === true;

    // Determine selected features
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
      correct,
      reward,
      thought_before: c.thought_before || null,
      thought_after: c.thought_after || null,
      speaker_emotion: c.speaker_emotion || null,
      listener_emotion: c.listener_emotion || null,
      speaker_judgment: c.speaker_judgment || null,
      listener_judgment: c.listener_judgment || null,
      personality_traits: c.personality_traits || null,
    };
  }, []);

  // Fetch conversations (or load demo data)
  useEffect(() => {
    if (!sessionId) {
      // Demo mode: load synthetic data
      const demoData = generateDemoConversations();
      setConversations(demoData);
      setCurrentIdx(0);
      setIsDemo(true);
      return;
    }
    setIsDemo(false);
    fetch(`${API_URL}/sessions/${sessionId}/conversations?limit=50`)
      .then(r => r.json())
      .then(data => {
        const raw = Array.isArray(data) ? data : (data?.data || data?.conversations || []);
        const convs = raw.map(normalizeConversation);
        // Fall back to demo if API data lacks visual features
        const hasFeatures = convs.some(c => c.target_features && c.target_features.length > 0);
        if (convs.length === 0 || !hasFeatures) {
          const demoData = generateDemoConversations();
          setConversations(demoData);
          setCurrentIdx(0);
          setIsDemo(true);
        } else {
          setConversations(convs);
          if (convs.length > 0) setCurrentIdx(0);
        }
      })
      .catch(() => {
        // API failed, use demo data
        const demoData = generateDemoConversations();
        setConversations(demoData);
        setCurrentIdx(0);
        setIsDemo(true);
      });
  }, [sessionId, normalizeConversation]);

  // WebSocket for live updates - only when liveMode is on and sessionId exists
  useEffect(() => {
    if (!sessionId || !liveMode) {
      // Close existing connection if liveMode turned off
      if (wsRef.current) {
        wsRef.current.close();
        wsRef.current = null;
      }
      return;
    }
    try {
      const wsProto = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
      const wsHost = WS_URL || `${wsProto}//${window.location.host}`;
      const ws = new WebSocket(`${wsHost}/ws/${sessionId}`);
      ws.onopen = () => {
        console.log('[Arena] WebSocket connected for live mode');
      };
      ws.onmessage = (e) => {
        try {
          const msg = JSON.parse(e.data);
          if (msg.type === 'new_conversation') {
            const mapped = normalizeConversation(msg.data);
            setConversations(prev => {
              const next = [...prev, mapped].slice(-100);
              return next;
            });
            // Auto-advance to latest in live mode
            setCurrentIdx(prev => prev + 1);
          }
        } catch (err) {
          console.warn('[Arena] WS parse error:', err);
        }
      };
      ws.onerror = (err) => {
        console.warn('[Arena] WebSocket error:', err);
      };
      ws.onclose = () => {
        console.log('[Arena] WebSocket closed');
      };
      wsRef.current = ws;
      return () => ws.close();
    } catch (err) {
      console.warn('[Arena] WebSocket connect failed:', err);
    }
  }, [sessionId, liveMode, normalizeConversation]);

  // Auto-scroll to latest battle in live mode
  useEffect(() => {
    if (liveMode && arenaEndRef.current) {
      arenaEndRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, [currentIdx, liveMode]);

  const current = conversations[currentIdx];

  // Auto-play
  useEffect(() => {
    if (!playing) { clearInterval(timerRef.current); return; }
    timerRef.current = setInterval(() => {
      setCurrentIdx(prev => {
        if (prev >= conversations.length - 1) {
          setPlaying(false);
          return prev;
        }
        return prev + 1;
      });
      // Trigger animation sequence
      setStep('speaking');
      setTimeout(() => setStep('flying'), 500);
      setTimeout(() => setStep('listening'), 1500);
      setTimeout(() => setStep('result'), 2000);
      setTimeout(() => { setShowResult(null); setStep('idle'); }, 2800);
    }, 3000);
    return () => clearInterval(timerRef.current);
  }, [playing, conversations.length]);

  // Step through single conversation when index changes
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

  // Compute scores
  const correctCount = conversations.filter(c => c.correct).length;
  const totalCount = conversations.length;
  const accuracy = totalCount > 0 ? Math.round(correctCount / totalCount * 100) : 0;

  // Battle history: last 10 conversations
  const battleHistory = useMemo(() => {
    return conversations.slice(-10).reverse();
  }, [conversations]);

  // Format message for display (handles both symbol strings and numeric IDs)
  const formatMessage = useCallback((msg) => {
    if (!msg || msg.length === 0) return [];
    return msg.map(s => {
      if (typeof s === 'number') return `#${s}`;
      return String(s);
    });
  }, []);

  return (
    <div style={{ padding: 24, maxWidth: 900, margin: '0 auto' }}>
      {/* CRT Header */}
      <div style={{
        background: 'linear-gradient(135deg, #1a1a2e 0%, #16213e 100%)',
        border: '2px solid #00ff88',
        borderRadius: 8,
        padding: '16px 20px',
        marginBottom: 20,
        position: 'relative',
        overflow: 'hidden',
      }}>
        <div style={{
          position: 'absolute',
          inset: 0,
          background: 'repeating-linear-gradient(0deg, transparent, transparent 2px, rgba(0,255,136,0.03) 2px, rgba(0,255,136,0.03) 4px)',
          pointerEvents: 'none',
        }} />
        <h2 style={{
          fontFamily: "'Press Start 2P', monospace",
          fontSize: 14,
          color: '#00ff88',
          margin: 0,
          textShadow: '0 0 10px rgba(0,255,136,0.5)',
        }}>
          ◆ COMMUNICATION ARENA
        </h2>
        {isDemo && (
          <span style={{
            position: 'absolute',
            top: 12,
            right: 16,
            fontFamily: "'Press Start 2P', monospace",
            fontSize: 8,
            color: '#ffaa00',
            background: 'rgba(255,170,0,0.15)',
            border: '1px solid rgba(255,170,0,0.4)',
            borderRadius: 4,
            padding: '3px 8px',
            letterSpacing: 2,
            animation: 'pulse 2s ease-in-out infinite',
          }}>
            DEMO
          </span>
        )}
        {/* LIVE badge */}
        {liveMode && !isDemo && (
          <span style={{
            position: 'absolute',
            top: 12,
            right: isDemo ? 80 : 16,
            fontFamily: "'Press Start 2P', monospace",
            fontSize: 8,
            color: '#ff4444',
            background: 'rgba(255,68,68,0.15)',
            border: '1px solid rgba(255,68,68,0.5)',
            borderRadius: 4,
            padding: '3px 8px',
            letterSpacing: 2,
            display: 'flex',
            alignItems: 'center',
            gap: 6,
          }}>
            <span style={{
              display: 'inline-block',
              width: 6,
              height: 6,
              borderRadius: '50%',
              background: '#ff4444',
              animation: 'livePulse 1s ease-in-out infinite',
              boxShadow: '0 0 6px #ff4444',
            }} />
            LIVE
          </span>
        )}
        <p style={{
          fontFamily: "'JetBrains Mono', monospace",
          fontSize: 11,
          color: '#666',
          margin: '6px 0 0',
        }}>
          Watch agents battle with symbols{isDemo ? ' (demo data)' : liveMode ? ' (live session)' : ''}
        </p>
      </div>

      {/* Controls */}
      <div style={{
        display: 'flex',
        gap: 8,
        marginBottom: 16,
        alignItems: 'center',
        flexWrap: 'wrap',
      }}>
        <button
          onClick={() => setPlaying(!playing)}
          disabled={conversations.length === 0 || liveMode}
          style={{
            fontFamily: "'Press Start 2P', monospace",
            fontSize: 10,
            padding: '8px 16px',
            background: playing ? '#ff4444' : '#00ff88',
            color: '#000',
            border: 'none',
            borderRadius: 4,
            cursor: 'pointer',
            opacity: (conversations.length === 0 || liveMode) ? 0.3 : 1,
          }}
        >
          {playing ? '■ STOP' : '▶ AUTO'}
        </button>
        <button
          onClick={() => { setCurrentIdx(Math.max(0, currentIdx - 1)); }}
          disabled={currentIdx <= 0 || liveMode}
          style={{
            fontFamily: "'Press Start 2P', monospace",
            fontSize: 10,
            padding: '8px 12px',
            background: '#1a1a2e',
            color: '#ffaa00',
            border: '1px solid #ffaa00',
            borderRadius: 4,
            cursor: 'pointer',
            opacity: (currentIdx <= 0 || liveMode) ? 0.3 : 1,
          }}
        >
          ◀
        </button>
        <span style={{
          fontFamily: "'Press Start 2P', monospace",
          fontSize: 10,
          color: '#00ddff',
          minWidth: 80,
          textAlign: 'center',
        }}>
          {currentIdx + 1}/{conversations.length || 0}
        </span>
        <button
          onClick={() => { setCurrentIdx(Math.min(conversations.length - 1, currentIdx + 1)); }}
          disabled={currentIdx >= conversations.length - 1 || liveMode}
          style={{
            fontFamily: "'Press Start 2P', monospace",
            fontSize: 10,
            padding: '8px 12px',
            background: '#1a1a2e',
            color: '#ffaa00',
            border: '1px solid #ffaa00',
            borderRadius: 4,
            cursor: 'pointer',
            opacity: (currentIdx >= conversations.length - 1 || liveMode) ? 0.3 : 1,
          }}
        >
          ▶
        </button>
        <button
          onClick={handleStep}
          disabled={step !== 'idle' || !current || liveMode}
          style={{
            fontFamily: "'Press Start 2P', monospace",
            fontSize: 10,
            padding: '8px 16px',
            background: step !== 'idle' ? '#333' : '#ffaa00',
            color: '#000',
            border: 'none',
            borderRadius: 4,
            cursor: 'pointer',
            opacity: (step !== 'idle' || liveMode) ? 0.3 : 1,
          }}
        >
          ⚡ STEP
        </button>
        
        {/* LIVE toggle button */}
        {!isDemo && sessionId && (
          <button
            onClick={() => setLiveMode(!liveMode)}
            style={{
              fontFamily: "'Press Start 2P', monospace",
              fontSize: 10,
              padding: '8px 16px',
              background: liveMode ? '#ff4444' : '#1a1a2e',
              color: liveMode ? '#fff' : '#ff4444',
              border: `1px solid ${liveMode ? '#ff4444' : '#ff444480'}`,
              borderRadius: 4,
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: 6,
            }}
          >
            {liveMode && (
              <span style={{
                display: 'inline-block',
                width: 6,
                height: 6,
                borderRadius: '50%',
                background: '#fff',
                animation: 'livePulse 1s ease-in-out infinite',
              }} />
            )}
            {liveMode ? '■ STOP LIVE' : '● LIVE'}
          </button>
        )}
        
        <div style={{
          marginLeft: 'auto',
          display: 'flex',
          gap: 12,
          alignItems: 'center',
        }}>
          <HPBar current={correctCount} max={totalCount || 1} label="ACCURACY" color="#00ff88" />
          <span style={{
            fontFamily: "'Press Start 2P', monospace",
            fontSize: 12,
            color: accuracy >= 70 ? '#00ff88' : accuracy >= 40 ? '#ffaa00' : '#ff4444',
          }}>
            {accuracy}%
          </span>
        </div>
      </div>

      {/* ─── THE ARENA ─── */}
      <div style={{
        position: 'relative',
        background: 'linear-gradient(180deg, #0a0a1a 0%, #1a0a2e 50%, #0a0a1a 100%)',
        border: '2px solid #333',
        borderRadius: 12,
        padding: '40px 24px',
        minHeight: 380,
        overflow: 'hidden',
      }}>
        {/* Grid floor effect */}
        <div style={{
          position: 'absolute',
          bottom: 0,
          left: 0,
          right: 0,
          height: 120,
          background: 'linear-gradient(180deg, transparent, rgba(0,255,136,0.05))',
          backgroundImage: `
            linear-gradient(rgba(0,255,136,0.08) 1px, transparent 1px),
            linear-gradient(90deg, rgba(0,255,136,0.08) 1px, transparent 1px)
          `,
          backgroundSize: '20px 20px',
          transform: 'perspective(200px) rotateX(30deg)',
          transformOrigin: 'bottom',
        }} />

        {/* Stars background */}
        {Array.from({ length: 20 }, (_, i) => (
          <div key={i} style={{
            position: 'absolute',
            left: `${Math.random() * 100}%`,
            top: `${Math.random() * 60}%`,
            width: 2,
            height: 2,
            borderRadius: '50%',
            background: '#fff',
            opacity: 0.3 + Math.random() * 0.4,
            animation: `twinkle ${1 + Math.random() * 2}s ease-in-out infinite`,
            animationDelay: `${Math.random() * 2}s`,
          }} />
        ))}

        {/* ── SPEAKER SIDE ── */}
        <div style={{
          position: 'absolute',
          left: 40,
          top: '50%',
          transform: 'translateY(-50%)',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          gap: 12,
          zIndex: 5,
        }}>
          {/* Name plate + Emotion HUD */}
          <div style={{
            display: 'flex',
            alignItems: 'center',
            gap: 8,
          }}>
            <div style={{
              fontFamily: "'Press Start 2P', monospace",
              fontSize: 10,
              color: '#4488ff',
              textShadow: '0 0 8px rgba(68,136,255,0.5)',
              textAlign: 'center',
            }}>
              SPEAKER
            </div>
            <EmotionHUD emotion={current?.speaker_emotion} />
          </div>

          {/* Character */}
          <div style={{ position: 'relative' }}>
            <ThinkingBubble
              text={current?.thought_before}
              visible={step === 'speaking'}
              color="#4488ff"
            />
            <PixelCharacter
              type="speaker"
              speaking={step === 'speaking' || step === 'flying'}
              correct={showResult === 'correct'}
              wrong={showResult === 'wrong'}
            />
            {/* Speech indicator */}
            {step === 'speaking' && (
              <div style={{
                position: 'absolute',
                top: -20,
                left: '50%',
                transform: 'translateX(-50%)',
                fontFamily: "'Press Start 2P', monospace",
                fontSize: 8,
                color: '#ffcc00',
                whiteSpace: 'nowrap',
                animation: 'float 0.5s ease-out',
              }}>
                ● ● ●
              </div>
            )}
          </div>

          {/* Personality Badge */}
          <PersonalityBadge traits={current?.personality_traits?.speaker} color="#00ddff" />

          {/* Target Object with green border when correct */}
          <div style={{
            background: 'rgba(0,0,0,0.6)',
            border: `2px solid ${showResult === 'correct' ? '#00ff88' : showResult === 'wrong' ? '#00ff88' : '#4488ff'}`,
            borderRadius: 8,
            padding: 8,
            textAlign: 'center',
            transition: 'border-color 0.3s',
          }}>
            <div style={{
              fontFamily: "'Press Start 2P', monospace",
              fontSize: 7,
              color: '#4488ff',
              marginBottom: 4,
            }}>
              TARGET
            </div>
            <ObjectVisual
              features={current?.target_features}
              highlight={step === 'speaking' ? '#4488ff' : null}
              size={50}
              borderColor={showResult ? '#00ff88' : undefined}
            />
          </div>
        </div>

        {/* ── MESSAGE SPELL (flying symbols) ── */}
        <MessageSpell
          symbols={formatMessage(current?.message)}
          flying={step === 'flying'}
          onComplete={() => {}}
        />

        {/* Center VS / Result indicator */}
        <div style={{
          position: 'absolute',
          left: '50%',
          top: '50%',
          transform: 'translate(-50%, -50%)',
          zIndex: 15,
        }}>
          {showResult === 'correct' && (
            <div style={{
              fontFamily: "'Press Start 2P', monospace",
              fontSize: 16,
              color: '#00ff88',
              textShadow: '0 0 20px rgba(0,255,136,0.8)',
              animation: 'scaleIn 0.3s ease-out',
              textAlign: 'center',
            }}>
              HIT!<br/>
              <span style={{ fontSize: 8, color: '#888' }}>+10 XP</span>
            </div>
          )}
          {showResult === 'wrong' && (
            <div style={{
              fontFamily: "'Press Start 2P', monospace",
              fontSize: 16,
              color: '#ff4444',
              textShadow: '0 0 20px rgba(255,68,68,0.8)',
              animation: 'scaleIn 0.3s ease-out',
              textAlign: 'center',
            }}>
              MISS!<br/>
              <span style={{ fontSize: 8, color: '#888' }}>-5 HP</span>
            </div>
          )}
          {!showResult && (
            <div style={{
              fontFamily: "'Press Start 2P', monospace",
              fontSize: 20,
              color: '#333',
            }}>
              VS
            </div>
          )}
        </div>

        {/* Judgment Popup — shows on wrong answers */}
        <JudgmentPopup
          judgment={current?.speaker_judgment}
          visible={step === 'result' && showResult === 'wrong'}
        />

        {/* ── LISTENER SIDE ── */}
        <div style={{
          position: 'absolute',
          right: 40,
          top: '50%',
          transform: 'translateY(-50%)',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          gap: 12,
          zIndex: 5,
        }}>
          {/* Name plate + Emotion HUD */}
          <div style={{
            display: 'flex',
            alignItems: 'center',
            gap: 8,
          }}>
            <div style={{
              fontFamily: "'Press Start 2P', monospace",
              fontSize: 10,
              color: '#ff4444',
              textShadow: '0 0 8px rgba(255,68,68,0.5)',
              textAlign: 'center',
            }}>
              LISTENER
            </div>
            <EmotionHUD emotion={current?.listener_emotion} />
          </div>

          {/* Character */}
          <div style={{ position: 'relative' }}>
            <ThinkingBubble
              text={current?.thought_after}
              visible={step === 'result'}
              color="#ffaa00"
            />
            <PixelCharacter
              type="listener"
              speaking={step === 'listening'}
              correct={showResult === 'correct'}
              wrong={showResult === 'wrong'}
            />
            {/* Listening indicator */}
            {step === 'listening' && (
              <div style={{
                position: 'absolute',
                top: -20,
                left: '50%',
                transform: 'translateX(-50%)',
                fontFamily: "'Press Start 2P', monospace",
                fontSize: 8,
                color: '#00ddff',
                whiteSpace: 'nowrap',
              }}>
                ♪ ♪ ♪
              </div>
            )}
          </div>

          {/* Personality Badge */}
          <PersonalityBadge traits={current?.personality_traits?.listener} color="#ff4444" />

          {/* Selected Object with green/red border based on correctness */}
          <div style={{
            background: 'rgba(0,0,0,0.6)',
            border: `2px solid ${showResult === 'correct' ? '#00ff88' : showResult === 'wrong' ? '#ff4444' : '#ff4444'}`,
            borderRadius: 8,
            padding: 8,
            textAlign: 'center',
            transition: 'border-color 0.3s',
          }}>
            <div style={{
              fontFamily: "'Press Start 2P', monospace",
              fontSize: 7,
              color: '#ff4444',
              marginBottom: 4,
            }}>
              SELECTED
            </div>
            <ObjectVisual
              features={current?.selected_features}
              highlight={showResult === 'correct' ? '#00ff88' : showResult === 'wrong' ? '#ff4444' : null}
              size={50}
              borderColor={showResult === 'correct' ? '#00ff88' : showResult === 'wrong' ? '#ff4444' : undefined}
            />
          </div>
        </div>

        {/* ── CANDIDATES BAR (bottom) ── */}
        <div style={{
          position: 'absolute',
          bottom: 12,
          left: 20,
          right: 20,
          display: 'flex',
          gap: 6,
          justifyContent: 'center',
          zIndex: 5,
        }}>
          {current?.candidate_features?.slice(0, 10).map((feat, i) => {
            const isTarget = i === current.target_index;
            const isSelected = i === current.selected_index;
            return (
              <div key={i} style={{
                padding: 4,
                borderRadius: 6,
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
        
        {/* Scroll anchor for live mode */}
        <div ref={arenaEndRef} />
      </div>

      {/* Message Display */}
      {current && (
        <div style={{
          marginTop: 16,
          background: '#111',
          border: '1px solid #333',
          borderRadius: 8,
          padding: '12px 16px',
          display: 'flex',
          alignItems: 'center',
          gap: 16,
        }}>
          <div style={{
            fontFamily: "'Press Start 2P', monospace",
            fontSize: 8,
            color: '#666',
          }}>
            MESSAGE
          </div>
          <div style={{ display: 'flex', gap: 6 }}>
            {formatMessage(current.message).map((sym, i) => (
              <span key={i} style={{
                fontFamily: "'Press Start 2P', monospace",
                fontSize: 16,
                color: '#ffcc00',
                background: 'rgba(255,204,0,0.1)',
                padding: '4px 8px',
                borderRadius: 4,
                border: '1px solid rgba(255,204,0,0.3)',
              }}>
                {sym}
              </span>
            ))}
          </div>
          <div style={{
            marginLeft: 'auto',
            fontFamily: "'Press Start 2P', monospace",
            fontSize: 10,
            color: current.correct ? '#00ff88' : '#ff4444',
          }}>
            {current.correct ? '✓ CORRECT' : '✗ WRONG'}
          </div>
        </div>
      )}

      {/* Battle History Log */}
      <BattleLog battles={battleHistory} />

      {/* Feature Legend */}
      <div style={{
        marginTop: 12,
        display: 'flex',
        flexWrap: 'wrap',
        gap: 8,
        justifyContent: 'center',
      }}>
        {FEATURES.map(f => (
          <div key={f.name} style={{
            fontFamily: "'JetBrains Mono', monospace",
            fontSize: 9,
            color: '#666',
            background: '#111',
            padding: '3px 8px',
            borderRadius: 4,
            border: '1px solid #222',
          }}>
            {f.icon} {f.label}
          </div>
        ))}
      </div>

      {/* CSS Animations */}
      <style>{`
        @keyframes pulse {
          0%, 100% { opacity: 0.4; }
          50% { opacity: 0.8; }
        }
        @keyframes flash {
          0% { opacity: 1; }
          100% { opacity: 0; }
        }
        @keyframes float {
          0% { transform: translateX(-50%) translateY(0); opacity: 1; }
          100% { transform: translateX(-50%) translateY(-10px); opacity: 0.5; }
        }
        @keyframes scaleIn {
          0% { transform: translate(-50%, -50%) scale(0.5); opacity: 0; }
          100% { transform: translate(-50%, -50%) scale(1); opacity: 1; }
        }
        @keyframes twinkle {
          0%, 100% { opacity: 0.2; }
          50% { opacity: 0.8; }
        }
        @keyframes bubbleAppear {
          0% { opacity: 0; transform: translateX(-50%) translateY(8px) scale(0.8); }
          100% { opacity: 1; transform: translateX(-50%) translateY(0) scale(1); }
        }
        @keyframes emotionPulse {
          0% { transform: scale(1); }
          50% { transform: scale(1.2); }
          100% { transform: scale(1); }
        }
        @keyframes judgmentSlideIn {
          0% { opacity: 0; transform: translateX(-50%) translateY(20px) scale(0.9); }
          100% { opacity: 1; transform: translateX(-50%) translateY(0) scale(1); }
        }
        @keyframes livePulse {
          0%, 100% { opacity: 1; transform: scale(1); }
          50% { opacity: 0.3; transform: scale(0.7); }
        }
      `}</style>
    </div>
  );
}
