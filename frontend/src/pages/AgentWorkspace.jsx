import React, { useState, useEffect, useMemo, useRef, useCallback } from 'react';

// ─── COLOR CONSTANTS ───────────────────────────────────────────
const COLORS = {
  bg: '#0a0a1a',
  floor1: '#1a1a2e',
  floor2: '#16162a',
  border: '#00ff88',
  textPrimary: '#00ff88',
  textSecondary: '#ffaa00',
  textAccent: '#00ddff',
  hpGreen: '#44ff44',
  hpYellow: '#ffcc00',
  hpRed: '#ff4444',
  panelBg: '#0d0d22',
  panelBorder: '#00ff8844',
};

// ─── PIXEL ART: box-shadow renderer ───────────────────────────
// Each sprite is a 24-row × 16-col grid of single-char codes.
// '.' = transparent.  Each class has its own palette.
// Uppercase = highlight, lowercase = base, digits/special = shadow.

const B = '#222222'; // outline

function gridToShadows(grid, palette, px) {
  const out = [];
  for (let y = 0; y < grid.length; y++) {
    const row = grid[y];
    for (let x = 0; x < row.length; x++) {
      const ch = row[x];
      if (ch === '.' || ch === ' ') continue;
      const c = palette[ch];
      if (c) out.push(`${x * px}px ${y * px}px 0 0 ${c}`);
    }
  }
  return out.join(',');
}

// ═══════════════════════════════════════════════════════════════
// 1. OBSERVER MAGE  (blue robes, wizard hat, glowing staff)
// ═══════════════════════════════════════════════════════════════
const MAGE_P = {
  O: B,
  A: '#4477cc', a: '#3355aa', z: '#223388',   // hat
  S: '#ffe0b0', s: '#eebb88', v: '#cc9966',   // skin
  W: '#ffffff', e: '#224488',                   // eye white / pupil
  m: '#cc6666',                                 // mouth
  R: '#4466cc', r: '#3355aa', q: '#224488',    // robe
  G: '#66eeff', g: '#44bbdd',                   // staff glow
  T: '#554433', t: '#443322',                   // staff wood
  f: '#2244aa',                                 // feet
};
const MAGE_G = [
  '.....OOOOO.......',
  '....OAAAaO.......',
  '...OAAAAazO......',
  '...OaaaaazO......',
  '..OaaaaaazO......',
  '..OOOOOOOOOO.....',
  '..OSWSSSWSO......',
  '.OSsSssSeeSO.....',
  '.OssssssSEO......',
  '.OsvOssvOO.......',
  '..OOsOOsOO.......',
  '...OsmO..........',
  '...OOO...........',
  '..ORRRO..........',
  '.ORRrRROT........',
  '.ORRrrROTG.......',
  '.ORqqRRROTG......',
  '..ORRrRO.TGg.....',
  '..ORrrRO..Gg.....',
  '...ORRO..........',
  '...OfO...........',
  '..OfOfO..........',
  '..OOOOO..........',
  '.................',
];

// ═══════════════════════════════════════════════════════════════
// 2. WORKER KNIGHT  (crimson plate armor, sword, shield)
// ═══════════════════════════════════════════════════════════════
const KNIGHT_P = {
  O: B,
  A: '#cc4444', a: '#aa2222', z: '#881111',   // helmet
  V: '#ff6666', v: '#cc3333',                   // visor
  S: '#ffe0b0', s: '#eebb88', v2: '#cc9966',  // skin (v2 maps to 'u' below)
  W: '#ffffff', e: '#222222',
  m: '#cc6666',
  M: '#cccccc', m2: '#999999', n: '#666666',  // metal
  R: '#bb3333', r: '#992222', q: '#771111',   // armor
  X: '#eeeeee', x: '#bbbbbb',                   // sword blade
  D: '#884422',                                 // sword handle
  F: '#dddd44', f2: '#bbaa22',                  // shield
  b: '#992222',                                 // boots
};
const KNIGHT_G = [
  '....OOOOOO.......',
  '...OAAAAaO.......',
  '..OAAAVVazO......',
  '..OaaVVVzO.......',
  '.OaaaaaaazO......',
  '.OOOOOOOOO.......',
  '.OWSSSWSEO.......',
  'OSsSssSeeSO......',
  'OssssssSEO.......',
  'OsvOssvOO........',
  '.OOsOOsOO........',
  '..OsmO...........',
  '..OOOOO..........',
  '.OMRMRO..........',
  'OMRrRROM.........',
  'OMRqrRMOXx.......',
  '.MRqqRMODXx......',
  '.OMRRO...Xx......',
  '.OMbbMO..........',
  '..ObbO...........',
  '..ObO............',
  '.ObObO...........',
  '.OOOOO...........',
  '.................',
];

// ═══════════════════════════════════════════════════════════════
// 3. SCHOLAR SAGE  (purple robe, book, glasses)
// ═══════════════════════════════════════════════════════════════
const SAGE_P = {
  O: B,
  A: '#9966cc', a: '#7744aa', z: '#553388',   // hat
  S: '#ffe0b0', s: '#eebb88', v: '#cc9966',
  W: '#ffffff', e: '#222244',
  G: '#cccc44', g: '#aaaa22',                   // glasses
  m: '#cc6666',
  R: '#8855cc', r: '#7744aa', q: '#553388',   // robe
  K: '#885522', k: '#663311',                   // book cover
  P: '#ffffcc', p: '#ddddaa',                   // pages
  f: '#553388',
};
const SAGE_G = [
  '.....OOOO.......',
  '....OAAAaO......',
  '...OAAAAazO.....',
  '...OaaaaazO.....',
  '..OaaaaaazO.....',
  '..OOOOOOOOO.....',
  '..OWSSSGSSO.....',
  '.OSsSssGgeSO....',
  '.OssssssGSO.....',
  '.OsvOssvOO......',
  '..OOsOOsOO......',
  '...OsmO.........',
  '...OOO..........',
  '..ORRRO.........',
  '.ORRrRRO........',
  '.ORRrrROKP......',
  '.ORqqRrOPP......',
  '..ORRrROKP......',
  '..ORrrRO.O......',
  '...ORRO.........',
  '...OfO..........',
  '..OfOfO.........',
  '..OOOOO.........',
  '................',
];

// ═══════════════════════════════════════════════════════════════
// 4. SCOUT RANGER  (green hood, bow, light armor)
// ═══════════════════════════════════════════════════════════════
const RANGER_P = {
  O: B,
  A: '#449944', a: '#337733', z: '#225522',   // hood
  S: '#ffe0b0', s: '#eebb88', v: '#cc9966',
  W: '#ffffff', e: '#222222',
  m: '#cc6666',
  R: '#448844', r: '#337733', q: '#225522',   // armor/leather
  C: '#559955', c: '#337733',                   // cape
  B: '#885533', b: '#664422',                   // bow
  L: '#cccccc',                                 // bowstring
  f: '#335533',
};
const RANGER_G = [
  '....OOOOOO.......',
  '...OAAAAaO.......',
  '..OAAAAAazO......',
  '.OAaaaaaaO.......',
  '.OaaaaaaaO.......',
  '.OOOOOOOOO.......',
  '.OWSSSWSEO.......',
  'OSsSssSeeSO......',
  'OssssssSEO.......',
  'OsvOssvOO........',
  '.OOsOOsOO........',
  '..OsmO...........',
  '..OOO............',
  '.OCRCO.B.........',
  'OCccCcOBL........',
  'OCcqccO.BL.......',
  '.OCqqCO..BL......',
  '.OCccCO...O......',
  '.OCbbCO..........',
  '..ObbO...........',
  '..ObO............',
  '.ObObO...........',
  '.OOOOO...........',
  '.................',
];

// ═══════════════════════════════════════════════════════════════
// 5. HEALER CLERIC  (white robe, gold cross, gentle)
// ═══════════════════════════════════════════════════════════════
const CLERIC_P = {
  O: B,
  H: '#ffffff', h: '#dddddd', d: '#bbbbbb',   // hood
  S: '#ffe0b0', s: '#eebb88', v: '#cc9966',
  W: '#ffffff', e: '#446688',
  m: '#ee8888',
  R: '#ffffff', r: '#eeeeee', q: '#dddddd',   // robe
  C: '#ffcc00', c: '#ddaa00',                   // cross
  G: '#ffee66', g: '#ddcc44',                   // gold trim
  f: '#cccccc',
};
const CLERIC_G = [
  '....OOOOO.......',
  '...OHHHHhO......',
  '..OHHHHHdO......',
  '..OhhhhhhdO.....',
  '.OhhhhhhhdO.....',
  '.OOOOOOOOO......',
  '.OWSSSWSEO......',
  'OSsSssSeeSO.....',
  'OssssssSEO......',
  'OsvOssvOO.......',
  '.OOsOOsOO.......',
  '..OsmO..........',
  '..OOO...........',
  '.ORRRO..........',
  'ORRrRRO.........',
  'ORCrCrRO........',
  'ORrCCCRO........',
  '.ORCrCrO........',
  '.ORRrRO.........',
  '..OgRgO.........',
  '..OfO...........',
  '.OfOfO..........',
  '.OOOOO..........',
  '................',
];

// ═══════════════════════════════════════════════════════════════
// 6. ROGUE ASSASSIN  (dark cloak, daggers, stealthy)
// ═══════════════════════════════════════════════════════════════
const ASSASSIN_P = {
  O: B,
  A: '#444444', a: '#333333', z: '#222222',   // hood
  S: '#ffe0b0', s: '#eebb88', v: '#cc9966',
  W: '#ffffff', e: '#cc2222',                   // red eyes
  m: '#884444',
  C: '#555555', c: '#333333', q: '#222222',   // cloak
  D: '#aabbcc', d: '#889999',                   // dagger blade
  G: '#884422', g: '#663311',                   // dagger grip
  f: '#333333',
};
const ASSASSIN_G = [
  '....OOOOO.......',
  '...OAAAAaO......',
  '..OAAAAAazO.....',
  '.OAAaaaaaO......',
  '.OaaaaaaaO......',
  '.OOOOOOOOO......',
  '.OWSSSWSeO......',
  'OSsSssSeeSO.....',
  'OssssssWeO......',
  'OsvOssvOO.......',
  '.OOsOOsOO.......',
  '..OsmO..........',
  '..OOO...........',
  '.OCRCOD.........',
  'OCccCcODG.......',
  'OCcqqcO.DG......',
  '.OCqqCO..D......',
  '.OCccCO.........',
  '.OCccCO.........',
  '..OcqO..........',
  '..OfO...........',
  '.OfOfO..........',
  '.OOOOO..........',
  '................',
];

