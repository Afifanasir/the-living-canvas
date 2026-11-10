// One Web Audio graph for the whole visit; it survives client-side navigation.
//
//   music beds ─┐
//               ├─ musicBus ─┐
//   ambience ───── ambBus ───┼─ master ─ speakers
//   voice ──────── voiceBus ─┤
//                     └─ room (a soft hall reverb, so voices sit in the same space as the music) ─┘
//
// Beds crossfade when the scene changes. While a voice plays, music and ambience dip gently: the score keeps
// playing underneath, the way a film mixes dialogue over music, instead of dropping out.
import { useSyncExternalStore } from "react";

const LEVEL = { music: 0.6, ambience: 0.7, voice: 1 };
const DUCK = { music: 0.55, ambience: 0.6 }; // multipliers while someone is talking (about -5 dB on the music)
const ROOM = 0.16; // how much of the voice goes into the hall reverb
// How long one piece takes to hand over to the next. A scene says how it likes to be blended: the gallery's two
// Moby pieces melt into each other slowly; a painting's music arrives quickly. Between two scenes the quicker wins,
// so stepping into or out of a painting never drags.
const DEFAULT_FADE = 0.9; // seconds: a painting's music is fully in within a second

export type Scene = { music?: string; ambience?: string; fade?: number };
type Kind = "music" | "ambience";
type Track = { el: HTMLAudioElement; gain: GainNode };

let ctx: AudioContext | null = null;
let master: GainNode, buses: Record<Kind | "voice", GainNode>;
const tracks = new Map<string, Track>(); // by url; an element can only be wired into the graph once
const current: Record<Kind, string | undefined> = { music: undefined, ambience: undefined };
let scene: Scene = {};
let voice: { el: HTMLAudioElement; id: string } | null = null;
let roomSend: GainNode | null = null;

// ---- state for React ------------------------------------------------------

// live: the browser has let sound start (it only does after the visitor's first click or key press; scrolling alone
// does not count).
type Snapshot = { muted: boolean; speaking: string | null; live: boolean };
const SERVER: Snapshot = { muted: false, speaking: null, live: false };
let snap: Snapshot = SERVER;
const subs = new Set<() => void>();
const emit = (patch: Partial<Snapshot>) => {
  snap = { ...snap, ...patch };
  subs.forEach((f) => f());
};
export const useAudio = () =>
  useSyncExternalStore(
    (f) => (subs.add(f), () => subs.delete(f)),
    () => snap,
    () => SERVER,
  );

// ---- graph ----------------------------------------------------------------

const ramp = (p: AudioParam, v: number, secs: number) => p.setTargetAtTime(v, ctx!.currentTime, secs / 3);
/** A crossfade that ends exactly on time (an exponential ramp leaves a long, audible tail). */
const glide = (p: AudioParam, v: number, secs: number) => {
  const now = ctx!.currentTime;
  p.cancelScheduledValues(now);
  p.setValueAtTime(p.value, now);
  p.linearRampToValueAtTime(v, now + secs);
};

function track(url: string, bus: GainNode, loop: boolean): Track {
  let t = tracks.get(url);
  if (!t) {
    const el = new Audio(url);
    el.loop = loop;
    el.preload = "auto";
    const gain = ctx!.createGain();
    gain.gain.value = 0;
    ctx!.createMediaElementSource(el).connect(gain).connect(bus);
    t = { el, gain };
    tracks.set(url, t);
  }
  return t;
}

let fade = DEFAULT_FADE;
function applyScene() {
  if (!ctx) return;
  const CROSSFADE = fade;
  for (const kind of ["music", "ambience"] as const) {
    const url = scene[kind];
    if (url === current[kind]) continue;
    const old = current[kind];
    if (old) {
      const t = tracks.get(old)!;
      // The outgoing piece clears a little faster than the new one arrives, so the two never muddle.
      const out = CROSSFADE <= 1.5 ? CROSSFADE * 0.65 : CROSSFADE;
      glide(t.gain.gain, 0, out);
      setTimeout(() => current[kind] !== old && t.el.pause(), out * 1000 + 100);
    }
    current[kind] = url;
    if (url) {
      const t = track(url, buses[kind], true);
      t.el.play().catch(() => {}); // a missing file just stays silent
      glide(t.gain.gain, 1, CROSSFADE);
    }
  }
}

function duck(on: boolean) {
  if (!ctx) return;
  ramp(buses.music.gain, LEVEL.music * (on ? DUCK.music : 1), on ? 1 : 2);
  ramp(buses.ambience.gain, LEVEL.ambience * (on ? DUCK.ambience : 1), on ? 1 : 2);
}

