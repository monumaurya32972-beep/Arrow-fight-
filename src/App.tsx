/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import { GameHud } from './components/GameHud';
import { OverlayModals } from './components/OverlayModals';
import { soundEngine } from './game/audio';
import { GAME_CONFIG } from './game/config';
import { SolarBreachEngine } from './game/engine';
import { HudSnapshot, TouchInputState } from './game/types';

const INITIAL_HUD: HudSnapshot = {
  gameState: 'TITLE_MENU',
  score: 0,
  highScore: 0,
  hp: GAME_CONFIG.PLAYER.MAX_HP,
  maxHp: GAME_CONFIG.PLAYER.MAX_HP,
  overshield: 0,
  wave: 1,
  enemiesRemaining: 0,
  multiplier: 1,
  multiplierTimerRatio: 0,
  dashReadyRatio: 1,
  novaCharge: 0,
  rapidTimer: 0,
  kills: 0,
  wavesCleared: 0,
  isNewHighScore: false,
  muted: soundEngine.isMuted(),
  waveBannerText: null,
};

export default function App() {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const engineRef = useRef<SolarBreachEngine | null>(null);
  const [hud, setHud] = useState<HudSnapshot>(INITIAL_HUD);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const engine = new SolarBreachEngine(canvas, (snapshot) => {
      setHud(snapshot);
    });
    engineRef.current = engine;
    engine.startLoop();

    return () => {
      engine.destroy();
      engineRef.current = null;
    };
  }, []);

  const handleStart = useCallback(() => {
    engineRef.current?.startGame();
  }, []);

  const handlePause = useCallback(() => {
    engineRef.current?.pauseGame();
  }, []);

  const handleResume = useCallback(() => {
    engineRef.current?.resumeGame();
  }, []);

  const handleReturnTitle = useCallback(() => {
    engineRef.current?.returnToTitle();
  }, []);

  const handleToggleMute = useCallback(() => {
    engineRef.current?.toggleMute();
  }, []);

  const handleDash = useCallback(() => {
    engineRef.current?.triggerDash();
  }, []);

  const handleNova = useCallback(() => {
    engineRef.current?.triggerNova();
  }, []);

  const handleTouchChange = useCallback((partial: Partial<TouchInputState>) => {
    engineRef.current?.setTouchInput(partial);
  }, []);

  return (
    <main className="relative h-screen w-screen overflow-hidden bg-[#0B101B]">
      {/* Isolated Canvas Container (never re-rendered by HUD state changes) */}
      <div className="absolute inset-0">
        <canvas
          ref={canvasRef}
          className={`block h-full w-full ${
            hud.gameState === 'PLAYING' ? 'cursor-crosshair' : 'cursor-default'
          }`}
        />
      </div>

      {/* Low-Occlusion Perimeter HUD */}
      <GameHud
        hud={hud}
        onPause={handlePause}
        onToggleMute={handleToggleMute}
        onDash={handleDash}
        onNova={handleNova}
        onTouchChange={handleTouchChange}
      />

      {/* State Machine Overlays (Title Menu, Pause, Game Over) */}
      <OverlayModals
        hud={hud}
        onStart={handleStart}
        onResume={handleResume}
        onRestart={handleStart}
        onReturnTitle={handleReturnTitle}
      />
    </main>
  );
}
