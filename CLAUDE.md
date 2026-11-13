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
voor koppen en balken, donkerblauw `#01689B` voor interactie, en het token
`nadruk` `#D52B1E` (rijksrood) als accent; dat heeft eigen tinten voor tekst in
het rood en voor op lintblauw, zodat het contrast klopt), de vormtaal in
`borderRadius` van de Tailwind-config. Het lettertype Rijks Sans staat in
`src/assets/fonts/` en is niet vrij: het staat met toestemming in deze openbare repo
omdat PromptPlein van de Rijksoverheid is, en valt net als `public/logo-rijksoverheid.*`
niet onder de EUPL-1.2. Nooit naar een ander product of andere repo kopiëren.
Bron: het thema van RijksICTGilde (`hugo-theme-rijksoverheid`) en de
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

Edge functions draaien in `eu-west-1` (Ierland), naast de database: `getFunctionUrl`
zet `forceFunctionRegion` op elke URL, ook op de override. Zonder die parameter kiest
Supabase de regio die het dichtst bij de gebruiker ligt, dus buiten Europa een server
daar. Bij een storing in die regio leidt Supabase niet om; wissel dan `FUNCTION_REGION`
tijdelijk naar een andere EU-regio. Roep een function dus nooit aan met een eigen URL.

Scripts: `npm run dev`, `npm run build` (= `tsc -b && vite build`),
`npm run preview`, `npm run lint`.

## E-mail

De mails naar gebruikers staan in Brevo, in het gedeelde account van Awaren (ook MoonMix),
niet in deze repo. Basis voor nieuwe mails is template 58, "PromptPlein basis
(Rijkshuisstijl)": dupliceer die in Brevo. De merkset van dat account is van Awaren: niet
wijzigen. Plaatjes staan in `public/email/` en gaan als `https://www.promptplein.app/email/...`
mee; hernoem ze niet, want verstuurde mails blijven ernaar wijzen. Geen Rijks Sans in Brevo:
het lettertype is niet vrij en werkt in e-mail toch niet, dus Arial.

Goedkeuringsmails zijn transactionele mails, bewust geen automations: een automation-mail is
voor Brevo marketing, dus wie zich in dit gedeelde account ergens uitschrijft zou ze missen.
Daarom ook geen uitschrijflink. De templates in Brevo zijn 69 (goedkeuring wacht), 70
(ingediend), 71 (goedgekeurd) en 72 (afgewezen); de nummers staan in de edge function
`brevo-event`. De database-triggers uit migratie 0048 roepen die functie aan. Beoordelaars zijn
de moderatoren van het ministerie, of de beheerders als die er niet zijn en voor Rijksoverheid,
categorieën en functies. De indiener krijgt altijd een besluitmail, ook als die zijn eigen
aanvraag afhandelt (0050). Een nieuw soort aanvraag krijgt dus een eigen trigger. In de mail staan
de gegevens als `params.voornaam`, `soort`, `titel`, `bereik`, `aanvrager`, `toelichting` en `link`.

Template 104 waarschuwt een week voordat de bronbestanden van een project verdwijnen (0053), ook
transactioneel en zonder uitschrijflink, met `params.titel`, `aantal`, `datum` en `link`.

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
  functions/      optimize-prompt (de grote), send-contact, register-brevo-contact,
                  brevo-event
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

Onder een ministerie hangt een directie of dienst (type `directorate`) en daaronder
de afdeling (type `department`). Zo heten die lagen in de app; "onderdeel" is te
vaag, keuze van de eigenaar. Mensen zoeken hun afdeling, niet de directie:
`OrgPicker` toont na het ministerie één zoeklijst met alle afdelingen, met bij
elke afdeling de afkorting en de directie erboven, zodat je op alle drie zoekt.
Het profiel hangt aan de afdeling. Een ontbrekende afdeling vraagt de gebruiker
aan op zijn profiel: eerst kiest hij de directie of dienst, en staat die er ook
niet bij, dan vraagt hij die mee aan (`request_organization`, 0056). Een beheerder
keurt goed in Beheer, Afdeling-aanvragen; `approve_organization_request` maakt de
keten en zet de onderste laag als afdeling (0058). Bij goedkeuring verhuist het
profiel van de aanvrager naar de nieuwe afdeling. Het direct aanmaken uit 0055 is
vervallen.

