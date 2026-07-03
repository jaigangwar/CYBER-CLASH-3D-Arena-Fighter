/* ═══════════════════════════════════════════════════════
   CYBER CLASH - Game Engine Core
   Three.js 3D arena, combat, AI, particles, camera
   Supports online (server-authoritative) and offline modes
   ═══════════════════════════════════════════════════════ */
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';

// ─── CONSTANTS ──────────────────────────────────────────
const ARENA_SIZE = 30;
const GRAVITY = -35;
const MOVE_SPEED = 12;
const DODGE_SPEED = 28;
const DODGE_DURATION = 0.25;
const BLOCK_DAMAGE_MULT = 0.15;
export const MAX_HEALTH = 100;
export const MAX_ENERGY = 100;
export const ENERGY_REGEN = 8;
export const COMBO_TIMEOUT = 1.2;
export const ROUNDS_TO_WIN = 2;
export const ROUND_TIME = 99;
const FIGHTER_RADIUS = 1.2;

const ATTACKS = {
  punch:   { damage: 18, range: 2.5, startup: 0.08, active: 0.12, recovery: 0.2,  energyCost: 0,  knockback: 6,  name: 'PUNCH',        hitstun: 0.3 },
  punch_left: { damage: 18, range: 2.5, startup: 0.08, active: 0.12, recovery: 0.2, energyCost: 0, knockback: 6, name: 'LEFT JAB', hitstun: 0.3 },
  punch_right: { damage: 18, range: 2.5, startup: 0.08, active: 0.12, recovery: 0.2, energyCost: 0, knockback: 6, name: 'RIGHT CROSS', hitstun: 0.3 },
  kick:    { damage: 25, range: 3.0, startup: 0.12, active: 0.15, recovery: 0.35, energyCost: 0,  knockback: 10,  name: 'ROUNDHOUSE',   hitstun: 0.4 },
  special: { damage: 45, range: 4.0, startup: 0.2,  active: 0.2,  recovery: 0.5,  energyCost: 35, knockback: 18, name: '⚡ CYBER STRIKE', hitstun: 0.6 },
};

export { MAX_HEALTH, MAX_ENERGY, ROUNDS_TO_WIN, ROUND_TIME };

// ─── AUDIO ──────────────────────────────────────────────
class AudioSystem {
  constructor() { this.ctx = null; this.ok = false; }

  init() {
    if (this.ctx) {
      if (this.ctx.state === 'suspended') this.ctx.resume();
      this.ok = true;
      return;
    }
    try { 
      this.ctx = new (window.AudioContext || window.webkitAudioContext)(); 
      if (this.ctx.state === 'suspended') this.ctx.resume();
      this.ok = true; 
    } catch (e) { /* ignore */ }
  }

  play(type) {
    if (!this.ok || !this.ctx) return;
    if (this.ctx.state === 'suspended') this.ctx.resume();
    try {
      const now = this.ctx.currentTime;
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();
      const filt = this.ctx.createBiquadFilter();
      osc.connect(filt); filt.connect(gain); gain.connect(this.ctx.destination);

      const configs = {
        punch:   () => { osc.type='sawtooth'; osc.frequency.setValueAtTime(200,now); osc.frequency.exponentialRampToValueAtTime(60,now+0.1); filt.type='lowpass'; filt.frequency.value=800; gain.gain.setValueAtTime(0.3,now); gain.gain.exponentialRampToValueAtTime(0.001,now+0.15); osc.start(now); osc.stop(now+0.15); },
        kick:    () => { osc.type='triangle'; osc.frequency.setValueAtTime(120,now); osc.frequency.exponentialRampToValueAtTime(40,now+0.2); filt.type='lowpass'; filt.frequency.value=600; gain.gain.setValueAtTime(0.4,now); gain.gain.exponentialRampToValueAtTime(0.001,now+0.25); osc.start(now); osc.stop(now+0.25); this._noise(0.15,0.12); },
        special: () => { osc.type='sawtooth'; osc.frequency.setValueAtTime(800,now); osc.frequency.exponentialRampToValueAtTime(200,now+0.4); filt.type='bandpass'; filt.frequency.value=1200; filt.Q.value=5; gain.gain.setValueAtTime(0.25,now); gain.gain.exponentialRampToValueAtTime(0.001,now+0.5); osc.start(now); osc.stop(now+0.5); this._noise(0.2,0.3); },
        block:   () => { osc.type='square'; osc.frequency.setValueAtTime(300,now); osc.frequency.exponentialRampToValueAtTime(100,now+0.08); filt.type='highpass'; filt.frequency.value=200; gain.gain.setValueAtTime(0.15,now); gain.gain.exponentialRampToValueAtTime(0.001,now+0.1); osc.start(now); osc.stop(now+0.1); },
        dodge:   () => { osc.type='sine'; osc.frequency.setValueAtTime(400,now); osc.frequency.exponentialRampToValueAtTime(800,now+0.15); filt.type='lowpass'; filt.frequency.value=2000; gain.gain.setValueAtTime(0.1,now); gain.gain.exponentialRampToValueAtTime(0.001,now+0.2); osc.start(now); osc.stop(now+0.2); },
        ko:      () => { osc.type='sawtooth'; osc.frequency.setValueAtTime(600,now); osc.frequency.exponentialRampToValueAtTime(30,now+0.8); filt.type='lowpass'; filt.frequency.value=1500; gain.gain.setValueAtTime(0.4,now); gain.gain.exponentialRampToValueAtTime(0.001,now+1.0); osc.start(now); osc.stop(now+1.0); this._noise(0.35,0.5); },
        round:   () => { osc.type='sine'; osc.frequency.setValueAtTime(523,now); filt.type='lowpass'; filt.frequency.value=3000; gain.gain.setValueAtTime(0.2,now); gain.gain.exponentialRampToValueAtTime(0.001,now+0.5); osc.start(now); osc.stop(now+0.5); },
        fight:   () => { osc.type='sawtooth'; osc.frequency.setValueAtTime(200,now); osc.frequency.exponentialRampToValueAtTime(800,now+0.3); filt.type='lowpass'; filt.frequency.value=2000; gain.gain.setValueAtTime(0.3,now); gain.gain.exponentialRampToValueAtTime(0.001,now+0.4); osc.start(now); osc.stop(now+0.4); },
        ui_hover:() => { osc.type='sine'; osc.frequency.setValueAtTime(800,now); gain.gain.setValueAtTime(0.05,now); gain.gain.exponentialRampToValueAtTime(0.001,now+0.1); osc.start(now); osc.stop(now+0.1); },
        ui_click:() => { osc.type='square'; osc.frequency.setValueAtTime(1200,now); osc.frequency.exponentialRampToValueAtTime(400,now+0.1); gain.gain.setValueAtTime(0.1,now); gain.gain.exponentialRampToValueAtTime(0.001,now+0.1); osc.start(now); osc.stop(now+0.1); }
      };
      if (configs[type]) configs[type]();
    } catch (e) { /* ignore */ }
  }

  _noise(vol, dur) {
    if (!this.ctx) return;
    const sz = this.ctx.sampleRate * dur;
    const buf = this.ctx.createBuffer(1, sz, this.ctx.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < sz; i++) d[i] = (Math.random()*2-1)*vol;
    const src = this.ctx.createBufferSource();
    src.buffer = buf;
    const g = this.ctx.createGain();
    const now = this.ctx.currentTime;
    g.gain.setValueAtTime(vol,now);
    g.gain.exponentialRampToValueAtTime(0.001,now+dur);
    src.connect(g); g.connect(this.ctx.destination);
    src.start(now);
  }
}

// ─── PARTICLES ──────────────────────────────────────────
class ParticleSystem {
  constructor(scene) { this.scene = scene; this.particles = []; }

  emit(pos, opts = {}) {
    const { count=15, color=0x00f0ff, size=0.15, speed=8, life=0.6, gravity=true, spread=1, type='spark' } = opts;
    for (let i = 0; i < count; i++) {
      let geo, mat;
      if (type === 'ring') {
        geo = new THREE.RingGeometry(0.1, size, 8);
        mat = new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.8, side: THREE.DoubleSide });
      } else if (type === 'spark') {
        geo = new THREE.BoxGeometry(size, size, size * 3);
        mat = new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 1 });
      } else {
        geo = new THREE.SphereGeometry(size * 0.5, 4, 4);
        mat = new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 1 });
      }
      const mesh = new THREE.Mesh(geo, mat);
      mesh.position.copy(pos);
      const vel = new THREE.Vector3(
        (Math.random()-0.5)*spread*speed,
        Math.random()*speed*0.7+speed*0.3,
        (Math.random()-0.5)*spread*speed
      );
      this.scene.add(mesh);
      this.particles.push({ mesh, velocity: vel, life: life+Math.random()*life*0.5, maxLife: life, gravity, type, rotSpeed: (Math.random()-0.5)*10 });
    }
  }

  emitHit(pos, color=0x00f0ff) {
    this.emit(pos, { count: 35, color, size: 0.18, speed: 18, life: 0.5, spread: 1.2, type: 'spark' });
    this.emit(pos, { count: 1, color, size: 2.5, speed: 0, life: 0.4, gravity: false, type: 'ring' });
    this.emit(pos, { count: 1, color: 0xffffff, size: 1.5, speed: 0, life: 0.2, gravity: false, type: 'ring' });
  }

  emitSpecial(pos) {
    this.emit(pos, { count: 40, color: 0xff4400, size: 0.2, speed: 18, life: 0.8, spread: 1.2, type: 'spark' });
    this.emit(pos, { count: 20, color: 0xffe600, size: 0.15, speed: 15, life: 0.6, spread: 1, type: 'explosion' });
    for (let i = 0; i < 3; i++) {
      setTimeout(() => {
        this.emit(pos.clone().add(new THREE.Vector3(0, i*0.3, 0)), { count: 1, color: 0xff4400, size: 2+i, speed: 0, life: 0.4, gravity: false, type: 'ring' });
      }, i * 80);
    }
  }

  emitBlock(pos) {
    this.emit(pos, { count: 10, color: 0x00ff88, size: 0.1, speed: 8, life: 0.3, spread: 0.6, type: 'spark' });
    this.emit(pos, { count: 1, color: 0x00ff88, size: 2.0, speed: 0, life: 0.2, gravity: false, type: 'ring' });
  }

  emitDodge(pos) {
    this.emit(pos, { count: 8, color: 0x8b00ff, size: 0.1, speed: 3, life: 0.3, spread: 0.3, gravity: false, type: 'spark' });
  }

  update(dt) {
    for (let i = this.particles.length - 1; i >= 0; i--) {
      const p = this.particles[i];
      p.life -= dt;
      if (p.life <= 0) {
        this.scene.remove(p.mesh);
        p.mesh.geometry.dispose(); p.mesh.material.dispose();
        this.particles.splice(i, 1);
        continue;
      }
      p.mesh.position.add(p.velocity.clone().multiplyScalar(dt));
      if (p.gravity) p.velocity.y += GRAVITY * 0.5 * dt;
      p.velocity.multiplyScalar(0.97);
      p.mesh.rotation.x += p.rotSpeed * dt;
      p.mesh.rotation.z += p.rotSpeed * 0.7 * dt;
      const lr = p.life / p.maxLife;
      p.mesh.material.opacity = lr;
      if (p.type === 'ring') { const s = 1 + (1-lr)*5; p.mesh.scale.set(s,s,s); }
      if (p.mesh.position.y < 0.05) { p.mesh.position.y = 0.05; p.velocity.y *= -0.3; p.velocity.x *= 0.8; p.velocity.z *= 0.8; }
    }
  }

  clear() {
    for (const p of this.particles) {
      this.scene.remove(p.mesh);
      p.mesh.geometry.dispose(); p.mesh.material.dispose();
    }
    this.particles = [];
  }
}

