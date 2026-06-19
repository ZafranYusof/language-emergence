"""Social dynamics between agents: trust networks, alliances, rivalries.

Models the evolving relationships between agents in a language-emergence
session.  Each pair of agents has a relationship that can be classified
as neutral, alliance, or rivalry based on interaction history, trust
scores, communication success rates, and emotional alignment.

Relationship history is tracked over time so the frontend can display
how partnerships form, dissolve, and shift.
"""

import os
import json
import time
import math
import logging
from typing import Dict, List, Any, Optional, Tuple
from collections import defaultdict
from dataclasses import dataclass, field

logger = logging.getLogger(__name__)

# ---------------------------------------------------------------------------
# Relationship classification thresholds
# ---------------------------------------------------------------------------

# Trust + success-rate thresholds for alliance / rivalry
_ALLIANCE_TRUST_THRESHOLD = 0.65
_ALLIANCE_SUCCESS_THRESHOLD = 0.55
_RIVALRY_TRUST_THRESHOLD = 0.35
_RIVALRY_SUCCESS_THRESHOLD = 0.35

_RELATIONSHIP_TYPES = ("neutral", "alliance", "rivalry", "mentor", "competitor")


@dataclass
class RelationshipEvent:
    """A single event in the relationship timeline."""
    episode: int
    timestamp: float
    event_type: str  # 'success', 'failure', 'trust_change', 'status_change', 'manual'
    details: Dict[str, Any] = field(default_factory=dict)


