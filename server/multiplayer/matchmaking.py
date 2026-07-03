"""
CYBER CLASH - Matchmaking Queue
Simple FIFO queue: when two players are waiting, they get matched into a room.
"""

from __future__ import annotations

import asyncio
from typing import NamedTuple

from fastapi import WebSocket

from multiplayer import messages as msg
from multiplayer.room import Room, create_room


class _QueueEntry(NamedTuple):
    player_id: str
    ws: WebSocket
    char_class: str
    player_name: str


class MatchmakingQueue:
    """Thread-safe (asyncio) FIFO matchmaking queue."""

    def __init__(self) -> None:
        self._queue: list[_QueueEntry] = []
        self._lock = asyncio.Lock()

    async def enqueue(self, player_id: str, ws: WebSocket, char_class: str = "brawler", player_name: str = "Player") -> Room | None:
        """
        Add a player to the queue.
        If a match is found immediately, return the new Room.
        Otherwise send a waiting message and return None.
        """
        async with self._lock:
            # Check if already in queue
            self._queue = [e for e in self._queue if e.player_id != player_id]

            if self._queue:
                # Match with the first person waiting
                opponent = self._queue.pop(0)
                room = create_room(mode="pvp")

                room.add_player(opponent.player_id, opponent.ws, opponent.char_class, opponent.player_name)
                room.add_player(player_id, ws, char_class, player_name)

                # Notify both
                await opponent.ws.send_text(
                    msg.matchmake_found(room.code, opponent.player_id, player_id)
                )
                await ws.send_text(
                    msg.matchmake_found(room.code, player_id, opponent.player_id)
                )

                return room
            else:
                # No one waiting – add to queue
                self._queue.append(_QueueEntry(player_id, ws, char_class, player_name))
                await ws.send_text(msg.matchmake_waiting())
                return None

    async def remove(self, player_id: str) -> None:
        """Remove a player from the queue (e.g. on disconnect)."""
        async with self._lock:
            self._queue = [e for e in self._queue if e.player_id != player_id]

    @property
    def size(self) -> int:
        return len(self._queue)


# Singleton instance
matchmaking_queue = MatchmakingQueue()
