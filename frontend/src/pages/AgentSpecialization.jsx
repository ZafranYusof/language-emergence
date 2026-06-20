import React, { useState, useEffect, useRef, useMemo } from 'react';
import { ensureSprites, drawSprite, drawSpeechBubble, drawBar, ParticleSystem, C as PC, SPRITE_NAMES } from '../utils/pixelEngine';

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
  pink: '#ff66aa',
};

/* ───── keyframes ───── */
const styleId = 'agent-spec-keyframes';
if (typeof document !== 'undefined' && !document.getElementById(styleId)) {
  const el = document.createElement('style');
  el.id = styleId;
  el.textContent = `
    @keyframes as-fadeIn { from{opacity:0;transform:translateY(10px)} to{opacity:1;transform:translateY(0)} }
    @keyframes as-pulse { 0%,100%{transform:scale(1)} 50%{transform:scale(1.08)} }
    @keyframes as-glow { 0%,100%{filter:drop-shadow(0 0 3px var(--glow))} 50%{filter:drop-shadow(0 0 12px var(--glow))} }
    @keyframes as-bar-fill { from{width:0} }
    @keyframes as-blink { 0%,100%{opacity:1} 50%{opacity:0.3} }
    @keyframes as-skill-unlock {
      0% { transform: scale(0.5); opacity: 0; filter: brightness(2); }
      50% { transform: scale(1.2); opacity: 1; filter: brightness(1.5); }
      100% { transform: scale(1); opacity: 1; filter: brightness(1); }
    }
    @keyframes as-ring-pulse {
      0% { r: 4; opacity: 0.8; }
      50% { r: 8; opacity: 0.3; }
      100% { r: 12; opacity: 0; }
    }
  `;
  document.head.appendChild(el);
}

const clamp01 = (v) => Math.max(0, Math.min(1, v || 0));

/* ───── Synthetic Agent Specialization Data ───── */
function generateAgentData() {
  return [
    {
      id: 'agent-0',
      name: 'NOVA',
      role: 'Color Expert',
      icon: '🎨',
      color: C.cyan,
      specialization: 'color',
      level: 14,
      xp: 0.78,
      personality: { creativity: 0.85, precision: 0.65, patience: 0.55, curiosity: 0.9, sociability: 0.7 },
      skills: [
        { name: 'RED_DETECTION', level: 5, maxLevel: 5, unlocked: true, color: '#ff4444' },
        { name: 'BLUE_MAPPING', level: 4, maxLevel: 5, unlocked: true, color: '#4488ff' },
        { name: 'GREEN_IDENTIFY', level: 4, maxLevel: 5, unlocked: true, color: '#44ff88' },
        { name: 'COLOR_BLEND', level: 3, maxLevel: 5, unlocked: true, color: '#ffaa00' },
        { name: 'HUE_SHIFT', level: 2, maxLevel: 5, unlocked: true, color: '#aa66ff' },
        { name: 'SPECTRAL_SCAN', level: 1, maxLevel: 5, unlocked: false, color: '#ff66aa' },
        { name: 'CHROMATIC_LINK', level: 0, maxLevel: 5, unlocked: false, color: '#00ddff' },
      ],
      metrics: { accuracy: 0.91, efficiency: 0.73, adaptability: 0.68, teaching: 0.52 },
      badgeCount: 8,
      history: [
        { epoch: 0, skill: 0.15 }, { epoch: 10, skill: 0.35 }, { epoch: 20, skill: 0.55 },
        { epoch: 30, skill: 0.72 }, { epoch: 40, skill: 0.82 }, { epoch: 50, skill: 0.88 },
      ],
    },
    {
      id: 'agent-1',
      name: 'PRISM',
      role: 'Shape Expert',
      icon: '🔷',
      color: C.amber,
      specialization: 'shape',
      level: 12,
      xp: 0.55,
      personality: { creativity: 0.5, precision: 0.92, patience: 0.8, curiosity: 0.6, sociability: 0.55 },
      skills: [
        { name: 'TRIANGLE_PARSE', level: 5, maxLevel: 5, unlocked: true, color: '#ffaa00' },
        { name: 'CIRCLE_RECOGNIZE', level: 4, maxLevel: 5, unlocked: true, color: '#00ddff' },
        { name: 'SQUARE_DETECT', level: 4, maxLevel: 5, unlocked: true, color: '#00ff88' },
        { name: 'EDGE_ANALYSIS', level: 3, maxLevel: 5, unlocked: true, color: '#ff66aa' },
        { name: 'SHAPE_COMPOSE', level: 2, maxLevel: 5, unlocked: true, color: '#aa66ff' },
        { name: 'PATTERN_MATCH', level: 1, maxLevel: 5, unlocked: false, color: '#ff4444' },
        { name: 'GEOM_REASONING', level: 0, maxLevel: 5, unlocked: false, color: '#ffaa00' },
      ],
      metrics: { accuracy: 0.88, efficiency: 0.85, adaptability: 0.52, teaching: 0.61 },
      badgeCount: 6,
      history: [
        { epoch: 0, skill: 0.1 }, { epoch: 10, skill: 0.28 }, { epoch: 20, skill: 0.5 },
        { epoch: 30, skill: 0.65 }, { epoch: 40, skill: 0.78 }, { epoch: 50, skill: 0.83 },
      ],
    },
    {
      id: 'agent-2',
      name: 'ECHO',
      role: 'Pattern Expert',
      icon: '🔮',
      color: C.purple,
      specialization: 'pattern',
      level: 10,
      xp: 0.32,
      personality: { creativity: 0.7, precision: 0.75, patience: 0.88, curiosity: 0.82, sociability: 0.45 },
      skills: [
        { name: 'SEQ_MEMORY', level: 4, maxLevel: 5, unlocked: true, color: '#aa66ff' },
        { name: 'REP_DETECT', level: 3, maxLevel: 5, unlocked: true, color: '#00ff88' },
        { name: 'TREND_ANALYSIS', level: 3, maxLevel: 5, unlocked: true, color: '#ffaa00' },
        { name: 'ANOMALY_SPOT', level: 2, maxLevel: 5, unlocked: true, color: '#ff4444' },
        { name: 'RHYTHM_PARSE', level: 1, maxLevel: 5, unlocked: true, color: '#00ddff' },
        { name: 'COMPLEX_PATTERN', level: 0, maxLevel: 5, unlocked: false, color: '#ff66aa' },
        { name: 'META_SEQUENCE', level: 0, maxLevel: 5, unlocked: false, color: '#aa66ff' },
      ],
      metrics: { accuracy: 0.72, efficiency: 0.68, adaptability: 0.85, teaching: 0.77 },
      badgeCount: 5,
      history: [
        { epoch: 0, skill: 0.08 }, { epoch: 10, skill: 0.2 }, { epoch: 20, skill: 0.38 },
        { epoch: 30, skill: 0.55 }, { epoch: 40, skill: 0.67 }, { epoch: 50, skill: 0.72 },
      ],
    },
  ];
}

