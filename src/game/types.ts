export type GameState = 'TITLE_MENU' | 'PLAYING' | 'PAUSED' | 'GAME_OVER';

export type EnemyKind = 'scout' | 'charger' | 'orbiter' | 'carrier' | 'dreadnought';

export type PickupKind = 'shard' | 'repair' | 'rapid';

export interface Vec2 {
  x: number;
  y: number;
}

export interface Player {
  x: number;
  y: number;
  prevX: number;
  prevY: number;
  vx: number;
  vy: number;
  angle: number;
  radius: number;
  hp: number;
  maxHp: number;
  overshield: number;
  invulnTimer: number;
  hitFlashTimer: number;
  fireCooldown: number;
  rapidTimer: number;
  dashCooldown: number;
  dashTimer: number;
  dashDirX: number;
  dashDirY: number;
  squashX: number;
  squashY: number;
  thrusterAccum: number;
}

export interface Projectile {
  active: boolean;
  fromPlayer: boolean;
  x: number;
  y: number;
  prevX: number;
  prevY: number;
  vx: number;
  vy: number;
  radius: number;
  damage: number;
  life: number;
  maxLife: number;
  color: string;
  pierce: number;
}

export interface Enemy {
  id: number;
  kind: EnemyKind;
  x: number;
  y: number;
  prevX: number;
  prevY: number;
  vx: number;
  vy: number;
  angle: number;
  radius: number;
  hp: number;
  maxHp: number;
  speed: number;
  scoreValue: number;
  hitFlashTimer: number;
  squash: number;
  aiState: 'approach' | 'telegraph' | 'attack' | 'cooldown';
  stateTimer: number;
  aimAngle: number;
  orbitDir: number;
  pulsePhase: number;
}

export interface Pickup {
  active: boolean;
  kind: PickupKind;
  x: number;
  y: number;
  vx: number;
  vy: number;
  radius: number;
  life: number;
  maxLife: number;
  value: number;
  pulse: number;
}

export interface Particle {
  active: boolean;
  x: number;
  y: number;
  vx: number;
  vy: number;
  size: number;
  life: number;
  maxLife: number;
  color: string;
  drag: number;
  shape: 'circle' | 'diamond' | 'spark';
  rotation: number;
  vRot: number;
}

export interface Shockwave {
  active: boolean;
  x: number;
  y: number;
  radius: number;
  maxRadius: number;
  life: number;
  maxLife: number;
  color: string;
  lineWidth: number;
}

export interface FloatingText {
  active: boolean;
  x: number;
  y: number;
  vy: number;
  text: string;
  color: string;
  life: number;
  maxLife: number;
  scale: number;
}

export interface Afterimage {
  active: boolean;
  x: number;
  y: number;
  angle: number;
  life: number;
  maxLife: number;
  color: string;
}

export interface StarSpec {
  x: number;
  y: number;
  radius: number;
  alpha: number;
  parallax: number;
  twinkleSpeed: number;
  phase: number;
}

export interface HudSnapshot {
  gameState: GameState;
  score: number;
  highScore: number;
  hp: number;
  maxHp: number;
  overshield: number;
  wave: number;
  enemiesRemaining: number;
  multiplier: number;
  multiplierTimerRatio: number;
  dashReadyRatio: number;
  novaCharge: number; // 0 to 100
  rapidTimer: number;
  kills: number;
  wavesCleared: number;
  isNewHighScore: boolean;
  muted: boolean;
  waveBannerText: string | null;
}

export interface TouchInputState {
  moveX: number;
  moveY: number;
  aimX: number;
  aimY: number;
  firing: boolean;
}
