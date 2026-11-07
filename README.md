<p align="center">
  <img src="public/promptplein-logo.png" alt="PromptPlein" width="320">
</p>

<p align="center">
  Prompts bouwen, bewaren, delen en meteen uitproberen, voor medewerkers van de Nederlandse rijksoverheid.
</p>

<p align="center">
  <a href="https://www.promptplein.app">www.promptplein.app</a>
</p>

---

## Wat is PromptPlein?

Een goede prompt schrijven kost tijd, en wat een collega al heeft uitgezocht blijft vaak bij die collega. PromptPlein brengt dat samen op één plek. De app heeft twee kanten:

- **De promptbouwer** schrijft met AI een herbruikbare prompt. Je vertelt wat je wilt, de AI kiest de techniek en vult de opdracht uit.
- **De chat** draait die prompt meteen, zodat je ziet wat hij oplevert. Een prompt gaat met één knop van de bouwer naar de chat en weer terug.

De hele interface is Nederlands.

## Wat je ermee kunt

| Onderdeel | Wat het doet |
| --- | --- |
| **Prompt maken** (`/genereren`) | De AI analyseert je vraag en kiest de techniek. Met een stappenplan, vragen vooraf en een controle van je aannames. |
| **Testkamer** | Bouwen, testen en verbeteren in een gesloten lus, met versies. |
| **Technieken** (`/technieken`) | Oefenpagina: kies zelf een techniek en vul de velden in. |
| **Chat** (`/chat`) | Werkt zonder account. Met projecten, bijlagen, dicteren en optioneel zoeken op internet. |
| **Bibliotheek en community** | Prompts bewaren, zoeken en delen, met een goedkeuringsstroom per zichtbaarheidsniveau. |
| **Organisatienetwerk** (`/netwerk`) | Organisaties als boom van ministeries. |
| **Beheer** (`/admin`) | Gebruikers, moderatoren, categorieën, analytics, auditlog en het bewerken van de systeemprompts. |

## Privacy

- **Chatgesprekken staan niet op de server.** Ze blijven in de browser (`localStorage`), horen bij het apparaat en verdwijnen pas als je ze verwijdert of je browsergegevens wist. Berichten gaan wel via de server naar het taalmodel om een antwoord te krijgen.
- **Zoeken op internet kan via een eigen server.** Met [SearXNG](infra/searxng/README.md) gaat alleen de zoekvraag naar buiten en ziet geen externe zoekdienst wie hem stelt.
- **Taalmodel.** De AI-laag draait op Mistral, een Europese aanbieder.
- **Toegang** wordt afgedwongen in de database met Row Level Security, niet in de frontend.

## Techniek

| Laag | Keuze |
| --- | --- |
| Frontend | React 18, TypeScript, Vite 6 |
| Styling | Tailwind CSS in de Rijkshuisstijl, met licht en donker thema |
| 3D en grafieken | react-three-fiber, three.js, recharts |
| Backend | Supabase: Postgres met RLS, Auth, Storage, Edge Functions (Deno) |
| AI | Mistral, via de edge function `optimize-prompt` |
| Hosting | Vercel |

## Zelf draaien

Je hebt Node.js (actuele LTS) nodig.

```bash
git clone https://github.com/PromptPlein/PromptPlein.git
cd PromptPlein
npm install
npm run dev
```

Zonder configuratie draait de app op een lokale proefopslag in de browser (`localStorage`), zodat je de interface kunt bekijken. Inloggen en de AI-functies hebben de backend hieronder nodig.

### Backend koppelen

Maak een eigen Supabase-project aan en zet een `.env` in de hoofdmap:

```bash
VITE_SUPABASE_URL=https://<jouw-project>.supabase.co
VITE_SUPABASE_ANON_KEY=<jouw-anon-key>
```

Zet daarna de database klaar en rol de functies uit:

```bash
supabase link --project-ref <jouw-project-ref>
supabase db push

supabase secrets set MISTRAL_API_KEY=<jouw-sleutel>
supabase functions deploy optimize-prompt
```

De referentiedata (rollen, categorieën, technieken) staat in `supabase/seed.sql` en `supabase/seed_phase2.sql`.

Optionele secrets van de functies:

| Secret | Waarvoor |
| --- | --- |
| `SEARXNG_URL`, `SEARXNG_TOKEN` | Zoeken in de chat via een eigen server, zie [infra/searxng](infra/searxng/README.md) |
| `TAVILY_API_KEY` | Zoeken via Tavily, als er geen eigen server is |
| `BREVO_API_KEY`, `CONTACT_FROM_EMAIL`, `CONTACT_TO_EMAIL` | Het contactformulier (functie `send-contact`) |
| `BREVO_API_KEY`, `BREVO_LIST_ID`, `BREVO_WEBHOOK_SECRET` | Nieuwe gebruikers aanmelden bij Brevo (functie `register-brevo-contact`) |

### Scripts

| Commando | Wat het doet |
| --- | --- |
| `npm run dev` | Ontwikkelserver |
| `npm run build` | Typecheck en productiebuild |
| `npm run preview` | Productiebuild lokaal bekijken |

## Projectstructuur

```
src/
  pages/        één bestand per route
  components/   interface per onderdeel
  services/     alle datatoegang, met een lokale tak voor de proefopslag
  context/      auth, referentiedata en thema
  lib/          hulpcode, zoals de chatopslag en de streaming
  config/       providers, modellen en prijzen
  types/        de domeinmodellen
supabase/
  functions/    optimize-prompt, send-contact, register-brevo-contact
  migrations/   databaseschema, oplopend genummerd
infra/
  searxng/      eigen zoekserver voor de chat
docs/           ontwerpnotities en archief
```

Nieuwe AI-functionaliteit komt als extra `mode` in de edge function `optimize-prompt`. De systeemprompts zijn te bewerken in Beheer, zonder nieuwe uitrol. De werkafspraken en de achtergrond van de architectuur staan in [CLAUDE.md](CLAUDE.md).

## Rechten

PromptPlein is open source onder de European Union Public Licence v. 1.2 (EUPL-1.2). Je mag de code gebruiken, aanpassen en verspreiden onder de voorwaarden in [LICENSE](LICENSE). Verspreid je een aangepaste versie of bied je die aan als dienst, dan valt die ook onder de EUPL.

Het lettertype Rijks Sans en het beeldmerk van de Rijksoverheid zijn niet vrij te gebruiken en mogen niet worden overgenomen in andere producten.
