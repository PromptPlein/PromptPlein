-- 0067_afdeling_aanvraag_aansluiten.sql
--
-- Twee collega's vroegen op dezelfde dag dezelfde afdeling aan (I-Vakmanschap):
-- een aanvraag die nog wacht, ziet een ander niet. Nu sluit de tweede aan bij de
-- eerste in plaats van een nieuwe aanvraag te maken. Bij goedkeuring verhuist het
-- profiel van iedereen die aansloot mee, en iedereen krijgt de besluitmail.
--
-- Namen worden vergeleken zonder hoofdletters, accenten, spaties en leestekens:
-- "SSCICT" is "SSC-ICT", "Financien" is "Financiën". Dat geldt ook voor het
-- herkennen van een bestaande afdeling bij aanvragen en goedkeuren.

-- 1. De sleutel waarop namen gelijk zijn.
create or replace function private.org_key(p text)
returns text
language sql immutable
as $$
  select regexp_replace(
    translate(lower(coalesce(p, '')),
              'áàäâãéèëêíìïîóòöôõúùüûçñ',
              'aaaaaeeeeiiiiooooouuuucn'),
    '[^a-z0-9]', '', 'g')
$$;

revoke execute on function private.org_key(text) from public, anon, authenticated;

-- 2. Een bestaand onderdeel herkennen aan naam of afkorting, op die sleutel.
create or replace function private.find_child_org(p_parent uuid, p_name text, p_code text)
returns public.organizations
language sql stable security definer set search_path = public
as $$
  select * from organizations
  where parent_id = p_parent
    and (
      private.org_key(name) = private.org_key(p_name)
      or private.org_key(code) = private.org_key(p_name)
      or (nullif(private.org_key(p_code), '') is not null
          and (private.org_key(code) = private.org_key(p_code)
               or private.org_key(name) = private.org_key(p_code)))
    )
  order by (private.org_key(name) = private.org_key(p_name)) desc
  limit 1
$$;

revoke execute on function private.find_child_org(uuid, text, text) from public, anon, authenticated;

-- 3. Wie aansloot bij een aanvraag van een ander.
create table if not exists public.organization_request_followers (
  request_id uuid not null references public.organization_requests(id) on delete cascade,
  user_id    uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (request_id, user_id)
);

create index if not exists idx_org_request_followers_user
  on public.organization_request_followers(user_id);

alter table public.organization_request_followers enable row level security;

drop policy if exists org_request_followers_select on public.organization_request_followers;
create policy org_request_followers_select on public.organization_request_followers
  for select to authenticated
  using (user_id = (select auth.uid()) or private.is_admin());

-- Wie aansloot, ziet de aanvraag op zijn profiel.
drop policy if exists organization_requests_select on public.organization_requests;
create policy organization_requests_select on public.organization_requests
  for select to authenticated
  using (
    requested_by = (select auth.uid())
    or private.is_admin()
    or exists (
      select 1 from public.organization_request_followers f
      where f.request_id = organization_requests.id and f.user_id = (select auth.uid())
    )
  );

-- 4. Aanvragen: bestaat dezelfde aanvraag al van een ander, dan aansluiten.
create or replace function private.request_organization_as(
  uid uuid,
  p_parent uuid,
  p_names text[],
  p_codes text[] default null,
  p_motivation text default null
)
returns public.organization_requests
language plpgsql
security definer
set search_path = public
as $$
declare
  namen      text[] := '{}';
  codes      text[] := '{}';
  n          text;
  c          text;
  i          int;
  huidig     uuid := p_parent;
  kind       public.organizations;
  openstaand int;
  sleutel    text;
  result     public.organization_requests;
begin
  if uid is null then
    raise exception 'Log in om een onderdeel aan te vragen.' using errcode = '42501';
  end if;

  if cardinality(coalesce(p_names, '{}')) < 1 or cardinality(p_names) > 3 then
    raise exception 'Geef een tot drie lagen op.' using errcode = '22023';
  end if;

  for i in 1 .. cardinality(p_names) loop
    n := regexp_replace(trim(coalesce(p_names[i], '')), '\s+', ' ', 'g');
    c := nullif(regexp_replace(trim(coalesce(p_codes[i], '')), '\s+', ' ', 'g'), '');
    if char_length(n) < 2 or char_length(n) > 120 then
      raise exception 'Een volledige naam heeft 2 tot 120 tekens.' using errcode = '22023';
    end if;
    if c is not null and char_length(c) > 20 then
      raise exception 'Een afkorting heeft hoogstens 20 tekens.' using errcode = '22023';
    end if;
    if c is not null and lower(c) = lower(n) then
      raise exception 'Schrijf bij “%” de naam voluit; de afkorting komt in het vak ernaast.', c
        using errcode = '22023';
    end if;
    namen := namen || n;
    codes := codes || coalesce(c, '');
  end loop;

  if not exists (
    select 1 from organizations
    where id = p_parent and is_active and organization_type <> 'government'
  ) then
    raise exception 'Kies eerst een ministerie of onderdeel.' using errcode = '22023';
  end if;

  -- Loop mee langs wat er al staat.
  while cardinality(namen) > 0 loop
    kind := private.find_child_org(huidig, namen[1], nullif(codes[1], ''));
    exit when kind.id is null;
    if not kind.is_active then
      raise exception '“%” is door een beheerder uitgezet.', kind.name using errcode = '22023';
    end if;
    huidig := kind.id;
    namen := namen[2:cardinality(namen)];
    codes := codes[2:cardinality(codes)];
  end loop;

  if cardinality(namen) = 0 then
    raise exception 'Dit onderdeel bestaat al. Kies het in de lijst.' using errcode = '22023';
  end if;

  if private.org_depth(huidig) + cardinality(namen) > 6 then
    raise exception 'Zo diep gaat de indeling niet.' using errcode = '22023';
  end if;

  sleutel := (select string_agg(private.org_key(x), '|' order by o)
                from unnest(namen) with ordinality as t(x, o));

  -- Dezelfde aanvraag wacht al: van jezelf is dat een fout, van een ander sluit je aan.
  select * into result from organization_requests r
    where r.status = 'pending' and r.parent_id = huidig
      and (select string_agg(private.org_key(x), '|' order by o)
             from unnest(r.names) with ordinality as t(x, o)) = sleutel
    order by r.created_at
    limit 1;

  if found then
    if result.requested_by = uid
       or exists (select 1 from organization_request_followers
                  where request_id = result.id and user_id = uid) then
      raise exception 'Je hebt dit al aangevraagd. Een beheerder beoordeelt het.'
        using errcode = '22023';
    end if;
    insert into organization_request_followers (request_id, user_id)
      values (result.id, uid)
      on conflict do nothing;
    return result;
  end if;

  select count(*) into openstaand from organization_requests
    where requested_by = uid and status = 'pending';
  if openstaand >= 5 then
    raise exception 'Je hebt al vijf aanvragen openstaan. Wacht tot een beheerder ze heeft beoordeeld.'
      using errcode = '54000';
  end if;

  insert into organization_requests (parent_id, names, codes, motivation, requested_by)
    values (huidig, namen, codes, nullif(trim(coalesce(p_motivation, '')), ''), uid)
    returning * into result;

  return result;
