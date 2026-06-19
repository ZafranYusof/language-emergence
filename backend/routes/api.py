"""API routes for the Language Emergence System."""

import asyncio
import os
import json
import logging
import zipfile
import tempfile
from datetime import datetime
from fastapi import APIRouter, HTTPException, BackgroundTasks, Query, Body
from fastapi.responses import FileResponse
from typing import Optional, List, Dict, Any

import numpy as np

logger = logging.getLogger(__name__)


class NumpyEncoder(json.JSONEncoder):
    def default(self, obj):
        if isinstance(obj, np.integer):
            return int(obj)
        if isinstance(obj, np.floating):
            return float(obj)
        if isinstance(obj, np.ndarray):
            return obj.tolist()
        return super().default(obj)


from models.schemas import (
    SessionCreate, SessionState, TrainingConfig,
    ConversationRecord, LanguageMetrics, EpisodeMetrics,
    TrainingAdjustRequest, BatchTrainRequest, BatchJobStatus,
    BatchStatusResponse,
)
from services.session_manager import SessionManager
from agents.trainer import TrainingLoop
from services.knowledge_network import KnowledgeNetwork
from agents.specialization import SessionSpecialization
from agents.social_dynamics import get_session_social_dynamics

router = APIRouter(prefix="/api")

# These will be set by main.py
session_manager: Optional[SessionManager] = None
ws_handler = None
knowledge_network = KnowledgeNetwork()


def init_router(sm: SessionManager, ws):
    """Initialize the router with dependencies."""
    global session_manager, ws_handler
    session_manager = sm
    ws_handler = ws


# ------------------------------------------------------------------ #
#  IMPROVEMENT 1: Model Export Endpoint                               #
# ------------------------------------------------------------------ #

@router.post("/sessions/{session_id}/export")
async def export_model(session_id: str):
    """
    Export speaker and listener model weights, vocabulary mapping, and
    training configuration for a session.
    """
    session = session_manager.get_session(session_id)
    if not session:
        raise HTTPException(status_code=404, detail="Session not found")
    
    trainer = session_manager.get_or_create_trainer(session_id)
    if not trainer:
        raise HTTPException(status_code=400, detail="No trainer loaded. Start a training session first (POST /train)")
    
    try:
        result = trainer.export_model(session_id)
        return {
            "status": "exported",
            "session_id": session_id,
            "export_dir": result["export_dir"],
            "download_url": result["download_url"],
            "files": {
                "speaker_weights": result["speaker_weights"],
                "listener_weights": result["listener_weights"],
                "vocabulary": result["vocabulary"],
                "config": result["config"],
            },
        }
    except Exception as e:
        logger.error(f"Export failed for session {session_id}: {e}")
        raise HTTPException(status_code=500, detail=f"Export failed: {str(e)}")


@router.get("/sessions/{session_id}/export/download")
async def download_export(session_id: str):
    """Download the exported model archive as a zip file."""
    export_dir = os.path.join("exports", session_id)
    if not os.path.isdir(export_dir):
        raise HTTPException(status_code=404, detail="No export found. Call POST /export first.")
    
    # Create a temporary zip file
    zip_path = os.path.join(export_dir, f"{session_id}_export.zip")
    try:
        with zipfile.ZipFile(zip_path, "w", zipfile.ZIP_DEFLATED) as zf:
            for fname in os.listdir(export_dir):
                fpath = os.path.join(export_dir, fname)
                if os.path.isfile(fpath) and not fname.endswith(".zip"):
                    zf.write(fpath, fname)
        
        return FileResponse(
            path=zip_path,
            filename=f"{session_id}_model_export.zip",
            media_type="application/zip",
        )
    except Exception as e:
        logger.error(f"Download zip creation failed: {e}")
        raise HTTPException(status_code=500, detail=f"Download failed: {str(e)}")


# ------------------------------------------------------------------ #
#  Session CRUD                                                       #
# ------------------------------------------------------------------ #

@router.post("/sessions", response_model=SessionState)
async def create_session(request: SessionCreate):
    """Create a new training session."""
    session = session_manager.create_session(config=request.config, name=request.name)
    
    # Create trainer for this session
    trainer = TrainingLoop(
        vocab_size=request.config.vocab_size,
        message_length=request.config.message_length,
        hidden_dim=request.config.hidden_dim,
        feature_dim=request.config.feature_dim,
        num_objects=request.config.num_objects,
        learning_rate=request.config.learning_rate,
        gumbel_temp_start=request.config.gumbel_temp_start,
        gumbel_temp_end=request.config.gumbel_temp_end,
        entropy_coeff=request.config.entropy_coeff,
        game_type=request.config.game_type.value,
        session_id=session.session_id,
    )
    session_manager.set_trainer(session.session_id, trainer)
    
    return session


@router.get("/sessions")
async def list_sessions():
    """List all sessions."""
    sessions = session_manager.list_sessions()
    return {"sessions": [s.model_dump() for s in sessions]}


@router.get("/sessions/{session_id}", response_model=SessionState)
async def get_session(session_id: str):
    """Get session state."""
    session = session_manager.get_session(session_id)
    if not session:
        raise HTTPException(status_code=404, detail="Session not found")
    return session


@router.delete("/sessions/{session_id}")
async def delete_session(session_id: str):
    """Delete a session."""
    session = session_manager.get_session(session_id)
    if not session:
        raise HTTPException(status_code=404, detail="Session not found")
    
    # Stop training if running
    trainer = session_manager.get_or_create_trainer(session_id)
    if trainer and trainer.is_training:
        trainer.stop()
        await asyncio.sleep(0.5)
    
    session_manager.delete_session(session_id)
    return {"status": "deleted", "session_id": session_id}


# ------------------------------------------------------------------ #
#  Training control                                                   #
# ------------------------------------------------------------------ #

@router.post("/sessions/{session_id}/train")
async def start_training(session_id: str, background_tasks: BackgroundTasks):
    """Start training for a session."""
    session = session_manager.get_session(session_id)
    if not session:
        raise HTTPException(status_code=404, detail="Session not found")
    
    trainer = session_manager.get_or_create_trainer(session_id)
    if not trainer:
        raise HTTPException(status_code=400, detail="No trainer loaded. Start a training session first (POST /train)")
    
    if trainer.is_training:
        raise HTTPException(status_code=400, detail="Training already in progress")
    
    session_manager.update_session(session_id, status="training")
    
    # Run training in background
    background_tasks.add_task(
        _run_training, session_id, session.config, trainer
    )
    
    return {
        "status": "training_started",
        "session_id": session_id,
        "num_episodes": session.config.num_episodes,
    }


