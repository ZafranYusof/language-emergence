"""
Human-in-the-Loop Language Training module.

Provides:
- FeedbackStore: stores human ratings for agent conversations
- Rating model with RLHF-style reward signals
- ClassroomSession: pair a human with an agent for interactive teaching
- RewardModel: simple scoring based on human ratings
"""

import uuid
import json
import logging
import time
import math
import random
from datetime import datetime
from typing import Optional, List, Dict, Any
from dataclasses import dataclass, field, asdict
from fastapi import APIRouter, HTTPException, Body

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api")

# ---------------------------------------------------------------------------
#  Data Models (dataclasses for in-memory storage)
# ---------------------------------------------------------------------------

@dataclass
class Rating:
    session_id: str
    conversation_id: str
    rating: int           # 1-5
    comment: str = ""
    suggested_improvement: str = ""
    timestamp: str = field(default_factory=lambda: datetime.utcnow().isoformat())
    rating_id: str = field(default_factory=lambda: uuid.uuid4().hex[:12])

@dataclass
class FeedbackStats:
    session_id: str
    average_rating: float = 0.0
    total_ratings: int = 0
    distribution: Dict[int, int] = field(default_factory=lambda: {1: 0, 2: 0, 3: 0, 4: 0, 5: 0})

@dataclass
class ClassroomMessage:
    sender: str           # "human" or "agent"
    content: str
    symbol_used: str = ""
    feedback_given: str = ""
    timestamp: str = field(default_factory=lambda: datetime.utcnow().isoformat())
    message_id: str = field(default_factory=lambda: uuid.uuid4().hex[:12])

@dataclass
class ClassroomSession:
    session_id: str
    classroom_id: str = field(default_factory=lambda: uuid.uuid4().hex[:12])
    created_at: str = field(default_factory=lambda: datetime.utcnow().isoformat())
    messages: List[Dict] = field(default_factory=list)
    vocabulary: Dict[str, Dict] = field(default_factory=dict)
    understanding_level: float = 0.0
    active: bool = True

# ---------------------------------------------------------------------------
#  In-Memory Stores
# ---------------------------------------------------------------------------

class FeedbackStore:
    """Stores human ratings for agent conversations."""

    def __init__(self):
        self.ratings: Dict[str, List[Rating]] = {}   # session_id -> [Rating]
        self.all_ratings: List[Rating] = []

    def add_rating(self, rating: Rating) -> Rating:
        if rating.session_id not in self.ratings:
            self.ratings[rating.session_id] = []
        self.ratings[rating.session_id].append(rating)
        self.all_ratings.append(rating)
        return rating

    def get_ratings(self, session_id: str) -> List[Rating]:
        return self.ratings.get(session_id, [])

    def get_all_ratings(self) -> List[Rating]:
        return self.all_ratings

    def get_stats(self, session_id: str) -> FeedbackStats:
        ratings = self.get_ratings(session_id)
        stats = FeedbackStats(session_id=session_id)
        stats.total_ratings = len(ratings)
        if ratings:
            scores = [r.rating for r in ratings]
            stats.average_rating = round(sum(scores) / len(scores), 2)
            for r in ratings:
                stats.distribution[r.rating] = stats.distribution.get(r.rating, 0) + 1
        return stats


class RewardModel:
    """Simple RLHF-style reward model that adjusts behavior weights based on human ratings."""

    def __init__(self):
        # Behavior weights that get adjusted via human feedback
        self.weights: Dict[str, float] = {
            "clarity": 0.5,
            "consistency": 0.5,
            "compositionality": 0.5,
            "expressiveness": 0.5,
            "efficiency": 0.5,
        }
        self.feedback_history: List[Dict] = []
        self.learning_rate = 0.05

    def score_from_rating(self, rating: int) -> float:
        """Convert 1-5 rating to a reward signal in [-1, 1]."""
        return (rating - 3) / 2.0

    def update_weights(self, rating: Rating):
        """Adjust behavior weights based on a human rating."""
        reward = self.score_from_rating(rating.rating)

        # Parse comment for keywords to determine which weights to adjust
        comment_lower = (rating.comment + " " + rating.suggested_improvement).lower()

        keyword_map = {
            "clarity": ["clear", "unclear", "confusing", "understand", "readable", "clarity"],
            "consistency": ["consistent", "inconsistent", "stable", "erratic", "predictable", "regular"],
            "compositionality": ["composition", "structure", "systematic", "compositional", "grammar", "syntax"],
            "expressiveness": ["expressive", "creative", "diverse", "rich", "varied", "boring", "dull"],
            "efficiency": ["efficient", "concise", "brief", "verbose", "wasteful", "short", "long"],
        }

        weights_adjusted = False
        for weight_name, keywords in keyword_map.items():
            if any(kw in comment_lower for kw in keywords):
                self.weights[weight_name] = max(0.0, min(1.0,
                    self.weights[weight_name] + self.learning_rate * reward
                ))
                weights_adjusted = True

        # If no specific keywords found, adjust all weights slightly
        if not weights_adjusted:
            for weight_name in self.weights:
                self.weights[weight_name] = max(0.0, min(1.0,
                    self.weights[weight_name] + self.learning_rate * reward * 0.3
                ))

        self.feedback_history.append({
            "rating": rating.rating,
            "reward": reward,
            "weights": dict(self.weights),
            "timestamp": rating.timestamp,
        })

    def get_reward(self) -> float:
        """Get the current composite reward signal from all weights."""
        if not self.weights:
            return 0.0
        return sum(self.weights.values()) / len(self.weights)

    def get_weights(self) -> Dict[str, float]:
        return dict(self.weights)


