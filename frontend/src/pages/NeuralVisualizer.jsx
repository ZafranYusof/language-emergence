import React, { useState, useEffect, useCallback, useRef, useMemo, Suspense } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { API_URL } from '../config';
import {
  Brain, Zap, Play, Pause, Camera, Settings,
  ChevronDown, ChevronUp, RefreshCw, Layers, Activity,
} from 'lucide-react';

/* ───────────────── Three.js imports ───────────────── */
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import { OrbitControls, Text, Line, Html } from '@react-three/drei';
import * as THREE from 'three';

/* ───────────────── Theme constants ───────────────── */
const COLORS = {
  bg: '#0a0a1a',
  panel: '#141428',
  border: '#2a2a4a',
  neonGreen: '#00ff88',
  amber: '#ffaa00',
  cyan: '#00ddff',
  text: '#e0e0e0',
  muted: '#666688',
  positive: '#ff4444',
  negative: '#4488ff',
  zero: '#444466',
};

/* ───────────────── Helpers ───────────────── */

function activationColor(value, maxAbs) {
  const norm = maxAbs > 0 ? Math.max(-1, Math.min(1, value / maxAbs)) : 0;
  if (norm > 0.05) {
    const t = norm;
    return new THREE.Color(0.2 + 0.8 * t, 0.15 * (1 - t), 0.15 * (1 - t));
  } else if (norm < -0.05) {
    const t = -norm;
    return new THREE.Color(0.15 * (1 - t), 0.3 + 0.5 * t, 0.8 + 0.2 * t);
  }
  return new THREE.Color(0.25, 0.25, 0.35);
}

function activationSize(value, maxAbs) {
  const abs = Math.abs(value);
  const norm = maxAbs > 0 ? abs / maxAbs : 0;
  return 0.06 + 0.14 * Math.sqrt(norm);
}

function glowIntensity(value, maxAbs) {
  const abs = Math.abs(value);
  return maxAbs > 0 ? 0.3 + 0.7 * (abs / maxAbs) : 0.3;
}

/* ───────────────── 3D Neuron Sphere ───────────────── */

function Neuron({ position, value, maxAbs, layerName, neuronIndex, onClick }) {
  const meshRef = useRef();
  const [hovered, setHovered] = useState(false);
  const color = useMemo(() => activationColor(value, maxAbs), [value, maxAbs]);
  const size = useMemo(() => activationSize(value, maxAbs), [value, maxAbs]);

  useFrame(() => {
    if (meshRef.current) {
      const scale = hovered ? 1.4 : 1.0;
      meshRef.current.scale.lerp(new THREE.Vector3(scale, scale, scale), 0.1);
    }
  });

  return (
    <mesh
      ref={meshRef}
      position={position}
      onPointerOver={(e) => { e.stopPropagation(); setHovered(true); document.body.style.cursor = 'pointer'; }}
      onPointerOut={() => { setHovered(false); document.body.style.cursor = 'default'; }}
      onClick={(e) => { e.stopPropagation(); onClick && onClick({ layerName, neuronIndex, value }); }}
    >
      <sphereGeometry args={[size, 16, 16]} />
      <meshStandardMaterial
        color={color}
        emissive={color}
        emissiveIntensity={hovered ? 1.2 : glowIntensity(value, maxAbs)}
        transparent
        opacity={hovered ? 1.0 : 0.85}
        roughness={0.3}
        metalness={0.5}
      />
    </mesh>
  );
}

/* ───────────────── Layer Column ───────────────── */

