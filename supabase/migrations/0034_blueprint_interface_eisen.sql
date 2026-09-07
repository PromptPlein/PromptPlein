-- Vaste interface-eisen in beide BLUEPRINT-frameworks (Vibecode en Vibecode Prototype),
-- zodat elke gegenereerde prompt een visueel dashboard oplevert in plaats van veel tekst.

update techniques
set template = $tpl$# BLUEPRINT PREVIEW — snelle demo / mock-up (MVP)
Bouw een snelle, met overheids kleuren en direct werkende React-webapplicatie als demo-MVP. Dit is bewust een eerste, snel te maken opzet om een idee meteen visueel en interactief te tonen op localhost — geen volledige backend, database of authenticatie. Het scherm is datagericht: cijfers en visualisaties dragen de boodschap, tekst niet.

# B — BUSINESS (doel & probleem van de demo):
{{business}}

# L — LAYOUT (vormgeving & designtaal):
{{layout}}

# V — VIEWS (tab-gebaseerde weergaven — dit is de wow-factor):
{{views}}

# U — USE CASES (interacties & gebruikersreizen):
{{use_cases}}

# D — DUMMY DATA (concrete in-memory voorbeelddata):
{{dummy_data}}

# I — INFORMATION (datamodel & hiërarchie):
{{information}}

# E — EXTERNAL (externe koppelingen — bewust minimaal):
{{ecosystems}}

# P — PLATFORM (techniek & stack):
{{platform}}

# R — RULES (regels & vereenvoudigingen voor de demo):
{{rules}}

# N — NON-FUNCTIONAL (kwaliteit & gevoel):
{{nonfunctional}}

# S — SUCCESS (succescriteria & wow-factor):
{{success}}

# T — TESTING (optioneel):
{{testing}}

---

Gebruik de bovenstaande secties om in één keer een werkende demo-applicatie te bouwen:
{{PROMPT}}

---

## VASTE INTERFACE-EISEN (altijd toepassen, ze gaan boven een wens uit LAYOUT of VIEWS)

1. Visuele hiërarchie met maximaal drie niveaus. Niveau 1: de belangrijkste cijfers, het grootst en linksboven. Niveau 2: de hoofdvisualisatie en de verdelingen. Niveau 3: detailtabellen en filters, kleiner en lager op de pagina.
2. De data spreekt, de tekst niet. Geen introparagraaf, geen uitleg boven een blok, geen tooltip die een ontbrekend label moet goedmaken. Elk label is maximaal drie woorden.
3. Elk cijfer krijgt context in hetzelfde blok: een vergelijking met de vorige periode, een trend of een doelwaarde. De gebruiker hoeft niets te interpreteren.
4. Kleur is functioneel. Rood en groen uitsluitend voor status of voor afwijking van een norm, nooit als versiering. De rest van de interface blijft neutraal.
5. Vaste indeling in een raster. Alle secties staan altijd zichtbaar op een vast grid: geen accordeons, geen inklapbare panelen en geen knop die inhoud pas later toont.

Raster per view (schema, vul het met de eigen inhoud):

    [ KPI ] [ KPI ] [ KPI ] [ KPI ]        niveau 1, groot, elk met context
    [ hoofdvisualisatie 2/3 ] [ verdeling 1/3 ]   niveau 2
    [ detailtabel over de volle breedte ]         niveau 3

Op mobiel stackt dit raster in dezelfde volgorde, zonder secties te verbergen.

## VASTE DEMO-INSTRUCTIES (altijd toepassen — dit hoort bij een Preview)

### Tech stack (vast)
- React 18 + TypeScript + Vite
- Tailwind CSS voor styling
- Recharts of Chart.js voor visualisaties
- Lucide React voor iconen
- Alle data in-memory (géén database, géén environment variables, géén authenticatie)

