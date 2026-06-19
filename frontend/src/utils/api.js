import { API_URL } from '../config';

const API_BASE = API_URL;

export async function fetchSessions() {
  const res = await fetch(`${API_BASE}/sessions`);
  if (!res.ok) throw new Error('Failed to fetch sessions');
  const data = await res.json();
  return data.sessions || data;
}

export async function createSession(config) {
  const res = await fetch(`${API_BASE}/sessions`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(config),
  });
  if (!res.ok) throw new Error('Failed to create session');
  return res.json();
}

export async function getSession(sessionId) {
  const res = await fetch(`${API_BASE}/sessions/${sessionId}`);
  if (!res.ok) throw new Error('Failed to fetch session');
  return res.json();
}

export async function startTraining(sessionId) {
  const res = await fetch(`${API_BASE}/sessions/${sessionId}/train`, { method: 'POST' });
  if (!res.ok) throw new Error('Failed to start training');
  return res.json();
}

export async function stopTraining(sessionId) {
  const res = await fetch(`${API_BASE}/sessions/${sessionId}/stop`, { method: 'POST' });
  if (!res.ok) throw new Error('Failed to stop training');
  return res.json();
}

export async function resetSession(sessionId) {
  const res = await fetch(`${API_BASE}/sessions/${sessionId}/reset`, { method: 'POST' });
  if (!res.ok) throw new Error('Failed to reset session');
  return res.json();
}

export async function getMetrics(sessionId) {
  const res = await fetch(`${API_BASE}/sessions/${sessionId}/metrics`);
  if (!res.ok) throw new Error('Failed to fetch metrics');
  const data = await res.json();
  return {
    episodes: (data.metrics || []).map(m => m.episode),
    rewards: (data.metrics || []).map(m => m.reward),
    losses: (data.metrics || []).map(m => m.loss),
    vocabSizes: (data.metrics || []).map(m => m.vocab_size),
    compositionality: (data.metrics || []).map(m => m.compositionality),
    entropy: (data.metrics || []).map(m => m.entropy),
    summary: data.summary,
  };
}

export async function getConversations(sessionId, limit = 20) {
  const res = await fetch(`${API_BASE}/sessions/${sessionId}/conversations?limit=${limit}`);
  if (!res.ok) throw new Error('Failed to fetch conversations');
  const data = await res.json();
  return (data.data || data.conversations || []).map(mapConversation);
}

export async function getLanguageAnalysis(sessionId) {
  const res = await fetch(`${API_BASE}/sessions/${sessionId}/language`);
  if (!res.ok) throw new Error('Failed to fetch language analysis');
  return res.json();
}

// Map backend flat conversation to frontend expected shape
export function mapConversation(c) {
  return {
    episode: c.episode,
    target: {
      features: c.target_features || [],
      label: `Object_${c.target_index}`,
    },
    target_index: c.target_index,
    message: c.message,
    message_probs: c.message_probs,
    listener_choice: c.listener_choice,
    correct: c.reward >= 1,
    reward: c.reward,
    attention_weights: c.attention_weights || null,
    // Agent minds data
    thought_before: c.thought_before || null,
    thought_after: c.thought_after || null,
    speaker_emotion: c.speaker_emotion || null,
    listener_emotion: c.listener_emotion || null,
    speaker_judgment: c.speaker_judgment || null,
    listener_judgment: c.listener_judgment || null,
    personality_traits: c.personality_traits || null,
  };
}

export async function getVocabulary(sessionId) {
  const res = await fetch(`${API_BASE}/sessions/${sessionId}/vocabulary`);
  if (!res.ok) throw new Error('Failed to fetch vocabulary');
  return res.json();
}

export async function getReplayData(sessionId, episode) {
  const res = await fetch(`${API_BASE}/sessions/${sessionId}/replay/${episode}`);
  if (!res.ok) throw new Error('Failed to fetch replay data');
  return res.json();
}

export async function fetchMinds(sessionId) {
  const response = await fetch(`${API_BASE}/sessions/${sessionId}/agent-minds`);
  if (!response.ok) throw new Error('Failed to fetch minds');
  return response.json();
}

// ── Phylogenetic Tree API ────────────────────────────────────

export async function fetchPhyloTree(sessionId) {
  const res = await fetch(`${API_BASE}/phylo/tree/${sessionId}`);
  if (!res.ok) throw new Error('Failed to fetch phylogenetic tree');
  return res.json();
}

export async function fetchPhyloSnapshot(sessionId, timestamp) {
  const res = await fetch(`${API_BASE}/phylo/snapshot/${sessionId}/${timestamp}`);
  if (!res.ok) throw new Error('Failed to fetch snapshot');
  return res.json();
}

export async function capturePhyloSnapshot(sessionId, data) {
  const res = await fetch(`${API_BASE}/phylo/capture/${sessionId}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  });
  if (!res.ok) throw new Error('Failed to capture snapshot');
  return res.json();
}

export async function fetchPhyloMutations(sessionId) {
  const res = await fetch(`${API_BASE}/phylo/mutations/${sessionId}`);
  if (!res.ok) throw new Error('Failed to fetch mutations');
  return res.json();
}

export async function fetchPhyloDialects(sessionId) {
  const res = await fetch(`${API_BASE}/phylo/dialects/${sessionId}`);
  if (!res.ok) throw new Error('Failed to fetch dialects');
  return res.json();
}
