# 🏛️ Overheid Prompt Library

Een moderne webapplicatie waar Nederlandse overheidsmedewerkers AI-prompts kunnen
**uploaden, delen, zoeken en optimaliseren** op basis van bewezen prompting-technieken.

> **Phase 1 (MVP):** core-functionaliteit, basis-optimalisatie, zoeken/filteren, Three.js.
> **Phase 2:** admin-panel, 9 technieken, e-mail/QR-delen, analytics & trending, geavanceerd zoeken.

## 🆕 Phase 2 in het kort

- **Admin-panel** (`/admin`) — token-login, dashboard met grafieken, CRUD voor **technieken**
  (template- & vervolgvragen-editor met live preview), **rollen** en **categorieën**
  (incl. CSV-import en herordenen), plus een **audit log** van alle beheeracties.
- **9 optimalisatietechnieken** — Persona, Multi-Persona, Chain-of-Thought, Few-Shot,
  Gestructureerde Output, Socratic, Meta, CRISP en CARE.
- **Delen** — genereer een **QR-code** en deelbare link (`/share/[token]`), of stuur via
  **e-mail** met een ingevuld sjabloon. Weergaven worden geteld.
- **Analytics** — events worden gelogd (aanmaken, zoeken, optimaliseren, delen, favoriet).
  Bekijk **Trending**, je eigen **activiteit** en de admin-analytics met **CSV-export**.
- **Geavanceerd zoeken** — multi-select op categorie/rol/techniek/deelniveau, datumbereik en sortering.

### Admin-token
- Demo-modus: token `admin`.
- Productie: zet `VITE_ADMIN_TOKEN` in `.env` voor je eigen token.

## ✨ Functionaliteit

- **Dashboard** met een live Three.js shader-achtergrond (Perlin-noise morphing) en categorie-grid.
- **Prompts uploaden** met categorie, rol en deelniveau (privé → openbaar).
- **Zoeken & filteren** op titel/inhoud, categorie, rol, techniek en deelniveau — met deelbare URL's.
- **Optimaliseren** met 4 prompting-technieken (Persona, Chain-of-Thought, Few-Shot, Gestructureerde Output),
  inclusief vervolgvragen en een vloeiende fade-overgang van invoer naar resultaat.
- **Favorieten**, **kopiëren** en **deelbare links**.
- **3D kaart-hover-effect** (perspectief + meebewegende schaduw) op de zoekresultaten.

## 🧱 Stack

| Laag       | Technologie                                              |
| ---------- | ------------------------------------------------------- |
| Frontend   | React 18 + TypeScript + Vite                            |
| Styling    | Tailwind CSS (Rijkshuisstijl-palet)                    |
| 3D         | react-three-fiber + three.js                           |
| Routing    | react-router-dom                                       |
| Backend    | Supabase (PostgreSQL) + Edge Functions                  |
| AI         | Claude (Anthropic) — primair · DeepSeek — fallback     |

## 🚀 Snel starten (zonder backend)

De app draait **direct**, zonder Supabase, met een lokale `localStorage`-database
en een deterministische template-optimizer. Ideaal voor demo en ontwikkeling.

```bash
npm install
npm run dev
```

Open http://localhost:5173. De footer toont of je in **demo-modus** of **Supabase-modus** zit.

## 🔌 Met Supabase verbinden

1. Maak een Supabase-project en kopieer `.env.example` naar `.env`:

   ```bash
   cp .env.example .env
   ```

   Vul `VITE_SUPABASE_URL` en `VITE_SUPABASE_ANON_KEY` in.

2. Voer het schema en de seed uit (via de Supabase SQL-editor of CLI):

   ```bash
   # Schema (Phase 1 + Phase 2)
   psql "$DATABASE_URL" -f supabase/migrations/0001_init.sql
   psql "$DATABASE_URL" -f supabase/migrations/0002_phase2.sql
   # Seed reference-data (rollen, categorieën, 4 + 5 technieken)
   psql "$DATABASE_URL" -f supabase/seed.sql
   psql "$DATABASE_URL" -f supabase/seed_phase2.sql
   ```

3. Deploy de Edge Function en stel de API-keys in:

   ```bash
   supabase functions deploy optimize-prompt
   supabase secrets set CLAUDE_API_KEY=sk-ant-...
   supabase secrets set DEEPSEEK_API_KEY=sk-...      # optioneel (fallback)
   ```

De app schakelt automatisch over naar Supabase zodra de env-variabelen aanwezig zijn.

## 🤖 Optimalisatie-flow

1. Frontend stuurt `techniqueId`, `template`, `promptContent` en `followUpAnswers`
   naar de Edge Function (`optimize-prompt`).
2. De function vult de template en roept **Claude** (`claude-opus-4-8`) aan.
3. Faalt Claude → **DeepSeek** fallback. Faalt die ook → ruwe ingevulde template.
4. Zonder backend gebruikt de frontend zelf de lokale template-fill.

## 📁 Structuur

```
src/
  components/   common · prompts · optimizer · three · admin · share · analytics
  context/      ReferenceDataContext (rollen/categorieën/technieken, met refresh)
  data/         seed.ts (reference-data: 9 technieken)
  hooks/        useTilt · useDebouncedValue · useAdmin
  lib/          supabase client · utils · download
  pages/        Home · Search · Optimizer · Favorites · Trending · Activity ·
                PromptDetail · SharePreview · admin/* (Dashboard, Technieken,
                Rollen, Categorieën, Analytics, Audit)
  services/     repository · optimizeService · analyticsService ·
                shareService · adminService · localStore
  types/        domeinmodellen
supabase/
  migrations/   0001_init.sql · 0002_phase2.sql
  seed.sql · seed_phase2.sql
  functions/    optimize-prompt/ (Claude + DeepSeek)
```

> Reference-data, analytics, shares en audit-log werken **zowel in demo-modus**
> (localStorage) **als met Supabase**. De `optimize-prompt` Edge Function blijft de
> enige server-side functie; delen en analytics gebruiken directe tabel-toegang.

## 🛠️ Scripts

```bash
npm run dev       # ontwikkelserver
npm run build     # type-check + productie-build
npm run preview   # preview van de build
```

## 📌 Phase 1 aannames

- Geen authenticatie; `created_by` is een vrije tekstnaam.
- Rollen, categorieën en technieken zijn hardcoded (`src/data/seed.ts` + `supabase/seed.sql`).
- RLS-policies staan in Phase 1 open; vervang ze door auth-policies in Phase 2.
- Niet bedoeld voor verwerking van persoonsgegevens.
