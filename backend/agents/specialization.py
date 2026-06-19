"""Agent specialization tracking for language emergence.

Tracks what each agent is good at (color descriptions, shape descriptions,
spatial relations, quantity, texture, etc.) and updates specialization
scores based on training success patterns.

Each agent accumulates a skill profile over training episodes. Skills are
identified by feature-dimension categories extracted from the target
features used in referential/negotiation games.
"""

import os
import json
import time
import logging
from typing import Dict, List, Any, Optional, Tuple
from collections import defaultdict
from dataclasses import dataclass, field

logger = logging.getLogger(__name__)

# ---------------------------------------------------------------------------
# Skill categories — maps feature-dimension index ranges to human labels.
# The ranges are configurable; defaults assume an 8-dim feature vector
# where dims 0-1 = color, 2-3 = shape, 4-5 = size/position, 6 = texture,
# 7 = quantity.
# ---------------------------------------------------------------------------

DEFAULT_SKILL_CATEGORIES: Dict[str, List[int]] = {
    "color":        [0, 1],
    "shape":        [2, 3],
    "spatial":      [4, 5],
    "texture":      [6],
    "quantity":     [7],
}


@dataclass
class SkillRecord:
    """Tracks performance for a single skill category."""
    successes: int = 0
    failures: int = 0
    recent_outcomes: List[bool] = field(default_factory=list)  # last N
    last_updated_episode: int = 0

    @property
    def total(self) -> int:
        return self.successes + self.failures

    @property
    def success_rate(self) -> float:
        if self.total == 0:
            return 0.5  # unknown
        return self.successes / self.total

    @property
    def recent_rate(self) -> float:
        """Success rate over the last 50 outcomes."""
        window = self.recent_outcomes[-50:]
        if not window:
            return 0.5
        return sum(window) / len(window)

    @property
    def trend(self) -> float:
        """Positive = improving, negative = declining."""
        window = self.recent_outcomes[-100:]
        if len(window) < 10:
            return 0.0
        half = len(window) // 2
        older = window[:half]
        recent = window[half:]
        older_rate = sum(older) / len(older) if older else 0.5
        recent_rate = sum(recent) / len(recent) if recent else 0.5
        return round(recent_rate - older_rate, 4)

    def record(self, success: bool, episode: int, max_recent: int = 200) -> None:
        if success:
            self.successes += 1
        else:
            self.failures += 1
        self.recent_outcomes.append(success)
        if len(self.recent_outcomes) > max_recent:
            self.recent_outcomes = self.recent_outcomes[-max_recent:]
        self.last_updated_episode = episode

    def as_dict(self) -> Dict[str, Any]:
        return {
            "successes": self.successes,
            "failures": self.failures,
            "total": self.total,
            "success_rate": round(self.success_rate, 4),
            "recent_rate": round(self.recent_rate, 4),
            "trend": self.trend,
            "last_updated_episode": self.last_updated_episode,
        }


