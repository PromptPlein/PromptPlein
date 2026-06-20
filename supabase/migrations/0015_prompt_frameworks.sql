-- 0015_prompt_frameworks.sql
-- Voegt zes prompt frameworks toe als `techniques`-records: CRISPE, RAISE,
-- CO-STAR, CRAFT, CREATE en REACT. Frameworks worden in dit project opgeslagen
-- als technieken (zelfde tabel) en in de UI gegroepeerd onder "Prompt frameworks"
-- via src/lib/techniques.ts (isContextPrompt).
--
-- Mapping naar het bestaande schema:
--   name                -> naam van het framework (UNIQUE -> idempotente upsert)
--   description         -> korte beschrijving
--   strength            -> doel van de techniek (wordt in de kaart als "Doel" getoond)
--   use_cases           -> gebruikssituaties (JSON-array van losse zinnen)
--   follow_up_questions -> velden ({id,label,placeholder}); de help-tekst is in
--                          het label verwerkt, conform het bestaande CARE/CRISP-record
--   template            -> template met {{field_id}} en {{PROMPT}} (de hoofdletter-
--                          placeholder die fillTemplate vervangt door de prompt-inhoud)
--
-- Idempotent: ON CONFLICT (name) DO UPDATE — herhaald uitvoeren overschrijft de
-- velden zonder dubbele records aan te maken. Bestaande UUID's blijven behouden.
--
-- LET OP — CRISPE was eerder per abuis CRISP (5 velden, template "CRISP-structuur").
-- Deze migratie corrigeert dat naar het echte CRISPE-framework (6 velden, inclusief
-- Role, Steps en End goal) en zet het record weer op is_active = TRUE.

