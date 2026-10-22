-- 0043_tilssg_vibecode.sql
-- BLUEPRINT maakt plaats voor TILSSG: Taak, Inhoud, Layout, Succes, Scope, Grens.
--
-- De twee BLUEPRINT-frameworks voor Dashboard vroegen negen tot twaalf velden
-- (business, platform, testing, externe koppelingen en zo verder), waarvan het
-- prototype er drie in zijn template had zonder bijbehorende vraag. Het
-- resultaat was een lange specificatie zonder controleerbaar eindpunt.
--
-- TILSSG houdt alleen over wat de bouwende agent nodig heeft:
--   * wat erin komt (INHOUD) en hoe het eruitziet (LAYOUT), de kracht van
--     BLUEPRINT;
--   * het goal-systeem uit 0042: een taak, een controleerbare succesvoorwaarde,
--     wat niet mag veranderen en een grens aan het werk.
-- De uitkomst begint met een /goal-regel; daaronder staan INHOUD, LAYOUT en de
-- vaste regels van de variant. De interface-eisen uit BLUEPRINT (drie niveaus,
-- context bij elk cijfer, functionele kleur, vast raster) staan ingekort in
-- VASTE REGELS.
--
-- Elke vraag zegt wat er wel en niet in hoort, zodat elk veld één doel dient.
--
-- De BLUEPRINT-frameworks gaan uit, niet weg: opgeslagen prompts verwijzen er
-- nog naar.
--
-- Idempotent: ON CONFLICT (name).

UPDATE techniques SET is_active = FALSE
  WHERE name IN ('BLUEPRINT (Vibecode)', 'BLUEPRINT (Vibecode Prototype)');

