"""Times every subtitle from the recording itself.

The voices pause between sentences, and they also whisper, cough, laugh and echo, so splitting a clip by sentence
length drifts. For each voice file this finds the dips in loudness (relative to that voice's own level, so voices
with heavy reverb work too), then places all of the speaker's sentence breaks at once, strictly in order, on the
dips that are both long and close to where each break would otherwise fall (dynamic programming).

Writes lib/cue-times.json: { "<slug>/<id>": [start of sentence 2, start of sentence 3, ...] } in seconds.
Run after recording voices: raw/tts-venv/bin/python scripts/cue-times.py
"""
import json, re, subprocess

import librosa
import numpy as np

PAD = 0.25
HOP = 0.02  # seconds per loudness frame

items = json.loads(subprocess.check_output([
    "node", "-e",
    "import('./content/gallery.ts').then(m=>console.log(JSON.stringify(m.exhibits.flatMap(e=>e.hotspots.filter(h=>h.line).map(h=>({slug:e.slug,id:h.id,line:h.line}))))))",
]))


def sentences(line):  # the same split as lib/subtitles.ts
    return [s for s in re.split(r"(?<=[.!?])\s+", line) if s]


out = {}
for it in items:
    y, sr = librosa.load(f"public/exhibits/{it['slug']}/vo/{it['id']}.mp3", sr=16000, mono=True)
    d = len(y) / sr
    hop = int(HOP * sr)
    rms = librosa.feature.rms(y=y, frame_length=hop * 2, hop_length=hop)[0]
    db = 20 * np.log10(rms + 1e-9)
    speech = db[(np.arange(len(db)) * HOP > PAD) & (np.arange(len(db)) * HOP < d - PAD)]
    level = np.percentile(speech, 70)  # this voice's typical speaking level
    quiet = db < level - 16  # a dip well below it (works through reverb tails too)
    # runs of quiet frames inside the speech: candidate pauses (start, end) in seconds
    pauses, i = [], 0
    while i < len(quiet):
        if quiet[i]:
            j = i
            while j < len(quiet) and quiet[j]:
                j += 1
            s, e = i * HOP, j * HOP
            if e - s >= 0.12 and s > PAD + 0.15 and e < d - PAD - 0.15:
                pauses.append((s, e))
            i = j
        else:
            i += 1
    parts = sentences(it["line"])
    lengths = np.array([len(p) for p in parts], float)
    span = d - 2 * PAD
    guesses = PAD + np.cumsum(lengths)[:-1] / lengths.sum() * span
    n, m = len(guesses), len(pauses)
    times = [float(g) for g in guesses]
    if n and m:
        # cost of putting break b on pause k: distance from its guess, minus a bonus for a longer pause
        def cost(b, k):
            s, e = pauses[k]
            return abs((s + e) / 2 - guesses[b]) - 1.5 * min(e - s, 0.8)
        INF = 1e9
        # dp[b][k]: best total cost with break b on pause k (pauses strictly increasing); breaks may also fall back
        # to their guess (cost 1.2) when no fitting pause exists
        best = [[INF] * (m + 1) for _ in range(n + 1)]
        choice = [[None] * (m + 1) for _ in range(n + 1)]
        best[0][0] = 0.0
        for b in range(n):
            for k in range(m + 1):  # k = pauses already used
                if best[b][k] >= INF:
                    continue
                # fall back to the guess for this break
                if best[b][k] + 1.2 < best[b + 1][k]:
                    best[b + 1][k], choice[b + 1][k] = best[b][k] + 1.2, (k, None)
                for q in range(k, m):
                    c = best[b][k] + cost(b, q)
                    if abs((pauses[q][0] + pauses[q][1]) / 2 - guesses[b]) > max(3.0, span * 0.25):
                        continue
                    if c < best[b + 1][q + 1]:
                        best[b + 1][q + 1], choice[b + 1][q + 1] = c, (k, q)
        k = int(np.argmin(best[n]))
        for b in range(n, 0, -1):
            prev, q = choice[b][k]
            times[b - 1] = pauses[q][1] if q is not None else float(guesses[b - 1])
            k = prev
        # keep strictly increasing
        for b in range(1, n):
            times[b] = max(times[b], times[b - 1] + 0.3)
    key = f"{it['slug']}/{it['id']}"
    out[key] = [round(t, 2) for t in times]
    print(f"{it['id']:15s} estimate {[round(float(g), 2) for g in guesses]} -> real {out[key]}  ({m} pauses)")

with open("lib/cue-times.json", "w") as f:
    json.dump(out, f, indent=1)
    f.write("\n")
