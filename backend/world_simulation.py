"""Emergent World Simulation – persistent 2D grid world where agents live,
move, interact with objects, and develop language from survival needs.

Enhanced with biomes, crafting, buildings, relationships, day/night cycle,
weather, quests, wildlife, experience/leveling, and agent communication.
"""

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
AGENT_PERSONALITIES = ["brave", "cautious", "friendly", "loner", "curious"]

# ── Rich dialog templates ───────────────────────────────────────────────────
DIALOG_TEMPLATES = {
    "greeting": [
        "Hey {target}! Good to see you.",
        "{target}! Thought I lost you out here.",
        "Over here, {target}! Let's stick together.",
        "Finally, a friendly face. Hey {target}!",
        "{target}! Watcha doing in these parts?",
    ],
    "farewell": [
        "Heading out. Stay safe.",
        "Gotta go find resources. Later!",
        "I'm off. Don't die without me.",
        "Moving on. Cover me if you can.",
        "Exploring that way. Wish me luck.",
    ],
    "celebration": [
        "LEVEL UP! I feel stronger now!",
        "Quest done! That was a good one.",
        "Yes! Just crafted something awesome.",
        "I'm getting good at this survival thing.",
        "Another quest complete. What's next?",
    ],
    "complaint": [
        "Ugh, I'm starving...",
        "Everything hurts. Need rest.",
        "This weather is terrible.",
        "Why is everything trying to kill me?",
        "Running on empty here...",
    ],
    "discovery": [
        "Whoa, look at this place!",
        "Found something interesting over here!",
        "There's good stuff at this location.",
        "Jackpot! Resources everywhere.",
        "This biome is beautiful, not gonna lie.",
    ],
    "trade_offer": [
        "Hey, I've got extra food. Need some?",
        "I can share resources if you're low.",
        "Want to trade? I have {item}.",
        "You look hungry. Here, take this.",
        "Splitting my supplies. We're a team.",
    ],
    "warning": [
        "DANGER! Stay away from here!",
        "Watch out! Something's not right!",
        "Move! Danger zone ahead!",
        "Don't go that way. Trust me.",
        "Warning! Hostile area! Turn back!",
    ],
    "philosophical": [
        "Why do we gather... if we just consume?",
        "Is this grid all there is to life?",
        "I wonder what's beyond the edge.",
        "Do the dangers think about us too?",
        "We build shelters, but are we really safe?",
    ],
    "question": [
        "Anyone seen food nearby?",
        "Where's the nearest water source?",
        "Is there a campfire around here?",
        "Has anyone been to the mountain zone?",
        "Need tools. Anyone know where?",
    ],
    "response": [
        "Yeah, I know that spot!",
        "Thanks for the heads up!",
        "Copy that. On my way.",
        "Got it. Be careful out there.",
        "Noted. I'll check it out.",
    ],
    "group_call": [
        "Everyone, regroup at my position!",
        "Let's hunt together! More effective.",
        "All agents, converge here for safety.",
        "Group up! We're stronger together.",
        "Rally point! Bring your supplies.",
    ],
    "victory": [
        "Got it! That was a fight!",
        "Take that! Predator down!",
        "Hunt successful. We eat tonight!",
        "Another one bites the dust!",
        "Combat win! Feeling invincible!",
    ],
    "defeat_retreat": [
        "Ouch! Falling back!",
        "Too strong! Need to retreat!",
        "Taking damage! Help!",
        "I'm hurt! Pulling back to regroup.",
        "That hurt... need to be more careful.",
    ],
    "weather_comment": [
        "Rain again... everything's getting wet.",
        "Storm incoming! Find shelter!",
        "The fog makes it hard to see...",
        "Clear skies. Perfect for exploring.",
        "Weather's changing. Stay alert.",
    ],
    "night_fear": [
        "It's dark... I don't like this.",
        "Can barely see anything. Stay close.",
        "Night time is the worst. So many sounds...",
        "Wish I had a campfire right now.",
        "The darkness hides everything...",
    ],
    "morning_greeting": [
        "Dawn! Time to get moving!",
        "New day, new opportunities!",
        "Morning everyone! Let's make it count.",
        "Sun's up. Finally can see again.",
        "Good morning world. Let's survive today.",
    ],
    "idle_chat": [
        "Just taking a breather.",
        "Nice spot here. Peaceful.",
        "Hmm... what should I do next?",
        "Resting up before the next move.",
        "Quiet moment. Enjoying it while it lasts.",
    ],
}

SAVE_DIR = Path(__file__).parent / "data" / "world"

router = APIRouter(prefix="/api/world")

# ── new enums ───────────────────────────────────────────────────────────────


class Biome(str, Enum):
    FOREST = "forest"
    LAKE = "lake"
    DESERT = "desert"
    MOUNTAIN = "mountain"
    MEADOW = "meadow"


class TimePhase(str, Enum):
    DAY = "day"
    NIGHT = "night"


class Weather(str, Enum):
    CLEAR = "clear"
    RAIN = "rain"
    STORM = "storm"
    FOG = "fog"


class BuildingType(str, Enum):
    SHELTER = "shelter"
    CAMPFIRE = "campfire"
    WATCHTOWER = "watchtower"


class WildlifeType(str, Enum):
    RABBIT = "rabbit"
    DEER = "deer"
    WOLF = "wolf"
    BEAR = "bear"


class QuestType(str, Enum):
    GATHER = "gather"
    REACH = "reach"
    BUILD = "build"
    HUNT = "hunt"
    CRAFT = "craft"


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


# ── crafting recipes ────────────────────────────────────────────────────────

CRAFTING_RECIPES: Dict[str, Dict[str, Any]] = {
    "shelter": {"requires": {"wood": 3, "stone": 2}, "result": "shelter", "xp": 30},
    "campfire": {"requires": {"wood": 2, "stone": 1}, "result": "campfire", "xp": 20},
    "watchtower": {"requires": {"wood": 4, "stone": 3}, "result": "watchtower", "xp": 50},
    "feast": {"requires": {"food": 2, "water": 2}, "result": "feast", "xp": 15, "consumable": True},
    "bandage": {"requires": {"food": 1, "wood": 1}, "result": "bandage", "xp": 10, "consumable": True},
}

# ── biome definitions ───────────────────────────────────────────────────────

BIOME_WEIGHTS: Dict[Biome, Dict[ObjectType, float]] = {
    Biome.FOREST: {
        ObjectType.TREE: 0.45,
        ObjectType.WATER: 0.05,
        ObjectType.FOOD: 0.10,
        ObjectType.TOOL: 0.05,
        ObjectType.DANGER: 0.06,
    },
    Biome.LAKE: {
        ObjectType.TREE: 0.05,
        ObjectType.WATER: 0.45,
        ObjectType.FOOD: 0.15,
        ObjectType.TOOL: 0.02,
        ObjectType.DANGER: 0.03,
    },
    Biome.DESERT: {
        ObjectType.TREE: 0.02,
        ObjectType.WATER: 0.02,
        ObjectType.FOOD: 0.05,
        ObjectType.TOOL: 0.03,
        ObjectType.DANGER: 0.08,
    },
    Biome.MOUNTAIN: {
        ObjectType.TREE: 0.05,
        ObjectType.WATER: 0.05,
        ObjectType.FOOD: 0.05,
        ObjectType.TOOL: 0.20,
        ObjectType.DANGER: 0.12,
    },
    Biome.MEADOW: {
        ObjectType.TREE: 0.05,
        ObjectType.WATER: 0.10,
        ObjectType.FOOD: 0.40,
        ObjectType.TOOL: 0.03,
        ObjectType.DANGER: 0.02,
    },
}

