# Implementatieplan — "Prompt inpakken in een framework" na de plan-bouwer

**Doel:** wanneer een gebruiker via de plan-bouwer (PlanWizard / doel-flow) klaar is, wordt
het samengestelde prompt automatisch geanalyseerd en aangeboden om te "verpakken" in een
herkenbaar prompt-framework (CARE, CRISPE, RAISE, CO-STAR, CRAFT, CREATE, REACT). Zo krijgt
de gebruiker een kant-en-klare, herbruikbare template in de structuur die past bij wat er is
gemaakt.

**Gekozen gedrag (vastgesteld met de gebruiker):**
- **Bied een paar framework-opties** (2–3 best passende, aanbevolen voorgeselecteerd) + altijd
  een "Behoud als-is"-uitweg.
- **Automatische laatste stap in het plan** (geen knop die je kunt missen): de picker verschijnt
  als natuurlijke afsluiting, ná het samenstellen van de template.

---

## Belangrijkste inzicht: het meeste bestaat al

Twee van de drie bouwstenen bestaan al. Dit is dus vooral **één bestand aanpassen (PlanWizard.tsx)**
plus een regel type-uitbreiding. **Geen edge-function-wijziging, geen nieuwe service-helper,
geen wijziging aan OptimizedOutput.**

1. **`framework-fit`-modus bestaat al** in de edge function
   (`supabase/functions/optimize-prompt/index.ts`, handler rond regel 3369) én als client-helper
   `explainFrameworkFit()` in `src/services/optimizeService.ts` (regel 1184). Deze rangschikt
   frameworks tegen een prompt-tekst. Retourneert `fits: FrameworkFit[]`, gefilterd op geldige
   ids, met lokale fallback die **nooit throwt**. → **Ongewijzigd hergebruiken.**

2. **"Inpakken in framework X" is GEEN nieuwe AI-modus.** Het is de bestaande `generate`-modus.
   `generate` neemt een `technique` waarvan de `template` de framework-eigen koppen bevat
   (bv. CRISPE `# CONTEXT:\n{{context}}…`), en `extractHeadings(body.template)` dwingt precies
   die koppen af. `composeFinal` roept `generatePrompt(...)` al aan — de enige verandering is
   **welke technique** wordt meegegeven: nu de laatste plan-stap-technique, straks het gekozen
   framework.

3. **Frameworks zijn DB `techniques`-rijen** met `family: 'context'`. `isContextPrompt(t)`
   herkent ze. De kandidatenpool = `techniques.filter(isContextPrompt)`.

**Let op (bewuste beperking):** BLUEPRINT staat alleen in `BLUEPRINT_Framework.md`, niet in de DB.
De picker biedt alleen frameworks die echt als `techniques`-rij bestaan (CARE, CRISP, CRISPE,
RAISE, CO-STAR, CRAFT, CREATE, REACT). Dat is correct — geen spookopties.

---

## Datastructuren (bestaand, ter referentie)

Uit `src/types/index.ts`:

```ts
// framework-fit resultaat
interface FrameworkFit {
  id: string;        // verwijst naar een bestaande Technique.id
  fits: boolean;     // past dit framework goed?
  value: string;     // uitleg waarom (wel/niet)
  missing?: string;  // alleen bij fits=false: wat nog zou moeten
}
interface FrameworkFitResult {
  fits: FrameworkFit[];
  success: boolean;
  provider: AiProviderResult;
  error?: string;
}

interface PromptRecipe {   // <-- hier komt framework_id bij
  goal: string;
  plan: PromptPlan;
  outcomes: StepOutcome[];
}

interface OptimizeResult {
  optimized_content: string;
  success: boolean;
  provider: AiProviderResult;
  error?: string;
  unclear?: boolean;
  reason?: string;
  recipe?: PromptRecipe;
}
```

Client-helper-signaturen (bestaand):

