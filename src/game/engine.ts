import { soundEngine } from './audio';
import { GAME_CONFIG } from './config';
import {
  Afterimage,
  Enemy,
  EnemyKind,
  FloatingText,
  GameState,
  HudSnapshot,
  Particle,
  Pickup,
  PickupKind,
  Player,
  Projectile,
  Shockwave,
  StarSpec,
  TouchInputState,
} from './types';

function clamp(v: number, min: number, max: number): number {
  return v < min ? min : v > max ? max : v;
}

/**
 * Exact line-segment to circle intersection test.
 * Prevents fast-moving projectiles or a dashing ship from tunneling through targets.
 */
function segmentIntersectsCircle(
  x1: number,
  y1: number,
  x2: number,
  y2: number,
  cx: number,
  cy: number,
  r: number,
): boolean {
  const dx = x2 - x1;
  const dy = y2 - y1;
  const lenSq = dx * dx + dy * dy;
  if (lenSq === 0) {
    const px = cx - x1;
    const py = cy - y1;
    return px * px + py * py <= r * r;
  }
  const t = clamp(((cx - x1) * dx + (cy - y1) * dy) / lenSq, 0, 1);
  const closestX = x1 + t * dx;
  const closestY = y1 + t * dy;
  const distX = cx - closestX;
  const distY = cy - closestY;
  return distX * distX + distY * distY <= r * r;
}

export class SolarBreachEngine {
  private canvas: HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D;
  private onHudUpdate: (snapshot: HudSnapshot) => void;

  private width = 1280;
  private height = 720;
  private dpr = 1;

  private rafId: number | null = null;
  private lastTimestamp = 0;
  private hudSyncAccum = 0;
  private clockTime = 0;

  // Game State Machine
  private gameState: GameState = 'TITLE_MENU';
  private gameOverGuardTimer = 0;

  // Score & Progression
  private score = 0;
  private highScore = 0;
  private isNewHighScore = false;
  private kills = 0;
  private wave = 1;
  private wavesCleared = 0;
  private multiplier = 1;
  private multiplierTimer = 0;
  private novaCharge = 0;

  // Wave Spawner State
  private waveSpawnQueue: EnemyKind[] = [];
  private waveSpawnTimer = 0;
  private waveBreatherTimer = 0;
  private waveBannerText: string | null = null;
  private waveBannerTimer = 0;
  private nextEnemyId = 1;

  // Juice State
  private hitstopTimer = 0;
  private shakeIntensity = 0;
  private damageVignette = 0;

  // Entities & Pre-allocated Object Pools (Zero GC churn / zero leaks)
  private player: Player;
  private enemies: Enemy[] = [];
  private projectiles: Projectile[] = [];
  private pickups: Pickup[] = [];
  private particles: Particle[] = [];
  private shockwaves: Shockwave[] = [];
  private floatingTexts: FloatingText[] = [];
  private afterimages: Afterimage[] = [];
  private stars: StarSpec[] = [];

  // Input Tracking (Held vs Edge-Triggered)
  private keysHeld = new Set<string>();
  private mouseX = 640;
  private mouseY = 360;
  private mouseMoved = false;
  private mouseDownLeft = false;
  private touchState: TouchInputState = {
    moveX: 0,
    moveY: 0,
    aimX: 0,
    aimY: 0,
    firing: false,
  };
  private queuedDash = false;
  private queuedNova = false;

  // Bound event listeners for clean teardown
  private handleResizeBound: () => void;
  private handleKeyDownBound: (e: KeyboardEvent) => void;
  private handleKeyUpBound: (e: KeyboardEvent) => void;
  private handleMouseMoveBound: (e: MouseEvent) => void;
  private handleMouseDownBound: (e: MouseEvent) => void;
  private handleMouseUpBound: (e: MouseEvent) => void;
  private handleContextMenuBound: (e: MouseEvent) => void;
  private handleBlurBound: () => void;
  private handleVisibilityBound: () => void;

  constructor(canvas: HTMLCanvasElement, onHudUpdate: (snapshot: HudSnapshot) => void) {
    this.canvas = canvas;
    const context = canvas.getContext('2d', { alpha: false });
    if (!context) {
      throw new Error('Unable to acquire 2D canvas context.');
    }
    this.ctx = context;
    this.onHudUpdate = onHudUpdate;

    this.highScore = this.loadHighScore();
    this.player = this.createInitialPlayer();
    this.initPools();
    this.initStars();

    this.handleResizeBound = this.resize.bind(this);
    this.handleKeyDownBound = this.onKeyDown.bind(this);
    this.handleKeyUpBound = this.onKeyUp.bind(this);
    this.handleMouseMoveBound = this.onMouseMove.bind(this);
    this.handleMouseDownBound = this.onMouseDown.bind(this);
    this.handleMouseUpBound = this.onMouseUp.bind(this);
    this.handleContextMenuBound = (e: MouseEvent) => e.preventDefault();
    this.handleBlurBound = this.clearAllInputs.bind(this);
    this.handleVisibilityBound = () => {
      if (document.hidden) {
        this.clearAllInputs();
        if (this.gameState === 'PLAYING') {
          this.pauseGame();
        }
      }
    };

    this.resize();
    this.attachListeners();
    this.emitHudSnapshot();
  }

  private loadHighScore(): number {
    try {
      const raw = localStorage.getItem(GAME_CONFIG.HIGH_SCORE_STORAGE_KEY);
      const parsed = raw ? parseInt(raw, 10) : 0;
      return Number.isFinite(parsed) && parsed > 0 ? parsed : 0;
    } catch {
      return 0;
    }
  }

  private saveHighScore(val: number): void {
    try {
      localStorage.setItem(GAME_CONFIG.HIGH_SCORE_STORAGE_KEY, String(val));
    } catch {
      // Ignore storage errors
    }
  }

  private createInitialPlayer(): Player {
    const cx = this.width * 0.5;
    const cy = this.height * 0.5;
    return {
      x: cx,
      y: cy,
      prevX: cx,
      prevY: cy,
      vx: 0,
      vy: 0,
      angle: -Math.PI * 0.5,
      radius: GAME_CONFIG.PLAYER.RADIUS,
      hp: GAME_CONFIG.PLAYER.MAX_HP,
      maxHp: GAME_CONFIG.PLAYER.MAX_HP,
      overshield: 0,
      invulnTimer: 0,
      hitFlashTimer: 0,
      fireCooldown: 0,
      rapidTimer: 0,
      dashCooldown: 0,
      dashTimer: 0,
      dashDirX: 0,
      dashDirY: -1,
      squashX: 1,
      squashY: 1,
      thrusterAccum: 0,
    };
  }

  private initPools(): void {
    this.projectiles = Array.from({ length: GAME_CONFIG.POOLS.MAX_PROJECTILES }, () => ({
      active: false,
      fromPlayer: true,
      x: 0,
      y: 0,
      prevX: 0,
      prevY: 0,
      vx: 0,
      vy: 0,
      radius: 4,
      damage: 1,
      life: 0,
      maxLife: 1,
      color: GAME_CONFIG.COLORS.playerBolt,
      pierce: 0,
    }));

    this.pickups = Array.from({ length: GAME_CONFIG.POOLS.MAX_PICKUPS }, () => ({
      active: false,
      kind: 'shard' as PickupKind,
      x: 0,
      y: 0,
      vx: 0,
      vy: 0,
      radius: 8,
      life: 0,
      maxLife: 1,
      value: 1,
      pulse: 0,
    }));

    this.particles = Array.from({ length: GAME_CONFIG.POOLS.MAX_PARTICLES }, () => ({
      active: false,
      x: 0,
      y: 0,
      vx: 0,
      vy: 0,
      size: 3,
      life: 0,
      maxLife: 1,
      color: '#FFFFFF',
      drag: 4,
      shape: 'circle' as const,
      rotation: 0,
      vRot: 0,
    }));

    this.shockwaves = Array.from({ length: GAME_CONFIG.POOLS.MAX_SHOCKWAVES }, () => ({
      active: false,
      x: 0,
      y: 0,
      radius: 0,
      maxRadius: 100,
      life: 0,
      maxLife: 0.4,
      color: '#F59E0B',
      lineWidth: 2,
    }));

    this.floatingTexts = Array.from({ length: GAME_CONFIG.POOLS.MAX_FLOATING_TEXTS }, () => ({
      active: false,
      x: 0,
      y: 0,
      vy: -40,
      text: '',
      color: '#FFFFFF',
      life: 0,
      maxLife: 0.8,
      scale: 1,
    }));

    this.afterimages = Array.from({ length: GAME_CONFIG.POOLS.MAX_AFTERIMAGES }, () => ({
      active: false,
      x: 0,
      y: 0,
      angle: 0,
      life: 0,
      maxLife: 0.2,
      color: GAME_CONFIG.COLORS.playerDash,
    }));
  }

  private initStars(): void {
    this.stars = Array.from({ length: 95 }, () => ({
      x: Math.random(),
      y: Math.random(),
      radius: 0.7 + Math.random() * 1.4,
      alpha: 0.18 + Math.random() * 0.45,
      parallax: 0.015 + Math.random() * 0.035,
      twinkleSpeed: 1 + Math.random() * 2.4,
      phase: Math.random() * Math.PI * 2,
    }));
  }

  private attachListeners(): void {
    window.addEventListener('resize', this.handleResizeBound);
    window.addEventListener('keydown', this.handleKeyDownBound);
    window.addEventListener('keyup', this.handleKeyUpBound);
    window.addEventListener('mousemove', this.handleMouseMoveBound);
    window.addEventListener('mousedown', this.handleMouseDownBound);
    window.addEventListener('mouseup', this.handleMouseUpBound);
    this.canvas.addEventListener('contextmenu', this.handleContextMenuBound);
    window.addEventListener('blur', this.handleBlurBound);
    document.addEventListener('visibilitychange', this.handleVisibilityBound);
  }

  public destroy(): void {
    if (this.rafId !== null) {
      cancelAnimationFrame(this.rafId);
      this.rafId = null;
    }
    window.removeEventListener('resize', this.handleResizeBound);
    window.removeEventListener('keydown', this.handleKeyDownBound);
    window.removeEventListener('keyup', this.handleKeyUpBound);
    window.removeEventListener('mousemove', this.handleMouseMoveBound);
    window.removeEventListener('mousedown', this.handleMouseDownBound);
    window.removeEventListener('mouseup', this.handleMouseUpBound);
    this.canvas.removeEventListener('contextmenu', this.handleContextMenuBound);
    window.removeEventListener('blur', this.handleBlurBound);
    document.removeEventListener('visibilitychange', this.handleVisibilityBound);
  }

