-- 0056_onderdeel_aanvragen.sql
--
-- Een ministerie heeft onderdelen (bijvoorbeeld een directie) en daaronder
-- teams: BZK, ODI, RADIO. De boom in `organizations` kon dat al (parent_id);
-- nieuw is dat een gebruiker zelf een onderdeel of team aanvraagt en een
-- beheerder dat goedkeurt. Dat vervangt het direct aanmaken uit 0055.
--
-- Eén aanvraag bevat één tot drie nieuwe lagen onder een bestaande plek, dus
-- ODI en RADIO onder BZK in één keer. Bij goedkeuring ontstaat de hele keten.
-- Tot dan blijft het profiel van de aanvrager op de plek waar hij onder valt;
-- bij goedkeuring verhuist het profiel naar het nieuwe onderdeel.

-- 1. Pad en diepte van een organisatie, zonder de Rijksoverheid-wortel.
create or replace function private.org_path_text(p_org uuid)
returns text
language sql stable security definer set search_path = public
as $$
  with recursive up as (
    select id, name, parent_id, organization_type, 0 as lvl
      from organizations where id = p_org
    union all
    select o.id, o.name, o.parent_id, o.organization_type, up.lvl + 1
      from organizations o join up on o.id = up.parent_id
      where up.lvl < 12
  )
  select string_agg(name, ' › ' order by lvl desc)
    from up where organization_type <> 'government'
$$;

-- Diepte: het ministerie is 1, een onderdeel eronder 2, enzovoort.
create or replace function private.org_depth(p_org uuid)
returns int
language sql stable security definer set search_path = public
as $$
  with recursive up as (
    select id, parent_id, organization_type, 0 as lvl
      from organizations where id = p_org
    union all
    select o.id, o.parent_id, o.organization_type, up.lvl + 1
      from organizations o join up on o.id = up.parent_id
      where up.lvl < 12
  )
  select count(*)::int from up where organization_type <> 'government'
$$;

revoke execute on function private.org_path_text(uuid) from public, anon;
revoke execute on function private.org_depth(uuid) from public, anon;
grant execute on function private.org_path_text(uuid) to authenticated;
grant execute on function private.org_depth(uuid) to authenticated;

-- 2. De wachtrij.
create table if not exists public.organization_requests (
  id uuid primary key default gen_random_uuid(),
  -- De bestaande plek waaronder het nieuwe onderdeel komt.
  parent_id uuid not null references public.organizations(id) on delete cascade,
  -- De nieuwe lagen van boven naar beneden, bijvoorbeeld {ODI, RADIO}.
  names text[] not null,
  motivation text,
  status text not null default 'pending'
    check (status in ('pending', 'approved', 'rejected')),
  requested_by uuid references auth.users(id) on delete set null,
  reviewed_by uuid references auth.users(id) on delete set null,
  reviewed_at timestamptz,
  review_note text,
  -- Het diepste onderdeel dat bij goedkeuring is aangemaakt.
  created_org_id uuid references public.organizations(id) on delete set null,
  created_at timestamptz not null default now(),
  constraint organization_requests_names_check
    check (cardinality(names) between 1 and 3)
);

create index if not exists idx_organization_requests_status
  on public.organization_requests(status);
create index if not exists idx_organization_requests_requested_by
  on public.organization_requests(requested_by);

alter table public.organization_requests enable row level security;

-- Een gebruiker ziet zijn eigen aanvragen, een beheerder alles.
drop policy if exists organization_requests_select on public.organization_requests;
create policy organization_requests_select on public.organization_requests
  for select to authenticated
  using (requested_by = (select auth.uid()) or private.is_admin());

-- Indienen gaat alleen via request_organization(), dus er is geen insert-policy.

drop policy if exists organization_requests_admin_update on public.organization_requests;
create policy organization_requests_admin_update on public.organization_requests
  for update to authenticated
  using (private.is_admin()) with check (private.is_admin());