```ts
// src/services/optimizeService.ts:1184
explainFrameworkFit(args: {
  ownPrompt: string;
  frameworks: Technique[];
  preferredProvider?: AiProvider;
  preferredModel?: string;
}): Promise<FrameworkFitResult>

// src/services/optimizeService.ts (generatePrompt = optimizePrompt)
generatePrompt(args: {
  technique: Technique;
  promptContent: string;
  followUpAnswers: Record<string, string>;
  extraAnsweredFields?: { id: string; label: string; answer: string }[];
  preferredProvider?: AiProvider;
  preferredModel?: string;
  systemPrompt?: string;
  toneInstruction?: string;
  temperature?: number;
}): Promise<OptimizeResult>
```

---

## Stroomdiagram (de twee antwoorden verzoend)

```
composeFinal (PlanWizard)  [zoals nu]
  → generatePrompt(laatsteStapTechnique, outcomes) → composedResult
  → NIEUWE fase 'framework':
      → explainFrameworkFit(
            ownPrompt = composedResult.optimized_content,
            frameworks = techniques.filter(isContextPrompt))
      → toon FrameworkPicker-paneel:
           • 2–3 best passende (fits:true, gerangschikt), aanbevolen voorgeselecteerd
           • altijd "Behoud als-is" → geeft composedResult ongewijzigd door
      → bij keuze:
           • "as-is"    → onResult(composedResult, laatsteStapTechnique)   [huidig gedrag]
           • framework  → generatePrompt(gekozenFramework, {
                              promptContent: goal,
                              extraAnsweredFields: outcomes-als-velden })
                          → onResult({...packaged, recipe:{...recipe, framework_id}}, gekozenFramework)
```

De framework-fit-call vuurt **direct na** het samenstellen, zodat de latency deels verstopt zit
achter de compose-spinner die de gebruiker al ziet. De picker verschijnt met de aanbeveling
voorgeselecteerd.

---

## Te wijzigen bestanden

| Bestand | Wijziging |
|---|---|
| `src/types/index.ts` | Voeg optioneel `framework_id?: string` toe aan `PromptRecipe`. |
| `src/services/optimizeService.ts` | **Geen** nieuwe helper. `explainFrameworkFit` + `generatePrompt` hergebruiken. |
| `src/components/optimizer/PlanWizard.tsx` | `'framework'` aan `Phase`-union; `composeFinal` splitsen; framework-fit-state + `FrameworkPicker`-subcomponent; keuze → inpakken-of-doorgeven → `onResult`. |
| — | **Geen** edge-function-wijziging, **geen** OptimizedOutput-wijziging. |

---

## Stap 1 — `src/types/index.ts`

Voeg `framework_id` toe aan `PromptRecipe` (rond regel 505):

```ts
export interface PromptRecipe {
  goal: string;
  plan: PromptPlan;
  outcomes: StepOutcome[];
  /** Het framework waarin het eindresultaat is verpakt (indien de gebruiker koos). */
  framework_id?: string;
}
```

---

## Stap 2 — `src/components/optimizer/PlanWizard.tsx`

### 2a. Imports uitbreiden

- Uit `@/services/optimizeService`: voeg `explainFrameworkFit` toe aan de bestaande import.
- Uit `@/lib/techniques`: voeg `isContextPrompt` toe (structureFormat wordt al geïmporteerd).
- Uit `@/types`: voeg `FrameworkFit` toe.
- Uit `lucide-react`: `Package` (of `Boxes`) voor het picker-icoon; `Check`/`Sparkles`/`ArrowRight`
  zijn al geïmporteerd.

### 2b. `Phase`-union uitbreiden (rond regel 148)

```ts
type Phase = 'goal' | 'planning' | 'plan-review' | 'collecting' | 'composing' | 'framework' | 'error';
```

### 2c. Nieuwe state (bij de overige useState's, rond regel 190–217)

```ts
// Framework-verpakking: het samengestelde (nog niet verpakte) resultaat, de
// fit-rangschikking, welk framework gekozen is, en of we aan het verpakken zijn.
const [composedResult, setComposedResult] = useState<OptimizeResult | null>(null);
const [composedTechnique, setComposedTechnique] = useState<Technique | null>(null);
const [frameworkFits, setFrameworkFits] = useState<FrameworkFit[]>([]);
const [packaging, setPackaging] = useState(false);
```

