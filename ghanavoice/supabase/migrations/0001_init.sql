-- GhanaVoice schema. PostgreSQL 15+ with pgvector (Supabase).
-- Design notes:
--  * Renderings are one row per (entry, language variety) so Asante and Akuapem
--    Twi have independent text, review state and embeddings.
--  * No table stores citizen questions except `escalations` (explicit request
--    for a human) and `audio_samples` (explicit consent), both with expiry.
--  * RLS is enabled everywhere; the app server uses the service role and
--    enforces roles in code, while admin users authenticated through Supabase
--    Auth are additionally restricted by the policies below.

create extension if not exists vector;
create extension if not exists pgcrypto;

-- ---------- Enumerations ----------
create type language_code as enum ('en', 'ak-asante', 'ak-akuapem', 'ee', 'gaa');
create type kb_domain as enum ('public-service', 'education', 'agriculture', 'health');
create type review_status as enum ('draft', 'in_review', 'approved', 'published', 'retired');
create type rendering_origin as enum ('source', 'editor', 'machine');
create type admin_role as enum ('editor', 'reviewer', 'publisher', 'admin');
create type plan_id as enum ('citizen', 'institution', 'organisation-assistant', 'api');

-- ---------- Language registry (support status is data, not a claim) ----------
create table languages (
  code language_code primary key,
  name_en text not null,
  autonym text not null,
  "group" text not null,                 -- en | ak | ee | gaa
  regions text[] not null default '{}',
  support_status text not null default 'experimental' check (support_status in ('evaluated', 'experimental', 'unevaluated')),
  -- Set only when an evaluation run with native references exists and a reviewer signs off.
  evaluated_on date,
  evaluated_by text,
  evaluation_run_id text
);
insert into languages (code, name_en, autonym, "group", regions) values
  ('en', 'English', 'English', 'en', '{Nationwide}'),
  ('ak-asante', 'Twi (Asante)', 'Asante Twi', 'ak', '{Ashanti,Bono,"Bono East",Ahafo}'),
  ('ak-akuapem', 'Twi (Akuapem)', 'Akuapem Twi', 'ak', '{Eastern}'),
  ('ee', 'Ewe', 'Eʋegbe', 'ee', '{Volta,Oti}'),
  ('gaa', 'Ga', 'Gã', 'gaa', '{"Greater Accra"}');

-- ---------- Organisations, admins, plans ----------
create table organisations (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  plan plan_id not null default 'institution',
  -- Organisation-specific assistants restrict retrieval to this domain scope (topic prefix)
  domain_scope text,
  branding jsonb not null default '{}',
  created_at timestamptz not null default now()
);

create table admin_users (
  user_id uuid primary key references auth.users (id) on delete cascade,
  organisation_id uuid references organisations (id),
  roles admin_role[] not null default '{editor}',
  -- Languages this person is a qualified native-speaker reviewer for
  native_reviewer_for language_code[] not null default '{}',
  created_at timestamptz not null default now()
);

-- ---------- Knowledge base ----------
create table kb_entries (
  id text primary key check (id ~ '^[a-z0-9-]+$'),
  organisation_id uuid references organisations (id),   -- null = public GhanaVoice content
  domain kb_domain not null,
  topic text not null,
  health_general_info_only boolean not null default false,
  updated_on date not null,
  review_by date not null,
  status review_status not null default 'draft',
  regions text[] not null default '{}',
  escalation jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint health_flag check (domain <> 'health' or health_general_info_only)
);
create index on kb_entries (status, domain);
create index on kb_entries (organisation_id);

create table kb_sources (
  id bigserial primary key,
  entry_id text not null references kb_entries (id) on delete cascade,
  title text not null,
  publisher text not null,
  url text,
  published_on date,
  verified_on date not null,
  rights text not null
);
create index on kb_sources (entry_id);

