"""
Phylogenetic Engine for Language Emergence
Tracks vocabulary evolution over time like a biological family tree.
"""
import time
import uuid
import copy
from typing import Dict, List, Optional, Any, Set
from collections import defaultdict
from fastapi import APIRouter, HTTPException

router = APIRouter(prefix="/api/phylo", tags=["phylogenetic"])


# ── Data Classes ──────────────────────────────────────────────

class PhyloSnapshot:
    """Captures vocabulary state at a point in time."""
    def __init__(self, timestamp: float, vocabulary: Dict[str, Any],
                 agent_groups: Dict[str, List[str]], episode: int = 0):
        self.id: str = str(uuid.uuid4())[:8]
        self.timestamp: float = timestamp
        self.episode: int = episode
        self.vocabulary: Dict[str, Any] = vocabulary or {}
        self.agent_groups: Dict[str, List[str]] = agent_groups or {}
        self.total_symbols: int = len(self.vocabulary)
        self.children: List[str] = []
        self.parent: Optional[str] = None
        self.mutations: List[str] = []
        self.label: str = f"T{episode}"
        self.is_leaf: bool = True
        self.dialect_group: Optional[str] = None

    def to_dict(self) -> dict:
        return {
            "id": self.id,
            "timestamp": self.timestamp,
            "episode": self.episode,
            "vocabulary": self.vocabulary,
            "agent_groups": self.agent_groups,
            "total_symbols": self.total_symbols,
            "children": self.children,
            "parent": self.parent,
            "mutations": self.mutations,
            "label": self.label,
            "is_leaf": self.is_leaf,
            "dialect_group": self.dialect_group,
        }


class PhyloMutation:
    """A vocabulary change: new symbol, extinction, or meaning shift."""
    TYPES = ("new_symbol", "extinction", "meaning_change", "usage_shift", "drift")

    def __init__(self, mutation_type: str, symbol: str, details: dict,
                 timestamp: float, from_snapshot: str, to_snapshot: str):
        self.id: str = str(uuid.uuid4())[:8]
        self.type: str = mutation_type
        self.symbol: str = symbol
        self.details: dict = details
        self.timestamp: float = timestamp
        self.from_snapshot: str = from_snapshot
        self.to_snapshot: str = to_snapshot

    def to_dict(self) -> dict:
        return {
            "id": self.id,
            "type": self.type,
            "symbol": self.symbol,
            "details": self.details,
            "timestamp": self.timestamp,
            "from_snapshot": self.from_snapshot,
            "to_snapshot": self.to_snapshot,
        }


class PhyloBranch:
    """Represents a dialect split between two agent groups."""
    def __init__(self, parent_id: str, child_a_id: str, child_b_id: str,
                 split_reason: str, divergent_symbols: List[dict],
                 timestamp: float):
        self.id: str = str(uuid.uuid4())[:8]
        self.parent_id: str = parent_id
        self.child_a_id: str = child_a_id
        self.child_b_id: str = child_b_id
        self.split_reason: str = split_reason
        self.divergent_symbols: List[dict] = divergent_symbols
        self.timestamp: float = timestamp

    def to_dict(self) -> dict:
        return {
            "id": self.id,
            "parent_id": self.parent_id,
            "child_a_id": self.child_a_id,
            "child_b_id": self.child_b_id,
            "split_reason": self.split_reason,
            "divergent_symbols": self.divergent_symbols,
            "timestamp": self.timestamp,
        }


class PhyloTree:
    """Tree structure: nodes=snapshots, branches=splits, leaves=current."""
    def __init__(self, session_id: str):
        self.session_id: str = session_id
        self.snapshots: Dict[str, PhyloSnapshot] = {}
        self.mutations: List[PhyloMutation] = []
        self.branches: List[PhyloBranch] = []
        self.root_id: Optional[str] = None
        self.leaf_ids: List[str] = []
        self.created_at: float = time.time()
        self.dialect_colors: Dict[str, str] = {}

    def to_dict(self) -> dict:
        return {
            "session_id": self.session_id,
            "snapshots": {sid: s.to_dict() for sid, s in self.snapshots.items()},
            "mutations": [m.to_dict() for m in self.mutations],
            "branches": [b.to_dict() for b in self.branches],
            "root_id": self.root_id,
            "leaf_ids": self.leaf_ids,
            "created_at": self.created_at,
            "dialect_colors": self.dialect_colors,
            "stats": self.get_stats(),
        }

    def get_stats(self) -> dict:
        total_symbols = 0
        active_dialects = len(self.leaf_ids)
        if self.leaf_ids:
            for lid in self.leaf_ids:
                if lid in self.snapshots:
                    total_symbols = max(total_symbols, self.snapshots[lid].total_symbols)
        mutation_rate = len(self.mutations) / max(1, len(self.snapshots))
        return {
            "total_snapshots": len(self.snapshots),
            "total_branches": len(self.branches),
            "total_mutations": len(self.mutations),
            "total_symbols": total_symbols,
            "active_dialects": active_dialects,
            "mutation_rate": round(mutation_rate, 2),
            "tree_depth": self._tree_depth(),
        }

    def _tree_depth(self, node_id=None, depth=0) -> int:
        if node_id is None:
            node_id = self.root_id
        if not node_id or node_id not in self.snapshots:
            return depth
        snap = self.snapshots[node_id]
        if not snap.children:
            return depth
        return max(self._tree_depth(cid, depth + 1) for cid in snap.children)