`busy` uitbreiden zodat de doel-textarea uitgeschakeld blijft tijdens verpakken:

```ts
const busy = phase === 'planning' || phase === 'composing' || phase === 'framework';
```

### 2d. `composeFinal` splitsen (huidige functie rond regel 765)

De huidige `composeFinal` eindigt met `onResult({ ...res, recipe }, technique)`. Vervang dat
**laatste stuk** door: resultaat opslaan, framework-fit ophalen, en naar de `'framework'`-fase.
Het bestaande recept + clarity-gate blijven ongewijzigd.

```ts
// (binnen composeFinal, vervang de succes-afhandeling na de generatePrompt-call)
const recipe: PromptRecipe = { goal: goal.trim(), plan: p, outcomes: accumulated };
clearRunDraft();

// Bewaar het samengestelde resultaat; bied daarna framework-verpakking aan.
setComposedResult({ ...res, recipe });
setComposedTechnique(technique);

// Kandidaat-frameworks = alle context-raamwerken uit de referentiedata.
const frameworks = techniques.filter((t) => isContextPrompt(t));
if (frameworks.length === 0) {
  // Geen frameworks beschikbaar → direct het resultaat tonen (huidig gedrag).
  onResult({ ...res, recipe }, technique);
  return;
}

setPhase('framework');
log('framework_fit_run', { metadata: { candidates: frameworks.length } });
try {
  const fit = await explainFrameworkFit({
    ownPrompt: res.optimized_content,
    frameworks,
    preferredProvider: settings.provider,
    preferredModel: settings.model,
  });
  // Alleen passende frameworks, aanbevolen eerst; nooit throwt deze helper.
  const good = fit.fits.filter((f) => f.fits);
  setFrameworkFits(good.length > 0 ? good : fit.fits);
} catch {
  // Fit ophalen mislukt → picker toont alleen "Behoud als-is".
  setFrameworkFits([]);
}
```

> **Belangrijk:** `composeFinal` roept `onResult` nu alleen nog aan in het "geen frameworks"-pad.
> In het normale pad neemt de picker (stap 2e) het over.

### 2e. Nieuwe handlers (naast `composeFinal`)

```ts
/** "Behoud als-is": geef het samengestelde resultaat ongewijzigd door. */
function keepAsIs() {
  if (!composedResult || !composedTechnique) return;
  log('framework_kept_asis');
  onResult(composedResult, composedTechnique);
}

/**
 * Verpak het samengestelde prompt in het gekozen framework: her-genereer via de
 * bestaande `generate`-modus met het framework als technique en het al verzamelde
 * materiaal als gelabelde velden. Faalt dit, dan valt hij terug op het originele
 * (ongewijzigde) resultaat — de gebruiker houdt altijd een bruikbare template.
 */
async function packageInto(frameworkId: string) {
  if (!composedResult?.recipe) return;
  const framework = techniqueById(frameworkId);
  if (!framework) return;
  setPackaging(true);
  log('framework_packaged', { techniqueId: frameworkId });
  try {
    const res = await generatePrompt({
      technique: framework,
      promptContent: goal.trim() || '[BESCHRIJF HIER WAT JE WILT BEREIKEN]',
      followUpAnswers: {},
      // Al het verzamelde materiaal als gelabelde context — net als composeFinal.
      extraAnsweredFields: composedResult.recipe.outcomes.map((o) => ({
        id: o.step_id,
        label: outcomeLabel(o),
        answer: o.material,
      })),
      preferredProvider: settings.provider,
      preferredModel: settings.model,
      systemPrompt: settings.systemPrompt.trim() || undefined,
      toneInstruction: settings.toneInstruction.trim() || undefined,
      temperature: settings.temperature,
    });
    if (res.unclear || !res.optimized_content) {
      // Verpakken lukte niet zinvol → val terug op het originele resultaat.
      toast('Kon niet in dit framework verpakken; originele template behouden.', { icon: 'ℹ️' });
      onResult(composedResult, composedTechnique!);
      return;
    }
    const recipe: PromptRecipe = { ...composedResult.recipe, framework_id: frameworkId };
    onResult({ ...res, recipe }, framework);
  } catch {
    toast('Verpakken mislukt; originele template behouden.', { icon: 'ℹ️' });
    onResult(composedResult, composedTechnique!);
  } finally {
    setPackaging(false);
  }
}
```

