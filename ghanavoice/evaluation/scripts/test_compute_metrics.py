"""Unit tests for the metric implementations. Run: python3 -m pytest evaluation/scripts  (or python3 evaluation/scripts/test_compute_metrics.py)"""
import math
import os
import sys

sys.path.insert(0, os.path.dirname(__file__))
from compute_metrics import chrf, edit_distance, normalise, wer  # noqa: E402


def test_edit_distance():
    assert edit_distance(["a", "b", "c"], ["a", "b", "c"]) == 0
    assert edit_distance(["a", "b", "c"], ["a", "c"]) == 1
    assert edit_distance([], ["x"]) == 1


def test_wer_perfect_and_partial():
    assert wer(["Frɛ 112 sɛ ɔhaw kɛse bi asi"], ["Frɛ 112 sɛ ɔhaw kɛse bi asi"]) == 0.0
    assert math.isclose(wer(["one two three four"], ["one two tree four"]), 0.25)


def test_wer_folding_measures_keyboard_tolerance():
    ref, hyp = ["Frɛ 112 sɛ ɔhaw"], ["Fre 112 se ohaw"]
    assert wer(ref, hyp) == 0.75
    assert wer(ref, hyp, fold_special=True) == 0.0


def test_normalise_strips_punctuation_and_case():
    assert normalise("Mɛyɛ dɛn, akyerɛw?") == "mɛyɛ dɛn akyerɛw"


def test_chrf_bounds():
    assert chrf("abc", ["abc"]) > 0.99
    assert chrf("xyz", ["abc"]) == 0.0
    assert 0 < chrf("kookoo afuo", ["kookoo afuw"]) < 1


if __name__ == "__main__":
    for name, fn in list(globals().items()):
        if name.startswith("test_"):
            fn()
            print("ok", name)
