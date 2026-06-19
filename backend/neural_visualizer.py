"""Real-Time Neural Activation Visualizer.

Hooks into Speaker/Listener PyTorch models to capture live neuron activations
and stream them to the frontend for 3D visualization.
"""

import asyncio
import json
import logging
import time
import uuid
from dataclasses import dataclass, field
from typing import Any, Dict, List, Optional, Set

import numpy as np
import torch
import torch.nn as nn
from fastapi import APIRouter, WebSocket, WebSocketDisconnect

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/neural", tags=["neural-visualizer"])


# ─────────────────────────── Data Structures ─────────────────────────── #


@dataclass
class ActivationSnapshot:
    """Snapshot of activations for a single layer."""

    layer_name: str
    neuron_values: List[float]
    timestamp: float
    shape: List[int]
    agent: str  # 'speaker' or 'listener'
    stats: Dict[str, float] = field(default_factory=dict)


@dataclass
class AttentionConnection:
    """Attention flow between source and target layers."""

    source_layer: str
    target_layer: str
    weights: List[List[float]]
    timestamp: float


@dataclass
class CaptureResult:
    """Full result of one inference capture."""

    session_id: str
    timestamp: float
    speaker_layers: List[ActivationSnapshot]
    listener_layers: List[ActivationSnapshot]
    attention_flows: List[AttentionConnection]
    input_info: Dict[str, Any] = field(default_factory=dict)


# ─────────────────────────── Activation Extractor ─────────────────────────── #


class ActivationExtractor:
    """Hooks into PyTorch nn.Module layers to capture forward-pass activations."""

    def __init__(self):
        self._hooks: List[Any] = []
        self._activations: Dict[str, torch.Tensor] = {}
        self._gradients: Dict[str, torch.Tensor] = {}
        self._attention_weights: Dict[str, torch.Tensor] = {}
        self._layer_names: Dict[str, List[str]] = {}  # agent -> layer names
        self._registered_models: Set[int] = set()

    def register_model(self, model: nn.Module, agent_name: str) -> List[str]:
        """Register forward hooks on all Linear layers in a model.

        Returns list of layer names that were hooked.
        """
        # Unwrap DataParallel if needed
        if isinstance(model, nn.DataParallel):
            model = model.module

        model_id = id(model)
        if model_id in self._registered_models:
            return self._layer_names.get(agent_name, [])

        layer_names: List[str] = []
        for name, module in model.named_modules():
            if isinstance(module, nn.Linear):
                full_name = f"{agent_name}.{name}"
                layer_names.append(full_name)

                # Forward hook
                hook = module.register_forward_hook(
                    self._make_forward_hook(full_name)
                )
                self._hooks.append(hook)

                # Try to register backward hook for gradients
                try:
                    hook_b = module.register_full_backward_hook(
                        self._make_backward_hook(full_name)
                    )
                    self._hooks.append(hook_b)
                except Exception:
                    pass  # Older PyTorch may not support this

        self._layer_names[agent_name] = layer_names
        self._registered_models.add(model_id)
        logger.info(
            f"Registered {len(layer_names)} hooks for {agent_name}: {layer_names}"
        )
        return layer_names

    def _make_forward_hook(self, name: str):
        def hook_fn(module, input, output):
            if isinstance(output, torch.Tensor):
                self._activations[name] = output.detach()
            elif isinstance(output, tuple) and len(output) > 0:
                self._activations[name] = output[0].detach()
        return hook_fn

    def _make_backward_hook(self, name: str):
        def hook_fn(module, grad_input, grad_output):
            if grad_output and isinstance(grad_output[0], torch.Tensor):
                self._gradients[name] = grad_output[0].detach()
        return hook_fn

    def clear(self):
        """Clear all captured activations."""
        self._activations.clear()
        self._gradients.clear()
        self._attention_weights.clear()

    def remove_hooks(self):
        """Remove all registered hooks."""
        for hook in self._hooks:
            hook.remove()
        self._hooks.clear()
        self._registered_models.clear()
        self._layer_names.clear()

    def get_layer_names(self) -> Dict[str, List[str]]:
        """Return registered layer names grouped by agent."""
        return dict(self._layer_names)

    def get_latest_activations(self) -> Dict[str, torch.Tensor]:
        """Return the most recent activation tensors."""
        return dict(self._activations)

    def get_latest_gradients(self) -> Dict[str, torch.Tensor]:
        """Return the most recent gradient tensors."""
        return dict(self._gradients)

    def build_snapshot(
        self, name: str, tensor: torch.Tensor, agent: str
    ) -> Optional[ActivationSnapshot]:
        """Build an ActivationSnapshot from a captured tensor."""
        if tensor is None:
            return None

        # Flatten to 1D for neuron-level viz
        values = tensor.flatten().cpu().float().numpy()
        # Cap at 512 neurons for performance
        if len(values) > 512:
            indices = np.linspace(0, len(values) - 1, 512, dtype=int)
            values = values[indices]

        values_list = [float(v) for v in values]
        shape = list(tensor.shape)

        stats = {}
        if len(values_list) > 0:
            arr = np.array(values_list)
            stats = {
                "mean": float(np.mean(arr)),
                "std": float(np.std(arr)),
                "min": float(np.min(arr)),
                "max": float(np.max(arr)),
                "count": len(values_list),
            }

        return ActivationSnapshot(
            layer_name=name,
            neuron_values=values_list,
            timestamp=time.time(),
            shape=shape,
            agent=agent,
            stats=stats,
        )

    def capture_attention_weights(
        self, model: nn.Module, agent_name: str
    ) -> Optional[torch.Tensor]:
        """Try to extract attention weights from the model if available."""
        if isinstance(model, nn.DataParallel):
            model = model.module

        # Look for known attention layer patterns
        for name, module in model.named_modules():
            if hasattr(module, "attention_weights"):
                return module.attention_weights.detach()
            if hasattr(module, "attn_weights"):
                return module.attn_weights.detach()
        return None


