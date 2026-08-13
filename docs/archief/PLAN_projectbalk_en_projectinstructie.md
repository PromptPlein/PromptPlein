# Projectbalk in de bouwer + inklapbare projectinstructie — port naar PromptPlein

**Status:** te bouwen · **Opgesteld:** 2026-08-08 · **Doelrepo:** deze repo (`PromptPlein`)

Vervolg op [`PLAN_chat_projects_port.md`](PLAN_chat_projects_port.md). Dát plan
brengt chatprojecten en de projectcontext naar deze repo; dit plan is de
vormgeving die er in `AIPromptHub` daarna overheen is gegaan. Bouw dit plan pas
als de basis uit het vorige plan staat — alles hieronder verandert bestaande
onderdelen, het voegt geen nieuwe keten toe.

**Bron (referentie, niet wijzigen):** `/Users/admin/Documents/GitHub/AIPromptHub`

> **Buiten scope, bewust.** De bronrepo heeft in dezelfde ronde een abonnement +
> gratis proeftegoed op de projectcontext gekregen (planvlag, quotacontrole in de
> edge function, migratie `0049`). Dat hoort niet bij PromptPlein en staat hier
> dus nergens in. In de broncode van `ProjectContextBar.tsx` zie je het terug als
> `isPremium` / `triesLeft` / `exhausted` en de sleutels `premiumBadge`,
> `triesBadge`, `exhaustedBody`, `errorSignIn`, `errorQuota` — **laat die
> allemaal weg** bij het overnemen. Waar dit plan een gedragsregel noemt die
> daarvan afhangt, staat expliciet wat de PromptPlein-variant is.

---

## 0. Wat er verandert, in één alinea

Twee dingen. (1) De projectinstructie op de projectpagina stond er onafgekapt in
en duwde bij een lange instructie de rest van de pagina weg; die staat nu op zes
regels met een uitklapknop. (2) De projectbalk boven de promptbouwer was een
zwevende, lichte strook die werd overgeslagen — die is nu de bovenste rij ván de
omrande bouwerkaart, staat er altijd (ook zonder projecten), en de projectnaam is
zelf de kiezer geworden.

---

## 1. Projectinstructie inklappen

**Bestand:** `src/components/chat/ProjectView.tsx`

Een projectinstructie mag 20.000 tekens zijn. Onafgekapt drukt hij de
bronbestanden en de gesprekken van het scherm en is de projectpagina alleen nog
een lap tekst.

Wat te doen:

1. State erbij: `instructionsOpen` (uitgeklapt?) en `instructionsOverflow` (staat
   er iets ónder de zesde regel?), plus een `useRef` op de `<p>`.
2. Ingeklapt krijgt de `<p>` `max-h-36 overflow-hidden`. Dat is precies zes
   regels van `leading-6` (1,5 rem), dus de afkapping valt op een regelgrens en
   niet dwars door een letter.
3. Vervagende onderrand via **een mask op de tekst zelf**, niet via een
   gradient-overlay:
   `[mask-image:linear-gradient(to_bottom,black_60%,transparent)]`.
   Een overlay zou de achtergrondkleur van de kaart moeten raden en klopt dan
   niet in donkere modus, waar die kaart doorzichtig is.
4. Of het overloopt kún je niet aan de tekst zien — dat hangt van de
   vensterbreedte af. Meten met `useLayoutEffect` + `ResizeObserver`
   (`scrollHeight > clientHeight + 1`), en **alleen in ingeklapte staat**:
   uitgeklapt past alles per definitie, dus dan zou de knop zichzelf meteen weer
   wissen.
5. De knop verschijnt bij `instructionsOverflow || instructionsOpen` en krijgt
   `aria-expanded` + `aria-controls`. Chevron omhoog/omlaag ervoor.
6. Ander project openen → weer ingeklapt (`useEffect` op `project.id`).

**Nieuwe sleutels** in `src/i18n/locales/*/chat.json` onder `projects.view`:

| sleutel | en | nl |
|---|---|---|
| `instructionsExpand` | Show full instruction | Volledige instructie tonen |
| `instructionsCollapse` | Show less | Minder tonen |

---

## 2. De projectbalk wordt de bovenste rij van de bouwerkaart

**Bestanden:** `src/pages/HomePage.tsx`, `src/components/optimizer/ProjectContextBar.tsx`

### 2.1 Verplaatsen (dit is de kern)

De balk stond in `HomePage.heroGenerator()` als los blok bóven de bouwer, in een
`space-y-6`-stapel. Daardoor las hij als een melding náást de bouwer.

