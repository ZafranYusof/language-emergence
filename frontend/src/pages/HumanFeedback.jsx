import React, { useState, useEffect, useRef, useCallback } from 'react';
import { API_URL } from '../config';
import { ensureSprites, drawSprite, drawSpeechBubble, ParticleSystem, C as PC, SPRITE_NAMES } from '../utils/pixelEngine';

/* ── Colour palette (retro robot theme) ── */
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
};

/* ── Keyframes ── */
const styleId = 'hf-keyframes';
if (typeof document !== 'undefined' && !document.getElementById(styleId)) {
  const el = document.createElement('style');
  el.id = styleId;
  el.textContent = `
    @keyframes hf-fadeIn { from{opacity:0;transform:translateY(8px)} to{opacity:1;transform:translateY(0)} }
    @keyframes hf-glow { 0%,100%{filter:drop-shadow(0 0 4px ${C.green})} 50%{filter:drop-shadow(0 0 14px ${C.green})} }
    @keyframes hf-pulse { 0%,100%{opacity:1} 50%{opacity:0.5} }
    @keyframes hf-bar-grow { from{transform:scaleY(0)} to{transform:scaleY(1)} }
    @keyframes hf-float { 0%,100%{transform:translateY(0)} 50%{transform:translateY(-4px)} }
    @keyframes hf-robot-blink { 0%,90%,100%{transform:scaleY(1)} 95%{transform:scaleY(0.1)} }
  `;
  document.head.appendChild(el);
}

/* ── Star Rating ── */
function StarRating({ value, onChange, size = 24, readonly = false }) {
  const [hover, setHover] = useState(0);
  return (
    <div style={{ display: 'flex', gap: 4 }}>
      {[1, 2, 3, 4, 5].map(star => (
        <button
          key={star}
          onClick={() => !readonly && onChange && onChange(star)}
          onMouseEnter={() => !readonly && setHover(star)}
          onMouseLeave={() => setHover(0)}
          style={{
            background: 'none', border: 'none', cursor: readonly ? 'default' : 'pointer',
            fontSize: size, color: star <= (hover || value) ? C.amber : C.dim,
            textShadow: star <= (hover || value) ? '0 0 8px ' + C.amber + '88' : 'none',
            transition: 'all 0.15s', padding: 0,
            transform: star <= (hover || value) ? 'scale(1.1)' : 'scale(1)',
          }}
          disabled={readonly}
        >
          {'\u2605'}
        </button>
      ))}
    </div>
  );
}

/* ── Bar Chart (CSS-based) ── */
function BarChart({ data, labels, colors }) {
  const max = Math.max(...data, 1);
  return (
    <div style={{ display: 'flex', alignItems: 'flex-end', gap: 6, height: 120 }}>
      {data.map((val, i) => (
        <div key={i} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', flex: 1 }}>
          <span style={{ fontSize: 10, fontFamily: "'JetBrains Mono', monospace", color: C.dim, marginBottom: 4 }}>
            {val}
          </span>
          <div style={{
            width: '100%', height: ((val / max) * 100) + '%', minHeight: 2,
            background: (colors && colors[i]) || C.green,
            borderRadius: '3px 3px 0 0',
            animation: 'hf-bar-grow 0.5s ease-out',
            boxShadow: '0 0 8px ' + ((colors && colors[i]) || C.green) + '44',
          }} />
          <span style={{ fontSize: 10, fontFamily: "'JetBrains Mono', monospace", color: C.text, marginTop: 4 }}>
            {(labels && labels[i]) || i}
          </span>
        </div>
      ))}
    </div>
  );
}

/* ── Progress Bar ── */
function ProgressBar({ value, max = 1, color = C.green, label }) {
  const pct = Math.min(100, Math.round((value / max) * 100));
  return (
    <div style={{ width: '100%' }}>
      {label && (
        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
          <span style={{ fontSize: 11, fontFamily: "'JetBrains Mono', monospace", color: C.dim }}>{label}</span>
          <span style={{ fontSize: 11, fontFamily: "'JetBrains Mono', monospace", color }}>{pct}%</span>
        </div>
      )}
      <div style={{
        width: '100%', height: 8, background: '#111128', borderRadius: 4,
        border: '1px solid ' + C.dim + '33', overflow: 'hidden',
      }}>
        <div style={{
          width: pct + '%', height: '100%', background: 'linear-gradient(90deg, ' + color + '88, ' + color + ')',
          borderRadius: 4, transition: 'width 0.6s ease-out',
          boxShadow: '0 0 8px ' + color + '44',
        }} />
      </div>
    </div>
  );
}

/* ── Panel Wrapper ── */
function Panel({ children, style = {} }) {
  return (
    <div style={{
      background: C.panel,
      border: '1px solid ' + C.dim + '33',
      borderRadius: 8,
      padding: 16,
      animation: 'hf-fadeIn 0.3s ease-out',
      ...style,
    }}>
      {children}
    </div>
  );
}

function PanelTitle({ children, icon }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
      {icon && <span style={{ fontSize: 16 }}>{icon}</span>}
      <h3 style={{
        margin: 0, fontSize: 14, fontFamily: "'JetBrains Mono', monospace",
        color: C.green, textTransform: 'uppercase', letterSpacing: 1,
      }}>
        {children}
      </h3>
    </div>
  );
}

