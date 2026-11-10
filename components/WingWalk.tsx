"use client";

import Image from "next/image";
import { useEffect, useRef, useState } from "react";
import { preload } from "react-dom";
import { motion, transform, useTransform, type MotionValue } from "motion/react";
import { exhibits, periods, type Exhibit, type Period } from "@/content/gallery";

// Each wing is one painted room (public/rooms/<wing>.webp, 16:9): a lit wall panel for the wing's text, two carved
// frames for its artists and a plaque under each. Portraits and lettering are laid into the measured spots, so
// they sit in the room's own light. (The plaques baked into the rooms are covered by taller ones.) Boxes are fractions of the room image: [x, y, w, h] from its top-left.
export type Box = [number, number, number, number];
type Room = { panel: Box; frames: [Box, Box]; rail: number };
const ROOMS: Record<string, Room> = {
  renaissance: { panel: [0.105, 0.212, 0.147, 0.383], frames: [[0.432, 0.244, 0.132, 0.292], [0.746, 0.244, 0.132, 0.293]], rail: 0.709 },
  baroque: { panel: [0.115, 0.223, 0.157, 0.375], frames: [[0.43, 0.249, 0.136, 0.284], [0.735, 0.25, 0.132, 0.282]], rail: 0.712 },
  romanticism: { panel: [0.1, 0.194, 0.162, 0.391], frames: [[0.43, 0.219, 0.135, 0.304], [0.75, 0.219, 0.133, 0.304]], rail: 0.69 },
  expressionism: { panel: [0.111, 0.211, 0.165, 0.402], frames: [[0.425, 0.231, 0.145, 0.303], [0.73, 0.23, 0.144, 0.304]], rail: 0.7 },
};
/** The carved frame around each opening, as a fraction of the room (for hover light and the flip's start). */
const FRAME_PAD = { x: 0.025, y: 0.045 };
const ROOM_RATIO = 16 / 9;
/** The camera stands a little closer than the full wall, so lettering reads at desktop sizes; only bare margins are cropped. */
const CLOSER = 1.12;
const roomWidth = (W: number, H: number) => Math.max(W * CLOSER, H * ROOM_RATIO);

export const WINGS = periods.map((wing) => ({ wing, exhibits: exhibits.filter((e) => e.period === wing.id) }));

/** One resting place of the camera: a wing, and the point of its room (fraction of the width) centred on screen. */
export type View = { wing: number; focus: number };
const centre = ([x, , w]: Box) => x + w / 2;

/**
 * On screens wide enough to show the whole wall, each wing is a single view: one scroll per wing.
 * On narrower screens the camera pans across the same room: the wall text, then each artist.
 */
export function viewsFor(width: number, height: number): View[] {
  const wide = width >= 0.84 * roomWidth(width, height); // the whole wall, panel to second frame, fits
  return WINGS.flatMap(({ wing }, w) => {
    const r = ROOMS[wing.id];
    return wide ? [{ wing: w, focus: 0.5 }] : [centre(r.panel), centre(r.frames[0]), centre(r.frames[1])].map((focus) => ({ wing: w, focus }));
  });
}

/** Which view a link lands on: #<wing id> or #<exhibit slug>. */
export function viewForHash(views: View[], hash: string) {
  const w = WINGS.findIndex(({ wing, exhibits }) => wing.id === hash || exhibits.some((e) => e.slug === hash));
  if (w < 0) return -1;
  const first = views.findIndex((v) => v.wing === w);
  const artist = WINGS[w].exhibits.findIndex((e) => e.slug === hash);
  const perWing = views.filter((v) => v.wing === w).length;
  return artist >= 0 && perWing > 1 ? first + 1 + artist : first;
}

type Props = {
  /** Fractional view index: 0 = Wing I … views.length - 1 = the last view. */
  stop: MotionValue<number>;
  /** 0 → 1 as the visitor steps from the hall into the first wing. */
  enter: MotionValue<number>;
  /** The visitor is on the gallery walk. Before that the wings are inert: their buttons (which switch pointer events back
   *  on for themselves) must not catch clicks meant for the foyer. */
  walking: boolean;
  /** Live screen size, read every frame so the rooms stay placed through any resize. */
  size: MotionValue<{ width: number; height: number }>;
  views: View[];
  current: number;
  goTo: (view: number) => void;
  /** `outer` is the carved frame and `opening` the portrait, as [x, y, w, h] fractions of the wing's room image. */
  onEnter: (exhibit: Exhibit, frame: HTMLElement, outer: Box, opening: Box) => void;
};

