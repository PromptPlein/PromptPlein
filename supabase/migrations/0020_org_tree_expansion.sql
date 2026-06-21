-- Overheid Prompt Library — Organisatieboom compleet maken & corrigeren.
--
-- Aanleiding: de getrapte zichtbaarheid (afdeling → ministerie → Rijksoverheid)
-- leunt op de organisatie-hiërarchie via parent_id. De boom stond nog
-- onvolledig en deels verkeerd geclassificeerd:
--   * DUO stond als 'ministry', maar is formeel een AGENTSCHAP van OCW
--     (uitvoeringsorganisatie, baten-lastendienst) — bron: rijksoverheid.nl.
--   * Namen van OCW en DUO bevatten kleine fouten ("Uitvoerend" i.p.v.
--     "Uitvoering"; ontbrekende komma in OCW).
--   * Onder de ministeries ontbraken nog de directoraten-generaal, directies
--     en dienstonderdelen waaraan medewerkers prompts willen koppelen.
--
-- Deze migratie:
--   1. Verbreedt de organization_type-check met fijnmaziger niveaus.
--   2. Corrigeert DUO (agentschap) en de namen van OCW/DUO.
--   3. Vult de OCW-tak volledig: stafdirecties, DG's + directies,
--      dienstonderdelen (DUO, Inspectie, Nationaal Archief, RCE) en de
--      DUO-afdelingen.
--   4. Voegt de overige 11 ministeries toe als losse takken onder Rijksoverheid
--      (zonder afdelingen — die kunnen later per ministerie worden ingevuld).
--
-- Idempotent: codes zijn uniek; INSERT ... ON CONFLICT (code) DO UPDATE houdt
-- naam/type/parent in lijn. De migratie kan veilig opnieuw draaien.

-- 1. Verbreed het type. 'agency' bestond al; we voegen fijnmaziger niveaus toe
--    zonder bestaande waarden te breken. De zichtbaarheidslogica leunt NIET op
--    dit type (die gebruikt de boomstructuur via parent_id), dus dit is puur
--    voor weergave/filtering in de netwerkverkenner.
ALTER TABLE organizations DROP CONSTRAINT IF EXISTS organizations_organization_type_check;
ALTER TABLE organizations
  ADD CONSTRAINT organizations_organization_type_check
  CHECK (organization_type IN (
    'government',          -- de Rijksoverheid-root
    'ministry',           -- een ministerie (eerste niveau onder Rijk)
    'directorate_general',-- directoraat-generaal binnen een ministerie
    'directorate',        -- directie / stafdirectie
    'agency',             -- agentschap / uitvoeringsorganisatie / dienstonderdeel
    'department'          -- afdeling binnen een dienstonderdeel of directie
  ));

-- 2. Corrigeer de root + bestaande rijen via hun unieke code.
--    Rijksoverheid is de overkoepelende root.
UPDATE organizations
  SET organization_type = 'government', name = 'Rijksoverheid'
  WHERE code = 'RIJK';

--    OCW: naamcorrectie (komma) + blijft ministerie onder Rijk.
UPDATE organizations o
  SET name = 'Onderwijs, Cultuur en Wetenschap',
      organization_type = 'ministry',
      parent_id = (SELECT id FROM organizations WHERE code = 'RIJK')
  WHERE o.code = 'OCW';

--    DUO: agentschap ván OCW (geen ministerie) + naamcorrectie.
UPDATE organizations o
  SET name = 'Dienst Uitvoering Onderwijs',
      organization_type = 'agency',
      parent_id = (SELECT id FROM organizations WHERE code = 'OCW')
  WHERE o.code = 'DUO';

-- 3. Overige ministeries onder Rijksoverheid (Kabinet-Jetten, 2026).
--    Bron: rijksoverheid.nl/ministeries + nl.wikipedia.org. OCW staat er al.
INSERT INTO organizations (name, code, organization_type, parent_id, description)
SELECT v.name, v.code, 'ministry', (SELECT id FROM organizations WHERE code = 'RIJK'), v.descr
FROM (VALUES
  ('Algemene Zaken', 'AZ', 'Ministerie van Algemene Zaken'),
  ('Binnenlandse Zaken en Koninkrijksrelaties', 'BZK', 'Ministerie van Binnenlandse Zaken en Koninkrijksrelaties'),
  ('Buitenlandse Zaken', 'BZ', 'Ministerie van Buitenlandse Zaken'),
  ('Defensie', 'DEF', 'Ministerie van Defensie'),
  ('Economische Zaken en Klimaat', 'EZK', 'Ministerie van Economische Zaken en Klimaat'),
  ('Financiën', 'FIN', 'Ministerie van Financiën'),
  ('Infrastructuur en Waterstaat', 'IenW', 'Ministerie van Infrastructuur en Waterstaat'),
  ('Justitie en Veiligheid', 'JenV', 'Ministerie van Justitie en Veiligheid'),
  ('Landbouw, Visserij, Voedselzekerheid en Natuur', 'LVVN', 'Ministerie van Landbouw, Visserij, Voedselzekerheid en Natuur'),
  ('Sociale Zaken en Werkgelegenheid', 'SZW', 'Ministerie van Sociale Zaken en Werkgelegenheid'),
  ('Volksgezondheid, Welzijn en Sport', 'VWS', 'Ministerie van Volksgezondheid, Welzijn en Sport')
) AS v(name, code, descr)
ON CONFLICT (code) DO UPDATE
  SET name = EXCLUDED.name,
      organization_type = EXCLUDED.organization_type,
      parent_id = EXCLUDED.parent_id;