Zet hem in plaats daarvan als eerste element ín de `header` die naar
`OwnPromptOptimizer` en `GoalDialog` gaat:

```tsx
const tabs = (
  <>
    {projectContextBar}
    <div role="tablist" …>…</div>
  </>
);
```

en haal `{projectContextBar}` weg uit de `return` eronder. Beide flows renderen
`header` binnen hun `overflow-hidden rounded-2xl border border-rijksblauw-…`-blok,
dus de balk valt vanzelf binnen de blauwe rand en zijn bovenhoeken worden op de
kaartronding afgeknipt. Precies het effect dat gevraagd was: erbij horen, maar
herkenbaar apart.

### 2.2 Vorm: strook, geen kaart

In `ProjectContextBar` alle eigen randen, rondingen en schaduwen weg. Wat blijft
is één onderlijn plus een eigen tint:

```
border-b px-3 py-2.5 sm:px-4 sm:py-3
```

Binnen de strook is de taal die van de instap-tabs eronder, zodat het één familie
wordt:

* icoonvierkant `h-9 w-9 sm:h-10 sm:w-10 rounded-xl` — **gevuld blauw** als er
  een project aanhangt, **wit met een blauwe ring** in de uitnodiging;
* vette kop (`text-sm font-bold`) met een beschrijvende regel eronder
  (`text-[13px] text-slate-600`);
* het ronde vinkje van `EntryTab` op de bronbestanden-schakelaar.

### 2.3 Drie toestanden

| toestand | wat je ziet | actie rechts |
|---|---|---|
| **laden** | grijze strook, spinner in het icoonvierkant | — |
| **project aangehaakt** | blauwe tint, gevuld icoon, projectnaam vet + chevron, `active`-regel eronder | schakelaar bronbestanden + kruisje |
| **niets aangehaakt** | lichte blauwe tint, wit icoon, kop + uitleg | knop "Kies een project" |

De oude regel `if (projects.length === 0 && !context && !loading) return null` is
**vervangen** door alleen `if (!configured) return null` (mock-modus). Wie de
mogelijkheid nooit ziet, vraagt er ook nooit om: de strook verdween juist voor de
groep die nog moest ontdekken dat hij bestaat.

Daarmee heeft de uitnodiging drie varianten van de knop rechts:

* er zijn projecten → menu "Kies een project";
* ingelogd, nog geen project → `LocalizedLink routeKey="chat"` met "Project maken"
  (projecten wonen op de chatpagina, in de linkerzijbalk);
* niet ingelogd → `LocalizedLink routeKey="authLogin"` met "Inloggen", plus een
  klein `Sparkles`-label "Account" achter de kop.

> **PromptPlein-variant.** In de bron hangt dat label af van de abonnementsstaat.
> Hier is het simpel: label alleen tonen wanneer `!isAuthenticated`, met de tekst
> `lockedBadge`. Geen `premiumBadge`, geen tellers, geen "tegoed op"-toestand — de
> knop blijft dus altijd bruikbaar.

### 2.4 De projectnaam is de kiezer

Dit was de tweede klacht: om een ánder project te kiezen moest je op het kruisje
drukken, en dat weet niemand.

* De naam zit in een `<button>` met een `ChevronDown` en een hover-vlak. Dat is de
  zichtbare route naar een ander project.
* Het menu markeert het actieve project met een vinkje (klikken erop doet niets).
* Onderin het menu, onder een streep: **"+ Project maken"**
  (`LocalizedLink routeKey="chat"`, `Plus`-icoon) — voor wie in de lijst kijkt en
  ziet dat het project dat hij nodig heeft er nog niet is.
* Daaronder, alleen als er iets aanhangt: "Verder zonder project" — de tweede
  route naar loskoppelen, voor wie het kruisje niet als knop herkent.
* Het kruisje blijft, maar betekent nu alleen nog "zonder project verder".

**Let op de klemhoogte van het menu.** Het hangt in een blok met
`overflow-hidden`, dus een lang menu wordt door de kaart afgeknipt in plaats van
eroverheen te vallen. Houd `max-h-56`; de rest scrollt.

### 2.5 Bronbestanden-schakelaar

Was een kale `<input type="checkbox">`, wordt een knop met `role="switch"` +
`aria-checked`, met hetzelfde ronde vinkje als de tabs, een paperclip en het
aantal erin: `include source files (4)`.

Twee gedragsregels die je makkelijk mist:

