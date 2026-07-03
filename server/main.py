"""
CYBER CLASH - FastAPI + WebSocket Server
Entry point: handles WS connections, routes client messages to rooms/matchmaking.
Run with: uvicorn server.main:app --host 0.0.0.0 --port 8000 --reload
"""

from __future__ import annotations

import json
import uuid
import sys
import os

# Add server directory to sys.path so modules can be found when run from project root
sys.path.append(os.path.dirname(os.path.abspath(__file__)))

from fastapi import FastAPI, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware

from multiplayer import messages as msg
from multiplayer.room import Room, create_room, get_room, remove_room
from multiplayer.matchmaking import matchmaking_queue
from game.database import get_leaderboard

# ── FastAPI App ───────────────────────────────────────────────────────────

app = FastAPI(title="CYBER CLASH Server", version="1.0.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Track which room each player_id is in
_player_rooms: dict[str, str] = {}  # player_id → room_code


# ── WebSocket Endpoint ───────────────────────────────────────────────────

@app.websocket("/ws")
async def websocket_endpoint(ws: WebSocket) -> None:
    await ws.accept()

    player_id: str = str(uuid.uuid4())[:8]
    current_room: Room | None = None

    try:
        while True:
            raw = await ws.receive_text()
            try:
                data = json.loads(raw)
            except json.JSONDecodeError:
                await ws.send_text(msg.error("Invalid JSON"))
                continue

            msg_type = data.get("type", "")

            # ── CREATE ROOM ──────────────────────────────────────────
            if msg_type == "create_room":
                mode = data.get("mode", "pvp")
                char_class = data.get("char_class", "brawler")
                player_name = data.get("player_name", "Player")
                room = create_room(mode=mode)
                room.add_player(player_id, ws, char_class, player_name)
                current_room = room
                _player_rooms[player_id] = room.code

                await ws.send_text(msg.room_created(room.code, player_id))

                # If AI mode, auto-start is available immediately
                if mode == "ai":
                    pass  # client sends ready / start_fight

            # ── JOIN ROOM ────────────────────────────────────────────
            elif msg_type == "join_room":
                code = data.get("room_code", "").upper()
                char_class = data.get("char_class", "brawler")
                player_name = data.get("player_name", "Player")
                room = get_room(code)
                if not room:
                    await ws.send_text(msg.error("Room not found"))
                    continue
                if room.is_full:
                    await ws.send_text(msg.error("Room is full"))
                    continue

                room.add_player(player_id, ws, char_class, player_name)
                current_room = room
                _player_rooms[player_id] = room.code

                await ws.send_text(
                    msg.room_joined(room.code, player_id, room.player_ids)
                )
                # Notify existing players
                for pid in room.player_ids:
                    if pid != player_id:
                        await room.send_to(pid, msg.player_joined(player_id))

            # ── MATCHMAKE ────────────────────────────────────────────
            elif msg_type == "matchmake":
                char_class = data.get("char_class", "brawler")
                player_name = data.get("player_name", "Player")
                room = await matchmaking_queue.enqueue(player_id, ws, char_class, player_name)
                if room:
                    current_room = room
                    _player_rooms[player_id] = room.code

            # ── LEAVE ROOM ───────────────────────────────────────────
            elif msg_type == "leave_room":
                if current_room:
                    current_room.remove_player(player_id)
                    await current_room.broadcast(msg.opponent_disconnected())
                    if current_room.is_empty:
                        await current_room.stop()
                        remove_room(current_room.code)
                    current_room = None
                    _player_rooms.pop(player_id, None)

            # ── READY ────────────────────────────────────────────────
            elif msg_type == "ready":
                if current_room:
                    current_room.mark_ready(player_id)
                    await current_room.broadcast(msg.player_ready(player_id))

                    # Auto-start if all ready
                    if current_room.all_ready and current_room.engine is None:
                        await current_room.start_fight()

            # ── START FIGHT (explicit) ───────────────────────────────
            elif msg_type == "start_fight":
                if current_room and current_room.engine is None:
                    await current_room.start_fight()

            # ── INPUT ────────────────────────────────────────────────
            elif msg_type == "input":
                if current_room:
                    current_room.apply_input(player_id, data)

            # ── GESTURE ──────────────────────────────────────────────
            elif msg_type == "gesture":
                if current_room:
                    gesture_msg = json.dumps({
                        "type": "gesture",
                        "player_id": player_id,
                        "gesture": data.get("gesture", ""),
                    })
                    await current_room.broadcast(gesture_msg)

            # ── CHAT ─────────────────────────────────────────────────
            elif msg_type == "chat":
                if current_room:
                    text = str(data.get("text", ""))[:200]  # limit length
                    await current_room.broadcast(msg.chat(player_id, text))

            # ── PING ─────────────────────────────────────────────────
            elif msg_type == "ping":
                await ws.send_text(json.dumps({"type": "pong"}))

            # ── UNKNOWN ──────────────────────────────────────────────
            else:
                await ws.send_text(msg.error(f"Unknown message type: {msg_type}"))

    except WebSocketDisconnect:
        pass
    except Exception:
        pass
    finally:
        # Cleanup on disconnect
        await matchmaking_queue.remove(player_id)
        if current_room:
            current_room.remove_player(player_id)
            await current_room.broadcast(msg.opponent_disconnected())
            if current_room.is_empty:
                await current_room.stop()
                remove_room(current_room.code)
        _player_rooms.pop(player_id, None)


# ── Health check ──────────────────────────────────────────────────────────

@app.get("/health")
async def health():
    return {"status": "ok", "game": "CYBER CLASH"}


# ── Run with uvicorn ──────────────────────────────────────────────────────

if __name__ == "__main__":
    import uvicorn
    uvicorn.run("main:app", host="0.0.0.0", port=8000, reload=True)

@app.get("/api/leaderboard")
async def leaderboard():
    return {"leaderboard": get_leaderboard()}
