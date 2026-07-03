/* ═══════════════════════════════════════════════════════
   CYBER CLASH - Network Manager
   WebSocket client for multiplayer connectivity
   ═══════════════════════════════════════════════════════ */

export class NetworkManager {
  constructor() {
    this.ws = null;
    
    // Determine the WebSocket URL:
    // 1. Use environment variable if provided (for production)
    // 2. Default to localhost:8000 for local development
    this.url = import.meta.env?.VITE_WS_URL || 'ws://localhost:8000/ws';
    
    this.connected = false;
    this.playerId = null;     // 'p1' or 'p2'
    this.roomCode = null;
    this.playerName = null;

    // Event emitter
    this._listeners = {};

    // Auto-reconnect
    this._shouldReconnect = false;
    this._reconnectAttempts = 0;
    this._maxReconnectAttempts = 10;
    this._baseReconnectDelay = 500;   // ms
    this._maxReconnectDelay = 30000;  // ms
    this._reconnectTimer = null;

    // Heartbeat / ping
    this._pingInterval = null;
    this._lastPong = 0;
  }

  // ─── EVENT EMITTER ──────────────────────────────────────

  /**
   * Register a callback for an event.
   * Events: 'connected', 'disconnected', 'room_created', 'room_joined',
   *         'player_joined', 'player_left', 'player_ready', 'countdown',
   *         'fight_start', 'state_update', 'hit_event', 'round_end',
   *         'game_over', 'chat', 'gesture', 'error', 'matchmaking',
   *         'reconnecting', 'reconnected'
   */
  on(event, callback) {
    if (!this._listeners[event]) this._listeners[event] = [];
    this._listeners[event].push(callback);
  }

  off(event, callback) {
    if (!this._listeners[event]) return;
    this._listeners[event] = this._listeners[event].filter(cb => cb !== callback);
  }

  _emit(event, data) {
    const cbs = this._listeners[event];
    if (cbs) {
      for (const cb of cbs) {
        try { cb(data); } catch (e) { console.error(`[NetworkManager] Event handler error (${event}):`, e); }
      }
    }
  }

  // ─── CONNECTION ─────────────────────────────────────────

  connect() {
    return new Promise((resolve, reject) => {
      if (this.ws && (this.ws.readyState === WebSocket.OPEN || this.ws.readyState === WebSocket.CONNECTING)) {
        resolve();
        return;
      }

      this._shouldReconnect = true;

      try {
        this.ws = new WebSocket(this.url);
      } catch (e) {
        reject(e);
        return;
      }

      const onOpenOnce = () => {
        this.connected = true;
        this._reconnectAttempts = 0;
        this._lastPong = Date.now();
        this._startPing();
        this._emit('connected', {});
        resolve();
      };

      const onErrorOnce = (e) => {
        cleanup();
        reject(new Error('WebSocket connection failed'));
      };

      const cleanup = () => {
        this.ws.removeEventListener('open', onOpenOnce);
        this.ws.removeEventListener('error', onErrorOnce);
      };

      this.ws.addEventListener('open', onOpenOnce, { once: true });
      this.ws.addEventListener('error', onErrorOnce, { once: true });

      // Persistent handlers
      this.ws.addEventListener('message', (e) => this._onMessage(e));
      this.ws.addEventListener('close', (e) => this._onClose(e));
      this.ws.addEventListener('error', () => {}); // Suppress unhandled errors after connect
    });
  }

  disconnect() {
    this._shouldReconnect = false;
    this._stopPing();
    clearTimeout(this._reconnectTimer);
    this._reconnectTimer = null;
    if (this.ws) {
      this.ws.close(1000, 'Client disconnect');
      this.ws = null;
    }
    this.connected = false;
    this.playerId = null;
    this.roomCode = null;
    this._emit('disconnected', { reason: 'client' });
  }

  _onClose(event) {
    this.connected = false;
    this._stopPing();
    this._emit('disconnected', { code: event.code, reason: event.reason || 'connection_lost' });

    if (this._shouldReconnect && this._reconnectAttempts < this._maxReconnectAttempts) {
      this._scheduleReconnect();
    }
  }

  _scheduleReconnect() {
    const delay = Math.min(
      this._baseReconnectDelay * Math.pow(2, this._reconnectAttempts),
      this._maxReconnectDelay
    );
    // Add jitter: ±25% of delay
    const jitter = delay * (0.75 + Math.random() * 0.5);
    this._reconnectAttempts++;

    this._emit('reconnecting', {
      attempt: this._reconnectAttempts,
      maxAttempts: this._maxReconnectAttempts,
      delay: Math.round(jitter),
    });

    this._reconnectTimer = setTimeout(async () => {
      try {
        await this.connect();
        this._emit('reconnected', { attempt: this._reconnectAttempts });
        // Re-join room if we were in one
        if (this.roomCode && this.playerName) {
          this.joinRoom(this.roomCode, this.playerName);
        }
      } catch (e) {
        // connect() will trigger _onClose again which will reschedule
      }
    }, jitter);
  }