Elke laag heeft de vorm van een ministerie: de naam voluit in `name`, de afkorting
in `code` (0057). De aanvraag vraagt om beide en houdt een losse afkorting als naam
tegen (`looksLikeAbbreviation`). Wie in dezelfde afdeling zit, deelt de prompts op
het deelniveau Afdeling (exacte match). Een functie is op dezelfde manier een
aanvraag; de aanvrager krijgt mail bij indienen en besluit. Waar een organisatie
staat, toont de app het pad (`orgPathLabel`): kort met afkortingen op kaarten,
voluit op de promptpagina. In Ontdekken zoekt een gekozen directie in alle
afdelingen eronder, en een gekozen afdeling vernauwt dat (`searchOrgIds`).

## Opslagscheiding: dit is een bewuste keuze

- **Postgres**: prompts, gebruikers, organisaties, technieken, categorieën,
  rollen, analytics, audit log, meldingen, chat*projecten* (0030) met hun bronstukken
  en vectoren (0046, 0049), de persoonlijke
  chatinstructie (`user_chat_preferences`, 0047), het geheugen van de chat
  (`user_memories`, 0052).
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

`/instellingen` is openbaar en heeft twee onderdelen: Chat en Toegankelijkheid. Bij
Toegankelijkheid staan Instellen en Hulp. Je
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

## Geheugen van de chat

Zegt een ingelogde gebruiker in de chat "voortaan", "onthoud dit", "vanaf nu" of
een van de andere woorden in `src/lib/memoryTriggers.ts`, dan schrijft de mode
`memory-save` de wens op als korte regel in `user_memories` (0052, RLS strikt
eigenaar-alleen). Zonder zo'n woord gaat er niets naar die mode. Het model wijst ook
aan welke oude regel de nieuwe vervangt; vervangen zonder nieuwe regel doet hij
niet. Eerst opslaan, dan antwoorden, hoogstens 10 seconden wachten. De chat meldt
wat er is onthouden, met Ongedaan maken. Een bericht met een persoonsgegeven wordt
niet onthouden.

De regels staan los op `/instellingen/chat` en zijn daar te verwijderen; daaronder
staat de volledige systeemprompt van een gewoon chatgesprek, alleen op chatniveau.
In de systeemprompt komt het geheugen als laatste blok (`composeMemoryBlock`, tekst
in Beheer, AI-instellingen) en dat blok is leidend, ook boven de systeemprompt van de
beheerder. Dat is bewust anders dan de eigen instructie. Het geldt in gewone chats en
projecten, niet in een uitvoergesprek.

Elke regel krijgt bij het opslaan een vector van `mistral-embed`. Tot
`MEMORY_VECTOR_THRESHOLD_TOKENS` (100.000, keuze van de eigenaar) gaat het hele
geheugen elke beurt mee; daarboven zoekt `memory-search` de 40 regels die bij de
vraag passen (`match_user_memories`).

## Telefoon en aanraakscherm

De hele app werkt op de telefoon, ook het beheer. Testen doe je op 320 pixels breed
met tekstgrootte Extra groot: wat daar past, past overal. Staat er iets nieuws, kijk
dan ook liggend en met het toetsenbord open. Kijk voor de chat ook op een laag
laptopscherm: 1280 bij 600 pixels, wat een laptop met 150% schaling in de browser
overhoudt. Daar viel de leesruimte eerder terug tot een kwart van het venster.

- **Menu**: op de telefoon staat het hoofdmenu onderaan (`--onderbalk`, 60 pixels plus
  de thuisbalk), vanaf `sm` plakt het bovenaan. Wat vast onderaan staat, houdt daar
  rekening mee met `bottom: var(--onderbalk)`. De kop heeft naast het lint plek voor
  drie knoppen: Toegankelijkheid, meldingen en het accountmenu. De rest zit op de
  telefoon in dat menu.
- **Raakvlakken**: de regels in `index.css` maken alles 44 bij 44 pixels op een
  aanraakscherm of smal venster. In pixels, want een vinger groeit niet mee met de
  tekstgrootte. Een losse tekstlink buiten een zin krijgt `opl-raak`. Kop en onderbalk
  staan om dezelfde reden in pixels, en niet in rem.
