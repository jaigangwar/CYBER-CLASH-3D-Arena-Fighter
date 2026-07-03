/* ═══════════════════════════════════════════════════════
   MediaPipe Pose Gesture Detector
   Detects full body gestures via webcam for game control
   ═══════════════════════════════════════════════════════ */

export class GestureDetector {
  constructor() {
    this.video = null;
    this.overlayCanvas = null;
    this.overlayCtx = null;
    
    this.pose = null;
    this.camera = null;

    this.onGesture = null;
    this.currentGesture = 'IDLE';
    this.lastGestureTime = 0;
    this.ready = false;

    // Movement history to calculate velocities
    this.history = [];
    this.calibration = {
      samples: [],
      neutral: null,
    };
    this.smoothedHead = {
      x: 0,
      y: 0,
      z: 0,
      ready: false,
    };

    // ─── TUNABLE PARAMETERS (defaults = 'fast' mode) ─────
    this._mode = 'fast';

    // Cooldowns in ms
    this._attackCooldown = 200;
    this._movementCooldown = 50;

    // MediaPipe options
    this._modelComplexity = 0;   // 0 = lite (much faster)
    this._cameraWidth = 256;
    this._cameraHeight = 192;

    // Calibration
    this._calibrationSamples = 6;

    // History buffer size
    this._historySize = 3;

    // Punch detection threshold
    this._punchThreshold = 5.0;

    // Head smoothing factor (lower = more responsive)
    this._smoothingFactor = 0.5;
  }

  /**
   * Switch between 'fast' and 'quality' presets.
   * Call before start() or while running (takes effect on next frame).
   * @param {'fast'|'quality'} mode
   */
  setMode(mode) {
    this._mode = mode;
    if (mode === 'fast') {
      this._attackCooldown = 200;
      this._movementCooldown = 50;
      this._modelComplexity = 0;
      this._cameraWidth = 256;
      this._cameraHeight = 192;
      this._calibrationSamples = 6;
      this._historySize = 3;
      this._punchThreshold = 5.0;
      this._smoothingFactor = 0.5;
    } else if (mode === 'quality') {
      this._attackCooldown = 300;
      this._movementCooldown = 100;
      this._modelComplexity = 1;
      this._cameraWidth = 320;
      this._cameraHeight = 240;
      this._calibrationSamples = 12;
      this._historySize = 5;
      this._punchThreshold = 6.2;
      this._smoothingFactor = 0.7;
    }

    // If pose is already running, update model complexity live
    if (this.pose) {
      try {
        this.pose.setOptions({ modelComplexity: this._modelComplexity });
      } catch (e) { /* some versions don't support live updates */ }
    }
  }

  async start(videoEl, overlayCanvas) {
    this.video = videoEl;
    this.overlayCanvas = overlayCanvas;
    this.overlayCtx = overlayCanvas.getContext('2d');
    
    try {
      this.pose = new window.Pose({
        locateFile: (file) => {
          return `https://cdn.jsdelivr.net/npm/@mediapipe/pose/${file}`;
        }
      });

      this.pose.setOptions({
        modelComplexity: this._modelComplexity,
        smoothLandmarks: true,
        enableSegmentation: false,
        smoothSegmentation: false,
        minDetectionConfidence: 0.5,
        minTrackingConfidence: 0.5
      });

      this.pose.onResults((results) => this._onResults(results));

      this.camera = new window.Camera(this.video, {
        onFrame: async () => {
          await this.pose.send({image: this.video});
        },
        width: this._cameraWidth,
        height: this._cameraHeight,
        facingMode: 'user'
      });

      await this.camera.start();
      
      this.overlayCanvas.width = this._cameraWidth;
      this.overlayCanvas.height = this._cameraHeight;
      this.ready = true;
      return true;
    } catch (err) {
      console.error('MediaPipe Init Error:', err);
      return false;
    }
  }