/* ───── Radar Chart ───── */
function RadarChart({ data, size = 200, color, label }) {
  const traits = Object.keys(data);
  const cx = size / 2, cy = size / 2, r = size / 2 - 28;
  const angleStep = (2 * Math.PI) / traits.length;
  const startAngle = -Math.PI / 2;

  const getPoint = (i, val) => {
    const angle = startAngle + i * angleStep;
    return [cx + r * val * Math.cos(angle), cy + r * val * Math.sin(angle)];
  };

  const gridLevels = [0.25, 0.5, 0.75, 1.0];
  const dataPoints = traits.map((t, i) => getPoint(i, clamp01(data[t])));
  const dataPath = dataPoints.map((p, i) => `${i === 0 ? 'M' : 'L'}${p[0]},${p[1]}`).join(' ') + 'Z';

  return (
    <div style={{ textAlign: 'center' }}>
      {label && (
        <div style={{ fontSize: 8, color: C.dim, letterSpacing: 1.5, marginBottom: 6 }}>
          {label}
        </div>
      )}
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
        {/* Grid rings */}
        {gridLevels.map((lev, li) => (
          <polygon key={li}
            points={traits.map((_, i) => getPoint(i, lev).join(',')).join(' ')}
            fill="none" stroke={`${C.dim}22`} strokeWidth={0.5}
          />
        ))}
        {/* Axes */}
        {traits.map((_, i) => (
          <line key={i}
            x1={cx} y1={cy} x2={getPoint(i, 1)[0]} y2={getPoint(i, 1)[1]}
            stroke={`${C.dim}22`} strokeWidth={0.5}
          />
        ))}
        {/* Data area */}
        <polygon
          points={dataPath}
          fill={`${color}18`}
          stroke={color}
          strokeWidth={1.5}
          style={{ filter: `drop-shadow(0 0 4px ${color}66)` }}
        />
        {/* Data points */}
        {dataPoints.map((p, i) => (
          <circle key={i} cx={p[0]} cy={p[1]} r={3} fill={color}
            style={{ '--glow': color, animation: 'as-pulse 2s ease-in-out infinite', animationDelay: `${i * 0.2}s` }}
          />
        ))}
        {/* Labels */}
        {traits.map((trait, i) => {
          const lp = getPoint(i, 1.2);
          return (
            <text key={i} x={lp[0]} y={lp[1]} fill={C.dim} fontSize={7}
              fontFamily="JetBrains Mono" textAnchor="middle" dominantBaseline="middle"
              style={{ textTransform: 'uppercase', letterSpacing: 0.5 }}>
              {trait.slice(0, 5)}
            </text>
          );
        })}
        {/* Center dot */}
        <circle cx={cx} cy={cy} r={2} fill={`${C.dim}44`} />
      </svg>
    </div>
  );
}

