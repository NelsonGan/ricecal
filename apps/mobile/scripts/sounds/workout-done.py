# The "workout finished" ding, synthesized so the app owns it outright.
#
#   uv run --with numpy --with scipy scripts/sounds/workout-done.py
#
# A single C6 with two faint harmonics. Picked from six candidates (glass bell,
# hand bell, singing bowl, marimba, two-note chime, this one) as the softest
# that still carries on a phone speaker: a 10 ms raised-cosine attack, so no
# click; only harmonic partials, so no beating; nothing below 1 kHz, which a
# phone speaker would drop; and gone in under two seconds, so it does not hang
# over the gym's music. The bowl was gentler still, but its 523 Hz body is
# below what a phone plays and it rang for three seconds.
import pathlib
import subprocess
import tempfile

import numpy as np
from scipy.io import wavfile

SR = 44100
F0 = 1046.5  # C6
PARTIALS = [(1, 1.0, 0.8), (2, 0.2, 0.35), (3, 0.06, 0.18)]  # ratio, level, decay (s)
ATTACK = 0.010
LENGTH = 1.7

t = np.arange(int(SR * LENGTH)) / SR
rise = 0.5 - 0.5 * np.cos(np.pi * np.clip(t / ATTACK, 0, 1))
y = sum(level * np.sin(2 * np.pi * F0 * ratio * t) * rise * np.exp(-t / decay)
        for ratio, level, decay in PARTIALS)
fade = int(0.08 * SR)
y[-fade:] *= np.linspace(1, 0, fade)
y = y / np.max(np.abs(y)) * 0.7  # about -3 dBFS: a notice, not an alarm

out = pathlib.Path(__file__).resolve().parents[2] / 'assets/sounds/workout-done.m4a'
with tempfile.NamedTemporaryFile(suffix='.wav') as wav:
    wavfile.write(wav.name, SR, (y * 32767).astype(np.int16))
    subprocess.run(['ffmpeg', '-y', '-loglevel', 'error', '-i', wav.name,
                    '-ac', '1', '-c:a', 'aac', '-b:a', '64k', str(out)], check=True)
print(out)
