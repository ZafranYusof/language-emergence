"""Emergent World Simulation – persistent 2D grid world where agents live,
move, interact with objects, and develop language from survival needs."""

from __future__ import annotations

import asyncio
import heapq
import json
import logging
import math
import os
import random
import time
from dataclasses import dataclass, field
from enum import Enum
from pathlib import Path
from typing import Any, Dict, List, Optional, Tuple

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

logger = logging.getLogger(__name__)

# ── constants ───────────────────────────────────────────────────────────────

GRID_W, GRID_H = 20, 20
COMM_RANGE = 5
ENERGY_DECAY_PER_TICK = 0.5
FOOD_ENERGY_RESTORE = 25
WATER_HEALTH_RESTORE = 15
TOOL_GATHER_BONUS = 2.0
DANGER_SPAWN_CHANCE = 0.02
DANGER_DAMAGE = 10
INITIAL_AGENTS = 5
AGENT_NAMES = ["NOVA", "PRISM", "ECHO", "FLUX", "NEXUS"]
AGENT_COLORS = ["#00ddff", "#ffaa00", "#aa66ff", "#00ff88", "#ff66aa"]

SAVE_DIR = Path(__file__).parent / "data" / "world"

router = APIRouter(prefix="/api/world")

# ── models ──────────────────────────────────────────────────────────────────


class ObjectType(str, Enum):
    EMPTY = "empty"
    TREE = "tree"
    WATER = "water"
    FOOD = "food"
    TOOL = "tool"
    DANGER = "danger"


class Direction(str, Enum):
    UP = "up"
    DOWN = "down"
    LEFT = "left"
    RIGHT = "right"


@dataclass
class WorldObject:
    type: ObjectType
    quantity: int = 10
    respawn_timer: float = 0
    max_quantity: int = 10

    def to_dict(self):
        return {
            "type": self.type.value,
            "quantity": self.quantity,
            "respawn_timer": round(self.respawn_timer, 1),
        }

    @classmethod
    def from_dict(cls, d):
        return cls(
            type=ObjectType(d["type"]),
            quantity=d.get("quantity", 10),
            respawn_timer=d.get("respawn_timer", 0),
        )


@dataclass
class AgentState:
    agent_id: str
    name: str
    color: str
    x: int = 0
    y: int = 0
    energy: float = 100.0
    health: float = 100.0
    direction: Direction = Direction.DOWN
    inventory: Dict[str, int] = field(default_factory=dict)
    messages: List[Dict[str, Any]] = field(default_factory=list)
    target: Optional[Tuple[int, int]] = None
    path: List[Tuple[int, int]] = field(default_factory=list)
    gather_cooldown: float = 0.0

    def to_dict(self):
        return {
            "agent_id": self.agent_id,
            "name": self.name,
            "color": self.color,
            "x": self.x,
            "y": self.y,
            "energy": round(self.energy, 1),
            "health": round(self.health, 1),
            "direction": self.direction.value,
            "inventory": self.inventory,
            "messages": self.messages[-10:],
            "target": list(self.target) if self.target else None,
            "alive": self.energy > 0 and self.health > 0,
        }


@dataclass
class WorldGrid:
    width: int = GRID_W
    height: int = GRID_H
    cells: Dict[Tuple[int, int], WorldObject] = field(default_factory=dict)

    def get(self, x: int, y: int) -> WorldObject:
        return self.cells.get((x, y), WorldObject(ObjectType.EMPTY))

    def set(self, x: int, y: int, obj: WorldObject):
        self.cells[(x, y)] = obj


class ChatBubble:
    """Represents a floating chat message."""
    def __init__(self, agent_id: str, text: str, x: int, y: int, ttl: float = 6.0):
        self.agent_id = agent_id
        self.text = text
        self.x = x
        self.y = y
        self.ttl = ttl
        self.created = time.time()

    def is_alive(self):
        return (time.time() - self.created) < self.ttl

    def to_dict(self):
        return {
            "agent_id": self.agent_id,
            "text": self.text,
            "x": self.x,
            "y": self.y,
            "ttl_remaining": round(self.ttl - (time.time() - self.created), 1),
        }


# ── A* pathfinding ──────────────────────────────────────────────────────────

