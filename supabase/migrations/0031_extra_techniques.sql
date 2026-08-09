-- 0031_extra_techniques.sql
-- Vier extra prompttechnieken die in de techniekliteratuur consequent terugkomen
-- en die in rijkswerk direct waarde hebben. Ze staan naast de bestaande losse
-- technieken (Persona, Multi-Persona, Few-Shot, Gestructureerde Output,
-- Chain-of-Thought, Socratic, Meta) en zijn dus family = 'technique'.
--
--   Chain-of-Verification — het model trekt zijn eigen concept na vóór oplevering.
--   Step-Back Prompting   — eerst het onderliggende vraagstuk, dan pas het antwoord.
--   Bronbinding           — uitsluitend antwoorden uit de meegeleverde stukken.
--   Rubric-toetsing       — beoordelen tegen een vast kader met scores per criterium.
--
-- Idempotent: ON CONFLICT (name) werkt de bestaande rij bij, zodat een tweede
-- run de teksten alleen ververst.

INSERT INTO techniques (name, description, strength, use_cases, follow_up_questions, template, family, is_active, sort_order)
VALUES
-- 1. Chain-of-Verification
(
  'Chain-of-Verification',
  'Laat de AI het eigen concept natrekken met verificatievragen voordat het definitief wordt.',
  'Sterk tegen fouten die er geloofwaardig uitzien. Het model stelt eerst controlevragen bij zijn eigen tekst, beantwoordt die apart, en levert daarna een gecorrigeerde versie plus een lijst van wat nog door een mens geverifieerd moet worden.',
  '[
    "Gebruik dit wanneer een Kamerbrief, nota of besluit de deur uitgaat en een fout duur is.",
    "Gebruik dit wanneer er cijfers, data, bedragen of verwijzingen naar wetgeving in de tekst staan.",
    "Gebruik dit wanneer je onderbouwde beweringen wilt scheiden van wat nog uitgezocht moet worden."
  ]'::jsonb,
  '[
    {"id":"gewenst_doel","label":"Gewenst doel — wat wil je bereiken?","placeholder":"Bijv. een concept-Kamerbrief die feitelijk klopt voordat hij naar de bewindspersoon gaat"},
    {"id":"te_controleren","label":"Welke tekst moet gecontroleerd worden?","placeholder":"Bijv. de conceptbrief hieronder, of het stuk dat ik meestuur"},
    {"id":"risico","label":"Welke fouten zijn hier het duurst?","placeholder":"Bijv. verkeerde cijfers, onjuiste wetsartikelen, toezeggingen die niet zijn gedaan"},
    {"id":"bronnen","label":"Wat mag als bron gelden?","placeholder":"Bijv. alleen de meegestuurde stukken en eerdere Kamerbrieven over dit dossier"}
  ]'::jsonb,
  E'Gewenst doel: {{gewenst_doel}}\n\nControleer de onderstaande tekst voordat hij wordt opgeleverd: {{te_controleren}}\n\nWerk in vier stappen en toon elke stap:\n1. Haal alle controleerbare beweringen uit de tekst (feiten, cijfers, data, verwijzingen, toezeggingen).\n2. Formuleer per bewering één verificatievraag waarmee die te controleren is.\n3. Beantwoord elke verificatievraag afzonderlijk, uitsluitend op basis van: {{bronnen}}. Kun je een vraag daarmee niet beantwoorden, schrijf dan "niet te verifiëren met de aangeleverde bronnen".\n4. Lever een gecorrigeerde versie van de tekst, gevolgd door een lijst "nog te verifiëren door een mens".\n\nLet extra op: {{risico}}. Corrigeer niets op basis van eigen aannames en verwijder liever een bewering dan dat je hem aanvult met iets wat je niet kunt onderbouwen.\n\nOorspronkelijke opdracht:\n{{PROMPT}}',
  'technique',
  TRUE,
  60
),
-- 2. Step-Back Prompting
(
  'Step-Back Prompting',
  'Zoom eerst uit naar het onderliggende vraagstuk voordat je de concrete vraag beantwoordt.',
  'Sterk wanneer de gestelde vraag misschien niet de juiste vraag is. Het model benoemt eerst het bredere vraagstuk en de uitgangspunten die daar gelden, en past die pas daarna toe op jouw geval — waardoor een verkeerd gestelde opdracht zichtbaar wordt.',
  '[
    "Gebruik dit bij een probleemanalyse, voordat je een oplossingsrichting kiest.",
    "Gebruik dit wanneer er al een oplossing op tafel ligt en je wilt weten of die het probleem wel raakt.",
    "Gebruik dit bij een opdracht van boven die smal is geformuleerd (\"regel dit even\")."
  ]'::jsonb,
  '[
    {"id":"gewenst_doel","label":"Gewenst doel — wat wil je bereiken?","placeholder":"Bijv. weten of de voorgestelde maatregel het echte probleem oplost"},
    {"id":"concrete_vraag","label":"Wat is de concrete vraag of opdracht die nu voorligt?","placeholder":"Bijv. werk een meldplicht uit voor deze sector"},
    {"id":"aanname","label":"Welke oplossing of richting ligt er al op tafel?","placeholder":"Bijv. er is al besloten dat het een meldplicht wordt"},
    {"id":"kader","label":"Welke kaders of uitgangspunten gelden hier?","placeholder":"Bijv. uitvoerbaarheid, regeldruk, bestaande wetgeving, het regeerprogramma"}
  ]'::jsonb,
  E'Gewenst doel: {{gewenst_doel}}\n\nBeantwoord de vraag hieronder NIET meteen. Werk eerst terug naar het vraagstuk erachter.\n\nConcrete vraag: {{concrete_vraag}}\nWat er al op tafel ligt: {{aanname}}\nGeldende kaders: {{kader}}\n\nWerkwijze:\n1. Formuleer de algemenere vraag achter deze vraag: welk probleem wordt hier eigenlijk opgelost, en voor wie?\n2. Benoem de uitgangspunten, kaders en werkende mechanismen die op dat niveau gelden.\n3. Pas die pas daarna toe op de concrete vraag.\n4. Geef expliciet aan waar de concrete vraag afwijkt van het onderliggende vraagstuk, en welke vraag beter gesteld kan worden.\n\nOorspronkelijke opdracht:\n{{PROMPT}}',
  'technique',
  TRUE,
  61
),
-- 3. Bronbinding (grounding)
(
  'Bronbinding',
  'Laat de AI uitsluitend antwoorden op basis van de meegeleverde stukken, met een verwijzing per bewering.',
  'Sterk wanneer het antwoord controleerbaar moet zijn. Het model mag niets uit eigen kennis toevoegen: elke bewering krijgt een vindplaats, en wat niet in de stukken staat wordt als ontbrekend benoemd in plaats van ingevuld.',
  '[
    "Gebruik dit bij vragen die je beantwoordt uit een dossier, een inventarisatie of een set Kamerstukken.",
    "Gebruik dit bij een samenvatting die herleidbaar moet zijn naar de bron.",
    "Gebruik dit bij een feitencheck van een concept tegen de onderliggende stukken."
  ]'::jsonb,
  '[
    {"id":"gewenst_doel","label":"Gewenst doel — wat wil je bereiken?","placeholder":"Bijv. een antwoord op feitelijke vragen dat volledig uit het dossier komt"},
    {"id":"bronnen","label":"Welke stukken zijn de bron?","placeholder":"Bijv. de vier meegestuurde documenten en verder niets"},
    {"id":"verwijzing","label":"Hoe moet er verwezen worden?","placeholder":"Bijv. tussen haakjes de documentnaam en het paginanummer"},
    {"id":"ontbreekt","label":"Wat moet er gebeuren als het antwoord niet in de stukken staat?","placeholder":"Bijv. schrijf \"staat niet in de stukken\" en zet het onder een kopje open punten"}
  ]'::jsonb,
  E'Gewenst doel: {{gewenst_doel}}\n\nGebruik UITSLUITEND de volgende bronnen: {{bronnen}}. Voeg geen kennis van buiten deze stukken toe, ook niet als je het antwoord meent te weten.\n\nRegels:\n- Zet achter elke bewering een verwijzing naar de vindplaats: {{verwijzing}}.\n- Kun je iets niet uit de bronnen halen? Dan geldt: {{ontbreekt}}. Vul het nooit zelf aan en leid het niet af.\n- Geef bij tegenstrijdigheden tussen bronnen beide lezingen weer, met de vindplaats erbij.\n- Scheid aan het eind wat vaststaat op basis van de stukken van wat nog moet worden opgevraagd.\n\nOorspronkelijke opdracht:\n{{PROMPT}}',
  'technique',
  TRUE,
  62
),
-- 4. Rubric-toetsing
(
  'Rubric-toetsing',
  'Beoordeel een stuk tegen een vooraf vastgelegd toetsingskader, met een score en onderbouwing per criterium.',
  'Sterk wanneer het oordeel navolgbaar moet zijn. Het model scoort elk criterium apart en onderbouwt die score met een passage uit het stuk, zodat een eindoordeel niet op een onderbuikgevoel rust maar op het kader.',
  '[
    "Gebruik dit bij een uitvoeringstoets, regeldruktoets of kwaliteitstoets op een concept.",
    "Gebruik dit bij het beoordelen van subsidieaanvragen of offertes tegen vaste criteria.",
    "Gebruik dit wanneer meerdere collega''s hetzelfde moeten beoordelen en de uitkomst vergelijkbaar moet zijn."
  ]'::jsonb,
  '[
    {"id":"gewenst_doel","label":"Gewenst doel — wat wil je bereiken?","placeholder":"Bijv. een navolgbaar oordeel over vier subsidieaanvragen"},
    {"id":"te_beoordelen","label":"Wat wordt er beoordeeld?","placeholder":"Bijv. de aanvraag die ik meestuur"},
    {"id":"criteria","label":"Welke criteria staan in het toetsingskader?","placeholder":"Bijv. doelbereik, uitvoerbaarheid, regeldruk, kosten, risico"},
    {"id":"schaal","label":"Welke schaal of scores gebruik je?","placeholder":"Bijv. voldoet / voldoet deels / voldoet niet, of 1 tot 5"},
    {"id":"weging","label":"Wegen criteria even zwaar?","placeholder":"Bijv. uitvoerbaarheid telt dubbel, de rest gelijk"},
    {"id":"drempel","label":"Wanneer is het geheel voldoende?","placeholder":"Bijv. geen enkel criterium op \"voldoet niet\" en totaal minimaal 70%"}
  ]'::jsonb,
  E'Gewenst doel: {{gewenst_doel}}\n\nBeoordeel het volgende tegen het toetsingskader: {{te_beoordelen}}\n\nToetsingskader:\n- Criteria: {{criteria}}\n- Schaal: {{schaal}}\n- Weging: {{weging}}\n- Drempel voor een voldoende geheel: {{drempel}}\n\nLever een tabel met per criterium: het criterium, de score, de onderbouwing met een letterlijke passage uit het beoordeelde stuk, en het belangrijkste verbeterpunt. Geef daarna het eindoordeel met de weging erin verwerkt, en noem apart de zwaarste tekortkoming.\n\nBeoordeel alleen op de genoemde criteria. Ontbreekt informatie om een criterium te scoren, geef dan "niet te beoordelen" met wat er nog nodig is; vul niets aan.\n\nOorspronkelijke opdracht:\n{{PROMPT}}',
  'technique',
  TRUE,
  63
)
ON CONFLICT (name) DO UPDATE SET
  description         = EXCLUDED.description,
  strength            = EXCLUDED.strength,
  use_cases           = EXCLUDED.use_cases,
  follow_up_questions = EXCLUDED.follow_up_questions,
  template            = EXCLUDED.template,
  family              = EXCLUDED.family,
  is_active           = EXCLUDED.is_active,
  sort_order          = EXCLUDED.sort_order;
