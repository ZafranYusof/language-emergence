/**
 * PixelCanvasHeader — drop-in canvas header showing pixel art agents
 * Add to any page for instant pixel art visual enhancement.
 * 
 * Usage: <PixelCanvasHeader agents={[{name:'NOVA',color:'#00ddff',sprite:'mage'}]} />
 */
import React, { useRef, useEffect, useState } from 'react';
import { ensureSprites, drawSprite, drawSpeechBubble, ParticleSystem, C as COL, hashCoord, SPRITE_NAMES } from '../utils/pixelEngine';

export default function PixelCanvasHeader({ 
  agents = [], 
  height = 180, 
  messages = [], 
  showTerrain = true,
  label = '',
}) {
  const canvasRef = useRef(null);
  const frameRef = useRef(0);
  const animRef = useRef(null);
  const particlesRef = useRef(new ParticleSystem());
  const spritesReadyRef = useRef(false);
  const [hoveredAgent, setHoveredAgent] = useState(null);

  useEffect(() => {
    ensureSprites().then(() => { spritesReadyRef.current = true; });
  }, []);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    const W = canvas.width;
    const H = canvas.height;

    const render = () => {
      frameRef.current++;
      const frame = frameRef.current;
      const now = Date.now();

      // Clear
      ctx.fillStyle = '#0a0a12';
      ctx.fillRect(0, 0, W, H);

      // Terrain floor
      if (showTerrain) {
        for (let x = 0; x < Math.ceil(W / 40); x++) {
          for (let y = 0; y < 3; y++) {
            const h = hashCoord(x, y + 100);
            ctx.fillStyle = h < 0.5 ? '#1a3318' : h < 0.7 ? '#252528' : '#2d2218';
            ctx.fillRect(x * 40, H - 120 + y * 40, 40, 40);
            if (h > 0.6 && y === 0) {
              ctx.fillStyle = '#2a5a28';
              ctx.fillRect(x * 40 + 10, H - 115, 3, 4);
            }
          }
        }
        // Grid lines
        ctx.strokeStyle = '#2a2a40';
        ctx.lineWidth = 0.3;
        ctx.globalAlpha = 0.3;
        for (let x = 0; x <= W; x += 40) {
          ctx.beginPath(); ctx.moveTo(x, H - 120); ctx.lineTo(x, H); ctx.stroke();
        }
        for (let y = H - 120; y <= H; y += 40) {
          ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(W, y); ctx.stroke();
        }
        ctx.globalAlpha = 1;
      }

      // Ambient particles
      if (frame % 30 === 0) {
        particlesRef.current.add({
          type: 'firefly', x: Math.random() * W, y: H - 130 + Math.random() * 20,
          vx: (Math.random() - 0.5) * 10, vy: -Math.random() * 5,
          color: '#aaff44', size: 1.5, life: 3, alpha: 0.6,
        });
      }
      if (frame % 60 === 0) {
        particlesRef.current.add({
          type: 'dust', x: Math.random() * W, y: Math.random() * H,
          vx: Math.random() * 3, vy: Math.random() * 2,
          color: '#887766', size: 1, life: 4, alpha: 0.3,
        });
      }
      particlesRef.current.update();
      particlesRef.current.draw(ctx);

      // Draw agents
      const spacing = W / (agents.length + 1);
      agents.forEach((agent, i) => {
        const ax = spacing * (i + 1);
        const ay = H - 40;
        const bobY = Math.sin(frame * 0.08 + i * 2) * 2;
        const spriteName = agent.sprite || SPRITE_NAMES[i % SPRITE_NAMES.length];
        const isHovered = hoveredAgent === i;

        // Glow
        if (isHovered) {
          ctx.save();
          ctx.shadowColor = agent.color || COL.green;
          ctx.shadowBlur = 15;
          ctx.beginPath();
          ctx.arc(ax, ay - 16, 20, 0, Math.PI * 2);
          ctx.fillStyle = 'rgba(0,0,0,0.01)';
          ctx.fill();
          ctx.restore();
        }

        drawSprite(ctx, spriteName, ax, ay, {
          scale: isHovered ? 2.0 : 1.6,
          bobY,
          color: agent.color,
          glow: isHovered ? agent.color : null,
        });

        // Name label
        ctx.fillStyle = agent.color || COL.green;
        ctx.font = '9px JetBrains Mono, monospace';
        ctx.textAlign = 'center';
        ctx.fillText(agent.name || `Agent ${i}`, ax, ay + 8);

        // Action/mood label
        if (agent.mood) {
          ctx.fillStyle = COL.dim;
          ctx.font = '7px JetBrains Mono, monospace';
          ctx.fillText(agent.mood, ax, ay + 18);
        }
      });

      // Draw speech bubbles from messages
      const recentMsgs = messages.slice(-3);
      recentMsgs.forEach((msg, i) => {
        const agentIdx = agents.findIndex(a => a.name === msg.agent);
        if (agentIdx < 0) return;
        const ax = spacing * (agentIdx + 1);
        const ay = H - 40;
        const age = (now - (msg.time || now)) / 1000;
        const alpha = Math.max(0, 1 - age / 8);
        if (alpha > 0) {
          drawSpeechBubble(ctx, ax, ay - 50, msg.text, {
            color: msg.color || agents[agentIdx]?.color || COL.green,
            alpha,
          });
        }
      });

      // Label
      if (label) {
        ctx.fillStyle = COL.dim;
        ctx.font = '8px JetBrains Mono, monospace';
        ctx.textAlign = 'left';
        ctx.fillText(label, 8, 14);
      }

      animRef.current = requestAnimationFrame(render);
    };

    animRef.current = requestAnimationFrame(render);
    return () => { if (animRef.current) cancelAnimationFrame(animRef.current); };
  }, [agents, messages, hoveredAgent, showTerrain, label]);

  // Mouse handling for hover
  const handleMouseMove = (e) => {
    const rect = canvasRef.current.getBoundingClientRect();
    const x = (e.clientX - rect.left) * (canvasRef.current.width / rect.width);
    const spacing = canvasRef.current.width / (agents.length + 1);
    let found = null;
    agents.forEach((_, i) => {
      const ax = spacing * (i + 1);
      if (Math.abs(x - ax) < 30) found = i;
    });
    setHoveredAgent(found);
  };

  return (
    <canvas
      ref={canvasRef}
      width={800}
      height={height}
      onMouseMove={handleMouseMove}
      onMouseLeave={() => setHoveredAgent(null)}
      style={{
        width: '100%',
        height: 'auto',
        borderRadius: 8,
        border: '1px solid #2d2d44',
        imageRendering: 'pixelated',
        cursor: hoveredAgent !== null ? 'pointer' : 'default',
      }}
    />
  );
}