async def _run_training(session_id: str, config: TrainingConfig, trainer: TrainingLoop):
    """Background training task with WebSocket broadcasting."""
    
    async def on_progress(data):
        session_manager.add_metrics(session_id, data)
        if ws_handler:
            await ws_handler.broadcast_training_progress(session_id, data)
    
    async def on_conversation(data):
        session_manager.add_conversation(session_id, data)
        if ws_handler:
            await ws_handler.broadcast_new_conversation(session_id, data)
    
    async def on_language(data):
        session_manager.add_language_snapshot(session_id, data)
        if ws_handler:
            await ws_handler.broadcast_language_update(session_id, data)
    
    try:
        result = await trainer.train(
            num_episodes=config.num_episodes,
            log_interval=config.log_interval,
            progress_callback=on_progress,
            conversation_callback=on_conversation,
            language_callback=on_language,
        )
        
        session_manager.update_session(
            session_id,
            status="completed",
            current_episode=trainer.current_episode,
        )
        
        if ws_handler:
            await ws_handler.broadcast_status_change(session_id, "completed")
            
    except Exception as e:
        logger.error(f"Training failed for session {session_id}: {e}")
        session_manager.update_session(session_id, status="error")
        if ws_handler:
            await ws_handler.broadcast_status_change(session_id, f"error: {str(e)}")


@router.post("/sessions/{session_id}/stop")
async def stop_training(session_id: str):
    """Stop training for a session."""
    session = session_manager.get_session(session_id)
    if not session:
        raise HTTPException(status_code=404, detail="Session not found")
    
    trainer = session_manager.get_or_create_trainer(session_id)
    if not trainer:
        raise HTTPException(status_code=400, detail="No trainer loaded. Start a training session first (POST /train)")
    
    if not trainer.is_training:
        raise HTTPException(status_code=400, detail="Training not in progress")
    
    trainer.stop()
    session_manager.update_session(session_id, status="stopped")
    
    if ws_handler:
        await ws_handler.broadcast_status_change(session_id, "stopped")
    
    return {
        "status": "training_stopped",
        "session_id": session_id,
        "current_episode": trainer.current_episode,
    }


@router.post("/sessions/{session_id}/reset")
async def reset_session(session_id: str):
    """Reset a session's training state."""
    session = session_manager.get_session(session_id)
    if not session:
        raise HTTPException(status_code=404, detail="Session not found")
    
    trainer = session_manager.get_or_create_trainer(session_id)
    if trainer:
        if trainer.is_training:
            trainer.stop()
            await asyncio.sleep(0.5)
        trainer.reset()
    
    session_manager.update_session(
        session_id, status="created", current_episode=0
    )
    
    return {"status": "reset", "session_id": session_id}


# ------------------------------------------------------------------ #
#  IMPROVEMENT 2: Session Persistence Endpoints                       #
# ------------------------------------------------------------------ #

@router.post("/sessions/{session_id}/save")
async def save_session(session_id: str):
    """Save session state to disk."""
    session = session_manager.get_session(session_id)
    if not session:
        raise HTTPException(status_code=404, detail="Session not found")
    
    filepath = session_manager.save_session(session_id)
    if not filepath:
        raise HTTPException(status_code=500, detail="Failed to save session")
    
    return {
        "status": "saved",
        "session_id": session_id,
        "filepath": filepath,
    }


@router.post("/sessions/{session_id}/load")
async def load_session(session_id: str):
    """Load session state from disk."""
    session = session_manager.load_session(session_id)
    if not session:
        raise HTTPException(status_code=404, detail="Session file not found on disk")
    
    return {
        "status": "loaded",
        "session_id": session_id,
        "session": session.model_dump(),
    }


# ------------------------------------------------------------------ #
#  Metrics & Analysis                                                 #
# ------------------------------------------------------------------ #

@router.get("/sessions/{session_id}/metrics")
async def get_metrics(session_id: str, limit: int = 1000, offset: int = 0):
    """Get training metrics timeline."""
    session = session_manager.get_session(session_id)
    if not session:
        raise HTTPException(status_code=404, detail="Session not found")
    
    trainer = session_manager.get_or_create_trainer(session_id)
    stored_metrics = session_manager.get_metrics(session_id, limit=limit, offset=offset)
    
    trainer_metrics = {}
    if trainer:
        trainer_metrics = trainer.get_metrics()
    
    import json
    sanitized_metrics = json.loads(json.dumps(stored_metrics, cls=NumpyEncoder))
    sanitized_summary = {
        "current_episode": int(trainer_metrics.get("current_episode", 0)),
        "avg_reward": float(trainer_metrics.get("avg_reward_100", 0.0)),
        "avg_loss": float(trainer_metrics.get("avg_loss_100", 0.0)),
    }
    return {
        "session_id": session_id,
        "metrics": sanitized_metrics,
        "summary": sanitized_summary,
    }


# IMPROVEMENT 4: Pagination for conversations
@router.get("/sessions/{session_id}/conversations")
async def get_conversations(
    session_id: str,
    offset: int = Query(0, ge=0, description="Number of items to skip"),
    limit: int = Query(50, ge=1, le=500, description="Max items to return (default 50, max 500)"),
):
    """
    Get agent conversations with pagination.
    
    Returns {data: [...], total: N, offset: N, limit: N}.
    """
    session = session_manager.get_session(session_id)
    if not session:
        raise HTTPException(status_code=404, detail="Session not found")
    
    total = session_manager.get_conversations_total(session_id)
    
    # Get from both stored and trainer
    trainer = session_manager.get_or_create_trainer(session_id)
    if trainer:
        # Trainer has its own log; get the full list and paginate
        all_convos = trainer.get_recent_conversations(n=total or 5000)
        convos = all_convos[offset:offset + limit]
        # Update total from trainer's actual count
        total = len(all_convos)
    else:
        convos = session_manager.get_conversations(session_id, limit=limit, offset=offset)
    
    # Sanitize numpy values
    import json
    sanitized = json.loads(json.dumps(convos, cls=NumpyEncoder))
    
    return {
        "data": sanitized,
        "total": total,
        "offset": offset,
        "limit": limit,
    }


@router.get("/sessions/{session_id}/language")
async def get_language(session_id: str):
    """Get current language analysis snapshot."""
    session = session_manager.get_session(session_id)
    if not session:
        raise HTTPException(status_code=404, detail="Session not found")
    
    trainer = session_manager.get_or_create_trainer(session_id)
    if trainer:
        snapshot = trainer.get_language_snapshot()
    else:
        snapshot = session_manager.get_latest_language(session_id) or {}
    
    # Also get historical snapshots
    history = session_manager.get_language_snapshots(session_id)
    
    import json
    sanitized_snapshot = json.loads(json.dumps(snapshot or {}, cls=NumpyEncoder))
    sanitized_history = json.loads(json.dumps(history, cls=NumpyEncoder))
    return {
        "session_id": session_id,
        "current": sanitized_snapshot,
        "history": sanitized_history,
    }