// ─── 3D FIGHTER MODEL ───────────────────────────────────
class Fighter3D {
  constructor(scene, charClass, colorPrimary, colorSecondary, colorGlow) {
    this.scene = scene;
    this.charClass = charClass || 'brawler';
    this.colorGlow = colorGlow;
    this.group = new THREE.Group();
    this.parts = {};
    this.animTime = 0;
    
    // In a full AAA setup, we would load GLTF here:
    // const loader = new GLTFLoader();
    // loader.load(`/models/${this.charClass}.glb`, (gltf) => { ... });
    // Since we don't have the files, we use highly customized procedural models per class:
    
    this._build(colorPrimary, colorSecondary, colorGlow);
    scene.add(this.group);
  }

  _m(c, e = false) {
    return new THREE.MeshPhysicalMaterial({ 
      color: c, emissive: e ? c : 0x000000, emissiveIntensity: e ? 0.8 : 0, 
      metalness: 0.9, roughness: 0.2, clearcoat: 1.0, clearcoatRoughness: 0.1
    });
  }
  _g(c) {
    return new THREE.MeshPhysicalMaterial({ 
      color: c, emissive: c, emissiveIntensity: 2.0, transparent: true, opacity: 0.9, transmission: 0.6
    });
  }

  _build(cp, cs, cg) {
    const g = this.group;
    
    // Skeleton Root
    this.parts.torso = new THREE.Group();
    this.parts.torso.position.y = 2.0;
    g.add(this.parts.torso);

    // Torso Mesh
    const torsoMesh = new THREE.Mesh(new THREE.CapsuleGeometry(0.35, 0.7, 4, 16), this._m(cp));
    this.parts.torso.add(torsoMesh);
    
    // Chest Plate
    const chestPlate = new THREE.Mesh(new THREE.BoxGeometry(0.6, 0.4, 0.4), this._m(cs, true));
    chestPlate.position.set(0, 0.15, 0.2);
    this.parts.torso.add(chestPlate);
    
    // Head
    this.parts.head = new THREE.Group();
    this.parts.head.position.set(0, 0.65, 0);
    this.parts.torso.add(this.parts.head);
    
    const headMesh = new THREE.Mesh(new THREE.CapsuleGeometry(0.25, 0.1, 4, 16), this._m(cp));
    headMesh.position.y = 0.2;
    this.parts.head.add(headMesh);
    
    const visor = new THREE.Mesh(new THREE.BoxGeometry(0.35, 0.12, 0.1), this._g(cg));
    visor.position.set(0, 0.2, 0.24);
    this.parts.head.add(visor);
    this.parts.visor = visor;
    
    // Limbs
    ['L', 'R'].forEach((side, i) => {
      const d = i === 0 ? -1 : 1;
      
      // Arm
      const upperArm = new THREE.Group();
      upperArm.position.set(d * 0.5, 0.4, 0);
      this.parts.torso.add(upperArm);
      this.parts['upperArm'+side] = upperArm;
      
      const uaGeo = new THREE.CapsuleGeometry(0.12, 0.4, 4, 12);
      uaGeo.translate(0, -0.2, 0);
      upperArm.add(new THREE.Mesh(uaGeo, this._m(cp)));
      
      const forearm = new THREE.Group();
      forearm.position.set(0, -0.45, 0);
      upperArm.add(forearm);
      this.parts['forearm'+side] = forearm;
      
      const faGeo = new THREE.CapsuleGeometry(0.1, 0.4, 4, 12);
      faGeo.translate(0, -0.2, 0);
      forearm.add(new THREE.Mesh(faGeo, this._m(cs)));
      
      const fist = new THREE.Mesh(new THREE.SphereGeometry(0.15, 16, 16), this._m(cg, true));
      fist.position.set(0, -0.45, 0);
      forearm.add(fist);
      
      // Leg
      const thigh = new THREE.Group();
      thigh.position.set(d * 0.25, -0.4, 0);
      this.parts.torso.add(thigh);
      this.parts['thigh'+side] = thigh;
      
      const thGeo = new THREE.CapsuleGeometry(0.16, 0.5, 4, 12);
      thGeo.translate(0, -0.25, 0);
      thigh.add(new THREE.Mesh(thGeo, this._m(cp)));
      
      const shin = new THREE.Group();
      shin.position.set(0, -0.55, 0);
      thigh.add(shin);
      this.parts['shin'+side] = shin;
      
      const shGeo = new THREE.CapsuleGeometry(0.13, 0.5, 4, 12);
      shGeo.translate(0, -0.25, 0);
      shin.add(new THREE.Mesh(shGeo, this._m(cs)));
      
      const foot = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.15, 0.35), this._m(cp, true));
      foot.position.set(0, -0.55, 0.1);
      shin.add(foot);
    });

    // Class specific AAA styling
    if (this.charClass === 'ninja') {
      // Sleek back swords
      const sword1 = new THREE.Mesh(new THREE.BoxGeometry(0.05, 1.2, 0.1), this._m(cg, true));
      sword1.position.set(-0.2, 0.2, -0.3);
      sword1.rotation.z = -0.5; sword1.rotation.x = -0.2;
      this.parts.torso.add(sword1);
      const sword2 = new THREE.Mesh(new THREE.BoxGeometry(0.05, 1.2, 0.1), this._m(cg, true));
      sword2.position.set(0.2, 0.2, -0.3);
      sword2.rotation.z = 0.5; sword2.rotation.x = -0.2;
      this.parts.torso.add(sword2);
      visor.scale.set(1.2, 0.5, 1); // Slit visor
    } else if (this.charClass === 'mage') {
      // Floating energy orbs
      this.parts.orb = new THREE.Mesh(new THREE.SphereGeometry(0.2, 16, 16), this._g(cg));
      this.parts.orb.position.set(0, 1.2, -0.4);
      this.parts.torso.add(this.parts.orb);
      // Robe-like lower section
      const robe = new THREE.Mesh(new THREE.ConeGeometry(0.5, 0.8, 8), this._m(cs));
      robe.position.set(0, -0.2, 0);
      this.parts.torso.add(robe);
    } else {
      // Bulky Brawler armor
      const shoulderL = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.4, 0.4), this._m(cs, true));
      shoulderL.position.set(-0.1, 0.2, 0);
      this.parts.upperArmL.add(shoulderL);
      const shoulderR = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.4, 0.4), this._m(cs, true));
      shoulderR.position.set(0.1, 0.2, 0);
      this.parts.upperArmR.add(shoulderR);
    }

    const glow = new THREE.PointLight(cg, 0.8, 5);
    glow.position.y = 2.2; g.add(glow); this.parts.glow = glow;
  }

  setPos(x, y, z) { this.group.position.set(x, y, z); }

  lookAt(target) {
    const dir = new THREE.Vector3().subVectors(target, this.group.position);
    dir.y = 0;
    if (dir.length() > 0.01) this.group.rotation.y = Math.atan2(dir.x, dir.z);
  }

  animate(state, time, dt) {
    this.animTime += dt;
    const t = this.animTime;
    this._reset();

    // Hierarchical animation logic
    const anims = {
      idle: () => {
        this.group.position.y = Math.sin(t*2.5)*0.05;
        this.parts.torso.position.y = 2.0 + Math.sin(t*2)*0.05;
        this.parts.upperArmL.rotation.z = 0.2;
        this.parts.upperArmL.rotation.x = -0.2 + Math.sin(t*2)*0.05;
        this.parts.forearmL.rotation.x = -0.4;
        this.parts.upperArmR.rotation.z = -0.2;
        this.parts.upperArmR.rotation.x = -0.2 + Math.sin(t*2.2)*0.05;
        this.parts.forearmR.rotation.x = -0.4;
        this.parts.thighL.rotation.x = 0.1;
        this.parts.shinL.rotation.x = 0.1;
        this.parts.thighR.rotation.x = -0.1;
        this.parts.shinR.rotation.x = 0.2;
        this.parts.visor.material.opacity = 0.6+Math.sin(t*3)*0.3;
      },
      walking: () => {
        const ws = 10;
        this.parts.thighL.rotation.x = Math.sin(t*ws)*0.6;
        this.parts.shinL.rotation.x = Math.max(0, Math.sin(t*ws-0.5)*0.8);
        this.parts.thighR.rotation.x = -Math.sin(t*ws)*0.6;
        this.parts.shinR.rotation.x = Math.max(0, -Math.sin(t*ws-0.5)*0.8);
        this.parts.upperArmL.rotation.x = -Math.sin(t*ws)*0.5;
        this.parts.forearmL.rotation.x = -0.3;
        this.parts.upperArmR.rotation.x = Math.sin(t*ws)*0.5;
        this.parts.forearmR.rotation.x = -0.3;
        this.parts.torso.position.y = 2.0 + Math.abs(Math.sin(t*ws))*0.1;
        this.parts.torso.rotation.y = Math.sin(t*ws)*0.1;
      },
      punch: () => {
        const p = Math.min(time/0.4, 1);
        if (p<0.3) { 
          const w = Math.sin((p/0.3)*Math.PI/2); 
          this.parts.upperArmR.rotation.x = 0.5*w; 
          this.parts.forearmR.rotation.x = -1.5*w; 
          this.parts.torso.rotation.y = -0.3*w; 
        } else if (p<0.6) { 
          const s = Math.sin(((p-0.3)/0.3)*Math.PI/2); 
          this.parts.upperArmR.rotation.x = 0.5 - s*2.0; 
          this.parts.forearmR.rotation.x = -1.5 + s*1.3; 
          this.parts.torso.rotation.y = -0.3 + s*0.6; 
        } else { 
          const r = Math.sin(((p-0.6)/0.4)*Math.PI/2); 
          this.parts.upperArmR.rotation.x = -1.5 + r*1.5; 
          this.parts.forearmR.rotation.x = -0.2 - r*0.2; 
          this.parts.torso.rotation.y = 0.3 - r*0.3; 
        }
        this.parts.upperArmL.rotation.x = -0.2; this.parts.forearmL.rotation.x = -0.5;
      },
      punch_right: () => {
        const p = Math.min(time / 0.42, 1);
        if (p < 0.3) {
          const w = Math.sin((p / 0.3) * Math.PI / 2);
          this.parts.upperArmR.rotation.x = 0.45 * w;
          this.parts.upperArmR.rotation.z = -0.08 * w;
          this.parts.forearmR.rotation.x = -1.5 * w;
          this.parts.forearmR.rotation.z = -0.05 * w;
          this.parts.torso.rotation.y = -0.28 * w;
          this.parts.torso.rotation.z = 0.04 * w;
        } else if (p < 0.62) {
          const s = Math.sin(((p - 0.3) / 0.32) * Math.PI / 2);
          this.parts.upperArmR.rotation.x = 0.45 - s * 2.1;
          this.parts.upperArmR.rotation.z = -0.08 + s * 0.12;
          this.parts.forearmR.rotation.x = -1.5 + s * 1.25;
          this.parts.forearmR.rotation.z = -0.05 + s * 0.06;
          this.parts.torso.rotation.y = -0.28 + s * 0.6;
          this.parts.torso.rotation.z = 0.04 - s * 0.04;
        } else {
          const r = Math.sin(((p - 0.62) / 0.38) * Math.PI / 2);
          this.parts.upperArmR.rotation.x = -1.6 + r * 1.55;
          this.parts.forearmR.rotation.x = -0.22 - r * 0.22;
          this.parts.torso.rotation.y = 0.32 - r * 0.32;
        }
        this.parts.upperArmL.rotation.x = -0.22;
        this.parts.upperArmL.rotation.z = 0.12;
        this.parts.forearmL.rotation.x = -0.48;
      },
      punch_left: () => {
        const p = Math.min(time / 0.42, 1);
        if (p < 0.3) {
          const w = Math.sin((p / 0.3) * Math.PI / 2);
          this.parts.upperArmL.rotation.x = 0.45 * w;
          this.parts.upperArmL.rotation.z = 0.08 * w;
          this.parts.forearmL.rotation.x = -1.5 * w;
          this.parts.forearmL.rotation.z = 0.05 * w;
          this.parts.torso.rotation.y = 0.28 * w;
          this.parts.torso.rotation.z = -0.04 * w;
        } else if (p < 0.62) {
          const s = Math.sin(((p - 0.3) / 0.32) * Math.PI / 2);
          this.parts.upperArmL.rotation.x = 0.45 - s * 2.1;
          this.parts.upperArmL.rotation.z = 0.08 - s * 0.12;
          this.parts.forearmL.rotation.x = -1.5 + s * 1.25;
          this.parts.forearmL.rotation.z = 0.05 - s * 0.06;
          this.parts.torso.rotation.y = 0.28 - s * 0.6;
          this.parts.torso.rotation.z = -0.04 + s * 0.04;
        } else {
          const r = Math.sin(((p - 0.62) / 0.38) * Math.PI / 2);
          this.parts.upperArmL.rotation.x = -1.6 + r * 1.55;
          this.parts.forearmL.rotation.x = -0.22 - r * 0.22;
          this.parts.torso.rotation.y = -0.32 + r * 0.32;
        }
        this.parts.upperArmR.rotation.x = -0.22;
        this.parts.upperArmR.rotation.z = -0.12;
        this.parts.forearmR.rotation.x = -0.48;
      },
      kick: () => {
        const p = Math.min(time/0.62, 1);
        if (p<0.25) { 
          const c = Math.sin((p/0.25)*Math.PI/2); 
          this.parts.thighR.rotation.x = -c*1.5; 
          this.parts.shinR.rotation.x = c*1.5; 
          this.parts.torso.rotation.z = c*0.2; 
        } else if (p<0.55) { 
          const e = Math.sin(((p-0.25)/0.3)*Math.PI/2); 
          this.parts.thighR.rotation.x = -1.5 + e*0.5; 
          this.parts.shinR.rotation.x = 1.5 - e*1.5; 
          this.parts.torso.rotation.z = 0.2 - e*0.3; 
          this.parts.torso.rotation.y = -e*0.6; 
        } else { 
          const r = Math.sin(((p-0.55)/0.45)*Math.PI/2); 
          this.parts.thighR.rotation.x = -1.0*(1-r); 
          this.parts.shinR.rotation.x = 0; 
          this.parts.torso.rotation.z = -0.1*(1-r); 
        }
        this.parts.upperArmL.rotation.x = -0.4; this.parts.upperArmR.rotation.x = -0.4;
        this.parts.forearmL.rotation.x = -0.6; this.parts.forearmR.rotation.x = -0.6;
      },
      special: () => {
        const p = Math.min(time/0.9, 1);
        if (p<0.35) {
          const c=p/0.35;
          this.parts.upperArmL.rotation.x=-c*2.0; this.parts.upperArmR.rotation.x=-c*2.0;
          this.parts.forearmL.rotation.x=-c*0.2; this.parts.forearmR.rotation.x=-c*0.2;
          this.parts.torso.position.y = 2.0 + c*0.3; this.parts.glow.intensity=0.8+c*3;
        } else if (p<0.6) {
          const r=(p-0.35)/0.25;
          this.parts.upperArmL.rotation.x=-2.0+r*1.0; this.parts.upperArmR.rotation.x=-2.0+r*1.0;
          this.parts.torso.rotation.x=-r*0.4; this.parts.torso.position.y=2.3-r*0.3; this.parts.glow.intensity=4-r*2;
        } else {
          const f=(p-0.6)/0.4;
          this.parts.upperArmL.rotation.x=-1.0*(1-f); this.parts.upperArmR.rotation.x=-1.0*(1-f);
          this.parts.torso.rotation.x=-0.4*(1-f); this.parts.glow.intensity=2*(1-f)+0.8;
        }
      },
      blocking: () => {
        this.parts.upperArmL.rotation.x=-1.0; this.parts.upperArmR.rotation.x=-1.0;
        this.parts.forearmL.rotation.x=-1.2; this.parts.forearmR.rotation.x=-1.2;
        this.parts.upperArmL.rotation.z=0.4; this.parts.upperArmR.rotation.z=-0.4;
        this.parts.torso.rotation.x=0.2; this.parts.head.rotation.x=0.2;
        this.parts.torso.position.y=1.8; this.parts.glow.intensity=1.5+Math.sin(time*8)*0.5;
      },
      dodging: () => {
        const p = Math.min(time/DODGE_DURATION, 1);
        this.parts.torso.rotation.z=Math.sin(p*Math.PI)*0.5;
        this.parts.torso.position.y=2.0 - Math.sin(p*Math.PI)*0.4;
        this.parts.head.rotation.x=-0.3;
      },
      hit: () => {
        const p = Math.max(0, Math.min(time/0.3, 1));
        this.parts.torso.rotation.x=0.5*p;
        this.parts.torso.rotation.z=Math.sin(p*20)*p*0.1;
        this.parts.head.rotation.x=0.6*p;
        this.parts.upperArmL.rotation.x=-0.8*p; this.parts.upperArmR.rotation.x=-0.8*p;
        this.parts.torso.position.y=2.0 - 0.2*p;
      },
      ko: () => {
        const p = Math.min(time/1.0, 1);
        this.parts.torso.rotation.x=p*1.5; this.parts.head.rotation.x=p*0.5;
        this.parts.torso.position.y=2.0 - p*1.8; 
        this.parts.thighL.rotation.x=p*1.2; this.parts.shinL.rotation.x=-p*0.5;
        this.parts.thighR.rotation.x=p*0.2; this.parts.glow.intensity=(1-p)*0.8;
        this.parts.visor.material.opacity=(1-p)*0.8;
      },
    };

    if (anims[state]) anims[state]();
    else if (anims.idle) anims.idle();
  }

  _reset() {
    ['upperArmL','forearmL','upperArmR','forearmR','thighL','thighR','shinL','shinR'].forEach(k => {
      if (this.parts[k]) this.parts[k].rotation.set(0,0,0);
    });
    this.parts.torso.rotation.set(0,0,0);
    this.parts.torso.position.y = 2.0;
    this.parts.head.rotation.set(0,0,0);
    this.parts.glow.intensity = 0.8;
  }

  dispose() {
    this.group.traverse(c => { if (c.geometry) c.geometry.dispose(); if (c.material) c.material.dispose(); });
    this.scene.remove(this.group);
  }
}