  public resize(): void {
    const parent = this.canvas.parentElement;
    const w = parent ? parent.clientWidth : window.innerWidth;
    const h = parent ? parent.clientHeight : window.innerHeight;
    this.width = Math.max(320, w);
    this.height = Math.max(320, h);
    this.dpr = Math.min(window.devicePixelRatio || 1, 2);

    this.canvas.width = Math.floor(this.width * this.dpr);
    this.canvas.height = Math.floor(this.height * this.dpr);
    this.canvas.style.width = `${this.width}px`;
    this.canvas.style.height = `${this.height}px`;

    this.player.x = clamp(this.player.x, GAME_CONFIG.ARENA_PADDING, this.width - GAME_CONFIG.ARENA_PADDING);
    this.player.y = clamp(this.player.y, GAME_CONFIG.ARENA_PADDING, this.height - GAME_CONFIG.ARENA_PADDING);
  }

  public startLoop(): void {
    if (this.rafId !== null) return;
    this.lastTimestamp = performance.now();
    const tick = (now: number) => {
      const rawDt = (now - this.lastTimestamp) / 1000;
      this.lastTimestamp = now;
      const dt = Math.min(Math.max(rawDt, 0), GAME_CONFIG.MAX_DELTA_TIME);

      this.update(dt);
      this.render();

      this.rafId = requestAnimationFrame(tick);
    };
    this.rafId = requestAnimationFrame(tick);
  }

  // --- Public Control Actions (Called from UI or Keyboard) ---

  public startGame(): void {
    soundEngine.unlock();
    this.clearAllInputs();
    this.resetWorldState();
    this.gameState = 'PLAYING';
    this.beginWave(1);
    this.emitHudSnapshot();
  }

  public pauseGame(): void {
    if (this.gameState !== 'PLAYING') return;
    this.clearAllInputs();
    this.gameState = 'PAUSED';
    this.emitHudSnapshot();
  }

  public resumeGame(): void {
    if (this.gameState !== 'PAUSED') return;
    soundEngine.unlock();
    this.clearAllInputs();
    this.gameState = 'PLAYING';
    this.emitHudSnapshot();
  }

  public returnToTitle(): void {
    this.clearAllInputs();
    this.resetWorldState();
    this.gameState = 'TITLE_MENU';
    this.emitHudSnapshot();
  }

  public toggleMute(): void {
    soundEngine.unlock();
    soundEngine.toggleMute();
    this.emitHudSnapshot();
  }

  public triggerDash(): void {
    if (this.gameState !== 'PLAYING') return;
    this.queuedDash = true;
  }

  public triggerNova(): void {
    if (this.gameState !== 'PLAYING') return;
    this.queuedNova = true;
  }

  public setTouchInput(partial: Partial<TouchInputState>): void {
    Object.assign(this.touchState, partial);
  }

  // --- Input Handling ---

  private clearAllInputs(): void {
    this.keysHeld.clear();
    this.mouseDownLeft = false;
    this.queuedDash = false;
    this.queuedNova = false;
    this.touchState.moveX = 0;
    this.touchState.moveY = 0;
    this.touchState.aimX = 0;
    this.touchState.aimY = 0;
    this.touchState.firing = false;
  }

  private onKeyDown(e: KeyboardEvent): void {
    const code = e.code;
    if (
      code === 'Space' ||
      code === 'ArrowUp' ||
      code === 'ArrowDown' ||
      code === 'ArrowLeft' ||
      code === 'ArrowRight'
    ) {
      e.preventDefault();
    }

    if (e.repeat) return;

    if (code === 'KeyM') {
      this.toggleMute();
      return;
    }

    if (this.gameState === 'TITLE_MENU') {
      if (code === 'Enter' || code === 'Space') {
        this.startGame();
      }
      return;
    }

    if (this.gameState === 'GAME_OVER') {
      if (this.gameOverGuardTimer <= 0 && (code === 'Enter' || code === 'Space' || code === 'KeyR')) {
        this.startGame();
      }
      return;
    }

    if (this.gameState === 'PAUSED') {
      if (code === 'Escape' || code === 'KeyP') {
        this.resumeGame();
      } else if (code === 'KeyR') {
        this.startGame();
      }
      return;
    }

    // PLAYING state
    if (code === 'Escape' || code === 'KeyP') {
      this.pauseGame();
      return;
    }

    this.keysHeld.add(code);

    if (code === 'ShiftLeft' || code === 'ShiftRight') {
      this.queuedDash = true;
    }
    if (code === 'KeyE' || code === 'KeyQ') {
      this.queuedNova = true;
    }
  }

  private onKeyUp(e: KeyboardEvent): void {
    this.keysHeld.delete(e.code);
  }

  private onMouseMove(e: MouseEvent): void {
    const rect = this.canvas.getBoundingClientRect();
    this.mouseX = e.clientX - rect.left;
    this.mouseY = e.clientY - rect.top;
    this.mouseMoved = true;
  }

  private onMouseDown(e: MouseEvent): void {
    if (this.gameState !== 'PLAYING') return;
    // Ignore clicks on interactive HUD buttons
    if ((e.target as HTMLElement)?.closest('button')) return;

    soundEngine.unlock();
    const rect = this.canvas.getBoundingClientRect();
    this.mouseX = e.clientX - rect.left;
    this.mouseY = e.clientY - rect.top;
    this.mouseMoved = true;

    if (e.button === 0) {
      this.mouseDownLeft = true;
    } else if (e.button === 2) {
      this.queuedDash = true;
    } else if (e.button === 1) {
      e.preventDefault();
      this.queuedNova = true;
    }
  }

  private onMouseUp(e: MouseEvent): void {
    if (e.button === 0) {
      this.mouseDownLeft = false;
    }
  }

  // --- Reset & Wave Management ---

  private resetWorldState(): void {
    this.score = 0;
    this.isNewHighScore = false;
    this.kills = 0;
    this.wave = 1;
    this.wavesCleared = 0;
    this.multiplier = 1;
    this.multiplierTimer = 0;
    this.novaCharge = 0;

    this.hitstopTimer = 0;
    this.shakeIntensity = 0;
    this.damageVignette = 0;
    this.gameOverGuardTimer = 0;

    this.player = this.createInitialPlayer();
    this.enemies = [];
    this.waveSpawnQueue = [];
    this.waveSpawnTimer = 0;
    this.waveBreatherTimer = 0;
    this.waveBannerText = null;
    this.waveBannerTimer = 0;

    for (const p of this.projectiles) p.active = false;
    for (const pk of this.pickups) pk.active = false;
    for (const pt of this.particles) pt.active = false;
    for (const sw of this.shockwaves) sw.active = false;
    for (const ft of this.floatingTexts) ft.active = false;
    for (const af of this.afterimages) af.active = false;
  }

  private beginWave(waveNum: number): void {
    this.wave = waveNum;
    this.waveSpawnQueue = this.buildWaveQueue(waveNum);
    this.waveSpawnTimer = 0.25;
    this.waveBannerText = waveNum % 5 === 0 ? `SECTOR BOSS · WAVE ${waveNum}` : `WAVE ${waveNum}`;
    this.waveBannerTimer = 1.75;

    this.spawnShockwave(this.width * 0.5, this.height * 0.5, 220, 'rgba(245, 158, 11, 0.35)', 1.5, 0.65);
  }

  private buildWaveQueue(waveNum: number): EnemyKind[] {
    const queue: EnemyKind[] = [];
    const totalCount = GAME_CONFIG.WAVES.BASE_ENEMIES + (waveNum - 1) * GAME_CONFIG.WAVES.ENEMIES_PER_WAVE;

    if (waveNum % 5 === 0) {
      queue.push('dreadnought');
    }

    for (let i = 0; i < totalCount; i++) {
      const r = Math.random();
      if (waveNum === 1) {
        queue.push('scout');
      } else if (waveNum === 2) {
        queue.push(r < 0.7 ? 'scout' : 'charger');
      } else if (waveNum === 3) {
        if (r < 0.5) queue.push('scout');
        else if (r < 0.8) queue.push('charger');
        else queue.push('orbiter');
      } else {
        if (r < 0.36) queue.push('scout');
        else if (r < 0.64) queue.push('charger');
        else if (r < 0.86) queue.push('orbiter');
        else queue.push('carrier');
      }
    }

    return queue;
  }

  // --- Main Simulation Update ---

  private update(dt: number): void {
    this.clockTime += dt;

    // Gentle ambient idle animation on the Title Screen
    if (this.gameState === 'TITLE_MENU') {
      this.updateTitleAmbient(dt);
      return;
    }

    if (this.gameState === 'PAUSED') {
      return;
    }

    if (this.gameState === 'GAME_OVER') {
      this.gameOverGuardTimer = Math.max(0, this.gameOverGuardTimer - dt);
      this.updateJuice(dt);
      this.updateParticles(dt);
      this.updateShockwaves(dt);
      this.updateFloatingTexts(dt);
      return;
    }

    // PLAYING state
    this.updateJuice(dt);

    // Hitstop freezes entity simulation briefly for crisp impact weight
    if (this.hitstopTimer > 0) {
      this.hitstopTimer -= dt;
      return;
    }

    this.updatePlayer(dt);
    this.updateWaveSpawner(dt);
    this.updateEnemies(dt);
    this.updateProjectiles(dt);
    this.updatePickups(dt);
    this.updateParticles(dt);
    this.updateShockwaves(dt);
    this.updateFloatingTexts(dt);
    this.updateAfterimages(dt);

    // Multiplier decay
    if (this.multiplier > 1) {
      this.multiplierTimer -= dt;
      if (this.multiplierTimer <= 0) {
        this.multiplier = Math.max(1, this.multiplier - 1);
        this.multiplierTimer = this.multiplier > 1 ? GAME_CONFIG.MULTIPLIER.DECAY_SECONDS * 0.6 : 0;
      }
    }

    // Wave banner timer
    if (this.waveBannerTimer > 0) {
      this.waveBannerTimer -= dt;
      if (this.waveBannerTimer <= 0) {
        this.waveBannerText = null;
      }
    }

    // Throttled HUD sync (~20Hz + immediate on key events)
    this.hudSyncAccum += dt;
    if (this.hudSyncAccum >= 0.05) {
      this.hudSyncAccum = 0;
      this.emitHudSnapshot();
    }
  }