/* ── Robot Avatar ── */
function RobotAvatar({ size = 32, mood = 'neutral' }) {
  const eyeColor = mood === 'happy' ? C.green : mood === 'confused' ? C.amber : C.cyan;
  return (
    <div style={{
      width: size, height: size, borderRadius: 6,
      background: 'linear-gradient(135deg, ' + C.panelLight + ', ' + C.panel + ')',
      border: '2px solid ' + eyeColor + '66',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      position: 'relative', flexShrink: 0,
    }}>
      <div style={{ display: 'flex', gap: size * 0.12 }}>
        <div style={{
          width: size * 0.18, height: size * 0.18, borderRadius: '50%',
          background: eyeColor, boxShadow: '0 0 6px ' + eyeColor,
          animation: 'hf-robot-blink 4s infinite',
        }} />
        <div style={{
          width: size * 0.18, height: size * 0.18, borderRadius: '50%',
          background: eyeColor, boxShadow: '0 0 6px ' + eyeColor,
          animation: 'hf-robot-blink 4s infinite 0.1s',
        }} />
      </div>
      <div style={{
        position: 'absolute', bottom: size * 0.15,
        width: size * 0.35, height: size * 0.08, borderRadius: 2,
        background: eyeColor + '44',
      }} />
    </div>
  );
}

/* ═══════════════════════════════════════════════════ */
/*  RATE CONVERSATIONS TAB                            */
/* ═══════════════════════════════════════════════════ */