  stop() {
    if (this.camera) {
      this.camera.stop();
      this.camera = null;
    }
    if (this.pose) {
      this.pose.close();
      this.pose = null;
    }
    this.ready = false;
    this.history = [];
    this.calibration = { samples: [], neutral: null };
    this.smoothedHead = { x: 0, y: 0, z: 0, ready: false };
  }

  getGestureName() {
    return this.currentGesture;
  }

  _onResults(results) {
    if (!this.overlayCtx) return;
    const ctx = this.overlayCtx;
    ctx.save();
    ctx.clearRect(0, 0, this.overlayCanvas.width, this.overlayCanvas.height);
    
    if (results.poseLandmarks) {
      // Draw skeleton
      window.drawConnectors(ctx, results.poseLandmarks, window.POSE_CONNECTIONS, {color: '#00FF00', lineWidth: 2});
      window.drawLandmarks(ctx, results.poseLandmarks, {color: '#FF0000', lineWidth: 1, radius: 2});

      this._analyzePose(results.poseLandmarks);
    } else {
      this.currentGesture = 'IDLE';
    }
    ctx.restore();
  }

  _analyzePose(lm) {
    const now = performance.now();
    
    // MediaPipe Pose landmarks:
    // 15: LEFT_WRIST, 16: RIGHT_WRIST
    // 11: LEFT_SHOULDER, 12: RIGHT_SHOULDER
    // 27: LEFT_ANKLE, 28: RIGHT_ANKLE
    // 0: NOSE
    
    this.history.push({ time: now, lm });
    if (this.history.length > this._historySize) this.history.shift();

    if (this.history.length < 2) return;
    const prev = this.history[0].lm;
    const dt = (now - this.history[0].time) / 1000;
    if (now - this.lastGestureTime < this._attackCooldown) return;

    let detected = 'IDLE';

    const shoulderCenterX = (lm[11].x + lm[12].x) / 2;
    const shoulderCenterY = (lm[11].y + lm[12].y) / 2;
    const shoulderWidth = Math.max(0.001, Math.abs(lm[11].x - lm[12].x));
    const nose = lm[0];

    const calmBody = Math.abs(lm[15].y - shoulderCenterY) < 0.25 && Math.abs(lm[16].y - shoulderCenterY) < 0.25;
    if (!this.calibration.neutral && calmBody) {
      this.calibration.samples.push({
        headX: nose.x - shoulderCenterX,
        headY: shoulderCenterY - nose.y,
        headZ: nose.z ?? 0,
        shoulderWidth,
      });
      if (this.calibration.samples.length >= this._calibrationSamples) {
        const totals = this.calibration.samples.reduce((acc, sample) => {
          acc.headX += sample.headX;
          acc.headY += sample.headY;
          acc.headZ += sample.headZ;
          acc.shoulderWidth += sample.shoulderWidth;
          return acc;
        }, { headX: 0, headY: 0, headZ: 0, shoulderWidth: 0 });
        const count = this.calibration.samples.length;
        this.calibration.neutral = {
          headX: totals.headX / count,
          headY: totals.headY / count,
          headZ: totals.headZ / count,
          shoulderWidth: totals.shoulderWidth / count,
        };
      }
    }

    const neutral = this.calibration.neutral || {
      headX: 0,
      headY: 0,
      headZ: nose.z ?? 0,
      shoulderWidth,
    };

    const headX = nose.x - shoulderCenterX - neutral.headX;
    const headY = (shoulderCenterY - nose.y) - neutral.headY;
    const headZ = (neutral.headZ ?? nose.z ?? 0) - (nose.z ?? 0);

    const sf = this._smoothingFactor;
    if (!this.smoothedHead.ready) {
      this.smoothedHead = { x: headX, y: headY, z: headZ, ready: true };
    } else {
      this.smoothedHead.x = this.smoothedHead.x * sf + headX * (1 - sf);
      this.smoothedHead.y = this.smoothedHead.y * sf + headY * (1 - sf);
      this.smoothedHead.z = this.smoothedHead.z * sf + headZ * (1 - sf);
    }

    const headMotionX = this.smoothedHead.x;
    const headMotionY = this.smoothedHead.y;
    const headMotionZ = this.smoothedHead.z;

    // Visibility checks (MediaPipe hides points off-screen or occluded with low visibility)
    const rVis = lm[16].visibility > 0.5;
    const lVis = lm[15].visibility > 0.5;
    const rKVis = lm[26].visibility > 0.5;
    const lKVis = lm[25].visibility > 0.5;

    // Body proportions
    const wristDist = Math.abs(lm[15].x - lm[16].x);
    const rightWrist = lm[16];
    const leftWrist = lm[15];
    const rightElbow = lm[14];
    const leftElbow = lm[13];
    const rightShoulder = lm[12];
    const leftShoulder = lm[11];
    const rightWristSpeed = Math.hypot(rightWrist.x - prev[16].x, rightWrist.y - prev[16].y, (rightWrist.z ?? 0) - (prev[16].z ?? 0)) / Math.max(dt, 0.001);
    const leftWristSpeed = Math.hypot(leftWrist.x - prev[15].x, leftWrist.y - prev[15].y, (leftWrist.z ?? 0) - (prev[15].z ?? 0)) / Math.max(dt, 0.001);
    const rightReach = Math.max(0, rightWrist.x - rightElbow.x) + Math.max(0, ((rightShoulder.z ?? 0) - (rightWrist.z ?? 0)) - 0.08) * 0.9;
    const leftReach = Math.max(0, leftElbow.x - leftWrist.x) + Math.max(0, ((leftShoulder.z ?? 0) - (leftWrist.z ?? 0)) - 0.08) * 0.9;
    const rightPunchScore = rightWristSpeed * 0.45 + rightReach * 7 + Math.max(0, (rightShoulder.y - rightWrist.y) - 0.05) * 5;
    const leftPunchScore = leftWristSpeed * 0.45 + leftReach * 7 + Math.max(0, (leftShoulder.y - leftWrist.y) - 0.05) * 5;

    // Block: Wrists crossed/close and raised to face
    if (rVis && lVis && wristDist < 0.15 && lm[15].y < shoulderCenterY && lm[16].y < shoulderCenterY) {
      detected = 'block';
    }
    // Special: Both hands raised high above nose
    else if (rVis && lVis && lm[15].y < lm[0].y && lm[16].y < lm[0].y) {
      detected = 'special';
    }
    // Punch Right: detect a fast right-arm extension, not just any raised hand.
    else if (rVis && rightPunchScore > leftPunchScore + 1.2 && rightPunchScore > this._punchThreshold) {
      detected = 'punch_right';
    }
    // Punch Left: same logic on the left side.
    else if (lVis && leftPunchScore > rightPunchScore + 1.2 && leftPunchScore > this._punchThreshold) {
      detected = 'punch_left';
    }
    // Kick: Knee raised significantly above resting hip
    else if ((rKVis && lm[26].y < lm[24].y - 0.05) || (lKVis && lm[25].y < lm[23].y - 0.05)) {
      detected = 'kick';
    }
    // Movement via absolute Nose position vs Shoulders
    else {
      if (headMotionX > 0.045) detected = 'move_left';
      else if (headMotionX < -0.045) detected = 'move_right';
      else if (headMotionZ > 0.05) detected = 'move_forward';
      else if (headMotionY < -0.05) detected = 'move_back';
    }

    if (detected !== 'IDLE') {
      this.currentGesture = detected;
      // Faster cooldown for movement so you can hold a lean and keep moving
      if (detected.startsWith('move_')) {
        this.lastGestureTime = now - (this._attackCooldown - this._movementCooldown);
      } else {
        this.lastGestureTime = now;
      }
      if (this.onGesture) this.onGesture(detected);
    } else {
      this.currentGesture = 'IDLE';
    }
  }
}
