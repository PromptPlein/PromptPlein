# Eigen zoekserver voor de chat (SearXNG)

De knop "Zoeken" in de chat stuurt de vraag van de gebruiker naar een
zoekdienst. Met deze opzet is dat een eigen server: SearXNG, open source, in een
Nederlands datacenter, zonder derde partij die de vragen ziet of bewaart.
SearXNG stuurt de vraag geanonimiseerd door naar zoekmachines (Google, Bing,
DuckDuckGo, Brave, Startpage, Qwant, Mojeek, Wikipedia), voegt de treffers samen
en geeft ze terug. Wat de zoekmachines zien is het IP van deze server en de
zoektekst, niets over PromptPlein of de gebruiker.

Wat de chat naar buiten stuurt is alleen de zoekvraag (de laatste vraag van de
gebruiker, hoogstens 380 tekens). Systeemprompt, bijlagen, projectbestanden en
antwoorden blijven binnen.

## Wat je nodig hebt

- Een kleine Linux-VPS in Nederland (1 vCPU, 1 GB geheugen is genoeg), met
  Docker en Docker Compose erop. Bijvoorbeeld TransIP, Leaseweb of Scaleway
  (regio Amsterdam).
- Een DNS-naam die naar die server wijst, bijvoorbeeld `zoeken.promptplein.nl`
  (A-record naar het IP van de VPS).
- Poort 80 en 443 open in de firewall. Caddy regelt het certificaat zelf.

## Op een Mac mini thuis of op kantoor

Dat kan, en het is handig om mee te testen. Dezelfde stappen als hieronder,
met daarbovenop:

- In de router poort 80 en 443 doorsturen naar de Mac (geef hem een vast
  lokaal IP). Zonder poort 80 kan Caddy geen certificaat aanvragen.
- Geen vast publiek IP? Dan een dynamische DNS-naam die de router bijwerkt;
  die naam wordt `DOMAIN` in `.env`.
- Slaapstand uit, Docker Desktop starten bij inloggen, automatisch inloggen na
  een herstart.
- Heeft de provider je achter CGNAT gezet (gedeeld IP), dan werkt doorsturen
  niet. Neem dan een VPS; een tunnel via Cloudflare zou al het zoekverkeer
  langs een Amerikaanse partij sturen en dat is precies wat deze opzet vermijdt.

Valt de Mac of de verbinding weg, dan antwoordt de chat zonder bronnen: de
edge function wacht hoogstens 9 seconden en gaat dan door. Voor productie is
een VPS beter: geen apparaat in het eigen netwerk aan het internet en geen
zoekfunctie die afhangt van een thuisaansluiting. Verhuizen is deze map
kopiëren en dezelfde commando's draaien.

## Installeren

Op de server:

```bash
git clone <deze repo> promptplein && cd promptplein/infra/searxng
cp .env.example .env
openssl rand -hex 32     # plak in .env als SEARCH_TOKEN
openssl rand -hex 32     # plak in .env als SEARXNG_SECRET
nano .env                # zet DOMAIN op de DNS-naam
docker compose up -d
```

Alleen de map `infra/searxng` is nodig; de rest van de repo mag weg.

Controleren, van je eigen laptop:

```bash
curl -s "https://zoeken.promptplein.nl/search?q=minister-president&format=json" | head -c 200
# verwacht: 403 (geen token)

curl -s -H "X-Search-Token: <SEARCH_TOKEN>" \
  "https://zoeken.promptplein.nl/search?q=minister-president&format=json&language=nl" \
  | python3 -c "import sys,json; [print(r['title'], r['url']) for r in json.load(sys.stdin)['results'][:5]]"
# verwacht: vijf treffers met titel en url
```

## Aan PromptPlein koppelen

In de repo van PromptPlein, met de Supabase CLI ingelogd:

```bash
supabase secrets set SEARXNG_URL=https://zoeken.promptplein.nl SEARXNG_TOKEN=<SEARCH_TOKEN>
supabase secrets unset TAVILY_API_KEY
```

Secrets gelden meteen, zonder de function opnieuw uit te rollen. SearXNG heeft
in de code voorrang op Tavily, dus de `unset` is niet nodig om het te laten
werken; hij is nodig om geen ongebruikte sleutel van een Amerikaanse dienst te
laten slingeren. Zet in Beheer, AI-instellingen "Zoeken op internet" aan als dat
nog niet zo is.

Testen in de chat: knop "Zoeken" aan, vraag iets actueels, en kijk of er
bronnen onder het antwoord verschijnen.

## Beheer

```bash
docker compose logs -f searxng      # meekijken
docker compose pull && docker compose up -d   # bijwerken naar nieuwe versie
```

Regels als `CAPTCHA` of `Suspended` in de log van Google of Bing zijn normaal:
die zoekmachines blokkeren datacenter-IP's soms tijdelijk. SearXNG gaat dan door
met de andere engines en de chat merkt er niets van. Blijft één engine lang
weg, dan levert de rest nog steeds treffers.

De server bewaart niets: geen zoekgeschiedenis, geen statistieken
(`enable_metrics: false`). De Docker-log van SearXNG is afgekapt op 1 MB en
bevat geen zoekvragen.

## Wat anders is dan bij Tavily

- Tavily geeft per treffer een fragment van een paar honderd tekens; SearXNG
  geeft de snippet van de zoekmachine, meestal één of twee regels. Het model
  heeft dus minder tekst per bron. Meer treffers instellen in Beheer
  (maximaal 8) helpt daartegen.
- Geen kosten per zoekopdracht en geen maandlimiet; wel een VPS van een paar
  euro per maand en af en toe `docker compose pull`.