# ---------------------------------------------------------------------------
#  Global singletons
# ---------------------------------------------------------------------------

feedback_store = FeedbackStore()
reward_model = RewardModel()
classroom_sessions: Dict[str, ClassroomSession] = {}

# Emergent vocabulary (populated from training sessions)
_emergent_vocabulary: Dict[str, Dict] = {}

# ---------------------------------------------------------------------------
#  Helpers
# ---------------------------------------------------------------------------

def _generate_agent_response(human_message: str, vocabulary: Dict[str, Dict]) -> Dict:
    """Generate a mock agent response using emergent symbols."""
    # Map of known meanings to emergent symbols
    meaning_to_symbol = {}
    for sym, info in vocabulary.items():
        meaning_to_symbol[info.get("meaning", "").lower()] = sym

    words = human_message.lower().split()
    response_symbols = []
    response_text = ""

    # Try to map human words to known symbols
    for word in words:
        for meaning, sym in meaning_to_symbol.items():
            if word in meaning or meaning in word:
                response_symbols.append(sym)
                break

    if response_symbols:
        response_text = " ".join([f"[{s}]" for s in response_symbols])
        return {
            "content": response_text,
            "symbols_used": response_symbols,
            "confidence": random.uniform(0.4, 0.95),
        }

    # Fallback: use random symbols from vocabulary
    if vocabulary:
        available = list(vocabulary.keys())
        chosen = random.sample(available, min(3, len(available)))
        response_text = " ".join([f"[{s}]" for s in chosen])
        return {
            "content": response_text,
            "symbols_used": chosen,
            "confidence": random.uniform(0.1, 0.5),
        }

    return {
        "content": "[...]",
        "symbols_used": [],
        "confidence": 0.0,
    }


def _seed_vocabulary():
    """Seed some initial emergent vocabulary for demo purposes."""
    global _emergent_vocabulary
    if not _emergent_vocabulary:
        _emergent_vocabulary = {
            "7": {"meaning": "red / high-hue", "usage_count": 87, "confidence": 0.92, "category": "color"},
            "11": {"meaning": "large object", "usage_count": 64, "confidence": 0.88, "category": "size"},
            "3": {"meaning": "circle shape", "usage_count": 72, "confidence": 0.85, "category": "shape"},
            "22": {"meaning": "bright / high lightness", "usage_count": 53, "confidence": 0.79, "category": "light"},
            "5": {"meaning": "opaque / solid", "usage_count": 41, "confidence": 0.76, "category": "opacity"},
            "14": {"meaning": "bordered / outlined", "usage_count": 38, "confidence": 0.71, "category": "border"},
            "9": {"meaning": "blue / cool tone", "usage_count": 45, "confidence": 0.68, "category": "color"},
            "17": {"meaning": "rotated / twisted", "usage_count": 29, "confidence": 0.63, "category": "rotation"},
            "1": {"meaning": "small / minimal", "usage_count": 35, "confidence": 0.59, "category": "size"},
            "20": {"meaning": "desaturated / muted", "usage_count": 22, "confidence": 0.54, "category": "saturation"},
            "4": {"meaning": "square shape", "usage_count": 18, "confidence": 0.48, "category": "shape"},
            "15": {"meaning": "partial opacity", "usage_count": 14, "confidence": 0.42, "category": "opacity"},
        }

_seed_vocabulary()

