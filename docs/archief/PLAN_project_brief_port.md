# Port: analyse the project before building the prompt

Status: not started in this repo. Built and deployed in AIPromptHub on 2026-08-11; this document is
the port instruction, written so it can be handed to an agent in this repo without re-deriving
anything.

Source of truth to diff against: `~/Documents/GitHub/AIPromptHub`, files
`supabase/functions/optimize-prompt/index.ts`, `src/services/chatProjectService.ts`,
`src/services/optimizeService.ts`, `src/pages/HomePage.tsx`,
`src/components/optimizer/ProjectContextBar.tsx`, `supabase/migrations/0053_project_brief_cache.sql`.

---

## 1. The problem this fixes

A user attached a 12,789-character project (a Dutch mindfulness app) and built a prompt for
"analyse marketing screenshots". The generated prompt was high quality and contained **nothing** from
the project: generic audience, generic tone, no product name, no mention of the field it operates in.
The context was attached, under the size limit, and passed to the generate step. It still did not
land. Four causes, in order of weight:

1. **The instruction was a warning, not a mandate.** `withProject` said: this is background, not an
   instruction; do not carry it out; do not ask about what is already here. Three of four clauses
   were brakes. Nothing demanded that the produced prompt be recognisably about *this* project.
2. **Nothing asked the model to select.** A project instruction is written for a human or for a
   chat — stack, folders, tables, release process. A prompt about marketing copy needs maybe ten
   lines of that: product, audience, voice, fixed terms. Those ten lines were scattered through
   thirteen thousand characters and no step was asked to find them.
3. **Half the steps were project-blind.** Only some modes wrapped with the project; the modes that
   write actual content did not.
4. **A small model in front of a large context.** The admin provider was `mistral-small-latest`, and
   a 12.8k-character prefix framed as "background" is the first thing such a model drops.

## 2. What was built (four parts)

### 2.1 A project analysis step — `mode: 'project-brief'`

One AI call that reads the whole project once and writes a fixed, compact brief: what the project is,
who it is for, voice and language, fixed terms, hard limits, what to watch out for, and what every
prompt for this project must make concrete. That brief — a few hundred tokens — is what goes into
every later step as `projectContext`, instead of the raw material.

Deliberately **task-independent**. The tempting version analyses "for this one prompt", which cannot
be cached because the next prompt has a different goal. Analysing the *project* is valid once per
project version, so it can be paid for once. Narrowing it to the task at hand is the build step's
job, driven by the rewritten instruction in 2.2.

Runs on `STRONGEST_MODEL[candidate]`, not the admin's per-call model — same reasoning as
`project-optimize`: this runs once and steers everything after it. Temperature 0.2, `max_tokens`
1536, and it calls `PROVIDERS` rather than the language-wrapped `providers` because the brief must
stay in the project's own language (that is where the fixed terms are).

Honest degrade: if no provider produces a brief, the client falls back to the raw project material.
Unfiltered context is worse than the brief; both beat a prompt that does not know the project.

### 2.2 `withProject` rewritten from warning to mandate

The block now leads with the material, then states how to use it: work out which parts matter for the
task, name the subject/product/audience explicitly in the project's own terms, honour its language
and register, treat its constraints as hard requirements, and — the line that does the work —

> The test: a prompt that would read exactly the same for any other company or product has FAILED.
> Someone who knows this project must recognise it in the first two sentences.

The anti-injection clause survives as one line at the end instead of three at the start.

### 2.3 Every content-writing mode now gets the project

`analyze`, `plan`, `plan-step-material`, `plan-step-analyze`, `assumption-check`, `persona-fill`,
`fewshot-example`, `fewshot-extract` and `meta-build` moved from `withDomain(...)` to
`withContext(..., body)`. Left deliberately without: `title` and `metadata` (they summarise an
already-written template), `recommend` (picks a technique from a goal; the subject is irrelevant) and
`execute` (runs a prompt; the context belongs inside that prompt).

### 2.4 A three-layer cache

1. In-memory map, keyed `${projectId}:${hash}` — same session, no traffic.
2. `chat_projects.generator_briefs` (jsonb) — tomorrow, another device, after a reload: one small
   query.
3. The edge function — only when no brief exists for exactly this material.

The key is a SHA-256 prefix of the material that went in (FNV-1a fallback where `crypto.subtle` is
absent). Changing the project instruction, or flipping "include source files", is different input and
therefore a different key: a stale brief can never linger, and toggling files back and forth costs
nothing. At most four briefs are kept per project, oldest pruned, with a 64 kB CHECK as a backstop.

**Token arithmetic** (the reason this is cheaper, not more expensive): the Awaren project is ~3,500
tokens. A prompt build makes 5–7 AI calls that each carried it, so ~24,500 input tokens of project
context per prompt. After: one analysis (~3,500 in, ~500 out, once per project version), then ~500
tokens per step — ~3,500 per prompt. Break-even on the first prompt, pure saving after that.

## 3. Port instructions for this repo

The architecture is the same; these are the differences that matter.

