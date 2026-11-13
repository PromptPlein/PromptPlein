-- 0058_afdeling_onder_directie.sql
--
-- De indeling onder een ministerie is nu: directie of dienst, daaronder de
-- afdeling. Een gebruiker zoekt zijn afdeling; bij een nieuwe afdeling noemt hij
-- eerst de directie of dienst waar die onder valt, en vraagt die zo nodig mee aan.
--
-- Het type maakt het verschil: 'department' is een afdeling, 'directorate' een
-- directie of dienst. Bij goedkeuren wordt de onderste laag van een aanvraag de
-- afdeling en elke laag erboven een directie.

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
  soort  text;
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
    soort := case when i = cardinality(req.names) then 'department' else 'directorate' end;
    kind := private.find_child_org(huidig, req.names[i], c);
    if kind.id is null then
      insert into organizations (name, code, parent_id, organization_type, is_active, created_by)
        values (req.names[i], c, huidig, soort, true, req.requested_by)
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

-- In de mail heet het een afdeling, zoals in de app.
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
      'Afdeling', titel, bereik, NEW.motivation, NEW.requested_by, null,
      link, 'https://www.promptplein.app/admin/onderdeel-aanvragen'
    );
  elsif TG_OP = 'UPDATE' and NEW.status in ('approved', 'rejected') then
    perform private.approval_decided(
      NEW.status, 'Afdeling', titel, bereik, NEW.review_note,
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
