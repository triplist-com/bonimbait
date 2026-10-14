-- =============================================================================
-- Content Autopilot (P5): runtime knowledge store
--
-- New YouTube videos, podcast episodes and uploads are detected, transcribed,
-- chunked, embedded and summarised at runtime (no rebuild or redeploy), then
-- published by staff. Search fuses the chunks of PUBLISHED sources with the
-- static index (apps/web/app/api/_lib/semantic.ts) through
-- public.match_knowledge_chunks().
--
-- Access model:
--   * staff (editor/admin, public.is_staff()) read and write through RLS;
--   * anon and members have no access at all;
--   * public pages and search read server-side with the service role.
--
-- Pipeline statuses (apps/web/lib/autopilot/status.ts owns the transitions):
--   detected -> transcribing -> transcribed -> summarizing -> indexed -> published
--   plus needs_transcript (no captions: upload/paste one), failed and skipped.
--
-- Idempotent: safe to re-run.
-- =============================================================================

create extension if not exists vector with schema extensions;

-- ---------------------------------------------------------------------------
-- Sources: one row per video / episode / upload
-- ---------------------------------------------------------------------------
create table if not exists public.knowledge_sources (
  id                uuid primary key default gen_random_uuid(),
  kind              text not null check (kind in ('youtube', 'podcast', 'upload')),
  -- YouTube video id, podcast GUID, or an upload's own id.
  external_id       text not null check (length(external_id) between 1 and 300),
  title             text not null,
  url               text,
  published_at      timestamptz,
  duration_s        integer check (duration_s is null or duration_s >= 0),
  thumbnail_url     text,
  status            text not null default 'detected' check (status in (
                      'detected', 'transcribing', 'needs_transcript', 'transcribed',
                      'summarizing', 'indexed', 'published', 'failed', 'skipped')),
  error             text,
  transcript_source text check (transcript_source is null or transcript_source in (
                      'captions_manual', 'captions_auto', 'upload_vtt', 'upload_srt',
                      'upload_sbv', 'upload_json3', 'upload_txt', 'audio_transcription')),
  transcript_text   text,
  -- Timed cues [{start, end, text}] in seconds: the chunker's input.
  transcript_cues   jsonb,
  -- {summary, key_points[{text,start_s}], costs[{item,price,unit,context}],
  --  category_slug, stage, chapters[{title,start_s}], tips[], warnings[],
  --  suggested_questions[], model, generated_at, edited_at}
  summary           jsonb,
  chunk_count       integer not null default 0 check (chunk_count >= 0),
  -- Paid API spend for this source, in micro-USD (integer, like money elsewhere).
  cost_usd_micros   bigint not null default 0 check (cost_usd_micros >= 0),
  -- Per-call usage log [{step, model, input_tokens, output_tokens, usd_micros, at}].
  usage             jsonb not null default '[]'::jsonb,
  attempts          integer not null default 0 check (attempts >= 0),
  is_demo           boolean not null default false,
  detected_via      text check (detected_via is null or detected_via in ('cron', 'admin', 'manual')),
  processed_at      timestamptz,
  site_published_at timestamptz,
  published_by      uuid references public.profiles(id) on delete set null,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),
  constraint knowledge_sources_kind_external_id_key unique (kind, external_id)
);

create index if not exists knowledge_sources_status_idx
  on public.knowledge_sources (status, published_at desc nulls last);

drop trigger if exists knowledge_sources_set_updated_at on public.knowledge_sources;
create trigger knowledge_sources_set_updated_at
  before update on public.knowledge_sources
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- Chunks: transcript segments with their embeddings (text-embedding-3-small)
-- ---------------------------------------------------------------------------
create table if not exists public.knowledge_chunks (
  id          uuid primary key default gen_random_uuid(),
  source_id   uuid not null references public.knowledge_sources(id) on delete cascade,
  chunk_index integer not null check (chunk_index >= 0),
  start_s     double precision not null default 0 check (start_s >= 0),
  end_s       double precision not null default 0 check (end_s >= 0),
  text        text not null,
  embedding   extensions.vector(1536),
  tokens      integer check (tokens is null or tokens >= 0),
  created_at  timestamptz not null default now(),
  constraint knowledge_chunks_source_chunk_key unique (source_id, chunk_index)
);

