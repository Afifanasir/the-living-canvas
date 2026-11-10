// Records every character's monologue with ElevenLabs (eleven_v3, the model that follows performance directions),
// in the character's own accent and with the roster's delivery. The words are the roster's, unchanged; bracketed
// directions are performed, not spoken. Needs ELEVENLABS_API_KEY in .env.local (added by the project owner; read
// here, never printed) and ffmpeg.
// Writes public/exhibits/<slug>/vo/<id>.mp3, or VOICE_OUT/<id>.mp3 when set (for listening before the rooms use it).
// Run: node scripts/voices-elevenlabs.ts [character-id ...]
// AUDITION=1 instead records each character's opening lines in the candidate voices listed in
// public/voice-test/audition/cast.json, for choosing a voice before spending credits on the full monologue.
import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { exhibits } from "../content/gallery.ts";
import { sentences } from "../lib/subtitles.ts";

process.loadEnvFile(".env.local");
const KEY = process.env.ELEVENLABS_API_KEY;
if (!KEY) throw new Error("Add ELEVENLABS_API_KEY to .env.local first.");

// voice: an ElevenLabs stock voice by name. accent and tone open the line; beats steer it sentence by sentence.
// voice: a stock voice name, or [owner, id] of a native speaker from the voice library (added to the account on first use).
type Cast = { voice: string | [string, string]; accent: string; tone: string; beats?: Record<number, string> };
const CAST: Record<string, Cast> = {
  judas: { voice: ["4ea67a85a65db440ac18d7ccc76634d693ebe384c187f13441c4a5f9bdd4e5a1", "Sl71VEnI0K7YoGmVBlRi"], // Edgardo, native Italian
    accent: "thick Italian accent", tone: "whispering very quietly, breathy, paranoid", beats: { 1: "nervous whisper", 2: "whispering", 3: "urgent whisper, defensive", 4: "shaky whisper", 5: "barely a whisper, bitter dread" } },
  peter: { voice: ["e9a6840c69b79812b77ea81fa11d55aaf80dcf1938fa0137bf7f514f67f75c99", "UlwxMDtxqMDYmG6pk2q6"], // Luca Brasi, native speaker
    accent: "strong Italian accent", tone: "furious, shouting", beats: { 2: "seething, through gritted teeth", 3: "roaring" } },
  adam: { voice: ["e9a6840c69b79812b77ea81fa11d55aaf80dcf1938fa0137bf7f514f67f75c99", "fzDFBB4mgvMlL36gPXcz"], // Giovanni, native speaker
    accent: "Italian accent", tone: "slow, groggy, heavy breathing", beats: { 2: "awed, trembling", 4: "anguished" } },
  "divine-voice": { voice: ["dc460d59edd0c14e051e7fb8608026bec6de9615885ebd7b17c0f19cbe7ba06a", "w3aQQZqtgGo2o2fsmvQ2"], // Nonno Ben, native speaker
    accent: "Italian accent", tone: "godlike, slow, resonant, majestic", beats: { 1: "commanding", 2: "grave, majestic", 3: "solemn", 4: "urgent, softly" } },
  cocq: { voice: ["211295a61368ce7a42152d717758d86df4019509e6707465e76c52b1d5d02f3c", "cblS8WYNsiBLGnlV6jjx"], // Robert, native speaker
    accent: "strong Dutch accent", tone: "pompous, barking orders", beats: { 3: "startled, shouting", 4: "flustered", 5: "outraged" } },
  "golden-girl": { voice: "Golden Girl", accent: "thick Dutch accent", tone: "dreamy, eerie, softly", beats: { 2: "eerie, sing-song", 3: "mocking whisper" } },
  girl: { voice: ["65552f36aff46db9c7a05e8c9cba307738b4e0cbcab39729879d97e5f8b4d3c1", "OlBRrVAItyi00MuGMbna"], // Emma, native speaker
    accent: "soft Dutch accent", tone: "whispers, breathless, intimate", beats: { 2: "nervous whisper", 5: "teasing whisper" } },
  saturn: { voice: ["3fa50c02b2a258918cc661fdf2c741830fcffdbef10297caedb757166d9fff5c", "orF2qy9215xjwqqxqsWW"], // Rafael, native speaker
    accent: "strong Spanish accent", tone: "choking, gasping for air, panicked", beats: { 1: "screaming in agony, choking", 2: "choking, coughing", 3: "frantic, gasping for breath", 4: "sobbing, choking", 5: "unhinged, desperate laugh, choking" } },
  marianne: { voice: ["92e20c8d02816e94ad2f27c8bb74494a6a3719e651fc3d7c34b8e15be6c0a625", "m5U7XCsc8v988k2RJAqN"], // Manon, native speaker
    accent: "strong French accent", tone: "shouting, rallying, fierce", beats: { 2: "battle cry", 4: "triumphant roar" } },
  gavroche: { voice: ["7a951a6f80a7f30f432e74dbe53ca0f837112d097fb615d14c73c254ffb785d2", "Xgb3SR8idOHy8scGICeJ"], // Kevin, native speaker
    accent: "strong French accent", tone: "excited, defiant, shouting", beats: { 2: "angry, choked up", 4: "yelling" } },
  vincent: { voice: ["59653a67545dadf72a7ce88214c08f2d677945e7f12ba88e151d9da76b7222e9", "s7Z6uboUuE4Nd8Q2nye6"], // Hans, native speaker
    accent: "Dutch accent", tone: "softly, wistful, anxious", beats: { 3: "uneasy", 4: "quiet, haunted" } },
  cypress: { voice: ["ad9dd174639a9220c826a4574b1348c16cffe2aa6e63a41516b096e7e9a02466", "t2969wgUwHbBoVCZNHRU"], // Zion Aquila, native speaker
    accent: "French accent", tone: "very old, deep, slow, wise, solemn" },
  "clamping-soul": { voice: ["fd84b8154a5ab20852f3fb3ee31cd01ee0ea62f6da6905ff88da44604c4bb792", "vUmLiNBm6MDcy1NUHaVr"], // Helge, native speaker
    accent: "strong Norwegian accent", tone: "panicked, breathless, terrified", beats: { 1: "screaming", 3: "desperate, gasping", 5: "sobbing" } },
  // Clinical detachment, quiet arrogance: a slow, low, close whisper with crisp consonants; never angry or romantic.
  vermeer: { voice: ["141f3c7181d65b28ca839e2803f57d84ac1ffc53fb8675ab0178c6926eaeb9cb", "G53Wkf3yrsXvhoQsmslL"], // James, native Dutch
    accent: "Dutch accent", tone: "whispers, slow, measured, cold, detached", beats: { 1: "low whisper", 3: "quietly arrogant", 5: "slow, precise whisper" } },
  // Fatalistic calm and chilling pity, never screaming: heavy, exhausted, hollow and deadpan (the well-like space and
  // breath are added afterwards by scripts/voice-fx.py).
  "slain-son": { voice: ["e9a6840c69b79812b77ea81fa11d55aaf80dcf1938fa0137bf7f514f67f75c99", "y6WtESLj18d0diFRruBs"], // David Martín, native Spanish (Spain)
    accent: "Spanish accent", tone: "slow, exhausted, hollow, deadpan", beats: { 1: "flat, indifferent", 3: "bitter", 5: "cold contempt" } },
  "walking-friend": { voice: ["17f3d10a30c42fdac07a6f26feda26b7892eea50287931c0727fcf66ceb0fd46", "nhvaqgRyAq6BmFs3WcdX"], // Oyvind, native speaker
    accent: "Norwegian accent", tone: "cold, detached, flat" },
};