# ─────────────────────────── Global State ─────────────────────────── #


extractor = ActivationExtractor()

# Latest capture results per session
_latest_captures: Dict[str, CaptureResult] = {}

# WebSocket clients per session for neural data
_neural_ws_clients: Dict[str, Set[WebSocket]] = {}


# ─────────────────────────── Capture Logic ─────────────────────────── #


def _run_capture(session_id: str, trainer) -> Optional[CaptureResult]:
    """Run one inference with the trainer's models and capture activations."""
    import torch

    extractor.clear()

    speaker = trainer.speaker
    listener = trainer.listener

    # Register hooks if not already done
    spk_layers = extractor.register_model(speaker, "speaker")
    lis_layers = extractor.register_model(listener, "listener")

    if not spk_layers and not lis_layers:
        logger.warning("No layers found to hook")
        return None

    # Set to eval for clean inference
    speaker.eval()
    listener.eval()

    device = trainer.device_obj
    feature_dim = trainer.feature_dim
    num_objects = trainer.num_objects

    with torch.no_grad():
        # Create a random input (like a real episode)
        target_features = np.random.randn(feature_dim).astype(np.float32)
        target_tensor = torch.FloatTensor(target_features).unsqueeze(0).to(device)

        candidates = np.random.randn(num_objects, feature_dim).astype(np.float32)
        candidates_tensor = torch.FloatTensor(candidates).unsqueeze(0).to(device)

        # Speaker forward pass (captures activations via hooks)
        message_st, message_soft, message_indices = speaker(
            target_tensor, temperature=0.5, hard=False
        )

        # Listener forward pass
        selection_probs, selection_idx, attn_weights = listener(
            message_st.detach(), candidates_tensor
        )

    # Build snapshots
    speaker_snapshots = []
    listener_snapshots = []
    attention_flows = []

    activations = extractor.get_latest_activations()

    for name, tensor in activations.items():
        if name.startswith("speaker."):
            snap = extractor.build_snapshot(name, tensor, "speaker")
            if snap:
                speaker_snapshots.append(snap)
        elif name.startswith("listener."):
            snap = extractor.build_snapshot(name, tensor, "listener")
            if snap:
                listener_snapshots.append(snap)

    # Extract attention weights from the listener
    if attn_weights is not None:
        attn_np = attn_weights[0].detach().cpu().numpy()
        if attn_np.ndim >= 2:
            attention_flows.append(
                AttentionConnection(
                    source_layer="listener.attn_query",
                    target_layer="listener.attn_key",
                    weights=attn_np.tolist(),
                    timestamp=time.time(),
                )
            )

    # Restore training mode
    speaker.train()
    listener.train()

    result = CaptureResult(
        session_id=session_id,
        timestamp=time.time(),
        speaker_layers=speaker_snapshots,
        listener_layers=listener_snapshots,
        attention_flows=attention_flows,
        input_info={
            "target_features": target_features.tolist(),
            "message_indices": message_indices[0].cpu().tolist() if message_indices is not None else [],
        },
    )

    _latest_captures[session_id] = result
    return result


