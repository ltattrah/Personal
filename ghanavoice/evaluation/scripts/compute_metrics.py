#!/usr/bin/env python3
"""Compute STT and translation metrics for GhanaVoice evaluation runs.

Dependency-free (standard library only) so it runs on any machine.

  Word error rate (WER) for speech-to-text, with orthography-aware
  normalisation (case folding, punctuation removal, optional folding of
  ɛ/ɔ to e/o to measure "keyboard-tolerant" WER separately).

  chrF (character n-gram F-score, beta=2, n<=6) for translation, which is
  more robust than BLEU for morphologically rich, low-resource languages.

Input format (JSONL), one object per line:
  STT:         {"id": ..., "language": ..., "reference": "...", "hypothesis": "..."}
  Translation: {"id": ..., "targetLanguage": ..., "references": ["..."], "hypothesis": "..."}

Usage:
  python3 evaluation/scripts/compute_metrics.py stt  hyps.jsonl --provider whisper-large-v3 --dataset-version 2026-09-01.sample
  python3 evaluation/scripts/compute_metrics.py mt   hyps.jsonl --provider claude-sonnet-5 --dataset-version 2026-09-01.sample --native-references

The output is a JSON document matching evaluation/schema/evaluation-run.schema.json
which can be POSTed to /api/admin/evaluation.  --native-references must only be
passed when every reference was produced or verified by a qualified native
speaker; the dashboard shows this flag next to every number.
"""
from __future__ import annotations

import argparse
import json
import re
import sys
import unicodedata
from collections import Counter
from typing import Iterable

FOLD = str.maketrans({"ɛ": "e", "ɔ": "o", "ɖ": "d", "ƒ": "f", "ɣ": "g", "ŋ": "n", "ʋ": "v", "Ɛ": "e", "Ɔ": "o", "Ɖ": "d", "Ƒ": "f", "Ɣ": "g", "Ŋ": "n", "Ʋ": "v"})
PUNCT = re.compile(r"[^\w\s]", re.UNICODE)


def normalise(text: str, fold_special: bool = False) -> str:
    text = unicodedata.normalize("NFC", text).lower()
    if fold_special:
        text = text.translate(FOLD)
    text = PUNCT.sub(" ", text)
    return re.sub(r"\s+", " ", text).strip()


def edit_distance(a: list[str], b: list[str]) -> int:
    prev = list(range(len(b) + 1))
    for i, x in enumerate(a, 1):
        cur = [i]
        for j, y in enumerate(b, 1):
            cur.append(min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (x != y)))
        prev = cur
    return prev[-1]


def wer(refs: Iterable[str], hyps: Iterable[str], fold_special: bool = False) -> float:
    errors = words = 0
    for r, h in zip(refs, hyps):
        rw = normalise(r, fold_special).split()
        hw = normalise(h, fold_special).split()
        errors += edit_distance(rw, hw)
        words += len(rw)
    return errors / words if words else float("nan")


def chrf(hyp: str, refs: list[str], n: int = 6, beta: float = 2.0) -> float:
    """Sentence-level chrF against the best-matching reference."""
    def grams(s: str, k: int) -> Counter:
        s = normalise(s).replace(" ", "")
        return Counter(s[i : i + k] for i in range(max(0, len(s) - k + 1)))

    best = 0.0
    for ref in refs:
        p_sum = r_sum = 0.0
        used = 0
        for k in range(1, n + 1):
            hg, rg = grams(hyp, k), grams(ref, k)
            if not hg or not rg:
                continue
            used += 1
            overlap = sum((hg & rg).values())
            p_sum += overlap / sum(hg.values())
            r_sum += overlap / sum(rg.values())
        if not used:
            continue
        p, r = p_sum / used, r_sum / used
        score = 0.0 if p + r == 0 else (1 + beta**2) * p * r / (beta**2 * p + r)
        best = max(best, score)
    return best


def load_jsonl(path: str) -> list[dict]:
    with open(path, encoding="utf-8") as f:
        return [json.loads(line) for line in f if line.strip()]


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("task", choices=["stt", "mt"])
    ap.add_argument("hypotheses", help="JSONL file with reference(s) and hypothesis per item")
    ap.add_argument("--provider", required=True)
    ap.add_argument("--model")
    ap.add_argument("--dataset-version", required=True)
    ap.add_argument("--language", help="Language code for the run (defaults to the first item's language)")
    ap.add_argument("--native-references", action="store_true", help="Set only if all references are native-speaker produced/verified")
    ap.add_argument("--caveat", action="append", default=[], help="Free-text caveat shown next to the numbers (repeatable)")
    args = ap.parse_args()

    items = load_jsonl(args.hypotheses)
    if not items:
        print("no items", file=sys.stderr)
        return 1

    if args.task == "stt":
        refs = [i["reference"] for i in items]
        hyps = [i.get("hypothesis", "") for i in items]
        metrics = {
            "wer": round(wer(refs, hyps), 4),
            "wer_folded": round(wer(refs, hyps, fold_special=True), 4),
            "empty_hypotheses": sum(1 for h in hyps if not h.strip()) / len(hyps),
        }
        language = args.language or items[0].get("language")
    else:
        scores = [chrf(i.get("hypothesis", ""), i["references"]) for i in items]
        metrics = {"chrf": round(sum(scores) / len(scores), 4), "chrf_min": round(min(scores), 4)}
        language = args.language or items[0].get("targetLanguage")

    caveats = list(args.caveat)
    if not args.native_references:
        caveats.append("References were NOT produced by qualified native speakers; treat numbers as indicative only.")
    if any("placeholder" in json.dumps(i).lower() for i in items):
        caveats.append("Dataset contains placeholder items; numbers are not speech/translation quality.")

    run = {
        "task": "stt" if args.task == "stt" else "translation",
        "language": language,
        "provider": args.provider,
        "model": args.model,
        "datasetVersion": args.dataset_version,
        "itemCount": len(items),
        "metrics": metrics,
        "caveats": caveats,
        "nativeReferences": bool(args.native_references),
    }
    print(json.dumps(run, ensure_ascii=False, indent=2))
    return 0


if __name__ == "__main__":
    sys.exit(main())
