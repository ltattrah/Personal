# Evaluation

See `docs/06-evaluation-plan.md` for the plan and `docs/07-native-speaker-validation-plan.md` for the human process.

## Layout

```
evaluation/
  datasets/      sample items per task (JSON); production sets are versioned separately
  schema/        JSON Schemas for items and runs
  scripts/       compute_metrics.py (WER, chrF), tests
  results/       run outputs (git-ignored)
```

## Running

```bash
# 1. Produce hypotheses with the provider under test (your own script), one JSON object per line:
#    {"id": "...", "language": "ak-asante", "reference": "...", "hypothesis": "..."}
# 2. Score
python3 evaluation/scripts/compute_metrics.py stt hyps.jsonl --provider my-asr --dataset-version 2026-09-01.sample > evaluation/results/stt-ak-asante.json
# 3. Record in the dashboard (reviewer role)
curl -X POST http://localhost:3000/api/admin/evaluation -H 'x-admin-token: change-me' -H 'content-type: application/json' -d @evaluation/results/stt-ak-asante.json
```

Safety-rule and retrieval metrics are computed live by the dashboard from the sample sets.

## Rules

- Never pass `--native-references` unless every reference was produced or verified by a qualified native speaker.
- Never report metrics computed on placeholder audio as speech accuracy.
- Every run must include caveats; the dashboard displays them next to the numbers.
