# GhanaVoice

A low-bandwidth voice and text assistant that gives people in Ghana sourced public information in **Asante Twi, Akuapem Twi, Ewe, Ga and English**. Version 0.1 covers public services, education and agriculture; health is limited to curated general information and never diagnoses or prescribes.

> **Honesty notice.** No Ghanaian language in this repository has been validated by native speakers yet. The UI labels them "experimental", the evaluation dashboard shows "not evaluated" for transcription and translation quality, and the default speech-to-text provider is a mock. See `docs/07-native-speaker-validation-plan.md` for what has to happen before any accuracy claim is made.

## What is in the box

| Area | Where |
| --- | --- |
| Installable PWA (Next.js 15, TypeScript, Tailwind) | `src/app`, `src/components`, `public/sw.js`, `public/manifest.webmanifest` |
| Provider-agnostic AI layer (STT, TTS, embeddings, grounded LLM, language suggestion) | `src/lib/ai` |
| Retrieval-based answering with citations, confidence, abstention and safety rules | `src/lib/rag` |
| Curated knowledge base (18 entries, sources, dates, rights) and glossary | `content/` |
| PostgreSQL / Supabase schema with pgvector, RLS, workflow functions, purge jobs | `supabase/migrations/0001_init.sql` |
| Admin console: content workflow, native-speaker sign-off, glossary, queue (escalations, suggestions, audio transcripts), evaluation dashboard, analytics, API keys | `src/app/admin`, `src/app/api/admin` |
| Licensed API surface with hashed keys, quotas and organisation scoping | `src/app/api/v1/ask`, `src/lib/billing`, `src/lib/ops` |
| Audio purge edge function, Dockerfile, GitHub Actions CI | `supabase/functions/purge-audio`, `Dockerfile`, `.github/workflows/ghanavoice-ci.yml` (repo root) |
| Evaluation datasets, schemas and Python metric scripts (WER, chrF) | `evaluation/` |
| Tests (Vitest, 56) and Python unit tests | `tests/`, `evaluation/scripts/test_compute_metrics.py` |
| Documentation: requirements, responsible AI, flows, schema, adapters, evaluation, validation, deployment, monetisation, workflow | `docs/` |

## Quick start (demo mode, no database)

```bash
cd ghanavoice
npm install
cp .env.example .env.local
npm run dev
```

Open http://localhost:3000. Try:

- "How do I register for the Ghana Card?"
- Select Asante Twi and type "Meye den akyerew me din agye Ghana Card" (works without ɛ/ɔ keys).
- "Do I have malaria?" to see the diagnosis refusal, or "my father collapsed and is not breathing" for the emergency path.
- Offline tab: download a pack, switch the browser to offline, ask again.

Admin console at `/admin` (token `change-me`). Demo API key for `POST /api/v1/ask`: `gv_demo`.

## Checks

```bash
npm test                 # 56 unit and pipeline tests
npm run typecheck
npm run build
npm run kb:validate      # content schema and per-language coverage
python3 evaluation/scripts/test_compute_metrics.py
```

## Architecture in one paragraph

The browser sends a question (typed, or transcribed through the configured STT adapter) to `/api/ask`. Rule-based safety runs first: emergencies, diagnosis and prescription requests are redirected, not answered. Otherwise hybrid retrieval (BM25 with orthography folding plus embedding cosine) selects passages from **published** knowledge-base renderings in the requested variety, falling back to the sister Twi variety and then English with a visible label. The default answerer is extractive (it copies curated text and cannot hallucinate); an optional hosted model may rewrite the passages under a strict grounding prompt and is discarded if it violates health rules, times out or fails. Every answer carries citations with verification and update dates, a composite confidence indicator with its reasons, a health disclaimer where relevant, and an escalation action. Analytics store categories and counts only.

## Key decisions and assumptions

1. **Asante and Akuapem Twi are distinct codes** (`ak-asante`, `ak-akuapem`) throughout: content, glossary, retrieval fallback, evaluation.
2. **Demo mode** runs entirely from bundled JSON with mock providers so anyone can evaluate the product; **full mode** uses Supabase.
3. **Speech for Ghanaian languages** is expected to come from a self-hosted fine-tuned model behind the generic HTTP adapter; the repo does not pretend Whisper supports them.
4. **Browsers have no Twi/Ewe/Ga voices**; playback for these languages requires a server TTS adapter, and the UI says so.
5. **Bundled content** was drafted by the engineering team from public sources with verification dates; deploying institutions should seed it as drafts and re-verify before publishing.

## Licence of bundled data

Content summaries and sample questions: CC BY 4.0 (GhanaVoice team). Placeholder audio contains no speech. Third-party sources are cited with rights statements in each entry.