function LayerColumn({ layer, layerIndex, totalLayers, onSelectNeuron }) {
  const values = layer.neuron_values || [];
  const maxDisplay = Math.min(values.length, 64);
  const step = values.length > 1 ? (values.length - 1) / (maxDisplay - 1) : 0;
  const maxAbs = layer.stats
    ? Math.max(Math.abs(layer.stats.min || 0), Math.abs(layer.stats.max || 0), 0.01)
    : 1;

  const x = (layerIndex - (totalLayers - 1) / 2) * 2.5;

  const neurons = [];
  for (let i = 0; i < maxDisplay; i++) {
    const idx = Math.round(i * step);
    const val = values[idx] || 0;
    const y = (i - (maxDisplay - 1) / 2) * 0.25;
    neurons.push(
      <Neuron
        key={`${layer.layer_name}-${i}`}
        position={[x, y, 0]}
        value={val}
        maxAbs={maxAbs}
        layerName={layer.layer_name}
        neuronIndex={idx}
        onClick={onSelectNeuron}
      />
    );
  }

  const shortName = layer.layer_name.split('.').pop();

  return (
    <group>
      {neurons}
      <Html position={[x, -(maxDisplay * 0.25) / 2 - 0.5, 0]} center>
        <div style={{
          color: COLORS.neonGreen,
          fontSize: '10px',
          fontFamily: 'JetBrains Mono, monospace',
          textAlign: 'center',
          whiteSpace: 'nowrap',
          textShadow: '0 0 8px rgba(0,255,136,0.25)',
          pointerEvents: 'none',
          userSelect: 'none',
        }}>
          {shortName}
        </div>
      </Html>
    </group>
  );
}

/* ───────────────── Connection Lines Between Layers ───────────────── */

function LayerConnections({ layers }) {
  const lines = useMemo(() => {
    if (layers.length < 2) return [];
    const result = [];
    for (let i = 0; i < layers.length - 1; i++) {
      const x1 = (i - (layers.length - 1) / 2) * 2.5;
      const x2 = (i + 1 - (layers.length - 1) / 2) * 2.5;
      const maxDisplay1 = Math.min((layers[i].neuron_values || []).length, 64);
      const maxDisplay2 = Math.min((layers[i + 1].neuron_values || []).length, 64);
      const numConnections = Math.min(6, maxDisplay1, maxDisplay2);
      for (let c = 0; c < numConnections; c++) {
        const y1 = (c / numConnections - 0.5) * maxDisplay1 * 0.25;
        const y2 = (c / numConnections - 0.5) * maxDisplay2 * 0.25;
        const points = [
          new THREE.Vector3(x1, y1, 0),
          new THREE.Vector3((x1 + x2) / 2, (y1 + y2) / 2, 0.3),
          new THREE.Vector3(x2, y2, 0),
        ];
        const curve = new THREE.CatmullRomCurve3(points);
        result.push({ key: `conn-${i}-${c}`, points: curve.getPoints(20) });
      }
    }
    return result;
  }, [layers]);

  return (
    <group>
      {lines.map(({ key, points: pts }) => (
        <Line
          key={key}
          points={pts}
          color={COLORS.cyan}
          lineWidth={0.5}
          transparent
          opacity={0.15}
        />
      ))}
    </group>
  );
}

/* ───────────────── Full Brain Scene ───────────────── */

function BrainScene({ data, onSelectNeuron }) {
  const speakerLayers = data?.speaker_layers || [];
  const listenerLayers = data?.listener_layers || [];

  const msgFlowPoints = useMemo(() => {
    if (speakerLayers.length === 0 || listenerLayers.length === 0) return null;
    const sx = ((speakerLayers.length - 1) / 2) * 2.5;
    const lx = -((listenerLayers.length - 1) / 2) * 2.5;
    const pts = [
      new THREE.Vector3(sx, 2.5, 0),
      new THREE.Vector3(0, 0, 1.5),
      new THREE.Vector3(lx, -2.5, 0),
    ];
    const curve = new THREE.CatmullRomCurve3(pts);
    return curve.getPoints(30);
  }, [speakerLayers.length, listenerLayers.length]);

  return (
    <group>
      {/* Speaker section */}
      <group position={[0, 3.5, 0]}>
        <Html position={[-(speakerLayers.length * 2.5) / 2 - 1, 0, 0]} center>
          <div style={{
            color: COLORS.amber,
            fontSize: '12px',
            fontFamily: 'JetBrains Mono, monospace',
            fontWeight: 'bold',
            textShadow: '0 0 10px rgba(255,170,0,0.38)',
            pointerEvents: 'none',
            whiteSpace: 'nowrap',
          }}>
            SPEAKER
          </div>
        </Html>
        {speakerLayers.map((layer, i) => (
          <LayerColumn
            key={layer.layer_name}
            layer={layer}
            layerIndex={i}
            totalLayers={speakerLayers.length}
            onSelectNeuron={onSelectNeuron}
          />
        ))}
        <LayerConnections layers={speakerLayers} />
      </group>

      {/* Listener section */}
      <group position={[0, -3.5, 0]}>
        <Html position={[-(listenerLayers.length * 2.5) / 2 - 1, 0, 0]} center>
          <div style={{
            color: COLORS.cyan,
            fontSize: '12px',
            fontFamily: 'JetBrains Mono, monospace',
            fontWeight: 'bold',
            textShadow: '0 0 10px rgba(0,221,255,0.38)',
            pointerEvents: 'none',
            whiteSpace: 'nowrap',
          }}>
            LISTENER
          </div>
        </Html>
        {listenerLayers.map((layer, i) => (
          <LayerColumn
            key={layer.layer_name}
            layer={layer}
            layerIndex={i}
            totalLayers={listenerLayers.length}
            onSelectNeuron={onSelectNeuron}
          />
        ))}
        <LayerConnections layers={listenerLayers} />
      </group>

      {/* Speaker to Listener connection (message flow) */}
      {msgFlowPoints && (
        <Line
          points={msgFlowPoints}
          color={COLORS.neonGreen}
          lineWidth={1.5}
          transparent
          opacity={0.3}
          dashed
          dashSize={0.3}
          gapSize={0.2}
        />
      )}

      {/* Grid floor */}
      <gridHelper args={[30, 30, '#1a1a3a', '#1a1a3a']} position={[0, 0, -2]} rotation={[Math.PI / 2, 0, 0]} />
    </group>
  );
}

