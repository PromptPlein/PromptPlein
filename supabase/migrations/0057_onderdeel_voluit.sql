-- 0057_onderdeel_voluit.sql
--
-- Een onderdeel krijgt dezelfde vorm als een ministerie: de volledige naam in
-- `name`, de afkorting in `code`. Wie een onderdeel aanvraagt, schrijft de naam
-- voluit en geeft de afkorting apart op. Zo is "ODI" te vinden op de afkorting
-- en op de woorden erachter, en begrijpt een collega van elders wat het is.

-- 1. De afkortingen bij een aanvraag, op dezelfde plek als de namen. Een lege
--    plek betekent: dit onderdeel heeft geen afkorting.
alter table public.organization_requests
  add column if not exists codes text[];

-- Eén afkorting per ouder, net als één naam per ouder (0055).
create unique index if not exists organizations_onderdeel_code_uniek
  on public.organizations (parent_id, lower(code))
  where organization_type = 'department' and code is not null;

-- 2. Een bestaand onderdeel herkennen aan naam of afkorting.
create or replace function private.find_child_org(p_parent uuid, p_name text, p_code text)
returns public.organizations
language sql stable security definer set search_path = public
as $$
  select * from organizations
  where parent_id = p_parent
    and (
      lower(name) = lower(p_name)
      or lower(code) = lower(p_name)
      or (p_code is not null and (lower(code) = lower(p_code) or lower(name) = lower(p_code)))
    )
  order by (lower(name) = lower(p_name)) desc
  limit 1
$$;

revoke execute on function private.find_child_org(uuid, text, text) from public, anon, authenticated;

-- 3. Aanvragen, nu met afkortingen.
drop function if exists public.request_organization(uuid, text[], text);

create or replace function public.request_organization(
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
  uid        uuid := auth.uid();
  namen      text[] := '{}';
  codes      text[] := '{}';
  n          text;
  c          text;
  i          int;
  huidig     uuid := p_parent;
  kind       public.organizations;
  openstaand int;
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

  if exists (
    select 1 from organization_requests
    where requested_by = uid and status = 'pending' and parent_id = huidig
      and lower(array_to_string(names, '|')) = lower(array_to_string(namen, '|'))
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

  insert into organization_requests (parent_id, names, codes, motivation, requested_by)
    values (huidig, namen, codes, nullif(trim(coalesce(p_motivation, '')), ''), uid)
    returning * into result;

  return result;
end;
$$;

revoke execute on function public.request_organization(uuid, text[], text[], text) from public, anon;
grant execute on function public.request_organization(uuid, text[], text[], text) to authenticated;

-- 4. Goedkeuren zet de afkorting mee.
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
  i      int;
  c      text;
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
  for i in 1 .. cardinality(req.names) loop
    c := nullif(req.codes[i], '');
    kind := private.find_child_org(huidig, req.names[i], c);
    if kind.id is null then
      insert into organizations (name, code, parent_id, organization_type, is_active, created_by)
        values (req.names[i], c, huidig, 'department', true, req.requested_by)
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

-- 5. In de mail staat de naam voluit met de afkorting erachter.
create or replace function private.organization_request_mail()
returns trigger
language plpgsql security definer set search_path = public
as $$
declare
  titel  text;
  bereik text := private.org_path_text(NEW.parent_id);
  link   text := 'https://www.promptplein.app/profiel';
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

revoke execute on function private.organization_request_mail() from public, anon, authenticated;