# Seed some demo ratings
def _seed_demo_ratings():
    """Pre-populate with a few demo ratings so the UI isn't empty."""
    demo_ratings = [
        Rating(session_id="1f7dbc63", conversation_id="conv_001", rating=5,
               comment="Very clear communication, the symbols were used consistently",
               suggested_improvement="Maybe add more expressive symbols for emotions"),
        Rating(session_id="1f7dbc63", conversation_id="conv_002", rating=4,
               comment="Good compositionality, but some symbols were reused confusingly",
               suggested_improvement="Reduce symbol reuse for different meanings"),
        Rating(session_id="1f7dbc63", conversation_id="conv_003", rating=3,
               comment="Average performance, the agent seems to still be learning",
               suggested_improvement="Focus on clarity before complexity"),
        Rating(session_id="1f7dbc63", conversation_id="conv_004", rating=5,
               comment="Excellent emergent grammar! Symbols combine logically",
               suggested_improvement="Continue training with more diverse objects"),
        Rating(session_id="1f7dbc63", conversation_id="conv_005", rating=2,
               comment="Confusing symbol usage, hard to understand the intended meaning",
               suggested_improvement="Reduce vocabulary size and reinforce core symbols"),
        Rating(session_id="1f7dbc63", conversation_id="conv_006", rating=4,
               comment="Nice progress from last session, more consistent now",
               suggested_improvement="Try longer message sequences"),
        Rating(session_id="demo_session", conversation_id="conv_101", rating=4,
               comment="Interesting language patterns emerging",
               suggested_improvement="More feedback rounds needed"),
        Rating(session_id="demo_session", conversation_id="conv_102", rating=5,
               comment="The agent picked up on my teaching quickly!",
               suggested_improvement="Great progress"),
    ]
    for r in demo_ratings:
        feedback_store.add_rating(r)
        reward_model.update_weights(r)

_seed_demo_ratings()

# ---------------------------------------------------------------------------
#  API Endpoints
# ---------------------------------------------------------------------------

@router.post("/feedback/rate")
async def rate_conversation(body: Dict = Body(...)):
    """Rate a conversation between agents."""
    session_id = body.get("session_id")
    conversation_id = body.get("conversation_id")
    rating_val = body.get("rating")
    comment = body.get("comment", "")
    suggested_improvement = body.get("suggested_improvement", "")

    if not session_id:
        raise HTTPException(400, "session_id is required")
    if not conversation_id:
        raise HTTPException(400, "conversation_id is required")
    if rating_val is None or not (1 <= int(rating_val) <= 5):
        raise HTTPException(400, "rating must be an integer 1-5")

    rating = Rating(
        session_id=session_id,
        conversation_id=conversation_id,
        rating=int(rating_val),
        comment=comment,
        suggested_improvement=suggested_improvement,
    )

    feedback_store.add_rating(rating)
    reward_model.update_weights(rating)

    return {
        "status": "rated",
        "rating_id": rating.rating_id,
        "reward_signal": reward_model.score_from_rating(rating.rating),
        "updated_weights": reward_model.get_weights(),
    }


@router.get("/feedback/stats/{session_id}")
async def get_feedback_stats(session_id: str):
    """Get feedback statistics for a session."""
    stats = feedback_store.get_stats(session_id)
    return {
        "session_id": stats.session_id,
        "average_rating": stats.average_rating,
        "total_ratings": stats.total_ratings,
        "distribution": stats.distribution,
        "reward_model": {
            "composite_reward": round(reward_model.get_reward(), 3),
            "weights": reward_model.get_weights(),
        },
    }


@router.get("/feedback/history/{session_id}")
async def get_feedback_history(session_id: str):
    """Get all ratings for a session."""
    ratings = feedback_store.get_ratings(session_id)
    return {
        "session_id": session_id,
        "ratings": [asdict(r) for r in ratings],
        "total": len(ratings),
    }


@router.get("/feedback/leaderboard")
async def get_leaderboard():
    """Get top 10 best-rated conversations."""
    all_ratings = feedback_store.get_all_ratings()

    # Group by conversation and compute average
    conv_ratings: Dict[str, List[Rating]] = {}
    for r in all_ratings:
        key = f"{r.session_id}:{r.conversation_id}"
        if key not in conv_ratings:
            conv_ratings[key] = []
        conv_ratings[key].append(r)

    leaderboard = []
    for key, ratings in conv_ratings.items():
        avg = sum(r.rating for r in ratings) / len(ratings)
        session_id, conversation_id = key.split(":", 1)
        leaderboard.append({
            "session_id": session_id,
            "conversation_id": conversation_id,
            "average_rating": round(avg, 2),
            "total_ratings": len(ratings),
            "best_comment": max(ratings, key=lambda r: r.rating).comment,
        })

    leaderboard.sort(key=lambda x: x["average_rating"], reverse=True)
    return {"leaderboard": leaderboard[:10]}