@router.get("/sessions/{session_id}/agent-minds")
async def get_agent_minds(session_id: str):
    """Get agent mind data: personalities, emotions, thoughts, judgments, and relationships."""
    session = session_manager.get_session(session_id)
    if not session:
        raise HTTPException(status_code=404, detail="Session not found")

    trainer = session_manager.get_or_create_trainer(session_id)
    if not trainer:
        raise HTTPException(status_code=400, detail="No trainer loaded. Start a training session first (POST /train)")

    try:
        minds_data = trainer.get_agent_minds_data()
        import json
        sanitized = json.loads(json.dumps(minds_data, cls=NumpyEncoder))
        return sanitized
    except Exception as e:
        logger.error(f"Failed to get agent minds for session {session_id}: {e}")
        raise HTTPException(status_code=500, detail=f"Failed to get agent minds: {str(e)}")


# ------------------------------------------------------------------ #
#  FEATURE 1: Continuous Learning Endpoints                          #
# ------------------------------------------------------------------ #

@router.post("/sessions/{session_id}/continuous/start")
async def start_continuous_training(
    session_id: str,
    background_tasks: BackgroundTasks,
    body: dict = Body(default=None),
):
    """Start continuous training loop for a session."""
    body = body or {}
    episode_delay = body.get("episode_delay", 0.1)
    checkpoint_every = body.get("checkpoint_every", 50)
    session = session_manager.get_session(session_id)
    if not session:
        raise HTTPException(status_code=404, detail="Session not found")

    trainer = session_manager.get_or_create_trainer(session_id)
    if not trainer:
        raise HTTPException(status_code=400, detail="No trainer loaded. Start a training session first (POST /train)")

    if trainer.is_training:
        raise HTTPException(status_code=400, detail="Training already in progress")

    session_manager.update_session(session_id, status="continuous_training")

    async def _run_continuous():
        async def on_progress(data):
            session_manager.add_metrics(session_id, data)
            if ws_handler:
                await ws_handler.broadcast_training_progress(session_id, data)

        async def on_conversation(data):
            session_manager.add_conversation(session_id, data)
            if ws_handler:
                await ws_handler.broadcast_new_conversation(session_id, data)

        async def on_language(data):
            session_manager.add_language_snapshot(session_id, data)
            if ws_handler:
                await ws_handler.broadcast_language_update(session_id, data)

        try:
            await trainer.start_continuous(
                episode_delay=episode_delay,
                checkpoint_every=checkpoint_every,
                callbacks={
                    "progress": on_progress,
                    "conversation": on_conversation,
                    "language": on_language,
                },
            )
            session_manager.update_session(session_id, status="completed")
            if ws_handler:
                await ws_handler.broadcast_status_change(session_id, "completed")
        except Exception as e:
            logger.error(f"Continuous training failed for session {session_id}: {e}")
            session_manager.update_session(session_id, status="error")
            if ws_handler:
                await ws_handler.broadcast_status_change(session_id, f"error: {str(e)}")

    background_tasks.add_task(_run_continuous)

    return {
        "status": "continuous_training_started",
        "session_id": session_id,
        "episode_delay": episode_delay,
        "checkpoint_every": checkpoint_every,
    }


@router.post("/sessions/{session_id}/continuous/stop")
async def stop_continuous_training(session_id: str):
    """Stop continuous training loop for a session."""
    session = session_manager.get_session(session_id)
    if not session:
        raise HTTPException(status_code=404, detail="Session not found")

    trainer = session_manager.get_or_create_trainer(session_id)
    if not trainer:
        raise HTTPException(status_code=400, detail="No trainer loaded. Start a training session first (POST /train)")

    if not trainer.is_training:
        raise HTTPException(status_code=400, detail="Continuous training not in progress")

    trainer.stop_continuous()
    session_manager.update_session(session_id, status="stopped")

    if ws_handler:
        await ws_handler.broadcast_status_change(session_id, "stopped")

    return {
        "status": "continuous_training_stopped",
        "session_id": session_id,
        "current_episode": trainer.current_episode,
    }


@router.get("/sessions/{session_id}/checkpoints")
async def list_checkpoints(session_id: str):
    """List all state checkpoints for a session."""
    session = session_manager.get_session(session_id)
    if not session:
        raise HTTPException(status_code=404, detail="Session not found")

    checkpoint_dir = os.path.join("data", "checkpoints", session_id)
    if not os.path.isdir(checkpoint_dir):
        return {"session_id": session_id, "checkpoints": []}

    checkpoints = []
    for fname in sorted(os.listdir(checkpoint_dir)):
        if fname.startswith("ep_") and fname.endswith(".json"):
            fpath = os.path.join(checkpoint_dir, fname)
            try:
                with open(fpath, "r") as f:
                    data = json.load(f)
                checkpoints.append({
                    "episode": data.get("episode"),
                    "timestamp": data.get("timestamp"),
                    "file": fname,
                    "size_bytes": os.path.getsize(fpath),
                })
            except Exception as e:
                logger.warning(f"Failed to read checkpoint {fname}: {e}")

    return {"session_id": session_id, "checkpoints": checkpoints}


@router.post("/sessions/{session_id}/checkpoints/{episode}/restore")
async def restore_checkpoint(session_id: str, episode: int):
    """Restore training state from a checkpoint."""
    session = session_manager.get_session(session_id)
    if not session:
        raise HTTPException(status_code=404, detail="Session not found")

    checkpoint_dir = os.path.join("data", "checkpoints", session_id)
    checkpoint_file = os.path.join(checkpoint_dir, f"ep_{episode}.json")

    if not os.path.exists(checkpoint_file):
        raise HTTPException(status_code=404, detail=f"Checkpoint ep_{episode} not found")

    try:
        from agents.trainer import TrainingLoop
        restored_trainer = TrainingLoop.restore_checkpoint(session_id, episode)
        if restored_trainer is None:
            raise HTTPException(status_code=500, detail="Failed to restore checkpoint")

        session_manager.set_trainer(session_id, restored_trainer)
        session_manager.update_session(
            session_id,
            status="restored",
            current_episode=restored_trainer.current_episode,
        )

        return {
            "status": "restored",
            "session_id": session_id,
            "episode": episode,
            "current_episode": restored_trainer.current_episode,
        }
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Failed to restore checkpoint for session {session_id}: {e}")
        raise HTTPException(status_code=500, detail=f"Restore failed: {str(e)}")


# ------------------------------------------------------------------ #
#  FEATURE 2: Agent-to-Agent Chat Endpoints                          #
# ------------------------------------------------------------------ #

