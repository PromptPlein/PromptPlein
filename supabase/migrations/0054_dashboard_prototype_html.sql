-- 0054_dashboard_prototype_html.sql
-- Dashboard (Prototype) levert voortaan één los HTML-bestand, of een artifact
-- als Claude de opdracht uitvoert, in plaats van een React-project met
-- TypeScript, Vite en npm. Zo staat een prototype er in één beurt en opent het
-- zonder installatie. 0044 verbood het artifact nog; dat draait dit terug.
-- Dashboard (Volledig) blijft een echt project.
--
-- Nieuw in de vaste regels: elk punt uit INHOUD en LAYOUT komt in het
-- prototype, zodat wat de gebruiker in de velden aanpaste niet wegvalt.

UPDATE techniques
SET template = $tpl$/goal {{taak}}. Success: het prototype is één HTML-bestand dat zonder installatie in de browser opent; {{succes}}. Scope: geen backend, database, login of build-stap; {{scope}}. {{grens}}.

# INHOUD:
{{inhoud}}

# LAYOUT:
{{layout}}

# VASTE REGELS:
Lever één los HTML-bestand met alle CSS en JavaScript erin; geen React, TypeScript, Vite, npm of andere projectbestanden.
Werk je in Claude, maak het prototype dan als artifact; werk je elders, schrijf dan het bestand dashboard.html en open het in de browser.
Een grafiekbibliotheek mag alleen via een CDN-link met een vaste versie, zoals Chart.js; zonder bibliotheek is beter.
Bouw elk punt uit INHOUD en LAYOUT; laat niets weg en vervang niets door iets anders.
Drie niveaus per scherm: kerncijfers groot bovenaan, daaronder de grafieken, onderaan de detailtabel.
Elk cijfer krijgt in hetzelfde blok een vergelijking, trend of doelwaarde.
Kleur alleen voor status of afwijking van een norm; de rest blijft neutraal, in rijkshuisstijl.
Korte labels, geen uitlegtekst boven een blok.
Alles staat zichtbaar in een vast raster; op mobiel onder elkaar in dezelfde volgorde.
Alle data staat in het script, met verzonnen namen.
Open het bestand, klik elke tab en elk filter aan en los elke fout in de console op voor je klaar meldt.$tpl$,
    strength = 'Kies dit om een idee voor een dashboard of tool snel tastbaar te maken, als één HTML-bestand zonder backend, database of login. INHOUD en LAYOUT leggen vast wat er op elk scherm staat en hoe het eruitziet. SUCCES maakt het af controleerbaar, SCOPE en GRENS houden de agent binnen het prototype. De vaste regels zorgen voor een rustig, datagericht scherm in rijkshuisstijl.',
    follow_up_questions = (
      SELECT jsonb_agg(
        CASE WHEN q->>'id' = 'succes'
          THEN jsonb_set(q, '{placeholder}', to_jsonb('Wel: iets wat je ziet als je het bestand opent. Niet: een gevoel zoals mooi of goed. Bijvoorbeeld: het bestand opent in de browser zonder fouten in de console en elke tab toont zijn cijfers met nepdata.'::text))
          ELSE q
        END
        ORDER BY ord
      )
      FROM jsonb_array_elements(follow_up_questions) WITH ORDINALITY AS t(q, ord)
    )
WHERE name = 'Dashboard (Prototype)';