create table kb_renderings (
  id bigserial primary key,
  entry_id text not null references kb_entries (id) on delete cascade,
  language language_code not null,
  title text not null,
  summary text not null check (length(summary) <= 600),
  body text not null,
  keywords text[] not null default '{}',
  origin rendering_origin not null,
  native_reviewed boolean not null default false,
  reviewed_on date,
  reviewed_by text,
  -- Embedding for vector search. Dimension is provider-specific; 1536 fits
  -- text-embedding-3-small. Change together with EMBEDDING_PROVIDER.
  embedding vector(1536),
  embedding_provider text,
  updated_at timestamptz not null default now(),
  unique (entry_id, language),
  constraint reviewed_needs_signoff check (not native_reviewed or (reviewed_on is not null and reviewed_by is not null))
);
create index on kb_renderings (language);
create index kb_renderings_embedding_idx on kb_renderings using hnsw (embedding vector_cosine_ops);
-- Full-text index for lexical retrieval inside PostgreSQL (simple config: no
-- stemming exists for Akan/Ewe/Ga; the app also folds ɛ/ɔ in code).
alter table kb_renderings add column tsv tsvector generated always as (
  setweight(to_tsvector('simple', coalesce(title, '')), 'A') ||
  setweight(to_tsvector('simple', array_to_string(keywords, ' ')), 'A') ||
  setweight(to_tsvector('simple', coalesce(summary, '')), 'B') ||
  setweight(to_tsvector('simple', coalesce(body, '')), 'C')
) stored;
create index kb_renderings_tsv_idx on kb_renderings using gin (tsv);

create table kb_status_audit (
  id bigserial primary key,
  entry_id text not null references kb_entries (id) on delete cascade,
  from_status review_status,
  to_status review_status not null,
  actor text not null,
  note text,
  at timestamptz not null default now()
);
create index on kb_status_audit (entry_id, at);

-- Transition with separation of duties: the approver must differ from the
-- person who submitted for review; publishing requires an approved entry.
create or replace function kb_set_status(p_entry_id text, p_status review_status, p_actor text, p_note text default null)
returns void language plpgsql security definer as $$
declare
  v_from review_status;
  v_submitter text;
begin
  select status into v_from from kb_entries where id = p_entry_id for update;
  if v_from is null then raise exception 'entry % not found', p_entry_id; end if;
  if p_status = 'approved' then
    select actor into v_submitter from kb_status_audit
      where entry_id = p_entry_id and to_status = 'in_review' order by at desc limit 1;
    if v_submitter = p_actor then raise exception 'separation of duties: submitter cannot approve'; end if;
  end if;
  if p_status = 'published' and v_from <> 'approved' then
    raise exception 'only approved entries can be published';
  end if;
  update kb_entries set status = p_status, updated_at = now() where id = p_entry_id;
  insert into kb_status_audit (entry_id, from_status, to_status, actor, note) values (p_entry_id, v_from, p_status, p_actor, p_note);
end $$;

-- Vector search over published renderings, optionally restricted to an organisation scope.
create or replace function match_renderings(
  query_embedding vector(1536),
  match_language language_code,
  match_count int default 5,
  scope_topic_prefix text default null
) returns table (rendering_id bigint, entry_id text, language language_code, similarity float)
language sql stable as $$
  select r.id, r.entry_id, r.language, 1 - (r.embedding <=> query_embedding) as similarity
  from kb_renderings r
  join kb_entries e on e.id = r.entry_id
  where e.status = 'published'
    and r.embedding is not null
    and (scope_topic_prefix is null or e.topic like scope_topic_prefix || '%')
    and r.language = match_language
  order by r.embedding <=> query_embedding
  limit match_count;
$$;

-- ---------- Glossary ----------
create table glossary_terms (
  id text primary key,
  organisation_id uuid references organisations (id),
  concept text not null,
  domain text not null check (domain in ('public-service', 'education', 'agriculture', 'health', 'general')),
  en text not null,
  avoid jsonb,
  updated_on date not null default current_date
);
create table glossary_renderings (
  term_id text not null references glossary_terms (id) on delete cascade,
  language language_code not null,
  term text not null,
  note text,
  approved boolean not null default false,
  approved_by text,
  approved_on date,
  primary key (term_id, language),
  constraint approval_signoff check (not approved or approved_by is not null)
);

-- ---------- Consent-gated audio ----------
create table audio_samples (
  id uuid primary key,
  storage_path text not null,               -- private bucket 'audio-samples'
  language language_code,
  region text,
  transcript_machine text,
  transcript_human text,                    -- filled by native-speaker reviewer
  transcript_reviewed_by text,
  stt_provider text,
  stt_confidence real,
  consent_text_version text not null,
  research_use boolean not null default false,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null,          -- hard deletion deadline chosen by the user
  deleted_at timestamptz
);
create index on audio_samples (expires_at) where deleted_at is null;