def astar(
    start: Tuple[int, int],
    goal: Tuple[int, int],
    grid: WorldGrid,
    agents_pos: set,
) -> List[Tuple[int, int]]:
    """A* on the 20x20 grid.  Avoids danger cells and other agents."""
    if start == goal:
        return []
    open_set: List[Tuple[float, Tuple[int, int]]] = []
    heapq.heappush(open_set, (0.0, start))
    came_from: Dict[Tuple[int, int], Tuple[int, int]] = {}
    g_score: Dict[Tuple[int, int], float] = {start: 0}

    def h(n):
        return abs(n[0] - goal[0]) + abs(n[1] - goal[1])

    while open_set:
        _, current = heapq.heappop(open_set)
        if current == goal:
            path = [current]
            while current in came_from:
                current = came_from[current]
                path.append(current)
            path.reverse()
            return path[1:]  # exclude start position

        for dx, dy in [(0, 1), (0, -1), (1, 0), (-1, 0)]:
            nx, ny = current[0] + dx, current[1] + dy
            if not (0 <= nx < GRID_W and 0 <= ny < GRID_H):
                continue
            cell = grid.get(nx, ny)
            if cell.type == ObjectType.DANGER:
                continue
            if (nx, ny) in agents_pos and (nx, ny) != goal:
                continue
            tentative = g_score[current] + 1
            if tentative < g_score.get((nx, ny), float("inf")):
                came_from[(nx, ny)] = current
                g_score[(nx, ny)] = tentative
                f = tentative + h((nx, ny))
                heapq.heappush(open_set, (f, (nx, ny)))
    return []


# ── Simulation Engine ───────────────────────────────────────────────────────