  private updateTitleAmbient(dt: number): void {
    const cx = this.width * 0.5;
    const cy = this.height * 0.5;
    const orbitR = Math.min(this.width, this.height) * 0.24;
    const theta = this.clockTime * 0.55;

    this.player.prevX = this.player.x;
    this.player.prevY = this.player.y;
    this.player.x = cx + Math.cos(theta) * orbitR;
    this.player.y = cy + Math.sin(theta * 1.3) * orbitR * 0.65;
    this.player.angle = Math.atan2(this.player.y - this.player.prevY, this.player.x - this.player.prevX);

    this.player.thrusterAccum += dt;
    if (this.player.thrusterAccum >= 0.03) {
      this.player.thrusterAccum = 0;
      const backX = this.player.x - Math.cos(this.player.angle) * 14;
      const backY = this.player.y - Math.sin(this.player.angle) * 14;
      this.spawnParticle(
        backX,
        backY,
        -Math.cos(this.player.angle) * 60 + (Math.random() - 0.5) * 20,
        -Math.sin(this.player.angle) * 60 + (Math.random() - 0.5) * 20,
        2.5,
        0.38,
        'rgba(245, 158, 11, 0.75)',
        3,
        'circle',
      );
    }

    this.updateParticles(dt);
    this.updateShockwaves(dt);
  }

  private updateJuice(dt: number): void {
    if (this.shakeIntensity > 0) {
      this.shakeIntensity = Math.max(0, this.shakeIntensity - GAME_CONFIG.JUICE.SHAKE_DECAY * dt);
    }
    if (this.damageVignette > 0) {
      this.damageVignette = Math.max(0, this.damageVignette - 2.6 * dt);
    }
  }

  private updatePlayer(dt: number): void {
    const p = this.player;
    p.prevX = p.x;
    p.prevY = p.y;

    p.invulnTimer = Math.max(0, p.invulnTimer - dt);
    p.hitFlashTimer = Math.max(0, p.hitFlashTimer - dt);
    p.fireCooldown = Math.max(0, p.fireCooldown - dt);
    p.rapidTimer = Math.max(0, p.rapidTimer - dt);
    p.dashCooldown = Math.max(0, p.dashCooldown - dt);

    // Recover squash & stretch smoothly
    p.squashX += (1 - p.squashX) * Math.min(1, 14 * dt);
    p.squashY += (1 - p.squashY) * Math.min(1, 14 * dt);

    // Movement input vector
    let ix = this.touchState.moveX;
    let iy = this.touchState.moveY;
    if (this.keysHeld.has('KeyA') || this.keysHeld.has('ArrowLeft')) ix -= 1;
    if (this.keysHeld.has('KeyD') || this.keysHeld.has('ArrowRight')) ix += 1;
    if (this.keysHeld.has('KeyW') || this.keysHeld.has('ArrowUp')) iy -= 1;
    if (this.keysHeld.has('KeyS') || this.keysHeld.has('ArrowDown')) iy += 1;

    const inputLen = Math.hypot(ix, iy);
    if (inputLen > 1) {
      ix /= inputLen;
      iy /= inputLen;
    }

    // Aiming: touch aim stick -> mouse cursor -> movement direction
    if (Math.hypot(this.touchState.aimX, this.touchState.aimY) > 0.15) {
      p.angle = Math.atan2(this.touchState.aimY, this.touchState.aimX);
    } else if (this.mouseMoved) {
      p.angle = Math.atan2(this.mouseY - p.y, this.mouseX - p.x);
    } else if (inputLen > 0.1) {
      p.angle = Math.atan2(iy, ix);
    }

    // Handle Nova Pulse edge trigger
    if (this.queuedNova) {
      this.queuedNova = false;
      if (this.novaCharge >= GAME_CONFIG.PLAYER.NOVA_MAX_CHARGE) {
        this.activateNovaPulse();
      }
    }

    // Handle Phase Dash edge trigger
    if (this.queuedDash) {
      this.queuedDash = false;
      if (p.dashCooldown <= 0 && p.dashTimer <= 0) {
        const dirLen = inputLen > 0.1 ? inputLen : 1;
        p.dashDirX = inputLen > 0.1 ? ix / dirLen : Math.cos(p.angle);
        p.dashDirY = inputLen > 0.1 ? iy / dirLen : Math.sin(p.angle);
        p.dashTimer = GAME_CONFIG.PLAYER.DASH_DURATION;
        p.dashCooldown = GAME_CONFIG.PLAYER.DASH_COOLDOWN;
        p.invulnTimer = Math.max(p.invulnTimer, GAME_CONFIG.PLAYER.DASH_DURATION + 0.08);
        p.squashX = 1.45;
        p.squashY = 0.68;
        this.addShake(4);
        soundEngine.playDash();
        this.spawnShockwave(p.x, p.y, 64, GAME_CONFIG.COLORS.playerDash, 2.5, 0.25);
        this.burstParticles(p.x, p.y, 12, GAME_CONFIG.COLORS.playerDash, 210, 'spark');
      }
    }

    // Velocity & Position integration
    if (p.dashTimer > 0) {
      p.dashTimer -= dt;
      p.vx = p.dashDirX * GAME_CONFIG.PLAYER.DASH_SPEED;
      p.vy = p.dashDirY * GAME_CONFIG.PLAYER.DASH_SPEED;

      p.thrusterAccum += dt;
      if (p.thrusterAccum >= 0.025) {
        p.thrusterAccum = 0;
        this.spawnAfterimage(p.x, p.y, p.angle, GAME_CONFIG.COLORS.playerDash);
      }
    } else {
      if (inputLen > 0.05) {
        p.vx += ix * GAME_CONFIG.PLAYER.ACCEL * dt;
        p.vy += iy * GAME_CONFIG.PLAYER.ACCEL * dt;
      }
      const damp = Math.exp(-GAME_CONFIG.PLAYER.FRICTION * dt);
      p.vx *= damp;
      p.vy *= damp;

      const speed = Math.hypot(p.vx, p.vy);
      if (speed > GAME_CONFIG.PLAYER.MAX_SPEED) {
        const s = GAME_CONFIG.PLAYER.MAX_SPEED / speed;
        p.vx *= s;
        p.vy *= s;
      }

      if (speed > 45) {
        p.thrusterAccum += dt;
        if (p.thrusterAccum >= 0.032) {
          this.player.thrusterAccum = 0;
          const backX = p.x - Math.cos(p.angle) * 14;
          const backY = p.y - Math.sin(p.angle) * 14;
          this.spawnParticle(
            backX,
            backY,
            -p.vx * 0.22 + (Math.random() - 0.5) * 35,
            -p.vy * 0.22 + (Math.random() - 0.5) * 35,
            2.6,
            0.24,
            p.rapidTimer > 0 ? GAME_CONFIG.COLORS.pickupRapid : GAME_CONFIG.COLORS.playerAccent,
            5,
            'circle',
          );
        }
      }
    }

    p.x += p.vx * dt;
    p.y += p.vy * dt;

    // Keep player inside arena bounds cleanly
    const pad = GAME_CONFIG.ARENA_PADDING;
    if (p.x < pad) {
      p.x = pad;
      p.vx = Math.max(0, p.vx);
    } else if (p.x > this.width - pad) {
      p.x = this.width - pad;
      p.vx = Math.min(0, p.vx);
    }
    if (p.y < pad) {
      p.y = pad;
      p.vy = Math.max(0, p.vy);
    } else if (p.y > this.height - pad) {
      p.y = this.height - pad;
      p.vy = Math.min(0, p.vy);
    }

    // Firing
    const wantsFire =
      this.mouseDownLeft ||
      this.keysHeld.has('Space') ||
      this.touchState.firing;

    if (wantsFire && p.fireCooldown <= 0) {
      this.firePlayerWeapon();
    }
  }

  private firePlayerWeapon(): void {
    const p = this.player;
    const isRapid = p.rapidTimer > 0;
    p.fireCooldown = isRapid ? GAME_CONFIG.PLAYER.RAPID_FIRE_INTERVAL : GAME_CONFIG.PLAYER.FIRE_INTERVAL;

    const cos = Math.cos(p.angle);
    const sin = Math.sin(p.angle);
    const muzzleDist = 18;

    if (isRapid) {
      // Twin-linked rapid plasma bolts
      const perpX = -sin * 6;
      const perpY = cos * 6;
      const spread = (Math.random() - 0.5) * 0.05;
      this.spawnProjectile(
        true,
        p.x + cos * muzzleDist + perpX,
        p.y + sin * muzzleDist + perpY,
        Math.cos(p.angle + spread) * GAME_CONFIG.PLAYER.BULLET_SPEED,
        Math.sin(p.angle + spread) * GAME_CONFIG.PLAYER.BULLET_SPEED,
        GAME_CONFIG.PLAYER.BULLET_RADIUS,
        1,
        GAME_CONFIG.PLAYER.BULLET_LIFE,
        GAME_CONFIG.COLORS.pickupRapid,
      );
      this.spawnProjectile(
        true,
        p.x + cos * muzzleDist - perpX,
        p.y + sin * muzzleDist - perpY,
        Math.cos(p.angle - spread) * GAME_CONFIG.PLAYER.BULLET_SPEED,
        Math.sin(p.angle - spread) * GAME_CONFIG.PLAYER.BULLET_SPEED,
        GAME_CONFIG.PLAYER.BULLET_RADIUS,
        1,
        GAME_CONFIG.PLAYER.BULLET_LIFE,
        GAME_CONFIG.COLORS.pickupRapid,
      );
    } else {
      const jitter = (Math.random() - 0.5) * 0.035;
      const a = p.angle + jitter;
      this.spawnProjectile(
        true,
        p.x + cos * muzzleDist,
        p.y + sin * muzzleDist,
        Math.cos(a) * GAME_CONFIG.PLAYER.BULLET_SPEED,
        Math.sin(a) * GAME_CONFIG.PLAYER.BULLET_SPEED,
        GAME_CONFIG.PLAYER.BULLET_RADIUS,
        1,
        GAME_CONFIG.PLAYER.BULLET_LIFE,
        GAME_CONFIG.COLORS.playerBolt,
      );
    }

    // Subtle recoil squash
    p.squashX = 0.88;
    p.squashY = 1.12;
    soundEngine.playShoot(isRapid);
  }