# ── In-memory store ──────────────────────────────────────────

_trees: Dict[str, PhyloTree] = {}

DIALECT_COLORS = [
    "#00ff88", "#00ddff", "#ffaa00", "#ff4444",
    "#aa55ff", "#ff55aa", "#55ffaa", "#ffff55",
]


# ── Engine Functions ──────────────────────────────────────────

def capture_snapshot(session_id: str, vocabulary: dict,
                    agent_groups: dict = None, episode: int = 0) -> PhyloSnapshot:
    """Capture current vocabulary state as a phylogenetic snapshot."""
    tree = _trees.setdefault(session_id, PhyloTree(session_id))
    snap = PhyloSnapshot(
        timestamp=time.time(),
        vocabulary=vocabulary or {},
        agent_groups=agent_groups or {},
        episode=episode,
    )
    snap.label = f"T{len(tree.snapshots)}"

    if tree.leaf_ids:
        for lid in tree.leaf_ids:
            if lid in tree.snapshots:
                parent_snap = tree.snapshots[lid]
                parent_snap.children.append(snap.id)
                parent_snap.is_leaf = False
                snap.parent = lid
        for lid in tree.leaf_ids:
            if lid in tree.snapshots:
                detect_mutations(tree, tree.snapshots[lid], snap)
        detect_dialect_splits(tree, tree.leaf_ids, snap)
        tree.leaf_ids = [snap.id]
    else:
        tree.root_id = snap.id
        tree.leaf_ids = [snap.id]

    tree.snapshots[snap.id] = snap
    return snap


def detect_mutations(tree: PhyloTree, old_snap: PhyloSnapshot,
                     new_snap) -> List[PhyloMutation]:
    """Compare two snapshots and record mutations."""
    mutations = []
    old_vocab = old_snap.vocabulary
    new_vocab = new_snap.vocabulary
    old_symbols = set(old_vocab.keys())
    new_symbols = set(new_vocab.keys())

    for sym in new_symbols - old_symbols:
        m = PhyloMutation(
            "new_symbol", sym,
            {"meaning": new_vocab.get(sym, {}).get("meaning", "?"),
             "usage_count": new_vocab.get(sym, {}).get("usage_count", 0)},
            new_snap.timestamp, old_snap.id, new_snap.id
        )
        mutations.append(m)
        new_snap.mutations.append(m.id)

    for sym in old_symbols - new_symbols:
        m = PhyloMutation(
            "extinction", sym,
            {"meaning": old_vocab.get(sym, {}).get("meaning", "?"),
             "final_usage": old_vocab.get(sym, {}).get("usage_count", 0)},
            new_snap.timestamp, old_snap.id, new_snap.id
        )
        mutations.append(m)
        new_snap.mutations.append(m.id)

    for sym in old_symbols & new_symbols:
        old_meaning = old_vocab.get(sym, {}).get("meaning", "")
        new_meaning = new_vocab.get(sym, {}).get("meaning", "")
        if old_meaning != new_meaning:
            m = PhyloMutation(
                "meaning_change", sym,
                {"old_meaning": old_meaning, "new_meaning": new_meaning},
                new_snap.timestamp, old_snap.id, new_snap.id
            )
            mutations.append(m)
            new_snap.mutations.append(m.id)
        else:
            old_count = old_vocab.get(sym, {}).get("usage_count", 0)
            new_count = new_vocab.get(sym, {}).get("usage_count", 0)
            if old_count > 0 and abs(new_count - old_count) / old_count > 0.5:
                m = PhyloMutation(
                    "usage_shift", sym,
                    {"old_count": old_count, "new_count": new_count,
                     "change_pct": round((new_count - old_count) / old_count * 100, 1)},
                    new_snap.timestamp, old_snap.id, new_snap.id
                )
                mutations.append(m)
                new_snap.mutations.append(m.id)

    tree.mutations.extend(mutations)
    return mutations


