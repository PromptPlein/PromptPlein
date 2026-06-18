-- Seed reference-data voor Phase 1 (rollen, categorieën, technieken).
-- Idempotent: ON CONFLICT op de unieke naam.

-- Rollen
INSERT INTO roles (name, description) VALUES
  ('Beleidsmedewerker', 'Ontwikkelt en evalueert beleid.'),
  ('Communicatieadviseur', 'Externe en interne communicatie.'),
  ('Jurist', 'Juridische advisering en toetsing.'),
  ('Data-analist', 'Analyse van data en rapportages.'),
  ('Projectleider', 'Aansturing van projecten en programma''s.'),
  ('Bestuursadviseur', 'Advisering aan bestuur en management.'),
  ('Klantcontactmedewerker', 'Contact met burgers en bedrijven.')
ON CONFLICT (name) DO NOTHING;

-- Categorieën
INSERT INTO categories (name, description, icon) VALUES
  ('Beleid & Advies', 'Beleidsnota''s, adviezen en memo''s.', 'FileText'),
  ('Communicatie', 'Persberichten, nieuwsbrieven en woordvoering.', 'Megaphone'),
  ('Juridisch', 'Juridische teksten en toetsing.', 'Scale'),
  ('Data & Analyse', 'Data-analyse, rapportages en dashboards.', 'BarChart3'),
  ('Burgerbrieven', 'Correspondentie met burgers en bedrijven.', 'Mail'),
  ('Vergaderingen', 'Agenda''s, notulen en samenvattingen.', 'Users'),
  ('Onderzoek', 'Literatuuronderzoek en samenvattingen.', 'Search')
ON CONFLICT (name) DO NOTHING;

-- Technieken
INSERT INTO techniques (name, description, follow_up_questions, template) VALUES
(
  'Persona Prompting',
  'Laat de prompt schrijven vanuit het perspectief van een specifieke persoon of doelgroep.',
  '[
    {"id":"persona","label":"Wie is de persoon?","placeholder":"Bijv. een 70-jarige burger zonder digitale ervaring"},
    {"id":"belangrijk","label":"Wat is belangrijk voor hen?","placeholder":"Bijv. duidelijkheid en geruststelling"},
    {"id":"weten","label":"Wat willen ze graag weten?","placeholder":"Bijv. welke stappen ze moeten zetten"},
    {"id":"belangen","label":"Wat zijn hun belangen?","placeholder":"Bijv. tijdig de juiste toeslag ontvangen"}
  ]'::jsonb,
  E'Je bent {{persona}}.\n\nBelangrijk voor jou: {{belangrijk}}\nJe wilt graag weten: {{weten}}\nJouw belangen: {{belangen}}\n\nBeantwoord, schrijf of voer de volgende opdracht uit volledig vanuit dit perspectief. Houd rekening met de toon, taal en behoeften die bij deze persoon passen.\n\nOorspronkelijke opdracht:\n{{PROMPT}}'
),
(
  'Chain-of-Thought',
  'Laat het model stap voor stap redeneren voor complexere taken.',
  '[
    {"id":"doel","label":"Wat is het einddoel?","placeholder":"Bijv. een onderbouwd advies"},
    {"id":"stappen","label":"Welke tussenstappen zijn belangrijk?","placeholder":"Bijv. eerst de feiten, dan de afweging"}
  ]'::jsonb,
  E'Voer de volgende opdracht stap voor stap uit. Redeneer hardop en maak elke tussenstap expliciet voordat je tot een conclusie komt.\n\nEinddoel: {{doel}}\nBelangrijke tussenstappen: {{stappen}}\n\nWerkwijze:\n1. Verzamel en benoem de relevante feiten.\n2. Weeg de opties expliciet tegen elkaar af.\n3. Trek een onderbouwde conclusie.\n\nOorspronkelijke opdracht:\n{{PROMPT}}'
),
(
  'Few-Shot Voorbeelden',
  'Geef het model enkele voorbeelden zodat het de gewenste stijl en structuur overneemt.',
  '[
    {"id":"voorbeeld1","label":"Voorbeeld 1 (gewenste output)","placeholder":"Plak een goed voorbeeld"},
    {"id":"voorbeeld2","label":"Voorbeeld 2 (optioneel)","placeholder":"Nog een voorbeeld"},
    {"id":"stijl","label":"Wat kenmerkt de gewenste stijl?","placeholder":"Bijv. formeel, beknopt, B1-taalniveau"}
  ]'::jsonb,
  E'Gebruik onderstaande voorbeelden als referentie voor toon, stijl en structuur.\n\nVoorbeeld 1:\n{{voorbeeld1}}\n\nVoorbeeld 2:\n{{voorbeeld2}}\n\nGewenste stijl: {{stijl}}\n\nVoer nu de opdracht uit en volg dezelfde stijl en structuur als de voorbeelden.\n\nOorspronkelijke opdracht:\n{{PROMPT}}'
),
(
  'Gestructureerde Output',
  'Dwing een vast outputformaat af, zoals een tabel, lijst of vaste secties.',
  '[
    {"id":"formaat","label":"Welk outputformaat wil je?","placeholder":"Bijv. tabel met kolommen: onderwerp, advies, risico"},
    {"id":"taalniveau","label":"Welk taalniveau?","placeholder":"Bijv. B1 (begrijpelijke taal)"},
    {"id":"lengte","label":"Gewenste lengte?","placeholder":"Bijv. maximaal 1 A4"}
  ]'::jsonb,
  E'Lever het resultaat aan in het volgende formaat: {{formaat}}.\n\nEisen aan de output:\n- Taalniveau: {{taalniveau}}\n- Lengte: {{lengte}}\n- Houd je strikt aan het gevraagde formaat en voeg geen extra inleiding of afsluiting toe.\n\nOorspronkelijke opdracht:\n{{PROMPT}}'
)
ON CONFLICT (name) DO NOTHING;