# travel cost multipliers per biome
BIOME_MOVE_COST: Dict[Biome, float] = {
    Biome.FOREST: 1.2,
    Biome.LAKE: 1.5,
    Biome.DESERT: 1.3,
    Biome.MOUNTAIN: 1.8,
    Biome.MEADOW: 1.0,
}


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
class Building:
    type: BuildingType
    x: int
    y: int
    owner_id: str
    built_tick: int = 0
    durability: float = 100.0

    def to_dict(self):
        return {
            "type": self.type.value,
            "x": self.x,
            "y": self.y,
            "owner_id": self.owner_id,
            "built_tick": self.built_tick,
            "durability": round(self.durability, 1),
        }

    @classmethod
    def from_dict(cls, d):
        return cls(
            type=BuildingType(d["type"]),
            x=d["x"],
            y=d["y"],
            owner_id=d["owner_id"],
            built_tick=d.get("built_tick", 0),
            durability=d.get("durability", 100.0),
        )


@dataclass
class Wildlife:
    creature_id: str
    type: WildlifeType
    x: int
    y: int
    health: float = 30.0
    max_health: float = 30.0
    speed: float = 1.0
    aggro_range: int = 4
    wander_cooldown: float = 0

    @property
    def is_aggressive(self) -> bool:
        return self.type in (WildlifeType.WOLF, WildlifeType.BEAR)

    @property
    def food_yield(self) -> int:
        return 3 if self.type in (WildlifeType.DEER, WildlifeType.BEAR) else 1

    def to_dict(self):
        return {
            "creature_id": self.creature_id,
            "type": self.type.value,
            "x": self.x,
            "y": self.y,
            "health": round(self.health, 1),
            "max_health": round(self.max_health, 1),
            "is_aggressive": self.is_aggressive,
        }

    @classmethod
    def from_dict(cls, d):
        return cls(
            creature_id=d["creature_id"],
            type=WildlifeType(d["type"]),
            x=d["x"],
            y=d["y"],
            health=d.get("health", 30.0),
            max_health=d.get("max_health", 30.0),
        )


