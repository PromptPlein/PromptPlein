-- 0045_dashboard_namen.sql
-- De TILSSG-frameworks heten voortaan gewoon Dashboard. De letters (Taak,
-- Inhoud, Layout, Succes, Scope, Grens) staan nog in de beschrijving en in de
-- vragen; de naam zegt nu wat je maakt.
--
-- isGoalCommand in src/lib/techniques.ts herkent beide namen.

UPDATE techniques SET name = 'Dashboard (Prototype)' WHERE name = 'TILSSG (Prototype)';
UPDATE techniques SET name = 'Dashboard (Volledig)' WHERE name = 'TILSSG (Dashboard)';
