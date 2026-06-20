-- 0012_technique_strength.sql
-- Voegt metadata toe aan technieken zodat de slimme aanbeveling beter kan
-- analyseren waar elke techniek sterk in is en waarvoor je hem gebruikt.

ALTER TABLE techniques
  ADD COLUMN IF NOT EXISTS strength TEXT,
  ADD COLUMN IF NOT EXISTS use_cases JSONB DEFAULT '[]'::jsonb;

COMMENT ON COLUMN techniques.strength IS 'De kracht van de techniek — voedt de AI-techniekaanbeveling.';
COMMENT ON COLUMN techniques.use_cases IS 'Lijst met concrete gebruikssituaties (JSON-array van strings).';