-- 4. OCW-stafdirecties (direct onder de SG van het ministerie).
INSERT INTO organizations (name, code, organization_type, parent_id, description)
SELECT v.name, v.code, 'directorate', (SELECT id FROM organizations WHERE code = 'OCW'), 'Stafdirectie OCW'
FROM (VALUES
  ('Bestuursondersteuning en Advies', 'OCW-BOA'),
  ('Communicatie', 'OCW-COM'),
  ('Financieel-Economische Zaken', 'OCW-FEZ'),
  ('Informatievoorziening', 'OCW-DI')
) AS v(name, code)
ON CONFLICT (code) DO UPDATE
  SET name = EXCLUDED.name, organization_type = EXCLUDED.organization_type, parent_id = EXCLUDED.parent_id;

-- 5. OCW directoraten-generaal.
INSERT INTO organizations (name, code, organization_type, parent_id, description)
SELECT v.name, v.code, 'directorate_general', (SELECT id FROM organizations WHERE code = 'OCW'), 'Directoraat-generaal OCW'
FROM (VALUES
  ('DG Funderend Onderwijs', 'OCW-DGFO'),
  ('DG Hoger Onderwijs, Beroepsonderwijs, Wetenschap en Emancipatie', 'OCW-DGHBWE'),
  ('DG Cultuur en Media', 'OCW-DGCM')
) AS v(name, code)
ON CONFLICT (code) DO UPDATE
  SET name = EXCLUDED.name, organization_type = EXCLUDED.organization_type, parent_id = EXCLUDED.parent_id;

-- 6. Directies onder de DG's.
INSERT INTO organizations (name, code, organization_type, parent_id, description)
SELECT v.name, v.code, 'directorate', (SELECT id FROM organizations WHERE code = v.parent_code), 'Directie OCW'
FROM (VALUES
  ('Onderwijspersoneel en Primair Onderwijs', 'OCW-OPPO', 'OCW-DGFO'),
  ('Kansengelijkheid en Onderwijsondersteuning', 'OCW-KO', 'OCW-DGFO'),
  ('Hoger Onderwijs en Studiefinanciering', 'OCW-HOS', 'OCW-DGHBWE'),
  ('Onderzoek en Wetenschapsbeleid', 'OCW-OWB', 'OCW-DGHBWE'),
  ('Media en Creatieve Industrie', 'OCW-MCI', 'OCW-DGCM')
) AS v(name, code, parent_code)
ON CONFLICT (code) DO UPDATE
  SET name = EXCLUDED.name, organization_type = EXCLUDED.organization_type, parent_id = EXCLUDED.parent_id;

-- 7. Overige dienstonderdelen / agentschappen onder OCW (naast DUO).
INSERT INTO organizations (name, code, organization_type, parent_id, description)
SELECT v.name, v.code, 'agency', (SELECT id FROM organizations WHERE code = 'OCW'), 'Dienstonderdeel OCW'
FROM (VALUES
  ('Inspectie van het Onderwijs', 'OCW-IVHO'),
  ('Nationaal Archief', 'OCW-NA'),
  ('Rijksdienst voor het Cultureel Erfgoed', 'OCW-RCE')
) AS v(name, code)
ON CONFLICT (code) DO UPDATE
  SET name = EXCLUDED.name, organization_type = EXCLUDED.organization_type, parent_id = EXCLUDED.parent_id;

-- 8. Afdelingen binnen DUO (publiek benoemde dienstlijnen van het agentschap).
INSERT INTO organizations (name, code, organization_type, parent_id, description)
SELECT v.name, v.code, 'department', (SELECT id FROM organizations WHERE code = 'DUO'), 'Afdeling DUO'
FROM (VALUES
  ('Studiefinanciering / Particulieren', 'DUO-SF'),
  ('Examendiensten', 'DUO-EX'),
  ('Onderwijsdata', 'DUO-OD'),
  ('Diplomadiensten', 'DUO-DD'),
  ('Bekostiging', 'DUO-BEK'),
  ('Shared Service Organisatie Noord', 'DUO-SSON')
) AS v(name, code)
ON CONFLICT (code) DO UPDATE
  SET name = EXCLUDED.name, organization_type = EXCLUDED.organization_type, parent_id = EXCLUDED.parent_id;
