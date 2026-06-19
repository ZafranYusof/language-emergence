import React, { useState, useEffect, useMemo } from 'react';
import * as api from '../utils/api';

const FEATURES = [
  { name: 'hue', label: 'Hue', icon: '🎨', min: 0, max: 1 },
  { name: 'size', label: 'Size', icon: '📐', min: 0, max: 1 },
  { name: 'opacity', label: 'Opacity', icon: '👁', min: 0, max: 1 },
  { name: 'border', label: 'Border', icon: '🔲', min: 0, max: 1 },
  { name: 'rotation', label: 'Rotation', icon: '🔄', min: 0, max: 1 },
  { name: 'shape', label: 'Shape', icon: '⬡', min: 0, max: 1 },
  { name: 'saturation', label: 'Sat', icon: '💧', min: 0, max: 1 },
  { name: 'lightness', label: 'Light', icon: '☀', min: 0, max: 1 },
];

// ─── MINI PIXEL ART CHARACTER ───
function MiniPixelChar({ type, size = 3 }) {
  const isBlue = type === 'speaker';
  const H = isBlue ? '#4488ff' : '#ff4444';
  const HD = isBlue ? '#2266cc' : '#cc2222';
  const S = '#f8d0b0';
  const O = isBlue ? '#2244aa' : '#aa2222';
  const A = '#ffcc00';
  const B = '#553322';
  const px = size;
  const pixels = [
    [0,0,0,H,H,H,H,0],
    [0,0,H,H,H,H,H,H],
    [0,0,H,S,S,S,S,H],
    [0,0,S,'#fff','#222','#fff','#222',S],
    [0,0,0,S,S,HD,S,0],
    [0,0,O,O,O,O,O,O],
    [0,0,O,A,O,O,A,O],
    [0,0,O,O,O,O,O,O],
    [0,0,0,O,O,O,O,0],
    [0,0,B,B,0,B,B,0],
    [0,B,B,B,0,B,B,B],
  ];
  return (
    <div style={{ width: 8*px, height: 11*px, position: 'relative', imageRendering: 'pixelated' }}>
      {pixels.map((row,y) => row.map((c,x) => c ? (
        <div key={`${y}-${x}`} style={{ position:'absolute', left:x*px, top:y*px, width:px, height:px, backgroundColor:c }} />
      ) : null))}
    </div>
  );
}

// ─── PIXEL ART OBJECT ───
function PixelObject({ features, size = 48, glow, label }) {
  if (!features) return null;
  const hue = features[0]*360;
  const scale = 0.5+features[1]*1.0;
  const opacity = 0.3+features[2]*0.7;
  const bw = features[3]*4;
  const rot = features[4]*360;
  const shapes = ['50%','0%','50% 0 0 50%','0%','0%'];
  const br = shapes[Math.floor(features[5]*5)]||'50%';
  const sat = 30+features[6]*70;
  const lit = 30+features[7]*40;
  return (
    <div style={{ textAlign:'center' }}>
      <div style={{ width:size, height:size, display:'flex', alignItems:'center', justifyContent:'center' }}>
        <div style={{
          width:size*scale*0.8, height:size*scale*0.8, borderRadius:br,
          backgroundColor:`hsl(${hue},${sat}%,${lit}%)`, opacity,
          border:`${bw}px solid rgba(255,255,255,0.5)`,
          transform:`rotate(${rot}deg)`, transition:'all 0.3s',
          boxShadow: glow ? `0 0 16px ${glow}` : 'none',
        }} />
      </div>
      {label && <div style={{ fontFamily:"'Press Start 2P',monospace", fontSize:7, color:'#666', marginTop:4 }}>{label}</div>}
    </div>
  );
}

