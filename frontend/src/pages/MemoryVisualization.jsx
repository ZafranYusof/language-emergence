import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import * as api from '../utils/api';

/* ───── colour palette (retro robot theme) ───── */
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
  node: '#0d0d22',
};

/* ───── keyframes ───── */
const styleId = 'mem-viz-keyframes';
if (typeof document !== 'undefined' && !document.getElementById(styleId)) {
  const el = document.createElement('style');
  el.id = styleId;
  el.textContent = `
    @keyframes mv-float { 0%,100%{transform:translateY(0)} 50%{transform:translateY(-4px)} }
    @keyframes mv-pulse { 0%,100%{filter:drop-shadow(0 0 4px var(--glow,C.green))} 50%{filter:drop-shadow(0 0 14px var(--glow,C.green))} }
    @keyframes mv-fadeIn { from{opacity:0;transform:translateY(10px)} to{opacity:1;transform:translateY(0)} }
    @keyframes mv-line-flow { from{stroke-dashoffset:20} to{stroke-dashoffset:0} }
    @keyframes mv-pop { 0%{transform:scale(0)} 60%{transform:scale(1.2)} 100%{transform:scale(1)} }
    @keyframes mv-scan { 0%{background-position:0% 0%} 100%{background-position:0% 100%} }
  `;
  document.head.appendChild(el);
}

/* ───── helpers ───── */
const pct = (v) => `${Math.round((v || 0) * 100)}%`;
const clamp01 = (v) => Math.max(0, Math.min(1, v || 0));

const confColor = (c) => {
  if (c >= 0.8) return C.green;
  if (c >= 0.6) return C.cyan;
  if (c >= 0.4) return C.amber;
  return C.red;
};

const confLabel = (c) => {
  if (c >= 0.8) return 'HIGH';
  if (c >= 0.6) return 'MED';
  if (c >= 0.4) return 'LOW';
  return 'V.LOW';
};

/* ───── Agent sprite mini pixel art ───── */
const AGENT_COLORS = {
  mage:     { primary: '#4477cc', secondary: '#3355aa' },
  knight:   { primary: '#cc4444', secondary: '#aa2222' },
  sage:     { primary: '#9966cc', secondary: '#7744aa' },
  ranger:   { primary: '#449944', secondary: '#337733' },
  cleric:   { primary: '#ffffff', secondary: '#dddddd' },
  assassin: { primary: '#555555', secondary: '#333333' },
  engineer: { primary: '#dd8833', secondary: '#bb6622' },
  oracle:   { primary: '#22cccc', secondary: '#009999' },
};

const AGENTS = [
  { id: 'mage',     name: 'Observer',   role: 'Speaker' },
  { id: 'knight',   name: 'Worker',     role: 'Listener' },
  { id: 'sage',     name: 'Scholar',    role: 'Speaker' },
  { id: 'ranger',   name: 'Scout',      role: 'Listener' },
  { id: 'cleric',   name: 'Healer',     role: 'Speaker' },
  { id: 'assassin', name: 'Rogue',      role: 'Listener' },
  { id: 'engineer', name: 'Artificer',  role: 'Speaker' },
  { id: 'oracle',   name: 'Mystic',     role: 'Listener' },
];

