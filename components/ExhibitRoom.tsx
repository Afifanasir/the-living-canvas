"use client";

import Image from "next/image";
import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  AnimatePresence,
  motion,
  useMotionValue,
  useMotionValueEvent,
  useReducedMotion,
  useSpring,
  useTransform,
} from "motion/react";
import AudioScene from "@/components/AudioScene";
import CarvedFrame from "@/components/CarvedFrame";
import Painting, { shown } from "@/components/Painting";
import SoundToggle from "@/components/SoundToggle";
import { periods, type Exhibit, type Technique } from "@/content/gallery";
import { speak, stopVoice, useAudio, voiceTime } from "@/lib/audio";
import { cueAt, sentences } from "@/lib/subtitles";
import { hang, type Hang, type Rect } from "@/lib/hang";

export default function ExhibitRoom({
  exhibit,
  prev,
  next,
}: {
  exhibit: Exhibit;
  prev: string;
  next: string;
}) {
  const [loupe, setLoupe] = useState(false);
  // The detective hunt: clues are found one at a time, in order.
  const [found, setFound] = useState(0); // how many clues are solved
  const [reveal, setReveal] = useState<Technique | null>(null); // the clue just found, shown until "next"
  const [near, setNear] = useState(0);
  const clue = reveal ? undefined : exhibit.techniques[found];
  const solved = found >= exhibit.techniques.length;
  // "You have found everything…" is a moment, not a fixture: it fades after a few seconds.
  const [solvedShown, setSolvedShown] = useState(false);
  useEffect(() => {
    if (!loupe || !solved || reveal) return;
    const t = setTimeout(() => setSolvedShown(true), 4000);
    return () => clearTimeout(t);
  }, [loupe, solved, reveal]);
  const { speaking } = useAudio();
  const voice = exhibit.hotspots.find(
    (h) => `${exhibit.slug}/${h.id}` === speaking,
  );
  const cue = useCue(voice?.line, voice && `${exhibit.slug}/${voice.id}`);
  // The roster's order: each voice answers the one before. Whoever hasn't been heard yet, first in line, is next.
  const [heard, setHeard] = useState<string[]>([]);
  const last = useRef<string | undefined>(undefined);
  // Who has just finished speaking: the light leaves them only once they are done, never mid-monologue.
  const [done, setDone] = useState<string | undefined>(undefined);
  // Who the magnifying glass cut off mid-monologue: not heard yet, so once the glass is away the light leads back to them.
  // (A ref as well as state: the effect below must see it in the same render the voice stops.)
  const [cut, setCut] = useState<string | undefined>(undefined);
  const cutRef = useRef<string | undefined>(undefined);
  useEffect(() => {
    // Read the ref now: the updater runs later, after the ref has moved on to the new voice.
    const finished = last.current;
    const interrupted = finished === cutRef.current;
    if (finished && finished !== voice?.id && !interrupted)
      setHeard((h) => (h.includes(finished) ? h : [...h, finished]));
    setDone(voice?.id || interrupted ? undefined : finished);
    if (voice?.id) {
      cutRef.current = undefined; // anyone speaking again settles it
      setCut(undefined);
    }
    last.current = voice?.id;
  }, [voice?.id]);
  const nextVoice =
    exhibit.hotspots.find((h) => h.id === cut) ??
    exhibit.hotspots.find((h) => !heard.includes(h.id) && h.id !== voice?.id);
  // The hand-off waits until the speaker has finished completely: then the light glides from them to whoever answers,
  // and the bubble says "Follow the light to …". Before anyone speaks, the first figure simply glows.
  // (Not while the magnifying glass is out: then the bubble belongs to the clue hunt.)
  const handOff = !voice && (done || cut) && !loupe ? nextVoice : undefined;
  // Each playback is a "take"; the next figure glows once the light from that take has landed on them.
  const [take, setTake] = useState(0);
  const [landed, setLanded] = useState(-1);
  const lit = voice ? undefined : done ? (landed === take ? nextVoice?.id : undefined) : nextVoice?.id;
  const everyone = exhibit.hotspots.every((h) => heard.includes(h.id));

  // Leaving the room ends the monologue.
  useEffect(() => stopVoice, [exhibit.slug]);
  // Taking out the magnifying glass hands the room to the clue hunt: whoever is speaking fades out.
  const toggleLoupe = () => {
    if (!loupe && voice) {
      cutRef.current = voice.id;
      setCut(voice.id);
      stopVoice(1);
    }
    setLoupe(!loupe);
  };

  // L toggles the loupe, Escape puts it away.
  useEffect(() => {
    const key = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.metaKey || e.ctrlKey)
        return;
      if (e.key === "l" || e.key === "L") toggleLoupe();
      if (e.key === "Escape") setLoupe(false);
      // A clue just found: → moves on to the next clue, like the "Next clue →" button.
      if (e.key === "ArrowRight" && reveal) setReveal(null);
    };
    addEventListener("keydown", key);
    return () => removeEventListener("keydown", key);
  });

  const toggle = (id: string) => {
    const key = `${exhibit.slug}/${id}`;
    if (speaking === key) stopVoice();
    else {
      speak(`/exhibits/${exhibit.slug}/vo/${id}.mp3`, key, exhibit.hotspots.find((h) => h.id === id)?.dry);
      setTake((t) => t + 1);
    }
  };

  // Where the painting and its plate hang, measured from the screen (the entry flip lands on the same spot).
  const [place, setPlace] = useState<Hang | null>(null);
  useEffect(() => {
    const measure = () =>
      setPlace(hang(innerWidth, innerHeight, exhibit.ratio));
    measure();
    addEventListener("resize", measure);
    return () => removeEventListener("resize", measure);
  }, [exhibit.ratio]);

  // The bubble hangs centred under the painting; its tail slides along to point at whoever is speaking (or, between
  // speakers, at the one whose turn it is).
  const bubbleW = place
    ? Math.min(620, Math.max(360, place.painting.w + 2 * place.frame))
    : 0;
  const tail =
    place && (voice ?? handOff)
      ? Math.min(
          bubbleW - 22,
          Math.max(
            22,
            place.painting.x +
              shown((voice ?? handOff)!.x) * place.painting.w -
              (place.painting.x + place.painting.w / 2 - bubbleW / 2),
          ),
        )
      : "50%";

  const fit = useFitToHeight();

  const box = (r: Rect, pad = 0) => ({
    left: r.x - pad,
    top: r.y - pad,
    width: r.w + 2 * pad,
    height: r.h + 2 * pad,
  });

  // ---- Stepping into the painting: scroll (or pinch, swipe, arrow keys) walks the camera toward it. ----
  const zoom = useSpring(0, { stiffness: 70, damping: 20 });
  const [depth, setDepth] = useState(0);
  useMotionValueEvent(zoom, "change", (v) =>
    setDepth(v < 0.04 ? 0 : v > 0.96 ? 2 : 1),
  );
  const target = useRef(0);
  const zoomBy = useCallback(
    (d: number) => {
      target.current = Math.min(1, Math.max(0, target.current + d));
      zoom.set(target.current);
    },
    [zoom],
  );
  useEffect(() => {
    const by = zoomBy;
    const wheel = (e: WheelEvent) => {
      // A trackpad pinch arrives as a wheel event with ctrlKey set (fingers apart = negative deltaY).
      // Always claim it, so the browser never zooms the whole page instead.
      if (e.ctrlKey) {
        e.preventDefault();
        by(-e.deltaY / 90);
        return;
      }
      e.preventDefault();
      by(e.deltaY / 700);
    };
    // Safari reports trackpad pinches as gesture events.
    let gesture = 1;
    const gStart = (e: Event) => {
      e.preventDefault();
      gesture = 1;
    };
    const gChange = (e: Event) => {
      e.preventDefault();
      const scale = (e as Event & { scale: number }).scale;
      by((scale - gesture) * 1.2);
      gesture = scale;
    };
    let ty = 0,
      pinch = 0;
    const span = (t: TouchList) =>
      Math.hypot(t[0].clientX - t[1].clientX, t[0].clientY - t[1].clientY);
    const start = (e: TouchEvent) => {
      ty = e.touches[0].clientY;
      pinch = e.touches.length > 1 ? span(e.touches) : 0;
    };
    const move = (e: TouchEvent) => {
      if (e.touches.length > 1 && pinch) {
        const d = span(e.touches);
        by((d - pinch) / 400);
        pinch = d;
      } else if (!loupe && !zoom.get()) {
        // one finger: steps in while standing back; once inside, a finger drags the painting instead (below)
        by((ty - e.touches[0].clientY) / 500);
        ty = e.touches[0].clientY;
      }
    };
    const key = (e: KeyboardEvent) => {
      if (e.key === "ArrowDown" || e.key === "+" || e.key === "=") by(0.25);
      if (e.key === "ArrowUp" || e.key === "-") by(-0.25);
    };
    addEventListener("wheel", wheel, { passive: false });
    addEventListener("gesturestart", gStart);
    addEventListener("gesturechange", gChange);
    addEventListener("touchstart", start, { passive: true });
    addEventListener("touchmove", move, { passive: true });
    addEventListener("keydown", key);
    return () => {
      removeEventListener("wheel", wheel);
      removeEventListener("gesturestart", gStart);
      removeEventListener("gesturechange", gChange);
      removeEventListener("touchstart", start);
      removeEventListener("touchmove", move);
      removeEventListener("keydown", key);
    };
  }, [loupe, zoomBy, zoom]);

  // ---- Looking around once inside: the zoomed painting can be moved to reach its top, bottom and sides. ----
  // Glass put away: drag it with the mouse or a finger. Glass out: bring the glass toward an edge of the screen and
  // the painting glides that way, so a hunt can reach every corner.
  const panX = useMotionValue(0), panY = useMotionValue(0);
  const room = useCallback(() => {
    if (!place) return { x: 0, y: 0 };
    const p = place.painting, S = Math.max(innerWidth / p.w, innerHeight / p.h) * 1.03, s = Math.pow(S, zoom.get());
    return { x: Math.max(0, (p.w * s - innerWidth) / 2), y: Math.max(0, (p.h * s - innerHeight) / 2) };
  }, [place, zoom]);
  const panBy = useCallback(
    (dx: number, dy: number) => {
      const r = room();
      panX.set(Math.max(-r.x, Math.min(r.x, panX.get() + dx)));
      panY.set(Math.max(-r.y, Math.min(r.y, panY.get() + dy)));
    },
    [room, panX, panY],
  );
  // Stepping back out to the room recentres the painting for next time.
  useEffect(() => {
    if (depth) return;
    panX.set(0);
    panY.set(0);
  }, [depth, panX, panY]);
  useEffect(() => {
    let drag: { x: number; y: number } | null = null, px = -1, py = -1, raf = 0, last = 0;
    const down = (e: PointerEvent) => {
      if (loupe || zoom.get() < 0.2 || (e.target as HTMLElement).closest("button,a")) return;
      drag = { x: e.clientX, y: e.clientY };
    };
    const moveP = (e: PointerEvent) => {
      px = e.clientX;
      py = e.clientY;
      if (!drag) return;
      panBy(e.clientX - drag.x, e.clientY - drag.y);
      drag = { x: e.clientX, y: e.clientY };
    };
    const up = () => (drag = null);
    // glass near an edge: glide the painting that way (faster the closer to the edge)
    const edge = (now: number) => {
      raf = requestAnimationFrame(edge);
      const dt = Math.min(0.05, last ? (now - last) / 1000 : 0);
      last = now;
      if (!loupe || zoom.get() < 0.2 || px < 0) return;
      const m = 0.14 * Math.min(innerWidth, innerHeight), v = 700 * dt;
      const push = (at: number, size: number) => (at < m ? (1 - at / m) : at > size - m ? -(1 - (size - at) / m) : 0);
      const dx = push(px, innerWidth), dy = push(py, innerHeight);
      if (dx || dy) panBy(dx * v, dy * v);
    };
    raf = requestAnimationFrame(edge);
    addEventListener("pointerdown", down);
    addEventListener("pointermove", moveP);
    addEventListener("pointerup", up);
    addEventListener("pointercancel", up);
    return () => {
      cancelAnimationFrame(raf);
      removeEventListener("pointerdown", down);
      removeEventListener("pointermove", moveP);
      removeEventListener("pointerup", up);
      removeEventListener("pointercancel", up);
    };
  }, [loupe, zoom, panBy]);

  // The painting and its frame move as one: toward the middle of the screen and up to filling it.
  const stage = useTransform(() => {
    if (!place) return "none";
    const z = zoom.get(),
      p = place.painting;
    const S = Math.max(innerWidth / p.w, innerHeight / p.h) * 1.03; // just covers the screen
    const s = Math.pow(S, z);
    // the visitor's panning, kept within the painting as the zoom changes
    const rx = Math.max(0, (p.w * s - innerWidth) / 2), ry = Math.max(0, (p.h * s - innerHeight) / 2);
    const ox = Math.max(-rx, Math.min(rx, panX.get())), oy = Math.max(-ry, Math.min(ry, panY.get()));
    return `translate(${(innerWidth / 2 - (p.x + p.w / 2)) * z + ox}px, ${(innerHeight / 2 - (p.y + p.h / 2)) * z + oy}px) scale(${s})`;
  });
  const origin = place
    ? `${place.painting.x + place.painting.w / 2}px ${place.painting.y + place.painting.h / 2}px`
    : "50% 50%";
  const roomScale = useTransform(() => 1 + 0.35 * zoom.get());
  const roomDim = useTransform(() => 0.75 * zoom.get());
  const plateFade = useTransform(() => Math.max(0, 1 - zoom.get() * 4));

  return (
    <main className={`fixed inset-0 overflow-hidden bg-ink ${depth && !loupe ? "cursor-grab active:cursor-grabbing" : ""}`}>
      <AudioScene music={`/audio/music/${exhibit.slug}.mp3`} />{" "}
      {/* its own piece, looping its slice while the visitor stays */}
      {/* The wing's exhibit room: the same walls, rail and floor as the gallery, one spotlight on the painting. */}
      <motion.div className="absolute inset-0" style={{ scale: roomScale }}>
        <div className="absolute top-1/2 left-1/2 aspect-video w-[max(118vw,177.78dvh)] -translate-1/2">
          <Image
            src={`/rooms/exhibit-${exhibit.period}.webp`}
            alt=""
            fill
            priority
            sizes="118vw"
            className="object-cover"
          />
        </div>
      </motion.div>
      <motion.div
        aria-hidden
        className="pointer-events-none absolute inset-0 bg-ink"
        style={{ opacity: roomDim }}
      />
      {place && (
        <>
          <motion.div
            className="absolute inset-0"
            style={{ transform: stage, transformOrigin: origin }}
          >
            {/* The painting, hung in a carved gilt frame cut to its own proportions. */}
            <section
              className="absolute"
              style={box(place.painting)}
              aria-label={`${exhibit.title} by ${exhibit.artist}`}
            >
              <Painting
                exhibit={exhibit}
                loupe={loupe}
                speaking={voice?.id}
                onHotspot={toggle}
                clue={clue}
                next={lit}
                all={everyone}
                onNear={setNear}
                onFound={(t) => {
                  setReveal(t);
                  setFound((n) => n + 1);
                }}
                zoom={zoom}
                looking={depth > 0}
              />
              {/* A clue bigger than the glass: once found, a gold line draws its shape over the painting, then fades. */}
            {reveal?.outline && <ClueOutline key={reveal.id} lines={reveal.outline} />}
            {/* Light from the spotlight above falls across the canvas. */}
              <span
                aria-hidden
                className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_90%_70%_at_50%_0%,rgb(255_230_190/0.08),transparent_70%),linear-gradient(to_bottom,transparent_70%,rgb(0_0_0/0.18))]"
              />
            </section>
            <CarvedFrame
              w={place.painting.w + 2 * place.frame}
              h={place.painting.h + 2 * place.frame}
              rail={place.frame}
              style={{
                left: place.painting.x - place.frame,
                top: place.painting.y - place.frame,
              }}
            />
          </motion.div>

          {/* Speech and loupe hints: a parchment bubble hanging just under the painting, never over it.
              Once the visitor is inside the painting, it sits at the foot of the screen instead. */}
          <AnimatePresence mode="wait">
            {(voice || handOff || (loupe && (reveal || clue || (solved && !solvedShown)))) && (
              <motion.div
                key={
                  voice
                    ? `${voice.id}-${cue}`
                    : handOff
                      ? `follow-${handOff.id}`
                      : reveal
                      ? `found-${reveal.id}`
                      : clue
                        ? `hint-${clue.id}`
                        : "solved"
                }
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: 4 }}
                transition={{ duration: 0.25 }}
                className="absolute z-30 -translate-x-1/2"
                style={
                  depth
                    ? { left: "50%", bottom: "8dvh", width: "min(88vw, 620px)" }
                    : {
                        left: place.painting.x + place.painting.w / 2,
                        top:
                          place.painting.y +
                          place.painting.h +
                          place.frame +
                          14,
                        width: bubbleW,
                      }
                }
                aria-live="polite"
              >
                <div className="relative rounded-xl bg-[linear-gradient(#f6eedb,#ece0c4)] px-5 py-3 text-[#2a1f15] shadow-[0_14px_30px_-10px_rgb(0_0_0/0.75),0_2px_4px_rgb(0_0_0/0.3)] ring-1 ring-[#b39565]/60">
                  {/* the bubble's tail, pointing up at the painting */}
                  {!depth && (
                    <span
                      aria-hidden
                      style={{ left: tail }}
                      className="absolute -top-[7px] size-3.5 -translate-x-1/2 rotate-45 transition-[left] duration-300 bg-[#f6eedb] ring-1 ring-[#b39565]/60 [clip-path:polygon(0_0,100%_0,0_100%)]"
                    />
                  )}
                  {voice ? (
                    <>
                      <p className="font-display text-[11.5px] font-semibold tracking-[0.2em] text-[#7a5a2e] uppercase">
                        {voice.character}
                      </p>
                      <p className="mt-0.5 font-serif text-[clamp(15px,1.1vw,17px)] leading-snug">
                        &ldquo;{sentences(voice.line)[cue]}&rdquo;
                      </p>
                    </>
                  ) : handOff ? (
                    <p className="font-serif text-[clamp(15px,1.1vw,17px)] leading-snug text-[#5c4630] italic">
                      Follow the light to{" "}
                      {handOff.character.replace(/^The /, "the ")}
                    </p>
                  ) : reveal ? (
                    <>
                      <p className="font-display text-[11.5px] font-semibold tracking-[0.2em] text-[#7a5a2e] uppercase">
                        Found · {reveal.name}
                      </p>
                      <p className="mt-0.5 font-serif text-[clamp(15px,1.1vw,17px)] leading-snug">
                        {reveal.note}
                      </p>
                      <div className="mt-2 flex justify-end">
                        <BrassButton on={false} onClick={() => setReveal(null)}>
                          {solved ? "Done" : "Next clue →"}
                        </BrassButton>
                      </div>
                    </>
                  ) : clue ? (
                    <>
                      <div className="flex items-center justify-between gap-3">
                        <p className="flex items-center gap-1.5 font-display text-[11.5px] font-semibold tracking-[0.2em] text-[#7a5a2e] uppercase">
                          <LoupeIcon /> Clue {found + 1} of{" "}
                          {exhibit.techniques.length}
                        </p>
                        <Warmth near={near} />
                      </div>
                      <p className="mt-1 font-serif text-[clamp(15px,1.1vw,17px)] leading-snug italic">
                        {clue.hint}
                      </p>
                    </>
                  ) : (
                    <p className="font-serif text-[clamp(15px,1.1vw,17px)] leading-snug italic">
                      You have found everything this painting is hiding.
                    </p>
                  )}
                </div>
              </motion.div>
            )}
          </AnimatePresence>
          {done && handOff && landed !== take && !depth && (
            <HandOffLight
              key={take}
              from={done}
              to={handOff.id}
              onLanded={() => setLanded(take)}
            />
          )}

          {/* The wall plate, hung like the wings' panels in the gallery: the same carved gilt moulding around dark wood
              (cut from the gallery room, scripts/panel-frame.ts), and inside it the brass plate, everything engraved,
              its two controls as small brass buttons. */}
          <motion.aside
            className="absolute flex flex-col [border-image-repeat:round] [border-image-slice:46_fill] [border-image-source:url(/rooms/panel-frame.webp)] [border-style:solid] [border-width:clamp(8px,0.8vw,14px)] px-[clamp(7px,0.75vw,13px)] py-[clamp(5px,0.5vw,9px)] shadow-[0_10px_24px_-8px_rgb(0_0_0/0.8)]"
            // Landscape: the plate sizes itself to its text and hangs centred on the painting's height.
            // It steps out of view as the visitor steps into the painting.
            style={{
              opacity: plateFade,
              pointerEvents: depth ? "none" : "auto",
              ...(place.landscape
                ? {
                    left: place.plate.x,
                    width: place.plate.w,
                    top: place.painting.y + place.painting.h / 2,
                    y: "-50%",
                    maxHeight: place.plate.h,
                  }
                : box(place.plate)),
            }}
          >
            <div className="engraved flex min-h-0 flex-1 flex-col transition-[filter] duration-500 [border-image:url(/rooms/plaque.webp)_16_24_fill] [border-style:solid] [border-width:10px_20px] shadow-[0_4px_10px_-4px_rgb(0_0_0/0.8)] brightness-[0.9] hover:brightness-100">
              <div ref={fit} className="flex min-h-0 flex-1 flex-col justify-center-safe overflow-y-auto px-1 py-3.5 [scrollbar-width:none]">
                {/* Who */}
                <p className="font-display text-[11px] font-semibold tracking-[0.24em] text-[#5c4630] uppercase">
                  {exhibit.artist}
                </p>
                <p className="font-serif text-[12.5px] text-[#6b5434]">
                  {exhibit.artistLife.replace(", ", " · ")}
                  {/* The art period, so visitors know where in the story of art they stand. */}
                  <span className="text-[#8a6a3a] italic">
                    {" · "}
                    {periods.find((w) => w.id === exhibit.period)?.name}
                  </span>
                </p>
                {/* What: the anchor of the plate */}
                <h1 className="mt-2 font-serif text-[clamp(1.35rem,min(1.75vw,3.3dvh),1.8rem)] leading-[1.08] font-medium text-[#1d140b] italic">
                  {exhibit.title}
                </h1>
                {/* Facts */}
                <p className="mt-2 border-t border-[#a8916a]/55 pt-1.5 font-serif text-[12.5px] leading-snug text-[#5c4a36]">
                  {exhibit.year} · {exhibit.medium}
                  <br />
                  {exhibit.location}
                </p>
                {/* The moment: the hook, set as a pull-quote */}
                <PlateLabel>The moment</PlateLabel>
                <p className="border-l-2 border-[#b8892e] pl-3 font-serif text-[clamp(15px,1.05vw,17px)] leading-[1.35] text-[#22180e] italic">
                  {exhibit.hook}
                </p>

                <PlateLabel>The story</PlateLabel>
                <p className="font-serif text-[clamp(14px,0.95vw,15px)] leading-[1.45] text-[#2a1f15]">
                  {exhibit.about}
                </p>

                <div className="mt-2">
                  <BrassButton
                    wide
                    on={loupe}
                    onClick={toggleLoupe}
                    keys="L"
                  >
                    <LoupeIcon />{" "}
                    {loupe
                      ? "Put the magnifying glass away"
                      : solved
                        ? "All clues found · Look again"
                        : found
                          ? `Keep searching · ${found} of ${exhibit.techniques.length} found`
                          : `Find the ${exhibit.techniques.length} hidden clues`}
                  </BrassButton>
                </div>

                {/* The question: the thought to leave with, set apart at the foot */}
                <div className="mt-2">
                  <svg
                    viewBox="0 0 120 10"
                    aria-hidden
                    className="mx-auto mb-0.5 h-2 w-24 text-[#a8916a]"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="1"
                    strokeLinecap="round"
                  >
                    <path d="M2 5H50M70 5H118" />
                    <path
                      d="M60 1.5 63.5 5 60 8.5 56.5 5Z"
                      fill="currentColor"
                      stroke="none"
                    />
                  </svg>
                  <PlateLabel>The question</PlateLabel>
                  <p className="font-serif text-[clamp(14.5px,1vw,16px)] leading-[1.4] font-medium text-[#22180e] italic">
                    {exhibit.dilemma}
                  </p>
                </div>
              </div>
            </div>
          </motion.aside>

          {/* How to go in, and how to come back out: a quiet brass-ringed cue at the foot of the room. Once the
              visitor has stepped in, it only says how to step back out. */}
          <AnimatePresence>
            {/* The room's music, credited quietly at the left end of the hint's line (wide screens, outside the painting). */}
            {place.landscape && !depth && (
              <p className="pointer-events-none absolute bottom-[max(env(safe-area-inset-bottom),2.8dvh)] left-[clamp(16px,3vw,48px)] z-20 max-w-[calc(50vw-clamp(16px,3vw,48px)-250px)] bg-[radial-gradient(ellipse_closest-side,rgb(14_8_4/0.5),rgb(14_8_4/0.25)_60%,transparent)] px-5 py-2 font-serif text-[clamp(11.5px,1.5dvh,13px)] leading-snug text-parchment/80 [text-shadow:0_1px_2px_rgb(0_0_0/0.9),0_0_10px_rgb(0_0_0/0.8)]">
                <span className="font-display text-[0.85em] tracking-[0.2em] text-gilt uppercase">Music</span>
                {" · "}
                <span className="italic">{exhibit.soundtrack.piece}</span>
                {exhibit.soundtrack.players && <span className="block text-[0.92em] text-parchment/60">{exhibit.soundtrack.players}</span>}
              </p>
            )}
            {!loupe && depth !== 1 && (
              <motion.p
                key={depth}
                initial={{ opacity: 0 }}
                animate={{
                  opacity: 1,
                  transition: { delay: depth ? 0.2 : 1.6, duration: 0.8 },
                }}
                exit={{ opacity: 0, transition: { duration: 0.2 } }}
                className="pointer-events-none absolute bottom-[max(env(safe-area-inset-bottom),2.8dvh)] left-1/2 z-20 flex -translate-x-1/2 items-center gap-3 bg-[radial-gradient(ellipse_closest-side,rgb(14_8_4/0.62),rgb(14_8_4/0.35)_60%,transparent)] px-10 py-3 font-serif text-[clamp(14px,1.9dvh,16px)] whitespace-nowrap text-parchment italic [text-shadow:0_1px_2px_rgb(0_0_0/0.9),0_0_12px_rgb(0_0_0/0.85)]"
              >
                {/* An inscription, not a button: thin gold rules either side, no box. A soft pool of shadow behind it
                    (no edges) keeps it legible on the bright, polished floor. */}
                <span
                  aria-hidden
                  className="h-px w-[clamp(28px,5vw,64px)] bg-gradient-to-r from-transparent to-gilt/70"
                />
                {depth
                  ? "Scroll or pinch back to step out"
                  : "Pinch or scroll to step inside the painting"}
                <span
                  aria-hidden
                  className="h-px w-[clamp(28px,5vw,64px)] bg-gradient-to-l from-transparent to-gilt/70"
                />
              </motion.p>
            )}
          </AnimatePresence>
        </>
      )}
      {/* Way back, and the neighbouring paintings: quiet controls in the room's own light. */}
      <Link
        href={`/#${exhibit.slug}`}
        className="absolute top-[max(env(safe-area-inset-top),clamp(14px,2.6dvh,28px))] left-[max(env(safe-area-inset-left),clamp(16px,3vw,48px))] font-display text-[clamp(11px,1.5dvh,13px)] font-semibold tracking-[0.24em] text-parchment uppercase [text-shadow:0_1px_8px_rgb(0_0_0/0.9)] hover:text-[#f3d58a]"
      >
        ← Gallery
      </Link>
      <div className="absolute top-[max(env(safe-area-inset-top),clamp(12px,2.5dvh,28px))] right-[max(env(safe-area-inset-right),clamp(16px,3vw,48px))]">
        <SoundToggle />
      </div>
      {/* Zoom controls: step in and out of the painting without scrolling or pinching. */}
      {!loupe && (
        <div className="absolute right-[max(env(safe-area-inset-right),clamp(16px,3vw,48px))] bottom-[max(env(safe-area-inset-bottom),2.5dvh)] z-20 flex flex-col overflow-hidden rounded-full bg-[rgb(14_9_6/0.5)] ring-1 ring-gilt/50 backdrop-blur-sm">
          <button
            onClick={() => zoomBy(0.34)}
            aria-label="Step into the painting"
            className="grid size-10 place-items-center text-lg text-parchment transition hover:bg-gilt hover:text-ink"
          >
            +
          </button>
          <span aria-hidden className="mx-2 h-px bg-gilt/40" />
          <button
            onClick={() => zoomBy(-0.34)}
            aria-label="Step back from the painting"
            className="grid size-10 place-items-center text-lg text-parchment transition hover:bg-gilt hover:text-ink"
          >
            −
          </button>
        </div>
      )}
      <RoomArrow side="left" href={`/exhibit/${prev}`} />
      <RoomArrow side="right" href={`/exhibit/${next}`} />
    </main>
  );
}

