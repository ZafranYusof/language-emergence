import React, { useState, useEffect, useRef, useMemo, useCallback } from 'react';
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
  pink: '#ff66aa',
};

/* ───── keyframes ───── */
const styleId = 'social-dynamics-keyframes';
if (typeof document !== 'undefined' && !document.getElementById(styleId)) {
  const el = document.createElement('style');
  el.id = styleId;
  el.textContent = `
    @keyframes sd-fadeIn { from{opacity:0;transform:translateY(10px)} to{opacity:1;transform:translateY(0)} }
    @keyframes sd-pulse { 0%,100%{transform:scale(1)} 50%{transform:scale(1.06)} }
    @keyframes sd-glow { 0%,100%{filter:drop-shadow(0 0 3px var(--glow))} 50%{filter:drop-shadow(0 0 14px var(--glow))} }
    @keyframes sd-blink { 0%,100%{opacity:1} 50%{opacity:0.3} }
    @keyframes sd-bar-fill { from{width:0} }
    @keyframes sd-trust-wave { 0%{stroke-dashoffset:20} 100%{stroke-dashoffset:0} }
    @keyframes sd-node-enter {
      0% { r: 0; opacity: 0; }
      60% { r: 22; opacity: 1; }
      100% { r: 18; opacity: 1; }
    }
    @keyframes sd-edge-flow {
      from { stroke-dashoffset: 20; }
      to { stroke-dashoffset: 0; }
    }
    @keyframes sd-event-in { from{opacity:0;transform:translateX(-12px)} to{opacity:1;transform:translateX(0)} }
    @keyframes sd-ring-pulse {
      0% { r: 18; opacity: 0.5; }
      100% { r: 30; opacity: 0; }
    }
  `;
  document.head.appendChild(el);
}

const clamp01 = (v) => Math.max(0, Math.min(1, v || 0));

/* ───── Synthetic Social Data ───── */
function generateSocialData() {
  const agents = [
    { id: 0, name: 'NOVA', icon: '🎨', color: C.cyan, x: 200, y: 150 },
    { id: 1, name: 'PRISM', icon: '🔷', color: C.amber, x: 500, y: 120 },
    { id: 2, name: 'ECHO', icon: '🔮', color: C.purple, x: 350, y: 350 },
    { id: 3, name: 'FLUX', icon: '⚡', color: C.green, x: 150, y: 350 },
    { id: 4, name: 'NEXUS', icon: '🌀', color: C.pink, x: 550, y: 330 },
  ];

  // Relationships: {from, to, trust, type}
  const relationships = [
    { from: 0, to: 1, trust: 0.82, type: 'alliance', history: [0.3, 0.45, 0.6, 0.72, 0.78, 0.82] },
    { from: 0, to: 2, trust: 0.65, type: 'alliance', history: [0.2, 0.35, 0.48, 0.55, 0.6, 0.65] },
    { from: 1, to: 4, trust: 0.74, type: 'alliance', history: [0.1, 0.3, 0.5, 0.6, 0.68, 0.74] },
    { from: 2, to: 3, trust: 0.58, type: 'neutral', history: [0.4, 0.42, 0.45, 0.5, 0.54, 0.58] },
    { from: 3, to: 4, trust: 0.35, type: 'rivalry', history: [0.6, 0.55, 0.48, 0.42, 0.38, 0.35] },
    { from: 0, to: 3, trust: 0.45, type: 'neutral', history: [0.3, 0.33, 0.38, 0.4, 0.42, 0.45] },
    { from: 1, to: 2, trust: 0.28, type: 'rivalry', history: [0.55, 0.48, 0.4, 0.35, 0.3, 0.28] },
    { from: 0, to: 4, trust: 0.52, type: 'neutral', history: [0.2, 0.3, 0.38, 0.44, 0.48, 0.52] },
    { from: 2, to: 4, trust: 0.41, type: 'neutral', history: [0.35, 0.36, 0.38, 0.39, 0.4, 0.41] },
    { from: 1, to: 3, trust: 0.55, type: 'neutral', history: [0.3, 0.38, 0.42, 0.48, 0.52, 0.55] },
    { from: 3, to: 0, trust: 0.45, type: 'neutral', history: [0.3, 0.33, 0.38, 0.4, 0.42, 0.45] },
  ];

  // Recent social events
  const events = [
    { time: '2m ago', type: 'alliance', text: 'NOVA and PRISM formed a color-shape alliance', icon: '🤝', color: C.green },
    { time: '5m ago', type: 'trust_up', text: 'NOVA→ECHO trust increased to 65%', icon: '📈', color: C.cyan },
    { time: '8m ago', type: 'rivalry', text: 'FLUX and NEXUS rivalry intensified', icon: '⚔️', color: C.red },
    { time: '12m ago', type: 'trust_down', text: 'PRISM→ECHO trust decreased to 28%', icon: '📉', color: C.amber },
    { time: '15m ago', type: 'communication', text: 'FLUX initiated dialogue with ECHO', icon: '💬', color: C.purple },
    { time: '20m ago', type: 'alliance', text: 'PRISM and NEXUS strengthened their bond', icon: '🤝', color: C.green },
    { time: '25m ago', type: 'rivalry', text: 'FLUX→NEXUS: competing for pattern expertise', icon: '🔥', color: C.red },
    { time: '30m ago', type: 'neutral', text: 'ECHO proposed knowledge exchange with NEXUS', icon: '🔄', color: C.dim },
  ];

  // Agent social stats
  const socialStats = agents.map((a) => ({
    ...a,
    avgTrust: 0,
    alliances: 0,
    rivalries: 0,
    influence: 0,
    communicativeness: 0,
  }));

  agents.forEach((a, i) => {
    const myRels = relationships.filter((r) => r.from === i || r.to === i);
    const avgTrust = myRels.reduce((s, r) => s + r.trust, 0) / Math.max(myRels.length, 1);
    socialStats[i].avgTrust = avgTrust;
    socialStats[i].alliances = myRels.filter((r) => r.type === 'alliance').length;
    socialStats[i].rivalries = myRels.filter((r) => r.type === 'rivalry').length;
    socialStats[i].influence = clamp01(avgTrust * 0.6 + (myRels.length / 5) * 0.4);
    socialStats[i].communicativeness = clamp01(0.3 + Math.random() * 0.5);
  });

  return { agents, relationships, events, socialStats };
}

