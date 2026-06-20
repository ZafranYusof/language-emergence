import React, { useState, useEffect, useRef, useCallback } from 'react';
import { motion } from 'framer-motion';
import { Trophy, Activity, BarChart3, GitCompare, RefreshCw, AlertTriangle, Search, Zap, Award } from 'lucide-react';
import { API_URL } from '../config';

const SESSION_COLORS = ['#00ff88', '#ffaa00', '#00ddff'];
const NEON_GREEN = '#00ff88';
const AMBER = '#ffaa00';
const CYAN = '#00ddff';
const BG_DARK = '#0a0a1a';
const BG_CARD = '#111128';
const BG_ROW_ALT = '#0d0d22';

const METRIC_DEFS = [
  { key: 'accuracy', label: 'Final Accuracy', format: v => (v != null ? `${(v * 100).toFixed(1)}%` : '—'), higher: true },
  { key: 'symbol_count', label: 'Symbol Count', format: v => (v != null ? v : '—'), higher: true },
  { key: 'vocabulary_size', label: 'Vocabulary Size', format: v => (v != null ? v : '—'), higher: true },
  { key: 'compositionality_score', label: 'Compositionality Score', format: v => (v != null ? v.toFixed(3) : '—'), higher: true },
  { key: 'convergence_speed', label: 'Convergence Speed (ep→80%)', format: v => (v != null ? v : '—'), higher: false },
  { key: 'total_conversations', label: 'Total Conversations', format: v => (v != null ? v.toLocaleString() : '—'), higher: true },
];

function extractMetric(session, key) {
  const d = session.data || session;
  if (key === 'convergence_speed') return d.convergence_speed ?? null;
  if (key === 'total_conversations') return d.total_conversations ?? null;
  return d[key] ?? d.metrics?.[key] ?? null;
}

function buildHistoryArray(session, key) {
  const d = session.data || session;
  const history = d.history || d.training_history || [];
  return history.map((h, i) => ({
    episode: h.episode ?? i + 1,
    value: h[key] ?? h.metrics?.[key] ?? null,
  })).filter(p => p.value != null);
}

/* ───── SVG Line Chart ───── */
function LineChart({ datasets, title, width = 620, height = 260 }) {
  const pad = { top: 30, right: 20, bottom: 40, left: 55 };
  const cw = width - pad.left - pad.right;
  const ch = height - pad.top - pad.bottom;

  const allPts = datasets.flatMap(ds => ds.points);
  if (allPts.length === 0) return (
    <div style={{ color: '#666', padding: 40, textAlign: 'center', fontFamily: 'JetBrains Mono, monospace' }}>
      No history data available for chart
    </div>
  );

  const maxX = Math.max(...allPts.map(p => p.episode));
  const maxY = Math.max(...allPts.map(p => p.value), 0.01);
  const xScale = v => (v / maxX) * cw;
  const yScale = v => ch - (v / maxY) * ch;

  const gridLines = 5;
  const yTicks = Array.from({ length: gridLines + 1 }, (_, i) => (maxY / gridLines) * i);

  return (
    <svg width={width} height={height} style={{ background: '#0a0a1a', borderRadius: 8, border: '1px solid #222244' }}>
      <text x={width / 2} y={18} textAnchor="middle" fill={NEON_GREEN} fontSize={13} fontFamily="JetBrains Mono, monospace" fontWeight="bold">
        {title}
      </text>
      <g transform={`translate(${pad.left},${pad.top})`}>
        {yTicks.map((t, i) => (
          <g key={i}>
            <line x1={0} y1={yScale(t)} x2={cw} y2={yScale(t)} stroke="#1a1a3a" strokeWidth={1} />
            <text x={-8} y={yScale(t) + 4} textAnchor="end" fill="#555" fontSize={10} fontFamily="JetBrains Mono, monospace">
              {t.toFixed(2)}
            </text>
          </g>
        ))}
        <line x1={0} y1={ch} x2={cw} y2={ch} stroke="#333" strokeWidth={1} />
        <line x1={0} y1={0} x2={0} y2={ch} stroke="#333" strokeWidth={1} />
        <text x={cw / 2} y={ch + 30} textAnchor="middle" fill="#555" fontSize={10} fontFamily="JetBrains Mono, monospace">Episode</text>
        {datasets.map((ds, di) => {
          if (ds.points.length === 0) return null;
          const sorted = [...ds.points].sort((a, b) => a.episode - b.episode);
          const pathD = sorted.map((p, i) => `${i === 0 ? 'M' : 'L'}${xScale(p.episode)},${yScale(p.value)}`).join(' ');
          return (
            <g key={di}>
              <path d={pathD} fill="none" stroke={ds.color} strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round" opacity={0.9} />
              {sorted.map((p, pi) => (
                <circle key={pi} cx={xScale(p.episode)} cy={yScale(p.value)} r={2.5} fill={ds.color} opacity={0.7} />
              ))}
            </g>
          );
        })}
      </g>
      <g transform={`translate(${pad.left}, ${height - 8})`}>
        {datasets.map((ds, i) => (
          <g key={i} transform={`translate(${i * 180}, 0)`}>
            <rect x={0} y={-8} width={12} height={8} rx={2} fill={ds.color} />
            <text x={16} y={0} fill="#aaa" fontSize={10} fontFamily="JetBrains Mono, monospace">{ds.label}</text>
          </g>
        ))}
      </g>
    </svg>
  );
}