/* ───── Synthetic memory entries per agent ───── */
function generateSyntheticMemories(agentId) {
  const pools = {
    mage: [
      { id: 'm1', content: 'Symbol 7 correlates with high-hue objects', type: 'pattern', confidence: 0.92, connections: ['m2', 'm4'] },
      { id: 'm2', content: 'Listener responds better to repeated symbols', type: 'observation', confidence: 0.85, connections: ['m1', 'm3'] },
      { id: 'm3', content: 'Size feature has low encoding fidelity', type: 'insight', confidence: 0.67, connections: ['m5'] },
      { id: 'm4', content: 'Round objects → even-numbered symbols', type: 'pattern', confidence: 0.78, connections: ['m1'] },
      { id: 'm5', content: 'Reward improved after symbol 22 redesign', type: 'experience', confidence: 0.71, connections: ['m3', 'm6'] },
      { id: 'm6', content: 'Partner performs well on hue discrimination', type: 'partner_eval', confidence: 0.88, connections: ['m2'] },
    ],
    knight: [
      { id: 'k1', content: 'Symbol 11 means "red-ish object"', type: 'mapping', confidence: 0.89, connections: ['k2'] },
      { id: 'k2', content: 'High confidence on border feature decode', type: 'skill', confidence: 0.93, connections: ['k1', 'k3'] },
      { id: 'k3', content: 'Confused by symbol 4 vs 14', type: 'confusion', confidence: 0.45, connections: ['k4'] },
      { id: 'k4', content: 'Speaker prefers 3-symbol messages', type: 'observation', confidence: 0.72, connections: ['k2'] },
      { id: 'k5', content: 'Square shapes easiest to identify', type: 'insight', confidence: 0.81, connections: ['k2'] },
    ],
    sage: [
      { id: 's1', content: 'Compositionality emerging in symbol pairs', type: 'pattern', confidence: 0.76, connections: ['s2', 's3'] },
      { id: 's2', content: 'First symbol = hue, second = size convention', type: 'grammar', confidence: 0.82, connections: ['s1'] },
      { id: 's3', content: 'Entropy decreasing over episodes', type: 'trend', confidence: 0.69, connections: ['s4'] },
      { id: 's4', content: 'Vocabulary stable at ~25 symbols', type: 'statistic', confidence: 0.91, connections: ['s1'] },
    ],
    ranger: [
      { id: 'r1', content: 'Unusual symbol pattern in last 10 episodes', type: 'anomaly', confidence: 0.58, connections: ['r2'] },
      { id: 'r2', content: 'Listener accuracy dropped on opacity tasks', type: 'alert', confidence: 0.73, connections: ['r3'] },
      { id: 'r3', content: 'New competitor strategy detected', type: 'threat', confidence: 0.44, connections: ['r1'] },
      { id: 'r4', content: 'Rotation feature underused in encoding', type: 'gap', confidence: 0.66, connections: ['r2'] },
    ],
    cleric: [
      { id: 'c1', content: 'Communication health: 78% success rate', type: 'health', confidence: 0.95, connections: ['c2'] },
      { id: 'c2', content: 'Recovery after mid-session confusion', type: 'healing', confidence: 0.87, connections: ['c3'] },
      { id: 'c3', content: 'Emotional stability improving', type: 'wellbeing', confidence: 0.81, connections: ['c1'] },
    ],
    assassin: [
      { id: 'a1', content: 'Speaker occasionally sends decoy symbols', type: 'suspicion', confidence: 0.52, connections: ['a2'] },
      { id: 'a2', content: 'Reward hacking pattern in episodes 40-50', type: 'exploit', confidence: 0.68, connections: ['a3'] },
      { id: 'a3', content: 'Symbol collision vulnerability found', type: 'weakness', confidence: 0.74, connections: ['a1'] },
      { id: 'a4', content: 'Listener over-relies on first symbol position', type: 'bias', confidence: 0.61, connections: ['a2'] },
      { id: 'a5', content: 'Stealth encoding strategy viable', type: 'strategy', confidence: 0.55, connections: ['a3'] },
    ],
    engineer: [
      { id: 'e1', content: 'Symbol generation pipeline optimized', type: 'build', confidence: 0.88, connections: ['e2'] },
      { id: 'e2', content: 'Latency reduced by using lookup table', type: 'optimization', confidence: 0.91, connections: ['e1', 'e3'] },
      { id: 'e3', content: 'New encoding schema v2 deployed', type: 'deploy', confidence: 0.79, connections: ['e2'] },
      { id: 'e4', content: 'Hotfix: symbol collision on codes 15/16', type: 'fix', confidence: 0.95, connections: ['e3'] },
    ],
    oracle: [
      { id: 'o1', content: 'Predicting convergence in ~30 episodes', type: 'prediction', confidence: 0.63, connections: ['o2'] },
      { id: 'o2', content: 'Vision: shared vocabulary will reach 30 symbols', type: 'prophecy', confidence: 0.57, connections: ['o3'] },
      { id: 'o3', content: 'Foresaw the compositionality breakthrough', type: 'vision', confidence: 0.71, connections: ['o1'] },
      { id: 'o4', content: 'Sensing tension in speaker-listener dynamic', type: 'intuition', confidence: 0.49, connections: ['o2'] },
    ],
  };
  return pools[agentId] || [];
}

