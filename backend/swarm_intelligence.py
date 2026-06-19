"""Multi-Session Swarm Intelligence – orchestrates parallel training sessions
with shared knowledge via a central HiveMind."""

from __future__ import annotations

import asyncio
import json
import logging
import math
import random
import time
import uuid
from dataclasses import dataclass, field
from enum import Enum
from typing import Any, Dict, List, Optional, Set

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/swarm", tags=["swarm-intelligence"])

# ── Constants ────────────────────────────────────────────────────────────────

SYNC_INTERVAL = 10  # ticks between HiveMind syncs
MIGRATION_THRESHOLD = 0.7  # min convergence before a pattern is "worth sharing"
AGENT_NAMES = ["NOVA", "PRISM", "ECHO", "FLUX", "NEXUS", "ARC", "ZENITH", "PULSE",
               "HELIX", "VORTEX", "CIPHER", "GLYPH"]
SYMBOL_POOL = list("\u03b1\u03b2\u03b3\u03b4\u03b5\u03b6\u03b7\u03b8\u03b9\u03ba\u03bb\u03bc\u03bd\u03be\u03bf\u03c0\u03c1\u03c3\u03c4\u03c5\u03c6\u03c7\u03c8\u03c9") + \
              [f"S{i}" for i in range(100)]


# ── Data Models ──────────────────────────────────────────────────────────────

class SessionStatus(str, Enum):
    SPAWNING = "spawning"
    RUNNING = "running"
    PAUSED = "paused"
    STOPPED = "stopped"


@dataclass
class KnowledgeEntry:
    """A piece of knowledge contributed by a session."""
    entry_id: str
    source_session: str
    symbol: str
    meaning: str
    confidence: float
    times_used: int = 0
    created_at: float = field(default_factory=time.time)


@dataclass
class AgentState:
    """State of a single agent within a swarm session."""
    name: str
    vocabulary_size: int = 0
    symbols_discovered: List[str] = field(default_factory=list)
    convergence_score: float = 0.0
    role: str = "generalist"  # vocabulary, grammar, pragmatics


@dataclass
class SwarmSession:
    """Wrapper around a training session with shared knowledge."""
    session_id: str
    label: str
    status: SessionStatus = SessionStatus.SPAWNING
    agents: List[AgentState] = field(default_factory=list)
    symbols_discovered: Set[str] = field(default_factory=set)
    convergence: float = 0.0
    total_ticks: int = 0
    knowledge_contributed: int = 0
    knowledge_received: int = 0
    specialization: str = "generalist"
    created_at: float = field(default_factory=time.time)

    def to_dict(self) -> dict:
        return {
            "session_id": self.session_id,
            "label": self.label,
            "status": self.status.value,
            "agents": [
                {
                    "name": a.name,
                    "vocabulary_size": a.vocabulary_size,
                    "symbols_discovered": a.symbols_discovered,
                    "convergence_score": round(a.convergence_score, 4),
                    "role": a.role,
                }
                for a in self.agents
            ],
            "symbols_discovered": sorted(self.symbols_discovered),
            "symbol_count": len(self.symbols_discovered),
            "convergence": round(self.convergence, 4),
            "total_ticks": self.total_ticks,
            "knowledge_contributed": self.knowledge_contributed,
            "knowledge_received": self.knowledge_received,
            "specialization": self.specialization,
            "created_at": self.created_at,
        }


