import { useState, useEffect, useCallback, useRef } from 'react';
import { useWebSocket } from './useWebSocket';
import { API_URL, WS_URL } from '../config';
import * as api from '../utils/api';

export function useTraining(onToast) {
  const [sessions, setSessions] = useState([]);
  const [activeSession, setActiveSession] = useState(null);
  const [metrics, setMetrics] = useState({
    episodes: [],
    rewards: [],
    losses: [],
    vocabSizes: [],
    compositionality: [],
    entropy: [],
  });
  const [conversations, setConversations] = useState([]);
  const [languageData, setLanguageData] = useState(null);
  const [isTraining, setIsTraining] = useState(false);
  const [error, setError] = useState(null);
  const activeSessionRef = useRef(null);
  const onToastRef = useRef(onToast);
  onToastRef.current = onToast;

  // Build per-session WebSocket URL
  const wsProtocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
  const wsBase = WS_URL || `${wsProtocol}//${window.location.host}`;
  const wsUrl = activeSession
    ? `${wsBase}/ws/${activeSession.session_id}`
    : null;

  const { isConnected: wsConnected, subscribe } = useWebSocket(wsUrl);

  // HTTP health check fallback — when no WS session active
  const [httpHealthy, setHttpHealthy] = useState(false);
  useEffect(() => {
    if (wsConnected) return; // WS is authoritative
    let alive = true;
    const check = async () => {
      try {
        const r = await fetch(`${API_URL.replace('/api','')}/health`, { signal: AbortSignal.timeout(5000) });
        if (alive) setHttpHealthy(r.ok);
      } catch { if (alive) setHttpHealthy(false); }
    };
    check();
    const iv = setInterval(check, 10000);
    return () => { alive = false; clearInterval(iv); };
  }, [wsConnected]);

  const isConnected = wsConnected || httpHealthy;

  // Subscribe to WebSocket events
  useEffect(() => {
    if (!wsUrl) return;

    const unsubMetrics = subscribe('training_progress', (data) => {
      setMetrics(prev => ({
        episodes: [...prev.episodes.slice(-499), data.episode],
        rewards: [...prev.rewards.slice(-499), data.reward],
        losses: [...prev.losses.slice(-499), data.loss],
        vocabSizes: [...prev.vocabSizes.slice(-499), data.vocab_size],
        compositionality: [...prev.compositionality.slice(-499), data.compositionality],
        entropy: [...prev.entropy.slice(-499), data.entropy],
      }));
    });

    const unsubConv = subscribe('new_conversation', (data) => {
      const mapped = api.mapConversation(data);
      setConversations(prev => [mapped, ...prev].slice(0, 50));
    });

    const unsubStatus = subscribe('status_change', (data) => {
      const newStatus = data.status === 'training';
      setIsTraining(newStatus);
      if (onToastRef.current) {
        if (data.status === 'completed') {
          onToastRef.current.success('Training completed!');
        } else if (data.status === 'error') {
          onToastRef.current.error('Training encountered an error');
        }
      }
    });

    return () => {
      unsubMetrics();
      unsubConv();
      unsubStatus();
    };
  }, [wsUrl, subscribe]);

  const loadSessions = useCallback(async () => {
    try {
      const data = await api.fetchSessions();
      setSessions(data);
      setError(null);
      // Auto-select the most recently created session
      if (data.length > 0 && !activeSessionRef.current) {
        const latest = data[data.length - 1];
        // Inline selectSession logic to avoid circular dependency
        try {
          const session = await api.getSession(latest.session_id);
          setActiveSession(session);
          activeSessionRef.current = session;
          const m = await api.getMetrics(latest.session_id);
          setMetrics(m);
          const c = await api.getConversations(latest.session_id);
          setConversations(c);
          try {
            const lang = await api.getLanguageAnalysis(latest.session_id);
            setLanguageData(lang);
          } catch (_) {
            setLanguageData(null);
          }
          setIsTraining(session.status === 'training');
        } catch (_) {
          // Ignore auto-select errors
        }
      }
    } catch (e) {
      setError(e.message);
      setSessions(generateDemoSessions());
    }
  }, []);

  const selectSession = useCallback(async (sessionId) => {
    try {
      const session = await api.getSession(sessionId);
      setActiveSession(session);
      activeSessionRef.current = session;
      const m = await api.getMetrics(sessionId);
      setMetrics(m);
      const c = await api.getConversations(sessionId);
      setConversations(c);
      try {
        const lang = await api.getLanguageAnalysis(sessionId);
        setLanguageData(lang);
      } catch (_) {
        setLanguageData(null);
      }
      setIsTraining(session.status === 'training');
      setError(null);
    } catch (e) {
      setError(e.message);
      const demoSession = { session_id: sessionId, name: 'Demo Session', status: 'training' };
      setActiveSession(demoSession);
      activeSessionRef.current = demoSession;
      setMetrics(generateDemoMetrics());
      setConversations(generateDemoConversations());
      setIsTraining(true);
      setLanguageData(null);
    }
  }, []);

  const startSession = useCallback(async (sessionId) => {
    try {
      await api.startTraining(sessionId);
      setIsTraining(true);
      if (onToastRef.current) onToastRef.current.success('Training started');
    } catch (e) {
      setError(e.message);
      setIsTraining(true);
      if (onToastRef.current) onToastRef.current.warning('Training started (demo mode)');
    }
  }, []);

  const stopSession = useCallback(async (sessionId) => {
    try {
      await api.stopTraining(sessionId);
      setIsTraining(false);
      if (onToastRef.current) onToastRef.current.info('Training stopped');
    } catch (e) {
      setError(e.message);
      setIsTraining(false);
      if (onToastRef.current) onToastRef.current.info('Training stopped (demo mode)');
    }
  }, []);

  const createNewSession = useCallback(async (config) => {
    try {
      const session = await api.createSession(config);
      setSessions(prev => [...prev, session]);
      if (onToastRef.current) onToastRef.current.success('Session created');
      return session;
    } catch (e) {
      setError(e.message);
      const demo = { session_id: Date.now().toString(), ...config, status: 'created' };
      setSessions(prev => [...prev, demo]);
      if (onToastRef.current) onToastRef.current.warning('Session created (demo mode)');
      return demo;
    }
  }, []);

  const resetSession = useCallback(async (sessionId) => {
    try {
      await api.resetSession(sessionId);
      setMetrics({ episodes: [], rewards: [], losses: [], vocabSizes: [], compositionality: [], entropy: [] });
      setConversations([]);
      setIsTraining(false);
      setLanguageData(null);
    } catch (e) {
      setError(e.message);
    }
  }, []);

  return {
    sessions,
    activeSession,
    metrics,
    conversations,
    languageData,
    isTraining,
    isConnected,
    error,
    loadSessions,
    selectSession,
    startSession,
    stopSession,
    createNewSession,
    resetSession,
  };
}

