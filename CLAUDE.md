# PromptPlein

Webapplicatie waar medewerkers van de Nederlandse rijksoverheid prompts bouwen,
bewaren, delen en uitproberen. Twee kanten: een promptbouwer die met AI een
herbruikbare prompt-template schrijft, en een chat waarin je die prompt meteen
kunt draaien. Alle interfacetekst is Nederlands.

---

# Deel 1: werkafspraken

## Schrijfregel: geen streepjes tussen zinsdelen

Nooit een gedachtestreepje (— of –) of een los streepje tussen zinsdelen. Niet
in de interface, niet in AI-prompts, niet in commitberichten, niet in code
commentaar en niet in antwoorden aan de gebruiker. Schrijf er een komma, een
puntkomma, een dubbele punt of een punt neer. Streepjes binnen een woord
("kant-en-klaar", "e-mail") mogen wel.

Dit geldt ook voor de tekst die de AI produceert: de systeemprompts in
`supabase/functions/optimize-prompt/index.ts` verbieden het streepje expliciet.
Voeg die regel toe aan elke nieuwe systeemprompt die tekst voor de gebruiker
schrijft.

```
fout: de AI stelt alleen vragen — geen antwoorden of adviezen
goed: de AI stelt alleen vragen, zonder antwoorden of adviezen
```

## Schrijfregel: natuurlijk Nederlands, geen leenvertalingen

De AI-uitvoer moet klinken als Nederlands dat een mens schrijft, niet als
vertaald Engels. Letterlijk vertaalde uitdrukkingen zijn fout: "in mijn huid"
voor *in my skin* moet "in mijn vel" zijn. Verbied zulke constructies in een
systeemprompt met een concreet voorbeeld erbij, niet met de algemene aanwijzing
"schrijf natuurlijk".

## Uitrollen: elke afgeronde wijziging gaat meteen naar productie

`main` is de productietak: Vercel bouwt elke push naar `origin/main` en zet hem
live. Er is geen aparte release-stap en er wordt niet gewacht op akkoord.

Na elke afgeronde wijziging, zonder er eerst naar te vragen:

1. `npx tsc -p tsconfig.app.json --noEmit` moet schoon zijn.
2. Lees de diff (`git diff`, `git status`) en schrijf daar het commitbericht uit:
   het bericht komt uit wat er feitelijk is veranderd, niet uit een sjabloon en
   niet uit wat er gevraagd was.
3. `git add` van de gewijzigde bestanden, `git commit`, `git push origin main`.
4. Meld in het antwoord dat het gepusht is (en dus live gaat).

Raakte de wijziging `supabase/functions/**`, dan hoort daar meteen
`supabase functions deploy <functie>` bij: die code gaat niet mee met de
Vercel-build. Doe dat zonder het eerst te vragen.

### Wanneer juist NIET pushen

De regel geldt voor afgerond werk, niet voor elke tussenstap:

- De typecheck of de build faalt. Eerst repareren; een kapotte push haalt
  productie onderuit.
- Het werk is half af (een deel van een taak, een experiment, een tussenstand
  waar de gebruiker nog iets van moet vinden).
- Er staan geheimen in de diff (`.env`, sleutels, tokens).
- De gebruiker heeft in dit gesprek gezegd dat hij eerst wil kijken.

Staat er werk van de gebruiker zelf in de tree dat nog niet af is, commit dan
alleen je eigen bestanden en laat de rest ongemoeid.

Bij twijfel: afmaken, dan pushen, niet stapelen tot een grote bundel.

### Commitberichten

Kort, Nederlands, in de tegenwoordige tijd, en zeg wát er verandert voor de
gebruiker, niet welke bestanden zijn aangeraakt.

```
fix: lege "Nieuw project" verdwijnt weer bij annuleren
feat: plusje bij Projecten en Chats in de zijbalk
```

## Supabase: welk project, welke MCP-server

**Project ref:** `qpttoyahhjybejgqohfz`
**URL:** `https://qpttoyahhjybejgqohfz.supabase.co` (gelijk aan `VITE_SUPABASE_URL`)