drop policy if exists organization_requests_admin_delete on public.organization_requests;
create policy organization_requests_admin_delete on public.organization_requests
  for delete to authenticated
  using (private.is_admin());

-- 3. Aanvragen. Bestaat een deel van de keten al, dan hangt de aanvraag onder
--    het diepste bestaande onderdeel en bevat hij alleen wat echt nieuw is.
create or replace function public.request_organization(
  p_parent uuid,
  p_names text[],
  p_motivation text default null
)
returns public.organization_requests
language plpgsql
security definer
set search_path = public
as $$
declare
  uid      uuid := auth.uid();
  schoon   text[] := '{}';
  n        text;
  huidig   uuid := p_parent;
  kind     public.organizations;
  openstaand int;
  result   public.organization_requests;
begin
  if uid is null then
    raise exception 'Log in om een onderdeel aan te vragen.' using errcode = '42501';
  end if;

  foreach n in array coalesce(p_names, '{}') loop
    n := regexp_replace(trim(coalesce(n, '')), '\s+', ' ', 'g');
    if char_length(n) < 2 or char_length(n) > 80 then
      raise exception 'Een naam heeft 2 tot 80 tekens.' using errcode = '22023';
    end if;
    schoon := schoon || n;
  end loop;

  if cardinality(schoon) < 1 or cardinality(schoon) > 3 then
    raise exception 'Geef een tot drie lagen op.' using errcode = '22023';
  end if;

  if not exists (
    select 1 from organizations
    where id = p_parent and is_active and organization_type <> 'government'
  ) then
    raise exception 'Kies eerst een ministerie of onderdeel.' using errcode = '22023';
  end if;

  -- Loop mee langs wat er al staat.
  while cardinality(schoon) > 0 loop
    select * into kind from organizations
      where parent_id = huidig and lower(name) = lower(schoon[1])
      limit 1;
    exit when not found;
    if not kind.is_active then
      raise exception '“%” is door een beheerder uitgezet.', kind.name using errcode = '22023';
    end if;
    huidig := kind.id;
    schoon := schoon[2:cardinality(schoon)];
  end loop;

  if cardinality(schoon) = 0 then
    raise exception 'Dit onderdeel bestaat al. Kies het in de lijst.' using errcode = '22023';
  end if;

  if private.org_depth(huidig) + cardinality(schoon) > 6 then
    raise exception 'Zo diep gaat de indeling niet.' using errcode = '22023';
  end if;

  if exists (
    select 1 from organization_requests
    where requested_by = uid and status = 'pending' and parent_id = huidig
      and lower(array_to_string(names, '|')) = lower(array_to_string(schoon, '|'))
  ) then
    raise exception 'Je hebt dit al aangevraagd. Een beheerder beoordeelt het.'
      using errcode = '22023';
  end if;

  select count(*) into openstaand from organization_requests
    where requested_by = uid and status = 'pending';
  if openstaand >= 5 then
    raise exception 'Je hebt al vijf aanvragen openstaan. Wacht tot een beheerder ze heeft beoordeeld.'
      using errcode = '54000';
  end if;

  insert into organization_requests (parent_id, names, motivation, requested_by)
    values (huidig, schoon, nullif(trim(coalesce(p_motivation, '')), ''), uid)
    returning * into result;

  return result;
end;
$$;

revoke execute on function public.request_organization(uuid, text[], text) from public, anon;
grant execute on function public.request_organization(uuid, text[], text) to authenticated;

-- 4. Goedkeuren: de hele keten ontstaat, of schuift aan bij wat er al staat.
create or replace function public.approve_organization_request(
  p_id uuid,
  p_note text default null
)
returns public.organizations
language plpgsql
security definer
set search_path = public
as $$
declare
  req    public.organization_requests;
  huidig uuid;
  n      text;
  kind   public.organizations;
  result public.organizations;
