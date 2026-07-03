/* ═══════════════════════════════════════════════════════
   CYBER CLASH - Main React App (Multiplayer Edition)
   Ties together Game Engine, OpenCV, NetworkManager, and UI
   ═══════════════════════════════════════════════════════ */
import { useState, useEffect, useRef, useCallback } from 'react';
import { GameEngine, MAX_HEALTH, MAX_ENERGY, ROUNDS_TO_WIN } from './engine/GameEngine';
import { GestureDetector } from './engine/GestureDetector';
import { NetworkManager } from './engine/NetworkManager';

export default function App() {
  const containerRef = useRef(null);
  const engineRef = useRef(null);
  const gestureRef = useRef(null);
  const networkRef = useRef(null);
  const videoRef = useRef(null);
  const canvasRef = useRef(null);
  const rafRef = useRef(null);
  const keysRef = useRef({});

  const [gameScreen, setGameScreen] = useState('loading');
  const [hud, setHud] = useState(null);
  const [announcement, setAnnouncement] = useState(null);
  const [webcamActive, setWebcamActive] = useState(false);
  const [gestureLabel, setGestureLabel] = useState('');
  const [inputMode, setInputMode] = useState('keyboard');
  const [showControls, setShowControls] = useState(false);
  const [damageNums, setDamageNums] = useState([]);
  const [showHitFlash, setShowHitFlash] = useState(false);
  const [loadProgress, setLoadProgress] = useState(0);
  const [loadText, setLoadText] = useState('INITIALIZING...');
  const [activeKeys, setActiveKeys] = useState({});

  // Multiplayer state
  const [playerName, setPlayerName] = useState(() => localStorage.getItem('cyberclash_name') || '');
  const [charClass, setCharClass] = useState('brawler');
  const [gameMode, setGameMode] = useState(null); // 'ai' | 'pvp'
  const [connected, setConnected] = useState(false);
  const [roomCode, setRoomCode] = useState('');
  const [joinCode, setJoinCode] = useState('');
  const [players, setPlayers] = useState([]);
  const [playerId, setPlayerId] = useState(null);
  const [opponentName, setOpponentName] = useState('');
  
  // Use a ref to access latest state inside network event listeners (which have empty dependency array)
  const stateRef = useRef({ playerId: null, playerName, opponentName });
  useEffect(() => {
    stateRef.current = { playerId, playerName, opponentName };
  }, [playerId, playerName, opponentName]);

  const [isReady, setIsReady] = useState(false);
  const [opponentReady, setOpponentReady] = useState(false);
  const [countdown, setCountdown] = useState(null);
  const [chatMessages, setChatMessages] = useState([]);
  const [chatInput, setChatInput] = useState('');
  const [matchmakeStatus, setMatchmakeStatus] = useState('');
  const [codeCopied, setCodeCopied] = useState(false);
  const [serverError, setServerError] = useState('');
  const [roundWinner, setRoundWinner] = useState(null);
  const [gameOverData, setGameOverData] = useState(null);

  const chatEndRef = useRef(null);
  const nameInputRef = useRef(null);

  // ═══ KEY TRACKING ═══
  useEffect(() => {
    const handleKeyDown = (e) => {
      if (['INPUT', 'TEXTAREA'].includes(e.target.tagName)) return;
      keysRef.current[e.code] = true;
      keysRef.current[e.key] = true;
      setActiveKeys(prev => ({ ...prev, [e.code]: true, [e.key]: true }));
    };
    const handleKeyUp = (e) => {
      if (['INPUT', 'TEXTAREA'].includes(e.target.tagName)) return;
      keysRef.current[e.code] = false;
      keysRef.current[e.key] = false;
      setActiveKeys(prev => ({ ...prev, [e.code]: false, [e.key]: false }));
    };
    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('keyup', handleKeyUp);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('keyup', handleKeyUp);
    };
  }, []);

  // ═══ INITIALIZE ENGINE + NETWORK ═══
  useEffect(() => {
    let mounted = true;
    const engine = new GameEngine('offline');
    engineRef.current = engine;
    const detector = new GestureDetector();
    gestureRef.current = detector;
    const network = new NetworkManager();
    networkRef.current = network;

    const initGame = async () => {
      if (!containerRef.current) return;

      setLoadText('INITIALIZING RENDERER...'); setLoadProgress(10);
      await delay(200);
      if (!mounted) return;

      engine.init(containerRef.current);

      setLoadText('BUILDING ARENA...'); setLoadProgress(30);
      await delay(200);
      if (!mounted) return;

      setLoadText('LOADING FIGHTERS...'); setLoadProgress(55);
      await delay(200);
      if (!mounted) return;

      setLoadText('CALIBRATING AI NEURAL NETWORK...'); setLoadProgress(80);
      await delay(300);
      if (!mounted) return;

      setLoadText('CONNECTING TO BATTLE NETWORK...'); setLoadProgress(90);
      // Try to connect
      try {
        await network.connect();
        if (mounted) setConnected(true);
      } catch (e) {
        // Server might not be running, that's ok for offline
        console.warn('Server not available:', e);
      }
      if (!mounted) return;

      setLoadText('SYSTEMS ONLINE'); setLoadProgress(100);
      await delay(400);
      if (!mounted) return;

      setGameScreen('menu');
    };

    initGame();

    return () => {
      mounted = false;
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
      if (engineRef.current) {
        engineRef.current.destroy();
        if (containerRef.current) containerRef.current.innerHTML = '';
      }
      if (gestureRef.current) gestureRef.current.stop();
      if (networkRef.current) networkRef.current.disconnect();
    };
  }, []);

  // ═══ NETWORK EVENT LISTENERS ═══
  useEffect(() => {
    const network = networkRef.current;
    if (!network) return;

    const onConnected = () => setConnected(true);
    const onDisconnected = () => {
      setConnected(false);
      if (gameScreen === 'fighting') {
        setServerError('Connection lost');
      }
    };
    const onError = (data) => {
      setServerError(data.message || 'Server error');
      setTimeout(() => setServerError(''), 4000);
    };

    const onRoomCreated = (data) => {
      setRoomCode(data.room_code || data.roomCode || '');
      setPlayerId(data.player_id || data.playerId || 'p1');
      if (engineRef.current) {
        engineRef.current.mode = 'online';
        engineRef.current.setPlayerId(data.player_id || data.playerId || 'p1');
      }
      setPlayers(data.players || []);
      if (networkRef.current?.roomMode === 'ai' || gameMode === 'ai' || stateRef.current.gameMode === 'ai') {
        // AI mode - auto ready and start match
        setGameScreen('matchmaking');
        setIsReady(true);
        networkRef.current?.setReady();
        setTimeout(() => {
          networkRef.current?.startFight();
        }, 800);
      } else {
        setGameScreen('room');
      }
    };

    const onRoomJoined = (data) => {
      setRoomCode(data.room_code || data.roomCode || '');
      setPlayerId(data.player_id || data.playerId || 'p2');
      if (engineRef.current) {
        engineRef.current.mode = 'online';
        engineRef.current.setPlayerId(data.player_id || data.playerId || 'p2');
      }
      setPlayers(data.players || []);
      const opp = (data.players || []).find(p => p.id !== (data.player_id || data.playerId || 'p2'));
      if (opp) setOpponentName(opp.name || 'OPPONENT');
      setGameScreen('room');
    };

    const onPlayerJoined = (data) => {
      setPlayers(data.players || []);
      const currentPid = stateRef.current.playerId || networkRef.current?.playerId;
      const opp = (data.players || []).find(p => p.id !== currentPid);
      if (opp) setOpponentName(opp.name || 'OPPONENT');
    };

    const onPlayerReady = (data) => {
      setPlayers(data.players || []);
      const currentPid = stateRef.current.playerId || networkRef.current?.playerId;
      const opp = (data.players || []).find(p => p.id !== currentPid);
      if (opp) setOpponentReady(opp.ready || false);
    };

    const onCountdown = (data) => {
      const count = data.seconds ?? data.count ?? data.countdown ?? 3;
      setCountdown(count);
      
      // Transition to intro cinematic when countdown starts
      if (count === 3) {
        setGameScreen('intro');
        if (engineRef.current) {
          engineRef.current.gameState = 'intro';
          engineRef.current.introTimer = 4.0;
        }
      }

      if (count === 0) {
        setTimeout(() => {
          setCountdown(null);
          setGameScreen('fighting');
          if (engineRef.current) engineRef.current.gameState = 'fighting';
        }, 500);
      }
    };

    const onGameState = (payload) => {
      const data = payload.state || payload;
      const currentPid = stateRef.current.playerId || networkRef.current?.playerId;
      const currentPName = stateRef.current.playerName;
      const currentOName = stateRef.current.opponentName;
      
      if (engineRef.current && currentPid) {
        engineRef.current.applyServerState(data, currentPid);
      }

      // Map player/enemy based on currentPid
      const isP1 = currentPid === data.p1_id || currentPid === 'p1';
      const me = isP1 ? data.p1 : data.p2;
      const enemy = isP1 ? data.p2 : data.p1;
      const myName = isP1 ? (data.p1_name || currentPName) : (data.p2_name || currentPName);
      const enemyName = isP1 ? (data.p2_name || currentOName) : (data.p1_name || currentOName);

      if (me && enemy) {
        setHud({
          player: {
            health: me.health ?? MAX_HEALTH,
            energy: me.energy ?? MAX_ENERGY,
            combo: me.combo || 0,
            state: me.state || 'idle',
            totalHits: me.totalHits || me.total_hits || 0,
            maxCombo: me.maxCombo || me.max_combo || 0,
            totalDamage: me.totalDamage || me.total_damage || 0,
            specialsUsed: me.specialsUsed || me.specials_used || 0,
          },
          enemy: {
            health: enemy.health ?? MAX_HEALTH,
            energy: enemy.energy ?? MAX_ENERGY,
            combo: enemy.combo || 0,
            state: enemy.state || 'idle',
          },
          roundNumber: data.round || data.roundNumber || 1,
          roundTimer: data.timer ?? data.roundTimer ?? 99,
          playerWins: isP1 ? (data.p1_wins ?? 0) : (data.p2_wins ?? 0),
          enemyWins: isP1 ? (data.p2_wins ?? 0) : (data.p1_wins ?? 0),
          gameState: data.state || data.gameState || 'fighting',
          playerName: myName,
          enemyName: enemyName,
        });
      }
    };

    const onHitEvent = (data) => {
      const currentPid = stateRef.current.playerId || networkRef.current?.playerId;
      if (engineRef.current) engineRef.current.handleHitEvent(data, currentPid);
      // Add damage numbers
      const dmg = {
        damage: data.damage || 0,
        critical: data.critical || false,
        x: Math.random() * 200 + (data.target === currentPid ? 100 : window.innerWidth - 400),
        y: Math.random() * 100 + 80,
        time: performance.now(),
      };
      setDamageNums(prev => [...prev, dmg]);
      setShowHitFlash(true);
      setTimeout(() => setShowHitFlash(false), 120);
    };

    const onRoundEnd = (data) => {
      const winner = data.winner;
      const didWin = winner === playerId;
      setRoundWinner({
        winner,
        didWin,
        p1Wins: data.p1_wins ?? 0,
        p2Wins: data.p2_wins ?? 0,
      });
      setGameScreen('roundResult');
    };

    const onGameOver = (data) => {
      const winner = data.winner;
      const didWin = winner === playerId;
      setGameOverData({
        winner,
        didWin,
        p1Wins: data.p1_wins ?? 0,
        p2Wins: data.p2_wins ?? 0,
        stats: data.stats || {},
      });
      setGameScreen('gameOver');
    };

    const onOpponentDisconnected = () => {
      setServerError('Opponent disconnected');
      setTimeout(() => {
        setGameScreen('menu');
        resetMultiplayerState();
      }, 3000);
    };

    const onMatchmakeWaiting = () => {
      setMatchmakeStatus('Searching for opponent...');
    };

    const onMatchmakeFound = (data) => {
      setMatchmakeStatus('Opponent found!');
      setRoomCode(data.room_code || data.roomCode || '');
      setPlayerId(data.player_id || data.playerId || '');
      if (engineRef.current) engineRef.current.setPlayerId(data.player_id || data.playerId || '');
      setPlayers(data.players || []);
      setTimeout(() => setGameScreen('room'), 800);
    };

    const onChat = (data) => {
      setChatMessages(prev => [...prev, {
        sender: data.sender || data.player_name || 'Unknown',
        senderId: data.sender_id || data.playerId || '',
        message: data.message || '',
        time: Date.now(),
      }]);
    };

    network.on('connected', onConnected);
    network.on('disconnected', onDisconnected);
    network.on('error', onError);
    network.on('room_created', onRoomCreated);
    network.on('room_joined', onRoomJoined);
    network.on('player_joined', onPlayerJoined);
    network.on('player_ready', onPlayerReady);
    network.on('countdown', onCountdown);
    network.on('game_state', onGameState);
    network.on('hit_event', onHitEvent);
    network.on('round_end', onRoundEnd);
    network.on('game_over', onGameOver);
    network.on('opponent_disconnected', onOpponentDisconnected);
    network.on('matchmake_waiting', onMatchmakeWaiting);
    network.on('matchmake_found', onMatchmakeFound);
    network.on('chat', onChat);

    return () => {
      network.off('connected', onConnected);
      network.off('disconnected', onDisconnected);
      network.off('error', onError);
      network.off('room_created', onRoomCreated);
      network.off('room_joined', onRoomJoined);
      network.off('player_joined', onPlayerJoined);
      network.off('player_ready', onPlayerReady);
      network.off('countdown', onCountdown);
      network.off('game_state', onGameState);
      network.off('hit_event', onHitEvent);
      network.off('round_end', onRoundEnd);
      network.off('game_over', onGameOver);
      network.off('opponent_disconnected', onOpponentDisconnected);
      network.off('matchmake_waiting', onMatchmakeWaiting);
      network.off('matchmake_found', onMatchmakeFound);
      network.off('chat', onChat);
    };
  }, [gameScreen, playerId, gameMode, playerName, opponentName]);

  // ═══ ONLINE FIGHTING LOOP ═══
  useEffect(() => {
    if (gameScreen !== 'fighting' || !gameMode) return;
    const network = networkRef.current;
    if (!network) return;

    const loop = () => {
      const keys = keysRef.current;
      const actions = {
        punch: !!keys['KeyJ'],
        kick: !!keys['KeyK'],
        special: !!keys['KeyL'],
        block: !!keys['Space'],
        dodge: !!keys['ShiftLeft'] || !!keys['ShiftRight'],
      };
      const movement = {
        up: !!keys['KeyW'],
        down: !!keys['KeyS'],
        left: !!keys['KeyA'],
        right: !!keys['KeyD'],
      };
      network.sendInput(actions, movement);
      rafRef.current = requestAnimationFrame(loop);
    };

    rafRef.current = requestAnimationFrame(loop);

    return () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
    };
  }, [gameScreen, gameMode]);

  // ═══ OFFLINE ENGINE STATE SYNC ═══
  useEffect(() => {
    if (gameMode !== null) return; // Only for offline
    const engine = engineRef.current;
    if (!engine) return;

    engine.onStateChange = (state) => {
      setHud(state);

      if (state.gameState === 'announce') {
        setAnnouncement({ text: `ROUND ${state.roundNumber}`, ko: false });
      } else if (state.gameState === 'announce_fight') {
        setAnnouncement({ text: 'FIGHT!', ko: false });
      } else if (state.gameState === 'roundEnd') {
        setAnnouncement({ text: 'K.O.!', ko: true });
      } else {
        setAnnouncement(null);
      }

      setGameScreen(state.gameState);

      if (engine.damageNumbers.length > 0) {
        setDamageNums(prev => [...prev, ...engine.damageNumbers]);
        engine.damageNumbers = [];
        setShowHitFlash(true);
        setTimeout(() => setShowHitFlash(false), 120);
      }
    };
  }, [gameMode]);

  // ═══ CLEAN DAMAGE NUMBERS ═══
  useEffect(() => {
    if (damageNums.length === 0) return;
    const timer = setTimeout(() => {
      const now = performance.now();
      setDamageNums(prev => prev.filter(d => now - d.time < 800));
    }, 900);
    return () => clearTimeout(timer);
  }, [damageNums]);

  // ═══ AUTO SCROLL CHAT ═══
  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [chatMessages]);

  // ═══ GESTURE HANDLER ═══
  const handleGesture = useCallback((gesture) => {
    setGestureLabel(gestureRef.current?.getGestureName() || '');
    if (gameMode && networkRef.current) {
      networkRef.current.sendGesture(gesture);
    } else if (engineRef.current) {
      engineRef.current.handleGesture(gesture);
    }
  }, [gameMode]);

  const toggleWebcam = async () => {
    if (webcamActive) {
      gestureRef.current?.stop();
      setWebcamActive(false);
      setInputMode('keyboard');
      setGestureLabel('');
    } else {
      if (!videoRef.current || !canvasRef.current) return;
      const gd = gestureRef.current;
      gd.onGesture = handleGesture;
      const ok = await gd.start(videoRef.current, canvasRef.current);
      if (ok) {
        setWebcamActive(true);
        setInputMode('webcam');
      } else {
        alert('Webcam not available. Check browser permissions.');
      }
    }
  };

  useEffect(() => {
    if (!webcamActive) return;
    const iv = setInterval(() => {
      setGestureLabel(gestureRef.current?.getGestureName() || '');
    }, 100);
    return () => clearInterval(iv);
  }, [webcamActive]);

  // ═══ UTILITY FUNCTIONS ═══
  const resetMultiplayerState = () => {
    setGameMode(null);
    setRoomCode('');
    setJoinCode('');
    setPlayers([]);
    setPlayerId(null);
    setOpponentName('');
    setIsReady(false);
    setOpponentReady(false);
    setCountdown(null);
    setChatMessages([]);
    setMatchmakeStatus('');
    setServerError('');
    setRoundWinner(null);
    setGameOverData(null);
    setHud(null);
    setAnnouncement(null);
  };

  const savePlayerName = (name) => {
    setPlayerName(name);
    localStorage.setItem('cyberclash_name', name);
  };

  const copyRoomCode = async () => {
    try {
      await navigator.clipboard.writeText(roomCode);
      setCodeCopied(true);
      setTimeout(() => setCodeCopied(false), 2000);
    } catch {
      // Fallback
      const el = document.createElement('textarea');
      el.value = roomCode;
      document.body.appendChild(el);
      el.select();
      document.execCommand('copy');
      document.body.removeChild(el);
      setCodeCopied(true);
      setTimeout(() => setCodeCopied(false), 2000);
    }
  };

  // ═══ ACTIONS ═══
  const handleSoloVsAI = async () => {
    if (!playerName.trim()) {
      nameInputRef.current?.focus();
      return;
    }
    savePlayerName(playerName.trim());
    setGameMode('ai');
    if (connected && networkRef.current) {
      networkRef.current.createRoom('ai', playerName.trim(), charClass);
    } else {
      // Fallback to offline
      setGameMode(null);
      const enemyClass = ['brawler', 'ninja', 'mage'][Math.floor(Math.random() * 3)];
      engineRef.current?.startFight(charClass, enemyClass);
    }
  };

  const handleMultiplayer = () => {
    if (!playerName.trim()) {
      nameInputRef.current?.focus();
      return;
    }
    savePlayerName(playerName.trim());
    if (!connected) {
      setServerError('Not connected to server. Start the backend first.');
      setTimeout(() => setServerError(''), 4000);
      return;
    }
    setGameMode('pvp');
    setGameScreen('lobby');
  };

  const playUISound = (type = 'ui_click') => {
    if (engineRef.current && engineRef.current.audio) {
      engineRef.current.audio.play(type);
    }
  };

  const handleCreateRoom = () => {
    playUISound('ui_click');
    setGameMode('pvp');
    networkRef.current?.createRoom('pvp', playerName.trim(), charClass);
  };

  const handleJoinRoom = () => {
    playUISound('ui_click');
    if (!joinCode.trim()) return;
    setGameMode('pvp');
    networkRef.current?.joinRoom(joinCode.trim().toUpperCase(), playerName.trim(), charClass);
  };

  const handleQuickMatch = () => {
    playUISound('ui_click');
    setGameScreen('matchmaking');
    networkRef.current?.matchmake(playerName.trim(), charClass);
  };

  const handleReady = () => {
    playUISound('ui_click');
    setIsReady(true);
    networkRef.current?.setReady();
  };

  const handleStartFight = () => {
    playUISound('ui_click');
    networkRef.current?.startFight();
  };

  const handleSendChat = (e) => {
    e.preventDefault();
    if (!chatInput.trim()) return;
    networkRef.current?.sendChat(chatInput.trim());
    setChatMessages(prev => [...prev, {
      sender: playerName,
      senderId: playerId,
      message: chatInput.trim(),
      time: Date.now(),
    }]);
    setChatInput('');
  };

  const handleLeaveRoom = () => {
    playUISound('ui_click');
    networkRef.current?.leaveRoom();
    resetMultiplayerState();
    setGameScreen('menu');
  };

  const handleReturnToMenu = () => {
    playUISound('ui_click');
    networkRef.current?.leaveRoom();
    resetMultiplayerState();
    if (engineRef.current) engineRef.current.returnToMenu?.();
    setGameScreen('menu');
  };

  // Offline actions
  const startOfflineFight = () => engineRef.current?.startFight();
  const nextRound = () => engineRef.current?.nextRound();

  const timerClass = hud && hud.roundTimer <= 10 ? 'danger' : hud && hud.roundTimer <= 30 ? 'warning' : '';

  // Get display names
  const myDisplayName = playerName || 'STRIKER';
  const enemyDisplayName = gameMode === 'ai' ? 'SHADOW AI' : (opponentName || 'OPPONENT');

  return (
    <>
      {/* Three.js Canvas Container */}
      <div className="game-container" ref={containerRef} />

      {/* Server Status Indicator */}
      <div className={`server-status ${connected ? 'online' : 'offline'}`}>
        <span className="status-dot" />
        <span className="status-text">{connected ? 'ONLINE' : 'OFFLINE'}</span>
      </div>

      {/* Server Error Toast */}
      {serverError && (
        <div className="server-error-toast">
          <span className="error-icon">⚠</span>
          <span>{serverError}</span>
        </div>
      )}

      {/* ═══ LOADING SCREEN ═══ */}
      {gameScreen === 'loading' && (
        <div className="loading-screen">
          <div className="loading-content">
            <h1 className="loading-title">CYBER CLASH</h1>
            <p className="loading-subtitle">A R E N A &nbsp; F I G H T E R</p>
            <div className="loading-bar-container">
              <div className="loading-bar-fill" style={{ width: `${loadProgress}%` }} />
            </div>
            <p className="loading-text">{loadText}</p>
          </div>
        </div>
      )}

      {/* ═══ MAIN MENU ═══ */}
      {gameScreen === 'menu' && (
        <div className="main-menu">
          <div className="menu-grid" />
          <div className="menu-content">
            <h1 className="menu-title">CYBER CLASH</h1>
            <p className="menu-subtitle">A R E N A &nbsp; F I G H T E R</p>
            <div className="menu-badge">OPENCV POWERED</div>

            {/* Name Input */}
            <div className="name-input-container">
              <label className="name-input-label">FIGHTER CALLSIGN</label>
              <div className="name-input-wrapper">
                <span className="name-input-icon">⟐</span>
                <input
                  ref={nameInputRef}
                  type="text"
                  className="name-input"
                  placeholder="Enter your name..."
                  value={playerName}
                  onChange={(e) => setPlayerName(e.target.value.slice(0, 16))}
                  maxLength={16}
                  onKeyDown={(e) => e.key === 'Enter' && handleSoloVsAI()}
                />
                <span className="name-input-count">{playerName.length}/16</span>
              </div>
            </div>

            {/* Class Selection */}
            <div className="class-selection-container">
              <label className="name-input-label">SELECT FIGHTER CLASS</label>
              <div className="class-cards">
                <div className={`class-card ${charClass === 'brawler' ? 'selected' : ''}`} onClick={() => { playUISound('ui_click'); setCharClass('brawler'); }}>
                  <span className="class-icon">🥊</span>
                  <div className="class-name">BRAWLER</div>
                  <div className="class-desc">Balanced & Durable</div>
                </div>
                <div className={`class-card ${charClass === 'ninja' ? 'selected' : ''}`} onClick={() => { playUISound('ui_click'); setCharClass('ninja'); }}>
                  <span className="class-icon">🥷</span>
                  <div className="class-name">NINJA</div>
                  <div className="class-desc">Fast & Deadly</div>
                </div>
                <div className={`class-card ${charClass === 'mage' ? 'selected' : ''}`} onClick={() => { playUISound('ui_click'); setCharClass('mage'); }}>
                  <span className="class-icon">🔮</span>
                  <div className="class-name">MAGE</div>
                  <div className="class-desc">Ranged Energy</div>
                </div>
              </div>
            </div>

            <div className="menu-buttons">
              <button className="menu-btn" onClick={() => { playUISound('ui_click'); handleSoloVsAI(); }}>
                🤖 SOLO VS AI
              </button>
              <button className="menu-btn multiplayer-btn" onClick={() => { playUISound('ui_click'); handleMultiplayer(); }}>
                ⚔ MULTIPLAYER
              </button>
              <button className="menu-btn webcam-btn" onClick={() => { playUISound('ui_click'); toggleWebcam(); }}>
                {webcamActive ? '◉ WEBCAM ON — TAP TO DISABLE' : '◎ ENABLE GESTURE CONTROLS'}
              </button>
              <button className="menu-btn secondary" onClick={() => { playUISound('ui_click'); setShowControls(true); }}>
                ⌨ CONTROLS
              </button>
            </div>
            <p className="menu-version">v4.0 // MULTIPLAYER + REACT + THREE.JS + OPENCV</p>
          </div>
        </div>
      )}

      {/* ═══ LOBBY SCREEN ═══ */}
      {gameScreen === 'lobby' && (
        <div className="lobby-screen">
          <div className="lobby-backdrop" />
          <div className="lobby-content">
            <button className="back-btn" onClick={handleReturnToMenu}>← BACK</button>
            <h1 className="lobby-title">MULTIPLAYER</h1>
            <p className="lobby-subtitle">CHOOSE YOUR BATTLE MODE</p>

            <div className="lobby-cards">
              <div className="lobby-card" onClick={handleCreateRoom}>
                <div className="lobby-card-icon">🏟</div>
                <h3 className="lobby-card-title">CREATE ROOM</h3>
                <p className="lobby-card-desc">Create a private room and invite a friend with a room code</p>
                <div className="lobby-card-action">CREATE →</div>
              </div>

              <div className="lobby-card">
                <div className="lobby-card-icon">🔗</div>
                <h3 className="lobby-card-title">JOIN ROOM</h3>
                <p className="lobby-card-desc">Enter a room code to join an existing battle</p>
                <div className="join-code-input-wrapper">
                  <input
                    type="text"
                    className="join-code-input"
                    placeholder="ENTER CODE"
                    value={joinCode}
                    onChange={(e) => setJoinCode(e.target.value.toUpperCase().slice(0, 6))}
                    maxLength={6}
                    onKeyDown={(e) => e.key === 'Enter' && handleJoinRoom()}
                  />
                  <button className="join-code-btn" onClick={handleJoinRoom} disabled={!joinCode.trim()}>
                    JOIN
                  </button>
                </div>
              </div>

              <div className="lobby-card" onClick={handleQuickMatch}>
                <div className="lobby-card-icon">⚡</div>
                <h3 className="lobby-card-title">QUICK MATCH</h3>
                <p className="lobby-card-desc">Get matched with a random opponent instantly</p>
                <div className="lobby-card-action">FIND MATCH →</div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ═══ ROOM SCREEN ═══ */}
      {gameScreen === 'room' && (
        <div className="room-screen">
          <div className="room-backdrop" />
          <div className="room-content">
            <button className="back-btn" onClick={handleLeaveRoom}>← LEAVE</button>

            {/* Room Code Display */}
            {roomCode && gameMode === 'pvp' && (
              <div className="room-code-display">
                <span className="room-code-label">ROOM CODE</span>
                <div className="room-code-value-wrapper">
                  <span className="room-code-value">{roomCode}</span>
                  <button className="copy-btn" onClick={copyRoomCode}>
                    {codeCopied ? '✓ COPIED' : '⎘ COPY'}
                  </button>
                </div>
              </div>
            )}

            {gameMode === 'ai' && (
              <div className="room-code-display">
                <span className="room-code-label">MODE</span>
                <span className="room-code-value" style={{ fontSize: '1.5rem' }}>SOLO VS AI</span>
              </div>
            )}

            {/* Player Cards */}
            <div className="player-cards">
              <div className={`player-card p1-card ${isReady ? 'ready' : ''}`}>
                <div className="player-card-avatar">⟐</div>
                <div className="player-card-name">{myDisplayName}</div>
                <div className="player-card-tag">YOU</div>
                {isReady && <div className="player-card-ready">READY ✓</div>}
              </div>

              <div className="vs-divider">
                <span className="vs-text">VS</span>
                <div className="vs-line" />
              </div>

              <div className={`player-card p2-card ${opponentReady ? 'ready' : ''} ${players.length < 2 && gameMode !== 'ai' ? 'waiting' : ''}`}>
                {players.length >= 2 || gameMode === 'ai' ? (
                  <>
                    <div className="player-card-avatar">⟡</div>
                    <div className="player-card-name">{enemyDisplayName}</div>
                    {gameMode !== 'ai' && opponentReady && <div className="player-card-ready">READY ✓</div>}
                  </>
                ) : (
                  <>
                    <div className="player-card-avatar waiting-pulse">?</div>
                    <div className="player-card-name">WAITING...</div>
                    <div className="player-card-tag">Share the room code</div>
                  </>
                )}
              </div>
            </div>

            {/* Room Actions */}
            <div className="room-actions">
              {!isReady && (
                <button className="menu-btn ready-btn" onClick={handleReady}>
                  ✓ READY UP
                </button>
              )}
              {isReady && !opponentReady && gameMode !== 'ai' && (
                <div className="waiting-text">Waiting for opponent to ready up...</div>
              )}
              {isReady && (opponentReady || gameMode === 'ai') && (
                <button className="menu-btn" onClick={handleStartFight}>
                  ⚔ START FIGHT
                </button>
              )}
            </div>

            {/* Countdown Overlay */}
            {countdown !== null && (
              <div className="countdown-overlay">
                <span className="countdown-number">{countdown === 0 ? 'FIGHT!' : countdown}</span>
              </div>
            )}

            {/* Chat */}
            {gameMode === 'pvp' && (
              <div className="room-chat">
                <div className="chat-header">
                  <span className="chat-title">💬 ROOM CHAT</span>
                </div>
                <div className="chat-messages">
                  {chatMessages.length === 0 && (
                    <div className="chat-empty">No messages yet. Say hello!</div>
                  )}
                  {chatMessages.map((msg, i) => (
                    <div key={i} className={`chat-message ${msg.senderId === playerId ? 'own' : 'other'}`}>
                      <span className="chat-sender">{msg.sender}</span>
                      <span className="chat-text">{msg.message}</span>
                    </div>
                  ))}
                  <div ref={chatEndRef} />
                </div>
                <form className="chat-input-form" onSubmit={handleSendChat}>
                  <input
                    type="text"
                    className="chat-input"
                    placeholder="Type a message..."
                    value={chatInput}
                    onChange={(e) => setChatInput(e.target.value.slice(0, 100))}
                    maxLength={100}
                  />
                  <button type="submit" className="chat-send-btn" disabled={!chatInput.trim()}>
                    SEND
                  </button>
                </form>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ═══ MATCHMAKING SCREEN ═══ */}
      {gameScreen === 'matchmaking' && (
        <div className="matchmaking-screen">
          <div className="matchmaking-backdrop" />
          <div className="matchmaking-content">
            <button className="back-btn" onClick={handleReturnToMenu}>← CANCEL</button>
            <div className="matchmaking-spinner">
              <div className="spinner-ring ring-1" />
              <div className="spinner-ring ring-2" />
              <div className="spinner-ring ring-3" />
              <div className="spinner-center">⚔</div>
            </div>
            <h2 className="matchmaking-title">SEARCHING FOR OPPONENT</h2>
            <p className="matchmaking-status">{matchmakeStatus || 'Connecting to matchmaking server...'}</p>
            <div className="matchmaking-dots">
              <span className="dot" />
              <span className="dot" />
              <span className="dot" />
            </div>
          </div>
        </div>
      )}

      {/* ═══ GAME HUD ═══ */}
      {hud && ['fighting', 'countdown', 'announce', 'announce_fight', 'roundEnd'].includes(gameScreen) && (
        <div className="game-hud">
          <div className="hud-top">
            {/* Player 1 */}
            <div className="player-info left">
              <span className="player-name p1">{gameMode ? myDisplayName.toUpperCase().split('').join(' ') : 'S T R I K E R'}</span>
              <div className="health-bar-container">
                <div
                  className={`health-bar-fill p1${hud.player.health < 25 ? ' critical' : ''}`}
                  style={{ width: `${(hud.player.health / MAX_HEALTH) * 100}%` }}
                />
                <div className="health-bar-text">{Math.ceil(hud.player.health)}</div>
              </div>
              <div className="energy-bar-container">
                <div className="energy-bar-fill" style={{ width: `${(hud.player.energy / MAX_ENERGY) * 100}%` }} />
              </div>
              {hud.player.combo > 1 && (
                <div className="combo-counter active">
                  <span className="combo-count">{hud.player.combo}</span>
                  <span className="combo-label">COMBO</span>
                </div>
              )}
            </div>

            {/* Center */}
            <div className="hud-center">
              <div className="round-indicator">ROUND {hud.roundNumber}</div>
              <div className={`fight-timer ${timerClass}`}>{hud.roundTimer}</div>

              {/* Active Inputs Overlay */}
              <div className="active-inputs" style={{ marginTop: '10px', display: 'flex', gap: '5px', flexWrap: 'wrap', justifyContent: 'center' }}>
                {Object.entries(activeKeys).map(([key, isActive]) =>
                  isActive ? (
                    <span key={key} style={{
                      background: 'rgba(0, 240, 255, 0.2)',
                      border: '1px solid var(--neon-cyan)',
                      color: 'var(--neon-cyan)',
                      padding: '2px 8px',
                      borderRadius: '4px',
                      fontSize: '0.7rem',
                      fontFamily: "'Orbitron', sans-serif"
                    }}>
                      {key.replace('Arrow', '').toUpperCase()}
                    </span>
                  ) : null
                )}
                {webcamActive && gestureLabel && gestureLabel !== 'IDLE' && (
                  <span style={{
                    background: 'rgba(0, 255, 136, 0.2)',
                    border: '1px solid var(--neon-green)',
                    color: 'var(--neon-green)',
                    padding: '2px 8px',
                    borderRadius: '4px',
                    fontSize: '0.7rem',
                    fontFamily: "'Orbitron', sans-serif"
                  }}>
                    {gestureLabel}
                  </span>
                )}
              </div>
            </div>

            {/* Player 2 */}
            <div className="player-info right">
              <span className="player-name p2">
                {gameMode === 'ai' ? 'S H A D O W   A I' : (gameMode === 'pvp' ? enemyDisplayName.toUpperCase().split('').join(' ') : 'S H A D O W   A I')}
              </span>
              <div className="health-bar-container">
                <div
                  className={`health-bar-fill p2${hud.enemy.health < 25 ? ' critical' : ''}`}
                  style={{ width: `${(hud.enemy.health / MAX_HEALTH) * 100}%` }}
                />
                <div className="health-bar-text">{Math.ceil(hud.enemy.health)}</div>
              </div>
              <div className="energy-bar-container">
                <div className="energy-bar-fill" style={{ width: `${(hud.enemy.energy / MAX_ENERGY) * 100}%` }} />
              </div>
            </div>
          </div>

          {/* Bottom HUD */}
          <div className="hud-bottom">
            <div className="hud-controls-overlay">
              {inputMode === 'webcam' ? (
                <>
                  <div>👊 L/R HAND = PUNCH</div>
                  <div>🦶 KICK = LEG MOTION</div>
                  <div>🛡 BLOCK = CENTER</div>
                  <div>💨 DODGE = SIDE MOTION</div>
                  <div>⚡ SPECIAL = BOTH HANDS UP</div>
                </>
              ) : (
                <>
                  <div><kbd className={activeKeys['KeyJ'] ? 'active' : ''}>J</kbd> PUNCH</div>
                  <div><kbd className={activeKeys['KeyK'] ? 'active' : ''}>K</kbd> KICK</div>
                  <div><kbd className={activeKeys['Space'] ? 'active' : ''}>SPACE</kbd> BLOCK</div>
                  <div><kbd className={activeKeys['ShiftLeft'] ? 'active' : ''}>SHIFT</kbd> DODGE</div>
                  <div><kbd className={activeKeys['KeyL'] ? 'active' : ''}>L</kbd> SPECIAL ⚡</div>
                  <div>
                    <kbd className={activeKeys['KeyW'] ? 'active' : ''}>W</kbd>
                    <kbd className={activeKeys['KeyA'] ? 'active' : ''}>A</kbd>
                    <kbd className={activeKeys['KeyS'] ? 'active' : ''}>S</kbd>
                    <kbd className={activeKeys['KeyD'] ? 'active' : ''}>D</kbd> MOVE
                  </div>
                </>
              )}
            </div>
            <span className={`input-mode-badge ${inputMode}`}>
              {inputMode === 'webcam' ? '◉ WEBCAM' : '⌨ KEYBOARD'}
            </span>
          </div>
        </div>
      )}

      {/* ═══ FIGHT ANNOUNCEMENT ═══ */}
      {announcement && (
        <div className="fight-announce">
          <span className={`announce-text${announcement.ko ? ' ko' : ''}`} key={announcement.text + Date.now()}>
            {announcement.text}
          </span>
        </div>
      )}

      {/* ═══ ROUND RESULT ═══ */}
      {gameScreen === 'roundResult' && (
        <div className="modal-overlay">
          <div className="modal-box">
            {gameMode && roundWinner ? (
              <>
                <h2 className="modal-title" style={{ color: roundWinner.didWin ? 'var(--neon-cyan)' : 'var(--neon-magenta)' }}>
                  {roundWinner.didWin ? `${myDisplayName.toUpperCase()} WINS!` : `${enemyDisplayName.toUpperCase()} WINS!`}
                </h2>
                <p className="round-score">
                  {playerId === 'p1' ? roundWinner.p1Wins : roundWinner.p2Wins} - {playerId === 'p1' ? roundWinner.p2Wins : roundWinner.p1Wins}
                </p>
                <div className="waiting-text">Next round starting...</div>
              </>
            ) : hud ? (
              <>
                <h2 className="modal-title" style={{ color: hud.playerWins > hud.enemyWins ? 'var(--neon-cyan)' : 'var(--neon-magenta)' }}>
                  {hud.playerWins > hud.enemyWins ? 'STRIKER WINS!' : 'SHADOW AI WINS!'}
                </h2>
                <p className="round-score">{hud.playerWins} - {hud.enemyWins}</p>
                <button className="menu-btn" onClick={nextRound}>NEXT ROUND →</button>
              </>
            ) : null}
          </div>
        </div>
      )}

      {/* ═══ GAME OVER ═══ */}
      {gameScreen === 'gameOver' && (
        <div className="modal-overlay">
          <div className="modal-box">
            {gameMode && gameOverData ? (
              <>
                <h2 className={`result-text ${gameOverData.didWin ? 'victory' : 'defeat'}`}>
                  {gameOverData.didWin ? 'VICTORY' : 'DEFEAT'}
                </h2>
                <div className="stats-grid">
                  <div className="stat-item">
                    <span className="stat-value">{hud?.player?.totalHits || gameOverData.stats?.totalHits || 0}</span>
                    <span className="stat-label">HITS LANDED</span>
                  </div>
                  <div className="stat-item">
                    <span className="stat-value">{hud?.player?.maxCombo || gameOverData.stats?.maxCombo || 0}</span>
                    <span className="stat-label">MAX COMBO</span>
                  </div>
                  <div className="stat-item">
                    <span className="stat-value">{Math.round(hud?.player?.totalDamage || gameOverData.stats?.totalDamage || 0)}</span>
                    <span className="stat-label">TOTAL DAMAGE</span>
                  </div>
                  <div className="stat-item">
                    <span className="stat-value">{hud?.player?.specialsUsed || gameOverData.stats?.specialsUsed || 0}</span>
                    <span className="stat-label">SPECIALS USED</span>
                  </div>
                </div>
                <button className="menu-btn" onClick={handleReturnToMenu}>⚔ FIGHT AGAIN</button>
              </>
            ) : hud ? (
              <>
                <h2 className={`result-text ${hud.playerWins >= ROUNDS_TO_WIN ? 'victory' : 'defeat'}`}>
                  {hud.playerWins >= ROUNDS_TO_WIN ? 'VICTORY' : 'DEFEAT'}
                </h2>
                <div className="stats-grid">
                  <div className="stat-item">
                    <span className="stat-value">{hud.player.totalHits}</span>
                    <span className="stat-label">HITS LANDED</span>
                  </div>
                  <div className="stat-item">
                    <span className="stat-value">{hud.player.maxCombo}</span>
                    <span className="stat-label">MAX COMBO</span>
                  </div>
                  <div className="stat-item">
                    <span className="stat-value">{Math.round(hud.player.totalDamage)}</span>
                    <span className="stat-label">TOTAL DAMAGE</span>
                  </div>
                  <div className="stat-item">
                    <span className="stat-value">{hud.player.specialsUsed}</span>
                    <span className="stat-label">SPECIALS USED</span>
                  </div>
                </div>
                <button className="menu-btn" onClick={handleReturnToMenu}>⚔ FIGHT AGAIN</button>
              </>
            ) : null}
          </div>
        </div>
      )}

      {/* ═══ CONTROLS MODAL ═══ */}
      {showControls && (
        <div className="modal-overlay">
          <div className="modal-box">
            <h2 className="modal-title">⌨ COMBAT CONTROLS</h2>
            <div className="controls-grid">
              <div className="control-item"><kbd>W</kbd><kbd>A</kbd><kbd>S</kbd><kbd>D</kbd><span>Move</span></div>
              <div className="control-item"><kbd>J</kbd><span>Punch</span></div>
              <div className="control-item"><kbd>K</kbd><span>Kick</span></div>
              <div className="control-item"><kbd>L</kbd><span>Special ⚡</span></div>
              <div className="control-item"><kbd>SPACE</kbd><span>Block 🛡</span></div>
              <div className="control-item"><kbd>SHIFT</kbd><span>Dodge</span></div>
            </div>

            <p className="control-section-title">◉ GESTURE CONTROLS (WEBCAM)</p>
            <div className="controls-grid">
              <div className="gesture-item"><span className="gesture-icon">👊</span><span>Right hand forward = Punch</span></div>
              <div className="gesture-item"><span className="gesture-icon">🦶</span><span>Leg motion = Kick</span></div>
              <div className="gesture-item"><span className="gesture-icon">🛡</span><span>Hands center = Block</span></div>
              <div className="gesture-item"><span className="gesture-icon">💨</span><span>Side motion = Dodge</span></div>
              <div className="gesture-item"><span className="gesture-icon">⚡</span><span>Both arms up = Special</span></div>
              <div className="gesture-item"><span className="gesture-icon">🏃</span><span>Lean = Movement</span></div>
            </div>

            <button className="menu-btn" onClick={() => setShowControls(false)} style={{ marginTop: 20 }}>CLOSE</button>
          </div>
        </div>
      )}

      {/* ═══ WEBCAM OVERLAY (PiP) ═══ */}
      <div className={webcamActive ? "webcam-overlay" : "hidden-webcam"}>
        <video ref={videoRef} autoPlay playsInline muted />
        <canvas ref={canvasRef} />
        {webcamActive && gestureLabel && <div className="webcam-gesture-label">{gestureLabel}</div>}
      </div>

      {/* ═══ HIT FLASH ═══ */}
      {showHitFlash && <div className="hit-flash" id="hit-flash-overlay" />}

      {/* ═══ DAMAGE NUMBERS ═══ */}
      {damageNums.map((d, i) => (
        <div
          key={d.time + '-' + i}
          className={`damage-number${d.critical ? ' critical' : ''}`}
          style={{ left: d.x, top: d.y }}
        >
          {d.damage}
        </div>
      ))}
    </>
  );
}

function delay(ms) {
  return new Promise(r => setTimeout(r, ms));
}
