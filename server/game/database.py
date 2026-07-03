import sqlite3
import os

DB_PATH = os.path.join(os.path.dirname(__file__), "..", "..", "cyberclash.db")

def init_db():
    conn = sqlite3.connect(DB_PATH)
    c = conn.cursor()
    c.execute("""CREATE TABLE IF NOT EXISTS players (
        username TEXT PRIMARY KEY,
        elo INTEGER DEFAULT 1000,
        wins INTEGER DEFAULT 0,
        losses INTEGER DEFAULT 0
    )""")
    conn.commit()
    conn.close()

def get_player(username):
    conn = sqlite3.connect(DB_PATH)
    c = conn.cursor()
    c.execute("SELECT elo, wins, losses FROM players WHERE username=?", (username,))
    row = c.fetchone()
    conn.close()
    if row:
        return {"username": username, "elo": row[0], "wins": row[1], "losses": row[2]}
    return {"username": username, "elo": 1000, "wins": 0, "losses": 0}

def update_match_result(winner_username, loser_username):
    if not winner_username or not loser_username: return
    conn = sqlite3.connect(DB_PATH)
    c = conn.cursor()
    # Ensure exist
    for u in [winner_username, loser_username]:
        c.execute("INSERT OR IGNORE INTO players (username) VALUES (?)", (u,))
    
    # ELO calculation (simple +25 / -25)
    c.execute("UPDATE players SET elo = elo + 25, wins = wins + 1 WHERE username=?", (winner_username,))
    c.execute("UPDATE players SET elo = MAX(0, elo - 25), losses = losses + 1 WHERE username=?", (loser_username,))
    conn.commit()
    conn.close()

def get_leaderboard(limit=10):
    conn = sqlite3.connect(DB_PATH)
    c = conn.cursor()
    c.execute("SELECT username, elo, wins, losses FROM players ORDER BY elo DESC LIMIT ?", (limit,))
    rows = c.fetchall()
    conn.close()
    return [{"username": r[0], "elo": r[1], "wins": r[2], "losses": r[3]} for r in rows]

init_db()
