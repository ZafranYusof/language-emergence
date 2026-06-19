"""Training loop for multi-agent language emergence."""

import torch
import torch.nn as nn
import torch.optim as optim
import numpy as np
import asyncio
import os
import json
import logging
import glob
from datetime import datetime
from typing import Optional, Callable, Dict, Any, List
from collections import deque

from agents.agent import SpeakerAgent, ListenerAgent
from environments.referential_game import ReferentialGame
from environments.negotiation_game import NegotiationGame
from analysis.language_analyzer import LanguageAnalyzer
from agents.agent_minds import AgentMind, AgentPersonality

logger = logging.getLogger(__name__)


def _detect_device(device: Optional[str] = None) -> torch.device:
    """Detect the best available device, with multi-GPU support."""
    if device is not None:
        return torch.device(device)
    if torch.cuda.is_available():
        gpu_count = torch.cuda.device_count()
        logger.info(f"Detected {gpu_count} CUDA GPU(s)")
        for i in range(gpu_count):
            logger.info(f"  GPU {i}: {torch.cuda.get_device_name(i)}")
        return torch.device("cuda:0")
    logger.info("No GPU available, using CPU")
    return torch.device("cpu")


class TrainingLoop:
    """
    Training loop for speaker-listener language emergence.
    
    Uses REINFORCE (policy gradient) to train both agents:
    - Speaker is rewarded when listener selects the correct target
    - Listener is rewarded for correct selection
    - Communication uses Gumbel-Softmax with temperature annealing
    
    Supports:
    - Multi-GPU via DataParallel when multiple GPUs are available
    - Auto-save checkpoints every N episodes
    - Checkpoint rotation (keeps last N)
    - Continuous learning via start_continuous()
    - JSON state checkpoints via save_state_checkpoint()
    """
    
    def __init__(
        self,
        vocab_size: int = 20,
        message_length: int = 5,
        hidden_dim: int = 128,
        feature_dim: int = 8,
        num_objects: int = 10,
        learning_rate: float = 1e-3,
        gumbel_temp_start: float = 1.0,
        gumbel_temp_end: float = 0.5,
        entropy_coeff: float = 0.01,
        game_type: str = "referential",
        device: Optional[str] = None,
        checkpoint_interval: int = 500,
        keep_last_n_checkpoints: int = 5,
        session_id: Optional[str] = None,
    ):
        self.vocab_size = vocab_size
        self.message_length = message_length
        self.hidden_dim = hidden_dim
        self.feature_dim = feature_dim
        self.num_objects = num_objects
        self.learning_rate = learning_rate
        self.gumbel_temp_start = gumbel_temp_start
        self.gumbel_temp_end = gumbel_temp_end
        self.entropy_coeff = entropy_coeff
        self.game_type = game_type
        self.checkpoint_interval = checkpoint_interval
        self.keep_last_n_checkpoints = keep_last_n_checkpoints
        self.session_id = session_id
        
        # IMPROVEMENT 5: Multi-GPU device detection
        self.device_obj = _detect_device(device)
        self.device = str(self.device_obj)
        self.use_dataparallel = False
        
        logger.info(f"TrainingLoop using device: {self.device}")
        
        # Initialize agents
        self.speaker = SpeakerAgent(
            feature_dim=feature_dim,
            vocab_size=vocab_size,
            message_length=message_length,
            hidden_dim=hidden_dim,
        )
        
        self.listener = ListenerAgent(
            feature_dim=feature_dim,
            vocab_size=vocab_size,
            message_length=message_length,
            hidden_dim=hidden_dim,
            num_candidates=num_objects,
        )
        
        # IMPROVEMENT 5: Wrap with DataParallel if multiple GPUs available
        if self.device_obj.type == "cuda" and torch.cuda.device_count() > 1:
            logger.info(f"Using DataParallel across {torch.cuda.device_count()} GPUs")
            self.speaker = nn.DataParallel(self.speaker)
            self.listener = nn.DataParallel(self.listener)
            self.use_dataparallel = True
        
        self.speaker = self.speaker.to(self.device_obj)
        self.listener = self.listener.to(self.device_obj)
        
        # Optimizers
        self.speaker_optimizer = optim.Adam(self.speaker.parameters(), lr=learning_rate)
        self.listener_optimizer = optim.Adam(self.listener.parameters(), lr=learning_rate)
        
        # Environment
        if game_type == "referential":
            self.env = ReferentialGame(
                num_objects=num_objects, feature_dim=feature_dim
            )
        else:
            self.env = NegotiationGame(
                num_objects=num_objects, feature_dim=feature_dim
            )
        
        # Analyzer
        self.analyzer = LanguageAnalyzer(vocab_size=vocab_size, message_length=message_length)

        # Agent minds: personality, memory, thoughts, emotions (ADDITIVE layer)
        self.speaker_mind = AgentMind(agent_id="speaker")
        self.listener_mind = AgentMind(agent_id="listener")

        # Mind interaction log for the API
        self.mind_log: deque = deque(maxlen=1000)
        
        # State
        self.current_episode = 0
        self.is_training = False
        self._stop_requested = False
        self.running = False  # used by continuous training

        # Adjustable training parameters (mutable mid-training)
        self.reward_correct: float = 1.0
        self.reward_incorrect: float = 0.0
        self.grad_clip: float = 5.0
        
        # Metrics history
        self.reward_history: List[float] = []
        self.loss_history: List[float] = []
        self.vocab_size_history: List[int] = []
        self.compositionality_history: List[float] = []
        self.entropy_history: List[float] = []
        
        # Message log for analysis
        self.message_log: deque = deque(maxlen=5000)
        self.conversation_log: deque = deque(maxlen=1000)
        
    def get_temperature(self, episode: int, total_episodes: int) -> float:
        """Compute Gumbel-Softmax temperature with linear annealing."""
        progress = min(episode / max(total_episodes, 1), 1.0)
        temp = self.gumbel_temp_start + progress * (self.gumbel_temp_end - self.gumbel_temp_start)
        return max(temp, self.gumbel_temp_end)
    
    def compute_entropy(self, probs: torch.Tensor) -> torch.Tensor:
        """Compute entropy of probability distribution."""
        log_probs = torch.log(probs + 1e-8)
        entropy = -(probs * log_probs).sum(dim=-1).mean()
        return entropy
    
    def run_episode(self, temperature: float) -> Dict[str, Any]:
        """
        Run a single training episode.
        
        Returns dict with: reward, loss, speaker_loss, listener_loss,
        conversation record, message info.
        """
        self.speaker.train()
        self.listener.train()
        
        # Sample task from environment
        target_idx, candidates, target_features = self.env.sample_episode()
        
        # Convert to tensors
        target_tensor = torch.FloatTensor(target_features).unsqueeze(0).to(self.device)  # (1, feature_dim)
        candidates_tensor = torch.FloatTensor(candidates).unsqueeze(0).to(self.device)  # (1, num_objects, feature_dim)
        
        # Speaker produces message
        message_st, message_soft, message_indices = self.speaker(
            target_tensor, temperature=temperature, hard=False
        )  # message_st: (1, message_length, vocab_size)
        
        # Listener receives message + candidates, picks one
        selection_probs, selection_idx, attn_weights = self.listener(
            message_st.detach(), candidates_tensor
        )  # selection_probs: (1, num_objects), attn_weights: (1, msg_len, num_cands)
        
        # Compute reward using adjustable reward values
        if selection_idx.item() == target_idx:
            reward = self.reward_correct
        else:
            reward = self.reward_incorrect
        
        # REINFORCE loss for listener
        # Listener loss: negative log prob of correct action * reward
        log_probs_listener = torch.log(selection_probs + 1e-8)
        listener_loss = -log_probs_listener[0, target_idx] * reward
        
        # Speaker loss: negative log prob of message * reward
        # Use the soft message probabilities for gradient flow
        log_message_probs = torch.log(message_soft + 1e-8)  # (1, message_length, vocab_size)
        # Average log prob across message positions
        message_log_prob = log_message_probs[0].mean()
        speaker_loss = -message_log_prob * reward
        
        # Entropy bonus for exploration
        msg_entropy = self.compute_entropy(message_soft)
        sel_entropy = self.compute_entropy(selection_probs)
        
        # Separate losses with entropy bonuses (graphs are independent after detach)
        speaker_loss = speaker_loss - self.entropy_coeff * msg_entropy
        listener_loss = listener_loss - self.entropy_coeff * sel_entropy
        
        total_loss = speaker_loss.item() + listener_loss.item()
        
        # Update speaker
        self.speaker_optimizer.zero_grad()
        speaker_loss.backward()
        torch.nn.utils.clip_grad_norm_(self.speaker.parameters(), self.grad_clip)
        self.speaker_optimizer.step()
        
        # Update listener
        self.listener_optimizer.zero_grad()
        listener_loss.backward()
        torch.nn.utils.clip_grad_norm_(self.listener.parameters(), self.grad_clip)
        self.listener_optimizer.step()
        
        # Log message for analysis
        msg_indices = [int(x) for x in message_indices[0].cpu().tolist()]
        self.message_log.append((list(target_features), msg_indices))

        # --- Agent minds: capture thoughts, emotions, judgments ---
        speaker_thought_before = self.speaker_mind.think_before_speak(
            target_features=list(target_features),
            candidates=None,
            partner_id="listener",
            msg_indices=msg_indices,
        )["thought"]

        # Judge outcome for both minds
        speaker_result = self.speaker_mind.judge_conversation_outcome(
            partner_id="listener",
            correct=bool(reward > 0.5),
            message=msg_indices,
            episode=int(self.current_episode),
            target_features=list(target_features),
        )
        listener_result = self.listener_mind.judge_conversation_outcome(
            partner_id="speaker",
            correct=bool(reward > 0.5),
            message=msg_indices,
            episode=int(self.current_episode),
            target_features=list(target_features),
        )
        
        # Build conversation record
        # Extract attention weights: (1, msg_len, num_cands) -> list of lists
        attn_np = attn_weights[0].detach().cpu().tolist()
        
        conversation = {
            "episode": int(self.current_episode),
            "target_index": int(target_idx),
            "target_features": [float(round(f, 4)) for f in target_features],
            "message": msg_indices,
            "message_probs": [[float(x) for x in row] for row in message_soft[0].detach().cpu().tolist()],
            "listener_choice": int(selection_idx.item()),
            "reward": float(reward),
            "candidates_features": [[float(round(f, 4)) for f in c] for c in candidates],
            "attention_weights": [[float(round(x, 4)) for x in row] for row in attn_np],
            # Agent mind enrichments (non-NN, purely informational)
            "thought_before": speaker_thought_before,
            "thought_after": speaker_result["thought_after"],
            "speaker_emotion": speaker_result["emotion"],
            "listener_emotion": listener_result["emotion"],
            "speaker_judgment": speaker_result["judgment"],
            "listener_judgment": listener_result["judgment"],
            "personality_traits": {
                "speaker": self.speaker_mind.personality.as_dict(),
                "listener": self.listener_mind.personality.as_dict(),
            },
        }
        self.conversation_log.append(conversation)

        # Store in mind log for dedicated endpoint
        self.mind_log.append({
            "episode": int(self.current_episode),
            "speaker_thought_before": speaker_thought_before,
            "speaker_thought_after": speaker_result["thought_after"],
            "speaker_emotion": speaker_result["emotion"],
            "speaker_judgment": speaker_result["judgment"],
            "listener_thought_after": listener_result["thought_after"],
            "listener_emotion": listener_result["emotion"],
            "listener_judgment": listener_result["judgment"],
            "reward": float(reward),
        })
        
        return {
            "reward": reward,
            "loss": total_loss,
            "speaker_loss": speaker_loss.item(),
            "listener_loss": listener_loss.item(),
            "conversation": conversation,
            "message_indices": msg_indices,
            "message_probs": message_soft[0].detach().cpu().tolist(),
        }
    
    # ------------------------------------------------------------------ #
    #  IMPROVEMENT 3: Checkpoint Auto-save                               #
    # ------------------------------------------------------------------ #
    
    def _get_underlying_model(self, model: nn.Module) -> nn.Module:
        """Unwrap DataParallel wrapper to get the underlying model."""
        if isinstance(model, nn.DataParallel):
            return model.module
        return model
    
    def save_checkpoint(self, episode: int, reward: float, loss: float) -> Optional[str]:
        """
        Save a training checkpoint to data/checkpoints/{session_id}/episode_{N}.pt.
        
        Includes model state dicts, optimizer state, and metadata.
        Returns the checkpoint path, or None if no session_id.
        """
        if not self.session_id:
            logger.warning("Cannot save checkpoint: no session_id set")
            return None
        
        checkpoint_dir = os.path.join("data", "checkpoints", self.session_id)
        os.makedirs(checkpoint_dir, exist_ok=True)
        
        filename = f"episode_{episode}.pt"
        filepath = os.path.join(checkpoint_dir, filename)
        
        checkpoint = {
            "episode": episode,
            "reward": float(reward),
            "loss": float(loss),
            "timestamp": datetime.utcnow().isoformat(),
            "speaker_state_dict": self._get_underlying_model(self.speaker).state_dict(),
            "listener_state_dict": self._get_underlying_model(self.listener).state_dict(),
            "speaker_optimizer_state_dict": self.speaker_optimizer.state_dict(),
            "listener_optimizer_state_dict": self.listener_optimizer.state_dict(),
            "training_config": {
                "vocab_size": self.vocab_size,
                "message_length": self.message_length,
                "hidden_dim": self.hidden_dim,
                "feature_dim": self.feature_dim,
                "num_objects": self.num_objects,
                "learning_rate": self.learning_rate,
                "gumbel_temp_start": self.gumbel_temp_start,
                "gumbel_temp_end": self.gumbel_temp_end,
                "entropy_coeff": self.entropy_coeff,
                "game_type": self.game_type,
            },
        }
        
        torch.save(checkpoint, filepath)
        logger.info(f"Checkpoint saved: {filepath}")
        
        # Rotate: keep only the last N checkpoints
        self._rotate_checkpoints(checkpoint_dir)
        
        return filepath
    
    def _rotate_checkpoints(self, checkpoint_dir: str):
        """Delete old checkpoints, keeping only the last N."""
        pattern = os.path.join(checkpoint_dir, "episode_*.pt")
        checkpoint_files = sorted(glob.glob(pattern), key=lambda f: int(f.split("episode_")[-1].replace(".pt", "")))
        
        while len(checkpoint_files) > self.keep_last_n_checkpoints:
            old_file = checkpoint_files.pop(0)
            try:
                os.remove(old_file)
                logger.info(f"Removed old checkpoint: {old_file}")
            except OSError as e:
                logger.warning(f"Failed to remove old checkpoint {old_file}: {e}")
    
    def load_checkpoint(self, filepath: str) -> bool:
        """
        Load a training checkpoint from disk.
        
        Restores model weights, optimizer state, and training position.
        Returns True on success.
        """
        if not os.path.exists(filepath):
            logger.error(f"Checkpoint not found: {filepath}")
            return False
        
        try:
            checkpoint = torch.load(filepath, map_location=self.device_obj, weights_only=False)
            
            self._get_underlying_model(self.speaker).load_state_dict(checkpoint["speaker_state_dict"])
            self._get_underlying_model(self.listener).load_state_dict(checkpoint["listener_state_dict"])
            self.speaker_optimizer.load_state_dict(checkpoint["speaker_optimizer_state_dict"])
            self.listener_optimizer.load_state_dict(checkpoint["listener_optimizer_state_dict"])
            self.current_episode = checkpoint["episode"]
            
            logger.info(f"Loaded checkpoint from {filepath} (episode {self.current_episode})")
            return True
        except Exception as e:
            logger.error(f"Failed to load checkpoint {filepath}: {e}")
            return False
    
    # ------------------------------------------------------------------ #
    #  Training loop (IMPROVEMENT 3: checkpoint hook)                     #
    # ------------------------------------------------------------------ #
    
    async def train(
        self,
        num_episodes: int,
        log_interval: int = 10,
        progress_callback: Optional[Callable] = None,
        conversation_callback: Optional[Callable] = None,
        language_callback: Optional[Callable] = None,
        analysis_interval: int = 50,
    ) -> Dict[str, Any]:
        """
        Run the full training loop.
        
        Args:
            num_episodes: total episodes to train
            log_interval: episodes between metric logging
            progress_callback: async callback for training progress updates
            conversation_callback: async callback for new conversations
            language_callback: async callback for language metric updates
            analysis_interval: episodes between full language analysis
        """
        self.is_training = True
        self._stop_requested = False
        total_episodes = num_episodes
        
        for ep in range(num_episodes):
            if self._stop_requested:
                break
            
            self.current_episode += 1
            temperature = self.get_temperature(self.current_episode, total_episodes)
            
            # Run episode
            result = self.run_episode(temperature)
            
            # Track metrics
            self.reward_history.append(result["reward"])
            self.loss_history.append(result["loss"])
            
            # Periodic logging and callbacks
            if self.current_episode % log_interval == 0:
                avg_reward = np.mean(self.reward_history[-log_interval:])
                avg_loss = np.mean(self.loss_history[-log_interval:])
                
                # Compute language metrics periodically
                lang_metrics = self.analyzer.compute_all(
                    message_log=list(self.message_log)
                )
                
                self.vocab_size_history.append(lang_metrics["vocab_size"])
                self.compositionality_history.append(lang_metrics["compositionality"])
                self.entropy_history.append(lang_metrics["entropy"])
                
                progress_data = {
                    "episode": int(self.current_episode),
                    "reward": float(avg_reward),
                    "loss": float(avg_loss),
                    "speaker_loss": float(result["speaker_loss"]),
                    "listener_loss": float(result["listener_loss"]),
                    "gumbel_temperature": float(temperature),
                    "vocab_size": int(lang_metrics["vocab_size"]),
                    "compositionality": float(lang_metrics["compositionality"]),
                    "entropy": float(lang_metrics["entropy"]),
                }
                
                if progress_callback:
                    await progress_callback(progress_data)
            
            # Conversation callback
            if conversation_callback and self.current_episode % max(1, log_interval // 5) == 0:
                await conversation_callback(result["conversation"])
            
            # Full language analysis callback
            if language_callback and self.current_episode % analysis_interval == 0:
                lang_snapshot = self.analyzer.compute_all(
                    message_log=list(self.message_log)
                )
                await language_callback(lang_snapshot)
            
            # IMPROVEMENT 3: Auto-save checkpoint every N episodes
            if self.checkpoint_interval > 0 and self.current_episode % self.checkpoint_interval == 0:
                avg_reward_recent = float(np.mean(self.reward_history[-100:])) if self.reward_history else 0.0
                avg_loss_recent = float(np.mean(self.loss_history[-100:])) if self.loss_history else 0.0
                self.save_checkpoint(
                    episode=self.current_episode,
                    reward=avg_reward_recent,
                    loss=avg_loss_recent,
                )
            
            # Yield control to event loop periodically
            if self.current_episode % 50 == 0:
                await asyncio.sleep(0)
        
        self.is_training = False
        
        # Final metrics
        final_lang = self.analyzer.compute_all(message_log=list(self.message_log))
        
        return {
            "total_episodes": self.current_episode,
            "final_reward": np.mean(self.reward_history[-100:]) if self.reward_history else 0.0,
            "final_vocab_size": final_lang["vocab_size"],
            "final_compositionality": final_lang["compositionality"],
            "final_entropy": final_lang["entropy"],
            "language_metrics": final_lang,
        }
    
    def stop(self):
        """Request training stop."""
        self._stop_requested = True

    def adjust_params(self, params: Dict[str, Any]) -> Dict[str, Any]:
        """Adjust training parameters mid-training.

        Accepted keys (all optional):
            learning_rate, entropy_coeff, gumbel_temp_start, gumbel_temp_end,
            reward_correct, reward_incorrect, grad_clip

        Returns a dict of the parameters that were actually changed, with
        their old and new values.
        """
        changes: Dict[str, Any] = {}

        # Learning rate — update optimizer param groups
        if "learning_rate" in params and params["learning_rate"] is not None:
            old = self.learning_rate
            self.learning_rate = float(params["learning_rate"])
            for pg in self.speaker_optimizer.param_groups:
                pg["lr"] = self.learning_rate
            for pg in self.listener_optimizer.param_groups:
                pg["lr"] = self.learning_rate
            changes["learning_rate"] = {"old": old, "new": self.learning_rate}

        # Entropy coefficient
        if "entropy_coeff" in params and params["entropy_coeff"] is not None:
            old = self.entropy_coeff
            self.entropy_coeff = float(params["entropy_coeff"])
            changes["entropy_coeff"] = {"old": old, "new": self.entropy_coeff}

        # Gumbel temperature schedule
        if "gumbel_temp_start" in params and params["gumbel_temp_start"] is not None:
            old = self.gumbel_temp_start
            self.gumbel_temp_start = float(params["gumbel_temp_start"])
            changes["gumbel_temp_start"] = {"old": old, "new": self.gumbel_temp_start}

        if "gumbel_temp_end" in params and params["gumbel_temp_end"] is not None:
            old = self.gumbel_temp_end
            self.gumbel_temp_end = float(params["gumbel_temp_end"])
            changes["gumbel_temp_end"] = {"old": old, "new": self.gumbel_temp_end}

        # Reward shaping
        if "reward_correct" in params and params["reward_correct"] is not None:
            old = self.reward_correct
            self.reward_correct = float(params["reward_correct"])
            changes["reward_correct"] = {"old": old, "new": self.reward_correct}

        if "reward_incorrect" in params and params["reward_incorrect"] is not None:
            old = self.reward_incorrect
            self.reward_incorrect = float(params["reward_incorrect"])
            changes["reward_incorrect"] = {"old": old, "new": self.reward_incorrect}

        # Gradient clipping
        if "grad_clip" in params and params["grad_clip"] is not None:
            old = self.grad_clip
            self.grad_clip = float(params["grad_clip"])
            changes["grad_clip"] = {"old": old, "new": self.grad_clip}

        logger.info(f"Training parameters adjusted: {changes}")
        return changes
    
    def reset(self):
        """Reset training state."""
        self.current_episode = 0
        self.is_training = False
        self._stop_requested = False
        self.running = False
        
        # Reinitialize agents
        self.speaker = SpeakerAgent(
            feature_dim=self.feature_dim,
            vocab_size=self.vocab_size,
            message_length=self.message_length,
            hidden_dim=self.hidden_dim,
        )
        
        self.listener = ListenerAgent(
            feature_dim=self.feature_dim,
            vocab_size=self.vocab_size,
            message_length=self.message_length,
            hidden_dim=self.hidden_dim,
            num_candidates=self.num_objects,
        )
        
        # Re-apply DataParallel if needed
        if self.device_obj.type == "cuda" and torch.cuda.device_count() > 1:
            self.speaker = nn.DataParallel(self.speaker)
            self.listener = nn.DataParallel(self.listener)
        
        self.speaker = self.speaker.to(self.device_obj)
        self.listener = self.listener.to(self.device_obj)
        
        self.speaker_optimizer = optim.Adam(self.speaker.parameters(), lr=self.learning_rate)
        self.listener_optimizer = optim.Adam(self.listener.parameters(), lr=self.learning_rate)
        
        # Clear history
        self.reward_history.clear()
        self.loss_history.clear()
        self.vocab_size_history.clear()
        self.compositionality_history.clear()
        self.entropy_history.clear()
        self.message_log.clear()
        self.conversation_log.clear()

        # Re-create agent minds with fresh personalities
        self.speaker_mind = AgentMind(agent_id="speaker")
        self.listener_mind = AgentMind(agent_id="listener")
        self.mind_log.clear()
    
    def get_metrics(self) -> Dict[str, Any]:
        """Get current training metrics."""
        return {
            "current_episode": int(self.current_episode),
            "is_training": bool(self.is_training),
            "avg_reward_100": float(np.mean(self.reward_history[-100:])) if self.reward_history else 0.0,
            "avg_loss_100": float(np.mean(self.loss_history[-100:])) if self.loss_history else 0.0,
            "reward_history": [float(x) for x in self.reward_history],
            "loss_history": [float(x) for x in self.loss_history],
            "vocab_size_history": [int(x) for x in self.vocab_size_history],
            "compositionality_history": [float(x) for x in self.compositionality_history],
            "entropy_history": [float(x) for x in self.entropy_history],
            "device": self.device,
            "use_dataparallel": self.use_dataparallel,
            "checkpoint_interval": self.checkpoint_interval,
        }
    
    def get_recent_conversations(self, n: int = 50) -> List[Dict]:
        """Get most recent conversation records."""
        convos = list(self.conversation_log)
        return convos[-n:]
    
    def get_language_snapshot(self) -> Dict[str, Any]:
        """Get current language analysis snapshot."""
        return self.analyzer.compute_all(message_log=list(self.message_log))

    def get_agent_minds_data(self) -> Dict[str, Any]:
        """Get full agent minds data: personalities, states, relationships, history."""
        return {
            "speaker": self.speaker_mind.snapshot(partner_id="listener"),
            "listener": self.listener_mind.snapshot(partner_id="speaker"),
            "recent_interactions": list(self.mind_log)[-50:],
        }
    
    # ------------------------------------------------------------------ #
    #  CONTINUOUS LEARNING                                                #
    # ------------------------------------------------------------------ #

    def save_state_checkpoint(self, episode: int) -> Optional[str]:
        """Save a lightweight JSON checkpoint with full session state metadata.

        Includes symbols/vocab from message_log, conversations, metrics — but
        NOT torch model weights (use save_checkpoint() for .pt files).

        Saves to data/checkpoints/{session_id}/ep_{episode}.json.
        """
        if not self.session_id:
            logger.warning("Cannot save state checkpoint: no session_id set")
            return None

        checkpoint_dir = os.path.join("data", "checkpoints", self.session_id)
        os.makedirs(checkpoint_dir, exist_ok=True)

        filepath = os.path.join(checkpoint_dir, f"ep_{episode}.json")

        # Build vocabulary / symbol map from message_log
        vocab: Dict[str, Any] = {}
        for features, msg in list(self.message_log):
            key = str(msg)
            if key not in vocab:
                vocab[key] = {"message": msg, "count": 0, "meanings": []}
            vocab[key]["count"] += 1
            vocab[key]["meanings"].append([round(float(f), 4) for f in features])

        state = {
            "session_id": self.session_id,
            "episode": int(episode),
            "timestamp": datetime.utcnow().isoformat(),
            "training_config": {
                "vocab_size": self.vocab_size,
                "message_length": self.message_length,
                "hidden_dim": self.hidden_dim,
                "feature_dim": self.feature_dim,
                "num_objects": self.num_objects,
                "learning_rate": self.learning_rate,
                "game_type": self.game_type,
            },
            "metrics": {
                "avg_reward_recent": float(np.mean(self.reward_history[-100:])) if self.reward_history else 0.0,
                "avg_loss_recent": float(np.mean(self.loss_history[-100:])) if self.loss_history else 0.0,
                "total_reward_entries": len(self.reward_history),
                "total_loss_entries": len(self.loss_history),
                "vocab_size_history": [int(x) for x in self.vocab_size_history[-50:]],
                "compositionality_history": [float(x) for x in self.compositionality_history[-50:]],
                "entropy_history": [float(x) for x in self.entropy_history[-50:]],
            },
            "vocabulary": vocab,
            "recent_conversations": list(self.conversation_log)[-20:],
            "speaker_personality": self.speaker_mind.personality.as_dict(),
            "listener_personality": self.listener_mind.personality.as_dict(),
        }

        with open(filepath, "w") as f:
            json.dump(state, f, indent=2, default=str)

        logger.info(f"State checkpoint saved: {filepath}")
        return filepath

    async def start_continuous(
        self,
        episode_delay: float = 0.1,
        checkpoint_every: int = 50,
        callbacks: Optional[Dict[str, Callable]] = None,
    ) -> None:
        """Run training in a continuous loop until stopped.

        Args:
            episode_delay: seconds to sleep between episodes (async.sleep).
            checkpoint_every: save a JSON state checkpoint every N episodes.
            callbacks: optional dict of async callbacks:
                "progress"     — called with progress dict every 10 episodes
                "conversation" — called with conversation record every 2 episodes
                "language"     — called with language snapshot every 50 episodes
                "checkpoint"   — called with checkpoint filepath when saved
        """
        callbacks = callbacks or {}
        self.is_training = True
        self._stop_requested = False
        self.running = True
        log_interval = 10

        logger.info(
            f"Starting continuous training (delay={episode_delay}s, "
            f"checkpoint_every={checkpoint_every})"
        )

        try:
            while self.running and not self._stop_requested:
                self.current_episode += 1
                # Temperature annealed over 10 000-episode windows
                window = max(self.current_episode, 10000)
                temperature = self.get_temperature(self.current_episode, window)

                result = self.run_episode(temperature)

                self.reward_history.append(result["reward"])
                self.loss_history.append(result["loss"])

                # Periodic logging
                if self.current_episode % log_interval == 0:
                    avg_reward = float(np.mean(self.reward_history[-log_interval:]))
                    avg_loss = float(np.mean(self.loss_history[-log_interval:]))
                    lang_metrics = self.analyzer.compute_all(message_log=list(self.message_log))

                    self.vocab_size_history.append(lang_metrics["vocab_size"])
                    self.compositionality_history.append(lang_metrics["compositionality"])
                    self.entropy_history.append(lang_metrics["entropy"])

                    progress_data = {
                        "episode": int(self.current_episode),
                        "reward": avg_reward,
                        "loss": avg_loss,
                        "speaker_loss": float(result["speaker_loss"]),
                        "listener_loss": float(result["listener_loss"]),
                        "gumbel_temperature": float(temperature),
                        "vocab_size": int(lang_metrics["vocab_size"]),
                        "compositionality": float(lang_metrics["compositionality"]),
                        "entropy": float(lang_metrics["entropy"]),
                    }
                    if "progress" in callbacks:
                        await callbacks["progress"](progress_data)

                # Conversation callback
                if "conversation" in callbacks and self.current_episode % max(1, log_interval // 5) == 0:
                    await callbacks["conversation"](result["conversation"])

                # Language analysis callback
                if "language" in callbacks and self.current_episode % 50 == 0:
                    lang_snapshot = self.analyzer.compute_all(message_log=list(self.message_log))
                    await callbacks["language"](lang_snapshot)

                # JSON state checkpoint
                if checkpoint_every > 0 and self.current_episode % checkpoint_every == 0:
                    ckpt_path = self.save_state_checkpoint(self.current_episode)
                    if ckpt_path and "checkpoint" in callbacks:
                        await callbacks["checkpoint"](ckpt_path)

                # Yield to event loop
                if self.current_episode % 50 == 0:
                    await asyncio.sleep(0)

                await asyncio.sleep(episode_delay)

        finally:
            self.is_training = False
            self.running = False
            logger.info(
                f"Continuous training stopped at episode {self.current_episode}"
            )

    def stop_continuous(self) -> None:
        """Signal continuous training loop to stop."""
        self._stop_requested = True
        self.running = False

    # ------------------------------------------------------------------ #
    #  RESTORE CHECKPOINT (classmethod)                                   #
    # ------------------------------------------------------------------ #

    @classmethod
    def restore_checkpoint(
        cls,
        session_id: str,
        episode: int,
        device: Optional[str] = None,
    ) -> "TrainingLoop":
        """Reconstruct a TrainingLoop from a saved JSON state checkpoint.

        Looks for data/checkpoints/{session_id}/ep_{episode}.json.
        Returns a new TrainingLoop instance with history and config restored.

        Note: model weights are NOT restored here (use load_checkpoint for .pt
        files). This restores training config, metrics history, vocabulary,
        and recent conversations from the JSON state checkpoint.
        """
        ckpt_path = os.path.join("data", "checkpoints", session_id, f"ep_{episode}.json")
        if not os.path.exists(ckpt_path):
            raise FileNotFoundError(f"Checkpoint not found: {ckpt_path}")

        with open(ckpt_path, "r") as f:
            state = json.load(f)

        cfg = state.get("training_config", {})
        loop = cls(
            vocab_size=cfg.get("vocab_size", 20),
            message_length=cfg.get("message_length", 5),
            hidden_dim=cfg.get("hidden_dim", 128),
            feature_dim=cfg.get("feature_dim", 8),
            num_objects=cfg.get("num_objects", 10),
            learning_rate=cfg.get("learning_rate", 1e-3),
            game_type=cfg.get("game_type", "referential"),
            device=device,
            session_id=session_id,
        )

        loop.current_episode = state.get("episode", 0)

        # Restore metrics history
        metrics = state.get("metrics", {})
        loop.vocab_size_history = list(metrics.get("vocab_size_history", []))
        loop.compositionality_history = list(metrics.get("compositionality_history", []))
        loop.entropy_history = list(metrics.get("entropy_history", []))

        # Rebuild message_log from vocabulary
        for _key, entry in state.get("vocabulary", {}).items():
            msg = entry.get("message", [])
            for meaning in entry.get("meanings", [])[:entry.get("count", 1)]:
                loop.message_log.append((list(meaning), list(msg)))

        # Restore recent conversations
        for conv in state.get("recent_conversations", []):
            loop.conversation_log.append(conv)

        logger.info(f"Restored checkpoint: session={session_id}, episode={episode}")
        return loop

    # ------------------------------------------------------------------ #
    #  IMPROVEMENT 1: Export model weights and vocabulary                 #
    # ------------------------------------------------------------------ #
    
    def export_model(self, session_id: str) -> Dict[str, Any]:
        """
        Export speaker/listener model weights and vocabulary mapping.
        
        Returns a dict with the export metadata and file paths.
        """
        export_dir = os.path.join("exports", session_id)
        os.makedirs(export_dir, exist_ok=True)
        
        speaker_path = os.path.join(export_dir, "speaker.pt")
        listener_path = os.path.join(export_dir, "listener.pt")
        vocab_path = os.path.join(export_dir, "vocabulary.json")
        config_path = os.path.join(export_dir, "config.json")
        
        # Save model state dicts (unwrap DataParallel if needed)
        torch.save(self._get_underlying_model(self.speaker).state_dict(), speaker_path)
        torch.save(self._get_underlying_model(self.listener).state_dict(), listener_path)
        
        # Build vocabulary mapping: message tuple -> associated meaning
        vocab_mapping: Dict[str, Dict[str, Any]] = {}
        for features, msg in list(self.message_log):
            msg_key = str(msg)
            if msg_key not in vocab_mapping:
                vocab_mapping[msg_key] = {
                    "message": msg,
                    "meanings": [],
                    "count": 0,
                }
            vocab_mapping[msg_key]["meanings"].append(features)
            vocab_mapping[msg_key]["count"] += 1
        
        # Average meanings for each message
        for key in vocab_mapping:
            meanings = vocab_mapping[key]["meanings"]
            vocab_mapping[key]["avg_meaning"] = [
                float(np.mean([m[i] for m in meanings]))
                for i in range(len(meanings[0]))
            ]
            # Keep only summary, not all raw meanings
            del vocab_mapping[key]["meanings"]
        
        with open(vocab_path, "w") as f:
            json.dump(vocab_mapping, f, indent=2)
        
        # Save training config
        config = {
            "vocab_size": self.vocab_size,
            "message_length": self.message_length,
            "hidden_dim": self.hidden_dim,
            "feature_dim": self.feature_dim,
            "num_objects": self.num_objects,
            "learning_rate": self.learning_rate,
            "gumbel_temp_start": self.gumbel_temp_start,
            "gumbel_temp_end": self.gumbel_temp_end,
            "entropy_coeff": self.entropy_coeff,
            "game_type": self.game_type,
            "current_episode": self.current_episode,
            "device": self.device,
            "exported_at": datetime.utcnow().isoformat(),
        }
        with open(config_path, "w") as f:
            json.dump(config, f, indent=2)
        
        logger.info(f"Model exported to {export_dir}")
        
        return {
            "export_dir": export_dir,
            "speaker_weights": speaker_path,
            "listener_weights": listener_path,
            "vocabulary": vocab_path,
            "config": config_path,
            "download_url": f"/api/sessions/{session_id}/export/download",
        }


# ====================================================================== #
#  STANDALONE: Auto-conversation generator                               #
# ====================================================================== #

def generate_auto_conversation(
    speaker_agent: "SpeakerAgent",
    listener_agent: "ListenerAgent",
    env: Any,
    num_exchanges: int = 5,
    device: Optional[str] = None,
) -> Dict[str, Any]:
    """Generate a conversation between speaker and listener agents in eval mode.

    The speaker describes a random object from the environment and the listener
    interprets the message.  Repeats *num_exchanges* times with new objects.

    Args:
        speaker_agent: trained SpeakerAgent (torch model).
        listener_agent: trained ListenerAgent (torch model).
        env: environment with sample_episode() returning (target_idx, candidates, features).
        num_exchanges: number of speaker-listener exchanges to generate.
        device: torch device string. Defaults to speaker's parameter device.

    Returns:
        dict with keys:
            exchanges — list of per-exchange dicts (message, selection, reward,
                        attention_weights, speaker_probs, target features, etc.)
            summary   — aggregate stats (success_rate, unique_messages, avg_msg_entropy)
            mind_data — snapshot of internal representations if available
    """
    if device is None:
        device = str(next(speaker_agent.parameters()).device)

    speaker_agent.eval()
    listener_agent.eval()

    exchanges: List[Dict[str, Any]] = []
    unique_messages: set = set()

    with torch.no_grad():
        for i in range(num_exchanges):
            target_idx, candidates, target_features = env.sample_episode()

            target_tensor = torch.FloatTensor(target_features).unsqueeze(0).to(device)
            candidates_tensor = torch.FloatTensor(candidates).unsqueeze(0).to(device)

            # Speaker produces message (eval: temperature=0.5 for some diversity)
            message_st, message_soft, message_indices = speaker_agent(
                target_tensor, temperature=0.5, hard=False
            )

            # Listener interprets
            selection_probs, selection_idx, attn_weights = listener_agent(
                message_st, candidates_tensor
            )

            msg_indices = [int(x) for x in message_indices[0].cpu().tolist()]
            unique_messages.add(tuple(msg_indices))

            reward = 1.0 if selection_idx.item() == target_idx else 0.0

            # Compute entropy of message distribution
            msg_probs = message_soft[0].cpu()
            msg_entropy = float(-(msg_probs * torch.log(msg_probs + 1e-8)).sum(dim=-1).mean())

            exchanges.append({
                "exchange": i,
                "target_index": int(target_idx),
                "target_features": [round(float(f), 4) for f in target_features],
                "message": msg_indices,
                "message_probs": [[round(float(x), 4) for x in row] for row in message_soft[0].cpu().tolist()],
                "listener_choice": int(selection_idx.item()),
                "listener_probs": [round(float(p), 4) for p in selection_probs[0].cpu().tolist()],
                "reward": float(reward),
                "attention_weights": [[round(float(x), 4) for x in row] for row in attn_weights[0].cpu().tolist()],
                "message_entropy": round(msg_entropy, 4),
            })

    success_count = sum(1 for e in exchanges if e["reward"] > 0.5)
    avg_entropy = np.mean([e["message_entropy"] for e in exchanges]) if exchanges else 0.0

    # Mind data: extract activations / hidden states from last exchange
    mind_data: Dict[str, Any] = {}
    try:
        with torch.no_grad():
            # Re-run last target through speaker to capture internal representations
            last = exchanges[-1] if exchanges else None
            if last:
                t = torch.FloatTensor(last["target_features"]).unsqueeze(0).to(device)
                # Forward through speaker's encoder to get hidden state
                features = speaker_agent.feature_encoder(t)
                hidden = speaker_agent.hidden_layer(features)
                mind_data["speaker_hidden"] = hidden[0].cpu().tolist()
                mind_data["speaker_features_encoded"] = features[0].cpu().tolist()
    except Exception:
        mind_data = {"note": "Could not extract internal representations"}

    return {
        "exchanges": exchanges,
        "summary": {
            "num_exchanges": num_exchanges,
            "success_rate": round(success_count / max(num_exchanges, 1), 3),
            "unique_messages": len(unique_messages),
            "avg_message_entropy": round(float(avg_entropy), 4),
        },
        "mind_data": mind_data,
    }


# ====================================================================== #
#  MultiAgentSession: 3-5 agent round-robin conversations                #
# ====================================================================== #

# Conversation style templates per mode
_DEBATE_OPENERS = [
    "I disagree — let me explain why.",
    "That's one perspective, but consider this:",
    "I see it differently. My analysis shows:",
    "Let me challenge that assumption.",
    "Point taken, however I think:",
]

_COLLABORATE_OPENERS = [
    "Building on that idea, I suggest:",
    "Great point! I can add:",
    "Let's combine our approaches:",
    "I agree — and furthermore:",
    "Together we can refine this:",
]

_SOCIAL_OPENERS = [
    "Interesting! Let me share my thoughts.",
    "I've been thinking about this too:",
    "That reminds me of something:",
    "Nice observation! Here's mine:",
    "Fun topic! My take:",
]


class MultiAgentSession:
    """Multi-agent conversation session with 3-5 AgentMind instances.

    Supports round-robin conversation in three modes:
    - debate:        agents take opposing stances, argue positions
    - collaborate:   agents build on each other's ideas
    - social:        casual exchange of thoughts and observations

    Each agent has its own AgentMind (personality, memory, emotions).
    Conversations are generated textually based on agent states and
    environmental context (optional ReferentialGame/NegotiationGame).

    When an LLM backend is available (Ollama at localhost:11434 or Gemini),
    agent statements are generated by the LLM for richer, more natural
    dialogue.  Falls back to template-based generation when no LLM is
    reachable.
    """

    VALID_MODES = ("debate", "collaborate", "social")

    def __init__(
        self,
        agent_ids: Optional[List[str]] = None,
        mode: str = "collaborate",
        env: Optional[Any] = None,
    ):
        if mode not in self.VALID_MODES:
            raise ValueError(f"mode must be one of {self.VALID_MODES}, got '{mode}'")

        if agent_ids is None:
            agent_ids = ["alpha", "beta", "gamma"]

        if not (3 <= len(agent_ids) <= 5):
            raise ValueError(f"Need 3-5 agent IDs, got {len(agent_ids)}")

        self.mode = mode
        self.env = env
        self.agents: Dict[str, AgentMind] = {
            aid: AgentMind(agent_id=aid) for aid in agent_ids
        }
        self.agent_order: List[str] = list(agent_ids)
        self.conversation_history: List[Dict[str, Any]] = []
        self.round_number: int = 0

        # LLM reasoner (lazy-initialised on first use)
        self._llm_reasoner: Optional[Any] = None  # LLMReasoner | None
        self._llm_checked: bool = False

    def _get_opener_templates(self) -> List[str]:
        if self.mode == "debate":
            return _DEBATE_OPENERS
        elif self.mode == "social":
            return _SOCIAL_OPENERS
        return _COLLABORATE_OPENERS

    async def _ensure_llm_reasoner(self):
        """Lazy-initialise the LLM reasoner on first use."""
        if self._llm_checked:
            return
        self._llm_checked = True
        try:
            from agents.llm_reasoner import LLMReasoner
            self._llm_reasoner = LLMReasoner()
            backend = await self._llm_reasoner.ensure_available()
            if backend:
                logger.info("LLM reasoner available via %s", backend)
            else:
                logger.info("No LLM backend reachable; using template fallback.")
                self._llm_reasoner = None
        except Exception as exc:
            logger.debug("LLM reasoner init failed: %s", exc)
            self._llm_reasoner = None

    async def _generate_agent_statement(
        self,
        agent: AgentMind,
        context: Optional[Dict[str, Any]] = None,
        previous_statement: Optional[str] = None,
    ) -> str:
        """Generate a text statement from an agent based on its state and context.

        Tries LLM-powered generation first (Ollama / Gemini).  Falls back
        to the original template-based approach when no LLM is available.
        """
        import random as _random

        # ── attempt LLM generation ────────────────────────────────────────
        await self._ensure_llm_reasoner()

        if self._llm_reasoner is not None:
            try:
                topic = context.get("topic") if context else None
                # Build memory context for the prompt
                preferred = agent.memory.get_preferred_symbols(3)
                memory_ctx: Dict[str, Any] = {
                    "preferred_symbols": [
                        {"symbol": s, "count": c} for s, c in preferred
                    ],
                    "trust": agent.memory.get_trust("group"),
                    "success_rate": agent.memory.get_success_rate("group"),
                    "streak": agent.memory.get_streak("group"),
                }

                llm_text = await self._llm_reasoner.generate_statement(
                    agent_id=agent.agent_id,
                    personality=agent.personality.as_dict(),
                    mood=agent.emotion.current_mood,
                    memory_context=memory_ctx,
                    mode=self.mode,
                    topic=topic,
                    previous_statement=previous_statement,
                )
                if llm_text:
                    mood_emoji = agent.emotion.get_mood_emoji()
                    mood = agent.emotion.current_mood
                    return f"{mood_emoji} {agent.agent_id} [{mood}]: {llm_text}"
            except Exception as exc:
                logger.warning(
                    "LLM generation failed for %s, falling back to templates: %s",
                    agent.agent_id, exc,
                )

        # ── template fallback (original logic) ────────────────────────────
        opener = _random.choice(self._get_opener_templates())

        # Build personality-influenced body
        p = agent.personality
        mood = agent.emotion.current_mood
        mood_emoji = agent.emotion.get_mood_emoji()

        # Curious agents ask questions
        curiosity_suffix = ""
        if p.curiosity > 0.7:
            curiosity_suffix = _random.choice([
                " What do you all think?",
                " Has anyone seen something similar?",
                " I'd love to hear other perspectives.",
            ])

        # Confidence affects assertion strength
        if p.confidence > 0.7:
            confidence_phrase = _random.choice([
                " I'm quite certain about this.",
                " The evidence strongly supports this.",
                " I'm confident in this assessment.",
            ])
        elif p.confidence < 0.3:
            confidence_phrase = _random.choice([
                " Though I'm not entirely sure.",
                " This is just my initial thought.",
                " I could be wrong about this.",
            ])
        else:
            confidence_phrase = ""

        # Memory-based content
        memory_phrase = ""
        preferred = agent.memory.get_preferred_symbols(1)
        if preferred and preferred[0][1] >= 2:
            sym_id, count = preferred[0]
            memory_phrase = f" Based on my experience with symbol {sym_id} (used {count} times),"

        # Build statement
        parts = [f"{mood_emoji} {agent.agent_id} [{mood}]: {opener}"]

        if memory_phrase:
            parts.append(memory_phrase)

        # Add context-relevant content
        if context and "topic" in context:
            parts.append(f" Regarding {context['topic']},")

        if previous_statement and p.sociability > 0.5:
            parts.append(_random.choice([
                " Responding to what was just said —",
                " To build on that —",
                " That's relevant to my point —",
            ]))

        parts.append(confidence_phrase)
        parts.append(curiosity_suffix)

        return " ".join(parts).strip()

    async def run_round(
        self,
        topic: Optional[str] = None,
        include_environment: bool = False,
    ) -> List[Dict[str, Any]]:
        """Run one round of conversation: each agent speaks once in order.

        Args:
            topic: optional topic string to guide conversation.
            include_environment: if True and self.env is set, sample an
                environment episode and include it as context.

        Returns:
            List of statement dicts for this round.
        """
        self.round_number += 1
        context: Dict[str, Any] = {}
        env_data = None

        if topic:
            context["topic"] = topic

        if include_environment and self.env is not None:
            try:
                target_idx, candidates, target_features = self.env.sample_episode()
                env_data = {
                    "target_index": int(target_idx),
                    "target_features": [round(float(f), 4) for f in target_features],
                    "num_candidates": len(candidates),
                }
                context["environment"] = env_data
                if not topic:
                    context["topic"] = f"object with features {[round(float(f), 2) for f in target_features[:3]]}"
            except Exception as e:
                logger.warning(f"Could not sample environment: {e}")

        round_statements: List[Dict[str, Any]] = []
        prev_statement: Optional[str] = None

        for agent_id in self.agent_order:
            agent = self.agents[agent_id]

            statement = await self._generate_agent_statement(
                agent, context=context, previous_statement=prev_statement,
            )

            # Simulate an interaction outcome for memory/emotion updates
            # Success probability influenced by personality alignment
            success_prob = 0.4 + 0.3 * agent.personality.confidence
            simulated_success = np.random.random() < success_prob

            result = agent.judge_conversation_outcome(
                partner_id="group",
                correct=simulated_success,
                message=[np.random.randint(0, 20)],  # symbolic placeholder
                episode=self.round_number,
                target_features=env_data["target_features"] if env_data else None,
            )

            entry = {
                "round": self.round_number,
                "agent_id": agent_id,
                "statement": statement,
                "mood": agent.emotion.current_mood,
                "mood_emoji": agent.emotion.get_mood_emoji(),
                "personality": agent.personality.as_dict(),
                "dominant_trait": agent.personality.dominant_trait,
                "simulated_outcome": simulated_success,
                "emotion_state": result["emotion"],
                "judgment": result["judgment"],
                "streak": result["streak"],
            }

            if env_data:
                entry["environment_context"] = env_data

            round_statements.append(entry)
            prev_statement = statement

        self.conversation_history.extend(round_statements)
        return round_statements

    async def run_conversation(
        self,
        num_rounds: int = 3,
        topic: Optional[str] = None,
        include_environment: bool = False,
    ) -> Dict[str, Any]:
        """Run a full multi-round conversation with collaborative learning.

        Args:
            num_rounds: how many rounds of conversation.
            topic: optional topic to guide discussion.
            include_environment: sample environment as context each round.

        Returns:
            dict with 'rounds', 'summary', 'agent_states', and 'knowledge_exchange'.
        """
        all_rounds: List[List[Dict[str, Any]]] = []

        for _ in range(num_rounds):
            statements = await self.run_round(
                topic=topic,
                include_environment=include_environment,
            )
            all_rounds.append(statements)
            await asyncio.sleep(0)  # yield to event loop

        # Collaborative learning: agents share knowledge after discussion
        from agents.agent_minds import KnowledgeExchange
        kex = KnowledgeExchange()
        exchange_results = kex.collaborative_round(
            self.agents, self.conversation_history
        )

        # Persist memory banks after knowledge transfer
        for agent in self.agents.values():
            agent.memory_bank.save()

        # Build summary
        mood_counts: Dict[str, int] = {}
        for entry in self.conversation_history:
            m = entry.get("mood", "neutral")
            mood_counts[m] = mood_counts.get(m, 0) + 1

        agent_summaries = {}
        for aid, agent in self.agents.items():
            agent_summaries[aid] = {
                "personality": agent.personality.as_dict(),
                "dominant_trait": agent.personality.dominant_trait,
                "current_mood": agent.emotion.current_mood,
                "mood_emoji": agent.emotion.get_mood_emoji(),
                "energy": round(agent.emotion.energy_level, 3),
                "preferred_symbols": [
                    {"symbol": s, "count": c}
                    for s, c in agent.memory.get_preferred_symbols(3)
                ],
                "memory_bank_size": len(agent.memory_bank.all_entries()),
            }

        return {
            "mode": self.mode,
            "num_rounds": num_rounds,
            "total_statements": len(self.conversation_history),
            "rounds": all_rounds,
            "mood_distribution": mood_counts,
            "agent_summaries": agent_summaries,
            "knowledge_exchange": {
                "total_transfers": exchange_results["total_transfers"],
                "agents_affected": exchange_results["agents_affected"],
                "transfers": exchange_results["exchanges"][:10],  # limit for response size
            },
        }

    def get_conversation_text(self, last_n: Optional[int] = None) -> str:
        """Return the conversation as a formatted text string."""
        entries = self.conversation_history
        if last_n is not None:
            entries = entries[-last_n:]

        lines = [f"=== Multi-Agent Conversation (mode: {self.mode}) ===\n"]
        current_round = None
        for entry in entries:
            r = entry.get("round", 0)
            if r != current_round:
                current_round = r
                lines.append(f"\n--- Round {r} ---")
            lines.append(entry.get("statement", ""))

        return "\n".join(lines)

    def get_all_agent_states(self) -> Dict[str, Any]:
        """Return current state snapshots for all agents."""
        return {
            aid: agent.snapshot(partner_id="group")
            for aid, agent in self.agents.items()
        }

    def reset(self) -> None:
        """Reset all agent minds and conversation history."""
        for agent in self.agents.values():
            agent.memory = type(agent.memory)()
            agent.emotion = type(agent.emotion)(agent.personality)
        self.conversation_history.clear()
        self.round_number = 0

    async def close(self) -> None:
        """Shut down the LLM reasoner HTTP client (call when done)."""
        if self._llm_reasoner is not None:
            await self._llm_reasoner.close()
            self._llm_reasoner = None
            self._llm_checked = False