function BrassButton({
  on,
  onClick,
  keys,
  wide,
  children,
}: {
  on: boolean;
  onClick: () => void;
  keys?: string;
  wide?: boolean;
  children: React.ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      aria-pressed={on}
      aria-keyshortcuts={keys}
      className={`${wide ? "flex w-full items-center justify-center gap-2 py-2 font-display text-[11.5px] font-semibold tracking-[0.14em] whitespace-nowrap uppercase" : "px-3 py-1 font-serif text-[13px]"} rounded-full px-3 leading-tight shadow-[inset_0_1px_0_rgb(255_248_225/0.6),0_1px_2px_rgb(0_0_0/0.35)] ring-1 transition ${on ? "bg-[#3a2b1c] text-[#f3e3bd] ring-[#3a2b1c]" : "bg-[linear-gradient(#e9d9b0,#c9ad74)] text-[#33261a] ring-[#8a6a3a] hover:bg-[linear-gradient(#f3e3bd,#d6b97e)]"}`}
    >
      {children}
    </button>
  );
}

/** How close the glass is to the clue: five brass studs that light up, in plain words. */
function Warmth({ near }: { near: number }) {
  const lit = Math.max(1, Math.round(near * 5));
  const word =
    near > 0.92
      ? "You're right on it"
      : near > 0.65
        ? "Very close"
        : near > 0.35
          ? "Getting closer"
          : "Keep looking";
  return (
    <div className="flex items-center gap-2" aria-label={word}>
      <span className="font-serif text-[13px] text-[#7a5a2e] italic">
        {word}
      </span>
      {Array.from({ length: 5 }, (_, i) => (
        <span
          key={i}
          className={`size-2.5 rounded-full ring-1 ring-[#8a6a3a] transition ${i < lit ? "bg-[#c4831f] shadow-[0_0_8px_#e0a54a]" : "bg-[#d8c69a]"}`}
        />
      ))}
    </div>
  );
}

