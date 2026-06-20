/**
 * Shared Pixel Art Canvas Engine for Language Emergence
 * Used by CommunicationArena, AgentMinds, PhylogeneticTree, SocialDynamics, etc.
 */

const CELL = 40;
const GRID = 20;

// Sprite image cache
const spriteImages = {};
let spritesReady = false;
let spritePromise = null;
const SPRITE_NAMES = ['assassin', 'cleric', 'engineer', 'knight', 'mage', 'oracle', 'ranger', 'sage'];

export function ensureSprites() {
  if (spritesReady) return Promise.resolve();
  if (spritePromise) return spritePromise;
  spritePromise = new Promise((resolve) => {
    let count = 0;
    SPRITE_NAMES.forEach(name => {
      const img = new Image();
      img.src = `/sprites/${name}.png`;
      img.onload = () => { spriteImages[name] = img; if (++count === SPRITE_NAMES.length) { spritesReady = true; resolve(); } };
      img.onerror = () => { spriteImages[name] = null; if (++count === SPRITE_NAMES.length) { spritesReady = true; resolve(); } };
    });
  });
  return spritePromise;
}

// ── Color palette ──
export const C = {
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
  purple: '#aa66ff',
  pink: '#ff66aa',
  gridLine: '#2a2a40',
};

// ── Terrain hash ──
export function hashCoord(x, y) {
  let h = (x * 374761393 + y * 668265263 + 1013904223) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  h = h ^ (h >>> 16);
  return (h >>> 0) / 4294967296;
}

// ── Draw a pixel art sprite on canvas ──
export function drawSprite(ctx, spriteName, x, y, opts = {}) {
  const { scale = 1.5, bobY = 0, flip = false, alpha = 1, flash = null, glow = null } = opts;
  const img = spriteImages[spriteName];
  
  ctx.save();
  ctx.globalAlpha = alpha;
  
  if (glow) {
    ctx.shadowColor = glow;
    ctx.shadowBlur = 12;
  }
  
  if (img && img.naturalWidth) {
    const drawW = img.naturalWidth * scale;
    const drawH = img.naturalHeight * scale;
    const drawX = x - drawW / 2;
    const drawY = y - drawH + bobY;
    
    ctx.imageSmoothingEnabled = false;
    
    if (flip) {
      ctx.translate(x, 0);
      ctx.scale(-1, 1);
      ctx.drawImage(img, -drawW / 2, drawY, drawW, drawH);
    } else {
      ctx.drawImage(img, drawX, drawY, drawW, drawH);
    }
  } else {
    // Fallback colored circle
    ctx.beginPath();
    ctx.arc(x, y - 8 + bobY, 14, 0, Math.PI * 2);
    ctx.fillStyle = opts.color || C.cyan;
    ctx.fill();
    ctx.strokeStyle = C.textBright;
    ctx.lineWidth = 1.5;
    ctx.stroke();
  }
  
  if (flash) {
    ctx.globalAlpha = 0.4;
    ctx.fillStyle = flash;
    ctx.fillRect(x - 20, y - 40 + bobY, 40, 40);
  }
  
  ctx.restore();
}

// ── Draw health/energy bar ──
export function drawBar(ctx, x, y, w, h, value, max, color) {
  const frac = Math.max(0, Math.min(1, value / max));
  // Background
  ctx.fillStyle = '#111';
  ctx.fillRect(x - 1, y - 1, w + 2, h + 2);
  ctx.fillStyle = '#1a0a0a';
  ctx.fillRect(x, y, w, h);
  // Fill
  ctx.fillStyle = color;
  ctx.fillRect(x, y, Math.round(w * frac), h);
  // Dithering
  const filled = Math.round(w * frac);
  if (filled > 0 && filled < w) {
    ctx.fillStyle = '#000';
    for (let i = 0; i < h; i += 2) {
      ctx.fillRect(x + filled, y + i, 1, 1);
    }
  }
}

// ── Draw speech bubble ──
export function drawSpeechBubble(ctx, x, y, text, opts = {}) {
  const { color = C.green, mood = 'neutral', maxWidth = 180, alpha = 1 } = opts;
  ctx.save();
  ctx.globalAlpha = alpha;
  
  ctx.font = '10px JetBrains Mono, monospace';
  const lines = wrapText(ctx, text, maxWidth - 12);
  const lineH = 13;
  const padX = 8, padY = 6;
  const bw = Math.min(maxWidth, Math.max(60, ...lines.map(l => ctx.measureText(l).width)) + padX * 2);
  const bh = lines.length * lineH + padY * 2;
  const bx = x - bw / 2;
  const by = y - bh - 12;
  
  // Bubble bg
  ctx.fillStyle = 'rgba(10, 10, 20, 0.9)';
  ctx.strokeStyle = color;
  ctx.lineWidth = mood === 'warning' ? 2 : 1;
  roundRect(ctx, bx, by, bw, bh, 6);
  ctx.fill();
  ctx.stroke();
  
  // Triangle pointer
  ctx.fillStyle = 'rgba(10, 10, 20, 0.9)';
  ctx.beginPath();
  ctx.moveTo(x - 5, by + bh);
  ctx.lineTo(x + 5, by + bh);
  ctx.lineTo(x, by + bh + 6);
  ctx.closePath();
  ctx.fill();
  ctx.strokeStyle = color;
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(x - 5, by + bh);
  ctx.lineTo(x, by + bh + 6);
  ctx.lineTo(x + 5, by + bh);
  ctx.stroke();
  
  // Text
  ctx.fillStyle = color;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'top';
  lines.forEach((line, i) => {
    ctx.fillText(line, x, by + padY + i * lineH);
  });
  
  ctx.restore();
}

