-- 0027_behavior_logs.sql
-- Gedetailleerde gedragslog voor de prompt-bouwer, naast de grofmazige
-- analytics_events. Elke rij is één fijnmazige actie in een sessie (een run van
-- de plan-wizard): plan opgesteld, stap gestart, veld ingevuld, analyse gedraaid,
-- hiaat getoond, interview-vraag/antwoord, document geüpload, persona ingevuld,
-- stap vastgelegd, opnieuw gedaan, samengesteld, uitgevoerd, afgebroken. Zo is
-- het VERLOOP van een gebruiker te reconstrueren en te exporteren voor AI-analyse.

CREATE TABLE IF NOT EXISTS behavior_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  -- Groepeert alle acties van één plan-wizard-run (client-gegenereerde id).
  session_id TEXT NOT NULL,
  -- Volgorde binnen de sessie (1, 2, 3, …), zodat het verloop reconstrueerbaar is.
  sequence INTEGER NOT NULL DEFAULT 0,
  -- Wie deed het (naam/e-mail van de ingelogde gebruiker; leeg = onbekend).
  user_identifier TEXT,
  -- Het soort actie, bijv. 'plan_generated', 'step_started', 'interview_answer'.
  action TEXT NOT NULL,
  -- Optioneel: op welke stap (index in het plan) de actie sloeg.
  step_index INTEGER,
  -- Optioneel: de betrokken techniek.
  technique_id UUID REFERENCES techniques(id) ON DELETE SET NULL,
  -- Actie-specifieke details (aantal hiaten, interview-beurt, tekenaantallen,
  -- provider, duur in ms, doel-tekst, enz.).
  metadata JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indices: opvragen per sessie (in volgorde) en filteren op actie/tijd.
CREATE INDEX IF NOT EXISTS idx_behavior_logs_session ON behavior_logs(session_id, sequence);
CREATE INDEX IF NOT EXISTS idx_behavior_logs_created ON behavior_logs(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_behavior_logs_action ON behavior_logs(action);

-- RLS: iedereen mag loggen (net als analytics_events); alleen beheerders lezen.
ALTER TABLE behavior_logs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "behavior_insert_any" ON behavior_logs;
CREATE POLICY "behavior_insert_any" ON behavior_logs
  FOR INSERT WITH CHECK (true);

DROP POLICY IF EXISTS "behavior_admin_read" ON behavior_logs;
CREATE POLICY "behavior_admin_read" ON behavior_logs
  FOR SELECT TO authenticated USING (private.is_admin());

DROP POLICY IF EXISTS "behavior_admin_delete" ON behavior_logs;
CREATE POLICY "behavior_admin_delete" ON behavior_logs
  FOR DELETE TO authenticated USING (private.is_admin());

COMMENT ON TABLE behavior_logs IS
  'Fijnmazige gedragslog van de prompt-bouwer (per sessie/stap), voor analyse en AI-verbetering.';
