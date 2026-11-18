-- Soort van een prompt naast de categorie.
--
-- Categorie zegt waar een prompt over gaat, soort zegt wat hij oplevert. De
-- soorten zijn dezelfde zes als bij Maken, Wat wordt het? (PROMPT_KINDS in
-- src/lib/techniques.ts). Houd die lijst en deze CHECK gelijk.
--
-- Burgerbrieven en Applicatie ontwikkeling vervallen als categorie. Een brief
-- aan een burger is Communicatie; applicatieontwikkeling is een soort (Code of
-- Dashboard) en geen onderwerp.

alter table public.prompts
  add column if not exists kind text not null default 'text'
  check (kind in ('text', 'code', 'dashboard', 'agent', 'skill', 'image'));

create index if not exists prompts_kind_idx on public.prompts (kind);

-- Bestaande prompts die code of een dashboard laten bouwen. Ingedeeld op hun
-- inhoud; de ids bestaan alleen in het productieproject en doen elders niets.
update public.prompts set kind = 'code' where id in (
  '660d9f83-fae1-464a-901f-44483f8edcf8', -- Interactieve routekaart voor presentaties
  '1f268e15-b43d-4b9b-83b1-6e79b08ff153', -- Interactieve webapp voor gezamenlijk jaarplan
  '548fc2a4-519e-4f80-9c2d-04e5e993aa93', -- RADIO VIBECODE OMARCHY
  '6c80d3ad-3f49-4ea5-84be-ea20a9c7338f', -- VLAM Interactieve AI-roadmap maken
  '23c21441-a278-44e1-ab7c-53310a0fadc4', -- Digitale aanvraagassistent voor brevetuitbreidingen
  '5c2316d5-87cb-4c54-9d2d-2b9b17c53aba', -- Demo Afdelingsvisie
  '9b6b1a8e-2b48-4d94-be6d-1fea618210a0'  -- Webapplicatie voor competentiebeoordeling
);
update public.prompts set kind = 'dashboard' where id in (
  'b1d8b86f-798e-4322-95fa-d532c0346d14', -- VIBECODE Capaciteitsradar
  'b62ec1c4-1424-460c-b04f-08782ee2e783'  -- Interactieve teamheatmap voor competentieanalyse
);

-- Wat in Applicatie ontwikkeling stond en een duidelijk onderwerp heeft.
update public.prompts set category_id = (select id from public.categories where name = 'Communicatie')
  where id = '660d9f83-fae1-464a-901f-44483f8edcf8';
update public.prompts set category_id = (select id from public.categories where name = 'Beleid & Advies')
  where id = '6c80d3ad-3f49-4ea5-84be-ea20a9c7338f';

-- Burgerbrieven gaat naar Communicatie.
update public.prompts
  set category_id = (select id from public.categories where name = 'Communicatie')
  where category_id = (select id from public.categories where name = 'Burgerbrieven');

-- De rest van Applicatie ontwikkeling wordt Overig (geen categorie) via ON DELETE SET NULL.
delete from public.categories where name in ('Burgerbrieven', 'Applicatie ontwikkeling');

-- Vaste volgorde van de categorieën op Ontdekken.
update public.categories set sort_order = case name
  when 'Beleid & Advies' then 1
  when 'Communicatie' then 2
  when 'Juridisch' then 3
  when 'Data & Analyse' then 4
  when 'Vergaderingen' then 5
  when 'Onderzoek' then 6
  else sort_order end;

-- Een later goedgekeurde categorie komt achteraan, niet vóór de vaste zes.
alter table public.categories alter column sort_order set default 100;
