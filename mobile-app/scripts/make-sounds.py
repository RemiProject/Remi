# Synthesizes Remi's interface sounds into assets/sounds/ (mono 16-bit WAV, 44.1 kHz). Run: python3 scripts/make-sounds.py
# Soft sine tones with a 2 ms attack and an exponential decay, quiet by design: they confirm an action, never announce it.
import math, struct, wave
from pathlib import Path

RATE = 44100
OUT = Path(__file__).resolve().parent.parent / 'assets' / 'sounds'

def tone(freq, length, decay, amp, start=0.0, glide_to=None, harmonics=((1, 1.0), (2, 0.18))):
    """One note: frequency (optionally gliding), decay time constant in seconds, peak amplitude."""
    n = int(length * RATE); out = [0.0] * int((start + length) * RATE); phase = 0.0
    for i in range(n):
        t = i / RATE
        f = freq if glide_to is None else freq + (glide_to - freq) * min(1.0, t / (length * 0.6))
        phase += 2 * math.pi * f / RATE
        env = min(1.0, t / 0.002) * math.exp(-t / decay)
        out[int(start * RATE) + i] = amp * env * sum(w * math.sin(h * phase) for h, w in harmonics)
    return out

def mix(*parts):
    length = max(len(p) for p in parts); return [sum(p[i] for p in parts if i < len(p)) for i in range(length)]

def write(name, samples):
    tail = int(0.01 * RATE)  # 10 ms fade so nothing clicks at the end
    samples = [s * (min(1.0, (len(samples) - i) / tail)) for i, s in enumerate(samples)]
    with wave.open(str(OUT / f'{name}.wav'), 'wb') as w:
        w.setnchannels(1); w.setsampwidth(2); w.setframerate(RATE)
        w.writeframes(b''.join(struct.pack('<h', int(max(-1, min(1, s)) * 32767)) for s in samples))

OUT.mkdir(parents=True, exist_ok=True)
write('tick', tone(1568, 0.09, 0.025, 0.22, harmonics=((1, 1.0), (1.5, 0.35))))           # an item checked off
write('pop', tone(520, 0.12, 0.04, 0.28, glide_to=880))                                     # something added
write('success', mix(tone(1047, 0.22, 0.07, 0.2), tone(1568, 0.3, 0.09, 0.2, start=0.075)))  # a save or a finished task
write('remove', tone(260, 0.14, 0.045, 0.3, glide_to=170, harmonics=((1, 1.0),)))           # something removed
write('error', mix(tone(440, 0.16, 0.06, 0.18, harmonics=((1, 1.0), (3, 0.12))),
                   tone(349, 0.22, 0.08, 0.18, start=0.11, harmonics=((1, 1.0), (3, 0.12)))))  # it didn't work
print(sorted(p.name for p in OUT.glob('*.wav')))
