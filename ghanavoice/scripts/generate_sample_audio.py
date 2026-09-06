#!/usr/bin/env python3
"""Generate placeholder WAV files referenced by evaluation/datasets/stt.sample.json.

The files contain a short sine tone, NOT speech. They exist so that the STT
evaluation pipeline can be exercised end to end (file discovery, provider
call, WER computation) before consented native-speaker recordings are
available. Never report metrics computed on these files as speech accuracy.

Usage: python3 scripts/generate_sample_audio.py
"""
import json
import math
import os
import struct
import wave

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DATASET = os.path.join(ROOT, "evaluation", "datasets", "stt.sample.json")


def write_tone(path: str, seconds: float = 1.0, freq: float = 440.0, rate: int = 16000) -> None:
    os.makedirs(os.path.dirname(path), exist_ok=True)
    with wave.open(path, "wb") as w:
        w.setnchannels(1)
        w.setsampwidth(2)
        w.setframerate(rate)
        frames = bytearray()
        for i in range(int(seconds * rate)):
            v = int(6000 * math.sin(2 * math.pi * freq * i / rate))
            frames += struct.pack("<h", v)
        w.writeframes(bytes(frames))


def main() -> None:
    with open(DATASET, encoding="utf-8") as f:
        items = json.load(f)
    for n, item in enumerate(items):
        path = os.path.join(ROOT, item["audioPath"])
        write_tone(path, seconds=1.0, freq=330 + 55 * n)
        print("wrote", os.path.relpath(path, ROOT))
    readme = os.path.join(ROOT, "content", "samples", "audio", "generated", "README.txt")
    with open(readme, "w", encoding="utf-8") as f:
        f.write("Placeholder tone files. No speech, no speaker, no rights issues. Replace with consented recordings per docs/07-native-speaker-validation-plan.md.\n")


if __name__ == "__main__":
    main()
