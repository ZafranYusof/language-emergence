"""Language analysis tools for emergent communication."""

import numpy as np
from typing import List, Dict, Any, Tuple, Optional
from collections import Counter
from itertools import permutations


class LanguageAnalyzer:
    """
    Analyzes emergent language properties from agent communication logs.
    
    Metrics:
    - Vocabulary size: number of unique messages used
    - Compositionality: topographic similarity between meaning and message space
    - Entropy: how uniformly messages are distributed
    - Word order: positional disentanglement of symbols
    - Semantic drift: how symbol meanings change over time
    """
    
    def __init__(self, vocab_size: int = 20, message_length: int = 5):
        self.vocab_size = vocab_size
        self.message_length = message_length
        
        # History for drift tracking
        self.message_history: List[List[Tuple[List[float], List[int]]]] = []
        self._snapshot_interval = 500  # episodes between snapshots
    
    def compute_vocabulary_size(self, message_log: List[Tuple[List[float], List[int]]]) -> int:
        """Count unique messages in the log."""
        if not message_log:
            return 0
        unique_messages = set()
        for _, msg in message_log:
            unique_messages.add(tuple(msg))
        return len(unique_messages)
    
    def compute_compositionality(
        self, message_log: List[Tuple[List[float], List[int]]]
    ) -> float:
        """
        Compute topographic similarity: correlation between pairwise distances
        in meaning space and message space.
        
        High compositionality means similar meanings -> similar messages.
        Uses Spearman correlation (rank-based).
        """
        if len(message_log) < 10:
            return 0.0
        
        # Subsample for efficiency
        n = min(len(message_log), 2000)
        indices = np.random.choice(len(message_log), size=n, replace=False)
        subset = [message_log[i] for i in indices]
        
        features = np.array([item[0] for item in subset])  # (n, feature_dim)
        messages = np.array([item[1] for item in subset])  # (n, message_length)
        
        # Compute pairwise distances in meaning space (Euclidean)
        meaning_dists = []
        # Compute pairwise distances in message space (Hamming-like)
        message_dists = []
        
        # Use a sample of pairs for efficiency
        max_pairs = 5000
        pair_indices = np.random.choice(n, size=(min(max_pairs, n * (n - 1) // 2), 2), replace=True)
        
        for i, j in pair_indices:
            if i == j:
                continue
            # Meaning distance: Euclidean
            m_dist = np.linalg.norm(features[i] - features[j])
            meaning_dists.append(m_dist)
            
            # Message distance: number of differing symbols (Hamming)
            msg_dist = np.mean(messages[i] != messages[j])
            message_dists.append(msg_dist)
        
        if len(meaning_dists) < 10:
            return 0.0
        
        meaning_dists = np.array(meaning_dists)
        message_dists = np.array(message_dists)
        
        # Spearman correlation (rank-based)
        return self._spearman_correlation(meaning_dists, message_dists)
    
    def _spearman_correlation(self, x: np.ndarray, y: np.ndarray) -> float:
        """Compute Spearman rank correlation."""
        from scipy.stats import spearmanr
        try:
            corr, _ = spearmanr(x, y)
            return float(corr) if not np.isnan(corr) else 0.0
        except Exception:
            return 0.0
    
    def compute_entropy(self, message_log: List[Tuple[List[float], List[int]]]) -> float:
        """
        Compute the entropy of the message distribution.
        
        Higher entropy = more uniform usage of the message space.
        Lower entropy = concentrated use of few messages.
        """
        if not message_log:
            return 0.0
        
        # Count message frequencies
        message_counts = Counter()
        for _, msg in message_log:
            message_counts[tuple(msg)] += 1
        
        total = sum(message_counts.values())
        entropy = 0.0
        for count in message_counts.values():
            p = count / total
            if p > 0:
                entropy -= p * np.log2(p)
        
        return float(entropy)
    
    def detect_word_order(
        self, message_log: List[Tuple[List[float], List[int]]]
    ) -> float:
        """
        Detect word order via positional disentanglement.
        
        Measures how much information each symbol position independently
        encodes about the meaning. High score = positional encoding.
        """
        if len(message_log) < 20:
            return 0.0
        
        features = np.array([item[0] for item in message_log])
        messages = np.array([item[1] for item in message_log])
        
        position_scores = []
        
        for pos in range(self.message_length):
            symbols_at_pos = messages[:, pos]
            unique_symbols = np.unique(symbols_at_pos)
            
            if len(unique_symbols) < 2:
                position_scores.append(0.0)
                continue
            
            # Compute how well this position alone predicts the meaning
            # Use variance of features within each symbol group
            total_var = np.var(features, axis=0).sum()
            
            within_var = 0.0
            for sym in unique_symbols:
                mask = symbols_at_pos == sym
                if mask.sum() > 1:
                    group_var = np.var(features[mask], axis=0).sum()
                    within_var += group_var * mask.sum() / len(features)
            
            # Explained variance ratio
            if total_var > 0:
                explained = 1.0 - within_var / total_var
                position_scores.append(max(0.0, explained))
            else:
                position_scores.append(0.0)
        
        # Average across positions, weighted by information content
        return float(np.mean(position_scores)) if position_scores else 0.0
    
    def track_semantic_drift(
        self, message_log: List[Tuple[List[float], List[int]]]
    ) -> float:
        """
        Track how symbol meanings change over time.
        
        Compares early vs late message-meaning mappings.
        Returns a drift score (0 = stable, 1 = completely changed).
        """
        if len(message_log) < 100:
            return 0.0
        
        # Split into early and late halves
        mid = len(message_log) // 2
        early = message_log[:mid]
        late = message_log[mid:]
        
        # Build symbol-to-meaning mappings for each period
        early_mapping = self._build_symbol_meaning_mapping(early)
        late_mapping = self._build_symbol_meaning_mapping(late)
        
        # Compare mappings
        common_symbols = set(early_mapping.keys()) & set(late_mapping.keys())
        
        if not common_symbols:
            return 1.0  # Complete drift if no common symbols
        
        drift_scores = []
        for sym in common_symbols:
            early_mean = early_mapping[sym]
            late_mean = late_mapping[sym]
            # Distance between the mean meanings for this symbol
            dist = np.linalg.norm(np.array(early_mean) - np.array(late_mean))
            drift_scores.append(dist)
        
        # Normalize by typical inter-feature distance
        avg_drift = np.mean(drift_scores) if drift_scores else 0.0
        # Rough normalization: distances in unit sphere are typically ~1
        return float(min(avg_drift, 1.0))
    
    def _build_symbol_meaning_mapping(
        self, log: List[Tuple[List[float], List[int]]]
    ) -> Dict[int, np.ndarray]:
        """Build mapping from each symbol to its average associated meaning."""
        symbol_features: Dict[int, List[np.ndarray]] = {}
        
        for features, message in log:
            for pos, sym in enumerate(message):
                key = (pos, sym)  # Position-aware symbol
                if key not in symbol_features:
                    symbol_features[key] = []
                symbol_features[key].append(np.array(features))
        
        # Compute mean meaning for each symbol
        mapping = {}
        for key, feat_list in symbol_features.items():
            if len(feat_list) >= 3:
                mapping[key] = np.mean(feat_list, axis=0)
        
        return mapping
    
    def compute_all(
        self, message_log: List[Tuple[List[float], List[int]]]
    ) -> Dict[str, Any]:
        """Compute all language metrics."""
        vocab_size = self.compute_vocabulary_size(message_log)
        compositionality = self.compute_compositionality(message_log)
        entropy = self.compute_entropy(message_log)
        word_order = self.detect_word_order(message_log)
        semantic_drift = self.track_semantic_drift(message_log)
        
        # Message frequency distribution
        message_counts = Counter()
        symbol_usage = [0] * self.vocab_size
        for _, msg in message_log:
            message_counts[str(msg)] += 1
            for sym in msg:
                if 0 <= sym < self.vocab_size:
                    symbol_usage[sym] += 1
        
        # Top messages
        top_messages = dict(message_counts.most_common(20))
        
        return {
            "vocab_size": int(vocab_size),
            "compositionality": float(round(compositionality, 4)),
            "entropy": float(round(entropy, 4)),
            "word_order_score": float(round(word_order, 4)),
            "semantic_drift": float(round(semantic_drift, 4)),
            "unique_messages": int(vocab_size),
            "message_frequency": {str(k): int(v) for k, v in top_messages.items()},
            "symbol_usage": [int(x) for x in symbol_usage],
            "total_messages": int(len(message_log)),
        }
