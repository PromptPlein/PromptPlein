-- 0036_prompt_kind_modality.sql
-- "Wat wil je maken?" in /genereren: de soort stuurt de frameworkkeuze.
--
-- De gebruiker kiest boven het invoerveld Tekst, Code, Dashboard, Agent of
-- Skill. Elke soort houdt alleen de frameworks over die erbij horen. Bij Code
-- en Dashboard zit er een schakelaar onder (iets nieuws of bestaande code;
-- eerst een prototype of meteen volledig), dus de kolom kent zes waarden in
-- plaats van vier: zo wijst de schakelaar precies één framework aan.
--
-- Skill staat hier niet bij. Die soort stuurt door naar de Skill Creator op
-- /technieken (migratie 0035) en kiest dus geen framework.
--
-- NULL betekent: past overal en doet bij elke soort mee. Zo verdwijnt een
-- framework dat een beheerder later toevoegt niet uit beeld zolang niemand
-- een soort heeft ingevuld.
--
-- De waarden MOETEN gelijk blijven aan `Modality` in src/lib/techniques.ts.
--
-- Naar het voorbeeld van AIPromptHub (0046, 0047, 0042, 0057). Twee codeframeworks
-- erbij, in het Nederlands zoals de rest van deze lijst:
--   * Vibecode (Bestaande code): de Agent Vibecode van AIPromptHub, voor werk in
--     een bestaande codebase. Met de kwaliteitslat uit 0057 in plaats van de
--     agent-lus, omdat de meeste mensen hun codeprompt in een chat plakken.
--   * Vibecode (Nieuwe tool): nieuw. Voor een medewerker die zelf een klein
--     hulpmiddel laat bouwen dat er nog niet is. Die heeft geen "nu" om te
--     beschrijven, en is meestal geen programmeur, vandaar het blok STARTEN.
-- Beide nemen de eisen mee die bij de rijksoverheid horen: geen echte
-- persoonsgegevens of sleutels, geen onnodige externe diensten, toegankelijk.
--
-- Idempotent: de kolom met IF NOT EXISTS, de frameworks met ON CONFLICT (name).

ALTER TABLE techniques ADD COLUMN IF NOT EXISTS modality TEXT;

ALTER TABLE techniques DROP CONSTRAINT IF EXISTS techniques_modality_check;
ALTER TABLE techniques
  ADD CONSTRAINT techniques_modality_check
  CHECK (modality IS NULL OR modality IN (
    'text', 'code_new', 'code_existing', 'dashboard_prototype', 'dashboard_full', 'agent'
  ));

COMMENT ON COLUMN techniques.modality IS
  'Soort uitkomst van dit framework, voor de keuze "Wat wil je maken?" in /genereren: text, code_new, code_existing, dashboard_prototype, dashboard_full of agent. NULL = doet bij elke soort mee.';

-- De bestaande frameworks een soort geven.
UPDATE techniques SET modality = 'text'
  WHERE family = 'context'
    AND name IN ('CARE', 'CO-STAR', 'CREATE', 'CRAFT', 'CRISPE', 'RAISE', 'CRISP');

UPDATE techniques SET modality = 'dashboard_prototype' WHERE name = 'BLUEPRINT (Vibecode Prototype)';
UPDATE techniques SET modality = 'dashboard_full' WHERE name = 'BLUEPRINT (Vibecode)';
UPDATE techniques SET modality = 'agent' WHERE name IN ('ReAct (Agents)', 'REACT');

