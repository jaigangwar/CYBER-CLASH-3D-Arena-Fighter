"""
CYBER CLASH - AI Opponent
Decision-timer based AI that reacts to the human player's actions.
"""

from __future__ import annotations

import random

from game.constants import (
    ARENA_SIZE,
    STATE_ATTACKING,
    STATE_BLOCKING,
    STATE_DODGING,
    STATE_HITSTUN,
    STATE_IDLE,
    STATE_MOVING,
)
from game.fighter import Fighter
from game.attacks import ATTACKS


# How often the AI re-evaluates its decision (seconds)
AI_DECISION_INTERVAL: float = 0.2

# Thresholds
CLOSE_RANGE: float = 4.0
MID_RANGE: float = 8.0
LOW_HEALTH_PCT: float = 0.30
SPECIAL_ENERGY_THRESHOLD: float = 35.0  # energy needed for special


class AIController:
    """Simple but believable AI for single-player mode."""

    def __init__(self) -> None:
        self.decision_timer: float = 0.0

    def update(self, ai_fighter: Fighter, opponent: Fighter, dt: float) -> None:
        """Called every tick. Updates ai_fighter.input_* fields."""
        self.decision_timer -= dt

        # ── Reactive behaviours (always checked) ─────────────────────────
        self._react_to_opponent(ai_fighter, opponent)

        if self.decision_timer > 0:
            return  # stick with current decision

        self.decision_timer = AI_DECISION_INTERVAL
        self._make_decision(ai_fighter, opponent)

    # ── Reactive Layer ────────────────────────────────────────────────────

    def _react_to_opponent(self, ai: Fighter, opp: Fighter) -> None:
        """Immediate reactions independent of decision timer."""
        if opp.state == STATE_ATTACKING and ai.state not in (
            STATE_ATTACKING,
            STATE_DODGING,
            STATE_HITSTUN,
        ):
            roll = random.random()
            if roll < 0.35:
                # Block
                ai.input_block = True
                ai.input_attack = None
                ai.input_dodge = False
            elif roll < 0.55:
                # Dodge away
                ai.input_block = False
                ai.input_dodge = True
                ai.input_move_x = -1.0 if opp.x > ai.x else 1.0
            # else: do nothing special, might get hit

        # Punish opponent recovery
        if opp.state == STATE_ATTACKING and opp.attack_timer is not None:
            if opp.attack_data and opp.attack_timer <= opp.attack_data.recovery * 0.5:
                dist = abs(ai.x - opp.x)
                if dist < CLOSE_RANGE and ai.state == STATE_IDLE:
                    ai.input_attack = "punch"
                    ai.input_block = False

    # ── Decision Layer ────────────────────────────────────────────────────

    def _make_decision(self, ai: Fighter, opp: Fighter) -> None:
        """High-level AI strategy, re-evaluated periodically."""
        # Don't override if we're in a committed state
        if ai.state in (STATE_ATTACKING, STATE_DODGING, STATE_HITSTUN):
            return

        dist = abs(ai.x - opp.x)
        health_pct = ai.health / 100.0
        toward_opp = 1.0 if opp.x > ai.x else -1.0

        # Reset inputs
        ai.input_block = False
        ai.input_attack = None
        ai.input_dodge = False
        ai.input_move_x = 0.0

        # ── Low health: cautious / retreat ───────────────────────────────
        if health_pct <= LOW_HEALTH_PCT:
            if dist < CLOSE_RANGE:
                # Try to retreat or dodge away
                if random.random() < 0.4:
                    ai.input_dodge = True
                    ai.input_move_x = -toward_opp
                else:
                    ai.input_move_x = -toward_opp
                    ai.input_block = True
            else:
                # Stay back, block
                ai.input_block = True
                if dist > MID_RANGE:
                    ai.input_move_x = toward_opp * 0.5
            return

        # ── Far away: approach ───────────────────────────────────────────
        if dist > MID_RANGE:
            ai.input_move_x = toward_opp
            return

        # ── Mid range: close in or use special ───────────────────────────
        if dist > CLOSE_RANGE:
            if ai.energy >= SPECIAL_ENERGY_THRESHOLD and random.random() < 0.3:
                ai.input_attack = "special"
            else:
                ai.input_move_x = toward_opp
            return

        # ── Close range: mix attacks and movement ────────────────────────
        roll = random.random()
        if roll < 0.35:
            # Attack mix
            atk_roll = random.random()
            if atk_roll < 0.45:
                ai.input_attack = "punch"
            elif atk_roll < 0.75:
                ai.input_attack = "kick"
            else:
                if ai.energy >= SPECIAL_ENERGY_THRESHOLD:
                    ai.input_attack = "special"
                else:
                    ai.input_attack = "punch"
        elif roll < 0.55:
            # Strafe
            ai.input_move_x = random.choice([-1.0, 1.0])
        elif roll < 0.70:
            # Block briefly
            ai.input_block = True
        elif roll < 0.80:
            # Dodge
            ai.input_dodge = True
            ai.input_move_x = random.choice([-1.0, 1.0])
        else:
            # Approach aggressively
            ai.input_move_x = toward_opp