/* ───────────────── Attention Heatmap (SVG) ───────────────── */

function AttentionHeatmap({ attentionFlows }) {
  if (!attentionFlows || attentionFlows.length === 0) return null;

  const flow = attentionFlows[0];
  const weights = flow.weights;
  if (!weights || !Array.isArray(weights)) return null;

  const rows = weights.length;
  const cols = weights[0]?.length || 0;
  if (rows === 0 || cols === 0) return null;

  const cellW = Math.min(16, 200 / cols);
  const cellH = Math.min(16, 150 / rows);

  let maxVal = 0;
  weights.forEach(row => row.forEach(v => { maxVal = Math.max(maxVal, Math.abs(v)); }));

  return (
    <div>
      <h4 className="text-xs font-mono mb-2" style={{ color: COLORS.amber }}>
        ATTENTION WEIGHTS
      </h4>
      <svg width={cols * cellW + 4} height={rows * cellH + 4} style={{ background: COLORS.bg }}>
        {weights.map((row, r) =>
          row.map((val, c) => {
            const intensity = maxVal > 0 ? val / maxVal : 0;
            const hue = intensity > 0 ? 120 : 220;
            const sat = Math.abs(intensity) * 80;
            const light = 20 + Math.abs(intensity) * 40;
            return (
              <rect
                key={`${r}-${c}`}
                x={c * cellW + 2}
                y={r * cellH + 2}
                width={cellW - 1}
                height={cellH - 1}
                fill={`hsl(${hue}, ${sat}%, ${light}%)`}
                stroke={COLORS.border}
                strokeWidth={0.5}
              >
                <title>{`[${r},${c}] = ${val.toFixed(4)}`}</title>
              </rect>
            );
          })
        )}
      </svg>
      <div className="flex justify-between text-[9px] font-mono mt-1" style={{ color: COLORS.muted }}>
        <span>Msg tokens to Candidates</span>
        <span>{rows}x{cols}</span>
      </div>
    </div>
  );
}

/* ───────────────── Layer Stats Panel ───────────────── */

function LayerStatsPanel({ layers, label, accentColor }) {
  if (!layers || layers.length === 0) return null;

  return (
    <div className="space-y-2">
      <h4 className="text-xs font-mono font-bold" style={{ color: accentColor }}>
        {label}
      </h4>
      {layers.map((layer) => {
        const stats = layer.stats || {};
        const shortName = layer.layer_name.split('.').slice(1).join('.');
        return (
          <div key={layer.layer_name} className="rounded p-2" style={{ background: `${COLORS.panel}80`, border: `1px solid ${COLORS.border}` }}>
            <div className="text-[10px] font-mono mb-1" style={{ color: COLORS.neonGreen }}>
              {shortName}
            </div>
            <div className="grid grid-cols-4 gap-1 text-[9px] font-mono" style={{ color: COLORS.muted }}>
              <div>
                <span style={{ color: COLORS.cyan }}>mu</span> {(stats.mean || 0).toFixed(3)}
              </div>
              <div>
                <span style={{ color: COLORS.amber }}>sd</span> {(stats.std || 0).toFixed(3)}
              </div>
              <div>
                <span style={{ color: COLORS.negative }}>lo</span> {(stats.min || 0).toFixed(2)}
              </div>
              <div>
                <span style={{ color: COLORS.positive }}>hi</span> {(stats.max || 0).toFixed(2)}
              </div>
            </div>
            <div className="mt-1 h-1 rounded" style={{ background: COLORS.border }}>
              <div
                className="h-full rounded"
                style={{
                  width: `${Math.min(100, (stats.count || 0) / 2)}%`,
                  background: `linear-gradient(90deg, ${COLORS.negative}, ${COLORS.zero}, ${COLORS.positive})`,
                }}
              />
            </div>
          </div>
        );
      })}
    </div>
  );
}