/* ───── Interactive Network Graph (SVG) ───── */
function NetworkGraph({ agents, relationships, selectedNode, onSelectNode, hoveredEdge, onHoverEdge }) {
  const width = 700;
  const height = 440;
  const nodeR = 18;

  const relColor = (type) => {
    if (type === 'alliance') return C.green;
    if (type === 'rivalry') return C.red;
    return C.dim;
  };

  const relDash = (type) => {
    if (type === 'alliance') return 'none';
    if (type === 'rivalry') return '6,4';
    return '4,4';
  };

  const getEdgeMidpoint = (from, to) => ({
    x: (from.x + to.x) / 2,
    y: (from.y + to.y) / 2,
  });

  return (
    <svg width="100%" viewBox={`0 0 ${width} ${height}`} style={{
      background: `linear-gradient(135deg, ${C.bg}, ${C.panel})`,
      border: `1px solid ${C.dim}22`, borderRadius: 10,
      cursor: 'default',
    }}>
      {/* Background grid dots */}
      {Array.from({ length: 20 }, (_, i) =>
        Array.from({ length: 14 }, (_, j) => (
          <circle key={`${i}-${j}`}
            cx={i * 36 + 18} cy={j * 32 + 16}
            r={0.5} fill={`${C.dim}33`}
          />
        ))
      )}

      {/* Edges */}
      {relationships.map((rel, ri) => {
        const from = agents[rel.from];
        const to = agents[rel.to];
        const color = relColor(rel.type);
        const isHovered = hoveredEdge === ri;
        const mid = getEdgeMidpoint(from, to);

        // Offset control point for curved edges
        const dx = to.x - from.x;
        const dy = to.y - from.y;
        const dist = Math.sqrt(dx * dx + dy * dy);
        const nx = -dy / dist;
        const ny = dx / dist;
        const curve = 20 + ri * 3;
        const cx = mid.x + nx * curve;
        const cy = mid.y + ny * curve;

        return (
          <g key={ri}
            onMouseEnter={() => onHoverEdge(ri)}
            onMouseLeave={() => onHoverEdge(null)}
            style={{ cursor: 'pointer' }}
          >
            {/* Hit area */}
            <path
              d={`M ${from.x} ${from.y} Q ${cx} ${cy} ${to.x} ${to.y}`}
              fill="none" stroke="transparent" strokeWidth={12}
            />
            {/* Glow */}
            {isHovered && (
              <path
                d={`M ${from.x} ${from.y} Q ${cx} ${cy} ${to.x} ${to.y}`}
                fill="none" stroke={`${color}44`} strokeWidth={6}
                strokeLinecap="round"
              />
            )}
            {/* Edge line */}
            <path
              d={`M ${from.x} ${from.y} Q ${cx} ${cy} ${to.x} ${to.y}`}
              fill="none" stroke={color}
              strokeWidth={isHovered ? 2.5 : 1.5}
              strokeDasharray={relDash(rel.type)}
              strokeLinecap="round"
              opacity={isHovered ? 1 : 0.7}
              style={{
                animation: rel.type === 'alliance' ? 'sd-edge-flow 2s linear infinite' : 'none',
              }}
            />
            {/* Trust value label */}
            {isHovered && (
              <g>
                <rect x={mid.x - 22} y={mid.y - 10} width={44} height={16}
                  rx={4} fill={`${C.bg}dd`} stroke={`${color}66`} strokeWidth={0.5}
                />
                <text x={mid.x} y={mid.y + 2} fill={color} fontSize={8}
                  fontFamily="JetBrains Mono" textAnchor="middle" dominantBaseline="middle">
                  {(rel.trust * 100).toFixed(0)}% {rel.type.toUpperCase()}
                </text>
              </g>
            )}
          </g>
        );
      })}

      {/* Nodes */}
      {agents.map((agent, ai) => {
        const isSelected = selectedNode === ai;
        return (
          <g key={agent.id}
            onClick={() => onSelectNode(ai === selectedNode ? null : ai)}
            style={{ cursor: 'pointer' }}
          >
            {/* Pulse ring for selected */}
            {isSelected && (
              <circle cx={agent.x} cy={agent.y} r={nodeR}
                fill="none" stroke={`${agent.color}44`} strokeWidth={2}
                style={{ animation: 'sd-ring-pulse 1.5s ease-out infinite' }}
              />
            )}
            {/* Outer glow */}
            <circle cx={agent.x} cy={agent.y} r={nodeR + 2}
              fill="none" stroke={`${agent.color}33`} strokeWidth={isSelected ? 2 : 0}
            />
            {/* Node circle */}
            <circle cx={agent.x} cy={agent.y} r={nodeR}
              fill={`${agent.color}18`}
              stroke={agent.color}
              strokeWidth={isSelected ? 2 : 1}
              style={{
                '--glow': agent.color,
                animation: isSelected ? 'sd-glow 2s ease-in-out infinite' : 'none',
                transition: 'all 0.3s',
              }}
            />
            {/* Icon — pixel art sprite */}
            <image
              href={`/sprites/${SPRITE_NAMES[ai % SPRITE_NAMES.length]}.png`}
              x={agent.x - 14} y={agent.y - 20}
              width={28} height={42}
              style={{ imageRendering: 'pixelated', pointerEvents: 'none' }}
              clipPath={`circle(${nodeR}px at ${14}px ${20}px)`}
            />
            {/* Name label */}
            <rect x={agent.x - 24} y={agent.y + nodeR + 4} width={48} height={14}
              rx={4} fill={`${C.bg}cc`} stroke={`${agent.color}33`} strokeWidth={0.5}
            />
            <text x={agent.x} y={agent.y + nodeR + 13}
              fill={agent.color} fontSize={7} fontFamily="JetBrains Mono"
              textAnchor="middle" dominantBaseline="middle"
              fontWeight={isSelected ? 'bold' : 'normal'}
              style={{ pointerEvents: 'none', letterSpacing: 0.5 }}>
              {agent.name}
            </text>
          </g>
        );
      })}
    </svg>
  );
}

