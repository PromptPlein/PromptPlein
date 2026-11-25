-- 0069: gedeelde prompts naar Publiek (25-11-2026)
--
-- Sinds 25-11-2026 kent de app alleen Privé en Publiek. Publiek is het niveau
-- 'public' (vroeger "Rijksoverheid"). De twaalf prompts die op Afdeling of
-- Ministerie stonden, worden Publiek, keuze van de eigenaar.
--
-- Alleen data, geen schemawijziging: de stand op branch stand-25-11-2026 moet op
-- deze database blijven draaien. De oude rijen op afdeling en ministerie blijven
-- staan; er komt per prompt een goedgekeurde rij 'public' bij en sharing_level
-- wordt 'public'. Op de oude branch staan deze prompts daardoor ook op
-- Rijksoverheid, tot de omkeer-SQL hieronder heeft gedraaid.
--
-- session_replication_role = replica zet de triggers op prompt_visibility uit
-- voor deze sessie: de guard zou de rij op 'pending' zetten en de mailtrigger zou
-- elke maker een mail sturen.
--
-- Omkeren (terug naar de stand van vóór 0069):
--
--   set session_replication_role = replica;
--   delete from public.prompt_visibility
--    where level = 'public' and note = '0069: naar Publiek'
--      and prompt_id in (
--        '1744e143-0db8-4cc2-a6c6-2c09de74e7c1','1b07a3a2-eaa5-4cfe-acab-ed59748230d6',
--        '3edd1350-9fe6-44cc-ad13-31fabb8bd628','455f619a-1817-4530-99af-d159f61171d4',
--        '548fc2a4-519e-4f80-9c2d-04e5e993aa93','9b6b1a8e-2b48-4d94-be6d-1fea618210a0',
--        '1f268e15-b43d-4b9b-83b1-6e79b08ff153','2024f8e0-6130-4ff9-a3c9-a87f89fe804b',
--        '23c21441-a278-44e1-ab7c-53310a0fadc4','5c2316d5-87cb-4c54-9d2d-2b9b17c53aba',
--        '6c80d3ad-3f49-4ea5-84be-ea20a9c7338f','b62ec1c4-1424-460c-b04f-08782ee2e783');
--   update public.prompts set sharing_level = 'department' where id in (
--        '1744e143-0db8-4cc2-a6c6-2c09de74e7c1','1b07a3a2-eaa5-4cfe-acab-ed59748230d6',
--        '3edd1350-9fe6-44cc-ad13-31fabb8bd628','455f619a-1817-4530-99af-d159f61171d4',
--        '548fc2a4-519e-4f80-9c2d-04e5e993aa93','9b6b1a8e-2b48-4d94-be6d-1fea618210a0');
--   update public.prompts set sharing_level = 'ministry' where id in (
--        '1f268e15-b43d-4b9b-83b1-6e79b08ff153','2024f8e0-6130-4ff9-a3c9-a87f89fe804b',
--        '23c21441-a278-44e1-ab7c-53310a0fadc4','5c2316d5-87cb-4c54-9d2d-2b9b17c53aba',
--        '6c80d3ad-3f49-4ea5-84be-ea20a9c7338f','b62ec1c4-1424-460c-b04f-08782ee2e783');
--   set session_replication_role = origin;

begin;

set local session_replication_role = replica;

with doel(id) as (
  values
    ('1744e143-0db8-4cc2-a6c6-2c09de74e7c1'::uuid), ('1b07a3a2-eaa5-4cfe-acab-ed59748230d6'),
    ('3edd1350-9fe6-44cc-ad13-31fabb8bd628'), ('455f619a-1817-4530-99af-d159f61171d4'),
    ('548fc2a4-519e-4f80-9c2d-04e5e993aa93'), ('9b6b1a8e-2b48-4d94-be6d-1fea618210a0'),
    ('1f268e15-b43d-4b9b-83b1-6e79b08ff153'), ('2024f8e0-6130-4ff9-a3c9-a87f89fe804b'),
    ('23c21441-a278-44e1-ab7c-53310a0fadc4'), ('5c2316d5-87cb-4c54-9d2d-2b9b17c53aba'),
    ('6c80d3ad-3f49-4ea5-84be-ea20a9c7338f'), ('b62ec1c4-1424-460c-b04f-08782ee2e783')
)
insert into public.prompt_visibility (prompt_id, level, org_id, status, reviewed_at, note)
select d.id, 'public', null, 'approved', now(), '0069: naar Publiek'
  from doel d
 where exists (select 1 from public.prompts p where p.id = d.id)
   and not exists (
     select 1 from public.prompt_visibility v where v.prompt_id = d.id and v.level = 'public'
   );

update public.prompts
   set sharing_level = 'public'
 where id in (
   '1744e143-0db8-4cc2-a6c6-2c09de74e7c1','1b07a3a2-eaa5-4cfe-acab-ed59748230d6',
   '3edd1350-9fe6-44cc-ad13-31fabb8bd628','455f619a-1817-4530-99af-d159f61171d4',
   '548fc2a4-519e-4f80-9c2d-04e5e993aa93','9b6b1a8e-2b48-4d94-be6d-1fea618210a0',
   '1f268e15-b43d-4b9b-83b1-6e79b08ff153','2024f8e0-6130-4ff9-a3c9-a87f89fe804b',
   '23c21441-a278-44e1-ab7c-53310a0fadc4','5c2316d5-87cb-4c54-9d2d-2b9b17c53aba',
   '6c80d3ad-3f49-4ea5-84be-ea20a9c7338f','b62ec1c4-1424-460c-b04f-08782ee2e783'
 );

commit;
