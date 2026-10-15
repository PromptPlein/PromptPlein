-- 0041_prompts_eigen_rij_zichtbaar.sql
-- Gewone gebruikers konden geen prompt opslaan; alleen admins wel.
--
-- De client voegt een prompt toe met insert(...).select('*'), dus met RETURNING.
-- Dan moet de nieuwe rij ook door de leespolicy. Die riep alleen
-- private.can_see_prompt(id) aan, en die functie zoekt de prompt opnieuw op in
-- de tabel. Een rij die in hetzelfde statement wordt ingevoegd, ziet zo'n
-- STABLE-functie nog niet. De eigenaarscheck faalde dus, de insert gaf 42501
-- ("new row violates row-level security policy") en alleen is_admin() redde
-- het voor beheerders.
--
-- De oplossing: de eigenaarscheck staat ook direct op de rij zelf, zodat hij
-- de nieuwe rij beoordeelt in plaats van een opzoeking in de tabel.

DROP POLICY IF EXISTS prompts_read ON public.prompts;
CREATE POLICY prompts_read ON public.prompts
  FOR SELECT
  USING (
    created_by_user = (SELECT auth.uid())
    OR private.can_see_prompt(id)
  );
