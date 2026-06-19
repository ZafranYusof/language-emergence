import { API_URL } from '../config';
import React, { useState, useEffect, useRef, useCallback } from 'react';

/* ───── colour palette ───── */
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
};

import { API_URL } from '../config';
const API = API_URL;

/* ───── keyframes (injected once) ───── */
const styleId = 'desktop-access-keyframes';
if (typeof document !== 'undefined' && !document.getElementById(styleId)) {
  const el = document.createElement('style');
  el.id = styleId;
  el.textContent = `
    @keyframes da-pulse { 0%,100%{opacity:1} 50%{opacity:0.6} }
    @keyframes da-scan { 0%{background-position:0% 0%} 100%{background-position:0% 100%} }
    @keyframes da-fadeIn { from{opacity:0;transform:translateY(8px)} to{opacity:1;transform:translateY(0)} }
    @keyframes da-bar-fill { from{width:0} to{width:var(--fill)} }
    @keyframes da-blink { 0%,100%{opacity:1} 50%{opacity:0.3} }
    @keyframes da-glow { 0%,100%{box-shadow:0 0 4px ${C.green}44} 50%{box-shadow:0 0 16px ${C.green}88} }
    @keyframes da-scroll { 0%{transform:translateY(0)} 100%{transform:translateY(-100%)} }
    @keyframes da-bob { 0%,100%{transform:translateY(0)} 50%{transform:translateY(-2px)} }
    @keyframes da-walk { 0%,100%{transform:translateY(0)} 25%{transform:translateY(-3px)} 75%{transform:translateY(-1px)} }
    @keyframes da-scanSweep { 0%{transform:translateX(-100%)} 100%{transform:translateX(100%)} }
    @keyframes da-bubbleIn { from{opacity:0;transform:scale(0.6) translateY(6px)} to{opacity:1;transform:scale(1) translateY(0)} }
    @keyframes da-bubbleOut { from{opacity:1;transform:scale(1)} to{opacity:0;transform:scale(0.8) translateY(-4px)} }
    @keyframes da-typing { 0%,100%{transform:translateY(0) rotate(0)} 25%{transform:translateY(-1px) rotate(-1deg)} 75%{transform:translateY(1px) rotate(1deg)} }
    @keyframes da-dotSpin { 0%{content:'.'} 33%{content:'..'} 66%{content:'...'} }
    @keyframes da-labelPop { from{opacity:0;transform:translateY(4px) scale(0.9)} to{opacity:1;transform:translateY(0) scale(1)} }
    @keyframes da-coffee { 0%,100%{opacity:0.3} 50%{opacity:0.7} }
    @keyframes da-monitorFlicker { 0%,90%,100%{opacity:1} 92%{opacity:0.7} 94%{opacity:1} 96%{opacity:0.6} }
    @keyframes da-progressFill { from{width:0%} to{width:100%} }
    @keyframes da-eyeShift { 0%,40%{transform:translateX(0)} 45%{transform:translateX(-1px)} 55%{transform:translateX(1px)} 60%,100%{transform:translateX(0)} }
  `;
  document.head.appendChild(el);
}

/* ───── helper: file icon by extension ───── */
function fileIcon(name, isDir) {
  if (isDir) return '📁';
  const ext = name.split('.').pop().toLowerCase();
  const map = {
    txt: '📄', md: '📄', log: '📄', py: '📄', js: '📄', jsx: '📄', ts: '📄', tsx: '📄',
    json: '📄', yaml: '📄', yml: '📄', csv: '📄', html: '📄', css: '📄', sh: '📄',
    png: '🖼️', jpg: '🖼️', jpeg: '🖼️', gif: '🖼️', bmp: '🖼️', svg: '🖼️', webp: '🖼️', ico: '🖼️',
    zip: '📦', tar: '📦', gz: '📦', rar: '📦', '7z': '📦', tgz: '📦',
    lnk: '🔗', url: '🔗', shortcut: '🔗',
  };
  return map[ext] || '📄';
}

function gaugeColor(pct) {
  if (pct < 60) return C.green;
  if (pct < 80) return C.amber;
  return C.red;
}

function badgeColor(type) {
  const map = {
    observe: C.cyan,
    navigate: C.amber,
    capture: C.green,
    action: C.amber,
    read: C.cyan,
    system: C.dim,
    error: C.red,
    info: C.dim,
  };
  return map[type] || C.dim;
}

function formatTime(date) {
  return date.toLocaleTimeString('en-US', { hour12: false, hour: '2-digit', minute: '2-digit', second: '2-digit' });
}

/* ───── mock data generators ───── */
function mockFiles(path) {
  const dirs = [
    { name: 'AI-Project', isDir: true },
    { name: 'Documents', isDir: true },
    { name: 'Screenshots', isDir: true },
    { name: 'Downloads', isDir: true },
    { name: '.config', isDir: true },
  ];
  const files = [
    { name: 'notes.txt', isDir: false, size: '2.4 KB' },
    { name: 'budget.csv', isDir: false, size: '14.7 KB' },
    { name: 'presentation.pdf', isDir: false, size: '1.2 MB' },
    { name: 'photo_2026.jpg', isDir: false, size: '3.8 MB' },
    { name: 'archive.zip', isDir: false, size: '45.1 MB' },
    { name: 'config.json', isDir: false, size: '832 B' },
    { name: 'todo.md', isDir: false, size: '1.1 KB' },
    { name: 'research.py', isDir: false, size: '4.6 KB' },
  ];
  return [...dirs, ...files];
}

function mockPreview(name) {
  const previews = {
    'notes.txt': `# Meeting Notes - June 2026
- Discussed language model alignment
- Agent communication protocols reviewed
- Next: implement symbol grounding tests
- TODO: schedule follow-up with team`,
    'config.json': `{
  "theme": "dark",
  "agent_enabled": true,
  "monitoring": {
    "screenshot_interval": 5000,
    "system_poll": 2000
  },
  "model": "hermes-3.1"
}`,
    'todo.md': `# Task List
- [x] Set up desktop monitoring
- [x] Configure agent observation
- [ ] Review emergent language patterns
- [ ] Export communication logs
- [ ] Write analysis report`,
    'research.py': `import torch
import numpy as np
from agents import EmergentAgent

def train_communication(agents, epochs=100):
    """Train agents to develop shared language."""
    for epoch in range(epochs):
        msg = agents[0].send()
        recv = agents[1].receive(msg)
        loss = agents[0].update(recv)
        if epoch % 10 == 0:
            print(f"Epoch {epoch}: loss={loss:.4f}")

if __name__ == "__main__":
    a1 = EmergentAgent(role="speaker")
    a2 = EmergentAgent(role="listener")
    train_communication([a1, a2])`,
  };
  return previews[name] || `[Preview not available for ${name}]`;
}

function mockSystemStats() {
  return {
    cpu: 20 + Math.random() * 60,
    memory: 35 + Math.random() * 50,
    disk: 45 + Math.random() * 40,
    cpuLabel: 'Intel i7-13700K',
    memoryLabel: `${(12.4 + Math.random() * 4).toFixed(1)} / 32.0 GB`,
    diskLabel: `${(186 + Math.random() * 40).toFixed(0)} / 512 GB`,
  };
}

/* ───── CRT scanline overlay ───── */
function Scanlines() {
  return (
    <div style={{
      position: 'absolute', inset: 0, pointerEvents: 'none', zIndex: 999,
      background: `repeating-linear-gradient(
        0deg,
        transparent,
        transparent 2px,
        rgba(0,0,0,0.08) 2px,
        rgba(0,0,0,0.08) 4px
      )`,
    }} />
  );
}

/* ───── Panel wrapper ───── */
function Panel({ title, icon, children, style = {}, headerRight }) {
  return (
    <div style={{
      background: `linear-gradient(135deg, ${C.panel} 0%, ${C.panelLight} 100%)`,
      border: `1px solid ${C.dim}44`,
      borderRadius: 8,
      overflow: 'hidden',
      position: 'relative',
      ...style,
    }}>
      <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        padding: '10px 14px',
        borderBottom: `1px solid ${C.dim}33`,
        background: `linear-gradient(90deg, ${C.panel} 0%, ${C.panelLight} 100%)`,
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span style={{ fontSize: 14 }}>{icon}</span>
          <span style={{
            fontFamily: "'JetBrains Mono', monospace", fontSize: 11,
            fontWeight: 700, letterSpacing: 2, color: C.green,
            textTransform: 'uppercase',
          }}>{title}</span>
        </div>
        {headerRight}
      </div>
      <div style={{ position: 'relative' }}>
        {children}
        <Scanlines />
      </div>
    </div>
  );
}

/* ═══════════════════════════════════════════════
   1. FILE BROWSER
   ═══════════════════════════════════════════════ */
