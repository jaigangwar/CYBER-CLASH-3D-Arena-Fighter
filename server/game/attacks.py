"""
CYBER CLASH - Attack Definitions
Each attack has timing windows (startup → active → recovery), damage, range, energy cost,
knockback force, and hitstun duration.
"""

from dataclasses import dataclass


@dataclass(frozen=True)
class AttackData:
    """Immutable definition for a single attack move."""
    name: str
    damage: float
    range: float
    startup: float        # seconds before hit can connect
    active: float         # seconds the hitbox is live
    recovery: float       # seconds of cooldown after active frames
    energy_cost: float
    knockback: float
    hitstun: float        # seconds the opponent is stunned on hit

    @property
    def total_duration(self) -> float:
        """Total animation length from start to end of recovery."""
        return self.startup + self.active + self.recovery


# ── Attack Registry ──────────────────────────────────────────────────────────

ATTACKS: dict[str, AttackData] = {
    "punch": AttackData(
        name="punch",
        damage=18,
        range=2.5,
        startup=0.08,
        active=0.12,
        recovery=0.2,
        energy_cost=0,
        knockback=6,
        hitstun=0.3,
    ),
    "kick": AttackData(
        name="kick",
        damage=25,
        range=3.0,
        startup=0.12,
        active=0.15,
        recovery=0.35,
        energy_cost=0,
        knockback=10,
        hitstun=0.4,
    ),
    "special": AttackData(
        name="special",
        damage=45,
        range=4.0,
        startup=0.2,
        active=0.2,
        recovery=0.5,
        energy_cost=35,
        knockback=18,
        hitstun=0.6,
    ),
    "brawler_heavy": AttackData(
        name="brawler_heavy",
        damage=60,
        range=3.0,
        startup=0.35,
        active=0.2,
        recovery=0.6,
        energy_cost=40,
        knockback=25,
        hitstun=0.8,
    ),
    "ninja_dash": AttackData(
        name="ninja_dash",
        damage=35,
        range=6.0,
        startup=0.1,
        active=0.15,
        recovery=0.25,
        energy_cost=25,
        knockback=8,
        hitstun=0.4,
    ),
    "mage_blast": AttackData(
        name="mage_blast",
        damage=40,
        range=15.0,
        startup=0.25,
        active=0.3,
        recovery=0.4,
        energy_cost=30,
        knockback=12,
        hitstun=0.5,
    ),
    "finisher": AttackData(
        name="finisher",
        damage=9999,
        range=10.0,
        startup=0.1,
        active=0.5,
        recovery=2.0,
        energy_cost=100,
        knockback=100,
        hitstun=2.0,
    ),
    "punch_left": AttackData(
        name="punch_left",
        damage=18,
        range=2.5,
        startup=0.08,
        active=0.12,
        recovery=0.2,
        energy_cost=0,
        knockback=6,
        hitstun=0.3,
    ),
    "punch_right": AttackData(
        name="punch_right",
        damage=18,
        range=2.5,
        startup=0.08,
        active=0.12,
        recovery=0.2,
        energy_cost=0,
        knockback=6,
        hitstun=0.3,
    ),
}


def get_attack(name: str) -> AttackData | None:
    """Look up an attack by name. Returns None if not found."""
    return ATTACKS.get(name)