// ─── FIGHTER STATE ──────────────────────────────────────
class FighterState {
  constructor() {
    this.health = MAX_HEALTH;
    this.energy = MAX_ENERGY;
    this.position = new THREE.Vector3();
    this.velocity = new THREE.Vector3();
    this.state = 'idle';
    this.attackType = null;
    this.attackTimer = 0;
    this.attackPhase = 'none';
    this.hitstunTimer = 0;
    this.dodgeTimer = 0;
    this.dodgeDir = new THREE.Vector3();
    this.isBlocking = false;
    this.comboCount = 0;
    this.comboTimer = 0;
    this.totalHits = 0;
    this.maxCombo = 0;
    this.totalDamage = 0;
    this.specialsUsed = 0;
  }

  reset() {
    this.health = MAX_HEALTH; this.energy = MAX_ENERGY;
    this.velocity.set(0,0,0); this.state = 'idle';
    this.attackType = null; this.attackTimer = 0;
    this.attackPhase = 'none'; this.hitstunTimer = 0;
    this.dodgeTimer = 0; this.isBlocking = false;
    this.comboCount = 0; this.comboTimer = 0;
  }

  resetStats() { this.totalHits=0; this.maxCombo=0; this.totalDamage=0; this.specialsUsed=0; }

  canAttack() { return this.state === 'idle' || this.state === 'walking'; }
  canBlock() { return this.state === 'idle' || this.state === 'walking'; }
  canDodge() { return this.state === 'idle' || this.state === 'walking'; }
  isInvulnerable() { return this.state === 'dodging'; }
}