end;
$$;

revoke execute on function private.request_organization_as(uuid, uuid, text[], text[], text)
  from public, anon, authenticated;

-- 5. Bij goedkeuring verhuizen de profielen van de aanvrager en van wie aansloot.
create or replace function private.organization_request_assign()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if NEW.status = 'approved'
     and OLD.status is distinct from 'approved'
     and NEW.created_org_id is not null then
    update profiles p
      set organization_id = NEW.created_org_id
      where (
          p.id = NEW.requested_by
          or p.id in (select f.user_id from organization_request_followers f where f.request_id = NEW.id)
        )
        and (
          p.organization_id is null
          or p.organization_id in (
            with recursive boven(id, parent_id) as (
              select o.id, o.parent_id from organizations o where o.id = NEW.parent_id
              union all
              select o.id, o.parent_id from organizations o join boven b on o.id = b.parent_id
            )
            select id from boven
          )
        );
  end if;
  return NEW;
exception when others then
  raise warning 'organization_request_assign mislukt: %', sqlerrm;
  return NEW;
end;
$$;

revoke execute on function private.organization_request_assign() from public, anon, authenticated;

-- 6. De besluitmail gaat ook naar wie aansloot.
create or replace function private.organization_request_mail()
returns trigger
language plpgsql security definer set search_path = public
as $$
declare
  titel  text;
  bereik text := private.org_path_text(NEW.parent_id);
  link   text := 'https://www.promptplein.app/profiel';
  volger uuid;
begin
  if TG_OP = 'UPDATE' and NEW.status is not distinct from OLD.status then
    return NEW;
  end if;

  select string_agg(
           case when coalesce(NEW.codes[i], '') = '' then NEW.names[i]
                else NEW.names[i] || ' (' || NEW.codes[i] || ')' end,
           ' › ' order by i)
    into titel
    from generate_subscripts(NEW.names, 1) as i;

  if NEW.status = 'pending' then
    perform private.approval_submitted(
      'Afdeling', titel, bereik, NEW.motivation, NEW.requested_by, null,
      link, 'https://www.promptplein.app/admin/onderdeel-aanvragen'
    );
  elsif TG_OP = 'UPDATE' and NEW.status in ('approved', 'rejected') then
    perform private.approval_decided(
      NEW.status, 'Afdeling', titel, bereik, NEW.review_note,
      NEW.requested_by, NEW.reviewed_by, link
    );
    for volger in
      select f.user_id from organization_request_followers f where f.request_id = NEW.id
    loop
      perform private.approval_decided(
        NEW.status, 'Afdeling', titel, bereik, NEW.review_note,
        volger, NEW.reviewed_by, link
      );
    end loop;
  end if;

  return NEW;
exception when others then
  raise warning 'organization_request_mail mislukt: %', sqlerrm;
  return NEW;
end;
$$;

revoke execute on function private.organization_request_mail() from public, anon, authenticated;

-- 7. Welke afdelingen er onder een ministerie al worden aangevraagd, zodat het
--    formulier ze kan aanbieden. Ook zonder sessie, want bij het registreren is er
--    nog geen. Alleen de namen van organisaties, niets over wie het vroeg.
create or replace function public.pending_organization_requests(p_ministry uuid)
returns table (id uuid, parent_id uuid, names text[], codes text[])
language sql stable security definer set search_path = public
as $$
  with recursive onder(id) as (
    select p_ministry
    union all
    select o.id from organizations o join onder on o.parent_id = onder.id
  )
  select r.id, r.parent_id, r.names, coalesce(r.codes, '{}')
  from organization_requests r
  where r.status = 'pending' and r.parent_id in (select id from onder)
  order by r.created_at
  limit 50
$$;

revoke execute on function public.pending_organization_requests(uuid) from public;
grant execute on function public.pending_organization_requests(uuid) to anon, authenticated;
