import React, { useState, useEffect, useRef, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { API_URL } from '../config';
import {
  Mic, MicOff, Volume2, VolumeX, Play, Square,
  Settings, Radio, Zap, AlertCircle, RefreshCw,
  MessageSquare, ToggleLeft, ToggleRight, ChevronDown,
  Activity, AudioLines
} from 'lucide-react';

// ─── COLOR CONSTANTS ───────────────────────────────────────────
const C = {
  bg: '#0a0a1a',
  panel: '#0d0d22',
  border: '#00ff88',
  green: '#00ff88',
  amber: '#ffaa00',
  cyan: '#00ddff',
  red: '#ff4444',
  text: '#e0e0e0',
  muted: '#888',
  darkPanel: '#080818',
};

// ─── FONT STYLE ────────────────────────────────────────────────
const fontMono = { fontFamily: "'JetBrains Mono', monospace" };

// ─── VOICE SETTINGS HOOK ───────────────────────────────────────
export function useVoiceSettings() {
  const [settings, setSettings] = useState(() => ({
    voiceEnabled: localStorage.getItem('voiceEnabled') === 'true',
    voiceInputEnabled: localStorage.getItem('voiceInputEnabled') === 'true',
    selectedVoice: localStorage.getItem('selectedVoice') || '',
    voiceRate: parseFloat(localStorage.getItem('voiceRate') || '1'),
    voicePitch: parseFloat(localStorage.getItem('voicePitch') || '1'),
  }));

  useEffect(() => {
    const handler = () => {
      setSettings({
        voiceEnabled: localStorage.getItem('voiceEnabled') === 'true',
        voiceInputEnabled: localStorage.getItem('voiceInputEnabled') === 'true',
        selectedVoice: localStorage.getItem('selectedVoice') || '',
        voiceRate: parseFloat(localStorage.getItem('voiceRate') || '1'),
        voicePitch: parseFloat(localStorage.getItem('voicePitch') || '1'),
      });
    };
    window.addEventListener('storage', handler);
    return () => window.removeEventListener('storage', handler);
  }, []);

  return settings;
}

// ─── CRT OVERLAY ───────────────────────────────────────────────
function CRTOverlay() {
  return (
    <div style={{
      position: 'fixed', inset: 0, pointerEvents: 'none', zIndex: 9999,
      background: `repeating-linear-gradient(
        0deg, transparent, transparent 2px, rgba(0,0,0,0.15) 2px, rgba(0,0,0,0.15) 4px
      )`,
      mixBlendMode: 'multiply',
    }} />
  );
}

// ─── SPINNER ───────────────────────────────────────────────────
function Spinner({ size = 20, color = C.green }) {
  return (
    <motion.div
      animate={{ rotate: 360 }}
      transition={{ duration: 1, repeat: Infinity, ease: 'linear' }}
      style={{
        width: size, height: size,
        border: `2px solid ${color}33`,
        borderTop: `2px solid ${color}`,
        borderRadius: '50%',
        display: 'inline-block',
      }}
    />
  );
}

// ─── RETRO CARD ────────────────────────────────────────────────
function RetroCard({ children, style = {}, delay = 0 }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5, delay }}
      className="retro-card rounded-xl"
      style={{
        background: C.panel,
        border: `1px solid ${C.border}33`,
        padding: 24,
        boxShadow: `0 0 20px rgba(0,255,136,0.05), inset 0 1px 0 rgba(255,255,255,0.03)`,
        ...style,
      }}
    >
      {children}
    </motion.div>
  );
}

// ─── SECTION HEADER ────────────────────────────────────────────
function SectionHeader({ icon: Icon, title, subtitle, color = C.green }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 16 }}>
      <div style={{
        width: 36, height: 36,
        borderRadius: 8,
        background: `${color}15`,
        border: `1px solid ${color}33`,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
      }}>
        <Icon size={18} color={color} />
      </div>
      <div>
        <h3 className="section-header" style={{
          ...fontMono, fontSize: 13, fontWeight: 700,
          textTransform: 'uppercase', letterSpacing: '0.1em',
          color: color, margin: 0,
        }}>
          {title}
        </h3>
        {subtitle && (
          <p style={{ ...fontMono, fontSize: 11, color: C.muted, margin: '2px 0 0' }}>
            {subtitle}
          </p>
        )}
      </div>
    </div>
  );
}

