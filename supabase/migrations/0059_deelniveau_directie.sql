-- 0059_deelniveau_directie.sql
--
-- Een vierde deelniveau tussen Afdeling en Ministerie: Directie of dienst. Wie
-- in een afdeling onder die directie zit (of op de directie zelf), ziet de
-- prompt. Net als Ministerie wacht dit niveau op goedkeuring door een moderator
-- van het ministerie, of een beheerder als er geen is.
--
-- Daarnaast een gat dicht: de bewaking op de status gold alleen bij wijzigen.
-- Wie een deelniveau aanmaakte, kon het via de API meteen als goedgekeurd
-- invoeren. Nu komt elk niveau boven Afdeling bij het aanmaken op 'pending', tenzij
-- de maker het zelf mag beoordelen.

-- 1. Het nieuwe niveau toestaan.
alter table public.prompt_visibility drop constraint if exists prompt_visibility_level_check;
alter table public.prompt_visibility add constraint prompt_visibility_level_check
  check (level in ('department', 'directorate', 'ministry', 'public'));

alter table public.prompts drop constraint if exists prompts_sharing_level_check;
alter table public.prompts add constraint prompts_sharing_level_check
  check (sharing_level in ('private', 'department', 'directorate', 'ministry', 'role', 'public'));

-- 2. De directie of dienst waar een organisatie onder valt: de dichtstbijzijnde
--    laag boven de afdeling die geen ministerie is. Null als die er niet is.
create or replace function private.directorate_of(p_org uuid)
returns uuid
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
  select id from up
  where organization_type in ('directorate', 'directorate_general', 'agency')
  order by lvl
  limit 1
$$;

revoke execute on function private.directorate_of(uuid) from public;
grant execute on function private.directorate_of(uuid) to authenticated, anon;

-- 3. Wie mag een prompt zien: de directie telt voor iedereen eronder.
create or replace function private.can_see_prompt(p_id uuid)
returns boolean
language sql stable security definer set search_path = public
as $$
  select
    private.is_admin()
    or exists (select 1 from prompts where id = p_id and created_by_user = auth.uid())
    or exists (
      select 1 from prompt_visibility v
      where v.prompt_id = p_id
        and v.status = 'approved'
        and (
          v.level = 'public'
          or (v.level = 'ministry' and v.org_id = private.current_ministry_root_id())
          or (v.level = 'directorate' and v.org_id = private.directorate_of(private.current_org_id()))
          or (v.level = 'department' and v.org_id = private.current_org_id())
        )
    )
$$;

-- 4. Wie mag beoordelen: voor de directie dezelfde mensen als voor het ministerie.
create or replace function private.can_moderate_visibility(v_id uuid)
returns boolean
language sql stable security definer set search_path = public
as $$
  select exists (
    select 1 from prompt_visibility v
    where v.id = v_id
      and (
        private.is_admin()
        or (v.level in ('ministry', 'directorate') and private.is_org_moderator(v.org_id))
      )
  )
$$;

-- 5. Bij het aanmaken: de directie komt uit de organisatie van de prompt, niet
--    uit wat de browser opgeeft, en de status mag niet zomaar 'approved' zijn.
create or replace function private.guard_visibility_insert()
returns trigger
language plpgsql security definer set search_path = public
as $$
declare
  basis uuid;
begin
  if NEW.level = 'directorate' then
    select organization_id into basis from prompts where id = NEW.prompt_id;
    NEW.org_id := private.directorate_of(coalesce(basis, private.current_org_id()));
    if NEW.org_id is null then
      raise exception 'Je afdeling valt niet onder een directie of dienst. Kies je afdeling op je profiel.'
        using errcode = '22023';
    end if;
  end if;

  if NEW.level <> 'department'
     and NEW.status is distinct from 'pending'
     and not (
       private.is_admin()
       or (NEW.level in ('ministry', 'directorate') and private.is_org_moderator(NEW.org_id))
     ) then
    NEW.status := 'pending';
    NEW.reviewed_by := null;
    NEW.reviewed_at := null;
  end if;

  return NEW;
end;
$$;

revoke execute on function private.guard_visibility_insert() from public, anon, authenticated;

drop trigger if exists trg_visibility_insert_guard on public.prompt_visibility;
create trigger trg_visibility_insert_guard
  before insert on public.prompt_visibility
  for each row execute function private.guard_visibility_insert();

-- 6. Mail: ook bij de directie, met het pad als bereik.
create or replace function private.visibility_mail()
returns trigger
language plpgsql security definer set search_path = public
as $$
declare
  titel    text;
  indiener uuid;
  bereik   text;
  link     text;
begin
  if NEW.level not in ('directorate', 'ministry', 'public') then
    return NEW;
  end if;
  if TG_OP = 'UPDATE' and NEW.status is not distinct from OLD.status then
    return NEW;
  end if;

  select p.title, p.created_by_user into titel, indiener
    from prompts p where p.id = NEW.prompt_id;

  if NEW.level = 'public' then
    bereik := 'Rijksoverheid';
  elsif NEW.level = 'directorate' then
    bereik := private.org_path_text(NEW.org_id);
  else
    select case when o.name ilike 'ministerie%' then o.name
                else 'Ministerie van ' || o.name end
      into bereik
      from organizations o where o.id = NEW.org_id;
  end if;

  link := 'https://www.promptplein.app/prompt/' || NEW.prompt_id;

  if NEW.status = 'pending' then
    perform private.approval_submitted(
      'Prompt', titel, bereik, null, indiener,
      case when NEW.level in ('ministry', 'directorate') then NEW.org_id end,
      link, 'https://www.promptplein.app/goedkeuringen'
    );
  elsif TG_OP = 'UPDATE' and NEW.status in ('approved', 'rejected') then
    perform private.approval_decided(
      NEW.status, 'Prompt', titel, bereik, NEW.note, indiener, NEW.reviewed_by, link
    );
  end if;

  return NEW;
exception when others then
  raise warning 'visibility_mail mislukt: %', sqlerrm;
  return NEW;
end;
$$;
