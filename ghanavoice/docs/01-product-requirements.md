# GhanaVoice: product requirements (v0.1)

## Purpose

GhanaVoice is a low-bandwidth voice and text assistant that gives people in Ghana reliable, sourced public information in Asante Twi, Akuapem Twi, Ewe, Ga and English. Version 1 covers public services, education and agriculture. Health is limited to curated general information and never diagnoses or prescribes.

## Users and contexts

| User | Context | Implication |
| --- | --- | --- |
| Citizen on a basic Android phone | 2G/3G, shared data bundles, noisy environments (markets, tro-tro) | PWA under 300 KB first load; offline packs; push-to-talk capped at 30 s; large tap targets |
| Farmer | Rural, intermittent coverage, prefers speech | Voice input; short spoken answers; extension-agent escalation |
| Parent or student | Exam and placement seasons, high urgency | Fast text path; plain-language steps; links to official portals |
| Institution staff (GES, MoFA, NHIA, district assembly) | Desk, laptop | Admin console: content workflow, glossary, evaluation, analytics |
| Native-speaker reviewer | Often remote, part-time | Rendering-level review state; feedback queue; audio transcript review |
| Developer or licensee | Radio, USSD/IVR, cooperatives | REST API with the same safety layer and citations |

## Functional requirements

| ID | Requirement | Implementation |
| --- | --- | --- |
| F1 | Text and push-to-talk questions | `AskPanel`, `PushToTalk`, `useRecorder` (Opus, 30 s cap, 2 MB upload limit) |
| F2 | Language selection with Asante/Akuapem toggle | `LanguagePicker`; `LanguageCode` model in `src/lib/i18n/languages.ts` |
| F3 | Automatic language suggestion, user confirms | `HeuristicLanguageDetector`, client-side; never auto-switches |
| F4 | Speech-to-text via replaceable provider | `SttProvider` interface; mock, generic HTTP, OpenAI adapters; env-selected |
| F5 | Text response with optional audio playback | `useSpeech`: server TTS route or Web Speech; honest "no voice for this language" notice |
| F6 | Curated knowledge base with visible sources and dates | `KnowledgeEntry.sources[]` with `verifiedOn`, `rights`; `Citations` component |
| F7 | Retrieval-based answers only | Hybrid BM25 + embedding retrieval; extractive default; hosted LLM restricted to rewriting passages and must cite |
| F8 | Confidence indicator | `computeConfidence`: retrieval strength, margin, language fallback, native review, staleness, STT confidence |
| F9 | "I am not certain" and human escalation | Abstain below threshold; `/api/escalate` creates a reference and hands off to partner desk |
| F10 | Downloadable offline packs | `/api/packs`, Cache Storage, `searchPacks` for offline lexical answers |
| F11 | User-controlled history | Device-only, auto-expiry, per-item and bulk delete |
| F12 | Feedback on translation and answer quality | `/api/feedback`: rating, issue type, optional suggested wording to review queue |
| F13 | Glossary and terminology management | `/admin/glossary`, per-variety terms, approval flag, avoid-list |
| F14 | Content review and publishing workflow | draft → in_review → approved → published → retired; role checks; separation of duties; publish gates |
| F15 | Analytics without personal conversations | Event schema forbids text fields; salted daily session hash; 90-day retention |
| F16 | Evaluation dashboard | `/admin/evaluation`: transcription, translation, safety, retrieval, variation, coverage |
| F17 | Monetisation | Plans in `src/lib/billing/plans.ts`; API keys with quotas; organisation scopes |

## Non-functional requirements

- **Performance**: first interactive under 3 s on a 3G connection; API p95 under 2 s for the extractive path; hosted LLM path times out at 8 s and falls back.
- **Availability**: answers must still work when the LLM provider is down (extractive fallback) and when the network is down (offline packs).
- **Accessibility**: WCAG 2.1 AA targets, 44 px minimum touch targets, screen-reader labels, reduced-motion support, works without JavaScript for the disclaimer banner.
- **Localisation**: all UI strings via `t()`; Ghanaian-language strings are marked draft until validated.
- **Security**: RLS on every table, service role only server-side, API keys hashed, security headers, microphone permission scoped to same origin.
- **Privacy**: no audio stored without explicit consent; user-chosen deletion period; no conversation text in analytics; escalation tickets purged 30 days after closure.

## Out of scope for v1

Personal medical triage, legal case advice, financial product recommendations, payments, account systems for citizens, real-time human chat.

## Technical assumptions (stated, not asked)

1. No production-grade ASR exists today for Akan, Ewe or Ga that we can claim accuracy for. The STT adapter contract is designed for a fine-tuned self-hosted model (for example a wav2vec2/Whisper fine-tune on consented Ghanaian recordings) to be plugged in behind `STT_PROVIDER=http`.
2. Browsers do not ship TTS voices for these languages. Audio playback for them is therefore a server-side capability to be added through `TTS_PROVIDER=http`; the UI says so rather than pretending.
3. Supabase (PostgreSQL + pgvector + Storage + Auth) is the system of record. Demo mode runs without it from bundled JSON to let anyone evaluate the product.
4. The hosted LLM is optional and only ever rewrites retrieved passages; the extractive answerer is the guaranteed baseline.
5. Embedding dimension in SQL is 1536; other providers use the in-process index until the column is migrated.
