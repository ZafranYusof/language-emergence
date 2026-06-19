import React, { useState, useEffect, useRef, useCallback } from 'react';
import { API_URL } from '../config';

/* ───── colour palette (retro robot theme) ───── */
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
  purple: '#aa66ff',
  pink: '#ff66aa',
  gridLine: '#1a1a30',
  gridBg: '#0d0d1a',
};

const CELL = 40;
const GRID = 20;
const CANVAS = CELL * GRID;
const MINIMAP_SIZE = 100;

/* ───── sprite definitions ───── */
const SPRITE_NAMES = ['assassin', 'cleric', 'engineer', 'knight', 'mage', 'oracle', 'ranger', 'sage'];
const spriteImages = {};
let spritesReady = false;
let spritePromise = null;

function ensureSprites() {
  if (spritePromise) return spritePromise;
  spritePromise = new Promise((resolve) => {
    let count = 0;
    SPRITE_NAMES.forEach((name) => {
      const img = new Image();
      img.src = `/sprites/${name}.png`;
      img.onload = () => { spriteImages[name] = img; if (++count === SPRITE_NAMES.length) { spritesReady = true; resolve(); } };
      img.onerror = () => { spriteImages[name] = null; if (++count === SPRITE_NAMES.length) { spritesReady = true; resolve(); } };
    });
  });
  return spritePromise;
}

/* ───── terrain helpers ───── */
function hashCoord(x, y) {
  let h = (x * 374761393 + y * 668265263 + 1013904223) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  h = h ^ (h >>> 16);
  return (h >>> 0) / 4294967296;
}

function getTerrain(x, y) {
  const h = hashCoord(x, y);
  if (h < 0.55) return 'grass';
  if (h < 0.70) return 'stone';
  if (h < 0.85) return 'dirt';
  return 'water';
}

/* ───── object colours ───── */
const OBJ_COLORS = {
  tree: '#33cc66',
  water: '#4499ff',
  food: '#ffdd44',
  tool: '#99aabb',
  danger: '#ff5555',
};

/* ───── personality icons ───── */
const PERSONALITY_ICONS = {
  brave: '\u2694', cautious: '\u26A0', friendly: '\u263A', loner: '\u263B', curious: '\u2605',
};
const MOOD_ICONS = {
  happy: '\u263A', sad: '\u2639', angry: '\u2620', scared: '\u2622', curious: '\u2605', neutral: '\u25CB', brave: '\u2694',
};
const ACTION_ICONS = {
  walking: '\u27A1', gathering: '\u2B07', fighting: '\u2694', resting: '\u2615', crafting: '\u2692', exploring: '\u2690',
};
const EVENT_COLORS = {
  discovery: C.green, danger: C.red, social: C.cyan, crafting: C.amber, combat: C.red, default: C.dim,
};

/* ───── keyframes ───── */
const styleId = 'world-sim-keyframes';
if (typeof document !== 'undefined' && !document.getElementById(styleId)) {
  const el = document.createElement('style');
  el.id = styleId;
  el.textContent = `
    @keyframes ws-fadeIn { from{opacity:0;transform:translateY(8px)} to{opacity:1;transform:translateY(0)} }
    @keyframes ws-pulse { 0%,100%{box-shadow:0 0 4px var(--glow)} 50%{box-shadow:0 0 14px var(--glow)} }
    @keyframes ws-blink { 0%,100%{opacity:1} 50%{opacity:0.3} }
    @keyframes ws-chatBubble { 0%{opacity:0;transform:translateY(0)} 10%{opacity:1;transform:translateY(-4px)} 90%{opacity:1;transform:translateY(-4px)} 100%{opacity:0;transform:translateY(-8px)} }
  `;
  document.head.appendChild(el);
}

/* ───── roundRect helper ───── */
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

/* ───── day/night cycle helper ───── */
function getDayNightPhase(world) {
  if (world && world.day_tick != null && world.day_length) {
    const t = (world.day_tick % world.day_length) / world.day_length;
    if (t < 0.2) return { phase: 'night', alpha: 0.15, tint: 'rgba(0,0,40,' };
    if (t < 0.3) return { phase: 'dawn', alpha: 0.08, tint: 'rgba(40,20,60,' };
    if (t < 0.7) return { phase: 'day', alpha: 0, tint: '' };
    if (t < 0.8) return { phase: 'dusk', alpha: 0.08, tint: 'rgba(60,30,10,' };
    return { phase: 'night', alpha: 0.15, tint: 'rgba(0,0,40,' };
  }
  const time = Date.now() / 1000;
  const phase = Math.sin(time / 30 * Math.PI);
  const alpha = Math.max(0, -phase) * 0.12;
  return { phase: alpha > 0.06 ? 'night' : alpha > 0.01 ? 'dusk' : 'day', alpha, tint: 'rgba(0,0,40,' };
}

/* ───── weather helpers ───── */
function getWeatherOverlay(world) {
  const w = world?.weather || 'clear';
  if (w === 'rain') return { overlay: 'rgba(60,100,200,0.05)', rainIntensity: 30 };
  if (w === 'storm') return { overlay: 'rgba(20,20,40,0.10)', rainIntensity: 60, storm: true };
  if (w === 'fog') return { overlay: 'rgba(180,180,200,0.15)', fog: true };
  return { overlay: null, rainIntensity: 0 };
}

/* ═══════════════════════════════════════════════════
   Canvas rendering functions (pure, outside component)
   ═══════════════════════════════════════════════════ */

function drawTerrain(ctx, animFrame) {
  for (let x = 0; x < GRID; x++) {
    for (let y = 0; y < GRID; y++) {
      const terrain = getTerrain(x, y);
      const px = x * CELL;
      const py = y * CELL;
      const seed = hashCoord(x, y);
      const seed2 = hashCoord(x + 100, y + 100);

      switch (terrain) {
        case 'grass': {
          ctx.fillStyle = '#1a3318';
          ctx.fillRect(px, py, CELL, CELL);
          // Animated grass tufts
          ctx.fillStyle = '#2a5a28';
          const gx1 = px + (seed * 30) | 0;
          const gy1 = py + (seed2 * 30) | 0;
          const wave = Math.sin(animFrame * 0.04 + seed * 10) * 2;
          ctx.fillRect(gx1 + wave, gy1, 2, 3);
          if (seed > 0.3) ctx.fillRect(gx1 + 12 + wave * 0.7, gy1 + 8, 2, 2);
          if (seed > 0.6) ctx.fillRect(gx1 + 6 + wave * 1.2, gy1 + 20, 2, 3);
          if (seed > 0.5) {
            ctx.fillStyle = '#336b30';
            ctx.fillRect(gx1 + 18 + wave * 0.5, gy1 + 14, 2, 2);
          }
          break;
        }
        case 'stone': {
          ctx.fillStyle = '#252528';
          ctx.fillRect(px, py, CELL, CELL);
          ctx.strokeStyle = '#3a3a40';
          ctx.lineWidth = 0.8;
          ctx.beginPath();
          ctx.moveTo(px + seed * 20, py + seed2 * 10);
          ctx.lineTo(px + 15 + seed * 15, py + 25 + seed2 * 10);
          ctx.stroke();
          if (seed > 0.4) {
            ctx.beginPath();
            ctx.moveTo(px + 25, py + seed * 30);
            ctx.lineTo(px + 35, py + 10 + seed * 20);
            ctx.stroke();
          }
          break;
        }
        case 'dirt': {
          ctx.fillStyle = '#2d2218';
          ctx.fillRect(px, py, CELL, CELL);
          ctx.fillStyle = '#3d3020';
          ctx.fillRect(px + (seed * 28) | 0, py + (seed2 * 28) | 0, 3, 3);
          if (seed > 0.3) ctx.fillRect(px + ((seed2 * 20 + 10) | 0), py + ((seed * 25 + 5) | 0), 3, 2);
          if (seed > 0.6) {
            ctx.fillStyle = '#4a3a28';
            ctx.fillRect(px + ((seed * 15 + 5) | 0), py + ((seed2 * 15 + 15) | 0), 2, 2);
          }
          break;
        }
        case 'water': {
          ctx.fillStyle = '#0e2240';
          ctx.fillRect(px, py, CELL, CELL);
          // Animated wave ripples
          ctx.strokeStyle = '#1a4070';
          ctx.lineWidth = 0.8;
          const waveOff = ((animFrame * 0.02 + seed * 10) % 40) | 0;
          ctx.beginPath();
          ctx.moveTo(px, py + waveOff);
          ctx.quadraticCurveTo(px + CELL / 2, py + waveOff - 3, px + CELL, py + waveOff);
          ctx.stroke();
          // Second wave line
          const waveOff2 = ((animFrame * 0.015 + seed * 20 + 15) % 40) | 0;
          ctx.strokeStyle = '#1a407080';
          ctx.beginPath();
          ctx.moveTo(px, py + waveOff2);
          ctx.quadraticCurveTo(px + CELL / 2, py + waveOff2 + 2, px + CELL, py + waveOff2);
          ctx.stroke();
          // Highlight ripples
          ctx.strokeStyle = '#2a5090';
          ctx.lineWidth = 0.4;
          const waveOff3 = ((animFrame * 0.025 + seed * 5 + 8) % 40) | 0;
          ctx.beginPath();
          ctx.moveTo(px + 4, py + waveOff3);
          ctx.quadraticCurveTo(px + CELL / 2, py + waveOff3 - 1.5, px + CELL - 4, py + waveOff3);
          ctx.stroke();
          break;
        }
        default:
          ctx.fillStyle = '#151520';
          ctx.fillRect(px, py, CELL, CELL);
      }
    }
  }
}