create index if not exists knowledge_chunks_embedding_hnsw_idx
  on public.knowledge_chunks using hnsw (embedding extensions.vector_cosine_ops);

-- ---------------------------------------------------------------------------
-- RLS: staff read/write; no anon access (search uses the service role)
-- ---------------------------------------------------------------------------
alter table public.knowledge_sources enable row level security;
alter table public.knowledge_chunks enable row level security;

drop policy if exists "staff full access" on public.knowledge_sources;
create policy "staff full access" on public.knowledge_sources
  for all to authenticated
  using (public.is_staff()) with check (public.is_staff());

drop policy if exists "staff full access" on public.knowledge_chunks;
create policy "staff full access" on public.knowledge_chunks
  for all to authenticated
  using (public.is_staff()) with check (public.is_staff());

revoke all on table public.knowledge_sources from anon;
revoke all on table public.knowledge_chunks from anon;
grant select, insert, update, delete on table public.knowledge_sources to authenticated;
grant select, insert, update, delete on table public.knowledge_chunks to authenticated;
grant all on table public.knowledge_sources to service_role;
grant all on table public.knowledge_chunks to service_role;

-- ---------------------------------------------------------------------------
-- Semantic match over PUBLISHED sources only (cosine similarity, 0..1).
-- SECURITY INVOKER: the service role (server-side search) bypasses RLS, staff
-- pass RLS, everyone else gets no rows; anon cannot execute it at all.
-- ---------------------------------------------------------------------------
create or replace function public.match_knowledge_chunks(
  query_embedding extensions.vector(1536),
  match_count integer default 20,
  min_similarity double precision default 0.2
)
returns table (
  chunk_id      uuid,
  source_id     uuid,
  kind          text,
  external_id   text,
  chunk_index   integer,
  start_s       double precision,
  end_s         double precision,
  text          text,
  similarity    double precision,
  title         text,
  thumbnail_url text,
  duration_s    integer,
  published_at  timestamptz,
  category_slug text,
  summary_text  text
)
language sql
stable
set search_path = public, extensions
as $$
  select
    c.id,
    c.source_id,
    s.kind,
    s.external_id,
    c.chunk_index,
    c.start_s,
    c.end_s,
    c.text,
    1 - (c.embedding <=> query_embedding),
    s.title,
    s.thumbnail_url,
    s.duration_s,
    s.published_at,
    s.summary ->> 'category_slug',
    s.summary ->> 'summary'
  from public.knowledge_chunks c
  join public.knowledge_sources s on s.id = c.source_id
  where s.status = 'published'
    and c.embedding is not null
    and 1 - (c.embedding <=> query_embedding) >= coalesce(min_similarity, 0)
  order by c.embedding <=> query_embedding
  limit greatest(1, least(coalesce(match_count, 20), 200));
$$;

revoke all on function public.match_knowledge_chunks(extensions.vector, integer, double precision) from public;
revoke all on function public.match_knowledge_chunks(extensions.vector, integer, double precision) from anon;
grant execute on function public.match_knowledge_chunks(extensions.vector, integer, double precision)
  to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- Optional audio transcription (AUTOPILOT_AUDIO_TRANSCRIPTION=true): staff
-- upload an audio file to this private bucket from the admin; the server
-- reads it back and sends it to OpenAI. Max 25 MB (the API's limit).
-- ---------------------------------------------------------------------------
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'autopilot-audio', 'autopilot-audio', false, 26214400,
  array['audio/mpeg', 'audio/mp3', 'audio/mp4', 'audio/x-m4a', 'audio/m4a', 'audio/aac',
        'audio/wav', 'audio/x-wav', 'audio/webm', 'audio/ogg', 'video/mp4']
)
on conflict (id) do nothing;

drop policy if exists "autopilot audio staff" on storage.objects;
create policy "autopilot audio staff" on storage.objects
  for all to authenticated
  using (bucket_id = 'autopilot-audio' and public.is_staff())
  with check (bucket_id = 'autopilot-audio' and public.is_staff());