# ---------------------------------------------------------------------------
#  Classroom Endpoints
# ---------------------------------------------------------------------------

@router.post("/classroom/start")
async def start_classroom(body: Dict = Body(...)):
    """Start a new classroom session pairing a human with an agent."""
    session_id = body.get("session_id", f"learn_{uuid.uuid4().hex[:8]}")

    cs = ClassroomSession(session_id=session_id)
    cs.vocabulary = dict(_emergent_vocabulary)
    classroom_sessions[cs.classroom_id] = cs

    return {
        "classroom_id": cs.classroom_id,
        "session_id": cs.session_id,
        "vocabulary_size": len(cs.vocabulary),
        "understanding_level": cs.understanding_level,
        "created_at": cs.created_at,
    }


@router.post("/classroom/message")
async def send_classroom_message(body: Dict = Body(...)):
    """Send a message in a classroom session."""
    classroom_id = body.get("classroom_id")
    content = body.get("content", "")
    feedback = body.get("feedback", "")

    if not classroom_id:
        raise HTTPException(400, "classroom_id is required")
    if classroom_id not in classroom_sessions:
        raise HTTPException(404, "Classroom session not found")

    cs = classroom_sessions[classroom_id]

    # Add human message
    human_msg = asdict(ClassroomMessage(
        sender="human",
        content=content,
        feedback_given=feedback,
    ))
    cs.messages.append(human_msg)

    # Generate agent response
    agent_result = _generate_agent_response(content, cs.vocabulary)
    agent_msg = asdict(ClassroomMessage(
        sender="agent",
        content=agent_result["content"],
        symbol_used=", ".join(agent_result["symbols_used"]),
    ))
    cs.messages.append(agent_msg)

    # Update understanding level based on confidence
    cs.understanding_level = min(1.0, cs.understanding_level +
        agent_result["confidence"] * 0.05
    )

    return {
        "human_message": human_msg,
        "agent_response": agent_msg,
        "understanding_level": round(cs.understanding_level, 3),
        "symbols_used": agent_result["symbols_used"],
        "confidence": round(agent_result["confidence"], 3),
    }


@router.get("/classroom/vocabulary")
async def get_classroom_vocabulary(classroom_id: str = None):
    """Get the current emergent vocabulary with meanings."""
    if classroom_id and classroom_id in classroom_sessions:
        vocab = classroom_sessions[classroom_id].vocabulary
    else:
        vocab = _emergent_vocabulary

    total = len(vocab)
    learned = sum(1 for v in vocab.values() if v.get("confidence", 0) >= 0.7)

    return {
        "vocabulary": vocab,
        "total_symbols": total,
        "learned_symbols": learned,
        "learning_progress": round(learned / total, 3) if total > 0 else 0,
    }


@router.post("/classroom/teach")
async def teach_symbol(body: Dict = Body(...)):
    """Directly teach a new symbol-meaning mapping."""
    symbol = body.get("symbol")
    meaning = body.get("meaning")
    classroom_id = body.get("classroom_id")
    category = body.get("category", "taught")

    if not symbol or not meaning:
        raise HTTPException(400, "symbol and meaning are required")

    # Update global vocabulary
    _emergent_vocabulary[symbol] = {
        "meaning": meaning,
        "usage_count": 0,
        "confidence": 0.6,  # Start with moderate confidence for taught symbols
        "category": category,
        "taught_by": "human",
    }

    # Also update classroom vocab if applicable
    if classroom_id and classroom_id in classroom_sessions:
        classroom_sessions[classroom_id].vocabulary[symbol] = dict(_emergent_vocabulary[symbol])
        # Boost understanding when human teaches
        cs = classroom_sessions[classroom_id]
        cs.understanding_level = min(1.0, cs.understanding_level + 0.1)

        # Add a system message to the chat
        cs.messages.append(asdict(ClassroomMessage(
            sender="agent",
            content=f"✓ Learned: [{symbol}] = \"{meaning}\"",
            symbol_used=symbol,
        )))

    return {
        "status": "taught",
        "symbol": symbol,
        "meaning": meaning,
        "vocabulary_size": len(_emergent_vocabulary),
    }


# ---------------------------------------------------------------------------
#  Router registration helper
# ---------------------------------------------------------------------------

def get_router():
    """Return the feedback/classroom router for inclusion in main app."""
    return router