@router.post("/sessions/{session_id}/auto-chat")
async def start_auto_chat(session_id: str, body: dict = Body(default=None)):
    """Run agent-to-agent auto-conversations."""
    body = body or {}
    num_exchanges = body.get("num_exchanges", 5)
    rounds = body.get("rounds", 10)
    session = session_manager.get_session(session_id)
    if not session:
        raise HTTPException(status_code=404, detail="Session not found")

    trainer = session_manager.get_or_create_trainer(session_id)
    if not trainer:
        raise HTTPException(status_code=400, detail="No trainer loaded. Start a training session first (POST /train)")

    try:
        from agents.trainer import generate_auto_conversation

        all_conversations = []
        for r in range(rounds):
            conversation = generate_auto_conversation(
                speaker_agent=trainer.speaker,
                listener_agent=trainer.listener,
                env=trainer.env,
                num_exchanges=num_exchanges,
                device=trainer.device,
            )
            conversation["round"] = r
            conversation["speaker_mind"] = trainer.speaker_mind.snapshot(partner_id="listener")
            conversation["listener_mind"] = trainer.listener_mind.snapshot(partner_id="speaker")
            all_conversations.append(conversation)

            session_manager.add_conversation(session_id, {
                "type": "auto_chat",
                "round": r,
                "data": conversation,
            })

        import json
        sanitized = json.loads(json.dumps(all_conversations, cls=NumpyEncoder))
        return {
            "status": "completed",
            "session_id": session_id,
            "rounds": rounds,
            "num_exchanges": num_exchanges,
            "conversations": sanitized,
        }
    except Exception as e:
        logger.error(f"Auto-chat failed for session {session_id}: {e}")
        raise HTTPException(status_code=500, detail=f"Auto-chat failed: {str(e)}")


# ------------------------------------------------------------------ #
#  FEATURE 3: Agent Learning Memory Endpoints                        #
# ------------------------------------------------------------------ #

@router.get("/sessions/{session_id}/memory")
async def get_agent_memory(session_id: str):
    """Get memory bank data for all agents in a session."""
    session = session_manager.get_session(session_id)
    if not session:
        raise HTTPException(status_code=404, detail="Session not found")

    trainer = session_manager.get_or_create_trainer(session_id)
    if not trainer:
        raise HTTPException(status_code=400, detail="No trainer loaded. Start a training session first (POST /train)")

    try:
        memory_data = {}
        if hasattr(trainer.speaker_mind, "memory_bank"):
            memory_data["speaker"] = trainer.speaker_mind.memory_bank.as_list()
        if hasattr(trainer.listener_mind, "memory_bank"):
            memory_data["listener"] = trainer.listener_mind.memory_bank.as_list()

        return {
            "session_id": session_id,
            "memory": memory_data,
        }
    except Exception as e:
        logger.error(f"Failed to get memory for session {session_id}: {e}")
        raise HTTPException(status_code=500, detail=f"Failed to get memory: {str(e)}")


@router.post("/sessions/{session_id}/memory")
async def add_memory(session_id: str, body: dict = Body(default=None)):
    """Add a memory entry for an agent."""
    session = session_manager.get_session(session_id)
    if not session:
        raise HTTPException(status_code=404, detail="Session not found")
    body = body or {}
    content_text = body.get("content", "")
    agent_id = body.get("agent_id", "speaker")
    memory_type = body.get("type", "observation")
    if not content_text:
        raise HTTPException(status_code=400, detail="'content' is required")
    try:
        trainer = session_manager.get_or_create_trainer(session_id)
        if not trainer:
            return {"status": "added", "content": content_text, "agent_id": agent_id, "note": "no trainer"}
        agent = trainer.speaker_mind if agent_id == "speaker" else trainer.listener_mind
        if hasattr(agent, "memory_bank"):
            agent.memory_bank.learn(content_text, memory_type, confidence=0.5)
            return {"status": "added", "content": content_text, "agent_id": agent_id}
        return {"status": "added", "content": content_text, "agent_id": agent_id}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/sessions/{session_id}/memory/learn")
async def learn_memory(
    session_id: str,
    body: dict = Body(default=None),
):
    """Teach an agent a new symbol-meaning mapping."""
    body = body or {}
    agent_id = body.get("agent_id", "speaker")
    symbol = body.get("symbol", "")
    meaning = body.get("meaning", "")
    confidence = body.get("confidence", 0.5)
    session = session_manager.get_session(session_id)
    if not session:
        raise HTTPException(status_code=404, detail="Session not found")

    trainer = session_manager.get_or_create_trainer(session_id)
    if not trainer:
        raise HTTPException(status_code=400, detail="No trainer loaded. Start a training session first (POST /train)")

    if not symbol or not meaning:
        raise HTTPException(status_code=400, detail="Both 'symbol' and 'meaning' are required")

    try:
        mind = trainer.speaker_mind if agent_id == "speaker" else trainer.listener_mind
        if not hasattr(mind, "memory_bank"):
            raise HTTPException(status_code=400, detail="Memory bank not available")

        mind.memory_bank.learn(symbol, meaning, max(0.0, min(1.0, confidence)))
        mind.memory_bank.save()

        return {
            "status": "learned",
            "session_id": session_id,
            "agent_id": agent_id,
            "symbol": symbol,
            "meaning": meaning,
            "confidence": confidence,
            "recall": mind.memory_bank.recall(symbol),
        }
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Failed to learn memory for session {session_id}: {e}")
        raise HTTPException(status_code=500, detail=f"Learn failed: {str(e)}")


# ------------------------------------------------------------------ #
#  FEATURE 5: Multi-Agent Group Chat Endpoints                       #
# ------------------------------------------------------------------ #

_multi_agent_sessions: dict = {}


@router.post("/sessions/{session_id}/multi-agent/start")
async def start_multi_agent_chat(
    session_id: str,
    body: dict = Body(default=None),
):
    """Start a multi-agent group chat."""
    body = body or {}
    agents = body.get("agents", ["speaker", "listener", "observer"])
    mode = body.get("mode", "collaborate")
    topic = body.get("topic", "language emergence")
    num_rounds = body.get("num_rounds", 5)
    session = session_manager.get_session(session_id)
    if not session:
        raise HTTPException(status_code=404, detail="Session not found")

    if not (3 <= len(agents) <= 5):
        raise HTTPException(status_code=400, detail="Need 3-5 agent IDs")

    if mode not in ("debate", "collaborate", "social"):
        raise HTTPException(status_code=400, detail="Mode must be debate, collaborate, or social")

    try:
        from agents.trainer import MultiAgentSession

        trainer = session_manager.get_or_create_trainer(session_id)
        env = trainer.env if trainer else None

        multi_session = MultiAgentSession(
            agent_ids=agents,
            mode=mode,
            env=env,
        )

        result = await multi_session.run_conversation(
            num_rounds=num_rounds,
            topic=topic,
            include_environment=(env is not None),
        )

        _multi_agent_sessions[session_id] = multi_session

        session_manager.add_conversation(session_id, {
            "type": "multi_agent",
            "mode": mode,
            "topic": topic,
            "data": result,
        })

        import json
        sanitized = json.loads(json.dumps(result, cls=NumpyEncoder))
        return sanitized
    except Exception as e:
        logger.error(f"Multi-agent chat failed for session {session_id}: {e}")
        raise HTTPException(status_code=500, detail=f"Multi-agent chat failed: {str(e)}")


@router.post("/sessions/{session_id}/multi-agent/stop")
async def stop_multi_agent_chat(session_id: str):
    """Stop and clean up a multi-agent session."""
    multi_session = _multi_agent_sessions.pop(session_id, None)
    if not multi_session:
        raise HTTPException(status_code=404, detail="No active multi-agent session")

    # Clean up LLM reasoner HTTP client
    await multi_session.close()

    return {
        "status": "stopped",
        "session_id": session_id,
        "total_statements": len(multi_session.conversation_history),
        "conversation_text": multi_session.get_conversation_text(),
    }


