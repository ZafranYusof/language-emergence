"""Main FastAPI application for the Language Emergence System."""

import asyncio
import json
import logging
from contextlib import asynccontextmanager
from fastapi import FastAPI, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
import numpy as np

from routes.api import router as api_router, init_router
from world_simulation import router as world_router
from services.session_manager import SessionManager
from services.websocket_handler import WebSocketHandler, _json_safe, HEARTBEAT_INTERVAL

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(name)s] %(levelname)s: %(message)s",
)
logger = logging.getLogger(__name__)


class NumpyJSONResponse(JSONResponse):
    """Custom JSONResponse that handles numpy types."""
    def render(self, content) -> bytes:
        return json.dumps(
            content,
            ensure_ascii=False,
            allow_nan=False,
            indent=None,
            separators=(",", ":"),
            default=self._default,
        ).encode("utf-8")

    @staticmethod
    def _default(obj):
        if isinstance(obj, np.integer):
            return int(obj)
        if isinstance(obj, np.floating):
            return float(obj)
        if isinstance(obj, np.ndarray):
            return obj.tolist()
        if isinstance(obj, np.bool_):
            return bool(obj)
        raise TypeError(f"Object of type {type(obj)} is not JSON serializable")


# Initialize services
session_manager = SessionManager()
ws_handler = WebSocketHandler()


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Application lifespan: startup and shutdown."""
    logger.info("Language Emergence System starting...")
    logger.info(f"WebSocket handler ready, heartbeat interval = {HEARTBEAT_INTERVAL}s")
    yield
    logger.info("Language Emergence System shutting down...")


# ------------------------------------------------------------------ #
#  IMPROVEMENT 6: API Docs Enhancement                                #
# ------------------------------------------------------------------ #

# Create FastAPI app with rich OpenAPI metadata
app = FastAPI(
    title="Language Emergence System",
    description=(
        "Multi-agent RL system where AI agents develop their own language to solve "
        "cooperative tasks. Provides REST endpoints for session management, training "
        "control, model export, and analysis, plus a WebSocket for real-time updates."
    ),
    version="1.1.0",
    lifespan=lifespan,
    default_response_class=NumpyJSONResponse,
    openapi_tags=[
        {
            "name": "sessions",
            "description": "Create, list, save, load, and delete training sessions.",
        },
        {
            "name": "training",
            "description": "Start, stop, and reset training. Retrieve metrics and conversations.",
        },
        {
            "name": "analysis",
            "description": "Language analysis: compositionality, entropy, vocabulary size, drift.",
        },
        {
            "name": "export",
            "description": "Export trained model weights and vocabulary mappings.",
        },
        {
            "name": "system",
            "description": "Health check and root information.",
        },
    ],
)

# CORS middleware
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Initialize API router with dependencies
init_router(session_manager, ws_handler)

# Include API routes
app.include_router(api_router)
# ── NEURAL VISUALIZER ROUTES ──────────────────────────────
from neural_visualizer import register_neural_routes
register_neural_routes(app)

app.include_router(world_router)
from human_feedback import get_router as get_feedback_router
app.include_router(get_feedback_router())
# ── SWARM INTELLIGENCE ROUTES ────────────────────────────────
from swarm_intelligence import router as swarm_router
app.include_router(swarm_router)
# ── PHYLOGENETIC TREE ROUTES ────────────────────────────────
from phylogenetic_engine import router as phylo_router
app.include_router(phylo_router)
# ── DESKTOP ACCESS ENDPOINTS ──────────────────────────────────
from desktop_tools import DesktopTools
desktop = DesktopTools()


@app.get("/api/desktop/files")
async def desktop_list_files(path: str = None, show_hidden: bool = False):
    """List files in a directory (defaults to Desktop)"""
    return desktop.list_files(path, show_hidden)


@app.get("/api/desktop/read")
async def desktop_read_file(path: str):
    """Read a text file's content"""
    return desktop.read_file(path)


@app.get("/api/desktop/search")
async def desktop_search(query: str, path: str = None):
    """Search for files by name"""
    return desktop.search_files(query, path)


@app.get("/api/desktop/preview")
async def desktop_preview(path: str, lines: int = 30):
    """Get a preview of a file"""
    return desktop.get_file_preview(path, lines)


@app.get("/api/desktop/screenshot")
async def desktop_screenshot():
    """Take a screenshot of the desktop"""
    return desktop.take_screenshot()


@app.get("/api/desktop/apps")
async def desktop_apps():
    """List running applications"""
    return desktop.list_running_apps()


@app.get("/api/desktop/system")
async def desktop_system():
    """Get system info (CPU, memory, disk)"""
    return desktop.get_system_info()


@app.get("/api/desktop/actions")
async def desktop_actions(limit: int = 50):
    """Get recent agent actions on desktop"""
    return desktop.get_action_log(limit)


@app.get("/api/desktop/observe")
async def desktop_observe():
    """Agent observes desktop and returns summary"""
    observation = desktop.agent_observe()
    thought = desktop.agent_think_about_desktop(observation)
    observation["agent_thought"] = thought
    return observation