  _onMessage(event) {
    let msg;
    try {
      msg = JSON.parse(event.data);
    } catch (e) {
      console.warn('[NetworkManager] Invalid JSON:', event.data);
      return;
    }

    const { type, ...data } = msg;

    switch (type) {
      case 'room_created':
        this.roomCode = data.room_code;
        this.playerId = data.player_id;
        this._emit('room_created', data);
        break;

      case 'room_joined':
        this.roomCode = data.room_code;
        this.playerId = data.player_id;
        this._emit('room_joined', data);
        break;

      case 'player_joined':
        this._emit('player_joined', data);
        break;

      case 'player_left':
        this._emit('player_left', data);
        break;

      case 'player_ready':
        this._emit('player_ready', data);
        break;

      case 'countdown':
        this._emit('countdown', data);
        break;

      case 'fight_start':
        this._emit('fight_start', data);
        break;

      case 'state_update':
        this._emit('state_update', data);
        break;

      case 'hit_event':
        this._emit('hit_event', data);
        break;

      case 'round_end':
        this._emit('round_end', data);
        break;

      case 'game_over':
        this._emit('game_over', data);
        break;

      case 'chat':
        this._emit('chat', data);
        break;

      case 'gesture':
        this._emit('gesture', data);
        break;

      case 'matchmaking':
        this._emit('matchmaking', data);
        break;

      case 'error':
        this._emit('error', data);
        break;

      case 'pong':
        this._lastPong = Date.now();
        break;

      default:
        // Forward unknown events with their type
        this._emit(type, data);
        break;
    }
  }

  // ─── HEARTBEAT ──────────────────────────────────────────

  _startPing() {
    this._stopPing();
    this._pingInterval = setInterval(() => {
      if (this.connected && this.ws && this.ws.readyState === WebSocket.OPEN) {
        this._send({ type: 'ping' });

        // If no pong in 10 seconds, consider connection dead
        if (Date.now() - this._lastPong > 10000) {
          console.warn('[NetworkManager] Ping timeout, closing connection');
          this.ws.close(4000, 'Ping timeout');
        }
      }
    }, 5000);
  }

  _stopPing() {
    if (this._pingInterval) {
      clearInterval(this._pingInterval);
      this._pingInterval = null;
    }
  }

  // ─── SEND HELPER ────────────────────────────────────────

  _send(data) {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
      console.warn('[NetworkManager] Cannot send, not connected');
      return false;
    }
    try {
      this.ws.send(JSON.stringify(data));
      return true;
    } catch (e) {
      console.error('[NetworkManager] Send error:', e);
      return false;
    }
  }

  // ─── ROOM MANAGEMENT ───────────────────────────────────

  /**
   * Create a new game room.
   * @param {string} mode - Game mode ('gesture', 'keyboard', 'mixed')
   * @param {string} playerName - Display name for this player
   */
  createRoom(mode, playerName, charClass = 'brawler') {
    this.playerName = playerName;
    this.charClass = charClass;
    return this._send({
      type: 'create_room',
      mode: mode,
      player_name: playerName,
      char_class: charClass,
    });
  }

  /**
   * Join an existing room by code.
   * @param {string} code - Room code (e.g. 'ABCD')
   * @param {string} playerName - Display name for this player
   */
  joinRoom(code, playerName, charClass = 'brawler') {
    this.playerName = playerName;
    this.roomCode = code;
    this.charClass = charClass;
    return this._send({
      type: 'join_room',
      room_code: code,
      player_name: playerName,
      char_class: charClass,
    });
  }

  /**
   * Request matchmaking to find an opponent.
   * @param {string} playerName - Display name for this player
   */
  matchmake(playerName, charClass = 'brawler') {
    this.playerName = playerName;
    this.charClass = charClass;
    return this._send({
      type: 'matchmake',
      player_name: playerName,
      char_class: charClass,
    });
  }

  /**
   * Leave the current room.
   */
  leaveRoom() {
    const result = this._send({
      type: 'leave_room',
      room_code: this.roomCode,
    });
    this.roomCode = null;
    this.playerId = null;
    return result;
  }

  /**
   * Signal ready to start.
   */
  setReady() {
    return this._send({
      type: 'ready',
      room_code: this.roomCode,
    });
  }

  /**
   * Request fight start (host only, both players must be ready).
   */
  startFight() {
    return this._send({
      type: 'start_fight',
      room_code: this.roomCode,
    });
  }

  // ─── GAMEPLAY INPUT ─────────────────────────────────────

  /**
   * Send player input actions to the server.
   * @param {Object} actions - Action flags { punch: bool, kick: bool, special: bool, block: bool, dodge: bool }
   * @param {Object} movement - Movement vector { x: number, z: number }
   */
  sendInput(actions, movement) {
    return this._send({
      type: 'input',
      room_code: this.roomCode,
      actions: actions,
      movement: movement,
    });
  }

  /**
   * Send a gesture detection result to the server.
   * @param {string} gesture - Gesture name ('punch', 'kick', 'block', etc.)
   */
  sendGesture(gesture) {
    return this._send({
      type: 'gesture',
      room_code: this.roomCode,
      gesture: gesture,
    });
  }

  /**
   * Send a chat message.
   * @param {string} message - Chat message text
   */
  sendChat(message) {
    return this._send({
      type: 'chat',
      room_code: this.roomCode,
      message: message,
    });
  }

  // ─── UTILITY ────────────────────────────────────────────

  /**
   * Get current connection status.
   */
  getStatus() {
    return {
      connected: this.connected,
      playerId: this.playerId,
      roomCode: this.roomCode,
      playerName: this.playerName,
      reconnectAttempts: this._reconnectAttempts,
      wsState: this.ws ? ['CONNECTING', 'OPEN', 'CLOSING', 'CLOSED'][this.ws.readyState] : 'NONE',
    };
  }

  /**
   * Check if we're the host (player 1).
   */
  isHost() {
    return this.playerId === 'p1';
  }

  /**
   * Destroy the network manager, clean up all resources.
   */
  destroy() {
    this.disconnect();
    this._listeners = {};
  }
}
