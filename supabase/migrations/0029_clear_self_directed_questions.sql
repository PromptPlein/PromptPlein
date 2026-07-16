-- Technieken met een eigen bouwer hebben geen vaste vragenlijst.
--
-- Chain-of-Thought en Socratic voeren een interview (één vraag tegelijk, de
-- volgende vraag hangt af van het vorige antwoord), Few-Shot doorloopt zijn eigen
-- fasen, en bij Meta bouwt de AI de prompt op basis van één vrij veld. Geen van
-- deze bouwers rendert `follow_up_questions` — de vragen die hier stonden waren
-- dode data: zichtbaar en bewerkbaar in de admin, maar nooit getoond aan een
-- gebruiker.
--
-- De admin toont voor deze technieken voortaan uitleg over wat de bouwer doet,
-- in plaats van een vragenlijst (zie src/lib/techniques.ts → SELF_DIRECTED_BUILDERS).
-- Persona en Multi-Persona houden hun vragen wél: die bouwer rendert ze (0028).
--
-- De templates blijven ongemoeid. Ze gaan als structuurhint mee naar de edge
-- function, en `fillTemplate` maakt van een niet-ingevulde placeholder netjes
-- [naam], dus losse placeholders leveren geen rommel op.

UPDATE public.techniques
SET follow_up_questions = '[]'::jsonb
WHERE name ~* 'few.?shot|meta|chain.?of.?thought|socrat'
  AND follow_up_questions <> '[]'::jsonb;