### Demo-uitgangspunten
- Dit is een mock-up/MVP: alles moet in één sessie werkend zijn en direct op localhost te zien.
- Geen backend, geen database queries, geen login — gebruik uitsluitend fictieve, in-memory dummy data.
- De primaire visualisatie is de ster van de show; maak die echt mooi en interactief, binnen de interface-eisen hierboven.
- Responsive ontwerp: het werkt op desktop en stackt netjes op mobiel.

### Implementatievolgorde (richtlijn)
1. Setup React + Vite project met Tailwind CSS.
2. Genereer de dummy data (entiteiten, hiërarchie en realistische, licht variërende waarden).
3. Zet het vaste raster neer met de drie niveaus.
4. Bouw de primaire view / hoofdvisualisatie.
5. Voeg selectie- en filterlogica toe (dropdowns, filters).
6. Bereken de statistieken en de vergelijkingswaarde per cijfer, zodat elke KPI zijn context toont.
7. Bouw de overige views (tabs) volgens hetzelfde raster.
8. Voeg interacties toe: hover voor extra detail (nooit voor het label zelf), klik om te sorteren, filters.
9. Responsive styling en visuele polish.

### MULTI-AGENT ONDERSTEUNING
Als je omgeving subagents of parallelle agents ondersteunt: verdeel het werk en voer het parallel uit voor maximale snelheid — bijvoorbeeld één agent per view/tab, één voor het dummy-datamodel en één voor de gedeelde styling/layout. Houd de dummy-datastructuur, de TypeScript-types en het rasterschema als gedeeld contract zodat de agents op elkaar aansluiten, en voeg het werk daarna samen tot één werkende app.

### VERPLICHTE EINDCHECK (vóór je "klaar" meldt)
1. Voer `npm run build` uit en los ALLE fouten op. Dit vangt verzonnen of niet-bestaande imports en icoon-namen (bijv. uit lucide-react) die `npm run dev` pas in de browser zou laten crashen.
2. Verzin géén API-, component- of icoon-namen — controleer dat elk geïmporteerd symbool écht bestaat in de geïnstalleerde versie.
3. Loop de vijf interface-eisen na op elk scherm: drie niveaus, korte labels, context bij elk cijfer, kleur alleen functioneel, alles zichtbaar in het raster.
4. Start daarna `npm run dev`, gebruik één dev-server, en meld de exacte URL/poort die Vite teruggeeft.$tpl$
where name = 'BLUEPRINT (Vibecode Prototype)';

update techniques
set template = $tpl$# B — BUSINESS (doel, probleem & gebruikers):
{{business}}

# L — LAYOUT (vormgeving & designtaal):
{{layout}}

# U — USE CASES (gebruikersreizen & interacties):
{{use_cases}}

# E — EXTERNAL (externe koppelingen & integraties):
{{ecosystems}}

# P — PLATFORM (techniek, stack & performance):
{{platform}}

# R — RULES (regels, rollen & restricties):
{{rules}}

# I — INFORMATION (informatiearchitectuur & datamodel):
{{information}}

# N — NON-FUNCTIONAL (niet-functionele eisen & kwaliteit):
{{nonfunctional}}

# T — TESTING (testen, planning & deployment):
{{testing}}

---

## VASTE INTERFACE-EISEN (altijd toepassen, ze gaan boven een wens uit LAYOUT)

Elk scherm, elk dashboard en elke rapportage in deze specificatie voldoet aan:

1. Visuele hiërarchie met maximaal drie niveaus. Niveau 1: de belangrijkste cijfers, het grootst en linksboven. Niveau 2: grafieken en verdelingen. Niveau 3: detailtabellen en filters, kleiner en lager op de pagina.
2. De data spreekt, de tekst niet. Geen introparagraaf, geen uitleg boven een blok, geen tooltip die een ontbrekend label moet goedmaken. Elk label is maximaal drie woorden.
3. Elk cijfer krijgt context in hetzelfde blok: een vergelijking met de vorige periode, een trend of een doelwaarde. De gebruiker hoeft niets te interpreteren.
4. Kleur is functioneel. Rood en groen uitsluitend voor status of voor afwijking van een norm, nooit als versiering. De rest van de interface blijft neutraal.
5. Vaste indeling in een raster. Alle secties staan altijd zichtbaar op een vast grid: geen accordeons, geen inklapbare panelen en geen knop die inhoud pas later toont.