/* ───── Skill Tree Node ───── */
function SkillNode({ skill, index, agentColor }) {
  const isLocked = !skill.unlocked;
  const isMaxed = skill.level >= skill.maxLevel;

  return (
    <div style={{
      display: 'flex', alignItems: 'center', gap: 10,
      padding: '8px 12px',
      background: isLocked ? `${C.bg}88` : `${C.panel}`,
      border: `1px solid ${isLocked ? `${C.dim}22` : `${skill.color}33`}`,
      borderRadius: 8,
      opacity: isLocked ? 0.45 : 1,
      animation: skill.unlocked && skill.level > 0
        ? `as-fadeIn 0.4s ease-out ${index * 0.08}s both`
        : 'none',
      transition: 'all 0.3s',
    }}>
      {/* Skill icon */}
      <div style={{
        width: 32, height: 32, borderRadius: 6,
        background: isLocked ? `${C.dim}22` : `${skill.color}22`,
        border: `1px solid ${isLocked ? `${C.dim}33` : `${skill.color}44`}`,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        fontSize: 14, flexShrink: 0,
        filter: isLocked ? 'grayscale(1)' : 'none',
        '--glow': skill.color,
        animation: isMaxed ? 'as-glow 2s ease-in-out infinite' : 'none',
      }}>
        {isLocked ? '🔒' : isMaxed ? '⭐' : '◈'}
      </div>

      {/* Skill info */}
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{
          display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4,
        }}>
          <span style={{
            fontSize: 9, color: isLocked ? C.dim : skill.color,
            fontFamily: 'JetBrains Mono', fontWeight: isMaxed ? 'bold' : 'normal',
            letterSpacing: 0.5,
          }}>
            {skill.name}
          </span>
          <span style={{ fontSize: 8, color: C.dim }}>
            LV {skill.level}/{skill.maxLevel}
          </span>
        </div>

        {/* Level bar */}
        <div style={{ height: 3, background: `${C.dim}33`, borderRadius: 2, overflow: 'hidden' }}>
          <div style={{
            height: '100%',
            width: `${(skill.level / skill.maxLevel) * 100}%`,
            background: `linear-gradient(90deg, ${skill.color}, ${skill.color}88)`,
            borderRadius: 2,
            animation: 'as-bar-fill 0.8s ease-out',
          }} />
        </div>
      </div>

      {/* Status badge */}
      {isMaxed && (
        <span style={{
          fontSize: 7, color: C.green, letterSpacing: 1, padding: '2px 5px',
          border: `1px solid ${C.green}44`, borderRadius: 3,
          background: `${C.green}11`,
        }}>
          MAX
        </span>
      )}
      {isLocked && (
        <span style={{
          fontSize: 7, color: C.dim, letterSpacing: 1, padding: '2px 5px',
          border: `1px solid ${C.dim}33`, borderRadius: 3,
        }}>
          LOCKED
        </span>
      )}
    </div>
  );
}

