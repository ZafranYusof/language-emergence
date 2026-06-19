import React, { useRef, useEffect, useState, useMemo, useCallback } from 'react';
import * as d3 from 'd3';
import { motion, AnimatePresence } from 'framer-motion';
import { GitBranch, Grid3x3, TrendingDown, AlignLeft, BarChart3, Network, Activity, Gauge, X, Zap } from 'lucide-react';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
import { BarChart, Bar, AreaChart, Area, RadarChart, Radar, PolarGrid, PolarAngleAxis, PolarRadiusAxis, Legend, ReferenceLine, Cell } from 'recharts';
import { SYMBOL_COLORS, METRIC_COLORS } from '../utils/colors';
import MetricTooltip from './MetricTooltip';

/* ───────────────────────── helpers ───────────────────────── */

function buildVocabTree(messageFrequency) {
  if (!messageFrequency || Object.keys(messageFrequency).length === 0) return null;
  const groups = {};
  for (const [msg, count] of Object.entries(messageFrequency)) {
    const symbols = msg.split(/[\s,]+/).filter(Boolean);
    if (symbols.length === 0) continue;
    const first = symbols[0];
    if (!groups[first]) groups[first] = {};
    const rest = symbols.slice(1).join(' ') || '(self)';
    groups[first][rest] = (groups[first][rest] || 0) + count;
  }
  return {
    name: 'root',
    children: Object.entries(groups).map(([parent, children]) => ({
      name: parent,
      value: Object.values(children).reduce((a, b) => a + b, 0),
      children: Object.entries(children)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 8)
        .map(([child, val]) => ({ name: child, value: val })),
    })),
  };
}

function computeBigrams(messageFrequency) {
  if (!messageFrequency || Object.keys(messageFrequency).length === 0) return [];
  const bigramCounts = {};
  for (const [msg, count] of Object.entries(messageFrequency)) {
    const symbols = msg.split(/[\s,]+/).filter(Boolean);
    for (let i = 0; i < symbols.length - 1; i++) {
      const bg = symbols[i] + symbols[i + 1];
      bigramCounts[bg] = (bigramCounts[bg] || 0) + count;
    }
  }
  const total = Object.values(bigramCounts).reduce((a, b) => a + b, 0) || 1;
  return Object.entries(bigramCounts)
    .map(([ngram, frequency]) => ({
      ngram,
      frequency,
      information: -Math.log2(frequency / total),
    }))
    .sort((a, b) => b.frequency - a.frequency)
    .slice(0, 12);
}

function EmptyState({ message }) {
  return (
    <div className="flex flex-col items-center justify-center py-16 text-retro-muted">
      <BarChart3 size={40} className="mb-3 opacity-40" />
      <p className="text-sm">{message}</p>
    </div>
  );
}

/* ───────────────── helpers for new visualisations ───────────────── */

function buildNetworkData(messageFrequency, symbolUsage) {
  if (!messageFrequency) return { nodes: [], edges: [] };
  const symbols = new Set();
  const pairCounts = {};
  for (const [msg, count] of Object.entries(messageFrequency)) {
    const syms = [...new Set(msg.split(/[\s,]+/).filter(Boolean))];
    syms.forEach(s => symbols.add(s));
    for (let i = 0; i < syms.length; i++) {
      for (let j = i + 1; j < syms.length; j++) {
        const key = [syms[i], syms[j]].sort().join('|');
        pairCounts[key] = (pairCounts[key] || 0) + count;
      }
    }
  }
  const symArr = [...symbols];
  const usageMap = {};
  if (symbolUsage && symbolUsage.length > 0) {
    symArr.forEach((s, i) => { usageMap[s] = symbolUsage[i] || 1; });
  }
  const maxUsage = Math.max(...Object.values(usageMap), 1);
  const nodes = symArr.map((id, i) => ({
    id,
    x: 200 + Math.cos(i * 2.3) * 120,
    y: 200 + Math.sin(i * 2.3) * 120,
    vx: 0,
    vy: 0,
    usage: usageMap[id] || 1,
    maxUsage,
  }));
  const maxPair = Math.max(...Object.values(pairCounts), 1);
  const edges = Object.entries(pairCounts).map(([key, count]) => {
    const [a, b] = key.split('|');
    return { source: a, target: b, weight: count, maxWeight: maxPair };
  });
  return { nodes, edges };
}

function buildCoOccurrence(messageFrequency) {
  if (!messageFrequency) return { matrix: [], symbols: [], total: 0 };
  const symbolsSet = new Set();
  const pairCounts = {};
  let total = 0;
  for (const [msg, count] of Object.entries(messageFrequency)) {
    const syms = [...new Set(msg.split(/[\s,]+/).filter(Boolean))];
    syms.forEach(s => symbolsSet.add(s));
    for (let i = 0; i < syms.length; i++) {
      for (let j = 0; j < syms.length; j++) {
        if (i === j) continue;
        const key = syms[i] + '|' + syms[j];
        pairCounts[key] = (pairCounts[key] || 0) + count;
        total += count;
      }
    }
  }
  const symbols = [...symbolsSet].sort();
  const matrix = symbols.map(a =>
    symbols.map(b => (a === b ? 0 : (pairCounts[a + '|' + b] || 0)))
  );
  return { matrix, symbols, total: total || 1 };
}

function buildVocabGrowth(messageFrequency, symbolUsage) {
  if (!messageFrequency) return [];
  const symbolFirstSeen = {};
  const symbolTotalUses = {};
  let globalIdx = 0;
  for (const [msg, count] of Object.entries(messageFrequency)) {
    const syms = msg.split(/[\s,]+/).filter(Boolean);
    for (const s of syms) {
      if (!(s in symbolFirstSeen)) {
        symbolFirstSeen[s] = globalIdx++;
      }
      symbolTotalUses[s] = (symbolTotalUses[s] || 0) + count;
    }
  }
  if (symbolUsage && symbolUsage.length > 0) {
    const syms = Object.keys(symbolFirstSeen).sort((a, b) => symbolFirstSeen[a] - symbolFirstSeen[b]);
    syms.forEach((s, i) => {
      if (i < symbolUsage.length) symbolTotalUses[s] = symbolUsage[i];
    });
  }
  const symbols = Object.keys(symbolFirstSeen)
    .sort((a, b) => symbolFirstSeen[a] - symbolFirstSeen[b]);
  const maxEp = Math.max(...Object.values(symbolFirstSeen), 1);
  return symbols.map(id => ({
    id,
    discoveryEpisode: symbolFirstSeen[id],
    totalUses: symbolTotalUses[id] || 0,
    maxEp,
  }));
}

function buildSymbolTimeline(messageFrequency, history) {
  if (!messageFrequency || !history || history.length === 0) return [];
  return history.map((snap, i) => {
    const entry = { episode: snap.episode ?? i };
    if (snap.symbol_usage) {
      snap.symbol_usage.forEach((v, j) => { entry[`S${j}`] = v; });
    }
    return entry;
  });
}

/* ───────────────────── INTERACTIVE SYMBOL MAP (SVG) ───────────────────── */

