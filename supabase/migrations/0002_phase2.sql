-- Overheid Prompt Library — Phase 2 schema-uitbreidingen

-- 1. Sorteer-/statusvelden op reference-data (mutable in Phase 2)
ALTER TABLE roles ADD COLUMN IF NOT EXISTS sort_order INTEGER DEFAULT 0;
ALTER TABLE categories ADD COLUMN IF NOT EXISTS sort_order INTEGER DEFAULT 0;
ALTER TABLE techniques ADD COLUMN IF NOT EXISTS sort_order INTEGER DEFAULT 0;
ALTER TABLE techniques ADD COLUMN IF NOT EXISTS is_active BOOLEAN DEFAULT TRUE;

-- 2. Analytics
CREATE TABLE IF NOT EXISTS analytics_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  event_type TEXT NOT NULL,
  user_identifier TEXT,
  prompt_id UUID REFERENCES prompts(id) ON DELETE SET NULL,
  technique_id UUID REFERENCES techniques(id) ON DELETE SET NULL,
  metadata JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 3. Deel-links (email shares)
CREATE TABLE IF NOT EXISTS email_shares (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  prompt_id UUID REFERENCES prompts(id) ON DELETE CASCADE,
  share_token UUID NOT NULL UNIQUE,
  shared_by TEXT,
  shared_at TIMESTAMPTZ DEFAULT NOW(),
  view_count INTEGER DEFAULT 0,
  expires_at TIMESTAMPTZ
);

-- 4. Techniek-templates (meerdere varianten per techniek)
CREATE TABLE IF NOT EXISTS technique_templates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  technique_id UUID REFERENCES techniques(id) ON DELETE CASCADE,
  template_name TEXT NOT NULL,
  template_content TEXT NOT NULL,
  created_by TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 5. Admin audit-log
CREATE TABLE IF NOT EXISTS admin_audit_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  admin_email TEXT,
  action TEXT NOT NULL,
  entity_type TEXT NOT NULL,
  entity_id TEXT,
  changes JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indices
CREATE INDEX IF NOT EXISTS idx_analytics_event_type ON analytics_events(event_type);
CREATE INDEX IF NOT EXISTS idx_analytics_created_at ON analytics_events(created_at);
CREATE INDEX IF NOT EXISTS idx_analytics_technique ON analytics_events(technique_id);
CREATE INDEX IF NOT EXISTS idx_shares_token ON email_shares(share_token);
CREATE INDEX IF NOT EXISTS idx_shares_prompt ON email_shares(prompt_id);
CREATE INDEX IF NOT EXISTS idx_audit_created_at ON admin_audit_log(created_at);
CREATE INDEX IF NOT EXISTS idx_templates_technique ON technique_templates(technique_id);

-- Full-text search index op prompts (geavanceerd zoeken)
CREATE INDEX IF NOT EXISTS idx_prompts_fts ON prompts
  USING gin(to_tsvector('dutch', coalesce(title, '') || ' ' || coalesce(description, '') || ' ' || coalesce(content, '')));

-- RLS — Phase 2 open policies (vervang door auth-policies in een latere fase).
ALTER TABLE analytics_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE email_shares ENABLE ROW LEVEL SECURITY;
ALTER TABLE technique_templates ENABLE ROW LEVEL SECURITY;
ALTER TABLE admin_audit_log ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "phase2_open_analytics" ON analytics_events;
CREATE POLICY "phase2_open_analytics" ON analytics_events FOR ALL USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "phase2_open_shares" ON email_shares;
CREATE POLICY "phase2_open_shares" ON email_shares FOR ALL USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "phase2_open_templates" ON technique_templates;
CREATE POLICY "phase2_open_templates" ON technique_templates FOR ALL USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "phase2_open_audit" ON admin_audit_log;
CREATE POLICY "phase2_open_audit" ON admin_audit_log FOR ALL USING (true) WITH CHECK (true);

-- Reference-data mag nu ook geschreven worden (admin CRUD).
DROP POLICY IF EXISTS "phase1_read_roles" ON roles;
CREATE POLICY "phase2_write_roles" ON roles FOR ALL USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "phase1_read_categories" ON categories;
CREATE POLICY "phase2_write_categories" ON categories FOR ALL USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "phase1_read_techniques" ON techniques;
CREATE POLICY "phase2_write_techniques" ON techniques FOR ALL USING (true) WITH CHECK (true);