// ─── SLIDER CONTROL ────────────────────────────────────────────
function SliderControl({ label, value, onChange, min = 0.5, max = 2, step = 0.1, color = C.green }) {
  return (
    <div style={{ marginBottom: 12 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6 }}>
        <span style={{ ...fontMono, fontSize: 11, color: C.muted, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
          {label}
        </span>
        <span style={{ ...fontMono, fontSize: 11, color: color, fontWeight: 600 }}>
          {value.toFixed(1)}x
        </span>
      </div>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange(parseFloat(e.target.value))}
        style={{
          width: '100%',
          height: 4,
          WebkitAppearance: 'none',
          appearance: 'none',
          background: `linear-gradient(to right, ${color} 0%, ${color} ${((value - min) / (max - min)) * 100}%, #333 ${((value - min) / (max - min)) * 100}%, #333 100%)`,
          borderRadius: 2,
          outline: 'none',
          cursor: 'pointer',
        }}
      />
    </div>
  );
}

// ─── TOGGLE SWITCH ─────────────────────────────────────────────
function ToggleSwitch({ enabled, onToggle, label, description, icon: Icon }) {
  return (
    <div
      onClick={onToggle}
      style={{
        display: 'flex', alignItems: 'center', gap: 12,
        padding: '10px 14px',
        background: enabled ? `${C.green}10` : 'rgba(255,255,255,0.02)',
        border: `1px solid ${enabled ? C.green + '44' : '#333'}`,
        borderRadius: 8,
        cursor: 'pointer',
        transition: 'all 0.2s',
      }}
    >
      <div style={{
        width: 32, height: 18,
        borderRadius: 9,
        background: enabled ? C.green : '#333',
        position: 'relative',
        transition: 'background 0.2s',
      }}>
        <motion.div
          animate={{ x: enabled ? 14 : 0 }}
          transition={{ type: 'spring', stiffness: 500, damping: 30 }}
          style={{
            width: 14, height: 14,
            borderRadius: '50%',
            background: '#fff',
            position: 'absolute',
            top: 2, left: 2,
          }}
        />
      </div>
      <div style={{ flex: 1 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          {Icon && <Icon size={14} color={enabled ? C.green : C.muted} />}
          <span style={{
            ...fontMono, fontSize: 12, fontWeight: 600,
            color: enabled ? C.green : C.muted,
            textTransform: 'uppercase', letterSpacing: '0.05em',
          }}>
            {label}
          </span>
        </div>
        {description && (
          <p style={{ ...fontMono, fontSize: 10, color: C.muted, margin: '2px 0 0' }}>
            {description}
          </p>
        )}
      </div>
    </div>
  );
}

// ─── PULSING RECORD DOT ────────────────────────────────────────
function PulsingDot({ active }) {
  if (!active) return null;
  return (
    <motion.div
      animate={{ opacity: [1, 0.3, 1], scale: [1, 1.2, 1] }}
      transition={{ duration: 1.5, repeat: Infinity }}
      style={{
        width: 10, height: 10,
        borderRadius: '50%',
        background: C.red,
        boxShadow: `0 0 8px ${C.red}, 0 0 16px ${C.red}88`,
        position: 'absolute',
        top: 6, right: 6,
      }}
    />
  );
}

// ─── VOICE ACTIVITY VISUALIZER ─────────────────────────────────
function VoiceActivityVisualizer({ isActive }) {
  const canvasRef = useRef(null);
  const animFrameRef = useRef(null);
  const barsRef = useRef(Array.from({ length: 32 }, () => 0));

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    const bars = barsRef.current;

    function draw() {
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      const barWidth = canvas.width / bars.length;
      
      for (let i = 0; i < bars.length; i++) {
        if (isActive) {
          bars[i] += (Math.random() * 0.6 - 0.15);
          bars[i] = Math.max(0.05, Math.min(1, bars[i]));
        } else {
          bars[i] *= 0.92;
          bars[i] = Math.max(0.02, bars[i]);
        }

        const barHeight = bars[i] * canvas.height * 0.9;
        const hue = isActive ? 140 + (i / bars.length) * 40 : 160;
        const alpha = isActive ? 0.5 + bars[i] * 0.5 : 0.2;
        
        ctx.fillStyle = `hsla(${hue}, 100%, 60%, ${alpha})`;
        ctx.fillRect(
          i * barWidth + 1,
          (canvas.height - barHeight) / 2,
          barWidth - 2,
          barHeight
        );
      }

      animFrameRef.current = requestAnimationFrame(draw);
    }

    draw();
    return () => {
      if (animFrameRef.current) cancelAnimationFrame(animFrameRef.current);
    };
  }, [isActive]);

  return (
    <canvas
      ref={canvasRef}
      width={400}
      height={60}
      style={{
        width: '100%',
        height: 60,
        borderRadius: 8,
        background: `${C.bg}`,
        border: `1px solid ${isActive ? C.green + '44' : '#222'}`,
      }}
    />
  );
}

// ─── STATUS INDICATOR ──────────────────────────────────────────
function StatusIndicator({ label, status, detail }) {
  const colors = {
    ready: C.green,
    active: C.green,
    inactive: C.muted,
    unavailable: C.red,
  };
  const color = colors[status] || C.muted;

  return (
    <div style={{
      display: 'flex', alignItems: 'center', gap: 8,
      flex: 1,
    }}>
      <motion.div
        animate={status === 'active' || status === 'ready' ? { opacity: [1, 0.5, 1] } : {}}
        transition={{ duration: 2, repeat: Infinity }}
        style={{
          width: 8, height: 8,
          borderRadius: '50%',
          background: color,
          boxShadow: `0 0 6px ${color}88`,
        }}
      />
      <div>
        <div style={{ ...fontMono, fontSize: 10, color: C.muted, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
          {label}
        </div>
        <div style={{ ...fontMono, fontSize: 11, color: color, fontWeight: 600 }}>
          {detail}
        </div>
      </div>
    </div>
  );
}

// ─── MAIN COMPONENT ───────────────────────────────────────────
export default function VoiceControls() {
  // ─── TTS State ─────────────────────────────────────────────
  const [voices, setVoices] = useState([]);
  const [voicesLoaded, setVoicesLoaded] = useState(false);
  const [selectedVoice, setSelectedVoice] = useState('');
  const [voiceRate, setVoiceRate] = useState(1.0);
  const [voicePitch, setVoicePitch] = useState(1.0);
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [ttsError, setTtsError] = useState(null);

  // ─── STT State ─────────────────────────────────────────────
  const [isListening, setIsListening] = useState(false);
  const [transcript, setTranscript] = useState('');
  const [confidence, setConfidence] = useState(0);
  const [sttError, setSttError] = useState(null);
  const [sttSupported, setSttSupported] = useState(true);
  const recognitionRef = useRef(null);

  // ─── Integration State ─────────────────────────────────────
  const [voiceEnabled, setVoiceEnabled] = useState(
    localStorage.getItem('voiceEnabled') === 'true'
  );
  const [voiceInputEnabled, setVoiceInputEnabled] = useState(
    localStorage.getItem('voiceInputEnabled') === 'true'
  );

  // ─── General ───────────────────────────────────────────────
  const [loading, setLoading] = useState(true);

  // ─── Load Voices ───────────────────────────────────────────
  const loadVoices = useCallback(() => {
    try {
      if (!window.speechSynthesis) {
        setTtsError('Speech synthesis not supported in this browser');
        setVoicesLoaded(true);
        setLoading(false);
        return;
      }

      const voiceList = window.speechSynthesis.getVoices();
      if (voiceList.length > 0) {
        setVoices(voiceList);
        setVoicesLoaded(true);
        setLoading(false);

        // Restore saved voice
        const savedVoice = localStorage.getItem('selectedVoice');
        if (savedVoice && voiceList.find(v => v.name === savedVoice)) {
          setSelectedVoice(savedVoice);
        } else if (voiceList.length > 0) {
          setSelectedVoice(voiceList[0].name);
        }
      }
    } catch (err) {
      setTtsError('Failed to load voices: ' + err.message);
      setVoicesLoaded(true);
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadVoices();
    if (window.speechSynthesis) {
      window.speechSynthesis.onvoiceschanged = loadVoices;
    }
    return () => {
      if (window.speechSynthesis) {
        window.speechSynthesis.onvoiceschanged = null;
      }
    };
  }, [loadVoices]);

  // ─── Restore Settings ─────────────────────────────────────
  useEffect(() => {
    const savedRate = localStorage.getItem('voiceRate');
    const savedPitch = localStorage.getItem('voicePitch');
    if (savedRate) setVoiceRate(parseFloat(savedRate));
    if (savedPitch) setVoicePitch(parseFloat(savedPitch));
  }, []);

  // ─── Persist Settings ─────────────────────────────────────
  useEffect(() => {
    localStorage.setItem('voiceEnabled', String(voiceEnabled));
    window.dispatchEvent(new Event('storage'));
  }, [voiceEnabled]);

  useEffect(() => {
    localStorage.setItem('voiceInputEnabled', String(voiceInputEnabled));
    window.dispatchEvent(new Event('storage'));
  }, [voiceInputEnabled]);

  useEffect(() => {
    localStorage.setItem('selectedVoice', selectedVoice);
    window.dispatchEvent(new Event('storage'));
  }, [selectedVoice]);

  useEffect(() => {
    localStorage.setItem('voiceRate', String(voiceRate));
    window.dispatchEvent(new Event('storage'));
  }, [voiceRate]);

  useEffect(() => {
    localStorage.setItem('voicePitch', String(voicePitch));
    window.dispatchEvent(new Event('storage'));
  }, [voicePitch]);

  // ─── Init SpeechRecognition ───────────────────────────────
  useEffect(() => {
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SpeechRecognition) {
      setSttSupported(false);
      return;
    }

    const recognition = new SpeechRecognition();
    recognition.continuous = true;
    recognition.interimResults = true;
    recognition.lang = 'en-US';

    recognition.onresult = (event) => {
      let finalTranscript = '';
      let interimTranscript = '';
      let lastConfidence = 0;

      for (let i = event.resultIndex; i < event.results.length; i++) {
        const result = event.results[i];
        if (result.isFinal) {
          finalTranscript += result[0].transcript;
          lastConfidence = result[0].confidence;
        } else {
          interimTranscript += result[0].transcript;
          lastConfidence = result[0].confidence;
        }
      }

      setTranscript(finalTranscript || interimTranscript);
      setConfidence(lastConfidence);
    };

    recognition.onerror = (event) => {
      if (event.error !== 'aborted') {
        setSttError(`Speech recognition error: ${event.error}`);
      }
      setIsListening(false);
    };

    recognition.onend = () => {
      setIsListening(false);
    };

    recognitionRef.current = recognition;

    return () => {
      if (recognitionRef.current) {
        try { recognitionRef.current.abort(); } catch (e) {}
      }
    };
  }, []);

  // ─── TTS Actions ──────────────────────────────────────────
  const speakTest = useCallback(() => {
    if (!window.speechSynthesis) return;
    try {
      setTtsError(null);
      window.speechSynthesis.cancel();

      const utterance = new SpeechSynthesisUtterance(
        'Voice synthesis online. Agent communication system ready for deployment.'
      );

      const voice = voices.find(v => v.name === selectedVoice);
      if (voice) utterance.voice = voice;
      utterance.rate = voiceRate;
      utterance.pitch = voicePitch;

      utterance.onstart = () => setIsSpeaking(true);
      utterance.onend = () => setIsSpeaking(false);
      utterance.onerror = (e) => {
        setIsSpeaking(false);
        setTtsError('Speech error: ' + e.error);
      };

      window.speechSynthesis.speak(utterance);
    } catch (err) {
      setTtsError('Failed to speak: ' + err.message);
    }
  }, [voices, selectedVoice, voiceRate, voicePitch]);

  const stopSpeaking = useCallback(() => {
    if (window.speechSynthesis) {
      window.speechSynthesis.cancel();
      setIsSpeaking(false);
    }
  }, []);

  // ─── STT Actions ──────────────────────────────────────────
  const toggleListening = useCallback(() => {
    if (!recognitionRef.current) return;

    if (isListening) {
      recognitionRef.current.stop();
      setIsListening(false);
    } else {
      setSttError(null);
      setTranscript('');
      setConfidence(0);
      try {
        recognitionRef.current.start();
        setIsListening(true);
      } catch (err) {
        setSttError('Failed to start recognition: ' + err.message);
      }
    }
  }, [isListening]);

  // ─── Loading State ────────────────────────────────────────
  if (loading) {
    return (
      <div style={{
        minHeight: '100vh', background: C.bg,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        flexDirection: 'column', gap: 16,
      }}>
        <CRTOverlay />
        <Spinner size={40} />
        <p style={{ ...fontMono, color: C.muted, fontSize: 13 }}>Loading voice subsystems...</p>
      </div>
    );
  }

  // ─── RENDER ───────────────────────────────────────────────
  return (
    <div style={{ minHeight: '100vh', background: C.bg, padding: '24px 32px' }}>
      <CRTOverlay />

      {/* ── Header ─────────────────────────────────────────── */}
      <motion.div
        initial={{ opacity: 0, y: -20 }}
        animate={{ opacity: 1, y: 0 }}
        style={{ marginBottom: 28 }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <div style={{
            width: 40, height: 40, borderRadius: 10,
            background: `linear-gradient(135deg, ${C.green}22, ${C.cyan}22)`,
            border: `1px solid ${C.green}44`,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}>
            <AudioLines size={22} color={C.green} />
          </div>
          <div>
            <h1 className="section-header" style={{
              ...fontMono, fontSize: 20, fontWeight: 800,
              textTransform: 'uppercase', letterSpacing: '0.12em',
              color: C.green, margin: 0,
            }}>
              Voice Controls <span className="cursor-blink" />
            </h1>
            <p style={{ ...fontMono, fontSize: 12, color: C.muted, margin: '2px 0 0' }}>
              Web Speech API &bull; TTS / STT &bull; Agent Voice Integration
            </p>
          </div>
        </div>
      </motion.div>

      {/* ── Two-Column Layout ──────────────────────────────── */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: '1fr 1fr',
        gap: 24,
        maxWidth: 1400,
      }}>
        {/* ─── LEFT: TTS ──────────────────────────────────── */}
        <RetroCard delay={0.1}>
          <SectionHeader
            icon={Volume2}
            title="Text-to-Speech"
            subtitle="Configure voice synthesis output"
            color={C.green}
          />

          {ttsError && (
            <motion.div
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: 'auto' }}
              style={{
                display: 'flex', alignItems: 'center', gap: 10,
                padding: '10px 14px', marginBottom: 16,
                background: `${C.red}15`, border: `1px solid ${C.red}33`,
                borderRadius: 8,
              }}
            >
              <AlertCircle size={16} color={C.red} />
              <span style={{ ...fontMono, fontSize: 11, color: C.red, flex: 1 }}>{ttsError}</span>
              <button
                onClick={() => { setTtsError(null); loadVoices(); }}
                style={{
                  background: 'none', border: `1px solid ${C.red}44`,
                  borderRadius: 4, padding: '4px 8px', cursor: 'pointer',
                  display: 'flex', alignItems: 'center', gap: 4,
                }}
              >
                <RefreshCw size={12} color={C.red} />
                <span style={{ ...fontMono, fontSize: 10, color: C.red }}>Retry</span>
              </button>
            </motion.div>
          )}

          {/* Voice Selector */}
          <div style={{ marginBottom: 16 }}>
            <label style={{
              ...fontMono, fontSize: 11, color: C.muted,
              textTransform: 'uppercase', letterSpacing: '0.05em',
              display: 'block', marginBottom: 6,
            }}>
              Voice ({voices.length} available)
            </label>
            <div style={{ position: 'relative' }}>
              <select
                value={selectedVoice}
                onChange={(e) => setSelectedVoice(e.target.value)}
                style={{
                  width: '100%', padding: '10px 14px',
                  background: C.darkPanel,
                  border: `1px solid ${C.green}33`,
                  borderRadius: 8,
                  color: C.text,
                  ...fontMono,
                  fontSize: 12,
                  appearance: 'none',
                  cursor: 'pointer',
                  outline: 'none',
                }}
              >
                {voices.length === 0 && <option value="">No voices available</option>}
                {voices.map((voice) => (
                  <option key={voice.name} value={voice.name}>
                    {voice.name} ({voice.lang})
                  </option>
                ))}
              </select>
              <ChevronDown
                size={16}
                color={C.muted}
                style={{ position: 'absolute', right: 12, top: '50%', transform: 'translateY(-50%)', pointerEvents: 'none' }}
              />
            </div>
          </div>

          {/* Rate Slider */}
          <SliderControl
            label="Speech Rate"
            value={voiceRate}
            onChange={setVoiceRate}
            min={0.5}
            max={2}
            step={0.1}
            color={C.green}
          />

          {/* Pitch Slider */}
          <SliderControl
            label="Pitch"
            value={voicePitch}
            onChange={setVoicePitch}
            min={0.5}
            max={2}
            step={0.1}
            color={C.cyan}
          />

          {/* Test Button */}
          <div style={{ display: 'flex', gap: 10, marginTop: 16 }}>
            <motion.button
              whileHover={{ scale: 1.02 }}
              whileTap={{ scale: 0.98 }}
              onClick={isSpeaking ? stopSpeaking : speakTest}
              style={{
                flex: 1,
                display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
                padding: '12px 16px',
                background: isSpeaking
                  ? `linear-gradient(135deg, ${C.red}22, ${C.red}11)`
                  : `linear-gradient(135deg, ${C.green}22, ${C.green}11)`,
                border: `1px solid ${isSpeaking ? C.red : C.green}44`,
                borderRadius: 8,
                color: isSpeaking ? C.red : C.green,
                ...fontMono,
                fontSize: 12,
                fontWeight: 700,
                textTransform: 'uppercase',
                letterSpacing: '0.08em',
                cursor: 'pointer',
                transition: 'all 0.2s',
              }}
            >
              {isSpeaking ? (
                <>
                  <Square size={14} />
                  Stop Speaking
                </>
              ) : (
                <>
                  <Play size={14} />
                  Test Voice
                </>
              )}
            </motion.button>
          </div>

          {/* Voice Activity for TTS */}
          <div style={{ marginTop: 16 }}>
            <div style={{
              ...fontMono, fontSize: 10, color: C.muted,
              textTransform: 'uppercase', letterSpacing: '0.05em',
              marginBottom: 6,
            }}>
              Output Activity
            </div>
            <VoiceActivityVisualizer isActive={isSpeaking} />
          </div>
        </RetroCard>

        {/* ─── RIGHT: STT ─────────────────────────────────── */}
        <RetroCard delay={0.2}>
          <SectionHeader
            icon={Mic}
            title="Speech-to-Text"
            subtitle="Voice recognition input"
            color={C.cyan}
          />

          {!sttSupported ? (
            <div style={{
              display: 'flex', flexDirection: 'column', alignItems: 'center',
              justifyContent: 'center', padding: '40px 20px',
              background: `${C.amber}10`, border: `1px solid ${C.amber}22`,
              borderRadius: 8,
            }}>
              <AlertCircle size={32} color={C.amber} style={{ marginBottom: 12 }} />
              <p style={{ ...fontMono, fontSize: 13, color: C.amber, fontWeight: 600, textAlign: 'center' }}>
                Speech Recognition Unavailable
              </p>
              <p style={{ ...fontMono, fontSize: 11, color: C.muted, textAlign: 'center', marginTop: 6 }}>
                Your browser doesn&apos;t support the Web Speech API.
                <br />Try Chrome or Edge for full functionality.
              </p>
            </div>
          ) : (
            <>
              {sttError && (
                <motion.div
                  initial={{ opacity: 0, height: 0 }}
                  animate={{ opacity: 1, height: 'auto' }}
                  style={{
                    display: 'flex', alignItems: 'center', gap: 10,
                    padding: '10px 14px', marginBottom: 16,
                    background: `${C.amber}15`, border: `1px solid ${C.amber}33`,
                    borderRadius: 8,
                  }}
                >
                  <AlertCircle size={16} color={C.amber} />
                  <span style={{ ...fontMono, fontSize: 11, color: C.amber, flex: 1 }}>{sttError}</span>
                  <button
                    onClick={() => { setSttError(null); }}
                    style={{
                      background: 'none', border: `1px solid ${C.amber}44`,
                      borderRadius: 4, padding: '4px 8px', cursor: 'pointer',
                      display: 'flex', alignItems: 'center', gap: 4,
                    }}
                  >
                    <RefreshCw size={12} color={C.amber} />
                    <span style={{ ...fontMono, fontSize: 10, color: C.amber }}>Clear</span>
                  </button>
                </motion.div>
              )}

              {/* Record Button */}
              <div style={{ display: 'flex', justifyContent: 'center', marginBottom: 20 }}>
                <motion.button
                  whileHover={{ scale: 1.05 }}
                  whileTap={{ scale: 0.95 }}
                  onClick={toggleListening}
                  style={{
                    width: 80, height: 80,
                    borderRadius: '50%',
                    background: isListening
                      ? `radial-gradient(circle, ${C.red}33, ${C.red}11)`
                      : `radial-gradient(circle, ${C.cyan}22, ${C.cyan}08)`,
                    border: `2px solid ${isListening ? C.red : C.cyan}66`,
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    flexDirection: 'column', gap: 4,
                    cursor: 'pointer',
                    position: 'relative',
                    boxShadow: isListening
                      ? `0 0 30px ${C.red}33, 0 0 60px ${C.red}11`
                      : `0 0 15px ${C.cyan}11`,
                    transition: 'all 0.3s',
                  }}
                >
                  <PulsingDot active={isListening} />
                  {isListening ? (
                    <MicOff size={24} color={C.red} />
                  ) : (
                    <Mic size={24} color={C.cyan} />
                  )}
                  <span style={{
                    ...fontMono, fontSize: 9, fontWeight: 700,
                    textTransform: 'uppercase', letterSpacing: '0.1em',
                    color: isListening ? C.red : C.cyan,
                    position: 'absolute', bottom: 10,
                  }}>
                    {isListening ? 'Stop' : 'Start'}
                  </span>
                </motion.button>
              </div>

              {/* Live Transcript */}
              <div style={{ marginBottom: 16 }}>
                <div style={{
                  ...fontMono, fontSize: 10, color: C.muted,
                  textTransform: 'uppercase', letterSpacing: '0.05em',
                  marginBottom: 6, display: 'flex', alignItems: 'center', gap: 6,
                }}>
                  <Radio size={10} color={isListening ? C.green : C.muted} />
                  Live Transcript
                </div>
                <div style={{
                  minHeight: 100,
                  padding: 14,
                  background: C.darkPanel,
                  border: `1px solid ${isListening ? C.green + '33' : '#222'}`,
                  borderRadius: 8,
                  ...fontMono,
                  fontSize: 13,
                  color: transcript ? C.text : C.muted,
                  lineHeight: 1.6,
                  transition: 'border-color 0.3s',
                }}>
                  {transcript || (isListening ? 'Listening...' : 'Press start to begin voice input')}
                </div>
              </div>

              {/* Confidence Score */}
              <div style={{
                display: 'flex', alignItems: 'center', gap: 10,
                padding: '10px 14px',
                background: `${C.cyan}08`,
                border: `1px solid ${C.cyan}22`,
                borderRadius: 8,
              }}>
                <Zap size={14} color={C.cyan} />
                <span style={{
                  ...fontMono, fontSize: 11, color: C.muted,
                  textTransform: 'uppercase', letterSpacing: '0.05em',
                }}>
                  Confidence
                </span>
                <div style={{ flex: 1, height: 6, background: '#222', borderRadius: 3, overflow: 'hidden' }}>
                  <motion.div
                    animate={{ width: `${confidence * 100}%` }}
                    transition={{ duration: 0.3 }}
                    style={{
                      height: '100%',
                      background: `linear-gradient(90deg, ${C.cyan}, ${C.green})`,
                      borderRadius: 3,
                    }}
                  />
                </div>
                <span style={{ ...fontMono, fontSize: 12, color: C.cyan, fontWeight: 700, minWidth: 40, textAlign: 'right' }}>
                  {(confidence * 100).toFixed(0)}%
                </span>
              </div>

              {/* Voice Activity for STT */}
              <div style={{ marginTop: 16 }}>
                <div style={{
                  ...fontMono, fontSize: 10, color: C.muted,
                  textTransform: 'uppercase', letterSpacing: '0.05em',
                  marginBottom: 6,
                }}>
                  Input Activity
                </div>
                <VoiceActivityVisualizer isActive={isListening} />
              </div>
            </>
          )}
        </RetroCard>

        {/* ─── BOTTOM: Integration Settings ────────────────── */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.3 }}
          style={{ gridColumn: '1 / -1' }}
        >
          <RetroCard delay={0.3}>
            <SectionHeader
              icon={Settings}
              title="Agent Voice Integration"
              subtitle="Connect voice I/O with agent communication"
              color={C.amber}
            />

            <div style={{
              display: 'grid',
              gridTemplateColumns: '1fr 1fr',
              gap: 16,
            }}>
              <ToggleSwitch
                enabled={voiceEnabled}
                onToggle={() => setVoiceEnabled(!voiceEnabled)}
                label="Auto-Speak Agent Messages"
                description="New agent messages are automatically spoken via TTS"
                icon={Volume2}
              />

              <ToggleSwitch
                enabled={voiceInputEnabled}
                onToggle={() => setVoiceInputEnabled(!voiceInputEnabled)}
                label="Voice Input to Agents"
                description="Speech recognition results are sent as messages to agents"
                icon={MessageSquare}
              />
            </div>

            {/* Status Indicators */}
            <div style={{
              display: 'flex', gap: 16, marginTop: 20,
              padding: '12px 16px',
              background: C.darkPanel,
              border: `1px solid #222`,
              borderRadius: 8,
            }}>
              <StatusIndicator
                label="TTS Engine"
                status={voices.length > 0 ? 'ready' : 'unavailable'}
                detail={`${voices.length} voices`}
              />
              <StatusIndicator
                label="STT Engine"
                status={sttSupported ? 'ready' : 'unavailable'}
                detail={sttSupported ? 'Web Speech API' : 'Not supported'}
              />
              <StatusIndicator
                label="Auto-Speak"
                status={voiceEnabled ? 'active' : 'inactive'}
                detail={voiceEnabled ? 'Enabled' : 'Disabled'}
              />
              <StatusIndicator
                label="Voice Input"
                status={voiceInputEnabled ? 'active' : 'inactive'}
                detail={voiceInputEnabled ? 'Enabled' : 'Disabled'}
              />
            </div>
          </RetroCard>
        </motion.div>
      </div>
    </div>
  );
}
