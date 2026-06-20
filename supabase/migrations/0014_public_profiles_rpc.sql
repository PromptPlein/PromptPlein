-- Community-hardening: vervang de SECURITY DEFINER views door advisor-veilige
-- alternatieven (Supabase linter flagt security_definer_view als ERROR).
--
-- 1. prompt_like_counts → security_invoker = on. De onderliggende tabel
--    prompt_likes heeft al een publieke SELECT-policy, dus de view hoeft niet
--    de rechten van de eigenaar te gebruiken.
--
-- 2. public_profiles (view) → vervangen door een SECURITY DEFINER FUNCTIE die
--    bewust alleen niet-gevoelige kolommen (id, naam, organisatie) teruggeeft.
--    Zo kan e-mail technisch niet lekken: de functie selecteert die kolom nooit,
--    terwijl de strikte RLS op de profiles-tabel intact blijft.

-- 1. Like-tellingen: invoker-rechten -------------------------------------

ALTER VIEW prompt_like_counts SET (security_invoker = on);

-- 2. Publieke auteursgegevens via RPC ------------------------------------

-- De oude view is niet meer nodig.
DROP VIEW IF EXISTS public_profiles;

-- Geef de publieke (niet-gevoelige) profielvelden terug voor een set ids.
-- SECURITY DEFINER zodat de strikte profiles-RLS niet in de weg zit, maar de
-- functie exposeert uitsluitend id + naam + organisatie.
CREATE OR REPLACE FUNCTION public.get_public_profiles(p_ids UUID[])
RETURNS TABLE (id UUID, full_name TEXT, organization_id UUID)
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
  SELECT p.id, p.full_name, p.organization_id
  FROM profiles p
  WHERE p.is_active = TRUE
    AND p.id = ANY(p_ids);
$$;

GRANT EXECUTE ON FUNCTION public.get_public_profiles(UUID[]) TO anon, authenticated;
