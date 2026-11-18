-- Gebruik per dag, voor Beheer, Analytics.
--
-- Twee bronnen:
-- 1. analytics_events (bestond al): de browser meldt een bezoek (event 'visit',
--    één keer per dag per browser en per stand ingelogd of anoniem), een
--    chatbericht en een download als Word of Excel. Een bezoeker heeft een
--    willekeurig id dat elke dag nieuw is: zo zijn bezoekers per dag te tellen
--    zonder iemand over dagen heen te volgen.
-- 2. ai_calls (nieuw): de edge function schrijft elke aanroep van een taalmodel
--    weg, met mode, provider, model en of hij lukte. Geen tekst, geen gebruiker.
--
-- Aanmeldingen, opgeslagen prompts en projecten komen uit hun eigen tabellen.
-- Een leeg project dat weer verdween, telt daardoor niet mee.

create table if not exists public.ai_calls (
  id bigint generated always as identity primary key,
  created_at timestamptz not null default now(),
  mode text not null,
  soort text not null,
  provider text not null,
  model text,
  ingelogd boolean not null default false,
  gelukt boolean not null,
  duur_ms integer
);

create index if not exists ai_calls_created_idx on public.ai_calls (created_at desc);

-- Alleen de edge function schrijft (service role, langs RLS); alleen beheerders lezen.
alter table public.ai_calls enable row level security;

drop policy if exists ai_calls_admin_read on public.ai_calls;
create policy ai_calls_admin_read on public.ai_calls
  for select to authenticated using (private.is_admin());

create index if not exists idx_analytics_visit_day
  on public.analytics_events (created_at)
  where event_type = 'visit';

create or replace function public.admin_usage_daily(p_days integer default 30)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_days integer := greatest(1, least(coalesce(p_days, 30), 366));
  v_from date := (now() at time zone 'Europe/Amsterdam')::date - (v_days - 1);
  v_start timestamptz := (v_from::timestamp at time zone 'Europe/Amsterdam');
  v_result jsonb;
begin
  if not private.is_admin() then
    raise exception 'Alleen voor beheerders' using errcode = '42501';
  end if;

  with dagen as (
    select generate_series(v_from, (now() at time zone 'Europe/Amsterdam')::date, interval '1 day')::date as dag
  ),
  ev as (
    select (created_at at time zone 'Europe/Amsterdam')::date as dag, event_type, metadata
    from analytics_events
    where created_at >= v_start
  ),
  bezoek as (
    select dag,
           count(distinct metadata->>'bezoeker') as bezoekers,
           count(distinct metadata->>'bezoeker') filter (where metadata->>'ingelogd' = 'true') as ingelogd
    from ev where event_type = 'visit'
    group by dag
  ),
  acties as (
    select dag,
           count(*) filter (where event_type = 'chat_message') as chatberichten,
           count(distinct metadata->>'bezoeker') filter (where event_type = 'chat_message') as chatters,
           count(*) filter (where event_type = 'optimization_run') as prompts_gemaakt,
           count(*) filter (where event_type = 'export_word') as word,
           count(*) filter (where event_type = 'export_excel') as excel,
           count(*) filter (where event_type = 'search') as zoekopdrachten
    from ev group by dag
  ),
  aanmelding as (
    select (created_at at time zone 'Europe/Amsterdam')::date as dag, count(*) as aantal
    from profiles where created_at >= v_start group by 1
  ),
  opgeslagen as (
    select (created_at at time zone 'Europe/Amsterdam')::date as dag, count(*) as aantal
    from prompts where created_at >= v_start group by 1
  ),
  projecten as (
    select (created_at at time zone 'Europe/Amsterdam')::date as dag, count(*) as aantal
    from chat_projects where created_at >= v_start group by 1
  ),
  ai as (
    select (created_at at time zone 'Europe/Amsterdam')::date as dag,
           count(*) as aanroepen,
           count(*) filter (where not gelukt) as mislukt
    from ai_calls where created_at >= v_start group by 1
  )
  select jsonb_build_object(
    'dagen', coalesce((
      select jsonb_agg(jsonb_build_object(
        'dag', d.dag,
        'bezoekers', coalesce(b.bezoekers, 0),
        'ingelogd', coalesce(b.ingelogd, 0),
        'anoniem', coalesce(b.bezoekers, 0) - coalesce(b.ingelogd, 0),
        'aanmeldingen', coalesce(am.aantal, 0),
        'chatberichten', coalesce(a.chatberichten, 0),
        'chatters', coalesce(a.chatters, 0),
        'prompts_gemaakt', coalesce(a.prompts_gemaakt, 0),
        'prompts_opgeslagen', coalesce(o.aantal, 0),
        'word', coalesce(a.word, 0),
        'excel', coalesce(a.excel, 0),
        'projecten', coalesce(p.aantal, 0),
        'zoekopdrachten', coalesce(a.zoekopdrachten, 0),
        'ai_aanroepen', coalesce(ai.aanroepen, 0),
        'ai_mislukt', coalesce(ai.mislukt, 0)
      ) order by d.dag)
      from dagen d
      left join bezoek b on b.dag = d.dag
      left join acties a on a.dag = d.dag
      left join aanmelding am on am.dag = d.dag
      left join opgeslagen o on o.dag = d.dag
      left join projecten p on p.dag = d.dag
      left join ai on ai.dag = d.dag
    ), '[]'::jsonb),
    'ai_per_mode', coalesce((
      select jsonb_agg(jsonb_build_object('mode', mode, 'aantal', n) order by n desc)
      from (select mode, count(*) as n from ai_calls where created_at >= v_start group by mode) m
    ), '[]'::jsonb),
    'ai_per_model', coalesce((
      select jsonb_agg(jsonb_build_object('provider', provider, 'model', model, 'soort', soort,
                                          'aantal', n, 'mislukt', f) order by n desc)
      from (select provider, model, soort, count(*) as n, count(*) filter (where not gelukt) as f
            from ai_calls where created_at >= v_start group by provider, model, soort) m
    ), '[]'::jsonb),
    'ai_ingelogd', (select count(*) from ai_calls where created_at >= v_start and ingelogd),
    'ai_anoniem', (select count(*) from ai_calls where created_at >= v_start and not ingelogd),
    'gebruikers_totaal', (select count(*) from profiles)
  ) into v_result;

  return v_result;
end;
$$;

revoke execute on function public.admin_usage_daily(integer) from public, anon;
grant execute on function public.admin_usage_daily(integer) to authenticated;
