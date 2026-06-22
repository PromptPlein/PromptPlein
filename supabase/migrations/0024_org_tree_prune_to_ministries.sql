-- Overheid Prompt Library — Organisatieboom inkorten tot Rijksoverheid + ministeries.
--
-- Aanleiding: de dienstonderdelen onder de ministeries (agentschappen,
-- directoraten-generaal, directies en afdelingen — o.a. de hele OCW-tak met DUO)
-- die in 0020 zijn toegevoegd, worden niet meer gebruikt. De organisatiekeuze
-- blijft voortaan op het niveau Rijksoverheid → ministerie.
--
-- Deze migratie:
--   1. Hangt prompts/profielen die nog aan een dienstonderdeel hangen om naar
--      de bovenliggende ministerie-wortel (bijv. DUO → OCW). Niets gaat verloren.
--   2. Verwijdert alle dienstonderdelen (agency / directorate /
--      directorate_general / department), zodat alleen 'government' (Rijksoverheid)
--      en 'ministry' overblijven.
--
-- Let op: de organization_type-check uit 0020 blijft staan, zodat de niveaus
-- desgewenst later opnieuw kunnen worden ingevuld.

BEGIN;

-- 1. Map elk te verwijderen dienstonderdeel naar zijn ministerie-wortel
--    (het voorouder-org waarvan de parent de government-root is).
CREATE TEMP TABLE _org_to_ministry ON COMMIT DROP AS
WITH RECURSIVE climb AS (
  SELECT o.id AS start_id, o.id AS node_id, o.parent_id, o.organization_type
  FROM organizations o
  WHERE o.organization_type IN ('agency', 'directorate', 'directorate_general', 'department')
  UNION ALL
  SELECT c.start_id, p.id, p.parent_id, p.organization_type
  FROM climb c
  JOIN organizations p ON p.id = c.parent_id
)
SELECT DISTINCT c.start_id AS removable_id, c.node_id AS ministry_id
FROM climb c
WHERE c.organization_type = 'ministry';

-- 2. Verwijzingen omhangen naar de ministerie-wortel.
UPDATE prompts p
SET organization_id = m.ministry_id
FROM _org_to_ministry m
WHERE p.organization_id = m.removable_id;

UPDATE profiles pr
SET organization_id = m.ministry_id
FROM _org_to_ministry m
WHERE pr.organization_id = m.removable_id;

-- (organization_moderators en prompt_visibility verwijzen in de praktijk niet naar
--  dienstonderdelen; mochten ze dat wél doen, dan blokkeert de FK de delete en
--  moet dat eerst handmatig worden opgeschoond.)

-- 3. Dienstonderdelen verwijderen — herhaald bladsgewijs zodat de self-referencing
--    parent_id-FK nooit wordt geschonden (diepste niveau eerst).
DELETE FROM organizations
WHERE organization_type IN ('agency', 'directorate', 'directorate_general', 'department')
  AND id NOT IN (SELECT parent_id FROM organizations WHERE parent_id IS NOT NULL);

DELETE FROM organizations
WHERE organization_type IN ('agency', 'directorate', 'directorate_general', 'department')
  AND id NOT IN (SELECT parent_id FROM organizations WHERE parent_id IS NOT NULL);

DELETE FROM organizations
WHERE organization_type IN ('agency', 'directorate', 'directorate_general', 'department')
  AND id NOT IN (SELECT parent_id FROM organizations WHERE parent_id IS NOT NULL);

DELETE FROM organizations
WHERE organization_type IN ('agency', 'directorate', 'directorate_general', 'department');

COMMIT;