@dataclass
class HiveMind:
    """Central knowledge store that sessions contribute to and learn from."""
    knowledge: Dict[str, KnowledgeEntry] = field(default_factory=dict)
    transfer_log: List[dict] = field(default_factory=list)
    total_transfers: int = 0

    def contribute(self, session_id: str, symbol: str, meaning: str, confidence: float) -> str:
        entry_id = str(uuid.uuid4())[:8]
        entry = KnowledgeEntry(
            entry_id=entry_id,
            source_session=session_id,
            symbol=symbol,
            meaning=meaning,
            confidence=confidence,
        )
        self.knowledge[symbol] = entry
        self.transfer_log.append({
            "type": "contribution",
            "from": session_id,
            "symbol": symbol,
            "meaning": meaning,
            "confidence": round(confidence, 3),
            "timestamp": time.time(),
        })
        if len(self.transfer_log) > 200:
            self.transfer_log = self.transfer_log[-150:]
        return entry_id

    def migrate(self, symbol: str, target_session_id: str) -> bool:
        entry = self.knowledge.get(symbol)
        if not entry:
            return False
        entry.times_used += 1
        self.transfer_log.append({
            "type": "migration",
            "from": entry.source_session,
            "to": target_session_id,
            "symbol": symbol,
            "meaning": entry.meaning,
            "timestamp": time.time(),
        })
        self.total_transfers += 1
        if len(self.transfer_log) > 200:
            self.transfer_log = self.transfer_log[-150:]
        return True

    def to_dict(self) -> dict:
        return {
            "total_entries": len(self.knowledge),
            "total_transfers": self.total_transfers,
            "knowledge": {
                sym: {
                    "entry_id": e.entry_id,
                    "source_session": e.source_session,
                    "symbol": e.symbol,
                    "meaning": e.meaning,
                    "confidence": round(e.confidence, 3),
                    "times_used": e.times_used,
                }
                for sym, e in sorted(self.knowledge.items(), key=lambda x: -x[1].confidence)[:100]
            },
            "transfer_log": self.transfer_log[-50:],
        }


@dataclass
class SwarmMetrics:
    """Aggregate stats across all sessions."""
    total_symbols: int = 0
    unique_symbols: int = 0
    avg_convergence: float = 0.0
    diversity_index: float = 0.0
    knowledge_transfers: int = 0
    active_sessions: int = 0
    total_ticks: int = 0

    def to_dict(self) -> dict:
        return {
            "total_symbols": self.total_symbols,
            "unique_symbols": self.unique_symbols,
            "avg_convergence": round(self.avg_convergence, 4),
            "diversity_index": round(self.diversity_index, 4),
            "knowledge_transfers": self.knowledge_transfers,
            "active_sessions": self.active_sessions,
            "total_ticks": self.total_ticks,
        }


# ── Orchestrator ─────────────────────────────────────────────────────────────

