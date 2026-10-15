-- 0039_sjabloon_routekaart.sql
-- Sjablonen in /genereren, met als eerste de routekaart in rijksstijl.
--
-- "Wat wil je maken?" krijgt naast Skill de soort Sjabloon. Een sjabloon is een
-- framework met een vaste vorm: de template is de opdracht aan het bouwende
-- model, met één plek {{INHOUD:<naam>}}. De AI in PromptPlein schrijft alleen
-- die plek (mode 'sjabloon' in optimize-prompt, met een eigen systeemprompt per
-- naam); de vormgeving, de beweging en de techniek gaan letterlijk mee. Zo ziet
-- elke routekaart er hetzelfde uit en verschilt alleen wat erop staat.
--
-- De routekaart komt uit de roadmap van het AI-ambassadeurstraject: een rode bol
-- die als rode draad over een weg met haltes rijdt. Die vorm bleek ook buiten
-- opleidingen bruikbaar, om te laten zien waar een project, programma of
-- verandertraject staat en waar het naartoe wil. Daarom zijn de vaste woorden
-- uit dat traject (Live, Huiswerk, rolprofiel, BZK) vervangen door namen die
-- de inhoud meegeeft, is het aantal haltes vrij (twee tot zeven) en is er een
-- Stand bij gekomen: de halte waar de groep nu staat.
--
-- Labels zonder gedachtestreepje: "DOEL: …" in plaats van "DOEL — …". De
-- bouwer splitst beide vormen (src/lib/fieldLabel.ts).
--
-- Idempotent: de constraint opnieuw, het sjabloon met ON CONFLICT (name).

ALTER TABLE techniques DROP CONSTRAINT IF EXISTS techniques_modality_check;
ALTER TABLE techniques
  ADD CONSTRAINT techniques_modality_check
  CHECK (modality IS NULL OR modality IN (
    'text', 'code_new', 'code_existing', 'dashboard_prototype', 'dashboard_full', 'agent', 'template'
  ));

COMMENT ON COLUMN techniques.modality IS
  'Soort uitkomst van dit framework, voor de keuze "Wat wil je maken?" in /genereren: text, code_new, code_existing, dashboard_prototype, dashboard_full, agent of template (een vast sjabloon met {{INHOUD:<naam>}}). NULL = doet bij elke soort mee, behalve bij Sjabloon.';