function drawGrid(ctx) {
  ctx.strokeStyle = '#2a2a40';
  ctx.lineWidth = 0.5;
  ctx.globalAlpha = 0.4;
  for (let x = 0; x <= GRID; x++) {
    ctx.beginPath();
    ctx.moveTo(x * CELL, 0);
    ctx.lineTo(x * CELL, CANVAS);
    ctx.stroke();
  }
  for (let y = 0; y <= GRID; y++) {
    ctx.beginPath();
    ctx.moveTo(0, y * CELL);
    ctx.lineTo(CANVAS, y * CELL);
    ctx.stroke();
  }
  ctx.globalAlpha = 1;
}

function drawTrails(ctx, trails, now) {
  for (const t of trails) {
    const age = (now - t.time) / 1000;
    if (age > 3) continue;
    const alpha = Math.max(0, 1 - age / 3) * 0.4;
    ctx.globalAlpha = alpha;
    ctx.fillStyle = t.color || C.dim;
    const sz = 3 * (1 - age / 3);
    ctx.fillRect(t.x * CELL + CELL / 2 - sz / 2, t.y * CELL + CELL / 2 - sz / 2, sz, sz);
  }
  ctx.globalAlpha = 1;
}

function drawObjects(ctx, objects, animFrame) {
  for (const obj of objects) {
    if (obj.quantity <= 0) continue;
    const cx = obj.x * CELL + CELL / 2;
    const cy = obj.y * CELL + CELL / 2;
    const col = OBJ_COLORS[obj.type] || C.dim;
    const alpha = Math.min(1, obj.quantity / 5);

    ctx.globalAlpha = 0.4 + alpha * 0.5;
    if (obj.type === 'danger') {
      ctx.fillStyle = col;
      ctx.globalAlpha = 0.15 + Math.sin(animFrame * 0.05) * 0.1;
      ctx.fillRect(obj.x * CELL + 2, obj.y * CELL + 2, CELL - 4, CELL - 4);
      ctx.globalAlpha = 1;
      ctx.fillStyle = col;
      const bx = cx - 4, by = cy - 6;
      ctx.fillRect(bx + 3, by, 2, 2);
      ctx.fillRect(bx + 2, by + 2, 4, 2);
      ctx.fillRect(bx + 1, by + 4, 6, 2);
      ctx.fillRect(bx, by + 6, 8, 2);
      ctx.fillRect(bx + 3, by + 9, 2, 1);
    } else if (obj.type === 'tree') {
      ctx.globalAlpha = 1;
      // Sway animation
      const sway = Math.sin(animFrame * 0.03 + hashCoord(obj.x, obj.y) * 6.28) * 1.5;
      ctx.fillStyle = '#2a7a3a';
      ctx.fillRect(cx - 6 + sway, cy - 10, 12, 4);
      ctx.fillRect(cx - 8 + sway * 0.7, cy - 7, 16, 4);
      ctx.fillRect(cx - 6 + sway * 0.5, cy - 3, 12, 3);
      ctx.fillStyle = '#6a4a2a';
      ctx.fillRect(cx - 2, cy, 4, 5);
    } else if (obj.type === 'water') {
      ctx.globalAlpha = 0.8;
      ctx.fillStyle = '#3388ff';
      ctx.fillRect(cx - 2, cy - 8, 4, 2);
      ctx.fillRect(cx - 4, cy - 6, 8, 2);
      ctx.fillRect(cx - 4, cy - 4, 8, 4);
      ctx.fillRect(cx - 2, cy, 4, 2);
    } else if (obj.type === 'food') {
      ctx.globalAlpha = 1;
      ctx.fillStyle = '#cc3333';
      ctx.fillRect(cx - 4, cy - 4, 8, 8);
      ctx.fillRect(cx - 2, cy - 6, 4, 2);
      ctx.fillStyle = '#33aa33';
      ctx.fillRect(cx + 1, cy - 7, 2, 2);
    } else if (obj.type === 'tool') {
      ctx.globalAlpha = 1;
      ctx.fillStyle = '#888899';
      ctx.fillRect(cx - 1, cy - 8, 2, 10);
      ctx.fillRect(cx - 4, cy - 8, 8, 2);
      ctx.fillRect(cx - 4, cy - 6, 2, 3);
      ctx.fillRect(cx + 2, cy - 6, 2, 3);
    }
    ctx.globalAlpha = 1;
  }
}

function drawBuildings(ctx, buildings, animFrame) {
  if (!buildings) return;
  for (const b of buildings) {
    const cx = b.x * CELL + CELL / 2;
    const cy = b.y * CELL + CELL / 2;
    if (b.type === 'campfire') {
      // Flickering glow
      const flicker = 0.15 + Math.sin(animFrame * 0.15) * 0.08 + Math.sin(animFrame * 0.23) * 0.05;
      ctx.globalAlpha = flicker;
      ctx.fillStyle = '#ff6600';
      ctx.beginPath();
      ctx.arc(cx, cy, 18, 0, Math.PI * 2);
      ctx.fill();
      ctx.globalAlpha = 1;
      // Fire pixels
      ctx.fillStyle = '#ff4400';
      ctx.fillRect(cx - 3, cy - 2, 6, 4);
      ctx.fillStyle = '#ffaa00';
      ctx.fillRect(cx - 2, cy - 4, 4, 3);
      ctx.fillStyle = '#ffdd44';
      ctx.fillRect(cx - 1, cy - 5, 2, 2);
      // Log base
      ctx.fillStyle = '#5a3a1a';
      ctx.fillRect(cx - 5, cy + 1, 10, 3);
    } else if (b.type === 'shelter') {
      // Warm glow
      ctx.globalAlpha = 0.08 + Math.sin(animFrame * 0.02) * 0.03;
      ctx.fillStyle = '#ffcc66';
      ctx.beginPath();
      ctx.arc(cx, cy, 22, 0, Math.PI * 2);
      ctx.fill();
      ctx.globalAlpha = 1;
      // Shelter body
      ctx.fillStyle = '#5a4a2a';
      ctx.fillRect(cx - 10, cy - 4, 20, 10);
      ctx.fillStyle = '#7a6a3a';
      ctx.beginPath();
      ctx.moveTo(cx - 12, cy - 4);
      ctx.lineTo(cx, cy - 12);
      ctx.lineTo(cx + 12, cy - 4);
      ctx.fill();
    } else if (b.type === 'watchtower') {
      // Pulsing light on top
      const pulse = 0.4 + Math.sin(animFrame * 0.06) * 0.3;
      ctx.globalAlpha = pulse;
      ctx.fillStyle = '#aaddff';
      ctx.beginPath();
      ctx.arc(cx, cy - 14, 4, 0, Math.PI * 2);
      ctx.fill();
      ctx.globalAlpha = pulse * 0.3;
      ctx.beginPath();
      ctx.arc(cx, cy - 14, 8, 0, Math.PI * 2);
      ctx.fill();
      ctx.globalAlpha = 1;
      // Tower body
      ctx.fillStyle = '#4a4a55';
      ctx.fillRect(cx - 4, cy - 8, 8, 14);
      ctx.fillStyle = '#5a5a66';
      ctx.fillRect(cx - 6, cy - 10, 12, 4);
      ctx.fillRect(cx - 7, cy - 14, 14, 5);
    }
  }
  ctx.globalAlpha = 1;
}

