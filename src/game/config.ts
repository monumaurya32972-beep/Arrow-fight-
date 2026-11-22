/**
 * Centralized game balance, pacing, and visual configuration.
 * Tweak these values to tune movement feel, spawn pacing, and difficulty scaling.
 */
export const GAME_CONFIG = {
  // Arena & Simulation
  ARENA_PADDING: 28, // Keep player ship cleanly inside viewport edges
  MAX_DELTA_TIME: 0.05, // Clamp dt to prevent tunneling/teleports on tab switch
  HIGH_SCORE_STORAGE_KEY: 'solar_breach_high_score_v1',
  MUTE_STORAGE_KEY: 'solar_breach_muted_v1',
  GAME_OVER_INPUT_GUARD: 0.45, // Seconds before Enter/Space can restart from Game Over

  // Visual Palette (60-30-10 Arena Discipline)
  COLORS: {
    bg: '#0B101B',
    bgGrid: 'rgba(148, 163, 184, 0.06)',
    bgRing: 'rgba(245, 158, 11, 0.09)',
    playerCore: '#F8FAFC',
    playerAccent: '#F59E0B',
    playerDash: '#FDE68A',
    playerShield: '#10B981',
    playerBolt: '#FBBF24',
    enemyScout: '#F97316',
    enemyCharger: '#EF4444',
    enemyOrbiter: '#A855F7',
    enemyCarrier: '#10B981',
    enemyDreadnought: '#F43F5E',
    enemyBolt: '#FB7185',
    telegraphLine: 'rgba(239, 68, 68, 0.68)',
    pickupShard: '#FBBF24',
    pickupRepair: '#10B981',
    pickupRapid: '#38BDF8',
  },

  // Player Tuning
  PLAYER: {
    RADIUS: 15,
    MAX_SPEED: 375,
    ACCEL: 2450,
    FRICTION: 11.5,
    MAX_HP: 4,
    INVULN_DURATION: 1.15,
    FIRE_INTERVAL: 0.145,
    RAPID_FIRE_INTERVAL: 0.075,
    RAPID_DURATION: 7.5,
    BULLET_SPEED: 880,
    BULLET_LIFE: 1.35,
    BULLET_RADIUS: 4.5,
    DASH_SPEED: 980,
    DASH_DURATION: 0.16,
    DASH_COOLDOWN: 1.35,
    NOVA_MAX_CHARGE: 100,
    NOVA_CHARGE_PER_KILL: 11,
    NOVA_CHARGE_PER_SHARD: 6,
    NOVA_RADIUS: 310,
  },

  // Combo / Multiplier Tuning
  MULTIPLIER: {
    MAX: 5,
    DECAY_SECONDS: 4.2,
  },

  // Wave & Difficulty Scaling
  WAVES: {
    BREATHER_DURATION: 1.8, // Brief calm pause between waves
    BASE_ENEMIES: 6,
    ENEMIES_PER_WAVE: 3,
    MAX_CONCURRENT_CAP: 24,
    SPAWN_INTERVAL_BASE: 0.78,
    SPAWN_INTERVAL_MIN: 0.24,
    SPEED_SCALE_PER_WAVE: 0.045, // +4.5% enemy speed per wave, capped smoothly
    MAX_SPEED_MULTIPLIER: 1.65,
    MIN_PLAYER_SPAWN_CLEARANCE: 250, // Never spawn right on top of the player
    MIN_ENEMY_SPAWN_CLEARANCE: 48, // Avoid overlapping enemy spawns
  },

  // Enemy Archetypes
  ENEMIES: {
    scout: {
      radius: 14,
      hp: 2,
      speed: 205,
      score: 100,
    },
    charger: {
      radius: 18,
      hp: 4,
      speed: 135,
      chargeSpeed: 640,
      telegraphTime: 0.72,
      chargeTime: 0.42,
      cooldownTime: 0.9,
      score: 220,
    },
    orbiter: {
      radius: 19,
      hp: 5,
      speed: 145,
      preferredDist: 250,
      telegraphTime: 0.65,
      fireCooldown: 2.2,
      boltSpeed: 310,
      score: 260,
    },
    carrier: {
      radius: 23,
      hp: 9,
      speed: 96,
      score: 360,
    },
    dreadnought: {
      radius: 38,
      hp: 42,
      speed: 78,
      telegraphTime: 0.95,
      fireCooldown: 1.9,
      boltSpeed: 340,
      score: 1400,
    },
  },

  // Object Pool Capacities (prevents unbounded memory growth)
  POOLS: {
    MAX_PROJECTILES: 240,
    MAX_PICKUPS: 90,
    MAX_PARTICLES: 360,
    MAX_SHOCKWAVES: 32,
    MAX_FLOATING_TEXTS: 48,
    MAX_AFTERIMAGES: 24,
  },

  // Juice Parameters
  JUICE: {
    HITSTOP_HEAVY_KILL: 0.038,
    HITSTOP_BOSS_KILL: 0.075,
    HITSTOP_PLAYER_HIT: 0.055,
    SHAKE_DECAY: 18,
  },
} as const;