Raster per scherm (schema, vul het met de eigen inhoud):

    [ KPI ] [ KPI ] [ KPI ] [ KPI ]        niveau 1, groot, elk met context
    [ hoofdvisualisatie 2/3 ] [ verdeling 1/3 ]   niveau 2
    [ detailtabel over de volle breedte ]         niveau 3

Op mobiel stackt dit raster in dezelfde volgorde, zonder secties te verbergen.

Werk de LAYOUT-sectie van de specificatie uit binnen deze eisen: benoem per scherm welke cijfers op niveau 1 staan, welke vergelijkingswaarde erbij hoort, en waar elk blok in het raster valt.

---

Gebruik de bovenstaande BLUEPRINT-secties om een volledige specificatie en een concreet implementatieplan voor de webapplicatie te genereren:
{{PROMPT}}$tpl$
where name = 'BLUEPRINT (Vibecode)';

-- De vraagtekst bij LAYOUT (en VIEWS) stuurde nog aan op decoratieve kleur en
-- op tooltips als drager van informatie. Bijgesteld naar de interface-eisen.
update techniques
set follow_up_questions = (
  select jsonb_agg(
    case
      when q->>'id' = 'layout' then jsonb_set(q, '{placeholder}', to_jsonb(
        'Beschrijf de visuele richting binnen de vaste interface-eisen. Voorbeeld: rustige, neutrale basis met de rijkshuisstijl; drie niveaus per scherm met de kerncijfers groot linksboven; kleur alleen om status of afwijking te tonen (rood onder de norm, groen erboven), de rest grijs of blauw; header met tab-navigatie; vast grid dat op mobiel in dezelfde volgorde stackt.'::text))
      when q->>'id' = 'views' then jsonb_set(q, '{placeholder}', to_jsonb(
        'Beschrijf 2 à 4 tabs/weergaven en per view welke cijfers op niveau 1 staan, welke visualisatie niveau 2 vult en welke tabel niveau 3. Noem per cijfer de vergelijkingswaarde. Markeer welke view de star of the show is. Voorbeeld:'
        || chr(10) || 'View 1 — Team Dashboard (PRIMARY): niveau 1 vier KPI-tegels (teamgemiddelde met verschil t.o.v. vorige meting, aantal aandachtspunten t.o.v. norm); niveau 2 heatmap-grid rijen = competenties, kolommen = teamleden, kleur alleen voor afwijking van de norm; niveau 3 sorteerbare detailtabel.'
        || chr(10) || 'View 2 — Individueel profiel: niveau 1 drie KPI-tegels met doelwaarde; niveau 2 radar die twee scores vergelijkt; niveau 3 tabel met de grootste verschillen.'::text))
      else q
    end
    order by ord
  )
  from jsonb_array_elements(follow_up_questions) with ordinality as t(q, ord)
)
where name = 'BLUEPRINT (Vibecode Prototype)';

update techniques
set follow_up_questions = (
  select jsonb_agg(
    case
      when q->>'id' = 'layout' then jsonb_set(q, '{placeholder}', to_jsonb(
        'Welke visuele stijl en welke huisstijl- of kleurrichtlijnen gelden? Welke schermen zijn nodig? Beschrijf per scherm welke cijfers op niveau 1 staan en welke vergelijking of doelwaarde erbij hoort, welke visualisatie niveau 2 vult en welke detailtabel niveau 3. Kleur blijft functioneel: rood en groen alleen voor status of afwijking. Mobile-first, desktop-first of device-agnostisch?'::text))
      else q
    end
    order by ord
  )
  from jsonb_array_elements(follow_up_questions) with ordinality as t(q, ord)
)
where name = 'BLUEPRINT (Vibecode)';