// ─── AI ─────────────────────────────────────────────────
class AIController {
  constructor() {
    this.decisionTimer=0; this.interval=0.2; this.action='idle';
    this.strafeDir=1; this.strafeTimer=0;
    this.pendingReaction=null; this.reactionTimer=0; this.reactionTime=0.12;
  }

  update(dt, self, opp, eng) {
    this.decisionTimer -= dt; this.strafeTimer -= dt;
    if (this.strafeTimer<=0) { this.strafeDir=Math.random()>0.5?1:-1; this.strafeTimer=0.5+Math.random()*1.5; }
    if (this.pendingReaction) { this.reactionTimer-=dt; if(this.reactionTimer<=0) { this.action=this.pendingReaction; this.pendingReaction=null; } }
    if (self.state==='attacking'||self.state==='hitstun'||self.state==='ko') return;
    if (this.decisionTimer<=0) { this.decisionTimer=this.interval+Math.random()*0.1; this._decide(self,opp); }
    this._exec(dt, self, opp, eng);
  }

  _decide(self, opp) {
    const dist=self.position.distanceTo(opp.position);
    const hr=self.health/MAX_HEALTH;

    if (opp.state==='attacking'&&opp.attackPhase==='startup') {
      const r=Math.random();
      if (r<0.35) { this.pendingReaction='block'; this.reactionTimer=this.reactionTime+Math.random()*0.08; }
      else if (r<0.55&&self.canDodge()) { this.pendingReaction='dodge'; this.reactionTimer=this.reactionTime+Math.random()*0.08; }
      return;
    }
    if (opp.state==='attacking'&&opp.attackPhase==='recovery'&&dist<3) { this.action='punish'; return; }

    if (dist>6) this.action='approach';
    else if (dist>3.5) this.action=Math.random()<0.55?'approach':'strafe';
    else {
      const r=Math.random();
      if (hr<0.3&&r<0.3) this.action='retreat';
      else if (self.energy>=35&&r<0.15) this.action='special';
      else if (r<0.55) this.action=Math.random()>0.4?'punch':'kick';
      else if (r<0.75) this.action='strafe';
      else this.action='block';
    }
    if (self.energy>=35&&dist<4.5&&Math.random()<0.08) this.action='special';
  }

  _exec(dt, self, opp, eng) {
    const to=new THREE.Vector3().subVectors(opp.position, self.position);
    const dist=to.length(); to.normalize();

    switch(this.action) {
      case 'approach': eng._moveAI(to.x*MOVE_SPEED, to.z*MOVE_SPEED); break;
      case 'retreat': eng._moveAI(-to.x*MOVE_SPEED, -to.z*MOVE_SPEED); break;
      case 'strafe': {
        const s=new THREE.Vector3(-to.z*this.strafeDir,0,to.x*this.strafeDir);
        eng._moveAI(s.x*MOVE_SPEED*0.7, s.z*MOVE_SPEED*0.7); break;
      }
      case 'punch': dist<3&&self.canAttack() ? (eng._aiAttack('punch'), this.action='idle') : eng._moveAI(to.x*MOVE_SPEED, to.z*MOVE_SPEED); break;
      case 'kick': dist<3.5&&self.canAttack() ? (eng._aiAttack('kick'), this.action='idle') : eng._moveAI(to.x*MOVE_SPEED, to.z*MOVE_SPEED); break;
      case 'special': dist<4.5&&self.canAttack()&&self.energy>=35 ? (eng._aiAttack('special'), this.action='idle') : eng._moveAI(to.x*MOVE_SPEED, to.z*MOVE_SPEED); break;
      case 'punish': dist<3&&self.canAttack() ? (eng._aiAttack(Math.random()>0.5?'kick':'punch'), this.action='idle') : eng._moveAI(to.x*MOVE_SPEED, to.z*MOVE_SPEED); break;
      case 'block': eng._setAIBlock(true); break;
      case 'dodge': if(self.canDodge()) { const d=new THREE.Vector3(-to.x+(Math.random()-0.5),0,-to.z+(Math.random()-0.5)).normalize(); eng._aiDodge(d); this.action='idle'; } break;
      default: eng._moveAI(0,0); break;
    }
  }
}

// ─── MAIN ENGINE ────────────────────────────────────────
export class GameEngine {
  /**
   * @param {'offline'|'online'} mode - Engine mode
   *   - 'offline': full local physics, AI, combat (original behavior)
   *   - 'online': server-authoritative; skip physics/combat/AI, only render
   */
  constructor(mode = 'offline') {
    this.mode = mode;         // 'online' or 'offline'
    this._playerId = null;    // 'p1' or 'p2' (online only: which fighter we control)

    this.scene = null; this.camera = null; this.renderer = null;
    this.lastTime = performance.now();
    this.player = null; this.enemy = null;
    this.playerModel = null; this.enemyModel = null;
    this.particles = null; this.audio = new AudioSystem(); this.ai = new AIController();
    this.gameState = 'menu';
    this.roundNumber = 1; this.playerWins = 0; this.enemyWins = 0;
    this.roundTimer = ROUND_TIME; this.keys = {};
    this.aiInput = {x:0,z:0};
    this.cameraTarget = new THREE.Vector3();
    this.cameraShakeTimer = 0; this.cameraShakeIntensity = 0;
    this.slowMoTimer = 0; this.slowMoFactor = 1;
    this.lightPulsers = []; this.arenaObjects = [];
    this.onStateChange = null;
    this.introTimer = 0; // Cinematic intro timer
    this.damageNumbers = [];
    this.damageNumbers = [];
    this._boundKeyDown = this._onKeyDown.bind(this);
    this._boundKeyUp = this._onKeyUp.bind(this);
    this._boundResize = this._onResize.bind(this);

    // Online mode: track last server state for interpolation
    this._serverState = null;
    this._announcementCallback = null; // callback for countdown text
  }

