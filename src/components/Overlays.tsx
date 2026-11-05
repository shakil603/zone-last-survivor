import type { GameResult } from "../game/GameEngine";
import type { ScoreEntry } from "../utils/highscore";
import { rankSuffix } from "../utils/highscore";

function fmtTime(ms: number) {
  const s = Math.floor(ms / 1000);
  const m = Math.floor(s / 60);
  return `${m}:${String(s % 60).padStart(2, "0")}`;
}

/* ============================ START SCREEN ============================ */
export function StartScreen({
  playerName,
  onNameChange,
  onDeploy,
  scores,
  muted,
  onToggleMute,
  isTouch,
}: {
  playerName: string;
  onNameChange: (v: string) => void;
  onDeploy: () => void;
  scores: ScoreEntry[];
  muted: boolean;
  onToggleMute: () => void;
  isTouch: boolean;
}) {
  return (
    <div className="absolute inset-0 z-40 flex items-center justify-center overflow-y-auto p-4">
      <div className="absolute inset-0 bg-gradient-to-b from-black/70 via-black/40 to-black/80" />
      <div className="hud-grid absolute inset-0 opacity-40" />

      <div className="relative z-10 w-full max-w-lg">
        {/* title */}
        <div className="mb-6 text-center anim-rise">
          <div className="mb-1 font-display text-xs tracking-[0.5em] text-amber-400/80">
            3D BATTLE ROYALE
          </div>
          <h1 className="anim-titleglow font-display text-5xl font-black leading-none text-amber-300 sm:text-6xl">
            ZONE
          </h1>
          <div className="mt-1 font-display text-2xl font-bold tracking-[0.3em] text-white sm:text-3xl">
            LAST SURVIVOR
          </div>
          <p className="mx-auto mt-3 max-w-sm text-sm text-white/60">
            50 drop in. The zone closes. Outgun the squads, loot the fallen,
            and be the last one standing.
          </p>
        </div>

        {/* deploy card */}
        <div className="clip-hud border border-amber-400/30 bg-black/55 p-5 backdrop-blur-md anim-rise">
          <label className="mb-1 block text-[11px] tracking-widest text-white/50">
            CALLSIGN
          </label>
          <input
            value={playerName}
            onChange={(e) => onNameChange(e.target.value)}
            maxLength={12}
            placeholder="ENTER NAME"
            className="mb-4 w-full rounded border border-white/15 bg-black/50 px-3 py-2 font-display text-lg font-bold tracking-wider text-amber-200 outline-none focus:border-amber-400/60"
          />
          <button
            onClick={onDeploy}
            className="group relative w-full overflow-hidden rounded border-2 border-amber-400 bg-gradient-to-r from-amber-500 to-orange-600 py-3 font-display text-xl font-black tracking-[0.2em] text-black shadow-[0_0_25px_rgba(255,150,40,0.5)] transition active:scale-[0.98]"
          >
            ► DEPLOY
          </button>

          <div className="mt-4 grid grid-cols-2 gap-x-4 gap-y-1 text-[11px] text-white/55">
            {isTouch ? (
              <>
                <Hint k="LEFT STICK" v="Move" />
                <Hint k="DRAG RIGHT" v="Aim" />
                <Hint k="FIRE BTN" v="Shoot" />
                <Hint k="JUMP / RELOAD" v="Buttons" />
              </>
            ) : (
              <>
                <Hint k="WASD / ←↑↓→" v="Move" />
                <Hint k="MOUSE" v="Aim" />
                <Hint k="CLICK" v="Shoot" />
                <Hint k="SHIFT / SPACE" v="Sprint / Jump" />
                <Hint k="R" v="Reload" />
                <Hint k="ESC" v="Pause" />
              </>
            )}
          </div>
        </div>

        {/* high scores */}
        <HighScoreList scores={scores} className="mt-4 anim-rise" />

        <button
          onClick={onToggleMute}
          className="mx-auto mt-4 block text-xs tracking-widest text-white/40 hover:text-white/70"
        >
          SOUND: {muted ? "OFF 🔇" : "ON 🔊"}
        </button>
      </div>
    </div>
  );
}

function Hint({ k, v }: { k: string; v: string }) {
  return (
    <div className="flex items-center justify-between gap-2 border-b border-white/5 py-0.5">
      <span className="font-display font-bold text-amber-300/80">{k}</span>
      <span className="text-white/45">{v}</span>
    </div>
  );
}