def detect_dialect_splits(tree: PhyloTree, parent_ids: List[str],
                          new_snap: PhyloSnapshot):
    """Detect if two agent groups use different symbols for same meaning."""
    groups = new_snap.agent_groups
    if not groups or len(groups) < 2:
        return

    group_names = list(groups.keys())
    divergent = []
    for meaning, sym_info in new_snap.vocabulary.items():
        agents_using = sym_info.get("agents_using", [])
        if not agents_using:
            continue
        group_a_agents = set(groups.get(group_names[0], []))
        group_b_agents = set(groups.get(group_names[-1], []))
        a_uses = bool(set(agents_using) & group_a_agents)
        b_uses = bool(set(agents_using) & group_b_agents)
        if a_uses and not b_uses:
            divergent.append({"symbol": meaning, "group": group_names[0]})
        elif b_uses and not a_uses:
            divergent.append({"symbol": meaning, "group": group_names[-1]})

    if len(divergent) >= 2:
        for gn in group_names:
            if gn not in tree.dialect_colors:
                idx = len(tree.dialect_colors) % len(DIALECT_COLORS)
                tree.dialect_colors[gn] = DIALECT_COLORS[idx]
        new_snap.dialect_group = group_names[-1]

        for pid in parent_ids:
            branch = PhyloBranch(
                parent_id=pid,
                child_a_id=new_snap.id,
                child_b_id=new_snap.id,
                split_reason=f"Dialect divergence between {group_names[0]} and {group_names[-1]}",
                divergent_symbols=divergent,
                timestamp=new_snap.timestamp,
            )
            tree.branches.append(branch)


def get_tree(session_id: str) -> Optional[dict]:
    """Get full phylogenetic tree for a session."""
    tree = _trees.get(session_id)
    if not tree:
        return None
    return tree.to_dict()


def get_snapshot_at_time(session_id: str, timestamp: float) -> Optional[dict]:
    """Reconstruct vocabulary at a specific timestamp (time-travel)."""
    tree = _trees.get(session_id)
    if not tree:
        return None
    best = None
    for snap in tree.snapshots.values():
        if snap.timestamp <= timestamp:
            if best is None or snap.timestamp > best.timestamp:
                best = snap
    if best is None and tree.snapshots:
        best = min(tree.snapshots.values(), key=lambda s: s.timestamp)
    return best.to_dict() if best else None


def get_mutations(session_id: str) -> List[dict]:
    """List all vocabulary mutations for a session."""
    tree = _trees.get(session_id)
    if not tree:
        return []
    return [m.to_dict() for m in tree.mutations]


def get_dialects(session_id: str) -> dict:
    """Detect current dialect splits."""
    tree = _trees.get(session_id)
    if not tree:
        return {"dialects": [], "groups": {}}

    dialects = [b.to_dict() for b in tree.branches]
    current_groups = {}
    for lid in tree.leaf_ids:
        if lid in tree.snapshots:
            snap = tree.snapshots[lid]
            current_groups[snap.dialect_group or "default"] = {
                "snapshot_id": lid,
                "vocabulary_size": snap.total_symbols,
                "symbols": list(snap.vocabulary.keys()),
            }

    return {
        "dialects": dialects,
        "groups": current_groups,
        "colors": tree.dialect_colors,
        "num_dialects": len(current_groups),
    }