  private activateNovaPulse(): void {
    const p = this.player;
    this.novaCharge = 0;
    p.invulnTimer = Math.max(p.invulnTimer, 0.75);
    this.addShake(11);
    this.hitstopTimer = 0.045;
    soundEngine.playNova();

    this.spawnShockwave(p.x, p.y, GAME_CONFIG.PLAYER.NOVA_RADIUS, '#FDE68A', 5, 0.48);
    this.spawnShockwave(p.x, p.y, GAME_CONFIG.PLAYER.NOVA_RADIUS * 0.65, '#F59E0B', 3, 0.36);
    this.burstParticles(p.x, p.y, 34, '#FBBF24', 360, 'diamond');
    this.spawnFloatingText(p.x, p.y - 26, 'NOVA PULSE', '#FDE68A', 1.25);

    const rSq = GAME_CONFIG.PLAYER.NOVA_RADIUS * GAME_CONFIG.PLAYER.NOVA_RADIUS;

    // Vaporize nearby enemy projectiles
    for (const proj of this.projectiles) {
      if (!proj.active || proj.fromPlayer) continue;
      const dx = proj.x - p.x;
      const dy = proj.y - p.y;
      if (dx * dx + dy * dy <= rSq) {
        proj.active = false;
        this.burstParticles(proj.x, proj.y, 3, proj.color, 90, 'circle');
      }
    }

    // Heavy damage + knockback to nearby enemies
    for (let i = this.enemies.length - 1; i >= 0; i--) {
      const e = this.enemies[i];
      const dx = e.x - p.x;
      const dy = e.y - p.y;
      const distSq = dx * dx + dy * dy;
      if (distSq <= rSq) {
        const dist = Math.max(1, Math.sqrt(distSq));
        e.vx += (dx / dist) * 420;
        e.vy += (dy / dist) * 420;
        this.damageEnemy(e, 7, i);
      }
    }

    this.emitHudSnapshot();
  }

  // --- Wave Spawner & Anti-Overlap Safe Spawning ---

  private updateWaveSpawner(dt: number): void {
    if (this.waveBreatherTimer > 0) {
      this.waveBreatherTimer -= dt;
      if (this.waveBreatherTimer <= 0) {
        this.beginWave(this.wave + 1);
      }
      return;
    }

    if (this.waveSpawnQueue.length > 0) {
      if (this.enemies.length < GAME_CONFIG.WAVES.MAX_CONCURRENT_CAP) {
        this.waveSpawnTimer -= dt;
        if (this.waveSpawnTimer <= 0) {
          const kind = this.waveSpawnQueue.shift()!;
          this.spawnEnemySafe(kind);
          const interval = Math.max(
            GAME_CONFIG.WAVES.SPAWN_INTERVAL_MIN,
            GAME_CONFIG.WAVES.SPAWN_INTERVAL_BASE - (this.wave - 1) * 0.04,
          );
          this.waveSpawnTimer = interval;
        }
      }
    } else if (this.enemies.length === 0) {
      // Wave cleared!
      this.wavesCleared += 1;
      const bonus = 150 * this.wave;
      this.score += bonus;
      this.checkHighScore();
      this.waveBreatherTimer = GAME_CONFIG.WAVES.BREATHER_DURATION;
      this.waveBannerText = `WAVE ${this.wave} CLEARED  +${bonus}`;
      this.waveBannerTimer = 1.6;
      soundEngine.playWaveClear();
      this.spawnFloatingText(this.player.x, this.player.y - 34, `WAVE CLEAR +${bonus}`, '#10B981', 1.2);
      this.emitHudSnapshot();
    }
  }

  private findSafeSpawnPosition(): { x: number; y: number } {
    const pad = 26;
    const minPlayerDistSq =
      GAME_CONFIG.WAVES.MIN_PLAYER_SPAWN_CLEARANCE * GAME_CONFIG.WAVES.MIN_PLAYER_SPAWN_CLEARANCE;
    const minEnemyDistSq =
      GAME_CONFIG.WAVES.MIN_ENEMY_SPAWN_CLEARANCE * GAME_CONFIG.WAVES.MIN_ENEMY_SPAWN_CLEARANCE;

    let bestX = pad;
    let bestY = pad;
    let bestScore = -1;

    for (let attempt = 0; attempt < 18; attempt++) {
      const edge = (attempt + Math.floor(Math.random() * 4)) % 4;
      let cx = 0;
      let cy = 0;
      if (edge === 0) {
        cx = pad + Math.random() * (this.width - pad * 2);
        cy = -22;
      } else if (edge === 1) {
        cx = this.width + 22;
        cy = pad + Math.random() * (this.height - pad * 2);
      } else if (edge === 2) {
        cx = pad + Math.random() * (this.width - pad * 2);
        cy = this.height + 22;
      } else {
        cx = -22;
        cy = pad + Math.random() * (this.height - pad * 2);
      }

      const pdx = cx - this.player.x;
      const pdy = cy - this.player.y;
      const pDistSq = pdx * pdx + pdy * pdy;
      if (pDistSq < minPlayerDistSq) continue;

      let overlapsEnemy = false;
      let nearestEnemySq = Infinity;
      for (const e of this.enemies) {
        const edx = cx - e.x;
        const edy = cy - e.y;
        const dSq = edx * edx + edy * edy;
        if (dSq < nearestEnemySq) nearestEnemySq = dSq;
        if (dSq < minEnemyDistSq) {
          overlapsEnemy = true;
          break;
        }
      }

      if (!overlapsEnemy) {
        return { x: cx, y: cy };
      }

      if (nearestEnemySq > bestScore) {
        bestScore = nearestEnemySq;
        bestX = cx;
        bestY = cy;
      }
    }

    return { x: bestX, y: bestY };
  }

  private spawnEnemySafe(kind: EnemyKind, overridePos?: { x: number; y: number }): void {
    const pos = overridePos ?? this.findSafeSpawnPosition();
    const spec = GAME_CONFIG.ENEMIES[kind];
    const speedScale = Math.min(
      GAME_CONFIG.WAVES.MAX_SPEED_MULTIPLIER,
      1 + (this.wave - 1) * GAME_CONFIG.WAVES.SPEED_SCALE_PER_WAVE,
    );

    const hpScale = kind === 'dreadnought' ? 1 + Math.floor((this.wave - 5) / 5) * 0.45 : 1 + Math.floor((this.wave - 1) / 4) * 0.2;

    const enemy: Enemy = {
      id: this.nextEnemyId++,
      kind,
      x: pos.x,
      y: pos.y,
      prevX: pos.x,
      prevY: pos.y,
      vx: 0,
      vy: 0,
      angle: Math.atan2(this.player.y - pos.y, this.player.x - pos.x),
      radius: spec.radius,
      hp: Math.round(spec.hp * hpScale),
      maxHp: Math.round(spec.hp * hpScale),
      speed: spec.speed * speedScale,
      scoreValue: spec.score,
      hitFlashTimer: 0,
      squash: 1,
      aiState: 'approach',
      stateTimer: kind === 'orbiter' ? 1.0 + Math.random() * 1.1 : 0.6 + Math.random() * 0.8,
      aimAngle: 0,
      orbitDir: Math.random() < 0.5 ? -1 : 1,
      pulsePhase: Math.random() * Math.PI * 2,
    };

    this.enemies.push(enemy);
  }

  // --- Enemy AI & Combat ---