Gebruik in deze repo ALTIJD de project-scoped server uit `.mcp.json`, met
tool-prefix `mcp__supabase__*`. Die zit vast aan bovenstaand project en heeft
geen `project_id`-parameter, dus hij kan de verkeerde database niet raken.
Verifieer vóór elke DDL met `mcp__supabase__get_project_url` dat die URL
teruggegeven wordt.

Gebruik hier NOOIT `mcp__plugin_supabase_supabase__*`. Dat is een globaal
geïnstalleerde plugin die op de Awaren-organisatie is ingelogd (AwarenApp,
MoonMix). Wijzig vanuit PromptPlein niets in Awaren.

Migraties staan in `supabase/migrations/` en gaan via
`mcp__supabase__apply_migration` (snake_case naam plus de SQL). Controleren met
`mcp__supabase__list_migrations` en `mcp__supabase__list_tables`. Verloopt de
auth, dan opnieuw koppelen met
`claude mcp add --scope project --transport http supabase "https://mcp.supabase.com/mcp?project_ref=qpttoyahhjybejgqohfz"`
en daarna `/mcp` in een gewone terminal, niet in de IDE-extensie.

**AIPromptHub is een ander Supabase-project.** De twee repo's delen geen
database. Wordt er code van daar geport, hernummer dan de migratie.

---

# Deel 2: hoe de app in elkaar zit

## Stack en hosting

| Laag | Wat |
| --- | --- |
| Frontend | React 18 + TypeScript + Vite 6, `@/`-alias naar `src/` |
| Styling | Tailwind (Rijkshuisstijl), licht/donker via `ThemeContext` |
| Routing | react-router-dom v6, alle paden Nederlands |
| 3D | react-three-fiber + three.js (achtergrond, organisatienetwerk) |
| Grafieken | recharts, lazy geladen zodat het uit de hoofdbundle blijft |
| Backend | Supabase: Postgres met RLS, Auth, Storage, Edge Functions (Deno) |
| Hosting | Vercel, SPA-rewrite in `vercel.json`, `X-Robots-Tag: noindex` |

Huisstijl: PromptPlein valt onder de Rijksoverheid en voert daarom de
Rijkshuisstijl. Kleuren staan in `src/config/brandColors.js` (lintblauw `#154273`
voor koppen en balken, donkerblauw `#01689B` voor interactie), de vormtaal in
`borderRadius` van de Tailwind-config. Het lettertype Rijks Sans staat in
`src/assets/fonts/` en is niet vrij: nooit naar een openbare repo of ander product
kopiëren. Bron: het thema van RijksICTGilde (`hugo-theme-rijksoverheid`) en de
tokens van `nl-design-system/rijkshuisstijl-community`. De contextmap van de skill
`pas-rijkshuisstijl-toe` staat niet op deze machine.

Iconen komen altijd uit `@/components/common/icons`, niet uit `lucide-react`.
Dat bestand geeft de officiële functionele iconen van de Rijkshuisstijl de
lucide-naam en laat de rest doorlopen uit lucide. Neem een officieel icoon alleen
op als de betekenis gelijk blijft: Star blijft lucide omdat de favorietstatus uit
leeg of gevuld leest.

Env-variabelen (alle vier `VITE_`-prefixed, dus client-side):
`VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`, `VITE_ADMIN_TOKEN`,
`VITE_OPTIMIZE_FUNCTION_URL` (optionele override van de function-URL).

Scripts: `npm run dev`, `npm run build` (= `tsc -b && vite build`),
`npm run preview`, `npm run lint`.

## Twee draaimodi

`src/lib/supabase.ts` exporteert `isSupabaseConfigured`. Ontbreken de
env-variabelen, dan draait de hele app op `src/services/localStore.ts`, een
localStorage-mock met dezelfde vorm als de database. Elke service in
`src/services/` begint daarom met een `if (local) return localStore.…`-tak. Wie
een nieuwe service schrijft, houdt die tweedeling aan.

## Waar wat staat