// ═══════════════════════════════════════════════════════════════
// 7. ARTIFICER ENGINEER  (orange/bronze, goggles, wrench)
// ═══════════════════════════════════════════════════════════════
const ENGINEER_P = {
  O: B,
  A: '#dd8833', a: '#bb6622', z: '#994411',   // hat
  S: '#ffe0b0', s: '#eebb88', v: '#cc9966',
  W: '#ffffff', e: '#222222',
  G: '#aaddff', g: '#88bbdd',                   // goggles
  m: '#cc6666',
  R: '#cc7722', r: '#aa5511', q: '#883300',   // apron
  K: '#cccccc', k: '#999999',                   // wrench
  M: '#888888', m2: '#666666',                  // mechanical bits
  f: '#994411',
};
const ENGINEER_G = [
  '...OOOOOOO......',
  '..OAAAAAaO......',
  '.OAAAAAAazO.....',
  '.OaaaaaaazO.....',
  '.OOOOOOOOO......',
  '.OWSGSGGSO......',
  'OSsSgssGgSO.....',
  'OssssssSEO......',
  'OsvOssvOO.......',
  '.OOsOOsOO.......',
  '..OsmO..........',
  '..OOO...........',
  '.ORRRO..........',
  'ORRrRRO.........',
  'ORRrrROKk.......',
  'ORqqRrOKk.......',
  '.ORRrRO.........',
  '.ORrrRO.........',
  '..OqRO..........',
  '..OfO...........',
  '.OfOfO..........',
  '.OOOOO..........',
  '................',
  '................',
];

// ═══════════════════════════════════════════════════════════════
// 8. MYSTIC ORACLE  (cyan/teal, flowing hair, crystal ball)
// ═══════════════════════════════════════════════════════════════
const ORACLE_P = {
  O: B,
  A: '#22cccc', a: '#009999', z: '#007777',   // hair
  S: '#ffe0b0', s: '#eebb88', v: '#cc9966',
  W: '#ffffff', I: '#44ddff', e: '#222222',   // glowing eyes
  m: '#cc6666',
  R: '#33cccc', r: '#22aaaa', q: '#118888',   // robe
  C: '#66ffff', c: '#44dddd', k: '#22bbbb',   // crystal
  F: '#ffffff',                                 // sparkle
  L: '#22dddd',                                 // flowing hair
  f: '#007777',
};
const ORACLE_G = [
  '...OAAAAaO.......',
  '..OAAAAAazO......',
  '.OAAAAAAAaLO.....',
  '.OaaaaaaLO.......',
  '.OOOOOOOLO.......',
  '.OWSSWSILO.......',
  'OSsSssSILO.......',
  'OssssssWLO.......',
  'OsvOssvOO........',
  '.OOsOOsOO........',
  '..OsmO...........',
  '..OOO............',
  '..ORRRO..........',
  '.ORRrRRO.........',
  '.ORrrrROCC.......',
  '.ORqqRrOCcF......',
  '..ORRrROCc.......',
  '..ORrrRO.........',
  '...OqRO..........',
  '...OfO...........',
  '..OfOfO..........',
  '..OOOOO..........',
  '.................',
  '.................',
];

// ── SPRITE REGISTRY ───────────────────────────────────────────
const SPRITES = {
  mage:      { grid: MAGE_G,      palette: MAGE_P },
  knight:    { grid: KNIGHT_G,    palette: KNIGHT_P },
  sage:      { grid: SAGE_G,      palette: SAGE_P },
  ranger:    { grid: RANGER_G,    palette: RANGER_P },
  cleric:    { grid: CLERIC_G,    palette: CLERIC_P },
  assassin:  { grid: ASSASSIN_G,  palette: ASSASSIN_P },
  engineer:  { grid: ENGINEER_G,  palette: ENGINEER_P },
  oracle:    { grid: ORACLE_G,    palette: ORACLE_P },
};

// ── AGENT DEFINITIONS ─────────────────────────────────────────
const AGENT_DEFS = [
  { id:'mage',     name:'Observer',   className:'Observer Mage',        classType:'mage',     color:'#3355aa',
    desc:'Analyzes data streams with arcane precision.' },
  { id:'knight',   name:'Worker',     className:'Worker Knight',        classType:'knight',   color:'#aa2222',
    desc:'Tackles tasks with unwavering strength.' },
  { id:'sage',     name:'Scholar',    className:'Scholar Sage',         classType:'sage',     color:'#7744aa',
    desc:'Studies patterns and uncovers deep insights.' },
  { id:'ranger',   name:'Scout',      className:'Scout Ranger',        classType:'ranger',   color:'#337733',
    desc:'Scouts new territory and tracks changes.' },
  { id:'cleric',   name:'Healer',     className:'Healer Cleric',       classType:'cleric',   color:'#ddaa00',
    desc:'Maintains system health and stability.' },
  { id:'assassin', name:'Rogue',      className:'Rogue Assassin',      classType:'assassin', color:'#444444',
    desc:'Stealthily monitors for anomalies.' },
  { id:'engineer', name:'Artificer',  className:'Artificer Engineer',  classType:'engineer', color:'#bb6622',
    desc:'Builds and maintains mechanical systems.' },
  { id:'oracle',   name:'Mystic',     className:'Mystic Oracle',       classType:'oracle',   color:'#009999',
    desc:'Foresees issues through mystical insight.' },
];

// ── EVOLUTION SYSTEM CONSTANTS ──────────────────────────────────
// Trait-to-CSS-filter mapping (applied as inline style)
const TRAIT_FILTERS = {
  curious:   { hueRotate: 200, saturate: 1.3, brightness: 1.1 },   // blue tint
  confident: { hueRotate: 100, saturate: 1.4, brightness: 1.15 },  // green tint
  creative:  { hueRotate: 270, saturate: 1.5, brightness: 1.1 },   // purple tint
  patient:   { hueRotate: 50,  saturate: 1.3, brightness: 1.2 },   // yellow tint
};

// Trait names for random assignment
const TRAIT_NAMES = ['curious', 'confident', 'creative', 'patient'];

// Mood definitions with visual effects
const MOOD_EFFECTS = {
  happy:     { particleColor: '#ffcc00', glowColor: null,    auraColor: null },
  frustrated:{ particleColor: null,      glowColor: '#ff4444', auraColor: null },
  focused:   { particleColor: null,      glowColor: null,    auraColor: '#00ddff' },
  neutral:   { particleColor: null,      glowColor: null,    auraColor: null },
};

// Milestone badges
const MILESTONES = [
  { id: 'first_steps',  label: '★',   title: 'First Steps',   condition: (s) => s.tasksDone >= 1 },
  { id: 'apprentice',   label: '★★',  title: 'Apprentice',    condition: (s) => s.level >= 3 },
  { id: 'journeyman',   label: '★★★', title: 'Journeyman',    condition: (s) => s.level >= 5 },
  { id: 'master',       label: '◈',   title: 'Master',        condition: (s) => s.level >= 8 },
  { id: 'specialist',   label: '◆',   title: 'Specialist',    condition: (s) => Object.values(s.traits).some(v => v >= 60) },
  { id: 'veteran',      label: '✦',   title: 'Veteran',       condition: (s) => s.tasksDone >= 20 },
  { id: 'legend',       label: '❂',   title: 'Legend',        condition: (s) => s.level >= 12 },
];

// XP thresholds per level (cumulative)
function xpForLevel(level) {
  return Math.floor(50 * Math.pow(level, 1.5));
}

function levelFromXp(xp) {
  let level = 1;
  while (xp >= xpForLevel(level + 1)) level++;
  return level;
}

// Determine mood from recent activity patterns
function deriveMood(history, hp) {
  const recent = history.slice(-5);
  const alertCount = recent.filter(h => h.isAlert).length;
  const collabCount = recent.filter(h => h.isCollab).length;
  if (alertCount >= 2) return 'frustrated';
  if (collabCount >= 2) return 'happy';
  if (hp > 70) return 'focused';
  if (hp < 30) return 'frustrated';
  return 'neutral';
}

// Determine dominant trait from traits object
function dominantTrait(traits) {
  let max = 0, dom = 'curious';
  for (const [k, v] of Object.entries(traits)) {
    if (v > max) { max = v; dom = k; }
  }
  return dom;
}

const ACTIONS = ['Scan Files', 'Check System', 'Monitor Processes', 'Observe Desktop'];

// ── EXTENDED ACTIONS & PERSONALITY ─────────────────────────────
const ALL_ACTIONS = [
  'Scan Files', 'Check System', 'Monitor Processes', 'Observe Desktop',
  'Write Report', 'Alert', 'Collaborate', 'Deploy',
  'Auto Scan', 'Suggest Cleanup', 'Auto Organize', 'Health Monitor',
];