1. **Alleen tonen als het project bestanden hééft** (`context.fileCount > 0`).
   Daarvóór stond de schakelaar er ook bij een project zonder bestanden, waar hij
   aantoonbaar niets deed.
2. Op telefoon krijgt hij een eigen, volle regel:
   `order-last basis-full justify-center sm:order-none sm:basis-auto`.
   Zonder `basis-full` eist hij zijn vaste breedte op en knijpt hij de
   projectnaam ernaast tot `WPHando…`.

Hetzelfde principe in de uitnodiging: kop en uitleg krijgen
`basis-full sm:basis-0`, anders breekt de zin op telefoon in stukjes van vier
woorden naast de knop.

### 2.6 "Niet alles past"

De overgeslagen bestanden stonden als kort zinnetje tússen de knoppen en werden
overgeslagen. Nu een eigen regel onder een streep, mét de namen erin
(`skippedNames`) in plaats van alleen in een tooltip.

---

## 3. `GeneratorContext` uitbreiden

**Bestand:** `src/services/chatProjectService.ts`

De balk heeft twee dingen nodig die er nog niet in zaten:

```ts
export interface GeneratorContext {
  text: string;
  id: string;         // NIEUW — om het actieve project in het menu af te vinken
  name: string;
  withFiles: boolean;
  fileCount: number;  // NIEUW — 0 = de schakelaar heeft niets te schakelen
  skipped: string[];
}
```

In `buildGeneratorContext` invullen met `context.id` en `context.files.length`.
`files` bevat alleen de bestanden die binnen het contextbudget pasten — precies
de bestanden die mee zóúden kunnen, en dus de juiste maat voor de schakelaar.

---

## 4. Nieuwe i18n-sleutels

`src/i18n/locales/*/optimizer.json`, onder `projectContext`. Vervallen:
`prompt` (opgesplitst in `promptTitle` + `promptBody`) en `skipped` (vervangen
door `skippedNames`, die de namen toont).

| sleutel | en | nl |
|---|---|---|
| `promptTitle` | Generate prompt with project context | Genereer de prompt met projectcontext |
| `promptBody` | The builder then already knows your product, brand or site so the prompt is high on quality. | De bouwer kent je product, merk of site dan al, zodat de prompt van hoge kwaliteit is. |
| `switchTitle` | Choose another project | Kies een ander project |
| `menuDetach` | Continue without a project | Verder zonder project |
| `createCta` | Create a project | Project maken |
| `signInCta` | Log in | Inloggen |
| `lockedBadge` | Account | Account |
| `includeFilesCount` | include source files ({{files}}) | bronbestanden mee ({{files}}) |
| `includeFilesTitle` | Also send the project's source files to the builder. Usually not needed: the project instruction is enough for most prompts. | Stuur ook de bronbestanden van het project mee. Meestal niet nodig: de projectinstructie is genoeg voor de meeste prompts. |
| `skippedNames` | Not everything fits — left out: {{names}} | Niet alles past — weggelaten: {{names}} |

Ongewijzigd hergebruikt: `loading`, `active`, `choose`, `clearAria`,
`clearTitle`, `skippedTitle`, `includeFiles`.

**Gebruik `{{files}}` en níét `{{count}}`.** Bij `count` gaat i18next
meervoudsvormen zoeken (`_one` / `_other`, en in het Arabisch zes stuks) en valt
hij terug op de kale sleutel met een waarschuwing. Een getal in het label werkt in
alle acht talen zonder die tabellen — hetzelfde patroon als `filesCount` op de
projectpagina.

Alle acht talen (`nl de en es fr zh hi ar`) bijwerken; controleer daarna dat de
sleutelverzamelingen gelijk zijn.

---

## 5. Nakijken

* [ ] `npx tsc -p tsconfig.app.json --noEmit` schoon
* [ ] Sleutelpariteit over de acht `optimizer.json`- en `chat.json`-bestanden
* [ ] Projectpagina: lange instructie → zes regels + vervaging + knop; korte
      instructie → géén knop
* [ ] Bouwer zonder account: strook staat er, knop gaat naar inloggen
* [ ] Bouwer met account zonder projecten: knop gaat naar de chatpagina
* [ ] Menu: actief project afgevinkt, "+ Project maken" onderin, "Verder zonder
      project" alleen als er iets aanhangt
* [ ] Project zónder bronbestanden: schakelaar is afwezig
* [ ] Smalle viewport (~360 px): projectnaam niet afgeknepen, schakelaar op een
      eigen regel
* [ ] Donkere modus: strook, menu en schakelaar allemaal leesbaar