function drawAgent(ctx, agent, selectedAgent, effects) {
  const { sprites, agentSprites: agentSpriteMap, animFrame } = effects;
  const cx = agent.x * CELL + CELL / 2;
  const cy = agent.y * CELL + CELL / 2;
  const isSelected = agent.agent_id === selectedAgent;

  // Selected agent pulsing glow
  if (isSelected) {
    ctx.strokeStyle = agent.color;
    ctx.lineWidth = 2;
    ctx.globalAlpha = 0.3 + Math.sin(animFrame * 0.08) * 0.2;
    ctx.strokeRect(agent.x * CELL + 1, agent.y * CELL + 1, CELL - 2, CELL - 2);
    // Glow ring
    ctx.beginPath();
    ctx.arc(cx, cy, 20, 0, Math.PI * 2);
    ctx.strokeStyle = agent.color;
    ctx.globalAlpha = 0.1 + Math.sin(animFrame * 0.06) * 0.08;
    ctx.stroke();
    ctx.globalAlpha = 1;
  }

  // Dead agents: greyed out with X eyes
  if (!agent.alive) {
    ctx.globalAlpha = 0.4;
    ctx.fillStyle = '#444';
    ctx.beginPath();
    ctx.arc(cx, cy, 14, 0, Math.PI * 2);
    ctx.fill();
    // X eyes
    ctx.strokeStyle = C.red;
    ctx.lineWidth = 2;
    ctx.beginPath(); ctx.moveTo(cx - 6, cy - 4); ctx.lineTo(cx - 2, cy); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(cx - 2, cy - 4); ctx.lineTo(cx - 6, cy); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(cx + 2, cy - 4); ctx.lineTo(cx + 6, cy); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(cx + 6, cy - 4); ctx.lineTo(cx + 2, cy); ctx.stroke();
    ctx.globalAlpha = 1;
    return;
  }

  // Walking bob + idle breathing
  const bobPhase = Math.sin(animFrame * 0.12 + hashCoord(agent.x, agent.y) * 6.28);
  const bobY = bobPhase * 1.5;
  const breathe = Math.sin(animFrame * 0.03) * 0.5;

  // Fighting red flash
  const isFighting = agent.current_action === 'fighting';
  if (isFighting && Math.sin(animFrame * 0.3) > 0.7) {
    ctx.globalAlpha = 0.3;
    ctx.fillStyle = C.red;
    ctx.beginPath();
    ctx.arc(cx, cy, 16, 0, Math.PI * 2);
    ctx.fill();
    ctx.globalAlpha = 1;
  }

  // Draw sprite
  const spriteName = agentSpriteMap[agent.agent_id];
  const img = spriteName ? sprites[spriteName] : null;

  if (img && img.naturalWidth) {
    const scale = Math.min((CELL - 6) / img.naturalWidth, (CELL - 4) / img.naturalHeight) * (1 + breathe * 0.01);
    const drawW = img.naturalWidth * scale;
    const drawH = img.naturalHeight * scale;
    const drawX = cx - drawW / 2;
    const drawY = agent.y * CELL + CELL - drawH + bobY;

    // Shadow
    ctx.globalAlpha = 0.3;
    ctx.fillStyle = '#000';
    ctx.beginPath();
    ctx.ellipse(cx, agent.y * CELL + CELL - 2, drawW / 2.5, 2, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.globalAlpha = 1;

    // Sprite with walking flip effect
    ctx.save();
    const flipFrame = Math.floor(animFrame / 15) % 2;
    if (flipFrame && Math.abs(bobPhase) > 0.5) {
      ctx.translate(cx, 0);
      ctx.scale(-1, 1);
      ctx.translate(-cx, 0);
    }
    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(img, drawX, drawY, drawW, drawH);
    ctx.restore();
  } else {
    // Fallback: colored circle with breathing
    ctx.beginPath();
    ctx.arc(cx, cy + bobY, 14 + breathe, 0, Math.PI * 2);
    ctx.fillStyle = agent.color;
    ctx.globalAlpha = 0.9;
    ctx.fill();
    ctx.globalAlpha = 1;
    ctx.strokeStyle = C.textBright;
    ctx.lineWidth = 1.5;
    ctx.stroke();
    ctx.fillStyle = C.textBright;
    ctx.font = 'bold 10px JetBrains Mono, monospace';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(agent.name[0].toUpperCase(), cx, cy + bobY);
  }

  // Agent name label
  ctx.fillStyle = C.textBright;
  ctx.font = '7px JetBrains Mono, monospace';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'top';
  ctx.fillText(agent.name, cx, agent.y * CELL + CELL + 1);

  // Pixel art health bar
  const barW = 28;
  const barH = 4;
  const barX = cx - barW / 2;
  const barY = agent.y * CELL - 6;
  ctx.fillStyle = '#000';
  ctx.fillRect(barX - 1, barY - 1, barW + 2, barH + 2);
  ctx.fillStyle = '#1a0a0a';
  ctx.fillRect(barX, barY, barW, barH);
  const hFrac = Math.max(0, Math.min(1, agent.health / 100));
  const filledPx = Math.round(barW * hFrac);
  const hColor = hFrac > 0.5 ? C.green : hFrac > 0.25 ? C.amber : C.red;
  ctx.fillStyle = hColor;
  ctx.fillRect(barX, barY, filledPx, barH);
  if (filledPx > 0 && filledPx < barW) {
    ctx.fillStyle = '#000';
    for (let i = 0; i < barH; i += 2) {
      ctx.fillRect(barX + filledPx, barY + i, 1, 1);
    }
  }

  // Energy bar
  const eBarW = 22;
  const eBarH = 2;
  const eBarX = cx - eBarW / 2;
  const eBarY = barY + barH + 2;
  ctx.fillStyle = '#000';
  ctx.fillRect(eBarX, eBarY, eBarW, eBarH);
  const eFrac = Math.max(0, Math.min(1, agent.energy / 100));
  ctx.fillStyle = C.cyan;
  ctx.fillRect(eBarX, eBarY, Math.round(eBarW * eFrac), eBarH);

  // Direction indicator
  const dirs = { up: [0, -1], down: [0, 1], left: [-1, 0], right: [1, 0] };
  const [dx, dy] = dirs[agent.direction] || [0, 1];
  ctx.fillStyle = C.textBright;
  ctx.globalAlpha = 0.6;
  ctx.fillRect(cx + dx * 16 - 1, cy + dy * 16 - 1 + bobY, 3, 3);
  ctx.globalAlpha = 1;
}

function drawParticles(ctx, particles, now) {
  for (const p of particles) {
    const age = (now - p.time) / 1000;
    if (age > p.life) continue;
    let alpha = Math.max(0, 1 - age / p.life);
    let px, py, sz;

    if (p.type === 'firefly') {
      // Fireflies: gentle floating, fade in/out
      const fadeIn = Math.min(1, age / 0.5);
      const fadeOut = Math.min(1, (p.life - age) / 0.5);
      alpha = fadeIn * fadeOut * (0.5 + Math.sin(age * 3 + p.phase) * 0.5);
      px = p.x + Math.sin(age * 0.8 + p.phase) * 6;
      py = p.y + Math.cos(age * 0.5 + p.phase) * 4 - age * 3;
      ctx.globalAlpha = alpha;
      ctx.fillStyle = p.color;
      ctx.beginPath();
      ctx.arc(px, py, p.size, 0, Math.PI * 2);
      ctx.fill();
      // Glow
      ctx.globalAlpha = alpha * 0.3;
      ctx.beginPath();
      ctx.arc(px, py, p.size * 3, 0, Math.PI * 2);
      ctx.fill();
    } else if (p.type === 'smoke') {
      px = p.x + Math.sin(age * 1.2) * 4;
      py = p.y - age * 25;
      sz = p.size + age * 3;
      ctx.globalAlpha = alpha * 0.4;
      ctx.fillStyle = p.color;
      ctx.beginPath();
      ctx.arc(px, py, sz, 0, Math.PI * 2);
      ctx.fill();
    } else if (p.type === 'rain') {
      px = p.x + age * 30;
      py = p.y + age * 200;
      ctx.globalAlpha = 0.4;
      ctx.strokeStyle = p.color;
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(px, py);
      ctx.lineTo(px + 2, py + 6);
      ctx.stroke();
    } else if (p.type === 'dust') {
      px = p.x + Math.sin(age * 0.3 + p.phase) * 8;
      py = p.y + Math.cos(age * 0.2 + p.phase) * 4;
      ctx.globalAlpha = alpha * 0.3;
      ctx.fillStyle = p.color;
      ctx.fillRect(px - 0.5, py - 0.5, 1, 1);
    } else if (p.type === 'splash') {
      px = p.x + p.vx * age;
      py = p.y + p.vy * age - age * 40;
      sz = p.size * (1 - age / p.life);
      ctx.globalAlpha = alpha;
      ctx.fillStyle = p.color;
      ctx.fillRect(px - sz / 2, py - sz / 2, sz, sz);
    } else if (p.type === 'spark') {
      px = p.x + p.vx * age;
      py = p.y + p.vy * age + age * age * 60;
      sz = p.size * (1 - age / p.life);
      ctx.globalAlpha = alpha;
      ctx.fillStyle = p.color;
      ctx.fillRect(px - sz / 2, py - sz / 2, sz, sz);
    } else if (p.type === 'levelup') {
      const angle = age * 4 + p.phase;
      const radius = age * 20;
      px = p.x + Math.cos(angle) * radius;
      py = p.y - age * 30 + Math.sin(angle) * 6;
      ctx.globalAlpha = alpha;
      ctx.fillStyle = C.amber;
      ctx.fillRect(px - 1, py - 1, 2, 2);
    } else {
      // Default particle
      px = p.x + p.vx * age;
      py = p.y + p.vy * age - age * 20;
      ctx.globalAlpha = alpha;
      ctx.fillStyle = p.color;
      sz = p.size * (1 - age / p.life * 0.5);
      ctx.fillRect(px - sz / 2, py - sz / 2, sz, sz);
    }
  }
  ctx.globalAlpha = 1;
}

function drawFloatingNums(ctx, nums, now) {
  for (const n of nums) {
    const age = (now - n.startTime) / 1000;
    if (age > 2) continue;
    const alpha = Math.max(0, 1 - age / 2);
    const yOff = -age * 30;
    ctx.globalAlpha = alpha;
    ctx.font = 'bold 10px JetBrains Mono, monospace';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillStyle = '#000';
    ctx.fillText(n.text, n.x + 1, n.y + yOff + 1);
    ctx.fillStyle = n.color;
    ctx.fillText(n.text, n.x, n.y + yOff);
  }
  ctx.globalAlpha = 1;
}

function drawSpeechBubbles(ctx, bubbles, now) {
  for (const b of bubbles) {
    const age = (now - b.startTime) / 1000;
    if (age > 4) continue;
    const alpha = age < 0.3 ? age / 0.3 : age > 3.5 ? (4 - age) / 0.5 : 1;
    const yOff = -age * 4;

    const text = b.text.length > 30 ? b.text.slice(0, 30) + '\u2026' : b.text;
    ctx.font = '8px JetBrains Mono, monospace';
    const tw = ctx.measureText(text).width;
    const bw = tw + 12;
    const bh = 16;
    const bx = b.x - bw / 2;
    const by = b.y - 24 + yOff;

    ctx.globalAlpha = alpha * 0.92;
    ctx.fillStyle = '#1a1a2e';
    roundRect(ctx, bx, by, bw, bh, 3);
    ctx.fill();

    ctx.strokeStyle = C.green + '80';
    ctx.lineWidth = 0.5;
    roundRect(ctx, bx, by, bw, bh, 3);
    ctx.stroke();

    ctx.fillStyle = '#1a1a2e';
    ctx.beginPath();
    ctx.moveTo(b.x - 3, by + bh);
    ctx.lineTo(b.x, by + bh + 4);
    ctx.lineTo(b.x + 3, by + bh);
    ctx.fill();

    ctx.fillStyle = C.green;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(text, b.x, by + bh / 2);
    ctx.globalAlpha = 1;
  }
}

function drawChatBubbles(ctx, chatBubbles, animFrame) {
  // Sort by age so newest on top
  const sorted = [...(chatBubbles || [])].reverse();
  for (const bubble of sorted) {
    const bx = bubble.x * CELL + CELL / 2;
    const by = bubble.y * CELL - 28;
    const text = bubble.text.length > 40 ? bubble.text.slice(0, 40) + '\u2026' : bubble.text;
    const name = bubble.agent_id || '';
    const displayText = name ? `${name}: ${text}` : text;

    ctx.font = '9px JetBrains Mono, monospace';
    const measured = ctx.measureText(displayText).width;
    const bw = measured + 18;
    const bh = 20;
    const bbx = bx - bw / 2;
    const bby = by - bh / 2;

    // Mood-based styling
    const mood = bubble.mood || 'neutral';
    let borderColor = C.cyan + '60';
    let pulseOffset = 0;
    if (mood === 'warning' || mood === 'angry') {
      borderColor = C.red;
      pulseOffset = Math.sin(animFrame * 0.15) * 0.2;
    } else if (mood === 'happy' || mood === 'celebration') {
      borderColor = C.amber;
    } else if (mood === 'help') {
      borderColor = '#ff8800';
    } else if (mood === 'philosophical') {
      borderColor = C.purple;
    } else if (mood === 'night_fear') {
      borderColor = C.dim;
    }

    // Fade based on TTL
    const ttl = bubble.ttl || 100;
    const maxTtl = bubble.max_ttl || 100;
    const fadeAlpha = Math.min(1, ttl / (maxTtl * 0.3));

    ctx.globalAlpha = fadeAlpha * (0.92 + pulseOffset);

    // Bubble background
    ctx.fillStyle = 'rgba(26,26,46,0.94)';
    roundRect(ctx, bbx, bby, bw, bh, 4);
    ctx.fill();

    // Border
    ctx.strokeStyle = borderColor;
    ctx.lineWidth = mood === 'night_fear' ? 0.5 : 1;
    roundRect(ctx, bbx, bby, bw, bh, 4);
    ctx.stroke();

    // Pointer triangle
    ctx.fillStyle = 'rgba(26,26,46,0.94)';
    ctx.beginPath();
    ctx.moveTo(bx - 4, bby + bh);
    ctx.lineTo(bx, bby + bh + 5);
    ctx.lineTo(bx + 4, bby + bh);
    ctx.fill();
    ctx.strokeStyle = borderColor;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(bx - 4, bby + bh);
    ctx.lineTo(bx, bby + bh + 5);
    ctx.lineTo(bx + 4, bby + bh);
    ctx.stroke();

    // Text
    ctx.fillStyle = borderColor;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(displayText, bx, bby + bh / 2);
    ctx.globalAlpha = 1;
  }
}

function drawMinimap(ctx, world, camera) {
  const mapSize = MINIMAP_SIZE;
  const cellSize = mapSize / GRID;
  const mx = 8;
  const my = ctx.canvas.height - mapSize - 8;

  // Background
  ctx.fillStyle = 'rgba(0,0,0,0.7)';
  ctx.fillRect(mx - 2, my - 2, mapSize + 4, mapSize + 4);
  ctx.strokeStyle = C.dim;
  ctx.lineWidth = 1;
  ctx.strokeRect(mx - 2, my - 2, mapSize + 4, mapSize + 4);

  // Grid cells
  for (let x = 0; x < GRID; x++) {
    for (let y = 0; y < GRID; y++) {
      const terrain = getTerrain(x, y);
      let color = '#1a1a2a';
      if (terrain === 'water') color = '#0e2240';
      else if (terrain === 'grass') color = '#1a3318';
      else if (terrain === 'stone') color = '#252528';
      else if (terrain === 'dirt') color = '#2d2218';

      // Objects
      const obj = world?.objects?.find(o => o.x === x && o.y === y && o.quantity > 0);
      if (obj) {
        if (obj.type === 'tree') color = '#2a6a3a';
        else if (obj.type === 'food') color = '#665522';
        else if (obj.type === 'danger') color = '#552222';
        else if (obj.type === 'tool') color = '#445555';
      }

      ctx.fillStyle = color;
      ctx.fillRect(mx + x * cellSize, my + y * cellSize, cellSize, cellSize);
    }
  }

  // Agents as bright dots
  if (world?.agents) {
    for (const a of world.agents) {
      if (!a.alive) continue;
      ctx.fillStyle = a.color;
      ctx.fillRect(mx + a.x * cellSize + 1, my + a.y * cellSize + 1, Math.max(2, cellSize - 1), Math.max(2, cellSize - 1));
    }
  }

  // Camera viewport rectangle
  const zoom = camera.zoom;
  const viewW = (ctx.canvas.width / zoom) / CELL * cellSize;
  const viewH = (ctx.canvas.height / zoom) / CELL * cellSize;
  const viewX = (-camera.panX / zoom) / CELL * cellSize;
  const viewY = (-camera.panY / zoom) / CELL * cellSize;
  ctx.strokeStyle = C.green;
  ctx.lineWidth = 1;
  ctx.globalAlpha = 0.6;
  ctx.strokeRect(mx + viewX, my + viewY, viewW, viewH);
  ctx.globalAlpha = 1;
}

function drawWeatherOverlay(ctx, world, animFrame) {
  const weather = getWeatherOverlay(world);
  if (weather.overlay) {
    ctx.fillStyle = weather.overlay;
    ctx.fillRect(0, 0, ctx.canvas.width, ctx.canvas.height);
  }

  // Lightning flash
  if (weather.storm && Math.random() < 0.02) {
    ctx.fillStyle = 'rgba(255,255,255,0.3)';
    ctx.fillRect(0, 0, ctx.canvas.width, ctx.canvas.height);
  }
}

function drawTooltip(ctx, tooltip) {
  if (!tooltip) return;
  const text = tooltip.text;
  ctx.font = '10px JetBrains Mono, monospace';
  const tw = ctx.measureText(text).width;
  const bw = tw + 12;
  const bh = 18;
  const bx = tooltip.x - bw / 2;
  const by = tooltip.y - bh - 8;

  ctx.fillStyle = 'rgba(20,20,35,0.95)';
  roundRect(ctx, bx, by, bw, bh, 3);
  ctx.fill();
  ctx.strokeStyle = C.dim;
  ctx.lineWidth = 0.5;
  roundRect(ctx, bx, by, bw, bh, 3);
  ctx.stroke();
  ctx.fillStyle = C.textBright;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(text, tooltip.x, by + bh / 2);
}

function renderWorld(ctx, world, selectedAgent, camera, effects, tooltip) {
  const w = ctx.canvas.width;
  const h = ctx.canvas.height;

  ctx.fillStyle = '#0a0a12';
  ctx.fillRect(0, 0, w, h);

  ctx.save();
  ctx.translate(camera.panX, camera.panY);
  ctx.scale(camera.zoom, camera.zoom);

  drawTerrain(ctx, effects.animFrame);
  drawGrid(ctx);
  drawTrails(ctx, effects.trails, Date.now());
  drawObjects(ctx, world.objects, effects.animFrame);
  drawBuildings(ctx, world.buildings, effects.animFrame);

  // Agents sorted by y for depth
  const sortedAgents = [...world.agents].sort((a, b) => a.y - b.y);
  for (const agent of sortedAgents) {
    drawAgent(ctx, agent, selectedAgent, effects);
  }

  drawParticles(ctx, effects.particles, Date.now());
  drawFloatingNums(ctx, effects.floatingNums, Date.now());
  drawSpeechBubbles(ctx, effects.speechBubbles, Date.now());
  drawChatBubbles(ctx, world.chat_bubbles, effects.animFrame);

  ctx.restore();

  // Day/night overlay
  const dayNight = getDayNightPhase(world);
  if (dayNight.alpha > 0.01) {
    ctx.fillStyle = `${dayNight.tint}${dayNight.alpha})`;
    ctx.fillRect(0, 0, w, h);
  }

  // Weather overlay
  drawWeatherOverlay(ctx, world, effects.animFrame);

  // Minimap
  drawMinimap(ctx, world, camera);

  // Tooltip
  drawTooltip(ctx, tooltip);

  // Camera info overlay
  if (camera.zoom !== 1) {
    ctx.fillStyle = 'rgba(0,0,0,0.4)';
    ctx.fillRect(4, h - 18, 80, 14);
    ctx.fillStyle = C.dim;
    ctx.font = '9px JetBrains Mono, monospace';
    ctx.textAlign = 'left';
    ctx.textBaseline = 'middle';
    ctx.fillText(`ZOOM ${camera.zoom.toFixed(1)}x`, 8, h - 11);
  }
}

/* ───── Effect generation: diff world states to create visual effects ───── */
function generateEffects(prevWorld, newWorld, agentSprites, trailsRef, floatingNumsRef, particlesRef, speechBubblesRef) {
  const now = Date.now();

  for (const newAgent of newWorld.agents) {
    const prevAgent = prevWorld.agents.find(a => a.agent_id === newAgent.agent_id);
    if (!prevAgent) continue;

    if (prevAgent.alive && (prevAgent.x !== newAgent.x || prevAgent.y !== newAgent.y)) {
      trailsRef.current.push({ x: prevAgent.x, y: prevAgent.y, time: now, color: newAgent.color });

      // Water splash
      if (getTerrain(newAgent.x, newAgent.y) === 'water') {
        for (let i = 0; i < 5; i++) {
          particlesRef.current.push({
            type: 'splash',
            x: newAgent.x * CELL + CELL / 2, y: newAgent.y * CELL + CELL / 2,
            vx: (Math.random() - 0.5) * 30, vy: -Math.random() * 20,
            time: now, life: 0.5, color: '#4499ff', size: 2 + Math.random() * 2,
          });
        }
      }
    }

    if (prevAgent.alive && newAgent.alive) {
      const hpDiff = newAgent.health - prevAgent.health;
      if (Math.abs(hpDiff) > 0.5) {
        floatingNumsRef.current.push({
          text: hpDiff > 0 ? `+${Math.round(hpDiff)}` : `${Math.round(hpDiff)}`,
          x: newAgent.x * CELL + CELL / 2, y: newAgent.y * CELL - 10,
          startTime: now, color: hpDiff > 0 ? C.green : C.red,
        });
      }
      const eDiff = newAgent.energy - prevAgent.energy;
      if (Math.abs(eDiff) > 0.5) {
        floatingNumsRef.current.push({
          text: eDiff > 0 ? `+${Math.round(eDiff)}E` : `${Math.round(eDiff)}E`,
          x: newAgent.x * CELL + CELL / 2 + 16, y: newAgent.y * CELL,
          startTime: now, color: C.cyan,
        });
      }

      // Combat sparks
      if (newAgent.current_action === 'fighting' && prevAgent.current_action !== 'fighting') {
        for (let i = 0; i < 8; i++) {
          particlesRef.current.push({
            type: 'spark',
            x: newAgent.x * CELL + CELL / 2, y: newAgent.y * CELL + CELL / 2,
            vx: (Math.random() - 0.5) * 80, vy: (Math.random() - 0.5) * 80,
            time: now, life: 0.4, color: Math.random() > 0.5 ? C.amber : C.red, size: 2 + Math.random() * 2,
          });
        }
      }

      // Level up sparkles
      if (newAgent.level > (prevAgent.level || 0)) {
        for (let i = 0; i < 12; i++) {
          particlesRef.current.push({
            type: 'levelup',
            x: newAgent.x * CELL + CELL / 2, y: newAgent.y * CELL + CELL / 2,
            vx: 0, vy: 0, phase: (Math.PI * 2 / 12) * i,
            time: now, life: 1.5, color: C.amber, size: 2,
          });
        }
      }
    }

    // Communication
    if (newAgent.messages && prevAgent.messages) {
      const newMsgs = newAgent.messages.filter(m => !prevAgent.messages.find(pm => pm.tick === m.tick && pm.text === m.text));
      for (const msg of newMsgs) {
        speechBubblesRef.current.push({
          text: msg.text, x: newAgent.x * CELL + CELL / 2, y: newAgent.y * CELL, startTime: now,
        });
        for (let i = 0; i < 4; i++) {
          particlesRef.current.push({
            x: newAgent.x * CELL + CELL / 2, y: newAgent.y * CELL + CELL / 2,
            vx: (Math.random() - 0.5) * 40, vy: -Math.random() * 30 - 10,
            time: now, life: 1.0, color: C.cyan, size: 2 + Math.random() * 2,
          });
        }
      }
    }
  }

  // Object changes
  for (const newObj of newWorld.objects) {
    const prevObj = prevWorld.objects.find(o => o.x === newObj.x && o.y === newObj.y && o.type === newObj.type);
    if (!prevObj) continue;
    const diff = newObj.quantity - prevObj.quantity;
    if (diff < -0.5) {
      for (let i = 0; i < 6; i++) {
        particlesRef.current.push({
          x: newObj.x * CELL + CELL / 2, y: newObj.y * CELL + CELL / 2,
          vx: (Math.random() - 0.5) * 60, vy: -Math.random() * 40 - 20,
          time: now, life: 0.8, color: OBJ_COLORS[newObj.type] || C.amber, size: 2 + Math.random() * 3,
        });
      }
    }
    if (newObj.type === 'danger' && newObj.quantity > 0 && Math.random() < 0.3) {
      particlesRef.current.push({
        x: newObj.x * CELL + Math.random() * CELL, y: newObj.y * CELL + Math.random() * CELL,
        vx: (Math.random() - 0.5) * 20, vy: -Math.random() * 15,
        time: now, life: 0.6, color: C.red, size: 1.5 + Math.random() * 1.5,
      });
    }
  }
}

/* ═══════════════════════════════════════════════════
   Main Component
   ═══════════════════════════════════════════════════ */
export default function WorldSimulation() {
  const canvasRef = useRef(null);
  const worldRef = useRef(null);
  const prevWorldRef = useRef(null);
  const [world, setWorld] = useState(null);
  const [running, setRunning] = useState(false);
  const [tickSpeed, setTickSpeed] = useState(1.0);
  const [selectedAgent, setSelectedAgent] = useState(null);
  const selectedAgentRef = useRef(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const intervalRef = useRef(null);

  // Visual effect refs
  const agentSpritesRef = useRef({});
  const trailsRef = useRef([]);
  const floatingNumsRef = useRef([]);
  const particlesRef = useRef([]);
  const speechBubblesRef = useRef([]);

  // Camera state
  const cameraRef = useRef({ zoom: 1, panX: 0, panY: 0, dragging: false, lastX: 0, lastY: 0, moved: false });

  // Animation
  const animFrameRef = useRef(0);
  const frameRef = useRef(null);
  const [spritesLoaded, setSpritesLoaded] = useState(false);

  // Tooltip state
  const tooltipRef = useRef(null);

  // Context menu state
  const [contextMenu, setContextMenu] = useState(null);

  // Minimap click handler ref
  const minimapClickRef = useRef(false);

  // Load sprites on mount
  useEffect(() => {
    ensureSprites().then(() => setSpritesLoaded(true));
  }, []);

  // Keep selectedAgentRef in sync
  useEffect(() => { selectedAgentRef.current = selectedAgent; }, [selectedAgent]);

  // Fetch state
  const fetchState = useCallback(async () => {
    try {
      const res = await fetch(`${API_URL}/world/state`);
      if (!res.ok) throw new Error(`${res.status}`);
      const data = await res.json();

      if (worldRef.current) {
        generateEffects(
          worldRef.current, data, agentSpritesRef.current,
          trailsRef, floatingNumsRef, particlesRef, speechBubblesRef,
        );
      }

      prevWorldRef.current = worldRef.current;
      worldRef.current = data;
      setWorld(data);
      setRunning(data.running);
      setTickSpeed(data.tick_speed);
      setError(null);
    } catch (e) {
      setError(`Backend unreachable: ${e.message}`);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchState(); }, [fetchState]);

  // Auto-refresh when running
  useEffect(() => {
    if (running) {
      intervalRef.current = setInterval(fetchState, 1000);
    } else {
      if (intervalRef.current) clearInterval(intervalRef.current);
    }
    return () => { if (intervalRef.current) clearInterval(intervalRef.current); };
  }, [running, fetchState]);

  // Assign sprites to agents
  useEffect(() => {
    if (!world) return;
    const spriteMap = agentSpritesRef.current;
    const usedNames = new Set(Object.values(spriteMap));
    for (const a of world.agents) {
      if (!spriteMap[a.agent_id]) {
        const unused = SPRITE_NAMES.filter(n => !usedNames.has(n));
        const pick = unused.length > 0
          ? unused[Math.floor(Math.random() * unused.length)]
          : SPRITE_NAMES[Math.floor(Math.random() * SPRITE_NAMES.length)];
        spriteMap[a.agent_id] = pick;
        usedNames.add(pick);
      }
    }
  }, [world]);

  // Animation render loop
  useEffect(() => {
    if (!canvasRef.current) return;
    const ctx = canvasRef.current.getContext('2d');

    const render = () => {
      animFrameRef.current++;
      const w = worldRef.current;
      if (w && spritesReady) {
        const now = Date.now();
        trailsRef.current = trailsRef.current.filter(t => now - t.time < 3000);
        floatingNumsRef.current = floatingNumsRef.current.filter(n => now - n.startTime < 2000);
        particlesRef.current = particlesRef.current.filter(p => now - p.time < p.life * 1000);
        speechBubblesRef.current = speechBubblesRef.current.filter(b => now - b.startTime < 4000);

        // Ambient particles
        const dayNight = getDayNightPhase(w);

        // Fireflies near trees at night
        if (dayNight.phase === 'night' || dayNight.phase === 'dusk') {
          if (Math.random() < 0.08) {
            for (const obj of w.objects) {
              if (obj.type === 'tree' && Math.random() < 0.15) {
                particlesRef.current.push({
                  type: 'firefly',
                  x: obj.x * CELL + Math.random() * CELL, y: obj.y * CELL + Math.random() * CELL,
                  vx: 0, vy: 0, phase: Math.random() * 6.28,
                  time: now, life: 3 + Math.random() * 2, color: Math.random() > 0.5 ? '#aaff44' : '#88dd22', size: 1 + Math.random(),
                });
              }
            }
          }
        }

        // Campfire smoke
        if (Math.random() < 0.1 && w.buildings) {
          for (const b of w.buildings) {
            if (b.type === 'campfire' && Math.random() < 0.3) {
              particlesRef.current.push({
                type: 'smoke',
                x: b.x * CELL + CELL / 2 + (Math.random() - 0.5) * 6, y: b.y * CELL + CELL / 2 - 6,
                vx: 0, vy: 0,
                time: now, life: 2, color: '#888888', size: 1 + Math.random() * 2,
              });
            }
          }
        }

        // Rain particles
        const weather = getWeatherOverlay(w);
        if (weather.rainIntensity > 0) {
          const count = weather.rainIntensity;
          for (let i = 0; i < count; i++) {
            if (Math.random() < 0.3) {
              particlesRef.current.push({
                type: 'rain',
                x: Math.random() * CANVAS, y: -10,
                vx: 30, vy: 200,
                time: now, life: 1, color: '#6688cc', size: 1,
              });
            }
          }
        }

        // Dust motes (always)
        const dustCount = particlesRef.current.filter(p => p.type === 'dust').length;
        if (dustCount < 8 && Math.random() < 0.1) {
          particlesRef.current.push({
            type: 'dust',
            x: Math.random() * CANVAS, y: Math.random() * CANVAS,
            vx: 0, vy: 0, phase: Math.random() * 6.28,
            time: now, life: 6 + Math.random() * 4, color: '#aa9977', size: 1,
          });
        }

        // Danger sparks
        if (Math.random() < 0.05) {
          for (const obj of w.objects) {
            if (obj.type === 'danger' && obj.quantity > 0 && Math.random() < 0.2) {
              particlesRef.current.push({
                x: obj.x * CELL + Math.random() * CELL, y: obj.y * CELL + Math.random() * CELL,
                vx: (Math.random() - 0.5) * 20, vy: -Math.random() * 15,
                time: now, life: 0.6, color: C.red, size: 1.5 + Math.random(),
              });
            }
          }
        }

        renderWorld(ctx, w, selectedAgentRef.current, cameraRef.current, {
          trails: trailsRef.current,
          floatingNums: floatingNumsRef.current,
          particles: particlesRef.current,
          speechBubbles: speechBubblesRef.current,
          sprites: spriteImages,
          agentSprites: agentSpritesRef.current,
          animFrame: animFrameRef.current,
        }, tooltipRef.current);
      }
      frameRef.current = requestAnimationFrame(render);
    };

    frameRef.current = requestAnimationFrame(render);
    return () => { if (frameRef.current) cancelAnimationFrame(frameRef.current); };
  }, [spritesLoaded]);

  // ── API handlers ──
  const handleStart = async () => {
    await fetch(`${API_URL}/world/start`, { method: 'POST' });
    setRunning(true);
    fetchState();
  };

  const handleStop = async () => {
    await fetch(`${API_URL}/world/stop`, { method: 'POST' });
    setRunning(false);
    fetchState();
  };

  const handleReset = async () => {
    await fetch(`${API_URL}/world/reset`, { method: 'POST' });
    setSelectedAgent(null);
    agentSpritesRef.current = {};
    trailsRef.current = [];
    floatingNumsRef.current = [];
    particlesRef.current = [];
    speechBubblesRef.current = [];
    fetchState();
  };

  const handleTick = async () => {
    await fetch(`${API_URL}/world/tick`, { method: 'POST' });
    fetchState();
  };

  const handleSpeedChange = async (val) => {
    setTickSpeed(val);
    await fetch(`${API_URL}/world/config`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ tick_speed: val }),
    });
  };

  // ── Camera controls ──
  const handleWheel = useCallback((e) => {
    e.preventDefault();
    const cam = cameraRef.current;
    const rect = canvasRef.current.getBoundingClientRect();
    const mouseX = (e.clientX - rect.left) * (CANVAS / rect.width);
    const mouseY = (e.clientY - rect.top) * (CANVAS / rect.height);

    const zoomFactor = e.deltaY < 0 ? 1.12 : 0.89;
    const newZoom = Math.max(0.4, Math.min(5, cam.zoom * zoomFactor));
    const scale = newZoom / cam.zoom;

    cam.panX = mouseX - (mouseX - cam.panX) * scale;
    cam.panY = mouseY - (mouseY - cam.panY) * scale;
    cam.zoom = newZoom;
  }, []);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    canvas.addEventListener('wheel', handleWheel, { passive: false });
    return () => canvas.removeEventListener('wheel', handleWheel);
  }, [handleWheel]);

  const handleMouseDown = useCallback((e) => {
    // Check minimap click
    const rect = canvasRef.current.getBoundingClientRect();
    const scaleX = CANVAS / rect.width;
    const scaleY = CANVAS / rect.height;
    const screenX = (e.clientX - rect.left) * scaleX;
    const screenY = (e.clientY - rect.top) * scaleY;
    const mapSize = MINIMAP_SIZE;
    const mx = 8;
    const my = CANVAS - mapSize - 8;
    if (screenX >= mx && screenX <= mx + mapSize && screenY >= my && screenY <= my + mapSize) {
      minimapClickRef.current = true;
      const cellSize = mapSize / GRID;
      const gx = Math.floor((screenX - mx) / cellSize);
      const gy = Math.floor((screenY - my) / cellSize);
      const cam = cameraRef.current;
      cam.panX = -(gx * CELL) * cam.zoom + CANVAS / 2;
      cam.panY = -(gy * CELL) * cam.zoom + CANVAS / 2;
      e.preventDefault();
      return;
    }

    const cam = cameraRef.current;
    cam.dragging = true;
    cam.moved = false;
    cam.lastX = e.clientX;
    cam.lastY = e.clientY;
    setContextMenu(null);
  }, []);

  const handleMouseMove = useCallback((e) => {
    const cam = cameraRef.current;
    if (!cam.dragging) {
      // Hover tooltip
      const w = worldRef.current;
      if (w) {
        const rect = canvasRef.current.getBoundingClientRect();
        const screenX = (e.clientX - rect.left) * (CANVAS / rect.width);
        const screenY = (e.clientY - rect.top) * (CANVAS / rect.height);
        const worldX = (screenX - cam.panX) / cam.zoom;
        const worldY = (screenY - cam.panY) / cam.zoom;
        const gx = Math.floor(worldX / CELL);
        const gy = Math.floor(worldY / CELL);
        const hovered = w.agents.find(a => a.x === gx && a.y === gy && a.alive);
        if (hovered) {
          tooltipRef.current = {
            text: `${hovered.name} [${hovered.energy.toFixed(0)}% E]`,
            x: screenX, y: screenY,
          };
        } else {
          tooltipRef.current = null;
        }
      }
      return;
    }
    const dx = e.clientX - cam.lastX;
    const dy = e.clientY - cam.lastY;
    if (Math.abs(dx) > 2 || Math.abs(dy) > 2) cam.moved = true;
    cam.panX += dx * (CANVAS / canvasRef.current.getBoundingClientRect().width);
    cam.panY += dy * (CANVAS / canvasRef.current.getBoundingClientRect().height);
    cam.lastX = e.clientX;
    cam.lastY = e.clientY;
  }, []);

  const handleMouseUp = useCallback(() => {
    cameraRef.current.dragging = false;
    minimapClickRef.current = false;
  }, []);

  const handleCanvasClick = useCallback((e) => {
    if (minimapClickRef.current) return;
    const cam = cameraRef.current;
    if (cam.moved) return;
    const w = worldRef.current;
    if (!w) return;

    const rect = canvasRef.current.getBoundingClientRect();
    const screenX = (e.clientX - rect.left) * (CANVAS / rect.width);
    const screenY = (e.clientY - rect.top) * (CANVAS / rect.height);
    const worldX = (screenX - cam.panX) / cam.zoom;
    const worldY = (screenY - cam.panY) / cam.zoom;
    const gx = Math.floor(worldX / CELL);
    const gy = Math.floor(worldY / CELL);

    const clicked = w.agents.find(a => a.x === gx && a.y === gy && a.alive);
    if (clicked) {
      setSelectedAgent(clicked.agent_id === selectedAgentRef.current ? null : clicked.agent_id);
    } else {
      setSelectedAgent(null);
    }
  }, []);

  const handleDoubleClick = useCallback(() => {
    cameraRef.current = { zoom: 1, panX: 0, panY: 0, dragging: false, lastX: 0, lastY: 0, moved: false };
  }, []);

  // Right-click for cell info
  const handleContextMenu = useCallback((e) => {
    e.preventDefault();
    const cam = cameraRef.current;
    const rect = canvasRef.current.getBoundingClientRect();
    const screenX = (e.clientX - rect.left) * (CANVAS / rect.width);
    const screenY = (e.clientY - rect.top) * (CANVAS / rect.height);
    const worldX = (screenX - cam.panX) / cam.zoom;
    const worldY = (screenY - cam.panY) / cam.zoom;
    const gx = Math.floor(worldX / CELL);
    const gy = Math.floor(worldY / CELL);

    if (gx < 0 || gx >= GRID || gy < 0 || gy >= GRID) return;

    const terrain = getTerrain(gx, gy);
    const w = worldRef.current;
    const objs = w?.objects?.filter(o => o.x === gx && o.y === gy && o.quantity > 0) || [];
    const objText = objs.map(o => `${o.type}:${o.quantity}`).join(', ') || 'none';
    const agentsHere = w?.agents?.filter(a => a.x === gx && a.y === gy && a.alive).map(a => a.name).join(', ') || 'none';

    setContextMenu({
      x: e.clientX - rect.left,
      y: e.clientY - rect.top,
      gx, gy, terrain, objects: objText, agents: agentsHere,
    });
  }, []);

  if (loading) return <LoadingSkeleton />;

  const selAgent = world?.agents.find(a => a.agent_id === selectedAgent);
  const totalEnergy = world?.agents.reduce((s, a) => s + (a.alive ? a.energy : 0), 0) || 0;
  const recentEvents = world?.recent_events?.slice(-10) || [];

  const speedPresets = [0.5, 1, 2, 5];

  return (
    <div style={{ animation: 'ws-fadeIn 0.3s ease-out', position: 'relative' }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 16 }}>
        <div style={{ width: 10, height: 10, borderRadius: '50%', background: C.green, boxShadow: `0 0 8px ${C.green}` }} />
        <h2 style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: 18, color: C.green, margin: 0, textTransform: 'uppercase', letterSpacing: 2 }}>
          World Simulation
        </h2>
        {error && <span style={{ color: C.amber, fontSize: 12, fontFamily: 'JetBrains Mono, monospace' }}>{error}</span>}
        <span style={{ color: C.dim, fontSize: 10, fontFamily: 'JetBrains Mono, monospace', marginLeft: 'auto' }}>
          SCROLL=ZOOM &middot; DRAG=PAN &middot; DBL-CLICK=RESET &middot; RIGHT-CLICK=INFO
        </span>
      </div>

      <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap' }}>
        {/* Canvas column */}
        <div style={{ flexShrink: 0, position: 'relative' }}>
          {/* Controls */}
          <div style={panelStyle}>
            <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
              {!running
                ? <button onClick={handleStart} style={btnStyle(C.green)}>&#9654; START</button>
                : <button onClick={handleStop} style={btnStyle(C.red)}>&#9632; STOP</button>
              }
              <button onClick={handleTick} style={btnStyle(C.cyan)}>&#9193; TICK</button>
              <button onClick={handleReset} style={btnStyle(C.amber)}>&#8634; RESET</button>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginLeft: 12 }}>
                <span style={labelStyle}>SPEED</span>
                <input
                  type="range" min="0.1" max="5" step="0.1"
                  value={tickSpeed}
                  onChange={(e) => handleSpeedChange(parseFloat(e.target.value))}
                  style={{ width: 80, accentColor: C.green }}
                />
                <span style={{ ...labelStyle, color: C.green }}>{tickSpeed.toFixed(1)}s</span>
                {speedPresets.map(p => (
                  <button
                    key={p}
                    onClick={() => handleSpeedChange(p)}
                    style={{
                      ...btnStyle(Math.abs(tickSpeed - p) < 0.05 ? C.green : C.dim),
                      padding: '2px 8px', fontSize: 9,
                      background: Math.abs(tickSpeed - p) < 0.05 ? `${C.green}20` : 'transparent',
                    }}
                  >
                    {p}x
                  </button>
                ))}
              </div>
            </div>
          </div>

          {/* Canvas */}
          <canvas
            ref={canvasRef}
            width={CANVAS}
            height={CANVAS}
            onClick={handleCanvasClick}
            onDoubleClick={handleDoubleClick}
            onMouseDown={handleMouseDown}
            onMouseMove={handleMouseMove}
            onMouseUp={handleMouseUp}
            onMouseLeave={handleMouseUp}
            onContextMenu={handleContextMenu}
            style={{
              border: `1px solid ${C.dim}`,
              borderRadius: 6,
              cursor: cameraRef.current?.dragging ? 'grabbing' : 'crosshair',
              maxWidth: '100%',
              imageRendering: 'pixelated',
              boxShadow: `0 0 20px rgba(0,255,136,0.08)`,
            }}
          />

          {/* Context menu overlay */}
          {contextMenu && (
            <div style={{
              position: 'absolute', left: contextMenu.x + 10, top: contextMenu.y + 10,
              background: 'rgba(20,20,35,0.95)', border: `1px solid ${C.dim}`, borderRadius: 6,
              padding: '8px 12px', fontFamily: 'JetBrains Mono, monospace', fontSize: 11,
              color: C.text, zIndex: 10, minWidth: 160, pointerEvents: 'auto',
            }}>
              <div style={{ color: C.cyan, marginBottom: 4 }}>CELL ({contextMenu.gx}, {contextMenu.gy})</div>
              <div>Biome: <span style={{ color: C.green }}>{contextMenu.terrain}</span></div>
              <div>Objects: <span style={{ color: C.amber }}>{contextMenu.objects}</span></div>
              <div>Agents: <span style={{ color: C.purple }}>{contextMenu.agents}</span></div>
              <div style={{ marginTop: 4, fontSize: 9, color: C.dim }}>Click anywhere to close</div>
            </div>
          )}
        </div>

        {/* Right sidebar */}
        <div style={{ flex: 1, minWidth: 260, maxWidth: 360, display: 'flex', flexDirection: 'column', gap: 12 }}>
          {/* Stats */}
          <div style={panelStyle}>
            <div style={panelTitleStyle}>STATS</div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
              <StatBlock label="TICK" value={world?.tick || 0} color={C.cyan} />
              <StatBlock label="TOTAL ENERGY" value={totalEnergy.toFixed(0)} color={C.green} />
              <StatBlock label="MESSAGES" value={world?.stats?.messages_sent || 0} color={C.amber} />
              <StatBlock label="GATHERED" value={world?.stats?.objects_gathered || 0} color={C.purple} />
              <StatBlock label="ALIVE" value={world?.agents?.filter(a => a.alive).length || 0} color={C.green} />
              <StatBlock label="DANGERS" value={world?.stats?.dangers_encountered || 0} color={C.red} />
            </div>
            {/* Weather & time info */}
            <div style={{ display: 'flex', gap: 12, marginTop: 8, fontSize: 10, fontFamily: 'JetBrains Mono, monospace' }}>
              <span style={{ color: C.dim }}>WEATHER: <span style={{ color: C.cyan }}>{(world?.weather || 'clear').toUpperCase()}</span></span>
              <span style={{ color: C.dim }}>TIME: <span style={{ color: C.amber }}>{getDayNightPhase(world).phase.toUpperCase()}</span></span>
            </div>
          </div>

          {/* Agent list */}
          <div style={panelStyle}>
            <div style={panelTitleStyle}>AGENTS</div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              {world?.agents?.map(a => {
                const spriteName = agentSpritesRef.current[a.agent_id];
                return (
                  <div
                    key={a.agent_id}
                    onClick={() => setSelectedAgent(a.agent_id === selectedAgent ? null : a.agent_id)}
                    style={{
                      display: 'flex', alignItems: 'center', gap: 8, padding: '6px 8px',
                      borderRadius: 6, cursor: 'pointer',
                      background: a.agent_id === selectedAgent ? C.panelLight : 'transparent',
                      border: a.agent_id === selectedAgent ? `1px solid ${a.color}40` : '1px solid transparent',
                      transition: 'all 0.15s',
                      opacity: a.alive ? 1 : 0.4,
                    }}
                  >
                    <div style={{ width: 10, height: 10, borderRadius: '50%', background: a.color, boxShadow: `0 0 6px ${a.color}60` }} />
                    <span style={{ ...labelStyle, color: C.textBright, flex: 1 }}>{a.name}</span>
                    {spriteName && (
                      <span style={{ fontSize: 8, color: C.dim, fontFamily: 'JetBrains Mono', textTransform: 'uppercase' }}>
                        {spriteName}
                      </span>
                    )}
                    <span style={{ fontSize: 10, fontFamily: 'JetBrains Mono', color: a.energy > 30 ? C.green : C.red }}>
                      {a.energy.toFixed(0)}%
                    </span>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Agent detail panel */}
          {selAgent && (
            <div style={{ ...panelStyle, animation: 'ws-fadeIn 0.2s ease-out' }}>
              <div style={panelTitleStyle}>{selAgent.name} DETAIL</div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6, fontSize: 12, fontFamily: 'JetBrains Mono, monospace' }}>
                {/* Personality badge */}
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <span style={{ color: C.amber, fontSize: 14 }}>{PERSONALITY_ICONS[selAgent.personality] || '\u25CB'}</span>
                  <span style={{ color: C.textBright }}>{selAgent.personality || 'unknown'}</span>
                  <span style={{ color: C.dim, marginLeft: 'auto', fontSize: 10 }}>
                    LVL {selAgent.level || 1}
                  </span>
                </div>

                {/* Mood */}
                <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                  <span style={{ color: C.dim }}>MOOD:</span>
                  <span style={{ fontSize: 14 }}>{MOOD_ICONS[selAgent.mood] || '\u25CB'}</span>
                  <span style={{ color: C.text }}>{selAgent.mood || 'neutral'}</span>
                </div>

                {/* Action status */}
                <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                  <span style={{ color: C.dim }}>ACTION:</span>
                  <span style={{ fontSize: 14 }}>{ACTION_ICONS[selAgent.current_action] || '\u25CB'}</span>
                  <span style={{ color: C.cyan }}>{selAgent.current_action || 'idle'}</span>
                </div>

                {/* Bars */}
                <BarRow label="ENERGY" value={selAgent.energy} color={C.green} />
                <BarRow label="HEALTH" value={selAgent.health} color={selAgent.health > 50 ? C.green : selAgent.health > 25 ? C.amber : C.red} />
                <BarRow label="XP" value={selAgent.xp != null ? (selAgent.xp % 100) : 0} color={C.purple} />

                {/* Position */}
                <div style={{ color: C.dim }}>
                  POS: ({selAgent.x}, {selAgent.y}) &middot; FACING: {selAgent.direction}
                </div>
                <div style={{ color: C.dim }}>
                  CLASS: {agentSpritesRef.current[selAgent.agent_id]?.toUpperCase() || 'UNKNOWN'}
                </div>

                {/* Inventory grid */}
                <div style={{ marginTop: 4 }}>
                  <div style={{ color: C.amber, marginBottom: 4 }}>INVENTORY:</div>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
                    {Object.keys(selAgent.inventory || {}).length === 0 && (
                      <span style={{ color: C.dim, fontSize: 10 }}>empty</span>
                    )}
                    {Object.entries(selAgent.inventory || {}).map(([k, v]) => {
                      const itemColors = { food: '#cc3333', water: '#3388ff', tool: '#888899', wood: '#6a4a2a', stone: '#555' };
                      return (
                        <div key={k} style={{
                          display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2,
                          padding: '3px 6px', background: C.panelLight, borderRadius: 4, minWidth: 36,
                        }}>
                          <div style={{ width: 12, height: 12, background: itemColors[k] || C.dim, borderRadius: 2 }} />
                          <span style={{ fontSize: 8, color: C.text }}>{k}:{v}</span>
                        </div>
                      );
                    })}
                  </div>
                </div>

                {/* Trust relationships */}
                {selAgent.trust && Object.keys(selAgent.trust).length > 0 && (
                  <div style={{ marginTop: 4 }}>
                    <div style={{ color: C.cyan, marginBottom: 4 }}>TRUST:</div>
                    {Object.entries(selAgent.trust).map(([id, val]) => {
                      const otherAgent = world?.agents?.find(a => a.agent_id === id);
                      return (
                        <div key={id} style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 2 }}>
                          <span style={{ fontSize: 10, color: otherAgent?.color || C.text, width: 50 }}>
                            {otherAgent?.name || id}
                          </span>
                          <div style={{ flex: 1, height: 4, background: '#111', borderRadius: 2, overflow: 'hidden' }}>
                            <div style={{
                              width: `${Math.max(0, Math.min(100, (val || 0) * 100))}%`, height: '100%',
                              background: val > 0.5 ? C.green : val > 0.25 ? C.amber : C.red,
                              borderRadius: 2,
                            }} />
                          </div>
                          <span style={{ fontSize: 9, color: C.dim, width: 28, textAlign: 'right' }}>
                            {((val || 0) * 100).toFixed(0)}%
                          </span>
                        </div>
                      );
                    })}
                  </div>
                )}

                {/* Active quests */}
                {selAgent.active_quests && selAgent.active_quests.length > 0 && (
                  <div style={{ marginTop: 4 }}>
                    <div style={{ color: C.purple, marginBottom: 4 }}>QUESTS:</div>
                    {selAgent.active_quests.map((q, i) => (
                      <div key={i} style={{ marginBottom: 3 }}>
                        <div style={{ fontSize: 10, color: C.text }}>{q.name || q.description || `Quest ${i + 1}`}</div>
                        {q.progress != null && (
                          <div style={{ display: 'flex', alignItems: 'center', gap: 4, marginTop: 2 }}>
                            <div style={{ flex: 1, height: 3, background: '#111', borderRadius: 2, overflow: 'hidden' }}>
                              <div style={{ width: `${Math.max(0, Math.min(100, q.progress))}%`, height: '100%', background: C.purple, borderRadius: 2 }} />
                            </div>
                            <span style={{ fontSize: 8, color: C.dim }}>{q.progress}%</span>
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                )}

                {/* Recent messages */}
                <div style={{ marginTop: 4 }}>
                  <div style={{ color: C.amber, marginBottom: 4 }}>RECENT MESSAGES:</div>
                  {selAgent.messages?.length === 0 && <div style={{ color: C.dim, fontSize: 10 }}>(none)</div>}
                  {selAgent.messages?.slice(-5).reverse().map((m, i) => (
                    <div key={i} style={{ color: C.text, fontSize: 10, padding: '2px 0', borderBottom: `1px solid ${C.panelLight}` }}>
                      <span style={{ color: C.dim }}>[t{m.tick}]</span> {m.text}
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}

          {/* World Events Feed */}
          {recentEvents.length > 0 && (
            <div style={panelStyle}>
              <div style={panelTitleStyle}>WORLD EVENTS</div>
              <div style={{ maxHeight: 150, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 2 }}>
                {recentEvents.map((ev, i) => {
                  const evtColor = EVENT_COLORS[ev.type] || EVENT_COLORS.default;
                  return (
                    <div key={i} style={{
                      fontSize: 10, fontFamily: 'JetBrains Mono, monospace',
                      color: C.text, padding: '2px 4px',
                      display: 'flex', alignItems: 'center', gap: 6,
                    }}>
                      <span style={{ color: C.dim, fontSize: 9, width: 30 }}>t{ev.tick}</span>
                      <div style={{ width: 6, height: 6, borderRadius: '50%', background: evtColor, flexShrink: 0 }} />
                      <span style={{ flex: 1 }}>{ev.text}</span>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* Chat bubbles feed */}
          <div style={panelStyle}>
            <div style={panelTitleStyle}>LIVE CHAT</div>
            <div style={{ maxHeight: 160, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 4 }}>
              {world?.chat_bubbles?.length === 0 && (
                <div style={{ color: C.dim, fontSize: 11, fontFamily: 'JetBrains Mono' }}>(no active messages)</div>
              )}
              {world?.chat_bubbles?.map((b, i) => (
                <div key={i} style={{
                  fontSize: 11, fontFamily: 'JetBrains Mono, monospace',
                  color: C.text, padding: '3px 6px',
                  background: C.panelLight, borderRadius: 4,
                  borderLeft: `2px solid ${C.green}`,
                }}>
                  <span style={{ color: C.green }}>[{b.agent_id}]</span> {b.text}
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

/* ───── Sub-components ───── */
function StatBlock({ label, value, color }) {
  return (
    <div style={{ padding: '6px 8px', background: C.panelLight, borderRadius: 6 }}>
      <div style={{ fontSize: 9, fontFamily: 'JetBrains Mono, monospace', color: C.dim, textTransform: 'uppercase' }}>{label}</div>
      <div style={{ fontSize: 20, fontFamily: 'JetBrains Mono, monospace', color, fontWeight: 700 }}>{value}</div>
    </div>
  );
}

function BarRow({ label, value, color }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
      <span style={{ width: 50, color: C.dim }}>{label}</span>
      <div style={{ flex: 1, height: 8, background: '#111', borderRadius: 4, overflow: 'hidden' }}>
        <div style={{ width: `${Math.max(0, Math.min(100, value))}%`, height: '100%', background: color, borderRadius: 4, transition: 'width 0.3s ease' }} />
      </div>
      <span style={{ width: 36, textAlign: 'right', color }}>{value.toFixed(1)}%</span>
    </div>
  );
}

function LoadingSkeleton() {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16, padding: 20 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
        <div style={{ width: 10, height: 10, borderRadius: '50%', background: C.dim }} />
        <div style={{ width: 200, height: 20, background: C.panel, borderRadius: 4 }} />
      </div>
      <div style={{ display: 'flex', gap: 16 }}>
        <div style={{ width: 800, height: 800, background: C.panel, borderRadius: 6 }} />
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 12 }}>
          {[1, 2, 3].map(i => (
            <div key={i} style={{ height: 100, background: C.panel, borderRadius: 6 }} />
          ))}
        </div>
      </div>
    </div>
  );
}

/* ───── Styles ───── */
const panelStyle = {
  background: C.panel,
  border: `1px solid ${C.dim}33`,
  borderRadius: 8,
  padding: 12,
  fontFamily: 'JetBrains Mono, monospace',
};

const panelTitleStyle = {
  fontSize: 10,
  color: C.dim,
  textTransform: 'uppercase',
  letterSpacing: 2,
  marginBottom: 8,
  fontFamily: 'JetBrains Mono, monospace',
};

const labelStyle = {
  fontSize: 10,
  color: C.text,
  fontFamily: 'JetBrains Mono, monospace',
  textTransform: 'uppercase',
};

function btnStyle(color) {
  return {
    background: 'transparent',
    border: `1px solid ${color}60`,
    color,
    padding: '6px 14px',
    borderRadius: 6,
    cursor: 'pointer',
    fontFamily: 'JetBrains Mono, monospace',
    fontSize: 11,
    textTransform: 'uppercase',
    letterSpacing: 1,
    transition: 'all 0.15s',
  };
}