/* ============================ HIGH SCORE LIST ============================ */
export function HighScoreList({
  scores,
  className = "",
}: {
  scores: ScoreEntry[];
  className?: string;
}) {
  return (
    <div className={`clip-hud border border-white/10 bg-black/45 p-3 backdrop-blur-sm ${className}`}>
      <div className="mb-2 flex items-center justify-between">
        <span className="font-display text-xs font-bold tracking-[0.25em] text-cyan-300">
          ◆ HALL OF SURVIVORS
        </span>
        <span className="text-[10px] tracking-widest text-white/30">TOP 10</span>
      </div>
      {scores.length === 0 ? (
        <div className="py-3 text-center text-xs text-white/35">
          No records yet. Be the first legend.
        </div>
      ) : (
        <div className="thin-scroll max-h-44 overflow-y-auto pr-1">
          {scores.map((s, i) => (
            <div
              key={i}
              className={`flex items-center gap-2 border-b border-white/5 py-1 text-xs ${
                i === 0 ? "text-amber-300" : "text-white/70"
              }`}
            >
              <span className="w-7 font-display font-bold">{i + 1}.</span>
              <span className="flex-1 truncate font-semibold">
                {s.name || "ANON"}
                {s.result === "VICTORY" && (
                  <span className="ml-1 text-emerald-400">👑</span>
                )}
              </span>
              <span className="font-display font-bold text-amber-300">
                {s.score.toLocaleString()}
              </span>
              <span className="w-12 text-right text-white/40">{s.kills}k</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

/* ============================ PAUSE SCREEN ============================ */
export function PauseScreen({
  onResume,
  onRestart,
  onMenu,
  muted,
  onToggleMute,
}: {
  onResume: () => void;
  onRestart: () => void;
  onMenu: () => void;
  muted: boolean;
  onToggleMute: () => void;
}) {
  return (
    <div className="absolute inset-0 z-40 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" />
      <div className="relative z-10 w-full max-w-sm text-center anim-rise">
        <h2 className="font-display text-4xl font-black tracking-[0.3em] text-white">
          PAUSED
        </h2>
        <div className="mt-6 space-y-3">
          <MenuBtn onClick={onResume} primary>
            ► RESUME
          </MenuBtn>
          <MenuBtn onClick={onRestart}>↻ RESTART</MenuBtn>
          <MenuBtn onClick={onMenu}>⌂ MAIN MENU</MenuBtn>
          <button
            onClick={onToggleMute}
            className="mx-auto mt-2 block text-xs tracking-widest text-white/40 hover:text-white/70"
          >
            SOUND: {muted ? "OFF 🔇" : "ON 🔊"}
          </button>
        </div>
      </div>
    </div>
  );
}

/* ============================ GAME OVER ============================ */
export function GameOverScreen({
  result,
  scores,
  isRecord,
  onPlayAgain,
  onMenu,
}: {
  result: GameResult;
  scores: ScoreEntry[];
  isRecord: boolean;
  onPlayAgain: () => void;
  onMenu: () => void;
}) {
  const win = result.win;
  const acc = result.shots > 0 ? Math.round((result.hits / result.shots) * 100) : 0;
  return (
    <div className="absolute inset-0 z-40 flex items-center justify-center overflow-y-auto p-4">
      <div
        className="absolute inset-0"
        style={{
          background: win
            ? "radial-gradient(ellipse at center, rgba(20,80,30,0.65), rgba(0,0,0,0.85))"
            : "radial-gradient(ellipse at center, rgba(90,15,15,0.6), rgba(0,0,0,0.88))",
        }}
      />
      <div className="relative z-10 w-full max-w-md py-6">
        <div className="text-center anim-rise">
          {win ? (
            <>
              <div className="text-5xl anim-floaty">🏆</div>
              <h2 className="mt-2 font-display text-4xl font-black tracking-wider text-emerald-300 anim-titleglow">
                VICTORY!
              </h2>
              <div className="font-display text-sm tracking-[0.3em] text-emerald-100/70">
                #1 · WINNER WINNER
              </div>
            </>
          ) : (
            <>
              <div className="text-5xl">💀</div>
              <h2 className="mt-2 font-display text-4xl font-black tracking-wider text-red-400">
                ELIMINATED
              </h2>
              <div className="font-display text-sm tracking-[0.3em] text-red-200/70">
                {rankSuffix(result.placement)} PLACE
              </div>
            </>
          )}
        </div>

        {/* score */}
        <div className="my-5 text-center anim-rise">
          <div className="text-[11px] tracking-[0.3em] text-white/45">FINAL SCORE</div>
          <div className="font-display text-5xl font-black text-amber-300 drop-shadow-[0_0_14px_rgba(255,180,58,0.7)]">
            {result.score.toLocaleString()}
          </div>
          {isRecord && (
            <div className="mt-1 font-display text-sm font-bold tracking-widest text-cyan-300 anim-pulse">
              ★ NEW RECORD ★
            </div>
          )}
        </div>

        {/* stats grid */}
        <div className="grid grid-cols-3 gap-2 anim-rise">
          <Stat label="KILLS" value={`${result.kills}`} />
          <Stat label="HEADSHOTS" value={`${result.headshots}`} />
          <Stat label="ACCURACY" value={`${acc}%`} />
          <Stat label="SURVIVED" value={fmtTime(result.timeMs)} />
          <Stat label="SHOTS" value={`${result.shots}`} />
          <Stat label="PLACE" value={rankSuffix(result.placement)} />
        </div>

        <HighScoreList scores={scores} className="mt-4 anim-rise" />

        <div className="mt-5 grid grid-cols-2 gap-3 anim-rise">
          <MenuBtn onClick={onPlayAgain} primary>
            ↻ PLAY AGAIN
          </MenuBtn>
          <MenuBtn onClick={onMenu}>⌂ MENU</MenuBtn>
        </div>
      </div>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="clip-hud border border-white/10 bg-black/45 px-2 py-2 text-center backdrop-blur-sm">
      <div className="font-display text-xl font-black text-white">{value}</div>
      <div className="text-[9px] tracking-[0.2em] text-white/45">{label}</div>
    </div>
  );
}

function MenuBtn({
  children,
  onClick,
  primary,
}: {
  children: React.ReactNode;
  onClick: () => void;
  primary?: boolean;
}) {
  return (
    <button
      onClick={onClick}
      className={
        primary
          ? "clip-btn w-full border-2 border-amber-400 bg-gradient-to-r from-amber-500 to-orange-600 py-3 font-display text-base font-black tracking-[0.15em] text-black shadow-[0_0_18px_rgba(255,150,40,0.45)] transition active:scale-[0.98]"
          : "clip-btn w-full border border-white/20 bg-white/5 py-3 font-display text-base font-bold tracking-[0.15em] text-white/85 backdrop-blur-sm transition hover:bg-white/10 active:scale-[0.98]"
      }
    >
      {children}
    </button>
  );
}
