# PromptPlein — werkafspraken

## Uitrollen: elke afgeronde wijziging gaat meteen naar productie

`main` is de productietak: Vercel bouwt elke push naar `origin/main` en zet hem
live. Er is geen aparte release-stap en er wordt niet gewacht op akkoord.

Na elke afgeronde wijziging, zonder er eerst naar te vragen:

1. `npx tsc -p tsconfig.app.json --noEmit` — moet schoon zijn.
2. Lees de diff (`git diff`, `git status`) en schrijf daar het commitbericht uit:
   het bericht komt uit wat er feitelijk is veranderd, niet uit een sjabloon en
   niet uit wat er gevraagd was.
3. `git add` van de gewijzigde bestanden, `git commit`, `git push origin main`.
4. Meld in het antwoord dat het gepusht is (en dus live gaat).

Raakte de wijziging `supabase/functions/**`, dan hoort daar meteen
`supabase functions deploy <functie>` bij: die code gaat niet mee met de
Vercel-build. Zie [.claude/SUPABASE.md](.claude/SUPABASE.md) voor welk project.

### Wanneer juist NIET pushen

De regel geldt voor afgerond werk, niet voor elke tussenstap:

- De typecheck of de build faalt — dan eerst repareren; een kapotte push haalt
  productie onderuit.
- Het werk is half af (een deel van een taak, een experiment, een tussenstand
  waar de gebruiker nog iets van moet vinden).
- Er staan geheimen in de diff (`.env`, sleutels, tokens).
- De gebruiker heeft in dit gesprek gezegd dat hij eerst wil kijken.

Bij twijfel: afmaken, dan pushen — niet stapelen tot een grote bundel.

### Commitberichten

Kort, Nederlands, in de tegenwoordige tijd, en zeg wát er verandert voor de
gebruiker — niet welke bestanden zijn aangeraakt.

```
fix: lege "Nieuw project" verdwijnt weer bij annuleren
feat: plusje bij Projecten en Chats in de zijbalk
```
