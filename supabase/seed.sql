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
  -- De zeven vragen van de persona-bouwer. "why" is de toelichting onder het veld;
  -- die stuurt ook de AI-invulhulp aan. Zie migratie 0028_persona_questions.sql.
  '[
    {"id":"rol","label":"Welke functie of rol vervult deze persoon precies?","placeholder":"Bijv. wetgevingsjurist bij een departement","why":"Dit is de kapstok. Hoe specifieker, hoe minder de AI terugvalt op een generiek gemiddelde. \"Wetgevingsjurist bij een departement\" activeert echte denkkaders, \"jurist\" niet."},
    {"id":"ervaring","label":"Hoeveel ervaring en welke expertise heeft deze persoon?","placeholder":"Bijv. 15 jaar ervaring, senior, specialist uitvoerbaarheid","why":"Ervaring bepaalt de zekerheid waarmee de AI schrijft. Een senior nuanceert en kent uitzonderingen; een junior legt uit en volgt de regels."},
    {"id":"belang","label":"Welk belang bewaakt deze persoon?","placeholder":"Bijv. bewaakt de uitvoerbaarheid en handhaafbaarheid","why":"De belangrijkste vraag. Een rol zonder belang is een decorstuk. \"Bewaakt de uitvoerbaarheid\" geeft de tekst richting: de AI gaat afwegen in plaats van opsommen."},
    {"id":"focus","label":"Waar let deze persoon als eerste op?","placeholder":"Bijv. eerst naar risico’s en juridische houdbaarheid","why":"Dit stuurt de volgorde en de aandacht. Wie eerst naar risico’s kijkt schrijft een andere opbouw dan wie eerst naar kansen kijkt. Het maakt de persona operationeel."},
    {"id":"niet","label":"Wat doet of zegt deze persona juist níét?","placeholder":"Bijv. geeft geen politiek oordeel, belooft geen termijnen","why":"Negatieve afbakening is het scherpste stuurmiddel. \"Geeft geen politiek oordeel\", \"gebruikt geen jargon\". Zonder grens vult de AI de ruimte met eigen aannames."},
    {"id":"communicatie","label":"Hoe moet er gecommuniceerd worden?","placeholder":"Bijv. zakelijk en bondig, korte zinnen, minimaal jargon","why":"Toon, register, zinslengte, gebruik van vaktaal. Dit is het verschil tussen inhoudelijk kloppen en herkenbaar zijn."},
    {"id":"blinde_vlek","label":"Wat weet deze persoon niet, of waar twijfelt hij over?","placeholder":"Bijv. minder thuis in de techniek; twijfelt over de planning","why":"Dit voorkomt de alwetende AI-stem. Een persona met blinde vlekken is geloofwaardiger en benoemt onzekerheid in plaats van hem glad te strijken."}
  ]'::jsonb,
  E'Je bent {{rol}}.\n\nErvaring en expertise: {{ervaring}}\nHet belang dat je bewaakt: {{belang}}\nWaar je als eerste op let: {{focus}}\nWat je juist niet doet: {{niet}}\nHoe je communiceert: {{communicatie}}\nWat je niet weet of waarover je twijfelt: {{blinde_vlek}}\n\nVoer de onderstaande opdracht volledig vanuit dit perspectief uit. Houd de toon, de afwegingen en de grenzen van deze rol vast. Benoem onzekerheid waar die er is in plaats van hem glad te strijken.\n\nOorspronkelijke opdracht:\n{{PROMPT}}'
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