/* ───────────────── Neuron Tooltip ───────────────── */

function NeuronTooltip({ info }) {
  if (!info) return null;
  return (
    <motion.div
      initial={{ opacity: 0, y: 5 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: 5 }}
      className="absolute bottom-4 left-1/2 -translate-x-1/2 rounded-lg px-4 py-2 z-20"
      style={{
        background: `${COLORS.panel}ee`,
        border: `1px solid ${COLORS.neonGreen}40`,
        boxShadow: `0 0 20px ${COLORS.neonGreen}20`,
      }}
    >
      <div className="text-[10px] font-mono" style={{ color: COLORS.neonGreen }}>
        {info.layerName}
      </div>
      <div className="text-xs font-mono" style={{ color: COLORS.text }}>
        Neuron #{info.neuronIndex}: <span style={{ color: info.value > 0 ? COLORS.positive : COLORS.negative }}>{info.value.toFixed(4)}</span>
      </div>
    </motion.div>
  );
}

/* ───────────────── Fallback 2D Visualization (SVG) ───────────────── */

function FallbackVisualization({ data, onSelectNeuron }) {
  const speakerLayers = data?.speaker_layers || [];
  const listenerLayers = data?.listener_layers || [];

  const renderLayer = (layer, yOffset, accentColor) => {
    const values = layer.neuron_values || [];
    const maxDisplay = Math.min(values.length, 48);
    const step = values.length > 1 ? (values.length - 1) / (maxDisplay - 1) : 0;
    const maxAbs = layer.stats
      ? Math.max(Math.abs(layer.stats.min || 0), Math.abs(layer.stats.max || 0), 0.01)
      : 1;

    return (
      <g key={layer.layer_name}>
        <text x={5} y={yOffset - 8} fill={accentColor} fontSize="9" fontFamily="JetBrains Mono, monospace">
          {layer.layer_name.split('.').pop()}
        </text>
        {Array.from({ length: maxDisplay }, (_, i) => {
          const idx = Math.round(i * step);
          const val = values[idx] || 0;
          const norm = maxAbs > 0 ? val / maxAbs : 0;
          const r = Math.max(2, 2 + Math.abs(norm) * 5);
          const color = norm > 0.05
            ? `rgb(${Math.round(180 + 75 * norm)}, ${Math.round(50 * (1 - norm))}, ${Math.round(50 * (1 - norm))})`
            : norm < -0.05
              ? `rgb(${Math.round(50 * (1 + norm))}, ${Math.round(100 + 100 * -norm)}, 200)`
              : '#444466';
          return (
            <circle
              key={i}
              cx={60 + i * 8}
              cy={yOffset}
              r={r}
              fill={color}
              opacity={0.8}
              style={{ cursor: 'pointer' }}
              onClick={() => onSelectNeuron && onSelectNeuron({ layerName: layer.layer_name, neuronIndex: idx, value: val })}
            >
              <title>{`[${idx}] = ${val.toFixed(4)}`}</title>
            </circle>
          );
        })}
      </g>
    );
  };

  return (
    <div style={{ background: COLORS.bg, border: `1px solid ${COLORS.border}`, borderRadius: 8, padding: 8, overflow: 'auto' }}>
      <div className="text-[10px] font-mono mb-2" style={{ color: COLORS.amber }}>2D FALLBACK VIEW</div>
      <svg width="100%" height={400} viewBox="0 0 500 400">
        <text x={5} y={15} fill={COLORS.amber} fontSize="11" fontWeight="bold" fontFamily="JetBrains Mono, monospace">SPEAKER</text>
        {speakerLayers.map((l, i) => renderLayer(l, 40 + i * 40, COLORS.amber))}
        <line x1={5} y1={40 + speakerLayers.length * 40 - 10} x2={495} y2={40 + speakerLayers.length * 40 - 10} stroke={COLORS.border} strokeDasharray="4" />
        <text x={5} y={40 + speakerLayers.length * 40 + 10} fill={COLORS.cyan} fontSize="11" fontWeight="bold" fontFamily="JetBrains Mono, monospace">LISTENER</text>
        {listenerLayers.map((l, i) => renderLayer(l, 40 + speakerLayers.length * 40 + 30 + i * 40, COLORS.cyan))}
      </svg>
    </div>
  );
}

