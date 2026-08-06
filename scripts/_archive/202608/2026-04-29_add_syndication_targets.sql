-- public_jobs.syndication_targets — per-job opt-in for which job-board
-- networks the recruiter wants this job pushed to.
--
-- Each token corresponds to one feed route under /feeds. Defaults to ALL
-- networks for new jobs (backward-compat: every existing job stays in every
-- existing feed). The post-job form exposes these as checkboxes.
--
-- Run in Supabase SQL Editor. Idempotent.

begin;

-- 1) Add the column with a default that includes every network we know about
alter table public.public_jobs
  add column if not exists syndication_targets text[] not null default
    array[
      'indeed',
      'ziprecruiter',
      'glassdoor',
      'linkedin',
      'google',
      'adzuna',
      'jooble',
      'talent',
      'rss'
    ]::text[];

-- 2) Backfill any rows that pre-date the default
update public.public_jobs
   set syndication_targets = array['indeed','ziprecruiter','glassdoor','linkedin','google','adzuna','jooble','talent','rss']::text[]
 where syndication_targets is null
    or array_length(syndication_targets, 1) is null;

-- 3) GIN index for fast "where 'indeed' = any(syndication_targets)" filters
create index if not exists idx_public_jobs_syndication_targets
  on public.public_jobs using gin (syndication_targets);

-- 4) Auxiliary RPC: lets the post-job server action set the targets right
--    after submit_public_job_rpc creates the job. We keep the existing
--    submit RPC untouched (less risk).
--
--    Authorization model: the only window where this is callable is during
--    the brief pending_verify state, before the recruiter clicks the verify
--    link. That bounds the blast radius: an attacker who guesses a job_id
--    can only flip syndication targets on a job that hasn't gone live yet
--    and will be verified (or expired) within minutes. Once status moves to
--    'active' the RPC refuses.
create or replace function public.set_pending_job_syndication_targets(
  p_job_id  uuid,
  p_targets text[]
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_known   text[] := array['indeed','ziprecruiter','glassdoor','linkedin','google','adzuna','jooble','talent','rss'];
  v_clean   text[];
  v_status  text;
begin
  if p_job_id is null then
    return jsonb_build_object('success', false, 'error', 'job_id required');
  end if;

  -- Sanitize: only known tokens, deduped
  if p_targets is not null and array_length(p_targets, 1) > 0 then
    select array_agg(distinct t) into v_clean
      from unnest(p_targets) as t
     where t = any(v_known);
  end if;
  -- Empty/invalid choices = recruiter wants no syndication. We honor that.
  if v_clean is null then v_clean := array[]::text[]; end if;

  -- Only mutate while the job is still in pending_verify (= the verify-link
  -- window). This prevents post-hoc tampering once a job is live.
  select status into v_status
    from public.public_jobs
   where id = p_job_id
   for update;

  if v_status is null then
    return jsonb_build_object('success', false, 'error', 'job not found');
  end if;

  if v_status <> 'pending_verify' then
    return jsonb_build_object('success', false, 'error', 'job already verified — targets are now locked');
  end if;

  update public.public_jobs
     set syndication_targets = v_clean,
         updated_at = now()
   where id = p_job_id;

  return jsonb_build_object('success', true, 'syndication_targets', v_clean);
end;
$$;

grant execute on function public.set_pending_job_syndication_targets(uuid, text[]) to anon, authenticated;

commit;

-- Sanity check
select column_name, data_type, column_default
  from information_schema.columns
 where table_schema = 'public' and table_name = 'public_jobs' and column_name = 'syndication_targets';
