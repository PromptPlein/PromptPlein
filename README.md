# 🏛️ Overheid Prompt Library — Phase 1

Een moderne webapplicatie waar Nederlandse overheidsmedewerkers AI-prompts kunnen
**uploaden, delen, zoeken en optimaliseren** op basis van bewezen prompting-technieken.

> **Phase 1 (MVP):** core-functionaliteit, basis-optimalisatie, zoeken/filteren en
> Three.js-visualisaties. Geen authenticatie.

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
   supabase db push                # of: plak supabase/migrations/0001_init.sql
   psql "$DATABASE_URL" -f supabase/seed.sql
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
  components/   common · prompts · optimizer · three
  context/      ReferenceDataContext (rollen/categorieën/technieken)
  data/         seed.ts (hardcoded reference-data, Phase 1)
  hooks/        useTilt, useDebouncedValue
  lib/          supabase client + utils
  pages/        Home · Search · Optimizer · Favorites · PromptDetail
  services/     repository (Supabase ↔ localStore) · optimizeService
  types/        domeinmodellen
supabase/
  migrations/   0001_init.sql
  seed.sql
  functions/    optimize-prompt/ (Claude + DeepSeek)
```

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