```
src/
  pages/          één bestand per route; pages/admin/ en pages/auth/ apart
  components/     admin analytics auth chat collaboration common export
                  network optimizer prompts share three
  services/       alle datatoegang; niets praat rechtstreeks met supabase-js
                  buiten deze map
  context/        AuthContext, ReferenceDataContext, ThemeContext
  lib/            supabase-client, ndjsonStream, chatStorage, techniques,
                  persona/fewshot/rubric/stepback/verification, draft-opslag
  config/         aiModels.ts (providers, modellen, prijzen)
  data/           seed.ts, promptExamples.ts
  types/          index.ts, alle domeinmodellen op één plek
supabase/
  functions/      optimize-prompt (de grote), send-contact, register-brevo-contact
  migrations/     0001 … 0035, oplopend genummerd
```

`App.tsx` houdt de routetabel. Zware pagina's (chat, netwerk, community, alle
admin, alles met recharts) worden lazy geladen.

## Auth, rollen en zichtbaarheid

Supabase Auth met e-mail en wachtwoord. `RequireAuth` bewaakt routes en neemt
optioneel een minimale rol (`role="admin"`) plus `allowModerator` voor de
goedkeuringswachtrij, die admins én moderatoren mogen zien. De echte
afdwinging staat in RLS-policies, niet in de frontend: de wachtrij filtert
server-side op wat jij mag beoordelen.

Ingelogd vereist: `/bibliotheek`, `/profiel`, `/netwerk`. De chat (`/chat`)
werkt zonder account; alleen chatprojecten vragen er een. Admin
vereist: alles onder `/admin`. De rest is openbaar, inclusief `/genereren`,
`/zoeken`, `/community`, `/technieken` en `/toegankelijkheid`.

Prompts hebben een zichtbaarheidsniveau met een goedkeuringsstroom
(`visibilityService`, `ApprovalQueuePage`). Organisaties vormen een boom van
ministeries (`orgTree.ts`, migraties 0020/0021/0024).

## Opslagscheiding: dit is een bewuste keuze

- **Postgres**: prompts, gebruikers, organisaties, technieken, categorieën,
  rollen, analytics, audit log, meldingen, chat*projecten* (0030), de persoonlijke
  chatinstructie (`user_chat_preferences`, 0047).
- **localStorage, nooit de database**: de chat*gesprekken* zelf
  (`src/lib/chatStorage.ts`, één bak per browser, met eviction). Ze horen bij
  het apparaat en niet bij het account: ingelogd of niet zie je dezelfde chats,
  en uitloggen wist ze niet. Weg zijn ze pas na verwijderen of het wissen van de
  browsergegevens. Ook in localStorage: de concepten in de bouwer
  (`usePersistentDraft`, zodat een refresh je invoer niet wist).

Chatgesprekken staan bewust niet op de server: dat is de privacybelofte van de
chat. Verplaats ze niet naar Postgres zonder dat expliciet met de gebruiker af
te stemmen.

## Persoonlijke instellingen

`/instellingen` is openbaar en heeft twee onderdelen: Chat en Toegankelijkheid. Je
komt er via het gebruikersmenu, de knop onder in de chatzijbalk en het
toegankelijkheidsicoon in de kop. Dat icoon blijft staan: wie grotere letters
nodig heeft, moet die niet in een menu hoeven zoeken.

De eigen instructie onder Chat vraagt om in te loggen, want hij staat op de server
(`user_chat_preferences`, RLS strikt eigenaar-alleen). Bewust een eigen tabel en
geen kolom op `profiles`: die mag een collega uit dezelfde organisatie lezen.
Verwijderen wist de rij. De pagina noemt de server bewust niet: de eigenaar wil
daar zo min mogelijk tekst.

De instructie vervangt de systeemprompt van de beheerder niet, maar komt eronder
(`composeChatSystemPrompt`), met de tekst uit Beheer, AI-instellingen. Botst een
wens met de huisregels, dan gelden de huisregels. Hij geldt alleen in een gewone
chat: een uitvoergesprek test de prompt zelf en in een project is de
projectinstructie al de instructie van de gebruiker.

## Toegankelijkheid en leesgemak in de chat