@dataclass
class Relationship:
    """Bilateral relationship between two agents.

    Stores trust, success rates, interaction counts, classification,
    and a timeline of events.
    """
    agent_a: str
    agent_b: str
    trust: float = 0.5          # 0-1, EMA-smoothed
    success_rate: float = 0.5   # bilateral communication success rate
    total_interactions: int = 0
    consecutive_successes: int = 0
    consecutive_failures: int = 0
    status: str = "neutral"     # one of _RELATIONSHIP_TYPES
    emotional_alignment: float = 0.5  # how similar are their moods
    history: List[RelationshipEvent] = field(default_factory=list)

    # ----- update -----------------------------------------------------------

    def record_interaction(self, success: bool, episode: int) -> None:
        """Update relationship after a bilateral interaction."""
        self.total_interactions += 1

        # EMA trust update
        alpha = 0.12
        target = 1.0 if success else 0.0
        self.trust = round(self.trust + alpha * (target - self.trust), 4)

        # EMA success rate
        rate_alpha = 0.1
        self.success_rate = round(
            self.success_rate + rate_alpha * (float(success) - self.success_rate), 4
        )

        # Streaks
        if success:
            self.consecutive_successes += 1
            self.consecutive_failures = 0
        else:
            self.consecutive_failures += 1
            self.consecutive_successes = 0

        # Timeline event
        event = RelationshipEvent(
            episode=episode,
            timestamp=time.time(),
            event_type="success" if success else "failure",
            details={
                "trust": self.trust,
                "success_rate": self.success_rate,
                "streak": self.consecutive_successes if success else -self.consecutive_failures,
            },
        )
        self.history.append(event)
        self._cap_history()

        # Re-classify
        old_status = self.status
        self.status = self._classify()
        if self.status != old_status:
            self.history.append(RelationshipEvent(
                episode=episode,
                timestamp=time.time(),
                event_type="status_change",
                details={"from": old_status, "to": self.status},
            ))

    def update_emotional_alignment(self, mood_a: str, mood_b: str, episode: int) -> None:
        """Update emotional alignment based on current moods."""
        # Simple: same mood = high alignment, complementary = medium, opposite = low
        complementary = {
            ("excited", "confident"), ("confident", "excited"),
            ("focused", "curious"), ("curious", "focused"),
        }
        opposite = {
            ("excited", "frustrated"), ("frustrated", "excited"),
            ("confident", "frustrated"), ("frustrated", "confident"),
        }
        pair = (mood_a, mood_b)

        if mood_a == mood_b:
            target = 0.9
        elif pair in complementary:
            target = 0.7
        elif pair in opposite:
            target = 0.2
        else:
            target = 0.5

        align_alpha = 0.15
        self.emotional_alignment = round(
            self.emotional_alignment + align_alpha * (target - self.emotional_alignment), 4
        )

        self.history.append(RelationshipEvent(
            episode=episode,
            timestamp=time.time(),
            event_type="mood_sync",
            details={"mood_a": mood_a, "mood_b": mood_b, "alignment": self.emotional_alignment},
        ))
        self._cap_history()

    def add_manual_event(self, event_type: str, details: Dict[str, Any], episode: int = 0) -> None:
        """Inject a manual event (e.g. researcher-initiated alliance/rivalry)."""
        self.history.append(RelationshipEvent(
            episode=episode,
            timestamp=time.time(),
            event_type=event_type,
            details=details,
        ))
        self._cap_history()

    # ----- classification ---------------------------------------------------

    def _classify(self) -> str:
        """Classify relationship based on current stats."""
        if (self.trust >= _ALLIANCE_TRUST_THRESHOLD and
                self.success_rate >= _ALLIANCE_SUCCESS_THRESHOLD):
            # Mentor: one agent consistently leads (high streak of successes)
            if self.consecutive_successes >= 8:
                return "mentor"
            return "alliance"

        if (self.trust <= _RIVALRY_TRUST_THRESHOLD and
                self.success_rate <= _RIVALRY_SUCCESS_THRESHOLD):
            return "rivalry"

        # Competitor: moderate trust but frequent failures
        if (self.trust < 0.5 and self.consecutive_failures >= 5):
            return "competitor"

        return "neutral"

    def _cap_history(self, max_events: int = 500) -> None:
        if len(self.history) > max_events:
            self.history = self.history[-max_events:]

    # ----- queries ----------------------------------------------------------

    def get_strength(self) -> float:
        """How strong is this relationship? 0 = weak/neutral, 1 = strong.

        Combines trust deviation from neutral and total interaction count.
        """
        trust_deviation = abs(self.trust - 0.5) * 2  # 0-1
        interaction_factor = min(1.0, self.total_interactions / 100)
        return round(0.6 * trust_deviation + 0.4 * interaction_factor, 4)

    def as_dict(self, include_history: bool = False, history_limit: int = 50) -> Dict[str, Any]:
        result = {
            "agent_a": self.agent_a,
            "agent_b": self.agent_b,
            "trust": self.trust,
            "success_rate": self.success_rate,
            "total_interactions": self.total_interactions,
            "consecutive_successes": self.consecutive_successes,
            "consecutive_failures": self.consecutive_failures,
            "status": self.status,
            "emotional_alignment": self.emotional_alignment,
            "strength": self.get_strength(),
        }
        if include_history:
            result["history"] = [
                {
                    "episode": e.episode,
                    "timestamp": e.timestamp,
                    "event_type": e.event_type,
                    "details": e.details,
                }
                for e in self.history[-history_limit:]
            ]
        return result