/* ───── Trust Timeline (SVG) ───── */
function TrustTimeline({ relationships, agents, selectedEdge }) {
  const width = 700, height = 160;
  const pad = { top: 15, bottom: 25, left: 40, right: 20 };
  const chartW = width - pad.left - pad.right;
  const chartH = height - pad.top - pad.bottom;
  const epochs = 6;

  const getX = (i) => pad.left + (i / (epochs - 1)) * chartW;
  const getY = (v) => pad.top + (1 - clamp01(v)) * chartH;

  const relColor = (type) => {
    if (type === 'alliance') return C.green;
    if (type === 'rivalry') return C.red;
    return C.dim;
  };

  const topRels = selectedEdge !== null
    ? [relationships[selectedEdge]]
    : relationships.filter((r) => r.type !== 'neutral').slice(0, 5);

  return (
    <div>
      <div style={{ fontSize: 10, color: C.cyan, letterSpacing: 2, marginBottom: 8 }}>
        ◈ TRUST TRAJECTORY
      </div>
      <svg width="100%" viewBox={`0 0 ${width} ${height}`} style={{
        background: `${C.bg}88`, border: `1px solid ${C.dim}22`, borderRadius: 8,
      }}>
        {/* Grid */}
        {[0, 0.25, 0.5, 0.75, 1].map((v, i) => (
          <g key={i}>
            <line x1={pad.left} y1={getY(v)} x2={width - pad.right} y2={getY(v)}
              stroke={`${C.dim}22`} strokeWidth={0.5} />
            <text x={pad.left - 5} y={getY(v) + 3} fill={C.dim} fontSize={7}
              fontFamily="JetBrains Mono" textAnchor="end">
              {(v * 100).toFixed(0)}%
            </text>
          </g>
        ))}
        {/* X labels */}
        {['T0', 'T1', 'T2', 'T3', 'T4', 'T5'].map((t, i) => (
          <text key={i} x={getX(i)} y={height - 6} fill={C.dim} fontSize={7}
            fontFamily="JetBrains Mono" textAnchor="middle">{t}</text>
        ))}
        {/* Lines */}
        {topRels.map((rel, ri) => {
          const fromAgent = agents[rel.from];
          const toAgent = agents[rel.to];
          const color = relColor(rel.type);
          const points = rel.history.map((v, i) => `${getX(i)},${getY(v)}`).join(' ');
          return (
            <g key={ri}>
              <polyline points={points} fill="none" stroke={`${color}33`} strokeWidth={4} strokeLinejoin="round" />
              <polyline points={points} fill="none" stroke={color} strokeWidth={1.5}
                strokeLinejoin="round" strokeDasharray={rel.type === 'rivalry' ? '4,3' : 'none'} />
              {/* Endpoint */}
              <circle cx={getX(rel.history.length - 1)} cy={getY(rel.history[rel.history.length - 1])}
                r={3} fill={color} />
              {/* Label */}
              <text x={getX(rel.history.length - 1) + 6}
                y={getY(rel.history[rel.history.length - 1]) + 3}
                fill={color} fontSize={7} fontFamily="JetBrains Mono">
                {fromAgent.name}→{toAgent.name}
              </text>
            </g>
          );
        })}
      </svg>
    </div>
  );
}

