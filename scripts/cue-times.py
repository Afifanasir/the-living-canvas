"""Times every subtitle from the recording itself, word by word.

Each voice file is transcribed offline with faster-whisper (the small.en model, already in the Hugging Face cache) with
word timestamps; the script's words are matched to the words heard, and each sentence starts where its first word is
spoken. Writes lib/cue-times.json: { "<slug>/<id>": [start of sentence 2, start of sentence 3, ...] } in seconds.

Run after recording voices (any Python with faster-whisper and numpy; ffmpeg on the PATH):
  HF_HUB_OFFLINE=1 python scripts/cue-times.py
"""
import difflib, json, re, subprocess

import numpy as np
from faster_whisper import WhisperModel

items = json.loads(subprocess.check_output([
    "node", "-e",
    "import('./content/gallery.ts').then(m=>console.log(JSON.stringify(m.exhibits.flatMap(e=>e.hotspots.filter(h=>h.line).map(h=>({slug:e.slug,id:h.id,line:h.line}))))))",
]))
model = WhisperModel("small.en", device="cpu", compute_type="int8", local_files_only=True)
norm = lambda w: re.sub(r"[^a-z0-9']", "", w.lower())
sentences = lambda line: [s for s in re.split(r"(?<=[.!?])\s+", line) if s]  # the same split as lib/subtitles.ts

out = {}
for it in items:
    pcm = subprocess.run(["ffmpeg", "-v", "error", "-i", f"public/exhibits/{it['slug']}/vo/{it['id']}.mp3",
                          "-ac", "1", "-ar", "16000", "-f", "f32le", "-"], capture_output=True, check=True).stdout
    segs, _ = model.transcribe(np.frombuffer(pcm, np.float32), word_timestamps=True, initial_prompt=it["line"])
    heard = [(norm(w.word), w.start) for s in segs for w in s.words if norm(w.word)]
    script, first = [], []
    for s in sentences(it["line"]):
        first.append(len(script))
        script += [norm(w) for w in s.split() if norm(w)]
    at = {}
    for a, b, n in difflib.SequenceMatcher(None, script, [h[0] for h in heard], autojunk=False).get_matching_blocks():
        for k in range(n):
            at[a + k] = float(heard[b + k][1])
    times = []
    for i in first[1:]:
        j = next(j for j in range(i, len(script)) if j in at)  # the sentence's first word that was heard
        times.append(round(at[j], 2))
    assert all(x < y for x, y in zip(times, times[1:])), it["id"]
    out[f"{it['slug']}/{it['id']}"] = times
    print(f"{it['id']:15s} {times}  ({len(at)}/{len(script)} words matched)")

with open("lib/cue-times.json", "w") as f:
    json.dump(out, f, indent=1)
    f.write("\n")