-- Vibecode (Nieuwe tool)
INSERT INTO techniques (name, description, strength, use_cases, follow_up_questions, template, family, modality, is_active, sort_order)
VALUES (
  'Vibecode (Nieuwe tool)',
  'Opdrachtraamwerk om met AI een klein hulpmiddel te laten bouwen dat er nog niet is: een webpagina, een script of een macro. Zes blokken zorgen dat de assistent weet wat de tool doet, wat erin gaat en eruit komt, in welke vorm hij moet draaien, binnen welke grenzen, en hoe je hem start zonder programmeur te zijn.',
  'Kies dit wanneer een medewerker een NIEUW hulpmiddel wil laten bouwen, zonder bestaande code: een webpagina die een bestand inleest, een script dat een export opschoont, een rekenhulp of een checklist. WAT HET DOET en IN EN UIT maken de opdracht toetsbaar met één voorbeeld. VORM houdt de tool klein: één bestand dat zonder installatie of server draait. GRENZEN legt vast wat bij de overheid altijd geldt: geen echte persoonsgegevens of sleutels in de code, geen externe dienst zonder reden, een toegankelijke Nederlandse interface. STARTEN zorgt dat iemand die geen programmeur is de tool ook echt kan openen. Kies dit niet voor werk in een bestaande codebase (dat is Vibecode (Bestaande code)), niet voor een dashboard (BLUEPRINT) en niet voor een tekst.',
  '[
    "Een webpagina laten bouwen die een Excel- of CSV-export inleest en daar een overzicht van maakt.",
    "Een script laten schrijven dat een terugkerende klus automatiseert, zoals bestanden hernoemen of een export opschonen.",
    "Een rekenhulp of checklist als losse pagina laten maken voor collega''s.",
    "Een eerste versie van een hulpmiddel laten bouwen om te laten zien wat er kan, zonder ontwikkelteam."
  ]'::jsonb,
  '[
    {
      "id": "wat",
      "label": "WAT HET DOET — beschrijf in één zin wie de tool gebruikt en waarvoor.",
      "placeholder": "Bijvoorbeeld: als teamleider wil ik een Excel-export uit het zaaksysteem inlezen, zodat ik per afdeling zie hoeveel zaken over de termijn zijn."
    },
    {
      "id": "in_uit",
      "label": "IN EN UIT — wat gaat erin, wat komt eruit? Geef één voorbeeld.",
      "placeholder": "Bijvoorbeeld: in gaat een CSV met de kolommen zaaknummer, afdeling, startdatum en status. Uit komt een tabel met per afdeling het aantal open zaken en het aantal over de termijn van acht weken."
    },
    {
      "id": "vorm",
      "label": "VORM — waarin moet de tool draaien?",
      "placeholder": "Bijvoorbeeld: één HTML-bestand dat ik dubbelklik en in de browser opent. Of: een Python-script, of een Excel-macro."
    },
    {
      "id": "grenzen",
      "label": "GRENZEN — wat moet er nog meer gelden? (optioneel)",
      "placeholder": "Laat leeg voor de vaste grenzen. Vul alleen aan wat erbij komt, bijvoorbeeld: moet werken zonder internet, of: alleen standaardbibliotheken van Python."
    }
  ]'::jsonb,
  E'# WAT HET DOET:\n{{wat}}\n\n# IN EN UIT:\n{{in_uit}}\n\n# VORM:\n{{vorm}}\nDe tool draait zonder installatie en zonder server, tenzij hierboven iets anders staat.\n\n# GRENZEN:\nWerk alleen met verzonnen voorbeelddata. Zet geen echte persoonsgegevens, wachtwoorden, API-sleutels of interne adressen in de code. Gebruik geen externe dienst, CDN of extra bibliotheek tenzij die echt nodig is, en zeg dan welke en waarom. Maak de interface in het Nederlands en toegankelijk volgens WCAG 2.1 AA: een label bij elk invoerveld, volledig te bedienen met het toetsenbord, voldoende contrast.\n{{grenzen}}\n\n# STARTEN:\nSluit af met een uitleg in hooguit drie stappen voor iemand die geen programmeur is: hoe je de code opslaat, waar je hem opent en wat je dan ziet.\n\n# KWALITEITSLAT:\nControleer voor je oplevert: de tool doet wat onder WAT HET DOET staat, met het voorbeeld uit IN EN UIT; hij draait zonder aanpassing; lege of verkeerde invoer geeft een begrijpelijke melding in plaats van een fout; alles onder GRENZEN klopt. Lever de volledige code in één keer, zonder weggelaten stukken.\n\n---\n\nWerk de blokken hierboven uit tot één opdracht die de gebruiker in een AI-assistent plakt om de tool te laten bouwen. Schrijf in de gebiedende wijs, gericht aan de assistent:\n{{PROMPT}}',
  'context',
  'code_new',
  TRUE,
  19
)
ON CONFLICT (name) DO UPDATE SET
  description = EXCLUDED.description,
  strength = EXCLUDED.strength,
  use_cases = EXCLUDED.use_cases,
  follow_up_questions = EXCLUDED.follow_up_questions,
  template = EXCLUDED.template,
  family = EXCLUDED.family,
  modality = EXCLUDED.modality;

