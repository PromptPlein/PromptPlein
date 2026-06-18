# 🏛️ Nederlandse Overheid Prompt Library - Phase 1 Implementatie

## PROJECT OVERZICHT

**Doel:** Bouw een moderne webapplicatie waar Nederlandse overheidsmederwerkers prompts kunnen uploaden, delen, zoeken en optimaliseren op basis van geavanceerde AI-prompting technieken.

**Gebruikers:** Ambtenaren van verschillende ministeries (OCW, Binnenlandse Zaken, Buitenlandse Zaken, etc.)

**Phase 1 Scope:** Core MVP met basis-optimalisatie, zoeken/filteren, en Three.js visualisaties

---

## TECHNISCHE STACK

### Frontend
- **Framework:** React 18+ met TypeScript
- **Build Tool:** Vite
- **3D Graphics:** react-three-fiber + drei
- **State Management:** React Hooks / Context API
- **Styling:** CSS-in-JS of Tailwind (naar voorkeur)
- **HTTP Client:** Fetch API of Supabase JS Client

### Backend
- **Database:** Supabase (PostgreSQL)
- **Serverless Functions:** Supabase Edge Functions
- **API Integration:** 
  - Claude API (Anthropic) - PRIMAIR
  - DeepSeek API - FALLBACK/TESTING

### Deployment
- Frontend: Vercel of Netlify
- Supabase Functions: Supabase hosting

---

## DATABASE SCHEMA

```sql
-- Rollen (beheerd door admin, nu hardcoded voor Phase 1)
CREATE TABLE roles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL UNIQUE,
  description TEXT,
  created_at TIMESTAMP DEFAULT NOW()
);

-- Categorieën (beheerd door admin, nu hardcoded voor Phase 1)
CREATE TABLE categories (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL UNIQUE,
  description TEXT,
  created_at TIMESTAMP DEFAULT NOW()
);

-- Prompt Technieken (beheerd door admin)
CREATE TABLE techniques (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL UNIQUE,
  description TEXT,
  follow_up_questions JSONB,  -- Array van vragen die gesteld moeten worden
  template TEXT,  -- Hoe de optimalisatie gegenereerd moet worden
  created_at TIMESTAMP DEFAULT NOW()
);

-- Prompts
CREATE TABLE prompts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title TEXT NOT NULL,
  description TEXT,  -- User-provided omschrijving
  content TEXT NOT NULL,  -- De originele prompt
  category_id UUID REFERENCES categories(id),
  role_id UUID REFERENCES roles(id),
  sharing_level TEXT DEFAULT 'private',  -- private, department, ministry, role, public
  created_by TEXT NOT NULL,  -- Naam van creator (geen auth in Phase 1)
  is_favorite BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

-- Geoptimaliseerde Prompts
CREATE TABLE optimizations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  prompt_id UUID REFERENCES prompts(id) ON DELETE CASCADE,
  technique_id UUID REFERENCES techniques(id),
  optimized_content TEXT NOT NULL,  -- De AI-gegenereerde optimalisatie
  follow_up_answers JSONB,  -- Antwoorden op vervolgvragen (JSON)
  created_at TIMESTAMP DEFAULT NOW()
);

-- Indices voor performance
CREATE INDEX idx_prompts_category ON prompts(category_id);
CREATE INDEX idx_prompts_role ON prompts(role_id);
CREATE INDEX idx_prompts_sharing ON prompts(sharing_level);
CREATE INDEX idx_prompts_created_by ON prompts(created_by);
CREATE INDEX idx_optimizations_prompt ON optimizations(prompt_id);
```

---

## PROMPT TECHNIEKEN - PHASE 1 CONFIGURATIE

### 1. PERSONA PROMPTING
**Doel:** Prompt laten schrijven vanuit perspectief van een specifieke persoon

**Vervolgvragen:**
- Wie is de persoon?
- Wat is belangrijk voor hen?
- Wat willen ze graag weten?
- Wat zijn hun belangen?

**Template (gegenereerd output):**
```
Je bent [PERSONA]. [KARAKTERISTIEKEN].

Jouw prioriteiten zijn: [PRIORITEITEN]
Je bent geïnteresseerd in: [INTERESSES]

Gegeven deze context, antwoord op het volgende:
[ORIGINELE PROMPT]
```

---

