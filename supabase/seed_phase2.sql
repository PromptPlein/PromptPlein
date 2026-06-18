-- Phase 2 seed: 5 extra technieken (totaal 9). Idempotent via ON CONFLICT.

INSERT INTO techniques (name, description, follow_up_questions, template, is_active) VALUES
(
  'Multi-Persona Prompting',
  'Stem de prompt af op meerdere belanghebbenden tegelijk.',
  '[
    {"id":"persona1","label":"Persona 1 — naam/rol","placeholder":"Bijv. Projectleider"},
    {"id":"belang1","label":"Persona 1 — belang & prioriteit","placeholder":"Bijv. tijdige oplevering"},
    {"id":"persona2","label":"Persona 2 — naam/rol","placeholder":"Bijv. Jurist"},
    {"id":"belang2","label":"Persona 2 — belang & prioriteit","placeholder":"Bijv. juridische houdbaarheid"},
    {"id":"persona3","label":"Persona 3 — naam/rol (optioneel)","placeholder":"Bijv. Communicatieadviseur"},
    {"id":"belang3","label":"Persona 3 — belang & prioriteit (optioneel)","placeholder":"Bijv. begrijpelijke boodschap"}
  ]'::jsonb,
  E'Je gaat deze tekst schrijven voor meerdere doelgroepen tegelijk.\n\nPERSONA 1 — {{persona1}}:\n- Belang en prioriteit: {{belang1}}\n\nPERSONA 2 — {{persona2}}:\n- Belang en prioriteit: {{belang2}}\n\nPERSONA 3 — {{persona3}}:\n- Belang en prioriteit: {{belang3}}\n\nZorg dat elke persona waarde uit het resultaat haalt: adresseer hun belangen expliciet en houd rekening met hun perspectief.\n\nOorspronkelijke opdracht:\n{{PROMPT}}',
  TRUE
),
(
  'Socratic Prompting',
  'Laat de AI vragen stellen in plaats van direct antwoorden geven (Socratische methode).',
  '[
    {"id":"aannames","label":"Wat zijn de kern-aannames in de input?","placeholder":"Bijv. dat de doelgroep digivaardig is"},
    {"id":"ontdekken","label":"Wat wil je eigenlijk ontdekken?","placeholder":"Bijv. of de aanpak wel klopt"}
  ]'::jsonb,
  E'Analyseer de aannames in onderstaande tekst en pas de Socratische methode toe.\n\nBekende aannames: {{aannames}}\nWat we willen ontdekken: {{ontdekken}}\n\nGa als volgt te werk:\n1. Identificeer alle impliciete en expliciete aannames.\n2. Stel vragen die deze aannames in twijfel trekken.\n3. Onderzoek alternatieve perspectieven.\n4. Leid de gebruiker via vragen naar nieuwe inzichten.\n\nStijl: interview-achtig en Socratisch; zet stellingen ter discussie in plaats van conclusies te poneren.\n\nOorspronkelijke opdracht:\n{{PROMPT}}',
  TRUE
),
(
  'Meta Prompting',
  'De AI analyseert en verbetert haar eigen prompting-aanpak.',
  '[]'::jsonb,
  E'Analyseer en verbeter je eigen prompting-benadering voor de onderstaande opdracht.\n\nDoe het volgende:\n1. Analyseer: wat werkt goed aan deze opdracht/prompt, en wat niet?\n2. Identificeer: welke aannames maak je impliciet?\n3. Optimaliseer: hoe zou je dit anders formuleren voor een beter resultaat?\n4. Reflecteer: wat leer je hieruit over effectief prompten?\n\nGeef een meta-analyse van je aanpak, gevolgd door een verbeterde versie van de opdracht.\n\nOorspronkelijke opdracht:\n{{PROMPT}}',
  TRUE
),
(
  'CRISP',
  'Gestructureerd prompten met Context, Rules, Instructions, Specifics en Pattern.',
  '[
    {"id":"context","label":"CONTEXT — achtergrond & situatie","placeholder":"Waar gaat het over?"},
    {"id":"rules","label":"RULES — regels & randvoorwaarden","placeholder":"Bijv. AVG-proof, B1-taalniveau"},
    {"id":"instructions","label":"INSTRUCTIONS — concrete instructies","placeholder":"Wat moet er gebeuren?"},
    {"id":"specifics","label":"SPECIFICS — specifieke details","placeholder":"Bijv. exacte cijfers, namen, datums"},
    {"id":"pattern","label":"PATTERN — gewenst patroon/structuur","placeholder":"Bijv. inleiding, kern, conclusie"}
  ]'::jsonb,
  E'# CONTEXT:\n{{context}}\n\n# RULES:\n{{rules}}\n\n# INSTRUCTIONS:\n{{instructions}}\n\n# SPECIFICS:\n{{specifics}}\n\n# PATTERN:\n{{pattern}}\n\n---\n\nGeef, gegeven bovenstaande CRISP-structuur, antwoord op:\n{{PROMPT}}',
  TRUE
),
(
  'CARE',
  'Uitgebreid prompten met Context, Ask, Rules en Examples.',
  '[
    {"id":"context","label":"CONTEXT — achtergrond","placeholder":"Waar gaat het over?"},
    {"id":"ask","label":"ASK — de concrete vraag","placeholder":"Wat vraag je precies?"},
    {"id":"rules","label":"RULES — regels & randvoorwaarden","placeholder":"Bijv. formeel, max. 1 A4"},
    {"id":"examples","label":"EXAMPLES — voorbeelden","placeholder":"Plak een of meer voorbeelden"}
  ]'::jsonb,
  E'# CONTEXT:\n{{context}}\n\n# ASK:\n{{ask}}\n\n# RULES:\n{{rules}}\n\n# EXAMPLES:\n{{examples}}\n\n---\n\nGenereer, gegeven bovenstaande CARE-structuur, het volgende:\n{{PROMPT}}',
  TRUE
)
ON CONFLICT (name) DO NOTHING;