@router.post("/sessions/{session_id}/collaborative-learn")
async def collaborative_learn(
    session_id: str,
    body: dict = Body(default=None),
):
    """Run collaborative learning between agents.
    
    Agents share knowledge from their memory banks with each other,
    based on trust and relevance. No conversation needed — direct
    knowledge transfer between all agents in the session.
    """
    body = body or {}
    rounds = body.get("rounds", 1)  # number of knowledge exchange rounds
    
    session = session_manager.get_session(session_id)
    if not session:
        raise HTTPException(status_code=404, detail="Session not found")
    
    trainer = session_manager.get_or_create_trainer(session_id)
    if not trainer:
        raise HTTPException(status_code=500, detail="Could not create trainer")
    
    from agents.agent_minds import AgentMind, KnowledgeExchange
    
    # Create agent minds from trainer's speaker/listener
    speaker_mind = AgentMind("speaker")
    listener_mind = AgentMind("listener")
    
    # Give them personality based on trainer state
    if hasattr(trainer, 'speaker') and hasattr(trainer.speaker, 'parameters'):
        # Neural network agents exist — use their actual weights for personality hints
        speaker_mind.personality.curiosity = min(1.0, trainer.current_episode / 1000)
        listener_mind.personality.confidence = min(1.0, trainer.current_episode / 1500)
    
    agents = {
        "speaker": speaker_mind,
        "listener": listener_mind,
    }
    
    kex = KnowledgeExchange()
    
    all_results = []
    for _ in range(rounds):
        # Generate synthetic conversation from agent memories
        synthetic_history = []
        for sym, info in speaker_mind.memory_bank.all_entries().items():
            synthetic_history.append({
                "agent_id": "speaker",
                "statement": f"I've been using symbol '{sym}' to mean '{info['meaning']}' with confidence {info['confidence']:.2f}",
                "mood": "focused",
                "personality": {"confidence": info["confidence"]},
            })
        for sym, info in listener_mind.memory_bank.all_entries().items():
            synthetic_history.append({
                "agent_id": "listener",
                "statement": f"I recognize '{sym}' as '{info['meaning']}' with confidence {info['confidence']:.2f}",
                "mood": "neutral",
                "personality": {"confidence": info["confidence"]},
            })
        
        result = kex.collaborative_round(agents, synthetic_history)
        all_results.append(result)
    
    # Save memory banks
    speaker_mind.memory_bank.save()
    listener_mind.memory_bank.save()
    
    return {
        "status": "collaborative_learning_complete",
        "session_id": session_id,
        "rounds": rounds,
        "total_transfers": sum(r["total_transfers"] for r in all_results),
        "results": all_results,
        "speaker_memory": speaker_mind.memory_bank.as_list()[:10],
        "listener_memory": listener_mind.memory_bank.as_list()[:10],
    }


# ------------------------------------------------------------------ #
#  FEATURE: Interactive Training Adjust                                #
# ------------------------------------------------------------------ #

@router.post("/sessions/{session_id}/train/adjust")
async def adjust_training_params(session_id: str, request: TrainingAdjustRequest):
    """Adjust training parameters mid-training.
    
    Allows changing learning rate, entropy coefficient, Gumbel temperature
    schedule, reward shaping, and gradient clipping on a running trainer.
    Works whether training is in progress or paused.
    """
    session = session_manager.get_session(session_id)
    if not session:
        raise HTTPException(status_code=404, detail="Session not found")

    trainer = session_manager.get_or_create_trainer(session_id)
    if not trainer:
        raise HTTPException(status_code=400, detail="No trainer loaded. Create a session first.")

    params = request.model_dump(exclude_none=True)
    if not params:
        raise HTTPException(status_code=400, detail="No parameters provided to adjust")

    try:
        changes = trainer.adjust_params(params)
        return {
            "status": "adjusted",
            "session_id": session_id,
            "current_episode": trainer.current_episode,
            "is_training": trainer.is_training,
            "changes": changes,
        }
    except Exception as e:
        logger.error(f"Failed to adjust params for session {session_id}: {e}")
        raise HTTPException(status_code=500, detail=f"Adjust failed: {str(e)}")


# ------------------------------------------------------------------ #
#  FEATURE: Batch Training                                             #
# ------------------------------------------------------------------ #

# In-memory store for batch job tracking
_batch_jobs: Dict[str, Dict[str, Any]] = {}


@router.post("/batch/train")
async def start_batch_training(
    request: BatchTrainRequest,
    background_tasks: BackgroundTasks,
):
    """Start multiple training sessions in parallel with different configs.
    
    Each job in the request can reference an existing session or create a new one.
    All sessions start training concurrently as background tasks.
    """
    import uuid as _uuid

    batch_id = str(_uuid.uuid4())[:8]
    jobs: Dict[str, Any] = {}

    for idx, item in enumerate(request.jobs):
        batch_job_id = f"{batch_id}-{idx}"

        # Get or create session
        if item.session_id:
            session = session_manager.get_session(item.session_id)
            if not session:
                jobs[batch_job_id] = {
                    "batch_job_id": batch_job_id,
                    "session_id": item.session_id,
                    "status": "error",
                    "error": f"Session {item.session_id} not found",
                    "num_episodes": item.config.num_episodes,
                }
                continue
            session_id = item.session_id
        else:
            session = session_manager.create_session(
                config=item.config,
                name=item.name or f"Batch {batch_id} job {idx}",
            )
            session_id = session.session_id

            # Create trainer for the new session
            trainer = TrainingLoop(
                vocab_size=item.config.vocab_size,
                message_length=item.config.message_length,
                hidden_dim=item.config.hidden_dim,
                feature_dim=item.config.feature_dim,
                num_objects=item.config.num_objects,
                learning_rate=item.config.learning_rate,
                gumbel_temp_start=item.config.gumbel_temp_start,
                gumbel_temp_end=item.config.gumbel_temp_end,
                entropy_coeff=item.config.entropy_coeff,
                game_type=item.config.game_type.value,
                session_id=session_id,
            )
            session_manager.set_trainer(session_id, trainer)

        # Check if training is already in progress
        existing_trainer = session_manager.get_or_create_trainer(session_id)
        if existing_trainer and existing_trainer.is_training:
            jobs[batch_job_id] = {
                "batch_job_id": batch_job_id,
                "session_id": session_id,
                "status": "error",
                "error": "Training already in progress for this session",
                "num_episodes": item.config.num_episodes,
            }
            continue

        job_info = {
            "batch_job_id": batch_job_id,
            "session_id": session_id,
            "status": "started",
            "num_episodes": item.config.num_episodes,
            "started_at": datetime.utcnow().isoformat(),
            "error": None,
        }
        jobs[batch_job_id] = job_info

        # Launch background training
        trainer_for_task = session_manager.get_or_create_trainer(session_id)
        config_for_task = item.config
        background_tasks.add_task(
            _run_batch_training, batch_id, batch_job_id, session_id, config_for_task, trainer_for_task
        )

    _batch_jobs[batch_id] = {"jobs": jobs, "created_at": datetime.utcnow().isoformat()}

    return {
        "status": "batch_started",
        "batch_id": batch_id,
        "total_jobs": len(jobs),
        "jobs": list(jobs.values()),
    }