/** A small engraved section label on the plate. */
function PlateLabel({ children }: { children: React.ReactNode }) {
  return (
    <p className="mt-2 mb-0.5 font-display text-[10.5px] font-semibold tracking-[0.26em] text-[#8a6a3a] uppercase">
      {children}
    </p>
  );
}

function LoupeIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      className="size-4"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      aria-hidden
    >
      <circle cx="10.5" cy="10.5" r="6.5" />
      <path d="M15.5 15.5L21 21" />
    </svg>
  );
}

function RoomArrow({ side, href }: { side: "left" | "right"; href: string }) {
  return (
    <Link
      href={href}
      aria-label={side === "left" ? "Previous painting" : "Next painting"}
      className={`absolute top-1/2 grid size-11 -translate-y-1/2 place-items-center rounded-full bg-[rgb(14_9_6/0.45)] text-xl text-parchment ring-1 ring-gilt/50 backdrop-blur-sm transition hover:bg-gilt hover:text-ink ${side === "left" ? "left-[max(env(safe-area-inset-left),1.5vw)]" : "right-[max(env(safe-area-inset-right),1.5vw)]"}`}
    >
      {side === "left" ? "‹" : "›"}
    </Link>
  );
}

/** Which sentence of `line` is being spoken right now; follows the voice clip frame by frame. */
function useCue(line?: string, key?: string) {
  const [cue, setCue] = useState(0);
  useEffect(() => {
    if (!line) return;
    let raf = 0;
    const tick = () => {
      const v = voiceTime();
      if (v) setCue(cueAt(line, v.t, v.d, key));
      raf = requestAnimationFrame(tick);
    };
    tick();
    return () => cancelAnimationFrame(raf);
  }, [line, key]);
  return line ? cue : 0;
}

