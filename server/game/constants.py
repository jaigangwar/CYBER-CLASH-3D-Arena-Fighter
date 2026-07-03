"""
CYBER CLASH - Game Constants
All gameplay tuning values and configuration.
"""

# --- Arena ---
ARENA_SIZE: float = 30.0

# --- Physics ---
GRAVITY: float = -35.0
MOVE_SPEED: float = 12.0
DODGE_SPEED: float = 28.0
DODGE_DURATION: float = 0.25

# --- Combat ---
BLOCK_DAMAGE_MULT: float = 0.15
MAX_HEALTH: float = 100.0
MAX_ENERGY: float = 100.0
ENERGY_REGEN: float = 8.0

# --- Classes ---
CLASS_STATS = {
    "brawler": {
        "max_health": 130.0,
        "move_speed_mult": 0.7,
        "damage_mult": 1.25,
        "energy_regen_mult": 0.9,
    },
    "ninja": {
        "max_health": 85.0,
        "move_speed_mult": 1.4,
        "damage_mult": 0.85,
        "energy_regen_mult": 1.2,
    },
    "mage": {
        "max_health": 95.0,
        "move_speed_mult": 0.9,
        "damage_mult": 1.0,
        "energy_regen_mult": 1.5,
    }
}


# --- Combo ---
COMBO_TIMEOUT: float = 1.2

# --- Match ---
ROUNDS_TO_WIN: int = 2
ROUND_TIME: float = 99.0

# --- Fighter ---
FIGHTER_RADIUS: float = 1.2

# --- Tick Rate ---
TICK_RATE: int = 60
TICK_INTERVAL: float = 1.0 / TICK_RATE

# --- Room ---
ROOM_CODE_LENGTH: int = 6

# --- Countdown ---
COUNTDOWN_SECONDS: int = 3

# --- States ---
STATE_IDLE: str = "idle"
STATE_MOVING: str = "moving"
STATE_ATTACKING: str = "attacking"
STATE_BLOCKING: str = "blocking"
STATE_DODGING: str = "dodging"
STATE_HITSTUN: str = "hitstun"
STATE_DEAD: str = "dead"
STATE_TAUNTING: str = "taunting"
STATE_FINISHER: str = "finisher"