  private updateEnemies(dt: number): void {
    const p = this.player;

    for (let i = this.enemies.length - 1; i >= 0; i--) {
      const e = this.enemies[i];
      e.prevX = e.x;
      e.prevY = e.y;
      e.hitFlashTimer = Math.max(0, e.hitFlashTimer - dt);
      e.squash += (1 - e.squash) * Math.min(1, 12 * dt);
      e.pulsePhase += dt * 4.5;

      const dx = p.x - e.x;
      const dy = p.y - e.y;
      const dist = Math.max(1, Math.hypot(dx, dy));
      const toPlayerAngle = Math.atan2(dy, dx);

      if (e.kind === 'scout') {
        const perpX = -dy / dist;
        const perpY = dx / dist;
        const weave = Math.sin(e.pulsePhase * 0.9) * 0.45 * e.orbitDir;
        const desiredVx = ((dx / dist) + perpX * weave) * e.speed;
        const desiredVy = ((dy / dist) + perpY * weave) * e.speed;
        e.vx += (desiredVx - e.vx) * Math.min(1, 6 * dt);
        e.vy += (desiredVy - e.vy) * Math.min(1, 6 * dt);
        e.angle = Math.atan2(e.vy, e.vx);
      } else if (e.kind === 'charger') {
        const cfg = GAME_CONFIG.ENEMIES.charger;
        if (e.aiState === 'approach') {
          e.vx += ((dx / dist) * e.speed - e.vx) * Math.min(1, 5 * dt);
          e.vy += ((dy / dist) * e.speed - e.vy) * Math.min(1, 5 * dt);
          e.angle = toPlayerAngle;
          e.stateTimer -= dt;
          if (e.stateTimer <= 0 && dist < 440 && this.isInsideArena(e.x, e.y, 10)) {
            e.aiState = 'telegraph';
            e.stateTimer = cfg.telegraphTime;
            e.aimAngle = toPlayerAngle;
            soundEngine.playTelegraph();
          }
        } else if (e.aiState === 'telegraph') {
          e.vx *= Math.exp(-10 * dt);
          e.vy *= Math.exp(-10 * dt);
          // Slight tracking early in telegraph, locks cleanly for final 0.35s
          if (e.stateTimer > 0.35) {
            e.aimAngle = toPlayerAngle;
          }
          e.angle = e.aimAngle;
          e.stateTimer -= dt;
          if (e.stateTimer <= 0) {
            e.aiState = 'attack';
            e.stateTimer = cfg.chargeTime;
            e.vx = Math.cos(e.aimAngle) * cfg.chargeSpeed;
            e.vy = Math.sin(e.aimAngle) * cfg.chargeSpeed;
            e.squash = 1.35;
          }
        } else if (e.aiState === 'attack') {
          e.stateTimer -= dt;
          if (e.stateTimer <= 0) {
            e.aiState = 'cooldown';
            e.stateTimer = cfg.cooldownTime;
          }
        } else {
          e.vx *= Math.exp(-6 * dt);
          e.vy *= Math.exp(-6 * dt);
          e.stateTimer -= dt;
          if (e.stateTimer <= 0) {
            e.aiState = 'approach';
            e.stateTimer = 0.8 + Math.random() * 0.7;
          }
        }
      } else if (e.kind === 'orbiter') {
        const cfg = GAME_CONFIG.ENEMIES.orbiter;
        const radialFactor = dist > cfg.preferredDist + 35 ? 1 : dist < cfg.preferredDist - 35 ? -0.8 : 0;
        const perpX = (-dy / dist) * e.orbitDir;
        const perpY = (dx / dist) * e.orbitDir;
        const desiredVx = ((dx / dist) * radialFactor + perpX * 0.85) * e.speed;
        const desiredVy = ((dy / dist) * radialFactor + perpY * 0.85) * e.speed;
        e.vx += (desiredVx - e.vx) * Math.min(1, 4.5 * dt);
        e.vy += (desiredVy - e.vy) * Math.min(1, 4.5 * dt);
        e.angle = toPlayerAngle;

        if (e.aiState === 'approach') {
          e.stateTimer -= dt;
          if (e.stateTimer <= 0 && this.isInsideArena(e.x, e.y, 12)) {
            e.aiState = 'telegraph';
            e.stateTimer = cfg.telegraphTime;
            e.aimAngle = toPlayerAngle;
          }
        } else if (e.aiState === 'telegraph') {
          e.aimAngle = toPlayerAngle;
          e.stateTimer -= dt;
          if (e.stateTimer <= 0) {
            // Fire 3-bolt spread
            for (const offset of [-0.24, 0, 0.24]) {
              const a = e.aimAngle + offset;
              this.spawnProjectile(
                false,
                e.x + Math.cos(a) * (e.radius + 4),
                e.y + Math.sin(a) * (e.radius + 4),
                Math.cos(a) * cfg.boltSpeed,
                Math.sin(a) * cfg.boltSpeed,
                5,
                1,
                3.4,
                GAME_CONFIG.COLORS.enemyBolt,
              );
            }
            e.squash = 1.25;
            e.aiState = 'approach';
            e.stateTimer = cfg.fireCooldown;
          }
        }
      } else if (e.kind === 'carrier') {
        e.vx += ((dx / dist) * e.speed - e.vx) * Math.min(1, 3.5 * dt);
        e.vy += ((dy / dist) * e.speed - e.vy) * Math.min(1, 3.5 * dt);
        e.angle += dt * 1.4;
      } else if (e.kind === 'dreadnought') {
        const cfg = GAME_CONFIG.ENEMIES.dreadnought;
        const targetDist = 220;
        const radial = dist > targetDist ? 1 : -0.35;
        const perpX = (-dy / dist) * 0.65;
        const perpY = (dx / dist) * 0.65;
        e.vx += (((dx / dist) * radial + perpX) * e.speed - e.vx) * Math.min(1, 2.5 * dt);
        e.vy += (((dy / dist) * radial + perpY) * e.speed - e.vy) * Math.min(1, 2.5 * dt);
        e.angle += dt * 0.9;

        if (e.aiState === 'approach') {
          e.stateTimer -= dt;
          if (e.stateTimer <= 0 && this.isInsideArena(e.x, e.y, 16)) {
            e.aiState = 'telegraph';
            e.stateTimer = cfg.telegraphTime;
            e.aimAngle = toPlayerAngle;
            soundEngine.playTelegraph();
          }
        } else if (e.aiState === 'telegraph') {
          e.aimAngle = toPlayerAngle;
          e.stateTimer -= dt;
          if (e.stateTimer <= 0) {
            // Radial 8-way volley + aimed burst
            for (let k = 0; k < 8; k++) {
              const a = e.aimAngle + (k * Math.PI * 2) / 8;
              this.spawnProjectile(
                false,
                e.x + Math.cos(a) * e.radius,
                e.y + Math.sin(a) * e.radius,
                Math.cos(a) * cfg.boltSpeed,
                Math.sin(a) * cfg.boltSpeed,
                6,
                1,
                3.8,
                GAME_CONFIG.COLORS.enemyDreadnought,
              );
            }
            e.squash = 1.18;
            e.aiState = 'approach';
            e.stateTimer = cfg.fireCooldown;
          }
        }
      }

      e.x += e.vx * dt;
      e.y += e.vy * dt;

      // Soft separation between enemies so swarms read crisply instead of stacking
      for (let j = i - 1; j >= 0; j--) {
        const other = this.enemies[j];
        const sdx = e.x - other.x;
        const sdy = e.y - other.y;
        const minD = e.radius + other.radius + 4;
        const dSq = sdx * sdx + sdy * sdy;
        if (dSq > 0 && dSq < minD * minD) {
          const d = Math.sqrt(dSq);
          const push = (minD - d) * 0.5;
          const nx = sdx / d;
          const ny = sdy / d;
          e.x += nx * push;
          e.y += ny * push;
          other.x -= nx * push;
          other.y -= ny * push;
        }
      }

      // Check swept collision with player (dashing player bounces off or damages small scouts)
      const hitRadius = e.radius + p.radius - 2;
      if (segmentIntersectsCircle(p.prevX, p.prevY, p.x, p.y, e.x, e.y, hitRadius)) {
        if (p.dashTimer > 0) {
          // Dash-slam deals 2 damage and knocks enemy back!
          const kDist = Math.max(1, Math.hypot(e.x - p.x, e.y - p.y));
          e.vx += ((e.x - p.x) / kDist) * 340;
          e.vy += ((e.y - p.y) / kDist) * 340;
          this.damageEnemy(e, 2, i);
        } else {
          this.damagePlayer(1, e.x, e.y);
          // Bounce enemy away slightly
          const kDist = Math.max(1, Math.hypot(e.x - p.x, e.y - p.y));
          e.vx += ((e.x - p.x) / kDist) * 260;
          e.vy += ((e.y - p.y) / kDist) * 260;
        }
      }
    }
  }

  private isInsideArena(x: number, y: number, margin: number): boolean {
    return x >= margin && x <= this.width - margin && y >= margin && y <= this.height - margin;
  }

  private damageEnemy(enemy: Enemy, amount: number, indexInList: number): void {
    enemy.hp -= amount;
    enemy.hitFlashTimer = 0.075;
    enemy.squash = 1.24;

    if (enemy.hp <= 0) {
      // Killed!
      this.enemies.splice(indexInList, 1);
      this.kills += 1;
      const earned = enemy.scoreValue * this.multiplier;
      this.score += earned;
      this.checkHighScore();

      this.multiplierTimer = GAME_CONFIG.MULTIPLIER.DECAY_SECONDS;
      this.novaCharge = Math.min(
        GAME_CONFIG.PLAYER.NOVA_MAX_CHARGE,
        this.novaCharge + GAME_CONFIG.PLAYER.NOVA_CHARGE_PER_KILL,
      );

      const isHeavy = enemy.kind === 'carrier' || enemy.kind === 'dreadnought' || enemy.kind === 'charger';
      const isBoss = enemy.kind === 'dreadnought';
      const color = this.getEnemyColor(enemy.kind);

      this.hitstopTimer = isBoss
        ? GAME_CONFIG.JUICE.HITSTOP_BOSS_KILL
        : isHeavy
          ? GAME_CONFIG.JUICE.HITSTOP_HEAVY_KILL
          : 0;
      this.addShake(isBoss ? 14 : isHeavy ? 6.5 : 3);

      soundEngine.playExplosion(isHeavy);
      this.burstParticles(enemy.x, enemy.y, isBoss ? 42 : isHeavy ? 20 : 12, color, isBoss ? 340 : 230, 'diamond');
      this.spawnShockwave(enemy.x, enemy.y, isBoss ? 160 : enemy.radius * 2.6, color, isBoss ? 4 : 2, isBoss ? 0.45 : 0.28);
      this.spawnFloatingText(enemy.x, enemy.y - 10, `+${earned}`, color, isBoss ? 1.35 : 1);

      // Carrier splits into 2 scouts and drops a special pickup
      if (enemy.kind === 'carrier') {
        this.spawnEnemySafe('scout', { x: enemy.x - 16, y: enemy.y - 10 });
        this.spawnEnemySafe('scout', { x: enemy.x + 16, y: enemy.y + 10 });
        this.spawnPickup(
          Math.random() < 0.55 ? 'repair' : 'rapid',
          enemy.x,
          enemy.y,
        );
      } else if (isBoss) {
        this.spawnPickup('repair', enemy.x - 18, enemy.y);
        this.spawnPickup('rapid', enemy.x + 18, enemy.y);
        for (let s = 0; s < 6; s++) {
          this.spawnPickup('shard', enemy.x + (Math.random() - 0.5) * 40, enemy.y + (Math.random() - 0.5) * 40);
        }
      } else {
        // Regular shard drops + small chance for rapid/repair
        const shardCount = enemy.kind === 'orbiter' || enemy.kind === 'charger' ? 2 : 1;
        for (let s = 0; s < shardCount; s++) {
          this.spawnPickup('shard', enemy.x, enemy.y);
        }
        const roll = Math.random();
        if (roll < 0.055 && this.player.hp < this.player.maxHp) {
          this.spawnPickup('repair', enemy.x, enemy.y);
        } else if (roll >= 0.055 && roll < 0.095) {
          this.spawnPickup('rapid', enemy.x, enemy.y);
        }
      }

      this.emitHudSnapshot();
    } else {
      soundEngine.playHitEnemy();
      this.burstParticles(enemy.x, enemy.y, 4, '#FFFFFF', 120, 'spark');
    }
  }

  private damagePlayer(amount: number, sourceX: number, sourceY: number): void {
    const p = this.player;
    if (p.invulnTimer > 0 || this.gameState !== 'PLAYING') return;

    p.invulnTimer = GAME_CONFIG.PLAYER.INVULN_DURATION;
    p.hitFlashTimer = 0.16;
    p.squashX = 0.72;
    p.squashY = 1.32;
    this.hitstopTimer = GAME_CONFIG.JUICE.HITSTOP_PLAYER_HIT;
    this.addShake(11);
    this.damageVignette = 1;
    soundEngine.playPlayerHit();

    // Knockback away from threat
    const dx = p.x - sourceX;
    const dy = p.y - sourceY;
    const dist = Math.max(1, Math.hypot(dx, dy));
    p.vx += (dx / dist) * 340;
    p.vy += (dy / dist) * 340;

    if (p.overshield > 0) {
      p.overshield -= 1;
      this.spawnShockwave(p.x, p.y, 85, GAME_CONFIG.COLORS.playerShield, 3, 0.32);
      this.spawnFloatingText(p.x, p.y - 22, 'SHIELD ABSORBED', GAME_CONFIG.COLORS.playerShield, 1.05);
    } else {
      p.hp = Math.max(0, p.hp - amount);
      // Reset combo multiplier on hull hit
      if (this.multiplier > 1) {
        this.multiplier = 1;
        this.multiplierTimer = 0;
      }
      this.spawnShockwave(p.x, p.y, 95, '#EF4444', 3, 0.34);
      this.burstParticles(p.x, p.y, 18, '#EF4444', 250, 'spark');
      this.spawnFloatingText(p.x, p.y - 22, 'HULL HIT!', '#EF4444', 1.15);
    }

    if (p.hp <= 0) {
      this.triggerGameOver();
    } else {
      this.emitHudSnapshot();
    }
  }