export default function WingWalk({ stop, enter, size, views, current, goTo, onEnter, walking }: Props) {
  const scale = useTransform(() => transform(enter.get(), [0, 1], [1.08, 1]));
  const ui = useTransform(() => transform(enter.get(), [0.6, 1], [0, 1]));
  const pointerEvents = useTransform(() => (enter.get() > 0.6 ? "auto" : "none"));
  const wing = views[current]?.wing ?? 0;

  return (
    <motion.div inert={walking ? undefined : true} className="absolute inset-0 overflow-hidden bg-ink" style={{ opacity: enter, pointerEvents }}>
      <motion.div className="absolute inset-0" style={{ scale }}>
        {WINGS.map((w, i) => (
          <RoomLayer key={w.wing.id} index={i} active={i === wing} stop={stop} size={size} onEnter={onEnter} />
        ))}
      </motion.div>

      <motion.div style={{ opacity: ui }}>
        <Arrow side="left" disabled={current === 0} onClick={() => goTo(current - 1)} />
        <Arrow side="right" disabled={current === views.length - 1} onClick={() => goTo(current + 1)} />
        <Timeline current={wing} goTo={(w) => goTo(views.findIndex((v) => v.wing === w))} />
      </motion.div>
    </motion.div>
  );
}

/** One wing's room. The camera pans to the current view; moving to the next wing, this room slides away and darkens as the next one comes in. */
function RoomLayer({ index, active, stop, size, onEnter }: { index: number; active: boolean; stop: MotionValue<number>; size: Props["size"]; onEnter: Props["onEnter"] }) {
  const { wing, exhibits } = WINGS[index];
  const room = ROOMS[wing.id];

  const state = useTransform(() => {
    const { width: W, height: H } = size.get(), vs = viewsFor(W, H);
    const t = Math.min(vs.length - 1, Math.max(0, stop.get()));
    const a = vs.findIndex((v) => v.wing === index), b = vs.findLastIndex((v) => v.wing === index);
    const u = t < a ? Math.min(1, a - t) : t > b ? Math.min(1, t - b) : 0; // how far this room is from being the one in view
    const dir = t < a ? 1 : t > b ? -1 : 0;
    const tt = Math.min(b, Math.max(a, t)), i = Math.floor(tt), f = tt - i;
    const focus = vs[i].focus + ((vs[i + 1]?.wing === index ? vs[i + 1].focus : vs[i].focus) - vs[i].focus) * f;
    const rw = roomWidth(W, H);
    const left = Math.min(0, Math.max(W - rw, W / 2 - focus * rw)) + dir * u * 0.12 * W;
    return { left, u };
  });
  const x = useTransform(() => state.get().left);
  // Rooms never overlap: one darkens out, the doorway is dark for an instant, then the next lights up.
  const opacity = useTransform(() => Math.max(0, 1 - 2 * state.get().u));
  const visibility = useTransform(() => (state.get().u >= 1 ? "hidden" : "visible"));
  const pointerEvents = useTransform(() => (state.get().u < 0.5 ? "auto" : "none"));

  return (
    <motion.section className="absolute inset-0" style={{ opacity, visibility, pointerEvents }} aria-label={`Wing ${wing.numeral}: ${wing.name}`}>
      {/* The room covers the screen at 16:9; its contents scale with it (container units), so nothing drifts off its spot. */}
      <motion.div className="absolute top-1/2 left-0 aspect-video w-[max(112vw,177.78dvh)] -translate-y-1/2 [container-type:inline-size]" style={{ x }}>
        <Image src={`/rooms/${wing.id}.webp`} alt="" fill sizes="(min-aspect-ratio: 16/9) 100vw, 178dvh" priority={index === 0} className="object-cover" />
        <WallPanel wing={wing} box={room.panel} />
        {exhibits.map((e, i) => (
          <Artist key={e.slug} exhibit={e} frame={room.frames[i]} rail={room.rail} active={active} onEnter={onEnter} />
        ))}
      </motion.div>
    </motion.section>
  );
}