INSERT INTO techniques (name, description, strength, use_cases, follow_up_questions, template, family, modality, is_active, sort_order)
VALUES (
  'TILSSG (Prototype)',
  'Bouwt een /goal-opdracht voor een klikbaar prototype met nepdata. Zes letters: Taak, Inhoud, Layout, Succes, Scope, Grens. Je staat alleen stil bij wat erin komt en hoe het eruitziet; de agent werkt door tot de succesvoorwaarde klopt.',
  'Kies dit om een idee voor een dashboard of tool snel tastbaar te maken, zonder backend, database of login. INHOUD en LAYOUT leggen vast wat er op elk scherm staat en hoe het eruitziet. SUCCES maakt het af controleerbaar, SCOPE en GRENS houden de agent binnen het prototype. De vaste regels zorgen voor een rustig, datagericht scherm in rijkshuisstijl.',
  $json$[
    "Een idee voor een dashboard snel klikbaar maken om het te laten zien.",
    "Draagvlak ophalen met een werkend prototype in plaats van een document.",
    "Een richting toetsen met nepdata voordat er een echt dashboard komt."
  ]$json$::jsonb,
  $json$[
    {
      "id": "taak",
      "label": "TAAK: wat bouw je, voor wie en waarvoor?",
      "placeholder": "Wel: één zin met de gebruiker en wat die ermee wil zien of doen. Niet: hoe het eruitziet of welke techniek. Bijvoorbeeld: bouw een prototype waarmee een teamleider per afdeling ziet hoeveel zaken over de termijn zijn."
    },
    {
      "id": "inhoud",
      "label": "INHOUD: wat staat er op elk scherm, en welke nepdata hoort erbij?",
      "placeholder": "Wel: de schermen of tabs, per scherm de kerncijfers, grafieken en tabellen, en de nepdata met aantallen. Niet: kleuren of waar iets staat, dat is LAYOUT. Bijvoorbeeld: tab Overzicht met open zaken, zaken over de termijn en gemiddelde doorlooptijd, elk met de vorige maand ernaast; een staafgrafiek per afdeling; een tabel met de oudste zaken. Nepdata: 4 afdelingen, 300 zaken over 12 maanden."
    },
    {
      "id": "layout",
      "label": "LAYOUT: hoe ziet het eruit, en welke vormregels gelden?",
      "placeholder": "Wel: wat bovenaan en groot staat, de indeling per scherm, de stijl en eigen regels. Niet: de inhoud opnieuw opsommen. Laat leeg voor de vaste indeling. Bijvoorbeeld: kopbalk met tabs; vier cijfertegels bovenaan; grafiek links, verdeling rechts; donkere modus erbij."
    },
    {
      "id": "succes",
      "label": "SUCCES: aan welk controleerbaar resultaat zie je dat het af is?",
      "placeholder": "Wel: een commando of iets wat je ziet. Niet: een gevoel zoals mooi of goed. Bijvoorbeeld: npm run build slaagt zonder fouten, npm run dev opent het prototype en elke tab toont zijn cijfers met nepdata."
    },
    {
      "id": "scope",
      "label": "SCOPE: wat bouw je juist niet, of wat mag niet veranderen? (optioneel)",
      "placeholder": "Geen backend, database of login staat al vast. Vul alleen aan wat erbij komt. Bijvoorbeeld: geen exportfunctie, of: alleen de tab Overzicht."
    },
    {
      "id": "grens",
      "label": "GRENS: hoeveel beurten maximaal, of wanneer moet de agent stoppen en vragen?",
      "placeholder": "Bijvoorbeeld: stop na 20 beurten. Of: stop en vraag het als je vastloopt."
    }
  ]$json$::jsonb,
  $tpl$/goal {{taak}}. Success: {{succes}}. Scope: geen backend, database of login; {{scope}}. {{grens}}.

# INHOUD:
{{inhoud}}

# LAYOUT:
{{layout}}

# VASTE REGELS:
Drie niveaus per scherm: kerncijfers groot bovenaan, daaronder de grafieken, onderaan de detailtabel.
Elk cijfer krijgt in hetzelfde blok een vergelijking, trend of doelwaarde.
Kleur alleen voor status of afwijking van een norm; de rest blijft neutraal, in rijkshuisstijl.
Korte labels, geen uitlegtekst boven een blok.
Alles staat zichtbaar in een vast raster; op mobiel onder elkaar in dezelfde volgorde.
React, TypeScript, Vite en Tailwind; alle data in het geheugen, met verzonnen namen.
Gebruik alleen imports en iconen die echt bestaan; draai npm run build voor je klaar meldt.$tpl$,
  'context',
  'dashboard_prototype',
  TRUE,
  16
),
(
  'TILSSG (Dashboard)',
  'Bouwt een /goal-opdracht voor een echt dashboard met databronnen en rollen. Zes letters: Taak, Inhoud, Layout, Succes, Scope, Grens. Je staat alleen stil bij wat erin komt en hoe het eruitziet; de agent werkt door tot de succesvoorwaarde klopt.',
  'Kies dit voor een dashboard dat met echte data werkt, in een nieuw of bestaand project. INHOUD legt vast wat er op elk scherm staat, waar de cijfers vandaan komen en welke rol wat ziet. LAYOUT legt vast hoe het eruitziet. SUCCES maakt het af controleerbaar, SCOPE beschermt wat er al is en GRENS houdt het werk begrensd. De vaste regels zorgen voor een rustig, datagericht en veilig dashboard.',
  $json$[
    "Een dashboard bouwen op echte databronnen, met rollen die elk hun eigen deel zien.",
    "Een prototype doorbouwen tot een dashboard dat in gebruik kan.",
    "Een dashboard toevoegen aan een bestaande applicatie zonder de rest te raken."
  ]$json$::jsonb,
  $json$[
    {
      "id": "taak",
      "label": "TAAK: wat bouw je, voor wie en waarvoor?",
      "placeholder": "Wel: één zin met de gebruiker en wat die ermee wil zien of doen. Niet: hoe het eruitziet of welke techniek. Bijvoorbeeld: bouw een dashboard waarmee teamleiders per afdeling zien hoeveel zaken over de termijn zijn."
    },
    {
      "id": "inhoud",
      "label": "INHOUD: wat staat er op elk scherm, waar komen de cijfers vandaan en wie ziet wat?",
      "placeholder": "Wel: de schermen, per scherm de kerncijfers, grafieken en tabellen, de databron per cijfer en welke rol wat ziet. Niet: kleuren of waar iets staat, dat is LAYOUT. Bijvoorbeeld: open zaken en doorlooptijd uit de tabel zaken, met de vorige maand ernaast; teamleiders zien alleen hun eigen afdeling, de directie ziet alles."
    },
    {
      "id": "layout",
      "label": "LAYOUT: hoe ziet het eruit, en welke vormregels gelden?",
      "placeholder": "Wel: wat bovenaan en groot staat, de indeling per scherm, de stijl en eigen regels. Niet: de inhoud opnieuw opsommen. Laat leeg voor de vaste indeling. Bijvoorbeeld: past in de bestaande navigatie; vier cijfertegels bovenaan; filter op periode rechtsboven."
    },
    {
      "id": "succes",
      "label": "SUCCES: aan welk controleerbaar resultaat zie je dat het af is?",
      "placeholder": "Wel: een commando, test of iets wat je ziet. Niet: een gevoel zoals mooi of goed. Bijvoorbeeld: npm test en npm run build slagen, en een teamleider ziet na inloggen alleen de cijfers van de eigen afdeling."
    },
    {
      "id": "scope",
      "label": "SCOPE: wat mag er niet veranderen?",
      "placeholder": "Bijvoorbeeld: niets buiten src/dashboard/ aanpassen; het databaseschema en de bestaande rollen blijven zoals ze zijn."
    },
    {
      "id": "grens",
      "label": "GRENS: hoeveel beurten maximaal, of wanneer moet de agent stoppen en vragen?",
      "placeholder": "Bijvoorbeeld: stop na 30 beurten. Of: stop en vraag het als je vastloopt."
    }
  ]$json$::jsonb,
  $tpl$/goal {{taak}}. Success: {{succes}}. Scope: {{scope}}. {{grens}}.

# INHOUD:
{{inhoud}}

# LAYOUT:
{{layout}}

# VASTE REGELS:
Drie niveaus per scherm: kerncijfers groot bovenaan, daaronder de grafieken, onderaan de detailtabel.
Elk cijfer krijgt in hetzelfde blok een vergelijking, trend of doelwaarde.
Kleur alleen voor status of afwijking van een norm; de rest blijft neutraal, in rijkshuisstijl.
Korte labels, geen uitlegtekst boven een blok.
Alles staat zichtbaar in een vast raster; op mobiel onder elkaar in dezelfde volgorde.
Volg de stack en opzet van het project; geen nieuwe afhankelijkheid zonder reden.
Elke rol ziet alleen de data waar hij recht op heeft; controleer dat op de server, niet alleen in de interface.
Geen echte persoonsgegevens, wachtwoorden of sleutels in code of tests; toegankelijk volgens WCAG 2.1 AA.
Draai de build en de tests voor je klaar meldt.$tpl$,
  'context',
  'dashboard_full',
  TRUE,
  17
)
ON CONFLICT (name) DO UPDATE SET
  description = EXCLUDED.description,
  strength = EXCLUDED.strength,
  use_cases = EXCLUDED.use_cases,
  follow_up_questions = EXCLUDED.follow_up_questions,
  template = EXCLUDED.template,
  family = EXCLUDED.family,
  modality = EXCLUDED.modality,
  is_active = EXCLUDED.is_active;