/* ───── Skill Tree ───── */
function SkillTree({ agent }) {
  const unlocked = agent.skills.filter((s) => s.unlocked);
  const locked = agent.skills.filter((s) => !s.unlocked);

  return (
    <div>
      <div style={{
        fontSize: 9, color: agent.color, letterSpacing: 2, marginBottom: 10,
        display: 'flex', alignItems: 'center', gap: 6,
      }}>
        <span style={{ animation: 'as-blink 2s ease-in-out infinite' }}>◈</span>
        SKILL TREE — {agent.specialization.toUpperCase()} DOMAIN
      </div>

      {/* XP bar */}
      <div style={{
        background: C.panel, border: `1px solid ${agent.color}22`,
        borderRadius: 8, padding: '10px 14px', marginBottom: 12,
      }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
          <span style={{ fontSize: 8, color: C.dim }}>LEVEL {agent.level}</span>
          <span style={{ fontSize: 8, color: agent.color }}>
            {(agent.xp * 100).toFixed(0)}% to LV {agent.level + 1}
          </span>
        </div>
        <div style={{ height: 6, background: `${C.dim}33`, borderRadius: 3, overflow: 'hidden' }}>
          <div style={{
            height: '100%', width: `${agent.xp * 100}%`,
            background: `linear-gradient(90deg, ${agent.color}, ${agent.color}88)`,
            borderRadius: 3,
            boxShadow: `0 0 8px ${agent.color}44`,
            animation: 'as-bar-fill 1s ease-out',
          }} />
        </div>
      </div>

      {/* Unlocked skills */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginBottom: 12 }}>
        {unlocked.map((skill, i) => (
          <SkillNode key={skill.name} skill={skill} index={i} agentColor={agent.color} />
        ))}
      </div>

      {/* Locked skills separator */}
      {locked.length > 0 && (
        <>
          <div style={{
            fontSize: 7, color: C.dim, letterSpacing: 2, marginBottom: 8,
            padding: '4px 0', borderTop: `1px solid ${C.dim}22`,
          }}>
            LOCKED ABILITIES ({locked.length})
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            {locked.map((skill, i) => (
              <SkillNode key={skill.name} skill={skill} index={i + unlocked.length} agentColor={agent.color} />
            ))}
          </div>
        </>
      )}
    </div>
  );
}

/* ───── Metric Bar ───── */
function MetricBar({ label, value, color }) {
  return (
    <div style={{ marginBottom: 8 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 3 }}>
        <span style={{ fontSize: 8, color: C.dim, letterSpacing: 1 }}>{label}</span>
        <span style={{ fontSize: 9, color, fontFamily: 'JetBrains Mono' }}>
          {(clamp01(value) * 100).toFixed(0)}%
        </span>
      </div>
      <div style={{ height: 4, background: `${C.dim}33`, borderRadius: 2, overflow: 'hidden' }}>
        <div style={{
          height: '100%', width: `${clamp01(value) * 100}%`,
          background: `linear-gradient(90deg, ${color}, ${color}88)`,
          borderRadius: 2, animation: 'as-bar-fill 1s ease-out',
        }} />
      </div>
    </div>
  );
}

/* ───── Comparison Radar Overlay ───── */
function ComparisonRadar({ agents, size = 260 }) {
  const traits = Object.keys(agents[0].metrics);
  const cx = size / 2, cy = size / 2, r = size / 2 - 32;
  const angleStep = (2 * Math.PI) / traits.length;
  const startAngle = -Math.PI / 2;

  const getPoint = (i, val) => {
    const angle = startAngle + i * angleStep;
    return [cx + r * val * Math.cos(angle), cy + r * val * Math.sin(angle)];
  };

  return (
    <div>
      <div style={{ fontSize: 10, color: C.cyan, letterSpacing: 2, marginBottom: 8 }}>
        ◈ SPECIALIZATION COMPARISON
      </div>
      <svg width="100%" viewBox={`0 0 ${size} ${size}`} style={{
        background: `${C.bg}88`, border: `1px solid ${C.dim}22`, borderRadius: 8,
      }}>
        {/* Grid */}
        {[0.25, 0.5, 0.75, 1.0].map((lev, li) => (
          <polygon key={li}
            points={traits.map((_, i) => getPoint(i, lev).join(',')).join(' ')}
            fill="none" stroke={`${C.dim}22`} strokeWidth={0.5}
          />
        ))}
        {traits.map((_, i) => (
          <line key={i}
            x1={cx} y1={cy} x2={getPoint(i, 1)[0]} y2={getPoint(i, 1)[1]}
            stroke={`${C.dim}22`} strokeWidth={0.5}
          />
        ))}
        {/* Agent data */}
        {agents.map((agent) => {
          const points = traits.map((t, i) => getPoint(i, clamp01(agent.metrics[t])));
          const path = points.map((p, i) => `${i === 0 ? 'M' : 'L'}${p[0]},${p[1]}`).join(' ') + 'Z';
          return (
            <g key={agent.id}>
              <polygon points={path}
                fill={`${agent.color}12`} stroke={agent.color} strokeWidth={1.5}
                style={{ filter: `drop-shadow(0 0 4px ${agent.color}66)` }}
              />
              {points.map((p, i) => (
                <circle key={i} cx={p[0]} cy={p[1]} r={3} fill={agent.color} />
              ))}
            </g>
          );
        })}
        {/* Labels */}
        {traits.map((trait, i) => {
          const lp = getPoint(i, 1.22);
          return (
            <text key={i} x={lp[0]} y={lp[1]} fill={C.dim} fontSize={7}
              fontFamily="JetBrains Mono" textAnchor="middle" dominantBaseline="middle">
              {trait.toUpperCase()}
            </text>
          );
        })}
      </svg>
      {/* Legend */}
      <div style={{ display: 'flex', gap: 16, justifyContent: 'center', marginTop: 8 }}>
        {agents.map((a) => (
          <span key={a.id} style={{
            display: 'flex', alignItems: 'center', gap: 4, fontSize: 8,
            color: a.color, fontFamily: 'JetBrains Mono',
          }}>
            <span style={{ width: 10, height: 2, background: a.color, display: 'inline-block', borderRadius: 1 }} />
            {a.name}
          </span>
        ))}
      </div>
    </div>
  );
}