// Weighted preferences per agent class (higher = more likely to pick)
const AGENT_PREFERENCES = {
  mage:     { 'Write Report': 4, 'Observe Desktop': 3, 'Scan Files': 1, 'Check System': 1, 'Monitor Processes': 1, 'Deploy': 1, 'Alert': 1, 'Collaborate': 1, 'Auto Scan': 5, 'Suggest Cleanup': 3, 'Auto Organize': 2, 'Health Monitor': 2 },
  knight:   { 'Scan Files': 4, 'Deploy': 3, 'Check System': 1, 'Monitor Processes': 1, 'Observe Desktop': 1, 'Write Report': 1, 'Alert': 1, 'Collaborate': 1, 'Auto Scan': 3, 'Suggest Cleanup': 4, 'Auto Organize': 5, 'Health Monitor': 2 },
  sage:     { 'Write Report': 4, 'Collaborate': 3, 'Scan Files': 1, 'Check System': 1, 'Monitor Processes': 1, 'Observe Desktop': 1, 'Deploy': 1, 'Alert': 1, 'Auto Scan': 4, 'Suggest Cleanup': 3, 'Auto Organize': 3, 'Health Monitor': 4 },
  ranger:   { 'Monitor Processes': 4, 'Alert': 3, 'Scan Files': 1, 'Check System': 1, 'Observe Desktop': 1, 'Write Report': 1, 'Deploy': 1, 'Collaborate': 1, 'Auto Scan': 5, 'Suggest Cleanup': 2, 'Auto Organize': 2, 'Health Monitor': 3 },
  cleric:   { 'Collaborate': 4, 'Check System': 3, 'Scan Files': 1, 'Monitor Processes': 1, 'Observe Desktop': 1, 'Write Report': 1, 'Deploy': 1, 'Alert': 1, 'Auto Scan': 2, 'Suggest Cleanup': 3, 'Auto Organize': 3, 'Health Monitor': 5 },
  assassin: { 'Alert': 4, 'Monitor Processes': 3, 'Scan Files': 1, 'Check System': 1, 'Observe Desktop': 1, 'Write Report': 1, 'Deploy': 1, 'Collaborate': 1, 'Auto Scan': 4, 'Suggest Cleanup': 2, 'Auto Organize': 2, 'Health Monitor': 3 },
  engineer: { 'Deploy': 4, 'Scan Files': 3, 'Check System': 1, 'Monitor Processes': 1, 'Observe Desktop': 1, 'Write Report': 1, 'Alert': 1, 'Collaborate': 1, 'Auto Scan': 3, 'Suggest Cleanup': 4, 'Auto Organize': 5, 'Health Monitor': 3 },
  oracle:   { 'Write Report': 4, 'Alert': 3, 'Scan Files': 1, 'Check System': 1, 'Monitor Processes': 1, 'Observe Desktop': 1, 'Deploy': 1, 'Collaborate': 1, 'Auto Scan': 3, 'Suggest Cleanup': 2, 'Auto Organize': 2, 'Health Monitor': 5 },
};

// Target positions for each action area (within workspace floor)
const ACTION_TARGETS = {
  'Scan Files':        { x: 60,  y: 140 },
  'Check System':      { x: 260, y: 140 },
  'Monitor Processes':  { x: 460, y: 140 },
  'Observe Desktop':   { x: 340, y: 300 },
  'Write Report':      { x: 340, y: 280 },
  'Alert':             null,  // stays in place
  'Collaborate':       { x: 280, y: 220 },
  'Deploy':            { x: 280, y: 200 },
  'Auto Scan':         { x: 60,  y: 160 },
  'Suggest Cleanup':   { x: 160, y: 300 },
  'Auto Organize':     { x: 400, y: 280 },
  'Health Monitor':    { x: 260, y: 160 },
};

// Report snippets for Write Report action
const REPORT_SNIPPETS = [
  'Found {n} anomalies in data stream',
  'Pattern analysis: {n}% correlation detected',
  'Processed {n} data points, 3 outliers found',
  'Memory usage optimized by {n}%',
  'Identified {n} potential security vectors',
  'Data integrity verified: {n} checksums passed',
  'Network latency reduced by {n}ms average',
  'Catalogued {n} new file modifications',
];

// Alert messages
const ALERT_MESSAGES = [
  'Unusual pattern detected!',
  'Anomalous data spike in sector 7',
  'Unauthorized access attempt flagged',
  'Memory leak detected in module C',
  'Unexpected network topology change',
  'Rate limit threshold exceeded',
];

// Deploy messages
const DEPLOY_MESSAGES = [
  'Updated monitoring rules',
  'Deployed new scan heuristic v2.4',
  'Activated threat detection matrix',
  'Synchronized agent communication protocol',
  'Pushed config update to all nodes',
];

// Autonomous action messages
const AUTONOMOUS_MESSAGES = {
  'Auto Scan': [
    'Scanning and categorizing {n} files',
    'Deep scan found {n} uncategorized items',
    'File analysis complete: {n} patterns detected',
    'Catalogued {n} files across {m} directories',
  ],
  'Suggest Cleanup': [
    'Found {n} duplicate files for cleanup',
    'Identified {n} empty or stale files',
    'Cleanup report: {n} items can be removed',
    'Found {n} redundant temp files',
  ],
  'Auto Organize': [
    'Organized {n} files into {m} categories',
    'Grouped {n} files by type and size',
    'Restructured {n} folders for efficiency',
    'Auto-sorted {n} items into proper directories',
  ],
  'Health Monitor': [
    'System health: {n}% optimal',
    'Health scan: {n} components checked, all green',
    'Performance metrics within {n}% of baseline',
    'All {n} subsystems reporting nominal',
  ],
};

// Helper: weighted random action selection based on personality
function pickAction(classType) {
  const prefs = AGENT_PREFERENCES[classType] || {};
  const entries = ALL_ACTIONS.map(a => ({ action: a, weight: prefs[a] || 1 }));
  const totalWeight = entries.reduce((sum, e) => sum + e.weight, 0);
  let r = Math.random() * totalWeight;
  for (const e of entries) {
    r -= e.weight;
    if (r <= 0) return e.action;
  }
  return entries[entries.length - 1].action;
}

// Helper: random int in range
function randInt(min, max) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

// ═══════════════════════════════════════════════════════════════
// COMPONENTS
// ═══════════════════════════════════════════════════════════════

// ── Pixel Sprite (uses PNG image) ─────────────────────────────
function PixelSprite({ spriteKey, frame = 0, action = 'idle', direction = 1, scale = 3 }) {
  let offY = 0;
  if (action === 'idle' || action === 'walking' || action === 'working') {
    offY = frame % 2 === 0 ? 0 : -1;
  }
  return (
    <div style={{
      position: 'relative',
      width: 32 * scale / 3,
      height: 48 * scale / 3,
      transform: `scaleX(${direction}) translateY(${offY}px)`,
      imageRendering: 'pixelated',
    }}>
      <img
        src={`/sprites/${spriteKey}.png`}
        alt={spriteKey}
        style={{
          width: '100%',
          height: '100%',
          imageRendering: 'pixelated',
          objectFit: 'contain',
        }}
        draggable={false}
      />
    </div>
  );
}

// ── Typing VFX: small keyboard/letter particles ───────────────
function TypingVfx({ px, frame }) {
  const f = frame % 8;
  const letters = ['a','b','c','d','e','f','0','1'];
  return (
    <>
      {[0, 1, 2, 3].map(i => (
        <div key={i} style={{
          position: 'absolute',
          left: (4 + i * 4 + ((f + i) % 2)) * px / 3,
          top: (-6 - (f + i) % 4) * px / 3,
          fontFamily: 'monospace',
          fontSize: px * 2,
          color: '#00ddff',
          opacity: (f + i) % 3 === 0 ? 1 : 0.4,
          textShadow: '0 0 3px #00ddff',
          pointerEvents: 'none',
        }}>
          {letters[(f + i) % letters.length]}
        </div>
      ))}
    </>
  );
}

// ── Deploy VFX: upward arrow / raise effect ───────────────────
function DeployVfx({ px, frame }) {
  const f = frame % 6;
  return (
    <>
      {/* raised arm indicator - glowing upward arrow */}
      <div style={{
        position: 'absolute',
        left: 6 * px / 3,
        top: (-8 - f) * px / 3,
        width: 0, height: 0,
        borderLeft: `${px}px solid transparent`,
        borderRight: `${px}px solid transparent`,
        borderBottom: `${px * 2}px solid #44ff44`,
        opacity: f % 2 === 0 ? 1 : 0.6,
        filter: `drop-shadow(0 0 ${px}px #44ff44)`,
      }} />
      {/* expanding ring */}
      <div style={{
        position: 'absolute',
        left: (4 - f) * px / 3,
        top: (-4 - f) * px / 3,
        width: (8 + f * 2) * px / 3,
        height: (8 + f * 2) * px / 3,
        border: `1px solid #44ff44`,
        borderRadius: '50%',
        opacity: 0.3 + (6 - f) * 0.1,
      }} />
    </>
  );
}

// ── Alert VFX: flashing red border glow ───────────────────────
function AlertVfx({ px, frame }) {
  const flash = frame % 4 < 2;
  return (
    <div style={{
      position: 'absolute',
      left: -2 * px / 3,
      top: -2 * px / 3,
      width: 20 * px / 3,
      height: 28 * px / 3,
      border: `2px solid ${flash ? '#ff4444' : '#ff8888'}`,
      borderRadius: px,
      boxShadow: flash
        ? `0 0 ${px * 3}px #ff4444, inset 0 0 ${px * 2}px rgba(255,68,68,0.2)`
        : `0 0 ${px}px #ff444488`,
      pointerEvents: 'none',
      animation: 'alertFlash 0.4s infinite',
    }} />
  );
}