/* ───────────────── Main Component ───────────────── */

export default function NeuralVisualizer({ sessionId }) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [autoCapture, setAutoCapture] = useState(false);
  const [captureSpeed, setCaptureSpeed] = useState(500);
  const [selectedNeuron, setSelectedNeuron] = useState(null);
  const [use3D, setUse3D] = useState(true);
  const [showPanel, setShowPanel] = useState(true);
  const timerRef = useRef(null);
  const wsRef = useRef(null);

  const effectiveSessionId = sessionId || 'demo';

  // Fetch initial data
  const fetchData = useCallback(async () => {
    try {
      setLoading(true);
      const res = await fetch(`${API_URL}/neural/activations/${effectiveSessionId}`);
      if (res.ok) {
        const json = await res.json();
        setData(json);
        setError(null);
      }
    } catch (err) {
      console.error('Failed to fetch neural data:', err);
      setError('Failed to fetch data: ' + (err.message || 'Unknown error'));
    } finally {
      setLoading(false);
    }
  }, [effectiveSessionId]);

  // Trigger capture
  const triggerCapture = useCallback(async () => {
    try {
      setLoading(true);
      const res = await fetch(`${API_URL}/neural/capture/${effectiveSessionId}`, { method: 'POST' });
      if (res.ok) {
        const json = await res.json();
        if (json.data) {
          setData(json.data);
        }
        setError(null);
      }
    } catch (err) {
      console.error('Capture failed:', err);
      setError('Capture failed');
    } finally {
      setLoading(false);
    }
  }, [effectiveSessionId]);

  // Initial fetch
  useEffect(() => {
    fetchData();
  }, [fetchData]);

  // WebSocket connection
  useEffect(() => {
    let ws;
    try {
      const proto = window.location.protocol === 'https:' ? 'wss' : 'ws';
      const wsUrl = `${proto}://${window.location.host}/ws/neural/${effectiveSessionId}`;
      ws = new WebSocket(wsUrl);
      ws.onmessage = (event) => {
        try {
          const msg = JSON.parse(event.data);
          if (msg.type === 'neural_update' && msg.data) {
            setData(msg.data);
          }
        } catch (e) { /* ignore parse errors */ }
      };
      ws.onerror = () => { /* fallback to polling */ };
      ws.onclose = () => { /* will reconnect on session change */ };
      wsRef.current = ws;
    } catch (e) {
      // WebSocket not available, polling will work
    }
    return () => { if (ws) ws.close(); };
  }, [effectiveSessionId]);

  // Auto-capture timer
  useEffect(() => {
    if (autoCapture) {
      timerRef.current = setInterval(() => {
        if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
          wsRef.current.send(JSON.stringify({ type: 'capture' }));
        } else {
          triggerCapture();
        }
      }, captureSpeed);
    } else {
      if (timerRef.current) clearInterval(timerRef.current);
    }
    return () => { if (timerRef.current) clearInterval(timerRef.current); };
  }, [autoCapture, captureSpeed, triggerCapture]);

  const neuronTimeoutRef = useRef(null);
  useEffect(() => {
    return () => { if (neuronTimeoutRef.current) clearTimeout(neuronTimeoutRef.current); };
  }, []);

  const handleSelectNeuron = useCallback((info) => {
    if (neuronTimeoutRef.current) clearTimeout(neuronTimeoutRef.current);
    setSelectedNeuron(info);
    neuronTimeoutRef.current = setTimeout(() => setSelectedNeuron(null), 4000);
  }, []);

  const allLayers = useMemo(() => {
    return [...(data?.speaker_layers || []), ...(data?.listener_layers || [])];
  }, [data]);

  return (
    <div className="h-full flex flex-col gap-4">
      {/* Header */}
      <div className="flex items-center justify-between flex-shrink-0">
        <div className="flex items-center gap-3">
          <Brain size={24} style={{ color: COLORS.neonGreen }} />
          <div>
            <h2 className="text-lg font-bold font-mono" style={{ color: COLORS.neonGreen, textShadow: `0 0 10px ${COLORS.neonGreen}40` }}>
              NEURAL ACTIVATION VISUALIZER
            </h2>
            <p className="text-xs font-mono" style={{ color: COLORS.muted }}>
              Real-time neuron activations in Speaker/Listener networks
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {loading && (
            <RefreshCw size={14} className="animate-spin" style={{ color: COLORS.cyan }} />
          )}
          <span className="text-[10px] font-mono px-2 py-0.5 rounded" style={{
            color: COLORS.neonGreen,
            background: `${COLORS.neonGreen}10`,
            border: `1px solid ${COLORS.neonGreen}30`,
          }}>
            {allLayers.length} LAYERS
          </span>
        </div>
      </div>

      {/* Controls */}
      <div className="flex items-center gap-3 flex-wrap flex-shrink-0">
        <button
          onClick={triggerCapture}
          disabled={loading}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded text-xs font-mono transition-all btn-glow"
          style={{
            color: COLORS.neonGreen,
            background: `${COLORS.neonGreen}10`,
            border: `1px solid ${COLORS.neonGreen}40`,
          }}
        >
          <Camera size={12} />
          Capture
        </button>

        <button
          onClick={() => setAutoCapture(!autoCapture)}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded text-xs font-mono transition-all btn-glow"
          style={{
            color: autoCapture ? COLORS.bg : COLORS.amber,
            background: autoCapture ? COLORS.amber : `${COLORS.amber}10`,
            border: `1px solid ${COLORS.amber}40`,
          }}
        >
          {autoCapture ? <Pause size={12} /> : <Play size={12} />}
          {autoCapture ? 'Stop' : 'Auto'}
        </button>

        <div className="flex items-center gap-2">
          <span className="text-[10px] font-mono" style={{ color: COLORS.muted }}>Speed:</span>
          <input
            type="range"
            min={100}
            max={3000}
            step={100}
            value={captureSpeed}
            onChange={(e) => setCaptureSpeed(Number(e.target.value))}
            className="w-20"
            style={{ accentColor: COLORS.neonGreen }}
          />
          <span className="text-[10px] font-mono w-10" style={{ color: COLORS.cyan }}>{captureSpeed}ms</span>
        </div>

        <button
          onClick={() => setUse3D(!use3D)}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded text-xs font-mono transition-all btn-glow"
          style={{
            color: COLORS.cyan,
            background: `${COLORS.cyan}10`,
            border: `1px solid ${COLORS.cyan}40`,
          }}
        >
          <Layers size={12} />
          {use3D ? '2D View' : '3D View'}
        </button>

        <button
          onClick={() => setShowPanel(!showPanel)}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded text-xs font-mono transition-all btn-glow"
          style={{
            color: COLORS.muted,
            background: COLORS.panel,
            border: `1px solid ${COLORS.border}`,
          }}
        >
          <Activity size={12} />
          {showPanel ? 'Hide' : 'Show'} Stats
        </button>
      </div>

      {/* Error */}
      {error && (
        <div className="text-xs font-mono px-3 py-1.5 rounded" style={{ color: COLORS.amber, background: `${COLORS.amber}10`, border: `1px solid ${COLORS.amber}30` }}>
          {error}
        </div>
      )}

      {/* Main Content */}
      <div className="flex-1 flex gap-4 min-h-0" style={{ minHeight: 500 }}>
        {/* Visualization Area */}
        <div className="flex-1 rounded-lg overflow-hidden relative" style={{
          background: COLORS.bg,
          border: `1px solid ${COLORS.border}`,
        }}>
          {data && use3D ? (
            <Canvas
              camera={{ position: [0, 0, 18], fov: 50 }}
              style={{ background: COLORS.bg }}
              gl={{ antialias: true, alpha: false }}
              onCreated={({ gl }) => {
                gl.setClearColor(COLORS.bg);
              }}
            >
              <ambientLight intensity={0.4} />
              <pointLight position={[10, 10, 10]} intensity={0.6} color="#ffffff" />
              <pointLight position={[-10, -5, 5]} intensity={0.3} color={COLORS.neonGreen} />
              <pointLight position={[0, 0, 8]} intensity={0.2} color={COLORS.cyan} />
              <Suspense fallback={null}>
                <BrainScene data={data} onSelectNeuron={handleSelectNeuron} />
              </Suspense>
              <OrbitControls
                enableDamping
                dampingFactor={0.05}
                rotateSpeed={0.5}
                zoomSpeed={0.8}
                minDistance={5}
                maxDistance={40}
              />
            </Canvas>
          ) : data && !use3D ? (
            <div className="p-4 h-full overflow-auto">
              <FallbackVisualization data={data} onSelectNeuron={handleSelectNeuron} />
            </div>
          ) : (
            <div className="flex items-center justify-center h-full">
              <div className="text-center">
                <Brain size={48} className="mx-auto mb-4" style={{ color: COLORS.muted }} />
                <p className="text-sm font-mono" style={{ color: COLORS.muted }}>
                  {loading ? 'Loading activations...' : 'Click Capture to visualize'}
                </p>
              </div>
            </div>
          )}

          {/* Neuron tooltip overlay */}
          <AnimatePresence>
            {selectedNeuron && <NeuronTooltip info={selectedNeuron} />}
          </AnimatePresence>

          {/* Data info badge */}
          {data && (
            <div className="absolute top-2 left-2 text-[9px] font-mono px-2 py-1 rounded" style={{
              color: COLORS.muted,
              background: `${COLORS.panel}cc`,
              border: `1px solid ${COLORS.border}`,
            }}>
              Session: {data.session_id} &middot; {data.timestamp ? new Date(data.timestamp * 1000).toLocaleTimeString() : ''}
            </div>
          )}
        </div>

        {/* Side Panel */}
        <AnimatePresence>
          {showPanel && (
            <motion.div
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: 20 }}
              className="flex-shrink-0 overflow-y-auto rounded-lg p-3 space-y-4"
              style={{
                width: 280,
                background: COLORS.panel,
                border: `1px solid ${COLORS.border}`,
                maxHeight: 'calc(100vh - 260px)',
              }}
            >
              <LayerStatsPanel
                layers={data?.speaker_layers}
                label="SPEAKER LAYERS"
                accentColor={COLORS.amber}
              />

              <div className="h-px" style={{ background: COLORS.border }} />

              <LayerStatsPanel
                layers={data?.listener_layers}
                label="LISTENER LAYERS"
                accentColor={COLORS.cyan}
              />

              <div className="h-px" style={{ background: COLORS.border }} />

              <AttentionHeatmap attentionFlows={data?.attention_flows} />

              {/* Color legend */}
              <div>
                <h4 className="text-xs font-mono mb-2" style={{ color: COLORS.muted }}>COLOR LEGEND</h4>
                <div className="flex items-center gap-1">
                  <span className="text-[9px] font-mono" style={{ color: COLORS.negative }}>-</span>
                  <div className="flex-1 h-2 rounded" style={{
                    background: `linear-gradient(90deg, ${COLORS.negative}, ${COLORS.zero}, ${COLORS.positive})`,
                  }} />
                  <span className="text-[9px] font-mono" style={{ color: COLORS.positive }}>+</span>
                </div>
                <div className="flex justify-between text-[8px] font-mono mt-1" style={{ color: COLORS.muted }}>
                  <span>Negative</span>
                  <span>Zero</span>
                  <span>Positive</span>
                </div>
              </div>

              {/* Input info */}
              {data?.input_info?.message_indices && (
                <div>
                  <h4 className="text-xs font-mono mb-1" style={{ color: COLORS.amber }}>MESSAGE</h4>
                  <div className="flex gap-1 flex-wrap">
                    {data.input_info.message_indices.map((idx, i) => (
                      <span key={i} className="text-[10px] font-mono px-1.5 py-0.5 rounded" style={{
                        color: COLORS.neonGreen,
                        background: `${COLORS.neonGreen}15`,
                        border: `1px solid ${COLORS.neonGreen}30`,
                      }}>
                        {idx}
                      </span>
                    ))}
                  </div>
                </div>
              )}
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}