function RateConversationsTab() {
  const [sessions, setSessions] = useState([]);
  const [selectedSession, setSelectedSession] = useState('');
  const [conversations, setConversations] = useState([]);
  const [ratings, setRatings] = useState({});
  const [comments, setComments] = useState({});
  const [improvements, setImprovements] = useState({});
  const [stats, setStats] = useState(null);
  const [leaderboard, setLeaderboard] = useState([]);
  const [filterRating, setFilterRating] = useState(0);
  const [loading, setLoading] = useState(false);
  const [submitting, setSubmitting] = useState({});

  useEffect(() => {
    fetch(API_URL + '/sessions')
      .then(function(r) { return r.json(); })
      .then(function(d) {
        var list = d.sessions || [];
        setSessions(list);
        if (list.length > 0) setSelectedSession(list[0].session_id);
      })
      .catch(function() {
        setSessions([{ session_id: '1f7dbc63', name: 'Demo Session' }]);
        setSelectedSession('1f7dbc63');
      });
  }, []);

  useEffect(function() {
    if (!selectedSession) return;
    setLoading(true);
    fetch(API_URL + '/sessions/' + selectedSession + '/conversations?limit=20')
      .then(function(r) { return r.json(); })
      .then(function(d) {
        var convos = (d.data || d.conversations || []).map(function(c, i) {
          return {
            conversation_id: 'conv_' + String(i).padStart(3, '0'),
            episode: c.episode,
            target_index: c.target_index,
            message: c.message,
            reward: c.reward,
            listener_choice: c.listener_choice,
          };
        });
        setConversations(convos);
      })
      .catch(function() {
        setConversations([
          { conversation_id: 'conv_001', episode: 100, target_index: 3, message: [7, 3, 0], reward: 1, listener_choice: 3 },
          { conversation_id: 'conv_002', episode: 150, target_index: 1, message: [11, 5, 2], reward: 0, listener_choice: 4 },
          { conversation_id: 'conv_003', episode: 200, target_index: 7, message: [9, 14, 1], reward: 1, listener_choice: 7 },
          { conversation_id: 'conv_004', episode: 250, target_index: 2, message: [3, 7, 0], reward: 1, listener_choice: 2 },
          { conversation_id: 'conv_005', episode: 300, target_index: 5, message: [22, 17, 5], reward: 0, listener_choice: 8 },
        ]);
      })
      .finally(function() { setLoading(false); });

    fetch(API_URL + '/feedback/stats/' + selectedSession)
      .then(function(r) { return r.json(); })
      .then(function(d) { setStats(d); })
      .catch(function() {});

    fetch(API_URL + '/feedback/history/' + selectedSession)
      .then(function(r) { return r.json(); })
      .then(function(d) {
        var rMap = {};
        (d.ratings || []).forEach(function(r) { rMap[r.conversation_id] = r; });
        setRatings(function(prev) { return Object.assign({}, rMap, prev); });
      })
      .catch(function() {});
  }, [selectedSession]);

  useEffect(function() {
    fetch(API_URL + '/feedback/leaderboard')
      .then(function(r) { return r.json(); })
      .then(function(d) { setLeaderboard(d.leaderboard || []); })
      .catch(function() {});
  }, []);

  var handleSubmitRating = useCallback(function(convId) {
    var rating = ratings[convId];
    if (!rating) return;
    setSubmitting(function(prev) { var n = Object.assign({}, prev); n[convId] = true; return n; });

    fetch(API_URL + '/feedback/rate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        session_id: selectedSession,
        conversation_id: convId,
        rating: rating,
        comment: comments[convId] || '',
        suggested_improvement: improvements[convId] || '',
      }),
    })
    .then(function() {
      return fetch(API_URL + '/feedback/stats/' + selectedSession);
    })
    .then(function(r) { return r.json(); })
    .then(function(statsData) { setStats(statsData); })
    .then(function() { return fetch(API_URL + '/feedback/leaderboard'); })
    .then(function(r) { return r.json(); })
    .then(function(lbData) { setLeaderboard(lbData.leaderboard || []); })
    .catch(function(e) { console.error('Rating submit failed:', e); })
    .finally(function() {
      setSubmitting(function(prev) { var n = Object.assign({}, prev); n[convId] = false; return n; });
    });
  }, [selectedSession, ratings, comments, improvements]);

  var filteredConversations = filterRating > 0
    ? conversations.filter(function(c) { return (ratings[c.conversation_id] || 0) === filterRating; })
    : conversations;

  var distData = stats && stats.distribution ? [1, 2, 3, 4, 5].map(function(i) { return stats.distribution[i] || 0; }) : [0, 0, 0, 0, 0];
  var distColors = ['#ff4444', '#ff8844', '#ffaa00', '#88cc44', '#00ff88'];

  return (
    React.createElement('div', { style: { display: 'flex', flexDirection: 'column', gap: 16 } },
      /* Top row: Controls + Stats */
      React.createElement('div', { style: { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 } },
        /* Controls Panel */
        React.createElement(Panel, null,
          React.createElement(PanelTitle, { icon: '🎯' }, 'Session & Filters'),
          React.createElement('div', { style: { display: 'flex', flexDirection: 'column', gap: 12 } },
            React.createElement('div', null,
              React.createElement('label', { style: { fontSize: 11, fontFamily: "'JetBrains Mono', monospace", color: C.dim, display: 'block', marginBottom: 4 } }, 'SESSION'),
              React.createElement('select', {
                value: selectedSession,
                onChange: function(e) { setSelectedSession(e.target.value); },
                style: { width: '100%', background: '#111128', border: '1px solid ' + C.dim + '44', color: C.text, padding: '8px 10px', borderRadius: 6, fontFamily: "'JetBrains Mono', monospace", fontSize: 12 }
              }, sessions.map(function(s) {
                return React.createElement('option', { key: s.session_id, value: s.session_id }, s.name || s.session_id);
              }))
            ),
            React.createElement('div', null,
              React.createElement('label', { style: { fontSize: 11, fontFamily: "'JetBrains Mono', monospace", color: C.dim, display: 'block', marginBottom: 4 } }, 'FILTER BY RATING'),
              React.createElement('div', { style: { display: 'flex', gap: 6 } },
                [0, 1, 2, 3, 4, 5].map(function(r) {
                  var isActive = filterRating === r;
                  var label = r === 0 ? 'All' : r + '\u2605';
                  return React.createElement('button', {
                    key: r,
                    onClick: function() { setFilterRating(r); },
                    style: {
                      padding: '4px 10px', borderRadius: 4,
                      border: '1px solid ' + (isActive ? C.green : C.dim + '44'),
                      background: isActive ? C.green + '15' : 'transparent',
                      color: isActive ? C.green : C.dim, cursor: 'pointer',
                      fontFamily: "'JetBrains Mono', monospace", fontSize: 11,
                    }
                  }, label);
                })
              )
            )
          )
        ),
        /* Stats Dashboard */
        React.createElement(Panel, null,
          React.createElement(PanelTitle, { icon: '📊' }, 'Feedback Statistics'),
          stats ? React.createElement('div', { style: { display: 'flex', flexDirection: 'column', gap: 16 } },
            React.createElement('div', { style: { display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 12 } },
              React.createElement('div', { style: { textAlign: 'center' } },
                React.createElement('div', { style: { fontSize: 28, fontFamily: "'JetBrains Mono', monospace", color: C.green, fontWeight: 'bold' } }, stats.total_ratings || 0),
                React.createElement('div', { style: { fontSize: 10, color: C.dim, fontFamily: "'JetBrains Mono', monospace" } }, 'TOTAL')
              ),
              React.createElement('div', { style: { textAlign: 'center' } },
                React.createElement('div', { style: { fontSize: 28, fontFamily: "'JetBrains Mono', monospace", color: C.amber, fontWeight: 'bold' } }, stats.average_rating ? stats.average_rating.toFixed(1) : '\u2014'),
                React.createElement('div', { style: { fontSize: 10, color: C.dim, fontFamily: "'JetBrains Mono', monospace" } }, 'AVG \u2605')
              ),
              React.createElement('div', { style: { textAlign: 'center' } },
                React.createElement('div', { style: { fontSize: 28, fontFamily: "'JetBrains Mono', monospace", color: C.cyan, fontWeight: 'bold' } }, stats.reward_model ? (stats.reward_model.composite_reward * 100).toFixed(0) : '\u2014'),
                React.createElement('div', { style: { fontSize: 10, color: C.dim, fontFamily: "'JetBrains Mono', monospace" } }, 'REWARD')
              )
            ),
            React.createElement('div', null,
              React.createElement('div', { style: { fontSize: 11, fontFamily: "'JetBrains Mono', monospace", color: C.dim, marginBottom: 8 } }, 'RATING DISTRIBUTION'),
              React.createElement(BarChart, { data: distData, labels: ['1\u2605', '2\u2605', '3\u2605', '4\u2605', '5\u2605'], colors: distColors })
            )
          ) : React.createElement('div', { style: { color: C.dim, fontSize: 12, fontFamily: "'JetBrains Mono', monospace", textAlign: 'center', padding: 20 } }, 'No feedback data yet')
        )
      ),
      /* Conversations List */
      React.createElement(Panel, null,
        React.createElement(PanelTitle, { icon: '\uD83D\uDCAC' }, 'Conversations to Rate'),
        loading
          ? React.createElement('div', { style: { color: C.dim, textAlign: 'center', padding: 20, fontFamily: "'JetBrains Mono', monospace" } }, 'Loading conversations...')
          : filteredConversations.length === 0
            ? React.createElement('div', { style: { color: C.dim, textAlign: 'center', padding: 20, fontFamily: "'JetBrains Mono', monospace" } }, 'No conversations found')
            : React.createElement('div', { style: { display: 'flex', flexDirection: 'column', gap: 12, maxHeight: 400, overflowY: 'auto' } },
                filteredConversations.map(function(conv, idx) {
                  return React.createElement('div', {
                    key: conv.conversation_id,
                    style: { background: C.panelLight, borderRadius: 8, padding: 14, border: '1px solid ' + C.dim + '22', animation: 'hf-fadeIn 0.3s ease-out ' + (idx * 0.05) + 's both' }
                  },
                    /* Header */
                    React.createElement('div', { style: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 } },
                      React.createElement('div', { style: { display: 'flex', alignItems: 'center', gap: 8 } },
                        React.createElement(RobotAvatar, { size: 24, mood: conv.reward >= 1 ? 'happy' : 'confused' }),
                        React.createElement('span', { style: { fontSize: 11, fontFamily: "'JetBrains Mono', monospace", color: C.cyan } }, 'EP ' + conv.episode),
                        React.createElement('span', { style: { fontSize: 10, fontFamily: "'JetBrains Mono', monospace", color: conv.reward >= 1 ? C.green : C.red, padding: '2px 6px', borderRadius: 4, background: (conv.reward >= 1 ? C.green : C.red) + '15', border: '1px solid ' + (conv.reward >= 1 ? C.green : C.red) + '33' } }, conv.reward >= 1 ? '\u2713 CORRECT' : '\u2717 WRONG')
                      ),
                      React.createElement('span', { style: { fontSize: 10, fontFamily: "'JetBrains Mono', monospace", color: C.dim } }, conv.conversation_id)
                    ),
                    /* Data row */
                    React.createElement('div', { style: { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginBottom: 10 } },
                      React.createElement('div', { style: { fontSize: 11, fontFamily: "'JetBrains Mono', monospace" } },
                        React.createElement('span', { style: { color: C.dim } }, 'Message: '),
                        React.createElement('span', { style: { color: C.amber } }, '[' + (conv.message || []).join(', ') + ']')
                      ),
                      React.createElement('div', { style: { fontSize: 11, fontFamily: "'JetBrains Mono', monospace" } },
                        React.createElement('span', { style: { color: C.dim } }, 'Target \u2192 Choice: '),
                        React.createElement('span', { style: { color: conv.reward >= 1 ? C.green : C.red } }, conv.target_index + ' \u2192 ' + conv.listener_choice)
                      )
                    ),
                    /* Rating row */
                    React.createElement('div', { style: { display: 'flex', alignItems: 'center', gap: 12, marginBottom: 8 } },
                      React.createElement('span', { style: { fontSize: 11, fontFamily: "'JetBrains Mono', monospace", color: C.dim } }, 'Rate:'),
                      React.createElement(StarRating, { value: ratings[conv.conversation_id] || 0, onChange: function(v) { setRatings(function(prev) { var n = Object.assign({}, prev); n[conv.conversation_id] = v; return n; }); }, size: 20 })
                    ),
                    /* Comment inputs */
                    React.createElement('div', { style: { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginBottom: 8 } },
                      React.createElement('input', { type: 'text', placeholder: 'Comment...', value: comments[conv.conversation_id] || '', onChange: function(e) { setComments(function(prev) { var n = Object.assign({}, prev); n[conv.conversation_id] = e.target.value; return n; }); }, style: { background: '#111128', border: '1px solid ' + C.dim + '33', borderRadius: 4, padding: '6px 8px', color: C.text, fontSize: 11, fontFamily: "'JetBrains Mono', monospace" } }),
                      React.createElement('input', { type: 'text', placeholder: 'Suggested improvement...', value: improvements[conv.conversation_id] || '', onChange: function(e) { setImprovements(function(prev) { var n = Object.assign({}, prev); n[conv.conversation_id] = e.target.value; return n; }); }, style: { background: '#111128', border: '1px solid ' + C.dim + '33', borderRadius: 4, padding: '6px 8px', color: C.text, fontSize: 11, fontFamily: "'JetBrains Mono', monospace" } })
                    ),
                    /* Submit button */
                    React.createElement('button', {
                      onClick: function() { handleSubmitRating(conv.conversation_id); },
                      disabled: !ratings[conv.conversation_id] || submitting[conv.conversation_id],
                      style: {
                        padding: '6px 16px', borderRadius: 4, border: 'none',
                        background: ratings[conv.conversation_id] ? 'linear-gradient(135deg, ' + C.green + '88, ' + C.green + ')' : C.dim + '33',
                        color: ratings[conv.conversation_id] ? '#000' : C.dim,
                        cursor: ratings[conv.conversation_id] ? 'pointer' : 'not-allowed',
                        fontFamily: "'JetBrains Mono', monospace", fontSize: 11, fontWeight: 'bold',
                        textTransform: 'uppercase', letterSpacing: 1,
                      }
                    }, submitting[conv.conversation_id] ? '\u23F3 Submitting...' : '\uD83D\uDCE1 Submit Rating')
                  );
                })
              )
      ),
      /* Leaderboard */
      React.createElement(Panel, null,
        React.createElement(PanelTitle, { icon: '\uD83C\uDFC6' }, 'Leaderboard \u2014 Top Rated Conversations'),
        leaderboard.length === 0
          ? React.createElement('div', { style: { color: C.dim, textAlign: 'center', padding: 16, fontFamily: "'JetBrains Mono', monospace", fontSize: 12 } }, 'No rated conversations yet. Be the first to rate!')
          : React.createElement('div', { style: { display: 'flex', flexDirection: 'column', gap: 6 } },
              leaderboard.map(function(entry, idx) {
                var medal = idx === 0 ? '\uD83E\uDD47' : idx === 1 ? '\uD83E\uDD48' : idx === 2 ? '\uD83E\uDD49' : '#' + (idx + 1);
                return React.createElement('div', {
                  key: idx,
                  style: { display: 'grid', gridTemplateColumns: '32px 1fr 80px 60px 1fr', alignItems: 'center', gap: 10, padding: '8px 10px', borderRadius: 6, background: idx === 0 ? C.amber + '08' : idx < 3 ? C.green + '05' : 'transparent', border: '1px solid ' + (idx === 0 ? C.amber + '33' : C.dim + '11') }
                },
                  React.createElement('span', { style: { fontSize: 16, textAlign: 'center', color: idx === 0 ? C.amber : idx === 1 ? C.text : idx === 2 ? C.amber + '88' : C.dim } }, medal),
                  React.createElement('span', { style: { fontSize: 11, fontFamily: "'JetBrains Mono', monospace", color: C.text } }, entry.conversation_id),
                  React.createElement(StarRating, { value: Math.round(entry.average_rating), readonly: true, size: 14 }),
                  React.createElement('span', { style: { fontSize: 12, fontFamily: "'JetBrains Mono', monospace", color: C.amber, textAlign: 'center' } }, entry.average_rating.toFixed(1)),
                  React.createElement('span', { style: { fontSize: 10, fontFamily: "'JetBrains Mono', monospace", color: C.dim, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' } }, entry.best_comment || '')
                );
              })
            )
      ),
      /* Reward Model Weights */
      stats && stats.reward_model && stats.reward_model.weights && React.createElement(Panel, null,
        React.createElement(PanelTitle, { icon: '\uD83E\uDDE0' }, 'RLHF Reward Model Weights'),
        React.createElement('div', { style: { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: 12 } },
          Object.entries(stats.reward_model.weights).map(function(entry) {
            var name = entry[0], value = entry[1];
            return React.createElement('div', { key: name },
              React.createElement(ProgressBar, { value: value, max: 1, color: value > 0.6 ? C.green : value > 0.3 ? C.amber : C.red, label: name })
            );
          })
        )
      )
    )
  );
}

/* ═══════════════════════════════════════════════════ */
/*  LANGUAGE CLASSROOM TAB                            */
/* ═══════════════════════════════════════════════════ */

function LanguageClassroomTab() {
  var _useState1 = useState(null);
  var classroomId = _useState1[0], setClassroomId = _useState1[1];
  var _useState2 = useState([]);
  var messages = _useState2[0], setMessages = _useState2[1];
  var _useState3 = useState('');
  var input = _useState3[0], setInput = _useState3[1];
  var _useState4 = useState({});
  var vocabulary = _useState4[0], setVocabulary = _useState4[1];
  var _useState5 = useState(0);
  var understanding = _useState5[0], setUnderstanding = _useState5[1];
  var _useState6 = useState(0);
  var learningProgress = _useState6[0], setLearningProgress = _useState6[1];
  var _useState7 = useState(false);
  var showTeachModal = _useState7[0], setShowTeachModal = _useState7[1];
  var _useState8 = useState('');
  var teachSymbol = _useState8[0], setTeachSymbol = _useState8[1];
  var _useState9 = useState('');
  var teachMeaning = _useState9[0], setTeachMeaning = _useState9[1];
  var _useState10 = useState('taught');
  var teachCategory = _useState10[0], setTeachCategory = _useState10[1];
  var _useState11 = useState(false);
  var starting = _useState11[0], setStarting = _useState11[1];
  var _useState12 = useState(false);
  var sending = _useState12[0], setSending = _useState12[1];
  var chatEndRef = useRef(null);

  useEffect(function() {
    if (chatEndRef.current) chatEndRef.current.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  var refreshVocabulary = useCallback(function() {
    var url = API_URL + '/classroom/vocabulary' + (classroomId ? '?classroom_id=' + classroomId : '');
    fetch(url)
      .then(function(r) { return r.json(); })
      .then(function(d) {
        setVocabulary(d.vocabulary || {});
        setLearningProgress(d.learning_progress || 0);
      })
      .catch(function() {});
  }, [classroomId]);

  useEffect(function() { refreshVocabulary(); }, [refreshVocabulary]);

  var handleStartClassroom = function() {
    setStarting(true);
    fetch(API_URL + '/classroom/start', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ session_id: 'classroom_' + Date.now() }),
    })
    .then(function(r) { return r.json(); })
    .then(function(data) {
      setClassroomId(data.classroom_id);
      setUnderstanding(data.understanding_level || 0);
      setMessages([{
        sender: 'system',
        content: '\uD83E\uDD16 Classroom session started! ID: ' + data.classroom_id + '. Vocabulary: ' + data.vocabulary_size + ' symbols known.',
        timestamp: new Date().toISOString(),
      }]);
      refreshVocabulary();
    })
    .catch(function(e) { console.error('Failed to start classroom:', e); })
    .finally(function() { setStarting(false); });
  };

  var handleSendMessage = function() {
    if (!input.trim() || !classroomId || sending) return;
    var msg = input.trim();
    setInput('');
    setSending(true);

    fetch(API_URL + '/classroom/message', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ classroom_id: classroomId, content: msg }),
    })
    .then(function(r) { return r.json(); })
    .then(function(data) {
      setMessages(function(prev) { return prev.concat([
        { sender: 'human', content: msg, timestamp: new Date().toISOString() },
        { sender: 'agent', content: (data.agent_response && data.agent_response.content) || '[...]', symbols_used: data.symbols_used || [], confidence: data.confidence || 0, timestamp: new Date().toISOString() },
      ]); });
      setUnderstanding(data.understanding_level || 0);
    })
    .catch(function(e) {
      console.error('Message send failed:', e);
      setMessages(function(prev) { return prev.concat([{ sender: 'system', content: '\u26A0\uFE0F Failed to get agent response', timestamp: new Date().toISOString() }]); });
    })
    .finally(function() { setSending(false); });
  };

  var handleTeachSymbol = function() {
    if (!teachSymbol.trim() || !teachMeaning.trim()) return;
    fetch(API_URL + '/classroom/teach', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ symbol: teachSymbol.trim(), meaning: teachMeaning.trim(), category: teachCategory, classroom_id: classroomId }),
    })
    .then(function(r) { return r.json(); })
    .then(function() {
      setMessages(function(prev) { return prev.concat([{ sender: 'human', content: '\uD83D\uDCDD Teaching: [' + teachSymbol.trim() + '] = "' + teachMeaning.trim() + '"', timestamp: new Date().toISOString() }]); });
      setTeachSymbol('');
      setTeachMeaning('');
      setShowTeachModal(false);
      refreshVocabulary();
    })
    .catch(function(e) { console.error('Teach failed:', e); });
  };

  var vocabList = Object.entries(vocabulary).map(function(entry) {
    return Object.assign({ symbol: entry[0] }, entry[1]);
  }).sort(function(a, b) { return (b.confidence || 0) - (a.confidence || 0); });

  var learnedCount = vocabList.filter(function(v) { return v.confidence >= 0.7; }).length;

  return (
    React.createElement('div', { style: { display: 'grid', gridTemplateColumns: '1fr 360px', gap: 16, minHeight: 600 } },
      /* Left Column: Chat */
      React.createElement('div', { style: { display: 'flex', flexDirection: 'column', gap: 16 } },
        React.createElement(Panel, { style: { flex: 1, display: 'flex', flexDirection: 'column', minHeight: 460 } },
          /* Header */
          React.createElement('div', { style: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 } },
            React.createElement(PanelTitle, { icon: '\uD83C\uDF93' }, 'Language Classroom'),
            !classroomId
              ? React.createElement('button', { onClick: handleStartClassroom, disabled: starting, style: { padding: '8px 20px', borderRadius: 6, border: 'none', background: 'linear-gradient(135deg, ' + C.green + '88, ' + C.green + ')', color: '#000', cursor: 'pointer', fontFamily: "'JetBrains Mono', monospace", fontSize: 12, fontWeight: 'bold', textTransform: 'uppercase', letterSpacing: 1 } }, starting ? '\u23F3 Starting...' : '\uD83D\uDE80 Start Classroom')
              : React.createElement('div', { style: { display: 'flex', alignItems: 'center', gap: 8 } },
                  React.createElement('div', { style: { width: 8, height: 8, borderRadius: '50%', background: C.green, boxShadow: '0 0 8px ' + C.green, animation: 'hf-pulse 2s infinite' } }),
                  React.createElement('span', { style: { fontSize: 11, fontFamily: "'JetBrains Mono', monospace", color: C.green } }, 'LIVE')
                )
          ),
          /* Chat Messages */
          React.createElement('div', { style: { flex: 1, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 8, padding: 8, background: '#0d0d1a', borderRadius: 6, border: '1px solid ' + C.dim + '22', minHeight: 300 } },
            messages.length === 0 && !classroomId && React.createElement('div', { style: { flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 12, opacity: 0.6 } },
              React.createElement('div', { style: { fontSize: 48, animation: 'hf-float 3s infinite' } }, '\uD83E\uDD16'),
              React.createElement('span', { style: { fontSize: 13, fontFamily: "'JetBrains Mono', monospace", color: C.dim } }, 'Start a classroom to begin teaching')
            ),
            messages.map(function(msg, i) {
              var isHuman = msg.sender === 'human';
              var isSystem = msg.sender === 'system';
              var align = isHuman ? 'flex-end' : isSystem ? 'center' : 'flex-start';
              var bgColor = isHuman ? C.cyan + '15' : isSystem ? C.amber + '10' : C.green + '10';
              var borderColor = (isHuman ? C.cyan : isSystem ? C.amber : C.green) + '33';

              return React.createElement('div', { key: i, style: { display: 'flex', justifyContent: align, animation: 'hf-fadeIn 0.2s ease-out' } },
                React.createElement('div', { style: { maxWidth: '80%', padding: '8px 12px', borderRadius: 8, background: bgColor, border: '1px solid ' + borderColor } },
                  /* Agent label */
                  msg.sender === 'agent' && React.createElement('div', { style: { display: 'flex', alignItems: 'center', gap: 6, marginBottom: 4 } },
                    React.createElement(RobotAvatar, { size: 18, mood: 'happy' }),
                    React.createElement('span', { style: { fontSize: 10, fontFamily: "'JetBrains Mono', monospace", color: C.green } }, 'AGENT'),
                    msg.confidence != null && React.createElement('span', { style: { fontSize: 9, fontFamily: "'JetBrains Mono', monospace", color: msg.confidence > 0.6 ? C.green : C.amber, padding: '1px 4px', borderRadius: 3, background: (msg.confidence > 0.6 ? C.green : C.amber) + '15' } }, (msg.confidence * 100).toFixed(0) + '% conf')
                  ),
                  /* Human label */
                  isHuman && React.createElement('div', { style: { display: 'flex', alignItems: 'center', gap: 6, marginBottom: 4, justifyContent: 'flex-end' } },
                    React.createElement('span', { style: { fontSize: 10, fontFamily: "'JetBrains Mono', monospace", color: C.cyan } }, 'YOU'),
                    React.createElement('span', { style: { fontSize: 14 } }, '\uD83D\uDC64')
                  ),
                  /* Content */
                  React.createElement('div', { style: { fontSize: 13, fontFamily: "'JetBrains Mono', monospace", color: isSystem ? C.amber : C.text, wordBreak: 'break-word', lineHeight: 1.5 } }, msg.content),
                  /* Symbol translations */
                  msg.symbols_used && msg.symbols_used.length > 0 && React.createElement('div', { style: { marginTop: 6, padding: '4px 8px', borderRadius: 4, background: '#111128', border: '1px solid ' + C.dim + '22', display: 'flex', flexWrap: 'wrap', gap: 4 } },
                    msg.symbols_used.map(function(sym, si) {
                      return React.createElement('span', { key: si, style: { fontSize: 10, fontFamily: "'JetBrains Mono', monospace", padding: '2px 6px', borderRadius: 3, background: C.amber + '15', border: '1px solid ' + C.amber + '33', color: C.amber } }, '[' + sym + '] \u2192 ' + ((vocabulary[sym] && vocabulary[sym].meaning) || '?'));
                    })
                  )
                )
              );
            }),
            React.createElement('div', { ref: chatEndRef })
          ),
          /* Input Bar */
          classroomId && React.createElement('div', { style: { display: 'flex', gap: 8, marginTop: 8 } },
            React.createElement('input', { type: 'text', value: input, onChange: function(e) { setInput(e.target.value); }, onKeyDown: function(e) { if (e.key === 'Enter') handleSendMessage(); }, placeholder: 'Type a message to teach the agent...', style: { flex: 1, background: '#111128', border: '1px solid ' + C.dim + '44', borderRadius: 6, padding: '10px 12px', color: C.text, fontFamily: "'JetBrains Mono', monospace", fontSize: 13 } }),
            React.createElement('button', { onClick: handleSendMessage, disabled: !input.trim() || sending, style: { padding: '10px 20px', borderRadius: 6, border: 'none', background: input.trim() ? 'linear-gradient(135deg, ' + C.cyan + '88, ' + C.cyan + ')' : C.dim + '33', color: input.trim() ? '#000' : C.dim, cursor: input.trim() ? 'pointer' : 'not-allowed', fontFamily: "'JetBrains Mono', monospace", fontSize: 12, fontWeight: 'bold' } }, sending ? '\u23F3' : '\uD83D\uDCE1 Send'),
            React.createElement('button', { onClick: function() { setShowTeachModal(true); }, style: { padding: '10px 16px', borderRadius: 6, border: '1px solid ' + C.amber + '66', background: C.amber + '15', color: C.amber, cursor: 'pointer', fontFamily: "'JetBrains Mono', monospace", fontSize: 12, fontWeight: 'bold' } }, '\uD83D\uDCDD Teach')
          )
        ),
        /* Understanding Level */
        classroomId && React.createElement(Panel, null,
          React.createElement(PanelTitle, { icon: '\uD83E\uDDE0' }, 'Agent Understanding'),
          React.createElement('div', { style: { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, alignItems: 'center' } },
            React.createElement('div', null,
              React.createElement(ProgressBar, { value: understanding, max: 1, color: understanding > 0.6 ? C.green : understanding > 0.3 ? C.amber : C.red, label: 'Understanding Level' })
            ),
            React.createElement('div', { style: { textAlign: 'center' } },
              React.createElement(RobotAvatar, { size: 48, mood: understanding > 0.6 ? 'happy' : understanding > 0.3 ? 'neutral' : 'confused' }),
              React.createElement('div', { style: { marginTop: 8, fontSize: 12, fontFamily: "'JetBrains Mono', monospace", color: understanding > 0.6 ? C.green : understanding > 0.3 ? C.amber : C.red } },
                understanding > 0.8 ? 'Fluent!' : understanding > 0.6 ? 'Understanding well' : understanding > 0.3 ? 'Learning...' : 'Just starting'
              )
            )
          )
        )
      ),
      /* Right Column: Vocabulary */
      React.createElement('div', { style: { display: 'flex', flexDirection: 'column', gap: 16 } },
        React.createElement(Panel, { style: { flex: 1 } },
          React.createElement(PanelTitle, { icon: '\uD83D\uDCD6' }, 'Emergent Vocabulary'),
          React.createElement('div', { style: { marginBottom: 12 } },
            React.createElement(ProgressBar, { value: learnedCount, max: Math.max(vocabList.length, 1), color: C.green, label: learnedCount + ' / ' + vocabList.length + ' symbols learned' })
          ),
          React.createElement('div', { style: { maxHeight: 420, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 4 } },
            vocabList.map(function(v, i) {
              return React.createElement('div', {
                key: v.symbol,
                style: { display: 'grid', gridTemplateColumns: '36px 1fr 50px', alignItems: 'center', gap: 8, padding: '6px 8px', borderRadius: 4, background: i % 2 === 0 ? C.green + '04' : 'transparent', border: '1px solid ' + C.dim + '11', animation: 'hf-fadeIn 0.2s ease-out ' + (i * 0.03) + 's both' }
              },
                React.createElement('div', { style: { width: 32, height: 32, borderRadius: 4, background: C.bg + 'cc', border: '1px solid ' + C.amber + '44', display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: "'JetBrains Mono', monospace", fontSize: 14, color: C.amber, textShadow: '0 0 6px ' + C.amber + '66' } }, v.symbol),
                React.createElement('div', null,
                  React.createElement('div', { style: { fontSize: 11, fontFamily: "'JetBrains Mono', monospace", color: C.textBright, marginBottom: 2 } }, v.meaning),
                  React.createElement('div', { style: { display: 'flex', gap: 6, alignItems: 'center' } },
                    React.createElement('span', { style: { fontSize: 9, fontFamily: "'JetBrains Mono', monospace", color: C.dim, padding: '1px 4px', borderRadius: 3, background: C.cyan + '10', border: '1px solid ' + C.cyan + '22' } }, v.category),
                    React.createElement('span', { style: { fontSize: 9, fontFamily: "'JetBrains Mono', monospace", color: C.dim } }, '\u00D7' + v.usage_count),
                    v.taught_by === 'human' && React.createElement('span', { style: { fontSize: 9, fontFamily: "'JetBrains Mono', monospace", color: C.amber, padding: '1px 4px', borderRadius: 3, background: C.amber + '15' } }, 'TAUGHT')
                  )
                ),
                React.createElement('div', { style: { fontSize: 10, fontFamily: "'JetBrains Mono', monospace", color: v.confidence >= 0.7 ? C.green : v.confidence >= 0.4 ? C.amber : C.red, textAlign: 'right' } }, (v.confidence * 100).toFixed(0) + '%')
              );
            })
          )
        )
      ),
      /* Teach Modal */
      showTeachModal && React.createElement('div', {
        style: { position: 'fixed', inset: 0, background: '#000000cc', zIndex: 9999, display: 'flex', alignItems: 'center', justifyContent: 'center' },
        onClick: function() { setShowTeachModal(false); }
      },
        React.createElement('div', {
          onClick: function(e) { e.stopPropagation(); },
          style: { background: C.panel, border: '1px solid ' + C.amber + '44', borderRadius: 12, padding: 24, width: 380, animation: 'hf-fadeIn 0.2s ease-out' }
        },
          React.createElement('h3', { style: { margin: '0 0 16px', fontSize: 16, fontFamily: "'JetBrains Mono', monospace", color: C.amber, display: 'flex', alignItems: 'center', gap: 8 } }, '\uD83D\uDCDD Teach New Symbol'),
          React.createElement('div', { style: { display: 'flex', flexDirection: 'column', gap: 12 } },
            React.createElement('div', null,
              React.createElement('label', { style: { fontSize: 11, fontFamily: "'JetBrains Mono', monospace", color: C.dim, display: 'block', marginBottom: 4 } }, 'SYMBOL (number or token)'),
              React.createElement('input', { type: 'text', value: teachSymbol, onChange: function(e) { setTeachSymbol(e.target.value); }, placeholder: 'e.g. 42', style: { width: '100%', background: '#111128', border: '1px solid ' + C.dim + '44', borderRadius: 6, padding: '8px 10px', color: C.text, fontFamily: "'JetBrains Mono', monospace", fontSize: 13, boxSizing: 'border-box' } })
            ),
            React.createElement('div', null,
              React.createElement('label', { style: { fontSize: 11, fontFamily: "'JetBrains Mono', monospace", color: C.dim, display: 'block', marginBottom: 4 } }, 'MEANING'),
              React.createElement('input', { type: 'text', value: teachMeaning, onChange: function(e) { setTeachMeaning(e.target.value); }, placeholder: 'e.g. triangle shape', style: { width: '100%', background: '#111128', border: '1px solid ' + C.dim + '44', borderRadius: 6, padding: '8px 10px', color: C.text, fontFamily: "'JetBrains Mono', monospace", fontSize: 13, boxSizing: 'border-box' } })
            ),
            React.createElement('div', null,
              React.createElement('label', { style: { fontSize: 11, fontFamily: "'JetBrains Mono', monospace", color: C.dim, display: 'block', marginBottom: 4 } }, 'CATEGORY'),
              React.createElement('select', { value: teachCategory, onChange: function(e) { setTeachCategory(e.target.value); }, style: { width: '100%', background: '#111128', border: '1px solid ' + C.dim + '44', borderRadius: 6, padding: '8px 10px', color: C.text, fontFamily: "'JetBrains Mono', monospace", fontSize: 12 } },
                ['taught', 'color', 'size', 'shape', 'opacity', 'border', 'light', 'rotation', 'saturation', 'emotion', 'action', 'other'].map(function(c) {
                  return React.createElement('option', { key: c, value: c }, c);
                })
              )
            ),
            React.createElement('div', { style: { display: 'flex', gap: 8, marginTop: 4 } },
              React.createElement('button', { onClick: handleTeachSymbol, disabled: !teachSymbol.trim() || !teachMeaning.trim(), style: { flex: 1, padding: '10px', borderRadius: 6, border: 'none', background: teachSymbol.trim() && teachMeaning.trim() ? 'linear-gradient(135deg, ' + C.amber + '88, ' + C.amber + ')' : C.dim + '33', color: teachSymbol.trim() && teachMeaning.trim() ? '#000' : C.dim, cursor: teachSymbol.trim() && teachMeaning.trim() ? 'pointer' : 'not-allowed', fontFamily: "'JetBrains Mono', monospace", fontSize: 12, fontWeight: 'bold' } }, '\u2713 Teach Symbol'),
              React.createElement('button', { onClick: function() { setShowTeachModal(false); }, style: { padding: '10px 16px', borderRadius: 6, border: '1px solid ' + C.dim + '44', background: 'transparent', color: C.dim, cursor: 'pointer', fontFamily: "'JetBrains Mono', monospace", fontSize: 12 } }, 'Cancel')
            )
          )
        )
      )
    )
  );
}

