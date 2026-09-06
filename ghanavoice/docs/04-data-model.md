# Data model

Source of truth: `supabase/migrations/0001_init.sql`. TypeScript mirrors: `src/lib/kb/types.ts`, `src/lib/evaluation/types.ts`.

## Language varieties

`language_code` enum: `en`, `ak-asante`, `ak-akuapem`, `ee`, `gaa`. Asante and Akuapem Twi are distinct codes sharing group `ak`. The `languages` table holds `support_status` which may only become `evaluated` with an `evaluation_run_id` and reviewer sign-off.

Fallback chain used by retrieval and packs: requested variety → sister variety → English, each step labelled (`languageFallback`).

## Knowledge base

```
kb_entries (id, domain, topic, health_general_info_only, updated_on, review_by, status, regions[], escalation jsonb, organisation_id)
  ├── kb_sources (title, publisher, url, published_on, verified_on, rights)
  ├── kb_renderings (language, title, summary, body, keywords[], origin, native_reviewed, reviewed_on, reviewed_by, embedding vector(1536), tsv)
  └── kb_status_audit (from_status, to_status, actor, note, at)
```

Invariants (schema + SQL constraints):
- at least one source with `verified_on` and `rights`;
- an English rendering exists as the reference text;
- health entries have `health_general_info_only = true`;
- `native_reviewed` requires reviewer and date;
- one rendering per (entry, language).

## Glossary

`glossary_terms (id, concept, domain, en, avoid jsonb)` with `glossary_renderings (language, term, note, approved, approved_by, approved_on)`. Approved terms are injected into the hosted-model prompt as preferred terminology and used by reviewers as the style reference.

## Consent-gated audio

`audio_samples (id, storage_path, language, region, transcript_machine, transcript_human, stt_provider, stt_confidence, consent_text_version, research_use, expires_at, deleted_at)`. Storage bucket `audio-samples` is private; `purge_expired_audio()` runs hourly.

## Feedback and escalation

- `feedback_suggestions`: issue type, entry ids, suggested wording (max 1000 chars), triage status.
- `escalations`: reference, domain, question (only because the user asked for a human), optional contact, status; purged 30 days after closure.

## Analytics

`analytics_events` has no free-text columns except enumerated categories. `session_hash` is `sha256(salt:day:sessionId)[0:24]`. Raw events kept 90 days.

## Evaluation

`evaluation_runs (task, language, provider, model, dataset_version, item_count, metrics jsonb, caveats[], native_references)`. Dataset items live in the repository under `evaluation/datasets` with JSON Schemas in `evaluation/schema`.

## Organisations and monetisation

`organisations (plan, domain_scope, branding)`, `admin_users (roles[], native_reviewer_for[])`, `api_keys (key_hash, prefix, plan, domain_scope, revoked_at)`, `api_key_usage (key_id, month, count)`.

## Client-side (device only)

localStorage keys `gv.settings.v1`, `gv.consent.v1`, `gv.history.v1`, `gv.session.v1`; Cache Storage `gv-packs-v1` for offline packs; `gv-shell-v1` for the app shell.