- **Icoonknoppen** krijgen altijd een `aria-label`: daar hangt ook het centreren aan.
- **Invoer**: alles op minstens 16 pixels, anders zoomt iOS bij elk veld in.
- **Toetsenbord**: `viewportWatch` meet de zichtbare hoogte (`--zichtbaar`) en zet
  `data-toetsenbord` op `<html>`. Gebruik daar `100dvh` niet voor: die ziet het
  toetsenbord niet, en is naast de zwevende balk van Safari hoger dan wat je ziet.
  De chat volgt dit via `useFitHeight`. Op een aanraakscherm geeft de returntoets een
  nieuwe regel en sluit Verstuur het toetsenbord, zodat je het antwoord kunt lezen.
- **Tekstgrootte van het toestel** telt mee: Android via de meta `text-scale`, iOS via
  `systemTextFactor` (`-apple-system-body`). Alles in rem groeit dus mee, tot 200%, en
  dat is een stand die mensen echt gebruiken. Test hem ook. Is het scherm smaller dan
  15 rem, dan zet `viewportWatch` `data-krap` op `<html>`: alles gaat in één kolom, met
  krappe marges. De chat reageert met container queries in rem. Media queries rekenen
  met de standaardgrootte van de browser en zien de tekstgrootte dus niet.
- **Aanraken is geen muis**: wat bij aanwijzen verschijnt, krijgt `opl-geen-muis:` zodat
  het er op een aanraakscherm gewoon staat. Hover-kleuren werken alleen waar hover
  bestaat (`hoverOnlyWhenSupported`). Geen automatische focus op een veld op een
  aanraakscherm als dat het toetsenbord over de inhoud legt.
- **Vensters** lopen via `Modal` of `Drawer`, of gebruiken zelf `useDialogFocus`: de
  focus gaat naar binnen en weer terug, en de pagina eronder wordt `inert`, zodat
  VoiceOver er met vegen niet achter komt. Nieuwe vaste panelen dus ook via een portal
  op `document.body`.
- **Tabellen** in `StackTable` worden op de telefoon kaarten en houden hun rollen.
- **Tekenen** (organogram, 3D) vangt elke veeg op. Daarom vult dat nooit het hele
  scherm en heeft het netwerk een gewone lijst, op de telefoon de standaard.
- **Paginawissel**: `RouteFocus` zet de titel uit `pageTitles.ts`, gaat naar boven en
  zet de focus op de zichtbare `h1`. Zichtbaar, want tijdens het laden van een lazy
  pagina staat de kop van de vorige pagina verborgen in de DOM. Elke pagina heeft dus
  precies één `h1`, ook in de laad- en foutstand, en een nieuwe route hoort in die lijst.
- **Grijze tekst**: `text-slate-400` en `-500` zijn tokens die in beide modi 4,5:1
  halen. Randen en vlakken houden de echte tint.
- **Bundel**: `manualChunks` in `vite.config.ts` houdt three en recharts uit de eerste
  lading. Rollup trekt alles wat die pakketten importeren mee hun chunk in, dus een
  gedeeld hulpje dat daar belandt laadt ze weer op elke pagina. Controleer na een
  nieuwe dependency in `dist/index.html` dat ze niet in de preload staan.

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
(`/instellingen/toegankelijkheid/hulp`, `AccessibilityHelp`) leest die lijst. Voeg je iets toe wat je
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
"Naar beneden" zet volgen aan, omhoog scrollen zet het weer uit. Die knop is een klein
rond icoon op een vervaagde onderrand, nooit een knop met tekst: die lag midden op de
regel die je las. Op de telefoon en op elk scherm tot 900 pixels hoog
schuiven de kop van de app, de titelbalk en het menu weg als je naar
beneden leest en komen ze terug als je omhoog scrolt (`useReadingMode`). Op zo'n laag
scherm zijn kop, menu, titelbalk en tekstvak ook in rust al smaller (`index.css`), en
staat "Chats blijven in deze browser" onder in de lijst met chats, niet onder het
gesprek. Het tekstvak blijft altijd staan:
toen dat ook wegschoof, voelde het alsof de chat verdween. De leeskolom is
`60ch`, wat in Rijks Sans zo'n 72 tekens per regel is (gemeten). Maak hem niet
breder zonder opnieuw te meten. Het tekstvak heeft dezelfde breedte, zodat vraag
en antwoord op één lijn beginnen.

