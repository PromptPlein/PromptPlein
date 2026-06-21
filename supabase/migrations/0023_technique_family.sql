-- 0023_technique_family.sql
-- Voegt het `family`-veld toe aan `techniques` zodat een beheerder per techniek
-- expliciet kan aangeven of het een losse PROMPTTECHNIEK is of een compleet
-- PROMPT FRAMEWORK (raamwerk dat de hele prompt structureert).
--
-- Tot nu toe leunde de groepering op een hardcoded namenlijst in
-- src/lib/techniques.ts (isContextPrompt). Met dit veld kan de admin het zelf
-- instellen via "Technieken beheren"; de namenlijst blijft alleen nog een
-- fallback voor records waar `family` (nog) niet is ingevuld.
--
--   family = 'context'   -> prompt framework (CARE, CRISPE, RAISE, CO-STAR, …)
--   family = 'technique' -> losse prompttechniek (Persona, Chain-of-Thought, …)
--
-- Default 'technique', zodat nieuwe records standaard een losse techniek zijn.

ALTER TABLE techniques
  ADD COLUMN IF NOT EXISTS family TEXT NOT NULL DEFAULT 'technique'
  CHECK (family IN ('context', 'technique'));

-- Backfill: zet de bekende prompt frameworks op 'context'. Komt overeen met de
-- fallbacklijst in src/lib/techniques.ts (CONTEXT_PROMPT_NAMES).
UPDATE techniques
SET family = 'context'
WHERE lower(trim(name)) IN (
  'crisp', 'crispe', 'care', 'raise', 'co-star', 'craft', 'create', 'react'
);