| Point | AIPromptHub | Here |
| --- | --- | --- |
| Project context placement | prefix, before the system prompt, with `CACHE_BOUNDARY` for Claude prompt caching | appended *after* the system prompt, no cache boundary |
| Context helper | `withContext(system, body)` wraps domain + project | no helper; `withProject(system, body.projectContext)` called at 6 sites |
| Premium gate | `checkProjectContextAccess` rejects project context without a subscription | **no gate at all** |
| Modes | no `mock-answer` / `framework-fit` | both exist |
| i18n | 8 locale files | Dutch strings hardcoded in the components |
| Next migration | 0053 (applied) | 0032 |

Steps:

1. **`supabase/functions/optimize-prompt/index.ts`**
   - Add `'project-brief'` to the `Mode` union, to the mode-resolution chain, and to
     `MODE_MAX_TOKENS` (1536).
   - Copy `PROJECT_BRIEF_SYSTEM_PROMPT` and `buildProjectBriefUserMessage` verbatim from
     AIPromptHub (they are self-contained).
   - Copy the `project-brief` handler; drop the comment about `checkProjectContextAccess` and add an
     explicit auth check instead — see step 4.
   - Replace the body of `withProject` with the new text. Keep this repo's *placement* (append after
     the system prompt) unless you also port `CACHE_BOUNDARY`; the brief is small, so the caching
     argument for prefixing barely applies here.
   - Consider introducing `withContext` and routing the content-writing modes through it. This repo
     currently wraps only 6 sites; `persona-fill`, `fewshot-*`, `meta-build`, `plan*` and `analyze`
     are project-blind here too.
2. **Migration `0032_project_brief_cache.sql`** — copy 0053: the `generator_briefs` jsonb column, its
   comment, the 64 kB CHECK, and the `touch_chat_project` change. That last one matters here too:
   this repo's trigger sets `updated_at` on *every* UPDATE and the sidebar sorts on it, so without
   the change, attaching a project in the builder reorders the user's project list and looks like
   they edited it. New body: bump `updated_at` only when `name` or `instructions` actually changed.
3. **`src/services/optimizeService.ts`** — copy `analyzeProjectContext`. It posts the material in the
   `projectContext` field on purpose (see step 4).
4. **Decide who may run an analysis.** In AIPromptHub the material rides in `projectContext`, so the
   existing premium gate covers the new mode for free. Here there is no gate, which means every
   project attach fires a strongest-model call over up to 60,000 characters, for anyone. Pick one
   before shipping:
   - *Authenticated only* (minimum): reuse `isAuthenticatedRequest` in the handler. Projects already
     require an account, so this costs nothing in reach.
   - *Plus a ceiling*: cap the analysed material (e.g. 20,000 characters, instruction first) so a
     ten-file project cannot produce a single expensive call.
   The cache makes the steady-state cost small; the risk is the cold path, not the warm one.
5. **`src/services/chatProjectService.ts`** — copy `briefCache`, `MAX_CACHED_BRIEFS`, `BriefEntry`,
   `hashMaterial`, `readBriefs`, `writeBrief` and `ensureProjectBrief`; add the third `ai` parameter
   to `buildGeneratorContext`; return `text: brief || material` plus `analyzed: Boolean(brief)`, and
   add `analyzed` to `GeneratorContext`.
6. **`src/pages/OptimizerPage.tsx`** (this repo's equivalent of `HomePage`) — pass the AI settings
   into `buildGeneratorContext` so the analysis uses the configured provider.
7. **`src/components/optimizer/ProjectContextBar.tsx`** — two string changes, hardcoded Dutch here:
   the loading line becomes "Je project wordt geanalyseerd…" (the first attach takes tens of seconds;
   without that line the wait reads as a hang), and the attached line becomes "geanalyseerd — levert
   de context voor deze prompt" when `context.analyzed`, otherwise the current text. Never claim
   "analysed" when the analysis failed and the raw material is being used.

## 4. Verifying it worked

Type-check and tests are necessary but prove nothing about this change. The real check is a
before/after on one prompt:

1. Attach a project with a strong identity, build any prompt, and read the first two sentences of the
   result. The product and its audience must be there, in the project's own words.
2. Build a second prompt with the same project — the analysis must come from the cache (no
   `project-brief` call in the function logs, no visible wait).
3. Edit the project instruction, build again — the analysis must re-run exactly once.
4. Check `chat_projects.updated_at` does not move when only a brief is written.

## 5. What is still open (both repos)

- **The admin system prompt overrides the code default.** In AIPromptHub, `app_settings.ai_settings.
  systemPrompt` holds an older Dutch text that hardcodes "in het Nederlands" and knows nothing about
  project context — which is why any instruction added to `DEFAULT_SYSTEM_PROMPT` in code has no
  effect in production. That is why the new wording lives in `withProject`, which is always applied
  server-side. Check the equivalent row here before assuming a code change is live.
- **The generate step still runs on whatever model the admin picked.** The analysis now uses the
  strongest model, but the build itself does not. On a small model the brief helps a great deal more
  than the raw context did; switching the builder's provider is a one-setting change and remains the
  single largest remaining lever.
