import React, { useState, useEffect, useRef, useCallback } from 'react';
import { API_URL } from '../config';

/* ───── colour palette (retro robot theme) ───── */
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
  gridLine: '#1a1a30',
  gridBg: '#0d0d1a',
};

const CELL = 40;
const GRID = 20;
const CANVAS = CELL * GRID; // 800px

/* ───── object colours ───── */
const OBJ_COLORS = {
  tree: '#22cc66',
  water: '#3388ff',
  food: '#ffdd44',
  tool: '#888899',
  danger: '#ff4444',
};

/* ───── keyframes ───── */
const styleId = 'world-sim-keyframes';
if (typeof document !== 'undefined' && !document.getElementById(styleId)) {
  const el = document.createElement('style');
  el.id = styleId;
  el.textContent = `
    @keyframes ws-fadeIn { from{opacity:0;transform:translateY(8px)} to{opacity:1;transform:translateY(0)} }
    @keyframes ws-pulse { 0%,100%{box-shadow:0 0 4px var(--glow)} 50%{box-shadow:0 0 14px var(--glow)} }
    @keyframes ws-blink { 0%,100%{opacity:1} 50%{opacity:0.3} }
    @keyframes ws-chatBubble { 0%{opacity:0;transform:translateY(0)} 10%{opacity:1;transform:translateY(-4px)} 90%{opacity:1;transform:translateY(-4px)} 100%{opacity:0;transform:translateY(-8px)} }
  `;
  document.head.appendChild(el);
}