-- Scheduled purge (run hourly via pg_cron or a Supabase scheduled edge function):
create or replace function purge_expired_audio() returns int language plpgsql security definer as $$
declare n int;
begin
  -- Storage objects are removed by the companion edge function (supabase/functions/purge-audio);
  -- this marks rows so the app never serves them and the function knows what to delete.
  update audio_samples set deleted_at = now() where expires_at <= now() and deleted_at is null;
  get diagnostics n = row_count;
  delete from audio_samples where deleted_at is not null and deleted_at < now() - interval '7 days';
  return n;
end $$;

-- ---------- Feedback, escalation ----------
create table feedback_suggestions (
  id bigserial primary key,
  language language_code not null,
  issue text not null check (issue in ('translation', 'wrong', 'outdated', 'unsafe', 'other')),
  entry_ids text[] not null default '{}',
  suggested_text text not null check (length(suggested_text) <= 1000),
  status text not null default 'open' check (status in ('open', 'accepted', 'rejected')),
  handled_by text,
  created_at timestamptz not null default now()
);

create table escalations (
  id bigserial primary key,
  reference text not null unique,
  language language_code not null,
  domain text not null,
  entry_ids text[] not null default '{}',
  question text not null,
  contact_method text not null check (contact_method in ('phone', 'sms', 'none')),
  contact_value text,
  status text not null default 'open' check (status in ('open', 'in_progress', 'closed')),
  assigned_organisation uuid references organisations (id),
  closed_at timestamptz,
  created_at timestamptz not null default now()
);
-- Personal data minimisation: purge closed tickets after 30 days.
create or replace function purge_closed_escalations() returns int language plpgsql security definer as $$
declare n int;
begin
  delete from escalations where status = 'closed' and closed_at < now() - interval '30 days';
  get diagnostics n = row_count; return n;
end $$;

-- ---------- Analytics (aggregate-safe; no free text) ----------
create table analytics_events (
  id bigserial primary key,
  type text not null,
  at timestamptz not null default now(),
  session_hash text not null,               -- salted, rotates daily
  language language_code not null,
  input_mode text,
  kind text,
  confidence text,
  safety_category text,
  entry_ids text[] not null default '{}',
  domain text,
  latency_ms int,
  provider text,
  rating text,
  issue text,
  region text
);
create index on analytics_events (at);
create index on analytics_events (language, at);
-- Retain raw events 90 days; aggregates can be materialised by a nightly job.
create or replace function purge_old_analytics() returns int language plpgsql security definer as $$
declare n int;
begin
  delete from analytics_events where at < now() - interval '90 days';
  get diagnostics n = row_count; return n;
end $$;

-- ---------- Evaluation ----------
create table evaluation_runs (
  id text primary key,
  task text not null check (task in ('stt', 'translation', 'safety', 'retrieval', 'variation')),
  language language_code,
  provider text not null,
  model text,
  dataset_version text not null,
  item_count int not null check (item_count > 0),
  metrics jsonb not null,
  ran_at timestamptz not null default now(),
  ran_by text not null,
  caveats text[] not null default '{}',
  native_references boolean not null
);

-- ---------- API keys ----------
create table api_keys (
  id uuid primary key default gen_random_uuid(),
  organisation_id uuid not null references organisations (id),
  plan plan_id not null,
  key_hash text not null unique,
  prefix text not null,
  domain_scope text,
  created_at timestamptz not null default now(),
  revoked_at timestamptz
);
create table api_key_usage (
  key_id uuid not null references api_keys (id) on delete cascade,
  month text not null,                      -- YYYY-MM
  count bigint not null default 0,
  primary key (key_id, month)
);
create or replace function api_key_increment_usage(p_key_id uuid, p_month text) returns bigint
language plpgsql security definer as $$
declare v bigint;
begin
  insert into api_key_usage (key_id, month, count) values (p_key_id, p_month, 1)
  on conflict (key_id, month) do update set count = api_key_usage.count + 1
  returning count into v;
  return v;
