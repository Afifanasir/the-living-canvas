import geometry from "@/lib/frame-geometry.json";

// The paintings hang in the very frame the artists hang in on the gallery wall: it is cut from the room, enlarged
// and cleaned by scripts/frame-pieces.ts, and drawn here as a 9-slice border. The corners stay exactly as carved;
// along longer sides the run of sprig, shell cartouche, sprig repeats (evenly, slightly resized), as it would on a
// real frame made for a long painting.

const RAIL = (geometry.rail.t + geometry.rail.r + geometry.rail.b + geometry.rail.l) / 4;
const { x: CX, y: CY } = geometry.corner;

type Props = { w: number; h: number; rail: number; className?: string; style?: React.CSSProperties };

/** `w` × `h` is the outer size of the frame and `rail` its depth on screen (the picture sits inside it), in px. */
export default function CarvedFrame({ w, h, rail, className = "", style }: Props) {
  const k = rail / RAIL;
  return (
    <span
      aria-hidden
      className={`pointer-events-none absolute [border-style:solid] [filter:drop-shadow(0_18px_22px_rgb(0_0_0/0.6))_drop-shadow(0_4px_6px_rgb(0_0_0/0.45))] ${className}`}
      style={{
        width: w,
        height: h,
        borderWidth: `${CY * k}px ${CX * k}px`,
        borderImage: `url(/frames/frame-source.webp) ${CY} ${CX} round`,
        ...style,
      }}
    />
  );
}