/* ───── SVG Mind Map Node ───── */
function MindMapNode({ node, x, y, isSelected, onClick, color, animDelay = 0 }) {
  const conf = node.confidence || 0.5;
  const c = confColor(conf);
  const size = 60 + conf * 40; // bigger node = higher confidence
  const icon = {
    pattern: '🔮', observation: '👁', insight: '💡', experience: '📖',
    mapping: '🗺', skill: '⚔', confusion: '❓', partner_eval: '⚖',
    grammar: '📝', trend: '📈', statistic: '📊', anomaly: '⚠',
    alert: '🚨', threat: '🛡', gap: '🔍', health: '💚', healing: '✨',
    wellbeing: '🌸', suspicion: '🕵', exploit: '🕳', weakness: '💔',
    strategy: '🎯', bias: '⚖', build: '🔧', optimization: '⚡',
    deploy: '🚀', fix: '🩹', prediction: '🔮', prophecy: '🌟',
    vision: '👁‍🗨', intuition: '💫',
  }[node.type] || '💭';

  return (
    <g
      transform={`translate(${x}, ${y})`}
      onClick={() => onClick(node.id)}
      style={{ cursor: 'pointer', animation: `mv-pop 0.4s ease-out ${animDelay}s both` }}
    >
      {/* Glow ring for confidence */}
      <circle
        r={size / 2 + 6}
        fill="none"
        stroke={c}
        strokeWidth={2}
        opacity={0.3 + conf * 0.4}
        strokeDasharray={isSelected ? '0' : '4 4'}
      >
        {isSelected && (
          <animate attributeName="r" values={`${size/2+4};${size/2+10};${size/2+4}`} dur="2s" repeatCount="indefinite" />
        )}
      </circle>
      {/* Main node circle */}
      <circle
        r={size / 2}
        fill={`${C.node}ee`}
        stroke={isSelected ? C.green : c}
        strokeWidth={isSelected ? 3 : 2}
        style={{ filter: isSelected ? `drop-shadow(0 0 8px ${C.green})` : `drop-shadow(0 0 4px ${c}44)` }}
      />
      {/* Icon */}
      <text textAnchor="middle" dominantBaseline="central" fontSize={size * 0.35} style={{ pointerEvents: 'none' }}>
        {icon}
      </text>
      {/* Confidence badge */}
      <g transform={`translate(${size/2 - 4}, ${-size/2 + 4})`}>
        <rect x={-14} y={-8} width={28} height={16} rx={3} fill={c} opacity={0.9} />
        <text textAnchor="middle" dominantBaseline="central" fontSize={8} fill="#000" fontWeight="bold" fontFamily="JetBrains Mono, monospace">
          {pct(conf)}
        </text>
      </g>
      {/* Label below */}
      <text
        y={size / 2 + 14}
        textAnchor="middle"
        fontSize={9}
        fill={C.text}
        fontFamily="JetBrains Mono, monospace"
        style={{ pointerEvents: 'none' }}
      >
        {node.type.toUpperCase()}
      </text>
    </g>
  );
}

/* ───── Connection Line ───── */
function ConnectionLine({ x1, y1, x2, y2, strength = 0.5 }) {
  const c = confColor(strength);
  return (
    <line
      x1={x1} y1={y1} x2={x2} y2={y2}
      stroke={c}
      strokeWidth={1 + strength * 2}
      opacity={0.2 + strength * 0.3}
      strokeDasharray="6 4"
      style={{ animation: 'mv-line-flow 1s linear infinite' }}
    />
  );
}