// ── Animated Sprite with effects + evolution ────────────────
function AnimatedSprite({ spriteKey, frame, action, direction, scale = 3, trait, level, mood, badges }) {
  let offY = 0;
  if (action === 'idle') offY = frame % 2 === 0 ? 0 : -1;
  else if (action === 'walking') offY = frame % 2 === 0 ? 0 : -3;
  else if (action === 'working') offY = frame % 2 === 0 ? 0 : -1;
  else if (action === 'thinking' || action === 'collaborating') offY = -1;
  else if (action === 'typing') offY = frame % 3 === 0 ? -1 : 0;
  else if (action === 'alert') offY = frame % 4 < 2 ? 0 : -1;
  else if (action === 'deploying') offY = frame % 3 === 0 ? -3 : 0;

  const isAlert = action === 'alert';
  const isWalking = action === 'walking';

  // Evolution: level-based scaling (every 3 levels adds +0.5 to scale, capped)
  const levelBonus = Math.min(2, Math.floor((level - 1) / 3) * 0.5);
  const evolvedScale = scale + levelBonus;

  // Evolution: trait-based CSS filter
  const traitFilter = trait && TRAIT_FILTERS[trait]
    ? `hue-rotate(${TRAIT_FILTERS[trait].hueRotate}deg) saturate(${TRAIT_FILTERS[trait].saturate}) brightness(${TRAIT_FILTERS[trait].brightness})`
    : '';

  // Evolution: mood-based box-shadow on the sprite wrapper
  const moodEffects = MOOD_EFFECTS[mood];
  const moodShadow = moodEffects?.glowColor
    ? `0 0 ${scale * 3}px ${moodEffects.glowColor}66`
    : moodEffects?.auraColor
      ? `0 0 ${scale * 2}px ${moodEffects.auraColor}44`
      : '';

  return (
    <div style={{
      position: 'relative',
      width: 32 * evolvedScale / 3,
      height: 48 * evolvedScale / 3,
      transform: `scaleX(${direction}) translateY(${offY}px)`,
      imageRendering: 'pixelated',
    }}>
      {/* Mood glow behind sprite */}
      <MoodGlow mood={mood} scale={evolvedScale} />
      <img
        src={`/sprites/${spriteKey}.png`}
        alt={spriteKey}
        style={{
          width: '100%',
          height: '100%',
          imageRendering: 'pixelated',
          objectFit: 'contain',
          filter: [
            traitFilter,
            isAlert && frame % 4 < 2 ? 'brightness(1.5) saturate(2) hue-rotate(-10deg)' : '',
          ].filter(Boolean).join(' ') || undefined,
          ...(moodShadow ? { boxShadow: moodShadow } : {}),
        }}
        draggable={false}
      />
      {action === 'working' && <WorkVfx spriteKey={spriteKey} px={evolvedScale} frame={frame} />}
      {action === 'typing' && <TypingVfx px={evolvedScale} frame={frame} />}
      {action === 'deploying' && <DeployVfx px={evolvedScale} frame={frame} />}
      {isAlert && <AlertVfx px={evolvedScale} frame={frame} />}
      {(action === 'thinking' || action === 'collaborating') && <ThoughtBubble px={evolvedScale} />}
      {/* walking dust particles */}
      {isWalking && frame % 3 === 0 && (
        <div style={{
          position: 'absolute', bottom: -2, left: direction > 0 ? -4 : 20,
          width: evolvedScale, height: evolvedScale,
          backgroundColor: '#555', borderRadius: '50%',
          opacity: 0.4,
        }} />
      )}
      {/* Evolution mood particles */}
      <MoodParticles mood={mood} frame={frame} scale={evolvedScale} />
      {/* Evolution badges */}
      <EvolutionBadge badges={badges} scale={evolvedScale} />
      {/* Level indicator */}
      <LevelIndicator level={level} scale={evolvedScale} />
    </div>
  );
}

// ── Work effects per class ────────────────────────────────────
function WorkVfx({ spriteKey, px, frame }) {
  const f = frame % 6;
  switch (spriteKey) {
    case 'mage':
    case 'oracle':
      return (
        <>
          {[[-4,-6],[14,-8],[18,-2],[-2,4]].map(([ox,oy], i) => (
            <div key={i} style={{
              position: 'absolute',
              left: (ox + ((f + i) % 2)) * px / 3,
              top: (oy + ((f + i) % 3 === 0 ? -1 : 0)) * px / 3,
              width: px, height: px,
              backgroundColor: spriteKey === 'oracle' ? '#66ffff' : '#66ddff',
              opacity: (f + i) % 3 === 0 ? 1 : 0.4,
              boxShadow: `0 0 ${px * 2}px ${spriteKey === 'oracle' ? '#66ffff' : '#66ddff'}`,
            }} />
          ))}
        </>
      );
    case 'knight':
      return (
        <div style={{
          position: 'absolute', right: -px * 5, top: px * 6 + (f < 3 ? 0 : px * 2),
          width: px * 2, height: px * 5,
          backgroundColor: '#ccc', border: '1px solid #222',
          transform: `rotate(${f % 2 === 0 ? -20 : 20}deg)`,
        }} />
      );
    case 'sage':
    case 'cleric':
      return (
        <div style={{
          position: 'absolute', right: -px * 6, top: px * 8,
          width: px * 4, height: px * 5,
          backgroundColor: spriteKey === 'cleric' ? '#ffcc00' : '#885522',
          border: '1px solid #222', opacity: f % 3 === 0 ? 1 : 0.7,
        }}>
          <div style={{ width: '60%', height: '60%', margin: '18% auto', backgroundColor: '#ffffcc' }} />
        </div>
      );
    case 'ranger':
      return (
        <div style={{
          position: 'absolute', right: -px * 7, top: px * 4,
          width: px, height: px, backgroundColor: '#44ff44',
          boxShadow: `0 0 ${px*3}px #44ff44, ${px}px ${px}px 0 0 #44ff44, ${-px}px ${px}px 0 0 #44ff44`,
          opacity: f % 2 === 0 ? 1 : 0.5,
        }} />
      );
    case 'assassin':
      return (
        <div style={{
          position: 'absolute', left: 0, top: 0,
          width: 16 * px, height: 24 * px,
          backgroundColor: 'rgba(0,0,0,0.35)',
          opacity: f % 3 === 0 ? 0.5 : 0.15,
        }} />
      );
    case 'engineer':
      return (
        <div style={{
          position: 'absolute', right: -px * 5, top: px * 6,
          width: px * 2, height: px * 5,
          backgroundColor: '#999', border: '1px solid #222',
          transform: `rotate(${f * 15}deg)`, transformOrigin: 'bottom center',
        }} />
      );
    default:
      return null;
  }
}

// ── Thought bubble ────────────────────────────────────────────
function ThoughtBubble({ px }) {
  return (
    <div style={{ position: 'absolute', top: -px * 7, left: px * 8 }}>
      <div style={{
        width: px * 7, height: px * 4,
        backgroundColor: '#fff', border: '1px solid #222',
        borderRadius: px * 2, display: 'flex',
        alignItems: 'center', justifyContent: 'center', gap: px,
      }}>
        {[0,1,2].map(i => (
          <div key={i} style={{ width: px, height: px, backgroundColor: '#222', borderRadius: '50%' }} />
        ))}
      </div>
      <div style={{
        width: px * 2, height: px * 2,
        backgroundColor: '#fff', border: '1px solid #222', borderRadius: '50%',
        position: 'absolute', bottom: -px * 2, left: px * 2,
      }} />
      <div style={{
        width: px, height: px,
        backgroundColor: '#fff', border: '1px solid #222', borderRadius: '50%',
        position: 'absolute', bottom: -px * 3.5, left: -px,
      }} />
    </div>
  );
}

// ── Mood Particles: VFX based on agent mood ──────────────────
function MoodParticles({ mood, frame, scale = 3 }) {
  const effects = MOOD_EFFECTS[mood];
  if (!effects) return null;

  const f = frame % 24;

  // Happy: gold sparkles floating upward
  if (effects.particleColor) {
    return (
      <>
        {[0, 1, 2, 3, 4].map(i => {
          const phase = (f + i * 5) % 24;
          const x = 4 + (i * 3) + Math.sin(phase * 0.5) * 3;
          const y = -phase * 0.8;
          const opacity = Math.max(0, 1 - phase / 24);
          return (
            <div key={i} style={{
              position: 'absolute',
              left: x * scale / 3,
              top: y * scale / 3,
              width: scale * 0.7,
              height: scale * 0.7,
              backgroundColor: effects.particleColor,
              opacity,
              boxShadow: `0 0 ${scale}px ${effects.particleColor}`,
              pointerEvents: 'none',
              transform: `rotate(${phase * 15}deg)`,
            }} />
          );
        })}
      </>
    );
  }

  return null;
}

// ── Mood Glow: box-shadow effects based on mood ──────────────
function MoodGlow({ mood, scale = 3 }) {
  const effects = MOOD_EFFECTS[mood];
  if (!effects || (!effects.glowColor && !effects.auraColor)) return null;

  const color = effects.glowColor || effects.auraColor;
  const isGlow = !!effects.glowColor;

  return (
    <div style={{
      position: 'absolute',
      left: -scale * 2,
      top: -scale * 2,
      width: 32 * scale / 3 + scale * 4,
      height: 48 * scale / 3 + scale * 4,
      borderRadius: scale,
      pointerEvents: 'none',
      boxShadow: isGlow
        ? `0 0 ${scale * 4}px ${color}88, inset 0 0 ${scale * 2}px ${color}22`
        : `0 0 ${scale * 3}px ${color}44, 0 0 ${scale * 6}px ${color}22`,
      border: isGlow ? `1px solid ${color}66` : 'none',
      animation: isGlow ? 'moodGlowPulse 0.6s infinite' : 'none',
    }} />
  );
}

// ── Evolution Badge Display ──────────────────────────────────
function EvolutionBadge({ badges, scale = 3 }) {
  if (!badges || badges.length === 0) return null;
  // Show only the most recent 3 badges
  const recent = badges.slice(-3);
  return (
    <div style={{
      position: 'absolute',
      top: -scale * 4.5,
      left: -scale * 2,
      display: 'flex',
      gap: 2,
      pointerEvents: 'none',
    }}>
      {recent.map((badgeId, i) => {
        const milestone = MILESTONES.find(m => m.id === badgeId);
        if (!milestone) return null;
        return (
          <div key={badgeId} title={milestone.title} style={{
            fontSize: scale * 1.2,
            lineHeight: 1,
            textShadow: `0 0 ${scale}px #ffaa00`,
            animation: 'badgeGlow 2s infinite',
            animationDelay: `${i * 0.3}s`,
          }}>
            {milestone.label}
          </div>
        );
      })}
    </div>
  );
}

// ── Level Indicator ──────────────────────────────────────────
function LevelIndicator({ level, scale = 3 }) {
  return (
    <div style={{
      position: 'absolute',
      top: -scale * 2,
      right: -scale * 3,
      fontFamily: '"Press Start 2P", monospace',
      fontSize: 6,
      color: '#ffaa00',
      textShadow: '0 0 3px #ffaa00',
      backgroundColor: '#0a0a1aCC',
      padding: '1px 3px',
      borderRadius: 2,
      border: '1px solid #ffaa0044',
      pointerEvents: 'none',
      whiteSpace: 'nowrap',
    }}>
      LV{level}
    </div>
  );
}

