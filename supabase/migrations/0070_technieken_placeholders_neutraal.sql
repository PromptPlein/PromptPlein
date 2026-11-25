-- 0070: placeholders van technieken zonder overheid als werkgever (25-11-2026)
--
-- Vervolg op "Geen overheid in beeld" (zie CLAUDE.md). Alleen de placeholders van
-- de invulvelden, keuze van de eigenaar; templates en uitleg blijven gelijk.
-- Inhoud zoals Kamerbrief en bewindspersoon (Chain-of-Verification) blijft staan.
-- Alleen data, geen schemawijziging: branch stand-25-11-2026 blijft hierop werken.
--
-- Omkeren: draai dezelfde drie updates met de tekst tussen de twee aanhalingen
-- omgedraaid, dus replace(..., '<nieuw>', '<oud>').

begin;

-- CARE, veld context
update public.techniques
   set follow_up_questions = replace(
         follow_up_questions::text,
         'Ik ben een (jouw rol) binnen het ministerie van OCW.',
         'Ik ben een (jouw rol) binnen (jouw organisatie).'
       )::jsonb
 where id = '2f1ca362-6a02-49e0-9f0c-8cfa01853237';

-- BLUEPRINT (Vibecode Prototype), velden business en layout
update public.techniques
   set follow_up_questions = replace(
         replace(
           follow_up_questions::text,
           'welke competenties een overheidsteam sterk of zwak heeft',
           'welke competenties een team sterk of zwak heeft'
         ),
         'rustige, neutrale basis met de rijkshuisstijl;',
         'rustige, neutrale basis in blauw en wit;'
       )::jsonb
 where id = 'bd8a9c10-7baf-4091-9550-2f4cd7953971';

commit;