begin
  if not private.is_admin() then
    raise exception 'Alleen een beheerder keurt een aanvraag goed.' using errcode = '42501';
  end if;

  select * into req from organization_requests where id = p_id for update;
  if not found then
    raise exception 'Deze aanvraag bestaat niet meer.' using errcode = '22023';
  end if;
  if req.status <> 'pending' then
    raise exception 'Deze aanvraag is al beoordeeld.' using errcode = '22023';
  end if;

  huidig := req.parent_id;
  foreach n in array req.names loop
    select * into kind from organizations
      where parent_id = huidig and lower(name) = lower(n)
      limit 1;
    if not found then
      insert into organizations (name, parent_id, organization_type, is_active, created_by)
        values (n, huidig, 'department', true, req.requested_by)
        returning * into kind;
    elsif not kind.is_active then
      raise exception '“%” staat uit. Zet hem eerst aan bij Organisaties, of wijs de aanvraag af.', kind.name
        using errcode = '22023';
    end if;
    huidig := kind.id;
  end loop;

  update organization_requests
    set status = 'approved',
        reviewed_by = auth.uid(),
        reviewed_at = now(),
        review_note = nullif(trim(coalesce(p_note, '')), ''),
        created_org_id = huidig
    where id = p_id;

  select * into result from organizations where id = huidig;
  return result;
end;
$$;

revoke execute on function public.approve_organization_request(uuid, text) from public, anon;
grant execute on function public.approve_organization_request(uuid, text) to authenticated;

-- 5. Het profiel van de aanvrager verhuist naar het nieuwe onderdeel, tenzij hij
--    inmiddels zelf iets anders koos.
create or replace function private.organization_request_assign()
returns trigger
language plpgsql security definer set search_path = public
as $$
begin
  if NEW.status = 'approved'
     and OLD.status is distinct from 'approved'
     and NEW.created_org_id is not null
     and NEW.requested_by is not null then
    update profiles
      set organization_id = NEW.created_org_id
      where id = NEW.requested_by
        and (organization_id is null or organization_id = NEW.parent_id);
  end if;
  return NEW;
exception when others then
  raise warning 'organization_request_assign mislukt: %', sqlerrm;
  return NEW;
end;
$$;

drop trigger if exists trg_organization_request_assign on public.organization_requests;
create trigger trg_organization_request_assign
  after update of status on public.organization_requests
  for each row execute function private.organization_request_assign();

revoke execute on function private.organization_request_assign() from public, anon, authenticated;

-- 6. Mail, met dezelfde sjablonen als bij functies en categorieën (0048). De
--    beoordelaars zijn de beheerders: er wordt geen organisatie meegegeven.
create or replace function private.organization_request_mail()
returns trigger
language plpgsql security definer set search_path = public
as $$
declare
  titel  text := array_to_string(NEW.names, ' › ');
  bereik text := private.org_path_text(NEW.parent_id);
  link   text := 'https://www.promptplein.app/profiel';
begin
  if TG_OP = 'UPDATE' and NEW.status is not distinct from OLD.status then
    return NEW;
  end if;

  if NEW.status = 'pending' then
    perform private.approval_submitted(
      'Onderdeel', titel, bereik, NEW.motivation, NEW.requested_by, null,
      link, 'https://www.promptplein.app/admin/onderdeel-aanvragen'
    );
  elsif TG_OP = 'UPDATE' and NEW.status in ('approved', 'rejected') then
    perform private.approval_decided(
      NEW.status, 'Onderdeel', titel, bereik, NEW.review_note,
      NEW.requested_by, NEW.reviewed_by, link
    );
  end if;

  return NEW;
exception when others then
  raise warning 'organization_request_mail mislukt: %', sqlerrm;
  return NEW;
end;
$$;

drop trigger if exists trg_organization_request_mail on public.organization_requests;
create trigger trg_organization_request_mail
  after insert or update of status on public.organization_requests
  for each row execute function private.organization_request_mail();

revoke execute on function private.organization_request_mail() from public, anon, authenticated;

-- 7. Direct aanmaken uit 0055 vervalt: een nieuw onderdeel gaat nu langs een beheerder.
drop function if exists public.create_department(uuid, text);
