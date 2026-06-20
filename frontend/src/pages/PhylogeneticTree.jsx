import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { Play, Pause, RotateCcw, FastForward, TreePine, ChevronRight, GitBranch, Zap, X } from 'lucide-react';
import * as api from '../utils/api';
import { ensureSprites, SPRITE_NAMES } from '../utils/pixelEngine';
import PixelCanvasHeader from '../components/PixelCanvasHeader';

/* ─── colour palette ─── */
const COL = {
  bg:      '#0a0a0a',
  panel:   '#1a1a2e',
  green:   '#00ff88',
  amber:   '#ffaa00',
  cyan:    '#00ddff',
  red:     '#ff4444',
  purple:  '#aa55ff',
  pink:    '#ff55aa',
  dim:     '#555577',
  text:    '#e0e0e0',
  muted:   '#8a8a9a',
  border:  '#2d2d44',
};

const MUTATION_COLORS = {
  new_symbol: COL.green,
  extinction: COL.red,
  meaning_change: COL.amber,
  usage_shift: COL.cyan,
  drift: COL.purple,
};

const DIALECT_PALETTE = ['#00ff88', '#00ddff', '#ffaa00', '#ff4444', '#aa55ff', '#ff55aa', '#55ffaa', '#ffff55'];

/* ─── Tree layout engine ─── */
function layoutTree(tree) {
  if (!tree || !tree.root_id || !tree.snapshots) return { nodes: [], edges: [], branches: [] };

  const snapshots = tree.snapshots;
  const rootId = tree.root_id;
  const nodes = [];
  const edges = [];
  const posMap = {};

  // BFS to assign positions
  const queue = [{ id: rootId, depth: 0, col: 0 }];
  const depthCounts = {};
  const depthChildren = {};

  // First pass: compute subtree sizes
  function subtreeSize(id) {
    const snap = snapshots[id];
    if (!snap || !snap.children || snap.children.length === 0) return 1;
    return snap.children.reduce((sum, cid) => sum + subtreeSize(cid), 0);
  }

  // Assign positions using a simple layered approach
  function assignPos(id, depth, colStart) {
    const snap = snapshots[id];
    if (!snap) return colStart;

    const children = snap.children || [];
    const width = Math.max(1, subtreeSize(id));

    if (children.length === 0) {
      // Leaf
      posMap[id] = { depth, col: colStart };
      return colStart + 1;
    }

    let currentCol = colStart;
    const childPositions = [];
    for (const cid of children) {
      const before = currentCol;
      currentCol = assignPos(cid, depth + 1, currentCol);
      childPositions.push(before);
    }

    // Center parent over children
    const firstCol = childPositions[0];
    const lastCol = currentCol - 1;
    posMap[id] = { depth, col: (firstCol + lastCol) / 2 };

    return currentCol;
  }

  assignPos(rootId, 0, 0);

  // Build nodes array
  const maxDepth = Math.max(...Object.values(posMap).map(p => p.depth), 0);
  const maxCol = Math.max(...Object.values(posMap).map(p => p.col), 0);

  const NODE_W = 160;
  const NODE_H = 50;
  const H_GAP = 80;
  const V_GAP = 100;
  const PADDING = 60;

  for (const [id, pos] of Object.entries(posMap)) {
    const snap = snapshots[id];
    nodes.push({
      id,
      x: PADDING + pos.col * (NODE_W + H_GAP),
      y: PADDING + pos.depth * (NODE_H + V_GAP),
      w: NODE_W,
      h: NODE_H,
      snap,
      depth: pos.depth,
    });
  }

  // Build edges
  for (const node of nodes) {
    const snap = node.snap;
    if (snap.children) {
      for (const cid of snap.children) {
        const childNode = nodes.find(n => n.id === cid);
        if (childNode) {
          edges.push({
            from: node,
            to: childNode,
            fromId: node.id,
            toId: cid,
          });
        }
      }
    }
  }

  // Branch edges
  const branchEdges = (tree.branches || []).map(b => {
    const parentNode = nodes.find(n => n.id === b.parent_id);
    const childA = nodes.find(n => n.id === b.child_a_id);
    const childB = nodes.find(n => n.id === b.child_b_id);
    return { ...b, parentNode, childA, childB };
  });

  // SVG dimensions
  const svgW = Math.max(800, PADDING * 2 + (maxCol + 1) * (NODE_W + H_GAP));
  const svgH = Math.max(400, PADDING * 2 + (maxDepth + 1) * (NODE_H + V_GAP)) + 60;

  return { nodes, edges, branches: branchEdges, svgW, svgH, maxDepth };
}