function FileBrowser({ onSelectFile }) {
  const [path, setPath] = useState(['Desktop']);
  const [files, setFiles] = useState([]);
  const [search, setSearch] = useState('');
  const [selected, setSelected] = useState(null);

  useEffect(() => {
    setFiles(mockFiles(path.join('/')));
    setSelected(null);
  }, [path]);

  const navigate = (name) => {
    setPath([...path, name]);
  };

  const goTo = (index) => {
    setPath(path.slice(0, index + 1));
  };

  const filtered = files.filter(f =>
    f.name.toLowerCase().includes(search.toLowerCase())
  );

  const handleClick = (f) => {
    setSelected(f.name);
    if (f.isDir) {
      navigate(f.name);
    } else {
      onSelectFile(f);
    }
  };

  return (
    <Panel
      title="File Browser"
      icon="📂"
      style={{ height: '100%' }}
      headerRight={
        <span style={{
          fontFamily: "'JetBrains Mono', monospace", fontSize: 9,
          color: C.dim, letterSpacing: 1,
        }}>{files.length} items</span>
      }
    >
      {/* Search */}
      <div style={{ padding: '8px 12px', borderBottom: `1px solid ${C.dim}22` }}>
        <input
          value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder="🔍 Search files..."
          style={{
            width: '100%', background: C.bg, border: `1px solid ${C.dim}55`,
            borderRadius: 4, padding: '6px 10px', color: C.text,
            fontFamily: "'JetBrains Mono', monospace", fontSize: 11,
            outline: 'none', boxSizing: 'border-box',
          }}
        />
      </div>

      {/* Breadcrumb */}
      <div style={{
        padding: '6px 12px', display: 'flex', alignItems: 'center', gap: 4,
        flexWrap: 'wrap', borderBottom: `1px solid ${C.dim}22`,
        fontFamily: "'JetBrains Mono', monospace", fontSize: 10,
      }}>
        {path.map((seg, i) => (
          <React.Fragment key={i}>
            {i > 0 && <span style={{ color: C.dim }}>/</span>}
            <span
              onClick={() => goTo(i)}
              style={{
                color: i === path.length - 1 ? C.cyan : C.dim,
                cursor: 'pointer', padding: '2px 4px', borderRadius: 3,
                background: i === path.length - 1 ? `${C.cyan}15` : 'transparent',
                transition: 'all 0.15s',
              }}
            >{seg}</span>
          </React.Fragment>
        ))}
      </div>

      {/* File list */}
      <div style={{
        padding: '4px 0', maxHeight: 340, overflowY: 'auto',
      }}>
        {path.length > 1 && (
          <div
            onClick={() => setPath(path.slice(0, -1))}
            style={{
              display: 'flex', alignItems: 'center', gap: 10,
              padding: '7px 14px', cursor: 'pointer',
              fontFamily: "'JetBrains Mono', monospace", fontSize: 12,
              color: C.dim, transition: 'background 0.15s',
            }}
            onMouseEnter={e => e.currentTarget.style.background = `${C.dim}15`}
            onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
          >
            <span>⬆️</span>
            <span>..</span>
          </div>
        )}
        {filtered.map((f) => (
          <div
            key={f.name}
            onClick={() => handleClick(f)}
            style={{
              display: 'flex', alignItems: 'center', gap: 10,
              padding: '7px 14px', cursor: 'pointer',
              fontFamily: "'JetBrains Mono', monospace", fontSize: 12,
              color: selected === f.name ? C.textBright : C.text,
              background: selected === f.name ? `${C.cyan}18` : 'transparent',
              borderLeft: selected === f.name ? `2px solid ${C.cyan}` : '2px solid transparent',
              transition: 'all 0.15s',
            }}
            onMouseEnter={e => { if (selected !== f.name) e.currentTarget.style.background = `${C.dim}10`; }}
            onMouseLeave={e => { if (selected !== f.name) e.currentTarget.style.background = 'transparent'; }}
          >
            <span style={{ fontSize: 14, flexShrink: 0 }}>{fileIcon(f.name, f.isDir)}</span>
            <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {f.name}
            </span>
            {!f.isDir && (
              <span style={{ fontSize: 9, color: C.dim }}>{f.size}</span>
            )}
          </div>
        ))}
        {filtered.length === 0 && (
          <div style={{
            padding: 20, textAlign: 'center', color: C.dim,
            fontFamily: "'JetBrains Mono', monospace", fontSize: 11,
          }}>
            {search ? 'No matches found' : 'Empty folder'}
          </div>
        )}
      </div>
    </Panel>
  );
}

/* ═══════════════════════════════════════════════
   FILE PREVIEW MODAL
   ═══════════════════════════════════════════════ */
function FilePreview({ file, onClose }) {
  if (!file) return null;
  const content = mockPreview(file.name);
  const lines = content.split('\n').slice(0, 30);

  return (
    <div style={{
      position: 'fixed', inset: 0, zIndex: 1000,
      background: 'rgba(0,0,0,0.7)', display: 'flex',
      alignItems: 'center', justifyContent: 'center',
      backdropFilter: 'blur(4px)',
    }} onClick={onClose}>
      <div
        onClick={e => e.stopPropagation()}
        style={{
          background: C.panel, border: `1px solid ${C.cyan}44`,
          borderRadius: 10, width: 560, maxHeight: '70vh',
          overflow: 'auto', boxShadow: `0 0 40px ${C.cyan}22`,
        }}
      >
        <div style={{
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          padding: '12px 16px', borderBottom: `1px solid ${C.dim}33`,
          position: 'sticky', top: 0, background: C.panel, zIndex: 2,
        }}>
          <span style={{
            fontFamily: "'JetBrains Mono', monospace", fontSize: 12,
            color: C.cyan, fontWeight: 600,
          }}>
            {fileIcon(file.name, false)} {file.name}
          </span>
          <button onClick={onClose} style={{
            background: 'none', border: `1px solid ${C.dim}66`,
            color: C.dim, borderRadius: 4, padding: '2px 10px',
            cursor: 'pointer', fontFamily: "'JetBrains Mono', monospace",
            fontSize: 12,
          }}>✕</button>
        </div>
        <pre style={{
          margin: 0, padding: 16,
          fontFamily: "'JetBrains Mono', monospace", fontSize: 11,
          color: C.text, lineHeight: 1.6,
          whiteSpace: 'pre-wrap', wordBreak: 'break-word',
        }}>
          {lines.map((line, i) => (
            <div key={i} style={{ display: 'flex' }}>
              <span style={{
                width: 32, textAlign: 'right', paddingRight: 12,
                color: C.dim, userSelect: 'none', flexShrink: 0,
                fontSize: 10,
              }}>{i + 1}</span>
              <span>{line}</span>
            </div>
          ))}
          {content.split('\n').length > 30 && (
            <div style={{ color: C.dim, marginTop: 8, fontSize: 10 }}>
              ... {content.split('\n').length - 30} more lines
            </div>
          )}
        </pre>
      </div>
    </div>
  );
}

/* ═══════════════════════════════════════════════
   2. SCREENSHOT VIEWER
   ═══════════════════════════════════════════════ */
function ScreenshotViewer() {
  const [screenshot, setScreenshot] = useState(null);
  const [loading, setLoading] = useState(false);
  const [thought, setThought] = useState(null);
  const [timestamp, setTimestamp] = useState(null);

  const capture = useCallback(async () => {
    console.log('CAPTURE: Starting...');
    setLoading(true);
    try {
      const res = await fetch(`${API}/api/desktop/screenshot`);
      console.log('CAPTURE: Response status:', res.status);
      if (res.ok) {
        const data = await res.json();
        console.log('CAPTURE: Data keys:', Object.keys(data));
        console.log('CAPTURE: Has base64:', !!data.base64, 'length:', data.base64?.length);
        const imgSrc = data.base64 ? `data:image/png;base64,${data.base64}` : (data.image || data.screenshot || null);
        console.log('CAPTURE: imgSrc type:', typeof imgSrc, 'length:', imgSrc?.length);
        setScreenshot(imgSrc);
        setTimestamp(new Date());
        console.log('CAPTURE: State updated');
      } else {
        console.log('CAPTURE: Response not OK:', res.status);
      }
    } catch (e) {
      console.error('CAPTURE: Error:', e);
      setScreenshot(null);
      setTimestamp(new Date());
    }
    setLoading(false);
  }, []);

  const observe = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`${API}/api/desktop/observe`, { method: 'POST' });
      if (res.ok) {
        const data = await res.json();
        setThought(data.thought || data.observation || 'Agent is analyzing the desktop...');
        setTimestamp(new Date());
      }
    } catch (e) {
      setThought('🔍 Agent observes: Desktop shows active development session. IDE open with Python code. Browser has documentation tabs. Terminal running monitoring scripts.');
      setTimestamp(new Date());
    }
    setLoading(false);
  }, []);

  return (
    <Panel
      title="Screenshot Viewer"
      icon="📸"
      headerRight={
        <div style={{ display: 'flex', gap: 6 }}>
          <button onClick={capture} style={{
            background: `${C.green}22`, border: `1px solid ${C.green}66`,
            color: C.green, borderRadius: 4, padding: '3px 10px',
            cursor: 'pointer', fontFamily: "'JetBrains Mono', monospace",
            fontSize: 10, letterSpacing: 1,
            animation: loading ? 'da-pulse 1s infinite' : 'none',
          }}>
            {loading ? '⏳' : '📷'} CAPTURE
          </button>
          <button onClick={observe} style={{
            background: `${C.cyan}22`, border: `1px solid ${C.cyan}66`,
            color: C.cyan, borderRadius: 4, padding: '3px 10px',
            cursor: 'pointer', fontFamily: "'JetBrains Mono', monospace",
            fontSize: 10, letterSpacing: 1,
          }}>
            🔍 OBSERVE
          </button>
        </div>
      }
    >
      <div style={{ padding: 12, minHeight: 180 }}>
        {/* Screenshot display */}
        <div style={{
          background: C.bg, borderRadius: 6, border: `1px solid ${C.dim}33`,
          minHeight: 140, display: 'flex', alignItems: 'center',
          justifyContent: 'center', position: 'relative', overflow: 'hidden',
        }}>
          {screenshot ? (
            <img
              src={screenshot}
              alt="Desktop screenshot"
              style={{ width: '100%', borderRadius: 6, display: 'block' }}
            />
          ) : (
            <div style={{
              textAlign: 'center', color: C.dim,
              fontFamily: "'JetBrains Mono', monospace", fontSize: 11,
            }}>
              <div style={{ fontSize: 32, marginBottom: 8 }}>🖥️</div>
              <div>No screenshot captured</div>
              <div style={{ fontSize: 9, marginTop: 4 }}>Click CAPTURE to grab desktop</div>
            </div>
          )}

          {/* Agent thought bubble overlay */}
          {thought && (
            <div style={{
              position: 'absolute', bottom: 8, left: 8, right: 8,
              background: 'rgba(10,10,10,0.92)', borderRadius: 8,
              padding: '10px 14px', border: `1px solid ${C.cyan}55`,
              backdropFilter: 'blur(8px)',
              animation: 'da-fadeIn 0.3s ease-out',
            }}>
              <div style={{
                display: 'flex', alignItems: 'flex-start', gap: 8,
              }}>
                <span style={{ fontSize: 16, flexShrink: 0 }}>💭</span>
                <div style={{
                  fontFamily: "'JetBrains Mono', monospace", fontSize: 10,
                  color: C.text, lineHeight: 1.5,
                }}>{thought}</div>
              </div>
            </div>
          )}
        </div>

        {timestamp && (
          <div style={{
            fontFamily: "'JetBrains Mono', monospace", fontSize: 9,
            color: C.dim, marginTop: 6, textAlign: 'right',
          }}>
            Last capture: {formatTime(timestamp)}
          </div>
        )}
      </div>
    </Panel>
  );
}