def generate_demo_tree(session_id: str) -> dict:
    """Generate a realistic demo phylogenetic tree for display."""
    import random
    random.seed(42)

    meanings = ["food", "danger", "friend", "water", "home", "light",
                 "dark", "big", "small", "fast", "slow", "good", "bad"]
    base_symbols = ["a", "b", "c", "d", "e", "f", "g", "h", "i", "j", "k", "l", "m"]
    agents = [f"agent_{i}" for i in range(6)]

    tree = PhyloTree(session_id)
    _trees[session_id] = tree

    num_snapshots = random.randint(5, 7)
    prev_snap = None

    for i in range(num_snapshots):
        vocab = {}
        for j, meaning in enumerate(meanings[:8 + min(i, 4)]):
            sym_idx = j + (i // 3)
            sym = base_symbols[sym_idx % len(base_symbols)]
            if i > 2 and j < 3 and random.random() < 0.3:
                sym = base_symbols[(sym_idx + 3) % len(base_symbols)]
            usage = random.randint(5, 100) + i * 10
            agents_using = random.sample(agents, random.randint(2, 6))
            vocab[sym] = {
                "meaning": meaning,
                "usage_count": usage,
                "agents_using": agents_using,
                "first_seen": i,
            }

        groups = {
            "alpha": agents[:3],
            "beta": agents[3:],
        } if i >= 3 else {}

        snap = PhyloSnapshot(
            timestamp=time.time() - (num_snapshots - i) * 60,
            vocabulary=vocab,
            agent_groups=groups,
            episode=i * 50,
        )
        snap.label = f"T{i}"

        if prev_snap:
            snap.parent = prev_snap.id
            prev_snap.children.append(snap.id)
            prev_snap.is_leaf = False
            detect_mutations(tree, prev_snap, snap)

            if i == 3 and groups:
                dialect_vocab = copy.deepcopy(vocab)
                for k in list(dialect_vocab.keys())[:3]:
                    old_meaning = dialect_vocab[k]["meaning"]
                    new_sym = base_symbols[(base_symbols.index(k) + 5) % len(base_symbols)]
                    dialect_vocab[new_sym] = {
                        "meaning": old_meaning,
                        "usage_count": random.randint(10, 50),
                        "agents_using": groups.get("beta", []),
                        "first_seen": i,
                    }
                    del dialect_vocab[k]

                dialect_snap = PhyloSnapshot(
                    timestamp=snap.timestamp,
                    vocabulary=dialect_vocab,
                    agent_groups=groups,
                    episode=i * 50,
                )
                dialect_snap.label = f"T{i}b"
                dialect_snap.dialect_group = "beta"
                snap.dialect_group = "alpha"
                dialect_snap.parent = prev_snap.id
                prev_snap.children.append(dialect_snap.id)
                prev_snap.is_leaf = False

                tree.dialect_colors["alpha"] = DIALECT_COLORS[0]
                tree.dialect_colors["beta"] = DIALECT_COLORS[1]

                branch = PhyloBranch(
                    parent_id=prev_snap.id,
                    child_a_id=snap.id,
                    child_b_id=dialect_snap.id,
                    split_reason="Dialect divergence: alpha vs beta agent groups",
                    divergent_symbols=[
                        {"symbol": k, "group": "alpha"} for k in list(vocab.keys())[:3]
                    ] + [
                        {"symbol": k, "group": "beta"} for k in list(dialect_vocab.keys())[:3]
                    ],
                    timestamp=snap.timestamp,
                )
                tree.branches.append(branch)
                tree.snapshots[dialect_snap.id] = dialect_snap

        if not tree.root_id:
            tree.root_id = snap.id

        tree.snapshots[snap.id] = snap
        prev_snap = snap

    tree.leaf_ids = [sid for sid, s in tree.snapshots.items() if s.is_leaf]
    return tree.to_dict()


# ── API Endpoints ─────────────────────────────────────────────

@router.get("/tree/{session_id}")
async def api_get_tree(session_id: str):
    """Get full phylogenetic tree for a session."""
    result = get_tree(session_id)
    if result is None:
        result = generate_demo_tree(session_id)
    return result


@router.get("/snapshot/{session_id}/{timestamp}")
async def api_get_snapshot(session_id: str, timestamp: float):
    """Get vocabulary state at a specific timestamp (time-travel)."""
    result = get_snapshot_at_time(session_id, timestamp)
    if result is None:
        raise HTTPException(status_code=404, detail="No snapshot found for this timestamp")
    return result


@router.post("/capture/{session_id}")
async def api_capture(session_id: str, data: dict = None):
    """Capture current vocabulary state as a new snapshot."""
    data = data or {}
    snap = capture_snapshot(
        session_id,
        vocabulary=data.get("vocabulary", {}),
        agent_groups=data.get("agent_groups", {}),
        episode=data.get("episode", 0),
    )
    return snap.to_dict()


@router.get("/mutations/{session_id}")
async def api_get_mutations(session_id: str):
    """List all vocabulary mutations for a session."""
    mutations = get_mutations(session_id)
    if not mutations:
        if session_id not in _trees:
            generate_demo_tree(session_id)
        mutations = get_mutations(session_id)
    return {"mutations": mutations, "total": len(mutations)}


@router.get("/dialects/{session_id}")
async def api_get_dialects(session_id: str):
    """Detect current dialect splits for a session."""
    result = get_dialects(session_id)
    if not result["dialects"] and session_id not in _trees:
        generate_demo_tree(session_id)
        result = get_dialects(session_id)
    return result
