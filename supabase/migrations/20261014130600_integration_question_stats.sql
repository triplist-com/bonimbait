-- =============================================================================
-- Integration (advisor -> command): the advisor's answer signals mean the
-- same thing in "השאלות שעוד לא עניתם עליהן".
--
-- answer_completed (apps/web lib/advisor/pipeline.ts) carries:
--   top_similarity  the best raw cosine among the documents the answer was
--                   built on (title-only rows never count;
--                   lib/advisor/confidence.ts), the same measure
--                   insight_topics.top_similarity takes for its probes
--                   (lib/command/insights/coverage.ts)
--   n_sources       the sources shown with the answer
--   refused         'low_confidence': nothing in the library is close (a real
--                   content gap, n_sources = 0); 'out_of_scope': the model
--                   judged the question to be outside home building (also
--                   n_sources = 0, but NOT a gap: no video should answer it)
--
-- command_question_stats() therefore leaves out-of-scope answers out of the
-- answer counts, the confidence and similarity averages and the zero-source
-- count, and drops a question whose every answer was out of scope. Same
-- signature and columns as 20261014123000_command_center.sql; the rest is
-- unchanged. Idempotent (create or replace; grants restated).
-- =============================================================================

create or replace function public.command_question_stats(
  p_from         timestamptz,
  p_to           timestamptz,
  p_week_start   timestamptz,
  p_limit        integer default 800,
  p_include_demo boolean default false
)
returns table (
  question           text,
  question_key       text,
  asks               bigint,
  visitors           bigint,
  asks_this_week     bigint,
  asks_prev_week     bigint,
  answers            bigint,
  avg_confidence     numeric,
  zero_source_answers bigint,
  avg_top_similarity numeric,
  first_seen         timestamptz,
  last_seen          timestamptz
)
language sql
stable
security invoker
set search_path = public
as $$
  with raw as (
    select regexp_replace(btrim(e.props ->> 'query'), '\s+', ' ', 'g')                      as question,
           e.name,
           e.props,
           e.occurred_at,
           coalesce(e.anon_id::text, e.session_id::text, e.id::text)                          as visitor,
           (e.occurred_at at time zone 'Asia/Jerusalem')::date                                as day,
           -- An answer about the library's coverage (not an out-of-scope refusal).
           (e.name = 'answer_completed' and coalesce(e.props ->> 'refused', '') <> 'out_of_scope') as scoped_answer
    from public.platform_events e
    where e.name in ('search_submitted', 'answer_requested', 'answer_completed')
      and e.occurred_at >= p_from
      and e.occurred_at < p_to
      and (p_include_demo or not e.is_demo)
      and e.props ? 'query'
  ),
  keyed as (
    select r.*,
           btrim(regexp_replace(regexp_replace(lower(translate(r.question, '״׳', '"''')), '[^א-תa-z0-9 ]+', ' ', 'g'), ' +', ' ', 'g')) as question_key
    from raw r
    where r.question is not null and r.question <> ''
  )
  select (array_agg(k.question order by k.occurred_at desc))[1]                                 as question,
         k.question_key,
         count(distinct (k.visitor, k.day))::bigint                                             as asks,
         count(distinct k.visitor)::bigint                                                      as visitors,
         count(distinct (k.visitor, k.day)) filter (where k.occurred_at >= p_week_start)::bigint as asks_this_week,
         count(distinct (k.visitor, k.day)) filter (
           where k.occurred_at >= p_week_start - interval '7 days' and k.occurred_at < p_week_start
         )::bigint                                                                              as asks_prev_week,
         count(*) filter (where k.scoped_answer)::bigint                                        as answers,
         avg(case when k.scoped_answer and jsonb_typeof(k.props -> 'confidence') = 'number'
                  then (k.props ->> 'confidence')::numeric end)                                 as avg_confidence,
         count(*) filter (where k.scoped_answer and (
                            (jsonb_typeof(k.props -> 'n_sources') = 'number' and (k.props ->> 'n_sources')::numeric = 0)
                            or (not (k.props ? 'n_sources') and jsonb_typeof(k.props -> 'sources') = 'number'
                                and (k.props ->> 'sources')::numeric = 0)))::bigint            as zero_source_answers,
         avg(case when k.scoped_answer and jsonb_typeof(k.props -> 'top_similarity') = 'number'
                  then (k.props ->> 'top_similarity')::numeric end)                             as avg_top_similarity,
         min(k.occurred_at)                                                                     as first_seen,
         max(k.occurred_at)                                                                     as last_seen
  from keyed k
  where k.question_key <> ''
  group by k.question_key
  -- Off-topic: answered, and every answer was an out-of-scope refusal.
  having not (
    count(*) filter (where k.name = 'answer_completed') > 0
    and count(*) filter (where k.scoped_answer) = 0
  )
  order by 3 desc, 12 desc
  limit greatest(1, least(coalesce(p_limit, 800), 5000));
$$;

revoke execute on function public.command_question_stats(timestamptz, timestamptz, timestamptz, integer, boolean) from public, anon;
grant execute on function public.command_question_stats(timestamptz, timestamptz, timestamptz, integer, boolean) to authenticated, service_role;
