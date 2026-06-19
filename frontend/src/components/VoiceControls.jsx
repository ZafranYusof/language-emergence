import React, { useState, useEffect, useRef, useCallback } from 'react';
import { Volume2, VolumeX } from 'lucide-react';

export default function VoiceControls({ autoSpeak, onAutoSpeakChange }) {
  const [speaking, setSpeaking] = useState(false);
  const [supported, setSupported] = useState(true);

  useEffect(() => {
    if (!('speechSynthesis' in window)) {
      setSupported(false);
    }
  }, []);

  const stop = useCallback(() => {
    window.speechSynthesis.cancel();
    setSpeaking(false);
  }, []);

  useEffect(() => {
    return () => {
      window.speechSynthesis.cancel();
    };
  }, []);

  if (!supported) return null;

  return (
    <div className="flex items-center gap-2">
      <button
        onClick={() => onAutoSpeakChange(!autoSpeak)}
        className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-mono transition-colors border ${
          autoSpeak
            ? 'bg-neon-green/10 border-neon-green/30 text-neon-green'
            : 'bg-retro-bg border-steel-border text-retro-muted hover:text-retro-text'
        }`}
        title={autoSpeak ? 'Disable auto-speak' : 'Enable auto-speak'}
      >
        {autoSpeak ? <Volume2 size={14} /> : <VolumeX size={14} />}
        <span>{autoSpeak ? 'Auto-Speak ON' : 'Auto-Speak OFF'}</span>
      </button>
      {speaking && (
        <button
          onClick={stop}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-mono bg-retro-error/10 border border-retro-error/30 text-retro-error hover:bg-retro-error/20 transition-colors"
        >
          <VolumeX size={14} />
          <span>Stop</span>
        </button>
      )}
    </div>
  );
}