/* ───── Scanline overlay ───── */
function Scanlines() {
  return (
    <div style={{
      position: 'fixed', top: 0, left: 0, width: '100%', height: '100%',
      background: 'repeating-linear-gradient(0deg, transparent, transparent 2px, rgba(0,0,0,0.08) 2px, rgba(0,0,0,0.08) 4px)',
      pointerEvents: 'none', zIndex: 9999,
    }} />
  );
}

/* ───── Main Component ───── */
export default function TrainingComparison() {
  const [sessions, setSessions] = useState([]);
  const [selected, setSelected] = useState([]);
  const [details, setDetails] = useState({});
  const [loading, setLoading] = useState(true);
  const [detailsLoading, setDetailsLoading] = useState(false);
  const [error, setError] = useState(null);
  const mountedRef = useRef(true);

  const fetchSessions = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`${API_URL}/sessions`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      if (mountedRef.current) {
        setSessions(Array.isArray(data) ? data : data.sessions || []);
      }
    } catch (err) {
      if (mountedRef.current) setError(err.message);
    } finally {
      if (mountedRef.current) setLoading(false);
    }
  }, []);

  const fetchDetails = useCallback(async (ids) => {
    setDetailsLoading(true);
    try {
      const results = await Promise.all(ids.map(async id => {
        const res = await fetch(`${API_URL}/sessions/${id}`);
        if (!res.ok) throw new Error(`Failed to fetch session ${id}`);
        return { id, data: await res.json() };
      }));
      if (mountedRef.current) {
        const map = {};
        results.forEach(r => { map[r.id] = r.data; });
        setDetails(prev => ({ ...prev, ...map }));
      }
    } catch (err) {
      if (mountedRef.current) setError(err.message);
    } finally {
      if (mountedRef.current) setDetailsLoading(false);
    }
  }, []);

  useEffect(() => {
    mountedRef.current = true;
    fetchSessions();
    return () => { mountedRef.current = false; };
  }, [fetchSessions]);

  const failedIdsRef = useRef(new Set());
  useEffect(() => {
    const missing = selected.filter(id => !details[id] && !failedIdsRef.current.has(id));
    if (missing.length > 0) {
      fetchDetails(missing).catch(() => {
        missing.forEach(id => failedIdsRef.current.add(id));
      });
    }
  }, [selected, details, fetchDetails]);

  const toggleSelect = (id) => {
    setSelected(prev => {
      if (prev.includes(id)) return prev.filter(x => x !== id);
      if (prev.length >= 3) return prev;
      return [...prev, id];
    });
  };

  const selectedSessions = selected.map(id => {
    const det = details[id];
    const sess = sessions.find(s => s.session_id === id) || {};
    return { id, name: sess.name || `Session ${id}`, ...sess, ...(det || {}) };
  });

  /* Winner calculation */
  const metricWinners = {};
  const winCounts = {};
  selected.forEach(id => { winCounts[id] = 0; });

  METRIC_DEFS.forEach(m => {
    let bestId = null;
    let bestVal = null;
    selectedSessions.forEach((s, i) => {
      const v = extractMetric(s, m.key);
      if (v == null) return;
      if (bestVal == null || (m.higher ? v > bestVal : v < bestVal)) {
        bestVal = v;
        bestId = s.session_id;
      }
    });
    metricWinners[m.key] = bestId;
    if (bestId != null) winCounts[bestId] = (winCounts[bestId] || 0) + 1;
  });

  const overallWinnerId = selected.length > 0
    ? Object.entries(winCounts).sort((a, b) => b[1] - a[1])[0]?.[0]
    : null;
  const overallWinner = overallWinnerId != null ? selectedSessions.find(s => s.session_id === overallWinnerId) : null;

  /* Chart datasets */
  const accuracyDatasets = selectedSessions.map((s, i) => ({
    label: s.name,
    color: SESSION_COLORS[i],
    points: buildHistoryArray(s, 'accuracy'),
  }));

  const symbolDatasets = selectedSessions.map((s, i) => ({
    label: s.name,
    color: SESSION_COLORS[i],
    points: buildHistoryArray(s, 'symbol_count'),
  }));

  /* ───── RENDER ───── */
  if (loading) {
    return (
      <div style={{ minHeight: '100vh', background: BG_DARK, display: 'flex', alignItems: 'center', justifyContent: 'center', flexDirection: 'column', fontFamily: 'JetBrains Mono, monospace' }}>
        <Scanlines />
        <motion.div animate={{ rotate: 360 }} transition={{ repeat: Infinity, duration: 1.5, ease: 'linear' }}>
          <RefreshCw size={48} color={NEON_GREEN} />
        </motion.div>
        <p style={{ color: NEON_GREEN, marginTop: 16, fontSize: 14, letterSpacing: 2 }}>LOADING SESSIONS...</p>
      </div>
    );
  }

  if (error) {
    return (
      <div style={{ minHeight: '100vh', background: BG_DARK, display: 'flex', alignItems: 'center', justifyContent: 'center', flexDirection: 'column', fontFamily: 'JetBrains Mono, monospace' }}>
        <Scanlines />
        <AlertTriangle size={48} color="#ff4444" />
        <p style={{ color: '#ff4444', marginTop: 16, fontSize: 14 }}>ERROR: {error}</p>
        <button onClick={fetchSessions} style={{
          marginTop: 16, padding: '10px 24px', background: 'transparent', border: `1px solid ${NEON_GREEN}`,
          color: NEON_GREEN, fontFamily: 'JetBrains Mono, monospace', cursor: 'pointer', borderRadius: 4,
        }}>
          RETRY
        </button>
      </div>
    );
  }

  return (
    <div style={{ minHeight: '100vh', background: BG_DARK, color: '#e0e0e0', fontFamily: 'JetBrains Mono, monospace', padding: '0 0 60px 0' }}>
      <Scanlines />

      {/* Header */}
      <motion.div
        initial={{ opacity: 0, y: -30 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.6 }}
        style={{
          background: 'linear-gradient(180deg, #0f0f2a 0%, #0a0a1a 100%)',
          borderBottom: `2px solid ${NEON_GREEN}`,
          padding: '32px 40px 24px',
          textAlign: 'center',
        }}
      >
        <h1 style={{ fontSize: 28, color: NEON_GREEN, margin: 0, letterSpacing: 4, textShadow: `0 0 20px ${NEON_GREEN}44` }}>
          <GitCompare size={28} style={{ verticalAlign: 'middle', marginRight: 10 }} />
          TRAINING COMPARISON
        </h1>
        <p style={{ color: '#666', fontSize: 12, marginTop: 8, letterSpacing: 2 }}>
          SELECT 2-3 SESSIONS TO COMPARE PERFORMANCE METRICS
        </p>
      </motion.div>

      <div style={{ maxWidth: 1400, margin: '0 auto', padding: '24px 24px' }}>
        {/* Session Selector */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.15 }}
          className="retro-card"
          style={{ background: BG_CARD, border: '1px solid #222244', borderRadius: 8, padding: 24, marginBottom: 24 }}
        >
          <div className="section-header" style={{ color: NEON_GREEN, fontSize: 14, letterSpacing: 3, marginBottom: 16, borderBottom: '1px solid #1a1a3a', paddingBottom: 8 }}>
            <Search size={16} style={{ verticalAlign: 'middle', marginRight: 8 }} />
            SELECT SESSIONS ({selected.length}/3)
          </div>
          {sessions.length === 0 ? (
            <p style={{ color: '#666', textAlign: 'center', padding: 20 }}>No sessions found</p>
          ) : (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: 12 }}>
              {sessions.map((s, i) => {
                const isSelected = selected.includes(s.session_id);
                const colorIdx = selected.indexOf(s.session_id);
                const accent = isSelected ? SESSION_COLORS[colorIdx] : '#444';
                return (
                  <motion.div
                    key={s.session_id}
                    whileHover={{ scale: 1.02 }}
                    whileTap={{ scale: 0.98 }}
                    onClick={() => toggleSelect(s.session_id)}
                    style={{
                      background: isSelected ? `${accent}11` : '#0d0d22',
                      border: `1.5px solid ${accent}`,
                      borderRadius: 6,
                      padding: '12px 16px',
                      cursor: 'pointer',
                      display: 'flex',
                      alignItems: 'center',
                      gap: 12,
                      transition: 'all 0.2s',
                    }}
                  >
                    <div style={{
                      width: 20, height: 20, borderRadius: 4, border: `2px solid ${accent}`,
                      background: isSelected ? accent : 'transparent',
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                      flexShrink: 0, transition: 'all 0.2s',
                    }}>
                      {isSelected && <span style={{ color: '#000', fontSize: 12, fontWeight: 'bold' }}>✓</span>}
                    </div>
                    <div style={{ minWidth: 0 }}>
                      <div style={{ color: isSelected ? accent : '#aaa', fontSize: 13, fontWeight: 'bold', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                        {s.name || `Session ${s.session_id}`}
                      </div>
                      <div style={{ color: '#555', fontSize: 11, marginTop: 2 }}>
                        ID: {s.session_id} {s.status ? `• ${s.status}` : ''}
                      </div>
                    </div>
                  </motion.div>
                );
              })}
            </div>
          )}
        </motion.div>

        {/* Content area */}
        {selected.length === 0 && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} style={{ textAlign: 'center', padding: 60, color: '#555' }}>
            <Zap size={48} style={{ opacity: 0.3, marginBottom: 16 }} />
            <p style={{ fontSize: 14, letterSpacing: 2 }}>SELECT SESSIONS ABOVE TO BEGIN COMPARISON</p>
          </motion.div>
        )}

        {detailsLoading && selected.length > 0 && (
          <div style={{ textAlign: 'center', padding: 40 }}>
            <motion.div animate={{ rotate: 360 }} transition={{ repeat: Infinity, duration: 1.5, ease: 'linear' }} style={{ display: 'inline-block' }}>
              <RefreshCw size={32} color={NEON_GREEN} />
            </motion.div>
            <p style={{ color: NEON_GREEN, marginTop: 12, fontSize: 12, letterSpacing: 2 }}>FETCHING SESSION DETAILS...</p>
          </div>
        )}

        {selected.length >= 2 && !detailsLoading && (
          <>
            {/* Split-screen panels */}
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.2 }}
              style={{ display: 'grid', gridTemplateColumns: `repeat(${selected.length}, 1fr)`, gap: 16, marginBottom: 24 }}
            >
              {selectedSessions.map((s, i) => (
                <motion.div
                  key={s.session_id}
                  initial={{ opacity: 0, x: i === 0 ? -30 : 30 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: 0.25 + i * 0.1 }}
                  className="retro-card"
                  style={{
                    background: BG_CARD,
                    border: `1px solid ${SESSION_COLORS[i]}44`,
                    borderRadius: 8,
                    padding: 20,
                    borderTop: `3px solid ${SESSION_COLORS[i]}`,
                  }}
                >
                  <div style={{ color: SESSION_COLORS[i], fontSize: 14, fontWeight: 'bold', letterSpacing: 2, marginBottom: 12 }}>
                    {s.name || `Session ${s.session_id}`}
                    {overallWinnerId === s.session_id && (
                      <span style={{ marginLeft: 8, fontSize: 12, background: '#ffaa0022', border: `1px solid ${AMBER}`, borderRadius: 4, padding: '2px 8px', color: AMBER }}>
                        🏆 OVERALL WINNER
                      </span>
                    )}
                  </div>
                  {METRIC_DEFS.map(m => {
                    const val = extractMetric(s, m.key);
                    const isWinner = metricWinners[m.key] === s.session_id;
                    return (
                      <div key={m.key} style={{
                        display: 'flex', justifyContent: 'space-between', padding: '6px 0',
                        borderBottom: '1px solid #1a1a2a', fontSize: 12,
                      }}>
                        <span style={{ color: '#888' }}>{m.label}</span>
                        <span style={{
                          color: isWinner ? AMBER : '#ccc',
                          fontWeight: isWinner ? 'bold' : 'normal',
                        }}>
                          {isWinner && '🥇 '}{m.format(val)}
                        </span>
                      </div>
                    );
                  })}
                </motion.div>
              ))}
            </motion.div>

            {/* Metrics Comparison Table */}
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.35 }}
              className="retro-card"
              style={{ background: BG_CARD, border: '1px solid #222244', borderRadius: 8, padding: 24, marginBottom: 24, overflowX: 'auto' }}
            >
              <div className="section-header" style={{ color: NEON_GREEN, fontSize: 14, letterSpacing: 3, marginBottom: 16, borderBottom: '1px solid #1a1a3a', paddingBottom: 8 }}>
                <BarChart3 size={16} style={{ verticalAlign: 'middle', marginRight: 8 }} />
                METRICS COMPARISON TABLE
              </div>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
                <thead>
                  <tr style={{ borderBottom: '2px solid #222244' }}>
                    <th style={{ textAlign: 'left', padding: '10px 12px', color: '#888', letterSpacing: 1, fontSize: 11 }}>METRIC</th>
                    {selectedSessions.map((s, i) => (
                      <th key={s.session_id} style={{ textAlign: 'center', padding: '10px 12px', color: SESSION_COLORS[i], letterSpacing: 1, fontSize: 11 }}>
                        {s.name || `Session ${s.session_id}`}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {METRIC_DEFS.map((m, ri) => (
                    <tr key={m.key} style={{ background: ri % 2 === 0 ? BG_CARD : BG_ROW_ALT }}>
                      <td style={{ padding: '10px 12px', color: '#aaa', borderBottom: '1px solid #1a1a2a' }}>{m.label}</td>
                      {selectedSessions.map((s, ci) => {
                        const val = extractMetric(s, m.key);
                        const isWinner = metricWinners[m.key] === s.session_id;
                        return (
                          <td key={s.session_id} style={{
                            textAlign: 'center', padding: '10px 12px',
                            color: isWinner ? AMBER : '#ccc',
                            fontWeight: isWinner ? 'bold' : 'normal',
                            background: isWinner ? `${AMBER}08` : 'transparent',
                            borderBottom: '1px solid #1a1a2a',
                            textShadow: isWinner ? `0 0 8px ${AMBER}44` : 'none',
                          }}>
                            {isWinner && '🥇 '}{m.format(val)}
                          </td>
                        );
                      })}
                    </tr>
                  ))}
                </tbody>
              </table>
            </motion.div>

            {/* SVG Charts */}
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.45 }}
              style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 24, marginBottom: 24 }}
            >
              <div className="retro-card" style={{ background: BG_CARD, border: '1px solid #222244', borderRadius: 8, padding: 20, display: 'flex', justifyContent: 'center' }}>
                <LineChart datasets={accuracyDatasets} title="ACCURACY OVER EPISODES" />
              </div>
              <div className="retro-card" style={{ background: BG_CARD, border: '1px solid #222244', borderRadius: 8, padding: 20, display: 'flex', justifyContent: 'center' }}>
                <LineChart datasets={symbolDatasets} title="SYMBOL COUNT GROWTH" />
              </div>
            </motion.div>

            {/* Overall Winner */}
            {overallWinner && (
              <motion.div
                initial={{ opacity: 0, scale: 0.95 }}
                animate={{ opacity: 1, scale: 1 }}
                transition={{ delay: 0.55, type: 'spring' }}
                className="retro-card"
                style={{
                  background: `linear-gradient(135deg, ${BG_CARD} 0%, #151530 100%)`,
                  border: `2px solid ${AMBER}`,
                  borderRadius: 12,
                  padding: 32,
                  textAlign: 'center',
                  position: 'relative',
                  overflow: 'hidden',
                }}
              >
                <div style={{
                  position: 'absolute', top: 0, left: 0, right: 0, height: 3,
                  background: `linear-gradient(90deg, ${NEON_GREEN}, ${AMBER}, ${CYAN})`,
                }} />
                <motion.div initial={{ scale: 0 }} animate={{ scale: 1 }} transition={{ delay: 0.7, type: 'spring', stiffness: 200 }}>
                  <Trophy size={56} color={AMBER} style={{ filter: `drop-shadow(0 0 16px ${AMBER}66)` }} />
                </motion.div>
                <h2 style={{ color: AMBER, fontSize: 22, margin: '16px 0 8px', letterSpacing: 3, textShadow: `0 0 20px ${AMBER}44` }}>
                  🏆 OVERALL WINNER
                </h2>
                <div style={{ color: NEON_GREEN, fontSize: 18, fontWeight: 'bold', marginBottom: 12 }}>
                  {overallWinner.name || `Session ${overallWinner.session_id}`}
                </div>
                <div style={{ color: '#888', fontSize: 13, maxWidth: 600, margin: '0 auto', lineHeight: 1.7 }}>
                  <strong style={{ color: '#aaa' }}>{overallWinner.name || `Session ${overallWinner.session_id}`}</strong> wins in{' '}
                  <strong style={{ color: AMBER }}>{winCounts[overallWinnerId]}</strong> out of{' '}
                  <strong>{METRIC_DEFS.length}</strong> metrics.
                  {(() => {
                    const wonMetrics = METRIC_DEFS.filter(m => metricWinners[m.key] === overallWinnerId);
                    return wonMetrics.length > 0 ? (
                      <> Dominant in: <span style={{ color: CYAN }}>{wonMetrics.map(m => m.label).join(', ')}</span>.</>
                    ) : null;
                  })()}
                </div>
                <div style={{ display: 'flex', justifyContent: 'center', gap: 24, marginTop: 20 }}>
                  {selectedSessions.map((s, i) => (
                    <div key={s.session_id} style={{
                      padding: '8px 16px', borderRadius: 6,
                      border: `1px solid ${SESSION_COLORS[i]}`,
                      background: overallWinnerId === s.session_id ? `${SESSION_COLORS[i]}15` : 'transparent',
                    }}>
                      <div style={{ color: SESSION_COLORS[i], fontSize: 12, fontWeight: 'bold' }}>{s.name || `Session ${s.session_id}`}</div>
                      <div style={{ color: '#888', fontSize: 11, marginTop: 2 }}>
                        {winCounts[s.session_id]} / {METRIC_DEFS.length} wins
                      </div>
                    </div>
                  ))}
                </div>
              </motion.div>
            )}
          </>
        )}

        {selected.length === 1 && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} style={{ textAlign: 'center', padding: 40, color: '#666' }}>
            <p style={{ fontSize: 14, letterSpacing: 2 }}>SELECT ONE MORE SESSION TO COMPARE</p>
          </motion.div>
        )}
      </div>
    </div>
  );
}
