// Cuts each exhibit's music from the licensed recordings supplied by the project owner, using the slices in their
// music sheet, and writes public/audio/music/<slug>.mp3. The room loops it for as long as the visitor stays, so each
// slice gets a soft fade in and out (the loop breathes instead of clicking), and every piece is levelled to the same
// quiet loudness so it sits under the voices.
// Sources live in raw/music/ (copies of the files the owner provided). Needs ffmpeg. Run: node scripts/music.ts
import { execFileSync } from "node:child_process";
import { mkdirSync } from "node:fs";

// slug → [source file in raw/music, start, end] (m:ss), from the owner's music sheet.
const SLICES: Record<string, [string, string, string]> = {
  "davinci-last-supper": ["05   Mille regretz.mp3", "0:00", "1:15"], // Josquin, Mille Regretz
  "michelangelo-creation-of-adam": ["Giovanni Pierluigi da Palestrina • Missa Papae Marcelli a6 1. Kyrie.mp3", "0:00", "1:15"],
  "rembrandt-night-watch": ["02.01. Concerto Grosso In D Minor Op.3, No.11 _L'estro Armonico__ Allegro - Adagio Spiccato - Allegro - Adagio; Largo E Spiccato; Allegro.mp3", "0:00", "1:05"],
  "vermeer-pearl-earring": ["Classicals.de - Bach - Cello Suite No.1 in G major, BWV 1007 - I. Prelude.mp3", "0:48", "1:50"],
  "goya-saturn": ["01.01. Quartet No. 14 In C-sharp Minor, Op. 131_ First Movement_ Adagio, Ma Non Troppo E Molto Espressivo; Second Movement_ Allegro Molto Vivace; Third Movement_ Allegro Moderato;  Fourth Movement_ Andante, Ma Non Troppo E Molto Canta...mp3", "0:00", "1:25"],
  "delacroix-liberty": ["01.01. Symphony No. 5 In C Minor, Op. 67_ First Movement_ Allegro Con Brio.mp3", "1:22", "2:25"],
  "vangogh-starry-night": ["Debussy Nocturnes Nuages.mp3", "0:00", "1:20"],
  "munch-scream": ["01.01. Trauermarsch.mp3", "0:00", "1:15"],
};

const sec = (t: string) => t.split(":").reduce((a, b) => a * 60 + Number(b), 0);
mkdirSync("public/audio/music", { recursive: true });
for (const [slug, [file, from, to]] of Object.entries(SLICES)) {
  const a = sec(from), len = sec(to) - a;
  execFileSync("ffmpeg", [
    "-y", "-v", "error", "-ss", String(a), "-t", String(len), "-i", `raw/music/${file}`,
    "-af", `afade=t=in:d=1.2,afade=t=out:st=${len - 2.5}:d=2.5,loudnorm=I=-25:TP=-2:LRA=11`,
    "-ar", "44100", "-ac", "2", "-b:a", "160k", `public/audio/music/${slug}.mp3`,
  ]);
  console.log("music", slug, `${from}–${to}`);
}

// The homepage and the whole gallery: Moby's "LA1" from Long Ambients (public domain, Wikimedia Commons;
// only the opening minutes are kept, in raw/music/moby). Each becomes a seamless loop that skips the silent intro and
// melts its last seconds into its first, so the bed never audibly restarts. Levelled to the same loudness as the rooms' music, so moving between them never jumps.
const LOOPS: Record<string, [string, number, number]> = {
  // name → [source, where the sound begins (s), loop length (s)]
  "gallery-foyer": ["moby/LA1-start.mp3", 3.2, 180],
};
const X = 6; // seconds of overlap where the end blends into the beginning
for (const [name, [file, s, L]] of Object.entries(LOOPS)) {
  execFileSync("ffmpeg", [
    "-y", "-v", "error", "-i", `raw/music/${file}`, "-filter_complex",
    `[0:a]atrim=start=${s}:end=${s + L + X},asetpts=PTS-STARTPTS,asplit=3[a][b][c];` +
      `[a]atrim=0:${X},asetpts=PTS-STARTPTS,afade=t=in:d=${X}:curve=qsin[head];` +
      `[b]atrim=${L}:${L + X},asetpts=PTS-STARTPTS,afade=t=out:d=${X}:curve=qsin[tail];` +
      `[c]atrim=${X}:${L},asetpts=PTS-STARTPTS[body];` +
      `[head][tail]amix=inputs=2:normalize=0[join];[join][body]concat=n=2:v=0:a=1`,
    "-ar", "44100", "-ac", "2", "-c:a", "pcm_s16le", `raw/music/${name}.wav`,
  ]);
  // Moby's piece breathes between long, very quiet passages and its swells (a far wider loudness range than the
  // rooms' music), and a soft pad sounds quieter than a melody at the same level. So: a slow, gentle compression
  // lifts the quiet passages toward the swells (no pumping), then one fixed gain puts it at -22 LUFS, so its typical
  // moment sits level with the rooms' music, never under it.
  execFileSync("ffmpeg", ["-y", "-v", "error", "-i", `raw/music/${name}.wav`, "-af", "acompressor=threshold=-32dB:ratio=2.5:attack=300:release=2500:knee=8", "-c:a", "pcm_s16le", `raw/music/${name}-even.wav`]);
  const measured = execFileSync("sh", ["-c", `ffmpeg -i raw/music/${name}-even.wav -af ebur128 -f null - 2>&1 | grep -E '^ +I:' | tail -1`], { encoding: "utf8" });
  const gain = -22 - Number(measured.match(/-?[\d.]+/)![0]);
  execFileSync("ffmpeg", ["-y", "-v", "error", "-i", `raw/music/${name}-even.wav`, "-af", `volume=${gain.toFixed(2)}dB,alimiter=limit=0.89:level=false`, "-b:a", "160k", `public/audio/music/${name}.mp3`]);
  console.log("loop", name, `${L}s from ${s}s`);
}
