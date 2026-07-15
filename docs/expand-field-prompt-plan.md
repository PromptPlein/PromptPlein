# Implementatieplan — "Vul verder aan"-prompt neutraliseren voor PromptHub

**Doel:** de system-prompt van de per-veld "Vul verder aan"-functie herschrijven tot een
**domein-neutrale** versie (geen enkele verwijzing naar overheid/rijksoverheid/burger), die
puur de techniek beschrijft, zodat hij één-op-één in **PromptHub** kan worden opgeslagen en
hergebruikt. De prompt verbetert één framework-veld op basis van de veld-omschrijving, en
**verzint nooit nieuwe inhoud** die de gebruiker niet zelf aandroeg.

**Gekozen gedrag (vastgesteld met de gebruiker):**
- **Alleen de PromptHub-prompt** herschrijven (geen wijziging aan de app-code / edge function).
- **Volledig domein-neutraal:** geen overheid, geen doelgroep-aanname. De gewenste toon/taalniveau
  volgen uit de veld-omschrijving en de bestaande tekst, niet uit een opgelegde standaard.
- **Alleen verbeteren, niets verzinnen:** wat de gebruiker weglaat of verwijdert, blijft weg.

---

## Belangrijkste inzicht: dit is een prompt-wijziging, geen code-wijziging

De feature bestaat al in de app (de `expand-field`-modus in
`supabase/functions/optimize-prompt/index.ts`). Voor PromptHub extraheren en neutraliseren we
alleen de **prompt-tekst**. **Geen edge-function-wijziging, geen client-helper, geen deploy.**

De bron is `EXPAND_FIELD_SYSTEM_PROMPT` (edge function, rond regel 1374). Die versie is
overheid-specifiek. De PromptHub-versie is dezelfde technische kern, ontdaan van domein-taal.

---

## Aanleiding: waarom "alleen verbeteren, niets verzinnen"

Uit de test van de gebruiker: een RULES-veld waar de gebruiker bewust de regel "Gebruik deze
afkortingen (lijst afkortingen)" had **verwijderd**. Na "Vul verder aan" bracht de AI die regel
terug (als `[lijst met relevante afkortingen]`). Oorzaak: **geen cache** — de vorige prompt
instrueerde de AI om "ontbrekende" onderdelen proactief aan te vullen. De AI verzon onafhankelijk
exact het soort regel dat net was geschrapt. De fix zit dus in de prompt: proactief aanvullen
blokkeren.

---

## De twee prompt-onderdelen (voor PromptHub)

### A. System-prompt (domein-neutraal)

```
Je bent een expert in prompt-engineering. Een gebruiker bouwt een prompt met een framework dat uit
meerdere VELDEN (bouwstenen) bestaat. De gebruiker heeft ÉÉN veld ingevuld en vraagt je dit veld te
verbeteren.

JOUW TAAK
Lever een BETERE, professionelere versie van ALLEEN dit ene veld. Je scherpt aan wat de gebruiker
zelf schreef — je herschrijft geen andere velden en verzint geen nieuwe inhoud.

DE VELD-OMSCHRIJVING IS LEIDEND
Het LABEL en de VOORBEELD/PLACEHOLDER (hieronder meegegeven) beschrijven EXACT wat er in dit veld
hoort. Die omschrijving is bepalend — belangrijker dan elke aanname over de veldnaam.
- Vraagt de omschrijving bijv. om "de rol, het publiek en de beschikbare informatie", beschrijf dan
  die onderdelen, ook al heet het veld "CONTEXT".
- Ga NIET af op wat een veld met die naam "normaal" bevat als de omschrijving iets anders vraagt.
  De omschrijving wint altijd.

ALLEEN VERBETEREN — NIETS NIEUWS VERZINNEN (belangrijkste regel)
- Verbeter uitsluitend wat de gebruiker AL heeft geschreven: formulering, structuur, volgorde, toon,
  spelling/typo's en duidelijkheid. Maak het scherper en professioneler.
- Voeg GEEN nieuwe eisen, regels, onderwerpen, voorbeelden of feiten toe die de gebruiker niet
  noemde. Wat de gebruiker weglaat of verwijdert, blijft weg — jij brengt het niet terug.
- Vul GEEN "ontbrekende" onderdelen aan en gebruik GEEN placeholders voor zaken die de gebruiker
  niet zelf aandroeg. Je completeert niet; je verbetert.
- Verzin geen aannames over de bedoeling. Blijf strikt binnen de inhoud die er staat.
- Behoud alle concrete details die de gebruiker noemde (namen, aantallen, onderwerpen, stappen,
  eisen); je mag ze herformuleren en ordenen, maar niet weglaten of vervangen.

SCHRIJFWIJZE
- Schrijf in heldere, correcte taal. De gewenste toon en het taalniveau volgen uit de veld-
  omschrijving en de bestaande tekst; leg zelf geen toon op die daar niet uit blijkt.
- Lever alleen de inhoud van het veld: geen label, geen kop, geen aanhalingstekens eromheen.

UITVOER
Geef UITSLUITEND geldige JSON terug, zonder codeblok of extra tekst, in dit formaat:
{"value":"<verbeterde inhoud voor dit veld>","changed":true|false,"improvements":["<korte verbetering>", "..."]}

- "value": de verbeterde veldtekst.
- "changed": true als je de tekst hebt verbeterd; false als de tekst al goed was en je hem (vrijwel)
  onveranderd laat — geef dan de originele tekst terug.
- "improvements": 2 tot 4 korte punten (max. ~8 woorden elk) die benoemen WAT je verbeterde t.o.v.
  de invoer, bijv. "Toon verduidelijkt" of "Typo gecorrigeerd (nivea → niveau)". Bij "changed":false
  een lege lijst. Vermeld hier NOOIT toevoegingen van nieuwe inhoud.
```

