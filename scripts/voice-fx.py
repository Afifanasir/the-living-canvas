"""Sound design for the character voices: turns each clean take (raw/voices/takes/<id>.wav, from
scripts/voices-chatterbox.py) into the delivery the roster asks for, the way a studio would:

  whisper   the voice's pitch is replaced by breath (spectral envelope kept, harmonics removed), so a "paranoid
            whisper" really is whispered, not just quiet; mixed with a little of the voiced take for clarity
  tremor    an unsteady, shaking pitch and level (agony, panic, dread)
  rasp      a strained, overdriven edge (rage, battle cries, choking)
  breaths   ragged breaths dropped into the pauses between phrases (panic, agony, nerves)
  octave    a second voice an octave below (the Divine Voice)
  shimmer   a faint detuned double (the eerie Golden Girl)
  space     the room each painting lives in: stone refectory, chapel, timber hall, open night air...
  close     pressed close to the ear (whispers) or set back (the detached friend)

Writes public/exhibits/<slug>/vo/<id>.mp3, or VOICE_OUT/<id>.mp3 when set.
Run: raw/tts-venv/bin/python scripts/voice-fx.py [character-id ...]
"""
import json, os, subprocess, sys, tempfile

import librosa
import numpy as np
import soundfile as sf
from scipy.ndimage import uniform_filter1d
from scipy.signal import butter, fftconvolve, sosfilt

SR = 24000
rng = np.random.default_rng(7)

# Spaces: (decay seconds, wet level, brightness 0 dark … 1 bright)
SPACE = {
    "refectory": (2.2, 0.16, 0.45),   # The Last Supper: a stone dining hall
    "chapel": (4.5, 0.3, 0.35),       # The Creation of Adam: the Sistine vault
    "guildhall": (1.2, 0.12, 0.5),    # The Night Watch: a timber-beamed hall
    "studio": (0.5, 0.08, 0.55),      # Girl with a Pearl Earring: a small Delft room
    "farmhouse": (0.9, 0.12, 0.4),    # Saturn: a dark farmhouse dining room
    "street": (1.6, 0.1, 0.5),        # Liberty: a Paris street of stone
    "night": (2.8, 0.14, 0.3),        # The Starry Night: open night air over the valley
    "fjord": (1.8, 0.12, 0.45),       # The Scream: the bridge above the fjord
    "well": (3.8, 0.5, 0.22),         # The Slain Son: a voice echoing out of a dark well, a hollow chest
}

DESIGN = {
    "judas": dict(space="refectory", whisper=0.92, tremor=0.25, breaths=0.5, close=True),             # paranoid whisper
    "peter": dict(space="refectory", rasp=0.55, tremor=0.1),                                         # fierce rage
    "adam": dict(space="chapel", whisper=0.2, breaths=0.35, slow=0.92),                              # heavy awakening
    "divine-voice": dict(space="chapel", octave=0.4, wet=0.4),                                       # cosmic authority
    "cocq": dict(space="guildhall", rasp=0.35, tremor=0.12),                                         # pompous, desperate
    "golden-girl": dict(space="guildhall", whisper=0.35, shimmer=0.35, wet=0.22),                    # eerie murmur
    "girl": dict(space="studio", whisper=0.9, breaths=0.45, close=True),                            # breathless whisper
    "saturn": dict(space="farmhouse", rasp=0.75, tremor=0.6, breaths=0.9, whisper=0.15, pitch=-1.5), # animal agony
    "marianne": dict(space="street", rasp=0.5, tremor=0.08),                                         # battle cry
    "gavroche": dict(space="street", rasp=0.4),                                                      # scrappy defiance
    "vincent": dict(space="night", whisper=0.18, tremor=0.12, breaths=0.25),                         # anxious wonder
    "cypress": dict(space="night", pitch=-3, octave=0.2, wet=0.3),                                   # solemn sentinel
    "clamping-soul": dict(space="fjord", whisper=0.55, tremor=0.5, breaths=0.9, close=True),         # breathless panic
    "walking-friend": dict(space="fjord", distant=True),                                             # cold, detached
    "slain-son": dict(space="well", octave=0.22, breaths=0.45, wet=0.5),                              # hollow, cavernous, wheezing
}


