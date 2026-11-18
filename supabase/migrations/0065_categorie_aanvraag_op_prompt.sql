-- Een aangevraagde categorie komt na goedkeuring vanzelf op de prompt.
--
-- Wie bij het opslaan een categorie aanvraagt, bewaart de prompt zonder
-- categorie (Overig): de categorie bestaat nog niet. De prompt onthoudt welke
-- aanvraag erbij hoort. Keurt een beheerder die goed, dan krijgt de prompt de
-- nieuwe categorie, zoals een goedgekeurde functie op het profiel komt (0055).
-- Bij afwijzen blijft de prompt Overig en vervalt de verwijzing.

alter table public.prompts
  add column if not exists requested_category_id uuid
  references public.category_requests (id) on delete set null;

create index if not exists prompts_requested_category_idx
  on public.prompts (requested_category_id)
  where requested_category_id is not null;

create or replace function private.category_request_assign()
returns trigger
language plpgsql security definer set search_path = public
as $$
begin
  if NEW.status = 'approved'
     and OLD.status is distinct from 'approved'
     and NEW.created_category_id is not null then
    update prompts
      set category_id = coalesce(category_id, NEW.created_category_id),
          requested_category_id = null
      where requested_category_id = NEW.id;
  elsif NEW.status = 'rejected' and OLD.status is distinct from 'rejected' then
    update prompts set requested_category_id = null where requested_category_id = NEW.id;
  end if;
  return NEW;
exception when others then
  raise warning 'category_request_assign mislukt: %', sqlerrm;
  return NEW;
end;
$$;

drop trigger if exists trg_category_request_assign on public.category_requests;
create trigger trg_category_request_assign
  after update of status on public.category_requests
  for each row execute function private.category_request_assign();

revoke execute on function private.category_request_assign() from public, anon, authenticated;
