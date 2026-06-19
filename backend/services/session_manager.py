"""Session management for training sessions."""

import os
import json
import uuid
import logging
from datetime import datetime
from typing import Dict, Any, List, Optional
from collections import defaultdict

from models.schemas import SessionState, TrainingConfig, ConversationRecord, LanguageMetrics

logger = logging.getLogger(__name__)

SESSIONS_DIR = os.path.join("data", "sessions")


class SessionManager:
    """
    Manages training sessions with in-memory storage.
    
    Supports:
    - Session persistence: save/load to JSON files
    - Auto-save every 100 episodes
    - Load existing sessions on startup
    
    Stores:
    - Session states and configs
    - Metrics timelines
    - Conversation histories
    - Language snapshots
    """
    
    def __init__(self, sessions_dir: str = SESSIONS_DIR):
        self.sessions: Dict[str, SessionState] = {}
        self.metrics: Dict[str, List[Dict]] = defaultdict(list)
        self.conversations: Dict[str, List[Dict]] = defaultdict(list)
        self.language_snapshots: Dict[str, List[Dict]] = defaultdict(list)
        self.trainers: Dict[str, Any] = {}  # TrainingLoop instances
        self.sessions_dir = sessions_dir
        
        # Create data directory
        os.makedirs(self.sessions_dir, exist_ok=True)
        
        # IMPROVEMENT 2: Load existing sessions on startup
        self._load_all_sessions()
    
    def _load_all_sessions(self):
        """Load all saved session states from disk."""
        if not os.path.isdir(self.sessions_dir):
            return
        
        loaded = 0
        for fname in os.listdir(self.sessions_dir):
            if not fname.endswith(".json"):
                continue
            fpath = os.path.join(self.sessions_dir, fname)
            try:
                with open(fpath, "r") as f:
                    data = json.load(f)
                session = SessionState(**data["session"])
                self.sessions[session.session_id] = session
                loaded += 1
            except Exception as e:
                logger.warning(f"Failed to load session from {fpath}: {e}")
        
        if loaded:
            logger.info(f"Loaded {loaded} session(s) from {self.sessions_dir}")
    
    # IMPROVEMENT 2: Save session state to JSON
    def save_session(self, session_id: str) -> Optional[str]:
        """
        Save a session's state to disk as JSON.
        
        Returns the file path, or None if session not found.
        """
        session = self.sessions.get(session_id)
        if not session:
            logger.warning(f"Cannot save session {session_id}: not found")
            return None
        
        os.makedirs(self.sessions_dir, exist_ok=True)
        filepath = os.path.join(self.sessions_dir, f"{session_id}.json")
        
        data = {
            "session": session.model_dump(),
            "saved_at": datetime.utcnow().isoformat(),
            "metrics_count": len(self.metrics.get(session_id, [])),
            "conversations_count": len(self.conversations.get(session_id, [])),
            "language_snapshots_count": len(self.language_snapshots.get(session_id, [])),
        }
        
        try:
            with open(filepath, "w") as f:
                json.dump(data, f, indent=2, default=str)
            logger.info(f"Session {session_id} saved to {filepath}")
            return filepath
        except Exception as e:
            logger.error(f"Failed to save session {session_id}: {e}")
            return None
    
    def load_session(self, session_id: str) -> Optional[SessionState]:
        """
        Load a session state from disk.
        
        Returns the SessionState, or None if not found.
        """
        filepath = os.path.join(self.sessions_dir, f"{session_id}.json")
        if not os.path.exists(filepath):
            logger.warning(f"Session file not found: {filepath}")
            return None
        
        try:
            with open(filepath, "r") as f:
                data = json.load(f)
            session = SessionState(**data["session"])
            self.sessions[session.session_id] = session
            logger.info(f"Session {session_id} loaded from {filepath}")
            return session
        except Exception as e:
            logger.error(f"Failed to load session {session_id}: {e}")
            return None
    
    def create_session(
        self, config: TrainingConfig, name: Optional[str] = None
    ) -> SessionState:
        """Create a new training session."""
        session_id = str(uuid.uuid4())[:8]
        
        session = SessionState(
            session_id=session_id,
            name=name or f"Session {session_id}",
            config=config,
            status="created",
        )
        
        self.sessions[session_id] = session
        return session
    
    def get_session(self, session_id: str) -> Optional[SessionState]:
        """Get session state by ID."""
        return self.sessions.get(session_id)
    
    def update_session(self, session_id: str, **kwargs) -> Optional[SessionState]:
        """Update session fields.  Auto-saves every 100 episodes if applicable."""
        session = self.sessions.get(session_id)
        if session:
            for key, value in kwargs.items():
                if hasattr(session, key):
                    setattr(session, key, value)
            session.updated_at = datetime.utcnow().isoformat()
            
            # IMPROVEMENT 2: Auto-save every 100 episodes
            if "current_episode" in kwargs:
                ep = kwargs["current_episode"]
                if isinstance(ep, int) and ep > 0 and ep % 100 == 0:
                    self.save_session(session_id)
        
        return session
    
    def list_sessions(self) -> List[SessionState]:
        """List all sessions."""
        return list(self.sessions.values())
    
    def delete_session(self, session_id: str) -> bool:
        """Delete a session and its data."""
        if session_id in self.sessions:
            del self.sessions[session_id]
            self.metrics.pop(session_id, None)
            self.conversations.pop(session_id, None)
            self.language_snapshots.pop(session_id, None)
            self.trainers.pop(session_id, None)
            
            # Also remove saved file
            filepath = os.path.join(self.sessions_dir, f"{session_id}.json")
            if os.path.exists(filepath):
                try:
                    os.remove(filepath)
                except OSError:
                    pass
            
            return True
        return False
    
    def add_metrics(self, session_id: str, metrics: Dict[str, Any]):
        """Add metrics entry for a session."""
        metrics["timestamp"] = datetime.utcnow().isoformat()
        self.metrics[session_id].append(metrics)
        
        # Keep only last 10000 entries per session
        if len(self.metrics[session_id]) > 10000:
            self.metrics[session_id] = self.metrics[session_id][-10000:]
    
    def get_metrics(
        self, session_id: str, limit: int = 1000, offset: int = 0
    ) -> List[Dict]:
        """Get metrics timeline for a session."""
        all_metrics = self.metrics.get(session_id, [])
        return all_metrics[offset:offset + limit]
    
    def add_conversation(self, session_id: str, conversation: Dict[str, Any]):
        """Add a conversation record."""
        self.conversations[session_id].append(conversation)
        
        # Keep only last 5000 per session
        if len(self.conversations[session_id]) > 5000:
            self.conversations[session_id] = self.conversations[session_id][-5000:]
    
    def get_conversations(
        self, session_id: str, limit: int = 100, offset: int = 0
    ) -> List[Dict]:
        """Get conversation records for a session."""
        convos = self.conversations.get(session_id, [])
        return convos[offset:offset + limit]
    
    def get_conversations_total(self, session_id: str) -> int:
        """Get total conversation count for a session."""
        return len(self.conversations.get(session_id, []))
    
    def add_language_snapshot(self, session_id: str, snapshot: Dict[str, Any]):
        """Add a language analysis snapshot."""
        snapshot["timestamp"] = datetime.utcnow().isoformat()
        self.language_snapshots[session_id].append(snapshot)
        
        # Keep only last 500 snapshots
        if len(self.language_snapshots[session_id]) > 500:
            self.language_snapshots[session_id] = self.language_snapshots[session_id][-500:]
    
    def get_language_snapshots(
        self, session_id: str, limit: int = 50
    ) -> List[Dict]:
        """Get language snapshots for a session."""
        snapshots = self.language_snapshots.get(session_id, [])
        return snapshots[-limit:]
    
    def get_latest_language(self, session_id: str) -> Optional[Dict[str, Any]]:
        """Get the most recent language snapshot."""
        snapshots = self.language_snapshots.get(session_id, [])
        return snapshots[-1] if snapshots else None
    
    def set_trainer(self, session_id: str, trainer: Any):
        """Store a trainer reference for a session."""
        self.trainers[session_id] = trainer
    
    def get_trainer(self, session_id: str) -> Any:
        """Get the trainer for a session."""
        return self.trainers.get(session_id)
    
    def get_or_create_trainer(self, session_id: str) -> Any:
        """Get trainer, or auto-create from session config if missing.
        Also auto-restores from the latest checkpoint if available."""
        trainer = self.trainers.get(session_id)
        if trainer:
            return trainer
        
        session = self.sessions.get(session_id)
        if not session:
            return None
        
        # Auto-create trainer from session config
        try:
            import glob
            from agents.trainer import TrainingLoop
            config = session.config
            trainer = TrainingLoop(
                vocab_size=config.vocab_size,
                message_length=config.message_length,
                hidden_dim=config.hidden_dim,
                feature_dim=config.feature_dim,
                num_objects=config.num_objects,
                learning_rate=config.learning_rate,
                gumbel_temp_start=config.gumbel_temp_start,
                gumbel_temp_end=config.gumbel_temp_end,
                entropy_coeff=config.entropy_coeff,
                game_type=config.game_type.value if hasattr(config.game_type, 'value') else config.game_type,
                session_id=session_id,
            )
            
            # Auto-restore from latest checkpoint
            checkpoint_dir = os.path.join("data", "checkpoints", session_id)
            if os.path.isdir(checkpoint_dir):
                checkpoint_files = sorted(
                    glob.glob(os.path.join(checkpoint_dir, "episode_*.pt")),
                    key=lambda f: int(f.split("episode_")[-1].replace(".pt", ""))
                )
                if checkpoint_files:
                    latest = checkpoint_files[-1]
                    if trainer.load_checkpoint(latest):
                        logger.info(f"Auto-restored trainer for session {session_id} from {latest} (episode {trainer.current_episode})")
            
            self.trainers[session_id] = trainer
            logger.info(f"Trainer ready for session {session_id} (episode {trainer.current_episode})")
            return trainer
        except Exception as e:
            logger.error(f"Failed to auto-create trainer for {session_id}: {e}")
            return None