// ── Draw minimap ──
export function drawMinimap(ctx, x, y, w, h, world, camera) {
  if (!world) return;
  
  ctx.save();
  // Background
  ctx.fillStyle = 'rgba(10, 10, 20, 0.85)';
  ctx.fillRect(x, y, w, h);
  ctx.strokeStyle = C.dim;
  ctx.lineWidth = 1;
  ctx.strokeRect(x, y, w, h);
  
  const cellW = w / GRID;
  const cellH = h / GRID;
  
  // Objects
  for (const obj of (world.objects || [])) {
    if (obj.quantity <= 0) continue;
    const colors = { tree: '#1a4a1a', water: '#1a3060', food: '#6a6a20', tool: '#4a4a50', danger: '#6a1a1a' };
    ctx.fillStyle = colors[obj.type] || '#333';
    ctx.fillRect(x + obj.x * cellW, y + obj.y * cellH, cellW, cellH);
  }
  
  // Agents
  for (const agent of (world.agents || [])) {
    if (!agent.alive) continue;
    ctx.fillStyle = agent.color;
    ctx.fillRect(x + agent.x * cellW - 1, y + agent.y * cellH - 1, cellW + 2, cellH + 2);
  }
  
  // Camera viewport
  const canvasSize = CELL * GRID;
  const vpX = (-camera.panX / camera.zoom / canvasSize) * w;
  const vpY = (-camera.panY / camera.zoom / canvasSize) * h;
  const vpW = (1 / camera.zoom) * w;
  const vpH = (1 / camera.zoom) * h;
  ctx.strokeStyle = C.green;
  ctx.lineWidth = 1.5;
  ctx.strokeRect(x + vpX, y + vpY, vpW, vpH);
  
  ctx.restore();
}

// ── Particle system ──
export class ParticleSystem {
  constructor() {
    this.particles = [];
  }
  
  add(p) {
    this.particles.push({ ...p, time: Date.now(), life: p.life || 1 });
  }
  
  update() {
    const now = Date.now();
    this.particles = this.particles.filter(p => (now - p.time) / 1000 < p.life);
  }
  
  draw(ctx) {
    const now = Date.now();
    for (const p of this.particles) {
      const age = (now - p.time) / 1000;
      const alpha = Math.max(0, 1 - age / p.life);
      ctx.globalAlpha = alpha * (p.alpha || 1);
      ctx.fillStyle = p.color || C.green;
      
      const x = p.x + (p.vx || 0) * age;
      const y = p.y + (p.vy || 0) * age;
      const sz = p.size || 2;
      
      if (p.type === 'firefly') {
        ctx.beginPath();
        ctx.arc(x, y, sz, 0, Math.PI * 2);
        ctx.fill();
        ctx.shadowColor = p.color;
        ctx.shadowBlur = 6;
        ctx.fill();
        ctx.shadowBlur = 0;
      } else if (p.type === 'rain') {
        ctx.strokeStyle = p.color;
        ctx.lineWidth = 0.8;
        ctx.beginPath();
        ctx.moveTo(x, y);
        ctx.lineTo(x + 2, y + 8);
        ctx.stroke();
      } else if (p.type === 'smoke') {
        ctx.globalAlpha = alpha * 0.4;
        ctx.beginPath();
        ctx.arc(x, y, sz + age * 3, 0, Math.PI * 2);
        ctx.fill();
      } else if (p.type === 'spark') {
        ctx.fillRect(x - sz / 2, y - sz / 2, sz, sz);
      } else if (p.type === 'sparkle') {
        // Star shape
        ctx.beginPath();
        for (let i = 0; i < 4; i++) {
          const angle = (i * Math.PI / 2) + age * 3;
          ctx.lineTo(x + Math.cos(angle) * sz * 2, y + Math.sin(angle) * sz * 2);
          ctx.lineTo(x + Math.cos(angle + Math.PI / 4) * sz, y + Math.sin(angle + Math.PI / 4) * sz);
        }
        ctx.closePath();
        ctx.fill();
      } else {
        ctx.fillRect(x - sz / 2, y - sz / 2, sz, sz);
      }
    }
    ctx.globalAlpha = 1;
  }
}

// ── Helpers ──
function wrapText(ctx, text, maxWidth) {
  const words = text.split(' ');
  const lines = [];
  let line = '';
  for (const word of words) {
    const test = line ? line + ' ' + word : word;
    if (ctx.measureText(test).width > maxWidth) {
      if (line) lines.push(line);
      line = word;
    } else {
      line = test;
    }
  }
  if (line) lines.push(line);
  return lines;
}

function roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.lineTo(x + w - r, y);
  ctx.quadraticCurveTo(x + w, y, x + w, y + r);
  ctx.lineTo(x + w, y + h - r);
  ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
  ctx.lineTo(x + r, y + h);
  ctx.quadraticCurveTo(x, y + h, x, y + h - r);
  ctx.lineTo(x, y + r);
  ctx.quadraticCurveTo(x, y, x + r, y);
  ctx.closePath();
}

// ── Export sprite names for assignment ──
export { SPRITE_NAMES };