const at = ([x, y, w, h]: Box) => ({ left: `${x * 100}%`, top: `${y * 100}%`, width: `${w * 100}%`, height: `${h * 100}%` });

/** The wing's introduction: a large brass-rimmed plate set into the dark wooden panel, every line engraved
 *  into it like the artists' plaques. */
function WallPanel({ wing, box }: { wing: Period; box: Box }) {
  const long = wing.name.length > 20;
  return (
    <div className="absolute p-[0.75cqw]" style={at(box)}>
      <div className="engraved relative flex size-full flex-col items-center justify-center [border-image:url(/rooms/plaque.webp)_16_24_fill] [border-style:solid] [border-width:0.62cqw_1.2cqw] px-[0.2cqw] text-center shadow-[0_0.5cqw_1.2cqw_-0.3cqw_rgb(0_0_0/0.8)]">
        <p className="font-display text-[0.6cqw] font-semibold tracking-[0.42em] text-[#6b5434] uppercase">Wing {wing.numeral}</p>
        <h2 className={`mt-[0.5cqw] font-display leading-[1.12] font-semibold tracking-[0.08em] text-balance text-[#2e2217] uppercase ${long ? "text-[0.92cqw]" : "text-[1.25cqw]"}`}>{wing.name}</h2>
        <p className="mt-[0.35cqw] font-serif text-[0.74cqw] text-[#5c4a36] italic">{wing.years}</p>
        <Flourish />
        <p className="font-display text-[0.56cqw] font-semibold tracking-[0.16em] whitespace-nowrap text-[#4a3a28] uppercase">{wing.theme}</p>
        <p className="mt-[0.6cqw] font-serif text-[0.64cqw] leading-[1.42] text-pretty text-[#3a2d20]">{wing.intro}</p>
        {/* After a breath: the two paintings in this wing and the question they pose, then the invitation. */}
        <p className="mt-[0.75cqw] font-serif text-[0.66cqw] leading-[1.38] text-pretty text-[#2e2217] italic">{wing.teaser}</p>
        <p className="mt-[0.55cqw] font-display text-[0.5cqw] font-semibold tracking-[0.2em] text-[#5c4630] uppercase">Step inside to find out</p>
      </div>
    </div>
  );
}

function Flourish() {
  return (
    <svg viewBox="0 0 240 16" aria-hidden className="my-[0.6cqw] h-auto w-[6cqw] text-[#6b5434] drop-shadow-[0_1px_0_rgb(255_250_236/0.6)]" fill="none" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round">
      <path d="M2 8H98M142 8H238" />
      <path d="M116 8C112 2.5 104 3 103.5 8C103 12.5 109.5 13 110.5 9.5M124 8C128 2.5 136 3 136.5 8C137 12.5 130.5 13 129.5 9.5" />
      <path d="M120 3.5L124 8L120 12.5L116 8Z" fill="currentColor" stroke="none" />
    </svg>
  );
}