## De AI-laag

Eén edge function, `optimize-prompt`, ongeveer 8000 regels, met een
`mode`-veld in de body als router. Nieuwe AI-functionaliteit wordt een nieuwe
mode in dat bestand, niet een nieuwe function. De 43 modes, gegroepeerd:

| Groep | Modes |
| --- | --- |
| Streamende vrije tekst | `generate`, `execute`, `chat` |
| Techniek- en frameworkkeuze | `recommend`, `recommend-framework`, `framework-fit`, `technique-advisor` |
| Veldhulp in de bouwer | `analyze`, `prefill`, `expand-field`, `title`, `metadata` |
| PlanWizard | `plan`, `plan-step`, `plan-step-analyze`, `clarify`, `assumption-check` |
| Techniekbouwers | `persona-fill`, `fewshot-example`, `fewshot-extract`, `meta-build`, `cove-scan`, `stepback-ladder`, `rubric-propose`, `skill-draft`, `skill-trigger` |
| Chat en projecten | `chat-optimize`, `project-optimize`, `project-brief`, `project-interview`, `project-prompt`, `context-interview`, `context-prompt`, `chat-intake`, `chat-intake-check`, `memory-save`, `memory-search` |
| Testkamer-loop | `mock-answer`, `refine`, `refine-suggest` |
| Sjablonen | `sjabloon` |
| Projectbronnen | `project-index`, `project-search` |

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

### Zoeken in de bronbestanden van een project

Past een project binnen de 200.000 tekens per beurt, dan gaan de hele bestanden mee
en draait er geen zoekstap. Is het groter, dan gaan alleen de 30 stukken mee die het
best bij de vraag passen. De vorige vraag telt daarbij mee, want een vervolgvraag zegt
op zichzelf te weinig.

Elk bestand wordt bij het toevoegen opgeknipt in stukken van hoogstens 1600 tekens
(`chat_project_file_chunks`, 0046) en elk stuk krijgt een vector van `mistral-embed`
(pgvector, 0049). `match_project_chunks` voegt zoeken op betekenis en de Nederlandse
woordzoeker samen op plek in de ranglijst: exacte termen zoals zaaknummers vindt de
woordzoeker juist beter.

Bewust geen HNSW-index: die zoekt over alle projecten en filtert daarna pas, zodat
treffers binnen één project wegvallen. Per project exact vergelijken is snel genoeg.

Vectoren komen alleen in een project boven de 200.000 tekens: een klein project zoekt
nooit. `PROJECT_INDEX_MIN_CHARS` in de edge function bewaakt dat ook, gelijk aan
`MAX_PROJECT_CONTEXT_CHARS`; wijzig je de een, wijzig dan de ander. Ze worden gemaakt in
porties (`project-index`, `indexProject` in `chatProjectService`) zodra de
projectinstellingen een groot project zien, en anders bij de eerste vraag, die daar
hoogstens 20 seconden op wacht. Alles loopt met het token van de
gebruiker, dus RLS bewaakt ook dit pad, en van de stukken is alleen `embedding`
wijzigbaar. Een stuk zonder vector blijft vindbaar met de woordzoeker en een storing
bij Mistral kost niemand zijn bronnen: `project-search` zoekt dan op woorden en daarna
valt de client terug op `search_project_chunks`.

Let op de privacy: in een groot project gaat elk bestand in zijn geheel naar Mistral,
ook de delen waar nooit iets over wordt gevraagd. Daarom zoekt de browser vóór het
toevoegen naar persoonsgegevens (`countPii` en `redactPii` in `guardrails`,
`PiiFileDialog`) en biedt hij aan ze te vervangen, nog voordat er iets verstuurd
wordt. Wordt een project drie maanden niet gebruikt, dan wist `pg_cron` 's nachts zijn
bronbestanden (0053, `last_used_at`, `mark_chat_project_used`); het project zelf blijft
staan. Een week vooraf gaat er een mail met een link naar `/bronnen-bewaren/<id>`. Daar
staat de knop Bestanden bewaren; de link zelf bewaart niets, want mailscanners openen
links vanzelf. Waarschuwen, bewaren en verwijderen komen in `chat_project_retention_log`.
Er wordt nooit verwijderd zonder waarschuwing een week eerder. Gebruik markeren verandert
`updated_at` en dus de volgorde in de zijbalk niet. Wissel je van
embeddingmodel, gooi dan alle vectoren weg: die van twee modellen zijn niet te
vergelijken.

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