async def _run_batch_training(
    batch_id: str,
    batch_job_id: str,
    session_id: str,
    config: TrainingConfig,
    trainer: TrainingLoop,
):
    """Background task for a single batch training job."""

    async def on_progress(data):
        session_manager.add_metrics(session_id, data)
        if ws_handler:
            await ws_handler.broadcast_training_progress(session_id, data)

    async def on_conversation(data):
        session_manager.add_conversation(session_id, data)
        if ws_handler:
            await ws_handler.broadcast_new_conversation(session_id, data)

    async def on_language(data):
        session_manager.add_language_snapshot(session_id, data)
        if ws_handler:
            await ws_handler.broadcast_language_update(session_id, data)

    _batch_jobs[batch_id]["jobs"][batch_job_id]["status"] = "training"
    session_manager.update_session(session_id, status="training")

    try:
        result = await trainer.train(
            num_episodes=config.num_episodes,
            log_interval=config.log_interval,
            progress_callback=on_progress,
            conversation_callback=on_conversation,
            language_callback=on_language,
        )

        _batch_jobs[batch_id]["jobs"][batch_job_id]["status"] = "completed"
        _batch_jobs[batch_id]["jobs"][batch_job_id]["current_episode"] = trainer.current_episode
        session_manager.update_session(
            session_id, status="completed", current_episode=trainer.current_episode
        )

        if ws_handler:
            await ws_handler.broadcast_status_change(session_id, "completed")

    except Exception as e:
        logger.error(f"Batch training failed for job {batch_job_id}, session {session_id}: {e}")
        _batch_jobs[batch_id]["jobs"][batch_job_id]["status"] = "error"
        _batch_jobs[batch_id]["jobs"][batch_job_id]["error"] = str(e)
        session_manager.update_session(session_id, status="error")

        if ws_handler:
            await ws_handler.broadcast_status_change(session_id, f"error: {str(e)}")


@router.get("/batch/status")
async def get_batch_status(batch_id: Optional[str] = Query(None, description="Specific batch ID; omit for all")):
    """Check status of batch training jobs.
    
    If batch_id is provided, returns status for that specific batch.
    Otherwise returns a summary of all batches.
    """
    if batch_id:
        batch = _batch_jobs.get(batch_id)
        if not batch:
            raise HTTPException(status_code=404, detail=f"Batch {batch_id} not found")

        job_list = []
        for jid, info in batch["jobs"].items():
            # Enrich with live trainer data
            trainer = session_manager.get_or_create_trainer(info["session_id"])
            current_ep = trainer.current_episode if trainer else info.get("current_episode", 0)
            job_list.append(BatchJobStatus(
                batch_job_id=info["batch_job_id"],
                session_id=info["session_id"],
                status=info["status"],
                current_episode=current_ep,
                num_episodes=info.get("num_episodes", 0),
                started_at=info.get("started_at"),
                error=info.get("error"),
            ))

        completed = sum(1 for j in job_list if j.status == "completed")
        running = sum(1 for j in job_list if j.status in ("started", "training"))
        errors = sum(1 for j in job_list if j.status == "error")

        return BatchStatusResponse(
            batch_id=batch_id,
            jobs=job_list,
            total=len(job_list),
            completed=completed,
            running=running,
            errors=errors,
        ).model_dump()
    else:
        # Return summary of all batches
        all_batches = []
        for bid, batch in _batch_jobs.items():
            statuses = [j.get("status", "unknown") for j in batch["jobs"].values()]
            all_batches.append({
                "batch_id": bid,
                "total_jobs": len(batch["jobs"]),
                "completed": sum(1 for s in statuses if s == "completed"),
                "running": sum(1 for s in statuses if s in ("started", "training")),
                "errors": sum(1 for s in statuses if s == "error"),
                "created_at": batch.get("created_at"),
            })

        return {
            "batches": all_batches,
            "total_batches": len(all_batches),
        }


# ------------------------------------------------------------------ #
#  FEATURE 6: Cross-Session Knowledge Network                        #
# ------------------------------------------------------------------ #

@router.post("/knowledge/publish/{session_id}")
async def publish_knowledge(session_id: str, body: dict = Body(default=None)):
    """Publish a session's memory-bank entries to the cross-session knowledge network."""
    body = body or {}
    session_name = body.get("session_name")

    session = session_manager.get_session(session_id)
    if not session:
        raise HTTPException(status_code=404, detail="Session not found")

    trainer = session_manager.get_or_create_trainer(session_id)
    if not trainer:
        raise HTTPException(status_code=400, detail="No trainer loaded for this session")

    try:
        result = knowledge_network.publish_from_trainer(
            session_id, trainer, session_name=session_name or session.name,
        )
        return {"status": "published", **result}
    except Exception as e:
        logger.error(f"Failed to publish knowledge for {session_id}: {e}")
        raise HTTPException(status_code=500, detail=f"Publish failed: {str(e)}")


@router.get("/knowledge/sessions")
async def list_knowledge_sessions():
    """List all sessions that have published knowledge to the network."""
    return {"sessions": knowledge_network.list_sessions()}


@router.get("/knowledge/entries")
async def get_knowledge_entries(
    session_id: Optional[str] = Query(None),
    role: Optional[str] = Query(None),
    min_confidence: float = Query(0.0, ge=0.0, le=1.0),
):
    """Get knowledge entries from the shared network, optionally filtered."""
    if session_id:
        entries = knowledge_network.get_entries(session_id, role=role, min_confidence=min_confidence)
    else:
        entries = knowledge_network.get_all_entries(min_confidence=min_confidence)
    return {"entries": entries, "count": len(entries)}


@router.get("/knowledge/search")
async def search_knowledge(
    q: str = Query(..., min_length=1, description="Search query for symbol or meaning"),
    min_confidence: float = Query(0.0, ge=0.0, le=1.0),
):
    """Search the knowledge network for symbol/meaning matches."""
    results = knowledge_network.search(q, min_confidence=min_confidence)
    return {"results": results, "count": len(results), "query": q}


@router.get("/knowledge/stats")
async def get_knowledge_stats():
    """Get aggregate statistics about the knowledge network."""
    return knowledge_network.stats()


