-- 0037_vibecode_nieuw_project.sql
-- Code, Nieuw project: van "klein hulpmiddel" naar een echt projectframework
-- met doelen, toetsbare klaar-criteria en een werklus.
--
-- Vibecode (Nieuwe tool) uit 0036 was gebouwd voor één bestand in één chatbeurt:
-- doel, invoer en uitvoer, vorm, grenzen, een zelfcontrole. Voor een nieuw
-- project is dat te weinig. Wat ontbrak, op basis van de huidige richtlijnen
-- van Anthropic (prompting best practices voor de 5-modellen, /goal in Claude
-- Code, Outcomes in Managed Agents, "Effective harnesses for long-running
-- agents") en de Codex-gids van OpenAI, geraadpleegd 13-10-2026:
--
--   * Wat er NIET gebouwd wordt (BUITEN SCOPE). Nieuwere modellen breiden de
--     scope anders uit zichzelf uit.
--   * Klaar-criteria als losse, controleerbare beweringen (KLAAR ALS), niet als
--     "het werkt goed". Een beoordelaar, mens of model, kan alleen iets
--     toetsbaars toetsen.
--   * Een werklus (AANPAK): eerst een skelet dat start, dan één functie
--     tegelijk, na elke functie de checks draaien en de uitvoer laten zien,
--     voortgang in een featurelijst en een voortgangsbestand in plaats van in
--     het geheugen van het model.
--   * Wanneer stoppen en wanneer vragen (STOPPEN).
--
-- TWEE SPOREN IN AANPAK. AIPromptHub haalde in 0057 de agent-lus weg omdat de
-- meeste mensen hun codeprompt in een chat plakken, waar een model niets kan
-- draaien en dan een testresultaat verzint of alleen een plan levert. Hier
-- blijft de lus wél staan, met een voorwaarde: kan de assistent commando's
-- uitvoeren, dan draait en toont hij de checks; kan hij dat niet, dan levert
-- hij per antwoord één afgerond onderdeel met de exacte checks en zegt hij dat
-- hij niets heeft gedraaid. Zo werkt dezelfde prompt in Claude Code, Codex of
-- Mistral Vibe én in een gewone chat.
--
-- GEEN NADRUK. Geen hoofdletters als stijlmiddel, geen "MOET" of "NOOIT" in de
-- teksten: nieuwere modellen volgen instructies precies en gaan bij nadruk
-- overreageren. De koppen staan in hoofdletters omdat de letterrail en de
-- generator ze zo herkennen, niet als nadruk. Geen voorgeschreven stappenplan
-- voor de bouw zelf: alleen doel, grenzen, criteria en de lus.
--
-- De rij wordt hernoemd naar Vibecode (Nieuw project), gelijk aan de knop.
-- Vibecode (Bestaande code) krijgt dezelfde tweesporenregel in KWALITEITSLAT.

UPDATE techniques SET name = 'Vibecode (Nieuw project)' WHERE name = 'Vibecode (Nieuwe tool)';

UPDATE techniques SET
  description = 'Opdrachtraamwerk om met AI een nieuw project te laten bouwen: een webapplicatie, een hulpmiddel of een script dat er nog niet is. Acht blokken leggen vast wat het doel is, wat het moet kunnen, wat vastligt, wat er niet in komt, wanneer het klaar is, hoe de assistent werkt, wanneer hij stopt en wat hij oplevert.',
  strength = 'Kies dit wanneer een medewerker iets nieuws wil laten bouwen, zonder bestaande code. DOEL en FUNCTIES beschrijven het resultaat en niet de route, zodat het model zelf de beste aanpak kiest. VASTE KEUZES en BUITEN SCOPE begrenzen het werk, want een model breidt de scope anders zelf uit. KLAAR ALS maakt het resultaat toetsbaar met losse, controleerbare criteria. AANPAK geeft de werklus: eerst een skelet dat start, dan één functie tegelijk, na elke functie de checks draaien en de uitvoer tonen, met de voortgang in een featurelijst. Dat werkt in een codeertool en, met een terugvalregel, ook in een gewone chat. Kies dit niet voor werk in bestaande code (dat is Vibecode (Bestaande code)), niet voor een dashboard (BLUEPRINT) en niet voor een tekst.',
  use_cases = '[
    "Een nieuwe webapplicatie of interne tool laten bouwen in Claude Code, Codex, Mistral Vibe of een chat.",
    "Een hulpmiddel laten maken dat een export inleest, gegevens bewerkt en een overzicht oplevert.",
    "Een script laten schrijven dat een terugkerende klus automatiseert, met tests erbij.",
    "Een idee uitwerken tot een bouwopdracht met duidelijke klaar-criteria, voor een AI of een ontwikkelaar."
  ]'::jsonb,
  follow_up_questions = '[
    {
      "id": "doel",
      "label": "DOEL — wat bouw je, voor wie, en wat maakt het mogelijk?",
      "placeholder": "Bijvoorbeeld: een webpagina voor teamleiders die de export uit het zaaksysteem inleest, zodat ze per afdeling zien welke zaken over de termijn dreigen te gaan. Nu tellen ze dat elke maandag met de hand."
    },
    {
      "id": "functies",
      "label": "FUNCTIES — wat moet het kunnen? Noem de belangrijkste dingen die een gebruiker ermee doet.",
      "placeholder": "Bijvoorbeeld: een CSV uploaden; per afdeling het aantal open zaken en het aantal over de termijn zien; filteren op afdeling; de lijst met zaken over de termijn downloaden."
    },
    {
      "id": "vaste_keuzes",
      "label": "VASTE KEUZES — wat ligt al vast? Denk aan de techniek, waar het draait en wat het gebruikt.",
      "placeholder": "Bijvoorbeeld: één HTML-bestand met JavaScript, zonder server, opent in Edge. Of: Python 3.12 met alleen de standaardbibliotheek. Laat leeg als de assistent dit mag kiezen."
    },
    {
      "id": "buiten_scope",
      "label": "BUITEN SCOPE — wat bouw je bewust niet, in elk geval niet in deze versie?",
      "placeholder": "Bijvoorbeeld: geen inlog, geen koppeling met het zaaksysteem zelf, geen opslag van geuploade bestanden, geen grafieken."
    },
    {
      "id": "klaar_als",
      "label": "KLAAR ALS — wanneer is het af? Schrijf controleerbare zinnen: wat doe je, en wat zie je dan.",
      "placeholder": "Bijvoorbeeld: met het voorbeeldbestand van 200 zaken toont de pagina 4 afdelingen met de juiste aantallen; een bestand met een ontbrekende kolom geeft een melding welke kolom ontbreekt; de download bevat alleen de zaken over de termijn."
    },
    {
      "id": "werkomgeving",
      "label": "WERKOMGEVING — waar laat je het bouwen? (optioneel)",
      "placeholder": "Bijvoorbeeld: in Claude Code, in Codex, in Mistral Vibe, of in een gewone chat. Laat leeg als je het nog niet weet."
    }
  ]'::jsonb,
  template = E'# DOEL:\n{{doel}}\n\n# FUNCTIES:\n{{functies}}\n\n# VASTE KEUZES:\n{{vaste_keuzes}}\nGebruik verzonnen voorbeelddata in code, tests en voorbeelden; echte gegevens koppelt de gebruiker later zelf aan. Bewaar wachtwoorden en API-sleutels buiten de code, in een configuratiebestand dat niet wordt gedeeld. Kies een externe dienst, CDN of extra bibliotheek alleen als het zonder niet kan, en noem dan welke en waarom. Maak de interface Nederlandstalig en toegankelijk volgens WCAG 2.1 AA.\n\n# BUITEN SCOPE:\n{{buiten_scope}}\nIdeeën buiten deze grens noem je aan het eind als suggestie, je bouwt ze niet.\n\n# KLAAR ALS:\n{{klaar_als}}\nElk criterium is een controleerbare bewering. Het project is klaar als ze allemaal aantoonbaar gelden.\n\n# AANPAK:\n{{werkomgeving}}\nZet eerst een skelet neer dat start, met een korte uitleg hoe je het opent. Leg een featurelijst aan met elke functie en elk criterium uit KLAAR ALS, met per regel de status. Bouw daarna één functie tegelijk en werk de featurelijst bij.\nKun je commando''s uitvoeren, zoals in Claude Code, Codex of Mistral Vibe: draai na elke functie de checks (tests, typecheck, build of de app zelf), laat de uitvoer zien, commit, en houd in een voortgangsbestand bij wat af is en wat de volgende stap is. Werk je in een chat zonder uitvoering: lever per antwoord één afgerond onderdeel met de volledige code, geef de exacte checks en de uitkomst die je verwacht, en zeg dat je ze niet zelf hebt gedraaid.\n\n# STOPPEN:\nStop als elk criterium onder KLAAR ALS aantoonbaar gehaald is. Neem kleine beslissingen zelf en noem ze in de oplevering. Vraag de gebruiker alleen iets bij een onomkeerbare actie, een wijziging van de scope of informatie die alleen de gebruiker heeft. Loopt een onderdeel vast, maak dan de rest af en zeg wat er ontbreekt.\n\n# OPLEVERING:\nSluit af met de stand per criterium uit KLAAR ALS (gehaald, of niet gecontroleerd en waarom), de beslissingen die je zelf nam, en een uitleg in hooguit drie stappen hoe iemand die geen programmeur is het project start.\n\n---\n\nWerk de blokken hierboven uit tot één opdracht die de gebruiker in een codeerassistent of chat plakt om het project te laten bouwen. Schrijf in de gebiedende wijs, gericht aan de assistent:\n{{PROMPT}}'