- **`/genereren`** is de gewone weg. De AI analyseert wat de gebruiker wil, kiest
  zelf het framework en vult de velden in; niemand kiest hier een framework. De
  gebruiker kijkt na, vult aan en bouwt. De naam van de aanpak blijft zichtbaar
  (`AanpakKaart`) en "Andere aanpak" toont de alternatieven die de AI al gaf, zonder
  extra aanroep. Bij te weinig tekst vraagt de AI bij het tekstvak om meer, nooit
  via een lijst. Geldt voor beide tabbladen: na het gesprek bij "Ik heb een idee"
  kiest de AI op dezelfde manier. Hier zit ook de PlanWizard (plan met stappen,
  interview in de tool, socratische aannamecontrole) en de Testkamer, de gesloten
  lus bouwen, testen, verbeteren met versies.
- **`/technieken`** is de trainingspagina waar de gebruiker zélf een techniek
  kiest en de velden invult. Bouw geen handmatige techniekkiezer in
  `/genereren`: dat is precies de scheiding tussen die twee pagina's.

Op `/technieken` kies je op doel (`TechniqueChooser`): eerst Schrijven, Uitdenken,
Controleren, Bouwen of Vaste vorm, dan de frameworks en technieken daarbij. De
indeling, de korte tekst en het icoon per techniek staan op naam in
`src/lib/techniekDoelen.ts`, dus een techniek die in Beheer een nieuwe naam krijgt,
hoort daar ook te worden aangepast. Een onbekende naam blijft zichtbaar en valt
terug op zijn eigen omschrijving. Na het kiezen klapt de kiezer dicht; "Andere
kiezen" opent hem boven het invulblok, zonder de invoer te wissen.

De doelen zijn tabbladen: de gekozen tegel loopt zonder lijn over in het vlak
eronder, met een rode streep bovenaan. Dezelfde streep staat op de balk met je
keuze. "Help mij kiezen" staat op hetzelfde raster als de tegels en is even breed
als de laatste. De adviseur daarachter stelt alleen technieken voor, geen frameworks
(`TechniqueAdvisor`).

De invulvelden (`FollowUpQuestions`) staan overal in een compact raster: naam, uitleg
achter het infobolletje, "Vul verder aan" pas als er tekst staat. Bij frameworks is de
veldnaam de Nederlandse naam uit het label (`compactFieldLabel`) met de letter ervoor,
zodat de band met bijvoorbeeld C-O-S-T-A-R blijft. De techniekbouwers volgen dezelfde
regel: een nieuwe bouwer begint met `BuilderIntro` en zet uitleg achter een `InfoDot`,
niet als alinea boven of onder een veld.

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

Bij het bouwen gaan de velden voor de eigen tekst waaruit ze zijn voor-ingevuld. Die
tekst gaat mee als achtergrond, met `FIELDS_PRECEDENCE_INSTRUCTION` erachter. Zonder die
regel koos Mistral bij een tegenspraak de oorspronkelijke tekst en verdwenen de
aanpassingen van de gebruiker uit de prompt. Wat een veld is, leest de server uit de
sleutels van `followUpAnswers`; elk ander antwoord is achtergrond.

Vanuit de bouwer kun je een prompt met "Uitvoeren in chat" doorzetten naar
`/chat`, en vanuit de chat weer terug (`handoffService`).

## Ontdekken

`/zoeken` heet in het menu Ontdekken en heeft twee standen op één pagina
(`SearchPage`). Zonder zoekvraag of filter staan er rijen om in te bladeren,
anders de resultaten. Het zoekvak en de categorieën blijven in beide standen op
dezelfde plek, zodat er niets verspringt zodra iemand begint te typen.

De filters staan in de URL en nergens anders: de links zijn deelbaar en de
terugknop van de browser werkt. Bestaande links (`?category=`, `?org=`) blijven
daardoor gewoon werken. De keuzes zitten in `FilterPanel` en gelden meteen, dus
dat paneel sluit ook met Escape of een klik ernaast, anders dan `Modal`. Filteren
op een ministerie neemt alles mee wat eronder hangt (`orgSubtreeIds`).

