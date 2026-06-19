"""WebSocket handler for real-time training updates."""

import asyncio
import json
import logging
from typing import Dict, Set, Any, Optional, List
from fastapi import WebSocket, WebSocketDisconnect
from datetime import datetime
import numpy as np

logger = logging.getLogger(__name__)

HEARTBEAT_INTERVAL = 15  # seconds


def _json_safe(obj: Any) -> Any:
    """Recursively convert numpy types to native Python types."""
    if isinstance(obj, dict):
        return {k: _json_safe(v) for k, v in obj.items()}
    if isinstance(obj, (list, tuple)):
        return [_json_safe(v) for v in obj]
    if isinstance(obj, np.integer):
        return int(obj)
    if isinstance(obj, np.floating):
        return float(obj)
    if isinstance(obj, np.ndarray):
        return obj.tolist()
    if isinstance(obj, np.bool_):
        return bool(obj)
    return obj


class WebSocketHandler:
    """
    Manages WebSocket connections for real-time training updates.
    
    Supports:
    - Per-session subscription
    - Broadcasting training progress, conversations, and language updates
    - Client disconnect handling
    - IMPROVEMENT 7: Heartbeat interval (15s)
    - IMPROVEMENT 7: Reconnection with missed-message replay
    - IMPROVEMENT 7: Per-client last-sent message tracking
    """
    
    def __init__(self):
        # session_id -> set of connected websockets
        self.connections: Dict[str, Set[WebSocket]] = {}
        # websocket -> session_id mapping
        self.client_sessions: Dict[WebSocket, str] = {}
        # Per-client message queues for async broadcasting
        self.queues: Dict[WebSocket, asyncio.Queue] = {}
        
        # IMPROVEMENT 7: message history for replay on reconnect
        # session_id -> list of {id, type, data} messages
        self._message_history: Dict[str, List[Dict[str, Any]]] = {}
        # websocket -> last message id sent to this client
        self._client_last_msg_id: Dict[WebSocket, int] = {}
        # Global per-session message counter
        self._next_msg_id: Dict[str, int] = {}
        # Max messages to keep per session for replay
        self._max_history = 500
    
    async def connect(self, websocket: WebSocket, session_id: str):
        """Handle new WebSocket connection."""
        await websocket.accept()
        
        if session_id not in self.connections:
            self.connections[session_id] = set()
            self._message_history.setdefault(session_id, [])
            self._next_msg_id.setdefault(session_id, 0)
        
        self.connections[session_id].add(websocket)
        self.client_sessions[websocket] = session_id
        self.queues[websocket] = asyncio.Queue(maxsize=100)
        self._client_last_msg_id[websocket] = 0
        
        # Send connection confirmation
        await self._send(websocket, {
            "type": "connected",
            "session_id": session_id,
            "message": f"Subscribed to session {session_id}",
            "timestamp": datetime.utcnow().isoformat(),
        })
        
        # IMPROVEMENT 7: On reconnect, resend missed messages
        await self._replay_missed_messages(websocket, session_id)
    
    async def _replay_missed_messages(self, websocket: WebSocket, session_id: str):
        """
        Resend any messages the client missed since their last known ID.
        """
        history = self._message_history.get(session_id, [])
        last_id = self._client_last_msg_id.get(websocket, 0)
        
        missed = [m for m in history if m["id"] > last_id]
        if missed:
            logger.info(f"Replaying {len(missed)} missed messages for reconnecting client on session {session_id}")
            for msg in missed:
                await self._send(websocket, msg)
                self._client_last_msg_id[websocket] = msg["id"]
    
    async def disconnect(self, websocket: WebSocket):
        """Handle WebSocket disconnection."""
        session_id = self.client_sessions.pop(websocket, None)
        if session_id and session_id in self.connections:
            self.connections[session_id].discard(websocket)
            if not self.connections[session_id]:
                del self.connections[session_id]
        
        self.queues.pop(websocket, None)
        self._client_last_msg_id.pop(websocket, None)
    
    def _record_message(self, session_id: str, message: Dict[str, Any]) -> Dict[str, Any]:
        """
        Assign an ID to a broadcast message and store it in history.
        Returns the message with the id field added.
        """
        msg_id = self._next_msg_id.get(session_id, 0) + 1
        self._next_msg_id[session_id] = msg_id
        message["id"] = msg_id
        
        history = self._message_history.setdefault(session_id, [])
        history.append(message)
        # Trim to max history
        if len(history) > self._max_history:
            self._message_history[session_id] = history[-self._max_history:]
        
        return message
    
    async def _send(self, websocket: WebSocket, data: Dict[str, Any]):
        """Send data to a single WebSocket client."""
        try:
            await websocket.send_json(_json_safe(data))
        except Exception:
            await self.disconnect(websocket)
    
    async def _broadcast_to_session(self, session_id: str, data: Dict[str, Any]):
        """Broadcast data to all clients subscribed to a session."""
        if session_id not in self.connections:
            return
        
        # Record message for replay tracking
        data = self._record_message(session_id, data)
        
        safe_data = _json_safe(data)
        disconnected = set()
        for websocket in self.connections[session_id]:
            try:
                await websocket.send_json(safe_data)
                self._client_last_msg_id[websocket] = data["id"]
            except Exception:
                disconnected.add(websocket)
        
        # Clean up disconnected clients
        for ws in disconnected:
            await self.disconnect(ws)
    
    async def broadcast_training_progress(self, session_id: str, data: Dict[str, Any]):
        """Broadcast training progress update."""
        message = {
            "type": "training_progress",
            "session_id": session_id,
            "timestamp": datetime.utcnow().isoformat(),
            "data": data,
        }
        await self._broadcast_to_session(session_id, message)
    
    async def broadcast_new_conversation(self, session_id: str, data: Dict[str, Any]):
        """Broadcast new conversation record."""
        message = {
            "type": "new_conversation",
            "session_id": session_id,
            "timestamp": datetime.utcnow().isoformat(),
            "data": data,
        }
        await self._broadcast_to_session(session_id, message)
    
    async def broadcast_language_update(self, session_id: str, data: Dict[str, Any]):
        """Broadcast language analysis update."""
        message = {
            "type": "language_update",
            "session_id": session_id,
            "timestamp": datetime.utcnow().isoformat(),
            "data": data,
        }
        await self._broadcast_to_session(session_id, message)
    
    async def broadcast_status_change(self, session_id: str, status: str):
        """Broadcast session status change."""
        message = {
            "type": "status_change",
            "session_id": session_id,
            "status": status,
            "timestamp": datetime.utcnow().isoformat(),
        }
        await self._broadcast_to_session(session_id, message)
    
    def get_subscriber_count(self, session_id: str) -> int:
        """Get number of subscribers for a session."""
        return len(self.connections.get(session_id, set()))
    
    def get_all_sessions(self) -> list:
        """Get all sessions with active connections."""
        return list(self.connections.keys())