const api = (path: string, init: RequestInit = {}) =>
  fetch(`https://api.elevenlabs.io${path}`, { ...init, headers: { "xi-api-key": KEY, "content-type": "application/json", ...init.headers } });

// ElevenLabs' stock voices by their fixed ids (the key only needs Text to Speech access, not Voices: read).
const VOICE_ID: Record<string, string> = {
  Callum: "N2lVS1w4EtoT3dr4eOWO",
  Roger: "CwhRBWXzGAHq8TbXP0rA",
  Liam: "TX3LPaxmHKxFdv7VOQHJ",
  George: "JBFqnCBsd6RMkjVDRZzb",
  Daniel: "onwK4e9ZLuTAKqWW03F9",
  Lily: "pFZP5JQG7iQjIQuC4Bku",
  Charlotte: "XB0fDUnXU5powFXDhCwa",
  Bill: "pqHfZKP75CvOlQylNhV4",
  Laura: "FGY2WhTYpPnrIDTdsKH5",
  Will: "bIHbv24MWmeRgasZH58o",
  Chris: "iP95p4xoKVk53GoZ742B",
  Brian: "nPczCjzI2devNBz1zQrb",
  Eric: "cjVigY5qzO86Huf0OWal",
  River: "SAz9YHcvj6GT2YYXdXww",
  // Designed for this project with ElevenLabs Voice Design (saved in the account): dreamlike, eerie, thick Dutch accent.
  "Golden Girl": "1sVmseZl3leo8aHWmoad",
};
/** The voice's id in the account, and whether it was added just now (then it is removed again after recording). */
async function idOf(voice: Cast["voice"]): Promise<[string, boolean]> {
  if (typeof voice === "string") return [VOICE_ID[voice], false];
  const [owner, id] = voice;
  const mine = (await (await api("/v1/voices")).json()) as { voices: { voice_id: string; sharing?: { original_voice_id?: string } }[] };
  const have = mine.voices.find((v) => v.voice_id === id || v.sharing?.original_voice_id === id);
  if (have) return [have.voice_id, false];
  const res = await api(`/v1/voices/add/${owner}/${id}`, { method: "POST", body: JSON.stringify({ new_name: `Living Canvas ${id}` }) });
  if (!res.ok) throw new Error(`Adding library voice ${id}: ${res.status} ${await res.text()}`);
  return [((await res.json()) as { voice_id: string }).voice_id, true];
}