// ── HP Bar ────────────────────────────────────────────────────
function HPBar({ value, max = 100 }) {
  const pct = Math.max(0, Math.min(100, (value / max) * 100));
  const color = pct > 60 ? COLORS.hpGreen : pct > 30 ? COLORS.hpYellow : COLORS.hpRed;
  return (
    <div style={{
      width: '100%', height: 8,
      backgroundColor: '#1a1a2e', border: '1px solid #222',
      borderRadius: 2, overflow: 'hidden',
    }}>
      <div style={{
        width: `${pct}%`, height: '100%',
        backgroundColor: color, transition: 'width 0.5s ease',
        boxShadow: `0 0 4px ${color}`,
      }} />
    </div>
  );
}

// ── Nameplate ─────────────────────────────────────────────────
function Nameplate({ name, className, selected, onClick }) {
  return (
    <div onClick={onClick} style={{
      cursor: 'pointer',
      padding: '2px 6px',
      backgroundColor: selected ? '#00ff8822' : '#0a0a1a88',
      border: `1px solid ${selected ? COLORS.border : '#333'}`,
      borderRadius: 3, textAlign: 'center', minWidth: 70,
    }}>
      <div style={{
        fontFamily: '"Press Start 2P", monospace', fontSize: 7,
        color: COLORS.textPrimary, textShadow: `0 0 4px ${COLORS.textPrimary}`,
        whiteSpace: 'nowrap',
      }}>{name}</div>
      <div style={{
        fontFamily: '"Press Start 2P", monospace', fontSize: 5,
        color: COLORS.textSecondary, opacity: 0.8,
      }}>{className}</div>
    </div>
  );
}

// ── Action Log Entry ──────────────────────────────────────────
function LogEntry({ entry }) {
  const isAlert = entry.isAlert;
  const isCollab = entry.isCollab;
  return (
    <div style={{
      padding: '3px 8px', borderBottom: '1px solid #1a1a2e',
      fontFamily: 'monospace', fontSize: 11,
      display: 'flex', gap: 8, alignItems: 'center',
      ...(isAlert ? { backgroundColor: 'rgba(255,68,68,0.12)', borderLeft: '3px solid #ff4444' } : {}),
      ...(isCollab ? { backgroundColor: 'rgba(0,221,255,0.08)', borderLeft: '3px solid #00ddff' } : {}),
    }}>
      <span style={{ color: COLORS.textSecondary, fontSize: 9, minWidth: 55 }}>{entry.time}</span>
      <span style={{ color: entry.color, fontWeight: 'bold', minWidth: 60 }}>{entry.agent}</span>
      <span style={{
        color: isAlert ? '#ff6666' : COLORS.textPrimary,
        opacity: 0.9,
        fontWeight: isAlert ? 'bold' : 'normal',
      }}>{entry.action}</span>
      {entry.detail && (
        <span style={{
          color: isAlert ? '#ff8888' : isCollab ? '#00ddff' : COLORS.textAccent,
          fontSize: 10,
        }}>— {entry.detail}</span>
      )}
    </div>
  );
}

// ── Agent Detail Sidebar ──────────────────────────────────────
function DetailPanel({ agent, onDeselect }) {
  if (!agent) {
    return (
      <div style={{
        flex: '0 0 240px', backgroundColor: COLORS.panelBg,
        border: `1px solid ${COLORS.panelBorder}`, borderRadius: 4,
        padding: 16, display: 'flex', alignItems: 'center', justifyContent: 'center',
        color: '#444', fontFamily: 'monospace', fontSize: 12, textAlign: 'center',
      }}>
        Click an agent<br />to view details
      </div>
    );
  }
  const d = agent.def;
  const s = agent.state;
  return (
    <div style={{
      flex: '0 0 240px', backgroundColor: COLORS.panelBg,
      border: `1px solid ${COLORS.border}44`, borderRadius: 4,
      padding: 12, overflow: 'auto',
    }}>
      {/* header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
        <div style={{
          fontFamily: '"Press Start 2P", monospace', fontSize: 10,
          color: COLORS.textPrimary, textShadow: `0 0 6px ${COLORS.textPrimary}`,
        }}>{d.className}</div>
        <button onClick={onDeselect} style={{
          background: 'none', border: `1px solid ${COLORS.border}44`,
          color: COLORS.textPrimary, cursor: 'pointer',
          fontFamily: 'monospace', fontSize: 10, padding: '2px 6px', borderRadius: 2,
        }}>✕</button>
      </div>
      {/* sprite preview with evolution */}
      <div style={{ display: 'flex', justifyContent: 'center', margin: '12px 0', transform: 'scale(2)', transformOrigin: 'center center' }}>
        <PixelSprite spriteKey={d.classType} scale={3} />
      </div>
      {/* stats */}
      <div style={{ marginTop: 24 }}>
        {[
          ['Name', d.name],
          ['Status', s.action],
          ['Tasks', s.tasksDone],
          ['Level', `LV${s.level} (${s.xp} XP)`],
          ['Mood', s.mood.charAt(0).toUpperCase() + s.mood.slice(1)],
          ['Trait', dominantTrait(s.traits).charAt(0).toUpperCase() + dominantTrait(s.traits).slice(1)],
        ].map(([label, val]) => (
          <div key={label} style={{ fontFamily: 'monospace', fontSize: 11, marginBottom: 4 }}>
            <span style={{ color: COLORS.textSecondary }}>{label}:</span>{' '}
            <span style={{ color: COLORS.textPrimary }}>{val}</span>
          </div>
        ))}
        <div style={{ fontFamily: 'monospace', fontSize: 11, marginBottom: 2, color: COLORS.textSecondary }}>Activity:</div>
        <HPBar value={s.hp} />
        {/* Badges */}
        {s.badges.length > 0 && (
          <div style={{ marginTop: 8 }}>
            <div style={{ fontFamily: '"Press Start 2P", monospace', fontSize: 7, color: COLORS.textSecondary, marginBottom: 4 }}>
              BADGES
            </div>
            <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
              {s.badges.map(badgeId => {
                const ms = MILESTONES.find(m => m.id === badgeId);
                if (!ms) return null;
                return (
                  <span key={badgeId} title={ms.title} style={{
                    fontSize: 9, padding: '2px 4px',
                    backgroundColor: '#ffaa0022', border: '1px solid #ffaa0044',
                    borderRadius: 2, color: '#ffaa00',
                    textShadow: '0 0 3px #ffaa00',
                  }}>
                    {ms.label} {ms.title}
                  </span>
                );
              })}
            </div>
          </div>
        )}
        {/* Trait bars */}
        <div style={{ marginTop: 8 }}>
          <div style={{ fontFamily: '"Press Start 2P", monospace', fontSize: 7, color: COLORS.textSecondary, marginBottom: 4 }}>
            TRAITS
          </div>
          {Object.entries(s.traits).sort((a, b) => b[1] - a[1]).map(([trait, value]) => (
            <div key={trait} style={{ marginBottom: 3 }}>
              <div style={{ fontFamily: 'monospace', fontSize: 9, color: COLORS.textSecondary, display: 'flex', justifyContent: 'space-between' }}>
                <span>{trait}</span><span>{value}</span>
              </div>
              <div style={{ width: '100%', height: 4, backgroundColor: '#1a1a2e', borderRadius: 2, overflow: 'hidden' }}>
                <div style={{
                  width: `${Math.min(100, value)}%`, height: '100%',
                  backgroundColor: TRAIT_FILTERS[trait] ? `hsl(${TRAIT_FILTERS[trait].hueRotate}, 70%, 55%)` : COLORS.textPrimary,
                  transition: 'width 0.5s ease',
                  boxShadow: `0 0 3px ${COLORS.textPrimary}`,
                }} />
              </div>
            </div>
          ))}
        </div>
      </div>
      {/* description */}
      <div style={{
        marginTop: 12, padding: 8, backgroundColor: '#0a0a1a',
        border: '1px solid #1a1a2e', borderRadius: 3,
        fontFamily: 'monospace', fontSize: 10, color: '#888', lineHeight: 1.5,
      }}>{d.desc}</div>
      {/* history */}
      <div style={{ marginTop: 12 }}>
        <div style={{
          fontFamily: '"Press Start 2P", monospace', fontSize: 7,
          color: COLORS.textSecondary, marginBottom: 6,
        }}>RECENT ACTIONS</div>
        {s.history.slice(-8).reverse().map((h, i) => (
          <div key={i} style={{
            fontFamily: 'monospace', fontSize: 9, color: '#666',
            padding: '2px 0', borderBottom: '1px solid #111',
          }}>
            <span style={{ color: '#555' }}>{h.time}</span>{' '}
            <span style={{ color: h.isAlert ? '#ff6666' : COLORS.textPrimary, opacity: 0.7 }}>{h.action}</span>
            {h.detail && <span style={{ color: h.isAlert ? '#ff8888' : COLORS.textAccent, opacity: 0.6 }}> — {h.detail}</span>}
          </div>
        ))}
      </div>
    </div>
  );
}

// ── API HELPER ────────────────────────────────────────────────
async function fetchDesktop(ep) {
  try {
    const r = await fetch(`/api/desktop/${ep}`);
    if (!r.ok) throw new Error(r.status);
    return await r.json();
  } catch { return null; }
}

// ── AUTONOMOUS API HELPER ───────────────────────────────────
async function fetchAutonomous(ep, method = 'GET') {
  try {
    const opts = { method, headers: { 'Content-Type': 'application/json' } };
    const r = await fetch(`/api/desktop/autonomous/${ep}`, opts);
    if (!r.ok) throw new Error(r.status);
    return await r.json();
  } catch { return null; }
}