INSERT INTO techniques (name, description, strength, use_cases, follow_up_questions, template, is_active, sort_order)
VALUES
-- 1. CRISPE — Context, Role, Instructions, Steps, Parameters, End goal
(
  'CRISPE',
  'Uitgebreid framework voor complexe opdrachten waarbij context, rol, instructies, stappen, randvoorwaarden en einddoel expliciet worden gemaakt.',
  'Het doel van CRISPE is om AI gericht en gestructureerd te laten werken aan een complexe taak, met duidelijke kaders, processtappen en een concreet eindresultaat.',
  '[
    "Gebruik CRISPE wanneer een gebruiker een strategisch advies, analyse of uitgebreid plan wil laten maken.",
    "Gebruik CRISPE wanneer de uitkomst afhankelijk is van context, rol, beperkingen en een duidelijk einddoel.",
    "Gebruik CRISPE wanneer de AI niet alleen antwoord moet geven, maar ook volgens een bepaalde aanpak moet werken.",
    "Gebruik CRISPE wanneer de gebruiker controle wil over toon, proces, diepgang en outputvorm."
  ]'::jsonb,
  '[
    {"id":"context","label":"CONTEXT — achtergrond en situatie. Geef de AI voldoende achtergrondinformatie om de opdracht goed te begrijpen.","placeholder":"Beschrijf de situatie, achtergrond, doelgroep, organisatie of het probleem waar de prompt over gaat."},
    {"id":"role","label":"ROLE — rol of expertise. Geef aan vanuit welke rol, expertise of invalshoek de AI moet antwoorden.","placeholder":"Bijvoorbeeld: senior strateeg, beleidsadviseur, copywriter, coach, jurist of productmanager."},
    {"id":"instructions","label":"INSTRUCTIONS — concrete opdracht. Formuleer de taak duidelijk en actief.","placeholder":"Beschrijf precies wat de AI moet doen."},
    {"id":"steps","label":"STEPS — gewenste werkwijze. Gebruik dit veld als de AI volgens een vaste aanpak moet werken.","placeholder":"Beschrijf welke stappen de AI moet volgen, bijvoorbeeld analyseren, structureren, adviseren en samenvatten."},
    {"id":"parameters","label":"PARAMETERS — randvoorwaarden. Geef regels, beperkingen, voorkeuren en kwaliteitscriteria mee.","placeholder":"Bijvoorbeeld: AVG-proof, B1-taalniveau, maximaal 500 woorden, zakelijke toon, geen jargon."},
    {"id":"end_goal","label":"END GOAL — gewenste uitkomst. Maak duidelijk wanneer het antwoord geslaagd is.","placeholder":"Beschrijf wat het eindresultaat moet opleveren voor de gebruiker."}
  ]'::jsonb,
  E'# CONTEXT:\n{{context}}\n\n# ROLE:\n{{role}}\n\n# INSTRUCTIONS:\n{{instructions}}\n\n# STEPS:\n{{steps}}\n\n# PARAMETERS:\n{{parameters}}\n\n# END GOAL:\n{{end_goal}}\n\n---\n\nGeef, gegeven bovenstaande CRISPE-structuur, antwoord op:\n{{PROMPT}}',
  TRUE,
  10
),
-- 2. RAISE — Role, Action, Input, Specifics, End goal
(
  'RAISE',
  'Taakgericht framework waarmee je snel aangeeft wie de AI moet zijn, welke actie nodig is, welke input gebruikt wordt, welke details belangrijk zijn en wat het gewenste resultaat is.',
  'Het doel van RAISE is om praktische en uitvoerbare prompts te maken voor concrete taken waarbij snelheid, duidelijkheid en resultaatgerichtheid belangrijk zijn.',
  '[
    "Gebruik RAISE wanneer een gebruiker snel een duidelijke taak aan AI wil geven.",
    "Gebruik RAISE wanneer de opdracht praktisch, concreet en actiegericht is.",
    "Gebruik RAISE wanneer de gebruiker bestaande input wil laten verwerken tot een bruikbaar resultaat.",
    "Gebruik RAISE wanneer de AI output moet leveren zonder een te uitgebreid analyseproces."
  ]'::jsonb,
  '[
    {"id":"role","label":"ROLE — rol of perspectief. Geef aan vanuit welke rol de AI de taak moet uitvoeren.","placeholder":"Bijvoorbeeld: projectleider, tekstschrijver, onderzoeker, marketeer of trainer."},
    {"id":"action","label":"ACTION — gewenste actie. Beschrijf de concrete actie die de AI moet uitvoeren.","placeholder":"Bijvoorbeeld: herschrijf, analyseer, vat samen, verbeter, vergelijk, maak of controleer."},
    {"id":"input","label":"INPUT — bronmateriaal of informatie. Voeg alle relevante input toe waarop het antwoord gebaseerd moet zijn.","placeholder":"Plak hier de tekst, data, notities, briefing of informatie die gebruikt moet worden."},
    {"id":"specifics","label":"SPECIFICS — specifieke eisen. Geef specifieke wensen mee die de output moeten sturen.","placeholder":"Bijvoorbeeld: doelgroep, toon, lengte, format, taalniveau, stijl of onderwerpen die wel/niet genoemd mogen worden."},
    {"id":"end_goal","label":"END GOAL — gewenst resultaat. Maak duidelijk wat het praktische eindresultaat moet zijn.","placeholder":"Beschrijf waarvoor de output gebruikt wordt en wat het moet opleveren."}
  ]'::jsonb,
  E'# ROLE:\n{{role}}\n\n# ACTION:\n{{action}}\n\n# INPUT:\n{{input}}\n\n# SPECIFICS:\n{{specifics}}\n\n# END GOAL:\n{{end_goal}}\n\n---\n\nVoer de taak uit op basis van bovenstaande RAISE-structuur:\n{{PROMPT}}',
  TRUE,
  11
),
-- 3. CO-STAR — Context, Objective, Style, Tone, Audience, Response
(
  'CO-STAR',
  'Framework voor communicatie, marketing en contentcreatie waarbij context, doel, stijl, toon, doelgroep en gewenste respons expliciet worden gemaakt.',
  'Het doel van CO-STAR is om AI communicatie te laten maken die inhoudelijk klopt, goed aansluit op de doelgroep en past bij de gewenste stijl en toon.',
  '[
    "Gebruik CO-STAR wanneer een gebruiker marketingtekst, websitecopy, e-mails of social posts wil laten maken.",
    "Gebruik CO-STAR wanneer doelgroep, toon en stijl belangrijk zijn voor de kwaliteit van de output.",
    "Gebruik CO-STAR wanneer communicatie moet overtuigen, informeren of activeren.",
    "Gebruik CO-STAR wanneer de gebruiker de vorm en het effect van de tekst duidelijk wil sturen."
  ]'::jsonb,
  '[
    {"id":"context","label":"CONTEXT — achtergrond en situatie. Geef de AI voldoende achtergrond om de communicatie relevant te maken.","placeholder":"Beschrijf waar de communicatie over gaat, wat de aanleiding is en in welke situatie de tekst gebruikt wordt."},
    {"id":"objective","label":"OBJECTIVE — communicatiedoel. Beschrijf wat de communicatie moet bereiken.","placeholder":"Bijvoorbeeld: informeren, overtuigen, activeren, uitnodigen, verkopen of vertrouwen opbouwen."},
    {"id":"style","label":"STYLE — schrijfstijl. Geef aan hoe de tekst geschreven moet worden.","placeholder":"Bijvoorbeeld: professioneel, helder, compact, verhalend, activerend, zakelijk of toegankelijk."},
    {"id":"tone","label":"TONE — toon. Geef aan hoe de tekst moet aanvoelen voor de lezer.","placeholder":"Bijvoorbeeld: warm, direct, rustig, deskundig, uitnodigend, nuchter of energiek."},
    {"id":"audience","label":"AUDIENCE — doelgroep. Maak duidelijk wie de lezer is en wat voor die persoon belangrijk is.","placeholder":"Beschrijf voor wie de tekst bedoeld is, inclusief kennisniveau, behoefte, bezwaar of context."},
    {"id":"response","label":"RESPONSE — gewenste outputvorm. Geef aan in welke vorm de AI moet antwoorden.","placeholder":"Bijvoorbeeld: e-mail, landingspagina, advertentietekst, social post, tagline, nieuwsbrief of call-to-action."}
  ]'::jsonb,
  E'# CONTEXT:\n{{context}}\n\n# OBJECTIVE:\n{{objective}}\n\n# STYLE:\n{{style}}\n\n# TONE:\n{{tone}}\n\n# AUDIENCE:\n{{audience}}\n\n# RESPONSE:\n{{response}}\n\n---\n\nMaak de communicatie-uiting op basis van bovenstaande CO-STAR-structuur:\n{{PROMPT}}',
  TRUE,
  12
),
-- 4. CRAFT — Context, Role, Action, Format, Target audience
(
  'CRAFT',
  'Zakelijk framework waarmee je heldere output kunt laten maken op basis van context, rol, actie, format en doelgroep.',
  'Het doel van CRAFT is om AI zakelijke documenten, plannen, adviezen en berichten te laten maken die duidelijk gestructureerd zijn en aansluiten op de doelgroep.',
  '[
    "Gebruik CRAFT wanneer een gebruiker een zakelijke tekst, memo, voorstel, plan of advies wil laten maken.",
    "Gebruik CRAFT wanneer de output professioneel, bruikbaar en overzichtelijk moet zijn.",
    "Gebruik CRAFT wanneer het format en de doelgroep belangrijk zijn voor de structuur van het antwoord.",
    "Gebruik CRAFT wanneer een zakelijke opdracht snel moet worden vertaald naar concrete output."
  ]'::jsonb,
  '[
    {"id":"context","label":"CONTEXT — zakelijke achtergrond. Geef de AI de informatie die nodig is om de zakelijke context goed te begrijpen.","placeholder":"Beschrijf de zakelijke situatie, aanleiding, organisatie, vraag of uitdaging."},
    {"id":"role","label":"ROLE — professionele rol. Geef aan vanuit welke professionele rol de AI moet schrijven of adviseren.","placeholder":"Bijvoorbeeld: projectmanager, beleidsadviseur, business consultant, HR-adviseur of teamleider."},
    {"id":"action","label":"ACTION — gewenste taak. Beschrijf wat de AI concreet moet doen.","placeholder":"Bijvoorbeeld: schrijf, formuleer, analyseer, adviseer, structureer, verbeter of maak een voorstel."},
    {"id":"format","label":"FORMAT — gewenste vorm. Geef aan in welke vorm de output moet worden geleverd.","placeholder":"Bijvoorbeeld: memo, adviesnota, e-mail, managementsamenvatting, projectplan, tabel of bulletlijst."},
    {"id":"target_audience","label":"TARGET AUDIENCE — doelgroep. Beschrijf voor wie de output bedoeld is.","placeholder":"Bijvoorbeeld: directie, managementteam, collega''s, opdrachtgever, klant, medewerkers of stakeholders."}
  ]'::jsonb,
  E'# CONTEXT:\n{{context}}\n\n# ROLE:\n{{role}}\n\n# ACTION:\n{{action}}\n\n# FORMAT:\n{{format}}\n\n# TARGET AUDIENCE:\n{{target_audience}}\n\n---\n\nMaak de zakelijke output op basis van bovenstaande CRAFT-structuur:\n{{PROMPT}}',
  TRUE,
  13
),
-- 5. CREATE — Context, Role, Examples, Action, Tone, End result
(
  'CREATE',
  'Framework voor creatieve en contentgerichte opdrachten waarbij context, rol, voorbeelden, actie, toon en eindresultaat samen richting geven aan de output.',
  'Het doel van CREATE is om AI creatieve, originele en bruikbare content te laten maken die past bij de context, toon, voorbeelden en gewenste toepassing.',
  '[
    "Gebruik CREATE wanneer een gebruiker creatieve concepten, campagnes, scripts, posts of ideeën wil laten maken.",
    "Gebruik CREATE wanneer voorbeelden belangrijk zijn om stijl, niveau of richting te bepalen.",
    "Gebruik CREATE wanneer de output origineel moet zijn, maar wel binnen duidelijke kaders moet blijven.",
    "Gebruik CREATE wanneer de gebruiker meerdere creatieve varianten of invalshoeken wil verkennen."
  ]'::jsonb,
  '[
    {"id":"context","label":"CONTEXT — creatieve achtergrond. Geef de AI de achtergrond die nodig is om passende ideeën of content te maken.","placeholder":"Beschrijf het onderwerp, de aanleiding, het merk, de campagne of het creatieve probleem."},
    {"id":"role","label":"ROLE — creatieve rol. Geef aan vanuit welke creatieve expertise de AI moet werken.","placeholder":"Bijvoorbeeld: creatief strateeg, copywriter, scriptschrijver, conceptontwikkelaar of contentmarketeer."},
    {"id":"examples","label":"EXAMPLES — voorbeelden of inspiratie. Gebruik voorbeelden om de gewenste richting concreter te maken.","placeholder":"Voeg voorbeelden toe van stijl, toon, structuur, ideeën of content die als richting mogen dienen."},
    {"id":"action","label":"ACTION — creatieve opdracht. Beschrijf welke creatieve taak de AI moet uitvoeren.","placeholder":"Bijvoorbeeld: bedenk, schrijf, ontwikkel, herschrijf, maak varianten, verbeter of combineer ideeën."},
    {"id":"tone","label":"TONE — gewenste toon. Geef aan hoe de output moet klinken of voelen.","placeholder":"Bijvoorbeeld: speels, scherp, warm, professioneel, verrassend, activerend of toegankelijk."},
    {"id":"end_result","label":"END RESULT — gewenste creatieve output. Beschrijf wat de AI uiteindelijk moet opleveren.","placeholder":"Bijvoorbeeld: 10 ideeën, 3 concepten, een script, een campagneboodschap, een social post of een headline-set."}
  ]'::jsonb,
  E'# CONTEXT:\n{{context}}\n\n# ROLE:\n{{role}}\n\n# EXAMPLES:\n{{examples}}\n\n# ACTION:\n{{action}}\n\n# TONE:\n{{tone}}\n\n# END RESULT:\n{{end_result}}\n\n---\n\nMaak de creatieve output op basis van bovenstaande CREATE-structuur:\n{{PROMPT}}',
  TRUE,
  14
),
-- 6. REACT — Reason, Evaluate, Act, Check, Tell
(
  'REACT',
  'Framework voor agent-achtige workflows waarbij de AI redeneert, keuzes evalueert, acties uitvoert, resultaten controleert en helder terugkoppelt.',
  'Het doel van REACT is om AI gestructureerd te laten werken aan taken die meerdere stappen, beslissingen, controles of tool-acties vereisen.',
  '[
    "Gebruik REACT wanneer een AI-agent een taak in meerdere stappen moet uitvoeren.",
    "Gebruik REACT wanneer de AI informatie moet analyseren, daarna actie moet ondernemen en vervolgens het resultaat moet controleren.",
    "Gebruik REACT wanneer betrouwbaarheid, terugkoppeling en controle belangrijk zijn.",
    "Gebruik REACT wanneer een workflow afhankelijk is van redeneren, uitvoeren, valideren en rapporteren."
  ]'::jsonb,
  '[
    {"id":"reason","label":"REASON — analyse en redenering. Geef aan welke redenering of analyse nodig is om de juiste aanpak te kiezen.","placeholder":"Beschrijf wat de AI eerst moet begrijpen, analyseren of afwegen voordat er actie wordt ondernomen."},
    {"id":"evaluate","label":"EVALUATE — keuze en beoordeling. Laat de AI expliciet afwegen wat de beste vervolgstap is.","placeholder":"Beschrijf welke opties, risico''s, beperkingen of criteria de AI moet beoordelen."},
    {"id":"act","label":"ACT — actie of uitvoering. Maak duidelijk wat de AI daadwerkelijk moet doen.","placeholder":"Beschrijf welke actie de AI moet uitvoeren, bijvoorbeeld zoeken, schrijven, aanpassen, controleren of structureren."},
    {"id":"check","label":"CHECK — controle en validatie. Voeg kwaliteitscriteria, teststappen of validatiepunten toe.","placeholder":"Beschrijf hoe de AI moet controleren of de actie goed is uitgevoerd."},
    {"id":"tell","label":"TELL — terugkoppeling. Geef aan hoe de eindrapportage eruit moet zien.","placeholder":"Beschrijf hoe de AI het resultaat moet rapporteren, inclusief bevindingen, gemaakte keuzes en eventuele vervolgstappen."}
  ]'::jsonb,
  E'# REASON:\n{{reason}}\n\n# EVALUATE:\n{{evaluate}}\n\n# ACT:\n{{act}}\n\n# CHECK:\n{{check}}\n\n# TELL:\n{{tell}}\n\n---\n\nVoer de agent-workflow uit op basis van bovenstaande REACT-structuur:\n{{PROMPT}}',
  TRUE,
  15
)
ON CONFLICT (name) DO UPDATE SET
  description         = EXCLUDED.description,
  strength            = EXCLUDED.strength,
  use_cases           = EXCLUDED.use_cases,
  follow_up_questions = EXCLUDED.follow_up_questions,
  template            = EXCLUDED.template,
  is_active           = EXCLUDED.is_active,
  sort_order          = EXCLUDED.sort_order;