class SwarmOrchestrator:
    """Manages multiple parallel training sessions with shared HiveMind."""

    def __init__(self):
        self.swarms: Dict[str, Dict[str, Any]] = {}
        self._name_idx = 0

    def _next_agents(self, count: int) -> List[AgentState]:
        agents = []
        for _ in range(count):
            name = AGENT_NAMES[self._name_idx % len(AGENT_NAMES)]
            self._name_idx += 1
            role = random.choice(["vocabulary", "grammar", "pragmatics", "generalist"])
            agents.append(AgentState(name=name, role=role))
        return agents

    def _simulate_tick(self, session: SwarmSession, hivemind: HiveMind):
        """Simulate one training tick for a session."""
        if session.status != SessionStatus.RUNNING:
            return
        session.total_ticks += 1
        for agent in session.agents:
            if random.random() < 0.15:
                new_sym = random.choice(SYMBOL_POOL)
                if new_sym not in session.symbols_discovered:
                    session.symbols_discovered.add(new_sym)
                    agent.symbols_discovered.append(new_sym)
                    agent.vocabulary_size += 1
                    confidence = random.uniform(0.5, 1.0)
                    if confidence >= MIGRATION_THRESHOLD:
                        meaning = f"meaning_{random.randint(1, 50)}"
                        hivemind.contribute(session.session_id, new_sym, meaning, confidence)
                        session.knowledge_contributed += 1
            agent.convergence_score = min(1.0, agent.convergence_score + random.uniform(0, 0.02))
        if session.agents:
            session.convergence = sum(a.convergence_score for a in session.agents) / len(session.agents)

    def _maybe_migrate(self, session: SwarmSession, hivemind: HiveMind, all_sessions: List[SwarmSession]):
        """Maybe receive knowledge from HiveMind."""
        if session.status != SessionStatus.RUNNING:
            return
        if random.random() < 0.1:
            available = [e for s, e in hivemind.knowledge.items()
                         if e.source_session != session.session_id and s not in session.symbols_discovered]
            if available:
                entry = random.choice(available)
                session.symbols_discovered.add(entry.symbol)
                session.knowledge_received += 1
                hivemind.migrate(entry.symbol, session.session_id)

    def create_swarm(self, num_sessions: int = 3, agents_per_session: int = 2) -> str:
        swarm_id = str(uuid.uuid4())[:8]
        sessions = {}
        for i in range(num_sessions):
            sid = str(uuid.uuid4())[:8]
            label = f"Session-{i+1}"
            sess = SwarmSession(
                session_id=sid,
                label=label,
                agents=self._next_agents(agents_per_session),
            )
            sessions[sid] = sess
        self.swarms[swarm_id] = {
            "sessions": sessions,
            "hivemind": HiveMind(),
            "metrics": SwarmMetrics(),
            "running": False,
            "total_ticks": 0,
            "created_at": time.time(),
        }
        logger.info(f"Swarm {swarm_id} created with {num_sessions} sessions")
        return swarm_id

    def get_swarm(self, swarm_id: str) -> Optional[dict]:
        return self.swarms.get(swarm_id)

    def tick(self, swarm_id: str) -> dict:
        swarm = self.swarms.get(swarm_id)
        if not swarm:
            raise ValueError(f"Swarm {swarm_id} not found")
        sessions: Dict[str, SwarmSession] = swarm["sessions"]
        hivemind: HiveMind = swarm["hivemind"]
        session_list = list(sessions.values())
        for sess in session_list:
            self._simulate_tick(sess, hivemind)
            self._maybe_migrate(sess, hivemind, session_list)
        swarm["total_ticks"] += 1
        if swarm["total_ticks"] % SYNC_INTERVAL == 0:
            self._sync_all(sessions, hivemind)
        self._update_metrics(swarm)
        return swarm["metrics"].to_dict()

    def _sync_all(self, sessions: Dict[str, SwarmSession], hivemind: HiveMind):
        """Sync all sessions with HiveMind – propagate best knowledge."""
        for sess in sessions.values():
            if sess.status == SessionStatus.RUNNING:
                for symbol, entry in hivemind.knowledge.items():
                    if entry.source_session != sess.session_id and symbol not in sess.symbols_discovered:
                        if random.random() < 0.3:
                            sess.symbols_discovered.add(symbol)
                            sess.knowledge_received += 1

    def _update_metrics(self, swarm: dict):
        sessions = list(swarm["sessions"].values())
        hivemind: HiveMind = swarm["hivemind"]
        metrics: SwarmMetrics = swarm["metrics"]
        all_symbols = set()
        for s in sessions:
            all_symbols |= s.symbols_discovered
        metrics.total_symbols = sum(len(s.symbols_discovered) for s in sessions)
        metrics.unique_symbols = len(all_symbols)
        metrics.avg_convergence = (sum(s.convergence for s in sessions) / len(sessions)) if sessions else 0.0
        metrics.knowledge_transfers = hivemind.total_transfers
        metrics.active_sessions = sum(1 for s in sessions if s.status == SessionStatus.RUNNING)
        metrics.total_ticks = swarm["total_ticks"]
        metrics.diversity_index = (metrics.unique_symbols / metrics.total_symbols) if metrics.total_symbols > 0 else 0.0
        for sess in sessions:
            if sess.knowledge_contributed > sess.knowledge_received:
                sess.specialization = "contributor"
            elif sess.knowledge_received > sess.knowledge_contributed:
                sess.specialization = "learner"
            else:
                sess.specialization = "balanced"

    def start_swarm(self, swarm_id: str):
        swarm = self.swarms.get(swarm_id)
        if not swarm:
            raise ValueError(f"Swarm {swarm_id} not found")
        swarm["running"] = True
        for sess in swarm["sessions"].values():
            if sess.status in (SessionStatus.SPAWNING, SessionStatus.PAUSED):
                sess.status = SessionStatus.RUNNING

    def stop_swarm(self, swarm_id: str):
        swarm = self.swarms.get(swarm_id)
        if not swarm:
            raise ValueError(f"Swarm {swarm_id} not found")
        swarm["running"] = False
        for sess in swarm["sessions"].values():
            if sess.status == SessionStatus.RUNNING:
                sess.status = SessionStatus.PAUSED

    def spawn_session(self, swarm_id: str, agents: int = 2) -> str:
        swarm = self.swarms.get(swarm_id)
        if not swarm:
            raise ValueError(f"Swarm {swarm_id} not found")
        sid = str(uuid.uuid4())[:8]
        label = f"Session-{len(swarm['sessions']) + 1}"
        sess = SwarmSession(
            session_id=sid,
            label=label,
            agents=self._next_agents(agents),
            status=SessionStatus.RUNNING if swarm["running"] else SessionStatus.SPAWNING,
        )
        swarm["sessions"][sid] = sess
        return sid

    def kill_session(self, swarm_id: str, session_id: str):
        swarm = self.swarms.get(swarm_id)
        if not swarm:
            raise ValueError(f"Swarm {swarm_id} not found")
        sess = swarm["sessions"].get(session_id)
        if not sess:
            raise ValueError(f"Session {session_id} not found")
        sess.status = SessionStatus.STOPPED

    def pause_session(self, swarm_id: str, session_id: str):
        swarm = self.swarms.get(swarm_id)
        if not swarm:
            raise ValueError(f"Swarm {swarm_id} not found")
        sess = swarm["sessions"].get(session_id)
        if not sess:
            raise ValueError(f"Session {session_id} not found")
        sess.status = SessionStatus.PAUSED

    def resume_session(self, swarm_id: str, session_id: str):
        swarm = self.swarms.get(swarm_id)
        if not swarm:
            raise ValueError(f"Swarm {swarm_id} not found")
        sess = swarm["sessions"].get(session_id)
        if not sess:
            raise ValueError(f"Session {session_id} not found")
        sess.status = SessionStatus.RUNNING

    def force_sync(self, swarm_id: str):
        swarm = self.swarms.get(swarm_id)
        if not swarm:
            raise ValueError(f"Swarm {swarm_id} not found")
        self._sync_all(swarm["sessions"], swarm["hivemind"])
        self._update_metrics(swarm)

    def migrate_symbol(self, swarm_id: str, symbol: str, from_session: str, to_session: str):
        swarm = self.swarms.get(swarm_id)
        if not swarm:
            raise ValueError(f"Swarm {swarm_id} not found")
        hivemind: HiveMind = swarm["hivemind"]
        target = swarm["sessions"].get(to_session)
        if not target:
            raise ValueError(f"Target session {to_session} not found")
        if symbol not in target.symbols_discovered:
            target.symbols_discovered.add(symbol)
            target.knowledge_received += 1
            hivemind.migrate(symbol, to_session)


