import React, { useState, useEffect, useCallback, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Network, Play, Square, RefreshCw, Plus, Zap, Activity,
  Users, Brain, ArrowRight, ChevronDown, ChevronUp,
  Pause, Trash2, RotateCcw,
} from 'lucide-react';
import PixelCanvasHeader from '../components/PixelCanvasHeader';

const API_URL = '/api';

const STATUS_COLORS = {
  running: '#00ff88',
  paused: '#ffaa00',
  spawning: '#00ddff',
  stopped: '#ff4444',
};

const SPEC_COLORS = {
  contributor: '#00ff88',
  learner: '#00ddff',
  balanced: '#ffaa00',
  generalist: '#888',
};

function SwarmIntelligence() {
  const [swarmId, setSwarmId] = useState(null);
  const [sessions, setSessions] = useState([]);
  const [metrics, setMetrics] = useState(null);
  const [knowledge, setKnowledge] = useState(null);
  const [running, setRunning] = useState(false);
  const [totalTicks, setTotalTicks] = useState(0);
  const [transferLog, setTransferLog] = useState([]);
  const [selectedSession, setSelectedSession] = useState(null);
  const [numSessions, setNumSessions] = useState(3);
  const [agentsPerSession, setAgentsPerSession] = useState(2);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [particles, setParticles] = useState([]);
  const intervalRef = useRef(null);
  const particleIdRef = useRef(0);

  const fetchStatus = useCallback(async (sid) => {
    if (!sid) return;
    try {
      const res = await fetch(`${API_URL}/swarm/status?swarm_id=${sid}`);
      if (!res.ok) return;
      const data = await res.json();
      setSessions(data.sessions || []);
      setMetrics(data.metrics || null);
      setRunning(data.running || false);
      setTotalTicks(data.total_ticks || 0);
    } catch (e) {
      // silent
    }
  }, []);

  const fetchKnowledge = useCallback(async (sid) => {
    if (!sid) return;
    try {
      const res = await fetch(`${API_URL}/swarm/knowledge?swarm_id=${sid}`);
      if (!res.ok) return;
      const data = await res.json();
      setKnowledge(data);
      setTransferLog(data.transfer_log || []);
    } catch (e) {
      // silent
    }
  }, []);

  // Auto-refresh when running
  useEffect(() => {
    if (running && swarmId) {
      intervalRef.current = setInterval(() => {
        fetchStatus(swarmId);
        fetchKnowledge(swarmId);
      }, 2000);
    } else {
      if (intervalRef.current) clearInterval(intervalRef.current);
    }
    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, [running, swarmId, fetchStatus, fetchKnowledge]);

  // Cleanup swarm on unmount
  useEffect(() => {
    return () => {
      if (swarmId) {
        fetch(`${API_URL}/swarm/stop?swarm_id=${swarmId}`, { method: 'POST' }).catch(() => {});
      }
    };
  }, [swarmId]);

  // Spawn particles for knowledge flow animation
  useEffect(() => {
    if (!running) return;
    const pInterval = setInterval(() => {
      if (sessions.length < 2) return;
      const newParticle = {
        id: ++particleIdRef.current,
        from: Math.floor(Math.random() * sessions.length),
        to: Math.floor(Math.random() * sessions.length),
        progress: 0,
        color: Math.random() > 0.5 ? '#00ff88' : '#00ddff',
      };
      if (newParticle.from !== newParticle.to) {
        setParticles(prev => [...prev.slice(-15), newParticle]);
      }
    }, 800);
    return () => clearInterval(pInterval);
  }, [running, sessions.length]);

  // Animate particles
  useEffect(() => {
    if (particles.length === 0) return;
    const anim = setInterval(() => {
      setParticles(prev =>
        prev
          .map(p => ({ ...p, progress: p.progress + 0.04 }))
          .filter(p => p.progress < 1)
      );
    }, 30);
    return () => clearInterval(anim);
  }, [particles.length]);

  const handleCreate = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`${API_URL}/swarm/create`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ num_sessions: numSessions, agents_per_session: agentsPerSession }),
      });
      if (!res.ok) throw new Error('Failed to create swarm');
      const data = await res.json();
      setSwarmId(data.swarm_id);
      setSessions(data.sessions || []);
      setMetrics(data.metrics || null);
      setRunning(false);
      setTotalTicks(0);
    } catch (e) {
      setError(e.message);
    }
    setLoading(false);
  };

  const handleStart = async () => {
    if (!swarmId) return;
    try {
      await fetch(`${API_URL}/swarm/start?swarm_id=${swarmId}`, { method: 'POST' });
      setRunning(true);
    } catch (e) {
      setError(e.message);
    }
  };

  const handleStop = async () => {
    if (!swarmId) return;
    try {
      await fetch(`${API_URL}/swarm/stop?swarm_id=${swarmId}`, { method: 'POST' });
      setRunning(false);
    } catch (e) {
      setError(e.message);
    }
  };

  const handleSync = async () => {
    if (!swarmId) return;
    try {
      const res = await fetch(`${API_URL}/swarm/sync?swarm_id=${swarmId}`, { method: 'POST' });
      const data = await res.json();
      setSessions(data.sessions || []);
      setMetrics(data.metrics || null);
      fetchKnowledge(swarmId);
    } catch (e) {
      setError(e.message);
    }
  };

  const handleTick = async (count = 1) => {
    if (!swarmId) return;
    try {
      const res = await fetch(`${API_URL}/swarm/tick`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ swarm_id: swarmId, count }),
      });
      const data = await res.json();
      setSessions(data.sessions || []);
      setMetrics(data.metrics || null);
      setTotalTicks(data.total_ticks || 0);
      fetchKnowledge(swarmId);
    } catch (e) {
      setError(e.message);
    }
  };

  const handleSpawnSession = async () => {
    if (!swarmId) return;
    try {
      const res = await fetch(`${API_URL}/swarm/spawn`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ swarm_id: swarmId, session_id: '' }),
      });
      const data = await res.json();
      setSessions(data.sessions || []);
    } catch (e) {
      setError(e.message);
    }
  };

  const handleKillSession = async (sessionId) => {
    if (!swarmId) return;
    try {
      await fetch(`${API_URL}/swarm/kill`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ swarm_id: swarmId, session_id: sessionId }),
      });
      fetchStatus(swarmId);
      if (selectedSession?.session_id === sessionId) setSelectedSession(null);
    } catch (e) {
      setError(e.message);
    }
  };

  const handlePauseSession = async (sessionId) => {
    if (!swarmId) return;
    try {
      await fetch(`${API_URL}/swarm/pause`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ swarm_id: swarmId, session_id: sessionId }),
      });
      fetchStatus(swarmId);
    } catch (e) {
      setError(e.message);
    }
  };

  const handleResumeSession = async (sessionId) => {
    if (!swarmId) return;
    try {
      await fetch(`${API_URL}/swarm/resume`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ swarm_id: swarmId, session_id: sessionId }),
      });
      fetchStatus(swarmId);
    } catch (e) {
      setError(e.message);
    }
  };

  // Calculate hive-mind hub position for SVG
  const hubX = 200;
  const hubY = 120;
  const getSessionPos = (index, total) => {
    const angle = (2 * Math.PI * index) / total - Math.PI / 2;
    const rx = 160;
    const ry = 100;
    return {
      x: hubX + rx * Math.cos(angle),
      y: hubY + ry * Math.sin(angle),
    };
  };

  return (
    <div className="space-y-6 font-mono">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Network size={28} className="text-[#00ff88]" />
          <div>
            <h1 className="text-2xl font-bold text-[#e0e0e0]">Swarm Intelligence</h1>
            <p className="text-xs text-[#888]">Multi-session parallel training with shared HiveMind</p>
          </div>
        </div>
        {swarmId && (
          <div className="flex items-center gap-2 text-xs text-[#888]">
            <span className="text-[#00ddff]">SWARM</span>
            <span className="text-[#555]">|</span>
            <span className="text-[#ffaa00]">{swarmId}</span>
            <span className="text-[#555]">|</span>
            <span>Ticks: <span className="text-[#00ff88]">{totalTicks}</span></span>
          </div>
        )}
      </div>

      {/* Pixel art swarm scene */}
      <PixelCanvasHeader
        agents={(sessions || []).slice(0, 5).map((s, i) => ({
          name: s.name || `S${i}`,
          color: ['#00ff88', '#00ddff', '#ffaa00', '#aa66ff', '#ff66aa'][i % 5],
          sprite: ['mage', 'knight', 'ranger', 'cleric', 'sage'][i % 5],
        }))}
        height={120}
        label="SWARM HIVE MIND"
      />

      {error && (
        <motion.div
          initial={{ opacity: 0, y: -10 }}
          animate={{ opacity: 1, y: 0 }}
          className="bg-red-900/20 border border-red-500/30 text-red-300 px-4 py-2 rounded-lg text-sm"
        >
          {error}
        </motion.div>
      )}

      {/* Controls */}
      <div className="flex flex-wrap items-end gap-4 p-4 rounded-lg border border-[#333] bg-[#0d0d1a]/80">
        {!swarmId ? (
          <>
            <div className="flex flex-col gap-1">
              <label className="text-xs text-[#888]">Sessions</label>
              <input
                type="number"
                min={1}
                max={8}
                value={numSessions}
                onChange={(e) => setNumSessions(parseInt(e.target.value) || 3)}
                className="w-20 bg-[#1a1a2e] border border-[#333] rounded px-2 py-1.5 text-sm text-[#e0e0e0] focus:border-[#00ff88] outline-none"
              />
            </div>
            <div className="flex flex-col gap-1">
              <label className="text-xs text-[#888]">Agents/Session</label>
              <input
                type="number"
                min={1}
                max={4}
                value={agentsPerSession}
                onChange={(e) => setAgentsPerSession(parseInt(e.target.value) || 2)}
                className="w-20 bg-[#1a1a2e] border border-[#333] rounded px-2 py-1.5 text-sm text-[#e0e0e0] focus:border-[#00ff88] outline-none"
              />
            </div>
            <button
              onClick={handleCreate}
              disabled={loading}
              className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-bold
                         bg-[#00ff88]/10 border border-[#00ff88]/30 text-[#00ff88]
                         hover:bg-[#00ff88]/20 hover:border-[#00ff88]/50 transition-all
                         disabled:opacity-40 disabled:cursor-not-allowed"
            >
              <Zap size={14} />
              {loading ? 'Creating...' : 'Create Swarm'}
            </button>
          </>
        ) : (
          <>
            {!running ? (
              <button onClick={handleStart} className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-bold bg-[#00ff88]/10 border border-[#00ff88]/30 text-[#00ff88] hover:bg-[#00ff88]/20 transition-all">
                <Play size={14} /> Start
              </button>
            ) : (
              <button onClick={handleStop} className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-bold bg-[#ffaa00]/10 border border-[#ffaa00]/30 text-[#ffaa00] hover:bg-[#ffaa00]/20 transition-all">
                <Square size={14} /> Stop
              </button>
            )}
            <button onClick={() => handleTick(1)} className="flex items-center gap-2 px-3 py-2 rounded-lg text-sm bg-[#1a1a2e] border border-[#333] text-[#e0e0e0] hover:border-[#00ddff]/50 transition-all">
              <ChevronRight size={14} /> Tick
            </button>
            <button onClick={() => handleTick(10)} className="flex items-center gap-2 px-3 py-2 rounded-lg text-sm bg-[#1a1a2e] border border-[#333] text-[#e0e0e0] hover:border-[#00ddff]/50 transition-all">
              <ChevronRight size={14} /> x10
            </button>
            <button onClick={handleSync} className="flex items-center gap-2 px-3 py-2 rounded-lg text-sm bg-[#1a1a2e] border border-[#333] text-[#00ddff] hover:border-[#00ddff]/50 transition-all">
              <RefreshCw size={14} /> Sync
            </button>
            <button onClick={handleSpawnSession} className="flex items-center gap-2 px-3 py-2 rounded-lg text-sm bg-[#1a1a2e] border border-[#333] text-[#e0e0e0] hover:border-[#00ff88]/50 transition-all">
              <Plus size={14} /> Add Session
            </button>
            <button
              onClick={() => { setSwarmId(null); setSessions([]); setMetrics(null); setRunning(false); setSelectedSession(null); }}
              className="flex items-center gap-2 px-3 py-2 rounded-lg text-sm bg-[#1a1a2e] border border-[#333] text-[#ff4444] hover:border-[#ff4444]/50 transition-all ml-auto"
            >
              <Trash2 size={14} /> Reset
            </button>
          </>
        )}
      </div>

      {swarmId && (
        <>
          {/* Metrics Dashboard */}
          {metrics && (
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
              {[
                { label: 'Total Symbols', value: metrics.total_symbols, color: '#00ff88' },
                { label: 'Unique Symbols', value: metrics.unique_symbols, color: '#00ddff' },
                { label: 'Avg Convergence', value: `${(metrics.avg_convergence * 100).toFixed(1)}%`, color: '#ffaa00' },
                { label: 'Diversity Index', value: metrics.diversity_index.toFixed(3), color: '#aa66ff' },
                { label: 'Transfers', value: metrics.knowledge_transfers, color: '#ff66aa' },
                { label: 'Active Sessions', value: metrics.active_sessions, color: '#00ff88' },
              ].map((m, i) => (
                <motion.div
                  key={i}
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: i * 0.05 }}
                  className="p-3 rounded-lg border border-[#333] bg-[#0d0d1a]/80"
                >
                  <div className="text-[10px] text-[#888] uppercase tracking-wider mb-1">{m.label}</div>
                  <div className="text-lg font-bold" style={{ color: m.color }}>{m.value}</div>
                </motion.div>
              ))}
            </div>
          )}

          {/* Hive Mind Visualization */}
          <div className="relative rounded-lg border border-[#333] bg-[#0d0d1a]/80 p-4 overflow-hidden">
            <div className="flex items-center gap-2 mb-3">
              <Brain size={16} className="text-[#aa66ff]" />
              <span className="text-sm text-[#e0e0e0] font-bold">Hive Mind Network</span>
              {running && (
                <span className="ml-2 w-2 h-2 rounded-full bg-[#00ff88] animate-pulse" />
              )}
            </div>
            <svg width="100%" viewBox="0 0 400 240" className="mx-auto">
              {/* Connection lines */}
              {sessions.map((sess, i) => {
                const pos = getSessionPos(i, sessions.length);
                return (
                  <line
                    key={`line-${i}`}
                    x1={hubX}
                    y1={hubY}
                    x2={pos.x}
                    y2={pos.y}
                    stroke={STATUS_COLORS[sess.status] || '#333'}
                    strokeWidth={1.5}
                    strokeDasharray={sess.status === 'running' ? 'none' : '4 4'}
                    opacity={0.4}
                  />
                );
              })}

              {/* Particles (knowledge flow) */}
              {particles.map(p => {
                const fromPos = getSessionPos(p.from, sessions.length);
                const toPos = getSessionPos(p.to, sessions.length);
                const cx = fromPos.x + (hubX - fromPos.x) * p.progress;
                const cy = fromPos.y + (hubY - fromPos.y) * p.progress;
                const cx2 = hubX + (toPos.x - hubX) * ((p.progress - 0.5) * 2);
                const cy2 = hubY + (toPos.y - hubY) * ((p.progress - 0.5) * 2);
                const px = p.progress < 0.5 ? cx : cx2;
                const py = p.progress < 0.5 ? cy : cy2;
                return (
                  <circle
                    key={`p-${p.id}`}
                    cx={px}
                    cy={py}
                    r={3}
                    fill={p.color}
                    opacity={0.8}
                  >
                    <animate attributeName="opacity" values="0.8;0.3;0.8" dur="0.5s" repeatCount="indefinite" />
                  </circle>
                );
              })}

              {/* Hive Mind hub */}
              <circle cx={hubX} cy={hubY} r={28} fill="none" stroke="#aa66ff" strokeWidth={2} opacity={0.6}>
                <animate attributeName="r" values="26;30;26" dur="3s" repeatCount="indefinite" />
              </circle>
              <circle cx={hubX} cy={hubY} r={18} fill="#aa66ff" opacity={0.15} />
              <text x={hubX} y={hubY - 4} textAnchor="middle" fill="#aa66ff" fontSize={9} fontWeight="bold">HIVE</text>
              <text x={hubX} y={hubY + 8} textAnchor="middle" fill="#aa66ff" fontSize={8}>MIND</text>
              {knowledge && (
                <text x={hubX} y={hubY + 22} textAnchor="middle" fill="#888" fontSize={7}>
                  {knowledge.total_entries} entries
                </text>
              )}

              {/* Session nodes */}
              {sessions.map((sess, i) => {
                const pos = getSessionPos(i, sessions.length);
                const isSelected = selectedSession?.session_id === sess.session_id;
                return (
                  <g
                    key={sess.session_id}
                    onClick={() => setSelectedSession(isSelected ? null : sess)}
                    style={{ cursor: 'pointer' }}
                  >
                    <circle
                      cx={pos.x}
                      cy={pos.y}
                      r={isSelected ? 22 : 18}
                      fill={isSelected ? (STATUS_COLORS[sess.status] + '30') : '#0d0d1a'}
                      stroke={STATUS_COLORS[sess.status] || '#333'}
                      strokeWidth={isSelected ? 2.5 : 1.5}
                    />
                    <text
                      x={pos.x}
                      y={pos.y - 2}
                      textAnchor="middle"
                      fill={STATUS_COLORS[sess.status] || '#888'}
                      fontSize={7}
                      fontWeight="bold"
                    >
                      {sess.label}
                    </text>
                    <text
                      x={pos.x}
                      y={pos.y + 8}
                      textAnchor="middle"
                      fill="#888"
                      fontSize={6}
                    >
                      {sess.symbol_count} sym
                    </text>
                    <text
                      x={pos.x}
                      y={pos.y + 16}
                      textAnchor="middle"
                      fill={SPEC_COLORS[sess.specialization] || '#888'}
                      fontSize={5}
                    >
                      {sess.specialization}
                    </text>
                  </g>
                );
              })}
            </svg>
          </div>

          {/* Main content grid */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
            {/* Session Cards */}
            <div className="lg:col-span-2 space-y-3">
              <div className="flex items-center gap-2 text-sm text-[#e0e0e0] font-bold">
                <Users size={14} className="text-[#00ddff]" />
                Sessions ({sessions.length})
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {sessions.map((sess) => {
                  const isSelected = selectedSession?.session_id === sess.session_id;
                  return (
                    <motion.div
                      key={sess.session_id}
                      layout
                      initial={{ opacity: 0, scale: 0.95 }}
                      animate={{ opacity: 1, scale: 1 }}
                      onClick={() => setSelectedSession(isSelected ? null : sess)}
                      className={`p-3 rounded-lg border cursor-pointer transition-all
                        ${isSelected
                          ? 'border-[#00ff88]/50 bg-[#00ff88]/5'
                          : 'border-[#333] bg-[#0d0d1a]/80 hover:border-[#555]'
                        }`}
                    >
                      <div className="flex items-center justify-between mb-2">
                        <div className="flex items-center gap-2">
                          <span
                            className="w-2.5 h-2.5 rounded-full"
                            style={{
                              backgroundColor: STATUS_COLORS[sess.status],
                              boxShadow: sess.status === 'running' ? `0 0 6px ${STATUS_COLORS[sess.status]}` : 'none',
                            }}
                          />
                          <span className="text-sm font-bold text-[#e0e0e0]">{sess.label}</span>
                        </div>
                        <div className="flex gap-1">
                          {sess.status === 'running' && (
                            <button
                              onClick={(e) => { e.stopPropagation(); handlePauseSession(sess.session_id); }}
                              className="p-1 rounded text-[#ffaa00] hover:bg-[#ffaa00]/10 transition-colors"
                              title="Pause"
                            >
                              <Pause size={12} />
                            </button>
                          )}
                          {sess.status === 'paused' && (
                            <button
                              onClick={(e) => { e.stopPropagation(); handleResumeSession(sess.session_id); }}
                              className="p-1 rounded text-[#00ff88] hover:bg-[#00ff88]/10 transition-colors"
                              title="Resume"
                            >
                              <Play size={12} />
                            </button>
                          )}
                          <button
                            onClick={(e) => { e.stopPropagation(); handleKillSession(sess.session_id); }}
                            className="p-1 rounded text-[#ff4444] hover:bg-[#ff4444]/10 transition-colors"
                            title="Kill"
                          >
                            <Trash2 size={12} />
                          </button>
                        </div>
                      </div>

                      <div className="grid grid-cols-3 gap-2 text-[10px]">
                        <div>
                          <div className="text-[#888]">Symbols</div>
                          <div className="text-[#00ff88] font-bold">{sess.symbol_count}</div>
                        </div>
                        <div>
                          <div className="text-[#888]">Convergence</div>
                          <div className="text-[#ffaa00] font-bold">{(sess.convergence * 100).toFixed(1)}%</div>
                        </div>
                        <div>
                          <div className="text-[#888]">Ticks</div>
                          <div className="text-[#00ddff] font-bold">{sess.total_ticks}</div>
                        </div>
                      </div>

                      <div className="mt-2 flex items-center gap-2 text-[10px]">
                        <span className="text-[#888]">Specialization:</span>
                        <span
                          className="px-1.5 py-0.5 rounded text-[9px] font-bold uppercase"
                          style={{
                            color: SPEC_COLORS[sess.specialization],
                            backgroundColor: (SPEC_COLORS[sess.specialization] || '#888') + '15',
                            border: `1px solid ${SPEC_COLORS[sess.specialization] || '#888'}30`,
                          }}
                        >
                          {sess.specialization}
                        </span>
                      </div>

                      {/* Agent mini-bar */}
                      <div className="mt-2 flex gap-1">
                        {sess.agents.map((agent, ai) => (
                          <div
                            key={ai}
                            className="flex-1 h-1.5 rounded-full overflow-hidden bg-[#1a1a2e]"
                            title={`${agent.name}: ${agent.vocabulary_size} symbols`}
                          >
                            <div
                              className="h-full rounded-full transition-all duration-500"
                              style={{
                                width: `${Math.min(100, agent.convergence_score * 100)}%`,
                                backgroundColor: ['#00ff88', '#00ddff', '#ffaa00', '#aa66ff'][ai % 4],
                              }}
                            />
                          </div>
                        ))}
                      </div>

                      {/* Knowledge flow stats */}
                      <div className="mt-1.5 flex items-center gap-3 text-[10px] text-[#666]">
                        <span>
                          <ArrowRight size={8} className="inline text-[#00ff88]" /> Contributed: {sess.knowledge_contributed}
                        </span>
                        <span>
                          <ArrowRight size={8} className="inline text-[#00ddff] rotate-180" /> Received: {sess.knowledge_received}
                        </span>
                      </div>
                    </motion.div>
                  );
                })}
              </div>
            </div>

            {/* Knowledge Transfer Log */}
            <div className="space-y-3">
              <div className="flex items-center gap-2 text-sm text-[#e0e0e0] font-bold">
                <Activity size={14} className="text-[#ffaa00]" />
                Transfer Log
              </div>
              <div className="rounded-lg border border-[#333] bg-[#0d0d1a]/80 p-3 max-h-[400px] overflow-y-auto scroll-fade-container">
                {transferLog.length === 0 ? (
                  <div className="text-xs text-[#555] text-center py-8">
                    No transfers yet. Start the swarm to see knowledge flow.
                  </div>
                ) : (
                  <div className="space-y-2">
                    {[...transferLog].reverse().map((entry, i) => (
                      <motion.div
                        key={i}
                        initial={{ opacity: 0, x: -10 }}
                        animate={{ opacity: 1, x: 0 }}
                        className="text-[10px] border-l-2 pl-2 py-1"
                        style={{
                          borderColor: entry.type === 'migration' ? '#00ddff' : '#00ff88',
                        }}
                      >
                        <div className="flex items-center gap-1">
                          <span
                            className="px-1 py-0.5 rounded text-[8px] font-bold uppercase"
                            style={{
                              color: entry.type === 'migration' ? '#00ddff' : '#00ff88',
                              backgroundColor: entry.type === 'migration' ? '#00ddff15' : '#00ff8815',
                            }}
                          >
                            {entry.type}
                          </span>
                          <span className="text-[#888]">
                            {entry.type === 'migration'
                              ? `${entry.from.slice(0, 4)}.. \u2192 ${entry.to?.slice(0, 4)}..`
                              : `from ${entry.from?.slice(0, 4)}..`
                            }
                          </span>
                        </div>
                        <div className="text-[#e0e0e0] mt-0.5">
                          <span className="text-[#ffaa00]">{entry.symbol}</span>
                          <span className="text-[#666] mx-1">\u2192</span>
                          <span className="text-[#888]">{entry.meaning}</span>
                        </div>
                      </motion.div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* Selected Session Detail */}
          <AnimatePresence>
            {selectedSession && (
              <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: 20 }}
                className="rounded-lg border border-[#00ff88]/30 bg-[#0d0d1a]/90 p-4"
              >
                <div className="flex items-center justify-between mb-4">
                  <div className="flex items-center gap-3">
                    <span
                      className="w-3 h-3 rounded-full"
                      style={{ backgroundColor: STATUS_COLORS[selectedSession.status] }}
                    />
                    <h3 className="text-lg font-bold text-[#e0e0e0]">{selectedSession.label}</h3>
                    <span className="text-xs text-[#888]">({selectedSession.session_id})</span>
                  </div>
                  <button
                    onClick={() => setSelectedSession(null)}
                    className="text-xs text-[#888] hover:text-[#e0e0e0] transition-colors"
                  >
                    Close
                  </button>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {/* Agents */}
                  <div>
                    <h4 className="text-xs text-[#888] uppercase tracking-wider mb-2">Agents</h4>
                    <div className="space-y-2">
                      {selectedSession.agents.map((agent, i) => (
                        <div key={i} className="flex items-center gap-3 p-2 rounded bg-[#1a1a2e]/50">
                          <div
                            className="w-2 h-2 rounded-full flex-shrink-0"
                            style={{ backgroundColor: ['#00ff88', '#00ddff', '#ffaa00', '#aa66ff'][i % 4] }}
                          />
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2">
                              <span className="text-sm font-bold text-[#e0e0e0]">{agent.name}</span>
                              <span className="text-[9px] px-1 py-0.5 rounded bg-[#333] text-[#888]">{agent.role}</span>
                            </div>
                            <div className="flex items-center gap-3 text-[10px] text-[#666] mt-0.5">
                              <span>Vocab: <span className="text-[#00ff88]">{agent.vocabulary_size}</span></span>
                              <span>Conv: <span className="text-[#ffaa00]">{(agent.convergence_score * 100).toFixed(1)}%</span></span>
                            </div>
                          </div>
                          {/* Convergence bar */}
                          <div className="w-16 h-2 rounded-full bg-[#1a1a2e] overflow-hidden flex-shrink-0">
                            <div
                              className="h-full rounded-full transition-all duration-500"
                              style={{
                                width: `${agent.convergence_score * 100}%`,
                                backgroundColor: ['#00ff88', '#00ddff', '#ffaa00', '#aa66ff'][i % 4],
                              }}
                            />
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>

                  {/* Vocabulary */}
                  <div>
                    <h4 className="text-xs text-[#888] uppercase tracking-wider mb-2">
                      Discovered Symbols ({selectedSession.symbol_count})
                    </h4>
                    <div className="flex flex-wrap gap-1 max-h-[200px] overflow-y-auto">
                      {selectedSession.symbols_discovered.length === 0 ? (
                        <span className="text-[10px] text-[#555]">No symbols discovered yet</span>
                      ) : (
                        selectedSession.symbols_discovered.map((sym, i) => (
                          <span
                            key={i}
                            className="px-2 py-0.5 rounded text-xs bg-[#1a1a2e] border border-[#333] text-[#00ff88]"
                          >
                            {sym}
                          </span>
                        ))
                      )}
                    </div>
                  </div>
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </>
      )}

      {/* Empty state */}
      {!swarmId && (
        <div className="flex flex-col items-center justify-center py-20 text-center">
          <Network size={64} className="text-[#333] mb-4" />
          <h2 className="text-xl font-bold text-[#555] mb-2">No Swarm Active</h2>
          <p className="text-sm text-[#444] max-w-md">
            Create a swarm to launch multiple parallel training sessions that share knowledge
            through a central HiveMind. Watch as sessions discover symbols, specialize, and
            exchange breakthroughs.
          </p>
        </div>
      )}
    </div>
  );
}

function ChevronRight({ size = 16, className = '' }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" className={className}>
      <polyline points="9 18 15 12 9 6" />
    </svg>
  );
}

export default SwarmIntelligence;