De keuzes staan op `/instellingen/toegankelijkheid` (`/toegankelijkheid` verwijst
daarheen). Die pagina is bewust openbaar, omdat de chat ook zonder account werkt.
De keuzes staan per browser in localStorage (`AccessibilityContext`, sleutel
`opl-toegankelijkheid`) en gelden via `<html>`: tekstgrootte als `font-size`
(alles staat in rem, dus reken ook marges in rem), de rest als `data-contrast`,
`data-motion` en `data-actions` met de regels in `index.css`. Code die zelf
animeert vraagt `prefersReducedMotion()`, dat ook de systeeminstelling meeneemt.

Alles bij Toegankelijkheid staat uit tot iemand het zelf aanzet, ook de sneltoetsen
die erbij horen. Een nieuwe instelling krijgt dus de standaardwaarde uit en zijn knop
verschijnt pas als hij aanstaat.

Basistoegankelijkheid is geen instelling en staat altijd aan: skiplink, koppen
per bericht, en een aparte `role="status"` in `ChatMessageList`. Zet de
berichtenlijst nooit zelf in een live-regio: een schermlezer pikt dan elk woord
van een streamend antwoord op.

Sneltoetsen staan op één plek (`src/lib/shortcuts.ts`), altijd Alt + Shift plus een
letter en nooit één losse toets (WCAG 2.1.4). De hulppagina
(`/instellingen/hulp`, `AccessibilityHelp`) leest die lijst. Voeg je iets toe wat je
met stem of toetsenbord bedient, zet het daar dan ook bij: die pagina is de
handleiding voor wie slecht ziet. Schrijf er korte zinnen en noem knoppen bij hun
naam, nooit bij hun plek op het scherm.

De gespreksmodus (`useChatVoice`) is een lus: luisteren, bij stilte versturen,
voorlezen, weer luisteren. De microfoon gaat alleen aan als de gebruiker het gesprek
zelf start en stopt na 30 seconden stilte. Een microfoon die altijd luistert is
bewust niet gebouwd: alles wat iemand op kantoor zegt, zou dan naar Mistral gaan.
Elk gesproken bericht loopt gewoon door de controle op persoonsgegevens. Meld de
stand van het gesprek niet in een live-regio: een schermlezer spreekt die uit terwijl
de microfoon opengaat. Daarvoor zijn de twee tonen in `audioCue.ts`.

Voorlezen (`src/lib/speech.ts`) gebruikt voor wie ingelogd is standaard Lotte, de
natuurlijke stem van Mistral (mode `speech` in de edge function, Voxtral TTS, model
en stem staan daar vast). De tekst komt al van Mistral, dus er komt geen nieuwe
partij bij, en de audio wordt nergens bewaard. Zonder account leest de stem van de
browser voor, en wie ingelogd is kan die zelf kiezen. Vraag de stem op met
`useSpeechVoice`, niet uit `settings.speechVoice`: daar betekent `null` dat er geen
keuze is gemaakt. Lukt het niet, dan leest de browserstem verder. Andere online
stemmen sturen de tekst naar hun eigen leverancier; die worden nooit vanzelf
gekozen.

Een lege chat is klein: begroeting en tekstvak staan samen in het midden, met de
cursor al in het vak. Na het
eerste bericht zakt het tekstvak naar een vaste plek onderaan en vult het gesprek
het venster. Laat de kaart niet meegroeien met de tekst: dan schuift het tekstvak
bij elke regel van het antwoord op, en wie met vergroting werkt raakt het kwijt.

De chat scrolt bewust niet mee: een nieuwe vraag gaat bovenaan staan en het
antwoord groeit eronder, zodat je vanaf het begin in je eigen tempo leest.
"Naar beneden" zet volgen aan, omhoog scrollen zet het weer uit. De leeskolom is
`60ch`, wat in Rijks Sans zo'n 72 tekens per regel is (gemeten). Maak hem niet
breder zonder opnieuw te meten. Het tekstvak heeft dezelfde breedte, zodat vraag
en antwoord op één lijn beginnen.

## De AI-laag

Eén edge function, `optimize-prompt`, ongeveer 8000 regels, met een
`mode`-veld in de body als router. Nieuwe AI-functionaliteit wordt een nieuwe
mode in dat bestand, niet een nieuwe function. De 37 modes, gegroepeerd:

