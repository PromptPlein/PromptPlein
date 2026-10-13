-- 0035_skill_creator.sql
-- De Skill Creator op /technieken.
--
-- Geen prompt voor één opdracht, maar een skill: één vaste instructie die de
-- medewerker in zijn eigen AI-omgeving plakt (een Mistral-agent, een
-- projectinstructie, een ander pakket), waarna de AI elke invoer op dezelfde
-- manier afhandelt. Dezelfde tekst is ook als SKILL.md te downloaden.
--
-- De bouwer stelt zijn eigen vragen (src/components/optimizer/SkillBuilder.tsx),
-- dus follow_up_questions blijft leeg; zie SELF_DIRECTED_BUILDERS in
-- src/lib/techniques.ts. De techniek wordt op naam herkend ("skill"), en hoort
-- niet in de techniekkeuze van /genereren (isSkillCreator).
--
-- Idempotent: ON CONFLICT (name) werkt de bestaande rij bij.

INSERT INTO techniques (name, description, strength, use_cases, follow_up_questions, template, family, is_active, sort_order)
VALUES (
  'Skill Creator',
  'Maak een skill: één vaste instructie die je in je eigen AI-omgeving plakt, zodat de AI elke invoer op dezelfde manier afhandelt.',
  'Sterk wanneer je de AI steeds hetzelfde uitlegt. De bouwer haalt op wat de AI zonder skill niet weet, zoals jullie afspraken, valkuilen en grenzen, en test of de beschrijving precies de juiste verzoeken dekt.',
  '[
    "Gebruik dit wanneer feedback op stukken elke keer volgens hetzelfde kader moet.",
    "Gebruik dit wanneer je een vaste werkwijze wilt delen met collega''s via een agent of projectinstructie.",
    "Gebruik dit wanneer je een SKILL.md nodig hebt voor een omgeving die Agent Skills leest."
  ]'::jsonb,
  '[]'::jsonb,
  E'Schrijf een skill: één vaste instructie die een AI bij elke nieuwe invoer op dezelfde manier laat werken.\nDe antwoorden uit de Skill Creator bepalen de inhoud van de secties wanneer, kennis, werkwijze, grenzen, uitvoer en ontbrekende invoer.',
  'technique',
  TRUE,
  64
)
ON CONFLICT (name) DO UPDATE SET
  description         = EXCLUDED.description,
  strength            = EXCLUDED.strength,
  use_cases           = EXCLUDED.use_cases,
  follow_up_questions = EXCLUDED.follow_up_questions,
  template            = EXCLUDED.template,
  family              = EXCLUDED.family,
  is_active           = EXCLUDED.is_active,
  sort_order          = EXCLUDED.sort_order;
