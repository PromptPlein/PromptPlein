-- Storage-bucket voor organisatielogo's.
-- Logo's worden client-side bijgesneden en verkleind naar een vast vierkant
-- formaat voordat ze hierheen worden geüpload, zodat ze in het organogram
-- altijd uniform getoond worden.

-- 1. Bucket aanmaken (publiek leesbaar zodat <img>/SVG de logo's kan laden).
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'org-logos',
  'org-logos',
  TRUE,
  2097152, -- 2 MB ruime bovengrens; het geoptimaliseerde bestand is veel kleiner
  ARRAY['image/png', 'image/webp', 'image/jpeg', 'image/svg+xml']
)
ON CONFLICT (id) DO UPDATE
  SET public = EXCLUDED.public,
      file_size_limit = EXCLUDED.file_size_limit,
      allowed_mime_types = EXCLUDED.allowed_mime_types;

-- 2. RLS-policies op storage.objects voor deze bucket.
--    Iedereen mag lezen; alleen admins/super_admins mogen schrijven.
DROP POLICY IF EXISTS "org_logos_read" ON storage.objects;
CREATE POLICY "org_logos_read" ON storage.objects
  FOR SELECT USING (bucket_id = 'org-logos');

DROP POLICY IF EXISTS "org_logos_insert_admin" ON storage.objects;
CREATE POLICY "org_logos_insert_admin" ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'org-logos' AND private.is_admin());

DROP POLICY IF EXISTS "org_logos_update_admin" ON storage.objects;
CREATE POLICY "org_logos_update_admin" ON storage.objects
  FOR UPDATE TO authenticated
  USING (bucket_id = 'org-logos' AND private.is_admin())
  WITH CHECK (bucket_id = 'org-logos' AND private.is_admin());

DROP POLICY IF EXISTS "org_logos_delete_admin" ON storage.objects;
CREATE POLICY "org_logos_delete_admin" ON storage.objects
  FOR DELETE TO authenticated
  USING (bucket_id = 'org-logos' AND private.is_admin());
