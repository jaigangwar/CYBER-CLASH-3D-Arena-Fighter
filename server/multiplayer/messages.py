"""
CYBER CLASH - Message Helpers
Typed constructors for every server→client WebSocket message.
"""

from __future__ import annotations

import json
from typing import Any


def _msg(msg_type: str, **kwargs: Any) -> str:
    """Build a JSON message string with a `type` field."""
    return json.dumps({"type": msg_type, **kwargs})


# ── Lobby / Room ──────────────────────────────────────────────────────────

def room_created(room_code: str, player_id: str, players: list[dict]) -> str:
    return _msg("room_created", room_code=room_code, player_id=player_id, players=players)


def room_joined(room_code: str, player_id: str, players: list[dict]) -> str:
    return _msg("room_joined", room_code=room_code, player_id=player_id, players=players)


def player_joined(player_id: str, players: list[dict]) -> str:
    return _msg("player_joined", player_id=player_id, players=players)


def player_ready(player_id: str, players: list[dict]) -> str:
    return _msg("player_ready", player_id=player_id, players=players)


def countdown(seconds: int) -> str:
    return _msg("countdown", seconds=seconds)


# ── Gameplay ──────────────────────────────────────────────────────────────

def game_state(state: dict) -> str:
    return _msg("game_state", **state)


def hit_event(event: dict) -> str:
    return _msg("hit_event", **event)


def round_end(result: dict) -> str:
    return _msg("round_end", **result)


def game_over(result: dict) -> str:
    return _msg("game_over", **result)


# ── Meta ──────────────────────────────────────────────────────────────────

def opponent_disconnected() -> str:
    return _msg("opponent_disconnected")


def error(message: str) -> str:
    return _msg("error", message=message)


def chat(player_id: str, text: str) -> str:
    return _msg("chat", player_id=player_id, text=text)


# ── Matchmaking ───────────────────────────────────────────────────────────

def matchmake_waiting() -> str:
    return _msg("matchmake_waiting")


def matchmake_found(room_code: str, player_id: str, opponent_id: str) -> str:
    return _msg("matchmake_found", room_code=room_code, player_id=player_id, opponent_id=opponent_id)