INSERT INTO techniques (name, description, strength, use_cases, follow_up_questions, template, family, modality, is_active, sort_order)
VALUES (
  'Routekaart (rijksstijl)',
  'Een geanimeerde routekaart in rijkshuisstijl die laat zien waar je vandaan komt, waar je nu staat en waar je naartoe wilt. Een rode bol rijdt als rode draad langs de haltes en neemt bij elke halte de opbrengst mee. Geschikt voor een opleiding, een project, een programma of een verandertraject, op een groot scherm en op de telefoon.',
  'Kies dit sjabloon wanneer iemand een traject in stappen wil presenteren: een opleiding met bijeenkomsten, een project met mijlpalen, een programma met fasen of een verandertraject. De vormgeving ligt vast (rijkskleuren, Public Sans, toegankelijk, licht en donker), dus elke routekaart ziet er hetzelfde uit. De medewerker levert alleen de inhoud: de haltes met hun kernvraag, wat er op en tussen de haltes gebeurt, de opbrengsten, de datums en waar de groep nu staat. Kies dit niet voor een gewone tekst of een dashboard met cijfers.',
  $json$[
    "Een opleiding of leertraject presenteren aan deelnemers, met bijeenkomsten, huiswerk en wat elke stap oplevert.",
    "Laten zien waar een project of programma nu staat en welke mijlpalen er nog komen.",
    "Een verandertraject uitleggen aan een team of directie: van de huidige situatie naar het doel.",
    "Elke routekaart in dezelfde rijksstijl laten maken, zodat collega's hem herkennen."
  ]$json$::jsonb,
  $json$[
    {
      "id": "doel",
      "label": "DOEL: wat wil je laten zien, aan wie, en bij welke gelegenheid?",
      "placeholder": "Bijvoorbeeld: de opbouw van ons opleidingstraject, voor de deelnemers bij de aftrap. Of: de fasen van ons programma, voor de directieraad."
    },
    {
      "id": "rode_draad",
      "label": "RODE DRAAD: wat groeit er van halte tot halte mee?",
      "placeholder": "Bijvoorbeeld: de eigen usecase van elke deelnemer. Of: het nieuwe systeem, van idee tot ingebruikname."
    },
    {
      "id": "haltes",
      "label": "HALTES: welke stappen zitten erin, en wat gebeurt er per stap?",
      "placeholder": "Noem per halte de titel, de vraag waar die halte antwoord op geeft, wat er op de halte gebeurt, wat er daarna tot de volgende halte gebeurt en wat de halte oplevert. Begin met wat er vóór de eerste halte gebeurt, als dat er is."
    },
    {
      "id": "datum",
      "label": "DATUM EN STAND: wanneer is elke halte, en waar sta je nu?",
      "placeholder": "Bijvoorbeeld: start op 3 maart, daarna elke zes weken een bijeenkomst; we staan nu bij de tweede halte."
    },
    {
      "id": "eindresultaat",
      "label": "EINDRESULTAAT: waar wil je uitkomen?",
      "placeholder": "Bijvoorbeeld: deelnemers begrijpen AI, hebben een kleine usecase getest en helpen collega's verantwoord op weg."
    },
    {
      "id": "namen",
      "label": "NAMEN: welk woord gebruik je voor wat er óp een halte gebeurt, en welk voor het werk tússen twee haltes? (optioneel)",
      "placeholder": "Laat leeg en de AI kiest: bij een opleiding Live en Huiswerk, anders Bijeenkomst en Tussendoor. Of noem je eigen woorden, zoals Sessie en Opdracht."
    },
    {
      "id": "kop",
      "label": "KOP: welke titel, programmanaam of afzender hoort erboven? (optioneel)",
      "placeholder": "Laat leeg en de AI stelt een titel voor. Of noem de bovenregel en de titel die je wilt, en eventueel een partner die bij een halte als geel label hoort."
    }
  ]$json$::jsonb,
  $tpl$Maak één zelfstandig HTML-bestand (HTML, CSS en JavaScript in één bestand, zonder frameworks) met een geanimeerde routekaart. De pagina laat zien waar we vandaan komen, waar we nu staan en waar we naartoe willen. Ik gebruik hem om te presenteren op een groot scherm. Deelnemers openen hem ook op hun telefoon.

## Concept
- De route bestaat uit een Start, de genummerde haltes en een Finish. De weg loopt van links naar rechts en golft licht tussen de haltes.
- Op elke halte gebeurt iets met de naam die onder NAMEN bij "Op de halte" staat. Een klein huisje op de weg na een halte staat voor het werk dat onder NAMEN bij "Tussen de haltes" staat. Er staat alleen een huisje na een halte die dat werk heeft.
- De rode draad is letterlijk: een rode bol (de rode draad uit NAMEN) rijdt over de weg en laat een rode lijn achter. Bij elke halte krijgt de bol het icoon van de opbrengst van die halte en licht die opbrengst op. Zo zie je de rode draad groeien.
- Boven de weg staan per halte het nummer, de korte titel, de datum en de kernvraag. Een halte met een Label krijgt daarboven een geel label met die tekst. Onder de weg staat per halte de opbrengst als label: gestippeld zolang de bol er nog niet is geweest, rood omlijnd zodra hij er is geweest.
- Bij Stand staat de korte titel van de halte waar we nu staan, of het woord Start. Die halte krijgt een geel vlaggetje met "Hier staan we". Haltes ervoor tonen als afgerond, haltes erna als gepland.
- Onder de route staat een detailpaneel voor de actieve halte met vier kolommen: de titel met de kernvraag en eventuele thema's als kleine labels, dan "Op de halte", dan "Tussen de haltes" en dan Opbrengst. De kolommen dragen de namen uit NAMEN. Heeft een halte Resultaat in plaats van Tussen de haltes, dan heet die kolom Resultaat. Heeft een halte een Titel in het detailpaneel, gebruik die dan in het paneel in plaats van de korte titel.

## Inhoud (letterlijk overnemen, niets toevoegen of weglaten)

{{INHOUD:route}}

## Uit de inhoud afleiden
- Legenda in de kop: rode lijn = de rode draad · cirkel = de naam bij "Op de halte" · huisje = de naam bij "Tussen de haltes" · gestippeld label = Opbrengst.
- De woorden bij "Rood in de ondertitel" worden in de ondertitel rood, met een golvende onderstreping.
- Detailpaneel bij de Finish: links de uitkomsten, elk met zijn icoon. Rechts een keten "Zo groeide" plus de rode draad, met alle opbrengsten van Start tot en met de laatste halte, verbonden door een rode lijn, die één voor één inkomen.
- Onderbalk: een donkerblauw vlak "Eindresultaat" met de zin bij Eindresultaat; het krijgt een gele rand zodra de bol bij de finish is. Daarnaast een lichtblauw vlak "Werkwijze", elke regel met zijn icoon. Staat er geen Werkwijze, laat dat vlak dan weg en maak het Eindresultaat over de volle breedte.
- Tekst tussen [vierkante haken] is een gegeven dat nog moet worden ingevuld. Toon hem precies zoals hij er staat.
- De paginatitel (het title-element) is de Titel uit KOP.

## Beweging
- Bij het openen staat alles meteen leesbaar in beeld. Geen elementen die pas later invliegen. De bol staat bij de halte uit Stand, met de rode lijn tot daar al getekend.
- Automatisch afspelen: na 7 seconden rijdt de bol naar de volgende halte. De reistijd is 0,7 tot 2,8 seconden, afhankelijk van de afstand, met ease-in-out. De rode lijn tekent precies mee met de bol.
- Een dunne rode voortgangsbalk onder de knoppen laat zien hoe lang het nog duurt tot de volgende halte.
- Bij aankomst wisselt het icoon in de bol met een korte pop-animatie. Het opbrengstlabel springt op en rond de actieve halte pulseert een rode ring. Het huisje op de weg wordt rood zodra de bol erlangs is.
- Bij de finish stopt het afspelen en licht het eindresultaat op. De knop wordt dan "Opnieuw" en rijdt de bol terug naar de start.
- Bediening: knoppen Vorige, Afspelen/Pauzeren/Opnieuw, Volgende en Volledig scherm. Klik op een halte of label om erheen te gaan. Elke handmatige actie pauzeert het afspelen. Toetsen: pijl links en rechts, PageUp en PageDown (presentatieclicker), spatie, Home en End.
- Respecteer prefers-reduced-motion: dan niet automatisch afspelen en direct springen in plaats van rijden.

## Vormgeving (rijkshuisstijl, bij elke routekaart gelijk)
- Rijkskleuren: donkerblauw #154273 (koppen, vlakken), blauw #01689B (accenten, kernvragen), geel #F9E11E (balk van 10 px bovenaan, streepje onder de actieve halte, gele labels, het vlaggetje bij Stand), rood #D52B1E (alleen voor de rode draad: bol, rode lijn, opbrengsten), lichtblauw #EAF2F9 (panelen) en wit als achtergrond.
- Lettertype Public Sans via Google Fonts, met Arial als terugval.
- Titelblok met een verticale donkerblauwe balk links, in de stijl van een rijksdia.
- Iconen als eenvoudige lijn-SVG's in het bestand zelf, één per icoonnaam die in de inhoud voorkomt. De namen zijn: vraagteken, canvas, blokjes (drie blokjes in een rij), schild (met vinkje), proefbuis, doos, lamp, wegwijzer, vlag, kalender, mensen, document, gesprek (tekstballon), doel (roos met pijl), sleutel, grafiek, puzzel, ster. Geen emoji.
- Ondersteun donkere modus via prefers-color-scheme met eigen donkere kleuren, niet simpelweg omgekeerd.

## Techniek en toegankelijkheid
- Teken de weg als SVG-pad met kubische Bezier-curven die om en om omhoog en omlaag golven. Alle haltes liggen op dezelfde hoogte.
- Bereken de positie van de bol op basis van booglengte (met een opzoektabel), zodat hij gelijkmatig rijdt. Teken de rode draad met een masker of stroke-dasharray.
- Breed scherm: de labels staan in evenveel gelijke kolommen als er haltes zijn, Start en Finish meegeteld, precies boven en onder de haltes uitgelijnd. Onder 900 px wordt de route verticaal, met de details uitgeklapt bij de actieve halte. Nergens horizontaal scrollen.
- Echte knoppen, zichtbare focus, aria-current op de actieve halte en aria-live op het detailpaneel.
- Geen externe scripts. De pagina moet offline werken; alleen het lettertype mag van internet komen.

## Oplevering
- Geef het volledige bestand in één codeblok, zonder weglatingen of "rest blijft gelijk".
- Controleer daarna zelf of alle teksten uit de inhoud erin staan, of alle knoppen en toetsen werken en of de weergave klopt op 1400 px en op 400 px breed.$tpl$,
  'context',
  'template',
  TRUE,
  40
)
ON CONFLICT (name) DO UPDATE SET
  description = EXCLUDED.description,
  strength = EXCLUDED.strength,
  use_cases = EXCLUDED.use_cases,
  follow_up_questions = EXCLUDED.follow_up_questions,
  template = EXCLUDED.template,
  family = EXCLUDED.family,
  modality = EXCLUDED.modality,
  is_active = EXCLUDED.is_active;