@router.post("/knowledge/import/{session_id}")
async def import_knowledge(
    session_id: str,
    body: dict = Body(default=None),
):
    """Import knowledge from the network into a session's agents.

    Body params:
      source_session_ids: list of session IDs to import from (default: all)
      min_confidence: minimum confidence threshold (default 0.3)
      merge_strategy: 'prefer_higher' (default) or 'overwrite'
    """
    body = body or {}
    source_ids = body.get("source_session_ids")
    min_conf = body.get("min_confidence", 0.3)
    strategy = body.get("merge_strategy", "prefer_higher")

    session = session_manager.get_session(session_id)
    if not session:
        raise HTTPException(status_code=404, detail="Session not found")

    trainer = session_manager.get_or_create_trainer(session_id)
    if not trainer:
        raise HTTPException(status_code=400, detail="No trainer loaded for this session")

    try:
        result = knowledge_network.import_to_session(
            target_session_id=session_id,
            trainer=trainer,
            source_session_ids=source_ids,
            min_confidence=min_conf,
            merge_strategy=strategy,
        )
        return {"status": "imported", **result}
    except Exception as e:
        logger.error(f"Failed to import knowledge for {session_id}: {e}")
        raise HTTPException(status_code=500, detail=f"Import failed: {str(e)}")


@router.delete("/knowledge/{session_id}")
async def unpublish_knowledge(session_id: str):
    """Remove a session's entries from the knowledge network."""
    removed = knowledge_network.unpublish(session_id)
    if not removed:
        raise HTTPException(status_code=404, detail="Session not found in knowledge network")
    return {"status": "unpublished", "session_id": session_id}


# ------------------------------------------------------------------ #
#  FEATURE 7: Language & Model Export Endpoints                      #
# ------------------------------------------------------------------ #

@router.get("/sessions/{session_id}/export/vocabulary")
async def export_vocabulary(session_id: str):
    """Export the session's emergent vocabulary as JSON.

    Returns the complete message→meaning mapping, symbol usage statistics,
    and conversation-derived vocabulary with average meanings.
    """
    session = session_manager.get_session(session_id)
    if not session:
        raise HTTPException(status_code=404, detail="Session not found")

    trainer = session_manager.get_or_create_trainer(session_id)

    # Build vocabulary from trainer message log
    vocab_mapping: Dict[str, Any] = {}
    if trainer and hasattr(trainer, "message_log"):
        import numpy as np
        for features, msg in list(trainer.message_log):
            msg_key = str(list(msg))
            if msg_key not in vocab_mapping:
                vocab_mapping[msg_key] = {
                    "message": list(msg) if not isinstance(msg, list) else msg,
                    "meanings": [],
                    "count": 0,
                }
            feat_list = list(features) if hasattr(features, '__iter__') else [features]
            vocab_mapping[msg_key]["meanings"].append(feat_list)
            vocab_mapping[msg_key]["count"] += 1

        # Compute averaged meanings
        for key in list(vocab_mapping.keys()):
            meanings = vocab_mapping[key]["meanings"]
            if meanings:
                try:
                    import numpy as np
                    dim = len(meanings[0])
                    vocab_mapping[key]["avg_meaning"] = [
                        round(float(np.mean([m[i] for m in meanings])), 6)
                        for i in range(dim)
                    ]
                except Exception:
                    vocab_mapping[key]["avg_meaning"] = []
            del vocab_mapping[key]["meanings"]

    # Include memory bank entries if available
    memory_vocab = {}
    for role, mind_attr in [("speaker", "speaker_mind"), ("listener", "listener_mind")]:
        mind = getattr(trainer, mind_attr, None) if trainer else None
        if mind and hasattr(mind, "memory_bank"):
            memory_vocab[role] = mind.memory_bank.as_list()

    # Get latest language snapshot
    lang_snapshot = session_manager.get_latest_language(session_id) or {}

    import json
    return json.loads(json.dumps({
        "session_id": session_id,
        "session_name": session.name,
        "config": {
            "vocab_size": session.config.vocab_size,
            "message_length": session.config.message_length,
            "feature_dim": session.config.feature_dim,
        },
        "current_episode": session.current_episode,
        "emergent_vocabulary": vocab_mapping,
        "memory_bank_vocabulary": memory_vocab,
        "language_snapshot": lang_snapshot,
        "vocabulary_size": len(vocab_mapping),
    }, cls=NumpyEncoder))


@router.get("/sessions/{session_id}/export/model")
async def export_model_checkpoint(session_id: str):
    """Download the latest model checkpoint as a zip archive.

    Includes speaker weights (.pt), listener weights (.pt), training config,
    and vocabulary mapping.
    """
    import glob

    session = session_manager.get_session(session_id)
    if not session:
        raise HTTPException(status_code=404, detail="Session not found")

    trainer = session_manager.get_or_create_trainer(session_id)
    if not trainer:
        raise HTTPException(status_code=400, detail="No trainer loaded for this session")

    # Check for existing export first
    export_dir = os.path.join("exports", session_id)

    # If no export exists yet, create one
    if not os.path.isdir(export_dir) or not os.listdir(export_dir):
        try:
            trainer.export_model(session_id)
        except Exception as e:
            logger.error(f"Auto-export failed for session {session_id}: {e}")
            raise HTTPException(status_code=500, detail=f"Export failed: {str(e)}")
    # Also look for checkpoint .pt files
    checkpoint_dir = os.path.join("data", "checkpoints", session_id)
    latest_checkpoint = None
    if os.path.isdir(checkpoint_dir):
        checkpoint_files = sorted(
            glob.glob(os.path.join(checkpoint_dir, "episode_*.pt")),
            key=lambda f: int(f.split("episode_")[-1].replace(".pt", ""))
        )
        if checkpoint_files:
            latest_checkpoint = checkpoint_files[-1]

    # Create zip archive with all export artifacts
    zip_path = os.path.join(export_dir, f"{session_id}_model_export.zip")
    try:
        with zipfile.ZipFile(zip_path, "w", zipfile.ZIP_DEFLATED) as zf:
            # Add export files
            for fname in os.listdir(export_dir):
                fpath = os.path.join(export_dir, fname)
                if os.path.isfile(fpath) and not fname.endswith(".zip"):
                    zf.write(fpath, f"export/{fname}")

            # Add latest checkpoint if it exists and isn't already in export dir
            if latest_checkpoint and os.path.exists(latest_checkpoint):
                zf.write(latest_checkpoint, f"checkpoints/{os.path.basename(latest_checkpoint)}")

            # Add vocabulary export inline
            if trainer and hasattr(trainer, "message_log"):
                import numpy as np
                vocab_data = {}
                for features, msg in list(trainer.message_log):
                    msg_key = str(list(msg))
                    if msg_key not in vocab_data:
                        vocab_data[msg_key] = {
                            "message": list(msg) if not isinstance(msg, list) else msg,
                            "meanings": [],
                            "count": 0,
                        }
                    feat_list = list(features) if hasattr(features, '__iter__') else [features]
                    vocab_data[msg_key]["meanings"].append(feat_list)
                    vocab_data[msg_key]["count"] += 1

                for key in vocab_data:
                    meanings = vocab_data[key]["meanings"]
                    if meanings:
                        try:
                            dim = len(meanings[0])
                            vocab_data[key]["avg_meaning"] = [
                                round(float(np.mean([m[i] for m in meanings])), 6)
                                for i in range(dim)
                            ]
                        except Exception:
                            vocab_data[key]["avg_meaning"] = []
                    del vocab_data[key]["meanings"]

                vocab_json = json.dumps(vocab_data, indent=2)
                zf.writestr("vocabulary.json", vocab_json)

        return FileResponse(
            path=zip_path,
            filename=f"{session_id}_model.zip",
            media_type="application/zip",
        )
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Model download failed for session {session_id}: {e}")
        raise HTTPException(status_code=500, detail=f"Download failed: {str(e)}")