class SimulationEngine:
    """Tick-based simulation managing agents, objects, and language emergence."""

    def __init__(self):
        self.grid = WorldGrid()
        self.agents: List[AgentState] = []
        self.chat_bubbles: List[ChatBubble] = []
        self.tick_count: int = 0
        self.running: bool = False
        self.tick_speed: float = 1.0  # seconds per tick
        self.stats = {"messages_sent": 0, "objects_gathered": 0, "dangers_encountered": 0}
        self._task: Optional[asyncio.Task] = None
        self._init_world()

    # ── initialization ──────────────────────────────────────────────────────

    def _init_world(self):
        """Place objects and agents on the grid."""
        self.grid.cells.clear()
        self.agents.clear()
        self.chat_bubbles.clear()
        self.tick_count = 0
        self.stats = {"messages_sent": 0, "objects_gathered": 0, "dangers_encountered": 0}

        # Place objects – use weighted random distribution
        object_weights = {
            ObjectType.TREE: 0.22,
            ObjectType.WATER: 0.15,
            ObjectType.FOOD: 0.18,
            ObjectType.TOOL: 0.08,
            ObjectType.DANGER: 0.05,
        }
        for x in range(GRID_W):
            for y in range(GRID_H):
                roll = random.random()
                cumulative = 0.0
                placed = False
                for otype, weight in object_weights.items():
                    cumulative += weight
                    if roll < cumulative:
                        self.grid.set(x, y, WorldObject(otype, quantity=random.randint(3, 10)))
                        placed = True
                        break
                if not placed:
                    pass  # leave empty

        # Place agents in safe starting positions
        used_positions = set()
        for i in range(INITIAL_AGENTS):
            while True:
                sx, sy = random.randint(2, GRID_W - 3), random.randint(2, GRID_H - 3)
                if (sx, sy) not in used_positions and self.grid.get(sx, sy).type != ObjectType.DANGER:
                    break
            used_positions.add((sx, sy))
            agent = AgentState(
                agent_id=f"agent_{i}",
                name=AGENT_NAMES[i % len(AGENT_NAMES)],
                color=AGENT_COLORS[i % len(AGENT_COLORS)],
                x=sx,
                y=sy,
                inventory={},
            )
            self.agents.append(agent)

    # ── tick ────────────────────────────────────────────────────────────────

    async def tick(self) -> Dict[str, Any]:
        """Execute one simulation tick and return the world state delta."""
        self.tick_count += 1
        events: List[Dict[str, Any]] = []
        agents_pos = {(a.x, a.y) for a in self.agents if a.energy > 0 and a.health > 0}

        for agent in self.agents:
            if agent.energy <= 0 or agent.health <= 0:
                continue

            # 1) Energy decay
            agent.energy -= ENERGY_DECAY_PER_TICK
            if agent.energy <= 0:
                agent.energy = 0
                events.append({"type": "death", "agent": agent.name, "reason": "starvation"})
                continue

            # 2) Reduce cooldowns
            agent.gather_cooldown = max(0, agent.gather_cooldown - 1)

            # 3) Decide movement target if none
            if not agent.target or (agent.x, agent.y) == agent.target:
                agent.target = self._pick_target(agent)
                agent.path = astar((agent.x, agent.y), agent.target, self.grid, agents_pos)

            # 4) Move along path
            if agent.path:
                next_cell = agent.path.pop(0)
                dx = next_cell[0] - agent.x
                dy = next_cell[1] - agent.y
                if dx > 0:
                    agent.direction = Direction.RIGHT
                elif dx < 0:
                    agent.direction = Direction.LEFT
                elif dy > 0:
                    agent.direction = Direction.DOWN
                elif dy < 0:
                    agent.direction = Direction.UP

                agents_pos.discard((agent.x, agent.y))
                agent.x, agent.y = next_cell
                agents_pos.add((agent.x, agent.y))

            # 5) Interact with current cell
            cell = self.grid.get(agent.x, agent.y)
            interaction = self._interact(agent, cell)
            if interaction:
                events.append(interaction)

            # 6) Check danger proximity
            danger_event = self._check_danger(agent)
            if danger_event:
                events.append(danger_event)

        # 7) Random danger spawning
        if random.random() < DANGER_SPAWN_CHANCE:
            dx, dy = random.randint(0, GRID_W - 1), random.randint(0, GRID_H - 1)
            current = self.grid.get(dx, dy)
            if current.type == ObjectType.EMPTY:
                self.grid.set(dx, dy, WorldObject(ObjectType.DANGER, quantity=1, max_quantity=1))
                events.append({"type": "danger_spawn", "x": dx, "y": dy})

        # 8) Respawn depleted objects
        self._respawn_objects()

        # 9) Generate language from events
        for ev in events:
            if ev.get("type") in ("found_food", "found_water", "found_tool", "danger_nearby", "danger_spawn"):
                msg_text = self._generate_language(ev)
                if msg_text:
                    source_agent = ev.get("agent", "world")
                    for a in self.agents:
                        if a.name == source_agent:
                            bubble = ChatBubble(a.agent_id, msg_text, a.x, a.y)
                            self.chat_bubbles.append(bubble)
                            a.messages.append({"tick": self.tick_count, "text": msg_text, "event": ev["type"]})
                            self.stats["messages_sent"] += 1
                            events.append({"type": "chat", "agent": a.name, "text": msg_text, "x": a.x, "y": a.y})
                            break

        # Prune dead chat bubbles
        self.chat_bubbles = [b for b in self.chat_bubbles if b.is_alive()]

        return {
            "tick": self.tick_count,
            "events": events,
        }

    def _pick_target(self, agent: AgentState) -> Tuple[int, int]:
        """Pick a target cell for the agent based on needs."""
        if agent.energy < 40:
            target = self._find_nearest(agent.x, agent.y, ObjectType.FOOD)
            if target:
                return target
        if agent.health < 50:
            target = self._find_nearest(agent.x, agent.y, ObjectType.WATER)
            if target:
                return target
        if agent.inventory.get("tool", 0) == 0:
            target = self._find_nearest(agent.x, agent.y, ObjectType.TOOL)
            if target:
                return target
        return (random.randint(0, GRID_W - 1), random.randint(0, GRID_H - 1))

    def _find_nearest(self, x: int, y: int, obj_type: ObjectType) -> Optional[Tuple[int, int]]:
        """Find nearest cell of given type."""
        best, best_dist = None, float("inf")
        for (cx, cy), obj in self.grid.cells.items():
            if obj.type == obj_type and obj.quantity > 0:
                d = abs(cx - x) + abs(cy - y)
                if d < best_dist:
                    best_dist = d
                    best = (cx, cy)
        return best

    def _interact(self, agent: AgentState, cell: WorldObject) -> Optional[Dict[str, Any]]:
        """Agent interacts with the cell object."""
        if cell.type == ObjectType.EMPTY or cell.quantity <= 0:
            return None
        if agent.gather_cooldown > 0:
            return None

        tool_bonus = TOOL_GATHER_BONUS if agent.inventory.get("tool", 0) > 0 else 1.0

        if cell.type == ObjectType.FOOD:
            agent.energy = min(100, agent.energy + FOOD_ENERGY_RESTORE)
            cell.quantity -= 1
            agent.inventory["food"] = agent.inventory.get("food", 0) + 1
            agent.gather_cooldown = 2 / tool_bonus
            self.stats["objects_gathered"] += 1
            return {"type": "found_food", "agent": agent.name, "x": agent.x, "y": agent.y, "energy": round(agent.energy, 1)}

        if cell.type == ObjectType.WATER:
            agent.health = min(100, agent.health + WATER_HEALTH_RESTORE)
            cell.quantity -= 1
            agent.inventory["water"] = agent.inventory.get("water", 0) + 1
            agent.gather_cooldown = 1
            self.stats["objects_gathered"] += 1
            return {"type": "found_water", "agent": agent.name, "x": agent.x, "y": agent.y, "health": round(agent.health, 1)}

        if cell.type == ObjectType.TOOL:
            cell.quantity -= 1
            agent.inventory["tool"] = agent.inventory.get("tool", 0) + 1
            agent.gather_cooldown = 3
            self.stats["objects_gathered"] += 1
            return {"type": "found_tool", "agent": agent.name, "x": agent.x, "y": agent.y}

        if cell.type == ObjectType.TREE:
            cell.quantity -= 1
            agent.inventory["wood"] = agent.inventory.get("wood", 0) + 1
            agent.gather_cooldown = 4 / tool_bonus
            self.stats["objects_gathered"] += 1
            return {"type": "gathered_wood", "agent": agent.name, "x": agent.x, "y": agent.y}

        if cell.type == ObjectType.DANGER:
            agent.health -= DANGER_DAMAGE
            agent.energy -= 5
            agent.target = None
            agent.path = []
            self.stats["dangers_encountered"] += 1
            return {"type": "danger_nearby", "agent": agent.name, "x": agent.x, "y": agent.y, "damage": DANGER_DAMAGE, "health": round(agent.health, 1)}

        return None

    def _check_danger(self, agent: AgentState) -> Optional[Dict[str, Any]]:
        """Check if adjacent cells contain danger and warn."""
        for dx, dy in [(-1, 0), (1, 0), (0, -1), (0, 1), (-1, -1), (-1, 1), (1, -1), (1, 1)]:
            nx, ny = agent.x + dx, agent.y + dy
            if 0 <= nx < GRID_W and 0 <= ny < GRID_H:
                cell = self.grid.get(nx, ny)
                if cell.type == ObjectType.DANGER and cell.quantity > 0:
                    return {"type": "danger_nearby", "agent": agent.name, "x": nx, "y": ny}
        return None

    def _respawn_objects(self):
        """Respawn depleted objects over time."""
        for (x, y), obj in self.grid.cells.items():
            if obj.quantity <= 0 and obj.type != ObjectType.DANGER:
                obj.respawn_timer += 1
                if obj.respawn_timer >= 10:
                    obj.quantity = obj.max_quantity
                    obj.respawn_timer = 0
            if obj.type == ObjectType.DANGER:
                obj.respawn_timer += 1
                if obj.respawn_timer >= 15:
                    self.grid.set(x, y, WorldObject(ObjectType.EMPTY))

    def _generate_language(self, event: Dict[str, Any]) -> Optional[str]:
        """Generate a language message based on event using templates."""
        templates = {
            "found_food": [
                f"Found food at ({event.get('x')},{event.get('y')})! Energy now {event.get('energy')}%",
                f"Food here! Come to ({event.get('x')},{event.get('y')})",
                f"Eating! Energy restored to {event.get('energy')}%",
            ],
            "found_water": [
                f"Water found at ({event.get('x')},{event.get('y')})! Health now {event.get('health')}%",
                f"Fresh water here! ({event.get('x')},{event.get('y')})",
            ],
            "found_tool": [
                f"Tool acquired at ({event.get('x')},{event.get('y')})! Gathering bonus active",
                f"Found a tool! I can gather faster now",
            ],
            "danger_nearby": [
                f"DANGER at ({event.get('x')},{event.get('y')})! Stay away!",
                f"Warning! Danger zone nearby! ({event.get('x')},{event.get('y')})",
                f"Evade! Danger detected near ({event.get('x')},{event.get('y')})!",
            ],
            "danger_spawn": [
                f"New danger zone spawned at ({event.get('x')},{event.get('y')})!",
                f"Alert: danger at ({event.get('x')},{event.get('y')})!",
            ],
        }
        key = event.get("type", "")
        if key in templates:
            return random.choice(templates[key])
        return None

    # ── world state snapshot ────────────────────────────────────────────────

    def get_state(self) -> Dict[str, Any]:
        """Return full world state for frontend rendering."""
        objects_list = []
        for (x, y), obj in self.grid.cells.items():
            if obj.type != ObjectType.EMPTY:
                objects_list.append({"x": x, "y": y, **obj.to_dict()})

        return {
            "tick": self.tick_count,
            "running": self.running,
            "tick_speed": self.tick_speed,
            "grid": {"width": GRID_W, "height": GRID_H},
            "agents": [a.to_dict() for a in self.agents],
            "objects": objects_list,
            "chat_bubbles": [b.to_dict() for b in self.chat_bubbles if b.is_alive()],
            "stats": self.stats,
        }

    # ── persistence ────────────────────────────────────────────────────────

    def save(self, path: Optional[Path] = None):
        """Save world state to JSON."""
        path = path or (SAVE_DIR / "world_state.json")
        path.parent.mkdir(parents=True, exist_ok=True)
        data = {
            "tick_count": self.tick_count,
            "stats": self.stats,
            "grid_cells": [
                {"x": x, "y": y, **obj.to_dict()}
                for (x, y), obj in self.grid.cells.items()
                if obj.type != ObjectType.EMPTY
            ],
            "agents": [
                {
                    **a.to_dict(),
                    "path": [(p[0], p[1]) for p in a.path],
                }
                for a in self.agents
            ],
        }
        path.write_text(json.dumps(data, indent=2))

    def load(self, path: Optional[Path] = None):
        """Load world state from JSON."""
        path = path or (SAVE_DIR / "world_state.json")
        if not path.exists():
            return False
        data = json.loads(path.read_text())
        self.tick_count = data.get("tick_count", 0)
        self.stats = data.get("stats", self.stats)
        self.grid.cells.clear()
        for item in data.get("grid_cells", []):
            x, y = item["x"], item["y"]
            self.grid.set(x, y, WorldObject.from_dict(item))
        self.agents.clear()
        for ad in data.get("agents", []):
            agent = AgentState(
                agent_id=ad["agent_id"],
                name=ad["name"],
                color=ad["color"],
                x=ad["x"],
                y=ad["y"],
                energy=ad.get("energy", 100),
                health=ad.get("health", 100),
                direction=Direction(ad.get("direction", "down")),
                inventory=ad.get("inventory", {}),
                messages=ad.get("messages", []),
                path=[(p[0], p[1]) for p in ad.get("path", [])],
            )
            self.agents.append(agent)
        return True

    # ── async loop ──────────────────────────────────────────────────────────

    async def _run_loop(self):
        """Background tick loop."""
        while self.running:
            await self.tick()
            await asyncio.sleep(self.tick_speed)

    def start(self):
        if self.running:
            return
        self.running = True
        try:
            loop = asyncio.get_running_loop()
            self._task = loop.create_task(self._run_loop())
        except RuntimeError:
            pass

    def stop(self):
        self.running = False
        if self._task:
            self._task.cancel()
            self._task = None

    def reset(self):
        self.stop()
        self._init_world()