function summarize(action, data) {
  if (!data) return 'No data returned';
  switch (action) {
    case 'Scan Files':
      return data.files ? `Found ${data.files.length} files` : data.count ? `${data.count} files` : 'Scan complete';
    case 'Check System':
      return data.cpu != null ? `CPU ${data.cpu}% | RAM ${data.memory || data.ram || '?'}%` : 'Check done';
    case 'Monitor Processes':
      return data.processes ? `${data.processes.length} processes` : data.count ? `${data.count} procs` : 'Monitor done';
    case 'Observe Desktop':
      return data.windows ? `${data.windows.length} windows` : data.screenshot ? 'Screenshot captured' : 'Observe done';
    case 'Auto Scan':
      return data.categorized ? `${data.categorized} files categorized` : data.files ? `${data.files.length} files scanned` : 'Auto scan complete';
    case 'Suggest Cleanup':
      return data.duplicates ? `${data.duplicates} duplicates found` : data.suggestions ? `${data.suggestions} cleanup items` : 'Cleanup analysis done';
    case 'Auto Organize':
      return data.groups ? `${data.groups} groups created` : data.organized ? `${data.organized} files organized` : 'Organization complete';
    case 'Health Monitor':
      return data.health != null ? `Health: ${data.health}%` : data.status ? `Status: ${data.status}` : 'Health check done';
    default: return 'Done';
  }
}