### B. User-message format (wat per aanroep wordt meegestuurd)

```
VELD-OMSCHRIJVING (LEIDEND):
- Titel van het veld: {{veld_label}}
- Wat hier moet komen: {{veld_placeholder}}

HUIDIGE INHOUD VAN DIT VELD (verbeter uitsluitend deze tekst):
"""
{{huidige_tekst}}
"""

DE OVERIGE VELDEN (alleen ter afstemming — NIET aanpassen, NIET herhalen, NIET als bron voor nieuwe inhoud):
{{overige_velden}}
```

---

## Variabelen

| Variabele | Betekenis | Voorbeeld |
|---|---|---|
| `{{veld_label}}` | De titel/label van het veld (leidend) | `RULES — stel regels aan het antwoord (toon, woordlimiet, wat de AI moet vermijden)` |
| `{{veld_placeholder}}` | De voorbeeld/uitleg-tekst bij het veld | `Bijv. formeel, max. 500 woorden, geen jargon` |
| `{{huidige_tekst}}` | Wat de gebruiker in dit veld typte | *(de tekst van de gebruiker)* |
| `{{overige_velden}}` | De andere velden als `- <label>: <waarde>`-regels, of `(geen andere velden)` | `- CONTEXT — achtergrond: …` |

---

## Verwacht JSON-antwoord

```json
{
  "value": "De verbeterde veldtekst.",
  "changed": true,
  "improvements": ["Toon verduidelijkt", "Typo gecorrigeerd (nivea → niveau)"]
}
```

- Bij een al goed veld: `"changed": false` en `"improvements": []`, met de originele tekst als `value`.

---

## Wat ik heb aangepast t.o.v. de overheid-versie

| # | Was (overheid-versie) | Nu (neutraal) |
|---|---|---|
| 1 | "expert in prompt-engineering **voor de Nederlandse rijksoverheid**" | "expert in prompt-engineering" |
| 2 | "Een **interne overheidsmedewerker** bouwt…" | "Een **gebruiker** bouwt…" |
| 3 | Voorbeeld: "**jouw rol**, het publiek en de informatie die je hebt" | "**de rol**, het publiek en de beschikbare informatie" (onpersoonlijk) |
| 4 | "Helder Nederlands (**B1-taalniveau** waar passend), **intern gericht (overheidsmedewerker, niet de burger)**" | "Schrijf in heldere, correcte taal. **Toon/taalniveau volgen uit de veld-omschrijving en bestaande tekst**" |
| 5 | WERKWIJZE stap: "Ontbreekt een gevraagd onderdeel, **vul het dan aan** (algemeen of met een [plaatshouder])" | **Verwijderd** — vervangen door de "ALLEEN VERBETEREN — NIETS NIEUWS VERZINNEN"-regels |
| 6 | "changed: false alleen als het veld al **uitstekend** was" | "…al **goed** was" (neutralere woordkeuze) |

**Ongewijzigd gebleven** (de technische kern): veld-omschrijving is leidend, behoud van concrete
details, JSON-structuur `{value, changed, improvements}`, en de regel dat `improvements` nooit
verzonnen toevoegingen vermeldt.

---

## Ontwerpkeuzes (bewust)

1. **Veld-omschrijving is leidend, niet de veldnaam** → lost de "jouw rol"-fout op: een veld dat
   "CONTEXT" heet maar in de omschrijving om de rol vraagt, krijgt tóch de rol. De AI volgt wat de
   beheerder/gebruiker beschreef, niet een aanname over de naam.
2. **Alleen verbeteren, niets verzinnen** → lost de afkortingen-lijst-terugkeer op. Wat de gebruiker
   verwijdert, blijft weg. Voorspelbaar en veilig.
3. **Geen opgelegde toon** → volledig domein-neutraal; de prompt werkt voor elk onderwerp, niet
   alleen overheidsteksten.
4. **JSON-uitvoer behouden** → PromptHub kan `value` tonen en de `improvements` als "wat is
   verbeterd"-lijstje weergeven, net als in de app.

---

## Verificatie (handmatig in PromptHub)

Test met de originele case van de gebruiker om te bevestigen dat het gedrag klopt:

- **Input (`{{huidige_tekst}}`):** de RULES-tekst *zonder* de afkortingen-regel (die de gebruiker
  bewust verwijderde).
- **Verwacht:** `value` bevat alleen verbeteringen op de bestaande regels (bv. `nivea → niveau`,
  toon aangescherpt, structuur netter). **Géén** teruggekeerde afkortingen-regel, **geen** nieuwe
  verzonnen eisen. `improvements` noemt alleen echte verbeteringen.
- **Tegentest (al goed veld):** een nette, complete veldtekst → `"changed": false`,
  `"improvements": []`, `value` gelijk aan de input.
- **Veld-omschrijving-test:** een veld met label "CONTEXT" en placeholder "de rol, het publiek en de
  beschikbare informatie" → `value` beschrijft óók de rol (niet alleen de situatie).

---

## Wat NIET nodig is (expliciet)

- ❌ Geen wijziging aan `supabase/functions/optimize-prompt/index.ts` (dit plan gaat over de
  losse PromptHub-prompt, niet de live app-prompt).
- ❌ Geen `supabase functions deploy`.
- ❌ Geen client-/UI-wijziging.
- ❌ Geen overheid-, doelgroep- of taalniveau-specifieke instructies in de prompt.
