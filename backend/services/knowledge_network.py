"""Cross-session knowledge network for sharing memory bank entries.

Allows agents from different sessions to share learned symbol-meaning
mappings, vocabulary, and emergent language patterns.  Each session can
publish entries to a shared network and other sessions can subscribe /
pull knowledge from it.
"""

import os
import json
import time
import logging
from typing import Dict, List, Any, Optional
from collections import defaultdict

from agents.agent_minds import MemoryBank, AgentMind

logger = logging.getLogger(__name__)

DATA_DIR = os.path.join("data", "knowledge_network")


class KnowledgeNetwork:
    """Central registry of shared knowledge across sessions.

    Stores published memory-bank entries keyed by (session_id, agent_role).
    Other sessions can query, import, or merge entries from any peer.
    """

    def __init__(self, data_dir: str = DATA_DIR):
        self.data_dir = data_dir
        os.makedirs(self.data_dir, exist_ok=True)

        # In-memory registry:  session_id -> {role -> [entries]}
        self._registry: Dict[str, Dict[str, List[Dict[str, Any]]]] = defaultdict(
            lambda: defaultdict(list)
        )
        # Metadata per published session
        self._meta: Dict[str, Dict[str, Any]] = {}

        # Load persisted data on startup
        self._load_registry()

    # ------------------------------------------------------------------ #
    #  Persistence                                                        #
    # ------------------------------------------------------------------ #

    def _registry_path(self) -> str:
        return os.path.join(self.data_dir, "registry.json")

    def _load_registry(self) -> None:
        path = self._registry_path()
        if not os.path.exists(path):
            return
        try:
            with open(path, "r", encoding="utf-8") as f:
                data = json.load(f)
            self._meta = data.get("meta", {})
            for sid, roles in data.get("entries", {}).items():
                for role, entries in roles.items():
                    self._registry[sid][role] = entries
            logger.info(
                "KnowledgeNetwork loaded %d session(s) from disk",
                len(self._registry),
            )
        except Exception as e:
            logger.warning("Failed to load knowledge network registry: %s", e)

    def _save_registry(self) -> None:
        path = self._registry_path()
        try:
            with open(path, "w", encoding="utf-8") as f:
                json.dump(
                    {"meta": self._meta, "entries": dict(self._registry)},
                    f,
                    indent=2,
                    ensure_ascii=False,
                )
        except Exception as e:
            logger.warning("Failed to save knowledge network registry: %s", e)

    # ------------------------------------------------------------------ #
    #  Publishing  (push knowledge *from* a session)                      #
    # ------------------------------------------------------------------ #

    def publish(
        self,
        session_id: str,
        agent_id: str = "speaker",
        session_name: Optional[str] = None,
    ) -> Dict[str, Any]:
        """Publish all memory-bank entries from *agent_id* in *session_id*
        to the shared knowledge network.

        Returns a summary dict with the number of entries published.
        """
        from services.session_manager import SessionManager  # local to avoid circular

        # We expect the caller to pass the trainer directly via publish_from_trainer
        raise RuntimeError("Use publish_from_trainer() instead")

    def publish_from_trainer(
        self,
        session_id: str,
        trainer: Any,
        session_name: Optional[str] = None,
    ) -> Dict[str, Any]:
        """Publish memory-bank entries for both speaker and listener."""
        published: Dict[str, int] = {}

        for role, mind_attr in [("speaker", "speaker_mind"), ("listener", "listener_mind")]:
            mind: Optional[AgentMind] = getattr(trainer, mind_attr, None)
            if mind is None or not hasattr(mind, "memory_bank"):
                continue

            entries = mind.memory_bank.as_list()
            self._registry[session_id][role] = entries
            published[role] = len(entries)

        self._meta[session_id] = {
            "name": session_name or session_id,
            "published_at": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
            "episode": getattr(trainer, "current_episode", 0),
            "roles": list(published.keys()),
        }
        self._save_registry()

        total = sum(published.values())
        logger.info(
            "Published %d entries for session %s (%s)",
            total,
            session_id,
            published,
        )
        return {
            "session_id": session_id,
            "entries_published": published,
            "total": total,
        }

    # ------------------------------------------------------------------ #
    #  Querying  (pull knowledge *into* a session)                        #
    # ------------------------------------------------------------------ #

    def list_sessions(self) -> List[Dict[str, Any]]:
        """Return metadata for all published sessions."""
        result = []
        for sid, meta in self._meta.items():
            roles_info = {}
            for role, entries in self._registry.get(sid, {}).items():
                roles_info[role] = len(entries)
            result.append({"session_id": sid, **meta, "entry_counts": roles_info})
        return result

    def get_entries(
        self,
        session_id: str,
        role: Optional[str] = None,
        min_confidence: float = 0.0,
    ) -> List[Dict[str, Any]]:
        """Get published entries for a session, optionally filtered by role
        and minimum confidence."""
        if session_id not in self._registry:
            return []

        entries: List[Dict[str, Any]] = []
        roles = [role] if role else list(self._registry[session_id].keys())
        for r in roles:
            for e in self._registry[session_id].get(r, []):
                if e.get("confidence", 0) >= min_confidence:
                    entries.append({**e, "source_session": session_id, "source_role": r})
        return entries

    def get_all_entries(self, min_confidence: float = 0.0) -> List[Dict[str, Any]]:
        """Get all published entries across every session."""
        all_entries = []
        for sid in self._registry:
            all_entries.extend(self.get_entries(sid, min_confidence=min_confidence))
        return all_entries

    def search(self, query: str, min_confidence: float = 0.0) -> List[Dict[str, Any]]:
        """Search published entries by symbol or meaning substring."""
        q = query.lower()
        results = []
        for entry in self.get_all_entries(min_confidence=min_confidence):
            if q in entry.get("symbol", "").lower() or q in entry.get("meaning", "").lower():
                results.append(entry)
        return results

    # ------------------------------------------------------------------ #
    #  Importing  (pull entries into a target session's agents)           #
    # ------------------------------------------------------------------ #

    def import_to_session(
        self,
        target_session_id: str,
        trainer: Any,
        source_session_ids: Optional[List[str]] = None,
        min_confidence: float = 0.3,
        merge_strategy: str = "prefer_higher",
    ) -> Dict[str, Any]:
        """Import published knowledge into a target session's agents.

        Args:
            target_session_id: session receiving the knowledge.
            trainer: TrainingLoop for the target session.
            source_session_ids: list of sessions to import from (None = all).
            min_confidence: only import entries with confidence >= this.
            merge_strategy: 'prefer_higher' (default) keeps existing entry
                            when it has higher confidence; 'overwrite' always
                            replaces.

        Returns:
            Summary dict with import counts.
        """
        source_ids = source_session_ids or [
            sid for sid in self._registry if sid != target_session_id
        ]

        imported = 0
        skipped = 0
        details: List[Dict[str, Any]] = []

        for src_id in source_ids:
            entries = self.get_entries(src_id, min_confidence=min_confidence)
            for entry in entries:
                result = self._import_single_entry(
                    trainer, entry, merge_strategy
                )
                if result:
                    imported += 1
                    details.append(
                        {
                            "symbol": entry["symbol"],
                            "meaning": entry["meaning"][:60],
                            "confidence": entry["confidence"],
                            "from": src_id,
                            "action": result,
                        }
                    )
                else:
                    skipped += 1

        # Persist memory banks after bulk import
        self._save_target_memory(trainer)

        return {
            "target_session": target_session_id,
            "sources": source_ids,
            "imported": imported,
            "skipped": skipped,
            "details": details[:50],  # cap for readability
        }

    def _import_single_entry(
        self, trainer: Any, entry: Dict[str, Any], strategy: str
    ) -> Optional[str]:
        """Import one entry into speaker + listener minds. Returns action or None."""
        symbol = entry.get("symbol", "")
        meaning = entry.get("meaning", "")
        confidence = entry.get("confidence", 0.0)

        if not symbol or not meaning:
            return None

        actions = []
        for mind_attr in ("speaker_mind", "listener_mind"):
            mind: Optional[AgentMind] = getattr(trainer, mind_attr, None)
            if mind is None or not hasattr(mind, "memory_bank"):
                continue

            existing = mind.memory_bank.recall(symbol)
            if existing is None:
                mind.memory_bank.learn(symbol, meaning, confidence)
                actions.append("added")
            elif strategy == "overwrite":
                mind.memory_bank.learn(symbol, meaning, confidence)
                actions.append("overwritten")
            elif confidence > existing.get("confidence", 0):
                mind.memory_bank.learn(symbol, meaning, confidence)
                actions.append("upgraded")
            else:
                pass  # existing has higher or equal confidence

        return actions[0] if actions else None

    def _save_target_memory(self, trainer: Any) -> None:
        for mind_attr in ("speaker_mind", "listener_mind"):
            mind: Optional[AgentMind] = getattr(trainer, mind_attr, None)
            if mind and hasattr(mind, "memory_bank"):
                try:
                    mind.memory_bank.save()
                except Exception as e:
                    logger.warning("Failed to save memory bank for %s: %s", mind_attr, e)

    # ------------------------------------------------------------------ #
    #  Deletion                                                           #
    # ------------------------------------------------------------------ #

    def unpublish(self, session_id: str) -> bool:
        """Remove a session from the knowledge network."""
        if session_id not in self._registry:
            return False
        del self._registry[session_id]
        self._meta.pop(session_id, None)
        self._save_registry()
        return True

    # ------------------------------------------------------------------ #
    #  Network-wide statistics                                            #
    # ------------------------------------------------------------------ #

    def stats(self) -> Dict[str, Any]:
        """Return aggregate statistics about the knowledge network."""
        total_entries = 0
        unique_symbols: set = set()
        all_confidences: List[float] = []

        for sid, roles in self._registry.items():
            for role, entries in roles.items():
                total_entries += len(entries)
                for e in entries:
                    unique_symbols.add(e.get("symbol", ""))
                    all_confidences.append(e.get("confidence", 0))

        avg_conf = (
            round(sum(all_confidences) / len(all_confidences), 4)
            if all_confidences
            else 0.0
        )

        return {
            "total_sessions": len(self._registry),
            "total_entries": total_entries,
            "unique_symbols": len(unique_symbols),
            "avg_confidence": avg_conf,
            "sessions": list(self._meta.keys()),
        }