  private triggerGameOver(): void {
    this.gameState = 'GAME_OVER';
    this.gameOverGuardTimer = GAME_CONFIG.GAME_OVER_INPUT_GUARD;
    this.clearAllInputs();
    this.checkHighScore();
    this.addShake(18);
    this.burstParticles(this.player.x, this.player.y, 48, '#F59E0B', 360, 'diamond');
    this.spawnShockwave(this.player.x, this.player.y, 240, '#EF4444', 4.5, 0.65);
    soundEngine.playGameOver();
    this.emitHudSnapshot();
  }

  private checkHighScore(): void {
    if (this.score > this.highScore) {
      this.highScore = this.score;
      this.isNewHighScore = true;
      this.saveHighScore(this.highScore);
    }
  }

  // --- Projectiles & Pickups ---

  private updateProjectiles(dt: number): void {
    const p = this.player;

    for (const proj of this.projectiles) {
      if (!proj.active) continue;
      proj.prevX = proj.x;
      proj.prevY = proj.y;
      proj.x += proj.vx * dt;
      proj.y += proj.vy * dt;
      proj.life -= dt;

      if (
        proj.life <= 0 ||
        proj.x < -60 ||
        proj.x > this.width + 60 ||
        proj.y < -60 ||
        proj.y > this.height + 60
      ) {
        proj.active = false;
        continue;
      }

      if (proj.fromPlayer) {
        for (let i = this.enemies.length - 1; i >= 0; i--) {
          const e = this.enemies[i];
          if (segmentIntersectsCircle(proj.prevX, proj.prevY, proj.x, proj.y, e.x, e.y, e.radius + proj.radius)) {
            proj.active = false;
            this.burstParticles(proj.x, proj.y, 5, proj.color, 135, 'spark');
            this.damageEnemy(e, proj.damage, i);
            break;
          }
        }
      } else {
        if (segmentIntersectsCircle(proj.prevX, proj.prevY, proj.x, proj.y, p.x, p.y, p.radius + proj.radius - 2)) {
          proj.active = false;
          this.damagePlayer(proj.damage, proj.prevX, proj.prevY);
        }
      }
    }
  }

  private updatePickups(dt: number): void {
    const p = this.player;
    const magnetDist = 145;

    for (const pk of this.pickups) {
      if (!pk.active) continue;
      pk.life -= dt;
      pk.pulse += dt * 6;
      if (pk.life <= 0) {
        pk.active = false;
        continue;
      }

      pk.vx *= Math.exp(-5 * dt);
      pk.vy *= Math.exp(-5 * dt);

      const dx = p.x - pk.x;
      const dy = p.y - pk.y;
      const dist = Math.hypot(dx, dy);

      if (dist < magnetDist && dist > 0.1) {
        const pull = (1 - dist / magnetDist) * 920;
        pk.vx += (dx / dist) * pull * dt * 8;
        pk.vy += (dy / dist) * pull * dt * 8;
      }

      pk.x += pk.vx * dt;
      pk.y += pk.vy * dt;

      if (dist <= p.radius + pk.radius + 6) {
        pk.active = false;
        if (pk.kind === 'shard') {
          if (this.multiplier < GAME_CONFIG.MULTIPLIER.MAX) {
            this.multiplier += 1;
          }
          this.multiplierTimer = GAME_CONFIG.MULTIPLIER.DECAY_SECONDS;
          const pts = 50 * this.multiplier;
          this.score += pts;
          this.checkHighScore();
          this.novaCharge = Math.min(
            GAME_CONFIG.PLAYER.NOVA_MAX_CHARGE,
            this.novaCharge + GAME_CONFIG.PLAYER.NOVA_CHARGE_PER_SHARD,
          );
          soundEngine.playPickup(this.multiplier, false);
          this.burstParticles(pk.x, pk.y, 6, GAME_CONFIG.COLORS.pickupShard, 130, 'diamond');
          this.spawnFloatingText(pk.x, pk.y - 8, `+${pts}  x${this.multiplier}`, '#FDE68A', 0.9);
        } else if (pk.kind === 'repair') {
          if (p.hp < p.maxHp) {
            p.hp += 1;
            this.spawnFloatingText(pk.x, pk.y - 12, 'HULL +1', GAME_CONFIG.COLORS.pickupRepair, 1.15);
          } else {
            p.overshield = Math.min(2, p.overshield + 1);
            this.spawnFloatingText(pk.x, pk.y - 12, 'AEGIS SHIELD', GAME_CONFIG.COLORS.pickupRepair, 1.15);
          }
          soundEngine.playPickup(this.multiplier, true);
          this.spawnShockwave(pk.x, pk.y, 65, GAME_CONFIG.COLORS.pickupRepair, 2, 0.3);
          this.burstParticles(pk.x, pk.y, 12, GAME_CONFIG.COLORS.pickupRepair, 170, 'diamond');
        } else if (pk.kind === 'rapid') {
          p.rapidTimer = GAME_CONFIG.PLAYER.RAPID_DURATION;
          soundEngine.playPickup(this.multiplier, true);
          this.spawnShockwave(pk.x, pk.y, 70, GAME_CONFIG.COLORS.pickupRapid, 2, 0.3);
          this.burstParticles(pk.x, pk.y, 12, GAME_CONFIG.COLORS.pickupRapid, 170, 'spark');
          this.spawnFloatingText(pk.x, pk.y - 12, 'TWIN OVERCLOCK', GAME_CONFIG.COLORS.pickupRapid, 1.15);
        }
        this.emitHudSnapshot();
      }
    }
  }

  // --- Pool Spawners & Updates ---

  private spawnProjectile(
    fromPlayer: boolean,
    x: number,
    y: number,
    vx: number,
    vy: number,
    radius: number,
    damage: number,
    life: number,
    color: string,
  ): void {
    for (const slot of this.projectiles) {
      if (!slot.active) {
        slot.active = true;
        slot.fromPlayer = fromPlayer;
        slot.x = x;
        slot.y = y;
        slot.prevX = x;
        slot.prevY = y;
        slot.vx = vx;
        slot.vy = vy;
        slot.radius = radius;
        slot.damage = damage;
        slot.life = life;
        slot.maxLife = life;
        slot.color = color;
        slot.pierce = 0;
        return;
      }
    }
  }

  private spawnPickup(kind: PickupKind, x: number, y: number): void {
    for (const slot of this.pickups) {
      if (!slot.active) {
        const angle = Math.random() * Math.PI * 2;
        const speed = 60 + Math.random() * 80;
        slot.active = true;
        slot.kind = kind;
        slot.x = clamp(x, 30, this.width - 30);
        slot.y = clamp(y, 30, this.height - 30);
        slot.vx = Math.cos(angle) * speed;
        slot.vy = Math.sin(angle) * speed;
        slot.radius = kind === 'shard' ? 7.5 : 10.5;
        slot.life = kind === 'shard' ? 8.5 : 12;
        slot.maxLife = slot.life;
        slot.value = 1;
        slot.pulse = Math.random() * Math.PI * 2;
        return;
      }
    }
  }

  private spawnParticle(
    x: number,
    y: number,
    vx: number,
    vy: number,
    size: number,
    life: number,
    color: string,
    drag: number,
    shape: 'circle' | 'diamond' | 'spark',
  ): void {
    for (const slot of this.particles) {
      if (!slot.active) {
        slot.active = true;
        slot.x = x;
        slot.y = y;
        slot.vx = vx;
        slot.vy = vy;
        slot.size = size;
        slot.life = life;
        slot.maxLife = life;
        slot.color = color;
        slot.drag = drag;
        slot.shape = shape;
        slot.rotation = Math.random() * Math.PI * 2;
        slot.vRot = (Math.random() - 0.5) * 10;
        return;
      }
    }
  }

  private burstParticles(
    x: number,
    y: number,
    count: number,
    color: string,
    maxSpeed: number,
    shape: 'circle' | 'diamond' | 'spark',
  ): void {
    for (let i = 0; i < count; i++) {
      const a = Math.random() * Math.PI * 2;
      const spd = (0.25 + Math.random() * 0.75) * maxSpeed;
      this.spawnParticle(
        x,
        y,
        Math.cos(a) * spd,
        Math.sin(a) * spd,
        2 + Math.random() * 3.5,
        0.24 + Math.random() * 0.34,
        color,
        4.5,
        shape,
      );
    }
  }

  private spawnShockwave(
    x: number,
    y: number,
    maxRadius: number,
    color: string,
    lineWidth: number,
    life: number,
  ): void {
    for (const slot of this.shockwaves) {
      if (!slot.active) {
        slot.active = true;
        slot.x = x;
        slot.y = y;
        slot.radius = 6;
        slot.maxRadius = maxRadius;
        slot.life = life;
        slot.maxLife = life;
        slot.color = color;
        slot.lineWidth = lineWidth;
        return;
      }
    }
  }

  private spawnFloatingText(x: number, y: number, text: string, color: string, scale = 1): void {
    for (const slot of this.floatingTexts) {
      if (!slot.active) {
        slot.active = true;
        slot.x = clamp(x, 60, this.width - 60);
        slot.y = clamp(y, 40, this.height - 40);
        slot.vy = -44;
        slot.text = text;
        slot.color = color;
        slot.life = 0.82;
        slot.maxLife = 0.82;
        slot.scale = scale;
        return;
      }
    }
  }

  private spawnAfterimage(x: number, y: number, angle: number, color: string): void {
    for (const slot of this.afterimages) {
      if (!slot.active) {
        slot.active = true;
        slot.x = x;
        slot.y = y;
        slot.angle = angle;
        slot.life = 0.18;
        slot.maxLife = 0.18;
        slot.color = color;
        return;
      }
    }
  }

  private updateParticles(dt: number): void {
    for (const pt of this.particles) {
      if (!pt.active) continue;
      pt.life -= dt;
      if (pt.life <= 0) {
        pt.active = false;
        continue;
      }
      const damp = Math.exp(-pt.drag * dt);
      pt.vx *= damp;
      pt.vy *= damp;
      pt.x += pt.vx * dt;
      pt.y += pt.vy * dt;
      pt.rotation += pt.vRot * dt;
    }
  }

  private updateShockwaves(dt: number): void {
    for (const sw of this.shockwaves) {
      if (!sw.active) continue;
      sw.life -= dt;
      if (sw.life <= 0) {
        sw.active = false;
        continue;
      }
      const progress = 1 - sw.life / sw.maxLife;
      const eased = 1 - Math.pow(1 - progress, 3);
      sw.radius = 6 + (sw.maxRadius - 6) * eased;
    }
  }