# ------------------------------------------------------------------ #
#  Specialization & Social Dynamics                                   #
# ------------------------------------------------------------------ #
# In-memory caches keyed by session_id
_specialization_sessions: Dict[str, SessionSpecialization] = {}


def _get_specialization(session_id: str) -> SessionSpecialization:
    if session_id not in _specialization_sessions:
        _specialization_sessions[session_id] = SessionSpecialization(session_id)
    return _specialization_sessions[session_id]


@router.get("/sessions/{session_id}/specialization")
async def get_specialization(session_id: str):
    """Get agent specialization profiles for a session.

    Returns per-agent skill breakdowns (color, shape, spatial, texture,
    quantity), dominant/weakest skills, specialisation scores, and
    cross-agent skill leaders.
    """
    session = session_manager.get_session(session_id)
    if not session:
        raise HTTPException(status_code=404, detail="Session not found")

    trainer = session_manager.get_or_create_trainer(session_id)
    spec = _get_specialization(session_id)

    # If a trainer is available, pull real specialization data from its
    # message_log to backfill skills that were tracked during training.
    if trainer and hasattr(trainer, "message_log") and hasattr(trainer, "speaker_mind"):
        # Update from trainer's interaction history if needed
        try:
            from agents.agent_minds import AgentMind
            for role, mind_attr in [("speaker", "speaker_mind"), ("listener", "listener_mind")]:
                mind = getattr(trainer, mind_attr, None)
                if mind is None:
                    continue
                agent_spec = spec.get_or_create(
                    role,
                    feature_dim=trainer.feature_dim,
                )
                # Populate from memory bank entries if empty
                if agent_spec.skills["general"].total == 0 and hasattr(mind, "memory_bank"):
                    for entry in mind.memory_bank.as_list():
                        conf = entry.get("confidence", 0.5)
                        success = conf > 0.5
                        # Use episode 0 as a proxy; real updates come during training
                        agent_spec.skills["general"].record(success, 0)
        except Exception as e:
            logger.warning(f"Specialization backfill failed for {session_id}: {e}")

    import json
    report = spec.get_full_report()
    sanitized = json.loads(json.dumps(report, cls=NumpyEncoder))
    return sanitized


@router.get("/sessions/{session_id}/social-dynamics")
async def get_social_dynamics(session_id: str):
    """Get the social dynamics graph for a session.

    Returns trust networks, alliances, rivalries, influence scores,
    alliance clusters, and per-relationship history timelines.
    """
    session = session_manager.get_session(session_id)
    if not session:
        raise HTTPException(status_code=404, detail="Session not found")

    trainer = session_manager.get_or_create_trainer(session_id)
    sd = get_session_social_dynamics(session_id)

    # Populate from trainer's agent minds if the graph is empty
    if trainer and not sd._relationships:
        try:
            speaker_mind = getattr(trainer, "speaker_mind", None)
            listener_mind = getattr(trainer, "listener_mind", None)
            if speaker_mind and listener_mind:
                sd.register_agent("speaker")
                sd.register_agent("listener")

                # Seed relationship from existing trust scores
                speaker_trust = speaker_mind.memory.get_trust("listener")
                listener_trust = listener_mind.memory.get_trust("speaker")
                avg_trust = (speaker_trust + listener_trust) / 2.0

                rel = sd._get_or_create("speaker", "listener")
                rel.trust = avg_trust
                speaker_rate = speaker_mind.memory.get_success_rate("listener")
                rel.success_rate = speaker_rate
                speaker_total = len(speaker_mind.memory.success_rate_by_partner.get("listener", []))
                rel.total_interactions = speaker_total

                # Re-classify after seeding
                rel.status = rel._classify()

                # Add mood sync
                s_mood = speaker_mind.emotion.current_mood
                l_mood = listener_mind.emotion.current_mood
                rel.update_emotional_alignment(s_mood, l_mood, trainer.current_episode)
        except Exception as e:
            logger.warning(f"Social dynamics seeding failed for {session_id}: {e}")

    import json
    report = sd.get_network_summary()
    sanitized = json.loads(json.dumps(report, cls=NumpyEncoder))
    return sanitized


@router.post("/sessions/{session_id}/social-dynamics/update")
async def update_social_dynamics(
    session_id: str,
    body: dict = Body(default=None),
):
    """Manually update the social dynamics for a session.

    Accepts a JSON body with one or more of:
    - ``interactions``: list of {agent_a, agent_b, success, episode}
    - ``mood_sync``:     list of {agent_a, mood_a, agent_b, mood_b, episode}
    - ``events``:        list of {agent_a, agent_b, event_type, details, episode}

    All lists are optional. Returns the updated network summary.
    """
    body = body or {}
    session = session_manager.get_session(session_id)
    if not session:
        raise HTTPException(status_code=404, detail="Session not found")

    sd = get_session_social_dynamics(session_id)
    applied = {"interactions": 0, "mood_syncs": 0, "events": 0}

    try:
        # Process interaction updates
        for item in body.get("interactions", []):
            sd.record_interaction(
                agent_a=item["agent_a"],
                agent_b=item["agent_b"],
                success=bool(item.get("success", True)),
                episode=int(item.get("episode", 0)),
            )
            applied["interactions"] += 1

        # Process mood sync updates
        for item in body.get("mood_sync", []):
            sd.update_moods(
                agent_a=item["agent_a"],
                mood_a=item["mood_a"],
                agent_b=item["agent_b"],
                mood_b=item["mood_b"],
                episode=int(item.get("episode", 0)),
            )
            applied["mood_syncs"] += 1

        # Process manual events
        for item in body.get("events", []):
            sd.inject_event(
                agent_a=item["agent_a"],
                agent_b=item["agent_b"],
                event_type=item.get("event_type", "manual"),
                details=item.get("details", {}),
                episode=int(item.get("episode", 0)),
            )
            applied["events"] += 1

        # Persist
        sd.save()

        import json
        report = sd.get_network_summary()
        sanitized = json.loads(json.dumps(report, cls=NumpyEncoder))
        return {
            "status": "updated",
            "session_id": session_id,
            "applied": applied,
            "network": sanitized,
        }
    except KeyError as e:
        raise HTTPException(status_code=400, detail=f"Missing required field: {e}")
    except Exception as e:
        logger.error(f"Social dynamics update failed for {session_id}: {e}")
        raise HTTPException(status_code=500, detail=f"Update failed: {str(e)}")