/* ═══════════════════════════════════════════════════ */
/*  MAIN PAGE                                         */
/* ═══════════════════════════════════════════════════ */

export default function HumanFeedback() {
  var _useState = useState('rate');
  var activeTab = _useState[0], setActiveTab = _useState[1];

  var tabs = [
    { id: 'rate', label: 'Rate Conversations', icon: '\u2B50' },
    { id: 'classroom', label: 'Language Classroom', icon: '\uD83C\uDF93' },
  ];

  return (
    React.createElement('div', { style: { fontFamily: "'JetBrains Mono', monospace" } },
      /* Page Header */
      React.createElement('div', { style: { marginBottom: 20 } },
        React.createElement('div', { style: { display: 'flex', alignItems: 'center', gap: 10, marginBottom: 4 } },
          React.createElement('span', { style: { fontSize: 20 } }, '\uD83E\uDD16'),
          React.createElement('h2', { style: { margin: 0, fontSize: 20, color: C.green, fontFamily: "'JetBrains Mono', monospace", textShadow: '0 0 10px ' + C.green + '44' } }, 'Human-in-the-Loop Training')
        ),
        React.createElement('p', { style: { margin: 0, fontSize: 12, color: C.dim, fontFamily: "'JetBrains Mono', monospace" } }, 'Rate agent conversations & teach language interactively')
      ),
      /* Tab Bar */
      React.createElement('div', { style: { display: 'flex', gap: 4, marginBottom: 16, background: C.panel, padding: 4, borderRadius: 8, border: '1px solid ' + C.dim + '22' } },
        tabs.map(function(tab) {
          var isActive = activeTab === tab.id;
          return React.createElement('button', {
            key: tab.id,
            onClick: function() { setActiveTab(tab.id); },
            style: {
              flex: 1, padding: '10px 16px', borderRadius: 6, border: 'none',
              background: isActive ? 'linear-gradient(135deg, ' + C.green + '20, ' + C.green + '10)' : 'transparent',
              color: isActive ? C.green : C.dim,
              cursor: 'pointer',
              fontFamily: "'JetBrains Mono', monospace", fontSize: 13,
              fontWeight: isActive ? 'bold' : 'normal',
              transition: 'all 0.2s',
              display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
              borderBottom: isActive ? '2px solid ' + C.green : '2px solid transparent',
            }
          },
            React.createElement('span', { style: { fontSize: 16 } }, tab.icon),
            tab.label
          );
        })
      ),
      /* Tab Content */
      activeTab === 'rate' && React.createElement(RateConversationsTab),
      activeTab === 'classroom' && React.createElement(LanguageClassroomTab)
    )
  );
}
