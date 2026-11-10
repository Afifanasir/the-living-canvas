// Records every character's monologue with Kokoro, a free open-source voice model that runs locally
// (onnx-community/Kokoro-82M-v1.0-ONNX, Apache-2.0). Writes public/exhibits/<slug>/vo/<id>.mp3 with 250 ms of
// silence at each end. Needs ffmpeg. Run: node scripts/voices.ts [character-id ...]
import { execFileSync } from "node:child_process";
import { mkdirSync, rmSync } from "node:fs";
import { KokoroTTS } from "kokoro-js";
import { exhibits } from "../content/gallery.ts";

// The cast: a voice and a pace for each character, chosen for the delivery in the roster.
const CAST: Record<string, { voice: string; speed: number }> = {
  judas: { voice: "am_echo", speed: 0.95 }, // defensive, paranoid whisper
  peter: { voice: "am_eric", speed: 1.05 }, // fierce, impulsive rage
  adam: { voice: "am_michael", speed: 0.88 }, // languid, heavy awakening
  "divine-voice": { voice: "bm_george", speed: 0.82 }, // cosmic urgency and authority
  cocq: { voice: "bm_fable", speed: 1.05 }, // pompous, desperate command
  "golden-girl": { voice: "bf_lily", speed: 0.9 }, // dreamlike, eerie murmur
  girl: { voice: "bf_emma", speed: 0.92 }, // breathless, intimate whisper
  saturn: { voice: "am_onyx", speed: 1.0 }, // choking, animal panic
  marianne: { voice: "af_bella", speed: 1.0 }, // roaring battle cry
  gavroche: { voice: "am_puck", speed: 1.08 }, // scrappy, fierce defiance
  vincent: { voice: "bm_daniel", speed: 0.9 }, // poetic, anxious wonder
  cypress: { voice: "am_adam", speed: 0.82 }, // deep, solemn sentinel
  "clamping-soul": { voice: "am_liam", speed: 1.05 }, // breathless, claustrophobic panic
  "walking-friend": { voice: "bm_lewis", speed: 0.95 }, // cold, detached murmur
};

const only = process.argv.slice(2);
const tts = await KokoroTTS.from_pretrained("onnx-community/Kokoro-82M-v1.0-ONNX", { dtype: "fp32", device: "cpu" });

for (const e of exhibits)
  for (const h of e.hotspots) {
    if (!h.line || (only.length && !only.includes(h.id))) continue;
    const cast = CAST[h.id];
    if (!cast) throw new Error(`No voice cast for ${h.id}`);
    const dir = `public/exhibits/${e.slug}/vo`;
    mkdirSync(dir, { recursive: true });
    const wav = `${dir}/${h.id}.wav`;
    const audio = await tts.generate(h.line, { voice: cast.voice as never, speed: cast.speed });
    await audio.save(wav);
    execFileSync("ffmpeg", ["-y", "-i", wav, "-af", "adelay=250,apad=pad_dur=0.25", "-ac", "1", "-b:a", "96k", `${dir}/${h.id}.mp3`], { stdio: "ignore" });
    rmSync(wav);
    console.log("voiced", e.slug, h.id, cast.voice);
  }
