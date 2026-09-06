# Deployment

## Modes

| Mode | Storage | Providers | Use |
| --- | --- | --- | --- |
| `demo` (default) | Bundled JSON in `/content`, in-memory analytics | mock STT, browser TTS, hash embeddings, extractive answers | Evaluate the product, run tests, build offline packs |
| `full` | Supabase PostgreSQL + Storage + Auth | as configured | Pilot and production |

## Local development

```bash
cd ghanavoice
npm install
cp .env.example .env.local
npm run dev            # http://localhost:3000
npm test               # unit and pipeline tests
npm run typecheck
npm run kb:validate    # content schema and coverage
python3 evaluation/scripts/test_compute_metrics.py
```

Admin console: http://localhost:3000/admin with token `change-me` (ADMIN_TOKEN). Demo API key for `/api/v1/ask`: `gv_demo`.

## Full mode on Supabase

1. Create a Supabase project. In the SQL editor run `supabase/migrations/0001_init.sql`. Enable `pg_cron` and uncomment the schedules at the end of the file.
2. Create an Auth user for each administrator and insert a row in `admin_users` with roles and `native_reviewer_for`.
3. Set environment variables (see `.env.example`): `GHANAVOICE_MODE=full`, Supabase URL and keys, provider choices, `ANALYTICS_SALT` (random, secret), `AUDIO_RETENTION_DAYS_MAX`.
4. Seed content as drafts so your institution re-verifies before publishing:

   ```bash
   GHANAVOICE_MODE=full npm run kb:seed -- --as-draft
   ```

5. Deploy the Next.js app. Options:
   - **Docker** (recommended for a Ghana-hosted VPS): `docker build -t ghanavoice . && docker run -p 3000:3000 --env-file .env ghanavoice`. The image uses Next.js standalone output, runs as a non-root user and exposes `/api/health` for the container healthcheck.
   - Vercel, Fly.io, or a VPS with Node 22: `npm run build && npm start`.

   Ensure HTTPS (required for microphone access and service workers).
6. Deploy the storage purge edge function: `supabase functions deploy purge-audio --no-verify-jwt`, set `PURGE_SECRET`, and schedule an hourly POST with `Authorization: Bearer <PURGE_SECRET>`.
7. Set `Permissions-Policy` and `Cache-Control` headers as in `next.config.mjs` if a CDN sits in front.

## Continuous integration

`.github/workflows/ghanavoice-ci.yml` (repository root) runs typecheck, Vitest, content validation, the Python metric tests and a production build on every push or pull request touching `ghanavoice/`.

## Low-bandwidth considerations

- Static assets are immutable and cached by the service worker; the first load is the only significant download.
- Audio uploads are Opus at 24 kbps with a 2 MB cap.
- API responses are compressed; offline packs are tens of kilobytes.
- Consider a Ghana-region edge (e.g. Supabase region eu-west with a CDN PoP in Accra, or a local VPS) to keep p95 latency low; measure with `latencyMs` in analytics.

## Scheduled jobs

| Job | Function | Schedule |
| --- | --- | --- |
| Purge expired audio | `purge-audio` edge function, which calls `purge_expired_audio()` and removes the storage objects | hourly |
| Purge closed escalations | `purge_closed_escalations()` | daily |
| Purge raw analytics | `purge_old_analytics()` | daily |

## Backups and recovery

Enable Supabase point-in-time recovery for the project. Content is also version-controlled: export published entries to JSON regularly (`/api/admin/content`) and commit to a private repository.

## Monitoring

- `/api/health` returns mode, provider names and index size for uptime checks.
- Alert on: LLM fallback rate (`trace.fellBackToExtractive` in server logs), safety `emergency` counts, "unsafe" feedback, p95 latency.

## Rollout plan

1. Internal demo mode with the bundled content.
2. Pilot with one district assembly and one agricultural district in each language region; content published only after the institution's re-verification.
3. Native-speaker validation (docs/07) runs in parallel; languages remain "experimental" until sign-off.
4. Public launch per language once validated.