WHERE name = 'Vibecode (Nieuw project)';

-- Vibecode (Bestaande code): dezelfde tweesporenregel, en bijvangst als suggestie.
UPDATE techniques SET
  strength = replace(replace(strength, 'een BESTAANDE codebase', 'een bestaande codebase'), 'Vibecode (Nieuwe tool)', 'Vibecode (Nieuw project)'),
  template = replace(
    template,
    E'# KWALITEITSLAT:\nControleer voor je oplevert: wat onder DOEL staat gebeurt echt, ook bij de randgevallen; de oorzaak is opgelost; alles onder BLIJFT ZO klopt nog; de wijziging volgt de stijl van de code eromheen. Noem wat je niet zelf hebt kunnen draaien of testen.',
    E'# KWALITEITSLAT:\nKlaar is: wat onder DOEL staat gebeurt echt, ook bij de randgevallen; de oorzaak is opgelost; alles onder BLIJFT ZO klopt nog; de wijziging volgt de stijl van de code eromheen. Kun je commando''s uitvoeren, draai dan de tests, typecheck en build en laat de uitvoer zien. Kun je dat niet, geef dan de exacte commando''s met de uitkomst die je verwacht en zeg dat je ze niet zelf hebt gedraaid. Andere problemen die je onderweg tegenkomt noem je aan het eind als suggestie, je lost ze niet ongevraagd op.'
  )
WHERE name = 'Vibecode (Bestaande code)';

-- Faalt hard als de vervanging niet aansloeg, zodat de migratie niet stil niets doet.
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM techniques WHERE name = 'Vibecode (Nieuw project)' AND template LIKE '%# STOPPEN:%') THEN
    RAISE EXCEPTION 'Vibecode (Nieuw project) is niet bijgewerkt';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM techniques WHERE name = 'Vibecode (Bestaande code)' AND template LIKE '%Kun je commando''s uitvoeren%') THEN
    RAISE EXCEPTION 'KWALITEITSLAT van Vibecode (Bestaande code) is niet bijgewerkt';
  END IF;
END $$;