/** Browsers only allow audio after a user gesture; call from one (it is also wired to the first click/key). */
export function unlock() {
  if (!ctx) {
    ctx = new AudioContext();
    master = ctx.createGain();
    master.gain.value = snap.muted ? 0 : 1;
    master.connect(ctx.destination);
    buses = { music: ctx.createGain(), ambience: ctx.createGain(), voice: ctx.createGain() };
    for (const k of ["music", "ambience", "voice"] as const) {
      buses[k].gain.value = LEVEL[k];
      buses[k].connect(master);
    }
    // The hall: a 1.8 s decaying-noise impulse, darkened, fed by the voices.
    const len = Math.round(ctx.sampleRate * 1.8);
    const ir = ctx.createBuffer(2, len, ctx.sampleRate);
    for (let c = 0; c < 2; c++) {
      const d = ir.getChannelData(c);
      for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, 3);
    }
    const room = Object.assign(ctx.createConvolver(), { buffer: ir });
    const tone = Object.assign(ctx.createBiquadFilter(), { type: "lowpass" as BiquadFilterType });
    tone.frequency.value = 3500;
    const send = ctx.createGain();
    send.gain.value = ROOM;
    buses.voice.connect(send).connect(room).connect(tone).connect(master);
    roomSend = send;
  }
  if (ctx.state === "suspended" && !document.hidden) ctx.resume().then(() => emit({ live: true }));
  else if (ctx.state === "running" && !snap.live) emit({ live: true });
  applyScene();
  // If the browser refused the music before this (no click yet), start what should already be playing.
  for (const kind of ["music", "ambience"] as const) {
    const url = current[kind];
    if (url) tracks.get(url)?.el.play().catch(() => {});
  }
}

// ---- public API -----------------------------------------------------------

let sceneAt = 0;
export function setScene(next: Scene) {
  // A scene that lasted under a second (a page settling as it appears) does not count: the hand-off already under
  // way keeps its speed, so coming back from a painting is as quick as going in.
  const brief = performance.now() - sceneAt < 1000;
  fade = Math.min(brief ? fade : (scene.fade ?? DEFAULT_FADE), next.fade ?? DEFAULT_FADE);
  scene = next;
  sceneAt = performance.now();
  applyScene();
}

export function setMuted(muted: boolean) {
  emit({ muted });
  try {
    // Remembered for this visit only: every new visit opens with sound on.
    sessionStorage.setItem("muted", muted ? "1" : "");
  } catch {}
  if (ctx) ramp(master.gain, muted ? 0 : 1, 0.3);
}

export function speak(url: string, id: string, dry = false) {
  unlock();
  stopVoice();
  if (roomSend) roomSend.gain.value = dry ? 0 : ROOM; // a dry voice skips the shared hall
  const t = track(url, buses.voice, false);
  t.gain.gain.value = 1;
  t.el.currentTime = 0;
  t.el.onended = () => voice?.el === t.el && stopVoice();
  voice = { el: t.el, id };
  t.el.play().catch(() => stopVoice());
  duck(true);
  emit({ speaking: id });
}

export function stopVoice() {
  if (!voice) return;
  voice.el.pause();
  voice = null;
  duck(false);
  emit({ speaking: null });
}

/** Playback position of the current voice, for subtitle sync. */
export const voiceTime = () => (voice ? { t: voice.el.currentTime, d: voice.el.duration || 0 } : null);

if (typeof window !== "undefined") {
  try {
    localStorage.removeItem("muted"); // an older build remembered mute forever
    snap = { ...snap, muted: sessionStorage.getItem("muted") === "1" };
  } catch {}
  // Sound may start on the visitor's first click, key or finger swipe (a swipe's touchend counts on phones and
  // tablets). A wheel or trackpad scroll does not count in any browser, but trying costs nothing.
  const first = () => {
    unlock();
    if (!snap.live) return; // still blocked: keep listening
    for (const ev of ["pointerdown", "keydown", "touchend", "wheel"]) removeEventListener(ev, first);
  };
  if (process.env.NODE_ENV !== "production") Object.assign(window, { __audio: { ctx: () => ctx, buses: () => buses, tracks, master: () => master, setLive: (live: boolean) => emit({ live }) } });
  for (const ev of ["pointerdown", "keydown", "touchend"]) addEventListener(ev, first);
  addEventListener("wheel", first, { passive: true });
  // Try to begin the moment the page opens: wherever the browser allows sound without a click (for example when the
  // visitor has allowed auto-play for this site), the music simply starts. Otherwise the first click or key starts it.
  unlock();
  // Silence the gallery when the tab is hidden.
  document.addEventListener("visibilitychange", () => {
    if (!ctx) return;
    if (document.hidden) ctx.suspend();
    else ctx.resume();
  });
}
