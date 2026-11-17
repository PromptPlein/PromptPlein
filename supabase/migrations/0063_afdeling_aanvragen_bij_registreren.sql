-- 0063_afdeling_aanvragen_bij_registreren.sql
--
-- Wie zich registreert en zijn afdeling niet in de lijst vindt, vraagt hem
-- meteen aan. Bij het registreren is er nog geen sessie, dus de aanvraag gaat
-- mee in de metadata (`organization_request`: parent_id, names, codes) en de
-- database dient hem in zodra het e-mailadres is bevestigd. Zo komt er geen
-- aanvraag binnen van een adres dat niemand bezit.
--
-- Daarnaast verhuist een goedgekeurde aanvraag het profiel ook als dat op een
-- laag boven de nieuwe afdeling staat (bijvoorbeeld op het ministerie terwijl de
-- afdeling onder een directie komt). Voorheen gebeurde dat alleen als het
-- profiel precies op de ouder van de aanvraag stond.

-- 1. De inhoud van request_organization, maar voor een opgegeven gebruiker.
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

revoke execute on function private.request_organization_as(uuid, uuid, text[], text[], text)
  from public, anon, authenticated;

-- 2. De publieke functie blijft gelijk van buiten en gebruikt de ingelogde gebruiker.
create or replace function public.request_organization(
  p_parent uuid,
  p_names text[],
  p_codes text[] default null,
  p_motivation text default null
)
returns public.organization_requests
language sql
security definer
set search_path = public
as $$
  select * from private.request_organization_as(auth.uid(), p_parent, p_names, p_codes, p_motivation)
$$;

revoke execute on function public.request_organization(uuid, text[], text[], text) from public, anon;
grant execute on function public.request_organization(uuid, text[], text[], text) to authenticated;

-- 3. De aanvraag uit het registratieformulier, zodra het adres bevestigd is.
create or replace function private.signup_organization_request()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  aanvraag jsonb := NEW.raw_user_meta_data -> 'organization_request';
  ouder    uuid;
  namen    text[];
  codes    text[];
begin
  if aanvraag is null or jsonb_typeof(aanvraag) <> 'object' or NEW.email_confirmed_at is null then
    return NEW;
  end if;
  if TG_OP = 'UPDATE' and OLD.email_confirmed_at is not null then
    return NEW;
  end if;
  -- Eén keer: heeft dit account al een aanvraag, dan niet nog eens.
  if exists (select 1 from organization_requests where requested_by = NEW.id) then
    return NEW;
  end if;

  ouder := (aanvraag ->> 'parent_id')::uuid;
  select array_agg(v order by o) into namen
    from jsonb_array_elements_text(aanvraag -> 'names') with ordinality as t(v, o);
  select array_agg(v order by o) into codes
    from jsonb_array_elements_text(aanvraag -> 'codes') with ordinality as t(v, o);

  perform private.request_organization_as(NEW.id, ouder, namen, codes, null);
  return NEW;
exception when others then
  -- Registreren gaat altijd door; de aanvraag kan daarna nog op het profiel.
  raise warning 'signup_organization_request mislukt: %', sqlerrm;
  return NEW;
end;
$$;

revoke execute on function private.signup_organization_request() from public, anon, authenticated;

-- Na on_auth_user_created (alfabetisch eerder), zodat het profiel er al staat.
drop trigger if exists on_auth_user_org_request on auth.users;
create trigger on_auth_user_org_request
  after insert or update of email_confirmed_at on auth.users
  for each row execute function private.signup_organization_request();

-- 4. Bij goedkeuring verhuist het profiel ook vanaf een laag erboven.
create or replace function private.organization_request_assign()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if NEW.status = 'approved'
     and OLD.status is distinct from 'approved'
     and NEW.created_org_id is not null
     and NEW.requested_by is not null then
    update profiles p
      set organization_id = NEW.created_org_id
      where p.id = NEW.requested_by
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