  private updateFloatingTexts(dt: number): void {
    for (const ft of this.floatingTexts) {
      if (!ft.active) continue;
      ft.life -= dt;
      if (ft.life <= 0) {
        ft.active = false;
        continue;
      }
      ft.y += ft.vy * dt;
      ft.vy *= Math.exp(-2.5 * dt);
    }
  }

  private updateAfterimages(dt: number): void {
    for (const af of this.afterimages) {
      if (!af.active) continue;
      af.life -= dt;
      if (af.life <= 0) {
        af.active = false;
      }
    }
  }

  private addShake(amount: number): void {
    this.shakeIntensity = Math.min(20, Math.max(this.shakeIntensity, amount));
  }

  private getEnemyColor(kind: EnemyKind): string {
    switch (kind) {
      case 'scout':
        return GAME_CONFIG.COLORS.enemyScout;
      case 'charger':
        return GAME_CONFIG.COLORS.enemyCharger;
      case 'orbiter':
        return GAME_CONFIG.COLORS.enemyOrbiter;
      case 'carrier':
        return GAME_CONFIG.COLORS.enemyCarrier;
      case 'dreadnought':
        return GAME_CONFIG.COLORS.enemyDreadnought;
    }
  }

  private emitHudSnapshot(): void {
    const p = this.player;
    this.onHudUpdate({
      gameState: this.gameState,
      score: this.score,
      highScore: this.highScore,
      hp: p.hp,
      maxHp: p.maxHp,
      overshield: p.overshield,
      wave: this.wave,
      enemiesRemaining: this.enemies.length + this.waveSpawnQueue.length,
      multiplier: this.multiplier,
      multiplierTimerRatio:
        this.multiplier > 1 ? clamp(this.multiplierTimer / GAME_CONFIG.MULTIPLIER.DECAY_SECONDS, 0, 1) : 0,
      dashReadyRatio: clamp(1 - p.dashCooldown / GAME_CONFIG.PLAYER.DASH_COOLDOWN, 0, 1),
      novaCharge: Math.floor(this.novaCharge),
      rapidTimer: p.rapidTimer,
      kills: this.kills,
      wavesCleared: this.wavesCleared,
      isNewHighScore: this.isNewHighScore,
      muted: soundEngine.isMuted(),
      waveBannerText: this.waveBannerText,
    });
  }

  // --- Vector Canvas 2D Renderer ---

  private render(): void {
    const ctx = this.ctx;
    ctx.save();
    ctx.scale(this.dpr, this.dpr);

    // Background fill
    ctx.fillStyle = GAME_CONFIG.COLORS.bg;
    ctx.fillRect(0, 0, this.width, this.height);

    // Camera shake offset
    let shakeX = 0;
    let shakeY = 0;
    if (this.shakeIntensity > 0.1) {
      shakeX = (Math.random() - 0.5) * this.shakeIntensity * 2;
      shakeY = (Math.random() - 0.5) * this.shakeIntensity * 2;
    }

    ctx.translate(shakeX, shakeY);

    this.renderBackdrop(ctx);
    this.renderShockwaves(ctx);
    this.renderAfterimages(ctx);
    this.renderPickups(ctx);
    this.renderProjectiles(ctx);
    this.renderEnemies(ctx);

    if (this.gameState !== 'GAME_OVER') {
      this.renderPlayer(ctx);
    }

    this.renderParticles(ctx);
    this.renderFloatingTexts(ctx);

    if (this.gameState === 'PLAYING' && this.mouseMoved) {
      this.renderReticle(ctx);
    }

    ctx.restore();

    // Subtle red edge vignette on hull damage
    if (this.damageVignette > 0.01) {
      ctx.save();
      ctx.scale(this.dpr, this.dpr);
      const grad = ctx.createRadialGradient(
        this.width * 0.5,
        this.height * 0.5,
        Math.min(this.width, this.height) * 0.3,
        this.width * 0.5,
        this.height * 0.5,
        Math.max(this.width, this.height) * 0.72,
      );
      grad.addColorStop(0, 'rgba(239, 68, 68, 0)');
      grad.addColorStop(1, `rgba(239, 68, 68, ${this.damageVignette * 0.34})`);
      ctx.fillStyle = grad;
      ctx.fillRect(0, 0, this.width, this.height);
      ctx.restore();
    }
  }

  private renderBackdrop(ctx: CanvasRenderingContext2D): void {
    const cx = this.width * 0.5;
    const cy = this.height * 0.5;

    // Subtle radial solar glow at arena core
    const coreGrad = ctx.createRadialGradient(cx, cy, 10, cx, cy, Math.max(this.width, this.height) * 0.58);
    coreGrad.addColorStop(0, 'rgba(245, 158, 11, 0.08)');
    coreGrad.addColorStop(0.5, 'rgba(15, 23, 42, 0.02)');
    coreGrad.addColorStop(1, 'rgba(11, 16, 27, 0)');
    ctx.fillStyle = coreGrad;
    ctx.fillRect(0, 0, this.width, this.height);

    // Parallax starfield
    const offsetX = (this.player.x - cx) * 0.4;
    const offsetY = (this.player.y - cy) * 0.4;
    for (const s of this.stars) {
      const sx = ((s.x * this.width - offsetX * s.parallax) % this.width + this.width) % this.width;
      const sy = ((s.y * this.height - offsetY * s.parallax) % this.height + this.height) % this.height;
      const twinkle = 0.65 + 0.35 * Math.sin(this.clockTime * s.twinkleSpeed + s.phase);
      ctx.fillStyle = `rgba(226, 232, 240, ${s.alpha * twinkle})`;
      ctx.beginPath();
      ctx.arc(sx, sy, s.radius, 0, Math.PI * 2);
      ctx.fill();
    }

    // Crisp tactical grid
    const gridStep = 72;
    ctx.strokeStyle = GAME_CONFIG.COLORS.bgGrid;
    ctx.lineWidth = 1;
    ctx.beginPath();
    for (let x = (this.width * 0.5) % gridStep; x < this.width; x += gridStep) {
      ctx.moveTo(x, 0);
      ctx.lineTo(x, this.height);
    }
    for (let y = (this.height * 0.5) % gridStep; y < this.height; y += gridStep) {
      ctx.moveTo(0, y);
      ctx.lineTo(this.width, y);
    }
    ctx.stroke();

    // Concentric orbital containment rings
    ctx.strokeStyle = GAME_CONFIG.COLORS.bgRing;
    ctx.lineWidth = 1;
    const baseR = Math.min(this.width, this.height) * 0.18;
    for (let r = 1; r <= 3; r++) {
      ctx.beginPath();
      ctx.arc(cx, cy, baseR * r, 0, Math.PI * 2);
      ctx.stroke();
    }
  }

  private renderPlayer(ctx: CanvasRenderingContext2D): void {
    const p = this.player;
    const isBlinkHidden = p.invulnTimer > 0 && p.dashTimer <= 0 && Math.floor(this.clockTime * 22) % 2 === 0;
    if (isBlinkHidden) return;

    ctx.save();
    ctx.translate(p.x, p.y);

    // Overshield ring
    if (p.overshield > 0) {
      ctx.strokeStyle = GAME_CONFIG.COLORS.playerShield;
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(0, 0, p.radius + 7, 0, Math.PI * 2);
      ctx.stroke();
    }

    // Nova full ready aura
    if (this.novaCharge >= GAME_CONFIG.PLAYER.NOVA_MAX_CHARGE && this.gameState === 'PLAYING') {
      const pulse = 0.35 + 0.25 * Math.sin(this.clockTime * 7);
      ctx.strokeStyle = `rgba(251, 191, 36, ${pulse})`;
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.arc(0, 0, p.radius + 11 + Math.sin(this.clockTime * 7) * 2, 0, Math.PI * 2);
      ctx.stroke();
    }

    ctx.rotate(p.angle);
    ctx.scale(p.squashX, p.squashY);

    // Thruster flame
    const flameLen = p.dashTimer > 0 ? 22 : 9 + Math.sin(this.clockTime * 45) * 3;
    ctx.fillStyle = p.rapidTimer > 0 ? GAME_CONFIG.COLORS.pickupRapid : GAME_CONFIG.COLORS.playerAccent;
    ctx.beginPath();
    ctx.moveTo(-11, -4.5);
    ctx.lineTo(-11 - flameLen, 0);
    ctx.lineTo(-11, 4.5);
    ctx.closePath();
    ctx.fill();

    // Interceptor fuselage
    ctx.fillStyle = p.hitFlashTimer > 0 ? '#FFFFFF' : GAME_CONFIG.COLORS.playerCore;
    ctx.strokeStyle = p.dashTimer > 0 ? GAME_CONFIG.COLORS.playerDash : GAME_CONFIG.COLORS.playerAccent;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(18, 0);
    ctx.lineTo(-10, -12);
    ctx.lineTo(-5, -4);
    ctx.lineTo(-12, 0);
    ctx.lineTo(-5, 4);
    ctx.lineTo(-10, 12);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();

    // Cockpit core
    ctx.fillStyle = p.rapidTimer > 0 ? GAME_CONFIG.COLORS.pickupRapid : GAME_CONFIG.COLORS.playerAccent;
    ctx.beginPath();
    ctx.moveTo(7, 0);
    ctx.lineTo(-2, -3.5);
    ctx.lineTo(-2, 3.5);
    ctx.closePath();
    ctx.fill();

    ctx.restore();
  }