class SocialDynamics:
    """Manages the social dynamics graph for a session.

    Tracks all pairwise relationships between agents and provides
    network-level analytics (alliances, rivalries, influence, clusters).
    """

    def __init__(self, session_id: str):
        self.session_id = session_id
        # Key: frozenset({agent_a, agent_b}) -> Relationship
        self._relationships: Dict[frozenset, Relationship] = {}
        # Registered agent IDs
        self._agent_ids: List[str] = []

    # ----- registration -----------------------------------------------------

    def register_agent(self, agent_id: str) -> None:
        if agent_id not in self._agent_ids:
            self._agent_ids.append(agent_id)

    def _get_or_create(self, agent_a: str, agent_b: str) -> Relationship:
        key = frozenset({agent_a, agent_b})
        if key not in self._relationships:
            self._relationships[key] = Relationship(agent_a=agent_a, agent_b=agent_b)
            self.register_agent(agent_a)
            self.register_agent(agent_b)
        return self._relationships[key]

    def get_relationship(self, agent_a: str, agent_b: str) -> Optional[Relationship]:
        key = frozenset({agent_a, agent_b})
        return self._relationships.get(key)

    # ----- updates ----------------------------------------------------------

    def record_interaction(
        self,
        agent_a: str,
        agent_b: str,
        success: bool,
        episode: int,
    ) -> Relationship:
        rel = self._get_or_create(agent_a, agent_b)
        rel.record_interaction(success, episode)
        return rel

    def update_moods(
        self,
        agent_a: str,
        mood_a: str,
        agent_b: str,
        mood_b: str,
        episode: int,
    ) -> None:
        rel = self._get_or_create(agent_a, agent_b)
        rel.update_emotional_alignment(mood_a, mood_b, episode)

    def inject_event(
        self,
        agent_a: str,
        agent_b: str,
        event_type: str,
        details: Optional[Dict[str, Any]] = None,
        episode: int = 0,
    ) -> Relationship:
        rel = self._get_or_create(agent_a, agent_b)
        rel.add_manual_event(event_type, details or {}, episode)
        # If the event is a status override, apply it
        if event_type in ("force_alliance", "force_rivalry", "force_mentor", "force_competitor"):
            status_map = {
                "force_alliance": "alliance",
                "force_rivalry": "rivalry",
                "force_mentor": "mentor",
                "force_competitor": "competitor",
            }
            old = rel.status
            rel.status = status_map[event_type]
            rel.history.append(RelationshipEvent(
                episode=episode,
                timestamp=time.time(),
                event_type="manual_status_change",
                details={"from": old, "to": rel.status, "reason": event_type},
            ))
        return rel

    # ----- network analytics ------------------------------------------------

    def get_alliances(self) -> List[Dict[str, Any]]:
        """Return all current alliance-type relationships."""
        return [
            rel.as_dict()
            for rel in self._relationships.values()
            if rel.status in ("alliance", "mentor")
        ]

    def get_rivalries(self) -> List[Dict[str, Any]]:
        """Return all current rivalry-type relationships."""
        return [
            rel.as_dict()
            for rel in self._relationships.values()
            if rel.status in ("rivalry", "competitor")
        ]

    def get_influence_scores(self) -> Dict[str, float]:
        """Compute influence score for each agent.

        Influence = average trust received from all partners.
        Higher trust → more influential.
        """
        trust_sums: Dict[str, float] = defaultdict(float)
        trust_counts: Dict[str, int] = defaultdict(int)

        for rel in self._relationships.values():
            # agent_a's influence on agent_b = trust from b's perspective
            # (symmetric in this model)
            trust_sums[rel.agent_a] += rel.trust
            trust_counts[rel.agent_a] += 1
            trust_sums[rel.agent_b] += rel.trust
            trust_counts[rel.agent_b] += 1

        return {
            agent_id: round(trust_sums[agent_id] / trust_counts[agent_id], 4)
            for agent_id in self._agent_ids
            if trust_counts[agent_id] > 0
        }

    def get_clusters(self) -> List[List[str]]:
        """Detect alliance clusters using simple connected-component approach.

        Returns lists of agent IDs that are all allied with each other.
        """
        alliance_graph: Dict[str, set] = defaultdict(set)
        for rel in self._relationships.values():
            if rel.status in ("alliance", "mentor"):
                alliance_graph[rel.agent_a].add(rel.agent_b)
                alliance_graph[rel.agent_b].add(rel.agent_a)

        visited: set = set()
        clusters: List[List[str]] = []

        for agent in self._agent_ids:
            if agent in visited:
                continue
            # BFS
            cluster = []
            queue = [agent]
            while queue:
                current = queue.pop(0)
                if current in visited:
                    continue
                visited.add(current)
                cluster.append(current)
                for neighbor in alliance_graph.get(current, set()):
                    if neighbor not in visited:
                        queue.append(neighbor)
            if len(cluster) > 1:
                clusters.append(sorted(cluster))

        return clusters

    def get_network_summary(self) -> Dict[str, Any]:
        """Full network summary for the session."""
        relationships = {}
        for key, rel in self._relationships.items():
            pair_key = f"{rel.agent_a}↔{rel.agent_b}"
            relationships[pair_key] = rel.as_dict(include_history=True, history_limit=100)

        alliances = self.get_alliances()
        rivalries = self.get_rivalries()
        influence = self.get_influence_scores()
        clusters = self.get_clusters()

        # Overall network health: average trust
        all_trusts = [rel.trust for rel in self._relationships.values()]
        avg_trust = round(sum(all_trusts) / len(all_trusts), 4) if all_trusts else 0.5

        # Cohesion: proportion of alliances vs total
        total_rels = len(self._relationships)
        alliance_ratio = round(len(alliances) / total_rels, 4) if total_rels > 0 else 0.0

        return {
            "session_id": self.session_id,
            "agents": self._agent_ids,
            "relationships": relationships,
            "alliances": alliances,
            "rivalries": rivalries,
            "influence_scores": influence,
            "clusters": clusters,
            "network_health": {
                "avg_trust": avg_trust,
                "alliance_ratio": alliance_ratio,
                "total_relationships": total_rels,
                "total_interactions": sum(r.total_interactions for r in self._relationships.values()),
            },
        }

    # ----- persistence ------------------------------------------------------

    def save(self, path: Optional[str] = None) -> None:
        path = path or os.path.join(
            "data", "social_dynamics", f"{self.session_id}.json"
        )
        os.makedirs(os.path.dirname(path) or ".", exist_ok=True)
        data = {
            "session_id": self.session_id,
            "agent_ids": self._agent_ids,
            "relationships": {
                f"{rel.agent_a}↔{rel.agent_b}": rel.as_dict(include_history=True, history_limit=500)
                for rel in self._relationships.values()
            },
            "saved_at": time.time(),
        }
        with open(path, "w", encoding="utf-8") as f:
            json.dump(data, f, indent=2)

    def load(self, path: Optional[str] = None) -> bool:
        path = path or os.path.join(
            "data", "social_dynamics", f"{self.session_id}.json"
        )
        if not os.path.exists(path):
            return False
        try:
            with open(path, "r", encoding="utf-8") as f:
                data = json.load(f)

            self._agent_ids = data.get("agent_ids", [])

            for pair_key, rel_data in data.get("relationships", {}).items():
                parts = pair_key.split("↔")
                if len(parts) != 2:
                    continue
                agent_a, agent_b = parts[0], parts[1]
                rel = self._get_or_create(agent_a, agent_b)
                rel.trust = rel_data.get("trust", 0.5)
                rel.success_rate = rel_data.get("success_rate", 0.5)
                rel.total_interactions = rel_data.get("total_interactions", 0)
                rel.consecutive_successes = rel_data.get("consecutive_successes", 0)
                rel.consecutive_failures = rel_data.get("consecutive_failures", 0)
                rel.status = rel_data.get("status", "neutral")
                rel.emotional_alignment = rel_data.get("emotional_alignment", 0.5)
                # Reconstruct history
                rel.history = []
                for ev in rel_data.get("history", []):
                    rel.history.append(RelationshipEvent(
                        episode=ev.get("episode", 0),
                        timestamp=ev.get("timestamp", 0),
                        event_type=ev.get("event_type", ""),
                        details=ev.get("details", {}),
                    ))

            return True
        except Exception as e:
            logger.warning(f"Failed to load social dynamics for {self.session_id}: {e}")
            return False


# ---------------------------------------------------------------------------
# Convenience: per-session registry (keyed by session_id)
# ---------------------------------------------------------------------------

_session_social: Dict[str, SocialDynamics] = {}


def get_session_social_dynamics(session_id: str) -> SocialDynamics:
    """Get or create the SocialDynamics instance for a session."""
    if session_id not in _session_social:
        sd = SocialDynamics(session_id)
        sd.load()  # no-op if no saved file
        _session_social[session_id] = sd
    return _session_social[session_id]


def get_or_create_session_specialization(session_id: str) -> "SessionSpecialization":
    """Import and return SessionSpecialization for a session."""
    from agents.specialization import SessionSpecialization
    return SessionSpecialization(session_id)
