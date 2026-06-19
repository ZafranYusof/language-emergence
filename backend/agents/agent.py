"""Speaker and Listener agents using PyTorch with Gumbel-Softmax communication."""

import torch
import torch.nn as nn
import torch.nn.functional as F
from typing import Tuple, Optional


class SpeakerAgent(nn.Module):
    """
    Speaker agent: encodes an observation (target object features) into a
    discrete message using Gumbel-Softmax for differentiable discrete communication.
    
    Architecture:
        observation -> MLP(2 layers, 128 hidden) -> message_logits
        message_logits -> Gumbel-Softmax -> discrete message (message_length x vocab_size)
    """
    
    def __init__(
        self,
        feature_dim: int = 8,
        vocab_size: int = 20,
        message_length: int = 5,
        hidden_dim: int = 128,
    ):
        super().__init__()
        self.feature_dim = feature_dim
        self.vocab_size = vocab_size
        self.message_length = message_length
        self.hidden_dim = hidden_dim
        
        # Encoder MLP: feature_dim -> hidden_dim -> hidden_dim
        self.encoder = nn.Sequential(
            nn.Linear(feature_dim, hidden_dim),
            nn.ReLU(),
            nn.Linear(hidden_dim, hidden_dim),
            nn.ReLU(),
        )
        
        # Output layer: hidden_dim -> message_length * vocab_size (logits for each symbol position)
        self.message_head = nn.Linear(hidden_dim, message_length * vocab_size)
        
    def forward(
        self,
        observation: torch.Tensor,
        temperature: float = 1.0,
        hard: bool = False,
    ) -> Tuple[torch.Tensor, torch.Tensor, torch.Tensor]:
        """
        Encode observation into a discrete message.
        
        Args:
            observation: (batch_size, feature_dim) tensor of target features
            temperature: Gumbel-Softmax temperature (anneal from 1.0 to 0.5)
            hard: if True, use straight-through estimator (hard discrete, soft gradients)
            
        Returns:
            message_hard: (batch_size, message_length, vocab_size) one-hot message (hard)
            message_soft: (batch_size, message_length, vocab_size) soft probabilities
            message_indices: (batch_size, message_length) argmax indices
        """
        batch_size = observation.shape[0]
        
        # Encode
        hidden = self.encoder(observation)  # (batch_size, hidden_dim)
        
        # Generate message logits
        logits = self.message_head(hidden)  # (batch_size, message_length * vocab_size)
        logits = logits.view(batch_size, self.message_length, self.vocab_size)
        
        # Gumbel-Softmax for discrete communication
        # During training: soft samples with straight-through estimator
        # During eval: hard argmax
        if self.training:
            message_soft = F.gumbel_softmax(
                logits, tau=temperature, hard=hard, dim=-1
            )  # (batch_size, message_length, vocab_size)
            # Hard version for straight-through estimator
            message_hard = F.one_hot(
                message_soft.argmax(dim=-1), num_classes=self.vocab_size
            ).float()
            # Straight-through: forward uses hard, backward uses soft gradients
            message_st = message_hard - message_soft.detach() + message_soft
        else:
            # At eval time, just use argmax
            message_indices = logits.argmax(dim=-1)  # (batch_size, message_length)
            message_hard = F.one_hot(message_indices, self.vocab_size).float()
            message_st = message_hard
            message_soft = F.softmax(logits, dim=-1)
        
        message_indices = message_st.argmax(dim=-1)  # (batch_size, message_length)
        
        return message_st, message_soft, message_indices


class ListenerAgent(nn.Module):
    """
    Listener agent: receives a message and candidate objects, produces
    a selection over candidates using cross-attention.
    
    Architecture:
        message tokens -> cross-attention over candidates -> MLP scorer
        Returns selection probabilities + attention weights for visualization.
    """
    
    def __init__(
        self,
        feature_dim: int = 8,
        vocab_size: int = 20,
        message_length: int = 5,
        hidden_dim: int = 128,
        num_candidates: int = 10,
    ):
        super().__init__()
        self.feature_dim = feature_dim
        self.vocab_size = vocab_size
        self.message_length = message_length
        self.hidden_dim = hidden_dim
        self.num_candidates = num_candidates
        
        # Per-token encoder: each message token (one-hot vocab) -> hidden
        self.token_encoder = nn.Sequential(
            nn.Linear(vocab_size, hidden_dim),
            nn.ReLU(),
            nn.Linear(hidden_dim, hidden_dim),
        )
        
        # Candidate encoder
        self.candidate_encoder = nn.Sequential(
            nn.Linear(feature_dim, hidden_dim),
            nn.ReLU(),
            nn.Linear(hidden_dim, hidden_dim),
        )
        
        # Cross-attention layers
        self.attn_query = nn.Linear(hidden_dim, hidden_dim)
        self.attn_key = nn.Linear(hidden_dim, hidden_dim)
        self.attn_value = nn.Linear(hidden_dim, hidden_dim)
        self.attn_scale = hidden_dim ** 0.5
        
        # Scorer: attended context + candidate -> score
        self.scorer = nn.Sequential(
            nn.Linear(hidden_dim * 2, hidden_dim),
            nn.ReLU(),
            nn.Linear(hidden_dim, 1),
        )
        
    def forward(
        self,
        message: torch.Tensor,
        candidates: torch.Tensor,
    ) -> Tuple[torch.Tensor, torch.Tensor, torch.Tensor]:
        """
        Select the target from candidates given the message with attention.
        
        Args:
            message: (batch_size, message_length, vocab_size) one-hot message
            candidates: (batch_size, num_candidates, feature_dim) candidate objects
            
        Returns:
            selection_probs: (batch_size, num_candidates) softmax selection
            selection_indices: (batch_size,) chosen candidate indices
            attention_weights: (batch_size, message_length, num_candidates) cross-attention
        """
        batch_size = message.shape[0]
        num_cands = candidates.shape[1]
        
        # Encode each message token: (batch, msg_len, vocab) -> (batch, msg_len, hidden)
        token_hidden = self.token_encoder(message)
        
        # Encode each candidate: (batch, num_cands, feat) -> (batch, num_cands, hidden)
        cand_hidden = self.candidate_encoder(candidates)
        
        # Cross-attention: message tokens attend to candidates
        Q = self.attn_query(token_hidden)    # (batch, msg_len, hidden)
        K = self.attn_key(cand_hidden)       # (batch, num_cands, hidden)
        V = self.attn_value(cand_hidden)     # (batch, num_cands, hidden)
        
        # Attention scores: (batch, msg_len, num_cands)
        attn_scores = torch.bmm(Q, K.transpose(1, 2)) / self.attn_scale
        attention_weights = F.softmax(attn_scores, dim=-1)
        
        # Attended context per token: (batch, msg_len, hidden)
        attended = torch.bmm(attention_weights, V)
        
        # Pool over message tokens: (batch, hidden)
        pooled = attended.mean(dim=1)
        
        # Score each candidate
        pooled_exp = pooled.unsqueeze(1).expand(-1, num_cands, -1)
        combined = torch.cat([pooled_exp, cand_hidden], dim=-1)
        scores = self.scorer(combined).squeeze(-1)
        
        selection_probs = F.softmax(scores, dim=-1)
        selection_indices = selection_probs.argmax(dim=-1)
        
        return selection_probs, selection_indices, attention_weights