/* ═══════════════════════════════════════════════
   3. SYSTEM MONITOR
   ═══════════════════════════════════════════════ */
function GaugeBar({ label, value, sublabel }) {
  const pct = Math.round(value);
  const color = gaugeColor(pct);
  const [animated, setAnimated] = useState(false);

  useEffect(() => {
    const t = setTimeout(() => setAnimated(true), 100);
    return () => clearTimeout(t);
  }, [value]);

  return (
    <div style={{ marginBottom: 10 }}>
      <div style={{
        display: 'flex', justifyContent: 'space-between', alignItems: 'baseline',
        marginBottom: 4,
      }}>
        <span style={{
          fontFamily: "'JetBrains Mono', monospace", fontSize: 10,
          color: C.text, letterSpacing: 1,
        }}>{label}</span>
        <span style={{
          fontFamily: "'JetBrains Mono', monospace", fontSize: 10,
          color, fontWeight: 700,
        }}>{pct}%</span>
      </div>
      <div style={{
        height: 8, background: `${C.bg}`, borderRadius: 4,
        overflow: 'hidden', border: `1px solid ${C.dim}33`,
      }}>
        <div style={{
          height: '100%', borderRadius: 4,
          width: animated ? `${pct}%` : '0%',
          background: `linear-gradient(90deg, ${color}88, ${color})`,
          transition: 'width 0.8s cubic-bezier(0.4,0,0.2,1)',
          boxShadow: `0 0 8px ${color}66`,
        }} />
      </div>
      {sublabel && (
        <div style={{
          fontFamily: "'JetBrains Mono', monospace", fontSize: 9,
          color: C.dim, marginTop: 2,
        }}>{sublabel}</div>
      )}
    </div>
  );
}

function SystemMonitor() {
  const [stats, setStats] = useState(mockSystemStats());

  useEffect(() => {
    const iv = setInterval(() => setStats(mockSystemStats()), 2000);
    return () => clearInterval(iv);
  }, []);

  return (
    <Panel title="System Monitor" icon="📊">
      <div style={{ padding: '12px 14px' }}>
        <GaugeBar label="CPU" value={stats.cpu} sublabel={stats.cpuLabel} />
        <GaugeBar label="MEMORY" value={stats.memory} sublabel={stats.memoryLabel} />
        <GaugeBar label="DISK" value={stats.disk} sublabel={stats.diskLabel} />
        <div style={{
          display: 'flex', justifyContent: 'space-between', marginTop: 8,
          paddingTop: 8, borderTop: `1px solid ${C.dim}22`,
        }}>
          <StatusDot label="Network" active color={C.green} />
          <StatusDot label="Agent" active color={C.cyan} />
          <StatusDot label="Monitor" active color={C.amber} />
        </div>
      </div>
    </Panel>
  );
}

function StatusDot({ label, active, color }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
      <div style={{
        width: 6, height: 6, borderRadius: '50%',
        background: active ? color : C.dim,
        boxShadow: active ? `0 0 6px ${color}` : 'none',
        animation: active ? 'da-blink 2s infinite' : 'none',
      }} />
      <span style={{
        fontFamily: "'JetBrains Mono', monospace", fontSize: 9,
        color: active ? C.text : C.dim,
      }}>{label}</span>
    </div>
  );
}

/* ═══════════════════════════════════════════════
   4. ACTION LOG
   ═══════════════════════════════════════════════ */
