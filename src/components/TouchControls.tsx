import { useRef } from "react";

interface Props {
  onMove: (x: number, y: number) => void;
  onLook: (dx: number, dy: number) => void;
  onFire: (down: boolean) => void;
  onJump: () => void;
  onReload: () => void;
  onVehicleAction: () => void;
  vehiclePrompt: string | null;
  driving: boolean;
  vehicleIsAir: boolean;
}

export default function TouchControls({
  onMove,
  onLook,
  onFire,
  onJump,
  onReload,
  onVehicleAction,
  vehiclePrompt,
  driving,
  vehicleIsAir,
}: Props) {
  return (
    <>
      {/* Look surface — sits BELOW the HUD (z-10) so HUD buttons stay tappable */}
      <LookLayer onLook={onLook} />

      <Joystick onMove={onMove} />

      {vehiclePrompt && (
        <button
          className="pointer-events-auto absolute bottom-40 left-8 z-30 flex h-12 w-32 items-center justify-center rounded-full border border-cyan-300/70 bg-cyan-900/60 px-2 text-cyan-100 backdrop-blur-sm active:scale-95"
          style={{ touchAction: "none" }}
          onPointerDown={(e) => {
            e.preventDefault();
            onVehicleAction();
          }}
        >
          <span className="font-display text-[11px] font-bold tracking-wide">
            {vehiclePrompt.startsWith("REVIVE")
              ? "REVIVE"
              : vehiclePrompt.startsWith("EXIT")
                ? "EXIT"
                : "RIDE"}
          </span>
        </button>
      )}

      {/* Fire */}
      <button
        className="pointer-events-auto absolute bottom-8 right-8 z-30 flex h-28 w-28 items-center justify-center rounded-full border-2 border-red-400/60 bg-red-500/20 text-red-200 backdrop-blur-sm active:scale-95 active:bg-red-500/50"
        style={{ touchAction: "none" }}
        onPointerDown={(e) => {
          e.preventDefault();
          (e.target as Element).setPointerCapture?.(e.pointerId);
          onFire(true);
        }}
        onPointerUp={(e) => {
          e.preventDefault();
          onFire(false);
        }}
        onPointerCancel={() => onFire(false)}
      >
        <span className="font-display text-lg font-bold tracking-wider">FIRE</span>
      </button>

      {/* Jump */}
      <button
        className="pointer-events-auto absolute bottom-40 right-10 z-30 flex h-16 w-16 items-center justify-center rounded-full border border-cyan-300/50 bg-cyan-500/15 text-cyan-100 backdrop-blur-sm active:scale-95 active:bg-cyan-500/40"
        style={{ touchAction: "none" }}
        onPointerDown={(e) => {
          e.preventDefault();
          onJump();
        }}
      >
        <span className="font-display text-xs font-bold">
          {driving ? (vehicleIsAir ? "LIFT" : "BRAKE") : "JUMP"}
        </span>
      </button>

      {/* Reload */}
      <button
        className="pointer-events-auto absolute bottom-8 right-40 z-30 flex h-16 w-16 items-center justify-center rounded-full border border-amber-300/50 bg-amber-500/15 text-amber-100 backdrop-blur-sm active:scale-95 active:bg-amber-500/40"
        style={{ touchAction: "none" }}
        onPointerDown={(e) => {
          e.preventDefault();
          onReload();
        }}
      >
        <span className="font-display text-[11px] font-bold">RELOAD</span>
      </button>
    </>
  );
}

function LookLayer({ onLook }: { onLook: (dx: number, dy: number) => void }) {
  const st = useRef({ id: -1, x: 0, y: 0, active: false });
  return (
    <div
      className="pointer-events-auto absolute inset-0 z-10"
      style={{ touchAction: "none" }}
      onPointerDown={(e) => {
        st.current = { id: e.pointerId, x: e.clientX, y: e.clientY, active: true };
        (e.target as Element).setPointerCapture?.(e.pointerId);
      }}
      onPointerMove={(e) => {
        if (!st.current.active || e.pointerId !== st.current.id) return;
        const dx = e.clientX - st.current.x;
        const dy = e.clientY - st.current.y;
        st.current.x = e.clientX;
        st.current.y = e.clientY;
        onLook(dx, dy);
      }}
      onPointerUp={(e) => {
        if (e.pointerId === st.current.id) st.current.active = false;
      }}
      onPointerCancel={() => (st.current.active = false)}
    />
  );
}

function Joystick({ onMove }: { onMove: (x: number, y: number) => void }) {
  const baseRef = useRef<HTMLDivElement>(null);
  const knobRef = useRef<HTMLDivElement>(null);
  const st = useRef({ id: -1, cx: 0, cy: 0, active: false });
  const R = 52;

  const apply = (clientX: number, clientY: number) => {
    let dx = clientX - st.current.cx;
    let dy = clientY - st.current.cy;
    const dist = Math.hypot(dx, dy);
    if (dist > R) {
      dx = (dx / dist) * R;
      dy = (dy / dist) * R;
    }
    if (knobRef.current) knobRef.current.style.transform = `translate(${dx}px, ${dy}px)`;
    onMove(dx / R, -dy / R);
  };

  return (
    <div
      ref={baseRef}
      className="pointer-events-auto absolute bottom-8 left-8 z-30 flex h-32 w-32 items-center justify-center rounded-full border border-white/15 bg-white/5 backdrop-blur-sm"
      style={{ touchAction: "none" }}
      onPointerDown={(e) => {
        e.preventDefault();
        const rect = baseRef.current!.getBoundingClientRect();
        st.current = {
          id: e.pointerId,
          cx: rect.left + rect.width / 2,
          cy: rect.top + rect.height / 2,
          active: true,
        };
        (e.target as Element).setPointerCapture?.(e.pointerId);
        apply(e.clientX, e.clientY);
      }}
      onPointerMove={(e) => {
        if (!st.current.active || e.pointerId !== st.current.id) return;
        apply(e.clientX, e.clientY);
      }}
      onPointerUp={(e) => {
        if (e.pointerId !== st.current.id) return;
        st.current.active = false;
        if (knobRef.current) knobRef.current.style.transform = "translate(0,0)";
        onMove(0, 0);
      }}
      onPointerCancel={() => {
        st.current.active = false;
        if (knobRef.current) knobRef.current.style.transform = "translate(0,0)";
        onMove(0, 0);
      }}
    >
      <div className="absolute h-full w-full rounded-full border border-white/5" />
      <div
        ref={knobRef}
        className="h-14 w-14 rounded-full border border-white/30 bg-gradient-to-br from-white/40 to-white/10 shadow-lg"
      />
    </div>
  );
}