// ═══════════════════════════════════════════════════════════════
// MAIN COMPONENT
// ═══════════════════════════════════════════════════════════════
export default function AgentWorkspace() {
  const [agents, setAgents] = useState(() => AGENT_DEFS.map((def, i) => {
    // Assign initial random trait bias
    const initialTraits = {};
    TRAIT_NAMES.forEach(t => { initialTraits[t] = Math.floor(Math.random() * 20) + 5; });
    // Boost one random trait to be dominant
    initialTraits[TRAIT_NAMES[i % TRAIT_NAMES.length]] += 25;

    return {
      def,
      state: {
        x: 40 + (i % 4) * 130 + Math.random() * 30,
        y: 80 + Math.floor(i / 4) * 200 + Math.random() * 40,
        homeX: 40 + (i % 4) * 130 + Math.random() * 30,
        homeY: 80 + Math.floor(i / 4) * 200 + Math.random() * 40,
        dir: 1,
        action: 'idle',
        frame: 0,
        hp: 100,
        tasksDone: 0,
        history: [],
        busy: false,
        // Evolution state
        level: 1,
        xp: 0,
        mood: 'neutral',
        traits: initialTraits,
        badges: [],
      },
    };
  }));
  const [selIdx, setSelIdx] = useState(null);
  const [log, setLog] = useState([]);
  const [tick, setTick] = useState(0);
  const [autonomousMode, setAutonomousMode] = useState(false);
  const [autonomousFeed, setAutonomousFeed] = useState([]);
  const timers = useRef({});
  const positionsRef = useRef({});
  const busyRef = useRef(new Set()); // track busy agent indices

  // Initialize positions ref from initial state
  useEffect(() => {
    agents.forEach((a, i) => {
      positionsRef.current[i] = { x: a.state.x, y: a.state.y };
    });
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // animation tick
  useEffect(() => {
    const t = setInterval(() => setTick(f => f + 1), 250);
    return () => clearInterval(t);
  }, []);

  // load pixel font
  useEffect(() => {
    const l = document.createElement('link');
    l.href = 'https://fonts.googleapis.com/css2?family=Press+Start+2P&display=swap';
    l.rel = 'stylesheet';
    document.head.appendChild(l);
  }, []);

  const addLog = useCallback((name, action, detail, color, flags = {}) => {
    const t = new Date().toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
    setLog(prev => [...prev.slice(-100), { time: t, agent: name, action, detail, color, ...flags }]);
  }, []);

  // ── Walk animation: smoothly move agent to target position ──
  const walkTo = useCallback((agentIdx, targetX, targetY, duration = 2500) => {
    return new Promise(resolve => {
      const startPos = { ...positionsRef.current[agentIdx] };
      if (!startPos.x && startPos.x !== 0) {
        startPos.x = 40 + (agentIdx % 4) * 130;
        startPos.y = 80 + Math.floor(agentIdx / 4) * 200;
      }
      const dx = targetX - startPos.x;
      const dy = targetY - startPos.y;
      const distance = Math.sqrt(dx * dx + dy * dy);

      // If already very close, just resolve
      if (distance < 5) {
        resolve();
        return;
      }

      const dir = dx >= 0 ? 1 : -1;
      const steps = Math.max(15, Math.floor(distance / 4)); // ~4px per step
      const stepDuration = Math.max(60, Math.floor(duration / steps));
      let currentStep = 0;

      // Set walking state with direction
      setAgents(prev => {
        const n = [...prev];
        n[agentIdx] = { ...n[agentIdx], state: { ...n[agentIdx].state, action: 'walking', dir } };
        return n;
      });

      const interval = setInterval(() => {
        currentStep++;
        const progress = Math.min(1, currentStep / steps);
        // Ease-in-out for natural movement
        const eased = progress < 0.5
          ? 2 * progress * progress
          : 1 - Math.pow(-2 * progress + 2, 2) / 2;

        const newX = startPos.x + dx * eased;
        const newY = startPos.y + dy * eased;

        positionsRef.current[agentIdx] = { x: newX, y: newY };

        setAgents(prev => {
          const n = [...prev];
          n[agentIdx] = {
            ...n[agentIdx],
            state: {
              ...n[agentIdx].state,
              x: newX,
              y: newY,
              frame: currentStep,
            }
          };
          return n;
        });

        if (currentStep >= steps) {
          clearInterval(interval);
          positionsRef.current[agentIdx] = { x: targetX, y: targetY };
          // Ensure final position is exact
          setAgents(prev => {
            const n = [...prev];
            n[agentIdx] = {
              ...n[agentIdx],
              state: { ...n[agentIdx].state, x: targetX, y: targetY }
            };
            return n;
          });
          resolve();
        }
      }, stepDuration);
    });
  }, []);

  // ── Perform a full action cycle for agent i ─────────────────
  const doAction = useCallback(async (i) => {
    // Prevent overlapping actions
    if (busyRef.current.has(i)) return;
    busyRef.current.add(i);

    try {
      const a = agents[i];
      if (!a) return;

      // Pick action based on personality
      const act = pickAction(a.def.classType);

      // Special handling for Collaborate - needs a partner
      if (act === 'Collaborate') {
        // Find a non-busy partner
        const partners = agents
          .map((ag, idx) => idx)
          .filter(idx => idx !== i && !busyRef.current.has(idx));

        if (partners.length === 0) {
          // No partner available, fall back to a solo action
          await doSoloAction(i, 'Write Report');
          return;
        }

        const partnerIdx = partners[Math.floor(Math.random() * partners.length)];
        busyRef.current.add(partnerIdx);
        try {
          await doCollaborateAction(i, partnerIdx);
        } finally {
          busyRef.current.delete(partnerIdx);
        }
        return;
      }

      await doSoloAction(i, act);
    } finally {
      busyRef.current.delete(i);
    }
  }, [agents, addLog]);

  // ── Solo action (non-collaborate) ───────────────────────────
  const doSoloAction = useCallback(async (i, act) => {
    const a = agents[i];
    if (!a) return;
    const agentName = a.def.name;
    const agentColor = a.def.color;

    // Phase 1: Thinking pause
    setAgents(prev => {
      const n = [...prev];
      n[i] = { ...n[i], state: { ...n[i].state, action: 'thinking' } };
      return n;
    });
    addLog(agentName, `Starting: ${act}`, null, agentColor);
    await new Promise(r => setTimeout(r, 600 + Math.random() * 400));

    // Phase 2: Walk to target
    const target = ACTION_TARGETS[act];
    const currentPos = positionsRef.current[i] || { x: a.state.x, y: a.state.y };

    if (target) {
      // Add some randomness to target position
      const tx = target.x + (Math.random() - 0.5) * 40;
      const ty = target.y + (Math.random() - 0.5) * 30;
      await walkTo(i, tx, ty, 2000 + Math.random() * 1000);
    }
    // If target is null (e.g., Alert), agent stays in place

    // Phase 3: Perform action animation
    let actionState = 'working';
    let actionDuration = 1200;
    let detail = '';

    switch (act) {
      case 'Scan Files': {
        actionState = 'working';
        actionDuration = 1500;
        const data = await fetchDesktop('files');
        detail = summarize(act, data);
        break;
      }
      case 'Check System': {
        actionState = 'working';
        actionDuration = 1200;
        const data = await fetchDesktop('system');
        detail = summarize(act, data);
        break;
      }
      case 'Monitor Processes': {
        actionState = 'working';
        actionDuration = 1400;
        const data = await fetchDesktop('apps');
        detail = summarize(act, data);
        break;
      }
      case 'Observe Desktop': {
        actionState = 'working';
        actionDuration = 1300;
        const data = await fetchDesktop('observe');
        detail = summarize(act, data);
        break;
      }
      case 'Write Report': {
        actionState = 'typing';
        actionDuration = 3000 + Math.random() * 1000;
        const snippet = REPORT_SNIPPETS[Math.floor(Math.random() * REPORT_SNIPPETS.length)];
        detail = 'Report: ' + snippet.replace('{n}', randInt(5, 99));
        break;
      }
      case 'Alert': {
        actionState = 'alert';
        actionDuration = 2000;
        const msg = ALERT_MESSAGES[Math.floor(Math.random() * ALERT_MESSAGES.length)];
        detail = msg;
        addLog(agentName, `ALERT: ${msg}`, null, '#ff4444', { isAlert: true });
        break;
      }
      case 'Deploy': {
        actionState = 'deploying';
        actionDuration = 2500;
        const msg = DEPLOY_MESSAGES[Math.floor(Math.random() * DEPLOY_MESSAGES.length)];
        detail = `Deployed: ${msg}`;
        break;
      }
      case 'Auto Scan': {
        actionState = 'working';
        actionDuration = 2000;
        const data = await fetchAutonomous('scan', 'POST');
        detail = summarize(act, data);
        break;
      }
      case 'Suggest Cleanup': {
        actionState = 'working';
        actionDuration = 1800;
        const data = await fetchAutonomous('suggest', 'POST');
        detail = summarize(act, data);
        break;
      }
      case 'Auto Organize': {
        actionState = 'working';
        actionDuration = 2200;
        const data = await fetchAutonomous('organize', 'POST');
        detail = summarize(act, data);
        break;
      }
      case 'Health Monitor': {
        actionState = 'working';
        actionDuration = 1500;
        const data = await fetchAutonomous('monitor');
        detail = summarize(act, data);
        break;
      }
      default: {
        actionState = 'working';
        actionDuration = 1200;
        detail = 'Done';
      }
    }

    setAgents(prev => {
      const n = [...prev];
      n[i] = { ...n[i], state: { ...n[i].state, action: actionState, frame: 0 } };
      return n;
    });

    // Only log if not already logged (Alert logs during setup)
    if (act !== 'Alert') {
      addLog(agentName, act, detail, agentColor);
    }

    await new Promise(r => setTimeout(r, actionDuration));

    // Phase 4: Walk back home
    const homeX = a.state.homeX + (Math.random() - 0.5) * 20;
    const homeY = a.state.homeY + (Math.random() - 0.5) * 20;
    await walkTo(i, homeX, homeY, 1800 + Math.random() * 800);

    // Phase 5: Return to idle with evolution updates
    const isAutonomous = ['Auto Scan', 'Suggest Cleanup', 'Auto Organize', 'Health Monitor'].includes(act);
    setAgents(prev => {
      const n = [...prev];
      const old = n[i].state;
      const now = new Date().toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
      const isAlertAction = act === 'Alert';

      // Evolution: gain XP based on action
      const xpGain = isAlertAction ? 15 : act === 'Deploy' ? 20 : act === 'Collaborate' ? 18 : 10;
      const newXp = old.xp + xpGain;
      const newLevel = levelFromXp(newXp);
      const leveledUp = newLevel > old.level;

      // Evolution: boost traits based on action type
      const newTraits = { ...old.traits };
      if (['Scan Files', 'Auto Scan'].includes(act)) newTraits.curious = (newTraits.curious || 0) + 3;
      if (['Deploy', 'Check System'].includes(act)) newTraits.confident = (newTraits.confident || 0) + 3;
      if (['Write Report', 'Observe Desktop'].includes(act)) newTraits.creative = (newTraits.creative || 0) + 3;
      if (['Health Monitor', 'Auto Organize'].includes(act)) newTraits.patient = (newTraits.patient || 0) + 3;

      // Evolution: derive mood and check for new badges
      const newHistory = [...old.history.slice(-20), {
        time: now,
        action: isAlertAction ? `ALERT` : act,
        detail,
        isAlert: isAlertAction,
        isAutonomous,
      }];
      const newMood = deriveMood(newHistory, old.hp);

      // Evolution: check milestones
      const candidateState = { ...old, tasksDone: old.tasksDone + 1, level: newLevel, traits: newTraits };
      const newBadges = MILESTONES
        .filter(m => m.condition(candidateState) && !old.badges.includes(m.id))
        .map(m => m.id);
      const allBadges = [...old.badges, ...newBadges];

      // Log level ups and new badges
      if (leveledUp) {
        addLog(a.def.name, `⬆ LEVEL UP! Now LV${newLevel}`, null, '#ffaa00');
      }
      newBadges.forEach(badgeId => {
        const milestone = MILESTONES.find(m => m.id === badgeId);
        if (milestone) addLog(a.def.name, `🏅 Badge: ${milestone.title}`, null, '#ffcc00');
      });

      n[i] = {
        ...n[i],
        state: {
          ...old,
          action: 'idle',
          tasksDone: old.tasksDone + 1,
          hp: Math.max(10, Math.min(100, old.hp + Math.floor(Math.random() * 14) - 5)),
          history: newHistory,
          // Evolution updates
          xp: newXp,
          level: newLevel,
          mood: newMood,
          traits: newTraits,
          badges: allBadges,
        },
      };
      return n;
    });

    // Add to autonomous feed if it's an autonomous action
    if (isAutonomous) {
      const now = new Date().toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
      setAutonomousFeed(prev => [...prev.slice(-50), {
        time: now,
        agent: agentName,
        action: act,
        result: detail,
        color: agentColor,
      }]);
    }
  }, [agents, addLog, walkTo]);

  // ── Collaborate action: two agents meet in center ───────────
  const doCollaborateAction = useCallback(async (agentIdxA, agentIdxB) => {
    const a = agents[agentIdxA];
    const b = agents[agentIdxB];
    if (!a || !b) return;

    // Phase 1: Both think
    setAgents(prev => {
      const n = [...prev];
      n[agentIdxA] = { ...n[agentIdxA], state: { ...n[agentIdxA].state, action: 'thinking' } };
      n[agentIdxB] = { ...n[agentIdxB], state: { ...n[agentIdxB].state, action: 'thinking' } };
      return n;
    });
    addLog(`${a.def.name} + ${b.def.name}`, 'Collaborating...', null, '#00ddff', { isCollab: true });
    await new Promise(r => setTimeout(r, 800));

    // Phase 2: Both walk to meeting point (center area, slightly offset)
    const meetX = 280 + (Math.random() - 0.5) * 30;
    const meetY = 220 + (Math.random() - 0.5) * 20;

    // Walk both simultaneously
    await Promise.all([
      walkTo(agentIdxA, meetX - 30, meetY, 2200),
      walkTo(agentIdxB, meetX + 30, meetY, 2200),
    ]);

    // Phase 3: Both show thought bubbles (collaborating state)
    setAgents(prev => {
      const n = [...prev];
      n[agentIdxA] = { ...n[agentIdxA], state: { ...n[agentIdxA].state, action: 'collaborating', dir: 1 } };
      n[agentIdxB] = { ...n[agentIdxB], state: { ...n[agentIdxB].state, action: 'collaborating', dir: -1 } };
      return n;
    });

    const collabDetail = `${a.def.name} + ${b.def.name}: Cross-referencing findings`;
    addLog(`${a.def.name} + ${b.def.name}`, 'Collaborate', collabDetail, '#00ddff', { isCollab: true });

    await new Promise(r => setTimeout(r, 2500 + Math.random() * 500));

    // Phase 4: Both walk back home
    await Promise.all([
      walkTo(agentIdxA, a.state.homeX, a.state.homeY, 2000),
      walkTo(agentIdxB, b.state.homeX, b.state.homeY, 2000),
    ]);

    // Phase 5: Both return to idle with evolution updates
    const now = new Date().toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
    setAgents(prev => {
      const n = [...prev];
      const collabXpGain = 18;

      // Agent A evolution
      const oldA = n[agentIdxA].state;
      const newXpA = oldA.xp + collabXpGain;
      const newLevelA = levelFromXp(newXpA);
      const newTraitsA = { ...oldA.traits, creative: (oldA.traits.creative || 0) + 2, confident: (oldA.traits.confident || 0) + 1 };
      const newHistoryA = [...oldA.history.slice(-20), { time: now, action: 'Collaborate', detail: collabDetail, isCollab: true }];
      const newMoodA = deriveMood(newHistoryA, oldA.hp);
      const candidateA = { ...oldA, tasksDone: oldA.tasksDone + 1, level: newLevelA, traits: newTraitsA };
      const newBadgesA = MILESTONES.filter(m => m.condition(candidateA) && !oldA.badges.includes(m.id)).map(m => m.id);
      if (newLevelA > oldA.level) addLog(a.def.name, `⬆ LEVEL UP! Now LV${newLevelA}`, null, '#ffaa00');
      newBadgesA.forEach(bid => { const ms = MILESTONES.find(m => m.id === bid); if (ms) addLog(a.def.name, `🏅 Badge: ${ms.title}`, null, '#ffcc00'); });

      n[agentIdxA] = {
        ...n[agentIdxA],
        state: {
          ...oldA,
          action: 'idle',
          tasksDone: oldA.tasksDone + 1,
          hp: Math.max(10, Math.min(100, oldA.hp + Math.floor(Math.random() * 10) - 3)),
          history: newHistoryA,
          xp: newXpA,
          level: newLevelA,
          mood: newMoodA,
          traits: newTraitsA,
          badges: [...oldA.badges, ...newBadgesA],
        },
      };

      // Agent B evolution
      const oldB = n[agentIdxB].state;
      const newXpB = oldB.xp + collabXpGain;
      const newLevelB = levelFromXp(newXpB);
      const newTraitsB = { ...oldB.traits, creative: (oldB.traits.creative || 0) + 2, confident: (oldB.traits.confident || 0) + 1 };
      const newHistoryB = [...oldB.history.slice(-20), { time: now, action: 'Collaborate', detail: collabDetail, isCollab: true }];
      const newMoodB = deriveMood(newHistoryB, oldB.hp);
      const candidateB = { ...oldB, tasksDone: oldB.tasksDone + 1, level: newLevelB, traits: newTraitsB };
      const newBadgesB = MILESTONES.filter(m => m.condition(candidateB) && !oldB.badges.includes(m.id)).map(m => m.id);
      if (newLevelB > oldB.level) addLog(b.def.name, `⬆ LEVEL UP! Now LV${newLevelB}`, null, '#ffaa00');
      newBadgesB.forEach(bid => { const ms = MILESTONES.find(m => m.id === bid); if (ms) addLog(b.def.name, `🏅 Badge: ${ms.title}`, null, '#ffcc00'); });

      n[agentIdxB] = {
        ...n[agentIdxB],
        state: {
          ...oldB,
          action: 'idle',
          tasksDone: oldB.tasksDone + 1,
          hp: Math.max(10, Math.min(100, oldB.hp + Math.floor(Math.random() * 10) - 3)),
          history: newHistoryB,
          xp: newXpB,
          level: newLevelB,
          mood: newMoodB,
          traits: newTraitsB,
          badges: [...oldB.badges, ...newBadgesB],
        },
      };
      return n;
    });
  }, [agents, addLog, walkTo]);

  // auto-cycle: each agent acts every 5-8 s
  useEffect(() => {
    agents.forEach((_, i) => {
      const delay = 5000 + Math.random() * 3000;
      // stagger initial actions
      const initial = setTimeout(() => {
        doAction(i);
        timers.current[i] = setInterval(() => doAction(i), delay);
      }, i * 1200 + Math.random() * 2000);
      timers.current[`init_${i}`] = initial;
    });
    return () => {
      Object.values(timers.current).forEach(t => { clearTimeout(t); clearInterval(t); });
    };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const selected = selIdx != null ? agents[selIdx] : null;

  return (
    <div style={{
      width: '100%', height: '100vh', backgroundColor: COLORS.bg,
      display: 'flex', flexDirection: 'column',
      fontFamily: '"Press Start 2P", monospace',
      overflow: 'hidden', imageRendering: 'pixelated',
    }}>
      {/* ── Title Bar ─────────────────────────────────────── */}
      <div style={{
        flex: '0 0 48px', backgroundColor: '#0d0d22',
        borderBottom: `2px solid ${COLORS.border}`,
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        padding: '0 16px',
      }}>
        <div style={{
          fontSize: 14, color: COLORS.textPrimary,
          textShadow: `0 0 8px ${COLORS.textPrimary}, 0 0 16px ${COLORS.textPrimary}44`,
          letterSpacing: 3,
        }}>▶ AGENT WORKSPACE</div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
          <button
            onClick={() => setAutonomousMode(!autonomousMode)}
            style={{
              fontSize: 8, fontFamily: '"Press Start 2P", monospace',
              color: autonomousMode ? '#00ff88' : '#666',
              background: autonomousMode ? 'rgba(0,255,136,0.1)' : 'transparent',
              border: `1px solid ${autonomousMode ? '#00ff8844' : '#333'}`,
              padding: '3px 8px', borderRadius: 3, cursor: 'pointer',
              textShadow: autonomousMode ? '0 0 4px #00ff88' : 'none',
            }}
          >
            {autonomousMode ? '🤖 AUTO ON' : '🤖 AUTO OFF'}
          </button>
          <span style={{ fontSize: 9, color: COLORS.textSecondary }}>
            AGENTS: {agents.length}
          </span>
          <span style={{ fontSize: 9, color: COLORS.textAccent }}>● ONLINE</span>
        </div>
      </div>

      {/* ── Main Content ──────────────────────────────────── */}
      <div style={{ flex: 1, display: 'flex', overflow: 'hidden' }}>
        {/* workspace + log */}
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>

          {/* ── Workspace Floor ───────────────────────────── */}
          <div style={{
            flex: 1, position: 'relative',
            backgroundImage: `
              linear-gradient(45deg, ${COLORS.floor1} 25%, transparent 25%),
              linear-gradient(-45deg, ${COLORS.floor1} 25%, transparent 25%),
              linear-gradient(45deg, transparent 75%, ${COLORS.floor2} 75%),
              linear-gradient(-45deg, transparent 75%, ${COLORS.floor2} 75%)
            `,
            backgroundSize: '32px 32px',
            backgroundPosition: '0 0, 0 16px, 16px -16px, -16px 0',
            backgroundColor: COLORS.floor1,
            overflow: 'hidden', margin: 8, borderRadius: 4,
            border: `1px solid ${COLORS.border}44`,
          }}>
            {/* grid lines */}
            <div style={{
              position: 'absolute', inset: 0, pointerEvents: 'none',
              backgroundImage: `
                linear-gradient(${COLORS.border}06 1px, transparent 1px),
                linear-gradient(90deg, ${COLORS.border}06 1px, transparent 1px)
              `,
              backgroundSize: '32px 32px',
            }} />

            {/* area labels */}
            {[
              { label: '📁 FILES', x: 20, y: 10 },
              { label: '💻 SYSTEM', x: 220, y: 10 },
              { label: '📊 PROCESSES', x: 420, y: 10 },
              { label: '🖥 DESKTOP', x: 300, y: 320 },
            ].map((lbl, i) => (
              <div key={i} style={{
                position: 'absolute', left: lbl.x, top: lbl.y,
                fontSize: 7, color: '#334', fontFamily: '"Press Start 2P", monospace',
                pointerEvents: 'none', userSelect: 'none',
              }}>{lbl.label}</div>
            ))}

            {/* agents */}
            {agents.map((a, i) => {
              const s = a.state;
              const isSel = selIdx === i;
              return (
                <div
                  key={a.def.id}
                  onClick={() => setSelIdx(i)}
                  style={{
                    position: 'absolute',
                    left: s.x, top: s.y,
                    cursor: 'pointer',
                    // No CSS transition — position is updated incrementally during walk
                    zIndex: isSel ? 100 : Math.floor(s.y) + 10,
                  }}
                >
                  {/* selection ring */}
                  {isSel && (
                    <div style={{
                      position: 'absolute', left: -8, top: -8,
                      width: 64, height: 88,
                      border: `2px solid ${COLORS.border}`,
                      borderRadius: 4,
                      boxShadow: `0 0 12px ${COLORS.border}55`,
                      animation: 'pulse 1s infinite',
                    }} />
                  )}
                  {/* shadow */}
                  <div style={{
                    position: 'absolute', bottom: -4, left: 8,
                    width: 32, height: 6,
                    backgroundColor: 'rgba(0,0,0,0.45)',
                    borderRadius: '50%', filter: 'blur(2px)',
                    // Shadow stretches when walking
                    ...(s.action === 'walking' ? { width: 38, left: 5 } : {}),
                  }} />
                  {/* sprite */}
                  <AnimatedSprite
                    spriteKey={a.def.classType}
                    frame={tick + i * 3 + s.frame}
                    action={s.action}
                    direction={s.dir}
                    scale={3}
                    trait={dominantTrait(s.traits)}
                    level={s.level}
                    mood={s.mood}
                    badges={s.badges}
                  />
                  {/* status icon */}
                  {s.action !== 'idle' && (
                    <div style={{
                      position: 'absolute', top: -14, left: 16,
                      fontSize: 6, fontFamily: '"Press Start 2P", monospace',
                      color: s.action === 'alert' ? '#ff4444' : COLORS.textAccent,
                      textShadow: `0 0 4px ${s.action === 'alert' ? '#ff4444' : COLORS.textAccent}`,
                      whiteSpace: 'nowrap',
                      backgroundColor: '#0a0a1aCC', padding: '1px 4px', borderRadius: 2,
                    }}>
                      {s.action === 'thinking' ? '...'
                        : s.action === 'walking' ? '→'
                        : s.action === 'typing' ? '✎'
                        : s.action === 'alert' ? '⚠'
                        : s.action === 'deploying' ? '▲'
                        : s.action === 'collaborating' ? '💬'
                        : '⚡'}
                    </div>
                  )}
                  {/* nameplate & HP */}
                  <div style={{ position: 'absolute', bottom: -28, left: -14, width: 76 }}>
                    <Nameplate name={a.def.name} className={a.def.className} selected={isSel} />
                    <HPBar value={s.hp} />
                  </div>
                </div>
              );
            })}

            {/* active count */}
            <div style={{
              position: 'absolute', bottom: 6, right: 8,
              fontFamily: 'monospace', fontSize: 9, color: '#333',
            }}>
              {agents.filter(a => a.state.action !== 'idle').length} active
            </div>
          </div>

          {/* ── Action Log ────────────────────────────────── */}
          <div style={{
            flex: '0 0 130px', backgroundColor: COLORS.panelBg,
            border: `1px solid ${COLORS.border}44`, borderRadius: 4,
            margin: '0 8px 8px', overflow: 'auto',
          }}>
            <div style={{
              padding: '6px 8px', borderBottom: `1px solid ${COLORS.border}44`,
              fontFamily: '"Press Start 2P", monospace', fontSize: 8,
              color: COLORS.textSecondary, position: 'sticky', top: 0,
              backgroundColor: COLORS.panelBg, zIndex: 1,
            }}>▶ ACTION LOG</div>
            {log.length === 0 ? (
              <div style={{ padding: 16, textAlign: 'center', color: '#333', fontFamily: 'monospace', fontSize: 11 }}>
                Waiting for agent actions...
              </div>
            ) : log.map((e, i) => <LogEntry key={i} entry={e} />)}
          </div>
        </div>

        {/* ── Right Sidebar ───────────────────────────────── */}
        <div style={{ flex: '0 0 240px', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
          <DetailPanel agent={selected} onDeselect={() => setSelIdx(null)} />

          {/* ── Autonomous Activity Feed ─────────────────── */}
          {autonomousFeed.length > 0 && (
            <div style={{
              marginTop: 8, backgroundColor: COLORS.panelBg,
              border: `1px solid ${COLORS.border}44`, borderRadius: 4,
              overflow: 'auto', flex: 1,
            }}>
              <div style={{
                padding: '6px 8px', borderBottom: `1px solid ${COLORS.border}44`,
                fontFamily: '"Press Start 2P", monospace', fontSize: 7,
                color: '#00ddff', position: 'sticky', top: 0,
                backgroundColor: COLORS.panelBg, zIndex: 1,
              }}>▶ AUTONOMOUS FEED</div>
              {autonomousFeed.slice(-15).reverse().map((entry, i) => (
                <div key={i} style={{
                  padding: '3px 8px', borderBottom: '1px solid #1a1a2e',
                  fontFamily: 'monospace', fontSize: 9,
                  display: 'flex', flexDirection: 'column', gap: 2,
                }}>
                  <div style={{ display: 'flex', gap: 4, alignItems: 'center' }}>
                    <span style={{ color: COLORS.textSecondary, fontSize: 8, minWidth: 50 }}>{entry.time}</span>
                    <span style={{ color: entry.color, fontWeight: 'bold', fontSize: 9 }}>{entry.agent}</span>
                  </div>
                  <div style={{ color: '#00ddff', fontSize: 9 }}>{entry.action}</div>
                  <div style={{ color: '#666', fontSize: 8, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{entry.result}</div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      <style>{`
        @keyframes pulse {
          0%,100%{opacity:1}
          50%{opacity:0.5}
        }
        @keyframes alertFlash {
          0%,100%{opacity:1; box-shadow: 0 0 8px #ff4444}
          50%{opacity:0.7; box-shadow: 0 0 16px #ff4444, 0 0 24px #ff444488}
        }
        @keyframes walkBounce {
          0%,100%{transform: translateY(0)}
          50%{transform: translateY(-3px)}
        }
        @keyframes moodGlowPulse {
          0%,100%{opacity:0.6}
          50%{opacity:1}
        }
        @keyframes badgeGlow {
          0%,100%{transform: scale(1); opacity:0.8}
          50%{transform: scale(1.2); opacity:1}
        }
      `}</style>
    </div>
  );
}