end $$;

-- ---------- Row-level security ----------
alter table languages enable row level security;
alter table organisations enable row level security;
alter table admin_users enable row level security;
alter table kb_entries enable row level security;
alter table kb_sources enable row level security;
alter table kb_renderings enable row level security;
alter table kb_status_audit enable row level security;
alter table glossary_terms enable row level security;
alter table glossary_renderings enable row level security;
alter table audio_samples enable row level security;
alter table feedback_suggestions enable row level security;
alter table escalations enable row level security;
alter table analytics_events enable row level security;
alter table evaluation_runs enable row level security;
alter table api_keys enable row level security;
alter table api_key_usage enable row level security;

create or replace function current_admin_roles() returns admin_role[] language sql stable as $$
  select coalesce((select roles from admin_users where user_id = auth.uid()), '{}');
$$;

-- Published public content is readable by anyone (used for offline packs via anon key if desired).
create policy "public read published entries" on kb_entries for select using (status = 'published' and organisation_id is null);
create policy "public read sources of published" on kb_sources for select using (exists (select 1 from kb_entries e where e.id = entry_id and e.status = 'published' and e.organisation_id is null));
create policy "public read renderings of published" on kb_renderings for select using (exists (select 1 from kb_entries e where e.id = entry_id and e.status = 'published' and e.organisation_id is null));
create policy "public read languages" on languages for select using (true);

-- Admins: editors read everything and write drafts; status changes go through kb_set_status.
create policy "admins read entries" on kb_entries for select using (current_admin_roles() <> '{}');
create policy "editors write entries" on kb_entries for all using ('editor' = any(current_admin_roles()) or 'admin' = any(current_admin_roles()));
create policy "admins read sources" on kb_sources for select using (current_admin_roles() <> '{}');
create policy "editors write sources" on kb_sources for all using ('editor' = any(current_admin_roles()) or 'admin' = any(current_admin_roles()));
create policy "admins read renderings" on kb_renderings for select using (current_admin_roles() <> '{}');
create policy "editors write renderings" on kb_renderings for all using ('editor' = any(current_admin_roles()) or 'admin' = any(current_admin_roles()));
create policy "admins read audit" on kb_status_audit for select using (current_admin_roles() <> '{}');
create policy "admins glossary" on glossary_terms for all using (current_admin_roles() <> '{}');
create policy "admins glossary renderings" on glossary_renderings for all using (current_admin_roles() <> '{}');
create policy "reviewers read audio metadata" on audio_samples for select using ('reviewer' = any(current_admin_roles()) or 'admin' = any(current_admin_roles()));
create policy "reviewers transcribe audio" on audio_samples for update using ('reviewer' = any(current_admin_roles()) or 'admin' = any(current_admin_roles()));
create policy "admins feedback" on feedback_suggestions for all using (current_admin_roles() <> '{}');
create policy "admins escalations" on escalations for all using (current_admin_roles() <> '{}');
create policy "admins analytics read" on analytics_events for select using (current_admin_roles() <> '{}');
create policy "admins evaluation" on evaluation_runs for all using (current_admin_roles() <> '{}');
create policy "admins api keys" on api_keys for all using ('admin' = any(current_admin_roles()));
create policy "admins api usage" on api_key_usage for select using ('admin' = any(current_admin_roles()));
create policy "self admin row" on admin_users for select using (user_id = auth.uid());
create policy "admins read orgs" on organisations for select using (current_admin_roles() <> '{}');

-- ---------- Storage ----------
insert into storage.buckets (id, name, public) values ('audio-samples', 'audio-samples', false) on conflict do nothing;
create policy "reviewers read audio objects" on storage.objects for select
  using (bucket_id = 'audio-samples' and ('reviewer' = any(current_admin_roles()) or 'admin' = any(current_admin_roles())));

-- ---------- Scheduled jobs (requires pg_cron; enable in Supabase dashboard) ----------
-- select cron.schedule('purge-audio', '15 * * * *', $$select purge_expired_audio()$$);
-- select cron.schedule('purge-escalations', '30 3 * * *', $$select purge_closed_escalations()$$);
-- select cron.schedule('purge-analytics', '45 3 * * *', $$select purge_old_analytics()$$);