function InteractiveSymbolMap({ messageFrequency, symbolUsage, onSymbolClick }) {
  const svgRef = useRef(null);
  const [nodes, setNodes] = useState([]);
  const [edges, setEdges] = useState([]);
  const [selectedNode, setSelectedNode] = useState(null);
  const [dragging, setDragging] = useState(null);
  const [hoverNode, setHoverNode] = useState(null);
  const simRef = useRef(null);

  useEffect(() => {
    const { nodes: n, edges: e } = buildNetworkData(messageFrequency, symbolUsage);
    if (n.length === 0) return;
    setNodes(n);
    setEdges(e);
    setSelectedNode(null);

    // Force simulation
    const sim = { running: true };
    simRef.current = sim;
    let tick = 0;
    const maxTicks = 200;

    const step = () => {
      if (!sim.running || tick >= maxTicks) return;
      tick++;
      setNodes(prev => {
        const ns = prev.map(n => ({ ...n }));
        const W = 420, H = 420, cx = W / 2, cy = H / 2;
        // Center gravity
        for (const n of ns) {
          n.vx += (cx - n.x) * 0.003;
          n.vy += (cy - n.y) * 0.003;
        }
        // Node repulsion
        for (let i = 0; i < ns.length; i++) {
          for (let j = i + 1; j < ns.length; j++) {
            let dx = ns[j].x - ns[i].x;
            let dy = ns[j].y - ns[i].y;
            let dist = Math.sqrt(dx * dx + dy * dy) || 1;
            if (dist < 150) {
              const force = 800 / (dist * dist);
              const fx = (dx / dist) * force;
              const fy = (dy / dist) * force;
              ns[i].vx -= fx;
              ns[i].vy -= fy;
              ns[j].vx += fx;
              ns[j].vy += fy;
            }
          }
        }
        // Edge attraction
        for (const e of edges) {
          const si = ns.findIndex(n => n.id === e.source);
          const ti = ns.findIndex(n => n.id === e.target);
          if (si < 0 || ti < 0) continue;
          let dx = ns[ti].x - ns[si].x;
          let dy = ns[ti].y - ns[si].y;
          let dist = Math.sqrt(dx * dx + dy * dy) || 1;
          const targetDist = 100;
          const force = (dist - targetDist) * 0.005 * Math.min(e.weight, 10);
          ns[si].vx += (dx / dist) * force;
          ns[si].vy += (dy / dist) * force;
          ns[ti].vx -= (dx / dist) * force;
          ns[ti].vy -= (dy / dist) * force;
        }
        // Apply velocity
        for (const n of ns) {
          if (n.id === dragging) continue;
          n.vx *= 0.85;
          n.vy *= 0.85;
          n.x += n.vx;
          n.y += n.vy;
          n.x = Math.max(25, Math.min(395, n.x));
          n.y = Math.max(25, Math.min(395, n.y));
        }
        return ns;
      });
      requestAnimationFrame(step);
    };
    requestAnimationFrame(step);
    return () => { sim.running = false; };
  }, [messageFrequency, symbolUsage]);

  const handlePointerDown = useCallback((e, id) => {
    e.preventDefault();
    setDragging(id);
  }, []);

  const handlePointerMove = useCallback((e) => {
    if (!dragging || !svgRef.current) return;
    const rect = svgRef.current.getBoundingClientRect();
    const x = ((e.clientX - rect.left) / rect.width) * 420;
    const y = ((e.clientY - rect.top) / rect.height) * 420;
    setNodes(prev => prev.map(n => n.id === dragging ? { ...n, x, y, vx: 0, vy: 0 } : n));
  }, [dragging]);

  const handlePointerUp = useCallback(() => {
    setDragging(null);
  }, []);

  const handleClick = useCallback((id) => {
    setSelectedNode(prev => prev === id ? null : id);
    if (onSymbolClick) onSymbolClick(id);
  }, [onSymbolClick]);

  const connectedToSelected = useMemo(() => {
    if (!selectedNode) return new Set();
    const connected = new Set();
    edges.forEach(e => {
      if (e.source === selectedNode) connected.add(e.target);
      if (e.target === selectedNode) connected.add(e.source);
    });
    connected.add(selectedNode);
    return connected;
  }, [selectedNode, edges]);

  if (nodes.length === 0) return <EmptyState message="No symbol data available for network map." />;

  return (
    <div>
      <div className="flex items-center justify-between mb-3">
        <h4 className="text-xs text-retro-muted uppercase tracking-wider">Symbol Relationship Network</h4>
        <span className="text-xs text-retro-muted font-mono">{nodes.length} symbols · {edges.length} connections</span>
      </div>
      <svg
        ref={svgRef}
        viewBox="0 0 420 420"
        className="w-full h-auto rounded-xl bg-[#0d0d1a] ring-1 ring-gray-700/50 cursor-crosshair"
        style={{ maxHeight: 420 }}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerLeave={handlePointerUp}
      >
        <defs>
          <filter id="glow">
            <feGaussianBlur stdDeviation="3" result="blur" />
            <feMerge>
              <feMergeNode in="blur" />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>
          <filter id="glowStrong">
            <feGaussianBlur stdDeviation="5" result="blur" />
            <feMerge>
              <feMergeNode in="blur" />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>
        </defs>

        {/* Edges */}
        {edges.map((e, i) => {
          const sn = nodes.find(n => n.id === e.source);
          const tn = nodes.find(n => n.id === e.target);
          if (!sn || !tn) return null;
          const opacity = selectedNode
            ? (connectedToSelected.has(e.source) && connectedToSelected.has(e.target) ? 0.7 : 0.06)
            : Math.min(0.1 + (e.weight / e.maxWeight) * 0.5, 0.6);
          const width = 1 + (e.weight / e.maxWeight) * 5;
          const color = selectedNode && connectedToSelected.has(e.source) && connectedToSelected.has(e.target)
            ? '#00ff88'
            : '#4a5568';
          return (
            <line
              key={i}
              x1={sn.x} y1={sn.y} x2={tn.x} y2={tn.y}
              stroke={color}
              strokeWidth={width}
              opacity={opacity}
            />
          );
        })}

        {/* Nodes */}
        {nodes.map((n, i) => {
          const intensity = n.usage / n.maxUsage;
          const r = 10 + intensity * 14;
          const baseColor = SYMBOL_COLORS[i % SYMBOL_COLORS.length];
          const isSelected = selectedNode === n.id;
          const isHovered = hoverNode === n.id;
          const isDimmed = selectedNode && !connectedToSelected.has(n.id);
          const opacity = isDimmed ? 0.15 : 1;

          return (
            <g key={n.id} opacity={opacity}>
              <circle
                cx={n.x} cy={n.y} r={r + 4}
                fill="none"
                stroke={isSelected ? '#00ff88' : 'transparent'}
                strokeWidth={2}
                strokeDasharray={isSelected ? '4 2' : 'none'}
                filter={isSelected ? 'url(#glowStrong)' : 'none'}
              />
              <circle
                cx={n.x} cy={n.y} r={r}
                fill={baseColor}
                fillOpacity={0.2 + intensity * 0.6}
                stroke={isHovered || isSelected ? '#00ff88' : baseColor}
                strokeWidth={isHovered || isSelected ? 2.5 : 1.5}
                filter={isHovered ? 'url(#glow)' : 'none'}
                style={{ cursor: dragging === n.id ? 'grabbing' : 'pointer', transition: 'fill-opacity 0.3s' }}
                onPointerDown={(e) => handlePointerDown(e, n.id)}
                onMouseEnter={() => setHoverNode(n.id)}
                onMouseLeave={() => setHoverNode(null)}
                onClick={() => handleClick(n.id)}
              />
              <text
                x={n.x} y={n.y}
                textAnchor="middle"
                dominantBaseline="central"
                fill={isDimmed ? '#4a5568' : '#f3f4f6'}
                fontSize={Math.max(8, Math.min(12, 6 + intensity * 6))}
                fontFamily="'JetBrains Mono', monospace"
                fontWeight="bold"
                pointerEvents="none"
              >
                {n.id}
              </text>
              {/* Usage count label */}
              {(isHovered || isSelected) && (
                <text
                  x={n.x} y={n.y + r + 14}
                  textAnchor="middle"
                  fill="#9ca3af"
                  fontSize="9"
                  fontFamily="'JetBrains Mono', monospace"
                >
                  {n.usage} uses
                </text>
              )}
            </g>
          );
        })}
      </svg>

      {selectedNode && (
        <motion.div
          initial={{ opacity: 0, y: 5 }}
          animate={{ opacity: 1, y: 0 }}
          className="mt-3 flex items-center gap-3 text-xs"
        >
          <span className="text-neon-green font-mono">Selected: {selectedNode}</span>
          <span className="text-retro-muted">
            · {connectedToSelected.size - 1} connections
          </span>
          <button
            onClick={() => setSelectedNode(null)}
            className="ml-auto text-retro-muted hover:text-retro-text transition-colors"
          >
            Clear
          </button>
        </motion.div>
      )}
    </div>
  );
}

