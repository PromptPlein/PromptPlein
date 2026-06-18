-- Overheid Prompt Library — Phase 1 schema

-- Rollen (beheerd door admin, hardcoded geseed voor Phase 1)
CREATE TABLE IF NOT EXISTS roles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL UNIQUE,
  description TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Categorieën
CREATE TABLE IF NOT EXISTS categories (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL UNIQUE,
  description TEXT,
  icon TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Prompttechnieken
CREATE TABLE IF NOT EXISTS techniques (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL UNIQUE,
  description TEXT,
  follow_up_questions JSONB DEFAULT '[]'::jsonb,
  template TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Prompts
CREATE TABLE IF NOT EXISTS prompts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title TEXT NOT NULL,
  description TEXT,
  content TEXT NOT NULL,
  category_id UUID REFERENCES categories(id) ON DELETE SET NULL,
  role_id UUID REFERENCES roles(id) ON DELETE SET NULL,
  sharing_level TEXT NOT NULL DEFAULT 'private'
    CHECK (sharing_level IN ('private', 'department', 'ministry', 'role', 'public')),
  created_by TEXT NOT NULL,
  is_favorite BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Geoptimaliseerde prompts
CREATE TABLE IF NOT EXISTS optimizations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  prompt_id UUID REFERENCES prompts(id) ON DELETE CASCADE,
  technique_id UUID REFERENCES techniques(id) ON DELETE SET NULL,
  optimized_content TEXT NOT NULL,
  follow_up_answers JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indices voor performance
CREATE INDEX IF NOT EXISTS idx_prompts_category ON prompts(category_id);
CREATE INDEX IF NOT EXISTS idx_prompts_role ON prompts(role_id);
CREATE INDEX IF NOT EXISTS idx_prompts_sharing ON prompts(sharing_level);
CREATE INDEX IF NOT EXISTS idx_prompts_created_by ON prompts(created_by);
CREATE INDEX IF NOT EXISTS idx_optimizations_prompt ON optimizations(prompt_id);
CREATE INDEX IF NOT EXISTS idx_optimizations_technique ON optimizations(technique_id);

-- Houd updated_at automatisch bij.
CREATE OR REPLACE FUNCTION set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_prompts_updated_at ON prompts;
CREATE TRIGGER trg_prompts_updated_at
  BEFORE UPDATE ON prompts
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- RLS (optioneel voor Phase 1; geen auth — open lees/schrijf via anon key).
-- Schakel in en pas policies aan zodra authenticatie wordt toegevoegd (Phase 2).
ALTER TABLE prompts ENABLE ROW LEVEL SECURITY;
ALTER TABLE optimizations ENABLE ROW LEVEL SECURITY;
ALTER TABLE roles ENABLE ROW LEVEL SECURITY;
ALTER TABLE categories ENABLE ROW LEVEL SECURITY;
ALTER TABLE techniques ENABLE ROW LEVEL SECURITY;

-- Phase 1: open toegang (geen auth). VERVANG in Phase 2 door auth-gebaseerde policies.
DROP POLICY IF EXISTS "phase1_open_prompts" ON prompts;
CREATE POLICY "phase1_open_prompts" ON prompts FOR ALL USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "phase1_open_optimizations" ON optimizations;
CREATE POLICY "phase1_open_optimizations" ON optimizations FOR ALL USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "phase1_read_roles" ON roles;
CREATE POLICY "phase1_read_roles" ON roles FOR SELECT USING (true);

DROP POLICY IF EXISTS "phase1_read_categories" ON categories;
CREATE POLICY "phase1_read_categories" ON categories FOR SELECT USING (true);

DROP POLICY IF EXISTS "phase1_read_techniques" ON techniques;
CREATE POLICY "phase1_read_techniques" ON techniques FOR SELECT USING (true);