def band(x, lo=None, hi=None, order=4):
    if lo and hi:
        sos = butter(order, [lo, hi], btype="band", fs=SR, output="sos")
    elif lo:
        sos = butter(order, lo, btype="high", fs=SR, output="sos")
    else:
        sos = butter(order, hi, btype="low", fs=SR, output="sos")
    return sosfilt(sos, x)


def whisperize(x):
    """A real whisper: the mouth's shape (LPC resonances, frame by frame) driven by smooth breath noise instead of
    the voice, overlapped with long soft windows so it flows without the hollow, metallic ring."""
    from scipy.signal import lfilter
    n, hop = 1024, 256                      # ~43 ms frames, 4x overlap
    win = np.hanning(n)
    pad = np.concatenate([np.zeros(n), x, np.zeros(n)])
    out = np.zeros_like(pad)
    norm = np.zeros_like(pad)
    breath = rng.standard_normal(len(pad))
    pre = np.append(pad[0], pad[1:] - 0.97 * pad[:-1])   # pre-emphasis: estimate the mouth shape across the full range
    for start in range(0, len(pad) - n, hop):
        seg = pre[start:start + n] * win
        energy = np.sqrt(np.mean(seg ** 2))
        if energy < 1e-5:
            continue
        a = librosa.lpc(seg + 1e-9 * rng.standard_normal(n), order=26)
        exc = breath[start:start + n]
        y = lfilter([1.0], a, exc) * win
        y *= energy / (np.sqrt(np.mean(y ** 2)) + 1e-9)    # match the loudness of the spoken frame
        out[start:start + n] += y * win
        norm[start:start + n] += win ** 2
    w = (out / np.maximum(norm, 1e-3))[n:n + len(x)]
    w = band(w, lo=180)
    w = w + 0.6 * band(w, 2500, 9000)                     # the airy top a real whisper has
    return w / (np.max(np.abs(w)) + 1e-9) * np.max(np.abs(x))


def tremor(x, amount):
    """An unsteady voice: a slow, irregular wobble in pitch and loudness."""
    t = np.arange(len(x)) / SR
    wob = np.sin(2 * np.pi * 5.5 * t + 2 * np.sin(2 * np.pi * 0.7 * t)) + 0.5 * np.sin(2 * np.pi * 8.3 * t)
    amp = 1 + 0.35 * amount * wob
    # pitch wobble by resampling time slightly back and forth
    warp = t + 0.0022 * amount * np.cumsum(wob) / SR * 50
    return np.interp(warp * SR, np.arange(len(x)), x, left=0, right=0) * amp


def rasp(x, amount):
    """A strained, shouted edge: drive into soft clipping, keep the presence."""
    drive = 1 + 9 * amount
    y = np.tanh(x * drive) / np.tanh(drive)
    edge = band(y, 1800, 5000) * 0.6 * amount
    return (1 - 0.5 * amount) * x + 0.5 * amount * y + edge


def breaths(x, amount):
    """Ragged breaths in the pauses between phrases."""
    env = uniform_filter1d(np.abs(x), size=int(0.05 * SR))
    quiet = env < 0.02 * np.max(env)
    out = x.copy()
    i = 0
    while i < len(x):
        if quiet[i]:
            j = i
            while j < len(x) and quiet[j]:
                j += 1
            gap = j - i
            if gap > 0.18 * SR and rng.random() < amount:
                n = min(gap, int(rng.uniform(0.22, 0.45) * SR))
                b = band(rng.standard_normal(n), 400, 3200)
                shape = np.sin(np.linspace(0, np.pi, n)) ** 1.5
                start = i + (gap - n) // 2
                out[start:start + n] += b * shape * 0.06 * np.max(np.abs(x)) * (0.7 + 0.6 * rng.random())
            i = j
        else:
            i += 1
    return out


