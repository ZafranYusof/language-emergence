import React, { useState, useEffect, useCallback } from 'react';
import { motion } from 'framer-motion';
import { Eye, MousePointerClick, Wifi, WifiOff } from 'lucide-react';
import * as api from '../utils/api';

const NUM_POSITIONS = 5;
const NUM_OBJECTS = 10;

export default function AgentAttention() {
  const [sessions, setSessions] = useState([]);
  const [selectedSession, setSelectedSession] = useState('');
  const [conversations, setConversations] = useState([]);
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [loading, setLoading] = useState(false);
  const [connected, setConnected] = useState(false);

  useEffect(() => {
    (async () => {
      try {
        const data = await api.fetchSessions();
        setSessions(data);
        if (data.length > 0) setSelectedSession(data[0].session_id);
        setConnected(true);
      } catch {
        setConnected(false);
      }
    })();
  }, []);

  const fetchConversations = useCallback(async () => {
    if (!selectedSession) return;
    setLoading(true);
    try {
      const data = await api.getConversations(selectedSession, 50);
      setConversations(data);
      setConnected(true);
    } catch {
      setConnected(false);
    } finally {
      setLoading(false);
    }
  }, [selectedSession]);

  useEffect(() => {
    fetchConversations();
  }, [fetchConversations]);

  const selectedConv = conversations[selectedIndex];
  // Real attention weights from backend: (message_length, num_candidates)
  const attentionWeights = selectedConv?.attention_weights || null;
  const hasRealAttention = attentionWeights && attentionWeights.length > 0;

  // Color: transparent -> cyber-cyan for attention
  const getColor = (value) => {
    const r = Math.round(0 * value);
    const g = Math.round(221 * value);
    const b = Math.round(255 * value);
    const a = 0.1 + value * 0.9;
    return `rgba(${r}, ${g}, ${b}, ${a})`;
  };

  return (
    <div className="space-y-6 animate-slide-in">
      <div>
        <h1 className="text-2xl font-bold flex items-center gap-2 section-header">
          <Eye size={24} className="text-cyber-cyan" />
          AGENT ATTENTION
        </h1>
        <p className="text-sm text-retro-muted mt-1">
          Cross-attention weights from Listener agent (message tokens → candidates)
        </p>
      </div>

      {/* Connection status */}
      <div className="flex items-center gap-2 text-xs font-mono">
        {connected ? (
          <><div className="led-dot" /><span className="text-neon-green">Backend connected</span></>
        ) : (
          <><div className="led-dot-red" /><span className="text-retro-error">Backend disconnected</span></>
        )}
      </div>

      {!connected && (
        <div className="bg-robot-amber/10 border border-robot-amber/30 text-robot-amber px-4 py-2 rounded-lg text-sm">
          Connect to backend to view real attention weights
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Conversation List */}
        <div className="retro-card rounded-xl p-4">
          <div className="flex items-center gap-2 mb-3">
            <MousePointerClick size={14} className="text-retro-muted" />
            <h3 className="text-sm font-medium text-retro-muted">Click to inspect</h3>
          </div>
          <div className="space-y-1 max-h-[500px] overflow-y-auto">
            {loading ? (
              <p className="text-retro-muted text-sm skeleton-pulse">Loading...</p>
            ) : conversations.length === 0 ? (
              <p className="text-retro-muted text-sm">No conversations available</p>
            ) : conversations.map((conv, i) => {
              const hasAttn = conv.attention_weights && conv.attention_weights.length > 0;
              return (
                <button
                  key={i}
                  onClick={() => setSelectedIndex(i)}
                  className={`w-full text-left p-2 rounded-lg text-xs transition-colors ${
                    selectedIndex === i
                      ? 'bg-neon-green/10 text-neon-green border border-neon-green/50 glow-green'
                      : 'text-retro-muted hover:bg-steel-dark border border-transparent'
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <span className="font-mono">EP {conv.episode}</span>
                    <div className="flex items-center gap-2">
                      {hasAttn && (
                        <span className="text-[9px] text-cyber-cyan bg-cyber-cyan/10 px-1 rounded">ATTN</span>
                      )}
                      <span className={`font-mono ${conv.reward > 0 ? 'text-neon-green' : 'text-retro-error'}`}>
                        {(conv.message || []).join(' ')}
                      </span>
                    </div>
                  </div>
                </button>
              );
            })}
          </div>
        </div>

        {/* Attention Heatmap */}
        <div className="lg:col-span-2 retro-card rounded-xl p-6">
          <h3 className="text-sm font-medium text-retro-muted mb-1">Attention Weights</h3>
          {selectedConv && (
            <p className="text-xs text-retro-muted mb-4 font-mono">
              Episode {selectedConv.episode} · Message: [{(selectedConv.message || []).join(', ')}]
              {selectedConv.reward > 0 && <span className="text-neon-green ml-2">✓ Correct</span>}
              {selectedConv.reward === 0 && <span className="text-retro-error ml-2">✗ Wrong</span>}
            </p>
          )}

          {hasRealAttention ? (
            <div className="overflow-x-auto">
              <div className="inline-block min-w-full">
                {/* Column headers - candidate objects */}
                <div className="flex">
                  <div className="w-20 flex-shrink-0" />
                  {Array.from({ length: attentionWeights[0]?.length || NUM_OBJECTS }).map((_, ci) => {
                    const isTarget = selectedConv?.target_index === ci;
                    return (
                      <div key={ci} className="flex-1 min-w-[56px] text-center">
                        <span className={`text-[10px] font-mono ${isTarget ? 'text-robot-amber font-bold' : 'text-retro-muted'}`}>
                          C{ci}
                          {isTarget && ' ★'}
                        </span>
                      </div>
                    );
                  })}
                </div>

                {/* Rows - message positions */}
                {attentionWeights.map((row, posIdx) => (
                  <div key={posIdx} className="flex items-center">
                    <div className="w-20 flex-shrink-0 text-xs font-mono pr-2 text-right text-retro-muted">
                      Pos {posIdx}
                      {selectedConv?.message?.[posIdx] != null && (
                        <span className="text-cyber-cyan ml-1">[{selectedConv.message[posIdx]}]</span>
                      )}
                    </div>
                    {row.map((weight, candIdx) => (
                      <div key={candIdx} className="flex-1 min-w-[56px] p-0.5">
                        <motion.div
                          initial={{ opacity: 0, scale: 0.8 }}
                          animate={{ opacity: 1, scale: 1 }}
                          transition={{ delay: (posIdx * row.length + candIdx) * 0.003 }}
                          className="h-7 rounded cursor-pointer transition-transform hover:scale-110"
                          style={{ backgroundColor: getColor(weight) }}
                          title={`Pos ${posIdx} → Candidate ${candIdx}: ${(weight * 100).toFixed(1)}%`}
                        >
                          <span className="flex items-center justify-center h-full text-[9px] text-white/90 font-mono">
                            {(weight * 100).toFixed(0)}
                          </span>
                        </motion.div>
                      </div>
                    ))}
                  </div>
                ))}
              </div>

              {/* Legend */}
              <div className="flex items-center gap-3 mt-4 pt-4 border-t border-steel-border">
                <span className="text-xs text-retro-muted">Low</span>
                <div className="flex h-3 rounded overflow-hidden flex-1 max-w-xs">
                  {Array.from({ length: 20 }).map((_, i) => (
                    <div
                      key={i}
                      className="flex-1 h-full"
                      style={{ backgroundColor: getColor(i / 19) }}
                    />
                  ))}
                </div>
                <span className="text-xs text-retro-muted">High</span>
              </div>

              {/* Summary */}
              <div className="mt-3 text-xs text-retro-muted font-mono">
                {(() => {
                  // Find highest attention cell
                  let maxVal = 0, maxPos = 0, maxCand = 0;
                  attentionWeights.forEach((row, pi) => row.forEach((v, ci) => {
                    if (v > maxVal) { maxVal = v; maxPos = pi; maxCand = ci; }
                  }));
                  return `Strongest signal: Position ${maxPos} → Candidate ${maxCand} (${(maxVal * 100).toFixed(1)}%)`;
                })()}
              </div>
            </div>
          ) : selectedConv ? (
            <div className="h-64 flex flex-col items-center justify-center text-retro-muted gap-2">
              <div className="led-dot-amber" />
              <p className="text-sm">No attention data for this conversation</p>
              <p className="text-xs">Run a new training session to generate attention weights</p>
            </div>
          ) : (
            <div className="h-64 flex items-center justify-center text-retro-muted">
              Select a conversation to see attention patterns
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
