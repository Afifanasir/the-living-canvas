"use client";

import { setMuted, unlock, useAudio } from "@/lib/audio";

/** The sound button. Browsers keep a page silent until the visitor clicks something, so until sound is actually
 *  playing the button pulses and (with `hint`) a callout points at it: its first click starts the music. After that
 *  it mutes and unmutes. */
export default function SoundToggle({ hint = false }: { hint?: boolean }) {
  const { muted, live } = useAudio();
  const waiting = !live && !muted;
  return (
    <div className="relative flex flex-col items-end">
      <button
        onClick={() => (waiting ? unlock() : setMuted(!muted))}
        aria-pressed={!muted}
        aria-label={waiting ? "Turn the sound on" : muted ? "Turn sound on" : "Turn sound off"}
        className={`relative grid shrink-0 place-items-center rounded-full ring-1 transition-all duration-500 hover:ring-gilt ${waiting ? "size-11 bg-[rgb(14_9_6/0.55)] text-[#f3d58a] shadow-[0_0_22px_rgb(201_164_92/0.7)] ring-gilt" : "size-9 ring-white/15"}`}
      >
        {waiting && <span aria-hidden className="absolute inset-0 animate-[ring-ripple_2s_ease-out_infinite] rounded-full border-2 border-gilt" />}
        <svg viewBox="0 0 24 24" className={waiting ? "size-5" : "size-4"} fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round">
          <path d="M4 9.5h3l4-3.5v12l-4-3.5H4z" fill="currentColor" stroke="none" />
          {muted ? <path d="M15.5 9.5l5 5m0-5l-5 5" /> : <path d="M15 9a4 4 0 010 6m2.5-8.5a7.5 7.5 0 010 11" />}
        </svg>
      </button>
      {hint && waiting && (
        // A callout hanging from the button, its arrow pointing up at it, bobbing gently so the eye finds it.
        <button
          onClick={() => unlock()}
          className="relative mt-4 animate-[nudge_2.2s_ease-in-out_infinite] cursor-pointer rounded-xl bg-[rgb(14_9_6/0.78)] px-4 py-2.5 text-right shadow-[0_8px_24px_rgb(0_0_0/0.55),0_0_18px_rgb(201_164_92/0.25)] ring-1 ring-gilt/60 backdrop-blur-sm"
        >
          <span aria-hidden className="absolute -top-[6px] right-[15px] size-3 rotate-45 border-t border-l border-gilt/60 bg-[rgb(14_9_6/0.78)]" />
          <span className="block font-display text-[clamp(12px,1vw,14px)] font-semibold tracking-[0.2em] whitespace-nowrap text-[#f3e3bd] uppercase">Turn on the sound</span>
          <span className="block font-serif text-[clamp(13px,1.05vw,15px)] whitespace-nowrap text-parchment/85 italic">for the best experience</span>
        </button>
      )}
    </div>
  );
}