# ── singleton ───────────────────────────────────────────────────────────────

_engine: Optional[SimulationEngine] = None


def get_engine() -> SimulationEngine:
    global _engine
    if _engine is None:
        _engine = SimulationEngine()
        _engine.load()
    return _engine


# ── API endpoints ───────────────────────────────────────────────────────────

@router.get("/state")
async def get_world_state():
    """Return the full world state."""
    return get_engine().get_state()


@router.post("/tick")
async def advance_tick():
    """Advance the simulation by one tick."""
    engine = get_engine()
    result = await engine.tick()
    return {**result, "state": engine.get_state()}


@router.post("/start")
async def start_simulation():
    """Start the automatic tick loop."""
    engine = get_engine()
    engine.start()
    return {"status": "started", "tick_speed": engine.tick_speed}


@router.post("/stop")
async def stop_simulation():
    """Stop the automatic tick loop."""
    engine = get_engine()
    engine.stop()
    return {"status": "stopped", "tick": engine.tick_count}


@router.post("/reset")
async def reset_simulation():
    """Reset the world to a fresh state."""
    engine = get_engine()
    engine.reset()
    return {"status": "reset", "state": engine.get_state()}


@router.post("/save")
async def save_world():
    """Persist world state to disk."""
    engine = get_engine()
    engine.save()
    return {"status": "saved"}


class WorldConfig(BaseModel):
    tick_speed: Optional[float] = None
    grid_width: Optional[int] = None
    grid_height: Optional[int] = None


@router.post("/config")
async def update_config(cfg: WorldConfig):
    """Update simulation configuration."""
    engine = get_engine()
    if cfg.tick_speed is not None:
        engine.tick_speed = max(0.1, min(10.0, cfg.tick_speed))
    return {"status": "updated", "tick_speed": engine.tick_speed}