/** One artist: the portrait set into the room's carved frame, and the plaque below it. */
function Artist({ exhibit: e, frame, rail, active, onEnter }: { exhibit: Exhibit; frame: Box; rail: number; active: boolean; onEnter: Props["onEnter"] }) {
  const outer = useRef<HTMLButtonElement>(null);
  // Arriving in a wing, each portrait briefly shows that it is a door, then the wall goes quiet again.
  const [teach, setTeach] = useState(false);
  useEffect(() => {
    if (!active) return;
    const show = setTimeout(() => setTeach(true), 700);
    const hide = setTimeout(() => setTeach(false), 3700);
    return () => {
      clearTimeout(show);
      clearTimeout(hide);
    };
  }, [active]);
  const on = teach && active;
  const [fx, fy, fw, fh] = frame;
  const outerBox: Box = [fx - FRAME_PAD.x, fy - FRAME_PAD.y, fw + 2 * FRAME_PAD.x, fh + 2 * FRAME_PAD.y];
  // The frame that lifts off the wall when this artist is clicked (components/FrameFlip.tsx): ready before the click.
  preload(`/rooms/frames/${e.slug}.webp`, { as: "image" });
  // And the painting itself, so the room it opens into never shows an empty frame while it downloads.
  for (const f of ["base", "depth"]) preload(`/exhibits/${e.slug}/${f}.webp`, { as: "image", fetchPriority: "low" });
  const enter = () => outer.current && onEnter(e, outer.current, outerBox, frame);
  // The plaque hangs below the frame's carving (which ends 0.046 below the opening in every room), with clear wall
  // above and below it.
  const plaqueTop = fy + fh + 0.046 + 0.014;
  const plaqueBox: Box = [fx + fw / 2 - 0.1, plaqueTop, 0.2, Math.min(0.1, rail - 0.014 - plaqueTop)];

  return (
    <div className="group pointer-events-none absolute inset-0">
      {/* The portrait, seated behind the frame's lip and lit from the spotlight above. */}
      <div className="absolute overflow-hidden bg-[#140e09]" style={at(frame)}>
        <Image
          src={e.portrait}
          alt={e.portraitNote ? `Detail standing in for ${e.artist}` : `Portrait of ${e.artist}`}
          fill
          sizes="20vw"
          className="object-cover brightness-[0.88] transition duration-700 group-focus-within:scale-[1.03] group-focus-within:brightness-105 group-hover:scale-[1.03] group-hover:brightness-105"
        />
        <span aria-hidden className="absolute inset-0 bg-[radial-gradient(ellipse_100%_70%_at_50%_0%,rgb(255_228_180/0.14),transparent_65%),linear-gradient(to_bottom,transparent_60%,rgb(0_0_0/0.35))] shadow-[inset_0_0_1.2cqw_rgb(0_0_0/0.85),inset_0_0.4cqw_0.8cqw_rgb(0_0_0/0.6)]" />
        {/* "Step into Leonardo's world": an arrow in a gilt ring (the universal "go" control) and one line in one face over a warm vignette. Shown briefly on arrival, on hover and keyboard
            focus, and always on touch screens (they have no hover). */}
        <span
          aria-hidden
          className={`absolute inset-0 flex flex-col items-center justify-end gap-[0.45cqw] bg-[radial-gradient(ellipse_80%_65%_at_50%_100%,rgb(12_8_5/0.72),transparent_75%)] pb-[1.4cqw] transition-opacity duration-500 group-focus-within:opacity-100 group-hover:opacity-100 [@media(hover:none)]:opacity-100 ${on ? "opacity-100" : "opacity-0"}`}
        >
          <span className="grid size-[2.6cqw] place-items-center rounded-full border border-gilt/90 bg-[rgb(14_9_6/0.55)] text-[#f3d58a] shadow-[0_0_1.2cqw_rgb(201_164_92/0.45),inset_0_0_0.6cqw_rgb(201_164_92/0.25)] backdrop-blur-[2px]">
            <svg viewBox="0 0 24 24" className="size-[1.25cqw]" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
              <path d="M5 12h13.5M13.5 7l5 5-5 5" />
            </svg>
          </span>
          <span className="max-w-[90%] text-center font-display text-[0.54cqw] leading-[1.5] font-semibold tracking-[0.2em] text-balance text-[#f3e3bd] uppercase [text-shadow:0_1px_6px_rgb(0_0_0/0.9)]">
            Step into {e.known}&rsquo;s world
          </span>
        </span>
      </div>
      {/* Hovering warms the spotlight on the whole frame. */}
      <span aria-hidden className="absolute bg-[radial-gradient(ellipse_70%_60%_at_50%_35%,rgb(255_214_140/0.22),transparent_70%)] opacity-0 mix-blend-screen transition duration-500 group-hover:opacity-100" style={at(outerBox)} />
      <button ref={outer} onClick={enter} aria-label={`Enter ${e.title} by ${e.artist}`} className="pointer-events-auto absolute cursor-pointer focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-gilt" style={at(outerBox)} />

      {/* The brass plaque (the room's own plaque artwork, stretched by its edges so the screws and rim stay true),
          engraved with the artist, a short note and the painting. Information first; clicking it also enters. */}
      <button
        onClick={enter}
        tabIndex={-1}
        aria-hidden
        className="pointer-events-auto absolute cursor-pointer [border-image:url(/rooms/plaque.webp)_16_24_fill] [border-style:solid] [border-width:0.62cqw_1.2cqw] shadow-[0_0.5cqw_1cqw_-0.3cqw_rgb(0_0_0/0.7)] focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-gilt"
        style={at(plaqueBox)}
      >
        <span className="engraved absolute inset-x-[-0.3cqw] inset-y-[-0.3cqw] flex flex-col items-center justify-center text-center">
          <span className="font-display text-[0.76cqw] leading-[1.15] font-semibold tracking-[0.14em] uppercase">{e.artist}</span>
          <span className="font-serif text-[0.56cqw] leading-[1.15] text-[#5c4a36]">{e.artistLife.replace(", ", " · ")}</span>
          <span className="mt-[0.12cqw] line-clamp-2 font-serif text-[0.62cqw] leading-[1.18] text-pretty text-[#3f3123]">{e.artistBlurb}</span>
          {/* The painting this artist's door leads to, named as such (with room to breathe after the note). */}
          <span className="mt-[0.34cqw] font-serif text-[0.68cqw] leading-[1.15]">
            <span className="font-display text-[0.5cqw] font-semibold tracking-[0.2em] text-[#7a5a2e] uppercase not-italic">The masterpiece</span>
            <span className="text-[#7a5a2e]"> · </span>
            <span className="italic">
              {e.title}, {e.year}
            </span>
          </span>
        </span>
      </button>
    </div>
  );
}