# ── Global instance ──────────────────────────────────────────────────────────

orchestrator = SwarmOrchestrator()


# ── Pydantic request models ─────────────────────────────────────────────────

class CreateSwarmRequest(BaseModel):
    num_sessions: int = 3
    agents_per_session: int = 2

class MigrateRequest(BaseModel):
    swarm_id: str
    symbol: str
    from_session: str
    to_session: str

class SessionActionRequest(BaseModel):
    swarm_id: str
    session_id: str

class TickRequest(BaseModel):
    swarm_id: str
    count: int = 1


# ── API Endpoints ────────────────────────────────────────────────────────────

@router.post("/create")
async def create_swarm(req: CreateSwarmRequest):
    """Create a new swarm with N parallel sessions."""
    try:
        swarm_id = orchestrator.create_swarm(req.num_sessions, req.agents_per_session)
        swarm = orchestrator.get_swarm(swarm_id)
        return {
            "swarm_id": swarm_id,
            "sessions": [s.to_dict() for s in swarm["sessions"].values()],
            "metrics": swarm["metrics"].to_dict(),
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/status")
async def get_swarm_status(swarm_id: str):
    """Get full swarm status including all sessions and metrics."""
    swarm = orchestrator.get_swarm(swarm_id)
    if not swarm:
        raise HTTPException(status_code=404, detail=f"Swarm {swarm_id} not found")
    return {
        "swarm_id": swarm_id,
        "running": swarm["running"],
        "total_ticks": swarm["total_ticks"],
        "sessions": [s.to_dict() for s in swarm["sessions"].values()],
        "metrics": swarm["metrics"].to_dict(),
    }


@router.post("/tick")
async def advance_tick(req: TickRequest):
    """Advance all sessions in a swarm by N ticks."""
    try:
        for _ in range(min(req.count, 100)):
            orchestrator.tick(req.swarm_id)
        swarm = orchestrator.get_swarm(req.swarm_id)
        return {
            "ticks_advanced": min(req.count, 100),
            "total_ticks": swarm["total_ticks"],
            "metrics": swarm["metrics"].to_dict(),
            "sessions": [s.to_dict() for s in swarm["sessions"].values()],
        }
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e))