| Groep | Modes |
| --- | --- |
| Streamende vrije tekst | `generate`, `execute`, `chat` |
| Techniek- en frameworkkeuze | `recommend`, `recommend-framework`, `framework-fit`, `technique-advisor` |
| Veldhulp in de bouwer | `analyze`, `prefill`, `expand-field`, `title`, `metadata` |
| PlanWizard | `plan`, `plan-step`, `plan-step-analyze`, `clarify`, `assumption-check` |
| Techniekbouwers | `persona-fill`, `fewshot-example`, `fewshot-extract`, `meta-build`, `cove-scan`, `stepback-ladder`, `rubric-propose`, `skill-draft`, `skill-trigger` |
| Chat en projecten | `chat-optimize`, `project-optimize`, `project-brief`, `project-interview`, `project-prompt`, `context-interview`, `context-prompt` |
| Testkamer-loop | `mock-answer`, `refine`, `refine-suggest` |
| Sjablonen | `sjabloon` |

### Providers en modellen

Aan staat alleen **Mistral**. De keten bij `auto` bestaat dus uit één provider;
valt die om, dan is er geen tweede kans meer, alleen de lokale terugval. De
code voor Claude, OpenAI en DeepSeek staat er nog zodat ze later weer aan
kunnen, maar geen enkele mode roept ze aan en oude opgeslagen instellingen
moeten blijven parsen.

DeepSeek staat sinds 7 september 2026 uit: dat account heeft geen saldo en gaf op
élke aanroep `402 Insufficient Balance`, zodat elke modus na Mistral nog een
kansloze poging deed. Aanzetten is drie plekken terugdraaien:
`ENABLED_PROVIDERS` en `DEFAULT_ORDER` in de edge function, plus
`ENABLED_PROVIDERS` en het item in `AI_MODELS` in `src/config/aiModels.ts`.

Standaardmodellen zijn het eerste item per provider: `deepseek-v4-flash` en
`mistral-small-latest` (Mistral Small 4). Bij Mistral staan bewust de
`-latest`-aliassen in de ids, niet de gedateerde snapshots, want de alias
schuift mee met een nieuwe generatie.

Valt alles om, dan levert de function de ruwe ingevulde template (bij
`generate`) of lokale trefwoord-matching (bij `recommend`).

### Twee lijsten die in sync moeten blijven

`PROVIDER_MODELS` en `STRONGEST_MODEL` staan zowel in de edge function als in
`src/config/aiModels.ts`. De edge function maakt de keuze echt, de config
bestaat alleen om de admin te laten zien wat er gaat draaien. Wijzig je er één,
wijzig dan de andere.

`STRONGEST_MODEL` is **niet** het eerste item uit `PROVIDER_MODELS`. Bij
DeepSeek is Flash de standaard en Pro de sterkere. Bij Mistral staat Small 4 er
als sterkste en niet Medium 3.5: dat kost tien tot twaalf keer zo veel per
token. De kaart is alleen een terugval: `project-optimize` draait op het
chatmodel en `project-brief` op het optimalisatiemodel uit Beheer, net als de
andere modi van die kant (`resolveProjectModel`). Pas als er geen geldig model
gekozen is (provider 'auto', geen model, of een fallback naar een andere
provider) nemen ze `STRONGEST_MODEL` in plaats van het standaardmodel, omdat
die aanroep één keer per projectversie gebeurt en daarna élk gesprek of elke
bouwstap in dat project stuurt. Vroeger overrulede de kaart de beheerder
altijd, waardoor de projectinstructie op Small 4 bleef terwijl de chat al op
Medium 3.5 draaide.

### Uitvoergrens per Mistral-model

`runMistral` kapt `max_tokens` af op `MISTRAL_OUTPUT_LIMIT` (bij
`PROVIDER_MODELS` in de edge function). Voeg je een Mistral-model toe, zet het
daar ook in; een onbekend id krijgt de oude krappe grens van 4096 (8192 met
denken), zodat bijvoorbeeld `project-optimize` zijn 16384 tokens niet haalt.

### Streamen

