-- Functie-aanvragen: een gebruiker kan een ontbrekende functie aanvragen.
-- De aanvraag komt in een wachtrij; een admin keurt hem goed of af. Bij
-- goedkeuring voegt de applicatie de functie toe aan de roles-tabel.
--
-- Status: 'pending' (wacht op beoordeling) → 'approved' / 'rejected'.

CREATE TABLE IF NOT EXISTS function_requests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  -- Optionele toelichting van de aanvrager (waarom / wat houdt de functie in).
  motivation TEXT,
  status TEXT NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'approved', 'rejected')),
  requested_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  reviewed_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  reviewed_at TIMESTAMPTZ,
  review_note TEXT,
  -- Verwijst naar de aangemaakte roles-rij zodra de aanvraag is goedgekeurd.
  created_role_id UUID REFERENCES roles(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_function_requests_status ON function_requests(status);
CREATE INDEX IF NOT EXISTS idx_function_requests_requested_by ON function_requests(requested_by);

ALTER TABLE function_requests ENABLE ROW LEVEL SECURITY;

-- Een gebruiker ziet zijn eigen aanvragen; admins zien alles.
DROP POLICY IF EXISTS function_requests_select ON function_requests;
CREATE POLICY function_requests_select ON function_requests
  FOR SELECT TO authenticated
  USING (requested_by = (SELECT auth.uid()) OR private.is_admin());

-- Ingelogde gebruikers mogen namens zichzelf een aanvraag indienen.
DROP POLICY IF EXISTS function_requests_insert_own ON function_requests;
CREATE POLICY function_requests_insert_own ON function_requests
  FOR INSERT TO authenticated
  WITH CHECK (requested_by = (SELECT auth.uid()));

-- Alleen admins beoordelen (goedkeuren/afwijzen) aanvragen.
DROP POLICY IF EXISTS function_requests_admin_update ON function_requests;
CREATE POLICY function_requests_admin_update ON function_requests
  FOR UPDATE TO authenticated
  USING (private.is_admin()) WITH CHECK (private.is_admin());

-- Alleen admins mogen aanvragen verwijderen (opruimen).
DROP POLICY IF EXISTS function_requests_admin_delete ON function_requests;
CREATE POLICY function_requests_admin_delete ON function_requests
  FOR DELETE TO authenticated
  USING (private.is_admin());