/* ───── Specialization Progress Chart ───── */
function SpecializationProgress({ agents }) {
  const width = 600, height = 180;
  const pad = { top: 20, bottom: 25, left: 40, right: 20 };
  const chartW = width - pad.left - pad.right;
  const chartH = height - pad.top - pad.bottom;

  return (
    <div>
      <div style={{ fontSize: 10, color: C.cyan, letterSpacing: 2, marginBottom: 8 }}>
        ◈ SPECIALIZATION PROGRESSION
      </div>
      <svg width="100%" viewBox={`0 0 ${width} ${height}`} style={{
        background: `${C.bg}88`, border: `1px solid ${C.dim}22`, borderRadius: 8,
      }}>
        {/* Grid */}
        {[0, 0.25, 0.5, 0.75, 1.0].map((v, i) => (
          <g key={i}>
            <line
              x1={pad.left} y1={pad.top + (1 - v) * chartH}
              x2={width - pad.right} y2={pad.top + (1 - v) * chartH}
              stroke={`${C.dim}22`} strokeWidth={0.5}
            />
            <text x={pad.left - 5} y={pad.top + (1 - v) * chartH + 3}
              fill={C.dim} fontSize={7} fontFamily="JetBrains Mono" textAnchor="end">
              {(v * 100).toFixed(0)}%
            </text>
          </g>
        ))}
        {/* X labels */}
        {[0, 10, 20, 30, 40, 50].map((ep) => {
          const x = pad.left + (ep / 50) * chartW;
          return (
            <text key={ep} x={x} y={height - 5} fill={C.dim} fontSize={7}
              fontFamily="JetBrains Mono" textAnchor="middle">
              {ep}
            </text>
          );
        })}
        {/* Agent lines */}
        {agents.map((agent) => {
          const points = agent.history.map((h) =>
            `${pad.left + (h.epoch / 50) * chartW},${pad.top + (1 - h.skill) * chartH}`
          ).join(' ');
          return (
            <g key={agent.id}>
              <polyline points={points} fill="none" stroke={`${agent.color}33`} strokeWidth={4} strokeLinejoin="round" />
              <polyline points={points} fill="none" stroke={agent.color} strokeWidth={1.5} strokeLinejoin="round" />
              {/* Endpoints */}
              {agent.history.map((h, hi) => (
                <circle key={hi}
                  cx={pad.left + (h.epoch / 50) * chartW}
                  cy={pad.top + (1 - h.skill) * chartH}
                  r={3} fill={agent.color}
                />
              ))}
            </g>
          );
        })}
      </svg>
      <div style={{ display: 'flex', gap: 16, justifyContent: 'center', marginTop: 8 }}>
        {agents.map((a) => (
          <span key={a.id} style={{
            display: 'flex', alignItems: 'center', gap: 4, fontSize: 8,
            color: a.color, fontFamily: 'JetBrains Mono',
          }}>
            <span style={{ width: 10, height: 2, background: a.color, display: 'inline-block', borderRadius: 1 }} />
            {a.name} ({a.role})
          </span>
        ))}
      </div>
    </div>
  );
}