function generateDemoSessions() {
  return [
    { session_id: '1', name: 'Referential Game v1', game_type: 'referential', status: 'training', current_episode: 15420 },
    { session_id: '2', name: 'Negotiation Test', game_type: 'negotiation', status: 'completed', current_episode: 8750 },
    { session_id: '3', name: 'Emergent Grammar Run', game_type: 'referential', status: 'training', current_episode: 23100 },
  ];
}

function generateDemoMetrics() {
  const episodes = Array.from({ length: 100 }, (_, i) => i * 50);
  return {
    episodes,
    rewards: episodes.map((_, i) => 0.2 + 0.6 * (1 - Math.exp(-i / 30)) + (Math.random() - 0.5) * 0.1),
    losses: episodes.map((_, i) => 2.0 * Math.exp(-i / 25) + 0.3 + (Math.random() - 0.5) * 0.1),
    vocabSizes: episodes.map((_, i) => Math.min(20, Math.floor(2 + i * 0.18 + Math.random() * 2))),
    compositionality: episodes.map((_, i) => Math.min(0.95, 0.1 + 0.7 * (1 - Math.exp(-i / 40)) + (Math.random() - 0.5) * 0.05)),
    entropy: episodes.map((_, i) => 3.5 * Math.exp(-i / 35) + 0.8 + (Math.random() - 0.5) * 0.1),
  };
}

function generateDemoConversations() {
  const symbols = ['α', 'β', 'γ', 'δ', 'ε', 'ζ', 'η', 'θ', 'ι', 'κ'];
  const features = ['red', 'blue', 'green', 'large', 'small', 'circle', 'square', 'triangle'];

  return Array.from({ length: 10 }, (_, i) => {
    const targetIdx = Math.floor(Math.random() * features.length);
    const msgLen = 2 + Math.floor(Math.random() * 3);
    const message = Array.from({ length: msgLen }, () => symbols[Math.floor(Math.random() * symbols.length)]);
    const correct = Math.random() > 0.3;

    return {
      id: i,
      episode: 5000 - i * 10,
      target: {
        features: [features[targetIdx], features[(targetIdx + 3) % features.length]],
        label: `Object_${targetIdx}`,
      },
      message,
      speaker_prediction: features[Math.floor(Math.random() * features.length)],
      listener_choice: correct ? features[targetIdx] : features[Math.floor(Math.random() * features.length)],
      correct,
      reward: correct ? 1 : 0,
    };
  });
}
