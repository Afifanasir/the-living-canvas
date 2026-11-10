"""Records every character's monologue with Zonos (Zyphra, Apache-2.0), a free model that runs locally and takes
explicit emotions. Each character's voice comes from their earlier reading (raw/voices/kokoro/<id>.mp3); the roster's
delivery is translated into an emotion mix, a pace and how much the pitch swings.

Writes public/exhibits/<slug>/vo/<id>.mp3 (250 ms of silence each end, every voice at the same loudness).
Needs ffmpeg and espeak-ng. Run: raw/zonos-venv/bin/python scripts/voices-zonos.py [character-id ...]
"""
import json, os, re, subprocess, sys, tempfile

import soundfile as sf
import torch
from zonos.conditioning import make_cond_dict
from zonos.model import Zonos

# Emotion mix, in Zonos' order: happiness, sadness, disgust, fear, surprise, anger, other, neutral.
# rate: phonemes per second (15 is ordinary speech). pitch: how far the pitch swings (20 is calm, 90 is frantic).
DIRECTION = {
    "judas":          dict(emotion=[0.05, 0.10, 0.10, 0.60, 0.05, 0.25, 0.10, 0.10], rate=14.0, pitch=30),  # defensive, paranoid whisper
    "peter":          dict(emotion=[0.00, 0.05, 0.20, 0.05, 0.10, 0.85, 0.05, 0.05], rate=17.0, pitch=70),  # fierce, impulsive rage
    "adam":           dict(emotion=[0.10, 0.50, 0.00, 0.10, 0.25, 0.00, 0.10, 0.40], rate=11.0, pitch=28),  # languid, heavy awakening
    "divine-voice":   dict(emotion=[0.05, 0.10, 0.00, 0.00, 0.10, 0.25, 0.30, 0.50], rate=12.0, pitch=30, echo=True),  # cosmic urgency and authority
    "cocq":           dict(emotion=[0.05, 0.00, 0.15, 0.35, 0.25, 0.55, 0.05, 0.05], rate=17.0, pitch=70),  # pompous, desperate command
    "golden-girl":    dict(emotion=[0.25, 0.10, 0.00, 0.05, 0.10, 0.00, 0.50, 0.30], rate=12.0, pitch=45),  # dreamlike, eerie murmur
    "girl":           dict(emotion=[0.25, 0.05, 0.00, 0.35, 0.20, 0.00, 0.10, 0.30], rate=13.0, pitch=35),  # breathless, intimate whisper
    "saturn":         dict(emotion=[0.00, 0.30, 0.10, 0.90, 0.20, 0.30, 0.05, 0.00], rate=16.0, pitch=90),  # choking, animalistic panic
    "marianne":       dict(emotion=[0.30, 0.00, 0.00, 0.00, 0.20, 0.70, 0.05, 0.05], rate=16.0, pitch=80),  # roaring battle cry
    "gavroche":       dict(emotion=[0.30, 0.10, 0.05, 0.05, 0.15, 0.60, 0.05, 0.05], rate=17.0, pitch=70),  # scrappy, fierce defiance
    "vincent":        dict(emotion=[0.20, 0.50, 0.00, 0.20, 0.30, 0.00, 0.10, 0.20], rate=12.5, pitch=45),  # poetic, anxious wonder
    "cypress":        dict(emotion=[0.00, 0.30, 0.00, 0.00, 0.00, 0.05, 0.10, 0.60], rate=10.0, pitch=15, echo=True),  # deep, solemn sentinel
    "clamping-soul":  dict(emotion=[0.00, 0.20, 0.05, 1.00, 0.30, 0.10, 0.05, 0.00], rate=17.0, pitch=90),  # breathless, claustrophobic panic
    "walking-friend": dict(emotion=[0.05, 0.00, 0.15, 0.00, 0.00, 0.00, 0.05, 0.80], rate=13.5, pitch=15),  # cold, detached murmuring
}

lines = json.loads(subprocess.check_output([
    "node", "-e",
    "import('./content/gallery.ts').then(m=>console.log(JSON.stringify(m.exhibits.flatMap(e=>e.hotspots.filter(h=>h.line).map(h=>({slug:e.slug,id:h.id,line:h.line}))))))",
]))
only = set(sys.argv[1:])

device = "mps" if torch.backends.mps.is_available() else "cpu"
model = Zonos.from_pretrained("Zyphra/Zonos-v0.1-transformer", device=device)

def chunks(text, limit=190):
    # Zonos keeps its delivery best on passages of a few sentences; split long monologues at sentence ends.
    out, cur = [], ""
    for s in re.split(r"(?<=[.!?…])\s+", text):
        if cur and len(cur) + len(s) > limit:
            out.append(cur)
            cur = s
        else:
            cur = f"{cur} {s}".strip()
    return out + ([cur] if cur else [])

for item in lines:
    cid = item["id"]
    if only and cid not in only:
        continue
    d = DIRECTION[cid]
    with tempfile.TemporaryDirectory() as tmp:
        subprocess.run(["ffmpeg", "-y", "-i", f"raw/voices/kokoro/{cid}.mp3", "-ac", "1", f"{tmp}/ref.wav"], check=True, capture_output=True)
        data, sr = sf.read(f"{tmp}/ref.wav", dtype="float32")
    speaker = model.make_speaker_embedding(torch.from_numpy(data).unsqueeze(0), sr)
    parts = []
    for text in chunks(item["line"]):
        cond = make_cond_dict(text=text, speaker=speaker, language="en-us", emotion=d["emotion"], speaking_rate=d["rate"], pitch_std=d["pitch"], device=device)
        codes = model.generate(model.prepare_conditioning(cond), progress_bar=False)
        wav = model.autoencoder.decode(codes).cpu()[0]
        parts += [wav, torch.zeros(1, int(model.autoencoder.sampling_rate * 0.3))]
    with tempfile.TemporaryDirectory() as tmp:
        out = f"{tmp}/line.wav"
        sf.write(out, torch.cat(parts, dim=1)[0].numpy(), model.autoencoder.sampling_rate)
        # VOICE_OUT=<dir> writes takes there instead (for comparing before replacing what the rooms play)
        dest = f"{os.environ['VOICE_OUT']}/{cid}.mp3" if os.environ.get("VOICE_OUT") else f"public/exhibits/{item['slug']}/vo/{cid}.mp3"
        os.makedirs(os.path.dirname(dest), exist_ok=True)
        fx = "adelay=250,apad=pad_dur=0.25,loudnorm=I=-18:TP=-1.5:LRA=11"
        if d.get("echo"):
            fx = "aecho=0.8:0.6:90|160:0.28|0.18," + fx
        subprocess.run(["ffmpeg", "-y", "-i", out, "-af", fx, "-ac", "1", "-b:a", "96k", dest], check=True, capture_output=True)
    print("voiced", item["slug"], cid, flush=True)