/* ───────────────────── COMPOSITIONALITY HEATMAP ───────────────────── */

function CompositionalityHeatmap({ messageFrequency, onCellClick }) {
  const { matrix, symbols, total } = useMemo(() => buildCoOccurrence(messageFrequency), [messageFrequency]);
  const [hoveredCell, setHoveredCell] = useState(null);
  const maxVal = useMemo(() => Math.max(...matrix.flat().filter(v => v > 0), 1), [matrix]);

  if (symbols.length === 0) return <EmptyState message="No co-occurrence data available for heatmap." />;

  const cellSize = Math.max(20, Math.min(44, 380 / symbols.length));

  return (
    <div>
      <div className="flex items-center justify-between mb-3">
        <h4 className="text-xs text-retro-muted uppercase tracking-wider">Symbol Co-occurrence Heatmap</h4>
        <span className="text-xs text-retro-muted font-mono">{symbols.length}×{symbols.length} matrix</span>
      </div>
      <div className="overflow-x-auto">
        <div className="inline-block">
          {/* Column headers */}
          <div className="flex" style={{ paddingLeft: cellSize + 4 }}>
            {symbols.map((s, j) => (
              <motion.div
                key={s}
                initial={{ opacity: 0, y: -8 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: j * 0.03 }}
                className="text-center font-mono text-[9px] text-retro-muted"
                style={{ width: cellSize, minWidth: cellSize }}
              >
                {s}
              </motion.div>
            ))}
          </div>
          {/* Rows */}
          {symbols.map((rowSym, i) => (
            <div key={rowSym} className="flex items-center">
              <motion.div
                initial={{ opacity: 0, x: -8 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: i * 0.03 }}
                className="font-mono text-[9px] text-retro-muted pr-1 text-right"
                style={{ width: cellSize, minWidth: cellSize }}
              >
                {rowSym}
              </motion.div>
              {symbols.map((colSym, j) => {
                const val = matrix[i][j];
                const pct = total > 0 ? (val / total) * 100 : 0;
                const intensity = val / maxVal;
                const isHovered = hoveredCell?.i === i && hoveredCell?.j === j;
                const isDiag = i === j;
                return (
                  <motion.div
                    key={`${i}-${j}`}
                    initial={{ opacity: 0, scale: 0 }}
                    animate={{ opacity: 1, scale: 1 }}
                    transition={{ delay: (i + j) * 0.015, type: 'spring', stiffness: 300 }}
                    className="border border-gray-800/50 cursor-pointer relative"
                    style={{
                      width: cellSize,
                      height: cellSize,
                      minWidth: cellSize,
                      backgroundColor: isDiag
                        ? 'rgba(55,65,81,0.3)'
                        : val > 0
                          ? `rgba(34,197,94,${0.1 + intensity * 0.85})`
                          : 'rgba(17,24,39,0.5)',
                      outline: isHovered ? '2px solid #00ff88' : 'none',
                      outlineOffset: -1,
                      transition: 'background-color 0.2s',
                    }}
                    onMouseEnter={() => !isDiag && setHoveredCell({ i, j })}
                    onMouseLeave={() => setHoveredCell(null)}
                    onClick={() => !isDiag && onCellClick && onCellClick(rowSym, colSym)}
                  >
                    {val > 0 && !isDiag && (
                      <span
                        className="absolute inset-0 flex items-center justify-center font-mono"
                        style={{
                          fontSize: Math.max(7, Math.min(10, cellSize * 0.3)),
                          color: intensity > 0.5 ? '#fff' : '#9ca3af',
                        }}
                      >
                        {val}
                      </span>
                    )}
                  </motion.div>
                );
              })}
            </div>
          ))}
        </div>
      </div>
      {/* Hover tooltip */}
      {hoveredCell && (
        <motion.div
          initial={{ opacity: 0, y: 4 }}
          animate={{ opacity: 1, y: 0 }}
          className="mt-3 text-xs bg-[#111827] rounded-lg px-3 py-2 ring-1 ring-gray-700/50 inline-flex gap-4"
        >
          <span className="text-retro-muted">Pair:</span>
          <span className="text-neon-green font-mono">{symbols[hoveredCell.i]} → {symbols[hoveredCell.j]}</span>
          <span className="text-retro-muted">Count:</span>
          <span className="text-cyber-cyan font-mono">{matrix[hoveredCell.i][hoveredCell.j]}</span>
          <span className="text-retro-muted">Pct:</span>
          <span className="text-robot-amber font-mono">
            {((matrix[hoveredCell.i][hoveredCell.j] / total) * 100).toFixed(1)}%
          </span>
        </motion.div>
      )}
    </div>
  );
}

/* ───────────────────── VOCABULARY GROWTH TREE ───────────────────── */

