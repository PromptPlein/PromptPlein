-- 0061: de projectanalyse van de bouwer bewaren op de projectrij.
--
-- Migratie 0032 deed dit al, maar is nooit op de database uitgevoerd: de kolom
-- generator_briefs bestond niet, dus de client kon de analyse niet bewaren en
-- maakte hem bij elke sessie opnieuw. 0032 nu alsnog draaien kan niet, want die
-- vervangt touch_chat_project door een versie van vóór de bewaartermijn (0051,
-- 0053). Deze migratie neemt alleen de kolom en de grens over, en laat de trigger
-- de cache negeren.
--
-- Vorm: { "<hash>": { "brief": "<tekst>", "at": "<iso-tijdstip>" } }
-- RLS: de owner-policies uit 0030 gelden op rijniveau en dekken de kolom mee.

ALTER TABLE public.chat_projects
  ADD COLUMN IF NOT EXISTS generator_briefs JSONB NOT NULL DEFAULT '{}'::jsonb;

COMMENT ON COLUMN public.chat_projects.generator_briefs IS
  'Bewaarde projectanalyses voor de promptbouwer, gesleuteld op een hash van het bronmateriaal: {"<hash>":{"brief":"…","at":"<iso>"}}. Geschreven door de client na mode project-brief.';

-- Vangnet tegen een map die door een fout blijft groeien; de client bewaart er
-- hoogstens een handvol.
ALTER TABLE public.chat_projects
  DROP CONSTRAINT IF EXISTS chat_projects_generator_briefs_size;

ALTER TABLE public.chat_projects
  ADD CONSTRAINT chat_projects_generator_briefs_size
  CHECK (pg_column_size(generator_briefs) <= 65536);

-- Een analyse bewaren is geen wijziging van het project en ook geen gebruik:
-- updated_at (volgorde in de zijbalk) en last_used_at (bewaartermijn) blijven
-- staan. Verder gelijk aan de versie uit 0053.
CREATE OR REPLACE FUNCTION public.touch_chat_project()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
BEGIN
  IF (to_jsonb(NEW) - ARRAY['last_used_at', 'updated_at', 'files_warned_at', 'generator_briefs'])
     = (to_jsonb(OLD) - ARRAY['last_used_at', 'updated_at', 'files_warned_at', 'generator_briefs']) THEN
    NEW.updated_at := OLD.updated_at;
    IF NEW.last_used_at > OLD.last_used_at THEN
      NEW.files_warned_at := NULL;
    END IF;
    RETURN NEW;
  END IF;
  NEW.updated_at := NOW();
  NEW.last_used_at := NOW();
  NEW.files_warned_at := NULL;
  RETURN NEW;
END;
$$;
