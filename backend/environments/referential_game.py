"""Referential game environment for language emergence."""

import numpy as np
from typing import Tuple, List


class ReferentialGame:
    """
    Referential game: speaker sees a target object, produces a message,
    listener sees the message plus all candidate objects and must pick the target.
    
    Each object is represented as a feature vector. Objects are sampled randomly
    with distinct feature vectors.
    """
    
    def __init__(
        self,
        num_objects: int = 10,
        feature_dim: int = 8,
        seed: int = None,
    ):
        self.num_objects = num_objects
        self.feature_dim = feature_dim
        self.rng = np.random.RandomState(seed)
        
        # Pre-generate a pool of distinct objects
        self._generate_object_pool()
    
    def _generate_object_pool(self, pool_size: int = 1000):
        """Generate a pool of distinct object feature vectors."""
        # Use orthogonal-ish random vectors with some structure
        self.object_pool = self.rng.randn(pool_size, self.feature_dim).astype(np.float32)
        # Normalize to unit vectors for cleaner geometry
        norms = np.linalg.norm(self.object_pool, axis=1, keepdims=True)
        self.object_pool = self.object_pool / (norms + 1e-8)
    
    def sample_episode(self) -> Tuple[int, np.ndarray, np.ndarray]:
        """
        Sample a single episode.
        
        Returns:
            target_idx: index of the target object within the candidates array
            candidates: (num_objects, feature_dim) array of candidate objects
            target_features: (feature_dim,) array of the target object features
        """
        # Sample distinct objects from pool
        indices = self.rng.choice(len(self.object_pool), size=self.num_objects, replace=False)
        candidates = self.object_pool[indices]  # (num_objects, feature_dim)
        
        # Pick random target
        target_idx = self.rng.randint(0, self.num_objects)
        target_features = candidates[target_idx]
        
        return target_idx, candidates, target_features
    
    def sample_batch(self, batch_size: int) -> Tuple[np.ndarray, np.ndarray, np.ndarray]:
        """
        Sample a batch of episodes.
        
        Returns:
            target_indices: (batch_size,) array of target indices
            candidates: (batch_size, num_objects, feature_dim) array
            target_features: (batch_size, feature_dim) array
        """
        target_indices = []
        all_candidates = []
        all_targets = []
        
        for _ in range(batch_size):
            t_idx, cands, target = self.sample_episode()
            target_indices.append(t_idx)
            all_candidates.append(cands)
            all_targets.append(target)
        
        return (
            np.array(target_indices),
            np.array(all_candidates),
            np.array(all_targets),
        )
    
    def generate_structured_objects(
        self, num_categories: int = 4, objects_per_category: int = 50
    ):
        """
        Generate structured objects with categorical features.
        Useful for testing compositionality.
        """
        pool = []
        for cat in range(num_categories):
            # Category is encoded in first few dimensions
            cat_vec = np.zeros(self.feature_dim, dtype=np.float32)
            cat_vec[cat % self.feature_dim] = 1.0
            
            for _ in range(objects_per_category):
                # Add noise to create variations within category
                obj = cat_vec + self.rng.randn(self.feature_dim).astype(np.float32) * 0.3
                pool.append(obj)
        
        self.object_pool = np.array(pool)
        norms = np.linalg.norm(self.object_pool, axis=1, keepdims=True)
        self.object_pool = self.object_pool / (norms + 1e-8)
