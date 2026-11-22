import React, { useEffect, useRef, useState } from 'react';
import { Pause, Volume2, VolumeX, Zap } from 'lucide-react';
import { HudSnapshot, TouchInputState } from '../game/types';

interface GameHudProps {
  hud: HudSnapshot;
  onPause: () => void;
  onToggleMute: () => void;
  onDash: () => void;
  onNova: () => void;
  onTouchChange: (partial: Partial<TouchInputState>) => void;
}

export const GameHud: React.FC<GameHudProps> = ({
  hud,
  onPause,
  onToggleMute,
  onDash,
  onNova,
  onTouchChange,
}) => {
  const [isTouchDevice, setIsTouchDevice] = useState(false);
  const movePadRef = useRef<HTMLDivElement | null>(null);
  const aimPadRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const coarse = window.matchMedia?.('(pointer: coarse)').matches || 'ontouchstart' in window;
    setIsTouchDevice(Boolean(coarse));
  }, []);

  const isPlaying = hud.gameState === 'PLAYING';
  const hullLabel =
    hud.hp <= 1 ? 'CRITICAL' : hud.hp === hud.maxHp ? 'INTACT' : 'STABLE';
  const novaReady = hud.novaCharge >= 100;

  const handleStickMove = (
    e: React.TouchEvent<HTMLDivElement>,
    ref: React.RefObject<HTMLDivElement | null>,
    type: 'move' | 'aim',
  ) => {
    const el = ref.current;
    if (!el || e.touches.length === 0) return;
    const rect = el.getBoundingClientRect();
    const touch = Array.from(e.touches).find((t) => {
      const target = t.target as HTMLElement;
      return el.contains(target);
    }) || e.touches[0];

    const cx = rect.left + rect.width * 0.5;
    const cy = rect.top + rect.height * 0.5;
    const maxR = rect.width * 0.42;
    const dx = touch.clientX - cx;
    const dy = touch.clientY - cy;
    const dist = Math.hypot(dx, dy);
    const nx = dist > 4 ? (dx / Math.max(dist, maxR)) : 0;
    const ny = dist > 4 ? (dy / Math.max(dist, maxR)) : 0;

    if (type === 'move') {
      onTouchChange({ moveX: Math.max(-1, Math.min(1, nx)), moveY: Math.max(-1, Math.min(1, ny)) });
    } else {
      onTouchChange({
        aimX: Math.max(-1, Math.min(1, nx)),
        aimY: Math.max(-1, Math.min(1, ny)),
        firing: dist > 8,
      });
    }
  };

  return (
    <div className="pointer-events-none fixed inset-0 z-10 flex flex-col justify-between p-4 sm:p-5">
      {/* Top Perimeter Bar: Score, Wave, Hull, Controls */}
      <div className="flex items-start justify-between gap-4">
        {/* Top-Left: Score & Combo */}
        <div className="flex flex-col gap-1 bg-[#0B101B]/80 border border-slate-800/90 px-3.5 py-2.5 rounded-lg">
          <div className="flex items-baseline gap-3">
            <span className="text-[11px] font-medium tracking-wider text-slate-400">SCORE</span>
            <span className="font-mono-tabular text-xl sm:text-2xl font-bold text-slate-50 leading-none">
              {hud.score.toLocaleString()}
            </span>
            {hud.multiplier > 1 && (
              <span className="font-mono-tabular text-xs font-bold text-amber-400">
                {hud.multiplier}x OVERDRIVE
              </span>
            )}
          </div>

          <div className="flex items-center gap-3 text-xs text-slate-400">
            <span className="font-mono-tabular">BEST {hud.highScore.toLocaleString()}</span>
            {hud.multiplier > 1 && (
              <div className="w-20 h-1 bg-slate-800 overflow-hidden rounded-xs">
                <div
                  className="h-full bg-amber-400 transition-transform duration-75 origin-left"
                  style={{ transform: `scaleX(${hud.multiplierTimerRatio})` }}
                />
              </div>
            )}
          </div>
        </div>

        {/* Top-Center: Wave & Remaining Hostiles (Only during active play) */}
        {isPlaying && (
          <div className="hidden sm:flex items-center gap-4 bg-[#0B101B]/80 border border-slate-800/90 px-4 py-2 rounded-lg">
            <div className="flex items-baseline gap-2">
              <span className="text-[11px] font-medium tracking-wider text-slate-400">WAVE</span>
              <span className="font-mono-tabular text-lg font-bold text-amber-400">{hud.wave}</span>
            </div>
            <span className="text-slate-700" aria-hidden="true">/</span>
            <div className="flex items-baseline gap-2">
              <span className="text-[11px] font-medium tracking-wider text-slate-400">HOSTILES</span>
              <span className="font-mono-tabular text-lg font-bold text-slate-100">{hud.enemiesRemaining}</span>
            </div>
          </div>
        )}

        {/* Top-Right: Hull Integrity + Action Buttons */}
        <div className="flex items-center gap-2.5">
          {isPlaying && (
            <div className="flex flex-col items-end gap-1 bg-[#0B101B]/80 border border-slate-800/90 px-3.5 py-2 rounded-lg">
              <div className="flex items-center gap-2">
                <span className="text-[11px] font-medium tracking-wider text-slate-400">
                  HULL {hud.hp}/{hud.maxHp}
                </span>
                <span
                  className={`text-[11px] font-semibold tracking-wide ${
                    hud.hp <= 1 ? 'text-red-400' : 'text-emerald-400'
                  }`}
                >
                  {hullLabel}
                </span>
              </div>
              <div className="flex items-center gap-1.5" aria-label={`Hull ${hud.hp} of ${hud.maxHp}`}>
                {Array.from({ length: hud.maxHp }).map((_, idx) => {
                  const filled = idx < hud.hp;
                  return (
                    <span
                      key={idx}
                      className={`h-2 w-5 rounded-xs transition-colors ${
                        filled
                          ? hud.hp <= 1
                            ? 'bg-red-500'
                            : 'bg-slate-100'
                          : 'bg-slate-800'
                      }`}
                    />
                  );
                })}
                {hud.overshield > 0 && (
                  <span className="font-mono-tabular text-[11px] font-bold text-emerald-400 ml-1">
                    +{hud.overshield} SHD
                  </span>
                )}
              </div>
            </div>
          )}

          <div className="pointer-events-auto flex items-center gap-1.5">
            <button
              type="button"
              onClick={onToggleMute}
              title={hud.muted ? 'Unmute Audio (M)' : 'Mute Audio (M)'}
              aria-label={hud.muted ? 'Unmute Audio' : 'Mute Audio'}
              className="flex h-10 w-10 items-center justify-center rounded-lg border border-slate-800 bg-[#0B101B]/90 text-slate-200 hover:border-amber-500/60 hover:text-amber-300 transition-colors cursor-pointer"
            >
              {hud.muted ? <VolumeX className="h-4 w-4" /> : <Volume2 className="h-4 w-4" />}
            </button>

            {isPlaying && (
              <button
                type="button"
                onClick={onPause}
                title="Pause Game (Esc)"
                aria-label="Pause Game"
                className="flex h-10 w-10 items-center justify-center rounded-lg border border-slate-800 bg-[#0B101B]/90 text-slate-200 hover:border-amber-500/60 hover:text-amber-300 transition-colors cursor-pointer"
              >
                <Pause className="h-4 w-4" />
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Transient Wave Announcement Banner (non-blocking, high above center ship) */}
      {isPlaying && hud.waveBannerText && (
        <div className="pointer-events-none fixed left-1/2 top-20 -translate-x-1/2 text-center">
          <p className="font-display text-2xl sm:text-3xl font-bold tracking-[0.14em] text-amber-300 drop-shadow-[0_2px_10px_rgba(0,0,0,0.85)]">
            {hud.waveBannerText}
          </p>
        </div>
      )}

      {/* Bottom Perimeter Bar: Dash / Nova Meters & Optional Touch Sticks */}
      {isPlaying && (
        <div className="flex items-end justify-between gap-4">
          {isTouchDevice ? (
            <div className="pointer-events-auto flex items-end justify-between w-full gap-4">
              {/* Left Move Stick */}
              <div
                ref={movePadRef}
                onTouchStart={(e) => handleStickMove(e, movePadRef, 'move')}
                onTouchMove={(e) => handleStickMove(e, movePadRef, 'move')}
                onTouchEnd={() => onTouchChange({ moveX: 0, moveY: 0 })}
                onTouchCancel={() => onTouchChange({ moveX: 0, moveY: 0 })}
                className="relative h-28 w-28 rounded-full border border-slate-700/70 bg-slate-900/45 flex items-center justify-center"
              >
                <span className="text-[11px] font-medium text-slate-400">MOVE</span>
              </div>

              {/* Center Touch Ability Buttons */}
              <div className="flex items-center gap-2.5 pb-1">
                <button
                  type="button"
                  onClick={onDash}
                  className="h-12 px-4 rounded-lg border border-slate-700 bg-[#0B101B]/90 text-xs font-semibold text-slate-100 active:scale-95"
                >
                  Dash
                </button>
                <button
                  type="button"
                  onClick={onNova}
                  disabled={!novaReady}
                  className={`h-12 px-4 rounded-lg border text-xs font-semibold transition-colors ${
                    novaReady
                      ? 'border-amber-400 bg-amber-500 text-slate-950'
                      : 'border-slate-800 bg-[#0B101B]/80 text-slate-500'
                  }`}
                >
                  Nova {hud.novaCharge}%
                </button>
              </div>

              {/* Right Aim & Fire Stick */}
              <div
                ref={aimPadRef}
                onTouchStart={(e) => handleStickMove(e, aimPadRef, 'aim')}
                onTouchMove={(e) => handleStickMove(e, aimPadRef, 'aim')}
                onTouchEnd={() => onTouchChange({ aimX: 0, aimY: 0, firing: false })}
                onTouchCancel={() => onTouchChange({ aimX: 0, aimY: 0, firing: false })}
                className="relative h-28 w-28 rounded-full border border-amber-500/45 bg-slate-900/45 flex items-center justify-center"
              >
                <span className="text-[11px] font-medium text-amber-300">AIM / FIRE</span>
              </div>
            </div>
          ) : (
            <div className="flex items-center justify-between w-full">
              {/* Bottom-Left: Dash & Overclock Status */}
              <div className="flex items-center gap-4 bg-[#0B101B]/80 border border-slate-800/90 px-3.5 py-2 rounded-lg">
                <div className="flex items-center gap-2.5">
                  <span className="text-[11px] font-medium tracking-wider text-slate-400">DASH [SHIFT]</span>
                  <div className="w-16 h-1.5 bg-slate-800 rounded-xs overflow-hidden">
                    <div
                      className={`h-full transition-transform duration-75 origin-left ${
                        hud.dashReadyRatio >= 0.99 ? 'bg-slate-100' : 'bg-slate-500'
                      }`}
                      style={{ transform: `scaleX(${hud.dashReadyRatio})` }}
                    />
                  </div>
                  <span className="font-mono-tabular text-[11px] font-semibold text-slate-200">
                    {hud.dashReadyRatio >= 0.99 ? 'READY' : 'RECHARGING'}
                  </span>
                </div>

                {hud.rapidTimer > 0 && (
                  <>
                    <span className="text-slate-700" aria-hidden="true">·</span>
                    <span className="font-mono-tabular text-xs font-semibold text-sky-400">
                      TWIN OVERCLOCK {hud.rapidTimer.toFixed(1)}s
                    </span>
                  </>
                )}
              </div>

              {/* Bottom-Right: Nova Pulse Meter */}
              <div className="pointer-events-auto flex items-center gap-3 bg-[#0B101B]/80 border border-slate-800/90 px-3.5 py-2 rounded-lg">
                <div className="flex items-center gap-2">
                  <span className="text-[11px] font-medium tracking-wider text-slate-400">NOVA [E]</span>
                  <div className="w-20 h-1.5 bg-slate-800 rounded-xs overflow-hidden">
                    <div
                      className={`h-full transition-transform duration-100 origin-left ${
                        novaReady ? 'bg-amber-400' : 'bg-amber-600/80'
                      }`}
                      style={{ transform: `scaleX(${hud.novaCharge / 100})` }}
                    />
                  </div>
                  <span
                    className={`font-mono-tabular text-xs font-bold ${
                      novaReady ? 'text-amber-300' : 'text-slate-300'
                    }`}
                  >
                    {novaReady ? 'READY' : `${hud.novaCharge}%`}
                  </span>
                </div>

                {novaReady && (
                  <button
                    type="button"
                    onClick={onNova}
                    className="flex items-center gap-1 rounded px-2 py-1 text-xs font-semibold bg-amber-500 text-slate-950 hover:bg-amber-400 transition-colors cursor-pointer"
                  >
                    <Zap className="h-3.5 w-3.5" />
                    Fire Nova
                  </button>
                )}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
};