  init(container) {
    // Scene
    this.scene = new THREE.Scene();
    this.scene.fog = new THREE.FogExp2(0x0a0a15, 0.018);
    // Camera
    this.camera = new THREE.PerspectiveCamera(55, window.innerWidth/window.innerHeight, 0.1, 200);
    this.camera.position.set(0, 8, 16);
    this.camera.lookAt(0, 2, 0);
    // Renderer
    this.renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false, powerPreference: 'high-performance' });
    this.renderer.setSize(window.innerWidth, window.innerHeight);
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFShadowMap;
    this.renderer.useLegacyLights = false; // Enable physically correct lighting for realism
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.5;
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    container.appendChild(this.renderer.domElement);
    // Input
    window.addEventListener('keydown', this._boundKeyDown);
    window.addEventListener('keyup', this._boundKeyUp);
    window.addEventListener('resize', this._boundResize);
    document.addEventListener('click', () => { if (!this.audio.ok) this.audio.init(); }, { once: false });
    document.addEventListener('keydown', () => { if (!this.audio.ok) this.audio.init(); }, { once: false });
    // Build world
    this._buildArena();
    this._createFighters();
    this.particles = new ParticleSystem(this.scene);
    // Game loop
    this._loop();
  }

  destroy() {
    window.removeEventListener('keydown', this._boundKeyDown);
    window.removeEventListener('keyup', this._boundKeyUp);
    window.removeEventListener('resize', this._boundResize);
    if (this.rafId) cancelAnimationFrame(this.rafId);
    if (this.renderer) this.renderer.dispose();
  }

  // ── ONLINE MODE API ──────────────────────────────────

  /**
   * Set which player we are (for online mode).
   * In online mode, 'player' always refers to our local fighter.
   * @param {'p1'|'p2'} id
   */
  setPlayerId(id) {
    this._playerId = id;
  }

  /**
   * Apply authoritative server state to the local rendering.
   * Server state format:
   * {
   *   p1: { health, energy, x, y, z, state, attack_type, attack_timer, combo, blocking },
   *   p2: { health, energy, x, y, z, state, attack_type, attack_timer, combo, blocking },
   *   round, timer, p1_wins, p2_wins
   * }
   * @param {Object} state - Server game state
   */
  applyServerState(state) {
    if (!state) return;
    if (this.mode !== 'online') return;

    // Determine which server player maps to our local player/enemy
    const isP1 = this._playerId === state.p1_id || this._playerId === 'p1';
    const myData = isP1 ? state.p1 : state.p2;
    const oppData = isP1 ? state.p2 : state.p1;

    if (myData && oppData) {
      const pClass = myData.char_class || 'brawler';
      const eClass = oppData.char_class || 'brawler';
      if (!this.playerModel || this.playerModel.charClass !== pClass || this.enemyModel.charClass !== eClass) {
        this._createFighters(pClass, eClass);
      }
    }

    // Update player state from server
    if (myData) {
      this.player.health = myData.health;
      this.player.energy = myData.energy;
      this.player.comboCount = myData.combo || 0;
      this.player.isBlocking = myData.blocking || false;

      // Smoothly interpolate position
      const targetPos = new THREE.Vector3(myData.x, myData.y || 0, myData.z);
      this.player.position.lerp(targetPos, 0.4);
      this.playerModel.setPos(this.player.position.x, this.player.position.y, this.player.position.z);

      // Map server state string to local state
      this.player.state = this._mapServerState(myData.state);
      this.player.attackType = myData.attack_type || null;
      this.player.attackTimer = myData.attack_timer || 0;
    }

    // Update enemy state from server
    if (oppData) {
      this.enemy.health = oppData.health;
      this.enemy.energy = oppData.energy;
      this.enemy.comboCount = oppData.combo || 0;
      this.enemy.isBlocking = oppData.blocking || false;

      const targetPos = new THREE.Vector3(oppData.x, oppData.y || 0, oppData.z);
      this.enemy.position.lerp(targetPos, 0.4);
      this.enemyModel.setPos(this.enemy.position.x, this.enemy.position.y, this.enemy.position.z);

      this.enemy.state = this._mapServerState(oppData.state);
      this.enemy.attackType = oppData.attack_type || null;
      this.enemy.attackTimer = oppData.attack_timer || 0;
    }

    // Update round info
    if (state.round !== undefined) this.roundNumber = state.round;
    if (state.timer !== undefined) this.roundTimer = state.timer;
    if (state.p1_wins !== undefined) this.playerWins = isP1 ? state.p1_wins : state.p2_wins;
    if (state.p2_wins !== undefined) this.enemyWins = isP1 ? state.p2_wins : state.p1_wins;

    // Make fighters face each other
    this.playerModel.lookAt(this.enemy.position);
    this.enemyModel.lookAt(this.player.position);

    // Notify UI
    this._notify();
  }

  /**
   * Map server state strings to local engine states.
   */
  _mapServerState(serverState) {
    if (!serverState) return 'idle';
    const mapping = {
      'idle': 'idle',
      'walking': 'walking',
      'attacking': 'attacking',
      'blocking': 'blocking',
      'hitstun': 'hitstun',
      'dodging': 'dodging',
      'ko': 'ko',
      'hit': 'hitstun',
    };
    return mapping[serverState] || serverState;
  }

  /**
   * Handle a hit event from the server. Triggers particles, audio, camera shake, damage numbers.
   * @param {Object} event - { attacker: 'p1'|'p2', defender: 'p1'|'p2', damage, attack_type, blocked, position }
   */
  handleHitEvent(event) {
    if (!event) return;

    const isP1 = this._playerId === event.p1_id || this._playerId === 'p1';
    const attackerIsMe = event.attacker === this._playerId;

    // Determine the defender's 3D position for effects
    let defenderState, defenderModel;
    if ((event.defender === 'p1' && isP1) || (event.defender === 'p2' && !isP1)) {
      defenderState = this.player;
      defenderModel = this.playerModel;
    } else {
      defenderState = this.enemy;
      defenderModel = this.enemyModel;
    }

    // Hit position: use server position or estimate from defender
    const hitPos = event.position
      ? new THREE.Vector3(event.position.x, event.position.y || 2, event.position.z)
      : defenderState.position.clone().add(new THREE.Vector3(0, 2, 0));

    if (event.blocked) {
      // Blocked hit
      this.audio.play('block');
      this.particles.emitBlock(hitPos);
    } else {
      // Full hit
      const attackType = event.attack_type || 'punch';
      this.audio.play(attackType === 'special' ? 'special' : attackType);

      if (attackType === 'special') {
        this.particles.emitSpecial(hitPos);
        this._slowMo(0.5);
        this._camShake(0.3, true);
        this.hitstopTimer = 0.15;
      } else {
        const hitColor = attackerIsMe ? 0x00f0ff : 0xff00aa;
        this.particles.emitHit(hitPos, hitColor);
        this._camShake(0.2);
        this.hitstopTimer = 0.08;
      }
      this._hitFlash();

      // Update combo tracking for local player
      if (attackerIsMe) {
        this.player.comboCount++;
        this.player.comboTimer = COMBO_TIMEOUT;
        this.player.maxCombo = Math.max(this.player.maxCombo, this.player.comboCount);
        this.player.totalHits++;
        this.player.totalDamage += (event.damage || 0);
      }

      // Create damage number
      const v = hitPos.clone().project(this.camera);
      this.damageNumbers.push({
        x: (v.x * 0.5 + 0.5) * window.innerWidth + (Math.random() - 0.5) * 40,
        y: (-v.y * 0.5 + 0.5) * window.innerHeight,
        damage: Math.round(event.damage || 0),
        critical: attackType === 'special',
        time: performance.now(),
      });
    }
  }

  /**
   * Handle countdown text from server. Shows announcements like "ROUND 1", "FIGHT!", etc.
   * @param {string} text - Announcement text ('round_X', 'fight', 'ko', etc.)
   */
  handleCountdown(text) {
    if (!text) return;

    switch (text) {
      case 'round':
        this.gameState = 'announce';
        this.audio.play('round');
        break;
      case 'fight':
        this.gameState = 'announce_fight';
        this.audio.play('fight');
        // After a short delay, switch to fighting state
        setTimeout(() => {
          this.gameState = 'fighting';
          this._notify();
        }, 800);
        break;
      case 'ko':
        this.audio.play('ko');
        this._slowMo(1.0);
        this._camShake(0.5, true);
        // Emit KO particles on the defeated fighter
        const loser = this.player.health <= 0 ? this.player : this.enemy;
        this.particles.emitSpecial(loser.position.clone().add(new THREE.Vector3(0, 2, 0)));
        break;
      case 'round_end':
        this.gameState = 'roundEnd';
        break;
      case 'intro':
        this.gameState = 'intro';
        this.introTimer = 4.0;
        this.audio.play('fight'); // Intro sound
        break;
      case 'round_result':
        this.gameState = 'roundResult';
        break;
      case 'game_over':
        this.gameState = 'gameOver';
        break;
      default:
        // Custom announcement text
        if (this._announcementCallback) this._announcementCallback(text);
        break;
    }
    this._notify();
  }

  /**
   * Set a callback for custom announcement text (e.g. for React overlay).
   * @param {Function} callback - Receives announcement text string
   */
  onAnnouncement(callback) {
    this._announcementCallback = callback;
  }

  // ── PUBLIC API ──
  getState() {
    return {
      gameState: this.gameState,
      roundNumber: this.roundNumber,
      playerWins: this.playerWins,
      enemyWins: this.enemyWins,
      roundTimer: Math.max(0, Math.ceil(this.roundTimer)),
      player: this.player ? {
        health: this.player.health, energy: this.player.energy,
        combo: this.player.comboCount, state: this.player.state,
        totalHits: this.player.totalHits, maxCombo: this.player.maxCombo,
        totalDamage: this.player.totalDamage, specialsUsed: this.player.specialsUsed,
      } : null,
      enemy: this.enemy ? {
        health: this.enemy.health, energy: this.enemy.energy,
        state: this.enemy.state,
      } : null,
      mode: this.mode,
      playerId: this._playerId,
    };
  }

  startFight(playerClass = 'brawler', enemyClass = 'brawler') {
    this.audio.init();
    this.roundNumber = 1; this.playerWins = 0; this.enemyWins = 0;
    
    if (this.mode !== 'online') {
      this._createFighters(playerClass, enemyClass);
    }
    this.player.resetStats(); this.enemy.resetStats();

    if (this.mode === 'online') {
      // In online mode, the server drives the fight flow.
      // Just set fighting state and wait for server state updates.
      this.gameState = 'fighting';
      this._notify();
    } else {
      this._startRound();
    }
  }

  nextRound() {
    if (this.mode === 'online') {
      // Server drives round transitions
      this.gameState = 'fighting';
      this._notify();
    } else {
      this.roundNumber++;
      this._startRound();
    }
  }

  returnToMenu() {
    this.gameState = 'menu';
    this.player.reset(); this.enemy.reset();
    this.player.position.set(-4,0,0); this.enemy.position.set(4,0,0);
    this.playerModel.setPos(-4,0,0); this.enemyModel.setPos(4,0,0);
    this.particles.clear();
    this._notify();
  }

  handleGesture(gesture) {
    if (this.gameState !== 'fighting') return;
    switch(gesture) {
      case 'punch':
        this.player.canAttack() && this._playerAttack('punch'); break;
      case 'punch_left':
        this.player.canAttack() && this._playerAttack('punch_left'); break;
      case 'punch_right':
        this.player.canAttack() && this._playerAttack('punch_right'); break;
      case 'kick': this.player.canAttack() && this._playerAttack('kick'); break;
      case 'special': this.player.canAttack() && this.player.energy >= ATTACKS.special.energyCost && this._playerAttack('special'); break;
      case 'block':
        if (this.player.canBlock()) { this.player.isBlocking=true; this.player.state='blocking'; }
        break;
      case 'dodge': this.player.canDodge() && this._playerDodge(); break;
      case 'move_left':
        if(this.player.state==='idle'||this.player.state==='walking') { this.player.velocity.x = Math.max(this.player.velocity.x - 0.35, -1.2); this.player.state='walking'; }
        break;
      case 'move_right':
        if(this.player.state==='idle'||this.player.state==='walking') { this.player.velocity.x = Math.min(this.player.velocity.x + 0.35, 1.2); this.player.state='walking'; }
        break;
      case 'move_forward':
        if(this.player.state==='idle'||this.player.state==='walking') { this.player.velocity.z = Math.max(this.player.velocity.z - 0.35, -1.2); this.player.state='walking'; }
        break;
      case 'move_back':
        if(this.player.state==='idle'||this.player.state==='walking') { this.player.velocity.z = Math.min(this.player.velocity.z + 0.35, 1.2); this.player.state='walking'; }
        break;
    }
  }

  // ── INTERNAL ──
  _notify() { if (this.onStateChange) this.onStateChange(this.getState()); }

  _startRound() {
    this.player.reset(); this.enemy.reset();
    this.player.position.set(-4,0,0); this.enemy.position.set(4,0,0);
    this.playerModel.setPos(-4,0,0); this.enemyModel.setPos(4,0,0);
    this.roundTimer = ROUND_TIME;
    this.aiInput = {x:0,z:0};
    this.particles.clear();
    this.gameState = 'countdown';
    this._notify();
    this._countdown();
  }

  async _countdown() {
    this.gameState = 'intro';
    this.introTimer = 3.5;
    this._notify();
    this.audio.play('round');
    await this._delay(3500);

    this.gameState = 'announce';
    this._notify();
    await this._delay(1000);
    this.gameState = 'announce_fight';
    this._notify();
    this.audio.play('fight');
    await this._delay(800);
    this.gameState = 'fighting';
    this._notify();
  }

  _endRound(winner) {
    this.gameState = 'roundEnd';
    if (winner==='player') { this.playerWins++; this.enemy.state='ko'; this.enemy.attackTimer=0; }
    else { this.enemyWins++; this.player.state='ko'; this.player.attackTimer=0; }
    this.audio.play('ko');
    this._slowMo(1.0);
    this._camShake(0.5, true);
    const loser = winner==='player' ? this.enemy : this.player;
    this.particles.emitSpecial(loser.position.clone().add(new THREE.Vector3(0,2,0)));
    this._notify();

    setTimeout(() => {
      if (this.playerWins>=ROUNDS_TO_WIN||this.enemyWins>=ROUNDS_TO_WIN) {
        this.gameState = 'gameOver';
      } else {
        this.gameState = 'roundResult';
      }
      this._notify();
    }, 2000);
  }

  _playerAttack(type) {
    if (this.mode === 'online') {
      // In online mode, just play audio locally for responsiveness.
      // The server will validate and broadcast the actual attack.
      this.audio.play(type);
      return;
    }
    const atk = ATTACKS[type];
    this.player.state = 'attacking';
    this.player.attackType = type;
    this.player.attackTimer = 0;
    this.player.attackPhase = 'startup';
    if (type === 'special') { this.player.energy -= atk.energyCost; this.player.specialsUsed++; }
    this.audio.play(type);
    this._notify();
  }

  _playerDodge() {
    if (this.mode === 'online') {
      this.audio.play('dodge');
      return;
    }
    const d = new THREE.Vector3();
    if (this.keys['KeyA']) d.x -= 1;
    if (this.keys['KeyD']) d.x += 1;
    if (this.keys['KeyW']) d.z -= 1;
    if (this.keys['KeyS']) d.z += 1;
    if (d.length()<0.1) { const b=new THREE.Vector3().subVectors(this.player.position,this.enemy.position).normalize(); d.copy(b); }
    d.normalize();
    this.player.state = 'dodging';
    this.player.dodgeTimer = DODGE_DURATION;
    this.player.dodgeDir.copy(d);
    this.audio.play('dodge');
    this.particles.emitDodge(this.player.position.clone().add(new THREE.Vector3(0,1.5,0)));
    this._slowMo(0.35, 0.3); // Cinematic dodge slow-mo
  }

  _moveAI(x, z) { this.aiInput.x = x; this.aiInput.z = z; }

  _setAIBlock(b) {
    if (b && this.enemy.canBlock()) { this.enemy.isBlocking=true; this.enemy.state='blocking'; }
    else { this.enemy.isBlocking=false; if(this.enemy.state==='blocking') this.enemy.state='idle'; }
  }

  _aiAttack(type) {
    const atk = ATTACKS[type];
    this.enemy.state = 'attacking';
    this.enemy.attackType = type;
    this.enemy.attackTimer = 0;
    this.enemy.attackPhase = 'startup';
    if (type==='special') this.enemy.energy -= atk.energyCost;
    this.audio.play(type);
  }

  _aiDodge(dir) {
    this.enemy.state = 'dodging';
    this.enemy.dodgeTimer = DODGE_DURATION;
    this.enemy.dodgeDir.copy(dir);
    this.audio.play('dodge');
    this.particles.emitDodge(this.enemy.position.clone().add(new THREE.Vector3(0,1.5,0)));
  }

  _onKeyDown(e) {
    this.keys[e.code] = true;
    if (this.gameState !== 'fighting') return;
    if (this.mode === 'online') {
      // In online mode, keys are captured and sent via NetworkManager.
      // We still play local audio for immediate feedback.
      if (e.code==='KeyJ') this.audio.play('punch');
      else if (e.code==='KeyK') this.audio.play('kick');
      else if (e.code==='KeyL') this.audio.play('special');
      else if (e.code==='Space') e.preventDefault();
      else if (e.code==='ShiftLeft') { this.audio.play('dodge'); e.preventDefault(); }
      return;
    }
    if (e.code==='KeyJ'&&this.player.canAttack()) this._playerAttack('punch');
    else if (e.code==='KeyK'&&this.player.canAttack()) this._playerAttack('kick');
    else if (e.code==='KeyL'&&this.player.canAttack()&&this.player.energy>=ATTACKS.special.energyCost) this._playerAttack('special');
    else if (e.code==='Space'&&this.player.canBlock()) { this.player.isBlocking=true; this.player.state='blocking'; e.preventDefault(); }
    else if (e.code==='ShiftLeft'&&this.player.canDodge()) { this._playerDodge(); e.preventDefault(); }
  }

  _onKeyUp(e) {
    this.keys[e.code] = false;
    if (this.mode === 'online') return;
    if (e.code==='Space') { this.player.isBlocking=false; if(this.player.state==='blocking') this.player.state='idle'; }
  }

  _onResize() {
    this.camera.aspect = window.innerWidth/window.innerHeight;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(window.innerWidth, window.innerHeight);
  }

  // ── GAME LOOP ──
  _loop() {
    this.rafId = requestAnimationFrame(() => this._loop());
    const now = performance.now();
    let dt = (now - (this.lastTime || now)) / 1000;
    this.lastTime = now;
    dt = Math.max(0.001, Math.min(dt, 0.05));
    
    if (this.hitstopTimer > 0) {
      this.hitstopTimer -= dt;
      // During hitstop, only update particles and camera shake, NOT game logic or animations
      this._updateCamera(0.001); // Minimal dt for smooth shake
      this.particles.update(dt * 0.1); // Slow down particles during hitstop
      this.renderer.render(this.scene, this.camera);
      return;
    }

    if (this.slowMoTimer > 0) { this.slowMoTimer -= dt; dt *= this.slowMoFactor; }
    this._updateArena(dt);

    if (this.mode === 'online') {
      // ── ONLINE MODE: Skip physics/combat/AI, only render ──
      // Animations are driven by server state applied via applyServerState()
      this._updateOnlineAnims(dt);
      this._updateCamera(dt);
      this.particles.update(dt);
      this.renderer.render(this.scene, this.camera);
      return;
    }

    // ── OFFLINE MODE: Full local simulation ──
    if (this.gameState === 'fighting') {
      this._updateFight(dt);
    } else if (this.gameState === 'intro') {
      this.introTimer -= dt;
      this._updateAnims(dt);
    } else {
      this._updateAnims(dt);
    }
    this._updateCamera(dt);
    this.particles.update(dt);
    this.renderer.render(this.scene, this.camera);
  }

  /**
   * Online mode animation update: uses server-provided state for animation selection.
   * No physics, no combat, no AI — just animate based on current state.
   */
  _updateOnlineAnims(dt) {
    if (!this.player || !this.enemy) return;

    // Animate player model
    const pState = this.player.state === 'attacking'
      ? (this.player.attackType || 'punch')
      : (this.player.state === 'hitstun' ? 'hit' : this.player.state);
    const pTime = this.player.state === 'hitstun'
      ? this.player.hitstunTimer
      : this.player.attackTimer;
    this.playerModel.animate(pState, pTime, dt);

    // Animate enemy model
    const eState = this.enemy.state === 'attacking'
      ? (this.enemy.attackType || 'punch')
      : (this.enemy.state === 'hitstun' ? 'hit' : this.enemy.state);
    const eTime = this.enemy.state === 'hitstun'
      ? this.enemy.hitstunTimer
      : this.enemy.attackTimer;
    this.enemyModel.animate(eState, eTime, dt);

    // Increment attack timer locally for smoother animation
    if (this.player.state === 'attacking') this.player.attackTimer += dt;
    if (this.enemy.state === 'attacking') this.enemy.attackTimer += dt;
    if (this.player.state === 'ko') this.player.attackTimer += dt;
    if (this.enemy.state === 'ko') this.enemy.attackTimer += dt;
  }

  _updateFight(dt) {
    this.roundTimer -= dt;
    if (this.roundTimer <= 0) { this._endRound(this.player.health>=this.enemy.health?'player':'enemy'); return; }
    this._updatePlayerMove(dt);
    this.ai.update(dt, this.enemy, this.player, this);
    this._updateAIMove(dt);
    this._updateAttack(this.player, this.enemy, dt);
    this._updateAttack(this.enemy, this.player, dt);
    this._updateState(this.player, dt);
    this._updateState(this.enemy, dt);
    if (this.player.state!=='attacking') this.player.energy=Math.min(MAX_ENERGY, this.player.energy+ENERGY_REGEN*dt);
    if (this.enemy.state!=='attacking') this.enemy.energy=Math.min(MAX_ENERGY, this.enemy.energy+ENERGY_REGEN*dt);
    if (this.player.comboCount>0) { this.player.comboTimer-=dt; if(this.player.comboTimer<=0) this.player.comboCount=0; }
    this._updateAnims(dt);
    this.playerModel.lookAt(this.enemy.position);
    this.enemyModel.lookAt(this.player.position);
    this._enforceBounds(this.player, this.playerModel);
    this._enforceBounds(this.enemy, this.enemyModel);
    this._enforceDistance();
    this._notify();
  }

  _updatePlayerMove(dt) {
    if (['attacking','hitstun','blocking','ko'].includes(this.player.state)) return;
    if (this.player.state==='dodging') {
      this.player.dodgeTimer -= dt;
      this.player.position.add(this.player.dodgeDir.clone().multiplyScalar(DODGE_SPEED*dt));
      if (this.player.dodgeTimer<=0) this.player.state='idle';
      this.playerModel.setPos(this.player.position.x, this.player.position.y, this.player.position.z);
      return;
    }
    const m = new THREE.Vector3();
    const k = this.keys;
    if (k['KeyW'] || k['w'] || k['W'] || k['ArrowUp']) m.z -= 1;
    if (k['KeyS'] || k['s'] || k['S'] || k['ArrowDown']) m.z += 1;
    if (k['KeyA'] || k['a'] || k['A'] || k['ArrowLeft']) m.x -= 1;
    if (this.keys['KeyD'] || k['d'] || k['D'] || k['ArrowRight']) m.x += 1;
    if (m.length()>0) {
      const target = m.normalize().multiplyScalar(MOVE_SPEED * dt);
      this.player.velocity.lerp(target, 0.35);
      this.player.position.add(this.player.velocity);
      this.player.state='walking';
    }
    else if (this.player.state==='walking') this.player.state='idle';
    this.player.velocity.multiplyScalar(0.82);
    this.playerModel.setPos(this.player.position.x, this.player.position.y, this.player.position.z);
  }

  _updateAIMove(dt) {
    if (['attacking','hitstun','ko'].includes(this.enemy.state)) { this.aiInput.x=0; this.aiInput.z=0; return; }
    if (this.enemy.state==='dodging') {
      this.enemy.dodgeTimer-=dt;
      this.enemy.position.add(this.enemy.dodgeDir.clone().multiplyScalar(DODGE_SPEED*dt));
      if (this.enemy.dodgeTimer<=0) { this.enemy.state='idle'; this._setAIBlock(false); }
      this.enemyModel.setPos(this.enemy.position.x, this.enemy.position.y, this.enemy.position.z);
      return;
    }
    if (this.enemy.state==='blocking') { this.enemyModel.setPos(this.enemy.position.x, this.enemy.position.y, this.enemy.position.z); return; }
    const mv = new THREE.Vector3(this.aiInput.x,0,this.aiInput.z);
    if (mv.length()>0) {
      mv.normalize().multiplyScalar(MOVE_SPEED*0.85*dt);
      this.enemy.velocity.lerp(mv, 0.28);
      this.enemy.position.add(this.enemy.velocity);
      this.enemy.state='walking';
    }
    else if (this.enemy.state==='walking') this.enemy.state='idle';
    this.enemy.velocity.multiplyScalar(0.82);
    this.enemyModel.setPos(this.enemy.position.x, this.enemy.position.y, this.enemy.position.z);
  }

  _updateAttack(atk, def, dt) {
    if (atk.state !== 'attacking') return;
    const a = ATTACKS[atk.attackType];
    atk.attackTimer += dt;
    if (atk.attackPhase==='startup'&&atk.attackTimer>=a.startup) atk.attackPhase='active';
    if (atk.attackPhase==='active') {
      const dist = atk.position.distanceTo(def.position);
      if (dist<=a.range&&!def.isInvulnerable()) { this._applyHit(atk,def,a); atk.attackPhase='recovery'; }
      if (atk.attackTimer>=a.startup+a.active) atk.attackPhase='recovery';
    }
    if (atk.attackPhase==='recovery'&&atk.attackTimer>=a.startup+a.active+a.recovery) {
      atk.state='idle'; atk.attackPhase='none'; atk.attackType=null; atk.attackTimer=0;
    }
  }

  _applyHit(atk, def, a) {
    let dmg = a.damage;
    if (def.isBlocking) {
      dmg *= BLOCK_DAMAGE_MULT;
      this.audio.play('block');
      this.particles.emitBlock(def.position.clone().add(new THREE.Vector3(0,2,0)));
    } else {
      def.state='hitstun'; def.hitstunTimer=a.hitstun; def.isBlocking=false;
      const kd = new THREE.Vector3().subVectors(def.position,atk.position).normalize();
      def.position.add(kd.clone().multiplyScalar(a.knockback*0.3));
      def.velocity.copy(kd.multiplyScalar(a.knockback));
      const hp = def.position.clone().add(new THREE.Vector3(0,2,0));
      if (atk.attackType==='special') { 
        this.particles.emitSpecial(hp); 
        this._slowMo(0.5); 
        this._camShake(0.3,true); 
        this.hitstopTimer = 0.15; // Mega freeze frame
      } else { 
        this.particles.emitHit(hp, atk===this.player?0x00f0ff:0xff00aa); 
        this._camShake(0.2); 
        this.hitstopTimer = 0.08; // Normal freeze frame
      }
      this._hitFlash();
      if (atk===this.player) {
        atk.comboCount++; atk.comboTimer=COMBO_TIMEOUT;
        atk.maxCombo=Math.max(atk.maxCombo,atk.comboCount);
        dmg *= (1+atk.comboCount*0.08);
        atk.totalHits++; atk.totalDamage+=dmg;
      }
      // Create damage number data for React
      const v = hp.clone().project(this.camera);
      this.damageNumbers.push({
        x: (v.x*0.5+0.5)*window.innerWidth + (Math.random()-0.5)*40,
        y: (-v.y*0.5+0.5)*window.innerHeight,
        damage: Math.round(dmg),
        critical: atk.attackType==='special',
        time: performance.now(),
      });
      // Update model
      const model = def===this.player ? this.playerModel : this.enemyModel;
      model.setPos(def.position.x, def.position.y, def.position.z);
    }
    def.health = Math.max(0, def.health - dmg);
    if (def.health<=0) this._endRound(atk===this.player?'player':'enemy');
  }

  _updateState(f, dt) {
    if (f.state==='hitstun') {
      f.hitstunTimer-=dt;
      f.position.add(f.velocity.clone().multiplyScalar(dt));
      f.velocity.multiplyScalar(0.9);
      if (f.hitstunTimer<=0) { f.state='idle'; f.velocity.set(0,0,0); }
      const m = f===this.player ? this.playerModel : this.enemyModel;
      m.setPos(f.position.x, f.position.y, f.position.z);
    }
  }

  _updateAnims(dt) {
    if (this.gameState !== 'fighting') {
      if (this.player.state === 'ko') this.player.attackTimer += dt;
      if (this.enemy.state === 'ko') this.enemy.attackTimer += dt;
    }
    const pState = this.player.state==='attacking' ? this.player.attackType : (this.player.state==='hitstun' ? 'hit' : this.player.state);
    const pTime = this.player.state==='hitstun' ? this.player.hitstunTimer : this.player.attackTimer;
    this.playerModel.animate(pState, pTime, dt);
    const eState = this.enemy.state==='attacking' ? this.enemy.attackType : (this.enemy.state==='hitstun' ? 'hit' : this.enemy.state);
    const eTime = this.enemy.state==='hitstun' ? this.enemy.hitstunTimer : this.enemy.attackTimer;
    this.enemyModel.animate(eState, eTime, dt);
  }

  _enforceBounds(f, m) {
    const md = ARENA_SIZE*0.6;
    const d = Math.sqrt(f.position.x**2+f.position.z**2);
    if (d>md) {
      const dir=new THREE.Vector3(f.position.x,0,f.position.z).normalize();
      f.position.x=dir.x*md; f.position.z=dir.z*md;
      m.setPos(f.position.x, f.position.y, f.position.z);
    }
  }

  _enforceDistance() {
    const d=this.player.position.distanceTo(this.enemy.position);
    if (d<FIGHTER_RADIUS*2) {
      const pd=new THREE.Vector3().subVectors(this.player.position,this.enemy.position);
      if (pd.length()<0.001) pd.set(1,0,0);
      pd.normalize();
      const ol=FIGHTER_RADIUS*2-d;
      this.player.position.add(pd.clone().multiplyScalar(ol*0.5));
      this.enemy.position.add(pd.clone().multiplyScalar(-ol*0.5));
      this.playerModel.setPos(this.player.position.x,this.player.position.y,this.player.position.z);
      this.enemyModel.setPos(this.enemy.position.x,this.enemy.position.y,this.enemy.position.z);
    }
  }

  _updateCamera(dt) {
    if (this.gameState === 'intro') {
      // Cinematic rotating intro camera
      const progress = 1 - (this.introTimer / 4.0);
      const angle = progress * Math.PI * 1.5;
      const radius = 10 - progress * 4;
      const height = 1 + progress * 3;
      
      this.camera.position.set(
        Math.cos(angle) * radius,
        height,
        Math.sin(angle) * radius
      );
      this.cameraTarget.lerp(new THREE.Vector3(0, 2, 0), 0.1);
      this.camera.lookAt(this.cameraTarget);
      return;
    }

    const mid=new THREE.Vector3().addVectors(this.player.position,this.enemy.position).multiplyScalar(0.5);
    mid.y=2.5;
    const fd=this.player.position.distanceTo(this.enemy.position);
    const cd=Math.max(10, fd*1.2+8);
    
    // Dramatic zoom during specials or slowmo
    let zoomOffset = 0;
    if (this.slowMoTimer > 0) zoomOffset = -3;
    
    const tcp=new THREE.Vector3(mid.x*0.3, 6+fd*0.15, mid.z+cd+zoomOffset);
    this.camera.position.lerp(tcp, 5*dt);
    this.cameraTarget.lerp(mid, 8*dt);
    if (this.cameraShakeTimer>0) {
      this.cameraShakeTimer-=dt;
      const i=this.cameraShakeIntensity*(this.cameraShakeTimer/0.3);
      this.camera.position.x+=(Math.random()-0.5)*i*3;
      this.camera.position.y+=(Math.random()-0.5)*i*2;
      this.camera.position.z+=(Math.random()-0.5)*i;
    }
    this.camera.lookAt(this.cameraTarget);
  }

  _camShake(dur=0.2,heavy=false) {
    this.cameraShakeTimer=dur; this.cameraShakeIntensity=heavy?2.5:1.0;
    document.body.classList.add(heavy?'screen-shake-heavy':'screen-shake');
    setTimeout(() => document.body.classList.remove('screen-shake','screen-shake-heavy'), heavy?300:200);
  }


  _slowMo(dur=0.3, factor=0.15) {
    this.slowMoTimer=dur; this.slowMoFactor=factor;
    setTimeout(() => { this.slowMoFactor=1; }, dur*1000);
  }

  _hitFlash() {
    const f=document.getElementById('hit-flash-overlay');
    if (f) { f.classList.remove('hidden'); f.offsetHeight; setTimeout(() => f.classList.add('hidden'), 120); }
  }

  _updateArena(dt) {
    const t = performance.now()*0.001;
    this.lightPulsers.forEach((obj,i) => {
      if (obj.material) obj.material.opacity=0.3+Math.sin(t*2+i)*0.2;
      if (obj.intensity!==undefined) obj.intensity=0.3+Math.sin(t*1.5+i*0.5)*0.2;
    });
    this.arenaObjects.forEach((obj,i) => {
      if (obj.geometry&&obj.geometry.type==='BoxGeometry') { obj.position.y+=Math.sin(t*0.5+i*2)*0.003; obj.rotation.y+=dt*0.1; }
    });
  }

  _buildArena() {
    const s = this.scene;
    // Ground
    const gnd = new THREE.Mesh(new THREE.PlaneGeometry(ARENA_SIZE*2,ARENA_SIZE*2,50,50), new THREE.MeshStandardMaterial({color:0x0a0a15,metalness:0.9,roughness:0.4,transparent:true,opacity:0.95}));
    gnd.rotation.x=-Math.PI/2; gnd.receiveShadow=true; s.add(gnd);
    // Grid
    const grid=new THREE.GridHelper(ARENA_SIZE*2,40,0x00f0ff,0x1a1a3e);
    grid.material.transparent=true; grid.material.opacity=0.15; grid.position.y=0.01; s.add(grid);
    // Arena ring
    const ring=new THREE.Mesh(new THREE.RingGeometry(ARENA_SIZE*0.65,ARENA_SIZE*0.67,64), new THREE.MeshBasicMaterial({color:0x00f0ff,transparent:true,opacity:0.4,side:THREE.DoubleSide}));
    ring.rotation.x=-Math.PI/2; ring.position.y=0.02; s.add(ring); this.arenaObjects.push(ring);
    // Inner ring
    const ir=new THREE.Mesh(new THREE.RingGeometry(ARENA_SIZE*0.63,ARENA_SIZE*0.65,64), new THREE.MeshBasicMaterial({color:0x8b00ff,transparent:true,opacity:0.2,side:THREE.DoubleSide}));
    ir.rotation.x=-Math.PI/2; ir.position.y=0.02; s.add(ir);
    // Center mark
    const cm=new THREE.Mesh(new THREE.RingGeometry(0.8,1.0,32), new THREE.MeshBasicMaterial({color:0xff4400,transparent:true,opacity:0.3,side:THREE.DoubleSide}));
    cm.rotation.x=-Math.PI/2; cm.position.y=0.02; s.add(cm);
    // Pillars
    const ppos=[[-12,0,-12],[12,0,-12],[-12,0,12],[12,0,12],[-15,0,0],[15,0,0],[0,0,-15],[0,0,15]];
    ppos.forEach((pos,i) => {
      const p=new THREE.Mesh(new THREE.BoxGeometry(0.6,8,0.6), new THREE.MeshStandardMaterial({color:0x1a1a2e,metalness:0.8,roughness:0.3}));
      p.position.set(pos[0],4,pos[2]); p.castShadow=true; s.add(p);
      const sc=i<4?0x00f0ff:0x8b00ff;
      const st=new THREE.Mesh(new THREE.BoxGeometry(0.1,7.5,0.1), new THREE.MeshBasicMaterial({color:sc,transparent:true,opacity:0.6}));
      st.position.set(pos[0],4,pos[2]+0.32); s.add(st); this.lightPulsers.push(st);
      const tl=new THREE.PointLight(sc,0.5,8); tl.position.set(pos[0],8,pos[2]); s.add(tl);
      const tp=new THREE.Mesh(new THREE.BoxGeometry(0.7,0.3,0.7), new THREE.MeshBasicMaterial({color:sc,transparent:true,opacity:0.5}));
      tp.position.set(pos[0],8.15,pos[2]); s.add(tp); this.lightPulsers.push(tp);
    });
    // Floating debris
    for (let i=0;i<8;i++) {
      const db=new THREE.Mesh(new THREE.BoxGeometry(0.5+Math.random()*1.5,0.1+Math.random()*0.3,0.5+Math.random()*1.5), new THREE.MeshStandardMaterial({color:0x1a1a2e,metalness:0.7,roughness:0.4,transparent:true,opacity:0.6}));
      const a=(i/8)*Math.PI*2, r=18+Math.random()*5;
      db.position.set(Math.cos(a)*r,3+Math.random()*8,Math.sin(a)*r);
      db.rotation.set(Math.random(),Math.random(),Math.random()); s.add(db); this.arenaObjects.push(db);
    }
    // Lights
    s.add(new THREE.AmbientLight(0x2a2a4e, 1.2));
    const dl=new THREE.DirectionalLight(0xccccff,1.0);
    dl.position.set(5,15,10); dl.castShadow=true;
    dl.shadow.mapSize.width=2048; dl.shadow.mapSize.height=2048;
    dl.shadow.camera.near=0.1; dl.shadow.camera.far=50;
    dl.shadow.camera.left=-20; dl.shadow.camera.right=20;
    dl.shadow.camera.top=20; dl.shadow.camera.bottom=-20;
    s.add(dl);
    const rl1=new THREE.SpotLight(0x00f0ff,1.5,40,Math.PI/4,0.5);
    rl1.position.set(-10,12,-5); rl1.target.position.set(0,0,0); s.add(rl1); s.add(rl1.target);
    const rl2=new THREE.SpotLight(0xff00aa,1.2,40,Math.PI/4,0.5);
    rl2.position.set(10,12,5); rl2.target.position.set(0,0,0); s.add(rl2); s.add(rl2.target);
    const accentL=new THREE.PointLight(0xff4400,0.6,30); accentL.position.set(0,10,0); s.add(accentL);
    const gg=new THREE.PointLight(0x00f0ff,0.3,20); gg.position.set(0,0.5,0); s.add(gg); this.lightPulsers.push(gg);
    // Background buildings
    for (let i=0;i<20;i++) {
      const h=5+Math.random()*25, w=2+Math.random()*6, d=2+Math.random()*6;
      const b=new THREE.Mesh(new THREE.BoxGeometry(w,h,d), new THREE.MeshStandardMaterial({color:0x151525,metalness:0.9,roughness:0.5}));
      const a=(i/20)*Math.PI*2+Math.random()*0.3, r=30+Math.random()*20;
      b.position.set(Math.cos(a)*r,h/2,Math.sin(a)*r); b.rotation.y=Math.random()*Math.PI; s.add(b);
      for (let j=0;j<Math.floor(Math.random()*5)+2;j++) {
        const wc=[0x00f0ff,0xff00aa,0x8b00ff,0xff4400][Math.floor(Math.random()*4)];
        const wn=new THREE.Mesh(new THREE.BoxGeometry(0.3,0.2,0.05), new THREE.MeshBasicMaterial({color:wc,transparent:true,opacity:0.3+Math.random()*0.5}));
        wn.position.set(b.position.x+(Math.random()-0.5)*(w-0.5),1+Math.random()*(h-2),b.position.z+d/2+0.03);
        wn.rotation.y=b.rotation.y; s.add(wn);
      }
    }
  }

  _createFighters(pClass = 'brawler', eClass = 'brawler') {
    if (this.playerModel) { this.playerModel.dispose(); this.playerModel = null; }
    if (this.enemyModel) { this.enemyModel.dispose(); this.enemyModel = null; }

    this.playerModel = new Fighter3D(this.scene, pClass, 0x1a2a3a, 0x2a3a4a, 0x00f0ff);
    if (!this.player) {
      this.player = new FighterState();
      this.player.position.set(-4,0,0);
    }
    this.playerModel.setPos(-4,0,0);

    this.enemyModel = new Fighter3D(this.scene, eClass, 0x2a1a2a, 0x3a1a3a, 0xff00aa);
    if (!this.enemy) {
      this.enemy = new FighterState();
      this.enemy.position.set(4,0,0);
    }
    this.enemyModel.setPos(4,0,0);
  }

  _delay(ms) { return new Promise(r => setTimeout(r, ms)); }
}