@dataclass
class Quest:
    quest_id: str
    quest_type: QuestType
    description: str
    target_count: int = 1
    current_count: int = 0
    reward_xp: int = 20
    reward_items: Dict[str, int] = field(default_factory=dict)
    target_position: Optional[Tuple[int, int]] = None
    target_item: str = ""
    completed: bool = False
    assigned_agent: str = ""

    def to_dict(self):
        return {
            "quest_id": self.quest_id,
            "quest_type": self.quest_type.value,
            "description": self.description,
            "target_count": self.target_count,
            "current_count": self.current_count,
            "reward_xp": self.reward_xp,
            "reward_items": self.reward_items,
            "target_position": list(self.target_position) if self.target_position else None,
            "target_item": self.target_item,
            "completed": self.completed,
            "assigned_agent": self.assigned_agent,
        }

    @classmethod
    def from_dict(cls, d):
        return cls(
            quest_id=d["quest_id"],
            quest_type=QuestType(d["quest_type"]),
            description=d["description"],
            target_count=d.get("target_count", 1),
            current_count=d.get("current_count", 0),
            reward_xp=d.get("reward_xp", 20),
            reward_items=d.get("reward_items", {}),
            target_position=tuple(d["target_position"]) if d.get("target_position") else None,
            target_item=d.get("target_item", ""),
            completed=d.get("completed", False),
            assigned_agent=d.get("assigned_agent", ""),
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
    max_energy: float = 100.0
    max_health: float = 100.0
    direction: Direction = Direction.DOWN
    inventory: Dict[str, int] = field(default_factory=dict)
    messages: List[Dict[str, Any]] = field(default_factory=list)
    target: Optional[Tuple[int, int]] = None
    path: List[Tuple[int, int]] = field(default_factory=list)
    gather_cooldown: float = 0.0
    # new fields
    xp: int = 0
    level: int = 1
    trust: Dict[str, float] = field(default_factory=dict)  # agent_id -> trust [0..1]
    active_quests: List[str] = field(default_factory=list)  # quest_ids
    last_message_sent: str = ""
    combat_cooldown: float = 0.0
    personality: str = ""
    mood: str = "neutral"
    current_action: str = "idle"

    def to_dict(self):
        return {
            "agent_id": self.agent_id,
            "name": self.name,
            "color": self.color,
            "x": self.x,
            "y": self.y,
            "energy": round(self.energy, 1),
            "health": round(self.health, 1),
            "max_energy": round(self.max_energy, 1),
            "max_health": round(self.max_health, 1),
            "direction": self.direction.value,
            "inventory": self.inventory,
            "messages": self.messages[-10:],
            "target": list(self.target) if self.target else None,
            "alive": self.energy > 0 and self.health > 0,
            "xp": self.xp,
            "level": self.level,
            "trust": {k: round(v, 2) for k, v in self.trust.items()},
            "active_quests": self.active_quests,
            "personality": self.personality,
            "mood": self.mood,
            "current_action": self.current_action,
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
    biome_map: Optional[Dict[Tuple[int, int], Biome]] = None,
) -> List[Tuple[int, int]]:
    """A* on the 20x20 grid. Avoids danger cells and other agents.
    Uses biome-aware travel costs when biome_map is provided."""
    if start == goal:
        return []
    open_set: List[Tuple[float, int, Tuple[int, int]]] = []
    counter = 0
    heapq.heappush(open_set, (0.0, counter, start))
    came_from: Dict[Tuple[int, int], Tuple[int, int]] = {}
    g_score: Dict[Tuple[int, int], float] = {start: 0}

    def h(n):
        return abs(n[0] - goal[0]) + abs(n[1] - goal[1])

    while open_set:
        _, _, current = heapq.heappop(open_set)
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
            move_cost = 1.0
            if biome_map and (nx, ny) in biome_map:
                move_cost = BIOME_MOVE_COST.get(biome_map[(nx, ny)], 1.0)
            tentative = g_score[current] + move_cost
            if tentative < g_score.get((nx, ny), float("inf")):
                came_from[(nx, ny)] = current
                g_score[(nx, ny)] = tentative
                f = tentative + h((nx, ny))
                counter += 1
                heapq.heappush(open_set, (f, counter, (nx, ny)))
    return []


# ── Simulation Engine ───────────────────────────────────────────────────────

class SimulationEngine:
    """Tick-based simulation managing agents, objects, and language emergence.
    Enhanced with biomes, crafting, buildings, relationships, day/night,
    weather, quests, wildlife, experience, and communication."""

    def __init__(self):
        self.grid = WorldGrid()
        self.agents: List[AgentState] = []
        self.chat_bubbles: List[ChatBubble] = []
        self.tick_count: int = 0
        self.running: bool = False
        self.tick_speed: float = 1.0  # seconds per tick
        self.stats = {"messages_sent": 0, "objects_gathered": 0, "dangers_encountered": 0}
        self._task: Optional[asyncio.Task] = None
        # new state
        self.biome_map: Dict[Tuple[int, int], Biome] = {}
        self.buildings: List[Building] = []
        self.wildlife: List[Wildlife] = []
        self.quests: List[Quest] = []
        self.time_phase: TimePhase = TimePhase.DAY
        self.weather: Weather = Weather.CLEAR
        self.day_tick: int = 0  # ticks into current day/night cycle
        self.day_length: int = 30  # ticks per half-cycle
        self.weather_tick: int = 0
        self.weather_length: int = 20  # ticks per weather period
        self._quest_counter: int = 0
        self._wildlife_counter: int = 0
        self.world_events: List[Dict[str, Any]] = []  # persistent event feed
        self._init_world()

    # ── initialization ──────────────────────────────────────────────────────

    def _init_world(self):
        """Place objects and agents on the grid."""
        self.grid.cells.clear()
        self.agents.clear()
        self.chat_bubbles.clear()
        self.tick_count = 0
        self.stats = {"messages_sent": 0, "objects_gathered": 0, "dangers_encountered": 0}
        self.buildings = []
        self.wildlife = []
        self.quests = []
        self.time_phase = TimePhase.DAY
        self.weather = Weather.CLEAR
        self.day_tick = 0
        self.weather_tick = 0
        self._quest_counter = 0
        self._wildlife_counter = 0
        self.world_events = []

        # Generate biomes — divide grid into 5 regions
        self.biome_map = self._generate_biomes()

        # Place objects using biome-specific weights
        for x in range(GRID_W):
            for y in range(GRID_H):
                biome = self.biome_map.get((x, y), Biome.MEADOW)
                weights = BIOME_WEIGHTS[biome]
                roll = random.random()
                cumulative = 0.0
                placed = False
                for otype, weight in weights.items():
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
                personality=AGENT_PERSONALITIES[i % len(AGENT_PERSONALITIES)],
            )
            # Initialize trust with all other agents
            for j in range(INITIAL_AGENTS):
                if j != i:
                    agent.trust[f"agent_{j}"] = 0.5
            self.agents.append(agent)

        # Spawn initial wildlife
        self._spawn_wildlife(count=6)

        # Generate initial quests
        self._generate_quests(count=3)

    def _generate_biomes(self) -> Dict[Tuple[int, int], Biome]:
        """Assign biome per cell using a simple region-based approach."""
        biome_map: Dict[Tuple[int, int], Biome] = {}
        cx, cy = GRID_W // 2, GRID_H // 2
        for x in range(GRID_W):
            for y in range(GRID_H):
                if abs(x - cx) <= 4 and abs(y - cy) <= 4:
                    biome = Biome.MEADOW
                elif x < cx and y < cy:
                    biome = Biome.FOREST
                elif x >= cx and y < cy:
                    biome = Biome.LAKE
                elif x < cx and y >= cy:
                    biome = Biome.DESERT
                else:
                    biome = Biome.MOUNTAIN
                # Small random border fuzz
                if random.random() < 0.10:
                    biome = random.choice(list(Biome))
                biome_map[(x, y)] = biome
        return biome_map

    def _spawn_wildlife(self, count: int = 1):
        """Spawn wildlife creatures on the grid."""
        for _ in range(count):
            wtype = random.choice(list(WildlifeType))
            wx, wy = 0, 0
            for attempt in range(20):
                wx, wy = random.randint(0, GRID_W - 1), random.randint(0, GRID_H - 1)
                if self.grid.get(wx, wy).type != ObjectType.DANGER:
                    break
            hp = 40.0 if wtype in (WildlifeType.DEER, WildlifeType.BEAR) else 20.0
            aggro = 5 if wtype == WildlifeType.BEAR else (4 if wtype == WildlifeType.WOLF else 0)
            self._wildlife_counter += 1
            creature = Wildlife(
                creature_id=f"wildlife_{self._wildlife_counter}",
                type=wtype,
                x=wx,
                y=wy,
                health=hp,
                max_health=hp,
                aggro_range=aggro,
            )
            self.wildlife.append(creature)

    def _generate_quests(self, count: int = 1):
        """Generate random quests for agents."""
        quest_templates = [
            (QuestType.GATHER, "Gather {n} {item}", ["wood", "food", "water", "stone"]),
            (QuestType.BUILD, "Build a {item}", ["shelter", "campfire", "watchtower"]),
            (QuestType.HUNT, "Hunt a {item}", ["rabbit", "deer", "wolf"]),
            (QuestType.CRAFT, "Craft a {item}", ["feast", "bandage", "shelter"]),
            (QuestType.REACH, "Reach position ({x},{y})", []),
        ]
        alive_agents = [a for a in self.agents if a.energy > 0 and a.health > 0]
        if not alive_agents:
            return

        for _ in range(count):
            qt, template, items = random.choice(quest_templates)
            agent = random.choice(alive_agents)
            self._quest_counter += 1
            qid = f"quest_{self._quest_counter}"

            if qt == QuestType.GATHER:
                item = random.choice(items)
                n = random.randint(2, 5)
                desc = template.format(n=n, item=item)
                quest = Quest(
                    quest_id=qid, quest_type=qt, description=desc,
                    target_count=n, reward_xp=15 * n, target_item=item,
                    assigned_agent=agent.agent_id,
                    reward_items={"food": 2},
                )
            elif qt == QuestType.BUILD:
                item = random.choice(items)
                desc = template.format(item=item)
                quest = Quest(
                    quest_id=qid, quest_type=qt, description=desc,
                    target_count=1, reward_xp=40, target_item=item,
                    assigned_agent=agent.agent_id,
                    reward_items={"food": 3, "water": 2},
                )
            elif qt == QuestType.HUNT:
                item = random.choice(items)
                desc = template.format(item=item)
                quest = Quest(
                    quest_id=qid, quest_type=qt, description=desc,
                    target_count=1, reward_xp=25, target_item=item,
                    assigned_agent=agent.agent_id,
                    reward_items={"food": 5},
                )
            elif qt == QuestType.CRAFT:
                item = random.choice(items)
                desc = template.format(item=item)
                quest = Quest(
                    quest_id=qid, quest_type=qt, description=desc,
                    target_count=1, reward_xp=30, target_item=item,
                    assigned_agent=agent.agent_id,
                )
            else:  # REACH
                tx, ty = random.randint(0, GRID_W - 1), random.randint(0, GRID_H - 1)
                desc = template.format(x=tx, y=ty)
                quest = Quest(
                    quest_id=qid, quest_type=qt, description=desc,
                    target_count=1, reward_xp=20,
                    target_position=(tx, ty),
                    assigned_agent=agent.agent_id,
                    reward_items={"tool": 1},
                )

            self.quests.append(quest)
            agent.active_quests.append(qid)

    # ── tick ────────────────────────────────────────────────────────────────

    async def tick(self) -> Dict[str, Any]:
        """Execute one simulation tick and return the world state delta."""
        self.tick_count += 1
        events: List[Dict[str, Any]] = []
        agents_pos = {(a.x, a.y) for a in self.agents if a.energy > 0 and a.health > 0}

        # ── Day/Night cycle ─────────────────────────────────────────────────
        self.day_tick += 1
        if self.day_tick >= self.day_length:
            self.day_tick = 0
            self.time_phase = TimePhase.NIGHT if self.time_phase == TimePhase.DAY else TimePhase.DAY
            events.append({"type": "phase_change", "phase": self.time_phase.value})

        # ── Weather system ──────────────────────────────────────────────────
        self.weather_tick += 1
        if self.weather_tick >= self.weather_length:
            self.weather_tick = 0
            old_weather = self.weather
            self.weather = random.choice(list(Weather))
            if self.weather != old_weather:
                events.append({"type": "weather_change", "weather": self.weather.value})
                # Storm spawns extra dangers
                if self.weather == Weather.STORM:
                    for _ in range(3):
                        sx, sy = random.randint(0, GRID_W - 1), random.randint(0, GRID_H - 1)
                        if self.grid.get(sx, sy).type == ObjectType.EMPTY:
                            self.grid.set(sx, sy, WorldObject(ObjectType.DANGER, quantity=1, max_quantity=1))
                            events.append({"type": "storm_danger", "x": sx, "y": sy})

        # Compute modifiers from time/weather
        energy_mult = 1.5 if self.time_phase == TimePhase.NIGHT else 1.0
        move_slow = 1.0
        if self.weather == Weather.RAIN:
            move_slow = 1.5
        elif self.weather == Weather.STORM:
            move_slow = 2.0
        visibility = COMM_RANGE
        if self.weather == Weather.FOG:
            visibility = 3
        elif self.time_phase == TimePhase.NIGHT:
            visibility = 3

        # ── Update wildlife ─────────────────────────────────────────────────
        self._update_wildlife(agents_pos, events)

        # ── Agent processing ────────────────────────────────────────────────
        for agent in self.agents:
            if agent.energy <= 0 or agent.health <= 0:
                agent.current_action = "dead"
                agent.mood = "dead"
                continue

            # Update mood
            agent.mood = self._compute_mood(agent)

            # 1) Energy decay (affected by time/weather)
            agent.energy -= ENERGY_DECAY_PER_TICK * energy_mult
            # Buildings: campfire nearby gives energy
            near_campfire = False
            for bld in self.buildings:
                if bld.type == BuildingType.CAMPFIRE:
                    dist = abs(bld.x - agent.x) + abs(bld.y - agent.y)
                    if dist <= 3:
                        agent.energy = min(agent.max_energy, agent.energy + 2.0)
                        near_campfire = True
                # Shelter: energy regen
                if bld.type == BuildingType.SHELTER and bld.x == agent.x and bld.y == agent.y:
                    agent.energy = min(agent.max_energy, agent.energy + 3.0)
                    near_campfire = True

            if near_campfire and agent.energy > 70:
                agent.current_action = "resting"

            if agent.energy <= 0:
                agent.energy = 0
                events.append({"type": "death", "agent": agent.name, "reason": "starvation"})
                continue

            # 2) Reduce cooldowns
            agent.gather_cooldown = max(0, agent.gather_cooldown - 1)
            agent.combat_cooldown = max(0, agent.combat_cooldown - 1)

            # 3) Communication — send messages to nearby agents
            self._agent_communicate(agent, agents_pos, events, visibility)

            # 4) Decide movement target if none
            if not agent.target or (agent.x, agent.y) == agent.target:
                agent.target = self._pick_target(agent, agents_pos)
                agent.path = astar((agent.x, agent.y), agent.target, self.grid, agents_pos, self.biome_map)

            # 5) Move along path (weather slows movement)
            if agent.path:
                agent.current_action = "walking"
                # In rain/storm, skip movement sometimes
                if move_slow > 1.0 and random.random() < (1.0 - 1.0 / move_slow):
                    pass  # skip this tick's movement
                else:
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

            # 6) Interact with current cell
            cell = self.grid.get(agent.x, agent.y)
            interaction = self._interact(agent, cell)
            if interaction:
                agent.current_action = "gathering"
                events.append(interaction)

            # 7) Check danger proximity
            danger_event = self._check_danger(agent)
            if danger_event:
                events.append(danger_event)

            # 8) Try to craft items
            craft_event = self._try_auto_craft(agent)
            if craft_event:
                events.append(craft_event)

            # 9) Check wildlife combat
            self._wildlife_combat(agent, events)

            # 10) Update quests
            self._update_quests(agent, events)

            # 11) Relationship — share resources with trusted agents
            self._share_resources(agent, events)

        # ── Random danger spawning (more at night) ─────────────────────────
        spawn_chance = DANGER_SPAWN_CHANCE * (2.0 if self.time_phase == TimePhase.NIGHT else 1.0)
        if random.random() < spawn_chance:
            dx, dy = random.randint(0, GRID_W - 1), random.randint(0, GRID_H - 1)
            current = self.grid.get(dx, dy)
            if current.type == ObjectType.EMPTY:
                self.grid.set(dx, dy, WorldObject(ObjectType.DANGER, quantity=1, max_quantity=1))
                events.append({"type": "danger_spawn", "x": dx, "y": dy})

        # ── Weather: rain adds water ───────────────────────────────────────
        if self.weather in (Weather.RAIN, Weather.STORM):
            for _ in range(2):
                rx, ry = random.randint(0, GRID_W - 1), random.randint(0, GRID_H - 1)
                cell = self.grid.get(rx, ry)
                if cell.type == ObjectType.WATER and cell.quantity < cell.max_quantity:
                    cell.quantity = min(cell.max_quantity, cell.quantity + 2)

        # ── Respawn depleted objects (faster during day) ───────────────────
        self._respawn_objects()

        # ── Generate quests periodically ────────────────────────────────────
        active_quests = [q for q in self.quests if not q.completed]
        if len(active_quests) < 3 and self.tick_count % 15 == 0:
            self._generate_quests(count=1)

        # ── Spawn wildlife periodically ─────────────────────────────────────
        alive_wildlife = [w for w in self.wildlife if w.health > 0]
        if len(alive_wildlife) < 5 and self.tick_count % 20 == 0:
            self._spawn_wildlife(count=1)

        # ── Generate language from events ────────────────────────────────────
        for ev in events:
            if ev.get("type") in ("found_food", "found_water", "found_tool", "danger_nearby", "danger_spawn",
                                   "craft_success", "building_placed", "quest_complete", "wildlife_killed",
                                   "help_request", "resource_shared", "level_up", "wildlife_attacked"):
                # Find the agent for this event
                source_agent_name = ev.get("agent", "")
                source_agent = next((a for a in self.agents if a.name == source_agent_name), None)
                if source_agent:
                    msg_text = self._generate_dialog(ev, source_agent)
                else:
                    msg_text = self._generate_language(ev)
                if msg_text:
                    for a in self.agents:
                        if a.name == source_agent_name:
                            bubble = ChatBubble(a.agent_id, msg_text, a.x, a.y)
                            self.chat_bubbles.append(bubble)
                            a.messages.append({"tick": self.tick_count, "text": msg_text, "event": ev["type"]})
                            self.stats["messages_sent"] += 1
                            events.append({"type": "chat", "agent": a.name, "text": msg_text, "x": a.x, "y": a.y})
                            # Add to world events feed
                            self.world_events.append({
                                "tick": self.tick_count, "type": ev["type"],
                                "text": f"{a.name}: {msg_text}", "agent": a.name, "x": a.x, "y": a.y,
                            })
                            break

        # ── Agent idle chatter and greeting/farewell ────────────────────────
        for agent in self.agents:
            if agent.energy <= 0 or agent.health <= 0:
                continue
            if agent.current_action == "walking" and random.random() < 0.08:
                nearby = [a for a in self.agents if a.agent_id != agent.agent_id and a.energy > 0
                          and abs(a.x - agent.x) + abs(a.y - agent.y) <= 2]
                if not nearby and random.random() < 0.3:
                    ev = {"type": "farewell", "agent": agent.name}
                    msg = self._generate_dialog(ev, agent)
                    if msg:
                        bubble = ChatBubble(agent.agent_id, msg, agent.x, agent.y)
                        self.chat_bubbles.append(bubble)
                        self.world_events.append({"tick": self.tick_count, "type": "farewell", "text": f"{agent.name}: {msg}", "agent": agent.name})
            elif agent.current_action == "resting" and random.random() < 0.1:
                ev = {"type": "idle_chat", "agent": agent.name}
                msg = self._generate_dialog(ev, agent)
                if msg:
                    bubble = ChatBubble(agent.agent_id, msg, agent.x, agent.y)
                    self.chat_bubbles.append(bubble)
                    self.world_events.append({"tick": self.tick_count, "type": "idle_chat", "text": f"{agent.name}: {msg}", "agent": agent.name})

        # Keep world_events trimmed
        if len(self.world_events) > 100:
            self.world_events = self.world_events[-50:]

        # Prune dead chat bubbles
        self.chat_bubbles = [b for b in self.chat_bubbles if b.is_alive()]

        return {
            "tick": self.tick_count,
            "events": events,
        }

    # ── wildlife update ─────────────────────────────────────────────────────

    def _update_wildlife(self, agents_pos: set, events: List[Dict[str, Any]]):
        """Update wildlife positions and behavior."""
        for creature in self.wildlife:
            if creature.health <= 0:
                continue
            creature.wander_cooldown = max(0, creature.wander_cooldown - 1)
            if creature.wander_cooldown > 0:
                continue

            if creature.is_aggressive:
                # Chase nearest agent in aggro range
                nearest_agent = None
                nearest_dist = float("inf")
                for agent in self.agents:
                    if agent.energy <= 0 or agent.health <= 0:
                        continue
                    d = abs(agent.x - creature.x) + abs(agent.y - creature.y)
                    if d < nearest_dist and d <= creature.aggro_range:
                        nearest_dist = d
                        nearest_agent = agent
                if nearest_agent:
                    dx = 0
                    dy = 0
                    if nearest_agent.x > creature.x:
                        dx = 1
                    elif nearest_agent.x < creature.x:
                        dx = -1
                    if nearest_agent.y > creature.y:
                        dy = 1
                    elif nearest_agent.y < creature.y:
                        dy = -1
                    nx, ny = creature.x + dx, creature.y + dy
                    if 0 <= nx < GRID_W and 0 <= ny < GRID_H:
                        creature.x, creature.y = nx, ny
                    creature.wander_cooldown = 1.0
                    # Attack if adjacent
                    if abs(creature.x - nearest_agent.x) <= 1 and abs(creature.y - nearest_agent.y) <= 1:
                        dmg = 8 if creature.type == WildlifeType.BEAR else 5
                        nearest_agent.health -= dmg
                        events.append({
                            "type": "wildlife_attack", "agent": nearest_agent.name,
                            "creature": creature.type.value, "damage": dmg,
                            "health": round(nearest_agent.health, 1),
                        })
                        creature.wander_cooldown = 3.0
                else:
                    self._wander_creature(creature)
            else:
                self._wander_creature(creature)

    def _wander_creature(self, creature: Wildlife):
        """Make a creature wander randomly."""
        dx, dy = random.choice([(0, 1), (0, -1), (1, 0), (-1, 0), (0, 0)])
        nx, ny = creature.x + dx, creature.y + dy
        if 0 <= nx < GRID_W and 0 <= ny < GRID_H:
            cell = self.grid.get(nx, ny)
            if cell.type != ObjectType.DANGER:
                creature.x, creature.y = nx, ny
        creature.wander_cooldown = random.uniform(1.0, 3.0)

    def _wildlife_combat(self, agent: AgentState, events: List[Dict[str, Any]]):
        """Agent can attack adjacent wildlife."""
        if agent.combat_cooldown > 0:
            return
        for creature in self.wildlife:
            if creature.health <= 0:
                continue
            if abs(creature.x - agent.x) <= 1 and abs(creature.y - agent.y) <= 1:
                agent.current_action = "fighting"
                dmg = 10
                if agent.inventory.get("tool", 0) > 0:
                    dmg = 15
                creature.health -= dmg
                agent.combat_cooldown = 2.0
                events.append({
                    "type": "wildlife_attacked", "agent": agent.name,
                    "creature": creature.type.value, "damage": dmg,
                    "creature_health": round(creature.health, 1),
                })
                if creature.health <= 0:
                    food_amount = creature.food_yield
                    agent.inventory["food"] = agent.inventory.get("food", 0) + food_amount
                    agent.energy = min(agent.max_energy, agent.energy + food_amount * 5)
                    self._grant_xp(agent, 15, events)
                    events.append({
                        "type": "wildlife_killed", "agent": agent.name,
                        "creature": creature.type.value, "food_gained": food_amount,
                    })
                    # Update hunt quests
                    for qid in agent.active_quests:
                        quest = self._find_quest(qid)
                        if quest and quest.quest_type == QuestType.HUNT and not quest.completed:
                            if quest.target_item == creature.type.value:
                                quest.current_count += 1
                break

    # ── communication ───────────────────────────────────────────────────────

    def _agent_communicate(self, agent: AgentState, agents_pos: set,
                           events: List[Dict[str, Any]], visibility: int):
        """Agents send messages to nearby agents based on their situation."""
        if random.random() > 0.5:
            return

        nearby_agents = []
        for other in self.agents:
            if other.agent_id == agent.agent_id or other.energy <= 0 or other.health <= 0:
                continue
            d = abs(other.x - agent.x) + abs(other.y - agent.y)
            if d <= visibility:
                nearby_agents.append(other)

        if not nearby_agents:
            return

        # Check for greeting (first time seeing nearby agents)
        just_met = False
        for other in nearby_agents:
            if agent.trust.get(other.agent_id, 0.5) < 0.55:  # haven't interacted much
                just_met = True
                break

        # Determine communication type based on state
        if agent.energy < 30:
            ev = {"type": "help_request", "agent": agent.name, "x": agent.x, "y": agent.y}
        elif agent.health < 30:
            ev = {"type": "help_request", "agent": agent.name, "x": agent.x, "y": agent.y}
        elif just_met and random.random() < 0.4:
            ev = {"type": "greeting", "agent": agent.name}
        elif agent.inventory.get("food", 0) > 3:
            ev = {"type": "resource_shared", "agent": agent.name, "target": nearby_agents[0].name}
        else:
            # Check for nearby danger
            has_danger = False
            for dx, dy in [(-1, 0), (1, 0), (0, -1), (0, 1)]:
                nx, ny = agent.x + dx, agent.y + dy
                if 0 <= nx < GRID_W and 0 <= ny < GRID_H:
                    if self.grid.get(nx, ny).type == ObjectType.DANGER:
                        has_danger = True
                        break
            if has_danger:
                ev = {"type": "danger_nearby", "agent": agent.name, "x": agent.x, "y": agent.y}
            elif self.weather in (Weather.STORM, Weather.RAIN):
                ev = {"type": "weather_change", "agent": agent.name}
            else:
                ev = {"type": "communication", "agent": agent.name}

        msg = self._generate_dialog(ev, agent)
        if msg and random.random() < 0.6:
            agent.last_message_sent = msg
            for other in nearby_agents:
                other.messages.append({
                    "tick": self.tick_count, "text": msg,
                    "from": agent.name, "event": ev["type"],
                })
            bubble = ChatBubble(agent.agent_id, msg, agent.x, agent.y)
            self.chat_bubbles.append(bubble)
            events.append({"type": "communication", "agent": agent.name, "text": msg, "x": agent.x, "y": agent.y})
            self.world_events.append({
                "tick": self.tick_count, "type": ev["type"],
                "text": f"{agent.name}: {msg}", "agent": agent.name, "x": agent.x, "y": agent.y,
            })

            # Messages influence trust
            for other in nearby_agents:
                old_trust = agent.trust.get(other.agent_id, 0.5)
                if ev["type"] in ("help_request",):
                    agent.trust[other.agent_id] = min(1.0, old_trust + 0.05)
                elif ev["type"] == "greeting":
                    agent.trust[other.agent_id] = min(1.0, old_trust + 0.03)
                    other.trust[agent.agent_id] = min(1.0, other.trust.get(agent.agent_id, 0.5) + 0.03)

    # ── relationship / resource sharing ─────────────────────────────────────

    def _share_resources(self, agent: AgentState, events: List[Dict[str, Any]]):
        """Share resources with highly trusted nearby agents."""
        if random.random() > 0.1:
            return
        for other in self.agents:
            if other.agent_id == agent.agent_id or other.energy <= 0 or other.health <= 0:
                continue
            d = abs(other.x - agent.x) + abs(other.y - agent.y)
            if d > 2:
                continue
            trust = agent.trust.get(other.agent_id, 0.5)
            if trust >= 0.7:
                if other.energy < 40 and agent.inventory.get("food", 0) > 2:
                    agent.inventory["food"] -= 1
                    other.energy = min(other.max_energy, other.energy + FOOD_ENERGY_RESTORE)
                    agent.trust[other.agent_id] = min(1.0, trust + 0.1)
                    other.trust[agent.agent_id] = min(1.0, other.trust.get(agent.agent_id, 0.5) + 0.1)
                    events.append({
                        "type": "resource_shared", "agent": agent.name,
                        "target": other.name, "resource": "food",
                    })
                    break
            elif trust < 0.3:
                if agent.target and abs(other.x - agent.target[0]) + abs(other.y - agent.target[1]) < 3:
                    agent.target = None  # Repath to avoid

    # ── crafting ────────────────────────────────────────────────────────────

    def _try_auto_craft(self, agent: AgentState) -> Optional[Dict[str, Any]]:
        """Agent attempts to craft if they have ingredients and need the item."""
        for recipe_name, recipe in CRAFTING_RECIPES.items():
            if recipe.get("consumable"):
                if recipe_name == "feast" and agent.energy > 50:
                    continue
                if recipe_name == "bandage" and agent.health > 50:
                    continue
            can_craft = True
            for item, count in recipe["requires"].items():
                if agent.inventory.get(item, 0) < count:
                    can_craft = False
                    break
            if not can_craft:
                continue
            # Consume ingredients
            for item, count in recipe["requires"].items():
                agent.inventory[item] -= count
                if agent.inventory[item] <= 0:
                    del agent.inventory[item]
            # Apply result
            result = recipe["result"]
            if recipe.get("consumable"):
                if result == "feast":
                    agent.energy = min(agent.max_energy, agent.energy + 40)
                    agent.health = min(agent.max_health, agent.health + 10)
                elif result == "bandage":
                    agent.health = min(agent.max_health, agent.health + 30)
            else:
                # Place as building
                building = Building(
                    type=BuildingType(result),
                    x=agent.x, y=agent.y,
                    owner_id=agent.agent_id,
                    built_tick=self.tick_count,
                )
                self.buildings.append(building)
            self._grant_xp(agent, recipe["xp"], [])
            return {
                "type": "craft_success", "agent": agent.name,
                "recipe": recipe_name, "result": result,
            }
        return None

    # ── experience / leveling ───────────────────────────────────────────────

    def _grant_xp(self, agent: AgentState, amount: int, events: List[Dict[str, Any]]):
        """Grant XP to agent and handle level ups."""
        agent.xp += amount
        xp_needed = agent.level * 50
        while agent.xp >= xp_needed:
            agent.xp -= xp_needed
            agent.level += 1
            agent.max_energy += 10
            agent.max_health += 10
            agent.energy = min(agent.max_energy, agent.energy + 20)
            agent.health = min(agent.max_health, agent.health + 20)
            xp_needed = agent.level * 50
            events.append({
                "type": "level_up", "agent": agent.name,
                "level": agent.level, "max_energy": agent.max_energy, "max_health": agent.max_health,
            })

    # ── quests ──────────────────────────────────────────────────────────────

    def _find_quest(self, quest_id: str) -> Optional[Quest]:
        return next((q for q in self.quests if q.quest_id == quest_id), None)

    def _update_quests(self, agent: AgentState, events: List[Dict[str, Any]]):
        """Check and update quest progress for an agent."""
        for qid in list(agent.active_quests):
            quest = self._find_quest(qid)
            if not quest or quest.completed:
                continue
            if quest.assigned_agent != agent.agent_id:
                continue

            if quest.quest_type == QuestType.GATHER:
                have = agent.inventory.get(quest.target_item, 0)
                quest.current_count = min(have, quest.target_count)
            elif quest.quest_type == QuestType.REACH:
                if quest.target_position and (agent.x, agent.y) == quest.target_position:
                    quest.current_count = 1
            elif quest.quest_type == QuestType.BUILD:
                for bld in self.buildings:
                    if bld.owner_id == agent.agent_id and bld.type.value == quest.target_item:
                        quest.current_count = 1
                        break

            if quest.current_count >= quest.target_count and not quest.completed:
                quest.completed = True
                self._grant_xp(agent, quest.reward_xp, events)
                for item, count in quest.reward_items.items():
                    agent.inventory[item] = agent.inventory.get(item, 0) + count
                events.append({
                    "type": "quest_complete", "agent": agent.name,
                    "quest": quest.description, "xp_gained": quest.reward_xp,
                })

    # ── target selection ────────────────────────────────────────────────────

    def _pick_target(self, agent: AgentState, agents_pos: set) -> Tuple[int, int]:
        """Pick a target cell for the agent based on needs, quests, and relationships."""
        # Priority 1: Active quest targets
        for qid in agent.active_quests:
            quest = self._find_quest(qid)
            if quest and not quest.completed:
                if quest.quest_type == QuestType.REACH and quest.target_position:
                    return quest.target_position
                if quest.quest_type == QuestType.GATHER:
                    target = self._find_nearest(agent.x, agent.y, self._item_to_object_type(quest.target_item))
                    if target:
                        return target
                if quest.quest_type == QuestType.HUNT:
                    best, best_dist = None, float("inf")
                    for creature in self.wildlife:
                        if creature.health > 0 and creature.type.value == quest.target_item:
                            d = abs(creature.x - agent.x) + abs(creature.y - agent.y)
                            if d < best_dist:
                                best_dist = d
                                best = (creature.x, creature.y)
                    if best:
                        return best

        # Priority 2: Survival needs
        if agent.energy < 40:
            for bld in self.buildings:
                if bld.type == BuildingType.CAMPFIRE:
                    d = abs(bld.x - agent.x) + abs(bld.y - agent.y)
                    if d <= 5:
                        return (bld.x, bld.y)
            target = self._find_nearest(agent.x, agent.y, ObjectType.FOOD)
            if target:
                return target
        if agent.health < 50:
            target = self._find_nearest(agent.x, agent.y, ObjectType.WATER)
            if target:
                return target

        # Priority 3: Gather crafting materials
        crafting_needs = self._check_crafting_needs(agent)
        if crafting_needs:
            target = self._find_nearest(agent.x, agent.y, crafting_needs)
            if target:
                return target

        # Priority 4: Get tools
        if agent.inventory.get("tool", 0) == 0:
            target = self._find_nearest(agent.x, agent.y, ObjectType.TOOL)
            if target:
                return target

        # Default: explore
        return (random.randint(0, GRID_W - 1), random.randint(0, GRID_H - 1))

    def _item_to_object_type(self, item: str) -> Optional[ObjectType]:
        mapping = {
            "wood": ObjectType.TREE,
            "food": ObjectType.FOOD,
            "water": ObjectType.WATER,
            "stone": ObjectType.TOOL,
            "tool": ObjectType.TOOL,
        }
        return mapping.get(item)

    def _check_crafting_needs(self, agent: AgentState) -> Optional[ObjectType]:
        """Check if agent is close to crafting something and needs a resource."""
        best_recipe = None
        best_missing = 999
        for recipe_name, recipe in CRAFTING_RECIPES.items():
            if recipe.get("consumable"):
                continue
            missing = 0
            for item, count in recipe["requires"].items():
                have = agent.inventory.get(item, 0)
                if have < count:
                    missing += count - have
            if 0 < missing < best_missing:
                best_missing = missing
                best_recipe = recipe
        if best_recipe and best_missing <= 2:
            for item, count in best_recipe["requires"].items():
                if agent.inventory.get(item, 0) < count:
                    return self._item_to_object_type(item)
        return None

    def _find_nearest(self, x: int, y: int, obj_type: Optional[ObjectType]) -> Optional[Tuple[int, int]]:
        """Find nearest cell of given type."""
        if obj_type is None:
            return None
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
            agent.energy = min(agent.max_energy, agent.energy + FOOD_ENERGY_RESTORE)
            cell.quantity -= 1
            agent.inventory["food"] = agent.inventory.get("food", 0) + 1
            agent.gather_cooldown = 2 / tool_bonus
            self.stats["objects_gathered"] += 1
            self._grant_xp(agent, 5, [])
            return {"type": "found_food", "agent": agent.name, "x": agent.x, "y": agent.y, "energy": round(agent.energy, 1)}

        if cell.type == ObjectType.WATER:
            agent.health = min(agent.max_health, agent.health + WATER_HEALTH_RESTORE)
            cell.quantity -= 1
            agent.inventory["water"] = agent.inventory.get("water", 0) + 1
            agent.gather_cooldown = 1
            self.stats["objects_gathered"] += 1
            self._grant_xp(agent, 5, [])
            return {"type": "found_water", "agent": agent.name, "x": agent.x, "y": agent.y, "health": round(agent.health, 1)}

        if cell.type == ObjectType.TOOL:
            cell.quantity -= 1
            agent.inventory["tool"] = agent.inventory.get("tool", 0) + 1
            agent.inventory["stone"] = agent.inventory.get("stone", 0) + 1
            agent.gather_cooldown = 3
            self.stats["objects_gathered"] += 1
            self._grant_xp(agent, 8, [])
            return {"type": "found_tool", "agent": agent.name, "x": agent.x, "y": agent.y}

        if cell.type == ObjectType.TREE:
            cell.quantity -= 1
            agent.inventory["wood"] = agent.inventory.get("wood", 0) + 1
            agent.gather_cooldown = 4 / tool_bonus
            self.stats["objects_gathered"] += 1
            self._grant_xp(agent, 5, [])
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
        reveal_range = 1
        for bld in self.buildings:
            if bld.type == BuildingType.WATCHTOWER:
                d = abs(bld.x - agent.x) + abs(bld.y - agent.y)
                if d <= 5:
                    reveal_range = 5
                    break

        check_range = max(1, reveal_range)
        for dx in range(-check_range, check_range + 1):
            for dy in range(-check_range, check_range + 1):
                if dx == 0 and dy == 0:
                    continue
                nx, ny = agent.x + dx, agent.y + dy
                if 0 <= nx < GRID_W and 0 <= ny < GRID_H:
                    cell = self.grid.get(nx, ny)
                    if cell.type == ObjectType.DANGER and cell.quantity > 0:
                        return {"type": "danger_nearby", "agent": agent.name, "x": nx, "y": ny}
        return None

    def _respawn_objects(self):
        """Respawn depleted objects over time."""
        respawn_rate = 8 if self.time_phase == TimePhase.DAY else 12
        for (x, y), obj in self.grid.cells.items():
            if obj.quantity <= 0 and obj.type != ObjectType.DANGER:
                obj.respawn_timer += 1
                if obj.respawn_timer >= respawn_rate:
                    obj.quantity = obj.max_quantity
                    obj.respawn_timer = 0
            if obj.type == ObjectType.DANGER:
                obj.respawn_timer += 1
                if obj.respawn_timer >= 15:
                    self.grid.set(x, y, WorldObject(ObjectType.EMPTY))

    def _compute_mood(self, agent: AgentState) -> str:
        """Compute agent mood from current state."""
        if agent.energy < 20:
            return "exhausted"
        if agent.health < 30:
            return "injured"
        if agent.energy > 80 and agent.health > 80:
            return "happy"
        if self.weather == Weather.STORM:
            return "anxious"
        if self.time_phase == TimePhase.NIGHT:
            return "cautious"
        if agent.current_action == "fighting":
            return "aggressive"
        if agent.active_quests:
            return "determined"
        return "neutral"

    def _generate_dialog(self, event: Dict[str, Any], agent: AgentState) -> Optional[str]:
        """Generate rich personality-based dialog from events."""
        etype = event.get("type", "")
        personality = agent.personality or "friendly"
        mood = agent.mood or "neutral"

        # Map event types to dialog categories
        event_to_category = {
            "found_food": "discovery",
            "found_water": "discovery",
            "found_tool": "discovery",
            "danger_nearby": "warning",
            "danger_spawn": "warning",
            "craft_success": "celebration",
            "building_placed": "celebration",
            "quest_complete": "celebration",
            "wildlife_killed": "victory",
            "wildlife_attacked": "defeat_retreat",
            "help_request": "warning",
            "resource_shared": "trade_offer",
            "communication": "response",
            "death": "complaint",
            "level_up": "celebration",
            "greeting": "greeting",
            "weather_change": "weather_comment",
        }

        category = event_to_category.get(etype, "idle_chat")

        # Personality modifies category
        if personality == "brave" and category == "defeat_retreat":
            if random.random() < 0.5:
                category = "victory"
        elif personality == "cautious" and category == "discovery":
            if random.random() < 0.3:
                category = "warning"
        elif personality == "loner" and category == "greeting":
            if random.random() < 0.5:
                category = "farewell"
        elif personality == "curious" and category == "idle_chat":
            if random.random() < 0.4:
                category = "question"

        # Time-based
        if self.time_phase == TimePhase.NIGHT and random.random() < 0.3:
            category = "night_fear"
        elif self.time_phase == TimePhase.DAY and self.day_tick < 3 and random.random() < 0.3:
            category = "morning_greeting"

        # Mood-based
        if mood == "exhausted" and random.random() < 0.4:
            category = "complaint"
        elif mood == "happy" and random.random() < 0.3:
            category = "celebration"

        # Rare philosophical (5%)
        if random.random() < 0.05 and category == "idle_chat":
            category = "philosophical"

        templates = DIALOG_TEMPLATES.get(category, DIALOG_TEMPLATES["idle_chat"])
        text = random.choice(templates)

        # Fill template vars
        nearby = [a for a in self.agents if a.agent_id != agent.agent_id and a.energy > 0
                  and abs(a.x - agent.x) + abs(a.y - agent.y) <= COMM_RANGE]
        if nearby:
            target = random.choice(nearby)
            text = text.replace("{target}", target.name)
        inv_items = [k for k, v in agent.inventory.items() if v > 0]
        text = text.replace("{item}", random.choice(inv_items) if inv_items else "stuff")

        return text

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
            "craft_success": [
                f"Crafted {event.get('result', 'something')}! {event.get('recipe', '')}",
                f"Building complete: {event.get('result', 'something')}",
            ],
            "building_placed": [
                f"Placed {event.get('building_type', 'structure')} at ({event.get('x')},{event.get('y')})",
            ],
            "quest_complete": [
                f"Quest complete: {event.get('quest', '')}! +{event.get('xp_gained', 0)} XP",
                f"Mission accomplished! Earned {event.get('xp_gained', 0)} XP",
            ],
            "wildlife_killed": [
                f"Hunted a {event.get('creature', 'creature')}! +{event.get('food_gained', 0)} food",
            ],
            "help_request": [
                f"Help! Need assistance at ({event.get('x')},{event.get('y')})",
            ],
            "resource_shared": [
                f"Shared {event.get('resource', 'resources')} with {event.get('target', 'someone')}",
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

        # Build biome info for frontend
        biome_list = []
        for (x, y), biome in self.biome_map.items():
            biome_list.append({"x": x, "y": y, "biome": biome.value})

        return {
            "tick": self.tick_count,
            "running": self.running,
            "tick_speed": self.tick_speed,
            "grid": {"width": GRID_W, "height": GRID_H},
            "agents": [a.to_dict() for a in self.agents],
            "objects": objects_list,
            "chat_bubbles": [b.to_dict() for b in self.chat_bubbles if b.is_alive()],
            "stats": self.stats,
            # new fields
            "biomes": biome_list,
            "buildings": [b.to_dict() for b in self.buildings],
            "wildlife": [w.to_dict() for w in self.wildlife if w.health > 0],
            "quests": [q.to_dict() for q in self.quests],
            "time_phase": self.time_phase.value,
            "weather": self.weather.value,
            "day_tick": self.day_tick,
            "day_length": self.day_length,
            "recent_events": self.world_events[-20:],
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
            # new fields
            "biome_map": [
                {"x": x, "y": y, "biome": biome.value}
                for (x, y), biome in self.biome_map.items()
            ],
            "buildings": [b.to_dict() for b in self.buildings],
            "wildlife": [w.to_dict() for w in self.wildlife],
            "quests": [q.to_dict() for q in self.quests],
            "time_phase": self.time_phase.value,
            "weather": self.weather.value,
            "day_tick": self.day_tick,
            "weather_tick": self.weather_tick,
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
                max_energy=ad.get("max_energy", 100),
                max_health=ad.get("max_health", 100),
                direction=Direction(ad.get("direction", "down")),
                inventory=ad.get("inventory", {}),
                messages=ad.get("messages", []),
                path=[(p[0], p[1]) for p in ad.get("path", [])],
                xp=ad.get("xp", 0),
                level=ad.get("level", 1),
                trust=ad.get("trust", {}),
                active_quests=ad.get("active_quests", []),
            )
            self.agents.append(agent)
        # Load new systems
        self.biome_map.clear()
        for item in data.get("biome_map", []):
            self.biome_map[(item["x"], item["y"])] = Biome(item["biome"])
        self.buildings = [Building.from_dict(b) for b in data.get("buildings", [])]
        self.wildlife = [Wildlife.from_dict(w) for w in data.get("wildlife", [])]
        self.quests = [Quest.from_dict(q) for q in data.get("quests", [])]
        self.time_phase = TimePhase(data.get("time_phase", "day"))
        self.weather = Weather(data.get("weather", "clear"))
        self.day_tick = data.get("day_tick", 0)
        self.weather_tick = data.get("weather_tick", 0)
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