@router.get("/knowledge")
async def get_knowledge(swarm_id: str):
    """Get the HiveMind knowledge base for a swarm."""
    swarm = orchestrator.get_swarm(swarm_id)
    if not swarm:
        raise HTTPException(status_code=404, detail=f"Swarm {swarm_id} not found")
    return swarm["hivemind"].to_dict()


@router.post("/sync")
async def force_sync(swarm_id: str):
    """Force sync all sessions with the HiveMind."""
    try:
        orchestrator.force_sync(swarm_id)
        swarm = orchestrator.get_swarm(swarm_id)
        return {
            "status": "synced",
            "metrics": swarm["metrics"].to_dict(),
            "sessions": [s.to_dict() for s in swarm["sessions"].values()],
        }
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e))


@router.post("/migrate")
async def migrate_knowledge(req: MigrateRequest):
    """Manually migrate a symbol from one session to another."""
    try:
        orchestrator.migrate_symbol(req.swarm_id, req.symbol, req.from_session, req.to_session)
        return {"status": "migrated", "symbol": req.symbol}
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e))


@router.get("/metrics")
async def get_metrics(swarm_id: str):
    """Get aggregate swarm metrics."""
    swarm = orchestrator.get_swarm(swarm_id)
    if not swarm:
        raise HTTPException(status_code=404, detail=f"Swarm {swarm_id} not found")
    return swarm["metrics"].to_dict()


@router.post("/start")
async def start_swarm(swarm_id: str):
    """Start/resume the swarm simulation."""
    try:
        orchestrator.start_swarm(swarm_id)
        swarm = orchestrator.get_swarm(swarm_id)
        return {
            "status": "running",
            "sessions": [s.to_dict() for s in swarm["sessions"].values()],
        }
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e))


@router.post("/stop")
async def stop_swarm(swarm_id: str):
    """Stop/pause the swarm simulation."""
    try:
        orchestrator.stop_swarm(swarm_id)
        swarm = orchestrator.get_swarm(swarm_id)
        return {
            "status": "stopped",
            "sessions": [s.to_dict() for s in swarm["sessions"].values()],
        }
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e))


@router.post("/spawn")
async def spawn_session(req: SessionActionRequest):
    """Spawn a new session within an existing swarm."""
    try:
        sid = orchestrator.spawn_session(req.swarm_id)
        swarm = orchestrator.get_swarm(req.swarm_id)
        return {
            "session_id": sid,
            "sessions": [s.to_dict() for s in swarm["sessions"].values()],
        }
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e))


@router.post("/kill")
async def kill_session(req: SessionActionRequest):
    """Kill a session within the swarm."""
    try:
        orchestrator.kill_session(req.swarm_id, req.session_id)
        return {"status": "killed", "session_id": req.session_id}
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e))


@router.post("/pause")
async def pause_session(req: SessionActionRequest):
    """Pause a session within the swarm."""
    try:
        orchestrator.pause_session(req.swarm_id, req.session_id)
        return {"status": "paused", "session_id": req.session_id}
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e))


@router.post("/resume")
async def resume_session(req: SessionActionRequest):
    """Resume a paused session."""
    try:
        orchestrator.resume_session(req.swarm_id, req.session_id)
        return {"status": "resumed", "session_id": req.session_id}
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e))


@router.get("/list")
async def list_swarms():
    """List all active swarms."""
    result = []
    for sid, swarm in orchestrator.swarms.items():
        result.append({
            "swarm_id": sid,
            "running": swarm["running"],
            "total_ticks": swarm["total_ticks"],
            "session_count": len(swarm["sessions"]),
            "metrics": swarm["metrics"].to_dict(),
        })
    return result