/* ───── Main Component ───── */
export default function AgentSpecialization() {
  const [selectedAgent, setSelectedAgent] = useState(0);
  const agents = useMemo(() => generateAgentData(), []);
  const agent = agents[selectedAgent];
 
  /* ───── Pixel Art Skill Arena Canvas ───── */
  const arenaRef = useRef(null);
  const arenaPSRef = useRef(new ParticleSystem());
  const arenaRafRef = useRef(null);
 
  useEffect(() => {
    ensureSprites();
    const canvas = arenaRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    const ps = arenaPSRef.current;
    let prevLevels = agents.map(a => a.skills.reduce((s, sk) => s + sk.level, 0));
 
    const draw = () => {
      const W = canvas.width, H = canvas.height;
      ctx.clearRect(0, 0, W, H);
      // Background
      ctx.fillStyle = PC.bg;
      ctx.fillRect(0, 0, W, H);
      // Grid lines
      ctx.strokeStyle = PC.panelLight;
      ctx.lineWidth = 0.5;
      for (let gx = 0; gx < W; gx += 32) { ctx.beginPath(); ctx.moveTo(gx, 0); ctx.lineTo(gx, H); ctx.stroke(); }
      for (let gy = 0; gy < H; gy += 32) { ctx.beginPath(); ctx.moveTo(0, gy); ctx.lineTo(W, gy); ctx.stroke(); }
 
      const colW = W / agents.length;
 
      // Connection beams between agents that share skills
      ctx.lineWidth = 1;
      for (let i = 0; i < agents.length; i++) {
        for (let j = i + 1; j < agents.length; j++) {
          const sharedSkills = agents[i].skills.filter(s1 =>
            agents[j].skills.some(s2 => s1.name.split('_')[0] === s2.name.split('_')[0] && s1.unlocked && s2.unlocked)
          );
          if (sharedSkills.length > 0) {
            ctx.globalAlpha = 0.15;
            ctx.strokeStyle = agents[i].color;
            ctx.beginPath();
            ctx.moveTo(colW * i + colW / 2, H - 60);
            ctx.lineTo(colW * j + colW / 2, H - 60);
            ctx.stroke();
            ctx.globalAlpha = 1;
          }
        }
      }
 
      agents.forEach((ag, i) => {
        const cx = colW * i + colW / 2;
        const baseY = H - 50;
 
        // Colored aura/glow
        const auraR = 30 + Math.sin(Date.now() / 600 + i) * 5;
        const grad = ctx.createRadialGradient(cx, baseY - 20, 0, cx, baseY - 20, auraR);
        grad.addColorStop(0, ag.color + '44');
        grad.addColorStop(1, ag.color + '00');
        ctx.fillStyle = grad;
        ctx.beginPath();
        ctx.arc(cx, baseY - 20, auraR, 0, Math.PI * 2);
        ctx.fill();
 
        // Skill icons floating above
        ctx.font = '9px JetBrains Mono, monospace';
        ctx.textAlign = 'center';
        const unlockedSkills = ag.skills.filter(s => s.unlocked);
        unlockedSkills.forEach((sk, si) => {
          const angle = (Date.now() / 1500 + si * (Math.PI * 2 / unlockedSkills.length));
          const ix = cx + Math.cos(angle) * 18;
          const iy = baseY - 55 + Math.sin(angle) * 6;
          ctx.fillStyle = sk.color;
          ctx.globalAlpha = 0.8;
          ctx.fillRect(ix - 2, iy - 2, 4, 4);
          ctx.globalAlpha = 1;
        });
 
        // Agent sprite
        const spriteIdx = i % SPRITE_NAMES.length;
        drawSprite(ctx, SPRITE_NAMES[spriteIdx], cx, baseY, { scale: 1.3, glow: ag.color });
 
        // Skill bar below sprite
        const totalSkill = ag.skills.reduce((s, sk) => s + sk.level, 0);
        const maxSkill = ag.skills.reduce((s, sk) => s + sk.maxLevel, 0);
        drawBar(ctx, cx - 28, baseY + 4, 56, 5, totalSkill, maxSkill, ag.color);
 
        // Agent name
        ctx.font = '8px JetBrains Mono, monospace';
        ctx.fillStyle = ag.color;
        ctx.fillText(ag.name, cx, baseY + 16);
 
        // Specialization label
        ctx.font = '7px JetBrains Mono, monospace';
        ctx.fillStyle = PC.dim;
        ctx.fillText(ag.specialization.toUpperCase(), cx, baseY + 26);
 
        // Check for skill level-up (golden sparkle explosion)
        const newTotal = ag.skills.reduce((s, sk) => s + sk.level, 0);
        if (newTotal > prevLevels[i]) {
          for (let p = 0; p < 20; p++) {
            const angle = (Math.PI * 2 * p) / 20;
            ps.add({
              x: cx + Math.cos(angle) * 5,
              y: baseY - 20 + Math.sin(angle) * 5,
              vx: Math.cos(angle) * 40,
              vy: Math.sin(angle) * 40,
              color: '#ffcc00',
              size: 2 + Math.random() * 2,
              life: 1.2,
              type: 'sparkle',
            });
          }
          prevLevels[i] = newTotal;
        }
      });
 
      // Ambient skill orbs
      if (Math.random() < 0.06) {
        ps.add({
          x: Math.random() * W,
          y: 10 + Math.random() * 30,
          vx: (Math.random() - 0.5) * 10,
          vy: 5 + Math.random() * 8,
          color: [PC.green, PC.cyan, PC.amber, PC.purple][Math.floor(Math.random() * 4)],
          size: 1.5 + Math.random(),
          life: 3,
          type: 'firefly',
        });
      }
 
      ps.update();
      ps.draw(ctx);
 
      // Title
      ctx.font = '10px JetBrains Mono, monospace';
      ctx.fillStyle = PC.amber;
      ctx.textAlign = 'left';
      ctx.fillText('◈ SKILL ARENA', 10, 16);
 
      arenaRafRef.current = requestAnimationFrame(draw);
    };
    draw();
    return () => { if (arenaRafRef.current) cancelAnimationFrame(arenaRafRef.current); };
  }, [agents]);

  return (
    <div style={{ padding: 0 }}>
      {/* Pixel Art Skill Arena */}
      <div style={{ marginBottom: 20, borderRadius: 10, overflow: 'hidden', border: `1px solid ${C.dim}22` }}>
        <canvas ref={arenaRef} width={800} height={180} style={{ width: '100%', display: 'block', imageRendering: 'pixelated' }} />
      </div>

      {/* Header */}
      <div style={{
        display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start',
        marginBottom: 24, flexWrap: 'wrap', gap: 12,
      }}>
        <div>
          <h2 style={{
            fontSize: 18, color: C.amber, fontFamily: 'JetBrains Mono', fontWeight: 700,
            letterSpacing: 1, margin: 0,
            textShadow: `0 0 8px ${C.amber}66`,
          }}>
            ◈ AGENT SPECIALIZATION
          </h2>
          <div style={{ fontSize: 10, color: C.dim, marginTop: 4, letterSpacing: 1 }}>
            SKILL TREES · SPECIALIZATION TRACKING · CAPABILITY EVOLUTION
          </div>
        </div>

        <div style={{
          display: 'flex', alignItems: 'center', gap: 6, fontSize: 9,
          color: C.amber, fontFamily: 'JetBrains Mono',
        }}>
          <span style={{
            width: 6, height: 6, borderRadius: '50%', background: C.amber,
            animation: 'as-pulse 1.5s ease-in-out infinite',
            boxShadow: `0 0 6px ${C.amber}`,
          }} />
          {agents.length} AGENTS TRACKED
        </div>
      </div>

      {/* Agent Selector Tabs */}
      <div style={{
        display: 'flex', gap: 8, marginBottom: 20, flexWrap: 'wrap',
        animation: 'as-fadeIn 0.4s ease-out',
      }}>
        {agents.map((a, i) => (
          <button key={a.id} onClick={() => setSelectedAgent(i)} style={{
            display: 'flex', alignItems: 'center', gap: 8,
            padding: '10px 16px', borderRadius: 10, cursor: 'pointer',
            border: `1px solid ${selectedAgent === i ? a.color : `${C.dim}33`}`,
            background: selectedAgent === i
              ? `linear-gradient(135deg, ${a.color}15, ${a.color}08)`
              : `${C.panel}`,
            color: selectedAgent === i ? a.color : C.dim,
            fontFamily: 'JetBrains Mono', fontSize: 10,
            transition: 'all 0.25s',
            boxShadow: selectedAgent === i ? `0 0 12px ${a.color}22` : 'none',
          }}>
            <span style={{ fontSize: 16 }}>{a.icon}</span>
            <div style={{ textAlign: 'left' }}>
              <div style={{ fontWeight: 'bold', fontSize: 11 }}>{a.name}</div>
              <div style={{ fontSize: 7, color: C.dim }}>{a.role}</div>
            </div>
            <span style={{
              marginLeft: 8, fontSize: 8, color: C.dim,
              padding: '2px 6px', border: `1px solid ${C.dim}33`, borderRadius: 4,
            }}>
              LV {a.level}
            </span>
          </button>
        ))}
      </div>

      {/* Main Grid: Radar + Skills + Metrics */}
      <div style={{
        display: 'grid', gridTemplateColumns: 'minmax(200px, 280px) 1fr',
        gap: 20, marginBottom: 20,
      }}>
        {/* Left: Personality Radar + Metrics */}
        <div style={{
          background: C.panel, border: `1px solid ${agent.color}22`,
          borderRadius: 10, padding: 16,
          animation: 'as-fadeIn 0.4s ease-out',
        }}>
          <div style={{ textAlign: 'center', marginBottom: 12 }}>
            <span style={{ fontSize: 28 }}>{agent.icon}</span>
            <div style={{
              fontSize: 14, color: agent.color, fontFamily: 'JetBrains Mono', fontWeight: 'bold',
              marginTop: 4, textShadow: `0 0 6px ${agent.color}44`,
            }}>
              {agent.name}
            </div>
            <div style={{ fontSize: 8, color: C.dim, letterSpacing: 1 }}>
              {agent.role.toUpperCase()} · LEVEL {agent.level}
            </div>
            <div style={{
              display: 'inline-flex', alignItems: 'center', gap: 4, marginTop: 4,
              fontSize: 7, color: C.green, padding: '2px 6px',
              border: `1px solid ${C.green}33`, borderRadius: 4,
              background: `${C.green}08`,
            }}>
              ⚡ {agent.badgeCount} BADGES
            </div>
          </div>

          <RadarChart data={agent.personality} size={180} color={agent.color} label="PERSONALITY MATRIX" />

          <div style={{ marginTop: 16, borderTop: `1px solid ${C.dim}22`, paddingTop: 12 }}>
            <div style={{ fontSize: 8, color: C.dim, letterSpacing: 1.5, marginBottom: 8 }}>
              CAPABILITY METRICS
            </div>
            <MetricBar label="ACCURACY" value={agent.metrics.accuracy} color={C.green} />
            <MetricBar label="EFFICIENCY" value={agent.metrics.efficiency} color={C.cyan} />
            <MetricBar label="ADAPTABILITY" value={agent.metrics.adaptability} color={C.amber} />
            <MetricBar label="TEACHING" value={agent.metrics.teaching} color={C.purple} />
          </div>
        </div>

        {/* Right: Skill Tree */}
        <div style={{
          background: C.panel, border: `1px solid ${C.dim}22`,
          borderRadius: 10, padding: 16,
          animation: 'as-fadeIn 0.5s ease-out',
        }}>
          <SkillTree agent={agent} />
        </div>
      </div>

      {/* Comparison Section */}
      <div style={{
        display: 'grid', gridTemplateColumns: '1fr 1fr',
        gap: 20, marginBottom: 20,
      }}>
        <div style={{
          background: C.panel, border: `1px solid ${C.dim}22`,
          borderRadius: 10, padding: 16,
        }}>
          <ComparisonRadar agents={agents} />
        </div>

        <div style={{
          background: C.panel, border: `1px solid ${C.dim}22`,
          borderRadius: 10, padding: 16,
        }}>
          <SpecializationProgress agents={agents} />
        </div>
      </div>

      {/* Agent comparison summary table */}
      <div style={{
        background: C.panel, border: `1px solid ${C.dim}22`,
        borderRadius: 10, padding: 16, overflowX: 'auto',
      }}>
        <div style={{ fontSize: 10, color: C.cyan, letterSpacing: 2, marginBottom: 12 }}>
          ◈ SPECIALIZATION MATRIX
        </div>
        <table style={{
          width: '100%', borderCollapse: 'collapse', fontSize: 9,
          fontFamily: 'JetBrains Mono',
        }}>
          <thead>
            <tr style={{ borderBottom: `1px solid ${C.dim}33` }}>
              {['AGENT', 'DOMAIN', 'LEVEL', 'SKILLS', 'ACCURACY', 'EFFICIENCY', 'ADAPT.', 'BADGES'].map((h) => (
                <th key={h} style={{
                  padding: '6px 10px', textAlign: 'left', color: C.dim,
                  letterSpacing: 1, fontSize: 7, fontWeight: 'normal',
                }}>
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {agents.map((a) => (
              <tr key={a.id} style={{ borderBottom: `1px solid ${C.dim}18` }}>
                <td style={{ padding: '8px 10px', color: a.color, fontWeight: 'bold' }}>
                  {a.icon} {a.name}
                </td>
                <td style={{ padding: '8px 10px', color: C.text }}>
                  {a.specialization.toUpperCase()}
                </td>
                <td style={{ padding: '8px 10px', color: C.textBright }}>{a.level}</td>
                <td style={{ padding: '8px 10px', color: C.green }}>
                  {a.skills.filter((s) => s.unlocked).length}/{a.skills.length}
                </td>
                <td style={{ padding: '8px 10px', color: C.cyan }}>
                  {(a.metrics.accuracy * 100).toFixed(0)}%
                </td>
                <td style={{ padding: '8px 10px', color: C.amber }}>
                  {(a.metrics.efficiency * 100).toFixed(0)}%
                </td>
                <td style={{ padding: '8px 10px', color: C.purple }}>
                  {(a.metrics.adaptability * 100).toFixed(0)}%
                </td>
                <td style={{ padding: '8px 10px', color: C.text }}>
                  ⚡{a.badgeCount}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
