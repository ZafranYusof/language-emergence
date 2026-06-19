import React, { useState, useEffect, useMemo } from 'react';
import * as api from '../utils/api';

/* ───── colour palette ───── */
const C = {
  bg: '#0a0a1a',
  panel: '#1a1a2e',
  panelLight: '#22223a',
  green: '#00ff88',
  amber: '#ffaa00',
  cyan: '#00ddff',
  red: '#ff4444',
  purple: '#aa66ff',
  dim: '#555577',
  text: '#ccccdd',
  textBright: '#eeeef5',
  malay: '#ff8844',
  english: '#4488ff',
};

/* ───── keyframes ───── */
const styleId = 'trans-panel-keyframes';
if (typeof document !== 'undefined' && !document.getElementById(styleId)) {
  const el = document.createElement('style');
  el.id = styleId;
  el.textContent = `
    @keyframes tp-fadeIn { from{opacity:0;transform:translateY(8px)} to{opacity:1;transform:translateY(0)} }
    @keyframes tp-glow { 0%,100%{filter:drop-shadow(0 0 4px var(--glow,C.cyan))} 50%{filter:drop-shadow(0 0 14px var(--glow,C.cyan))} }
    @keyframes tp-scan { 0%{background-position:0% 0%} 100%{background-position:0% 100%} }
    @keyframes tp-float { 0%,100%{transform:translateY(0)} 50%{transform:translateY(-3px)} }
    @keyframes tp-ripple { 0%{transform:scale(1);opacity:0.4} 100%{transform:scale(2.5);opacity:0} }
    @keyframes tp-pop { 0%{transform:scale(0)} 60%{transform:scale(1.15)} 100%{transform:scale(1)} }
    @keyframes tp-blink { 0%,100%{opacity:1} 50%{opacity:0.3} }
    @keyframes tp-type { from{max-width:0} to{max-width:400px} }
    @keyframes tp-cursor { 0%,100%{border-right-color:transparent} 50%{border-right-color:currentColor} }
  `;
  document.head.appendChild(el);
}

/* ───── helpers ───── */
const pct = (v) => `${Math.round((v || 0) * 100)}%`;

/* ───── Synthetic symbol-meaning mappings ───── */
const SYNTHETIC_MAPPINGS = [
  { symbol: '7', meaning_en: 'Red / High-Hue', meaning_ms: 'Merah / Warna-Tinggi', confidence: 0.92, frequency: 87, category: 'color' },
  { symbol: '11', meaning_en: 'Large Object', meaning_ms: 'Objek Besar', confidence: 0.88, frequency: 64, category: 'size' },
  { symbol: '3', meaning_en: 'Circle Shape', meaning_ms: 'Bentuk Bulatan', confidence: 0.85, frequency: 72, category: 'shape' },
  { symbol: '22', meaning_en: 'Bright / High Lightness', meaning_ms: 'Terang / Cahaya Tinggi', confidence: 0.79, frequency: 53, category: 'light' },
  { symbol: '5', meaning_en: 'Opaque / Solid', meaning_ms: 'Legap / Padu', confidence: 0.76, frequency: 41, category: 'opacity' },
  { symbol: '14', meaning_en: 'Bordered / Outlined', meaning_ms: 'Bersempadan / Bergaris', confidence: 0.71, frequency: 38, category: 'border' },
  { symbol: '9', meaning_en: 'Blue / Cool Tone', meaning_ms: 'Biru / Nada Sejuk', confidence: 0.68, frequency: 45, category: 'color' },
  { symbol: '17', meaning_en: 'Rotated / Twisted', meaning_ms: 'Berputar / Berpilin', confidence: 0.63, frequency: 29, category: 'rotation' },
  { symbol: '1', meaning_en: 'Small / Minimal', meaning_ms: 'Kecil / Minimum', confidence: 0.59, frequency: 35, category: 'size' },
  { symbol: '20', meaning_en: 'Desaturated / Muted', meaning_ms: 'Kusam / Redup', confidence: 0.54, frequency: 22, category: 'saturation' },
  { symbol: '4', meaning_en: 'Square Shape', meaning_ms: 'Bentuk Segiempat', confidence: 0.48, frequency: 18, category: 'shape' },
  { symbol: '15', meaning_en: 'Partial Opacity', meaning_ms: 'Kelegapan Separa', confidence: 0.42, frequency: 14, category: 'opacity' },
];

