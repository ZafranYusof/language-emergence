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
  tree: '#22cc66',
  water: '#3388ff',
  food: '#ffdd44',
  tool: '#888899',
  danger: '#ff4444',
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
          ctx.fillStyle = '#0f1f0f';
          ctx.fillRect(px, py, CELL, CELL);
          // Grass tufts
          ctx.fillStyle = '#1a3a1a';
          const gx1 = px + (seed * 30) | 0;
          const gy1 = py + (seed2 * 30) | 0;
          ctx.fillRect(gx1, gy1, 2, 3);
          if (seed > 0.3) ctx.fillRect(gx1 + 12, gy1 + 8, 2, 2);
          if (seed > 0.6) ctx.fillRect(gx1 + 6, gy1 + 20, 2, 3);
          break;
        }
        case 'stone': {
          ctx.fillStyle = '#161618';
          ctx.fillRect(px, py, CELL, CELL);
          // Crack lines
          ctx.strokeStyle = '#2a2a2e';
          ctx.lineWidth = 0.5;
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
          ctx.fillStyle = '#1a140e';
          ctx.fillRect(px, py, CELL, CELL);
          // Pebbles
          ctx.fillStyle = '#2a2018';
          ctx.fillRect(px + (seed * 28) | 0, py + (seed2 * 28) | 0, 2, 2);
          if (seed > 0.3) ctx.fillRect(px + ((seed2 * 20 + 10) | 0), py + ((seed * 25 + 5) | 0), 3, 2);
          break;
        }
        case 'water': {
          ctx.fillStyle = '#0a1525';
          ctx.fillRect(px, py, CELL, CELL);
          // Animated wave lines
          ctx.strokeStyle = '#1a3050';
          ctx.lineWidth = 0.5;
          const waveOff = ((animFrame * 0.02 + seed * 10) % 40) | 0;
          ctx.beginPath();
          ctx.moveTo(px, py + waveOff);
          ctx.quadraticCurveTo(px + CELL / 2, py + waveOff - 3, px + CELL, py + waveOff);
          ctx.stroke();
          break;
        }
        default:
          ctx.fillStyle = '#0d0d1a';
          ctx.fillRect(px, py, CELL, CELL);
      }
    }
  }
}