/* ─── Main component ─── */
export default function PhylogeneticTree() {
  const [sessions, setSessions] = useState([]);
  const [selectedSession, setSelectedSession] = useState('');
  const [tree, setTree] = useState(null);
  const [mutations, setMutations] = useState([]);
  const [dialects, setDialects] = useState(null);
  const [loading, setLoading] = useState(false);
  const [selectedNode, setSelectedNode] = useState(null);
  const [timeIdx, setTimeIdx] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [speed, setSpeed] = useState(1);
  const [showMutations, setShowMutations] = useState(true);
  const playRef = useRef(null);
  const [snapshotsSorted, setSnapshotsSorted] = useState([]);

  /* ─── load sessions ─── */
  useEffect(() => {
    (async () => {
      try {
        const data = await api.fetchSessions();
        setSessions(data);
        if (data.length > 0) setSelectedSession(data[0].session_id);
      } catch {
        setSessions([{ session_id: '1', name: 'Demo Session' }]);
        setSelectedSession('1');
      }
    })();
  }, []);

  /* ─── load tree data ─── */
  const fetchTree = useCallback(async () => {
    if (!selectedSession) return;
    setLoading(true);
    try {
      const [treeData, mutData, diaData] = await Promise.all([
        api.fetchPhyloTree(selectedSession),
        api.fetchPhyloMutations(selectedSession),
        api.fetchPhyloDialects(selectedSession),
      ]);
      setTree(treeData);
      setMutations(mutData.mutations || []);
      setDialects(diaData);

      // Sort snapshots by timestamp
      if (treeData.snapshots) {
        const sorted = Object.values(treeData.snapshots).sort((a, b) => a.timestamp - b.timestamp);
        setSnapshotsSorted(sorted);
        setTimeIdx(sorted.length - 1);
      }
    } catch (err) {
      console.error('Failed to fetch phylogenetic data:', err);
      setTree(null);
    } finally {
      setLoading(false);
    }
  }, [selectedSession]);

  useEffect(() => { fetchTree(); }, [fetchTree]);

  /* ─── layout ─── */
  const layout = useMemo(() => layoutTree(tree), [tree]);

  /* ─── playback ─── */
  useEffect(() => {
    if (playing && snapshotsSorted.length > 0) {
      playRef.current = setInterval(() => {
        setTimeIdx(prev => {
          if (prev >= snapshotsSorted.length - 1) {
            setPlaying(false);
            return prev;
          }
          return prev + 1;
        });
      }, 1200 / speed);
    }
    return () => clearInterval(playRef.current);
  }, [playing, speed, snapshotsSorted.length]);

  /* ─── current snapshot for time-travel ─── */
  const currentTimeSnap = snapshotsSorted[timeIdx] || null;
  const visibleNodeIds = useMemo(() => {
    if (!currentTimeSnap || !tree) return new Set();
    // Show all nodes up to current time
    const cutoff = currentTimeSnap.timestamp;
    return new Set(
      Object.values(tree.snapshots)
        .filter(s => s.timestamp <= cutoff + 0.001)
        .map(s => s.id)
    );
  }, [currentTimeSnap, tree]);

  /* ─── mutation lookup per edge ─── */
  const mutationsByEdge = useMemo(() => {
    const map = {};
    for (const m of mutations) {
      const key = `${m.from_snapshot}-${m.to_snapshot}`;
      if (!map[key]) map[key] = [];
      map[key].push(m);
    }
    return map;
  }, [mutations]);

  /* ─── node click handler ─── */
  const handleNodeClick = useCallback((nodeId) => {
    setSelectedNode(prev => prev === nodeId ? null : nodeId);
  }, []);

  /* ─── stats ─── */
  const stats = tree?.stats || {};

  /* ─── no-data guard ─── */
  if (!loading && !tree) {
    return (
      <div style={{ padding: 32 }}>
        <h1 style={{ color: COL.text, fontFamily: 'JetBrains Mono, monospace' }}>
          <TreePine size={24} style={{ color: COL.green, verticalAlign: 'middle', marginRight: 8 }} />
          LANGUAGE PHYLOGENY
        </h1>
        <p style={{ color: COL.muted, fontFamily: 'JetBrains Mono, monospace', marginTop: 8 }}>
          Select a session to view language evolution tree
        </p>
      </div>
    );
  }

  /* ─── render ─── */
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16, fontFamily: 'JetBrains Mono, monospace' }}>

      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 12 }}>
        <div>
          <h1 style={{ fontSize: 20, fontWeight: 700, color: COL.text, display: 'flex', alignItems: 'center', gap: 8, margin: 0 }}>
            <TreePine size={22} style={{ color: COL.green }} />
            LANGUAGE PHYLOGENY
          </h1>
          <p style={{ fontSize: 12, color: COL.muted, marginTop: 4 }}>
            Phylogenetic tree of emergent language evolution
          </p>
        </div>
        <div style={{ display: 'flex', gap: 16, alignItems: 'center' }}>
          {[
            { label: 'NEW', color: MUTATION_COLORS.new_symbol },
            { label: 'EXTINCT', color: MUTATION_COLORS.extinction },
            { label: 'CHANGED', color: MUTATION_COLORS.meaning_change },
            { label: 'DIALECT', color: COL.purple },
          ].map(l => (
            <div key={l.label} style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
              <div style={{ width: 8, height: 8, borderRadius: '50%', background: l.color, boxShadow: `0 0 6px ${l.color}` }} />
              <span style={{ fontSize: 10, color: l.color, letterSpacing: 1 }}>{l.label}</span>
            </div>
          ))}
        </div>
      </div>

      {/* Session selector + Stats */}
      <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
        <div style={{ background: COL.panel, border: `1px solid ${COL.border}`, borderRadius: 12, padding: '12px 16px', flex: '0 0 auto' }}>
          <label style={{ fontSize: 10, color: COL.muted, textTransform: 'uppercase', letterSpacing: 1.5, display: 'block', marginBottom: 6 }}>Session</label>
          <select
            value={selectedSession}
            onChange={e => { setSelectedSession(e.target.value); setPlaying(false); setSelectedNode(null); }}
            style={{
              background: COL.bg, border: `1px solid ${COL.border}`, borderRadius: 8,
              padding: '6px 12px', fontSize: 13, color: COL.text, outline: 'none',
              fontFamily: 'JetBrains Mono, monospace',
            }}
          >
            {sessions.map(s => (
              <option key={s.session_id} value={s.session_id}>{s.name || `Session ${s.session_id}`}</option>
            ))}
          </select>
        </div>

        {/* Stats cards */}
        {[
          { label: 'Symbols', value: stats.total_symbols || 0, color: COL.green },
          { label: 'Snapshots', value: stats.total_snapshots || 0, color: COL.cyan },
          { label: 'Mutations', value: stats.total_mutations || 0, color: COL.amber },
          { label: 'Dialects', value: stats.active_dialects || 0, color: COL.purple },
          { label: 'Mut Rate', value: (stats.mutation_rate || 0).toFixed(1), color: COL.pink },
          { label: 'Depth', value: stats.tree_depth || 0, color: COL.red },
        ].map(s => (
          <div key={s.label} style={{
            background: COL.panel, border: `1px solid ${COL.border}`, borderRadius: 12,
            padding: '10px 16px', minWidth: 90, textAlign: 'center',
          }}>
            <div style={{ fontSize: 9, color: COL.muted, textTransform: 'uppercase', letterSpacing: 1.5, marginBottom: 4 }}>{s.label}</div>
            <div style={{ fontSize: 20, fontWeight: 700, color: s.color }}>{s.value}</div>
          </div>
        ))}
      </div>

      {/* Playback controls */}
      <div style={{
        background: COL.panel, border: `1px solid ${COL.border}`, borderRadius: 12,
        padding: '12px 20px', display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap',
      }}>
        {/* Play/Pause */}
        <button
          onClick={() => {
            if (timeIdx >= snapshotsSorted.length - 1) setTimeIdx(0);
            setPlaying(p => !p);
          }}
          style={{
            width: 36, height: 36, borderRadius: '50%', border: `1.5px solid ${COL.green}`,
            background: playing ? `${COL.green}22` : 'transparent',
            color: COL.green, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}
          title={playing ? 'Pause' : 'Play'}
        >
          {playing ? <Pause size={16} /> : <Play size={16} style={{ marginLeft: 2 }} />}
        </button>

        {/* Reset */}
        <button
          onClick={() => { setTimeIdx(0); setPlaying(false); }}
          style={{
            width: 36, height: 36, borderRadius: '50%', border: `1.5px solid ${COL.dim}`,
            background: 'transparent', color: COL.dim, cursor: 'pointer',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}
          title="Reset"
        >
          <RotateCcw size={14} />
        </button>

        {/* Speed */}
        <button
          onClick={() => setSpeed(s => s >= 4 ? 1 : s * 2)}
          style={{
            border: `1px solid ${COL.border}`, borderRadius: 8, background: 'transparent',
            color: COL.amber, cursor: 'pointer', padding: '4px 10px', fontSize: 11,
            fontFamily: 'JetBrains Mono, monospace',
          }}
          title="Playback speed"
        >
          {speed}x
        </button>

        {/* Time slider */}
        <input
          type="range"
          min={0}
          max={Math.max(0, snapshotsSorted.length - 1)}
          value={timeIdx}
          onChange={e => { setTimeIdx(Number(e.target.value)); setPlaying(false); }}
          style={{
            flex: 1, minWidth: 200, height: 6, appearance: 'none', WebkitAppearance: 'none',
            background: `linear-gradient(to right, ${COL.green} 0%, ${COL.green} ${(timeIdx / Math.max(1, snapshotsSorted.length - 1)) * 100}%, ${COL.border} ${(timeIdx / Math.max(1, snapshotsSorted.length - 1)) * 100}%, ${COL.border} 100%)`,
            borderRadius: 3, outline: 'none', cursor: 'pointer',
          }}
        />

        {/* Time label */}
        <div style={{ fontSize: 13, color: COL.text, minWidth: 120, textAlign: 'right' }}>
          {currentTimeSnap ? (
            <>
              <span style={{ color: COL.green }}>{currentTimeSnap.label}</span>
              <span style={{ color: COL.muted }}> · ep {currentTimeSnap.episode}</span>
            </>
          ) : '—'}
        </div>

        {/* Toggle mutations */}
        <button
          onClick={() => setShowMutations(v => !v)}
          style={{
            border: `1px solid ${showMutations ? COL.amber : COL.border}`, borderRadius: 8,
            background: showMutations ? `${COL.amber}15` : 'transparent',
            color: showMutations ? COL.amber : COL.dim, cursor: 'pointer',
            padding: '4px 10px', fontSize: 11, fontFamily: 'JetBrains Mono, monospace',
          }}
        >
          <Zap size={12} style={{ verticalAlign: 'middle', marginRight: 4 }} />
          Mutations
        </button>
      </div>

      {/* Time tick marks */}
      {snapshotsSorted.length > 0 && (
        <div style={{ display: 'flex', justifyContent: 'space-between', padding: '0 20px' }}>
          {snapshotsSorted.map((snap, i) => (
            <div
              key={snap.id}
              onClick={() => { setTimeIdx(i); setPlaying(false); }}
              style={{
                fontSize: 9, color: i === timeIdx ? COL.green : COL.dim,
                cursor: 'pointer', textAlign: 'center', flex: 1,
              }}
            >
              <div style={{
                width: 6, height: 6, borderRadius: '50%', margin: '0 auto 3px',
                background: i === timeIdx ? COL.green : i <= timeIdx ? COL.dim : COL.border,
                boxShadow: i === timeIdx ? `0 0 6px ${COL.green}` : 'none',
              }} />
              {snap.label}
            </div>
          ))}
        </div>
      )}

      {/* Pixel art evolution scene */}
      <PixelCanvasHeader
        agents={layout.nodes.slice(0, 6).map((n, i) => ({
          name: n.snap.label || `Gen ${n.snap.episode}`,
          color: DIALECT_PALETTE[n.snap.dialect_group ? n.snap.dialect_group % DIALECT_PALETTE.length : i % DIALECT_PALETTE.length],
          sprite: SPRITE_NAMES[n.snap.episode % SPRITE_NAMES.length],
        }))}
        height={100}
        showTerrain={false}
        label="EVOLUTION TIMELINE"
      />

      {/* Main tree SVG */}
      <div style={{
        background: COL.panel, border: `1px solid ${COL.border}`,
        borderRadius: 12, padding: 24, overflow: 'auto', position: 'relative',
      }}>
        {loading ? (
          <div style={{ height: 300, display: 'flex', alignItems: 'center', justifyContent: 'center', color: COL.muted }}>
            Building phylogenetic tree…
          </div>
        ) : layout.nodes.length > 0 ? (
          <svg viewBox={`0 0 ${layout.svgW} ${layout.svgH}`} style={{ width: '100%', maxHeight: 600, display: 'block' }}>

            {/* Grid lines (subtle) */}
            {Array.from({ length: layout.maxDepth + 1 }, (_, d) => (
              <line key={`grid-${d}`}
                x1={30} y1={60 + d * 150 + 25}
                x2={layout.svgW - 30} y2={60 + d * 150 + 25}
                stroke={COL.border} strokeWidth={0.5} strokeDasharray="4,8" strokeOpacity={0.3}
              />
            ))}

            {/* Edges (parent → child) */}
            {layout.edges.map((edge, i) => {
              const isVisible = visibleNodeIds.has(edge.fromId) && visibleNodeIds.has(edge.toId);
              const x1 = edge.from.x + edge.from.w / 2;
              const y1 = edge.from.y + edge.from.h;
              const x2 = edge.to.x + edge.to.w / 2;
              const y2 = edge.to.y;
              const midY = (y1 + y2) / 2;

              // Check for mutations on this edge
              const edgeKey = `${edge.fromId}-${edge.toId}`;
              const edgeMutations = mutationsByEdge[edgeKey] || [];
              const hasNew = edgeMutations.some(m => m.type === 'new_symbol');
              const hasExtinct = edgeMutations.some(m => m.type === 'extinction');
              const hasChange = edgeMutations.some(m => m.type === 'meaning_change');

              let edgeColor = COL.dim;
              if (hasNew) edgeColor = COL.green;
              else if (hasExtinct) edgeColor = COL.red;
              else if (hasChange) edgeColor = COL.amber;

              // Check dialect coloring
              const toSnap = edge.to.snap;
              if (toSnap.dialect_group && tree?.dialect_colors?.[toSnap.dialect_group]) {
                edgeColor = tree.dialect_colors[toSnap.dialect_group];
              }

              return (
                <g key={`edge-${i}`} opacity={isVisible ? 1 : 0.15} style={{ transition: 'opacity 0.5s' }}>
                  {/* Edge path (curved) */}
                  <path
                    d={`M ${x1} ${y1} C ${x1} ${midY}, ${x2} ${midY}, ${x2} ${y2}`}
                    fill="none"
                    stroke={edgeColor}
                    strokeWidth={isVisible ? 2 : 1}
                    strokeOpacity={0.6}
                    style={{ transition: 'all 0.5s' }}
                  />

                  {/* Mutation badges on edge */}
                  {showMutations && isVisible && edgeMutations.length > 0 && (
                    <g>
                      {/* Badge background */}
                      <rect
                        x={((x1 + x2) / 2) - 20} y={midY - 10}
                        width={40} height={20} rx={4}
                        fill={COL.bg} stroke={edgeColor} strokeWidth={1} strokeOpacity={0.5}
                      />
                      <text
                        x={(x1 + x2) / 2} y={midY + 4}
                        textAnchor="middle" fill={edgeColor}
                        fontSize="9" fontWeight="700"
                        fontFamily="JetBrains Mono, monospace"
                      >
                        {edgeMutations.length}Δ
                      </text>
                      {/* Mutation type indicators */}
                      {edgeMutations.slice(0, 3).map((m, mi) => (
                        <circle
                          key={m.id}
                          cx={((x1 + x2) / 2) - 12 + mi * 12}
                          cy={midY + 16}
                          r={3}
                          fill={MUTATION_COLORS[m.type] || COL.dim}
                        />
                      ))}
                    </g>
                  )}
                </g>
              );
            })}

            {/* Branch labels */}
            {layout.branches.map((br, i) => {
              if (!br.parentNode || !br.childA || !br.childB) return null;
              const isVisible = visibleNodeIds.has(br.parentNode.id);
              const px = br.parentNode.x + br.parentNode.w / 2;
              const py = br.parentNode.y + br.parentNode.h + 15;
              return (
                <g key={`branch-${i}`} opacity={isVisible ? 0.8 : 0.1}>
                  <GitBranch size={10} />
                  <text
                    x={px} y={py}
                    textAnchor="middle" fill={COL.purple}
                    fontSize="9" fontFamily="JetBrains Mono, monospace"
                  >
                    ⑂ {br.split_reason?.slice(0, 30) || 'dialect split'}
                  </text>
                </g>
              );
            })}

            {/* Nodes */}
            {layout.nodes.map(node => {
              const isVisible = visibleNodeIds.has(node.id);
              const isSelected = selectedNode === node.id;
              const isLeaf = node.snap.is_leaf;
              const isCurrent = currentTimeSnap?.id === node.id;
              const dialectGroup = node.snap.dialect_group;
              const nodeColor = dialectGroup && tree?.dialect_colors?.[dialectGroup]
                ? tree.dialect_colors[dialectGroup]
                : isLeaf ? COL.green : COL.cyan;

              return (
                <g
                  key={node.id}
                  onClick={() => handleNodeClick(node.id)}
                  style={{ cursor: 'pointer' }}
                  opacity={isVisible ? 1 : 0.15}
                >
                  {/* Glow for current state */}
                  {isCurrent && (
                    <rect
                      x={node.x - 4} y={node.y - 4}
                      width={node.w + 8} height={node.h + 8}
                      rx={12}
                      fill="none" stroke={COL.green}
                      strokeWidth={2} strokeOpacity={0.5}
                      style={{ filter: `drop-shadow(0 0 8px ${COL.green})` }}
                    />
                  )}

                  {/* Selection ring */}
                  {isSelected && (
                    <rect
                      x={node.x - 3} y={node.y - 3}
                      width={node.w + 6} height={node.h + 6}
                      rx={11}
                      fill="none" stroke={COL.amber}
                      strokeWidth={2} strokeDasharray="4,3"
                    />
                  )}

                  {/* Node body */}
                  <rect
                    x={node.x} y={node.y}
                    width={node.w} height={node.h}
                    rx={8}
                    fill={isSelected ? `${nodeColor}22` : `${COL.panel}ee`}
                    stroke={nodeColor}
                    strokeWidth={isCurrent ? 2 : 1.5}
                    style={{
                      filter: isCurrent ? `drop-shadow(0 0 6px ${nodeColor})` : 'none',
                      transition: 'all 0.3s',
                    }}
                  />

                  {/* Pixel art sprite avatar */}
                  <image
                    href={`/sprites/${SPRITE_NAMES[node.snap.episode % SPRITE_NAMES.length]}.png`}
                    x={node.x + node.w / 2 - 12}
                    y={node.y + 2}
                    width={24}
                    height={36}
                    style={{ imageRendering: 'pixelated' }}
                    opacity={isVisible ? 0.9 : 0.3}
                  />

                  {/* Node label */}
                  <text
                    x={node.x + node.w / 2} y={node.y + 18}
                    textAnchor="middle" fill={nodeColor}
                    fontSize="13" fontWeight="700"
                    fontFamily="JetBrains Mono, monospace"
                  >
                    {node.snap.label}
                  </text>

                  {/* Symbol count */}
                  <text
                    x={node.x + node.w / 2} y={node.y + 34}
                    textAnchor="middle" fill={COL.muted}
                    fontSize="10" fontFamily="JetBrains Mono, monospace"
                  >
                    {node.snap.total_symbols} symbols · ep {node.snap.episode}
                  </text>

                  {/* Leaf indicator */}
                  {isLeaf && (
                    <circle
                      cx={node.x + node.w - 8} cy={node.y + 8}
                      r={4} fill={nodeColor}
                      style={{ filter: `drop-shadow(0 0 4px ${nodeColor})` }}
                    />
                  )}

                  {/* Dialect badge */}
                  {dialectGroup && (
                    <rect
                      x={node.x + 4} y={node.y + node.h - 14}
                      width={40} height={12} rx={3}
                      fill={tree?.dialect_colors?.[dialectGroup] || COL.dim}
                      fillOpacity={0.2}
                    />
                  )}
                  {dialectGroup && (
                    <text
                      x={node.x + 24} y={node.y + node.h - 5}
                      textAnchor="middle"
                      fill={tree?.dialect_colors?.[dialectGroup] || COL.dim}
                      fontSize="8" fontFamily="JetBrains Mono, monospace"
                    >
                      {dialectGroup}
                    </text>
                  )}
                </g>
              );
            })}
          </svg>
        ) : (
          <div style={{ height: 200, display: 'flex', alignItems: 'center', justifyContent: 'center', color: COL.muted }}>
            No tree data available
          </div>
        )}
      </div>

      {/* Node detail panel (vocabulary at selected point) */}
      {selectedNode && tree?.snapshots?.[selectedNode] && (
        <NodeDetailPanel
          snap={tree.snapshots[selectedNode]}
          mutations={mutations.filter(m => m.to_snapshot === selectedNode)}
          onClose={() => setSelectedNode(null)}
        />
      )}

      {/* Mutations timeline */}
      {mutations.length > 0 && (
        <div style={{ background: COL.panel, border: `1px solid ${COL.border}`, borderRadius: 12, padding: 16 }}>
          <div style={{ fontSize: 11, color: COL.muted, marginBottom: 10, letterSpacing: 1, textTransform: 'uppercase', display: 'flex', alignItems: 'center', gap: 6 }}>
            <Zap size={12} style={{ color: COL.amber }} />
            Mutation Log ({mutations.length} events)
          </div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, maxHeight: 160, overflow: 'auto' }}>
            {mutations.map((m, i) => (
              <div key={m.id || i} style={{
                background: `${MUTATION_COLORS[m.type] || COL.dim}15`,
                border: `1px solid ${MUTATION_COLORS[m.type] || COL.dim}44`,
                borderRadius: 8, padding: '4px 10px', fontSize: 10,
                color: MUTATION_COLORS[m.type] || COL.dim,
                display: 'flex', alignItems: 'center', gap: 4,
              }}>
                <span style={{
                  width: 6, height: 6, borderRadius: '50%',
                  background: MUTATION_COLORS[m.type] || COL.dim,
                  display: 'inline-block',
                }} />
                <span style={{ fontWeight: 600 }}>{m.type?.replace('_', ' ')}</span>
                <span style={{ color: COL.muted }}>·</span>
                <span>"{m.symbol}"</span>
                {m.details?.meaning && <span style={{ color: COL.muted }}>({m.details.meaning})</span>}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Dialect groups */}
      {dialects && dialects.groups && Object.keys(dialects.groups).length > 0 && (
        <div style={{ background: COL.panel, border: `1px solid ${COL.border}`, borderRadius: 12, padding: 16 }}>
          <div style={{ fontSize: 11, color: COL.muted, marginBottom: 10, letterSpacing: 1, textTransform: 'uppercase', display: 'flex', alignItems: 'center', gap: 6 }}>
            <GitBranch size={12} style={{ color: COL.purple }} />
            Dialect Groups ({dialects.num_dialects || 0})
          </div>
          <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
            {Object.entries(dialects.groups).map(([name, group]) => (
              <div key={name} style={{
                background: `${COL.purple}12`, border: `1px solid ${COL.purple}33`,
                borderRadius: 10, padding: '10px 16px', minWidth: 160,
              }}>
                <div style={{
                  fontSize: 13, fontWeight: 700,
                  color: dialects.colors?.[name] || COL.purple,
                  marginBottom: 4,
                }}>
                  {name}
                </div>
                <div style={{ fontSize: 10, color: COL.muted }}>
                  {group.vocabulary_size} symbols
                </div>
                <div style={{ fontSize: 9, color: COL.dim, marginTop: 4, fontFamily: 'JetBrains Mono, monospace' }}>
                  {(group.symbols || []).slice(0, 6).join(', ')}
                  {(group.symbols || []).length > 6 && ` +${group.symbols.length - 6}`}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

/* ─── Node Detail Panel ─── */
function NodeDetailPanel({ snap, mutations, onClose }) {
  const vocab = snap.vocabulary || {};
  const entries = Object.entries(vocab);

  return (
    <div style={{
      background: COL.panel, border: `1px solid ${COL.amber}44`,
      borderRadius: 12, padding: 16, position: 'relative',
    }}>
      <button
        onClick={onClose}
        style={{
          position: 'absolute', top: 10, right: 10,
          background: 'transparent', border: 'none', color: COL.muted,
          cursor: 'pointer', padding: 4,
        }}
      >
        <X size={16} />
      </button>

      <div style={{ fontSize: 14, fontWeight: 700, color: COL.amber, marginBottom: 4, display: 'flex', alignItems: 'center', gap: 8 }}>
        <ChevronRight size={16} />
        {snap.label} — Vocabulary Snapshot
      </div>
      <div style={{ fontSize: 11, color: COL.muted, marginBottom: 12 }}>
        Episode {snap.episode} · {snap.total_symbols} symbols
        {snap.dialect_group && <span style={{ color: COL.purple }}> · Dialect: {snap.dialect_group}</span>}
      </div>

      {entries.length > 0 ? (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: 8 }}>
          {entries.map(([sym, info]) => (
            <div key={sym} style={{
              background: `${COL.bg}cc`, border: `1px solid ${COL.border}`,
              borderRadius: 8, padding: '8px 12px',
            }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span style={{ fontSize: 14, fontWeight: 700, color: COL.green }}>"{sym}"</span>
                <span style={{ fontSize: 10, color: COL.muted }}>×{info.usage_count || 0}</span>
              </div>
              <div style={{ fontSize: 11, color: COL.text, marginTop: 2 }}>
                → {info.meaning || '?'}
              </div>
              {info.agents_using && (
                <div style={{ fontSize: 9, color: COL.dim, marginTop: 3 }}>
                  Used by {info.agents_using.length} agents
                </div>
              )}
            </div>
          ))}
        </div>
      ) : (
        <div style={{ color: COL.muted, fontSize: 12 }}>No vocabulary data in this snapshot</div>
      )}

      {/* Mutations at this node */}
      {mutations.length > 0 && (
        <div style={{ marginTop: 12, paddingTop: 12, borderTop: `1px solid ${COL.border}` }}>
          <div style={{ fontSize: 10, color: COL.muted, marginBottom: 6, textTransform: 'uppercase', letterSpacing: 1 }}>
            Mutations at this node
          </div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
            {mutations.map((m, i) => (
              <span key={i} style={{
                fontSize: 10, color: MUTATION_COLORS[m.type] || COL.dim,
                background: `${MUTATION_COLORS[m.type] || COL.dim}15`,
                border: `1px solid ${MUTATION_COLORS[m.type] || COL.dim}33`,
                borderRadius: 6, padding: '2px 8px',
              }}>
                {m.type?.replace('_', ' ')}: "{m.symbol}"
              </span>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