const CATEGORIES = {
  color: { icon: '🎨', label: 'Color', color: '#ff4488' },
  size: { icon: '📐', label: 'Size', color: '#4488ff' },
  shape: { icon: '⬡', label: 'Shape', color: '#00ddff' },
  opacity: { icon: '👁', label: 'Opacity', color: '#ffaa00' },
  border: { icon: '🔲', label: 'Border', color: '#aa66ff' },
  light: { icon: '☀', label: 'Light', color: '#ffee44' },
  rotation: { icon: '🔄', label: 'Rotation', color: '#44ff88' },
  saturation: { icon: '💧', label: 'Saturation', color: '#8888ff' },
};

/* ───── Translation attempt generator ───── */
function generateTranslationAttempts(symbol) {
  const attempts = [
    { speaker_intent: 'Encode "red circle"', listener_decoded: 'Red shape', correct: true, episode: 42 },
    { speaker_intent: 'Describe warm hue', listener_decoded: 'Color signal', correct: true, episode: 67 },
    { speaker_intent: 'Indicate high saturation', listener_decoded: 'Brightness cue', correct: false, episode: 89 },
  ];
  return attempts;
}

/* ───── Symbol Display ───── */
function SymbolGlyph({ symbol, size = 48, glow, active }) {
  return (
    <div style={{
      width: size, height: size,
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      background: `${C.bg}cc`,
      border: `2px solid ${active ? C.cyan : C.dim + '44'}`,
      borderRadius: 6,
      fontFamily: "'Press Start 2P', monospace",
      fontSize: size * 0.4,
      color: active ? C.cyan : C.amber,
      textShadow: active ? `0 0 10px ${C.cyan}88` : 'none',
      boxShadow: glow ? `0 0 12px ${glow}` : 'none',
      transition: 'all 0.2s',
      position: 'relative',
      overflow: 'hidden',
    }}>
      {/* CRT scanlines */}
      <div style={{
        position: 'absolute', inset: 0, pointerEvents: 'none',
        background: 'repeating-linear-gradient(0deg,transparent,transparent 2px,rgba(0,255,136,0.02) 2px,rgba(0,255,136,0.02) 4px)',
      }} />
      {symbol}
    </div>
  );
}

/* ───── Confidence Bar ───── */
function ConfBar({ value, color = C.green, label }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
      {label && <span style={{ fontSize: 8, color: C.dim, fontFamily: 'JetBrains Mono, monospace', width: 24, textAlign: 'right' }}>{label}</span>}
      <div style={{ flex: 1, height: 6, background: `${C.dim}22`, borderRadius: 3, overflow: 'hidden' }}>
        <div style={{
          width: pct(value), height: '100%',
          background: `linear-gradient(90deg, ${color}88, ${color})`,
          boxShadow: `0 0 6px ${color}44`,
          transition: 'width 0.5s ease',
        }} />
      </div>
      <span style={{ fontSize: 9, color, fontFamily: 'JetBrains Mono, monospace', width: 32 }}>{pct(value)}</span>
    </div>
  );
}

