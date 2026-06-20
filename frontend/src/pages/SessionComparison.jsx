import React, { useState, useEffect, useCallback, useRef } from 'react';
import { motion } from 'framer-motion';
import { GitCompare, Download, Trophy, TrendingUp, BookOpen, Layers, Activity, Wind } from 'lucide-react';
import {
  XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, LineChart, Line,
} from 'recharts';
import * as api from '../utils/api';

const METRICS = [
  { key: 'reward', label: 'Reward', icon: TrendingUp, higherBetter: true, colorA: '#3b82f6', colorB: '#10b981' },
  { key: 'accuracy', label: 'Accuracy', icon: Activity, higherBetter: true, colorA: '#3b82f6', colorB: '#10b981' },
  { key: 'vocab_size', label: 'Vocab Size', icon: BookOpen, higherBetter: true, colorA: '#8b5cf6', colorB: '#a78bfa' },
  { key: 'compositionality', label: 'Compositionality', icon: Layers, higherBetter: true, colorA: '#f59e0b', colorB: '#fbbf24' },
  { key: 'entropy', label: 'Entropy', icon: Wind, higherBetter: false, colorA: '#ef4444', colorB: '#f87171' },
];

function generateDemoSessions() {
  return [
    { session_id: '1', name: 'Referential Game v1' },
    { session_id: '2', name: 'Negotiation Test' },
    { session_id: '3', name: 'Emergent Grammar Run' },
  ];
}

function generateDemoMetrics(sessionId) {
  const base = sessionId === '1' ? 0.6 : 0.45;
  const episodes = Array.from({ length: 50 }, (_, i) => i * 100);
  return {
    episodes,
    rewards: episodes.map((_, i) => base + 0.3 * (1 - Math.exp(-i / 15)) + (Math.random() - 0.5) * 0.05),
    losses: episodes.map((_, i) => 1.5 * Math.exp(-i / 20) + 0.2 + (Math.random() - 0.5) * 0.05),
    vocabSizes: episodes.map((_, i) => Math.min(20, Math.floor(3 + i * 0.3 + Math.random() * 2))),
    compositionality: episodes.map((_, i) => Math.min(0.95, 0.15 + 0.6 * (1 - Math.exp(-i / 20)) + (Math.random() - 0.5) * 0.03)),
    entropy: episodes.map((_, i) => 3.0 * Math.exp(-i / 25) + 0.5 + (Math.random() - 0.5) * 0.08),
    summary: {
      reward: base + 0.25,
      accuracy: base + 0.1,
      vocab_size: 15,
      compositionality: 0.72,
      entropy: 0.9,
    },
  };
}