class AgentSpecialization:
    """Tracks specialization / skill profile for one agent.

    Instantiate once per agent (speaker, listener, observer, etc.) and
    feed it target features + success/failure after each training episode.
    """

    def __init__(
        self,
        agent_id: str,
        skill_categories: Optional[Dict[str, List[int]]] = None,
        feature_dim: int = 8,
    ):
        self.agent_id = agent_id
        self.skill_categories = skill_categories or DEFAULT_SKILL_CATEGORIES
        self.feature_dim = feature_dim

        # skill_name -> SkillRecord
        self.skills: Dict[str, SkillRecord] = {
            name: SkillRecord() for name in self.skill_categories
        }
        # "general" catches any dims not mapped to a category
        self.skills["general"] = SkillRecord()

        # Episode history for timeline view
        self._episode_history: List[Dict[str, Any]] = []

    # ----- core update -----------------------------------------------------

    def update(
        self,
        target_features: List[float],
        success: bool,
        episode: int,
    ) -> Dict[str, float]:
        """Update skill scores based on an episode outcome.

        Args:
            target_features: the feature vector of the target object.
            success: whether the communication was successful.
            episode: current training episode number.

        Returns:
            Dict of skill_name -> new success_rate (post-update).
        """
        active_skills = self._identify_active_skills(target_features)

        updated_rates: Dict[str, float] = {}
        for skill_name in active_skills:
            self.skills[skill_name].record(success, episode)
            updated_rates[skill_name] = round(self.skills[skill_name].success_rate, 4)

        # Always update general
        self.skills["general"].record(success, episode)
        updated_rates["general"] = round(self.skills["general"].success_rate, 4)

        # Periodically snapshot
        if episode % 25 == 0:
            self._episode_history.append({
                "episode": episode,
                "timestamp": time.time(),
                "rates": {name: round(sr.success_rate, 4) for name, sr in self.skills.items()},
            })
            # Cap history
            if len(self._episode_history) > 500:
                self._episode_history = self._episode_history[-500:]

        return updated_rates

    # ----- queries ----------------------------------------------------------

    def get_dominant_skill(self) -> str:
        """Return the skill with the highest recent success rate
        (only considering skills with at least 5 interactions)."""
        candidates = {
            name: sr.recent_rate
            for name, sr in self.skills.items()
            if sr.total >= 5
        }
        if not candidates:
            return "general"
        return max(candidates, key=candidates.get)  # type: ignore

    def get_weakest_skill(self) -> str:
        """Return the skill with the lowest recent success rate
        (only considering skills with at least 5 interactions)."""
        candidates = {
            name: sr.recent_rate
            for name, sr in self.skills.items()
            if sr.total >= 5
        }
        if not candidates:
            return "general"
        return min(candidates, key=candidates.get)  # type: ignore

    def get_skill_profile(self) -> Dict[str, Any]:
        """Return a summary of the agent's skill profile."""
        profile: Dict[str, Any] = {}
        for name, sr in self.skills.items():
            profile[name] = sr.as_dict()

        dominant = self.get_dominant_skill()
        weakest = self.get_weakest_skill()

        return {
            "agent_id": self.agent_id,
            "skills": profile,
            "dominant_skill": dominant,
            "weakest_skill": weakest,
            "total_episodes_tracked": sum(sr.total for sr in self.skills.values()),
            "history": self._episode_history[-100:],
        }

    def get_specialization_score(self) -> float:
        """How specialised is this agent?  0 = uniform across skills,
        1 = extremely specialised in one skill.

        Computed as 1 - (entropy / max_entropy) of the skill success rates.
        """
        rates = [sr.success_rate for sr in self.skills.values() if sr.total >= 3]
        if len(rates) < 2:
            return 0.0

        total = sum(rates)
        if total == 0:
            return 0.0

        probs = [r / total for r in rates]
        import math
        entropy = -sum(p * math.log(p + 1e-10) for p in probs if p > 0)
        max_entropy = math.log(len(probs))
        if max_entropy == 0:
            return 0.0

        return round(1.0 - (entropy / max_entropy), 4)

    # ----- internal ---------------------------------------------------------

    def _identify_active_skills(self, target_features: List[float]) -> List[str]:
        """Determine which skills are 'active' for a given target.

        A skill is active if at least one of its mapped feature dimensions
        has a non-trivial absolute value (> 0.1), indicating that dimension
        carries meaningful information for the current object.
        """
        active = []
        for skill_name, dim_indices in self.skill_categories.items():
            for idx in dim_indices:
                if idx < len(target_features) and abs(target_features[idx]) > 0.1:
                    active.append(skill_name)
                    break
        return active if active else ["general"]

    # ----- persistence ------------------------------------------------------

    def save(self, path: Optional[str] = None) -> None:
        path = path or os.path.join(
            "data", "specialization", f"{self.agent_id}.json"
        )
        os.makedirs(os.path.dirname(path) or ".", exist_ok=True)
        data = {
            "agent_id": self.agent_id,
            "skills": {name: sr.as_dict() for name, sr in self.skills.items()},
            "history": self._episode_history,
            "saved_at": time.time(),
        }
        with open(path, "w", encoding="utf-8") as f:
            json.dump(data, f, indent=2)

    def load(self, path: Optional[str] = None) -> bool:
        path = path or os.path.join(
            "data", "specialization", f"{self.agent_id}.json"
        )
        if not os.path.exists(path):
            return False
        try:
            with open(path, "r", encoding="utf-8") as f:
                data = json.load(f)
            for name, info in data.get("skills", {}).items():
                if name in self.skills:
                    self.skills[name].successes = info.get("successes", 0)
                    self.skills[name].failures = info.get("failures", 0)
                    self.skills[name].last_updated_episode = info.get("last_updated_episode", 0)
            self._episode_history = data.get("history", [])
            return True
        except Exception as e:
            logger.warning(f"Failed to load specialization for {self.agent_id}: {e}")
            return False


class SessionSpecialization:
    """Aggregates specialization data for all agents in a session.

    Provides per-agent profiles and cross-agent comparisons.
    """

    def __init__(self, session_id: str):
        self.session_id = session_id
        self.agents: Dict[str, AgentSpecialization] = {}

    def get_or_create(
        self,
        agent_id: str,
        skill_categories: Optional[Dict[str, List[int]]] = None,
        feature_dim: int = 8,
    ) -> AgentSpecialization:
        if agent_id not in self.agents:
            self.agents[agent_id] = AgentSpecialization(
                agent_id=agent_id,
                skill_categories=skill_categories,
                feature_dim=feature_dim,
            )
        return self.agents[agent_id]

    def update_from_episode(
        self,
        agent_id: str,
        target_features: List[float],
        success: bool,
        episode: int,
    ) -> Dict[str, float]:
        agent = self.get_or_create(agent_id)
        return agent.update(target_features, success, episode)

    def get_full_report(self) -> Dict[str, Any]:
        """Full specialization report for the session."""
        profiles = {}
        for agent_id, agent in self.agents.items():
            profiles[agent_id] = agent.get_skill_profile()

        # Cross-agent comparison
        all_skills: Dict[str, List[Tuple[str, float]]] = defaultdict(list)
        for agent_id, agent in self.agents.items():
            for skill_name, sr in agent.skills.items():
                if sr.total >= 3:
                    all_skills[skill_name].append((agent_id, sr.recent_rate))

        leaders = {}
        for skill_name, agent_rates in all_skills.items():
            if agent_rates:
                best = max(agent_rates, key=lambda x: x[1])
                leaders[skill_name] = {"agent_id": best[0], "rate": round(best[1], 4)}

        return {
            "session_id": self.session_id,
            "agents": profiles,
            "skill_leaders": leaders,
            "overall_specialization": {
                agent_id: agent.get_specialization_score()
                for agent_id, agent in self.agents.items()
            },
        }
