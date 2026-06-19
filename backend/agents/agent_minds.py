"""Human-like agent minds: personality, memory, thoughts, emotions, and judgment.

This module provides an ADDITIONAL layer on top of the existing neural network
agents (SpeakerAgent, ListenerAgent). It does NOT replace or modify any neural
network code — it sits alongside and enriches training data with human-readable
thoughts, emotions, and partner judgments.
"""

import random
import math
import json
import os
from dataclasses import dataclass, field
from typing import Dict, List, Optional, Any, Tuple
from collections import defaultdict, deque


# ---------------------------------------------------------------------------
# 1. AgentPersonality
# ---------------------------------------------------------------------------

@dataclass
class AgentPersonality:
    """Personality traits that shape how an agent thinks and communicates.

    Each trait is a float in [0, 1].  Traits are randomized on creation
    and remain fixed for the lifetime of an agent.
    """

    curiosity: float = 0.5       # explore vs exploit
    confidence: float = 0.5      # certainty in own judgments
    creativity: float = 0.5      # willingness to try novel symbol combos
    patience: float = 0.5        # tolerance for failure before frustration
    sociability: float = 0.5     # how much partner history influences decisions

    # ----- factory ----------------------------------------------------------

    @classmethod
    def random(cls, rng: Optional[random.Random] = None) -> "AgentPersonality":
        """Create a personality with randomized traits."""
        r = rng or random
        return cls(
            curiosity=r.uniform(0.0, 1.0),
            confidence=r.uniform(0.0, 1.0),
            creativity=r.uniform(0.0, 1.0),
            patience=r.uniform(0.0, 1.0),
            sociability=r.uniform(0.0, 1.0),
        )

    # ----- helpers ----------------------------------------------------------

    def as_dict(self) -> Dict[str, float]:
        return {
            "curiosity": round(self.curiosity, 3),
            "confidence": round(self.confidence, 3),
            "creativity": round(self.creativity, 3),
            "patience": round(self.patience, 3),
            "sociability": round(self.sociability, 3),
        }

    @property
    def dominant_trait(self) -> str:
        """Return the name of the strongest personality trait."""
        traits = {
            "curiosity": self.curiosity,
            "confidence": self.confidence,
            "creativity": self.creativity,
            "patience": self.patience,
            "sociability": self.sociability,
        }
        return max(traits, key=traits.get)  # type: ignore[arg-type]


# ---------------------------------------------------------------------------
# 2. AgentMemory
# ---------------------------------------------------------------------------

@dataclass
class InteractionRecord:
    """A single interaction with a partner."""
    partner_id: str
    episode: int
    symbol_indices: List[int]
    success: bool
    target_features: Optional[List[float]] = None