`generate`, `execute` en `chat` streamen NDJSON: één JSON-object per regel met
`type: meta | delta | done | unclear | error`. Client-side leest
`src/lib/ndjsonStream.ts` dat uit, inclusief `AbortSignal` voor de stopknop en
statusupdates die tonen welk model eraan werkt en of er is teruggevallen.

### Zoeken op internet

De chat kan per beurt het web afzoeken (de knop "Zoeken" naast "Denken"). Het
zoekwerk gebeurt in de edge function; de treffers gaan als bronblok onder de
systeemprompt, net als een bijlage, en komen als `sources`-event ook naar de
client voor de bronnenlijst onder het antwoord.

Welke zoekdienst draait staat in de **secrets** van de function en bewust niet in
`app_settings`: een zoekadres dat de client mag kiezen, mag iedereen kiezen.
`SEARXNG_URL` plus `SEARXNG_TOKEN` (eigen server, de opzet staat in
`infra/searxng/`) heeft voorrang op `TAVILY_API_KEY` (Amerikaanse dienst die de
vragen bewaart). Staat er geen van beide, dan doet de knop niets en antwoordt
het model uit eigen kennis. Aan/uit en de instructie bij de bronnen staan wél in
Beheer, AI-instellingen.

De keuze voor SearXNG is een privacykeuze: het enige wat de chat naar buiten
stuurt is de zoekvraag zelf, en met een eigen server ziet geen derde partij die.
Verplaats het zoeken niet terug naar een externe dienst zonder dat met de
gebruiker af te stemmen.

### Systeemprompts staan in de database, niet in de code

Het gedrag van de chat, de uitvoering en de optimalisatie komt uit de tabel
`app_settings`, te bewerken via Beheer, AI-instellingen. `settingsService.ts`
houdt de defaults (`DEFAULT_CHAT_SYSTEM_PROMPT`,
`DEFAULT_PROJECT_OPTIMIZE_PROMPT`, en zo verder) en de `compose*`-functies.

De systeemprompts van de edge function zelf (velden invullen, framework
kiezen, PlanWizard, techniekbouwers, Testkamer, zoekvragen, tweede ronde en
zo verder) staan in Beheer, Prompts (`/admin/prompts`). De tekst in de code is
de standaard; een eigen versie staat in `app_settings` onder
`prompt_overrides` en de server past die bij elke aanroep toe (cache 30 s).
Schrijf je een nieuwe systeemprompt, maak hem dan een `let` en zet hem in
`PROMPT_CATALOG` vlak voor `Deno.serve`, met groep, titel en uitleg. Een
prompt met variabele delen krijgt invulplekken zoals `{{sleutels}}` in plaats
van een functie.

Twee regels die hierbij horen:

- **Eén systeemprompt per gedrag.** Geen verborgen extra regels in de
  clientcode en geen nabewerking van het antwoord. Moet het gedrag anders, dan
  gaat de tekst in het beheerveld om.
- **Prompts worden geschreven voor een klein model.** Mistral Small 4 en de
  Ministrals vergeven geen vaagheid. Volg Mistrals richtlijnen: begin met rol
  plus taak in één zin, deel hiërarchisch in met XML-achtige tags, toon het
  exacte uitvoersjabloon minstens één keer, vermijd subjectieve taal ("beter",
  "te lang"), vraag het model nooit woorden te tellen, en zet er geen twee
  instructies in die elkaar tegenspreken. Kleine modellen echoën een sectietag
  regelmatig mee, dus haal ze er naderhand uit met `stripSectionTags`.

### Voorbeelden in een meta-prompt lekken

Zet je een voorbeeld in een prompt die zelf een prompt schrijft, dan neemt het
model dat voorbeeld met enige regelmaat over als échte regel in de uitvoer.
Merk het voorbeeld daarom onmiskenbaar als voorbeeld, of laat het weg.

## De bouwer: twee ingangen

- **`/genereren`** is de gewone weg. De AI analyseert wat de gebruiker wil en
  kiest zelf de techniek. Hier zit ook de PlanWizard (plan met stappen,
  interview in de tool, socratische aannamecontrole) en de Testkamer, de
  gesloten lus bouwen, testen, verbeteren met versies.