### 2. CHAIN OF THOUGHT
**Doel:** AI stap-voor-stap door redenering laten gaan

**Vervolgvragen:**
- (Geen vervolgvragen, template spreekt voor zich)

**Template (gegenereerd output):**
```
Ik wil dat je mij stap voor stap door dit probleem helpt:

1. Neem me stap voor stap mee
2. Stel één vraag, ik geef één antwoord
3. Stel daarna weer een vraag

[ORIGINELE PROMPT]

Wanneer je geen vragen meer hebt, geef me dan het eindresultaat.
```

---

### 3. ONE-SHOT PROMPTING
**Doel:** Eén voorbeeld geven van gewenste input/output

**Vervolgvragen (validatie):**
- Geef een voorbeeld prompt met input en verwachte output
- Systeem checkt: bevat het ONE voorbeeld met duidelijke input + output?

**Template (gegenereerd output):**
```
VOORBEELD:
Input: [USER EXAMPLE INPUT]
Output: [USER EXAMPLE OUTPUT]

Gegeven dit voorbeeld, genereer dezelfde soort output voor:
[ORIGINELE PROMPT]
```

---

### 4. FEW-SHOT PROMPTING
**Doel:** Meerdere voorbeelden geven (2-5) van gewenste output

**Vervolgvragen (validatie):**
- Geef 2-5 verschillende voorbeelden met input en output
- Systeem checkt: zijn alle inputs en outputs duidelijk?

**Template (gegenereerd output):**
```
VOORBEELDEN:

Voorbeeld 1:
Input: [EXAMPLE 1 INPUT]
Output: [EXAMPLE 1 OUTPUT]

Voorbeeld 2:
Input: [EXAMPLE 2 INPUT]
Output: [EXAMPLE 2 OUTPUT]

[MEER VOORBEELDEN...]

Gegeven deze voorbeelden, genereer dezelfde soort output voor:
[ORIGINELE PROMPT]
```

---

## SHARING LEVELS EXPLAINED

| Level | Zichtbaarheid | Use Case |
|-------|---------------|----------|
| **private** | Alleen voor maker | Persoonlijke experimenten |
| **department** | Afdeling | Teamwerk binnen afdeling |
| **ministry** | Heel ministerie | Veel gebruikt, ministerie-breed |
| **role** | Alle mensen met dezelfde rol (bijv. alle communicatieadviseurs) | Cross-ministry reuse |
| **public** | Iedereen | Algemene best practices |

---

## FEATURE REQUIREMENTS - PHASE 1

### 1. DASHBOARD
**Wat te doen:**
- [ ] Rol-selector (dropdown) - gebruiker selecteert hun rol
- [ ] Categorieën weergeven als clickable cards/grid
- [ ] Recent prompts tonen
- [ ] Quick actions: "Nieuwe prompt uploaden", "Zoeken"
- [ ] Three.js background: Subtiele animating mesh/particles

**Three.js Details:**
- Gradient mesh (Perlin noise) die langzaam morfft
- Monocolor of twee verwante tinten (government-look)
- FPS 30-45 max (niet te heavy)

---

### 2. PROMPT UPLOAD
**Wat te doen:**
- [ ] Form met velden:
  - Titel
  - Beschrijving (user-provided, voor zoeken)
  - Prompt content (textarea)
  - Categorie (dropdown)
  - Sharing level (radio buttons: private/department/ministry/role/public)
- [ ] Validatie
- [ ] Opslaan naar database

---

### 3. ZOEKEN & FILTEREN
**Zoeken:**
- [ ] Op prompt titel
- [ ] Op prompt beschrijving
- [ ] Live preview van resultaten

**Filteren:**
- [ ] Op Categorie
- [ ] Op Techniek
- [ ] Op Rol
- [ ] Op Sharing level
- [ ] Combineerbare filters

**Search Results UI:**
- [ ] Cards met prompt title, description, techniek, rol
- [ ] Three.js: Subtiele 3D perspective op hover (max 5-10° rotation)
- [ ] Copy-knop (one-click)
- [ ] Share-knop (genereert shareable link)
- [ ] Favorieten-knop (heart icon)

---

