import React from 'react';
import { Play, RotateCcw } from 'lucide-react';
import { HudSnapshot } from '../game/types';
import { TitleLockup } from './TitleLockup';

interface OverlayModalsProps {
  hud: HudSnapshot;
  onStart: () => void;
  onResume: () => void;
  onRestart: () => void;
  onReturnTitle: () => void;
}

export const OverlayModals: React.FC<OverlayModalsProps> = ({
  hud,
  onStart,
  onResume,
  onRestart,
  onReturnTitle,
}) => {
  if (hud.gameState === 'PLAYING') {
    return null;
  }

  if (hud.gameState === 'TITLE_MENU') {
    return (
      <div className="fixed inset-0 z-20 flex flex-col items-center justify-center px-6 py-8 bg-gradient-to-b from-[#0B101B]/45 via-[#0B101B]/60 to-[#0B101B]/80">
        <div className="flex flex-col items-center text-center max-w-2xl">
          <TitleLockup />

          <p className="mt-5 max-w-md text-sm sm:text-base text-slate-300 leading-relaxed">
            Defend the orbital containment sector. Strafe enemy telegraphs, dash through swarms to scoop Solar Shards, and unleash Nova Pulses at full charge.
          </p>

          {hud.highScore > 0 && (
            <div className="mt-5 flex items-center gap-3 text-xs font-medium text-slate-400">
              <span>HIGH SCORE</span>
              <span aria-hidden="true">·</span>
              <span className="font-mono-tabular text-sm font-bold text-amber-400">
                {hud.highScore.toLocaleString()}
              </span>
            </div>
          )}

          <div className="mt-7">
            <button
              type="button"
              onClick={onStart}
              className="inline-flex items-center gap-2.5 rounded-lg bg-amber-500 px-8 py-3.5 text-base font-bold text-slate-950 shadow-lg shadow-amber-500/20 hover:bg-amber-400 active:scale-[0.98] transition-all cursor-pointer whitespace-nowrap"
            >
              <Play className="h-4 w-4 fill-current" />
              Start Game
            </button>
          </div>

          <p className="mt-8 text-xs sm:text-[13px] text-slate-400 tracking-wide">
            WASD / Arrows Move · Mouse Aim &amp; Fire · Shift / Right-Click Dash · E Nova · Esc Pause
          </p>
        </div>
      </div>
    );
  }

  if (hud.gameState === 'PAUSED') {
    return (
      <div className="fixed inset-0 z-20 flex items-center justify-center px-6 bg-[#0B101B]/82">
        <div className="w-full max-w-sm rounded-xl border border-slate-800 bg-[#111827] p-7 text-center shadow-2xl">
          <h2 className="font-display text-3xl font-bold tracking-wider text-slate-100">
            PAUSED
          </h2>
          <p className="mt-2 text-sm text-slate-400">
            Wave {hud.wave} · Score <span className="font-mono-tabular text-slate-200">{hud.score.toLocaleString()}</span>
          </p>

          <div className="mt-6 flex flex-col gap-2.5">
            <button
              type="button"
              onClick={onResume}
              className="w-full rounded-lg bg-amber-500 px-5 py-2.5 text-sm font-bold text-slate-950 hover:bg-amber-400 transition-colors cursor-pointer"
            >
              Resume Game
            </button>
            <button
              type="button"
              onClick={onRestart}
              className="w-full rounded-lg border border-slate-700 bg-slate-800/60 px-5 py-2.5 text-sm font-semibold text-slate-200 hover:bg-slate-800 transition-colors cursor-pointer"
            >
              Restart Run
            </button>
            <button
              type="button"
              onClick={onReturnTitle}
              className="w-full rounded-lg px-5 py-2 text-sm font-medium text-slate-400 hover:text-slate-200 transition-colors cursor-pointer"
            >
              Return to Title
            </button>
          </div>
        </div>
      </div>
    );
  }

  // GAME_OVER state
  return (
    <div className="fixed inset-0 z-20 flex items-center justify-center px-6 bg-[#0B101B]/85">
      <div className="w-full max-w-md rounded-xl border border-slate-800 bg-[#111827] p-7 text-center shadow-2xl">
        <h2 className="font-display text-4xl font-extrabold tracking-wider text-red-400">
          SECTOR BREACHED
        </h2>

        {hud.isNewHighScore && (
          <p className="mt-1.5 text-xs font-bold tracking-wider text-amber-400">
            NEW PERSONAL RECORD
          </p>
        )}

        <div className="mt-6 grid grid-cols-2 gap-3 border-y border-slate-800 py-5 text-left">
          <div>
            <div className="text-[11px] font-medium tracking-wider text-slate-400">FINAL SCORE</div>
            <div className="font-mono-tabular mt-0.5 text-2xl font-bold text-slate-50">
              {hud.score.toLocaleString()}
            </div>
          </div>
          <div>
            <div className="text-[11px] font-medium tracking-wider text-slate-400">HIGH SCORE</div>
            <div className="font-mono-tabular mt-0.5 text-2xl font-bold text-amber-400">
              {hud.highScore.toLocaleString()}
            </div>
          </div>
          <div>
            <div className="text-[11px] font-medium tracking-wider text-slate-400">WAVE REACHED</div>
            <div className="font-mono-tabular mt-0.5 text-lg font-bold text-slate-200">
              {hud.wave}
            </div>
          </div>
          <div>
            <div className="text-[11px] font-medium tracking-wider text-slate-400">HOSTILES DESTROYED</div>
            <div className="font-mono-tabular mt-0.5 text-lg font-bold text-slate-200">
              {hud.kills}
            </div>
          </div>
        </div>

        <div className="mt-6 flex flex-col gap-2.5">
          <button
            type="button"
            onClick={onRestart}
            className="inline-flex w-full items-center justify-center gap-2 rounded-lg bg-amber-500 px-5 py-3 text-sm font-bold text-slate-950 hover:bg-amber-400 transition-colors cursor-pointer whitespace-nowrap"
          >
            <RotateCcw className="h-4 w-4" />
            Play Again
          </button>
          <button
            type="button"
            onClick={onReturnTitle}
            className="w-full rounded-lg px-5 py-2 text-sm font-medium text-slate-400 hover:text-slate-200 transition-colors cursor-pointer"
          >
            Return to Title
          </button>
        </div>

        <p className="mt-4 text-xs text-slate-500">
          Press Enter or Space to play again
        </p>
      </div>
    </div>
  );
};