// ─── PIXEL STAT BAR ───
function PixelStatBar({ value, max = 1, color = '#00ff88', label }) {
  const pct = Math.round((value/max)*100);
  const segments = 10;
  const filled = Math.round(pct/100*segments);
  return (
    <div style={{ display:'flex', alignItems:'center', gap:6 }}>
      <span style={{ fontFamily:"'Press Start 2P',monospace", fontSize:6, color:'#888', width:28, textAlign:'right' }}>{label}</span>
      <div style={{ display:'flex', gap:1 }}>
        {Array.from({length:segments},(_,i) => (
          <div key={i} style={{
            width:8, height:10,
            background: i < filled ? color : '#1a1a2e',
            border:`1px solid ${i < filled ? color+'80' : '#333'}`,
          }} />
        ))}
      </div>
      <span style={{ fontFamily:"'JetBrains Mono',monospace", fontSize:9, color, width:32 }}>{pct}%</span>
    </div>
  );
}

// ─── RPG SLIDER ───
function RPGSlider({ value, onChange, label, icon, color = '#00ff88' }) {
  return (
    <div style={{
      background:'#0d0d1a', border:'1px solid #222', borderRadius:2,
      padding:'8px 10px', display:'flex', alignItems:'center', gap:8,
    }}>
      <span style={{ fontSize:14, width:20, textAlign:'center' }}>{icon}</span>
      <span style={{ fontFamily:"'Press Start 2P',monospace", fontSize:7, color:'#888', width:42 }}>{label}</span>
      <div style={{ flex:1, position:'relative', height:16 }}>
        <div style={{
          position:'absolute', top:6, left:0, right:0, height:4,
          background:'#1a1a2e', border:'1px solid #333',
        }}>
          <div style={{
            position:'absolute', left:0, top:0, width:`${value*100}%`, height:'100%',
            background:color, boxShadow:`0 0 6px ${color}60`,
          }} />
          {/* Pixel segments */}
          <div style={{ position:'absolute', inset:0, display:'flex' }}>
            {Array.from({length:20},(_,i) => (
              <div key={i} style={{ flex:1, borderRight:'1px solid #0a0a1a' }} />
            ))}
          </div>
        </div>
        <input
          type="range" min={0} max={100} step={1}
          value={Math.round(value*100)}
          onChange={e => onChange(Number(e.target.value)/100)}
          style={{
            position:'absolute', inset:0, width:'100%', height:'100%',
            opacity:0, cursor:'pointer',
          }}
        />
        {/* Pixel thumb */}
        <div style={{
          position:'absolute', top:2, left:`calc(${value*100}% - 6px)`,
          width:12, height:12, background:color, border:'2px solid #fff',
          boxShadow:`0 0 8px ${color}80`, transition:'left 0.05s',
        }} />
      </div>
      <span style={{ fontFamily:"'JetBrains Mono',monospace", fontSize:9, color, width:28, textAlign:'right' }}>
        {Math.round(value*100)}
      </span>
    </div>
  );
}

// ─── RPG TAB BUTTON ───
function RPGTab({ active, onClick, children, color = '#00ff88' }) {
  return (
    <button onClick={onClick} style={{
      fontFamily:"'Press Start 2P',monospace", fontSize:9,
      padding:'8px 20px',
      background: active ? color : '#111',
      color: active ? '#000' : '#666',
      border:`2px solid ${active ? color : '#333'}`,
      cursor:'pointer', position:'relative',
      boxShadow: active ? `0 0 12px ${color}40, inset 0 0 8px ${color}20` : 'none',
      transition:'all 0.15s',
    }}>
      {active && <div style={{
        position:'absolute', top:-1, left:-1, right:-1, height:2,
        background:color,
      }} />}
      {children}
    </button>
  );
}