### 4. PROMPT OPTIMIZER
**Workflow:**
1. Gebruiker selecteert een van 4 technieken (dropdown)
2. Systeem toont korte beschrijving van techniek
3. Als vervolgvragen nodig: modale dialog met vragen
4. Gebruiker vult antwoorden in
5. "Optimaliseer" knop → roept Supabase Function aan
6. AI genereert optimalisatie
7. Resultaat verschijnt in editable textarea
8. Gebruiker kan aanpassen
9. Kan copyen na wijziging

**Three.js Details:**
- Smooth fade/transition tussen input en output
- Optioneel: particles vliegen naar output wanneer AI klaar is

---

### 5. FAVORIETEN & BLADWIJZERS
- [ ] Heart-icon om prompt aan favorieten toe te voegen
- [ ] Aparte pagina/sectie "Mijn favorieten"
- [ ] Filter "Show only favorites"

---

## API INTEGRATIE - Supabase Functions

### Function 1: `optimize-prompt`
**Input:**
```json
{
  "promptContent": "string",
  "technique": "persona" | "chain-of-thought" | "one-shot" | "few-shot",
  "followUpAnswers": { "question1": "answer1", ... }
}
```

**Output:**
```json
{
  "optimized_content": "string",
  "success": boolean,
  "error": "string (if failed)"
}
```

**Logic:**
1. Haal techniek-template uit database
2. Vul template in met promptContent + followUpAnswers
3. Roep Claude API aan (via Anthropic SDK)
4. Als Claude failed: fallback naar DeepSeek
5. Return geoptimaliseerde prompt

---

## FILE STRUCTURE

```
src/
├── components/
│   ├── Dashboard/
│   │   ├── Dashboard.tsx
│   │   ├── RoleSelector.tsx
│   │   ├── CategoryGrid.tsx
│   │   └── DashboardBackground.tsx (Three.js)
│   ├── SearchResults/
│   │   ├── SearchResults.tsx
│   │   ├── PromptCard.tsx
│   │   └── FilterBar.tsx
│   ├── PromptUpload/
│   │   ├── PromptUploadForm.tsx
│   │   └── UploadModal.tsx
│   ├── PromptOptimizer/
│   │   ├── PromptOptimizer.tsx
│   │   ├── TechniqueSelector.tsx
│   │   ├── FollowUpQuestionsModal.tsx
│   │   └── OptimizedOutput.tsx
│   ├── ThreeScenes/
│   │   ├── DashboardMesh.tsx (animating background)
│   │   ├── PromptCardMesh.tsx (3D card effect)
│   │   └── TransitionEffect.tsx (fade between input/output)
│   └── Common/
│       ├── Header.tsx
│       ├── Navigation.tsx
│       └── Footer.tsx
├── pages/
│   ├── HomePage.tsx
│   ├── SearchPage.tsx
│   ├── OptimizerPage.tsx
│   └── FavoritesPage.tsx
├── hooks/
│   ├── usePrompts.ts
│   ├── useOptimization.ts
│   ├── useSearch.ts
│   └── useThreeScene.ts
├── services/
│   ├── supabaseClient.ts
│   ├── promptService.ts
│   ├── optimizationService.ts
│   └── searchService.ts
├── utils/
│   ├── constants.ts
│   ├── helpers.ts
│   └── validators.ts
├── types/
│   ├── prompt.ts
│   ├── technique.ts
│   └── api.ts
├── styles/
│   └── globals.css
└── App.tsx
```

---

## IMPLEMENTATION ORDER (RECOMMENDED)

### Week 1: Setup & Foundation
1. [ ] Vite project opzetten
2. [ ] Supabase project creëren + database schema
3. [ ] TypeScript types definiëren
4. [ ] Supabase client instellen

### Week 2: Database & Backend
1. [ ] Database tabellen creëren
2. [ ] Seed techniques/categories/roles
3. [ ] Supabase Functions opzetten (optimize-prompt)
4. [ ] API key management (Claude + DeepSeek in env vars)

### Week 3: Frontend - Dashboard & Upload
1. [ ] Dashboard layout (React)
2. [ ] Three.js background (react-three-fiber)
3. [ ] Prompt upload form
4. [ ] Database CRUD operations

### Week 4: Search & Filtering
1. [ ] Search functionality
2. [ ] Filter UI
3. [ ] Search results cards
4. [ ] Three.js card hover effects

### Week 5: Optimizer
1. [ ] Techniek selector
2. [ ] Follow-up questions modal
3. [ ] Optimization service (roept Supabase Function aan)
4. [ ] Output editor + copy functie

