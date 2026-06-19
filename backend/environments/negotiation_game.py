"""Negotiation game environment for language emergence."""

import numpy as np
from typing import Tuple, List, Dict


class NegotiationGame:
    """
    Negotiation game: two agents must agree on how to split resources.
    
    Each agent has private preferences (weights) over resources.
    They exchange messages, then each independently chooses a split.
    Reward is based on how well their choices align.
    """
    
    def __init__(
        self,
        num_objects: int = 10,
        feature_dim: int = 8,
        num_resources: int = 5,
        seed: int = None,
    ):
        self.num_objects = num_objects
        self.feature_dim = feature_dim
        self.num_resources = num_resources
        self.rng = np.random.RandomState(seed)
        
        # Generate preference vectors
        self._generate_preferences()
    
    def _generate_preferences(self):
        """Generate random preference vectors for negotiation scenarios."""
        # Each scenario has two sets of preferences and a set of resources
        self.scenarios = []
        for _ in range(500):
            # Resources available (feature vectors)
            resources = self.rng.randn(self.num_resources, self.feature_dim).astype(np.float32)
            
            # Agent 1's private preference weights over resources
            prefs_a = np.abs(self.rng.randn(self.num_resources)).astype(np.float32)
            prefs_a = prefs_a / prefs_a.sum()
            
            # Agent 2's private preference weights over resources
            prefs_b = np.abs(self.rng.randn(self.num_resources)).astype(np.float32)
            prefs_b = prefs_b / prefs_b.sum()
            
            self.scenarios.append({
                "resources": resources,
                "prefs_a": prefs_a,
                "prefs_b": prefs_b,
            })
    
    def sample_episode(self) -> Tuple[int, np.ndarray, np.ndarray]:
        """
        Sample a negotiation episode.
        
        For compatibility with the referential game interface, returns:
            target_idx: the "ideal" split index (discretized)
            candidates: resource feature vectors as candidates
            target_features: concatenated preferences + resource features
        """
        scenario = self.rng.choice(self.scenarios)
        
        resources = scenario["resources"]
        prefs_a = scenario["prefs_a"]
        prefs_b = scenario["prefs_b"]
        
        # Combine into feature vector for speaker (agent A's perspective)
        # Encode: own preferences + resource features (flattened, then pad/truncate to feature_dim)
        combined = np.concatenate([
            prefs_a,
            resources.flatten(),
        ]).astype(np.float32)
        
        # Pad or truncate to feature_dim
        if len(combined) < self.feature_dim:
            combined = np.pad(combined, (0, self.feature_dim - len(combined)))
        else:
            combined = combined[:self.feature_dim]
        
        target_features = combined
        
        # Candidates are the resources (used by listener)
        # Pad candidates to num_objects if needed
        if len(resources) < self.num_objects:
            padding = np.zeros((self.num_objects - len(resources), self.feature_dim), dtype=np.float32)
            candidates = np.vstack([resources, padding])
        else:
            candidates = resources[:self.num_objects]
        
        # Target index: the resource that best satisfies both agents
        joint_scores = prefs_a[:len(resources)] * prefs_b[:len(resources)]
        target_idx = int(np.argmax(joint_scores))
        
        return target_idx, candidates, target_features
    
    def compute_reward(
        self,
        choice_a: int,
        choice_b: int,
        scenario_idx: int = None,
    ) -> float:
        """
        Compute reward for a negotiation outcome.
        
        Reward is high when both agents choose the same resource
        that has high joint preference.
        """
        if choice_a == choice_b:
            # Agreement! Reward based on joint preference value
            scenario = self.scenarios[scenario_idx % len(self.scenarios)] if scenario_idx is not None else self.scenarios[0]
            joint_score = (
                scenario["prefs_a"][choice_a] * scenario["prefs_b"][choice_b]
            )
            return float(joint_score * self.num_resources)  # Scale up
        else:
            # Disagreement
            return 0.0
    
    def generate_structured_scenarios(self, num_scenarios: int = 200):
        """Generate structured negotiation scenarios with clear optimal splits."""
        self.scenarios = []
        for _ in range(num_scenarios):
            resources = self.rng.randn(self.num_resources, self.feature_dim).astype(np.float32)
            
            # Create scenarios where there's a clear "fair" split
            base_prefs = np.abs(self.rng.randn(self.num_resources)).astype(np.float32)
            base_prefs = base_prefs / base_prefs.sum()
            
            # Agent preferences are correlated (more realistic)
            noise_a = self.rng.randn(self.num_resources).astype(np.float32) * 0.2
            noise_b = self.rng.randn(self.num_resources).astype(np.float32) * 0.2
            
            prefs_a = np.abs(base_prefs + noise_a)
            prefs_a = prefs_a / prefs_a.sum()
            
            prefs_b = np.abs(base_prefs + noise_b)
            prefs_b = prefs_b / prefs_b.sum()
            
            self.scenarios.append({
                "resources": resources,
                "prefs_a": prefs_a,
                "prefs_b": prefs_b,
            })