/** The figure's light itself gliding from the one who is speaking to the one who answers, handing the glow over. */
function HandOffLight({
  from,
  to,
  onLanded,
}: {
  from: string;
  to: string;
  onLanded: () => void;
}) {
  const [path, setPath] = useState<{ x: number[]; y: number[] } | null>(null);
  const still = useReducedMotion();
  useEffect(() => {
    const t = setTimeout(() => {
      const a = document
        .querySelector(`[data-hotspot="${from}"]`)
        ?.getBoundingClientRect();
      const b = document
        .querySelector(`[data-hotspot="${to}"]`)
        ?.getBoundingClientRect();
      if (!a || !b || still) return onLanded();
      const [ax, ay, bx, by] = [
        a.left + a.width / 2,
        a.top + a.height / 2,
        b.left + b.width / 2,
        b.top + b.height / 2,
      ];
      // A gentle lift between the two figures, never a loop across the screen.
      const lift = Math.min(40, Math.hypot(bx - ax, by - ay) * 0.15);
      setPath({
        x: [ax, (ax + bx) / 2, bx],
        y: [ay, (ay + by) / 2 - lift, by],
      });
    }, 150);
    return () => clearTimeout(t);
  }, [from, to, still, onLanded]);
  if (!path) return null;
  return (
    <motion.span
      aria-hidden
      className="pointer-events-none fixed top-0 left-0 z-40 -mt-2 -ml-2 size-4 rounded-full bg-[radial-gradient(circle,rgb(255_240_210/0.85)_0%,rgb(220_188_120/0.6)_45%,transparent_75%)] shadow-[0_0_12px_4px_rgb(232_200_130/0.3)]"
      initial={{ x: path.x[0], y: path.y[0], opacity: 0, scale: 0.6 }}
      animate={{ x: path.x, y: path.y, opacity: [0, 1, 1], scale: [0.6, 1, 1] }}
      transition={{ duration: 1.6, ease: "easeInOut" }}
      onAnimationComplete={onLanded}
    />
  );
}

