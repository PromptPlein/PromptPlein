-- Persona Prompting: de vragen van de persona-bouwer in de techniek-definitie.
--
-- De persona-bouwer toonde zeven gerichte vragen die hardcoded in de frontend
-- stonden (src/lib/persona.ts), terwijl deze rij nog vijf heel andere velden had
-- (ontvanger, doel, focus, toon, inhoud). Die velden werden nooit gerenderd: de
-- bouwer verving de generieke vragenlijst. Daarmee was de admin-definitie dode
-- data en kon een beheerder de echte vragen niet zien of aanpassen.
--
-- Deze migratie zet de zeven vragen in de definitie, inclusief de toelichting per
-- veld ("why") die als hulptekst onder het veld verschijnt en de AI-invulhulp
-- aanstuurt. De templates gaan mee naar de nieuwe veld-id's, zodat de placeholders
-- blijven kloppen.

UPDATE public.techniques
SET
  follow_up_questions = '[
    {
      "id": "rol",
      "label": "Welke functie of rol vervult deze persoon precies?",
      "placeholder": "Bijv. wetgevingsjurist bij een departement",
      "why": "Dit is de kapstok. Hoe specifieker, hoe minder de AI terugvalt op een generiek gemiddelde. \"Wetgevingsjurist bij een departement\" activeert echte denkkaders, \"jurist\" niet."
    },
    {
      "id": "ervaring",
      "label": "Hoeveel ervaring en welke expertise heeft deze persoon?",
      "placeholder": "Bijv. 15 jaar ervaring, senior, specialist uitvoerbaarheid",
      "why": "Ervaring bepaalt de zekerheid waarmee de AI schrijft. Een senior nuanceert en kent uitzonderingen; een junior legt uit en volgt de regels."
    },
    {
      "id": "belang",
      "label": "Welk belang bewaakt deze persoon?",
      "placeholder": "Bijv. bewaakt de uitvoerbaarheid en handhaafbaarheid",
      "why": "De belangrijkste vraag. Een rol zonder belang is een decorstuk. \"Bewaakt de uitvoerbaarheid\" geeft de tekst richting: de AI gaat afwegen in plaats van opsommen."
    },
    {
      "id": "focus",
      "label": "Waar let deze persoon als eerste op?",
      "placeholder": "Bijv. eerst naar risico’s en juridische houdbaarheid",
      "why": "Dit stuurt de volgorde en de aandacht. Wie eerst naar risico’s kijkt schrijft een andere opbouw dan wie eerst naar kansen kijkt. Het maakt de persona operationeel."
    },
    {
      "id": "niet",
      "label": "Wat doet of zegt deze persona juist níét?",
      "placeholder": "Bijv. geeft geen politiek oordeel, belooft geen termijnen",
      "why": "Negatieve afbakening is het scherpste stuurmiddel. \"Geeft geen politiek oordeel\", \"gebruikt geen jargon\". Zonder grens vult de AI de ruimte met eigen aannames."
    },
    {
      "id": "communicatie",
      "label": "Hoe moet er gecommuniceerd worden?",
      "placeholder": "Bijv. zakelijk en bondig, korte zinnen, minimaal jargon",
      "why": "Toon, register, zinslengte, gebruik van vaktaal. Dit is het verschil tussen inhoudelijk kloppen en herkenbaar zijn."
    },
    {
      "id": "blinde_vlek",
      "label": "Wat weet deze persoon niet, of waar twijfelt hij over?",
      "placeholder": "Bijv. minder thuis in de techniek; twijfelt over de planning",
      "why": "Dit voorkomt de alwetende AI-stem. Een persona met blinde vlekken is geloofwaardiger en benoemt onzekerheid in plaats van hem glad te strijken."
    }
  ]'::jsonb,
  template = 'Je bent {{rol}}.

Ervaring en expertise: {{ervaring}}
Het belang dat je bewaakt: {{belang}}
Waar je als eerste op let: {{focus}}
Wat je juist niet doet: {{niet}}
Hoe je communiceert: {{communicatie}}
Wat je niet weet of waarover je twijfelt: {{blinde_vlek}}

Voer de onderstaande opdracht volledig vanuit dit perspectief uit. Houd de toon, de
afwegingen en de grenzen van deze rol vast. Benoem onzekerheid waar die er is in
plaats van hem glad te strijken.

Oorspronkelijke opdracht:
{{PROMPT}}'
WHERE name = 'Persona Prompting';

-- Multi-Persona gebruikt dezelfde zeven vragen: de bouwer herhaalt ze per persona.
UPDATE public.techniques
SET
  follow_up_questions = (
    SELECT follow_up_questions FROM public.techniques WHERE name = 'Persona Prompting'
  ),
  template = 'Bekijk de onderstaande opdracht vanuit meerdere persona''s. Elke persona is
gedefinieerd langs deze lijnen:

Rol: {{rol}}
Ervaring en expertise: {{ervaring}}
Het belang dat deze persona bewaakt: {{belang}}
Waar deze persona als eerste op let: {{focus}}
Wat deze persona juist niet doet: {{niet}}
Hoe deze persona communiceert: {{communicatie}}
Blinde vlek of twijfel: {{blinde_vlek}}

Laat elke persona vanuit het eigen belang kort reageren op:
- Wat valt op?
- Welke risico''s zie je?
- Welke kans zie je?
- Welke vraag moet nog beantwoord worden?

Sluit af met één gezamenlijke conclusie: wat moet er aangepast worden voordat dit
voorstel verder gaat?

---

{{PROMPT}}'
WHERE name = 'Multi-Persona Prompting';