In de rijen doen privéprompts niet mee. Populair toont alleen prompts met een
like, anders is die rij gelijk aan Nieuw. Een lege rij verdwijnt. Populairste
eerst sorteert de client, want likes staan niet op de prompt-rij. Technieken staan
bewust niet bij de filters: dat zegt een gebruiker niets over wat een prompt doet.

## Promptcheck in het tekstvak

Bij het eerste bericht van een gewone chat kijkt de browser na een korte pauze in het
typen of het korter en scherper kan (`checkPrompt` in `src/lib/promptCheck.ts`, zonder
AI). Zo ja, dan staat "Kan korter" in de balk en daarachter een kaartje met de strakkere
versie: beleefdheden en twijfelwoorden eruit, "zou je X kunnen maken" wordt "Maak X", en
waar het past een vorm erachter. "Gebruik deze" zet hem in het vak, met Herstel mijn
tekst. Nooit een seintje bij een eigen prompt met kopjes, een lange opdracht of een
wens voor het geheugen. Het idee komt van de Promptcheck van GreenPT voor BZK
(promptchecker.nl); de regels zijn eigen werk, neem hun code niet over. Toon geen
energiebesparing: dat is daar alleen het verschil in woorden. Aan of uit per browser,
standaard aan, bij Instellingen, Chat (`opl.chat.promptcheck`).

## Doorvragen bij het eerste bericht

Het eerste bericht van een nieuwe gewone chat gaat eerst langs mode `chat-intake`
(`useChatIntake`, `ChatIntake`). Het model legt alleen feiten vast (soort, doel, wat
ontbreekt) en de server rekent het oordeel uit: een vraag of een compleet bericht is
genoeg en gaat gewoon door; zonder doel, of met drie of meer gaten, is het summier en
volgen hoogstens drie vragen; anders maakt de chat meteen een voorstel. Laat het oordeel
niet terug naar het model gaan: Mistral Small paste die regels slecht toe.

Vragen en schrijven lopen via `context-interview` en `context-prompt`, dezelfde modes als
de context prompt; die geeft voor de chat ook de `kopjes` terug, zodat het voorstel per
kopje te tonen is. `chat-intake-check` beoordeelt de prompt per kopje en stelt één vraag
over het zwakste punt; een gekozen antwoord gaat via de aanpasstap van `context-prompt`.
Pas "Gebruik deze prompt" zet hem in het tekstvak, als uitvoergesprek. Versturen blijft
een eigen handeling. Niets van het doorvragen komt in de opgeslagen chat.

Het slaat over bij uitvoergesprekken, projectchats, de gespreksmodus en wat
`shouldJudgeFirstMessage` wegfiltert (korte vragen, eigen prompts met kopjes, wensen voor
het geheugen). Faalt de beoordeling, dan gaat het bericht gewoon door: het is hulp, geen
poort. Een bijlage die tijdens het doorvragen wordt toegevoegd, gaat pas als bronmateriaal
naar de AI na de controle op persoonsgegevens (`runGuarded` in `ChatPage`).

Aan of uit per browser, standaard aan, bij Instellingen, Chat (`opl.chat.doorvragen`).

## Plus, Projecten en Context prompt in de chat

De balk van het tekstvak toont alleen wat er aanstaat. De rest zit achter de plus
(`ComposerPlusMenu`): bestand, projecten, context prompt, denken, internet en
inspreken. De microfoon blijft ook los staan, want inspreken moet zonder menu
kunnen. De bevestigingen van Denken en Internet staan op één plek, in
`ThinkingToggle` en `WebSearchToggle`, die daarom ook een menuvorm hebben.

De knop Projecten (`ChatContextWizard`, ook te openen door `@` als eerste teken te
typen) is een keuzelijst: een project kiezen koppelt het meteen aan de chat, zonder
bevestiging, en het venster sluit. Klik je het gekozen project opnieuw aan, dan gaat
het los. De context prompt (taak, vragen, prompt) start vanuit de plus, of vanuit
de keuzelijst als er geen project gekozen is, en leest het project van de chat mee.
De namen komen van de gebruiker: Projecten omdat de knop daarnaar verwijst, Context
prompt voor het maken van de prompt.

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