/* ───── Memory Detail Panel ───── */
function MemoryDetail({ node, onClose }) {
  if (!node) return null;
  const c = confColor(node.confidence);

  return (
    <div style={{
      background: `linear-gradient(135deg, ${C.panel}, ${C.panelLight})`,
      border: `2px solid ${c}66`,
      borderRadius: 8, padding: 20,
      animation: 'mv-fadeIn 0.3s ease-out',
    }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
        <div style={{
          fontFamily: "'Press Start 2P', monospace", fontSize: 10,
          color: c, letterSpacing: 2,
        }}>
          ◆ MEMORY DETAIL
        </div>
        <button onClick={onClose} style={{
          background: 'transparent', border: `1px solid ${C.dim}66`, color: C.dim,
          padding: '4px 8px', cursor: 'pointer', fontSize: 10, fontFamily: 'JetBrains Mono, monospace',
          borderRadius: 4,
        }}>✕</button>
      </div>

      <div style={{ marginBottom: 12 }}>
        <div style={{ fontSize: 9, color: C.dim, marginBottom: 4, fontFamily: 'JetBrains Mono, monospace', letterSpacing: 1 }}>
          TYPE
        </div>
        <div style={{ fontSize: 14, color: C.textBright, fontFamily: 'JetBrains Mono, monospace' }}>
          {node.type.toUpperCase()}
        </div>
      </div>

      <div style={{ marginBottom: 12 }}>
        <div style={{ fontSize: 9, color: C.dim, marginBottom: 4, fontFamily: 'JetBrains Mono, monospace', letterSpacing: 1 }}>
          CONTENT
        </div>
        <div style={{
          fontSize: 12, color: C.text, fontFamily: 'JetBrains Mono, monospace',
          background: `${C.bg}88`, padding: '8px 12px', borderRadius: 4,
          border: `1px solid ${C.dim}22`,
        }}>
          {node.content}
        </div>
      </div>

      <div style={{ display: 'flex', gap: 16 }}>
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: 9, color: C.dim, marginBottom: 4, fontFamily: 'JetBrains Mono, monospace', letterSpacing: 1 }}>
            CONFIDENCE
          </div>
          <div style={{
            display: 'flex', alignItems: 'center', gap: 8,
            background: `${C.bg}88`, padding: '8px 12px', borderRadius: 4,
            border: `1px solid ${C.dim}22`,
          }}>
            <div style={{ flex: 1, height: 8, background: `${C.dim}33`, borderRadius: 4, overflow: 'hidden' }}>
              <div style={{
                width: pct(node.confidence), height: '100%',
                background: `linear-gradient(90deg, ${c}88, ${c})`,
                boxShadow: `0 0 8px ${c}44`,
                transition: 'width 0.5s ease',
              }} />
            </div>
            <span style={{ fontSize: 12, color: c, fontFamily: 'JetBrains Mono, monospace', fontWeight: 'bold' }}>
              {pct(node.confidence)}
            </span>
            <span style={{
              fontSize: 7, color: '#000', background: c,
              padding: '2px 6px', borderRadius: 3, fontFamily: "'Press Start 2P', monospace",
            }}>
              {confLabel(node.confidence)}
            </span>
          </div>
        </div>
        <div>
          <div style={{ fontSize: 9, color: C.dim, marginBottom: 4, fontFamily: 'JetBrains Mono, monospace', letterSpacing: 1 }}>
            CONNECTIONS
          </div>
          <div style={{
            fontSize: 18, color: C.cyan, fontFamily: "'Press Start 2P', monospace",
            textAlign: 'center', background: `${C.bg}88`, padding: '8px 16px', borderRadius: 4,
            border: `1px solid ${C.dim}22`,
          }}>
            {node.connections?.length || 0}
          </div>
        </div>
      </div>
    </div>
  );
}