@app.get(
    "/",
    tags=["system"],
    summary="Root endpoint",
    description="Returns basic system information and endpoint pointers.",
    responses={
        200: {
            "description": "System info",
            "content": {
                "application/json": {
                    "example": {
                        "name": "Language Emergence System",
                        "version": "1.1.0",
                        "description": "Multi-agent RL system for emergent language development",
                        "endpoints": {
                            "api": "/api/sessions",
                            "websocket": "/ws/{session_id}",
                            "docs": "/docs",
                        },
                    }
                }
            },
        }
    },
)
async def root():
    """Root endpoint with system info."""
    return {
        "name": "Language Emergence System",
        "version": "1.1.0",
        "description": "Multi-agent RL system for emergent language development",
        "endpoints": {
            "api": "/api/sessions",
            "websocket": "/ws/{session_id}",
            "docs": "/docs",
        },
    }


@app.get(
    "/health",
    tags=["system"],
    summary="Health check",
    description="Returns system health status, active session count, and active WebSocket sessions.",
    responses={
        200: {
            "description": "Healthy",
            "content": {
                "application/json": {
                    "example": {
                        "status": "healthy",
                        "active_sessions": 0,
                        "ws_sessions": [],
                    }
                }
            },
        }
    },
)
async def health():
    """Health check endpoint."""
    return {
        "status": "healthy",
        "active_sessions": len(session_manager.sessions),
        "ws_sessions": ws_handler.get_all_sessions(),
    }


# ------------------------------------------------------------------ #
#  IMPROVEMENT 7: WebSocket with heartbeat & reconnect                #
# ------------------------------------------------------------------ #

@app.websocket(
    "/ws/{session_id}",
    name="WebSocket Training Stream",
)
async def websocket_endpoint(websocket: WebSocket, session_id: str):
    """
    WebSocket endpoint for real-time training updates.
    
    Clients connect to /ws/{session_id} to receive:
    - training_progress: episode, reward, loss, vocab_size, compositionality, entropy
    - new_conversation: speaker input, message, listener output, reward
    - language_update: vocab_size, compositionality, drift analysis
    - status_change: training status changes
    
    Supports:
    - Heartbeat keepalive every 15 seconds
    - Reconnection with missed-message replay (client sends last_id on connect)
    """
    # Verify session exists
    session = session_manager.get_session(session_id)
    if not session:
        await websocket.close(code=4004, reason="Session not found")
        return
    
    # IMPROVEMENT 7: Check for reconnection handshake (client sends last_id)
    # We accept first, then read the initial message if any
    await ws_handler.connect(websocket, session_id)
    
    try:
        while True:
            # Keep connection alive, handle client messages
            try:
                data = await asyncio.wait_for(
                    websocket.receive_json(), timeout=HEARTBEAT_INTERVAL
                )
                
                # Handle client messages
                msg_type = data.get("type", "")
                
                if msg_type == "ping":
                    await websocket.send_json({"type": "pong"})
                    
                elif msg_type == "get_status":
                    trainer = session_manager.get_trainer(session_id)
                    if trainer:
                        await websocket.send_json({
                            "type": "status",
                            "data": {
                                "is_training": trainer.is_training,
                                "current_episode": trainer.current_episode,
                            }
                        })
                        
                elif msg_type == "get_metrics":
                    trainer = session_manager.get_trainer(session_id)
                    if trainer:
                        metrics_data = trainer.get_metrics()
                        await websocket.send_json(_json_safe({
                            "type": "metrics",
                            "data": metrics_data,
                        }))
                
                # IMPROVEMENT 7: Client can request replay from a specific message ID
                elif msg_type == "replay_from":
                    last_id = data.get("last_id", 0)
                    history = ws_handler._message_history.get(session_id, [])
                    missed = [m for m in history if m["id"] > last_id]
                    for msg in missed:
                        await websocket.send_json(_json_safe(msg))
                        ws_handler._client_last_msg_id[websocket] = msg["id"]
                        
            except asyncio.TimeoutError:
                # IMPROVEMENT 7: Send heartbeat keepalive
                try:
                    await websocket.send_json({"type": "heartbeat"})
                except Exception:
                    break
                    
    except WebSocketDisconnect:
        pass
    except Exception as e:
        logger.error(f"WebSocket error for session {session_id}: {e}")
    finally:
        await ws_handler.disconnect(websocket)


if __name__ == "__main__":
    import uvicorn
    uvicorn.run("main:app", host="0.0.0.0", port=8000, reload=False)


# ── AUTONOMOUS DESKTOP ENDPOINTS ──────────────────────────────

@app.post("/api/desktop/autonomous/scan")
async def autonomous_scan(path: str = None):
    """Scan files and categorize by type (code, docs, images, other)"""
    return desktop.autonomous_scan(path)


@app.post("/api/desktop/autonomous/suggest")
async def autonomous_suggest(path: str = None):
    """Suggest cleanup: duplicates, empty folders, old temp files"""
    return desktop.suggest_cleanup(path)


@app.post("/api/desktop/autonomous/organize")
async def autonomous_organize(path: str = None):
    """Auto-organize files by type into subfolders"""
    return desktop.auto_organize(path or desktop.desktop_path)


@app.get("/api/desktop/autonomous/monitor")
async def autonomous_monitor():
    """System health report: disk usage, running apps, top processes"""
    return desktop.proactive_monitor()