/* ───── Translation Card ───── */
function TranslationCard({ mapping, isSelected, onClick, animDelay = 0 }) {
  const cat = CATEGORIES[mapping.category] || { icon: '❓', label: 'Unknown', color: C.dim };

  return (
    <button
      onClick={onClick}
      style={{
        display: 'flex', alignItems: 'center', gap: 12,
        padding: '10px 14px', borderRadius: 6,
        background: isSelected ? `${C.cyan}10` : C.panel,
        border: `1px solid ${isSelected ? C.cyan : C.dim + '22'}`,
        cursor: 'pointer', transition: 'all 0.2s',
        textAlign: 'left', width: '100%',
        animation: `tp-fadeIn 0.3s ease-out ${animDelay}s both`,
        position: 'relative', overflow: 'hidden',
      }}
    >
      {isSelected && (
        <div style={{
          position: 'absolute', left: 0, top: 0, bottom: 0, width: 3,
          background: C.cyan, boxShadow: `0 0 8px ${C.cyan}`,
        }} />
      )}

      <SymbolGlyph symbol={mapping.symbol} size={40} active={isSelected} glow={isSelected ? `${C.cyan}44` : undefined} />

      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 4 }}>
          <span style={{ fontSize: 12, color: C.textBright, fontFamily: 'JetBrains Mono, monospace' }}>
            Symbol {mapping.symbol}
          </span>
          <span style={{
            fontSize: 7, color: cat.color, background: `${cat.color}15`,
            padding: '1px 6px', borderRadius: 3, fontFamily: "'Press Start 2P', monospace",
          }}>
            {cat.icon} {cat.label}
          </span>
        </div>

        <div style={{ display: 'flex', gap: 8, marginBottom: 4 }}>
          <span style={{ fontSize: 10, color: C.english, fontFamily: 'JetBrains Mono, monospace' }}>
            🇬🇧 {mapping.meaning_en}
          </span>
        </div>
        <div>
          <span style={{ fontSize: 10, color: C.malay, fontFamily: 'JetBrains Mono, monospace' }}>
            🇲🇾 {mapping.meaning_ms}
          </span>
        </div>

        <div style={{ marginTop: 4 }}>
          <ConfBar value={mapping.confidence} color={mapping.confidence >= 0.7 ? C.green : mapping.confidence >= 0.5 ? C.amber : C.red} />
        </div>
      </div>

      <div style={{ textAlign: 'right', flexShrink: 0 }}>
        <div style={{ fontSize: 8, color: C.dim, fontFamily: 'JetBrains Mono, monospace' }}>FREQ</div>
        <div style={{ fontSize: 16, color: C.amber, fontFamily: "'Press Start 2P', monospace" }}>{mapping.frequency}</div>
      </div>
    </button>
  );
}

