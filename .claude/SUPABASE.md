# Supabase — PromptPlein

**Project ref:** `qpttoyahhjybejgqohfz`
**URL:** https://qpttoyahhjybejgqohfz.supabase.co (komt overeen met `VITE_SUPABASE_URL` in `.env`)

## Welke MCP-server (BELANGRIJK)

Gebruik in deze repo ALTIJD de project-scoped server uit [`.mcp.json`](../.mcp.json),
met tool-prefix **`mcp__supabase__*`**. Die zit vast aan project `qpttoyahhjybejgqohfz`
en heeft geen `project_id`-parameter — hij kan dus niet de verkeerde database raken.

Gebruik NOOIT de `mcp__plugin_supabase_supabase__*`-tools hier. Dat is een aparte,
globaal geïnstalleerde plugin die op de **Awaren**-organisatie is ingelogd
(projecten AwarenApp, MoonMix). Doe vanuit PromptPlein geen enkele wijziging in Awaren.

Verifieer vóór elke DDL met `mcp__supabase__get_project_url` dat de URL
`https://qpttoyahhjybejgqohfz.supabase.co` teruggeeft.

## Verbinding opnieuw opzetten (als de auth verloopt)

1. MCP-server toevoegen (project-scope):

   ```
   claude mcp add --scope project --transport http supabase "https://mcp.supabase.com/mcp?project_ref=qpttoyahhjybejgqohfz"
   ```

2. Authenticeren — in een gewone terminal (NIET de IDE-extensie):

   ```
   claude /mcp
   ```

   Kies de `supabase`-server en doorloop de Authenticate-flow.

3. (Optioneel) Agent Skills installeren:

   ```
   npx skills add supabase/agent-skills
   ```

## Migraties

Lokale migraties staan in [`supabase/migrations/`](../supabase/migrations/).
Toepassen via `mcp__supabase__apply_migration` (naam in snake_case + de SQL).
Controleren via `mcp__supabase__list_migrations` en `mcp__supabase__list_tables`.