-- Vibecode (Bestaande code)
INSERT INTO techniques (name, description, strength, use_cases, follow_up_questions, template, family, modality, is_active, sort_order)
VALUES (
  'Vibecode (Bestaande code)',
  'Opdrachtraamwerk om met AI te werken in code die er al is: een fout oplossen, een functie toevoegen, gedrag wijzigen of gericht opruimen. Zes blokken zorgen dat de assistent eerst de oorzaak zoekt, binnen de bestaande opzet blijft, de kleinste samenhangende oplossing kiest en zijn eigen werk nakijkt voor hij het oplevert.',
  'Kies dit wanneer er gewerkt wordt in een BESTAANDE codebase, in een codeertool of in een chatgesprek. VERANDERING dwingt het verschil af tussen wat er nu gebeurt en wat er zou moeten gebeuren, plus hoe je het oproept; zonder dat verschil raadt een model naar de opdracht. RONDKIJKEN en WERKWIJZE gaan het bekendste faalpatroon tegen: het eerste verdachte bestand aanpassen en daarmee alleen het symptoom wegwerken. BLIJFT ZO en KWALITEITSLAT maken de grens hard: wat onaangeroerd blijft, en een zelfcontrole voor het opleveren, zodat er geen ongevraagde verbouwing, nieuwe afhankelijkheid of verzwakte test in glipt. Kies dit niet voor een hulpmiddel dat er nog niet is (dat is Vibecode (Nieuwe tool)), niet voor een dashboard (BLUEPRINT) en niet voor een tekst.',
  '[
    "Een fout of onverwacht gedrag in bestaande code laten oplossen, met de oorzaak erbij.",
    "Een nieuwe functie laten bouwen die past in de opzet en afspraken van de bestaande code.",
    "Een gerichte wijziging of opruimactie laten doen zonder dat de assistent andere delen herschrijft.",
    "Elke codeeropdracht aan een assistent in dezelfde controleerbare vorm gieten."
  ]'::jsonb,
  '[
    {
      "id": "verandering",
      "label": "VERANDERING — wat gebeurt er nu, en wat zou er moeten gebeuren?",
      "placeholder": "Nu: de export bevat altijd alle rijen. Verwacht: de export volgt het actieve filter. Oproepen: filter op status open, klik Exporteren, de CSV bevat ook gesloten rijen."
    },
    {
      "id": "rondkijken",
      "label": "RONDKIJKEN — waar moet de assistent beginnen met kijken?",
      "placeholder": "Bijvoorbeeld: de exportknop in ReportToolbar, de functie useReportFilters en de route /api/export. De filterwijziging van vorige week is verdacht."
    },
    {
      "id": "doel",
      "label": "DOEL — wat werkt er als de taak af is, en hoe ziet het resultaat eruit?",
      "placeholder": "Bijvoorbeeld: wie op Exporteren klikt krijgt een CSV met alleen de rijen die het filter overhoudt, met dezelfde kolommen in dezelfde volgorde als de tabel op het scherm."
    },
    {
      "id": "blijft_zo",
      "label": "BLIJFT ZO — wat moet er absoluut hetzelfde blijven?",
      "placeholder": "Bijvoorbeeld: de kolomvolgorde en de bestandsnaam van de CSV veranderen niet; de functie exportRows() houdt dezelfde aanroep."
    },
    {
      "id": "werkwijze",
      "label": "WERKWIJZE — hoe moet de assistent te werk gaan? (optioneel)",
      "placeholder": "Laat leeg voor de vaste werkwijze. Vul alleen aan wat afwijkt, bijvoorbeeld: draai de tests met npm run test, of: werk per bestand in kleine stappen."
    }
  ]'::jsonb,
  E'# VERANDERING:\n{{verandering}}\n\n# RONDKIJKEN:\n{{rondkijken}}\nVolg de hele keten voordat je iets aanpast en bepaal eerst de oorzaak. Ga er niet van uit dat het eerste verdachte bestand de oorzaak is.\n\n# DOEL:\n{{doel}}\nStaat de vorm van het resultaat er niet bij, leid die dan af uit het bestaande gedrag in plaats van iets nieuws te bedenken.\n\n# BLIJFT ZO:\n{{blijft_zo}}\nVolg de bestaande opzet en afspraken van de code. Geen opruimacties of herschrijvingen buiten de taak, geen nieuwe afhankelijkheid zonder duidelijke reden. Verzwak geen types, validatie, foutafhandeling, beveiliging, toegankelijkheid of tests om het werkend te krijgen. Zet geen echte persoonsgegevens, wachtwoorden of sleutels in code of tests.\n\n# WERKWIJZE:\nBekijk eerst de bestaande code en pas dan pas iets aan. Los de oorzaak op in plaats van het symptoom weg te werken. Kies de kleinste samenhangende oplossing die het doel en de randgevallen dekt.\n{{werkwijze}}\n\n# KWALITEITSLAT:\nControleer voor je oplevert: wat onder DOEL staat gebeurt echt, ook bij de randgevallen; de oorzaak is opgelost; alles onder BLIJFT ZO klopt nog; de wijziging volgt de stijl van de code eromheen. Noem wat je niet zelf hebt kunnen draaien of testen.\n\n---\n\nWerk de blokken hierboven uit tot één opdracht die de gebruiker in een codeerassistent plakt. Schrijf in de gebiedende wijs, gericht aan de assistent:\n{{PROMPT}}',
  'context',
  'code_existing',
  TRUE,
  20
)
ON CONFLICT (name) DO UPDATE SET
  description = EXCLUDED.description,
  strength = EXCLUDED.strength,
  use_cases = EXCLUDED.use_cases,
  follow_up_questions = EXCLUDED.follow_up_questions,
  template = EXCLUDED.template,
  family = EXCLUDED.family,
  modality = EXCLUDED.modality;
