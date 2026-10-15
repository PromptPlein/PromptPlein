-- 0040_routekaart_downloadbaar.sql
-- Routekaart (rijksstijl): de opdracht vraagt nu om een downloadbaar bestand.
--
-- Tot nu toe vroeg het blok Oplevering alleen om de code in één codeblok. Dan
-- moest de medewerker zelf een leeg bestand maken, de code erin plakken en het
-- als .html opslaan; precies de stap waar iemand zonder programmeerervaring
-- vastloopt. Nu vraagt de opdracht eerst om één kant-en-klaar HTML-bestand om
-- te downloaden, met alles erin. Kan de assistent geen bestanden maken, dan
-- blijft het ene codeblok de terugval. Een zipbestand mag alleen als het echt
-- niet in één bestand past.
--
-- Alleen het blok Oplevering verandert; de rest van het sjabloon blijft staan.

UPDATE techniques
SET template = replace(
  template,
  $old$## Oplevering
- Geef het volledige bestand in één codeblok, zonder weglatingen of "rest blijft gelijk".$old$,
  $new$## Oplevering
- Lever de routekaart als één downloadbaar HTML-bestand met alles erin: HTML, CSS, JavaScript, iconen en alle teksten uit de inhoud. Het bestand werkt zonder andere bestanden; alleen het lettertype komt van internet. Noem het bestand naar de Titel uit KOP, in kleine letters, met koppeltekens in plaats van spaties en .html erachter.
- Kun je bestanden maken (een downloadlink, een artefact of een canvas), maak dan dat bestand aan, zodat ik het meteen kan downloaden en openen.
- Kun je geen bestanden maken, geef dan het volledige bestand in één codeblok, zonder weglatingen of "rest blijft gelijk". Zeg erbij dat ik het opsla als .html en dubbelklik om het te openen.
- Lukt één bestand echt niet, lever dan een zipbestand met alle bestanden en een index.html die de routekaart opent. Eén HTML-bestand heeft altijd de voorkeur.$new$
)
WHERE name = 'Routekaart (rijksstijl)';
