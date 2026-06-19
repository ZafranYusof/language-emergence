"""Pydantic models for the Language Emergence System."""

from pydantic import BaseModel, Field
from typing import Optional, List, Dict, Any
from enum import Enum
from datetime import datetime


class GameType(str, Enum):
    REFERENTIAL = "referential"
    NEGOTIATION = "negotiation"


class TrainingConfig(BaseModel):
    """Configuration for a training session."""
    game_type: GameType = GameType.REFERENTIAL
    num_episodes: int = 1000
    learning_rate: float = 1e-3
    vocab_size: int = 20
    message_length: int = 5
    hidden_dim: int = 128
    feature_dim: int = 8
    num_objects: int = 10
    gumbel_temp_start: float = 1.0
    gumbel_temp_end: float = 0.5
    entropy_coeff: float = 0.01
    log_interval: int = 10


class SessionCreate(BaseModel):
    """Request to create a new session."""
    config: TrainingConfig = Field(default_factory=TrainingConfig)
    name: Optional[str] = None


class SessionState(BaseModel):
    """Full state of a training session."""
    session_id: str
    name: Optional[str] = None
    status: str = "created"  # created, training, stopped, completed
    config: TrainingConfig
    current_episode: int = 0
    total_episodes: int = 0
    created_at: str = Field(default_factory=lambda: datetime.utcnow().isoformat())
    updated_at: str = Field(default_factory=lambda: datetime.utcnow().isoformat())


class EpisodeMetrics(BaseModel):
    """Metrics from a single episode or batch of episodes."""
    episode: int
    reward: float
    loss: float
    speaker_loss: float = 0.0
    listener_loss: float = 0.0
    gumbel_temperature: float = 1.0
    vocab_size: int = 0
    compositionality: float = 0.0
    entropy: float = 0.0


class ConversationRecord(BaseModel):
    """A single agent communication exchange."""
    episode: int
    target_index: int
    target_features: List[float]
    message: List[int]
    message_probs: List[List[float]]
    listener_choice: int
    reward: float
    candidates_features: Optional[List[List[float]]] = None


class LanguageMetrics(BaseModel):
    """Snapshot of emergent language properties."""
    vocab_size: int
    compositionality: float
    entropy: float
    word_order_score: float = 0.0
    semantic_drift: float = 0.0
    unique_messages: int = 0
    message_frequency: Dict[str, int] = Field(default_factory=dict)
    symbol_usage: List[int] = Field(default_factory=list)


class TrainingProgress(BaseModel):
    """WebSocket message for training progress."""
    type: str = "training_progress"
    session_id: str
    episode: int
    reward: float
    loss: float
    vocab_size: int
    compositionality: float
    entropy: float
    gumbel_temperature: float


class TrainingAdjustRequest(BaseModel):
    """Request to adjust training parameters mid-training."""
    learning_rate: Optional[float] = Field(None, ge=1e-8, le=1.0, description="New learning rate")
    entropy_coeff: Optional[float] = Field(None, ge=0.0, le=1.0, description="New entropy coefficient")
    gumbel_temp_start: Optional[float] = Field(None, ge=0.01, le=5.0, description="New Gumbel start temperature")
    gumbel_temp_end: Optional[float] = Field(None, ge=0.01, le=5.0, description="New Gumbel end temperature")
    reward_correct: Optional[float] = Field(None, ge=0.0, le=10.0, description="Reward for correct selection")
    reward_incorrect: Optional[float] = Field(None, ge=-10.0, le=10.0, description="Reward for incorrect selection")
    grad_clip: Optional[float] = Field(None, ge=0.1, le=100.0, description="Gradient clipping max norm")


class BatchTrainItem(BaseModel):
    """A single training job within a batch."""
    session_id: Optional[str] = Field(None, description="Existing session ID; if omitted, a new session is created")
    name: Optional[str] = Field(None, description="Name for new session")
    config: TrainingConfig = Field(default_factory=TrainingConfig)


class BatchTrainRequest(BaseModel):
    """Request to start multiple training sessions in parallel."""
    jobs: List[BatchTrainItem] = Field(..., min_length=1, max_length=20, description="List of training jobs")


class BatchJobStatus(BaseModel):
    """Status of a single batch job."""
    batch_job_id: str
    session_id: str
    status: str
    current_episode: int = 0
    num_episodes: int = 0
    started_at: Optional[str] = None
    error: Optional[str] = None


class BatchStatusResponse(BaseModel):
    """Status of all batch jobs."""
    batch_id: str
    jobs: List[BatchJobStatus]
    total: int
    completed: int
    running: int
    errors: int

class WSNewConversation(BaseModel):
    """WebSocket message for new conversation."""
    type: str = "new_conversation"
    session_id: str
    data: ConversationRecord


class WSLanguageUpdate(BaseModel):
    """WebSocket message for language update."""
    type: str = "language_update"
    session_id: str
    data: LanguageMetrics