def _snapshot_to_dict(snap: ActivationSnapshot) -> Dict:
    return {
        "layer_name": snap.layer_name,
        "neuron_values": snap.neuron_values,
        "timestamp": snap.timestamp,
        "shape": snap.shape,
        "agent": snap.agent,
        "stats": snap.stats,
    }


def _attention_to_dict(attn: AttentionConnection) -> Dict:
    return {
        "source_layer": attn.source_layer,
        "target_layer": attn.target_layer,
        "weights": attn.weights,
        "timestamp": attn.timestamp,
    }


def _capture_to_dict(result: CaptureResult) -> Dict:
    return {
        "session_id": result.session_id,
        "timestamp": result.timestamp,
        "speaker_layers": [_snapshot_to_dict(s) for s in result.speaker_layers],
        "listener_layers": [_snapshot_to_dict(s) for s in result.listener_layers],
        "attention_flows": [_attention_to_dict(a) for a in result.attention_flows],
        "input_info": result.input_info,
    }


# ─────────────────────────── API Endpoints ─────────────────────────── #


@router.get("/layers")
async def get_layers(session_id: Optional[str] = None):
    """List all hooked model layers, grouped by agent."""
    layers = extractor.get_layer_names()
    if not layers:
        # Return demo layers if no model is hooked
        return {
            "speaker": [
                "speaker.encoder.0",   # Linear
                "speaker.encoder.2",   # Linear
                "speaker.message_head",
            ],
            "listener": [
                "listener.token_encoder.0",
                "listener.token_encoder.2",
                "listener.candidate_encoder.0",
                "listener.candidate_encoder.2",
                "listener.attn_query",
                "listener.attn_key",
                "listener.attn_value",
                "listener.scorer.0",
                "listener.scorer.2",
            ],
        }
    return layers


@router.get("/activations/{session_id}")
async def get_activations(session_id: str):
    """Get the latest activation capture for a session."""
    result = _latest_captures.get(session_id)
    if result:
        return _capture_to_dict(result)

    # Return demo data if no capture exists
    return _generate_demo_capture(session_id)


@router.post("/capture/{session_id}")
async def trigger_capture(session_id: str):
    """Trigger one inference step and capture all activations."""
    from services.session_manager import SessionManager

    # Try to get the trainer from the global session manager
    # We need to import it - it's initialized in main.py
    try:
        # Access the global session_manager from main module
        import main
        trainer = main.session_manager.get_trainer(session_id)
    except Exception:
        trainer = None

    if trainer is None:
        # Return demo capture when no trainer available
        demo = _generate_demo_capture(session_id)
        _latest_captures[session_id] = None  # Mark as having tried
        return {
            "status": "demo",
            "message": "No active trainer found. Using demo data.",
            "data": demo,
        }

    try:
        result = _run_capture(session_id, trainer)
        if result:
            data = _capture_to_dict(result)
            # Notify WebSocket clients
            await _notify_neural_clients(session_id, data)
            return {"status": "ok", "data": data}
        else:
            return {"status": "error", "message": "Failed to capture activations"}
    except Exception as e:
        logger.error(f"Capture error for session {session_id}: {e}")
        return {"status": "error", "message": str(e)}


@router.get("/demo")
async def get_demo_data():
    """Return demo activation data for visualization without a real model."""
    return _generate_demo_capture("demo")


# ─────────────────────────── Demo Data Generator ─────────────────────────── #