/* ───── Agent Selector Pill ───── */
function AgentPill({ agent, isActive, onClick }) {
  const ac = AGENT_COLORS[agent.id] || {};
  return (
    <button onClick={onClick} style={{
      display: 'flex', alignItems: 'center', gap: 6,
      padding: '6px 12px', borderRadius: 6,
      background: isActive ? `${ac.primary}22` : 'transparent',
      border: `1px solid ${isActive ? ac.primary : C.dim + '44'}`,
      cursor: 'pointer', transition: 'all 0.2s',
      fontFamily: 'JetBrains Mono, monospace', fontSize: 10,
      color: isActive ? ac.primary : C.dim,
    }}>
      <span style={{
        width: 8, height: 8, borderRadius: '50%',
        background: ac.primary, boxShadow: isActive ? `0 0 6px ${ac.primary}` : 'none',
      }} />
      {agent.name}
      <span style={{ fontSize: 7, color: C.dim, marginLeft: 2 }}>({agent.role})</span>
    </button>
  );
}

/* ───── Main Component ───── */
export default function MemoryVisualization({ sessionId }) {
  const [selectedAgent, setSelectedAgent] = useState('mage');
  const [selectedNode, setSelectedNode] = useState(null);
  const [memories, setMemories] = useState([]);
  const [loading, setLoading] = useState(false);
  const [sessions, setSessions] = useState([]);
  const [activeSession, setActiveSession] = useState(sessionId);
  const svgRef = useRef(null);

  useEffect(() => {
    api.fetchSessions().then(s => {
      setSessions(s);
      if (!activeSession && s.length > 0) setActiveSession(s[0].id);
    }).catch(() => {});
  }, []);

  // Try to fetch real data, fall back to synthetic
  useEffect(() => {
    if (!activeSession) return;
    setLoading(true);
    api.fetchMinds(activeSession).then(data => {
      const agentData = data?.[selectedAgent];
      if (agentData?.memory_bank?.length > 0) {
        setMemories(agentData.memory_bank.map((m, i) => ({
          id: m.id || `mem-${i}`,
          content: m.content || m.text || 'Memory entry',
          type: m.type || 'observation',
          confidence: m.confidence || m.importance || 0.5 + Math.random() * 0.4,
          connections: m.connections || [],
        })));
      } else {
        setMemories(generateSyntheticMemories(selectedAgent));
      }
      setLoading(false);
    }).catch(() => {
      setMemories(generateSyntheticMemories(selectedAgent));
      setLoading(false);
    });
  }, [activeSession, selectedAgent]);

  // Layout nodes in a force-directed-ish pattern
  const nodePositions = useMemo(() => {
    const cx = 300, cy = 200;
    const n = memories.length;
    if (n === 0) return {};
    const positions = {};
    memories.forEach((m, i) => {
      const angle = (2 * Math.PI * i) / n - Math.PI / 2;
      const radius = 100 + (i % 2) * 50;
      positions[m.id] = {
        x: cx + radius * Math.cos(angle),
        y: cy + radius * Math.sin(angle),
      };
    });
    return positions;
  }, [memories]);

  // Build connection lines
  const connections = useMemo(() => {
    const lines = [];
    memories.forEach(m => {
      const from = nodePositions[m.id];
      if (!from) return;
      (m.connections || []).forEach(targetId => {
        const to = nodePositions[targetId];
        if (!to) return;
        const key = [m.id, targetId].sort().join('-');
        if (!lines.find(l => l.key === key)) {
          lines.push({
            key,
            x1: from.x, y1: from.y,
            x2: to.x, y2: to.y,
            strength: (m.confidence + (memories.find(mm => mm.id === targetId)?.confidence || 0.5)) / 2,
          });
        }
      });
    });
    return lines;
  }, [memories, nodePositions]);

  const selectedMem = memories.find(m => m.id === selectedNode);
  const currentAgent = AGENTS.find(a => a.id === selectedAgent);
  const ac = AGENT_COLORS[selectedAgent];

  return (
    <div style={{ padding: 24, maxWidth: 1000, margin: '0 auto' }}>
      {/* CRT Header */}
      <div style={{
        background: 'linear-gradient(135deg, #1a1a2e, #16213e)',
        border: `2px solid ${C.green}`, borderRadius: 4, padding: '14px 20px',
        marginBottom: 20, position: 'relative', overflow: 'hidden',
      }}>
        <div style={{
          position: 'absolute', inset: 0, pointerEvents: 'none',
          background: 'repeating-linear-gradient(0deg,transparent,transparent 2px,rgba(0,255,136,0.03) 2px,rgba(0,255,136,0.03) 4px)',
        }} />
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <span style={{ fontSize: 24 }}>🧠</span>
          <div>
            <h2 style={{
              fontFamily: "'Press Start 2P', monospace", fontSize: 13,
              color: C.green, margin: 0, textShadow: '0 0 10px rgba(0,255,136,0.5)',
            }}>
              ◆ MEMORY VISUALIZATION
            </h2>
            <p style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: 10, color: '#555', margin: '4px 0 0' }}>
              Mind map of agent memory banks
            </p>
          </div>
          <div style={{ marginLeft: 'auto', textAlign: 'right' }}>
            <div style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: 9, color: C.dim }}>
              {memories.length} memories loaded
            </div>
            <div style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: 8, color: ac?.primary || C.dim }}>
              {currentAgent?.name} — {currentAgent?.role}
            </div>
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

      {/* Agent Selector */}
      <div style={{
        display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 20,
        padding: '12px', background: C.panel, borderRadius: 8,
        border: `1px solid ${C.dim}22`,
      }}>
        {AGENTS.map(a => (
          <AgentPill
            key={a.id}
            agent={a}
            isActive={selectedAgent === a.id}
            onClick={() => { setSelectedAgent(a.id); setSelectedNode(null); }}
          />
        ))}
      </div>

      {/* Main content: Mind Map + Detail */}
      <div style={{ display: 'flex', gap: 20 }}>
        {/* Mind Map Canvas */}
        <div style={{
          flex: 1, background: `${C.bg}cc`, borderRadius: 8,
          border: `1px solid ${C.dim}33`, position: 'relative', overflow: 'hidden',
          minHeight: 440,
        }}>
          {/* Scanline overlay */}
          <div style={{
            position: 'absolute', inset: 0, pointerEvents: 'none',
            background: 'repeating-linear-gradient(0deg,transparent,transparent 3px,rgba(0,255,136,0.015) 3px,rgba(0,255,136,0.015) 6px)',
            zIndex: 2,
          }} />

          {loading ? (
            <div style={{
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              height: 400, color: C.dim, fontFamily: 'JetBrains Mono, monospace', fontSize: 12,
            }}>
              <span style={{ animation: 'mv-pulse 1.5s ease-in-out infinite' }}>◉</span>
              &nbsp;Loading memory data...
            </div>
          ) : (
            <svg
              ref={svgRef}
              viewBox="0 0 600 400"
              style={{ width: '100%', height: 440 }}
            >
              {/* Grid background */}
              <defs>
                <pattern id="grid" width="20" height="20" patternUnits="userSpaceOnUse">
                  <path d="M 20 0 L 0 0 0 20" fill="none" stroke={`${C.dim}11`} strokeWidth="0.5" />
                </pattern>
              </defs>
              <rect width="600" height="400" fill="url(#grid)" />

              {/* Central hub */}
              <circle cx="300" cy="200" r={30} fill={`${C.node}cc`} stroke={ac?.primary || C.dim} strokeWidth={2} opacity={0.4} />
              <text x="300" y="200" textAnchor="middle" dominantBaseline="central" fontSize={20}>
                🧠
              </text>
              <text x="300" y="235" textAnchor="middle" fontSize={8} fill={C.dim} fontFamily="JetBrains Mono, monospace">
                MEMORY HUB
              </text>

              {/* Connection lines */}
              {connections.map(line => (
                <ConnectionLine key={line.key} {...line} />
              ))}

              {/* Nodes */}
              {memories.map((m, i) => {
                const pos = nodePositions[m.id];
                if (!pos) return null;
                return (
                  <MindMapNode
                    key={m.id}
                    node={m}
                    x={pos.x}
                    y={pos.y}
                    isSelected={selectedNode === m.id}
                    onClick={setSelectedNode}
                    color={ac?.primary || C.green}
                    animDelay={i * 0.1}
                  />
                );
              })}
            </svg>
          )}

          {/* Legend */}
          <div style={{
            position: 'absolute', bottom: 8, left: 8,
            background: `${C.panel}dd`, borderRadius: 4, padding: '6px 10px',
            border: `1px solid ${C.dim}22`,
          }}>
            <div style={{ fontFamily: "'Press Start 2P', monospace", fontSize: 6, color: C.dim, marginBottom: 4 }}>
              CONFIDENCE
            </div>
            <div style={{ display: 'flex', gap: 8 }}>
              {[
                { label: 'HIGH', c: C.green, range: '80-100%' },
                { label: 'MED', c: C.cyan, range: '60-80%' },
                { label: 'LOW', c: C.amber, range: '40-60%' },
                { label: 'V.LOW', c: C.red, range: '0-40%' },
              ].map(item => (
                <div key={item.label} style={{ display: 'flex', alignItems: 'center', gap: 3 }}>
                  <span style={{ width: 6, height: 6, borderRadius: '50%', background: item.c }} />
                  <span style={{ fontSize: 7, color: C.dim, fontFamily: 'JetBrains Mono, monospace' }}>
                    {item.label}
                  </span>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Detail Panel */}
        <div style={{ width: 300, flexShrink: 0 }}>
          {selectedMem ? (
            <MemoryDetail node={selectedMem} onClose={() => setSelectedNode(null)} />
          ) : (
            <div style={{
              background: `linear-gradient(135deg, ${C.panel}, ${C.panelLight})`,
              border: `1px solid ${C.dim}22`, borderRadius: 8, padding: 20,
              textAlign: 'center',
            }}>
              <div style={{ fontSize: 40, marginBottom: 12, animation: 'mv-float 3s ease-in-out infinite' }}>
                💭
              </div>
              <div style={{ fontFamily: "'Press Start 2P', monospace", fontSize: 9, color: C.dim, marginBottom: 8 }}>
                SELECT A MEMORY
              </div>
              <div style={{ fontSize: 11, color: C.dim, fontFamily: 'JetBrains Mono, monospace' }}>
                Click a node in the mind map to view its details
              </div>

              {/* Stats summary */}
              <div style={{
                marginTop: 20, textAlign: 'left',
                background: `${C.bg}88`, borderRadius: 6, padding: 12,
                border: `1px solid ${C.dim}11`,
              }}>
                <div style={{ fontFamily: "'Press Start 2P', monospace", fontSize: 7, color: C.amber, marginBottom: 8 }}>
                  ◆ AGENT STATS
                </div>
                {[
                  { label: 'Total Memories', value: memories.length, color: C.cyan },
                  { label: 'Avg Confidence', value: pct(memories.reduce((s, m) => s + m.confidence, 0) / Math.max(memories.length, 1)), color: C.green },
                  { label: 'Connections', value: connections.length, color: C.amber },
                  { label: 'High Conf', value: memories.filter(m => m.confidence >= 0.8).length, color: C.green },
                ].map(stat => (
                  <div key={stat.label} style={{
                    display: 'flex', justifyContent: 'space-between', marginBottom: 6,
                    fontFamily: 'JetBrains Mono, monospace', fontSize: 10,
                  }}>
                    <span style={{ color: C.dim }}>{stat.label}</span>
                    <span style={{ color: stat.color }}>{stat.value}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
