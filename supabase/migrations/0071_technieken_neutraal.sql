-- 0071: technieken verder neutraal (25-11-2026)
--
-- Vervolg op 0070, keuze van de eigenaar: ook de placeholders van
-- Chain-of-Verification en Persona Prompting, en de sjablonen en voorbeelden die
-- de Rijkshuisstijl of de overheid noemen. Alleen data, geen schemawijziging:
-- branch stand-25-11-2026 blijft hierop werken.
--
-- Omkeren: draai dezelfde updates met de tekst tussen de twee aanhalingen
-- omgedraaid, dus replace(..., '<nieuw>', '<oud>').

begin;

-- Chain-of-Verification, placeholders van gewenst_doel en bronnen
update public.techniques
   set follow_up_questions = replace(
         replace(
           follow_up_questions::text,
           'Bijv. een concept-Kamerbrief die feitelijk klopt voordat hij naar de bewindspersoon gaat',
           'Bijv. een conceptbrief die feitelijk klopt voordat hij naar de directie gaat'
         ),
         'Bijv. alleen de meegestuurde stukken en eerdere Kamerbrieven over dit dossier',
         'Bijv. alleen de meegestuurde stukken en eerdere brieven over dit dossier'
       )::jsonb
 where id = 'ac92fc09-17c8-4e94-afb4-f30f0f59b167';

-- Persona Prompting, placeholder van rol en de uitleg die naar dat voorbeeld verwijst
update public.techniques
   set follow_up_questions = replace(
         replace(
           follow_up_questions::text,
           'Bijv. wetgevingsjurist bij een departement',
           'Bijv. jurist gespecialiseerd in privacywetgeving'
         ),
         '\"Wetgevingsjurist bij een departement\" activeert',
         '\"Jurist gespecialiseerd in privacywetgeving\" activeert'
       )::jsonb
 where id = 'f08e3d0b-5f05-471c-9d79-6ac0c77d2f5e';

-- Dashboard (Prototype) en Dashboard (Volledig)
update public.techniques
   set template = replace(template, 'de rest blijft neutraal, in rijkshuisstijl.', 'de rest blijft neutraal, in een rustige huisstijl.'),
       strength = replace(strength, 'een rustig, datagericht scherm in rijkshuisstijl.', 'een rustig, datagericht scherm in een rustige huisstijl.')
 where name in ('Dashboard (Prototype)', 'Dashboard (Volledig)');

-- BLUEPRINT (Vibecode Prototype), sjabloon
update public.techniques
   set template = replace(template, 'Bouw een snelle, met overheids kleuren en direct werkende', 'Bouw een snelle, met rustige kleuren en direct werkende')
 where id = 'bd8a9c10-7baf-4091-9550-2f4cd7953971';

-- BLUEPRINT (Vibecode), voorbeeld van gebruik
update public.techniques
   set use_cases = replace(use_cases::text, 'Wanneer een overheidsorganisatie een interne tool', 'Wanneer een organisatie een interne tool')::jsonb
 where id = '06add3d4-07bf-4af4-8bad-0e156bb3f03f';

-- Beeldprompt: de stijl heet in de app Pleinhuisstijl
update public.techniques
   set strength = replace(strength, '(Rijkshuisstijl of de stijl van een project)', '(Pleinhuisstijl of de stijl van een project)'),
       use_cases = replace(use_cases::text, 'in de Rijkshuisstijl.', 'in de Pleinhuisstijl.')::jsonb
 where name = 'Beeldprompt';

-- Chain-of-Verification, voorbeeld van gebruik
update public.techniques
   set use_cases = replace(use_cases::text, 'Gebruik dit wanneer een Kamerbrief, nota of besluit', 'Gebruik dit wanneer een brief, nota of besluit')::jsonb
 where id = 'ac92fc09-17c8-4e94-afb4-f30f0f59b167';

commit;
