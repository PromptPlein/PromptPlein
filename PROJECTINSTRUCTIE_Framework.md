# Wat een projectinstructie nodig heeft

Dit is geen raamwerk met een naam en geen ezelsbruggetje. Het is de checklist waar de
"verbeter"-knop bij de projectinstructie op stuurt, en de reden waarom elk punt erin staat.
Niemand hoeft dit te onthouden; het bestaat alleen om de kwaliteit van die ene herschrijving te
bewaken.

De uitvoerbare versie staat in `DEFAULT_PROJECT_OPTIMIZE_PROMPT`
([src/services/settingsService.ts](src/services/settingsService.ts)), gespiegeld als
`PROJECT_OPTIMIZE_SYSTEM_PROMPT` in
[supabase/functions/optimize-prompt/index.ts](supabase/functions/optimize-prompt/index.ts).

---

## Waar een projectinstructie voor dient: het gokwerk in beurt 1 wegnemen

Dit is de kern, en het is gemeten. [LLMs Get Lost In Multi-Turn
Conversation](https://arxiv.org/abs/2505.06120) (ICLR 2026, 200.000+ gesimuleerde gesprekken) vindt
een **prestatiedaling van 39%** zodra een taak over meerdere beurten loopt in plaats van in één keer
volledig gespecificeerd. De oorzaak is niet dat het model dommer wordt — de aptitude daalt 16% —
maar dat de **betrouwbaarheid met 112% instort**:

> *"LLMs often make assumptions in early turns and prematurely attempt to generate final solutions,
> on which they overly rely… when LLMs take a wrong turn in a conversation, they get lost and do not
> recover."*

Elk nieuw gesprek in een project is beurt 1. Alles wat de assistent daar zelf moet raden — voor wie
is dit, hoe lang, wat lever ik op — raadt hij één keer, en daar houdt hij het hele gesprek aan vast.

**Daaruit volgt de inhoudstest:** een regel hoort in de projectinstructie als hij een gok wegneemt
die de assistent anders in beurt 1 zou maken. Kan hij dat niet, dan hoort hij in het chatbericht of
nergens.

Dat verklaart ook waarom een projectinstructie andere eisen stelt dan een prompt:

| Losse prompt                     | Projectinstructie                              |
| -------------------------------- | ---------------------------------------------- |
| Eén vraag, één antwoord          | Elke vraag in dit project, elk antwoord         |
| Mag over deze ene tekst gaan     | Moet over álle teksten in dit project gaan      |
| Details van dit geval horen erin | Details van dit geval horen in het chatbericht  |
| Een fout merk je meteen          | Een fout herhaalt zich in elk volgend gesprek   |

---

## De zes dingen die erin horen

Elk punt geldt **alleen voor zover de gebruiker er iets over zegt**. Een punt waar hij over zwijgt,
blijft weg — zie "De belangrijkste regel" hieronder.

### 1. Wie de assistent is en voor wie hij werkt

Een model zonder rol valt terug op algemeen assistent-gedrag: uitleggerig, voorzichtig, overal een
slag om de arm. Anthropic's eigen documentatie is hier stellig: *"Setting a role in the system prompt
focuses Claude's behavior and tone for your use case. Even a single sentence makes a difference."*
Het is bovendien het enige onderdeel dat élk volgend gesprek weer op dezelfde plek laat beginnen.

De rol moet scherp genoeg zijn om te knellen. "Je schrijft goed" knelt niet; het vak, het onderwerp
en de lezer wel.

### 2. Wat er elk gesprek uit moet komen — en wat niet

Zonder vast eindproduct raadt het model per beurt opnieuw wat er wordt verwacht: de ene keer een
advies, de andere keer de tekst zelf. Dit is wat een project een project maakt in plaats van een map
met losse gesprekken.

De negatieve helft is even belangrijk en wordt bijna altijd vergeten: wat levert hij *niet*? Geen
aanhef, geen slotgroet, geen toelichting vooraf.

### 3. Waaraan je ziet dat het goed is — met een voorbeeld

Dit is de hoogste hefboom in het hele blok, en tegelijk het element dat gebruikers het minst vaak
opschrijven. Anthropic noemt voorbeelden *"one of the most reliable ways to steer Claude's output
format, tone, and structure"*.

Bijvoeglijke naamwoorden doen hier geen werk. Bij "helder en professioneel" middelt het model over
miljoenen teksten en levert het mediane output — elk antwoord voldoet immers al aan die woorden. Eén
echte voorbeeldzin, een genoemd referentiepunt of een before/after stuurt meer dan een hele rij
adjectieven.

### 4. De regels — met de reden erbij

Ook dit is officieel Anthropic-advies, met dit voorbeeld:

> *Minder effectief:* `NEVER use ellipses`
> *Effectiever:* `Your response will be read aloud by a text-to-speech engine, so never use ellipses
> since the text-to-speech engine will not know how to pronounce them.`
>
> *"Claude is smart enough to generalize from the explanation."*

Een kale regel dekt alleen de gevallen die de gebruiker heeft voorzien. Een regel mét zijn reden
dekt ook de rest. Bij een dyslexie-project is het verschil tussen "verander mijn schrijfstijl niet"
en "de fouten zitten in mijn zinsbouw, niet in mijn woordkeus — laat mijn woorden dus staan" precies
het verschil tussen een assistent die in onvoorziene gevallen gokt en één die het snapt.

### 5. De namen, termen en schrijfwijzen die precies zo moeten blijven

Trainingsnamen, productnamen, notaties voor bedragen. Dit is bij uitstek waarvoor iemand een project
aanmaakt, en bij uitstek wat een herschrijver "opruimt": "mindfulness en de overgang" kortte in de
praktijk in tot "mindfulness".

### 6. Wat er gebeurt als informatie ontbreekt

Elke instructie loopt een keer tegen een geval aan dat er niet in staat. Zonder afgesproken uitweg
vult het model het gat zelf — precies het gedrag dat het 39%-onderzoek beschrijft.

**Maar deze uitweg mag niet worden verzonnen.** Een zelfbedachte "geef dan geen antwoord en meld dat
niet" laat de assistent stilvallen op momenten waarop de gebruiker gewoon werk verwacht. Staat er
niets over in de ruwe tekst, dan blijft dit punt leeg en vult de gebruiker het zelf aan.

### Wat er níét standaard in hoort: een stappenlijst

Een eerdere versie eiste drie tot vijf vaste stappen per beurt. In de praktijk leverde dat pure
verdubbeling op: de stappen schreven de regels een tweede keer op, in andere woorden. Volgens het
stapelingsonderzoek hieronder is dat actief schadelijk. Een stappenlijst hoort er alleen in als het
werk een échte volgorde kent — eerst uitzoeken, dan opzetten, dan schrijven.

---

## De belangrijkste regel: niets toevoegen

Bij het testen bleek dit veruit de grootste faalmodus, en hij trad bij elke testgebruiker opnieuw op.
Er zijn twee onafhankelijke redenen waarom de schade groter is dan hij lijkt.

**Reden 1: de fout herhaalt zich onzichtbaar.** Een verzonnen regel in een losse prompt kost je één
slecht antwoord. In een projectinstructie kost hij je élk antwoord, maandenlang, zonder dat je weet
waar het vandaan komt.

**Reden 2: een verzonnen regel verzwakt de échte regels.** Dit is het minst intuïtieve deel. De kans
dat *alle* instructies in een prompt worden opgevolgd, daalt **ongeveer exponentieel met het aantal
instructies** ([Instruction Stacking Collapse](https://arxiv.org/html/2608.02639)). Een instructie
erbij verzinnen is dus niet alleen zelf fout — het maakt ook de regels die de gebruiker wél heeft
opgeschreven minder waarschijnlijk om te worden gevolgd. Daar komt bij dat de scheiding tussen
systeem- en gebruikersinstructies geen betrouwbare hiërarchie oplevert ([Control
Illusion](https://arxiv.org/pdf/2502.15851)): je kunt een verzonnen regel dus ook niet "overrulen"
met een latere.

Dat maakt schrappen geen kwestie van netheid maar van werking. Wat er expliciet verboden moet worden:

- **geen enkele grens op de omvang.** Niet in woorden, en ook niet in zinnen, alinea's, punten of
  tekens. Een eerdere versie verbood alleen "een maximum aantal woorden"; het model schreef daarna
  gewoon "maximaal drie zinnen" bij een gebruiker die "kort en krachtig" had gezegd.
- **geen aanspreekvorm of toon** die niet in zijn tekst stond.
- **geen opmaakregel** die hij niet heeft gevraagd.
- **geen zelfbedachte uitweg.** Niet om na te vragen, niet om te bevestigen, en zeker niet om te
  zwijgen. In de praktijk verscheen "als er niets bruikbaars in staat, geef je geen feedback en
  vermeld je dat niet" — een assistent die stilvalt zonder te zeggen waarom.
- **geen organisatie, doelgroep of voorbeelden** die hij niet heeft gegeven. De projectnaam en de
  namen van de bronbestanden gaan wél als context mee en mogen worden gebruikt.

Een handzame toets om te bepalen wat blijft: **kun je aan een antwoord zien of de regel is nageleefd
of overtreden?** Zo nee, schrappen. "Wees behulpzaam" is niet toetsbaar en wordt daarom genegeerd;
"laat de aanhef weg" wel. Elke regel is zo een uitspraak die je kunt controleren in plaats van een
wens.

Twee bijzondere gevallen die in de praktijk misgingen:

**Voorbeelden in de instructie worden overgenomen als inhoud.** Een eerdere versie van de
herschrijfprompt zei letterlijk: *wees concreet — schrijf "hooguit 150 woorden" in plaats van
"kort", en "in de wij-vorm" in plaats van "professioneel"*. Die twee voorbeelden doken daarna
onveranderd op in het resultaat van een gebruiker die het over dyslexie en zakelijke e-mails had.
Het model kan de instructie voor zichzelf niet betrouwbaar scheiden van de inhoud die het moet
produceren. Concreetheid moet daarom uit de tekst van de gebruiker komen, niet uit een voorbeeld
in de instructie.

**Namen en notaties moeten letterlijk blijven.** Trainingsnamen, productnamen en schrijfwijzen van
bedragen zijn precies het soort detail waar een gebruiker een project voor aanmaakt. "mindfulness
en de overgang" mag niet inkorten tot "mindfulness", en een zelf bedacht bedragformaat mag niet in
de plaats komen van dat van de gebruiker.

---

## Wat het resultaat moet zijn

**Platte tekst, zonder opmaakmarkeringen.** Hier komen twee redenen samen. De praktische: het
resultaat komt in een gewoon tekstveld terecht, niet in een markdown-weergave, dus sterretjes rond
woorden worden getoond als sterretjes. De tweede is subtieler en staat in Anthropic's eigen
documentatie: *"removing markdown from your prompt can reduce the volume of markdown in the
output."* De opmaak van de instructie stuurt dus de opmaak van de antwoorden — markdown in de
projectinstructie maakt het waarschijnlijker dat de assistent zélf overal vet gaat gebruiken.

De herschrijver mag daarom geen `**vet**`, geen `#`-koppen en geen `_cursief_` gebruiken. De edge
function haalt ze er bovendien alsnog uit (`stripMarkdownEmphasis`), want een model dat gevraagd
wordt níét vet te schrijven, doet het toch met enige regelmaat.

**Natuurlijk, foutloos Nederlands.** Het model calqueert Engelse uitdrukkingen terug: "ik zit lekker
in mijn vel" werd "ik zit lekker in mijn huid". Zie
[Onze Taal over anglicismen](https://onzetaal.nl/taalloket/anglicismen). Ook verzonnen woorden
("leegformules") en wisselende werkwoordsvormen binnen één opsomming komen voor.

**Geen zichtbare kopjes uit deze checklist.** De zes punten hierboven zijn de checklist van de
schrijver, niet de indeling van het resultaat. Kopjes als "Afspraken over vorm en toon" of
"Signalen" horen niet in de uitvoer.

**Eén vaste vorm:**

```
[Eén alinea: rol, situatie en het vaste eindproduct.]

Werkwijze:
- [stap of afspraak]
- [stap of afspraak]
- [wat te doen bij twijfel]
```

Dat is dezelfde vorm als de ingebouwde basisinstructie waar een projectinstructie onder komt te
staan, zodat de twee als één tekst lezen in plaats van als twee stemmen.

**Alleen de instructie zelf.** Geen inleiding, geen uitleg achteraf, en geen afsluitende vraag aan
de gebruiker.

---

## Waar het in de applicatie zit

- **De knop**: het oranje sterretje rechtsonder in het veld "Projectinstructie" in
  [src/components/chat/ProjectSettingsModal.tsx](src/components/chat/ProjectSettingsModal.tsx).
- **De modus**: `project-optimize` in
  [supabase/functions/optimize-prompt/index.ts](supabase/functions/optimize-prompt/index.ts).
- **Aan/uit en de tekst aanpassen**: Beheer → AI-instellingen → "Projectinstructie omschrijven tot
  systeemprompt".

---

## Bronnen

**Waarom beurt 1 alles bepaalt (39% daling, 112% betrouwbaarheidsverlies)**
[LLMs Get Lost In Multi-Turn Conversation](https://arxiv.org/abs/2505.06120) — Laban et al., ICLR
2026 Oral. Ook via [Microsoft Research](https://www.microsoft.com/en-us/research/publication/llms-get-lost-in-multi-turn-conversation/).

**Waarom elke extra regel de andere regels verzwakt**
[Instruction Stacking Collapse](https://arxiv.org/html/2608.02639) — de kans dat alle instructies
worden opgevolgd daalt ongeveer exponentieel met hun aantal.
[Control Illusion: The Failure of Instruction Hierarchies in LLMs](https://arxiv.org/pdf/2502.15851)
— de systeem/gebruiker-scheiding levert geen betrouwbare hiërarchie op.

**Rol, voorbeelden, de reden achter een regel, en opmaak die de opmaak stuurt**
[Anthropic — Prompting best practices](https://platform.claude.com/docs/en/docs/build-with-claude/prompt-engineering/system-prompts):
*"Even a single sentence makes a difference"* (rol), *"one of the most reliable ways to steer
Claude's output format, tone, and structure"* (voorbeelden), *"Claude is smart enough to generalize
from the explanation"* (de reden erbij), *"removing markdown from your prompt can reduce the volume
of markdown in the output"*, en *"tell Claude what to do instead of what not to do"*.

**Toetsbaarheid, "wat goed is", en waarom vage instructies genegeerd worden**
[Custom Instructions That Actually Work](https://www.betterwithclaude.com/blog/custom-instructions-that-actually-work)
— noemt "what good looks like" de hoogste hefboom, adviseert 300–500 woorden.
[Claude Custom Instructions: Real Examples](https://www.jdhodges.com/blog/claude-ai-custom-instructions-a-real-example-that-actually-works/)
— elke regel moet een uitspraak zijn die het model kan naleven of overtreden.
[Claude Project Instructions: Examples & Templates](https://www.jdhodges.com/blog/claude-project-instructions-examples/)
— neem de correcties op die je herhaaldelijk typt.

**Kennisgrenzen en een afgesproken uitweg bij twijfel**
[LLM Guardrails: Best practices](https://www.datadoghq.com/blog/llm-guardrails-best-practices/),
[Prompt Engineering with Guardrails](https://www.endtrace.com/prompt-engineering-with-guardrails-guide/)

**Positief formuleren, en de kosten van lange of tegenstrijdige instructies**
[Why Positive Prompts Outperform Negative Ones](https://gadlet.com/posts/negative-prompting/),
[System Prompts & Custom Instructions Guide](https://aipromptsx.com/blog/system-prompts-custom-instructions-guide),
[System Prompt Design Best Practices](https://www.buildmvpfast.com/blog/system-prompt-design-best-practices-llm-instructions-engineering-2026),
[How to Write a System Prompt That Actually Works](https://pristren.com/blog/system-prompt-guide-with-examples/)

**Natuurlijk Nederlands in plaats van leenvertalingen**
[Genootschap Onze Taal — anglicismen](https://onzetaal.nl/taalloket/anglicismen)