### Week 6: Polish & Testing
1. [ ] Favorieten/Bladwijzers
2. [ ] Share links
3. [ ] Three.js transitions
4. [ ] Testing & bug fixes
5. [ ] Deployment voorbereiding

---

## TRÊS.JS SPECIFICS

### 1. Dashboard Background
- `react-three-fiber` Canvas
- Fragmentshader met Perlin noise
- Smooth morphing colors
- ~30 FPS target
- Geen interactie, puur achtergrond

### 2. Search Result Cards
- Subtiele 3D perspective transform
- Rotation op mouse hover (max 5°)
- Shadow effect dat aanpast met rotation
- Smooth easing (0.3s transitions)

### 3. Optimizer Transition
- Fade-out input panel
- Fade-in output panel
- Particles vliegen (optional, mooi effect)
- Duration: 0.8s

**Lib:** drei heeft helpers voor deze effecten (PerspectiveCamera, Spotlight)

---

## ENVIRONMENT VARIABLES (.env.local)

```env
VITE_SUPABASE_URL=https://xxxxx.supabase.co
VITE_SUPABASE_ANON_KEY=xxxxx

# (Niet in .env!)
# CLAUDE_API_KEY → Supabase Function env
# DEEPSEEK_API_KEY → Supabase Function env
```

---

## SUPABASE FUNCTIONS ENVIRONMENT

```bash
supabase secrets set CLAUDE_API_KEY="sk-..."
supabase secrets set DEEPSEEK_API_KEY="sk-..."
```

---

## ACCEPTANCE CRITERIA - PHASE 1 COMPLETE

- ✅ Gebruikers kunnen prompts uploaden met titel, beschrijving, categorie
- ✅ Gebruikers kunnen zoeken op titel + beschrijving
- ✅ Gebruikers kunnen filteren op categorie, techniek, rol, sharing level
- ✅ Gebruikers kunnen 4 technieken selecteren en prompt optimaliseren
- ✅ Follow-up vragen werken voor Persona + One-shot + Few-shot
- ✅ Claude API genereert optimalisaties
- ✅ DeepSeek fallback werkt
- ✅ Copy-knop werkt (one-click copy)
- ✅ Share-links genereren (URL shareable)
- ✅ Favorieten/Bladwijzers werken
- ✅ Three.js background op dashboard
- ✅ Three.js hover effect op search cards
- ✅ Three.js transition op optimizer
- ✅ Responsive design (mobile + desktop)
- ✅ Performance: FPS 30+ op alle Three.js scenes
- ✅ Deployment: Frontend + Supabase live

---

## NOTES VOOR IMPLEMENTATIE

1. **Geen authentication in Phase 1** - gebruiker vult naam in optioneel
2. **Hardcode technieken** in `seed.ts` voor Phase 1 (later admin panel)
3. **Sharing levels** filteren server-side (query met role_id checks)
4. **Three.js performance**: Monitor met `stats.js` library
5. **Error handling**: Toast notifications voor failures
6. **Loading states**: Skeletons of spinners bij API calls
7. **Accessibility**: ARIA labels, keyboard navigation

---

## RESOURCES & LIBRARIES

**React + TypeScript:**
- react-router-dom (routing)
- zustand (state management, optional)
- clsx (className merging)

**Three.js:**
- three
- @react-three/fiber
- @react-three/drei

**Supabase:**
- @supabase/supabase-js

**UI:**
- react-hot-toast (notifications)
- lucide-react (icons)

**Styling:**
- Tailwind CSS OR custom CSS

**API:**
- @anthropic-ai/sdk
- axios or fetch

---

## DEPLOYMENT CHECKLIST

### Frontend (Vercel/Netlify)
- [ ] Environment variables ingesteld
- [ ] Build succesvol
- [ ] Pages deployen

### Supabase
- [ ] Database migrated
- [ ] Edge Functions deployed
- [ ] Secrets ingesteld (API keys)
- [ ] RLS policies (optional Phase 1)

### Testing
- [ ] Search werkt
- [ ] Optimization werkt
- [ ] Copy/Share werkt
- [ ] Favorieten werken
- [ ] Three.js rendeert correct

---

## CONTACT & SUPPORT

Voor vragen over requirements, refér terug naar dit document.
Voor technische vragen tijdens implementatie, use claude.ai's Context.

**Happy coding! 🚀**
