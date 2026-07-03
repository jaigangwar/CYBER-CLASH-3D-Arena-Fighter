"""
CYBER CLASH - Room Manager
Each Room holds one match: two players (or one player + AI), the game engine,
and the async game loop.
"""

from __future__ import annotations

import asyncio
import random
import string
import time
import uuid
from typing import Any

from fastapi import WebSocket

from game.ai import AIController
from game.constants import (
    COUNTDOWN_SECONDS,
    ROOM_CODE_LENGTH,
    TICK_INTERVAL,
)
from game.engine import GameEngine
from multiplayer import messages as msg


def _generate_code() -> str:
    """Generate a random 6-character uppercase room code."""
    return "".join(random.choices(string.ascii_uppercase + string.digits, k=ROOM_CODE_LENGTH))


class Room:
    """Represents a single game room with up to 2 players."""

    def __init__(self, room_code: str, mode: str = "pvp") -> None:
        self.code: str = room_code
        self.mode: str = mode  # "pvp" or "ai"

        # Players: id → WebSocket
        self.players: dict[str, WebSocket] = {}
        self.player_classes: dict[str, str] = {}
        self.player_names: dict[str, str] = {}
        self.ready: set[str] = set()

        # Engine (created when fight starts)
        self.engine: GameEngine | None = None
        self.ai_controller: AIController | None = None

        # Lifecycle
        self._loop_task: asyncio.Task | None = None
        self._running: bool = False

    # ── Player management ─────────────────────────────────────────────────

    def add_player(self, player_id: str, ws: WebSocket, char_class: str = "brawler", player_name: str = "Player") -> None:
        self.players[player_id] = ws
        self.player_classes[player_id] = char_class
        self.player_names[player_id] = player_name

    def remove_player(self, player_id: str) -> None:
        self.players.pop(player_id, None)
        self.player_classes.pop(player_id, None)
        self.player_names.pop(player_id, None)
        self.ready.discard(player_id)

    @property
    def player_ids(self) -> list[str]:
        return list(self.players.keys())

    @property
    def players_info(self) -> list[dict]:
        return [
            {
                "id": pid,
                "name": self.player_names.get(pid, "Player"),
                "char_class": self.player_classes.get(pid, "brawler"),
                "ready": pid in self.ready
            }
            for pid in self.players.keys()
        ]

    @property
    def is_full(self) -> bool:
        return len(self.players) >= 2

    @property
    def is_empty(self) -> bool:
        return len(self.players) == 0

    def mark_ready(self, player_id: str) -> None:
        self.ready.add(player_id)

    @property
    def all_ready(self) -> bool:
        if self.mode == "ai":
            return len(self.ready) >= 1
        return len(self.ready) >= 2

    # ── Broadcasting ──────────────────────────────────────────────────────

    async def broadcast(self, message: str) -> None:
        """Send a message to all connected players."""
        disconnected: list[str] = []
        for pid, ws in self.players.items():
            try:
                await ws.send_text(message)
            except Exception:
                disconnected.append(pid)
        for pid in disconnected:
            self.remove_player(pid)

    async def send_to(self, player_id: str, message: str) -> None:
        """Send a message to a specific player."""
        ws = self.players.get(player_id)
        if ws:
            try:
                await ws.send_text(message)
            except Exception:
                self.remove_player(player_id)

    # ── Fight lifecycle ───────────────────────────────────────────────────

    async def start_fight(self) -> None:
        """Initialise engine and begin the countdown → game loop."""
        ids = self.player_ids

        if self.mode == "ai":
            p1_id = ids[0]
            p2_id = "AI"
            p1_class = self.player_classes.get(p1_id, "brawler")
            p2_class = "brawler"  # Or random
            self.ai_controller = AIController()
        else:
            p1_id = ids[0]
            p2_id = ids[1] if len(ids) > 1 else ids[0]
            p1_class = self.player_classes.get(p1_id, "brawler")
            p2_class = self.player_classes.get(p2_id, "brawler")

        self.engine = GameEngine(p1_id, p1_class, p2_id, p2_class)

        # Countdown
        for sec in range(COUNTDOWN_SECONDS, 0, -1):
            await self.broadcast(msg.countdown(sec))
            await asyncio.sleep(1.0)
        await self.broadcast(msg.countdown(0))

        # Start loop
        self._running = True
        self._loop_task = asyncio.create_task(self._game_loop())

    async def stop(self) -> None:
        """Stop the game loop."""
        self._running = False
        if self._loop_task and not self._loop_task.done():
            self._loop_task.cancel()
            try:
                await self._loop_task
            except asyncio.CancelledError:
                pass

    # ── 60-tick Game Loop ─────────────────────────────────────────────────

    async def _game_loop(self) -> None:
        """Server-authoritative simulation at 60 ticks/sec."""
        assert self.engine is not None

        next_tick = asyncio.get_event_loop().time()

        while self._running and not self.engine.match_over:
            now = asyncio.get_event_loop().time()

            if now < next_tick:
                await asyncio.sleep(next_tick - now)

            next_tick += TICK_INTERVAL

            # AI input
            if self.ai_controller:
                self.ai_controller.update(
                    self.engine.p2,
                    self.engine.p1,
                    TICK_INTERVAL,
                )

            # Simulate
            hit_events, round_end, game_over = self.engine.tick()

            # Broadcast state
            try:
                await self.broadcast(msg.game_state(self.engine.get_state()))
            except Exception:
                break

            # Hit events
            for ev in hit_events:
                await self.broadcast(msg.hit_event(ev))

            # Round end
            if round_end:
                await self.broadcast(msg.round_end(round_end))
                if game_over:
                    await self.broadcast(msg.game_over(game_over))
                    self._running = False

                    # Update ELO
                    winner_id = game_over.get("winner")
                    if winner_id and winner_id != "draw" and winner_id != "AI":
                        # Determine loser
                        ids = self.player_ids
                        if len(ids) == 2:
                            loser_id = ids[0] if ids[1] == winner_id else ids[1]
                            winner_name = self.player_names.get(winner_id)
                            loser_name = self.player_names.get(loser_id)
                            if winner_name and loser_name:
                                from game.database import update_match_result
                                update_match_result(winner_name, loser_name)

                else:
                    # Brief pause then start next round
                    await asyncio.sleep(2.0)
                    self.engine.start_next_round()
                    await self.broadcast(msg.countdown(0))

        self._running = False

    # ── Input handling ────────────────────────────────────────────────────

    def apply_input(self, player_id: str, data: dict) -> None:
        """Apply a client's input to the engine."""
        if self.engine and self.engine.round_active:
            self.engine.apply_input(player_id, data)


# ── Global Room Registry ─────────────────────────────────────────────────

_rooms: dict[str, Room] = {}


def create_room(mode: str = "pvp") -> Room:
    """Create a new room with a unique code."""
    while True:
        code = _generate_code()
        if code not in _rooms:
            break
    room = Room(code, mode=mode)
    _rooms[code] = room
    return room


def get_room(code: str) -> Room | None:
    return _rooms.get(code)


def remove_room(code: str) -> None:
    _rooms.pop(code, None)


def list_rooms() -> list[str]:
    return list(_rooms.keys())
