"""
CYBER CLASH - Game Engine
Manages round lifecycle, tick simulation, win conditions, and state snapshots.
"""

from __future__ import annotations

from game.constants import (
    ARENA_SIZE,
    MAX_HEALTH,
    MAX_ENERGY,
    ROUNDS_TO_WIN,
    ROUND_TIME,
    TICK_INTERVAL,
)
from game.fighter import Fighter


class GameEngine:
    """Authoritative game simulation for one match (best-of-N rounds)."""

    def __init__(self, p1_id: str, p1_class: str, p2_id: str, p2_class: str) -> None:
        self.p1 = Fighter(p1_id, start_x=-5.0, char_class=p1_class)
        self.p2 = Fighter(p2_id, start_x=5.0, char_class=p2_class)

        self.round: int = 1
        self.timer: float = ROUND_TIME
        self.p1_wins: int = 0
        self.p2_wins: int = 0

        self.round_active: bool = True
        self.match_over: bool = False

    # ── Tick ──────────────────────────────────────────────────────────────

    def tick(self) -> tuple[list[dict], dict | None, dict | None]:
        """
        Advance one frame (TICK_INTERVAL seconds).

        Returns:
            hit_events  – list of hit dicts (0–2 per tick)
            round_end   – dict with round result or None
            game_over   – dict with match result or None
        """
        dt = TICK_INTERVAL
        hit_events: list[dict] = []
        round_end: dict | None = None
        game_over: dict | None = None

        if not self.round_active or self.match_over:
            return hit_events, round_end, game_over

        # Countdown timer
        self.timer -= dt
        if self.timer <= 0:
            self.timer = 0.0

        # Simulate fighters
        ev1 = self.p1.tick(dt, self.p2)
        ev2 = self.p2.tick(dt, self.p1)
        if ev1:
            hit_events.append(ev1)
        if ev2:
            hit_events.append(ev2)

        # Push-apart: prevent fighters from overlapping
        self._resolve_overlap()

        # Check round end conditions
        round_end = self._check_round_end()
        if round_end:
            game_over = self._check_match_end()

        return hit_events, round_end, game_over

    # ── Round / Match logic ──────────────────────────────────────────────

    def _check_round_end(self) -> dict | None:
        """Determine if the current round has ended."""
        p1_dead = self.p1.health <= 0
        p2_dead = self.p2.health <= 0
        timeout = self.timer <= 0

        winner: str | None = None

        if p1_dead and p2_dead:
            winner = "draw"
        elif p1_dead:
            winner = self.p2.player_id
            self.p2_wins += 1
        elif p2_dead:
            winner = self.p1.player_id
            self.p1_wins += 1
        elif timeout:
            if self.p1.health > self.p2.health:
                winner = self.p1.player_id
                self.p1_wins += 1
            elif self.p2.health > self.p1.health:
                winner = self.p2.player_id
                self.p2_wins += 1
            else:
                winner = "draw"
        else:
            return None  # round still going

        self.round_active = False
        return {
            "round": self.round,
            "winner": winner,
            "p1_health": round(self.p1.health, 1),
            "p2_health": round(self.p2.health, 1),
            "p1_wins": self.p1_wins,
            "p2_wins": self.p2_wins,
        }

    def _check_match_end(self) -> dict | None:
        """Check if someone has won enough rounds."""
        if self.p1_wins >= ROUNDS_TO_WIN:
            self.match_over = True
            return {"winner": self.p1.player_id, "p1_wins": self.p1_wins, "p2_wins": self.p2_wins}
        if self.p2_wins >= ROUNDS_TO_WIN:
            self.match_over = True
            return {"winner": self.p2.player_id, "p1_wins": self.p1_wins, "p2_wins": self.p2_wins}
        return None

    def start_next_round(self) -> None:
        """Reset fighters and begin the next round."""
        self.round += 1
        self.timer = ROUND_TIME
        self.p1.reset(start_x=-5.0)
        self.p2.reset(start_x=5.0)
        self.round_active = True

    # ── Overlap resolution ───────────────────────────────────────────────

    def _resolve_overlap(self) -> None:
        """Push fighters apart if they overlap."""
        from game.constants import FIGHTER_RADIUS

        dx = self.p2.x - self.p1.x
        dist = abs(dx)
        min_dist = FIGHTER_RADIUS * 2
        if dist < min_dist and dist > 0:
            overlap = (min_dist - dist) / 2.0
            sign = 1.0 if dx >= 0 else -1.0
            self.p1.x -= sign * overlap
            self.p2.x += sign * overlap

    # ── State snapshot ───────────────────────────────────────────────────

    def get_state(self) -> dict:
        """Full game state for broadcast to clients."""
        return {
            "p1": self.p1.to_dict(),
            "p2": self.p2.to_dict(),
            "round": self.round,
            "timer": round(self.timer, 2),
            "p1_wins": self.p1_wins,
            "p2_wins": self.p2_wins,
        }

    # ── Input application ────────────────────────────────────────────────

    def apply_input(self, player_id: str, data: dict) -> None:
        """Apply a client input snapshot to the correct fighter."""
        fighter = self.p1 if player_id == self.p1.player_id else self.p2

        fighter.input_move_x = float(data.get("move_x", 0))
        fighter.input_move_z = float(data.get("move_z", 0))
        fighter.input_jump = bool(data.get("jump", False))
        fighter.input_block = bool(data.get("block", False))

        atk = data.get("attack")
        if atk:
            fighter.input_attack = atk

        fighter.input_dodge = bool(data.get("dodge", False))
        fighter.input_taunt = bool(data.get("taunt", False))