- **`/technieken`** is de trainingspagina waar de gebruiker zélf een techniek
  kiest en de velden invult. Bouw geen handmatige techniekkiezer in
  `/genereren`: dat is precies de scheiding tussen die twee pagina's.

**Sjablonen** (soort "Routekaart" bij "Wat wil je maken?", migratie 0039) zijn
frameworks met `modality = 'template'`. De template is een vaste opdracht met
één plek `{{INHOUD:<naam>}}`; alleen die plek schrijft de AI (mode `sjabloon`,
systeemprompt per naam via `sjabloonSystemPrompt`), de rest gaat letterlijk mee.
Een nieuw sjabloon is dus een rij in `techniques` plus een systeemprompt in
`PROMPT_CATALOG`. Kiest de gebruiker geen soort, dan doen sjablonen niet mee.

De routekaart zelf (de HTML-pagina) programmeert geen taalmodel meer:
`src/lib/routekaart/` leest het inhoudsblok en zet het in één vaste, geteste
pagina (`routekaart.html`). Dat bestand verschijnt in de bouwer onder de
opdracht en in de chat via "Maak de routekaart". Wijzig je het formaat van het
inhoudsblok in de systeemprompt, pas dan ook `parseRoutekaart` aan.

Elk HTML-bestand in de chat wordt na het schrijven onzichtbaar en afgeschermd
gedraaid (`src/lib/fileCheck.ts`); scriptfouten komen met regelnummer op de
bestandskaart.

Vanuit de bouwer kun je een prompt met "Uitvoeren in chat" doorzetten naar
`/chat`, en vanuit de chat weer terug (`handoffService`).

## Plus, Projecten en Context prompt in de chat

De balk van het tekstvak toont alleen wat er aanstaat. De rest zit achter de plus
(`ComposerPlusMenu`): bestand, projecten, context prompt, denken, internet en
inspreken. De microfoon blijft ook los staan, want inspreken moet zonder menu
kunnen. De bevestigingen van Denken en Internet staan op één plek, in
`ThinkingToggle` en `WebSearchToggle`, die daarom ook een menuvorm hebben.

De knop Projecten (`ChatContextWizard`, ook te openen door `@` als eerste teken te
typen) kiest een project met bronbestanden en maakt desgewenst een context prompt:
taak, vragen, prompt. De namen komen van de gebruiker: Projecten omdat de knop
daarnaar verwijst, Context prompt voor het maken van de prompt.

Dezelfde vragenronde als "Prompt maken" in een project (`usePromptInterview`), maar
met eigen modes en systeemprompts, want dat is een vaste prompt voor een
terugkerende taak en dit is één taak van nu. Hier hoort wat
per keer verschilt juist wel in de prompt. De context prompt werkt ook zonder
account, net als de chat; alleen projecten vragen om in te loggen.

Er is bewust geen voorstelscherm: de prompt komt in het tekstvak en daar lees je
hem. Versturen blijft een eigen handeling, inclusief de controle op
persoonsgegevens. Een lege chat zonder project wordt daarbij een uitvoergesprek,
zodat de prompt onder de neutrale systeemprompt draait. Staan er al berichten, dan
wordt een ander project een nieuwe chat. `[ontbreekt]` in een prompt is geen
invulplek maar een woord dat de AI zelf gebruikt (`SLOT` in `ChatComposer`).

---

# Deel 3: documentatie die blijft staan

- `PROJECTINSTRUCTIE_Framework.md` in de repowortel: het ontwerp achter
  `project-optimize`, met de onderbouwing en de bronnen. Let op, de
  modeltabellen daarin lopen achter op `src/config/aiModels.ts`; de code is
  leidend.
- `docs/framework-packaging-plan.md`: nog **niet** uitgevoerd. Beschrijft een
  fase 'framework' in de PlanWizard om de prompt na afloop in een framework te
  pakken. `PlanWizard.tsx` kent die fase nog niet.
- `docs/archief/`: afgeronde portplannen en de oorspronkelijke bouwspecificaties.
  Historie, geen instructie. Ga er niet vanuit dat wat daar staat nog klopt.
