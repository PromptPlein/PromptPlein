-- 0060_deelniveau_niet_ombouwen.sql
--
-- De maker van een prompt mag zijn deelniveaus bijwerken (RLS), en de bewaking
-- keek alleen naar de status. Zo kon een goedgekeurde rij Afdeling via de API een
-- rij Rijksoverheid worden, of een goedgekeurde rij Ministerie naar een ander
-- ministerie wijzen, zonder dat iemand het beoordeelde.
--
-- Nu: het niveau van een rij verandert niet (een ander niveau is uitzetten en
-- opnieuw kiezen), en boven Afdeling verandert de organisatie alleen door wie dat
-- niveau mag beoordelen. De afdeling mag wel mee verhuizen als de maker een
-- andere afdeling kiest; dat niveau is toch direct goedgekeurd.

create or replace function private.guard_visibility_status()
returns trigger
language plpgsql security definer set search_path = public
as $$
begin
  if NEW.level is distinct from OLD.level and not private.is_admin() then
    raise exception 'Een deelniveau wijzig je door het uit te zetten en een ander te kiezen.'
      using errcode = '42501';
  end if;

  if NEW.org_id is distinct from OLD.org_id
     and NEW.level <> 'department'
     and not (
       private.is_admin()
       or (NEW.level in ('ministry', 'directorate') and private.is_org_moderator(NEW.org_id))
     ) then
    raise exception 'Geen rechten om de organisatie van dit deelniveau te wijzigen.'
      using errcode = '42501';
  end if;

  if NEW.status is distinct from OLD.status then
    -- Alleen een bevoegde moderator of beheerder mag de status wijzigen.
    if not private.can_moderate_visibility(NEW.id) then
      raise exception 'Geen rechten om de goedkeuringsstatus van dit deelniveau te wijzigen.';
    end if;
    -- Stempel de beoordelaar en de tijd bij een beslissing.
    if NEW.status in ('approved', 'rejected') then
      NEW.reviewed_by := auth.uid();
      NEW.reviewed_at := now();
    end if;
  end if;

  return NEW;
end;
$$;