function Arrow({ side, disabled, onClick }: { side: "left" | "right"; disabled: boolean; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      aria-label={side === "left" ? "Previous" : "Next"}
      className={`absolute top-1/2 grid size-11 -translate-y-1/2 place-items-center rounded-full bg-[rgb(14_9_6/0.45)] text-xl text-parchment ring-1 ring-gilt/50 backdrop-blur-sm transition hover:bg-gilt hover:text-ink disabled:opacity-0 ${side === "left" ? "left-[max(env(safe-area-inset-left),1.5vw)]" : "right-[max(env(safe-area-inset-right),1.5vw)]"}`}
    >
      {side === "left" ? "‹" : "›"}
    </button>
  );
}

function Timeline({ current, goTo }: { current: number; goTo: (wing: number) => void }) {
  return (
    <>
    {/* A dark fall-off over the floor so the timeline reads on bright parquet. */}
    <div aria-hidden className="pointer-events-none absolute inset-x-0 bottom-0 h-[18dvh] bg-[linear-gradient(to_top,rgb(8_5_3/0.88),rgb(8_5_3/0.55)_45%,transparent)]" />
    <nav aria-label="Wings" className="absolute inset-x-[8vw] bottom-[max(env(safe-area-inset-bottom),3.5dvh)]">
      <ol className="relative flex justify-between before:absolute before:inset-x-0 before:top-[5px] before:h-px before:bg-parchment/45">
        {WINGS.map(({ wing }, i) => {
          const active = i === current;
          return (
            <li key={wing.id} className="relative">
              <button onClick={() => goTo(i)} aria-current={active} className={`group flex flex-col gap-2 text-parchment [text-shadow:0_1px_6px_rgb(0_0_0/0.9)] ${i === 0 ? "items-start" : i === WINGS.length - 1 ? "items-end" : "items-center"}`}>
                <span className={`size-[11px] rounded-full ring-1 ring-parchment/60 transition ${active ? "scale-125 bg-gilt ring-gilt" : "bg-ink group-hover:bg-parchment/40"}`} />
                <span className={`font-display text-[clamp(11px,1.5dvh,14px)] font-semibold tracking-[0.2em] uppercase transition ${active ? "text-[#f3d58a]" : "text-parchment/85 group-hover:text-parchment"}`}>
                  {wing.numeral}
                  <span className="max-md:hidden"> · {wing.name}</span>
                </span>
              </button>
            </li>
          );
        })}
      </ol>
    </nav>
    </>
  );
}