export default function SessionComparison() {
  const [sessions, setSessions] = useState([]);
  const [sessionA, setSessionA] = useState('');
  const [sessionB, setSessionB] = useState('');
  const [metricsA, setMetricsA] = useState(null);
  const [metricsB, setMetricsB] = useState(null);
  const [loading, setLoading] = useState(false);
  const [usingDemo, setUsingDemo] = useState(false);
  const [selectedMetric, setSelectedMetric] = useState('reward');

  useEffect(() => {
    (async () => {
      try {
        const data = await api.fetchSessions();
        setSessions(data);
        if (data.length >= 2) {
          setSessionA(data[0].session_id);
          setSessionB(data[1].session_id);
        }
      } catch {
        const demo = generateDemoSessions();
        setSessions(demo);
        setSessionA(demo[0].session_id);
        setSessionB(demo[1].session_id);
        setUsingDemo(true);
      }
    })();
  }, []);

  const latestReqRef = useRef(0);
  const fetchMetrics = useCallback(async () => {
    if (!sessionA || !sessionB) return;
    const reqId = ++latestReqRef.current;
    setLoading(true);
    try {
      const [mA, mB] = await Promise.all([
        api.getMetrics(sessionA),
        api.getMetrics(sessionB),
      ]);
      if (reqId !== latestReqRef.current) return;
      setMetricsA(mA);
      setMetricsB(mB);
      setUsingDemo(false);
    } catch {
      if (reqId !== latestReqRef.current) return;
      setMetricsA(generateDemoMetrics(sessionA));
      setMetricsB(generateDemoMetrics(sessionB));
      setUsingDemo(true);
    } finally {
      if (reqId === latestReqRef.current) setLoading(false);
    }
  }, [sessionA, sessionB]);

  useEffect(() => {
    if (sessionA && sessionB) fetchMetrics();
  }, [sessionA, sessionB, fetchMetrics]);

  const getLatest = (metrics, key) => {
    if (!metrics) return null;
    if (key === 'vocab_size') return metrics.vocabSizes?.[metrics.vocabSizes.length - 1];
    if (key === 'accuracy') return metrics.summary?.accuracy ?? null;
    return metrics.summary?.[key] ?? metrics[key + 's']?.[metrics[key + 's']?.length - 1] ?? null;
  };

  const metricKey = selectedMetric;
  const metricPlural = metricKey === 'vocab_size' ? 'vocabSizes' : metricKey + 's';
  const chartData = (() => {
    if (!metricsA || !metricsB) return [];
    const episodes = metricsA.episodes || [];
    return episodes.map((ep, i) => ({
      episode: ep,
      [`${metricKey}A`]: metricsA[metricPlural]?.[i] ?? metricsA.summary?.[metricKey] ?? null,
      [`${metricKey}B`]: metricsB[metricPlural]?.[i] ?? metricsB.summary?.[metricKey] ?? null,
    }));
  })();

  const exportCSV = () => {
    if (!metricsA || !metricsB) return;
    const csvEscape = (val) => {
      const s = String(val ?? '');
      return s.includes(',') || s.includes('"') || s.includes('\n')
        ? `"${s.replace(/"/g, '""')}"` : s;
    };
    const rows = [['Metric', `Session A (${sessionA})`, `Session B (${sessionB})`, 'Winner']];
    METRICS.forEach(m => {
      const valA = getLatest(metricsA, m.key);
      const valB = getLatest(metricsB, m.key);
      const winner = valA != null && valB != null
        ? (m.higherBetter ? (valA > valB ? 'A' : 'B') : (valA < valB ? 'A' : 'B'))
        : '—';
      rows.push([m.label, valA ?? '—', valB ?? '—', winner].map(csvEscape));
    });
    const csv = rows.map(r => r.join(',')).join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = 'comparison.csv'; a.click();
    URL.revokeObjectURL(url);
  };

  const sessionName = (id) => sessions.find(s => s.session_id === id)?.name || `Session ${id}`;

  return (
    <div className="space-y-6 animate-slide-in">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-4">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2 section-header cursor-blink">
            <GitCompare size={24} className="text-neon-green" />
            SESSION COMPARISON
          </h1>
          <p className="text-sm text-retro-muted mt-1">Compare two training sessions side by side</p>
        </div>
        <button
          onClick={exportCSV}
          disabled={!metricsA || !metricsB}
          className="flex items-center gap-2 bg-retro-bg hover:bg-steel-dark disabled:opacity-40 text-neon-green px-4 py-2 rounded-lg text-sm transition-colors border border-neon-green/50"
        >
          <Download size={14} />
          Export Comparison CSV
        </button>
      </div>

      {usingDemo && (
        <div className="bg-robot-amber/10 border border-robot-amber/30 text-robot-amber px-4 py-2 rounded-lg text-sm">
          Using demo data — backend not available
        </div>
      )}

      {/* Session Selectors */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="retro-card rounded-xl p-4">
          <label className="text-xs text-retro-muted uppercase tracking-wider font-medium mb-2 block">Session A</label>
          <select
            value={sessionA}
            onChange={e => setSessionA(e.target.value)}
            className="w-full bg-retro-bg border border-steel-border rounded-lg px-3 py-2 text-sm text-retro-text focus:border-neon-green focus:outline-none"
          >
            {sessions.map(s => (
              <option key={s.session_id} value={s.session_id}>{s.name || `Session ${s.session_id}`}</option>
            ))}
          </select>
        </div>
        <div className="retro-card rounded-xl p-4">
          <label className="text-xs text-retro-muted uppercase tracking-wider font-medium mb-2 block">Session B</label>
          <select
            value={sessionB}
            onChange={e => setSessionB(e.target.value)}
            className="w-full bg-retro-bg border border-steel-border rounded-lg px-3 py-2 text-sm text-retro-text focus:border-neon-green focus:outline-none"
          >
            {sessions.map(s => (
              <option key={s.session_id} value={s.session_id}>{s.name || `Session ${s.session_id}`}</option>
            ))}
          </select>
        </div>
      </div>

      {/* Metric Cards */}
      {loading ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4">
          {METRICS.map((_, i) => (
            <div key={i} className="retro-card rounded-xl p-5 skeleton-pulse">
              <div className="h-4 bg-steel-dark rounded w-3/4 mb-3" />
              <div className="h-8 bg-steel-dark rounded w-1/2" />
            </div>
          ))}
        </div>
      ) : metricsA && metricsB ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4">
          {METRICS.map((m, i) => {
            const valA = getLatest(metricsA, m.key);
            const valB = getLatest(metricsB, m.key);
            let winner = null;
            if (valA != null && valB != null) {
              if (valA !== valB) {
                winner = m.higherBetter ? (valA > valB ? 'A' : 'B') : (valA < valB ? 'A' : 'B');
              }
            }
            return (
              <motion.div
                key={m.key}
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: i * 0.05 }}
                className={`retro-card rounded-xl p-4 ${winner ? 'glow-green-intense' : ''}`}
              >
                <div className="flex items-center gap-2 mb-3">
                  <m.icon size={14} className="text-retro-muted" />
                  <span className="text-xs text-retro-muted uppercase tracking-wider font-medium">{m.label}</span>
                </div>
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-xs text-neon-green">A</span>
                    <div className="flex items-center gap-2">
                      <span className="text-lg font-bold text-retro-text tabular-nums">
                        {valA != null ? (typeof valA === 'number' ? valA.toFixed(3) : valA) : '—'}
                      </span>
                      {winner === 'A' && <span className="bg-neon-green/10 text-neon-green px-1.5 py-0.5 rounded text-xs font-bold amber-text">WINNER</span>}
                    </div>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-xs text-robot-amber">B</span>
                    <div className="flex items-center gap-2">
                      <span className="text-lg font-bold text-retro-text tabular-nums">
                        {valB != null ? (typeof valB === 'number' ? valB.toFixed(3) : valB) : '—'}
                      </span>
                      {winner === 'B' && <span className="bg-neon-green/10 text-neon-green px-1.5 py-0.5 rounded text-xs font-bold amber-text">WINNER</span>}
                    </div>
                  </div>
                </div>
              </motion.div>
            );
          })}
        </div>
      ) : null}

      {/* Overlay Chart */}
      {metricsA && metricsB && chartData.length > 0 && (
        <div className="retro-card rounded-xl p-6">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-sm font-medium text-retro-muted">Metric Over Episodes</h3>
            <select
              value={selectedMetric}
              onChange={e => setSelectedMetric(e.target.value)}
              className="bg-retro-bg border border-steel-border rounded-lg px-2 py-1 text-xs text-retro-text focus:border-neon-green focus:outline-none"
            >
              {METRICS.map(m => <option key={m.key} value={m.key}>{m.label}</option>)}
            </select>
          </div>
          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={chartData} margin={{ top: 5, right: 20, bottom: 5, left: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#2d2d44" />
                <XAxis
                  dataKey="episode"
                  stroke="#2d2d44"
                  tick={{ fill: '#8a8a9a', fontSize: 11 }}
                  tickFormatter={v => v >= 1000 ? `${(v / 1000).toFixed(0)}k` : v}
                />
                <YAxis stroke="#2d2d44" tick={{ fill: '#8a8a9a', fontSize: 11 }} />
                <Tooltip
                  contentStyle={{
                    background: '#1a1a2e', border: '1px solid #2d2d44',
                    borderRadius: '10px', color: '#e0e0e0', fontSize: 12,
                  }}
                  labelFormatter={v => `Episode ${v.toLocaleString()}`}
                />
                <Legend wrapperStyle={{ fontSize: 12 }} />
                <Line
                  type="monotone" dataKey={`${metricKey}A`} name={`A: ${sessionName(sessionA)}`}
                  stroke="#00ff88" strokeWidth={2} dot={false}
                />
                <Line
                  type="monotone" dataKey={`${metricKey}B`} name={`B: ${sessionName(sessionB)}`}
                  stroke="#ffaa00" strokeWidth={2} dot={false}
                />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </div>
      )}
    </div>
  );
}
