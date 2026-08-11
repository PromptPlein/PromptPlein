-- 0032 — De projectanalyse bewaren op de projectrij.
--
-- WAT DIT IS
-- Wie een prompt bouwt met een aangehaakt project, laat dat project eerst
-- analyseren (mode 'project-brief' in de edge function optimize-prompt). Die
-- analyse is een vaste samenvatting van het project: wat het is, voor wie,
-- welke toon, welke vaste termen, welke grenzen. Zij vervangt daarna het ruwe
-- projectmateriaal in élke AI-stap van de bouwer.
--
-- WAAROM HIJ IN DE DATABASE STAAT EN NIET IN HET GEHEUGEN
-- De analyse kost een aanroep met het sterkste model over maximaal 20.000
-- tekens. Zonder bewaarplek betaal je die bij elke prompt opnieuw, en bij elke
-- pagina-herlaad, en op elk apparaat. Hij hangt aan het PROJECT en niet aan de
-- sessie, dus hoort hij op de projectrij: één analyse per projectversie, daarna
-- gratis voor elke volgende prompt, ook morgen en ook op de telefoon.
--
-- WAAROM EEN MAP EN GEEN ENKELE KOLOM
-- Het bronmateriaal verschilt per keuze van de gebruiker: alleen de
-- projectinstructie, of de instructie mét de bronbestanden erbij. Dat zijn twee
-- verschillende teksten en dus twee verschillende analyses. De sleutel is een
-- hash van het materiaal dat erin ging; zo is een gewijzigde instructie
-- automatisch een misser (en geen stille, verouderde analyse) en kan de
-- schakelaar "bronbestanden mee" heen en weer zonder elke keer opnieuw te
-- betalen. De client houdt de map klein (zie writeBrief in
-- src/services/chatProjectService.ts).
--
-- Vorm: { "<hash>": { "brief": "<tekst>", "at": "<iso-tijdstip>" } }
--
-- RLS: er komt geen nieuwe policy bij. De owner-policies uit migratie 0030
-- gelden op rijniveau en dekken deze kolom dus mee — de eigenaar leest en
-- schrijft zijn eigen analyse, niemand anders ziet hem.

ALTER TABLE public.chat_projects
  ADD COLUMN IF NOT EXISTS generator_briefs JSONB NOT NULL DEFAULT '{}'::jsonb;

COMMENT ON COLUMN public.chat_projects.generator_briefs IS
  'Gecachete projectanalyses voor de promptbouwer, gesleuteld op een hash van het bronmateriaal: {"<hash>":{"brief":"…","at":"<iso>"}}. Geschreven door de client na mode project-brief.';

-- Vangnet tegen een map die door een fout blijft groeien: de client bewaart er
-- hoogstens een handvol, maar een rij van megabytes zou elke projectquery
-- vertragen. 64 kB is ruim tien analyses van maximale lengte.
ALTER TABLE public.chat_projects
  DROP CONSTRAINT IF EXISTS chat_projects_generator_briefs_size;

ALTER TABLE public.chat_projects
  ADD CONSTRAINT chat_projects_generator_briefs_size
  CHECK (pg_column_size(generator_briefs) <= 65536);

-- De analyse bewaren is GEEN wijziging van het project.
--
-- `touch_chat_project` (migratie 0030) zette `updated_at` bij elke UPDATE. Dat
-- klopte toen alleen de gebruiker de rij kon wijzigen, maar nu schrijft de app
-- er ook een cache in: een project aanhaken in de bouwer zou het dan bovenaan de
-- projectenlijst zetten ("recentst bijgewerkt eerst") en eruitzien alsof de
-- gebruiker zijn instructie had aangepast. `updated_at` hoort te betekenen: de
-- eigenaar heeft hier iets veranderd. Vandaar dat alleen naam en instructie hem
-- nog vooruitzetten.
CREATE OR REPLACE FUNCTION public.touch_chat_project()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
BEGIN
  IF NEW.name IS DISTINCT FROM OLD.name
     OR NEW.instructions IS DISTINCT FROM OLD.instructions THEN
    NEW.updated_at := NOW();
  ELSE
    NEW.updated_at := OLD.updated_at;
  END IF;
  RETURN NEW;
END;
$$;