def space(x, name, wet=None):
    decay, level, bright = SPACE[name]
    n = int(decay * SR)
    ir = rng.standard_normal(n) * np.exp(-6.9 * np.arange(n) / n)      # -60 dB over `decay`
    ir = band(ir, 120, 2500 + 6000 * bright)
    ir[: int(0.012 * SR)] = 0                                          # a little pre-delay
    rev = np.zeros(len(x) + n)
    full = fftconvolve(x, ir)
    rev[: min(len(rev), len(full))] = full[: len(rev)]
    rev = rev / (np.max(np.abs(rev)) + 1e-9) * np.max(np.abs(x))
    y = np.concatenate([x, np.zeros(n)])
    return y + (wet if wet is not None else level) * rev


def design(x, d):
    if d.get("pitch"):
        x = librosa.effects.pitch_shift(x, sr=SR, n_steps=d["pitch"])
    if d.get("slow"):
        x = librosa.effects.time_stretch(x, rate=d["slow"])
    if d.get("whisper"):
        w = d["whisper"]
        x = (1 - w) * x + w * whisperize(x)
    if d.get("tremor"):
        x = tremor(x, d["tremor"])
    if d.get("rasp"):
        x = rasp(x, d["rasp"])
    if d.get("octave"):
        x = x + d["octave"] * librosa.effects.pitch_shift(x, sr=SR, n_steps=-12)
    if d.get("shimmer"):
        up = librosa.effects.pitch_shift(x, sr=SR, n_steps=0.18)
        x = x + d["shimmer"] * np.roll(up, int(0.025 * SR))
    # A gate: between phrases, true silence (any hiss the whisper made is removed); then the deliberate breaths.
    env = uniform_filter1d(np.abs(x), size=int(0.04 * SR))
    gate = np.clip((env / (np.max(env) + 1e-9) - 0.03) / 0.05, 0, 1)
    x = x * uniform_filter1d(gate, size=int(0.03 * SR))
    if d.get("breaths"):
        x = breaths(x, d["breaths"])
    if d.get("close"):
        x = x + 0.35 * band(x, 3000, 9000)                              # breath and lips right at the ear
        # breath that rides on the words only (no constant hiss between them)
        env = uniform_filter1d(np.abs(x), size=int(0.12 * SR))
        x = x + band(rng.standard_normal(len(x)), 1500, 9000) * 0.3 * env
        # squeeze it so the airy consonants and breaths come forward
        x = np.sign(x) * np.abs(x) ** 0.8
    if d.get("distant"):
        x = band(x, 180, 4500)
    # A whisper is close and dry: only a breath of the room, or it turns hollow.
    return space(x, d["space"], 0.035 if d.get("close") else d.get("wet"))


lines = json.loads(subprocess.check_output([
    "node", "-e",
    "import('./content/gallery.ts').then(m=>console.log(JSON.stringify(m.exhibits.flatMap(e=>e.hotspots.filter(h=>h.line).map(h=>({slug:e.slug,id:h.id}))))))",
]))
only = set(sys.argv[1:])
for item in lines:
    cid = item["id"]
    if only and cid not in only:
        continue
    x, sr = librosa.load(f"raw/voices/takes/{cid}.wav", sr=SR, mono=True)
    y = design(x, DESIGN[cid])
    y = y / (np.max(np.abs(y)) + 1e-9) * 0.9
    dest = f"{os.environ['VOICE_OUT']}/{cid}.mp3" if os.environ.get("VOICE_OUT") else f"public/exhibits/{item['slug']}/vo/{cid}.mp3"
    os.makedirs(os.path.dirname(dest), exist_ok=True)
    with tempfile.TemporaryDirectory() as tmp:
        sf.write(f"{tmp}/x.wav", y, SR)
        subprocess.run(["ffmpeg", "-y", "-i", f"{tmp}/x.wav", "-af", "adelay=250,apad=pad_dur=0.25,acompressor=threshold=-20dB:ratio=3:attack=8:release=120,loudnorm=I=-18:TP=-1.5:LRA=11", "-ac", "1", "-b:a", "128k", dest], check=True, capture_output=True)
    print("designed", cid, flush=True)