> **Merk op:** `outcomeLabel` bestaat al bovenin het bestand (regel 113). `techniqueById` komt uit
> `useReferenceData()` (al gedestructureerd, regel 165).

### 2f. `resetStepState` / `handleClear` uitbreiden

Voeg aan `handleClear` (rond regel 277) toe zodat de nieuwe state ook meegaat:

```ts
setComposedResult(null);
setComposedTechnique(null);
setFrameworkFits([]);
setPackaging(false);
```

### 2g. Render — de picker tonen in de `'framework'`-fase

In het advies-blok (rond regel 943, waar op `phase` wordt vertakt: `planning` / `plan-review` /
anders `PlanExecutor`), voeg een tak toe **vóór** de PlanExecutor-else:

```tsx
) : phase === 'framework' ? (
  <FrameworkPicker
    fits={frameworkFits}
    techniqueById={techniqueById}
    packaging={packaging}
    onPackage={packageInto}
    onKeepAsIs={keepAsIs}
  />
) : (
```

### 2h. Nieuwe subcomponent `FrameworkPicker` (onderaan het bestand, naast `PlanReview`)

Stijl gelijk aan `PlanReview` / `ReviewStepRow`: `opl-card`-achtige rijen, rijksblauw-accenten,
radio-selectie, `opl-btn-primary`. De aanbevolen (eerste passende) staat voorgeselecteerd.

```tsx
/**
 * De afsluitende keuze: pak het samengestelde prompt in een herkenbaar framework,
 * of behoud de template as-is. De best passende frameworks staan bovenaan; de
 * eerste is voorgeselecteerd. "Behoud als-is" is er altijd.
 */
function FrameworkPicker({
  fits,
  techniqueById,
  packaging,
  onPackage,
  onKeepAsIs,
}: {
  fits: FrameworkFit[];
  techniqueById: (id?: string | null) => Technique | undefined;
  packaging: boolean;
  onPackage: (frameworkId: string) => void;
  onKeepAsIs: () => void;
}) {
  // Toon maximaal 3 opties; eerste = aanbevolen (voorgeselecteerd).
  const options = fits.slice(0, 3);
  const [selected, setSelected] = useState<string | null>(options[0]?.id ?? null);

  return (
    <div className="space-y-4">
      <div>
        <p className="text-sm font-medium text-slate-700 dark:text-slate-200">
          Verpak je prompt in een framework
        </p>
        <p className="mt-0.5 text-sm text-slate-500 dark:text-slate-400">
          We hebben je prompt geanalyseerd. Kies een framework dat past bij wat je hebt gemaakt,
          zodat je hem herkenbaar en herbruikbaar opslaat — of behoud hem zoals hij is.
        </p>
      </div>

      {options.length > 0 && (
        <ul className="space-y-3">
          {options.map((f, idx) => {
            const tech = techniqueById(f.id);
            if (!tech) return null;
            const isSel = selected === f.id;
            return (
              <li key={f.id}>
                <button
                  type="button"
                  onClick={() => setSelected(f.id)}
                  className={clsx(
                    'flex w-full items-start gap-3 rounded-xl border p-4 text-left shadow-sm transition-colors',
                    isSel
                      ? 'border-rijksblauw-400 bg-rijksblauw-50/50 dark:border-rijksblauw-500/50 dark:bg-rijksblauw-500/10'
                      : 'border-slate-200 bg-white hover:border-rijksblauw-300 dark:border-slate-700 dark:bg-slate-800',
                  )}
                >
                  <span
                    className={clsx(
                      'mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full border-2',
                      isSel
                        ? 'border-rijksblauw-500 bg-rijksblauw-500 text-white'
                        : 'border-slate-300 dark:border-slate-600',
                    )}
                  >
                    {isSel && <Check size={12} />}
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-semibold text-slate-800 dark:text-slate-100">
                        {tech.name}
                      </span>
                      {idx === 0 && (
                        <span className="opl-badge bg-rijksoranje/15 text-rijksoranje">aanbevolen</span>
                      )}
                    </div>
                    <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
                      {stripMarkdown(f.value)}
                    </p>
                  </div>
                </button>
              </li>
            );
          })}
        </ul>
      )}

      <div className="flex flex-wrap items-center justify-between gap-3 pt-1">
        <button
          type="button"
          className="text-sm font-medium text-slate-500 hover:text-rijksblauw-600 dark:text-slate-400"
          onClick={onKeepAsIs}
          disabled={packaging}
        >
          Behoud als-is
        </button>
        <button
          type="button"
          className="opl-btn-primary px-6 py-2.5"
          onClick={() => selected && onPackage(selected)}
          disabled={packaging || !selected}
        >
          {packaging ? (
            <>
              <Loader2 size={18} className="animate-spin" /> Verpakken…
            </>
          ) : (
            <>
              <Sparkles size={18} /> Verpak in framework <ArrowRight size={16} />
            </>
          )}
        </button>
      </div>
    </div>
  );
}
```