/* ───── WorldSimulation Page ───── */
export default function WorldSimulation() {
  const canvasRef = useRef(null);
  const [world, setWorld] = useState(null);
  const [running, setRunning] = useState(false);
  const [tickSpeed, setTickSpeed] = useState(1.0);
  const [selectedAgent, setSelectedAgent] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const intervalRef = useRef(null);

  const fetchState = useCallback(async () => {
    try {
      const res = await fetch(`${API_URL}/world/state`);
      if (!res.ok) throw new Error(`${res.status}`);
      const data = await res.json();
      setWorld(data);
      setRunning(data.running);
      setTickSpeed(data.tick_speed);
      setError(null);
    } catch (e) {
      setError(`Backend unreachable: ${e.message}`);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchState();
  }, [fetchState]);

  // Auto-refresh when running
  useEffect(() => {
    if (running) {
      intervalRef.current = setInterval(fetchState, 1000);
    } else {
      if (intervalRef.current) clearInterval(intervalRef.current);
    }
    return () => { if (intervalRef.current) clearInterval(intervalRef.current); };
  }, [running, fetchState]);

  // ── Canvas rendering ──
  useEffect(() => {
    if (!world || !canvasRef.current) return;
    const ctx = canvasRef.current.getContext('2d');
    renderWorld(ctx, world, selectedAgent);
  }, [world, selectedAgent]);

  const handleStart = async () => {
    await fetch(`${API_URL}/world/start`, { method: 'POST' });
    setRunning(true);
    fetchState();
  };

  const handleStop = async () => {
    await fetch(`${API_URL}/world/stop`, { method: 'POST' });
    setRunning(false);
    fetchState();
  };

  const handleReset = async () => {
    await fetch(`${API_URL}/world/reset`, { method: 'POST' });
    setSelectedAgent(null);
    fetchState();
  };

  const handleTick = async () => {
    await fetch(`${API_URL}/world/tick`, { method: 'POST' });
    fetchState();
  };

  const handleSpeedChange = async (e) => {
    const val = parseFloat(e.target.value);
    setTickSpeed(val);
    await fetch(`${API_URL}/world/config`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ tick_speed: val }),
    });
  };

  const handleCanvasClick = (e) => {
    if (!world) return;
    const rect = canvasRef.current.getBoundingClientRect();
    const scaleX = CANVAS / rect.width;
    const scaleY = CANVAS / rect.height;
    const cx = Math.floor((e.clientX - rect.left) * scaleX / CELL);
    const cy = Math.floor((e.clientY - rect.top) * scaleY / CELL);
    const clicked = world.agents.find(a => a.x === cx && a.y === cy);
    if (clicked) {
      setSelectedAgent(clicked.agent_id === selectedAgent ? null : clicked.agent_id);
    } else {
      setSelectedAgent(null);
    }
  };

  if (loading) return <LoadingSkeleton />;

  const selAgent = world?.agents.find(a => a.agent_id === selectedAgent);
  const totalEnergy = world?.agents.reduce((s, a) => s + (a.alive ? a.energy : 0), 0) || 0;

  return (
    <div style={{ animation: 'ws-fadeIn 0.3s ease-out' }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 16 }}>
        <div style={{ width: 10, height: 10, borderRadius: '50%', background: C.green, boxShadow: `0 0 8px ${C.green}` }} />
        <h2 style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: 18, color: C.green, margin: 0, textTransform: 'uppercase', letterSpacing: 2 }}>
          World Simulation
        </h2>
        {error && <span style={{ color: C.amber, fontSize: 12, fontFamily: 'JetBrains Mono, monospace' }}>{error}</span>}
      </div>

      <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap' }}>
        {/* Canvas column */}
        <div style={{ flexShrink: 0 }}>
          {/* Controls */}
          <div style={panelStyle}>
            <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
              {!running
                ? <button onClick={handleStart} style={btnStyle(C.green)}>&#9654; START</button>
                : <button onClick={handleStop} style={btnStyle(C.red)}>&#9632; STOP</button>
              }
              <button onClick={handleTick} style={btnStyle(C.cyan)}>&#9193; TICK</button>
              <button onClick={handleReset} style={btnStyle(C.amber)}>&#8634; RESET</button>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginLeft: 12 }}>
                <span style={labelStyle}>SPEED</span>
                <input
                  type="range" min="0.1" max="5" step="0.1"
                  value={tickSpeed}
                  onChange={handleSpeedChange}
                  style={{ width: 100, accentColor: C.green }}
                />
                <span style={{ ...labelStyle, color: C.green }}>{tickSpeed.toFixed(1)}s</span>
              </div>
            </div>
          </div>

          {/* Canvas */}
          <canvas
            ref={canvasRef}
            width={CANVAS}
            height={CANVAS}
            onClick={handleCanvasClick}
            style={{
              border: `1px solid ${C.dim}`,
              borderRadius: 6,
              cursor: 'crosshair',
              maxWidth: '100%',
              imageRendering: 'pixelated',
              boxShadow: `0 0 20px rgba(0,255,136,0.08)`,
            }}
          />
        </div>

        {/* Right sidebar */}
        <div style={{ flex: 1, minWidth: 260, maxWidth: 360, display: 'flex', flexDirection: 'column', gap: 12 }}>
          {/* Stats */}
          <div style={panelStyle}>
            <div style={panelTitleStyle}>STATS</div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
              <StatBlock label="TICK" value={world?.tick || 0} color={C.cyan} />
              <StatBlock label="TOTAL ENERGY" value={totalEnergy.toFixed(0)} color={C.green} />
              <StatBlock label="MESSAGES" value={world?.stats?.messages_sent || 0} color={C.amber} />
              <StatBlock label="GATHERED" value={world?.stats?.objects_gathered || 0} color={C.purple} />
              <StatBlock label="ALIVE" value={world?.agents?.filter(a => a.alive).length || 0} color={C.green} />
              <StatBlock label="DANGERS" value={world?.stats?.dangers_encountered || 0} color={C.red} />
            </div>
          </div>

          {/* Agent list */}
          <div style={panelStyle}>
            <div style={panelTitleStyle}>AGENTS</div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              {world?.agents?.map(a => (
                <div
                  key={a.agent_id}
                  onClick={() => setSelectedAgent(a.agent_id === selectedAgent ? null : a.agent_id)}
                  style={{
                    display: 'flex', alignItems: 'center', gap: 8, padding: '6px 8px',
                    borderRadius: 6, cursor: 'pointer',
                    background: a.agent_id === selectedAgent ? C.panelLight : 'transparent',
                    border: a.agent_id === selectedAgent ? `1px solid ${a.color}40` : '1px solid transparent',
                    transition: 'all 0.15s',
                    opacity: a.alive ? 1 : 0.4,
                  }}
                >
                  <div style={{ width: 10, height: 10, borderRadius: '50%', background: a.color, boxShadow: `0 0 6px ${a.color}60` }} />
                  <span style={{ ...labelStyle, color: C.textBright, flex: 1 }}>{a.name}</span>
                  <span style={{ fontSize: 10, fontFamily: 'JetBrains Mono', color: a.energy > 30 ? C.green : C.red }}>
                    {a.energy.toFixed(0)}%
                  </span>
                </div>
              ))}
            </div>
          </div>

          {/* Agent detail */}
          {selAgent && (
            <div style={{ ...panelStyle, animation: 'ws-fadeIn 0.2s ease-out' }}>
              <div style={panelTitleStyle}>{selAgent.name} DETAIL</div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6, fontSize: 12, fontFamily: 'JetBrains Mono, monospace' }}>
                <BarRow label="ENERGY" value={selAgent.energy} color={C.green} />
                <BarRow label="HEALTH" value={selAgent.health} color={C.cyan} />
                <div style={{ color: C.dim }}>
                  POS: ({selAgent.x}, {selAgent.y}) &middot; FACING: {selAgent.direction}
                </div>
                <div style={{ color: C.dim }}>
                  INVENTORY: {Object.entries(selAgent.inventory).map(([k, v]) => `${k}:${v}`).join(', ') || 'empty'}
                </div>
                <div style={{ marginTop: 4 }}>
                  <div style={{ color: C.amber, marginBottom: 4 }}>RECENT MESSAGES:</div>
                  {selAgent.messages.length === 0 && <div style={{ color: C.dim }}>(none)</div>}
                  {selAgent.messages.slice(-5).reverse().map((m, i) => (
                    <div key={i} style={{ color: C.text, fontSize: 11, padding: '2px 0', borderBottom: `1px solid ${C.panelLight}` }}>
                      <span style={{ color: C.dim }}>[t{m.tick}]</span> {m.text}
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}

          {/* Chat bubbles feed */}
          <div style={panelStyle}>
            <div style={panelTitleStyle}>LIVE CHAT</div>
            <div style={{ maxHeight: 160, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 4 }}>
              {world?.chat_bubbles?.length === 0 && (
                <div style={{ color: C.dim, fontSize: 11, fontFamily: 'JetBrains Mono' }}>(no active messages)</div>
              )}
              {world?.chat_bubbles?.map((b, i) => (
                <div key={i} style={{
                  fontSize: 11, fontFamily: 'JetBrains Mono, monospace',
                  color: C.text, padding: '3px 6px',
                  background: C.panelLight, borderRadius: 4,
                  borderLeft: `2px solid ${C.green}`,
                }}>
                  <span style={{ color: C.green }}>[{b.agent_id}]</span> {b.text}
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

/* ───── Canvas rendering ───── */
function renderWorld(ctx, world, selectedAgent) {
  const w = ctx.canvas.width;
  const h = ctx.canvas.height;

  // Background
  ctx.fillStyle = C.gridBg;
  ctx.fillRect(0, 0, w, h);

  // Grid lines
  ctx.strokeStyle = C.gridLine;
  ctx.lineWidth = 0.5;
  for (let x = 0; x <= GRID; x++) {
    ctx.beginPath();
    ctx.moveTo(x * CELL, 0);
    ctx.lineTo(x * CELL, h);
    ctx.stroke();
  }
  for (let y = 0; y <= GRID; y++) {
    ctx.beginPath();
    ctx.moveTo(0, y * CELL);
    ctx.lineTo(w, y * CELL);
    ctx.stroke();
  }

  // Objects
  for (const obj of world.objects) {
    if (obj.quantity <= 0) continue;
    const cx = obj.x * CELL + CELL / 2;
    const cy = obj.y * CELL + CELL / 2;
    const col = OBJ_COLORS[obj.type] || C.dim;
    const alpha = Math.min(1, obj.quantity / 5);

    ctx.globalAlpha = 0.4 + alpha * 0.5;
    if (obj.type === 'danger') {
      ctx.fillStyle = col;
      ctx.globalAlpha = 0.3 + Math.sin(Date.now() / 300) * 0.2;
      ctx.fillRect(obj.x * CELL + 2, obj.y * CELL + 2, CELL - 4, CELL - 4);
      ctx.globalAlpha = 1;
      ctx.fillStyle = col;
      ctx.font = '18px sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText('\u26A0', cx, cy);
    } else if (obj.type === 'tree') {
      ctx.fillStyle = col;
      ctx.font = '20px sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText('\uD83C\uDF32', cx, cy);
    } else if (obj.type === 'water') {
      ctx.fillStyle = col;
      ctx.font = '18px sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText('\uD83D\uDCA7', cx, cy);
    } else if (obj.type === 'food') {
      ctx.fillStyle = col;
      ctx.font = '18px sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText('\uD83C\uDF4E', cx, cy);
    } else if (obj.type === 'tool') {
      ctx.fillStyle = col;
      ctx.font = '16px sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText('\uD83D\uDD27', cx, cy);
    }
    ctx.globalAlpha = 1;
  }

  // Agents
  for (const agent of world.agents) {
    if (!agent.alive) continue;
    const cx = agent.x * CELL + CELL / 2;
    const cy = agent.y * CELL + CELL / 2;
    const isSelected = agent.agent_id === selectedAgent;

    // Selection glow
    if (isSelected) {
      ctx.strokeStyle = agent.color;
      ctx.lineWidth = 2;
      ctx.globalAlpha = 0.5;
      ctx.strokeRect(agent.x * CELL + 2, agent.y * CELL + 2, CELL - 4, CELL - 4);
      ctx.globalAlpha = 1;
    }

    // Agent body
    ctx.beginPath();
    ctx.arc(cx, cy, 14, 0, Math.PI * 2);
    ctx.fillStyle = agent.color;
    ctx.globalAlpha = 0.9;
    ctx.fill();
    ctx.globalAlpha = 1;
    ctx.strokeStyle = C.textBright;
    ctx.lineWidth = 1.5;
    ctx.stroke();

    // Direction arrow
    const dirs = { up: [0, -1], down: [0, 1], left: [-1, 0], right: [1, 0] };
    const [dx, dy] = dirs[agent.direction] || [0, 1];
    ctx.beginPath();
    ctx.moveTo(cx, cy);
    ctx.lineTo(cx + dx * 18, cy + dy * 18);
    ctx.strokeStyle = C.textBright;
    ctx.lineWidth = 2;
    ctx.stroke();

    // Agent name (small)
    ctx.fillStyle = C.textBright;
    ctx.font = '8px JetBrains Mono, monospace';
    ctx.textAlign = 'center';
    ctx.fillText(agent.name, cx, cy + 3);

    // Energy bar above
    const barW = 30;
    const barH = 4;
    const barX = cx - barW / 2;
    const barY = agent.y * CELL - 4;
    ctx.fillStyle = '#111';
    ctx.fillRect(barX, barY, barW, barH);
    const eFrac = agent.energy / 100;
    ctx.fillStyle = eFrac > 0.5 ? C.green : eFrac > 0.25 ? C.amber : C.red;
    ctx.fillRect(barX, barY, barW * eFrac, barH);
  }

  // Chat bubbles (on canvas)
  for (const bubble of world.chat_bubbles) {
    const bx = bubble.x * CELL + CELL / 2;
    const by = bubble.y * CELL - 20;
    const text = bubble.text.length > 40 ? bubble.text.slice(0, 40) + '\u2026' : bubble.text;

    ctx.font = '9px JetBrains Mono, monospace';
    const measured = ctx.measureText(text).width;
    const bw = measured + 16;
    const bh = 18;
    const bbx = bx - bw / 2;
    const bby = by - bh / 2;

    // Bubble background
    ctx.fillStyle = 'rgba(26,26,46,0.92)';
    roundRect(ctx, bbx, bby, bw, bh, 4);
    ctx.fill();

    // Bubble border
    ctx.strokeStyle = C.green + '60';
    ctx.lineWidth = 0.5;
    roundRect(ctx, bbx, bby, bw, bh, 4);
    ctx.stroke();

    // Text
    ctx.fillStyle = C.green;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(text, bx, by);
  }
}

function roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.lineTo(x + w - r, y);
  ctx.quadraticCurveTo(x + w, y, x + w, y + r);
  ctx.lineTo(x + w, y + h - r);
  ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
  ctx.lineTo(x + r, y + h);
  ctx.quadraticCurveTo(x, y + h, x, y + h - r);
  ctx.lineTo(x, y + r);
  ctx.quadraticCurveTo(x, y, x + r, y);
  ctx.closePath();
}

/* ───── Sub-components ───── */
function StatBlock({ label, value, color }) {
  return (
    <div style={{ padding: '6px 8px', background: C.panelLight, borderRadius: 6 }}>
      <div style={{ fontSize: 9, fontFamily: 'JetBrains Mono, monospace', color: C.dim, textTransform: 'uppercase' }}>{label}</div>
      <div style={{ fontSize: 20, fontFamily: 'JetBrains Mono, monospace', color, fontWeight: 700 }}>{value}</div>
    </div>
  );
}

function BarRow({ label, value, color }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
      <span style={{ width: 50, color: C.dim }}>{label}</span>
      <div style={{ flex: 1, height: 8, background: '#111', borderRadius: 4, overflow: 'hidden' }}>
        <div style={{ width: `${Math.max(0, Math.min(100, value))}%`, height: '100%', background: color, borderRadius: 4, transition: 'width 0.3s ease' }} />
      </div>
      <span style={{ width: 36, textAlign: 'right', color }}>{value.toFixed(1)}%</span>
    </div>
  );
}

function LoadingSkeleton() {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16, padding: 20 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
        <div style={{ width: 10, height: 10, borderRadius: '50%', background: C.dim }} />
        <div style={{ width: 200, height: 20, background: C.panel, borderRadius: 4 }} />
      </div>
      <div style={{ display: 'flex', gap: 16 }}>
        <div style={{ width: 800, height: 800, background: C.panel, borderRadius: 6 }} />
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 12 }}>
          {[1, 2, 3].map(i => (
            <div key={i} style={{ height: 100, background: C.panel, borderRadius: 6 }} />
          ))}
        </div>
      </div>
    </div>
  );
}

/* ───── Styles ───── */
const panelStyle = {
  background: C.panel,
  border: `1px solid ${C.dim}33`,
  borderRadius: 8,
  padding: 12,
  fontFamily: 'JetBrains Mono, monospace',
};

const panelTitleStyle = {
  fontSize: 10,
  color: C.dim,
  textTransform: 'uppercase',
  letterSpacing: 2,
  marginBottom: 8,
  fontFamily: 'JetBrains Mono, monospace',
};

const labelStyle = {
  fontSize: 10,
  color: C.text,
  fontFamily: 'JetBrains Mono, monospace',
  textTransform: 'uppercase',
};

function btnStyle(color) {
  return {
    background: 'transparent',
    border: `1px solid ${color}60`,
    color,
    padding: '6px 14px',
    borderRadius: 6,
    cursor: 'pointer',
    fontFamily: 'JetBrains Mono, monospace',
    fontSize: 11,
    textTransform: 'uppercase',
    letterSpacing: 1,
    transition: 'all 0.15s',
  };
}