function drawGrid(ctx) {
  ctx.strokeStyle = C.gridLine;
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
      // Pulsing red zone
      ctx.fillStyle = col;
      ctx.globalAlpha = 0.15 + Math.sin(animFrame * 0.05) * 0.1;
      ctx.fillRect(obj.x * CELL + 2, obj.y * CELL + 2, CELL - 4, CELL - 4);
      // Warning icon drawn as pixel art
      ctx.globalAlpha = 1;
      ctx.fillStyle = col;
      const bx = cx - 4, by = cy - 6;
      ctx.fillRect(bx + 3, by, 2, 2);
      ctx.fillRect(bx + 2, by + 2, 4, 2);
      ctx.fillRect(bx + 1, by + 4, 6, 2);
      ctx.fillRect(bx, by + 6, 8, 2);
      ctx.fillRect(bx + 3, by + 9, 2, 1);
    } else if (obj.type === 'tree') {
      // Pixel art tree
      ctx.globalAlpha = 1;
      ctx.fillStyle = '#1a5a2a';
      ctx.fillRect(cx - 6, cy - 10, 12, 4);
      ctx.fillRect(cx - 8, cy - 7, 16, 4);
      ctx.fillRect(cx - 6, cy - 3, 12, 3);
      ctx.fillStyle = '#5a3a1a';
      ctx.fillRect(cx - 2, cy, 4, 5);
    } else if (obj.type === 'water') {
      // Water drop pixel art
      ctx.globalAlpha = 0.8;
      ctx.fillStyle = '#3388ff';
      ctx.fillRect(cx - 2, cy - 8, 4, 2);
      ctx.fillRect(cx - 4, cy - 6, 8, 2);
      ctx.fillRect(cx - 4, cy - 4, 8, 4);
      ctx.fillRect(cx - 2, cy, 4, 2);
    } else if (obj.type === 'food') {
      // Apple pixel art
      ctx.globalAlpha = 1;
      ctx.fillStyle = '#cc3333';
      ctx.fillRect(cx - 4, cy - 4, 8, 8);
      ctx.fillRect(cx - 2, cy - 6, 4, 2);
      ctx.fillStyle = '#33aa33';
      ctx.fillRect(cx + 1, cy - 7, 2, 2);
    } else if (obj.type === 'tool') {
      // Wrench pixel art
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

function drawAgent(ctx, agent, selectedAgent, effects) {
  const { sprites, agentSprites: agentSpriteMap, animFrame } = effects;
  const cx = agent.x * CELL + CELL / 2;
  const cy = agent.y * CELL + CELL / 2;
  const isSelected = agent.agent_id === selectedAgent;

  // Selection glow
  if (isSelected) {
    ctx.strokeStyle = agent.color;
    ctx.lineWidth = 2;
    ctx.globalAlpha = 0.3 + Math.sin(animFrame * 0.08) * 0.2;
    ctx.strokeRect(agent.x * CELL + 1, agent.y * CELL + 1, CELL - 2, CELL - 2);
    ctx.globalAlpha = 1;
  }

  // Walking bob animation
  const bobPhase = Math.sin(animFrame * 0.12 + hashCoord(agent.x, agent.y) * 6.28);
  const bobY = bobPhase * 1.5; // ±1.5px bob

  // Draw sprite
  const spriteName = agentSpriteMap[agent.agent_id];
  const img = spriteName ? sprites[spriteName] : null;

  if (img && img.naturalWidth) {
    const scale = Math.min((CELL - 6) / img.naturalWidth, (CELL - 4) / img.naturalHeight);
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

    // Sprite (with walking flip effect)
    ctx.save();
    const flipFrame = Math.floor(animFrame / 15) % 2;
    if (flipFrame && Math.abs(bobPhase) > 0.5) {
      // Slight horizontal flip for walking frames
      ctx.translate(cx, 0);
      ctx.scale(-1, 1);
      ctx.translate(-cx, 0);
    }
    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(img, drawX, drawY, drawW, drawH);
    ctx.restore();
  } else {
    // Fallback: colored circle
    ctx.beginPath();
    ctx.arc(cx, cy + bobY, 14, 0, Math.PI * 2);
    ctx.fillStyle = agent.color;
    ctx.globalAlpha = 0.9;
    ctx.fill();
    ctx.globalAlpha = 1;
    ctx.strokeStyle = C.textBright;
    ctx.lineWidth = 1.5;
    ctx.stroke();
    // Initial letter
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
  // Black border (pixel style)
  ctx.fillStyle = '#000';
  ctx.fillRect(barX - 1, barY - 1, barW + 2, barH + 2);
  // Background
  ctx.fillStyle = '#1a0a0a';
  ctx.fillRect(barX, barY, barW, barH);
  // Health fill — stepped/pixelated
  const hFrac = Math.max(0, Math.min(1, agent.health / 100));
  const filledPx = Math.round(barW * hFrac);
  const hColor = hFrac > 0.5 ? C.green : hFrac > 0.25 ? C.amber : C.red;
  ctx.fillStyle = hColor;
  ctx.fillRect(barX, barY, filledPx, barH);
  // Pixel dithering on the bar edge
  if (filledPx > 0 && filledPx < barW) {
    ctx.fillStyle = '#000';
    for (let i = 0; i < barH; i += 2) {
      ctx.fillRect(barX + filledPx, barY + i, 1, 1);
    }
  }

  // Energy bar (smaller, below health)
  const eBarW = 22;
  const eBarH = 2;
  const eBarX = cx - eBarW / 2;
  const eBarY = barY + barH + 2;
  ctx.fillStyle = '#000';
  ctx.fillRect(eBarX, eBarY, eBarW, eBarH);
  const eFrac = Math.max(0, Math.min(1, agent.energy / 100));
  ctx.fillStyle = C.cyan;
  ctx.fillRect(eBarX, eBarY, Math.round(eBarW * eFrac), eBarH);

  // Direction indicator (small arrow)
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
    const alpha = Math.max(0, 1 - age / p.life);
    const px = p.x + p.vx * age;
    const py = p.y + p.vy * age - age * 20; // slight float up
    ctx.globalAlpha = alpha;
    ctx.fillStyle = p.color;
    const sz = p.size * (1 - age / p.life * 0.5);
    ctx.fillRect(px - sz / 2, py - sz / 2, sz, sz);
  }
  ctx.globalAlpha = 1;
}

function drawFloatingNums(ctx, nums, now) {
  for (const n of nums) {
    const age = (now - n.startTime) / 1000;
    if (age > 2) continue;
    const alpha = Math.max(0, 1 - age / 2);
    const yOff = -age * 30; // float upward
    ctx.globalAlpha = alpha;
    ctx.font = 'bold 10px JetBrains Mono, monospace';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    // Pixel shadow
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

    // Pointer triangle
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

function drawChatBubbles(ctx, chatBubbles) {
  for (const bubble of chatBubbles) {
    const bx = bubble.x * CELL + CELL / 2;
    const by = bubble.y * CELL - 28;
    const text = bubble.text.length > 40 ? bubble.text.slice(0, 40) + '\u2026' : bubble.text;

    ctx.font = '9px JetBrains Mono, monospace';
    const measured = ctx.measureText(text).width;
    const bw = measured + 16;
    const bh = 18;
    const bbx = bx - bw / 2;
    const bby = by - bh / 2;

    ctx.fillStyle = 'rgba(26,26,46,0.92)';
    roundRect(ctx, bbx, bby, bw, bh, 4);
    ctx.fill();

    ctx.strokeStyle = C.cyan + '60';
    ctx.lineWidth = 0.5;
    roundRect(ctx, bbx, bby, bw, bh, 4);
    ctx.stroke();

    // Pointer
    ctx.fillStyle = 'rgba(26,26,46,0.92)';
    ctx.beginPath();
    ctx.moveTo(bx - 3, bby + bh);
    ctx.lineTo(bx, bby + bh + 4);
    ctx.lineTo(bx + 3, bby + bh);
    ctx.fill();

    ctx.fillStyle = C.cyan;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(text, bx, by);
  }
}

function getDayNightAlpha() {
  const time = Date.now() / 1000;
  // 60 second full cycle
  const phase = Math.sin(time / 30 * Math.PI);
  // phase goes -1 to 1; map to 0 (day) to 0.25 (night)
  return Math.max(0, -phase) * 0.25;
}

function renderWorld(ctx, world, selectedAgent, camera, effects) {
  const w = ctx.canvas.width;
  const h = ctx.canvas.height;
  const now = Date.now();

  // Clear canvas
  ctx.fillStyle = '#050508';
  ctx.fillRect(0, 0, w, h);

  // Apply camera transform
  ctx.save();
  ctx.translate(camera.panX, camera.panY);
  ctx.scale(camera.zoom, camera.zoom);

  // Terrain
  drawTerrain(ctx, effects.animFrame);

  // Grid lines
  drawGrid(ctx);

  // Footstep trails
  drawTrails(ctx, effects.trails, now);

  // Objects
  drawObjects(ctx, world.objects, effects.animFrame);

  // Agents (sorted by y for depth)
  const sortedAgents = [...world.agents].sort((a, b) => a.y - b.y);
  for (const agent of sortedAgents) {
    if (!agent.alive) continue;
    drawAgent(ctx, agent, selectedAgent, effects);
  }

  // Particles
  drawParticles(ctx, effects.particles, now);

  // Floating numbers
  drawFloatingNums(ctx, effects.floatingNums, now);

  // Speech bubbles (from particles system)
  drawSpeechBubbles(ctx, effects.speechBubbles, now);

  // Chat bubbles from world state
  drawChatBubbles(ctx, world.chat_bubbles || []);

  ctx.restore();

  // Day/night tint overlay (applied to full canvas)
  const nightAlpha = getDayNightAlpha();
  if (nightAlpha > 0.01) {
    ctx.fillStyle = `rgba(0, 0, 40, ${nightAlpha})`;
    ctx.fillRect(0, 0, w, h);
  }

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

  // Agent trails and health changes
  for (const newAgent of newWorld.agents) {
    const prevAgent = prevWorld.agents.find(a => a.agent_id === newAgent.agent_id);
    if (!prevAgent) continue;

    // Trail at old position if agent moved
    if (prevAgent.alive && (prevAgent.x !== newAgent.x || prevAgent.y !== newAgent.y)) {
      trailsRef.current.push({
        x: prevAgent.x,
        y: prevAgent.y,
        time: now,
        color: newAgent.color,
      });
    }

    // Health change floating number
    if (prevAgent.alive && newAgent.alive) {
      const hpDiff = newAgent.health - prevAgent.health;
      if (Math.abs(hpDiff) > 0.5) {
        floatingNumsRef.current.push({
          text: hpDiff > 0 ? `+${Math.round(hpDiff)}` : `${Math.round(hpDiff)}`,
          x: newAgent.x * CELL + CELL / 2,
          y: newAgent.y * CELL - 10,
          startTime: now,
          color: hpDiff > 0 ? C.green : C.red,
        });
      }
      // Energy change
      const eDiff = newAgent.energy - prevAgent.energy;
      if (Math.abs(eDiff) > 0.5) {
        floatingNumsRef.current.push({
          text: eDiff > 0 ? `+${Math.round(eDiff)}E` : `${Math.round(eDiff)}E`,
          x: newAgent.x * CELL + CELL / 2 + 16,
          y: newAgent.y * CELL,
          startTime: now,
          color: C.cyan,
        });
      }
    }

    // Communication particle (speech bubble)
    if (newAgent.messages && prevAgent.messages) {
      const newMsgs = newAgent.messages.filter(m => !prevAgent.messages.find(pm => pm.tick === m.tick && pm.text === m.text));
      for (const msg of newMsgs) {
        speechBubblesRef.current.push({
          text: msg.text,
          x: newAgent.x * CELL + CELL / 2,
          y: newAgent.y * CELL,
          startTime: now,
        });
        // Communication sparkles
        for (let i = 0; i < 4; i++) {
          particlesRef.current.push({
            x: newAgent.x * CELL + CELL / 2,
            y: newAgent.y * CELL + CELL / 2,
            vx: (Math.random() - 0.5) * 40,
            vy: -Math.random() * 30 - 10,
            time: now,
            life: 1.0,
            color: C.cyan,
            size: 2 + Math.random() * 2,
          });
        }
      }
    }
  }

  // Object changes (gathered resources)
  for (const newObj of newWorld.objects) {
    const prevObj = prevWorld.objects.find(o => o.x === newObj.x && o.y === newObj.y && o.type === newObj.type);
    if (!prevObj) continue;
    const diff = newObj.quantity - prevObj.quantity;
    if (diff < -0.5) {
      // Object was gathered — sparkle particles
      for (let i = 0; i < 6; i++) {
        particlesRef.current.push({
          x: newObj.x * CELL + CELL / 2,
          y: newObj.y * CELL + CELL / 2,
          vx: (Math.random() - 0.5) * 60,
          vy: -Math.random() * 40 - 20,
          time: now,
          life: 0.8,
          color: OBJ_COLORS[newObj.type] || C.amber,
          size: 2 + Math.random() * 3,
        });
      }
    }
    if (newObj.type === 'danger' && newObj.quantity > 0) {
      // Danger red sparks near danger zones
      if (Math.random() < 0.3) {
        particlesRef.current.push({
          x: newObj.x * CELL + Math.random() * CELL,
          y: newObj.y * CELL + Math.random() * CELL,
          vx: (Math.random() - 0.5) * 20,
          vy: -Math.random() * 15,
          time: now,
          life: 0.6,
          color: C.red,
          size: 1.5 + Math.random() * 1.5,
        });
      }
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

      // Diff with previous state to generate visual effects
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

  // Assign sprites to agents (persistent across renders)
  useEffect(() => {
    if (!world) return;
    const spriteMap = agentSpritesRef.current;
    const usedNames = new Set(Object.values(spriteMap));
    for (const a of world.agents) {
      if (!spriteMap[a.agent_id]) {
        // Pick unused sprite first, then random
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
        // Cleanup old effects
        const now = Date.now();
        trailsRef.current = trailsRef.current.filter(t => now - t.time < 3000);
        floatingNumsRef.current = floatingNumsRef.current.filter(n => now - n.startTime < 2000);
        particlesRef.current = particlesRef.current.filter(p => now - p.time < p.life * 1000);
        speechBubblesRef.current = speechBubblesRef.current.filter(b => now - b.startTime < 4000);

        // Ambient danger sparks
        if (Math.random() < 0.05) {
          for (const obj of w.objects) {
            if (obj.type === 'danger' && obj.quantity > 0 && Math.random() < 0.2) {
              particlesRef.current.push({
                x: obj.x * CELL + Math.random() * CELL,
                y: obj.y * CELL + Math.random() * CELL,
                vx: (Math.random() - 0.5) * 20,
                vy: -Math.random() * 15,
                time: now,
                life: 0.6,
                color: C.red,
                size: 1.5 + Math.random(),
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
        });
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

  const handleSpeedChange = async (e) => {
    const val = parseFloat(e.target.value);
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
    const cam = cameraRef.current;
    cam.dragging = true;
    cam.moved = false;
    cam.lastX = e.clientX;
    cam.lastY = e.clientY;
  }, []);

  const handleMouseMove = useCallback((e) => {
    const cam = cameraRef.current;
    if (!cam.dragging) return;
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
  }, []);

  const handleCanvasClick = useCallback((e) => {
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

  // Double-click to reset camera
  const handleDoubleClick = useCallback(() => {
    cameraRef.current = { zoom: 1, panX: 0, panY: 0, dragging: false, lastX: 0, lastY: 0, moved: false };
  }, []);

  if (loading) return <LoadingSkeleton />;

  const selAgent = world?.agents.find(a => a.agent_id === selectedAgent);
  const totalEnergy = world?.agents.reduce((s, a) => s + (a.alive ? a.energy : 0), 0) || 0;

  return (
    <div style={{ animation: 'ws-fadeIn 0.3s ease-out' }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 16 }}>
        <div style={{ width: 10, height: 10, borderRadius: '50%', background: C.green, boxShadow: `0 0 8px ${C.green}` }} />
        <h2 style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: 18, color: C.green, margin: 0, textTransform: 'uppercase', letterSpacing: 2 }}>
          World Simulation
        </h2>
        {error && <span style={{ color: C.amber, fontSize: 12, fontFamily: 'JetBrains Mono, monospace' }}>{error}</span>}
        <span style={{ color: C.dim, fontSize: 10, fontFamily: 'JetBrains Mono, monospace', marginLeft: 'auto' }}>
          SCROLL=ZOOM · DRAG=PAN · DBL-CLICK=RESET
        </span>
      </div>

      <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap' }}>
        {/* Canvas column */}
        <div style={{ flexShrink: 0 }}>
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
                  onChange={handleSpeedChange}
                  style={{ width: 100, accentColor: C.green }}
                />
                <span style={{ ...labelStyle, color: C.green }}>{tickSpeed.toFixed(1)}s</span>
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
            style={{
              border: `1px solid ${C.dim}`,
              borderRadius: 6,
              cursor: cameraRef.current?.dragging ? 'grabbing' : 'crosshair',
              maxWidth: '100%',
              imageRendering: 'pixelated',
              boxShadow: `0 0 20px rgba(0,255,136,0.08)`,
            }}
          />
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

          {/* Agent detail */}
          {selAgent && (
            <div style={{ ...panelStyle, animation: 'ws-fadeIn 0.2s ease-out' }}>
              <div style={panelTitleStyle}>{selAgent.name} DETAIL</div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6, fontSize: 12, fontFamily: 'JetBrains Mono, monospace' }}>
                <BarRow label="ENERGY" value={selAgent.energy} color={C.green} />
                <BarRow label="HEALTH" value={selAgent.health} color={C.cyan} />
                <div style={{ color: C.dim }}>
                  POS: ({selAgent.x}, {selAgent.y}) &middot; FACING: {selAgent.direction}
                </div>
                <div style={{ color: C.dim }}>
                  CLASS: {agentSpritesRef.current[selAgent.agent_id]?.toUpperCase() || 'UNKNOWN'}
                </div>
                <div style={{ color: C.dim }}>
                  INVENTORY: {Object.entries(selAgent.inventory).map(([k, v]) => `${k}:${v}`).join(', ') || 'empty'}
                </div>
                <div style={{ marginTop: 4 }}>
                  <div style={{ color: C.amber, marginBottom: 4 }}>RECENT MESSAGES:</div>
                  {selAgent.messages.length === 0 && <div style={{ color: C.dim }}>(none)</div>}
                  {selAgent.messages.slice(-5).reverse().map((m, i) => (
                    <div key={i} style={{ color: C.text, fontSize: 11, padding: '2px 0', borderBottom: `1px solid ${C.panelLight}` }}>
                      <span style={{ color: C.dim }}>[t{m.tick}]</span> {m.text}
                    </div>
                  ))}
                </div>
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