/** The roster's words with the directions woven in. */
// v3 reads one idea per tag most reliably, so "whispers, paranoid" becomes [whispers] [paranoid].
const tags = (d: string) => d.split(",").map((t) => `[${t.trim()}]`).join(" ");
function script(line: string, c: Cast) {
  return sentences(line)
    .map((s, i) => (i === 0 ? `[${c.accent}] ${tags(c.tone)} ${s}` : c.beats?.[i] ? `${tags(c.beats[i])} ${s}` : s))
    .join(" ");
}

/** One ElevenLabs reading, padded and levelled, saved as an mp3. */
async function record(voiceId: string, text: string, out: string) {
  const res = await api(`/v1/text-to-speech/${voiceId}?output_format=mp3_44100_128`, {
    method: "POST",
    // stability 0 is the v3 Creative setting: the most emotional, expressive reading.
    body: JSON.stringify({ text, model_id: "eleven_v3", voice_settings: { stability: 0 } }),
  });
  if (!res.ok) throw new Error(`${out}: ElevenLabs ${res.status} ${await res.text()}`);
  mkdirSync(out.slice(0, out.lastIndexOf("/")), { recursive: true });
  const raw = `${out}.raw.mp3`;
  writeFileSync(raw, Buffer.from(await res.arrayBuffer()));
  execFileSync("ffmpeg", ["-y", "-v", "error", "-i", raw, "-af", "adelay=250,apad=pad_dur=0.25,loudnorm=I=-18:TP=-1.5:LRA=11", "-ac", "1", "-b:a", "128k", out]);
  rmSync(raw);
}

const only = process.argv.slice(2);
if (process.env.AUDITION) {
  // [voice id, name, note, library owner] per candidate
  const cast = JSON.parse(readFileSync("public/voice-test/audition/cast.json", "utf8")) as Record<string, [string, string, string, string][]>;
  for (const e of exhibits)
    for (const h of e.hotspots) {
      if (!h.line || !cast[h.id] || (only.length && !only.includes(h.id))) continue;
      // The opening sentences (about 70 to 150 characters), so the accent and the first turn of emotion are both heard.
      const parts = sentences(h.line);
      let n = 1;
      while (n < parts.length && parts.slice(0, n).join(" ").length < 70 && parts.slice(0, n + 1).join(" ").length < 150) n++;
      const text = script(parts.slice(0, n).join(" "), CAST[h.id]);
      for (const [i, [id, name, , owner]] of cast[h.id].entries()) {
        const out = `public/voice-test/audition/${h.id}/${i + 1}.mp3`;
        if (existsSync(out)) continue; // already recorded: never pay twice
        const added = await api(`/v1/voices/add/${owner}/${id}`, { method: "POST", body: JSON.stringify({ new_name: `Living Canvas audition ${name}` }) });
        if (!added.ok) throw new Error(`Adding ${name}: ${added.status} ${await added.text()}`);
        const { voice_id } = (await added.json()) as { voice_id: string };
        try {
          await record(voice_id, text, out);
        } finally {
          await api(`/v1/voices/${voice_id}`, { method: "DELETE" }); // free the account's voice slot again
        }
        console.log("audition", h.id, i + 1, name, text.length, "chars");
      }
    }
  process.exit(0);
}
if (process.env.DRY) {
  for (const e of exhibits) for (const h of e.hotspots) if (h.line && (!only.length || only.includes(h.id))) console.log(h.id, script(h.line, CAST[h.id]).length, "\n" + script(h.line, CAST[h.id]));
  process.exit(0);
}
for (const e of exhibits)
  for (const h of e.hotspots) {
    if (!h.line || (only.length && !only.includes(h.id))) continue;
    const c = CAST[h.id];
    if (!c) throw new Error(`No voice cast for ${h.id}`);
    const [voiceId, added] = await idOf(c.voice);
    try {
      await record(voiceId, script(h.line, c), `${process.env.VOICE_OUT ?? `public/exhibits/${e.slug}/vo`}/${h.id}.mp3`);
    } finally {
      if (added) await api(`/v1/voices/${voiceId}`, { method: "DELETE" }); // free the account's voice slot again
    }
    console.log("voiced", e.slug, h.id);
  }