/** On short screens the plate's text can run taller than the plate: scale the whole write-up down together, just
 *  enough to fit (never below 80%), instead of cutting it off or making visitors scroll. */
function useFitToHeight() {
  // A ref callback (React 19 runs the returned cleanup when the element goes away).
  return useCallback((el: HTMLDivElement | null) => {
    if (!el) return;
    const fit = () => {
      el.style.zoom = "1";
      const ratio = el.clientHeight / el.scrollHeight;
      el.style.zoom = ratio < 1 ? String(Math.max(0.8, ratio - 0.005)) : "1";
    };
    fit();
    document.fonts?.ready.then(fit);
    const ro = new ResizeObserver(fit);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
}

/** Draws a found clue's shape (lines in painting fractions) as a soft gold line that traces itself, holds, then
 *  fades, so a shape too big for the glass (the brain in the Creation of Adam) can be seen whole. */
function ClueOutline({ lines }: { lines: [number, number][][] }) {
  return (
    <svg aria-hidden viewBox="0 0 1 1" preserveAspectRatio="none" className="pointer-events-none absolute inset-0 size-full">
      {lines.map((pts, i) => (
        <motion.path
          key={i}
          d={`M${pts.map(([x, y]) => `${x},${y}`).join(" L")}`}
          fill="none"
          stroke="rgb(255 222 150)"
          strokeWidth={2.5}
          strokeLinecap="round"
          strokeLinejoin="round"
          vectorEffect="non-scaling-stroke"
          style={{ filter: "drop-shadow(0 0 6px rgb(255 200 110 / 0.9)) drop-shadow(0 0 2px rgb(0 0 0 / 0.6))" }}
          initial={{ pathLength: 0, opacity: 0 }}
          animate={{ pathLength: 1, opacity: [0, 1, 1, 0] }}
          transition={{ pathLength: { duration: 2.6, delay: 0.3 + i * 2.4, ease: "easeInOut" }, opacity: { duration: 8, delay: i * 2.4, times: [0, 0.05, 0.8, 1] } }}
        />
      ))}
    </svg>
  );
}
