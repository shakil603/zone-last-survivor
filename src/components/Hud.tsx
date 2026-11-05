import type { CameraMode, HudState } from "../game/GameEngine";

interface FeedItem {
  id: number;
  text: string;
  headshot: boolean;
}

interface Props {
  hud: HudState;
  isTouch: boolean;
  minimapRef: React.RefObject<HTMLCanvasElement | null>;
  feed: FeedItem[];
  damageKey: number;
  hitKey: number;
  hitHead: boolean;
  paused: boolean;
  muted: boolean;
  onPause: () => void;
  onToggleMute: () => void;
  cameraMode: CameraMode;
  onCameraToggle: () => void;
  onVehicleAction: () => void;
}

function healthColor(hp: number, max: number) {
  const f = hp / max;
  if (f > 0.5) return "#7CFF6B";
  if (f > 0.25) return "#ffcc33";
  return "#ff4d4d";
}

export default function Hud({
  hud,
  isTouch,
  minimapRef,
  feed,
  damageKey,
  hitKey,
  hitHead,
  paused,
  muted,
  onPause,
  onToggleMute,
  cameraMode,
  onCameraToggle,
  onVehicleAction,
}: Props) {
  const hp = hud.health;
  const hpColor = healthColor(hp, hud.maxHealth);
  const lowHp = hp <= 30;
  const outZone = !hud.inZone;
  const mayaColor = healthColor(hud.companionHealth, hud.companionMaxHealth);
  const interactionPrompt = hud.companionPrompt ?? hud.vehiclePrompt;

  const healthPos = isTouch
    ? "bottom-6 left-40 w-40"
    : "bottom-6 left-6 w-80";
  const ammoPos = isTouch ? "bottom-6 right-36 w-32" : "bottom-6 right-6";

  return (
    <div className="pointer-events-none absolute inset-0 z-20 font-hud select-none">
      {/* damage flash */}
      <div
        key={damageKey}
        className={damageKey > 0 ? "anim-damage pointer-events-none absolute inset-0" : "hidden"}
        style={{
          background:
            "radial-gradient(ellipse at center, transparent 40%, rgba(255,0,0,0.55) 100%)",
        }}
      />
      {/* low hp vignette */}
      {lowHp && !paused && (
        <div
          className="low-hp pointer-events-none absolute inset-0"
          style={{
            background:
              "radial-gradient(ellipse at center, transparent 45%, rgba(180,0,0,0.4) 100%)",
          }}
        />
      )}
      {/* vignette + scanline atmosphere */}
      <div className="vignette pointer-events-none absolute inset-0" />

      {/* ---------- CROSSHAIR ---------- */}
      <div className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2">
        <div className="relative h-10 w-10">
          {/* hit marker */}
          {hitKey > 0 && (
            <div
              key={hitKey}
              className="anim-hitmarker absolute left-1/2 top-1/2"
              style={{ color: hitHead ? "#ff4d4d" : "#ffffff" }}
            >
              <div
                className="absolute h-[3px] w-4 bg-current"
                style={{ transform: "translate(-50%,-50%) rotate(45deg)" }}
              />
              <div
                className="absolute h-[3px] w-4 bg-current"
                style={{ transform: "translate(-50%,-50%) rotate(-45deg)" }}
              />
            </div>
          )}
          {/* dot */}
          <div className="absolute left-1/2 top-1/2 h-1 w-1 -translate-x-1/2 -translate-y-1/2 rounded-full bg-emerald-300/90" />
          {/* arms */}
          <div className="absolute left-1/2 top-1/2 h-0.5 w-2 -translate-y-1/2 bg-emerald-300/80" style={{ transform: "translate(-14px,-50%)" }} />
          <div className="absolute left-1/2 top-1/2 h-0.5 w-2 -translate-y-1/2 bg-emerald-300/80" style={{ transform: "translate(8px,-50%)" }} />
          <div className="absolute left-1/2 top-1/2 h-2 w-0.5 -translate-x-1/2 bg-emerald-300/80" style={{ transform: "translate(-50%,-14px)" }} />
          <div className="absolute left-1/2 top-1/2 h-2 w-0.5 -translate-x-1/2 bg-emerald-300/80" style={{ transform: "translate(-50%,8px)" }} />
        </div>
      </div>

      {/* combo */}
      {hud.combo > 1 && (
        <div className="absolute left-1/2 top-[58%] -translate-x-1/2 text-center">
          <span className="font-display text-2xl font-black text-amber-400 drop-shadow-[0_0_8px_rgba(255,180,58,0.8)]">
            {hud.combo}x COMBO
          </span>
        </div>
      )}

      {/* ---------- MINIMAP ---------- */}
      <div className="absolute left-3 top-3">
        <div className="relative overflow-hidden rounded-md border border-cyan-400/30 bg-black/40 shadow-lg backdrop-blur-sm">
          <canvas
            ref={minimapRef}
            width={isTouch ? 104 : 132}
            height={isTouch ? 104 : 132}
            className="block"
          />
          <div className="absolute left-1 top-0.5 font-display text-[9px] tracking-widest text-cyan-300/80">
            TACMAP
          </div>
        </div>
      </div>

      {/* ---------- TOP CENTER STATS ---------- */}
      <div className="absolute left-1/2 top-3 -translate-x-1/2 text-center">
        <div className="clip-hud border border-white/10 bg-black/45 px-5 py-1.5 backdrop-blur-sm">
          <div className="flex items-center gap-3">
            <div>
              <div className="font-display text-2xl font-black leading-none text-white">
                {hud.alive}
              </div>
              <div className="text-[10px] tracking-[0.25em] text-white/50">ALIVE</div>
            </div>
            <div className="h-8 w-px bg-white/15" />
            <div className="text-left">
              <div className="font-display text-base font-bold text-amber-300">
                {hud.score.toLocaleString()}
              </div>
              <div className="text-[10px] tracking-widest text-white/50">SCORE</div>
            </div>
            <div className="h-8 w-px bg-white/15" />
            <div className="text-left">
              <div className="font-display text-base font-bold text-red-300">{hud.kills}</div>
              <div className="text-[10px] tracking-widest text-white/50">KILLS</div>
            </div>
          </div>
        </div>
        <div
          className="mt-1 inline-block rounded px-3 py-0.5 text-[11px] font-bold tracking-widest"
          style={{
            color: outZone ? "#ff4d4d" : hud.zoneText.includes("CLOSING") ? "#ff8a4d" : "#7fd6ff",
            background: outZone ? "rgba(255,40,40,0.18)" : "rgba(0,0,0,0.4)",
          }}
        >
          {outZone ? "⚠ OUTSIDE THE ZONE" : hud.zoneText}
        </div>
      </div>

      {/* ---------- TOP RIGHT BUTTONS ---------- */}
      <div className="pointer-events-auto absolute right-3 top-3 flex gap-2">
        <button
          onClick={onCameraToggle}
          aria-label="Switch camera view"
          className="flex h-9 min-w-11 items-center justify-center rounded border border-cyan-300/35 bg-black/45 px-1.5 font-display text-[10px] font-bold tracking-wide text-cyan-200 backdrop-blur-sm active:scale-95"
        >
          {cameraMode === "eye" ? "EYE" : "3RD"}
        </button>
        <button
          onClick={onToggleMute}
          className="flex h-9 w-9 items-center justify-center rounded border border-white/15 bg-black/45 text-base backdrop-blur-sm active:scale-95"
        >
          {muted ? "🔇" : "🔊"}
        </button>
        <button
          onClick={onPause}
          className="flex h-9 w-9 items-center justify-center rounded border border-white/15 bg-black/45 text-sm font-bold backdrop-blur-sm active:scale-95"
        >
          ❚❚
        </button>
      </div>

      {/* ---------- KILL FEED ---------- */}
      <div className="absolute right-3 top-16 flex w-56 flex-col items-end gap-1">
        {feed.map((f) => (
          <div
            key={f.id}
            className="anim-killpop clip-hud-l border border-white/10 bg-black/55 px-2.5 py-1 text-right text-xs font-semibold backdrop-blur-sm"
            style={{ color: f.headshot ? "#ff7a6a" : "#cfe9d6" }}
          >
            {f.text}
          </div>
        ))}
      </div>

      {/* ---------- VEHICLE INTERACTION ---------- */}
      {!isTouch && interactionPrompt && (
        <button
          onClick={onVehicleAction}
          className="pointer-events-auto absolute bottom-28 left-1/2 -translate-x-1/2 clip-btn border border-cyan-300/60 bg-cyan-950/75 px-4 py-2 font-display text-xs font-bold tracking-[0.16em] text-cyan-100 shadow-[0_0_16px_rgba(86,225,255,0.25)] backdrop-blur-sm active:scale-95"
        >
          {interactionPrompt} <span className="ml-1 text-cyan-300/65">[E]</span>
        </button>
      )}
      {hud.vehicleName && (
        <div className="absolute bottom-44 left-1/2 -translate-x-1/2 text-center">
          <div className="font-display text-xs font-bold tracking-[0.22em] text-cyan-200">
            {hud.vehicleName}
          </div>
          <div className="font-display text-[10px] tracking-[0.22em] text-white/55">
            {hud.vehicleSpeed} KM/H
          </div>
          <div className="mt-0.5 text-[9px] tracking-[0.16em] text-cyan-100/55">
            {hud.vehicleIsAir ? "JUMP: TAKE OFF / LAND" : "JUMP: BRAKE"}
          </div>
        </div>
      )}

      {/* ---------- COMPANION STATUS ---------- */}
      <div className="absolute left-3 top-[9.5rem] w-32 border-l-2 border-pink-300/60 bg-black/35 px-2 py-1.5 backdrop-blur-sm">
        <div className="flex items-center justify-between gap-2">
          <span className="font-display text-[10px] font-bold tracking-[0.18em] text-pink-200">MAYA</span>
          <span className="text-[9px] tracking-wide" style={{ color: mayaColor }}>
            {hud.companionHealth}
          </span>
        </div>
        <div className="mt-1 h-1.5 overflow-hidden rounded bg-black/60">
          <div
            className="h-full transition-all duration-150"
            style={{
              width: `${(hud.companionHealth / hud.companionMaxHealth) * 100}%`,
              background: mayaColor,
              boxShadow: `0 0 7px ${mayaColor}`,
            }}
          />
        </div>
        <div className="mt-0.5 truncate text-[8px] tracking-[0.1em] text-pink-100/65">
          {hud.companionStatus}
        </div>
      </div>

      {/* ---------- HEALTH ---------- */}
      <div className={`absolute ${healthPos}`}>
        <div className="mb-1 flex items-end justify-between">
          <span className="text-[11px] font-bold tracking-widest text-white/70">HEALTH</span>
          <span className="font-display text-lg font-black" style={{ color: hpColor }}>
            {hp}
          </span>
        </div>
        <div className="h-3 w-full overflow-hidden rounded-sm border border-white/20 bg-black/50">
          <div
            className="h-full rounded-sm transition-all duration-150"
            style={{
              width: `${(hp / hud.maxHealth) * 100}%`,
              background: `linear-gradient(90deg, ${hpColor}, ${hpColor}cc)`,
              boxShadow: `0 0 10px ${hpColor}88`,
            }}
          />
        </div>
      </div>

      {/* ---------- AMMO ---------- */}
      <div className={`absolute ${ammoPos} text-right`}>
        {hud.reloading ? (
          <div className="font-display text-sm font-bold tracking-widest text-amber-300 anim-pulse">
            RELOADING…
          </div>
        ) : (
          <div className="flex items-end justify-end gap-1">
            <span
              className="font-display text-4xl font-black leading-none"
              style={{ color: hud.ammo <= 5 ? "#ff4d4d" : "#ffffff" }}
            >
              {hud.ammo}
            </span>
            <span className="mb-0.5 font-display text-base font-bold text-white/45">
              / {hud.reserve}
            </span>
          </div>
        )}
        <div className="text-[10px] tracking-[0.3em] text-white/45">AMMO</div>
      </div>
    </div>
  );
}