class AgentMemory:
    """Long-term memory for an agent: tracks partners, symbols, and outcomes."""

    def __init__(self, max_history: int = 2000):
        self.interaction_history: deque[InteractionRecord] = deque(maxlen=max_history)
        self.success_rate_by_partner: Dict[str, List[bool]] = defaultdict(list)
        self.symbol_preferences: Dict[int, int] = defaultdict(int)  # symbol -> use count
        self.trust_scores: Dict[str, float] = {}
        self._max_history = max_history

    # ----- recording --------------------------------------------------------

    def record_interaction(self, record: InteractionRecord) -> None:
        """Store an interaction and update derived statistics."""
        self.interaction_history.append(record)
        self.success_rate_by_partner[record.partner_id].append(record.success)
        for sym in record.symbol_indices:
            self.symbol_preferences[sym] += 1

        # Update trust: EMA toward 1.0 (success) or 0.0 (failure)
        old_trust = self.trust_scores.get(record.partner_id, 0.5)
        alpha = 0.15
        target = 1.0 if record.success else 0.0
        self.trust_scores[record.partner_id] = old_trust + alpha * (target - old_trust)

    # ----- queries ----------------------------------------------------------

    def get_trust(self, partner_id: str) -> float:
        """Return current trust score for a partner (0-1)."""
        return self.trust_scores.get(partner_id, 0.5)

    def get_preferred_symbols(self, top_k: int = 5) -> List[Tuple[int, int]]:
        """Return the most-used symbols as (symbol_index, count) tuples."""
        sorted_syms = sorted(
            self.symbol_preferences.items(), key=lambda kv: kv[1], reverse=True
        )
        return sorted_syms[:top_k]

    def get_success_rate(self, partner_id: str) -> float:
        """Success rate with a specific partner."""
        results = self.success_rate_by_partner.get(partner_id, [])
        if not results:
            return 0.5  # unknown
        return sum(results) / len(results)

    def get_success_trend(self, partner_id: str, window: int = 20) -> float:
        """Return a trend value: positive = improving, negative = declining.

        Computed as (recent window rate) - (older window rate).
        """
        results = self.success_rate_by_partner.get(partner_id, [])
        if len(results) < 4:
            return 0.0
        half = max(len(results) // 2, 2)
        older = results[:half]
        recent = results[half:]
        return (sum(recent) / len(recent)) - (sum(older) / len(older))

    def get_streak(self, partner_id: str, window: int = 10) -> int:
        """Return the current success/failure streak (positive = wins, negative = losses)."""
        results = self.success_rate_by_partner.get(partner_id, [])
        if not results:
            return 0
        recent = results[-window:]
        streak = 0
        last = recent[-1]
        for r in reversed(recent):
            if r == last:
                streak += 1 if r else -1
            else:
                break
        return streak

    def get_recent_failures(self, partner_id: str, window: int = 5) -> int:
        """Count of failures in last *window* interactions."""
        results = self.success_rate_by_partner.get(partner_id, [])
        return sum(1 for r in results[-window:] if not r)


# ---------------------------------------------------------------------------
# 3. AgentThought
# ---------------------------------------------------------------------------

class AgentThought:
    """Generates internal monologue / 'thinking' text for an agent.

    Uses templates enriched by personality traits so that curious agents
    ask questions, confident agents make bold statements, etc.
    """

    # --- template pools ---

    _BEFORE_SPEAKING_OBSERVE = [
        "I notice my partner responds well to symbol {sym}.",
        "Looking at my notes — symbol {sym} has been reliable.",
        "Based on past exchanges, {sym} tends to work here.",
    ]
    _BEFORE_SPEAKING_CURIOUS = [
        "What if I tried something different this time?",
        "I wonder how my partner would react to a new pattern…",
        "Maybe I should experiment a little?",
    ]
    _BEFORE_SPEAKING_CONFIDENT = [
        "I'm fairly sure about this approach.",
        "I know what I'm doing here.",
        "This should work based on my experience.",
    ]
    _BEFORE_SPEAKING_STRUGGLING = [
        "Last {n} attempts failed — trying something different.",
        "This isn't working. Time to change strategy.",
        "I need to rethink my approach after these failures.",
    ]
    _BEFORE_SPEAKING_CREATIVITY = [
        "Let me try a creative combination nobody would expect.",
        "Mixing things up with an unconventional message.",
        "Time for a bold experiment!",
    ]

    _AFTER_SUCCESS = [
        "That worked! I should remember this pattern.",
        "Great — my message was understood. Reinforcing this.",
        "Success! Filing this away for next time.",
    ]
    _AFTER_SUCCESS_CONFIDENT = [
        "As expected. I knew that would work.",
        "Nailed it.",
    ]
    _AFTER_FAILURE = [
        "That didn't work… Let me analyze what went wrong.",
        "Frustrating. I need to adjust my approach.",
        "Hmm, my partner didn't get it this time.",
    ]
    _AFTER_FAILURE_PATIENT = [
        "No worries, these things take time.",
        "One setback — I'll learn from it.",
    ]
    _AFTER_FAILURE_IMPATIENT = [
        "This is getting frustrating!",
        "Why isn't this working?!",
        "I'm losing patience… need to try harder.",
    ]

    _JUDGE_IMPROVING = [
        "This listener is improving — communication is getting smoother.",
        "My partner is learning our shared language nicely.",
        "I can feel us getting better at this together.",
    ]
    _JUDGE_CONFUSED = [
        "This listener seems confused. I should simplify.",
        "My partner isn't following — maybe I'm being too complex.",
        "Communication is breaking down. Let me try clearer messages.",
    ]
    _JUDGE_RELIABLE = [
        "A reliable communicator — we work well together.",
        "This partner understands me consistently.",
        "We've built a strong working relationship.",
    ]
    _JUDGE_UNPREDICTABLE = [
        "This listener is unpredictable. Hard to know what will land.",
        "Inconsistent results with this partner.",
        "I can't read this one easily.",
    ]

    def __init__(self, personality: AgentPersonality):
        self.personality = personality

    def _pick(self, templates: List[str]) -> str:
        return random.choice(templates)

    def before_speaking(
        self,
        memory: AgentMemory,
        partner_id: str,
        msg_indices: Optional[List[int]] = None,
    ) -> str:
        """Generate a thought before producing a message."""
        p = self.personality
        recent_failures = memory.get_recent_failures(partner_id)
        preferred = memory.get_preferred_symbols(1)
        sym_label = f"sym-{preferred[0][0]}" if preferred else "my go-to symbol"

        # High failure count → struggling
        if recent_failures >= 3 and (1.0 - p.patience) > 0.5:
            tpl = self._pick(self._BEFORE_SPEAKING_STRUGGLING)
            return tpl.format(n=recent_failures)

        # Creative agents sometimes try something new
        if random.random() < p.creativity:
            return self._pick(self._BEFORE_SPEAKING_CREATIVITY)

        # If we have a known good symbol, observe it
        if preferred and preferred[0][1] >= 3 and random.random() < p.sociability:
            tpl = self._pick(self._BEFORE_SPEAKING_OBSERVE)
            return tpl.format(sym=sym_label)

        # Confident agents state intentions
        if p.confidence > 0.7:
            return self._pick(self._BEFORE_SPEAKING_CONFIDENT)

        # Curious agents ask questions
        if p.curiosity > 0.7:
            return self._pick(self._BEFORE_SPEAKING_CURIOUS)

        # Fallback
        return self._pick(self._BEFORE_SPEAKING_OBSERVE).format(sym=sym_label)

    def after_result(self, success: bool, memory: AgentMemory, partner_id: str) -> str:
        """Generate a thought after seeing the outcome."""
        p = self.personality
        if success:
            if p.confidence > 0.7:
                return self._pick(self._AFTER_SUCCESS_CONFIDENT)
            return self._pick(self._AFTER_SUCCESS)
        else:
            if p.patience < 0.3:
                return self._pick(self._AFTER_FAILURE_IMPATIENT)
            if p.patience > 0.7:
                return self._pick(self._AFTER_FAILURE_PATIENT)
            return self._pick(self._AFTER_FAILURE)

    def judging_partner(self, memory: AgentMemory, partner_id: str) -> str:
        """Generate a thought about the partner."""
        trend = memory.get_success_trend(partner_id)
        rate = memory.get_success_rate(partner_id)

        if trend > 0.15:
            return self._pick(self._JUDGE_IMPROVING)
        if rate < 0.3:
            return self._pick(self._JUDGE_CONFUSED)
        if rate > 0.65:
            return self._pick(self._JUDGE_RELIABLE)
        return self._pick(self._JUDGE_UNPREDICTABLE)


# ---------------------------------------------------------------------------
# 4. AgentEmotion
# ---------------------------------------------------------------------------

_MOODS = ("excited", "neutral", "focused", "frustrated", "curious", "confident")

_MOOD_EMOJIS = {
    "excited": "🤩",
    "neutral": "😐",
    "focused": "🎯",
    "frustrated": "😤",
    "curious": "🤔",
    "confident": "😎",
}

_MOOD_COLORS = {
    "excited": "#FFD700",
    "neutral": "#9E9E9E",
    "focused": "#2196F3",
    "frustrated": "#F44336",
    "curious": "#FF9800",
    "confident": "#4CAF50",
}


class AgentEmotion:
    """Tracks mood and energy for an agent, updated by outcomes."""

    def __init__(self, personality: AgentPersonality):
        self.personality = personality
        self.current_mood: str = "neutral"
        self.energy_level: float = 0.5
        self._mood_history: List[str] = ["neutral"]

    # ----- public -----------------------------------------------------------

    def update_mood(self, outcome: bool, streak: int) -> str:
        """Update mood based on the latest outcome and recent streak.

        Args:
            outcome: True if the last interaction was successful.
            streak: current consecutive win (+) / loss (-) streak.

        Returns:
            The new mood string.
        """
        p = self.personality

        # Energy shifts
        if outcome:
            self.energy_level = min(1.0, self.energy_level + 0.1)
        else:
            self.energy_level = max(0.0, self.energy_level - 0.15)

        # Mood logic
        if streak >= 3:
            self.current_mood = "excited" if p.confidence > 0.5 else "confident"
        elif streak >= 1 and outcome:
            self.current_mood = "focused" if self.energy_level > 0.5 else "confident"
        elif streak <= -3:
            # Very frustrated if impatient, else still focused
            if p.patience < 0.4:
                self.current_mood = "frustrated"
            else:
                self.current_mood = "focused"
        elif streak <= -1:
            if p.curiosity > 0.6:
                self.current_mood = "curious"
            elif p.patience < 0.4:
                self.current_mood = "frustrated"
            else:
                self.current_mood = "neutral"
        else:
            # Neutral / no clear streak
            if p.curiosity > 0.7:
                self.current_mood = "curious"
            elif p.confidence > 0.7:
                self.current_mood = "confident"
            else:
                self.current_mood = "neutral"

        self._mood_history.append(self.current_mood)
        return self.current_mood

    def get_mood_emoji(self) -> str:
        return _MOOD_EMOJIS.get(self.current_mood, "😐")

    def get_mood_color(self) -> str:
        return _MOOD_COLORS.get(self.current_mood, "#9E9E9E")

    def as_dict(self) -> Dict[str, Any]:
        return {
            "mood": self.current_mood,
            "emoji": self.get_mood_emoji(),
            "color": self.get_mood_color(),
            "energy": round(self.energy_level, 3),
        }


# ---------------------------------------------------------------------------
# 5. AgentJudgment
# ---------------------------------------------------------------------------

_JUDGMENT_CATEGORIES = ["excellent", "good", "average", "poor", "terrible"]

_JUDGMENT_TEXT = {
    "excellent": [
        "Reliable communicator — always a pleasure to work with.",
        "Outstanding partner. Consistently successful.",
    ],
    "good": [
        "Good communicator with solid consistency.",
        "A dependable partner who mostly gets it right.",
    ],
    "average": [
        "Average partner — sometimes we click, sometimes we don't.",
        "Inconsistent but shows potential.",
    ],
    "poor": [
        "Unpredictable, needs more consistency.",
        "Struggling to find common ground with this one.",
    ],
    "terrible": [
        "Very difficult to communicate with — almost no shared understanding.",
        "This partner and I are not on the same wavelength at all.",
    ],
}


class AgentJudgment:
    """Evaluates partner quality based on memory statistics."""

    JUDGMENT_CATEGORIES: List[str] = list(_JUDGMENT_CATEGORIES)

    def __init__(self, personality: AgentPersonality):
        self.personality = personality
        self._last_category: str = "average"
        self._last_score: float = 0.5

    def evaluate_partner(self, memory: AgentMemory, partner_id: str) -> Tuple[str, float]:
        """Rate partner quality.

        Returns:
            (category, score) where score is 0-1.
        """
        rate = memory.get_success_rate(partner_id)
        trend = memory.get_success_trend(partner_id)
        trust = memory.get_trust(partner_id)

        # Weighted composite
        score = 0.5 * rate + 0.2 * max(0, min(1, 0.5 + trend)) + 0.3 * trust
        score = max(0.0, min(1.0, score))

        if score >= 0.8:
            cat = "excellent"
        elif score >= 0.6:
            cat = "good"
        elif score >= 0.4:
            cat = "average"
        elif score >= 0.2:
            cat = "poor"
        else:
            cat = "terrible"

        self._last_category = cat
        self._last_score = score
        return cat, round(score, 3)

    def get_judgment_text(self) -> str:
        """Return a human-readable judgment based on last evaluation."""
        templates = _JUDGMENT_TEXT.get(self._last_category, _JUDGMENT_TEXT["average"])
        return random.choice(templates)

    def as_dict(self, memory: AgentMemory, partner_id: str) -> Dict[str, Any]:
        cat, score = self.evaluate_partner(memory, partner_id)
        return {
            "category": cat,
            "score": score,
            "text": self.get_judgment_text(),
        }


# ---------------------------------------------------------------------------
# 6. MemoryBank — persistent symbol-meaning mapping with confidence scores
# ---------------------------------------------------------------------------

class MemoryBank:
    """Persistent store of learned symbol-to-meaning mappings.

    Each mapping has a confidence score (0-1).  Mappings are saved to and
    loaded from a JSON file under ``data/memory/{agent_id}.json``.
    """

    def __init__(self, agent_id: str):
        self.agent_id = agent_id
        self._entries: Dict[str, Dict[str, Any]] = {}  # symbol -> {meaning, confidence}

    # ----- persistence ------------------------------------------------------

    @property
    def _default_path(self) -> str:
        return os.path.join("data", "memory", f"{self.agent_id}.json")

    def save(self, path: Optional[str] = None) -> None:
        """Save the memory bank to a JSON file."""
        path = path or self._default_path
        os.makedirs(os.path.dirname(path) or ".", exist_ok=True)
        with open(path, "w", encoding="utf-8") as fh:
            json.dump(self._entries, fh, indent=2, ensure_ascii=False)

    def load(self, path: Optional[str] = None) -> None:
        """Load the memory bank from a JSON file (no-op if file missing)."""
        path = path or self._default_path
        if not os.path.exists(path):
            return
        with open(path, "r", encoding="utf-8") as fh:
            self._entries = json.load(fh)

    # ----- learning & recall ------------------------------------------------

    def learn(self, symbol: str, meaning: str, confidence: float = 0.5) -> None:
        """Record or update a symbol→meaning mapping with a confidence score."""
        existing = self._entries.get(symbol)
        if existing and existing.get("meaning") == meaning:
            # Same meaning: update confidence with EMA
            alpha = 0.3
            existing["confidence"] = round(
                existing["confidence"] + alpha * (confidence - existing["confidence"]), 4
            )
        else:
            # New or different meaning: overwrite (higher confidence wins)
            if existing and existing.get("confidence", 0) >= confidence:
                return  # keep the stronger existing mapping
            self._entries[symbol] = {"meaning": meaning, "confidence": round(confidence, 4)}

    def recall(self, symbol: str) -> Optional[Dict[str, Any]]:
        """Recall the meaning and confidence for *symbol*, or ``None``."""
        return self._entries.get(symbol)

    def forget(self, symbol: str, min_confidence: float = 0.2) -> bool:
        """Remove a symbol mapping if its confidence is at or below *min_confidence*.

        Returns ``True`` if the entry was removed.
        """
        entry = self._entries.get(symbol)
        if entry is not None and entry.get("confidence", 0) <= min_confidence:
            del self._entries[symbol]
            return True
        return False

    # ----- convenience ------------------------------------------------------

    def all_entries(self) -> Dict[str, Dict[str, Any]]:
        """Return a shallow copy of all entries."""
        return dict(self._entries)

    def as_list(self) -> List[Dict[str, Any]]:
        """Return entries as a list of dicts (useful for JSON / snapshots)."""
        return [
            {"symbol": sym, "meaning": info["meaning"], "confidence": info["confidence"]}
            for sym, info in sorted(self._entries.items())
        ]


# ---------------------------------------------------------------------------
# 6b. KnowledgeExchange — collaborative learning between agents
# ---------------------------------------------------------------------------

class KnowledgeExchange:
    """Facilitates knowledge transfer between agents after discussions.
    
    When agents discuss, they may discover useful symbol-meaning mappings
    or patterns from peers. This class evaluates and transfers knowledge
    based on trust and relevance.
    """

    def __init__(self):
        self.transfer_log: List[Dict[str, Any]] = []

    def extract_insights(
        self,
        conversation_history: List[Dict[str, Any]],
        agent_id: str,
    ) -> List[Dict[str, Any]]:
        """Extract potential knowledge insights from conversation for an agent.
        
        Looks at what other agents said and extracts symbol-meaning patterns
        that the target agent might benefit from learning.
        """
        insights = []
        
        for entry in conversation_history:
            if entry.get("agent_id") == agent_id:
                continue  # skip own statements
            
            statement = entry.get("statement", "")
            mood = entry.get("mood", "neutral")
            confidence = entry.get("personality", {}).get("confidence", 0.5)
            
            # Extract implied knowledge from statements
            # All statements can carry knowledge, weighted by confidence
            insight = {
                "source_agent": entry.get("agent_id"),
                "statement": statement,
                "confidence": confidence,
                "mood": mood,
                "relevance_score": self._compute_relevance(statement, confidence),
            }
            insights.append(insight)
        
        return insights

    def _compute_relevance(self, statement: str, confidence: float = 0.5) -> float:
        """Compute how relevant/useful a statement is for learning.
        
        Higher relevance for statements with high confidence and specific patterns.
        """
        relevance = 0.3  # base
        
        # High confidence statements are more valuable
        if confidence > 0.7:
            relevance += 0.3
        elif confidence > 0.5:
            relevance += 0.15
        
        # Statements with certainty are more actionable
        certainty_words = ["certain", "evidence", "proof", "confirmed", "definitely", "confident"]
        if any(w in statement.lower() for w in certainty_words):
            relevance += 0.2
        
        # Questions indicate exploration (less actionable but valuable)
        if "?" in statement:
            relevance += 0.1
        
        # Specific observations
        if "I notice" in statement or "I observe" in statement or "I recognize" in statement:
            relevance += 0.15
        
        # Memory-related statements (symbol-meaning mappings)
        if "symbol" in statement.lower() or "mean" in statement.lower():
            relevance += 0.2
        
        return min(1.0, relevance)

    def transfer_knowledge(
        self,
        source_agent: "AgentMind",
        target_agent: "AgentMind",
        insights: List[Dict[str, Any]],
        trust_threshold: float = 0.2,
    ) -> List[Dict[str, Any]]:
        """Transfer valuable knowledge from source to target agent.
        
        Only transfers if the target agent trusts the source enough
        (based on their relationship judgment).
        """
        transferred = []
        
        # Get trust level between agents
        trust = source_agent.memory.get_trust(target_agent.agent_id)
        
        if trust < trust_threshold:
            return transferred  # not enough trust
        
        for insight in insights:
            source_id = insight["source_agent"]
            relevance = insight["relevance_score"]
            
            # Transfer if trust and relevance combined exceed threshold
            
            if trust * relevance > 0.15:
                # Extract symbol-meaning from the insight
                # Use the statement as a "meaning" and generate a pseudo-symbol
                statement = insight["statement"]
                words = statement.split()
                if len(words) >= 3:
                    # Create a condensed "symbol" from first few words
                    symbol = "_".join(words[:3]).lower()
                    meaning = statement[:100]  # truncate
                    confidence = insight["confidence"] * trust * 0.6  # discounted
                
                    target_agent.memory_bank.learn(
                        symbol=symbol,
                        meaning=meaning,
                        confidence=confidence,
                    )
                    
                    transfer_record = {
                        "from": source_id,
                        "to": target_agent.agent_id,
                        "symbol": symbol,
                        "meaning": meaning[:50],
                        "confidence": round(confidence, 3),
                        "trust": round(trust, 3),
                    }
                    transferred.append(transfer_record)
                    self.transfer_log.append(transfer_record)
        
        # Update trust after knowledge transfer
        if transferred:
            # Create a synthetic successful interaction to boost trust
            record = InteractionRecord(
                partner_id=target_agent.agent_id,
                episode=0,
                symbol_indices=[0],
                success=True,
            )
            source_agent.memory.record_interaction(record)
        
        return transferred

    def collaborative_round(
        self,
        agents: Dict[str, "AgentMind"],
        conversation_history: List[Dict[str, Any]],
    ) -> Dict[str, Any]:
        """Run a full knowledge exchange round between all agents.
        
        Each agent extracts insights from the conversation and attempts
        to learn from every other agent.
        """
        results = {
            "exchanges": [],
            "total_transfers": 0,
            "agents_affected": set(),
        }
        
        agent_ids = list(agents.keys())
        
        for target_id in agent_ids:
            target = agents[target_id]
            insights = self.extract_insights(conversation_history, target_id)
            
            for source_id in agent_ids:
                if source_id == target_id:
                    continue
                
                source = agents[source_id]
                source_insights = [i for i in insights if i["source_agent"] == source_id]
                
                if source_insights:
                    transfers = self.transfer_knowledge(
                        source, target, source_insights
                    )
                    if transfers:
                        results["exchanges"].extend(transfers)
                        results["total_transfers"] += len(transfers)
                        results["agents_affected"].add(target_id)
        
        results["agents_affected"] = list(results["agents_affected"])
        return results


# ---------------------------------------------------------------------------
# 7. AgentMind — top-level facade combining all subsystems
# ---------------------------------------------------------------------------

class AgentMind:
    """Unified interface for an agent's personality, memory, thoughts,
    emotions, and partner judgments.

    Instantiated once per neural-network agent (Speaker or Listener) and
    lives alongside it during training without modifying NN behaviour.
    """

    def __init__(self, agent_id: str, personality: Optional[AgentPersonality] = None):
        self.agent_id = agent_id
        self.personality = personality or AgentPersonality.random()
        self.memory = AgentMemory()
        self.thought_engine = AgentThought(self.personality)
        self.emotion = AgentEmotion(self.personality)
        self.judgment = AgentJudgment(self.personality)
        self.memory_bank = MemoryBank(agent_id)
        self.memory_bank.load()

    # ----- enhanced communication flow -------------------------------------

    def think_before_speak(
        self,
        target_features: List[float],
        candidates: Optional[List[List[float]]],
        memory: Optional[AgentMemory] = None,
        personality: Optional[AgentPersonality] = None,
        partner_id: str = "listener",
        msg_indices: Optional[List[int]] = None,
    ) -> Dict[str, Any]:
        """Generate pre-speaking thought and expose strategy hints.

        Returns:
            {
              "thought": str,
              "mood": str,
              "trust": float,
              "suggested_exploration": bool,
            }
        """
        mem = memory or self.memory
        thought = self.thought_engine.before_speaking(
            mem, partner_id, msg_indices=msg_indices
        )
        # Strategy hint: curious/creative agents explore more
        explore = random.random() < (
            self.personality.curiosity * 0.4 + self.personality.creativity * 0.3
        )
        return {
            "thought": thought,
            "mood": self.emotion.current_mood,
            "trust": mem.get_trust(partner_id),
            "suggested_exploration": explore,
        }

    def judge_conversation_outcome(
        self,
        partner_id: str,
        correct: bool,
        message: List[int],
        episode: int = 0,
        target_features: Optional[List[float]] = None,
    ) -> Dict[str, Any]:
        """Record outcome, update memory/emotion, generate post-thought.

        Returns:
            {
              "thought_after": str,
              "emotion": {...},
              "judgment": {...},
              "streak": int,
            }
        """
        # Record
        rec = InteractionRecord(
            partner_id=partner_id,
            episode=episode,
            symbol_indices=message,
            success=correct,
            target_features=target_features,
        )
        self.memory.record_interaction(rec)

        streak = self.memory.get_streak(partner_id)

        # Update emotion
        self.emotion.update_mood(correct, streak)

        # Post-thought
        thought_after = self.thought_engine.after_result(correct, self.memory, partner_id)

        # Judgment
        judgment = self.judgment.as_dict(self.memory, partner_id)

        return {
            "thought_after": thought_after,
            "emotion": self.emotion.as_dict(),
            "judgment": judgment,
            "streak": streak,
        }

    def get_relationship_summary(self, partner_id: str = "listener") -> Dict[str, Any]:
        """Return trust, history summary, and judgment for a partner."""
        trust = self.memory.get_trust(partner_id)
        rate = self.memory.get_success_rate(partner_id)
        trend = self.memory.get_success_trend(partner_id)
        total = len(self.memory.success_rate_by_partner.get(partner_id, []))
        judgment = self.judgment.as_dict(self.memory, partner_id)
        thought = self.thought_engine.judging_partner(self.memory, partner_id)

        return {
            "partner_id": partner_id,
            "trust": round(trust, 3),
            "success_rate": round(rate, 3),
            "trend": round(trend, 3),
            "total_interactions": total,
            "judgment": judgment,
            "thought": thought,
        }

    # ----- convenience ------------------------------------------------------

    def snapshot(self, partner_id: str = "listener") -> Dict[str, Any]:
        """Full snapshot of the agent's current mental state."""
        return {
            "agent_id": self.agent_id,
            "personality": self.personality.as_dict(),
            "dominant_trait": self.personality.dominant_trait,
            "emotion": self.emotion.as_dict(),
            "memory_bank": self.memory_bank.as_list(),
            "preferred_symbols": [
                {"symbol": s, "count": c}
                for s, c in self.memory.get_preferred_symbols(5)
            ],
            "relationship": self.get_relationship_summary(partner_id),
        }
