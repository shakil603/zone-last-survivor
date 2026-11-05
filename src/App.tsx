import { useEffect, useRef, useState, useCallback } from "react";
import {
  GameEngine,
  type CameraMode,
  type GameResult,
  type HudState,
} from "./game/GameEngine";
import { sfx } from "./game/sound";
import {
  loadScores,
  saveScore,
  isHighScore,
  loadName,
  saveName,
  type ScoreEntry,
} from "./utils/highscore";
import Hud from "./components/Hud";
import TouchControls from "./components/TouchControls";
import { StartScreen, PauseScreen, GameOverScreen } from "./components/Overlays";

type Screen = "menu" | "playing" | "paused" | "over";

interface FeedItem {
  id: number;
  text: string;
  headshot: boolean;
}

const INITIAL_HUD: HudState = {
  health: 100,
  maxHealth: 100,
  ammo: 30,
  magSize: 30,
  reserve: 120,
  reloading: false,
  kills: 0,
  score: 0,
  alive: 50,
  zonePhase: 1,
  zoneText: "PHASE 1 • SHRINKS IN 14s",
  inZone: true,
  combo: 0,
  vehicleName: null,
  vehiclePrompt: null,
  vehicleSpeed: 0,
  vehicleIsAir: false,
  companionHealth: 100,
  companionMaxHealth: 100,
  companionStatus: "FOLLOWING",
  companionPrompt: null,
};