  private renderEnemies(ctx: CanvasRenderingContext2D): void {
    for (const e of this.enemies) {
      const baseColor = this.getEnemyColor(e.kind);
      const color = e.hitFlashTimer > 0 ? '#FFFFFF' : baseColor;

      // Render charger laser windup telegraph BEFORE body
      if (e.kind === 'charger' && e.aiState === 'telegraph') {
        ctx.save();
        const flash = 0.45 + 0.55 * Math.abs(Math.sin(this.clockTime * 24));
        ctx.strokeStyle = `rgba(239, 68, 68, ${flash * 0.75})`;
        ctx.lineWidth = 2;
        ctx.setLineDash([8, 6]);
        ctx.beginPath();
        ctx.moveTo(e.x, e.y);
        ctx.lineTo(e.x + Math.cos(e.aimAngle) * 380, e.y + Math.sin(e.aimAngle) * 380);
        ctx.stroke();
        ctx.restore();
      }

      // Render orbiter / dreadnought windup telegraph ring
      if ((e.kind === 'orbiter' || e.kind === 'dreadnought') && e.aiState === 'telegraph') {
        ctx.save();
        const maxT =
          e.kind === 'dreadnought'
            ? GAME_CONFIG.ENEMIES.dreadnought.telegraphTime
            : GAME_CONFIG.ENEMIES.orbiter.telegraphTime;
        const progress = clamp(1 - e.stateTimer / maxT, 0, 1);
        ctx.strokeStyle = `rgba(251, 191, 36, ${0.4 + progress * 0.6})`;
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.arc(e.x, e.y, e.radius + 18 * (1 - progress) + 4, 0, Math.PI * 2);
        ctx.stroke();
        ctx.restore();
      }

      ctx.save();
      ctx.translate(e.x, e.y);
      ctx.rotate(e.angle);
      ctx.scale(e.squash, 2 - e.squash);

      ctx.fillStyle = color;
      ctx.strokeStyle = e.hitFlashTimer > 0 ? '#FFFFFF' : 'rgba(248, 250, 252, 0.55)';
      ctx.lineWidth = 1.6;

      if (e.kind === 'scout') {
        const r = e.radius;
        ctx.beginPath();
        ctx.moveTo(r, 0);
        ctx.lineTo(-r * 0.85, -r * 0.75);
        ctx.lineTo(-r * 0.4, 0);
        ctx.lineTo(-r * 0.85, r * 0.75);
        ctx.closePath();
        ctx.fill();
        ctx.stroke();
      } else if (e.kind === 'charger') {
        const r = e.radius;
        ctx.beginPath();
        ctx.moveTo(r * 1.15, 0);
        ctx.lineTo(0, -r * 0.85);
        ctx.lineTo(-r, 0);
        ctx.lineTo(0, r * 0.85);
        ctx.closePath();
        ctx.fill();
        ctx.stroke();

        ctx.fillStyle = '#0B101B';
        ctx.beginPath();
        ctx.arc(2, 0, 4, 0, Math.PI * 2);
        ctx.fill();
      } else if (e.kind === 'orbiter') {
        this.tracePolygon(ctx, 6, e.radius);
        ctx.fill();
        ctx.stroke();
        ctx.fillStyle = '#FBBF24';
        ctx.beginPath();
        ctx.arc(0, 0, 5 + Math.sin(e.pulsePhase) * 1.2, 0, Math.PI * 2);
        ctx.fill();
      } else if (e.kind === 'carrier') {
        this.tracePolygon(ctx, 5, e.radius);
        ctx.fill();
        ctx.stroke();
        ctx.strokeStyle = '#0B101B';
        ctx.lineWidth = 2.2;
        ctx.beginPath();
        ctx.arc(0, 0, e.radius * 0.45, 0, Math.PI * 2);
        ctx.stroke();
      } else if (e.kind === 'dreadnought') {
        this.tracePolygon(ctx, 8, e.radius);
        ctx.fill();
        ctx.stroke();

        ctx.rotate(-e.angle * 2);
        ctx.strokeStyle = '#FBBF24';
        ctx.lineWidth = 2.4;
        this.tracePolygon(ctx, 4, e.radius * 0.56);
        ctx.stroke();

        ctx.fillStyle = '#F8FAFC';
        ctx.beginPath();
        ctx.arc(0, 0, 8, 0, Math.PI * 2);
        ctx.fill();
      }

      ctx.restore();

      // Subtle HP arc for multi-HP heavies when damaged
      if (e.hp < e.maxHp && e.maxHp >= 4) {
        const ratio = clamp(e.hp / e.maxHp, 0, 1);
        ctx.strokeStyle = baseColor;
        ctx.lineWidth = 2.5;
        ctx.beginPath();
        ctx.arc(e.x, e.y, e.radius + 6, -Math.PI * 0.5, -Math.PI * 0.5 + Math.PI * 2 * ratio);
        ctx.stroke();
      }
    }
  }

  private tracePolygon(ctx: CanvasRenderingContext2D, sides: number, radius: number): void {
    ctx.beginPath();
    for (let i = 0; i < sides; i++) {
      const a = (i * Math.PI * 2) / sides;
      const x = Math.cos(a) * radius;
      const y = Math.sin(a) * radius;
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
    ctx.closePath();
  }

  private renderProjectiles(ctx: CanvasRenderingContext2D): void {
    for (const proj of this.projectiles) {
      if (!proj.active) continue;
      ctx.save();
      if (proj.fromPlayer) {
        const angle = Math.atan2(proj.vy, proj.vx);
        ctx.translate(proj.x, proj.y);
        ctx.rotate(angle);
        ctx.fillStyle = proj.color;
        ctx.fillRect(-10, -2, 16, 4);
        ctx.fillStyle = '#FFFFFF';
        ctx.fillRect(-2, -1.2, 8, 2.4);
      } else {
        ctx.fillStyle = proj.color;
        ctx.beginPath();
        ctx.arc(proj.x, proj.y, proj.radius, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = '#FFFFFF';
        ctx.beginPath();
        ctx.arc(proj.x, proj.y, proj.radius * 0.45, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.restore();
    }
  }

  private renderPickups(ctx: CanvasRenderingContext2D): void {
    for (const pk of this.pickups) {
      if (!pk.active) continue;
      // Blink gently when about to expire
      if (pk.life < 2.2 && Math.floor(pk.life * 10) % 2 === 0) continue;

      const scale = 1 + Math.sin(pk.pulse) * 0.14;
      ctx.save();
      ctx.translate(pk.x, pk.y);
      ctx.scale(scale, scale);

      if (pk.kind === 'shard') {
        ctx.rotate(pk.pulse * 0.4);
        ctx.fillStyle = GAME_CONFIG.COLORS.pickupShard;
        ctx.beginPath();
        ctx.moveTo(0, -8);
        ctx.lineTo(6, 0);
        ctx.lineTo(0, 8);
        ctx.lineTo(-6, 0);
        ctx.closePath();
        ctx.fill();
      } else if (pk.kind === 'repair') {
        ctx.fillStyle = GAME_CONFIG.COLORS.pickupRepair;
        ctx.strokeStyle = '#ECFDF5';
        ctx.lineWidth = 1.4;
        ctx.beginPath();
        ctx.arc(0, 0, 10, 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();
        ctx.fillStyle = '#0B101B';
        ctx.fillRect(-5, -1.8, 10, 3.6);
        ctx.fillRect(-1.8, -5, 3.6, 10);
      } else if (pk.kind === 'rapid') {
        ctx.fillStyle = GAME_CONFIG.COLORS.pickupRapid;
        ctx.strokeStyle = '#E0F2FE';
        ctx.lineWidth = 1.4;
        ctx.beginPath();
        ctx.arc(0, 0, 10, 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();
        ctx.fillStyle = '#0B101B';
        ctx.beginPath();
        ctx.moveTo(2, -6);
        ctx.lineTo(-4, 1);
        ctx.lineTo(0, 1);
        ctx.lineTo(-2, 6);
        ctx.lineTo(4, -1);
        ctx.lineTo(0, -1);
        ctx.closePath();
        ctx.fill();
      }

      ctx.restore();
    }
  }

  private renderParticles(ctx: CanvasRenderingContext2D): void {
    for (const pt of this.particles) {
      if (!pt.active) continue;
      const alpha = clamp(pt.life / pt.maxLife, 0, 1);
      ctx.save();
      ctx.globalAlpha = alpha;
      ctx.translate(pt.x, pt.y);
      ctx.rotate(pt.rotation);
      ctx.fillStyle = pt.color;

      if (pt.shape === 'circle') {
        ctx.beginPath();
        ctx.arc(0, 0, pt.size * alpha, 0, Math.PI * 2);
        ctx.fill();
      } else if (pt.shape === 'diamond') {
        const s = pt.size * (0.4 + 0.6 * alpha);
        ctx.beginPath();
        ctx.moveTo(0, -s);
        ctx.lineTo(s, 0);
        ctx.lineTo(0, s);
        ctx.lineTo(-s, 0);
        ctx.closePath();
        ctx.fill();
      } else {
        const len = pt.size * 2.1;
        ctx.fillRect(-len * 0.5, -1, len, 2);
      }
      ctx.restore();
    }
  }

  private renderShockwaves(ctx: CanvasRenderingContext2D): void {
    for (const sw of this.shockwaves) {
      if (!sw.active) continue;
      const alpha = clamp(sw.life / sw.maxLife, 0, 1);
      ctx.save();
      ctx.globalAlpha = alpha;
      ctx.strokeStyle = sw.color;
      ctx.lineWidth = sw.lineWidth * alpha;
      ctx.beginPath();
      ctx.arc(sw.x, sw.y, sw.radius, 0, Math.PI * 2);
      ctx.stroke();
      ctx.restore();
    }
  }

  private renderAfterimages(ctx: CanvasRenderingContext2D): void {
    for (const af of this.afterimages) {
      if (!af.active) continue;
      const alpha = clamp(af.life / af.maxLife, 0, 1) * 0.45;
      ctx.save();
      ctx.globalAlpha = alpha;
      ctx.translate(af.x, af.y);
      ctx.rotate(af.angle);
      ctx.strokeStyle = af.color;
      ctx.lineWidth = 1.6;
      ctx.beginPath();
      ctx.moveTo(18, 0);
      ctx.lineTo(-10, -12);
      ctx.lineTo(-5, 0);
      ctx.lineTo(-10, 12);
      ctx.closePath();
      ctx.stroke();
      ctx.restore();
    }
  }

  private renderFloatingTexts(ctx: CanvasRenderingContext2D): void {
    ctx.save();
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    for (const ft of this.floatingTexts) {
      if (!ft.active) continue;
      const alpha = clamp(ft.life / ft.maxLife, 0, 1);
      ctx.globalAlpha = alpha;
      ctx.font = `700 ${Math.round(13 * ft.scale)}px "JetBrains Mono", monospace`;
      ctx.fillStyle = ft.color;
      ctx.fillText(ft.text, ft.x, ft.y);
    }
    ctx.restore();
  }

  private renderReticle(ctx: CanvasRenderingContext2D): void {
    ctx.save();
    ctx.translate(this.mouseX, this.mouseY);
    ctx.strokeStyle = 'rgba(248, 250, 252, 0.72)';
    ctx.lineWidth = 1.4;
    ctx.beginPath();
    ctx.arc(0, 0, 9, 0, Math.PI * 2);
    ctx.stroke();

    ctx.beginPath();
    ctx.moveTo(-14, 0);
    ctx.lineTo(-6, 0);
    ctx.moveTo(6, 0);
    ctx.lineTo(14, 0);
    ctx.moveTo(0, -14);
    ctx.lineTo(0, -6);
    ctx.moveTo(0, 6);
    ctx.lineTo(0, 14);
    ctx.stroke();
    ctx.restore();
  }
}
