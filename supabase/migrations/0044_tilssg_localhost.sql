-- 0044_tilssg_localhost.sql
-- TILSSG levert een werkend dashboard op localhost, geen artifact.
--
-- Een codeeragent als Claude Code maakte van de opdracht soms een artifact of
-- een voorbeeld in de chat in plaats van een project dat lokaal draait. Daarom:
--   * het succes in de /goal-regel eindigt altijd met "draait op localhost en
--     staat open in de browser", zodat de agent pas stopt als dat klopt;
--   * VASTE REGELS verbiedt het artifact en laat de dev-server starten met de
--     browser erbij (Vite: npm run dev -- --open).
--
-- Alleen de template verandert; de velden blijven gelijk.

UPDATE techniques SET template = $tpl$/goal {{taak}}. Success: {{succes}}; het prototype draait op localhost en staat open in de browser. Scope: geen backend, database of login; {{scope}}. {{grens}}.

# INHOUD:
{{inhoud}}

# LAYOUT:
{{layout}}

# VASTE REGELS:
Bouw een echt project in een map op deze computer; maak geen artifact, canvas of voorbeeld in de chat.
Drie niveaus per scherm: kerncijfers groot bovenaan, daaronder de grafieken, onderaan de detailtabel.
Elk cijfer krijgt in hetzelfde blok een vergelijking, trend of doelwaarde.
Kleur alleen voor status of afwijking van een norm; de rest blijft neutraal, in rijkshuisstijl.
Korte labels, geen uitlegtekst boven een blok.
Alles staat zichtbaar in een vast raster; op mobiel onder elkaar in dezelfde volgorde.
React, TypeScript, Vite en Tailwind; alle data in het geheugen, met verzonnen namen.
Gebruik alleen imports en iconen die echt bestaan; draai npm run build en los elke fout op.
Start daarna de dev-server met npm run dev -- --open, zodat de localhost-pagina meteen in de browser opent, en meld de exacte URL.$tpl$
WHERE name = 'TILSSG (Prototype)';

UPDATE techniques SET template = $tpl$/goal {{taak}}. Success: {{succes}}; het dashboard draait op localhost en staat open in de browser. Scope: {{scope}}. {{grens}}.

# INHOUD:
{{inhoud}}

# LAYOUT:
{{layout}}

# VASTE REGELS:
Bouw in een echt project op deze computer; maak geen artifact, canvas of voorbeeld in de chat.
Drie niveaus per scherm: kerncijfers groot bovenaan, daaronder de grafieken, onderaan de detailtabel.
Elk cijfer krijgt in hetzelfde blok een vergelijking, trend of doelwaarde.
Kleur alleen voor status of afwijking van een norm; de rest blijft neutraal, in rijkshuisstijl.
Korte labels, geen uitlegtekst boven een blok.
Alles staat zichtbaar in een vast raster; op mobiel onder elkaar in dezelfde volgorde.
Volg de stack en opzet van het project; geen nieuwe afhankelijkheid zonder reden.
Elke rol ziet alleen de data waar hij recht op heeft; controleer dat op de server, niet alleen in de interface.
Geen echte persoonsgegevens, wachtwoorden of sleutels in code of tests; toegankelijk volgens WCAG 2.1 AA.
Draai de build en de tests en los elke fout op.
Start daarna de dev-server van het project, open de localhost-pagina meteen in de browser en meld de exacte URL.$tpl$
WHERE name = 'TILSSG (Dashboard)';
