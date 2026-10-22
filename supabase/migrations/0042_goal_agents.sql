-- 0042_goal_agents.sql
-- Agent in "Wat wil je maken?" bouwt voortaan een /goal-opdracht in plaats van
-- een ReAct-prompt.
--
-- Een codeeragent met een goal-modus (zoals /goal in Claude Code) werkt zelf
-- door tot het doel bereikt is. Dat gaat alleen goed met vier vaste onderdelen:
-- de taak, een controleerbare succesvoorwaarde, wat niet mag veranderen, en een
-- grens aan het werk. De uitkomst is één regel die met /goal begint, zodat de
-- gebruiker hem plakt en het doel meteen actief is.
--
-- De generator dwingt die vorm af met de structuur 'goal' (structureFormat in
-- src/lib/techniques.ts, GOAL_STRUCTURE_INSTRUCTION in optimize-prompt); de
-- client zet /goal ervoor als het model het weglaat.
--
-- ReAct (Agents) gaat uit, niet weg: opgeslagen prompts verwijzen er nog naar.
--
-- Idempotent: ON CONFLICT (name).

UPDATE techniques SET is_active = FALSE WHERE name IN ('ReAct (Agents)', 'REACT');

INSERT INTO techniques (name, description, strength, use_cases, follow_up_questions, template, family, modality, is_active, sort_order)
VALUES (
  'Goal (Agents)',
  'Bouwt een /goal-opdracht voor een AI-agent die zelfstandig doorwerkt tot het doel bereikt is. Vier onderdelen maken het doel toetsbaar en begrensd: de taak, een controleerbare succesvoorwaarde, wat niet mag veranderen en een grens aan het werk.',
  'Kies dit wanneer een agent zelfstandig een taak in stappen moet uitvoeren, bijvoorbeeld in een codeertool met een goal-modus. TAAK zegt wat er gebouwd of opgelost wordt. SUCCES is een commando, test of zichtbaar resultaat dat bewijst dat het af is, geen gevoel als "het werkt". SCOPE legt vast wat onaangeroerd blijft. GRENS houdt het werk begrensd: een maximum aantal beurten, of stoppen en vragen bij een blokkade. De uitkomst begint altijd met /goal.',
  $json$[
    "Een agent een fout laten oplossen tot de tests weer slagen.",
    "Een agent een functie laten bouwen met een controleerbaar eindpunt.",
    "Een agent laten doorwerken zonder dat hij buiten zijn terrein komt."
  ]$json$::jsonb,
  $json$[
    {
      "id": "taak",
      "label": "TAAK: wat moet er gebouwd of opgelost worden?",
      "placeholder": "Bijvoorbeeld: los de fout op waardoor de export alle rijen bevat in plaats van alleen de gefilterde."
    },
    {
      "id": "succes",
      "label": "SUCCES: aan welk commando, welke test of welk zichtbaar resultaat zie je dat het af is?",
      "placeholder": "Iets controleerbaars, geen gevoel. Bijvoorbeeld: npm test eindigt met exitcode 0. Of: GET /api/export geeft status 200 met alleen de gefilterde rijen."
    },
    {
      "id": "scope",
      "label": "SCOPE: wat mag er niet veranderen?",
      "placeholder": "Bijvoorbeeld: niets buiten src/export/ aanpassen. Of: de database-migraties blijven ongemoeid."
    },
    {
      "id": "grens",
      "label": "GRENS: hoeveel beurten maximaal, of wanneer moet de agent stoppen en vragen?",
      "placeholder": "Bijvoorbeeld: stop na 20 beurten. Of: stop en vraag het als je vastloopt."
    }
  ]$json$::jsonb,
  '/goal {{taak}}. Success: {{succes}}. Scope: {{scope}}. {{grens}}.',
  'context',
  'agent',
  TRUE,
  18
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