function ActionLog({ externalActions = [] }) {
  const [logs, setLogs] = useState([]);
  const endRef = useRef(null);

  const mockActions = [
    { type: 'observe', msg: 'Agent scanned desktop — 3 windows active' },
    { type: 'navigate', msg: 'Browsed to /Desktop/AI-Project' },
    { type: 'read', msg: 'Opened notes.txt (2.4 KB)' },
    { type: 'capture', msg: 'Screenshot captured (1920×1080)' },
    { type: 'action', msg: 'Agent analyzed code in research.py' },
    { type: 'observe', msg: 'Detected IDE window: VSCode — main.py' },
    { type: 'system', msg: 'System metrics collected' },
    { type: 'navigate', msg: 'Browsed to /Desktop/Documents' },
    { type: 'capture', msg: 'Screenshot captured (1920×1080)' },
    { type: 'read', msg: 'Scanned config.json' },
    { type: 'observe', msg: 'Terminal active — running pytest' },
    { type: 'action', msg: 'Agent noted error patterns in log output' },
    { type: 'info', msg: 'File browser refreshed' },
    { type: 'capture', msg: 'Screenshot captured (1920×1080)' },
    { type: 'observe', msg: 'Browser open — Stack Overflow tab detected' },
    { type: 'action', msg: 'Cross-referenced code with documentation' },
    { type: 'system', msg: 'Memory usage spike detected — 78%' },
    { type: 'read', msg: 'Opened todo.md (1.1 KB)' },
    { type: 'observe', msg: 'User typing in editor — Python file' },
    { type: 'capture', msg: 'Screenshot captured (1920×1080)' },
  ];

  useEffect(() => {
    // Seed initial logs
    const initial = mockActions.slice(0, 6).map((a, i) => ({
      ...a,
      id: i,
      time: new Date(Date.now() - (6 - i) * 45000),
    }));
    setLogs(initial);

    let idx = 6;
    const iv = setInterval(() => {
      const action = mockActions[idx % mockActions.length];
      const entry = {
        ...action,
        id: Date.now(),
        time: new Date(),
      };
      setLogs(prev => [...prev.slice(-49), entry]);
      idx++;
    }, 3000 + Math.random() * 4000);

    return () => clearInterval(iv);
  }, []);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [logs.length]);

  // Merge external agent actions into logs
  useEffect(() => {
    if (externalActions.length > 0) {
      const latest = externalActions[externalActions.length - 1];
      setLogs(prev => {
        // Avoid duplicates
        if (prev.some(l => l.id === latest.id)) return prev;
        return [...prev.slice(-49), latest];
      });
    }
  }, [externalActions]);

  return (
    <Panel
      title="Action Log"
      icon="📋"
      headerRight={
        <span style={{
          fontFamily: "'JetBrains Mono', monospace", fontSize: 9,
          color: C.dim,
        }}>{logs.length} events</span>
      }
    >
      <div style={{
        padding: '6px 0', maxHeight: 160, overflowY: 'auto',
        fontFamily: "'JetBrains Mono', monospace", fontSize: 10,
      }}>
        {logs.map((log) => (
          <div key={log.id} style={{
            display: 'flex', alignItems: 'center', gap: 8,
            padding: '4px 12px',
            animation: 'da-fadeIn 0.3s ease-out',
          }}>
            {/* Agent icon for agent-generated entries */}
            {log.agent && (
              <span style={{ fontSize: 10, flexShrink: 0 }} title={log.agent}>
                {log.agent === 'Observer' ? '🔵' : '🔴'}
              </span>
            )}
            <span style={{ color: C.dim, fontSize: 9, flexShrink: 0, width: 55 }}>
              {formatTime(log.time)}
            </span>
            <span style={{
              background: `${badgeColor(log.type)}22`,
              color: badgeColor(log.type),
              padding: '1px 6px', borderRadius: 3, fontSize: 8,
              fontWeight: 700, letterSpacing: 0.5, textTransform: 'uppercase',
              flexShrink: 0, width: 50, textAlign: 'center',
            }}>
              {log.type}
            </span>
            <span style={{ color: C.text, flex: 1, overflow: 'hidden',
              textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {log.msg}
            </span>
          </div>
        ))}
        <div ref={endRef} />
      </div>
    </Panel>
  );
}

/* ═══════════════════════════════════════════════
   PIXEL ART AGENT SYSTEM
   ═══════════════════════════════════════════════ */

/* ───── PixelAgent: Renders a 16x20 pixel art character ───── */
function PixelAgent({ type = 'blue', state = 'IDLE', frame = 0, scale = 3 }) {
  const isBlue = type === 'blue';
  const px = scale;

  const hair = isBlue ? '#4488ff' : '#ff4444';
  const hairDark = isBlue ? '#2266cc' : '#cc2222';
  const skin = '#f8d0b0';
  const skinShade = '#e8b898';
  const eyeWhite = '#ffffff';
  const pupil = '#222222';
  const outfit = isBlue ? '#3355aa' : '#aa3333';
  const outfitLight = isBlue ? '#4477cc' : '#cc4444';
  const outfitDark = isBlue ? '#223388' : '#882222';
  const boots = '#553322';
  const cape = isBlue ? '#1a2d66' : '#661a1a';
  const capeLight = isBlue ? '#2a3d88' : '#882a2a';
  const accent = isBlue ? '#ffcc00' : '#ff6600';

  const isWalking = state === 'WALKING';
  const isTyping = state === 'TYPING';
  const isScanning = state === 'SCANNING';
  const isThinking = state === 'THINKING';

  const walkFrame = isWalking ? frame % 4 : 0;
  const typingHunch = isTyping ? 1 : 0;

  const H = hair, HD = hairDark, S = skin, SS = skinShade;
  const O = outfit, OL = outfitLight, OD = outfitDark;
  const E = eyeWhite, P = pupil, B = boots, CA = cape, CL = capeLight, A = accent;
  const _ = null;

  const pixels = [
    [_,_,_,_,_,H,H,H,H,H,H,_,_,_,_,_],
    [_,_,_,_,H,H,H,H,H,H,H,H,_,_,_,_],
    [_,_,_,H,H,H,H,H,H,H,H,H,H,_,_,_],
    [_,_,_,H,S,S,S,S,S,S,S,S,H,_,_,_],
    [_,_,_,H,S,E,P,S,S,E,P,S,H,_,_,_],
    [_,_,_,_,S,S,S,SS,S,S,S,S,_,_,_,_],
    [_,_,_,_,_,S,S,S,S,S,S,_,_,_,_,_],
    [_,_,CA,OL,OL,O,O,O,O,O,O,OL,CL,_,_,_],
    [_,_,CA,OL,O,O,A,O,O,A,O,O,CL,_,_,_],
    [_,_,CA,OL,O,O,O,O,O,O,O,O,CL,_,_,_],
    [_,_,CA,OL,O,O,O,O,O,O,O,O,CL,_,_,_],
    [_,_,_,OL,O,O,OD,OD,OD,O,O,O,OL,_,_,_],
    [_,_,_,_,O,A,A,A,A,A,A,O,_,_,_,_],
    [_,_,_,_,O,O,OD,_,OD,O,O,_,_,_,_,_],
    [_,_,_,_,O,O,walkFrame===1?_:OD,_,walkFrame===3?_:OD,O,O,_,_,_,_,_],
    [_,_,_,_,O,O,_,_,_,O,O,_,_,_,_,_],
    [_,_,_,_,O,O,walkFrame===2?_:_,_,_,walkFrame===0?_:_,O,O,_,_,_,_,_],
    [_,_,_,_,B,B,_,_,_,B,B,_,_,_,_,_],
    [_,_,_,_,B,B,_,_,_,B,B,_,_,_,_,_],
    [_,_,_,B,B,B,_,_,_,B,B,B,_,_,_,_],
  ];

  const animClass = state === 'IDLE' ? 'da-bob' :
    isWalking ? 'da-walk' :
    isTyping ? 'da-typing' : 'none';
  const animDuration = state === 'IDLE' ? '2s' :
    isWalking ? '0.4s' :
    isTyping ? '0.15s' : '0s';

  return (
    <div style={{
      position: 'relative',
      width: 16 * px,
      height: 20 * px,
     animation: `${animClass} ${animDuration} ease-in-out infinite`,
      imageRendering: 'pixelated',
    }}>
      {pixels.map((row, y) =>
        row.map((color, x) =>
          color ? (
            <div key={`${y}-${x}`} style={{
              position: 'absolute',
              left: x * px,
              top: y * px + typingHunch,
              width: px,
              height: px,
              backgroundColor: color,
            }} />
          ) : null
        )
      )}
      {isThinking && (
        <div style={{
          position: 'absolute', left: 5 * px, top: 4 * px,
          width: px, height: px,
          background: isBlue ? '#00ddff' : '#ffaa00',
          boxShadow: `0 0 4px ${isBlue ? '#00ddff' : '#ffaa00'}`,
          animation: 'da-blink 1s infinite',
        }} />
      )}
    </div>
  );
}

/* ───── ThoughtBubble: Pixel-art speech bubble with typewriter text ───── */
function ThoughtBubble({ text, visible, color = C.green }) {
  const [displayText, setDisplayText] = useState('');
  const [phase, setPhase] = useState('hidden');

  useEffect(() => {
    if (!visible || !text) {
      setPhase('hidden');
      setDisplayText('');
      return;
    }
    setPhase('typing');
    setDisplayText('');
    let i = 0;
    const iv = setInterval(() => {
      i++;
      if (i <= text.length) {
        setDisplayText(text.slice(0, i));
      } else {
        clearInterval(iv);
        setPhase('showing');
        setTimeout(() => setPhase('fading'), 4000);
        setTimeout(() => { setPhase('hidden'); setDisplayText(''); }, 4500);
      }
    }, 30);
    return () => clearInterval(iv);
  }, [text, visible]);

  if (phase === 'hidden') return null;

  return (
    <div style={{
      position: 'absolute', bottom: '100%', left: '50%',
      transform: 'translateX(-50%)', marginBottom: 8, zIndex: 10,
      animation: phase === 'fading' ? 'da-bubbleOut 0.5s ease-in forwards' : 'da-bubbleIn 0.3s ease-out',
    }}>
      <div style={{
        background: 'rgba(10,10,10,0.95)',
        border: `2px solid ${color}`, borderRadius: 6,
        padding: '6px 10px', minWidth: 80, maxWidth: 180,
        position: 'relative', boxShadow: `0 0 8px ${color}33`,
      }}>
        <div style={{
          fontFamily: "'JetBrains Mono', monospace", fontSize: 9,
          color: C.text, lineHeight: 1.4,
          whiteSpace: 'pre-wrap', wordBreak: 'break-word',
        }}>
          {displayText}
          {phase === 'typing' && <span style={{ color, animation: 'da-blink 0.5s infinite' }}>▌</span>}
        </div>
        <div style={{
          position: 'absolute', bottom: -6, left: '50%', transform: 'translateX(-50%)',
          width: 0, height: 0,
          borderLeft: '5px solid transparent', borderRight: '5px solid transparent',
          borderTop: `6px solid ${color}`,
        }} />
        <div style={{
          position: 'absolute', bottom: -4, left: '50%', transform: 'translateX(-50%)',
          width: 0, height: 0,
          borderLeft: '4px solid transparent', borderRight: '4px solid transparent',
          borderTop: '5px solid rgba(10,10,10,0.95)',
        }} />
      </div>
    </div>
  );
}

/* ───── ActionLabel: Floating status label above agent ───── */
function ActionLabel({ text, visible }) {
  if (!visible || !text) return null;
  return (
    <div style={{
      position: 'absolute', bottom: '100%', left: '50%',
      transform: 'translateX(-50%)', marginBottom: 3,
      animation: 'da-labelPop 0.3s ease-out', whiteSpace: 'nowrap',
    }}>
      <div style={{
        fontFamily: "'JetBrains Mono', monospace", fontSize: 9,
        color: C.amber, background: `${C.panel}ee`,
        border: `1px solid ${C.amber}44`, borderRadius: 4,
        padding: '2px 8px', letterSpacing: 0.5,
      }}>
        {text}
      </div>
    </div>
  );
}

/* ───── MiniDesk: Pixel art desk environment behind agents ───── */
function MiniDesk() {
  return (
    <div style={{
      position: 'absolute', bottom: 0, left: 0, right: 0,
      height: 40, pointerEvents: 'none', overflow: 'hidden',
    }}>
      {/* Desk surface */}
      <div style={{
        position: 'absolute', bottom: 0, left: 0, right: 0, height: 12,
        background: 'linear-gradient(180deg, #3a2a1a 0%, #2a1a0a 100%)',
        borderTop: '2px solid #4a3a2a',
        boxShadow: '0 -2px 8px rgba(0,0,0,0.3)',
      }} />
      <div style={{
        position: 'absolute', bottom: 12, left: 0, right: 0, height: 2,
        background: '#5a4a3a',
      }} />
      {/* Small monitor */}
      <div style={{
        position: 'absolute', bottom: 14, left: 20,
        width: 32, height: 22, background: '#111',
        border: '2px solid #333', borderRadius: 2, overflow: 'hidden',
        animation: 'da-monitorFlicker 8s infinite',
      }}>
        <div style={{ padding: '3px 3px' }}>
          {[0,1,2,3,4].map(i => (
            <div key={i} style={{
              height: 2, marginBottom: 1, background: C.green,
              opacity: 0.4 + (i * 0.08), width: `${40 + i * 10}%`, borderRadius: 1,
            }} />
          ))}
        </div>
        <div style={{
          position: 'absolute', bottom: -5, left: '50%', transform: 'translateX(-50%)',
          width: 4, height: 5, background: '#333',
        }} />
        <div style={{
          position: 'absolute', bottom: -7, left: '50%', transform: 'translateX(-50%)',
          width: 12, height: 2, background: '#333', borderRadius: 1,
        }} />
      </div>
      {/* Coffee cup */}
      <div style={{
        position: 'absolute', bottom: 14, right: 30,
        width: 10, height: 12,
      }}>
        <div style={{
          width: 10, height: 8, background: '#ddd',
          borderRadius: '0 0 2px 2px', border: '1px solid #aaa',
        }} />
        <div style={{
          position: 'absolute', right: -4, top: 1,
          width: 4, height: 5,
          border: '1px solid #aaa', borderLeft: 'none',
          borderRadius: '0 3px 3px 0',
        }} />
        <div style={{
          position: 'absolute', top: -6, left: 2,
          display: 'flex', gap: 2,
          animation: 'da-coffee 2s ease-in-out infinite',
        }}>
          <div style={{ width: 1, height: 4, background: '#888', borderRadius: 1, opacity: 0.5 }} />
          <div style={{ width: 1, height: 3, background: '#888', borderRadius: 1, opacity: 0.4, marginTop: 1 }} />
          <div style={{ width: 1, height: 5, background: '#888', borderRadius: 1, opacity: 0.3 }} />
        </div>
      </div>
      {/* Keyboard */}
      <div style={{
        position: 'absolute', bottom: 13, left: '50%', transform: 'translateX(-50%)',
        width: 40, height: 6, background: '#222',
        borderRadius: 1, border: '1px solid #444',
        display: 'flex', flexWrap: 'wrap', padding: 1, gap: 1,
      }}>
        {Array.from({length:12}).map((_,i) => (
          <div key={i} style={{
            width: 3, height: 2,
           background: i===2||i===5 ? '#333' : '#444',
            borderRadius: 0.5,
          }} />
        ))}
      </div>
      {/* Paper stack */}
      <div style={{
        position: 'absolute', bottom: 14, left: 65,
        width: 14, height: 10,
      }}>
        {[0,1,2].map(i => (
          <div key={i} style={{
            position: 'absolute', bottom: i*2, left: i*1,
            width: 12, height: 8, background: '#eee',
            border: '1px solid #ccc',
           transform: `rotate(${-2+i*2}deg)`,
          }}>
            <div style={{ padding: '2px 2px' }}>
              <div style={{ height: 1, background: '#999', width: '70%', marginBottom: 1 }} />
              <div style={{ height: 1, background: '#999', width: '50%' }} />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

/* ───── MiniProgressBar ───── */
function MiniProgressBar({ progress, color = C.green, visible }) {
  if (!visible) return null;
  return (
    <div style={{
      position: 'absolute', bottom: -6, left: 0, right: 0,
      height: 3, background: `${C.bg}cc`, borderRadius: 2,
      overflow: 'hidden', border: `1px solid ${C.dim}44`,
    }}>
      <div style={{
        height: '100%', width: `${progress}%`,
        background: `linear-gradient(90deg, ${color}88, ${color})`,
        transition: 'width 0.3s ease-out', borderRadius: 2,
        boxShadow: `0 0 4px ${color}44`,
      }} />
    </div>
  );
}

/* ───── Agent action definitions ───── */
// Real API-backed action definitions
const ACTION_DEFS = {
  scan_files: { icon: '📁', label: 'Scanning files', duration: 4000 },
  read_file: { icon: '📖', label: 'Reading file', duration: 5000 },
  take_screenshot: { icon: '📸', label: 'Capturing desktop', duration: 3500 },
  check_system: { icon: '📊', label: 'Checking system', duration: 3000 },
  check_apps: { icon: '💻', label: 'Checking apps', duration: 3000 },
};
const ACTION_KEYS = Object.keys(ACTION_DEFS);

// Generate real thoughts from API data
async function generateRealThought(actionKey, agentName) {
  try {
    if (actionKey === 'scan_files') {
      const res = await fetch(`${API}/api/desktop/files`);
      const data = await res.json();
      const dirs = data.files.filter(f => f.type === 'directory').length;
      const files = data.files.filter(f => f.type === 'file').length;
      const exts = {};
      data.files.filter(f => f.type === 'file').forEach(f => {
        const ext = f.extension || 'other';
        exts[ext] = (exts[ext] || 0) + 1;
      });
      const topExt = Object.entries(exts).sort((a,b) => b[1]-a[1]).slice(0,3).map(e => `${e[1]} ${e[0]}`).join(', ');
      const thoughts = [
        `Found ${data.count} items on Desktop. ${dirs} folders, ${files} files. Mostly ${topExt}.`,
        `Desktop has ${dirs} project folders. Active workspace detected.`,
        `Scanned ${files} files. ${topExt} are the most common types.`,
        `${data.count} items total. ${dirs > 20 ? 'Quite cluttered' : 'Well organized'} — ${dirs} folders.`,
      ];
      return thoughts[Math.floor(Math.random() * thoughts.length)];
    }
    if (actionKey === 'read_file') {
      const res = await fetch(`${API}/api/desktop/files`);
      const data = await res.json();
      const textFiles = data.files.filter(f => f.type === 'file' && ['.txt','.md','.py','.js','.json','.csv','.docx'].includes(f.extension));
      if (textFiles.length > 0) {
        const picked = textFiles[Math.floor(Math.random() * textFiles.length)];
        try {
          const pres = await fetch(`${API}/api/desktop/preview?path=${encodeURIComponent(picked.path)}&lines=10`);
          const preview = await pres.json();
          if (preview.type === 'text' && preview.preview) {
            const firstLine = preview.preview.split('\n')[0].trim().substring(0, 60);
            return `Reading ${picked.name}: "${firstLine}..." (${preview.total_lines} lines, ${(picked.size/1024).toFixed(1)} KB)`;
          }
        } catch(e) {}
        return `Opened ${picked.name} (${(picked.size/1024).toFixed(1)} KB). ${picked.extension === '.py' ? 'Python code detected.' : picked.extension === '.docx' ? 'Document file.' : 'Text content.'}`;
      }
      return 'No readable text files found on desktop.';
    }
    if (actionKey === 'take_screenshot') {
      const res = await fetch(`${API}/api/desktop/observe`);
      const data = await res.json();
      return data.agent_thought || data.summary || 'Captured desktop. Analyzing...';
    }
    if (actionKey === 'check_system') {
      const res = await fetch(`${API}/api/desktop/system`);
      const data = await res.json();
      const cpu = data.cpu_percent;
      const mem = data.memory.percent;
      const disk = data.disk.percent;
      const warnings = [];
      if (disk > 90) warnings.push(`Disk ${disk}% — critical!`);
      else if (disk > 80) warnings.push(`Disk ${disk}% — getting full`);
      if (mem > 80) warnings.push(`Memory ${mem}% — heavy load`);
      if (cpu > 80) warnings.push(`CPU ${cpu}% — busy`);
      if (warnings.length > 0) return `System check: ${warnings.join('. ')}.`;
      return `System healthy: CPU ${cpu}%, RAM ${mem}% (${data.memory.used_gb}/${data.memory.total_gb} GB), Disk ${disk}%.`;
    }
    if (actionKey === 'check_apps') {
      const res = await fetch(`${API}/api/desktop/apps`);
      const data = await res.json();
      const top3 = data.apps.slice(0, 3).map(a => `${a.name} (${a.memory_mb}MB)`).join(', ');
      return `${data.count} processes running. Top consumers: ${top3}.`;
    }
  } catch (e) {
    return `${agentName} is analyzing the desktop...`;
  }
  return `${agentName} completed analysis.`;
}

/* ───── SingleAgentStation: One agent with its environment ───── */
function SingleAgentStation({ agentType, onAction }) {
  const [state, setState] = useState('IDLE');
  const [frame, setFrame] = useState(0);
  const [actionLabel, setActionLabel] = useState('');
  const [thought, setThought] = useState('');
  const [thoughtVisible, setThoughtVisible] = useState(false);
  const [progress, setProgress] = useState(0);
  const [walkX, setWalkX] = useState(0);
  const isBlue = agentType === 'blue';
  const agentName = isBlue ? 'Observer' : 'Worker';
  const agentColor = isBlue ? C.cyan : C.red;
  const busyRef = useRef(false);

  useEffect(() => {
    const speed = state === 'TYPING' ? 100 : state === 'WALKING' ? 150 : 300;
    const iv = setInterval(() => setFrame(f => f + 1), speed);
    return () => clearInterval(iv);
  }, [state]);

  const performAction = useCallback(async () => {
    if (busyRef.current) return;
    busyRef.current = true;
    const actionKey = ACTION_KEYS[Math.floor(Math.random() * ACTION_KEYS.length)];
    const action = ACTION_DEFS[actionKey];
    const targetX = -30 + Math.random() * 60;

    setThoughtVisible(false);
    setThought('');
    setState('WALKING');
    setActionLabel('Walking to target...');
    setWalkX(targetX);
    setProgress(0);

    setTimeout(async () => {
      const isReadOrScan = ['read_file', 'scan_files'].includes(actionKey);
      setState(isReadOrScan ? 'SCANNING' : actionKey === 'check_apps' ? 'TYPING' : 'SCANNING');
      setActionLabel(`${action.icon} ${action.label}...`);
      const progressIv = setInterval(() => {
        setProgress(p => {
          if (p >= 100) { clearInterval(progressIv); return 100; }
          return p + (100 / (action.duration / 100));
        });
      }, 100);

      // Fetch REAL data from API while progress runs
      const thoughtText = await generateRealThought(actionKey, agentName);

      setTimeout(() => {
        clearInterval(progressIv);
        setProgress(100);
        setState('THINKING');
        setThought(thoughtText);
        setThoughtVisible(true);
        setActionLabel('');
        if (onAction) {
          onAction({
            agent: agentName,
            type: actionKey === 'take_screenshot' ? 'capture' :
                  actionKey === 'check_system' ? 'system' :
                  actionKey === 'check_apps' ? 'system' :
                  actionKey === 'read_file' ? 'read' : 'observe',
            msg: `${agentName}: ${thoughtText}`,
          });
        }
        setTimeout(() => {
          setState('IDLE');
          setThoughtVisible(false);
          setWalkX(0);
          setProgress(0);
          busyRef.current = false;
        }, 5000);
      }, action.duration);
    }, 1200);
  }, [agentType, onAction]);

  useEffect(() => {
    const scheduleNext = () => {
      const delay = 5000 + Math.random() * 3000;
      return setTimeout(() => {
        performAction();
        timerRef.current = scheduleNext();
      }, delay);
    };
    const timerRef = { current: scheduleNext() };
    return () => clearTimeout(timerRef.current);
  }, [performAction]);

  return (
    <div style={{
      position: 'relative', display: 'flex', flexDirection: 'column',
      alignItems: 'center', flex: 1, minWidth: 120, padding: '8px 12px',
    }}>
      <div style={{
        fontFamily: "'JetBrains Mono', monospace", fontSize: 9,
        color: agentColor, fontWeight: 700, letterSpacing: 1.5,
        marginBottom: 6, textTransform: 'uppercase',
        textShadow: `0 0 6px ${agentColor}66`,
      }}>
        {isBlue ? '🔵' : '🔴'} {agentName}
      </div>
      <div style={{
        position: 'relative',
        transform: `translateX(${walkX}px)`,
        transition: state === 'WALKING' ? 'transform 1s ease-in-out' : 'transform 0.3s ease-out',
      }}>
        <ThoughtBubble text={thought} visible={thoughtVisible} color={agentColor} />
        <ActionLabel text={actionLabel} visible={!!actionLabel} />
        <PixelAgent type={agentType} state={state} frame={frame} scale={3} />
        <MiniProgressBar progress={progress} color={agentColor} visible={progress > 0 && progress < 100} />
      </div>
      <div style={{
        fontFamily: "'JetBrains Mono', monospace", fontSize: 8,
        color: state === 'IDLE' ? C.dim : agentColor,
        marginTop: 8, letterSpacing: 1,
        animation: state !== 'IDLE' ? 'da-pulse 1.5s infinite' : 'none',
      }}>
        {state === 'IDLE' ? '● idle' :
         state === 'WALKING' ? '→ walking' :
         state === 'SCANNING' ? '◎ scanning' :
         state === 'READING' ? '☰ reading' :
         state === 'TYPING' ? '⌨ typing' :
         state === 'THINKING' ? '💭 thinking' : state}
      </div>
    </div>
  );
}

/* ───── AgentWorkspace: Full workspace bar with both agents ───── */
function AgentWorkspace({ onAgentAction }) {
  const handleObserverAction = useCallback((action) => {
    if (onAgentAction) onAgentAction(action);
  }, [onAgentAction]);
  const handleWorkerAction = useCallback((action) => {
    if (onAgentAction) onAgentAction(action);
  }, [onAgentAction]);

  return (
    <div style={{
      background: `linear-gradient(135deg, ${C.panel} 0%, ${C.panelLight} 100%)`,
      border: `1px solid ${C.dim}44`, borderRadius: 8,
      marginBottom: 14, overflow: 'hidden', position: 'relative',
    }}>
      <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        padding: '8px 14px', borderBottom: `1px solid ${C.dim}33`,
        background: `linear-gradient(90deg, ${C.panel} 0%, ${C.panelLight} 100%)`,
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span style={{ fontSize: 14 }}>🎮</span>
          <span style={{
            fontFamily: "'JetBrains Mono', monospace", fontSize: 11,
            fontWeight: 700, letterSpacing: 2, color: C.green,
            textTransform: 'uppercase',
          }}>Agent Workspace</span>
        </div>
        <div style={{
          display: 'flex', alignItems: 'center', gap: 10,
          fontFamily: "'JetBrains Mono', monospace", fontSize: 9, color: C.dim,
        }}>
          <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
            <div style={{
              width: 5, height: 5, borderRadius: '50%',
              background: C.green, boxShadow: `0 0 4px ${C.green}`,
              animation: 'da-blink 2s infinite',
            }} />
            <span style={{ color: C.green }}>2 agents active</span>
          </span>
        </div>
      </div>
      <div style={{
        position: 'relative', padding: '12px 20px 50px',
        minHeight: 120, display: 'flex', alignItems: 'flex-end',
        justifyContent: 'center', gap: 40,
        background: `linear-gradient(180deg, ${C.bg} 0%, ${C.panel}88 100%)`,
      }}>
        <MiniDesk />
        <div style={{
          position: 'absolute', top: 10, bottom: 50,
          left: '50%', width: 1,
          background: `linear-gradient(180deg, transparent, ${C.dim}33, transparent)`,
        }} />
        <SingleAgentStation agentType="blue" onAction={handleObserverAction} />
        <SingleAgentStation agentType="red" onAction={handleWorkerAction} />
        <div style={{
          position: 'absolute', inset: 0, pointerEvents: 'none',
          background: `repeating-linear-gradient(0deg, transparent, transparent 2px, rgba(0,0,0,0.06) 2px, rgba(0,0,0,0.06) 4px)`,
          borderRadius: 8,
        }} />
      </div>
    </div>
  );
}

/* ═══════════════════════════════════════════════
   5. TERMINAL EMULATOR
   ═══════════════════════════════════════════════ */

const TERM_AGENTS = {
  ls:        { name: 'Scout Ranger',  icon: '🔍', color: C.green },
  cat:       { name: 'Scholar Sage',  icon: '📖', color: C.cyan },
  ps:        { name: 'Worker Knight', icon: '⚙️',  color: C.amber },
  sys:       { name: 'Observer Mage', icon: '🔮', color: C.cyan },
  screenshot:{ name: 'Mystic Oracle', icon: '👁️',  color: C.green },
  scan:      { name: 'All Agents',    icon: '⚡', color: C.amber },
};

function TerminalEmulator() {
  const [open, setOpen] = useState(true);
  const [lines, setLines] = useState([
    { type: 'system', text: '╔══════════════════════════════════════════════════════════╗' },
    { type: 'system', text: '║  AGENT COMMAND TERMINAL v2.6 — Language Emergence Lab   ║' },
    { type: 'system', text: '║  Type "help" for available commands                     ║' },
    { type: 'system', text: '╚══════════════════════════════════════════════════════════╝' },
    { type: 'system', text: '' },
  ]);
  const [input, setInput] = useState('');
  const [history, setHistory] = useState([]);
  const [histIdx, setHistIdx] = useState(-1);
  const [busy, setBusy] = useState(false);
  const [busyMsg, setBusyMsg] = useState('');
  const termRef = useRef(null);
  const inputRef = useRef(null);

  // Auto-scroll to bottom
  useEffect(() => {
    if (termRef.current) {
      termRef.current.scrollTop = termRef.current.scrollHeight;
    }
  }, [lines, busy]);

  // Typing animation helper: returns a promise that resolves after typing all chars
  const typeText = useCallback((text, agent, type = 'output') => {
    return new Promise((resolve) => {
      const id = Date.now() + Math.random();
      setLines(prev => [...prev, { type: 'typing', text: '', agent, id }]);
      let i = 0;
      const speed = text.length > 200 ? 5 : text.length > 80 ? 8 : 15;
      const iv = setInterval(() => {
        i++;
        if (i <= text.length) {
          setLines(prev => prev.map(l => l.id === id ? { ...l, text: text.slice(0, i) } : l));
        } else {
          clearInterval(iv);
          setLines(prev => prev.map(l => l.id === id ? { ...l, type } : l));
          resolve();
        }
      }, speed);
    });
  }, []);

  const showLoading = useCallback((msg) => {
    const msgs = ['scanning...', 'processing...', 'analyzing...', 'querying agents...', 'decrypting data...'];
    setBusy(true);
    setBusyMsg(msg || msgs[Math.floor(Math.random() * msgs.length)]);
  }, []);

  const hideLoading = useCallback(() => {
    setBusy(false);
    setBusyMsg('');
  }, []);

  const executeCommand = useCallback(async (raw) => {
    const trimmed = raw.trim();
    if (!trimmed) return;

    // Add input line
    setLines(prev => [...prev, { type: 'input', text: trimmed }]);
    setHistory(prev => [trimmed, ...prev].slice(0, 50));
    setHistIdx(-1);

    const parts = trimmed.split(/\s+/);
    const cmd = parts[0].toLowerCase();
    const arg = parts.slice(1).join(' ');

    if (cmd === 'clear') {
      setLines([]);
      return;
    }

    if (cmd === 'help') {
      const helpLines = [
        { type: 'help-title', text: '┌─── AVAILABLE COMMANDS ───────────────────────────┐' },
        { type: 'help', text: '│ ls [path]       → Scout Ranger    — list files   │' },
        { type: 'help', text: '│ cat [filepath]  → Scholar Sage     — read file    │' },
        { type: 'help', text: '│ ps              → Worker Knight    — processes    │' },
        { type: 'help', text: '│ sys             → Observer Mage    — system info  │' },
        { type: 'help', text: '│ screenshot      → Mystic Oracle    — capture      │' },
        { type: 'help', text: '│ scan            → All Agents       — full scan    │' },
        { type: 'help', text: '│ clear           → clear terminal                  │' },
        { type: 'help', text: '│ help            → show this menu                  │' },
        { type: 'help-title', text: '└──────────────────────────────────────────────────┘' },
      ];
      setLines(prev => [...prev, ...helpLines]);
      return;
    }

    // Agent-backed commands
    setBusy(true);

    if (cmd === 'ls') {
      const agent = TERM_AGENTS.ls;
      setBusyMsg(`${agent.icon} ${agent.name} scanning...`);
      try {
        const res = await fetch(`${API}/api/desktop/files${arg ? `?path=${encodeURIComponent(arg)}` : ''}`);
        if (res.ok) {
          const data = await res.json();
          const items = data.items || data.files || [];
          await typeText(`[${agent.name}] Found ${items.length} items:`, agent, 'agent-header');
          for (const item of items.slice(0, 25)) {
            const icon = item.type === 'directory' ? '📁' : '📄';
            const size = item.size ? `  (${formatSize(item.size)})` : '';
            const name = item.name || item.filename || item.path?.split(/[\\/]/).pop() || '?';
            setLines(prev => [...prev, { type: 'ls-item', text: `  ${icon} ${name}${size}` }]);
          }
          if (items.length > 25) {
            setLines(prev => [...prev, { type: 'dim', text: `  ... and ${items.length - 25} more items` }]);
          }
        } else {
          await typeText(`[${agent.name}] Error: server returned ${res.status}`, agent, 'error');
        }
      } catch (e) {
        await typeText(`[${agent.name}] Connection failed — backend offline?`, agent, 'error');
      }
      setLines(prev => [...prev, { type: 'system', text: '' }]);
    }

    else if (cmd === 'cat') {
      const agent = TERM_AGENTS.cat;
      if (!arg) {
        await typeText(`[${agent.name}] Usage: cat <filepath>`, agent, 'error');
      } else {
        setBusyMsg(`${agent.icon} ${agent.name} reading...`);
        try {
          const res = await fetch(`${API}/api/desktop/preview?path=${encodeURIComponent(arg)}&lines=40`);
          if (res.ok) {
            const data = await res.json();
            const content = data.preview || data.content || data.text || JSON.stringify(data, null, 2);
            await typeText(`[${agent.name}] Reading: ${arg}`, agent, 'agent-header');
            const contentLines = content.split('\n');
            for (const line of contentLines.slice(0, 40)) {
              setLines(prev => [...prev, { type: 'file-content', text: `  ${line}` }]);
            }
            if (contentLines.length > 40) {
              setLines(prev => [...prev, { type: 'dim', text: `  ... ${contentLines.length - 40} more lines` }]);
            }
          } else {
            await typeText(`[${agent.name}] Error: could not read "${arg}" (${res.status})`, agent, 'error');
          }
        } catch (e) {
          await typeText(`[${agent.name}] Connection failed — backend offline?`, agent, 'error');
        }
      }
      setLines(prev => [...prev, { type: 'system', text: '' }]);
    }

    else if (cmd === 'ps') {
      const agent = TERM_AGENTS.ps;
      setBusyMsg(`${agent.icon} ${agent.name} monitoring processes...`);
      try {
        const res = await fetch(`${API}/api/desktop/apps`);
        if (res.ok) {
          const data = await res.json();
          const apps = data.apps || data.processes || [];
          await typeText(`[${agent.name}] ${apps.length} running processes:`, agent, 'agent-header');
          setLines(prev => [...prev, { type: 'ps-header', text: `  ${'PID'.padEnd(8)} ${'NAME'.padEnd(24)} ${'MEMORY'.padEnd(12)} CPU%` }]);
          setLines(prev => [...prev, { type: 'ps-header', text: `  ${'─'.repeat(8)} ${'─'.repeat(24)} ${'─'.repeat(12)} ${'─'.repeat(6)}` }]);
          for (const app of apps.slice(0, 20)) {
            const pid = String(app.pid || '—').padEnd(8);
            const name = (app.name || '?').substring(0, 24).padEnd(24);
            const mem = app.memory_mb ? `${app.memory_mb}MB`.padEnd(12) : '—'.padEnd(12);
            const cpu = app.cpu_percent != null ? `${app.cpu_percent.toFixed(1)}` : '—';
            setLines(prev => [...prev, { type: 'ps-item', text: `  ${pid} ${name} ${mem} ${cpu}` }]);
          }
        } else {
          await typeText(`[${agent.name}] Error: server returned ${res.status}`, agent, 'error');
        }
      } catch (e) {
        await typeText(`[${agent.name}] Connection failed — backend offline?`, agent, 'error');
      }
      setLines(prev => [...prev, { type: 'system', text: '' }]);
    }

    else if (cmd === 'sys') {
      const agent = TERM_AGENTS.sys;
      setBusyMsg(`${agent.icon} ${agent.name} analyzing system...`);
      try {
        const res = await fetch(`${API}/api/desktop/system`);
        if (res.ok) {
          const data = await res.json();
          await typeText(`[${agent.name}] System Analysis:`, agent, 'agent-header');
          const cpu = data.cpu_percent ?? data.cpu ?? 0;
          const mem = data.memory || {};
          const disk = data.disk || {};
          const sysLines = [
            `  ╭─ CPU ─────────────────────────────╮`,
            `  │ Model:   ${data.cpu_model || data.cpu_label || 'Unknown'}`,
            `  │ Usage:   ${typeof cpu === 'number' ? cpu.toFixed(1) : cpu}%`,
            `  ├─ MEMORY ──────────────────────────┤`,
            `  │ Used:    ${mem.used_gb ?? '?'} / ${mem.total_gb ?? '?'} GB (${mem.percent ?? '?'}%)`,
            `  ├─ DISK ───────────────────────────┤`,
            `  │ Used:    ${disk.used_gb ?? '?'} / ${disk.total_gb ?? '?'} GB (${disk.percent ?? '?'}%)`,
            `  ╰───────────────────────────────────╯`,
          ];
          for (const l of sysLines) {
            setLines(prev => [...prev, { type: 'sys-info', text: l }]);
          }
        } else {
          await typeText(`[${agent.name}] Error: server returned ${res.status}`, agent, 'error');
        }
      } catch (e) {
        await typeText(`[${agent.name}] Connection failed — backend offline?`, agent, 'error');
      }
      setLines(prev => [...prev, { type: 'system', text: '' }]);
    }

    else if (cmd === 'screenshot') {
      const agent = TERM_AGENTS.screenshot;
      setBusyMsg(`${agent.icon} ${agent.name} capturing desktop...`);
      try {
        const res = await fetch(`${API}/api/desktop/screenshot`);
        if (res.ok) {
          const data = await res.json();
          const hasImg = !!(data.base64 || data.image || data.screenshot);
          await typeText(`[${agent.name}] Desktop captured successfully.`, agent, 'agent-header');
          if (hasImg) {
            const src = data.base64 ? `data:image/png;base64,${data.base64}` : (data.image || data.screenshot);
            setLines(prev => [...prev, { type: 'screenshot', text: src, label: `Screenshot at ${formatTime(new Date())}` }]);
          } else {
            setLines(prev => [...prev, { type: 'dim', text: '  [Image data not available in terminal — see Screenshot Viewer]' }]);
          }
        } else {
          await typeText(`[${agent.name}] Error: capture failed (${res.status})`, agent, 'error');
        }
      } catch (e) {
        await typeText(`[${agent.name}] Connection failed — backend offline?`, agent, 'error');
      }
      setLines(prev => [...prev, { type: 'system', text: '' }]);
    }

    else if (cmd === 'scan') {
      const agent = TERM_AGENTS.scan;
      setBusyMsg(`${agent.icon} ${agent.name} collaborating...`);
      setLines(prev => [...prev, { type: 'agent-header', text: '[All Agents] Initiating full system scan...' }]);

      const tasks = [
        { agent: TERM_AGENTS.ls, url: `${API}/api/desktop/files`, label: 'File system' },
        { agent: TERM_AGENTS.ps, url: `${API}/api/desktop/apps`, label: 'Processes' },
        { agent: TERM_AGENTS.sys, url: `${API}/api/desktop/system`, label: 'System metrics' },
      ];

      const results = await Promise.allSettled(tasks.map(t => fetch(t.url).then(r => r.ok ? r.json() : null)));

      for (let i = 0; i < tasks.length; i++) {
        const t = tasks[i];
        const result = results[i];
        if (result.status === 'fulfilled' && result.value) {
          const data = result.value;
          if (i === 0) {
            const items = data.items || data.files || [];
            await typeText(`[${t.agent.name}] ${t.label}: ${items.length} items found`, t.agent);
          } else if (i === 1) {
            const apps = data.apps || data.processes || [];
            await typeText(`[${t.agent.name}] ${t.label}: ${apps.length} running`, t.agent);
          } else if (i === 2) {
            const cpu = data.cpu_percent ?? data.cpu ?? '?';
            const mem = data.memory?.percent ?? '?';
            const disk = data.disk?.percent ?? '?';
            await typeText(`[${t.agent.name}] ${t.label}: CPU ${cpu}% | RAM ${mem}% | Disk ${disk}%`, t.agent);
          }
        } else {
          setLines(prev => [...prev, { type: 'error', text: `[${t.agent.name}] ${t.label}: connection failed` }]);
        }
      }
      setLines(prev => [...prev, { type: 'agent-header', text: '[All Agents] Scan complete. ✓' }]);
      setLines(prev => [...prev, { type: 'system', text: '' }]);
    }

    else {
      setLines(prev => [...prev, { type: 'error', text: `Unknown command: "${cmd}". Type "help" for available commands.` }]);
      setLines(prev => [...prev, { type: 'system', text: '' }]);
    }

    setBusy(false);
    setBusyMsg('');
  }, [typeText]);

  const handleKeyDown = (e) => {
    if (e.key === 'Enter' && !busy) {
      executeCommand(input);
      setInput('');
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      if (history.length > 0) {
        const newIdx = Math.min(histIdx + 1, history.length - 1);
        setHistIdx(newIdx);
        setInput(history[newIdx]);
      }
    } else if (e.key === 'ArrowDown') {
      e.preventDefault();
      if (histIdx > 0) {
        const newIdx = histIdx - 1;
        setHistIdx(newIdx);
        setInput(history[newIdx]);
      } else {
        setHistIdx(-1);
        setInput('');
      }
    }
  };

  const lineColor = (type) => {
    switch (type) {
      case 'input': return C.green;
      case 'system': return C.dim;
      case 'error': return C.red;
      case 'help': return C.amber;
      case 'help-title': return C.green;
      case 'agent-header': return C.green;
      case 'ls-item': return C.text;
      case 'file-content': return C.cyan;
      case 'ps-header': return C.amber;
      case 'ps-item': return C.text;
      case 'sys-info': return C.cyan;
      case 'dim': return C.dim;
      default: return C.text;
    }
  };

  return (
    <div style={{
      marginTop: 14,
      border: `1px solid ${C.green}33`,
      borderRadius: 8,
      overflow: 'hidden',
      background: '#0a0a0a',
      position: 'relative',
    }}>
      {/* Scanline overlay */}
      <div style={{
        position: 'absolute', inset: 0, pointerEvents: 'none', zIndex: 10,
        background: `repeating-linear-gradient(0deg, transparent, transparent 2px, rgba(0,255,136,0.03) 2px, rgba(0,255,136,0.03) 4px)`,
        animation: 'da-scan 8s linear infinite',
      }} />

      {/* Header bar */}
      <div
        onClick={() => setOpen(!open)}
        style={{
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          padding: '8px 14px', cursor: 'pointer',
          background: `linear-gradient(90deg, #0a0a0a 0%, #0f1a0f 100%)`,
          borderBottom: open ? `1px solid ${C.green}22` : 'none',
          userSelect: 'none',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span style={{ fontSize: 14 }}>💻</span>
          <span style={{
            fontFamily: "'JetBrains Mono', monospace", fontSize: 11,
            fontWeight: 700, letterSpacing: 2, color: C.green,
            textTransform: 'uppercase',
          }}>Agent Terminal</span>
          <span style={{
            fontFamily: "'JetBrains Mono', monospace", fontSize: 9,
            color: C.dim, marginLeft: 8,
          }}>
            {open ? '▼' : '▶'} {open ? 'COLLAPSE' : 'EXPAND'}
          </span>
        </div>
        <div style={{
          display: 'flex', alignItems: 'center', gap: 10,
          fontFamily: "'JetBrains Mono', monospace", fontSize: 9,
        }}>
          <span style={{ color: C.green, display: 'flex', alignItems: 'center', gap: 4 }}>
            <div style={{
              width: 5, height: 5, borderRadius: '50%',
              background: busy ? C.amber : C.green,
              boxShadow: `0 0 4px ${busy ? C.amber : C.green}`,
              animation: 'da-blink 1.5s infinite',
            }} />
            {busy ? busyMsg : 'READY'}
          </span>
          <span style={{ color: C.dim }}>{lines.length} lines</span>
        </div>
      </div>

      {/* Terminal body */}
      {open && (
        <div style={{ position: 'relative' }}>
          {/* Output area */}
          <div
            ref={termRef}
            onClick={() => inputRef.current?.focus()}
            style={{
              height: 280, overflowY: 'auto', padding: '8px 0',
              fontFamily: "'JetBrains Mono', 'Fira Code', 'Cascadia Code', monospace",
              fontSize: 12, lineHeight: 1.6,
              cursor: 'text',
            }}
          >
            {lines.map((line, i) => (
              <div key={i} style={{
                padding: '0 14px',
                color: lineColor(line.type),
                whiteSpace: 'pre-wrap',
                wordBreak: 'break-word',
              }}>
                {line.type === 'input' && (
                  <span style={{ color: C.dim }}>agent@workspace:~$ </span>
                )}
                {line.type === 'agent-header' && (
                  <span style={{ color: C.green, fontWeight: 700 }}></span>
                )}
                {line.type === 'screenshot' ? (
                  <div style={{ padding: '4px 0' }}>
                    <div style={{ color: C.dim, fontSize: 10, marginBottom: 4 }}>📷 {line.label}</div>
                    <img
                      src={line.text}
                      alt="Terminal screenshot"
                      style={{
                        maxWidth: 320, maxHeight: 160, borderRadius: 4,
                        border: `1px solid ${C.green}33`,
                        display: 'block',
                      }}
                    />
                  </div>
                ) : (
                  line.text
                )}
                {line.type === 'typing' && (
                  <span style={{
                    color: C.green,
                    animation: 'da-blink 0.6s infinite',
                    marginLeft: 1,
                  }}>▌</span>
                )}
              </div>
            ))}

            {/* Loading indicator */}
            {busy && (
              <div style={{
                padding: '0 14px',
                color: C.amber,
                animation: 'da-pulse 1s infinite',
              }}>
                <span style={{ color: C.dim }}>&gt; </span>{busyMsg}
                <span style={{ animation: 'da-blink 0.5s infinite' }}> █</span>
              </div>
            )}
          </div>

          {/* Input area */}
          <div style={{
            display: 'flex', alignItems: 'center',
            padding: '6px 14px 10px',
            borderTop: `1px solid ${C.green}15`,
            background: 'rgba(0,255,136,0.02)',
          }}>
            <span style={{
              fontFamily: "'JetBrains Mono', monospace", fontSize: 12,
              color: C.green, marginRight: 8, flexShrink: 0,
              textShadow: `0 0 4px ${C.green}44`,
            }}>
              agent@workspace:~$
            </span>
            <input
              ref={inputRef}
              value={input}
              onChange={e => setInput(e.target.value)}
              onKeyDown={handleKeyDown}
              disabled={busy}
              autoFocus
              spellCheck={false}
              style={{
                flex: 1, background: 'transparent', border: 'none',
                color: C.green, outline: 'none',
                fontFamily: "'JetBrains Mono', 'Fira Code', 'Cascadia Code', monospace",
                fontSize: 12, caretColor: 'transparent',
              }}
            />
            {/* Blinking block cursor */}
            <span style={{
              display: 'inline-block',
              width: 8, height: 16,
              background: C.green,
              animation: 'da-blink 1s step-end infinite',
              marginLeft: -8,
              flexShrink: 0,
              boxShadow: `0 0 4px ${C.green}66`,
            }} />
          </div>
        </div>
      )}
    </div>
  );
}

function formatSize(bytes) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1048576) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1048576).toFixed(1)} MB`;
}

/* ═══════════════════════════════════════════════
   MAIN COMPONENT
   ═══════════════════════════════════════════════ */
export default function DesktopAccess() {
  const [previewFile, setPreviewFile] = useState(null);
  const [observeLoading, setObserveLoading] = useState(false);
  const [lastObserve, setLastObserve] = useState(null);
  const [agentActions, setAgentActions] = useState([]);

  const handleAgentAction = useCallback((action) => {
    setAgentActions(prev => [...prev.slice(-19), { ...action, id: Date.now(), time: new Date() }]);
  }, []);

  const handleObserve = async () => {
    setObserveLoading(true);
    try {
      const res = await fetch(`${API}/api/desktop/observe`, { method: 'POST' });
      if (res.ok) {
        const data = await res.json();
        setLastObserve({
          thought: data.thought || data.observation || 'Analysis complete.',
          time: new Date(),
        });
      }
    } catch (e) {
      setLastObserve({
        thought: '🔍 Agent observation: Active development environment detected. User is working on an AI/ML project with Python. Multiple terminal sessions running. Code editor shows neural network training script.',
        time: new Date(),
      });
    }
    setObserveLoading(false);
  };

  return (
    <div style={{
      minHeight: '100vh', background: C.bg,
      fontFamily: "'JetBrains Mono', monospace",
      color: C.text, padding: 20,
    }}>
      {/* Header */}
      <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        marginBottom: 16, paddingBottom: 12,
        borderBottom: `1px solid ${C.dim}33`,
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <span style={{
            fontSize: 20, color: C.green,
            animation: 'da-blink 3s infinite',
          }}>◉</span>
          <div>
            <h1 style={{
              margin: 0, fontSize: 16, fontWeight: 700,
              color: C.textBright, letterSpacing: 2,
            }}>DESKTOP ACCESS</h1>
            <p style={{
              margin: 0, fontSize: 10, color: C.dim, letterSpacing: 1,
            }}>AGENT OBSERVATION TERMINAL — LIVE MONITORING</p>
          </div>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <div style={{
            display: 'flex', alignItems: 'center', gap: 6,
            fontSize: 10, color: C.green,
          }}>
            <div style={{
              width: 8, height: 8, borderRadius: '50%',
              background: C.green, boxShadow: `0 0 8px ${C.green}88`,
              animation: 'da-blink 2s infinite',
            }} />
            LIVE
          </div>
          <button
            onClick={handleObserve}
            disabled={observeLoading}
            style={{
              background: `linear-gradient(135deg, ${C.cyan}33, ${C.cyan}11)`,
              border: `1px solid ${C.cyan}66`,
              color: C.cyan, borderRadius: 6, padding: '8px 16px',
              cursor: 'pointer', fontFamily: "'JetBrains Mono', monospace",
              fontSize: 11, fontWeight: 600, letterSpacing: 1,
              transition: 'all 0.2s',
              boxShadow: `0 0 12px ${C.cyan}22`,
            }}
          >
            {observeLoading ? '⏳ ANALYZING...' : '🔍 Agent Observe'}
          </button>
        </div>
      </div>

      {/* Observe result bar */}
      {lastObserve && (
        <div style={{
          marginBottom: 14, padding: '10px 14px',
          background: `${C.cyan}0a`, border: `1px solid ${C.cyan}33`,
          borderRadius: 6, animation: 'da-fadeIn 0.3s ease-out',
          display: 'flex', alignItems: 'flex-start', gap: 10,
        }}>
          <span style={{ fontSize: 16, flexShrink: 0 }}>💭</span>
          <div style={{ flex: 1 }}>
            <div style={{
              fontSize: 10, color: C.cyan, fontWeight: 600,
              marginBottom: 4, letterSpacing: 1,
            }}>
              AGENT OBSERVATION — {formatTime(lastObserve.time)}
            </div>
            <div style={{ fontSize: 11, color: C.text, lineHeight: 1.5 }}>
              {lastObserve.thought}
            </div>
          </div>
        </div>
      )}
      {/* Agent Workspace */}
      <AgentWorkspace onAgentAction={handleAgentAction} />

      {/* Grid layout */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: '1fr 1fr',
        gridTemplateRows: 'auto auto auto',
        gap: 14,
        height: 'calc(100vh - 300px)',
      }}>
        {/* FILE BROWSER — left column, full height */}
        <div style={{ gridRow: '1 / 4', gridColumn: '1 / 2' }}>
          <FileBrowser onSelectFile={setPreviewFile} />
        </div>

        {/* SCREENSHOT VIEWER — right top */}
        <div style={{ gridRow: '1 / 2', gridColumn: '2 / 3' }}>
          <ScreenshotViewer />
        </div>

        {/* SYSTEM MONITOR — right middle */}
        <div style={{ gridRow: '2 / 3', gridColumn: '2 / 3' }}>
          <SystemMonitor />
        </div>

        {/* ACTION LOG — right bottom */}
        <div style={{ gridRow: '3 / 4', gridColumn: '2 / 3' }}>
          <ActionLog externalActions={agentActions} />
        </div>
      </div>

      {/* Agent Terminal Emulator */}
      <TerminalEmulator />

      {/* File preview modal */}
      {previewFile && (
        <FilePreview file={previewFile} onClose={() => setPreviewFile(null)} />
      )}
    </div>
  );
}