def _generate_demo_capture(session_id: str) -> Dict:
    """Generate realistic demo activation data for visualization."""
    now = time.time()

    # Speaker layers: encoder.0, encoder.2, message_head
    speaker_layers = [
        _make_demo_snapshot("speaker.encoder.0", "speaker", [1, 128], now),
        _make_demo_snapshot("speaker.encoder.2", "speaker", [1, 128], now),
        _make_demo_snapshot("speaker.message_head", "speaker", [1, 100], now),
    ]

    # Listener layers
    listener_layers = [
        _make_demo_snapshot("listener.token_encoder.0", "listener", [1, 128], now),
        _make_demo_snapshot("listener.token_encoder.2", "listener", [1, 128], now),
        _make_demo_snapshot("listener.candidate_encoder.0", "listener", [1, 128], now),
        _make_demo_snapshot("listener.candidate_encoder.2", "listener", [1, 128], now),
        _make_demo_snapshot("listener.attn_query", "listener", [1, 128], now),
        _make_demo_snapshot("listener.attn_key", "listener", [1, 128], now),
        _make_demo_snapshot("listener.attn_value", "listener", [1, 128], now),
        _make_demo_snapshot("listener.scorer.0", "listener", [1, 128], now),
        _make_demo_snapshot("listener.scorer.2", "listener", [1, 1], now),
    ]

    # Attention weights: msg_len x num_candidates
    attn_weights = np.random.dirichlet(np.ones(10), size=5).tolist()

    result = {
        "session_id": session_id,
        "timestamp": now,
        "speaker_layers": [_snapshot_to_dict(s) for s in speaker_layers],
        "listener_layers": [_snapshot_to_dict(s) for s in listener_layers],
        "attention_flows": [
            {
                "source_layer": "listener.attn_query",
                "target_layer": "listener.attn_key",
                "weights": attn_weights,
                "timestamp": now,
            }
        ],
        "input_info": {
            "target_features": np.random.randn(8).tolist(),
            "message_indices": [int(x) for x in np.random.randint(0, 20, size=5)],
        },
    }

    return result


def _make_demo_snapshot(
    name: str, agent: str, shape: List[int], timestamp: float
) -> ActivationSnapshot:
    """Create a single demo activation snapshot."""
    total = 1
    for s in shape:
        total *= s
    # Generate realistic-looking activations: mixture of normal distributions
    values = np.concatenate([
        np.random.normal(0.2, 0.3, size=total // 3),
        np.random.normal(-0.1, 0.2, size=total // 3),
        np.random.normal(0.0, 0.15, size=total - 2 * (total // 3)),
    ]).tolist()

    arr = np.array(values)
    stats = {
        "mean": float(np.mean(arr)),
        "std": float(np.std(arr)),
        "min": float(np.min(arr)),
        "max": float(np.max(arr)),
        "count": len(values),
    }

    return ActivationSnapshot(
        layer_name=name,
        neuron_values=values,
        timestamp=timestamp,
        shape=shape,
        agent=agent,
        stats=stats,
    )


# ─────────────────────────── WebSocket Neural Stream ─────────────────────────── #


async def _notify_neural_clients(session_id: str, data: Dict):
    """Push activation data to all connected WebSocket clients for a session."""
    clients = _neural_ws_clients.get(session_id, set())
    if not clients:
        return
    message = json.dumps({"type": "neural_update", "data": data}, default=str)
    disconnected = set()
    for ws in clients:
        try:
            await ws.send_text(message)
        except Exception:
            disconnected.add(ws)
    clients -= disconnected


@router.websocket("/ws/neural/{session_id}")
async def neural_websocket(websocket: WebSocket, session_id: str):
    """WebSocket endpoint for streaming neural activation data."""
    await websocket.accept()

    if session_id not in _neural_ws_clients:
        _neural_ws_clients[session_id] = set()
    _neural_ws_clients[session_id].add(websocket)

    logger.info(f"Neural WS client connected for session {session_id}")

    try:
        while True:
            try:
                data = await asyncio.wait_for(
                    websocket.receive_json(), timeout=15
                )
                msg_type = data.get("type", "")

                if msg_type == "ping":
                    await websocket.send_json({"type": "pong"})
                elif msg_type == "capture":
                    # Trigger a capture and send result
                    try:
                        import main
                        trainer = main.session_manager.get_trainer(session_id)
                    except Exception:
                        trainer = None

                    if trainer:
                        result = _run_capture(session_id, trainer)
                        if result:
                            await websocket.send_json({
                                "type": "neural_update",
                                "data": _capture_to_dict(result),
                            })
                    else:
                        demo = _generate_demo_capture(session_id)
                        await websocket.send_json({
                            "type": "neural_update",
                            "data": demo,
                        })

            except asyncio.TimeoutError:
                # Send heartbeat
                try:
                    await websocket.send_json({"type": "heartbeat"})
                except Exception:
                    break

    except WebSocketDisconnect:
        pass
    except Exception as e:
        logger.error(f"Neural WS error for session {session_id}: {e}")
    finally:
        _neural_ws_clients.get(session_id, set()).discard(websocket)
        logger.info(f"Neural WS client disconnected for session {session_id}")


# ─────────────────────────── Register in main ─────────────────────────── #


def register_neural_routes(app):
    """Register the neural visualizer routes on the FastAPI app."""
    app.include_router(router)
    logger.info("Neural Visualizer routes registered")