/* ───── Agent Social Profile Card ───── */
function AgentSocialCard({ agent, stats, isSelected }) {
  const trustBarColor = (v) => {
    if (v >= 0.7) return C.green;
    if (v >= 0.4) return C.amber;
    return C.red;
  };

  return (
    <div style={{
      background: isSelected
        ? `linear-gradient(135deg, ${agent.color}12, ${agent.color}05)`
        : C.panel,
      border: `1px solid ${isSelected ? agent.color : C.dim}33`,
      borderRadius: 10, padding: '12px 14px',
      transition: 'all 0.3s', cursor: 'pointer',
      boxShadow: isSelected ? `0 0 12px ${agent.color}22` : 'none',
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 10 }}>
        <span style={{
          fontSize: 22, '--glow': agent.color,
          animation: isSelected ? 'sd-glow 2s ease-in-out infinite' : 'none',
        }}>
          {agent.icon}
        </span>
        <div style={{ flex: 1 }}>
          <div style={{
            fontSize: 12, color: agent.color, fontFamily: 'JetBrains Mono', fontWeight: 'bold',
            textShadow: `0 0 4px ${agent.color}44`,
          }}>
            {agent.name}
          </div>
          <div style={{ fontSize: 7, color: C.dim, letterSpacing: 1 }}>
            AGENT-{agent.id.toString().padStart(3, '0')}
          </div>
        </div>
        <div style={{
          fontSize: 16, color: trustBarColor(stats.avgTrust),
          fontFamily: 'JetBrains Mono', fontWeight: 'bold',
          textShadow: `0 0 6px ${trustBarColor(stats.avgTrust)}44`,
        }}>
          {(stats.avgTrust * 100).toFixed(0)}%
        </div>
      </div>

      {/* Stats */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 6 }}>
        {[
          { label: 'ALLIANCES', value: stats.alliances, color: C.green },
          { label: 'RIVALRIES', value: stats.rivalries, color: C.red },
          { label: 'INFLUENCE', value: `${(stats.influence * 100).toFixed(0)}%`, color: C.cyan },
        ].map((s, i) => (
          <div key={i} style={{
            textAlign: 'center', padding: '6px 4px',
            background: `${C.bg}88`, borderRadius: 6,
            border: `1px solid ${s.color}22`,
          }}>
            <div style={{ fontSize: 6, color: C.dim, letterSpacing: 1, marginBottom: 2 }}>
              {s.label}
            </div>
            <div style={{ fontSize: 12, color: s.color, fontFamily: 'JetBrains Mono', fontWeight: 'bold' }}>
              {s.value}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

/* ───── Event Feed ───── */
function EventFeed({ events }) {
  return (
    <div>
      <div style={{
        fontSize: 10, color: C.cyan, letterSpacing: 2, marginBottom: 10,
        display: 'flex', alignItems: 'center', gap: 6,
      }}>
        <span style={{ animation: 'sd-blink 2s ease-in-out infinite' }}>◈</span>
        SOCIAL EVENT LOG
        <span style={{ marginLeft: 'auto', fontSize: 8, color: C.dim }}>LIVE</span>
        <span style={{
          width: 5, height: 5, borderRadius: '50%', background: C.green,
          animation: 'sd-pulse 1.5s ease-in-out infinite',
          boxShadow: `0 0 6px ${C.green}`,
        }} />
      </div>

      <div style={{ maxHeight: 300, overflowY: 'auto' }}>
        {events.map((ev, i) => (
          <div key={i} style={{
            display: 'flex', alignItems: 'flex-start', gap: 10,
            padding: '8px 10px', marginBottom: 6,
            background: i === 0 ? `${ev.color}10` : 'transparent',
            border: `1px solid ${i === 0 ? `${ev.color}33` : 'transparent'}`,
            borderRadius: 8,
            animation: `sd-event-in 0.3s ease-out ${i * 0.05}s both`,
          }}>
            <span style={{ fontSize: 14, flexShrink: 0 }}>{ev.icon}</span>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 9, color: C.textBright, fontFamily: 'JetBrains Mono', lineHeight: 1.4 }}>
                {ev.text}
              </div>
              <div style={{ fontSize: 7, color: C.dim, marginTop: 2 }}>{ev.time}</div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

/* ───── Alliance / Rivalry Summary ───── */
function RelationshipSummary({ relationships, agents }) {
  const alliances = relationships.filter((r) => r.type === 'alliance');
  const rivalries = relationships.filter((r) => r.type === 'rivalry');
  const neutrals = relationships.filter((r) => r.type === 'neutral');

  return (
    <div style={{
      display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 10,
    }}>
      {[
        { label: 'ALLIANCES', items: alliances, color: C.green, icon: '🤝' },
        { label: 'RIVALRIES', items: rivalries, color: C.red, icon: '⚔️' },
        { label: 'NEUTRAL', items: neutrals, color: C.dim, icon: '🔄' },
      ].map((group, gi) => (
        <div key={gi} style={{
          background: `${group.color}08`, border: `1px solid ${group.color}22`,
          borderRadius: 8, padding: '10px 12px',
        }}>
          <div style={{
            fontSize: 8, color: group.color, letterSpacing: 1.5, marginBottom: 8,
            display: 'flex', alignItems: 'center', gap: 4,
          }}>
            {group.icon} {group.label} ({group.items.length})
          </div>
          {group.items.map((rel, ri) => (
            <div key={ri} style={{
              display: 'flex', justifyContent: 'space-between', alignItems: 'center',
              padding: '4px 0', borderBottom: `1px solid ${group.color}11`,
              fontSize: 8, fontFamily: 'JetBrains Mono',
            }}>
              <span style={{ color: agents[rel.from].color }}>{agents[rel.from].name}</span>
              <span style={{ color: C.dim }}>↔</span>
              <span style={{ color: agents[rel.to].color }}>{agents[rel.to].name}</span>
              <span style={{
                color: group.color, fontSize: 9, fontWeight: 'bold',
                marginLeft: 6,
              }}>
                {(rel.trust * 100).toFixed(0)}%
              </span>
            </div>
          ))}
        </div>
      ))}
    </div>
  );
}

/* ───── Main Component ───── */
export default function SocialDynamics() {
  const [selectedNode, setSelectedNode] = useState(null);
  const [hoveredEdge, setHoveredEdge] = useState(null);

  const { agents, relationships, events, socialStats } = useMemo(() => generateSocialData(), []);

  return (
    <div style={{ padding: 0 }}>
      {/* Header */}
      <div style={{
        display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start',
        marginBottom: 24, flexWrap: 'wrap', gap: 12,
      }}>
        <div>
          <h2 style={{
            fontSize: 18, color: C.purple, fontFamily: 'JetBrains Mono', fontWeight: 700,
            letterSpacing: 1, margin: 0,
            textShadow: `0 0 8px ${C.purple}66`,
          }}>
            ◈ SOCIAL DYNAMICS
          </h2>
          <div style={{ fontSize: 10, color: C.dim, marginTop: 4, letterSpacing: 1 }}>
            TRUST NETWORKS · ALLIANCES · RIVALRIES · INTERACTION GRAPHS
          </div>
        </div>

        <div style={{
          display: 'flex', alignItems: 'center', gap: 12,
        }}>
          {/* Legend */}
          {[
            { label: 'ALLIANCE', color: C.green, dash: false },
            { label: 'NEUTRAL', color: C.dim, dash: true },
            { label: 'RIVALRY', color: C.red, dash: true },
          ].map((l) => (
            <span key={l.label} style={{
              display: 'flex', alignItems: 'center', gap: 5, fontSize: 7,
              color: l.color, fontFamily: 'JetBrains Mono', letterSpacing: 0.5,
            }}>
              <span style={{
                width: 14, height: 0,
                borderTop: `2px ${l.dash ? 'dashed' : 'solid'} ${l.color}`,
                display: 'inline-block',
              }} />
              {l.label}
            </span>
          ))}
        </div>
      </div>

      {/* Network Graph */}
      <div style={{
        background: C.panel, border: `1px solid ${C.dim}22`,
        borderRadius: 10, padding: 16, marginBottom: 20,
        animation: 'sd-fadeIn 0.4s ease-out',
      }}>
        <div style={{ fontSize: 10, color: C.cyan, letterSpacing: 2, marginBottom: 10 }}>
          ◈ INTERACTION NETWORK
          <span style={{ fontSize: 7, color: C.dim, marginLeft: 12 }}>
            Click nodes to inspect · Hover edges for trust values
          </span>
        </div>
        <NetworkGraph
          agents={agents}
          relationships={relationships}
          selectedNode={selectedNode}
          onSelectNode={setSelectedNode}
          hoveredEdge={hoveredEdge}
          onHoverEdge={setHoveredEdge}
        />
      </div>

      {/* Trust Timeline */}
      <div style={{
        background: C.panel, border: `1px solid ${C.dim}22`,
        borderRadius: 10, padding: 16, marginBottom: 20,
      }}>
        <TrustTimeline
          relationships={relationships}
          agents={agents}
          selectedEdge={hoveredEdge}
        />
      </div>

      {/* Agent Cards + Event Feed */}
      <div style={{
        display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 20, marginBottom: 20,
      }}>
        {/* Agent social profiles */}
        <div style={{
          background: C.panel, border: `1px solid ${C.dim}22`,
          borderRadius: 10, padding: 16,
        }}>
          <div style={{ fontSize: 10, color: C.cyan, letterSpacing: 2, marginBottom: 12 }}>
            ◈ AGENT SOCIAL PROFILES
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {agents.map((agent, i) => (
              <div key={agent.id} onClick={() => setSelectedNode(i === selectedNode ? null : i)}>
                <AgentSocialCard
                  agent={agent}
                  stats={socialStats[i]}
                  isSelected={selectedNode === i}
                />
              </div>
            ))}
          </div>
        </div>

        {/* Event feed */}
        <div style={{
          background: C.panel, border: `1px solid ${C.dim}22`,
          borderRadius: 10, padding: 16,
        }}>
          <EventFeed events={events} />
        </div>
      </div>

      {/* Relationship Summary */}
      <div style={{
        background: C.panel, border: `1px solid ${C.dim}22`,
        borderRadius: 10, padding: 16,
      }}>
        <div style={{ fontSize: 10, color: C.cyan, letterSpacing: 2, marginBottom: 12 }}>
          ◈ RELATIONSHIP MATRIX
        </div>
        <RelationshipSummary relationships={relationships} agents={agents} />
      </div>
    </div>
  );
}
