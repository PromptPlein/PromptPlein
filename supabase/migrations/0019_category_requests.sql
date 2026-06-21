-- 0019_category_requests.sql
--
-- category_requests: een gebruiker vraagt een ontbrekende categorie aan, een
-- admin keurt die goed (waarna de categorie in de categories-tabel verschijnt)
-- of af. Spiegelt function_requests 1-op-1, zodat categorieën dezelfde
-- aanvraag-met-goedkeuring-flow krijgen als functies.

create table public.category_requests (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  motivation text,
  status text not null default 'pending'
    check (status in ('pending', 'approved', 'rejected')),
  requested_by uuid references auth.users(id) on delete set null,
  reviewed_by uuid references auth.users(id) on delete set null,
  reviewed_at timestamptz,
  review_note text,
  created_category_id uuid references public.categories(id) on delete set null,
  created_at timestamptz not null default now()
);

create index category_requests_status_idx on public.category_requests (status);

alter table public.category_requests enable row level security;

-- Gebruiker mag zijn eigen aanvraag indienen.
create policy category_requests_insert_own
  on public.category_requests for insert to authenticated
  with check (requested_by = (select auth.uid()));

-- Gebruiker ziet zijn eigen aanvragen; een admin ziet alles.
create policy category_requests_select
  on public.category_requests for select to authenticated
  using ((requested_by = (select auth.uid())) or private.is_admin());

-- Alleen admins mogen beoordelen (status bijwerken).
create policy category_requests_admin_update
  on public.category_requests for update to authenticated
  using (private.is_admin()) with check (private.is_admin());

-- Alleen admins mogen verwijderen.
create policy category_requests_admin_delete
  on public.category_requests for delete to authenticated
  using (private.is_admin());