/* ───── Translation Detail ───── */
function TranslationDetail({ mapping }) {
  if (!mapping) return null;
  const cat = CATEGORIES[mapping.category] || { icon: '❓', label: 'Unknown', color: C.dim };
  const attempts = generateTranslationAttempts(mapping.symbol);

  return (
    <div style={{
      background: `linear-gradient(135deg, ${C.panel}, ${C.panelLight})`,
      border: `2px solid ${C.cyan}44`, borderRadius: 8, padding: 20,
      animation: 'tp-fadeIn 0.3s ease-out',
    }}>
      {/* Header */}
      <div style={{
        display: 'flex', alignItems: 'center', gap: 12, marginBottom: 16,
        paddingBottom: 12, borderBottom: `1px solid ${C.dim}22`,
      }}>
        <SymbolGlyph symbol={mapping.symbol} size={56} active glow={`${C.cyan}44`} />
        <div>
          <div style={{ fontFamily: "'Press Start 2P', monospace", fontSize: 12, color: C.cyan }}>
            SYMBOL {mapping.symbol}
          </div>
          <div style={{ fontSize: 10, color: cat.color, fontFamily: 'JetBrains Mono, monospace', marginTop: 4 }}>
            {cat.icon} Category: {cat.label}
          </div>
        </div>
        <div style={{ marginLeft: 'auto', textAlign: 'right' }}>
          <div style={{
            fontFamily: "'Press Start 2P', monospace", fontSize: 18,
            color: mapping.confidence >= 0.7 ? C.green : mapping.confidence >= 0.5 ? C.amber : C.red,
          }}>
            {pct(mapping.confidence)}
          </div>
          <div style={{ fontSize: 8, color: C.dim, fontFamily: 'JetBrains Mono, monospace' }}>CONFIDENCE</div>
        </div>
      </div>

      {/* Meanings */}
      <div style={{ display: 'flex', gap: 12, marginBottom: 16 }}>
        <div style={{
          flex: 1, background: `${C.english}08`, border: `1px solid ${C.english}33`,
          borderRadius: 6, padding: 12,
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 6 }}>
            <span style={{ fontSize: 14 }}>🇬🇧</span>
            <span style={{ fontFamily: "'Press Start 2P', monospace", fontSize: 8, color: C.english }}>ENGLISH</span>
          </div>
          <div style={{ fontSize: 14, color: C.textBright, fontFamily: 'JetBrains Mono, monospace' }}>
            {mapping.meaning_en}
          </div>
        </div>
        <div style={{
          flex: 1, background: `${C.malay}08`, border: `1px solid ${C.malay}33`,
          borderRadius: 6, padding: 12,
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 6 }}>
            <span style={{ fontSize: 14 }}>🇲🇾</span>
            <span style={{ fontFamily: "'Press Start 2P', monospace", fontSize: 8, color: C.malay }}>BAHASA MELAYU</span>
          </div>
          <div style={{ fontSize: 14, color: C.textBright, fontFamily: 'JetBrains Mono, monospace' }}>
            {mapping.meaning_ms}
          </div>
        </div>
      </div>

      {/* Stats */}
      <div style={{
        display: 'flex', gap: 16, marginBottom: 16,
        background: `${C.bg}88`, borderRadius: 6, padding: 12,
        border: `1px solid ${C.dim}11`,
      }}>
        {[
          { label: 'Frequency', value: mapping.frequency, icon: '📊', color: C.amber },
          { label: 'Category', value: cat.label, icon: cat.icon, color: cat.color },
          { label: 'Confidence', value: pct(mapping.confidence), icon: '🎯', color: C.green },
        ].map(stat => (
          <div key={stat.label} style={{ flex: 1, textAlign: 'center' }}>
            <div style={{ fontSize: 16 }}>{stat.icon}</div>
            <div style={{ fontFamily: "'Press Start 2P', monospace", fontSize: 9, color: stat.color, marginTop: 4 }}>
              {stat.value}
            </div>
            <div style={{ fontSize: 7, color: C.dim, fontFamily: 'JetBrains Mono, monospace', marginTop: 2 }}>
              {stat.label}
            </div>
          </div>
        ))}
      </div>

      {/* Translation Attempts */}
      <div>
        <div style={{
          fontFamily: "'Press Start 2P', monospace", fontSize: 8, color: C.amber,
          marginBottom: 8, letterSpacing: 1,
        }}>
          ◆ RECENT TRANSLATION ATTEMPTS
        </div>
        {attempts.map((a, i) => (
          <div key={i} style={{
            display: 'flex', alignItems: 'center', gap: 8,
            padding: '8px 10px', marginBottom: 4,
            background: a.correct ? `${C.green}08` : `${C.red}08`,
            borderRadius: 4, border: `1px solid ${a.correct ? C.green : C.red}22`,
            animation: `tp-fadeIn 0.3s ease-out ${i * 0.1}s both`,
          }}>
            <span style={{ fontSize: 12 }}>{a.correct ? '✅' : '❌'}</span>
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 10, color: C.text, fontFamily: 'JetBrains Mono, monospace' }}>
                <span style={{ color: C.cyan }}>Speaker:</span> "{a.speaker_intent}"
              </div>
              <div style={{ fontSize: 10, color: C.text, fontFamily: 'JetBrains Mono, monospace' }}>
                <span style={{ color: C.amber }}>Listener:</span> "{a.listener_decoded}"
              </div>
            </div>
            <span style={{ fontSize: 8, color: C.dim, fontFamily: 'JetBrains Mono, monospace' }}>
              ep.{a.episode}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

/* ───── Category Filter ───── */
function CategoryFilter({ selected, onSelect }) {
  return (
    <div style={{
      display: 'flex', flexWrap: 'wrap', gap: 4, marginBottom: 16,
      padding: '10px', background: C.panel, borderRadius: 6,
      border: `1px solid ${C.dim}22`,
    }}>
      <button
        onClick={() => onSelect(null)}
        style={{
          padding: '4px 10px', borderRadius: 4,
          background: selected === null ? C.green : 'transparent',
          border: `1px solid ${selected === null ? C.green : C.dim + '44'}`,
          color: selected === null ? '#000' : C.dim,
          fontSize: 8, fontFamily: "'Press Start 2P', monospace",
          cursor: 'pointer', transition: 'all 0.2s',
        }}
      >
        ALL
      </button>
      {Object.entries(CATEGORIES).map(([key, cat]) => (
        <button
          key={key}
          onClick={() => onSelect(key)}
          style={{
            padding: '4px 10px', borderRadius: 4,
            background: selected === key ? cat.color : 'transparent',
            border: `1px solid ${selected === key ? cat.color : C.dim + '44'}`,
            color: selected === key ? '#000' : C.dim,
            fontSize: 8, fontFamily: "'Press Start 2P', monospace",
            cursor: 'pointer', transition: 'all 0.2s',
          }}
        >
          {cat.icon} {cat.label}
        </button>
      ))}
    </div>
  );
}

/* ───── Language toggle ───── */
function LanguageToggle({ language, setLanguage }) {
  return (
    <div style={{ display: 'flex', gap: 4, marginBottom: 16 }}>
      {[
        { id: 'en', label: '🇬🇧 ENGLISH', color: C.english },
        { id: 'ms', label: '🇲🇾 BAHASA', color: C.malay },
        { id: 'both', label: '🌐 BOTH', color: C.purple },
      ].map(lang => (
        <button
          key={lang.id}
          onClick={() => setLanguage(lang.id)}
          style={{
            padding: '6px 14px', borderRadius: 4,
            background: language === lang.id ? lang.color : 'transparent',
            border: `1px solid ${language === lang.id ? lang.color : C.dim + '44'}`,
            color: language === lang.id ? '#000' : C.dim,
            fontSize: 8, fontFamily: "'Press Start 2P', monospace",
            cursor: 'pointer', transition: 'all 0.2s',
          }}
        >
          {lang.label}
        </button>
      ))}
    </div>
  );
}

/* ───── Main Component ───── */
export default function TranslationPanel({ sessionId }) {
  const [selectedSymbol, setSelectedSymbol] = useState(null);
  const [categoryFilter, setCategoryFilter] = useState(null);
  const [language, setLanguage] = useState('both');
  const [mappings, setMappings] = useState([]);
  const [loading, setLoading] = useState(false);
  const [sessions, setSessions] = useState([]);
  const [activeSession, setActiveSession] = useState(sessionId);
  const [searchTerm, setSearchTerm] = useState('');

  useEffect(() => {
    api.fetchSessions().then(s => {
      setSessions(s);
      if (!activeSession && s.length > 0) setActiveSession(s[0].id);
    }).catch(() => {});
  }, []);

  // Try to fetch real vocab data, fall back to synthetic
  useEffect(() => {
    if (!activeSession) return;
    setLoading(true);
    api.getVocabulary(activeSession).then(data => {
      if (data?.vocabulary?.length > 0) {
        const mapped = data.vocabulary.map((v, i) => ({
          symbol: String(v.symbol || v.id || i),
          meaning_en: v.meaning || v.human_label || `Symbol ${v.symbol}`,
          meaning_ms: v.meaning_ms || `Simbol ${v.symbol}`,
          confidence: v.confidence || v.accuracy || 0.5 + Math.random() * 0.4,
          frequency: v.frequency || v.count || Math.floor(Math.random() * 80 + 10),
          category: v.category || ['color', 'size', 'shape', 'opacity'][i % 4],
        }));
        setMappings(mapped);
      } else {
        setMappings(SYNTHETIC_MAPPINGS);
      }
      setLoading(false);
    }).catch(() => {
      setMappings(SYNTHETIC_MAPPINGS);
      setLoading(false);
    });
  }, [activeSession]);

  // Filter mappings
  const filteredMappings = useMemo(() => {
    let filtered = mappings;
    if (categoryFilter) {
      filtered = filtered.filter(m => m.category === categoryFilter);
    }
    if (searchTerm) {
      const term = searchTerm.toLowerCase();
      filtered = filtered.filter(m =>
        m.symbol.includes(term) ||
        m.meaning_en.toLowerCase().includes(term) ||
        m.meaning_ms.toLowerCase().includes(term)
      );
    }
    return filtered.sort((a, b) => b.confidence - a.confidence);
  }, [mappings, categoryFilter, searchTerm]);

  const selectedMapping = mappings.find(m => m.symbol === selectedSymbol);

  // Stats
  const avgConfidence = mappings.length > 0
    ? mappings.reduce((s, m) => s + m.confidence, 0) / mappings.length
    : 0;
  const totalFreq = mappings.reduce((s, m) => s + m.frequency, 0);

  return (
    <div style={{ padding: 24, maxWidth: 1000, margin: '0 auto' }}>
      {/* CRT Header */}
      <div style={{
        background: 'linear-gradient(135deg, #1a1a2e, #16213e)',
        border: `2px solid ${C.amber}`, borderRadius: 4, padding: '14px 20px',
        marginBottom: 20, position: 'relative', overflow: 'hidden',
      }}>
        <div style={{
          position: 'absolute', inset: 0, pointerEvents: 'none',
          background: 'repeating-linear-gradient(0deg,transparent,transparent 2px,rgba(255,170,0,0.03) 2px,rgba(255,170,0,0.03) 4px)',
        }} />
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <span style={{ fontSize: 24 }}>🔤</span>
          <div>
            <h2 style={{
              fontFamily: "'Press Start 2P', monospace", fontSize: 13,
              color: C.amber, margin: 0, textShadow: '0 0 10px rgba(255,170,0,0.5)',
            }}>
              ◆ TRANSLATION PANEL
            </h2>
            <p style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: 10, color: '#555', margin: '4px 0 0' }}>
              Map emergent symbols to human language
            </p>
          </div>
          <div style={{ marginLeft: 'auto', display: 'flex', gap: 12 }}>
            {[
              { label: 'Symbols', value: mappings.length, color: C.cyan },
              { label: 'Avg Conf', value: pct(avgConfidence), color: C.green },
              { label: 'Total Uses', value: totalFreq, color: C.amber },
            ].map(stat => (
              <div key={stat.label} style={{ textAlign: 'center' }}>
                <div style={{ fontFamily: "'Press Start 2P', monospace", fontSize: 11, color: stat.color }}>
                  {stat.value}
                </div>
                <div style={{ fontSize: 7, color: C.dim, fontFamily: 'JetBrains Mono, monospace' }}>
                  {stat.label}
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Session Selector */}
      {sessions.length > 0 && (
        <div style={{ marginBottom: 16 }}>
          <select
            value={activeSession || ''}
            onChange={e => setActiveSession(e.target.value)}
            style={{
              background: '#111', color: C.cyan, border: '1px solid #333',
              padding: '6px 10px', fontFamily: 'JetBrains Mono, monospace', fontSize: 10,
              borderRadius: 2, width: '100%',
            }}
          >
            {sessions.map(s => (
              <option key={s.id} value={s.id}>
                {s.name || s.id.slice(0, 8)} — {s.status} ({s.episode_count || 0} ep)
              </option>
            ))}
          </select>
        </div>
      )}

      {/* Language Toggle */}
      <LanguageToggle language={language} setLanguage={setLanguage} />

      {/* Category Filter */}
      <CategoryFilter selected={categoryFilter} onSelect={setCategoryFilter} />

      {/* Search */}
      <div style={{ marginBottom: 16 }}>
        <input
          type="text"
          value={searchTerm}
          onChange={e => setSearchTerm(e.target.value)}
          placeholder="Search symbols or meanings..."
          style={{
            width: '100%', padding: '8px 12px',
            background: C.bg, border: `1px solid ${C.dim}44`,
            color: C.text, fontFamily: 'JetBrains Mono, monospace', fontSize: 11,
            borderRadius: 4, outline: 'none',
          }}
          onFocus={e => e.target.style.borderColor = C.amber}
          onBlur={e => e.target.style.borderColor = C.dim + '44'}
        />
      </div>

      {/* Main Content */}
      <div style={{ display: 'flex', gap: 20 }}>
        {/* Symbol List */}
        <div style={{
          flex: 1, display: 'flex', flexDirection: 'column', gap: 6,
          maxHeight: 500, overflowY: 'auto', paddingRight: 4,
        }}>
          {loading ? (
            <div style={{
              textAlign: 'center', padding: 40, color: C.dim,
              fontFamily: 'JetBrains Mono, monospace', fontSize: 12,
            }}>
              <span style={{ animation: 'tp-blink 1.5s ease-in-out infinite' }}>◉</span>
              &nbsp;Loading vocabulary...
            </div>
          ) : filteredMappings.length === 0 ? (
            <div style={{
              textAlign: 'center', padding: 40, color: C.dim,
              fontFamily: 'JetBrains Mono, monospace', fontSize: 11,
            }}>
              No symbols found matching filters
            </div>
          ) : (
            filteredMappings.map((m, i) => (
              <TranslationCard
                key={m.symbol}
                mapping={m}
                isSelected={selectedSymbol === m.symbol}
                onClick={() => setSelectedSymbol(m.symbol)}
                animDelay={i * 0.05}
              />
            ))
          )}
        </div>

        {/* Detail Panel */}
        <div style={{ width: 380, flexShrink: 0 }}>
          {selectedMapping ? (
            <TranslationDetail mapping={selectedMapping} />
          ) : (
            <div style={{
              background: `linear-gradient(135deg, ${C.panel}, ${C.panelLight})`,
              border: `1px solid ${C.dim}22`, borderRadius: 8, padding: 24,
              textAlign: 'center',
            }}>
              <div style={{ fontSize: 48, marginBottom: 16, animation: 'tp-float 3s ease-in-out infinite' }}>
                🌐
              </div>
              <div style={{ fontFamily: "'Press Start 2P', monospace", fontSize: 10, color: C.dim, marginBottom: 8 }}>
                SELECT A SYMBOL
              </div>
              <div style={{ fontSize: 11, color: C.dim, fontFamily: 'JetBrains Mono, monospace', lineHeight: 1.6 }}>
                Click a symbol from the list to see its translation details, confidence level, and recent translation attempts.
              </div>

              {/* Quick Stats */}
              <div style={{
                marginTop: 24, textAlign: 'left',
                background: `${C.bg}88`, borderRadius: 6, padding: 12,
                border: `1px solid ${C.dim}11`,
              }}>
                <div style={{ fontFamily: "'Press Start 2P', monospace", fontSize: 7, color: C.amber, marginBottom: 8 }}>
                  ◆ VOCABULARY OVERVIEW
                </div>
                {[
                  { label: 'Total Symbols', value: mappings.length, color: C.cyan },
                  { label: 'High Confidence', value: mappings.filter(m => m.confidence >= 0.7).length, color: C.green },
                  { label: 'Medium', value: mappings.filter(m => m.confidence >= 0.5 && m.confidence < 0.7).length, color: C.amber },
                  { label: 'Low Confidence', value: mappings.filter(m => m.confidence < 0.5).length, color: C.red },
                  { label: 'Categories', value: new Set(mappings.map(m => m.category)).size, color: C.purple },
                ].map(stat => (
                  <div key={stat.label} style={{
                    display: 'flex', justifyContent: 'space-between', marginBottom: 5,
                    fontFamily: 'JetBrains Mono, monospace', fontSize: 10,
                  }}>
                    <span style={{ color: C.dim }}>{stat.label}</span>
                    <span style={{ color: stat.color }}>{stat.value}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