---

## Stap 3 — gedragslog-acties (optioneel maar consistent)

De code hierboven logt `framework_fit_run`, `framework_kept_asis`, `framework_packaged`. Voeg deze
action-strings toe aan het `action`-union-type in `src/services/behaviorService.ts` (zoek de
bestaande union met o.a. `'compose_run'`, `'step_committed'`). Zonder toevoeging faalt `tsc`.

---

## Ontwerpkeuzes (bewust)

1. **"Behoud als-is" altijd aanwezig en altijd werkend** → het huidige directe-template-gedrag
   gaat nooit verloren. Een flaky fit-call of "niets past goed" degradeert schoon naar vandaag.
2. **Verpakken her-draait `generate` op het samengestelde prompt** (via de outcomes), niet vanaf
   nul — dus de framework-versie is een getrouwe herstructurering van wat de gebruiker al zag.
3. **Fit-rangschikking op de samengestelde template-tekst** — dat is de juiste input (het
   daadwerkelijk afgeronde prompt) en precies wat `explainFrameworkFit` verwacht (`ownPrompt`).

---

## Verificatie na implementatie

1. `tsc -b` moet slagen (nieuwe `Phase`-tak, nieuwe log-acties, `framework_id` op recipe).
2. `npm run build` moet slagen.
3. **Handmatig, echte AI-round-trip** (kon in deze sessie niet headless):
   - Doel-flow doorlopen (bv. het projectplan-voorbeeld) tot de eindtemplate.
   - Controleer dat na "Naar de eindtemplate" de **FrameworkPicker** verschijnt met een
     aanbevolen framework voorgeselecteerd + 1–2 alternatieven.
   - "Verpak in framework" → resultaatscherm toont de template mét de framework-eigen koppen
     (bv. CRISPE `# CONTEXT: / # ROLE: / …`).
   - "Behoud als-is" → resultaatscherm toont de originele vlakke template (huidig gedrag).
   - Opslaan in bibliotheek werkt in beide gevallen; het opgeslagen recept bevat `framework_id`
     bij een verpakte template.
4. Randgeval: geen frameworks in de DB → geen picker, direct resultaat (via het "geen
   frameworks"-pad in `composeFinal`).

---

## Wat NIET nodig is (expliciet)

- ❌ Geen wijziging aan `supabase/functions/optimize-prompt/index.ts` (beide modi bestaan al).
- ❌ Geen `supabase functions deploy` voor deze feature.
- ❌ Geen nieuwe service-helper in `optimizeService.ts`.
- ❌ Geen wijziging aan `OptimizedOutput.tsx` (ontvangt hetzelfde `OptimizeResult`-vorm).
- ❌ Geen DB-migratie (het framework is een bestaande `techniques`-rij; `framework_id` wordt
  alleen in het JSON-recept meegeschreven, niet als kolom).
```
