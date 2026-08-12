-- Chain-of-Verification, Step-Back en Rubric-toetsing krijgen een eigen bouwer.
--
-- Deze drie technieken (0031) draaiden tot nu toe op de generieke vragenlijst.
-- Dat werkte, maar het haalde net niet op waar elke techniek op staat of valt:
--
--   Chain-of-Verification: WELKE soorten beweringen gecontroleerd moeten worden,
--     en WAARTEGEN. Zonder bronafbakening betekent "klopt" alleen dat het model
--     het herkent, en dat is precies de fout die de techniek moet vangen.
--   Step-Back: op WELKE HOOGTE wordt uitgezoomd, en wat daarbij vaststaat
--     (besloten) versus wat alleen is aangenomen. Zonder dat onderscheid wordt
--     uitzoomen ongehoorzaam of tandeloos.
--   Rubric-toetsing: de NIVEAUBESCHRIJVING per criterium per schaalpunt. Een
--     lijst criteria zonder die beschrijvingen levert scores op die twee
--     beoordelaars niet gelijk krijgen.
--
-- Die keuzes laten zich niet in een vast vragenlijstje vangen: het aantal
-- criteria verschilt, de checklist volgt uit de gescande tekst, en de ladder
-- hangt van het vraagstuk af. De bouwers halen ze zelf op (zie
-- src/lib/verification.ts, stepback.ts, rubric.ts). De vragen die hier stonden
-- zijn daarmee dode data: bewerkbaar in de admin, nooit getoond aan een
-- gebruiker. Zelfde afweging als 0029 voor Few-Shot/Meta/CoT/Socratic.
--
-- De admin toont voor deze technieken voortaan uitleg over wat de bouwer doet
-- (src/lib/techniques.ts → SELF_DIRECTED_BUILDERS).
--
-- De templates blijven ongemoeid. Ze gaan als structuurhint mee naar de edge
-- function, en `fillTemplate` maakt van een niet-ingevulde placeholder netjes
-- [naam], dus losse placeholders leveren geen rommel op.

UPDATE public.techniques
SET follow_up_questions = '[]'::jsonb
WHERE name ~* 'verification|verificatie|step.?back|rubric'
  AND follow_up_questions <> '[]'::jsonb;
