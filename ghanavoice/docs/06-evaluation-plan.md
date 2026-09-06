# Evaluation plan and dataset structure

## What the dashboard reports

| Area | Metric | Source | Status in this repository |
| --- | --- | --- | --- |
| Transcription accuracy | WER, WER with ɛ/ɔ folding, empty-hypothesis rate; stratified by variety, region, gender, age band, condition | `compute_metrics.py stt` on `stt.*.json` items with native-speaker references | **Not evaluated.** Only placeholder tone files exist. |
| Translation quality | chrF against 1+ native references; glossary-term adherence; human adequacy/fluency ratings (1–5) | `compute_metrics.py mt`; reviewer forms | **Not evaluated.** References are drafts. |
| Unsafe answers | Category accuracy, block accuracy, under-block and over-block rates of the rule layer; plus human-rated unsafe rate on red-team prompts | `runSafetyEval` (computed live) | Rule layer measured on a 22-item sample; real-world rate unknown. |
| Retrieval | Hit@1, Hit@3, MRR overall and per language; spelling-variant subset | `runRetrievalEval` (computed live) | Measured on a 30-item team-written sample. |
| Regional variation | Asante/Akuapem paired items; mutual-intelligibility judgements; per-variety retrieval and WER | `variation.*.json`, stratified runs | 6 paired items, none judged yet. |
| Coverage | Renderings per language, native-reviewed count, UI string coverage | computed from content | Live. |

## Dataset files

`evaluation/datasets/<task>.<version>.json` (sample versions ship in-repo; production sets live in a separate rights-controlled bucket and are referenced by `datasetVersion`).

- `stt`: `SttItem` (speaker id, consent id, region, condition, reference, rights). Audio under `content/samples/audio/`.
- `translation`: `TranslationItem` (source, references[], mustUseTerms[], rights).
- `safety`: `SafetyItem` (question, expectedCategory, expectBlock).
- `retrieval`: `RetrievalItem` (question, relevantEntryIds[], variant).
- `variation`: `VariationItem` (concept, asante, akuapem, provenance, mutuallyIntelligible).

JSON Schemas: `evaluation/schema/`.

## Minimum sample sizes before any accuracy claim

- STT: ≥ 300 utterances per variety, ≥ 30 speakers, balanced gender, ≥ 3 regions, ≥ 2 noise conditions.
- Translation: ≥ 200 sentences per variety across the three domains, two independent native references each.
- Safety: ≥ 100 prompts per language including code-switched Twi/English, with adversarial paraphrases.

## Acceptance thresholds for changing `support_status` to `evaluated`

These are proposals to be confirmed with the language advisory group; they are not achieved results.

- WER ≤ 25% in quiet and ≤ 40% in market conditions.
- Median adequacy ≥ 4/5 and fluency ≥ 4/5 from two independent native reviewers; glossary adherence ≥ 95%.
- Under-block rate on the safety set = 0 for diagnosis/prescription; over-block ≤ 5%.
- Retrieval Hit@3 ≥ 90% on citizen-collected questions.

## Recording a run

```bash
python3 evaluation/scripts/compute_metrics.py stt hyps.jsonl \
  --provider akan-asr-v1 --dataset-version 2026-11.ak-asante --language ak-asante --native-references > run.json
curl -X POST https://<host>/api/admin/evaluation -H 'authorization: Bearer <jwt>' -H 'content-type: application/json' -d @run.json
```

## Red-teaming

Quarterly sessions with native speakers to elicit unsafe outputs (medical, political, scams). Findings become `safety` items and, when rules are insufficient, model-side classifiers behind the same interface.