export default function App() {
  const containerRef = useRef<HTMLDivElement>(null);
  const engineRef = useRef<GameEngine | null>(null);
  const minimapRef = useRef<HTMLCanvasElement | null>(null);

  const [screen, setScreenState] = useState<Screen>("menu");
  const screenRef = useRef<Screen>("menu");
  const [hud, setHud] = useState<HudState>(INITIAL_HUD);
  const [feed, setFeed] = useState<FeedItem[]>([]);
  const [damageKey, setDamageKey] = useState(0);
  const [hitKey, setHitKey] = useState(0);
  const [hitHead, setHitHead] = useState(false);
  const [result, setResult] = useState<GameResult | null>(null);
  const [scores, setScores] = useState<ScoreEntry[]>([]);
  const [isRecord, setIsRecord] = useState(false);
  const [playerName, setPlayerName] = useState("");
  const [muted, setMuted] = useState(false);
  const [isTouch, setIsTouch] = useState(false);
  const [cameraMode, setCameraMode] = useState<CameraMode>("third");

  const feedId = useRef(0);

  const go = useCallback((s: Screen) => {
    screenRef.current = s;
    setScreenState(s);
  }, []);

  // detect touch + load persisted data
  useEffect(() => {
    setIsTouch(
      window.matchMedia?.("(pointer: coarse)").matches || "ontouchstart" in window
    );
    setScores(loadScores());
    setPlayerName(loadName());
  }, []);

  // create engine once
  useEffect(() => {
    if (!containerRef.current) return;
    const eng = new GameEngine(containerRef.current, {
      onHud: (s) => setHud(s),
      onKillFeed: (text, headshot) => {
        const id = ++feedId.current;
        setFeed((f) => [...f.slice(-4), { id, text, headshot }]);
        window.setTimeout(() => {
          setFeed((f) => f.filter((x) => x.id !== id));
        }, 3400);
      },
      onDamage: () => setDamageKey((k) => k + 1),
      onHitMarker: (head) => {
        setHitHead(head);
        setHitKey((k) => k + 1);
      },
      onGameOver: (r) => {
        const record = isHighScore(r.score);
        const entry = {
          name: playerNameRef.current || "ANON",
          score: r.score,
          kills: r.kills,
          placement: r.placement,
          result: (r.win ? "VICTORY" : "ELIMINATED") as "VICTORY" | "ELIMINATED",
        };
        const updated = saveScore(entry);
        setScores(updated);
        setIsRecord(record && r.score > 0);
        setResult(r);
        go("over");
      },
      onPauseRequest: () => {
        if (screenRef.current === "playing") {
          eng.pause();
          go("paused");
        }
      },
      onCameraModeChange: (mode) => setCameraMode(mode),
    });
    engineRef.current = eng;
    return () => {
      eng.dispose();
      engineRef.current = null;
    };
  }, [go]);

  // keep latest name in a ref for the engine callback
  const playerNameRef = useRef("");
  useEffect(() => {
    playerNameRef.current = playerName;
  }, [playerName]);

  // attach minimap canvas when playing
  useEffect(() => {
    const eng = engineRef.current;
    if (!eng) return;
    if (screen === "playing") eng.setMinimap(minimapRef.current);
    else eng.setMinimap(null);
  }, [screen]);

  // ---- actions ----
  const handleDeploy = useCallback(() => {
    sfx.init();
    sfx.setMuted(muted);
    sfx.resume();
    sfx.click();
    saveName(playerName);
    setFeed([]);
    engineRef.current?.startMatch();
    go("playing");
  }, [muted, playerName, go]);

  const handlePause = useCallback(() => {
    engineRef.current?.pause();
    go("paused");
  }, [go]);

  const handleResume = useCallback(() => {
    sfx.click();
    engineRef.current?.resume();
    go("playing");
  }, [go]);

  const handleRestart = useCallback(() => {
    sfx.click();
    setFeed([]);
    setResult(null);
    engineRef.current?.startMatch();
    go("playing");
  }, [go]);

  const handleMenu = useCallback(() => {
    sfx.click();
    engineRef.current?.abortMatch();
    setScores(loadScores());
    go("menu");
  }, [go]);

  const toggleMute = useCallback(() => {
    setMuted((m) => {
      const nv = !m;
      sfx.setMuted(nv);
      return nv;
    });
  }, []);

  // ---- touch control wiring ----
  const onTouchMove = useCallback((x: number, y: number) => {
    engineRef.current?.setMove(x, y);
    engineRef.current?.setSprint(y > 0.92);
  }, []);
  const onTouchLook = useCallback((dx: number, dy: number) => {
    engineRef.current?.addLook(dx, dy);
  }, []);
  const onTouchFire = useCallback((d: boolean) => engineRef.current?.setFiring(d), []);
  const onTouchJump = useCallback(() => engineRef.current?.pressJump(), []);
  const onTouchReload = useCallback(() => engineRef.current?.pressReload(), []);
  const onVehicleAction = useCallback(() => engineRef.current?.pressVehicleAction(), []);
  const handleCameraToggle = useCallback(() => {
    engineRef.current?.toggleCamera();
  }, []);

  return (
    <div className="relative h-full w-full overflow-hidden bg-[#0a0e12] text-white">
      {/* 3D canvas mount */}
      <div ref={containerRef} className="absolute inset-0" />

      {/* HUD + touch controls only while actively playing */}
      {screen === "playing" && (
        <>
          <Hud
            hud={hud}
            isTouch={isTouch}
            minimapRef={minimapRef}
            feed={feed}
            damageKey={damageKey}
            hitKey={hitKey}
            hitHead={hitHead}
            paused={false}
            muted={muted}
            onPause={handlePause}
            onToggleMute={toggleMute}
            cameraMode={cameraMode}
            onCameraToggle={handleCameraToggle}
            onVehicleAction={onVehicleAction}
          />
          {isTouch && (
            <TouchControls
              onMove={onTouchMove}
              onLook={onTouchLook}
              onFire={onTouchFire}
              onJump={onTouchJump}
              onReload={onTouchReload}
              onVehicleAction={onVehicleAction}
              vehiclePrompt={hud.companionPrompt ?? hud.vehiclePrompt}
              driving={Boolean(hud.vehicleName)}
              vehicleIsAir={hud.vehicleIsAir}
            />
          )}
        </>
      )}

      {screen === "menu" && (
        <StartScreen
          playerName={playerName}
          onNameChange={setPlayerName}
          onDeploy={handleDeploy}
          scores={scores}
          muted={muted}
          onToggleMute={toggleMute}
          isTouch={isTouch}
        />
      )}

      {screen === "paused" && (
        <PauseScreen
          onResume={handleResume}
          onRestart={handleRestart}
          onMenu={handleMenu}
          muted={muted}
          onToggleMute={toggleMute}
        />
      )}

      {screen === "over" && result && (
        <GameOverScreen
          result={result}
          scores={scores}
          isRecord={isRecord}
          onPlayAgain={handleRestart}
          onMenu={handleMenu}
        />
      )}
    </div>
  );
}
