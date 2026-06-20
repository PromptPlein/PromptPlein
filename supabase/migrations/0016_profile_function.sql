-- Koppel een gebruikersprofiel aan een functie (vakgebied/beroep), zodat
-- collega's met dezelfde functie elkaars prompts makkelijker terugvinden.
-- De 'roles'-tabel bevat technisch deze functies (beleidsadviseur, jurist, …);
-- in de UI heet dit voortaan "Functie".

ALTER TABLE profiles
  ADD COLUMN IF NOT EXISTS function_id UUID
    REFERENCES roles(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_profiles_function ON profiles(function_id);
