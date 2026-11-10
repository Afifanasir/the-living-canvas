"""Records every character's monologue with Chatterbox (multilingual, so each speaks English in their own accent) (Resemble AI, MIT), a free model that runs locally and can
act with intensity. Each character's voice is cloned from their Kokoro reading (raw/voices/kokoro/<id>.mp3, made by
scripts/voices.ts), and the roster's delivery sets how intensely each line is performed.

Writes public/exhibits/<slug>/vo/<id>.mp3 with 250 ms of silence at each end. Needs ffmpeg.
Run: raw/tts-venv/bin/python scripts/voices-chatterbox.py [character-id ...]
"""
import json, os, re, subprocess, sys, tempfile

import torch
import torchaudio as ta
from chatterbox.mtl_tts import ChatterboxMultilingualTTS

# lang: the character's own accent. The words stay English; telling the multilingual model the speaker is Italian,
# Dutch, Spanish, French or Norwegian makes it speak English with that accent.
# exaggeration: how heated the delivery is (0.3 calm … 1.3 raging); cfg: lower = freer, more dramatic pacing.
# echo: a stone-hall reverb for the voices that are more than human.
DIRECTION = {
    "judas": dict(lang="it", exaggeration=0.65, cfg=0.4),          # defensive, paranoid whisper
    "peter": dict(lang="it", exaggeration=1.2, cfg=0.3),           # fierce, impulsive rage
    "adam": dict(lang="it", exaggeration=0.35, cfg=0.5),           # languid, heavy awakening
    "divine-voice": dict(lang="it", exaggeration=0.55, cfg=0.5, echo=True),  # cosmic urgency and authority
    "cocq": dict(lang="nl", exaggeration=0.95, cfg=0.35),          # pompous, desperate command
    "golden-girl": dict(lang="nl", exaggeration=0.45, cfg=0.5),    # dreamlike, eerie murmur
    "girl": dict(lang="nl", exaggeration=0.45, cfg=0.5),           # breathless, intimate whisper
    "saturn": dict(lang="es", exaggeration=1.3, cfg=0.3),          # choking, animalistic panic
    "marianne": dict(lang="fr", exaggeration=1.3, cfg=0.3),        # roaring battle cry
    "gavroche": dict(lang="fr", exaggeration=1.1, cfg=0.3),        # scrappy, fierce defiance
    "vincent": dict(lang="nl", exaggeration=0.5, cfg=0.5),         # poetic, anxious wonder
    "cypress": dict(lang="fr", exaggeration=0.35, cfg=0.55, echo=True),  # deep, solemn sentinel
    "clamping-soul": dict(lang="no", exaggeration=1.25, cfg=0.3),  # breathless, claustrophobic panic
    "walking-friend": dict(lang="no", exaggeration=0.3, cfg=0.5),  # cold, detached murmuring
}

# A line in each character's own language. Spoken first, it becomes the voice sample for their English
# monologue, so the accent carries over (the model copies the accent of the sample it is given).
NATIVE = {
    "it": "Non guardare le mie mani. Il sale è versato, e nessuno di noi sarà salvato questa notte.",
    "nl": "Houd de rijen, heren! Wie heeft daar achter mijn schouder geschoten? Stil, allemaal stil.",
    "es": "Tenía que hacerlo. El trono se pudre bajo mis pies, y el tiempo lo devora todo.",
    "fr": "Ne regardez pas les morts, regardez devant vous! Aujourd'hui, Paris brise ses chaînes.",
    "no": "Hører du det ikke? Skriket går gjennom åsene og fjorden, og ingen andre hører det.",
}

# The roster's lines, straight from content/gallery.ts (via node, so there is one source of truth).
lines = json.loads(subprocess.check_output([
    "node", "-e",
    "import('./content/gallery.ts').then(m=>console.log(JSON.stringify(m.exhibits.flatMap(e=>e.hotspots.filter(h=>h.line).map(h=>({slug:e.slug,id:h.id,line:h.line}))))))",
]))
only = set(sys.argv[1:])

device = "mps" if torch.backends.mps.is_available() else "cpu"
model = ChatterboxMultilingualTTS.from_pretrained(device=device)

def sentences(text):
    # Short pieces keep the model steady over long monologues; they are joined with small natural pauses.
    return [s.strip() for s in re.split(r"(?<=[.!?…])\s+", text) if s.strip()]

for item in lines:
    cid = item["id"]
    if only and cid not in only:
        continue
    d = DIRECTION[cid]
    with tempfile.TemporaryDirectory() as tmp:
        base = f"{tmp}/base.wav"
        subprocess.run(["ffmpeg", "-y", "-i", f"raw/voices/kokoro/{cid}.mp3", "-ar", "24000", "-ac", "1", base], check=True, capture_output=True)
        # The character speaks their own language first; that recording carries their accent into the English.
        native = model.generate(NATIVE[d["lang"]], language_id=d["lang"], audio_prompt_path=base, exaggeration=0.5, cfg_weight=0.5)
        ref = f"{tmp}/ref.wav"
        ta.save(ref, native.cpu(), model.sr)
        os.makedirs("raw/voices/accent", exist_ok=True)
        ta.save(f"raw/voices/accent/{cid}.wav", native.cpu(), model.sr)
        pause = torch.zeros(1, int(model.sr * 0.28))
        parts = []
        for s in sentences(item["line"]):
            wav = model.generate(s, language_id=d["lang"], audio_prompt_path=ref, exaggeration=d["exaggeration"], cfg_weight=d["cfg"])
            parts += [wav.cpu(), pause]
        out = f"{tmp}/line.wav"
        ta.save(out, torch.cat(parts, dim=1), model.sr)
        # Keep the clean take: scripts/voice-fx.py builds each character's sound design from it.
        os.makedirs("raw/voices/takes", exist_ok=True)
        ta.save(f"raw/voices/takes/{cid}.wav", torch.cat(parts, dim=1), model.sr)
        # VOICE_OUT=<dir> writes takes there instead (for comparing before replacing what the rooms play)
        dest = f"{os.environ['VOICE_OUT']}/{cid}.mp3" if os.environ.get("VOICE_OUT") else f"public/exhibits/{item['slug']}/vo/{cid}.mp3"
        os.makedirs(os.path.dirname(dest), exist_ok=True)
        fx = "adelay=250,apad=pad_dur=0.25,loudnorm=I=-18:TP=-1.5:LRA=11"  # every character at the same loudness
        if d.get("echo"):
            fx = "aecho=0.8:0.6:90|160:0.28|0.18," + fx
        subprocess.run(["ffmpeg", "-y", "-i", out, "-af", fx, "-ac", "1", "-b:a", "96k", dest], check=True, capture_output=True)
    print("voiced", item["slug"], cid, flush=True)
