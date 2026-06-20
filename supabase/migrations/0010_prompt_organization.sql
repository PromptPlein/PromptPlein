-- Koppel prompts aan een organisatie (ministerie / afdeling / dienstonderdeel).
-- Maakt het mogelijk om vanuit het organogram (netwerkverkenner) direct naar de
-- prompts van een specifieke organisatie te filteren in geavanceerd zoeken.

ALTER TABLE prompts
  ADD COLUMN IF NOT EXISTS organization_id UUID
    REFERENCES organizations(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_prompts_organization ON prompts(organization_id);