function VocabGrowthTree({ messageFrequency, symbolUsage }) {
  const growthData = useMemo(() => buildVocabGrowth(messageFrequency, symbolUsage), [messageFrequency, symbolUsage]);
  const [scrubPos, setScrubPos] = useState(1);
  const maxEp = growthData.length > 0 ? growthData[growthData.length - 1].maxEp : 1;
  const visibleCount = Math.max(1, Math.round(scrubPos * growthData.length));
  const visibleData = growthData.slice(0, visibleCount);

  if (growthData.length === 0) return <EmptyState message="No vocabulary growth data available." />;

  const W = 500, H = 300, cx = 50, cy = H / 2;

  // Build tree positions
  const nodes = visibleData.map((d, i) => {
    const angle = -Math.PI / 2 + (i / Math.max(1, growthData.length - 1)) * Math.PI;
    const radius = 30 + i * (180 / Math.max(1, growthData.length));
    return {
      ...d,
      x: cx + Math.cos(angle) * radius,
      y: cy + Math.sin(angle) * radius * 0.7,
      idx: i,
    };
  });

  const maxUses = Math.max(...growthData.map(d => d.totalUses), 1);

  return (
    <div>
      <div className="flex items-center justify-between mb-3">
        <h4 className="text-xs text-retro-muted uppercase tracking-wider">Vocabulary Growth Tree</h4>
        <span className="text-xs text-retro-muted font-mono">{visibleData.length}/{growthData.length} symbols</span>
      </div>

      {/* Scrubber */}
      <div className="mb-4 flex items-center gap-3">
        <span className="text-xs text-retro-muted whitespace-nowrap">Episodes:</span>
        <input
          type="range"
          min={0}
          max={1}
          step={0.01}
          value={scrubPos}
          onChange={e => setScrubPos(parseFloat(e.target.value))}
          className="flex-1 accent-neon-green h-1.5"
        />
        <span className="text-xs text-neon-green font-mono w-16 text-right">
          {visibleData.length > 0 ? visibleData[visibleData.length - 1].discoveryEpisode : 0}
        </span>
      </div>

      <svg viewBox={`0 0 ${W} ${H}`} className="w-full h-auto rounded-xl bg-[#0d0d1a] ring-1 ring-gray-700/50">
        <defs>
          <filter id="treeGlow">
            <feGaussianBlur stdDeviation="2" result="blur" />
            <feMerge>
              <feMergeNode in="blur" />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>
        </defs>

        {/* Root node */}
        <circle cx={cx} cy={cy} r={8} fill="#ffaa00" stroke="#ffaa00" strokeWidth={1.5} filter="url(#treeGlow)" opacity={0.9} />
        <text x={cx} y={cy - 14} textAnchor="middle" fill="#ffaa00" fontSize="8" fontFamily="'JetBrains Mono', monospace">root</text>

        {/* Edges from root */}
        {nodes.map((n, i) => (
          <motion.line
            key={`edge-${i}`}
            initial={{ pathLength: 0, opacity: 0 }}
            animate={{ pathLength: 1, opacity: 0.4 }}
            transition={{ delay: i * 0.04, duration: 0.3 }}
            x1={cx} y1={cy} x2={n.x} y2={n.y}
            stroke="#374151"
            strokeWidth={1}
          />
        ))}

        {/* Symbol nodes */}
        {nodes.map((n, i) => {
          const isEarly = n.discoveryEpisode < maxEp * 0.33;
          const isRecent = n.discoveryEpisode > maxEp * 0.66;
          const isUnused = n.totalUses === 0;
          const color = isUnused ? '#6b7280' : isEarly ? '#ffaa00' : isRecent ? '#00ddff' : '#00ff88';
          const r = 5 + (n.totalUses / maxUses) * 10;

          return (
            <motion.g
              key={n.id}
              initial={{ scale: 0, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              transition={{ delay: i * 0.05, type: 'spring', stiffness: 200 }}
            >
              <circle
                cx={n.x} cy={n.y} r={r}
                fill={color}
                fillOpacity={0.25}
                stroke={color}
                strokeWidth={1.5}
              />
              <text
                x={n.x} y={n.y}
                textAnchor="middle"
                dominantBaseline="central"
                fill={color}
                fontSize={Math.max(7, Math.min(10, 5 + (n.totalUses / maxUses) * 5))}
                fontFamily="'JetBrains Mono', monospace"
                fontWeight="bold"
              >
                {n.id}
              </text>
              <text
                x={n.x} y={n.y + r + 10}
                textAnchor="middle"
                fill="#6b7280"
                fontSize="7"
                fontFamily="'JetBrains Mono', monospace"
              >
                ep{n.discoveryEpisode} · {n.totalUses}×
              </text>
            </motion.g>
          );
        })}
      </svg>

      {/* Legend */}
      <div className="flex gap-4 mt-3 text-[10px] text-retro-muted">
        <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-[#ffaa00] inline-block" /> Early</span>
        <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-[#00ddff] inline-block" /> Recent</span>
        <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-[#6b7280] inline-block" /> Unused</span>
      </div>
    </div>
  );
}

/* ───────────────────── SYMBOL DEEP DIVE PANEL ───────────────────── */

function SymbolDeepDive({ symbolId, messageFrequency, symbolUsage, history, onClose }) {
  if (!symbolId) return null;

  // Find symbol index
  const allSymbols = useMemo(() => {
    if (!messageFrequency) return [];
    const s = new Set();
    Object.keys(messageFrequency).forEach(msg => {
      msg.split(/[\s,]+/).filter(Boolean).forEach(sym => s.add(sym));
    });
    return [...s].sort();
  }, [messageFrequency]);

  const symIdx = allSymbols.indexOf(symbolId);
  const totalUses = symIdx >= 0 && symbolUsage ? (symbolUsage[symIdx] || 0) : 0;

  // Discovery episode
  const discoveryEpisode = useMemo(() => {
    if (!messageFrequency) return 0;
    let idx = 0;
    for (const msg of Object.keys(messageFrequency)) {
      if (msg.split(/[\s,]+/).includes(symbolId)) return idx;
      idx++;
    }
    return 0;
  }, [messageFrequency, symbolId]);

  // Co-occurring symbols
  const coOccurring = useMemo(() => {
    if (!messageFrequency) return [];
    const counts = {};
    for (const [msg, count] of Object.entries(messageFrequency)) {
      const syms = msg.split(/[\s,]+/).filter(Boolean);
      if (!syms.includes(symbolId)) continue;
      for (const s of syms) {
        if (s !== symbolId) counts[s] = (counts[s] || 0) + count;
      }
    }
    return Object.entries(counts).sort((a, b) => b[1] - a[1]).slice(0, 10);
  }, [messageFrequency, symbolId]);

  // Example messages
  const examples = useMemo(() => {
    if (!messageFrequency) return [];
    return Object.entries(messageFrequency)
      .filter(([msg]) => msg.split(/[\s,]+/).includes(symbolId))
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5);
  }, [messageFrequency, symbolId]);

  // Usage over time from history
  const timelineData = useMemo(() => {
    if (!history || symIdx < 0) return [];
    return history
      .filter(snap => snap.symbol_usage && symIdx < snap.symbol_usage.length)
      .map((snap, i) => ({
        episode: snap.episode ?? i,
        usage: snap.symbol_usage[symIdx] ?? 0,
      }));
  }, [history, symIdx]);

  return (
    <AnimatePresence>
      <motion.div
        initial={{ x: 400, opacity: 0 }}
        animate={{ x: 0, opacity: 1 }}
        exit={{ x: 400, opacity: 0 }}
        transition={{ type: 'spring', stiffness: 200, damping: 25 }}
        className="fixed top-0 right-0 h-full w-[380px] bg-[#0f0f20] border-l border-steel-border z-50 overflow-y-auto shadow-2xl"
      >
        <div className="p-6 space-y-5">
          {/* Header */}
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div
                className="w-10 h-10 rounded-lg flex items-center justify-center font-mono text-lg font-bold"
                style={{
                  backgroundColor: `${SYMBOL_COLORS[symIdx >= 0 ? symIdx % SYMBOL_COLORS.length : 0]}20`,
                  color: SYMBOL_COLORS[symIdx >= 0 ? symIdx % SYMBOL_COLORS.length : 0],
                  border: `1px solid ${SYMBOL_COLORS[symIdx >= 0 ? symIdx % SYMBOL_COLORS.length : 0]}40`,
                }}
              >
                {symbolId}
              </div>
              <div>
                <h3 className="text-sm font-bold text-retro-text">Symbol Deep Dive</h3>
                <p className="text-[10px] text-retro-muted font-mono">ID: {symbolId}</p>
              </div>
            </div>
            <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-steel-dark transition-colors text-retro-muted hover:text-retro-text">
              <X size={16} />
            </button>
          </div>

          {/* Stats grid */}
          <div className="grid grid-cols-2 gap-3">
            {[
              { label: 'Total Uses', value: totalUses, color: 'text-cyber-cyan' },
              { label: 'First Seen', value: `Episode ${discoveryEpisode}`, color: 'text-robot-amber' },
              { label: 'Symbol Index', value: `#${symIdx}`, color: 'text-purple-400' },
              { label: 'Connections', value: coOccurring.length, color: 'text-neon-green' },
            ].map(s => (
              <motion.div
                key={s.label}
                initial={{ opacity: 0, scale: 0.9 }}
                animate={{ opacity: 1, scale: 1 }}
                className="bg-steel-dark/50 rounded-lg px-3 py-2.5 ring-1 ring-gray-700/50"
              >
                <p className="text-[9px] text-retro-muted uppercase tracking-wider">{s.label}</p>
                <p className={`text-sm font-bold font-mono ${s.color} mt-0.5`}>{s.value}</p>
              </motion.div>
            ))}
          </div>

          {/* Usage over time chart */}
          {timelineData.length > 0 && (
            <div>
              <h4 className="text-[10px] text-retro-muted uppercase tracking-wider mb-2">Usage Over Time</h4>
              <div className="bg-steel-dark/30 rounded-lg p-2 ring-1 ring-gray-700/50 h-32">
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={timelineData}>
                    <defs>
                      <linearGradient id="gradSymUsage" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="#00ff88" stopOpacity={0.3} />
                        <stop offset="95%" stopColor="#00ff88" stopOpacity={0} />
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" stroke="#1f2937" />
                    <XAxis dataKey="episode" tick={{ fill: '#6b7280', fontSize: 9 }} stroke="#374151" />
                    <YAxis tick={{ fill: '#6b7280', fontSize: 9 }} stroke="#374151" width={30} />
                    <Tooltip
                      contentStyle={{ backgroundColor: '#111827', border: '1px solid #374151', borderRadius: '8px', color: '#f3f4f6', fontSize: 11 }}
                    />
                    <Area type="monotone" dataKey="usage" stroke="#00ff88" strokeWidth={1.5} fill="url(#gradSymUsage)" dot={false} />
                  </AreaChart>
                </ResponsiveContainer>
              </div>
            </div>
          )}

          {/* Co-occurring symbols */}
          {coOccurring.length > 0 && (
            <div>
              <h4 className="text-[10px] text-retro-muted uppercase tracking-wider mb-2">Co-occurring Symbols</h4>
              <div className="space-y-1.5">
                {coOccurring.map(([sym, count], i) => {
                  const maxCo = coOccurring[0][1];
                  return (
                    <motion.div
                      key={sym}
                      initial={{ opacity: 0, x: 20 }}
                      animate={{ opacity: 1, x: 0 }}
                      transition={{ delay: i * 0.04 }}
                      className="flex items-center gap-2"
                    >
                      <span className="font-mono text-xs text-retro-text w-8">{sym}</span>
                      <div className="flex-1 h-2 bg-steel-dark rounded-full overflow-hidden">
                        <motion.div
                          initial={{ width: 0 }}
                          animate={{ width: `${(count / maxCo) * 100}%` }}
                          transition={{ delay: i * 0.04 + 0.1, duration: 0.4 }}
                          className="h-full rounded-full"
                          style={{ backgroundColor: SYMBOL_COLORS[allSymbols.indexOf(sym) % SYMBOL_COLORS.length] || '#4a5568' }}
                        />
                      </div>
                      <span className="font-mono text-[10px] text-retro-muted w-6 text-right">{count}</span>
                    </motion.div>
                  );
                })}
              </div>
            </div>
          )}

          {/* Example messages */}
          {examples.length > 0 && (
            <div>
              <h4 className="text-[10px] text-retro-muted uppercase tracking-wider mb-2">Example Messages</h4>
              <div className="space-y-1.5">
                {examples.map(([msg, count], i) => (
                  <motion.div
                    key={i}
                    initial={{ opacity: 0, y: 5 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: i * 0.05 }}
                    className="bg-steel-dark/40 rounded-lg px-3 py-2 ring-1 ring-gray-700/30"
                  >
                    <div className="flex items-center justify-between">
                      <span className="font-mono text-xs text-retro-text">
                        {msg.split(/[\s,]+/).map((s, j) => (
                          <span key={j}>
                            {j > 0 && <span className="text-gray-600 mx-0.5"> </span>}
                            <span className={s === symbolId ? 'text-neon-green font-bold' : ''}>{s}</span>
                          </span>
                        ))}
                      </span>
                      <span className="text-[9px] text-retro-muted font-mono ml-2">×{count}</span>
                    </div>
                  </motion.div>
                ))}
              </div>
            </div>
          )}

          {/* Semantic meaning guess */}
          <div className="bg-robot-amber/5 rounded-lg p-3 ring-1 ring-robot-amber/20">
            <h4 className="text-[10px] text-robot-amber uppercase tracking-wider mb-1 flex items-center gap-1.5">
              <Zap size={10} /> Semantic Analysis
            </h4>
            <p className="text-xs text-retro-muted">
              {totalUses > 0
                ? `Symbol "${symbolId}" appears in ${examples.length} distinct message patterns with ${totalUses} total uses. `
                  + (coOccurring.length > 0
                    ? `Most frequently paired with "${coOccurring[0][0]}" (${coOccurring[0][1]} co-occurrences).`
                    : 'It appears to be used independently.')
                : 'Insufficient data for semantic analysis.'}
            </p>
          </div>
        </div>
      </motion.div>
    </AnimatePresence>
  );
}

/* ───────────────────── CONVERGENCE GAUGE ───────────────────── */

function ConvergenceGauge({ value = 0 }) {
  const [animatedValue, setAnimatedValue] = useState(0);
  const prevValue = useRef(0);
  const animRef = useRef(null);

  useEffect(() => {
    const start = prevValue.current;
    const end = Math.max(0, Math.min(100, value));
    const startTime = performance.now();
    const duration = 800;

    const animate = (now) => {
      const elapsed = now - startTime;
      const t = Math.min(elapsed / duration, 1);
      // Ease out cubic
      const eased = 1 - Math.pow(1 - t, 3);
      setAnimatedValue(start + (end - start) * eased);
      if (t < 1) {
        animRef.current = requestAnimationFrame(animate);
      } else {
        prevValue.current = end;
      }
    };
    animRef.current = requestAnimationFrame(animate);
    return () => { if (animRef.current) cancelAnimationFrame(animRef.current); };
  }, [value]);

  const clamped = Math.max(0, Math.min(100, animatedValue));
  const angle = -135 + (clamped / 100) * 270;
  const cx = 100, cy = 90, r = 65;

  const getColor = (v) => {
    if (v <= 30) return '#ef4444';
    if (v <= 70) return '#eab308';
    return '#22c55e';
  };

  const color = getColor(clamped);

  // Arc path helper
  const arcPath = (startDeg, endDeg, radius) => {
    const s = (startDeg * Math.PI) / 180;
    const e = (endDeg * Math.PI) / 180;
    const x1 = cx + radius * Math.cos(s);
    const y1 = cy + radius * Math.sin(s);
    const x2 = cx + radius * Math.cos(e);
    const y2 = cy + radius * Math.sin(e);
    const large = endDeg - startDeg > 180 ? 1 : 0;
    return `M ${x1} ${y1} A ${radius} ${radius} 0 ${large} 1 ${x2} ${y2}`;
  };

  const needleRad = (angle * Math.PI) / 180;
  const nx = cx + (r - 10) * Math.cos(needleRad);
  const ny = cy + (r - 10) * Math.sin(needleRad);

  return (
    <div className="flex flex-col items-center">
      <svg viewBox="0 0 200 120" className="w-full max-w-[200px]">
        {/* Background arc */}
        <path d={arcPath(-135, 135, r)} fill="none" stroke="#1f2937" strokeWidth={10} strokeLinecap="round" />

        {/* Color zone arcs */}
        <path d={arcPath(-135, -135 + 270 * 0.3, r)} fill="none" stroke="#ef4444" strokeWidth={10} strokeLinecap="round" opacity={0.3} />
        <path d={arcPath(-135 + 270 * 0.3, -135 + 270 * 0.7, r)} fill="none" stroke="#eab308" strokeWidth={10} strokeLinecap="round" opacity={0.3} />
        <path d={arcPath(-135 + 270 * 0.7, 135, r)} fill="none" stroke="#22c55e" strokeWidth={10} strokeLinecap="round" opacity={0.3} />

        {/* Active arc */}
        <path
          d={arcPath(-135, -135 + 270 * (clamped / 100), r)}
          fill="none"
          stroke={color}
          strokeWidth={10}
          strokeLinecap="round"
          filter="url(#gaugeGlow)"
        />

        <defs>
          <filter id="gaugeGlow">
            <feGaussianBlur stdDeviation="2" result="blur" />
            <feMerge>
              <feMergeNode in="blur" />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>
        </defs>

        {/* Tick marks */}
        {[0, 25, 50, 75, 100].map(v => {
          const a = (-135 + (v / 100) * 270) * Math.PI / 180;
          const x1 = cx + (r - 16) * Math.cos(a);
          const y1 = cy + (r - 16) * Math.sin(a);
          const x2 = cx + (r - 8) * Math.cos(a);
          const y2 = cy + (r - 8) * Math.sin(a);
          return (
            <g key={v}>
              <line x1={x1} y1={y1} x2={x2} y2={y2} stroke="#6b7280" strokeWidth={1.5} />
              <text
                x={cx + (r - 24) * Math.cos(a)}
                y={cy + (r - 24) * Math.sin(a)}
                textAnchor="middle"
                dominantBaseline="central"
                fill="#6b7280"
                fontSize="7"
                fontFamily="'JetBrains Mono', monospace"
              >
                {v}
              </text>
            </g>
          );
        })}

        {/* Needle */}
        <line
          x1={cx} y1={cy} x2={nx} y2={ny}
          stroke={color}
          strokeWidth={2.5}
          strokeLinecap="round"
        />
        <circle cx={cx} cy={cy} r={4} fill={color} />
        <circle cx={cx} cy={cy} r={2} fill="#0a0a1a" />

        {/* Center value */}
        <text
          x={cx} y={cy + 24}
          textAnchor="middle"
          fill={color}
          fontSize="20"
          fontWeight="bold"
          fontFamily="'JetBrains Mono', monospace"
        >
          {Math.round(clamped)}%
        </text>
      </svg>
      <p className="text-[10px] text-retro-muted uppercase tracking-wider mt-1">Language Convergence</p>
    </div>
  );
}

/* ───────────────── original D3 Vocab Tree (kept for backward compat) ───────────────── */

function VocabTree({ data }) {
  const svgRef = useRef(null);

  useEffect(() => {
    if (!svgRef.current || !data) return;
    const svg = d3.select(svgRef.current);
    svg.selectAll('*').remove();

    const width = 500;
    const height = 300;
    const margin = { top: 20, right: 120, bottom: 20, left: 40 };
    svg.attr('viewBox', `0 0 ${width} ${height}`);
    const g = svg.append('g').attr('transform', `translate(${margin.left},${margin.top})`);

    const root = d3.hierarchy(data);
    const treeLayout = d3.tree().size([height - margin.top - margin.bottom, width - margin.left - margin.right]);
    treeLayout(root);

    g.selectAll('.link')
      .data(root.links())
      .join('path')
      .attr('class', 'link')
      .attr('fill', 'none')
      .attr('stroke', '#374151')
      .attr('stroke-width', 1.5)
      .attr('d', d3.linkHorizontal().x(d => d.y).y(d => d.x));

    const node = g.selectAll('.node')
      .data(root.descendants())
      .join('g')
      .attr('class', 'node')
      .attr('transform', d => `translate(${d.y},${d.x})`);

    node.append('circle')
      .attr('r', d => d.children ? 6 : 4)
      .attr('fill', (d, i) => d.children ? '#3B82F6' : SYMBOL_COLORS[i % SYMBOL_COLORS.length])
      .attr('stroke', '#1f2937')
      .attr('stroke-width', 1.5);

    node.append('text')
      .attr('dy', '0.35em')
      .attr('x', d => d.children ? -10 : 10)
      .attr('text-anchor', d => d.children ? 'end' : 'start')
      .attr('fill', '#9ca3af')
      .attr('font-size', '11px')
      .attr('font-family', "'JetBrains Mono', monospace")
      .text(d => d.data.name);
  }, [data]);

  return <svg ref={svgRef} className="w-full h-auto" />;
}

/* ───────────────────── MAIN COMPONENT ───────────────────── */

export default function LanguageAnalysis({ metrics, languageData }) {
  const [activeTab, setActiveTab] = useState('vocab');
  const [selectedSymbolId, setSelectedSymbolId] = useState(null);

  const current = languageData?.current;
  const history = languageData?.history;

  const vocabData = useMemo(() => {
    if (!current?.message_frequency) return null;
    return buildVocabTree(current.message_frequency);
  }, [current?.message_frequency]);

  const ngramData = useMemo(() => {
    if (!current?.message_frequency) return [];
    return computeBigrams(current.message_frequency);
  }, [current?.message_frequency]);

  const driftData = useMemo(() => {
    if (!history || history.length === 0) return [];
    return history.map((snap, i) => ({
      episode: snap.episode ?? i,
      vocab_size: snap.vocab_size ?? 0,
      entropy: snap.entropy ?? 0,
      compositionality: snap.compositionality ?? 0,
    }));
  }, [history]);

  const entropyData = useMemo(() => {
    return (metrics?.episodes || []).map((ep, i) => ({
      episode: ep,
      entropy: metrics.entropy?.[i] ?? 0,
    }));
  }, [metrics]);

  const hasData = current && Object.keys(current).length > 0;
  const convergenceValue = current?.convergence != null ? current.convergence * 100 : 0;

  const tabs = [
    { id: 'vocab', label: 'Vocabulary Tree', icon: GitBranch },
    { id: 'symbolmap', label: 'Symbol Map', icon: Network },
    { id: 'heatmap', label: 'Heatmap', icon: Grid3x3 },
    { id: 'growth', label: 'Growth Tree', icon: Activity },
    { id: 'compositionality', label: 'Compositionality', icon: Grid3x3 },
    { id: 'drift', label: 'Semantic Drift', icon: TrendingDown },
    { id: 'grammar', label: 'Grammar Patterns', icon: AlignLeft },
    { id: 'entropy', label: 'Entropy', icon: BarChart3 },
  ];

  const handleSymbolClick = useCallback((symId) => {
    setSelectedSymbolId(symId);
  }, []);

  return (
    <div className="space-y-6 animate-slide-in">
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-bold">Language Analysis</h1>
          <p className="text-sm text-retro-muted mt-1">Deep analysis of emergent communication</p>
        </div>
        {/* Convergence Gauge in header */}
        {hasData && (
          <motion.div
            initial={{ opacity: 0, scale: 0.8 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ delay: 0.2, type: 'spring' }}
            className="flex-shrink-0"
          >
            <ConvergenceGauge value={convergenceValue} />
          </motion.div>
        )}
      </div>

      {/* Tab Navigation */}
      <div className="flex flex-wrap gap-1 bg-steel-dark p-1 rounded-lg border border-steel-border">
        {tabs.map(tab => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={`
              flex items-center gap-2 px-3 py-2 rounded-md text-sm transition-colors
              ${activeTab === tab.id
                ? 'bg-cyber-cyan/20 text-cyber-cyan'
                : 'text-retro-muted hover:text-retro-text hover:bg-steel-dark'
              }
            `}
          >
            <tab.icon size={14} />
            {tab.label}
          </button>
        ))}
      </div>

      {/* Tab Content */}
      <div className="bg-steel-dark rounded-xl p-6 border border-steel-border min-h-[400px]">
        {activeTab === 'vocab' && (
          <div>
            <h3 className="text-sm font-medium text-retro-muted mb-4">Vocabulary Tree — Symbol-Meaning Mappings</h3>
            {!vocabData ? (
              <EmptyState message="No vocabulary data available yet. Start training to see emergent symbol usage." />
            ) : (
              <div>
                <div className="flex gap-4 mb-3 text-xs text-retro-muted">
                  <span>Unique messages: <span className="text-retro-text font-mono">{current?.unique_messages ?? 0}</span></span>
                  <span>Vocab size: <span className="text-retro-text font-mono">{current?.vocab_size ?? 0}</span></span>
                </div>
                <VocabTree data={vocabData} />
              </div>
            )}
          </div>
        )}

        {activeTab === 'symbolmap' && (
          <div>
            <h3 className="text-sm font-medium text-retro-muted mb-4">Interactive Symbol Map — Relationship Network</h3>
            {!hasData ? (
              <EmptyState message="No symbol data available yet. Start training to see the network graph." />
            ) : (
              <InteractiveSymbolMap
                messageFrequency={current.message_frequency}
                symbolUsage={current.symbol_usage}
                onSymbolClick={handleSymbolClick}
              />
            )}
          </div>
        )}

        {activeTab === 'heatmap' && (
          <div>
            <h3 className="text-sm font-medium text-retro-muted mb-4">Compositionality Heatmap — Symbol Pair Co-occurrence</h3>
            {!hasData ? (
              <EmptyState message="No co-occurrence data available yet. Start training to see the heatmap." />
            ) : (
              <CompositionalityHeatmap
                messageFrequency={current.message_frequency}
                onCellClick={(row, col) => {
                  setSelectedSymbolId(row);
                }}
              />
            )}
          </div>
        )}

        {activeTab === 'growth' && (
          <div>
            <h3 className="text-sm font-medium text-retro-muted mb-4">Vocabulary Growth Tree — Symbol Discovery Timeline</h3>
            {!hasData ? (
              <EmptyState message="No vocabulary growth data available yet. Start training to see the evolution." />
            ) : (
              <VocabGrowthTree
                messageFrequency={current.message_frequency}
                symbolUsage={current.symbol_usage}
              />
            )}
          </div>
        )}

        {activeTab === 'compositionality' && (
          <div>
            <h3 className="text-sm font-medium text-retro-muted mb-4">Compositionality — Symbol Usage Distribution</h3>
            {!hasData ? (
              <EmptyState message="No compositionality data available yet. Start training to see analysis." />
            ) : (
              <div className="space-y-6">
                {/* Metric cards */}
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
                  {[
                    { label: 'Compositionality', value: current.compositionality?.toFixed(3) ?? '—', color: 'text-cyber-cyan', bg: 'bg-cyber-cyan/10', ring: 'ring-blue-500/20', tooltipKey: 'compositionality' },
                    { label: 'Word Order Score', value: current.word_order_score?.toFixed(3) ?? '—', color: 'text-neon-green', bg: 'bg-neon-green/10', ring: 'ring-emerald-500/20' },
                    { label: 'Entropy', value: current.entropy?.toFixed(3) ?? '—', color: 'text-purple-400', bg: 'bg-purple-500/10', ring: 'ring-purple-500/20', tooltipKey: 'entropy' },
                    { label: 'Vocab Size', value: current.vocab_size ?? '—', color: 'text-robot-amber', bg: 'bg-robot-amber/10', ring: 'ring-amber-500/20', tooltipKey: 'vocab_size' },
                  ].map((m, mi) => (
                    <motion.div
                      key={m.label}
                      initial={{ opacity: 0, y: 10 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ delay: mi * 0.08 }}
                      className={`${m.bg} rounded-xl p-4 text-center ring-1 ${m.ring}`}
                    >
                      <div className={`text-xl font-bold font-mono ${m.color}`}>{m.value}</div>
                      <div className="text-xs text-retro-muted mt-1"><MetricTooltip metric={m.tooltipKey}>{m.label}</MetricTooltip></div>
                    </motion.div>
                  ))}
                </div>
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                  {/* Radar chart for metric overview */}
                  {(() => {
                    const radarData = [
                      { metric: 'Composition', value: Math.min((current.compositionality ?? 0) * 100, 100) },
                      { metric: 'Word Order', value: Math.min((current.word_order_score ?? 0) * 100, 100) },
                      { metric: 'Efficiency', value: Math.min((1 - (current.entropy ?? 0) / 5) * 100, 100) },
                      { metric: 'Vocab Use', value: Math.min(((current.vocab_size ?? 0) / 50) * 100, 100) },
                    ];
                    return (
                      <div>
                        <h4 className="text-xs text-retro-muted uppercase tracking-wider mb-3">Language Quality Radar</h4>
                        <div className="bg-steel-dark/50 rounded-xl p-4 ring-1 ring-gray-700/50">
                          <ResponsiveContainer width="100%" height={220}>
                            <RadarChart data={radarData}>
                              <PolarGrid stroke="#374151" />
                              <PolarAngleAxis dataKey="metric" tick={{ fill: '#9ca3af', fontSize: 10 }} />
                              <PolarRadiusAxis tick={false} domain={[0, 100]} axisLine={false} />
                              <Radar dataKey="value" stroke="#3B82F6" fill="#3B82F6" fillOpacity={0.25} strokeWidth={2} />
                            </RadarChart>
                          </ResponsiveContainer>
                        </div>
                      </div>
                    );
                  })()}
                  {/* Recharts bar chart for symbol usage */}
                  {current.symbol_usage && current.symbol_usage.length > 0 && (
                    <div>
                      <h4 className="text-xs text-retro-muted uppercase tracking-wider mb-3">Symbol Usage Distribution</h4>
                      <div className="bg-steel-dark/50 rounded-xl p-4 ring-1 ring-gray-700/50">
                        <ResponsiveContainer width="100%" height={220}>
                          <BarChart data={current.symbol_usage.map((val, i) => ({ name: `S${i}`, usage: val }))}>
                            <CartesianGrid strokeDasharray="3 3" stroke="#1f2937" />
                            <XAxis dataKey="name" tick={{ fill: '#9ca3af', fontSize: 10 }} stroke="#374151" />
                            <YAxis tick={{ fill: '#9ca3af', fontSize: 10 }} stroke="#374151" />
                            <Tooltip
                              contentStyle={{ backgroundColor: '#111827', border: '1px solid #374151', borderRadius: '8px', color: '#f3f4f6', fontSize: 12 }}
                            />
                            <Bar dataKey="usage" radius={[4, 4, 0, 0]}>
                              {current.symbol_usage.map((_, i) => (
                                <Cell key={i} fill={SYMBOL_COLORS[i % SYMBOL_COLORS.length]} />
                              ))}
                            </Bar>
                          </BarChart>
                        </ResponsiveContainer>
                      </div>
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>
        )}

        {activeTab === 'drift' && (
          <div>
            <h3 className="text-sm font-medium text-retro-muted mb-4">Semantic Drift — Vocabulary Growth Over Training</h3>
            {driftData.length === 0 ? (
              <EmptyState message="No drift data available yet. Training history will appear here as sessions run." />
            ) : (
              <div className="space-y-4">
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                  {[
                    { label: 'Current Vocab', value: driftData[driftData.length - 1]?.vocab_size ?? 0, color: 'text-cyber-cyan' },
                    { label: 'Peak Entropy', value: Math.max(...driftData.map(d => d.entropy)).toFixed(2), color: 'text-purple-400' },
                    { label: 'Drift Score', value: current.semantic_drift?.toFixed(4) ?? '—', color: 'text-robot-amber' },
                  ].map(s => (
                    <div key={s.label} className="bg-steel-dark/50 rounded-lg px-4 py-3 ring-1 ring-gray-700/50">
                      <p className="text-[10px] text-retro-muted uppercase tracking-wider">{s.label}</p>
                      <p className={`text-lg font-bold font-mono ${s.color} mt-0.5`}>{s.value}</p>
                    </div>
                  ))}
                </div>
                <div className="h-72 bg-steel-dark/30 rounded-xl p-3 ring-1 ring-gray-700/50">
                  <ResponsiveContainer width="100%" height="100%">
                    <AreaChart data={driftData}>
                      <defs>
                        <linearGradient id="gradVocab" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="5%" stopColor="#3B82F6" stopOpacity={0.3} />
                          <stop offset="95%" stopColor="#3B82F6" stopOpacity={0} />
                        </linearGradient>
                        <linearGradient id="gradComp" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="5%" stopColor="#10B981" stopOpacity={0.3} />
                          <stop offset="95%" stopColor="#10B981" stopOpacity={0} />
                        </linearGradient>
                      </defs>
                      <CartesianGrid strokeDasharray="3 3" stroke="#1f2937" />
                      <XAxis
                        dataKey="episode"
                        stroke="#6b7280"
                        tick={{ fill: '#9ca3af', fontSize: 11 }}
                        tickFormatter={v => v >= 1000 ? `${(v / 1000).toFixed(0)}k` : v}
                      />
                      <YAxis stroke="#6b7280" tick={{ fill: '#9ca3af', fontSize: 11 }} />
                      <Tooltip
                        contentStyle={{
                          backgroundColor: '#111827',
                          border: '1px solid #374151',
                          borderRadius: '8px',
                          color: '#f3f4f6',
                          fontSize: 12,
                        }}
                      />
                      <Area type="monotone" dataKey="vocab_size" stroke="#3B82F6" strokeWidth={2} fill="url(#gradVocab)" dot={false} name="Vocab Size" />
                      <Area type="monotone" dataKey="compositionality" stroke="#10B981" strokeWidth={2} fill="url(#gradComp)" dot={false} name="Compositionality" />
                      <Legend
                        verticalAlign="top"
                        height={32}
                        iconType="circle"
                        wrapperStyle={{ fontSize: 11, color: '#9ca3af' }}
                      />
                    </AreaChart>
                  </ResponsiveContainer>
                </div>
              </div>
            )}
          </div>
        )}

        {activeTab === 'grammar' && (
          <div>
            <h3 className="text-sm font-medium text-retro-muted mb-4">Grammar Pattern Detector — N-gram Analysis</h3>
            {ngramData.length === 0 ? (
              <EmptyState message="No grammar patterns detected yet. Messages need at least 2 symbols for bigram analysis." />
            ) : (
              <div className="space-y-6">
                <div className="grid grid-cols-3 gap-3">
                  {[
                    { label: 'Unique Bigrams', value: ngramData.length, color: 'text-cyber-cyan' },
                    { label: 'Most Frequent', value: ngramData[0]?.ngram ?? '—', color: 'text-neon-green' },
                    { label: 'Avg Info Content', value: (ngramData.reduce((s, n) => s + n.information, 0) / ngramData.length).toFixed(2) + ' bits', color: 'text-purple-400' },
                  ].map(s => (
                    <div key={s.label} className="bg-steel-dark/50 rounded-lg px-4 py-3 ring-1 ring-gray-700/50">
                      <p className="text-[10px] text-retro-muted uppercase tracking-wider">{s.label}</p>
                      <p className={`text-lg font-bold font-mono ${s.color} mt-0.5`}>{s.value}</p>
                    </div>
                  ))}
                </div>
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                  <div className="bg-steel-dark/50 rounded-xl p-4 ring-1 ring-gray-700/50">
                    <h4 className="text-xs text-retro-muted uppercase tracking-wider mb-3">Bigram Frequency</h4>
                    <ResponsiveContainer width="100%" height={200}>
                      <BarChart data={ngramData.slice(0, 8)} layout="vertical">
                        <CartesianGrid strokeDasharray="3 3" stroke="#1f2937" horizontal={false} />
                        <XAxis type="number" tick={{ fill: '#9ca3af', fontSize: 10 }} stroke="#374151" />
                        <YAxis type="category" dataKey="ngram" tick={{ fill: '#9ca3af', fontSize: 11, fontFamily: 'monospace' }} stroke="#374151" width={50} />
                        <Tooltip
                          contentStyle={{ backgroundColor: '#111827', border: '1px solid #374151', borderRadius: '8px', color: '#f3f4f6', fontSize: 12 }}
                        />
                        <Bar dataKey="frequency" radius={[0, 4, 4, 0]}>
                          {ngramData.slice(0, 8).map((_, i) => (
                            <Cell key={i} fill={`hsl(${210 + i * 15}, 70%, ${55 - i * 3}%)`} />
                          ))}
                        </Bar>
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                  <div className="bg-steel-dark/50 rounded-xl p-4 ring-1 ring-gray-700/50">
                    <h4 className="text-xs text-retro-muted uppercase tracking-wider mb-3">Information Content (bits)</h4>
                    <ResponsiveContainer width="100%" height={200}>
                      <BarChart data={ngramData.slice().sort((a, b) => a.information - b.information).slice(0, 8)} layout="vertical">
                        <CartesianGrid strokeDasharray="3 3" stroke="#1f2937" horizontal={false} />
                        <XAxis type="number" tick={{ fill: '#9ca3af', fontSize: 10 }} stroke="#374151" />
                        <YAxis type="category" dataKey="ngram" tick={{ fill: '#9ca3af', fontSize: 11, fontFamily: 'monospace' }} stroke="#374151" width={50} />
                        <Tooltip
                          contentStyle={{ backgroundColor: '#111827', border: '1px solid #374151', borderRadius: '8px', color: '#f3f4f6', fontSize: 12 }}
                          formatter={(v) => [`${v.toFixed(2)} bits`, 'Info Content']}
                        />
                        <Bar dataKey="information" radius={[0, 4, 4, 0]}>
                          {ngramData.slice().sort((a, b) => a.information - b.information).slice(0, 8).map((_, i) => (
                            <Cell key={i} fill={`hsl(${150 + i * 12}, 65%, ${50 - i * 3}%)`} />
                          ))}
                        </Bar>
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                </div>
              </div>
            )}
          </div>
        )}

        {activeTab === 'entropy' && (
          <div>
            <h3 className="text-sm font-medium text-retro-muted mb-4">Message Entropy Over Training</h3>
            {entropyData.length === 0 ? (
              <div className="text-retro-muted text-center py-12">No entropy data available yet</div>
            ) : (
              <div className="space-y-4">
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                  {[
                    { label: 'Current', value: entropyData[entropyData.length - 1]?.entropy?.toFixed(3) ?? '—', color: 'text-purple-400' },
                    { label: 'Peak', value: Math.max(...entropyData.map(d => d.entropy)).toFixed(3), color: 'text-retro-error' },
                    { label: 'Min', value: Math.min(...entropyData.map(d => d.entropy)).toFixed(3), color: 'text-neon-green' },
                    { label: 'Mean', value: (entropyData.reduce((s, d) => s + d.entropy, 0) / entropyData.length).toFixed(3), color: 'text-cyber-cyan' },
                  ].map(s => (
                    <div key={s.label} className="bg-steel-dark/50 rounded-lg px-4 py-3 ring-1 ring-gray-700/50">
                      <p className="text-[10px] text-retro-muted uppercase tracking-wider">{s.label}</p>
                      <p className={`text-lg font-bold font-mono ${s.color} mt-0.5`}>{s.value}</p>
                    </div>
                  ))}
                </div>
                <div className="h-72 bg-steel-dark/30 rounded-xl p-3 ring-1 ring-gray-700/50">
                  <ResponsiveContainer width="100%" height="100%">
                    <AreaChart data={entropyData}>
                      <defs>
                        <linearGradient id="gradEntropy" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="5%" stopColor={METRIC_COLORS.entropy} stopOpacity={0.3} />
                          <stop offset="95%" stopColor={METRIC_COLORS.entropy} stopOpacity={0} />
                        </linearGradient>
                      </defs>
                      <CartesianGrid strokeDasharray="3 3" stroke="#1f2937" />
                      <XAxis
                        dataKey="episode"
                        stroke="#6b7280"
                        tick={{ fill: '#9ca3af', fontSize: 11 }}
                        tickFormatter={v => v >= 1000 ? `${(v / 1000).toFixed(0)}k` : v}
                      />
                      <YAxis stroke="#6b7280" tick={{ fill: '#9ca3af', fontSize: 11 }} />
                      <Tooltip
                        contentStyle={{
                          backgroundColor: '#111827',
                          border: '1px solid #374151',
                          borderRadius: '8px',
                          color: '#f3f4f6',
                          fontSize: 12,
                        }}
                      />
                      <ReferenceLine
                        y={entropyData.reduce((s, d) => s + d.entropy, 0) / entropyData.length}
                        stroke="#6b7280"
                        strokeDasharray="6 3"
                        label={{ value: 'Mean', fill: '#6b7280', fontSize: 10, position: 'right' }}
                      />
                      <Area
                        type="monotone"
                        dataKey="entropy"
                        stroke={METRIC_COLORS.entropy}
                        strokeWidth={2}
                        fill="url(#gradEntropy)"
                        dot={false}
                      />
                    </AreaChart>
                  </ResponsiveContainer>
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Symbol Deep Dive Panel (overlay) */}
      {selectedSymbolId && (
        <div className="fixed inset-0 z-40" onClick={() => setSelectedSymbolId(null)}>
          <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" />
          <div className="absolute right-0 top-0 h-full" onClick={e => e.stopPropagation()}>
            <SymbolDeepDive
              symbolId={selectedSymbolId}
              messageFrequency={current?.message_frequency}
              symbolUsage={current?.symbol_usage}
              history={history}
              onClose={() => setSelectedSymbolId(null)}
            />
          </div>
        </div>
      )}
    </div>
  );
}