// ─── MAIN ───
export default function Playground({ sessionId }) {
  const [mode, setMode] = useState('encode');
  const [features, setFeatures] = useState([0.5,0.5,0.5,0.5,0.5,0.5,0.5,0.5]);
  const [inputSymbols, setInputSymbols] = useState(['11','4','17','5','22']);
  const [result, setResult] = useState(null);
  const [loading, setLoading] = useState(false);
  const [sessions, setSessions] = useState([]);
  const [activeSession, setActiveSession] = useState(sessionId);

  useEffect(() => {
    api.fetchSessions().then(s => {
      setSessions(s);
      if (!activeSession && s.length > 0) setActiveSession(s[0].id);
    }).catch(() => {});
  }, []);

  const handleEncode = async () => {
    if (!activeSession) return;
    setLoading(true);
    try {
      const res = await fetch(`http://localhost:8000/api/sessions/${activeSession}/conversations?limit=200`);
      const data = await res.json();
      const convs = Array.isArray(data) ? data : [];
      // Find closest matching conversation
      let bestMatch = null;
      let bestDist = Infinity;
      convs.forEach(c => {
        if (!c.target_features) return;
        const dist = c.target_features.reduce((s,f,i) => s + Math.abs(f - features[i]), 0);
        if (dist < bestDist) { bestDist = dist; bestMatch = c; }
      });
      setResult({ type:'encode', message: bestMatch?.message || ['?','?','?','?','?'], match: bestMatch });
    } catch { setResult(null); }
    setLoading(false);
  };

  const handleDecode = async () => {
    if (!activeSession) return;
    setLoading(true);
    try {
      const res = await fetch(`http://localhost:8000/api/sessions/${activeSession}/conversations?limit=200`);
      const data = await res.json();
      const convs = Array.isArray(data) ? data : [];
      const symbols = inputSymbols.map(Number);
      // Find conversation with closest matching message
      let bestMatch = null;
      let bestScore = -1;
      convs.forEach(c => {
        if (!c.message) return;
        const cSyms = c.message.map(Number);
        let match = 0;
        symbols.forEach((s,i) => { if (i < cSyms.length && s === cSyms[i]) match++; });
        if (match > bestScore) { bestScore = match; bestMatch = c; }
      });
      setResult({ type:'decode', match: bestMatch, score: bestScore });
    } catch { setResult(null); }
    setLoading(false);
  };

  const updateFeature = (i, val) => {
    const next = [...features];
    next[i] = val;
    setFeatures(next);
  };

  const featureColors = ['#ff4488','#4488ff','#00ddff','#ffaa00','#00ff88','#aa44ff','#ff8844','#88ff44'];

  return (
    <div style={{ padding:24, maxWidth:800, margin:'0 auto' }}>
      {/* ─── CRT Header ─── */}
      <div style={{
        background:'linear-gradient(135deg,#1a1a2e,#16213e)',
        border:'2px solid #00ff88', borderRadius:4, padding:'14px 20px',
        marginBottom:20, position:'relative', overflow:'hidden',
      }}>
        <div style={{
          position:'absolute', inset:0, pointerEvents:'none',
          background:'repeating-linear-gradient(0deg,transparent,transparent 2px,rgba(0,255,136,0.03) 2px,rgba(0,255,136,0.03) 4px)',
        }} />
        <div style={{ display:'flex', alignItems:'center', gap:12 }}>
          <MiniPixelChar type="speaker" size={4} />
          <div>
            <h2 style={{ fontFamily:"'Press Start 2P',monospace", fontSize:13, color:'#00ff88', margin:0, textShadow:'0 0 10px rgba(0,255,136,0.5)' }}>
              ◆ PLAYGROUND
            </h2>
            <p style={{ fontFamily:"'JetBrains Mono',monospace", fontSize:10, color:'#555', margin:'4px 0 0' }}>
              Test the communication protocol
            </p>
          </div>
          <div style={{ marginLeft:'auto' }}>
            <MiniPixelChar type="listener" size={4} />
          </div>
        </div>
      </div>

      {/* ─── Mode Toggle ─── */}
      <div style={{ display:'flex', gap:4, marginBottom:16 }}>
        <RPGTab active={mode==='encode'} onClick={() => setMode('encode')} color="#4488ff">
          ⚔ ENCODE
        </RPGTab>
        <RPGTab active={mode==='decode'} onClick={() => setMode('decode')} color="#ff4444">
          🛡 DECODE
        </RPGTab>
      </div>

      {/* ─── Session Selector ─── */}
      {sessions.length > 0 && (
        <div style={{ marginBottom:16 }}>
          <select
            value={activeSession || ''}
            onChange={e => setActiveSession(e.target.value)}
            style={{
              background:'#111', color:'#00ddff', border:'1px solid #333',
              padding:'6px 10px', fontFamily:"'JetBrains Mono',monospace", fontSize:10,
              borderRadius:2, width:'100%',
            }}
          >
            {sessions.map(s => (
              <option key={s.id} value={s.id}>
                {s.name || s.id.slice(0,8)} — {s.status} ({s.episode_count || 0} ep)
              </option>
            ))}
          </select>
        </div>
      )}

      {/* ─── ENCODE MODE ─── */}
      {mode === 'encode' && (
        <div style={{
          background:'#0d0d1a', border:'2px solid #4488ff40', borderRadius:4,
          padding:20, position:'relative',
        }}>
          {/* Corner accents */}
          {[{top:0,left:0},{top:0,right:0},{bottom:0,left:0},{bottom:0,right:0}].map((pos,i) => (
            <div key={i} style={{
              position:'absolute', ...pos, width:8, height:8,
              borderTop: pos.top!==undefined ? '2px solid #4488ff' : 'none',
              borderBottom: pos.bottom!==undefined ? '2px solid #4488ff' : 'none',
              borderLeft: pos.left!==undefined ? '2px solid #4488ff' : 'none',
              borderRight: pos.right!==undefined ? '2px solid #4488ff' : 'none',
            }} />
          ))}

          <div style={{ display:'flex', alignItems:'center', gap:8, marginBottom:16 }}>
            <div style={{
              fontFamily:"'Press Start 2P',monospace", fontSize:9, color:'#4488ff',
              textShadow:'0 0 8px rgba(68,136,255,0.5)',
            }}>
              SPEAKER ENCODER
            </div>
            <div style={{ flex:1, height:1, background:'#4488ff20' }} />
            <MiniPixelChar type="speaker" size={3} />
          </div>

          <div style={{ display:'flex', gap:16 }}>
            {/* Sliders */}
            <div style={{ flex:1, display:'flex', flexDirection:'column', gap:6 }}>
              {FEATURES.map((f,i) => (
                <RPGSlider
                  key={f.name}
                  value={features[i]}
                  onChange={v => updateFeature(i,v)}
                  label={f.label}
                  icon={f.icon}
                  color={featureColors[i]}
                />
              ))}
            </div>

            {/* Object Preview */}
            <div style={{
              width:120, display:'flex', flexDirection:'column', alignItems:'center',
              justifyContent:'center', gap:8,
              background:'#0a0a16', border:'1px solid #222', borderRadius:4, padding:12,
            }}>
              <div style={{
                fontFamily:"'Press Start 2P',monospace", fontSize:7, color:'#666',
                marginBottom:4,
              }}>
                TARGET
              </div>
              <PixelObject features={features} size={64} glow="#4488ff40" />
              <div style={{
                fontFamily:"'Press Start 2P',monospace", fontSize:8, color:'#4488ff',
                marginTop:8, textAlign:'center',
              }}>
                PRESS<br/>ENCODE
              </div>
            </div>
          </div>

          <button
            onClick={handleEncode}
            disabled={loading || !activeSession}
            style={{
              marginTop:16, width:'100%', padding:'10px',
              fontFamily:"'Press Start 2P',monospace", fontSize:10,
              background: loading ? '#333' : '#4488ff', color:'#000',
              border:'none', cursor:'pointer',
              boxShadow: loading ? 'none' : '0 0 16px rgba(68,136,255,0.4)',
              opacity: !activeSession ? 0.3 : 1,
            }}
          >
            {loading ? '◆ ENCODING...' : '⚔ ENCODE MESSAGE'}
          </button>

          {/* Result */}
          {result?.type === 'encode' && (
            <div style={{
              marginTop:16, background:'#0a0a16', border:'2px solid #ffcc0040',
              borderRadius:4, padding:16, textAlign:'center',
            }}>
              <div style={{
                fontFamily:"'Press Start 2P',monospace", fontSize:8, color:'#ffcc00',
                marginBottom:12,
              }}>
                ◆ ENCODED MESSAGE
              </div>
              <div style={{ display:'flex', justifyContent:'center', gap:8 }}>
                {result.message.map((sym, i) => (
                  <div key={i} style={{
                    fontFamily:"'Press Start 2P',monospace", fontSize:20,
                    color:'#ffcc00', background:'rgba(255,204,0,0.08)',
                    padding:'8px 14px', borderRadius:4,
                    border:'2px solid rgba(255,204,0,0.3)',
                    textShadow:'0 0 12px rgba(255,204,0,0.6)',
                    animation: `symbolPop 0.3s ease-out ${i*0.08}s both`,
                  }}>
                    {sym}
                  </div>
                ))}
              </div>
              {result.match && (
                <div style={{ marginTop:12, display:'flex', justifyContent:'center', gap:12, alignItems:'center' }}>
                  <PixelObject features={result.match.target_features} size={40} glow="#00ff8840" label="TARGET" />
                  <span style={{ fontFamily:"'Press Start 2P',monospace", fontSize:16, color:'#333' }}>→</span>
                  <PixelObject features={result.match.selected_features} size={40} glow={result.match.correct ? '#00ff8840' : '#ff444440'} label="SELECTED" />
                  <span style={{
                    fontFamily:"'Press Start 2P',monospace", fontSize:10,
                    color: result.match.correct ? '#00ff88' : '#ff4444',
                  }}>
                    {result.match.correct ? '✓ HIT' : '✗ MISS'}
                  </span>
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* ─── DECODE MODE ─── */}
      {mode === 'decode' && (
        <div style={{
          background:'#0d0d1a', border:'2px solid #ff444440', borderRadius:4,
          padding:20, position:'relative',
        }}>
          {/* Corner accents */}
          {[{top:0,left:0},{top:0,right:0},{bottom:0,left:0},{bottom:0,right:0}].map((pos,i) => (
            <div key={i} style={{
              position:'absolute', ...pos, width:8, height:8,
              borderTop: pos.top!==undefined ? '2px solid #ff4444' : 'none',
              borderBottom: pos.bottom!==undefined ? '2px solid #ff4444' : 'none',
              borderLeft: pos.left!==undefined ? '2px solid #ff4444' : 'none',
              borderRight: pos.right!==undefined ? '2px solid #ff4444' : 'none',
            }} />
          ))}

          <div style={{ display:'flex', alignItems:'center', gap:8, marginBottom:16 }}>
            <div style={{
              fontFamily:"'Press Start 2P',monospace", fontSize:9, color:'#ff4444',
              textShadow:'0 0 8px rgba(255,68,68,0.5)',
            }}>
              LISTENER DECODER
            </div>
            <div style={{ flex:1, height:1, background:'#ff444420' }} />
            <MiniPixelChar type="listener" size={3} />
          </div>

          {/* Symbol Input */}
          <div style={{ marginBottom:16 }}>
            <div style={{
              fontFamily:"'Press Start 2P',monospace", fontSize:7, color:'#666',
              marginBottom:8,
            }}>
              ENTER SYMBOLS
            </div>
            <div style={{ display:'flex', gap:8, justifyContent:'center' }}>
              {inputSymbols.map((sym, i) => (
                <input
                  key={i}
                  type="text"
                  value={sym}
                  onChange={e => {
                    const next = [...inputSymbols];
                    next[i] = e.target.value.replace(/[^0-9]/g,'');
                    setInputSymbols(next);
                  }}
                  maxLength={2}
                  style={{
                    width:48, height:48, textAlign:'center',
                    fontFamily:"'Press Start 2P',monospace", fontSize:18,
                    color:'#ff4444', background:'#0a0a16',
                    border:'2px solid #ff444440', borderRadius:4,
                    outline:'none',
                    boxShadow: sym ? '0 0 8px rgba(255,68,68,0.2)' : 'none',
                    transition:'all 0.15s',
                  }}
                  onFocus={e => e.target.style.borderColor = '#ff4444'}
                  onBlur={e => e.target.style.borderColor = '#ff444440'}
                />
              ))}
            </div>
          </div>

          <button
            onClick={handleDecode}
            disabled={loading || !activeSession}
            style={{
              width:'100%', padding:'10px',
              fontFamily:"'Press Start 2P',monospace", fontSize:10,
              background: loading ? '#333' : '#ff4444', color:'#000',
              border:'none', cursor:'pointer',
              boxShadow: loading ? 'none' : '0 0 16px rgba(255,68,68,0.4)',
              opacity: !activeSession ? 0.3 : 1,
            }}
          >
            {loading ? '◆ DECODING...' : '🛡 DECODE MESSAGE'}
          </button>

          {/* Result */}
          {result?.type === 'decode' && result.match && (
            <div style={{
              marginTop:16, background:'#0a0a16', border:'2px solid #00ddff40',
              borderRadius:4, padding:16,
            }}>
              <div style={{
                fontFamily:"'Press Start 2P',monospace", fontSize:8, color:'#00ddff',
                marginBottom:12, textAlign:'center',
              }}>
                ◆ DECODED RESULT
              </div>

              <div style={{ display:'flex', justifyContent:'center', gap:16, alignItems:'center', marginBottom:12 }}>
                <div style={{ textAlign:'center' }}>
                  <div style={{ fontFamily:"'Press Start 2P',monospace", fontSize:7, color:'#666', marginBottom:4 }}>BEST MATCH</div>
                  <PixelObject features={result.match.target_features} size={56} glow="#00ddff40" />
                </div>
                <span style={{ fontFamily:"'Press Start 2P',monospace", fontSize:16, color:'#333' }}>→</span>
                <div style={{ textAlign:'center' }}>
                  <div style={{ fontFamily:"'Press Start 2P',monospace", fontSize:7, color:'#666', marginBottom:4 }}>SELECTED</div>
                  <PixelObject features={result.match.selected_features} size={56} glow={result.match.correct ? '#00ff8840' : '#ff444440'} />
                </div>
              </div>

              {/* Stats */}
              <div style={{ display:'flex', flexDirection:'column', gap:4, padding:'8px 12px', background:'#080814', borderRadius:4 }}>
                <div style={{ display:'flex', justifyContent:'space-between' }}>
                  <span style={{ fontFamily:"'JetBrains Mono',monospace", fontSize:10, color:'#666' }}>Symbol match</span>
                  <span style={{ fontFamily:"'JetBrains Mono',monospace", fontSize:10, color:'#00ddff' }}>{result.score}/5</span>
                </div>
                <div style={{ display:'flex', justifyContent:'space-between' }}>
                  <span style={{ fontFamily:"'JetBrains Mono',monospace", fontSize:10, color:'#666' }}>Correct</span>
                  <span style={{
                    fontFamily:"'Press Start 2P',monospace", fontSize:8,
                    color: result.match.correct ? '#00ff88' : '#ff4444',
                  }}>
                    {result.match.correct ? 'YES' : 'NO'}
                  </span>
                </div>
                <div style={{ display:'flex', justifyContent:'space-between' }}>
                  <span style={{ fontFamily:"'JetBrains Mono',monospace", fontSize:10, color:'#666' }}>Message</span>
                  <span style={{ fontFamily:"'Press Start 2P',monospace", fontSize:10, color:'#ffcc00' }}>
                    [{result.match.message?.join(', ')}]
                  </span>
                </div>
              </div>
            </div>
          )}

          {result?.type === 'decode' && !result.match && (
            <div style={{
              marginTop:16, textAlign:'center',
              fontFamily:"'Press Start 2P',monospace", fontSize:10, color:'#ff4444',
            }}>
              NO MATCH FOUND
            </div>
          )}
        </div>
      )}

      {/* ─── Feature Legend ─── */}
      <div style={{
        marginTop:16, display:'flex', flexWrap:'wrap', gap:8, justifyContent:'center',
      }}>
        {FEATURES.map((f,i) => (
          <div key={f.name} style={{
            fontFamily:"'JetBrains Mono',monospace", fontSize:9, color:'#555',
            background:'#111', padding:'3px 8px', borderRadius:4, border:'1px solid #222',
          }}>
            {f.icon} {f.label}
          </div>
        ))}
      </div>

      {/* Animations */}
      <style>{`
        @keyframes symbolPop {
          0% { transform: scale(0.5); opacity: 0; }
          60% { transform: scale(1.2); }
          100% { transform: scale(1); opacity: 1; }
        }
      `}</style>
    </div>
  );
}
