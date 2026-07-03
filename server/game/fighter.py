"""
CYBER CLASH - Fighter State
Mutable per-frame fighter state: position, health, energy, attack progress, combo, etc.
"""

from __future__ import annotations

import math

from game.constants import (
    ARENA_SIZE,
    BLOCK_DAMAGE_MULT,
    COMBO_TIMEOUT,
    DODGE_DURATION,
    DODGE_SPEED,
    ENERGY_REGEN,
    FIGHTER_RADIUS,
    GRAVITY,
    MAX_ENERGY,
    MAX_HEALTH,
    MOVE_SPEED,
    STATE_ATTACKING,
    STATE_BLOCKING,
    STATE_DEAD,
    STATE_DODGING,
    STATE_HITSTUN,
    STATE_IDLE,
    STATE_MOVING,
    STATE_TAUNTING,
    STATE_FINISHER,
    CLASS_STATS,
)
from game.attacks import AttackData, get_attack


class Fighter:
    """Server-authoritative fighter representation."""

    def __init__(self, player_id: str, start_x: float, char_class: str = "brawler") -> None:
        self.player_id: str = player_id
        self.char_class: str = char_class

        stats = CLASS_STATS.get(char_class, CLASS_STATS["brawler"])
        self.max_health = stats["max_health"]
        self.move_speed = MOVE_SPEED * stats["move_speed_mult"]
        self.dodge_speed = DODGE_SPEED * stats["move_speed_mult"]
        self.damage_mult = stats["damage_mult"]
        self.energy_regen = ENERGY_REGEN * stats["energy_regen_mult"]

        # Position (x is lateral, y is vertical / jump, z unused but sent)
        self.x: float = start_x
        self.y: float = 0.0
        self.z: float = 0.0
        self.vy: float = 0.0  # vertical velocity for jumps

        # Stats
        self.health: float = self.max_health
        self.energy: float = MAX_ENERGY

        # State machine
        self.state: str = STATE_IDLE
        self.facing: float = 1.0  # +1 = right, -1 = left

        # Attack tracking
        self.attack_type: str | None = None
        self.attack_timer: float = 0.0
        self.attack_data: AttackData | None = None
        self._hit_connected: bool = False  # prevents multi-hit per attack

        # Dodge
        self.dodge_timer: float = 0.0
        self.dodge_dir: float = 0.0

        # Hitstun
        self.hitstun_timer: float = 0.0

        # Combo
        self.combo: int = 0
        self.combo_timer: float = 0.0

        # Input snapshot (set by room from client messages)
        self.input_move_x: float = 0.0
        self.input_move_z: float = 0.0
        self.input_jump: bool = False
        self.input_block: bool = False
        self.input_attack: str | None = None
        self.input_dodge: bool = False

        # Blocking flag (derived each tick)
        self.blocking: bool = False

    # ── Reset ─────────────────────────────────────────────────────────────

    def reset(self, start_x: float) -> None:
        """Reset for a new round, keep player_id."""
        self.x = start_x
        self.y = 0.0
        self.z = 0.0
        self.vy = 0.0
        self.health = self.max_health
        self.energy = MAX_ENERGY
        self.state = STATE_IDLE
        self.attack_type = None
        self.attack_timer = 0.0
        self.attack_data = None
        self._hit_connected = False
        self.dodge_timer = 0.0
        self.dodge_dir = 0.0
        self.hitstun_timer = 0.0
        self.combo = 0
        self.combo_timer = 0.0
        self.blocking = False
        self.clear_inputs()

    def clear_inputs(self) -> None:
        self.input_move_x = 0.0
        self.input_move_z = 0.0
        self.input_jump = False
        self.input_block = False
        self.input_attack = None
        self.input_dodge = False
        self.input_taunt = False

    # ── Tick ──────────────────────────────────────────────────────────────

    def tick(self, dt: float, opponent: "Fighter") -> dict | None:
        """Advance one simulation frame. Returns a hit_event dict or None."""
        if self.state == STATE_DEAD:
            return None

        # Face opponent
        if opponent.x > self.x:
            self.facing = 1.0
        elif opponent.x < self.x:
            self.facing = -1.0

        # Combo decay
        if self.combo > 0:
            self.combo_timer -= dt
            if self.combo_timer <= 0:
                self.combo = 0
                self.combo_timer = 0.0

        # Energy regen
        regen_amount = self.energy_regen * dt
        if self.state == STATE_TAUNTING:
            regen_amount += 15.0 * dt  # Bonus energy for taunting
        self.energy = min(MAX_ENERGY, self.energy + regen_amount)

        hit_event: dict | None = None

        # ── State machine ────────────────────────────────────────────────
        if self.state == STATE_HITSTUN:
            self.hitstun_timer -= dt
            if self.hitstun_timer <= 0:
                self.hitstun_timer = 0.0
                self.state = STATE_IDLE

        elif self.state == STATE_DODGING:
            self.dodge_timer -= dt
            self.x += self.dodge_dir * self.dodge_speed * dt
            if self.dodge_timer <= 0:
                self.dodge_timer = 0.0
                self.state = STATE_IDLE

        elif self.state == STATE_TAUNTING:
            # Taunt ends when player moves or attacks
            if self.input_move_x != 0 or self.input_move_z != 0 or self.input_jump or self.input_dodge or self.input_attack:
                self.state = STATE_IDLE
            else:
                hit_event = None

        elif self.state == STATE_FINISHER:
            # Cinematic lock
            pass

        elif self.state == STATE_ATTACKING:
            self.attack_timer -= dt
            hit_event = self._process_attack(dt, opponent)
            if self.attack_timer <= 0:
                self.attack_timer = 0.0
                self.attack_type = None
                self.attack_data = None
                self._hit_connected = False
                self.state = STATE_IDLE

        else:
            # IDLE / MOVING – accept new inputs
            hit_event = self._handle_free_state(dt, opponent)

        # ── Gravity / Jump ───────────────────────────────────────────────
        if self.y > 0 or self.vy > 0:
            self.vy += GRAVITY * dt
            self.y += self.vy * dt
            if self.y <= 0:
                self.y = 0.0
                self.vy = 0.0

        # ── Arena bounds ─────────────────────────────────────────────────
        half = ARENA_SIZE / 2.0
        self.x = max(-half + FIGHTER_RADIUS, min(half - FIGHTER_RADIUS, self.x))

        return hit_event

    # ── Private helpers ───────────────────────────────────────────────────

    def _handle_free_state(self, dt: float, opponent: "Fighter") -> dict | None:
        """Process inputs when not locked in an action."""
        hit_event: dict | None = None

        # Blocking
        self.blocking = self.input_block
        if self.blocking:
            self.state = STATE_BLOCKING
        else:
            if self.state == STATE_BLOCKING:
                self.state = STATE_IDLE

        # Dodge (overrides block)
        if self.input_dodge and self.state != STATE_DODGING:
            self.state = STATE_DODGING
            self.dodge_timer = DODGE_DURATION
            self.dodge_dir = self.input_move_x if self.input_move_x != 0 else -self.facing
            self.blocking = False
            return None

        # Taunt
        if self.input_taunt and self.state != STATE_TAUNTING:
            self.state = STATE_TAUNTING
            self.blocking = False
            self.input_taunt = False
            return None

        # Finisher Trigger
        if self.input_attack == "finisher":
            if opponent.health <= opponent.max_health * 0.15 and self.energy >= MAX_ENERGY * 0.99:
                self.energy = 0
                self.state = STATE_FINISHER
                opponent.state = STATE_FINISHER
                opponent.health = 0
                self.input_attack = None
                return {
                    "attacker": self.player_id,
                    "target": opponent.player_id,
                    "attack": "finisher",
                    "damage": 9999,
                    "finisher": True
                }
            else:
                self.input_attack = None  # Consume if invalid

        # Attack (overrides movement)
        if self.input_attack and self.state != STATE_BLOCKING:
            atk = get_attack(self.input_attack)
            if atk and self.energy >= atk.energy_cost:
                self.energy -= atk.energy_cost
                self.state = STATE_ATTACKING
                self.attack_type = atk.name
                self.attack_timer = atk.total_duration
                self.attack_data = atk
                self._hit_connected = False
                self.input_attack = None  # consume
                return None

        # Movement
        if not self.blocking:
            dx = self.input_move_x * self.move_speed * dt
            dz = self.input_move_z * self.move_speed * dt
            if dx != 0 or dz != 0:
                self.x += dx
                self.z += dz
                self.state = STATE_MOVING
            else:
                if self.state == STATE_MOVING:
                    self.state = STATE_IDLE

        # Jump
        if self.input_jump and self.y <= 0.01:
            self.vy = 12.0
            self.y = 0.01

        return hit_event

    def _process_attack(self, dt: float, opponent: "Fighter") -> dict | None:
        """Check if the active frames land a hit on the opponent."""
        if self._hit_connected or self.attack_data is None:
            return None

        atk = self.attack_data
        elapsed = atk.total_duration - self.attack_timer

        # Only check during active window
        if elapsed < atk.startup or elapsed > atk.startup + atk.active:
            return None

        # Range check (simple 1-D distance)
        dist = abs(self.x - opponent.x)
        if dist > atk.range + FIGHTER_RADIUS:
            return None

        # Hit!
        self._hit_connected = True
        return self._apply_hit(opponent, atk)

    def _apply_hit(self, opponent: "Fighter", atk: AttackData) -> dict:
        """Apply damage, knockback, hitstun to opponent. Return event."""
        blocked = opponent.blocking

        if blocked:
            raw_damage = atk.damage * BLOCK_DAMAGE_MULT
        else:
            raw_damage = atk.damage

        # Combo scaling (each successive combo hit does 10% less, min 50%)
        combo_scale = max(0.5, 1.0 - 0.1 * self.combo)
        final_damage = raw_damage * combo_scale * self.damage_mult

        opponent.health = max(0.0, opponent.health - final_damage)

        # Knockback direction
        kb_dir = 1.0 if opponent.x >= self.x else -1.0
        kb_force = atk.knockback * (0.3 if blocked else 1.0)
        opponent.x += kb_dir * kb_force * 0.5  # instant displacement

        if not blocked:
            opponent.state = STATE_HITSTUN
            opponent.hitstun_timer = atk.hitstun
            opponent.blocking = False

        # Hazard check (Laser Wall)
        half = ARENA_SIZE / 2.0
        if opponent.x < -half + FIGHTER_RADIUS or opponent.x > half - FIGHTER_RADIUS:
            # Hit wall, apply extra damage and visual effect
            final_damage += 15.0
            opponent.health = max(0.0, opponent.health - 15.0)

        # Update combo
        self.combo += 1
        self.combo_timer = COMBO_TIMEOUT

        if opponent.health <= 0:
            opponent.state = STATE_DEAD

        return {
            "attacker": self.player_id,
            "target": opponent.player_id,
            "attack": atk.name,
            "attack_type": atk.name,
            "damage": round(final_damage, 1),
            "blocked": blocked,
            "critical": False,
            "combo": self.combo,
            "defender_pos": [
                round(opponent.x, 2),
                round(opponent.y, 2),
                round(opponent.z, 2),
            ],
        }

    # ── Serialisation ─────────────────────────────────────────────────────

    def to_dict(self) -> dict:
        """Snapshot for network transmission."""
        return {
            "health": round(self.health, 1),
            "energy": round(self.energy, 1),
            "x": round(self.x, 2),
            "y": round(self.y, 2),
            "z": round(self.z, 2),
            "state": self.state,
            "char_class": self.char_class,
            "attack_type": self.attack_type,
            "attack_timer": round(self.attack_timer, 3) if self.attack_timer else 0,
            "combo": self.combo,
            "blocking": self.blocking,
            "low_health": self.health <= self.max_health * 0.15 and self.health > 0,
        }
