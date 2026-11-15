-- 0062_afbeelding_in_plaats_van_routekaart.sql
-- "Wat wil je maken?" in /genereren: Afbeelding komt op de plek van Routekaart.
--
-- De routekaart verdwijnt helemaal, keuze van de eigenaar. Het sjabloon uit 0039
-- gaat eruit, en daarmee de soort 'template': er was geen ander sjabloon.
-- analytics_events verwijst met ON DELETE SET NULL, dus oude meetregels blijven.
--
-- Afbeelding heeft één framework, de beeldprompt. PromptPlein maakt zelf geen
-- beeld; de prompt gaat naar een beeldgenerator zoals ChatGPT of Copilot. De
-- velden volgen de promptgids van OpenAI voor gpt-image: eerst waar het beeld
-- voor is, dan onderwerp en omgeving, dan stijl, kader en licht, en als laatste
-- tekst, beperkingen en formaat. Dezelfde bouwstenen staan op de spiekkaart
-- (BeeldSpiekkaart) die verschijnt zodra iemand Afbeelding kiest.
--
-- De beeldstijl (vrij, Rijkshuisstijl of uit een project) is geen veld: die kiest
-- de gebruiker boven het tekstvak en hij gaat server-side als vaste stijl mee
-- (IMAGE_STYLE_BLOCK in optimize-prompt).
--
-- De waarden van modality MOETEN gelijk blijven aan `Modality` in
-- src/lib/techniques.ts.
--
-- Idempotent: de constraint opnieuw, de beeldprompt met ON CONFLICT (name).

DELETE FROM techniques WHERE modality = 'template' OR name = 'Routekaart (rijksstijl)';

ALTER TABLE techniques DROP CONSTRAINT IF EXISTS techniques_modality_check;
ALTER TABLE techniques
  ADD CONSTRAINT techniques_modality_check
  CHECK (modality IS NULL OR modality IN (
    'text', 'code_new', 'code_existing', 'dashboard_prototype', 'dashboard_full', 'agent', 'image'
  ));

COMMENT ON COLUMN techniques.modality IS
  'Soort uitkomst van dit framework, voor de keuze "Wat wil je maken?" in /genereren: text, code_new, code_existing, dashboard_prototype, dashboard_full, agent of image (een beeldprompt voor een beeldgenerator). NULL = doet bij elke soort mee, behalve bij Afbeelding.';

INSERT INTO techniques (name, description, strength, use_cases, follow_up_questions, template, family, modality, is_active, sort_order)
VALUES (
  'Beeldprompt',
  'Een prompt voor een beeldgenerator, zoals ChatGPT of Copilot. Negen bouwstenen zorgen dat het beeld laat zien wat je bedoelt: waar het voor is, wie of wat erop staat, waar, in welke stijl, van welke afstand, in welk licht, met welke tekst, wat er niet in mag en in welk formaat.',
  'Kies dit wanneer een medewerker een afbeelding wil laten maken: een illustratie bij een bericht, een beeld voor een presentatie, een affiche of een beeld voor sociale media. De volgorde komt uit de promptgids van OpenAI: eerst het doel, dan scène en onderwerp, dan de details en als laatste de beperkingen. Wat de medewerker openlaat, stelt de AI voor. Een vaste beeldstijl (Rijkshuisstijl of de stijl van een project) gaat altijd mee, zodat een reeks beelden op elkaar lijkt.',
  $json$[
    "Een illustratie laten maken bij een bericht op intranet of de website.",
    "Een beeld voor een presentatie of een affiche, in de Rijkshuisstijl.",
    "Een reeks beelden in dezelfde stijl, met elke keer een ander onderwerp.",
    "Een beeld voor sociale media met een korte tekst erin."
  ]$json$::jsonb,
  $json$[
    {
      "id": "doel",
      "label": "DOEL: waar komt het beeld te staan, en wat moet de kijker meteen zien?",
      "placeholder": "Bijvoorbeeld: bovenaan een intranetbericht. De kijker ziet meteen dat thuiswerken rustig en goed geregeld kan."
    },
    {
      "id": "onderwerp",
      "label": "ONDERWERP: wie of wat staat centraal?",
      "placeholder": "Noem wie of wat er op het beeld staat, zo concreet mogelijk: wat iemand doet, draagt of vasthoudt."
    },
    {
      "id": "omgeving",
      "label": "OMGEVING: waar speelt het zich af?",
      "placeholder": "Noem de plek en wat er op de achtergrond te zien is."
    },
    {
      "id": "stijl",
      "label": "STIJL: foto, illustratie, 3D of iets anders, en in welke kleuren?",
      "placeholder": "Bijvoorbeeld: een vlakke illustratie in blauwtinten. Of: een natuurlijke foto, niet geposeerd."
    },
    {
      "id": "kader",
      "label": "KADER: hoe dichtbij, vanaf welke hoogte, en waar blijft ruimte vrij?",
      "placeholder": "Bijvoorbeeld: halftotaal op ooghoogte, onderwerp rechts, links ruimte voor een kop."
    },
    {
      "id": "licht",
      "label": "LICHT EN SFEER: wat voor licht, en welk gevoel moet het geven?",
      "placeholder": "Bijvoorbeeld: zacht ochtendlicht door een raam, rustig en vriendelijk."
    },
    {
      "id": "tekst",
      "label": "TEKST IN BEELD: welke woorden staan er letterlijk in? (optioneel)",
      "placeholder": "Laat leeg voor een beeld zonder tekst. Of noem de woorden precies, met waar ze moeten staan."
    },
    {
      "id": "niet",
      "label": "NIET IN BEELD: wat mag er nooit in staan? (optioneel)",
      "placeholder": "Logo's, watermerken en merknamen laat de AI altijd weg. Noem hier wat er verder niet in mag."
    },
    {
      "id": "formaat",
      "label": "FORMAAT: vierkant, liggend of staand?",
      "placeholder": "Bijvoorbeeld: liggend (3:2) voor een bericht, vierkant (1:1) voor sociale media, staand (2:3) voor een affiche."
    }
  ]$json$::jsonb,
  $tpl$# DOEL:
{{doel}}

# ONDERWERP:
{{onderwerp}}

# OMGEVING:
{{omgeving}}

# STIJL:
{{stijl}}

# KADER:
{{kader}}

# LICHT EN SFEER:
{{licht}}

# TEKST IN BEELD:
{{tekst}}

# NIET IN BEELD:
{{niet}}

# FORMAAT:
{{formaat}}$tpl$,
  'context',
  'image',
  true,
  40
)
ON CONFLICT (name) DO UPDATE SET
  description = EXCLUDED.description,
  strength = EXCLUDED.strength,
  use_cases = EXCLUDED.use_cases,
  follow_up_questions = EXCLUDED.follow_up_questions,
  template = EXCLUDED.template,
  family = EXCLUDED.family,
  modality = EXCLUDED.modality,
  is_active = EXCLUDED.is_active,
  sort_order = EXCLUDED.sort_order;
