-- 0026_optimization_recipe.sql
-- Bewaart het "recept" van de slimme meerstaps-bouwer (plan-wizard) bij een
-- optimalisatie: het doel, het geordende plan van technieken en het per stap
-- verzamelde materiaal. Zo is een via de plan-wizard gebouwde template later te
-- herleiden, te herhalen of te hervatten. Nullable: enkele-techniek-flows en
-- oudere rijen laten dit gewoon leeg.

ALTER TABLE optimizations
  ADD COLUMN IF NOT EXISTS recipe JSONB;

COMMENT ON COLUMN optimizations.recipe IS
  'Plan-wizard recept: {goal, plan:{summary,steps[]}, outcomes[]}. NULL voor enkele-techniek-optimalisaties.';
