import { Fragment, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { shortcutKeys, SHORTCUTS, type Shortcut } from '@/lib/shortcuts';

const SECTION_CLASS = 'opl-card p-5 sm:p-6';
const TITLE_CLASS = 'text-lg font-semibold text-rijksblauw-700 dark:text-rijksblauw-200';
const LINK_CLASS = 'font-medium text-rijksblauw-700 underline dark:text-rijksblauw-200';

function Keys({ shortcut }: { shortcut: Shortcut }) {
  return (
    <span className="whitespace-nowrap">
      {shortcutKeys(shortcut).map((key, index) => (
        <Fragment key={key}>
          {index > 0 && ' + '}
          <kbd className="rounded border border-slate-300 bg-slate-50 px-1.5 py-0.5 font-sans text-sm font-semibold text-slate-900 dark:border-slate-500 dark:bg-slate-700 dark:text-slate-100">
            {key}
          </kbd>
        </Fragment>
      ))}
    </span>
  );
}

function Section({ id, title, children }: { id: string; title: string; children: ReactNode }) {
  return (
    <section className={SECTION_CLASS} aria-labelledby={id}>
      <h2 id={id} className={TITLE_CLASS}>
        {title}
      </h2>
      <div className="mt-2 space-y-3 text-slate-800 dark:text-slate-100">{children}</div>
    </section>
  );
}

/**
 * Wat je allemaal kunt doen en hoe. Geschreven voor wie slecht ziet of geen muis
 * gebruikt: echte koppen, zodat een schermlezer erdoor kan springen, korte zinnen, en
 * knoppen bij hun naam in plaats van hun plek op het scherm. De sneltoetsen komen uit
 * shortcuts.ts, zodat deze pagina niet kan afwijken van wat er werkt.
 */
export default function AccessibilityHelp() {
  return (
    <div className="space-y-5">
      <p className="text-slate-700 dark:text-slate-200">
        Hier lees je hoe je PromptPlein gebruikt met je stem, je toetsenbord of een schermlezer.
        Alles bij Toegankelijkheid staat uit tot je het zelf aanzet.
      </p>

      <Section id="hulp-sneltoetsen" title="Sneltoetsen">
        <div className="overflow-x-auto">
          <table className="w-full text-left">
            <caption className="sr-only">Alle sneltoetsen van PromptPlein</caption>
            <thead>
              <tr className="border-b border-slate-200 dark:border-slate-600">
                <th scope="col" className="py-2 pr-4 font-semibold">
                  Toetsen
                </th>
                <th scope="col" className="py-2 pr-4 font-semibold">
                  Wat het doet
                </th>
                <th scope="col" className="py-2 font-semibold">
                  Waar
                </th>
              </tr>
            </thead>
            <tbody>
              {Object.values(SHORTCUTS).map((shortcut) => (
                <tr key={shortcut.code} className="border-b border-slate-100 dark:border-slate-700">
                  <td className="py-2 pr-4">
                    <Keys shortcut={shortcut} />
                  </td>
                  <th scope="row" className="py-2 pr-4 font-normal">
                    {shortcut.label}
                  </th>
                  <td className="py-2">{shortcut.where}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p>
          Met <kbd className="font-sans font-semibold">Escape</kbd> stop je inspreken, voorlezen of
          een gesprek.
        </p>
      </Section>

      <Section id="hulp-lezen" title="Grotere letters en meer contrast">
        <p>
          Ga naar{' '}
          <Link to="/instellingen/toegankelijkheid" className={LINK_CLASS}>
            Toegankelijkheid
          </Link>
          . Daar kies je de tekstgrootte, hoog contrast en minder beweging. Dit werkt ook zonder
          account en blijft bewaard in deze browser.
        </p>
      </Section>

      <Section id="hulp-voorlezen" title="Antwoorden laten voorlezen">
        <p>Voorlezen staat uit. Bij Toegankelijkheid zet je het op een van deze manieren aan:</p>
        <ul className="list-disc space-y-1 pl-5">
          <li>
            Zet de knop Voorlezen onder elk antwoord aan. Dan kies je zelf welk antwoord je hoort.
          </li>
          <li>Kies dat PromptPlein elk antwoord hardop voorleest zodra het klaar is.</li>
        </ul>
        <p>
          Staat voorlezen aan, dan hoor je het laatste antwoord met{' '}
          <Keys shortcut={SHORTCUTS.voorlezen} />.
        </p>
        <p>
          Ben je ingelogd, dan leest de stem Lotte voor. Zonder account leest de stem van je
          apparaat voor. Bij Toegankelijkheid kun je een andere stem en snelheid kiezen.
        </p>
      </Section>

      <Section id="hulp-inspreken" title="Inspreken in plaats van typen">
        <p>Hiervoor moet je ingelogd zijn.</p>
        <ol className="list-decimal space-y-1 pl-5">
          <li>
            Druk op <Keys shortcut={SHORTCUTS.dicteren} />. Je hoort een toon die omhoog gaat.
          </li>
          <li>Zeg wat je wilt typen.</li>
          <li>
            Druk nog een keer op <Keys shortcut={SHORTCUTS.dicteren} />. De tekst komt in het
            tekstvak.
          </li>
        </ol>
        <p>
          Je leest de tekst na en verstuurt hem zelf. Wil je meteen versturen? Zet dan bij
          Toegankelijkheid Versturen met je stem aan, en eindig met het woord verstuur.
        </p>
      </Section>

      <Section id="hulp-gesprek" title="Een gesprek voeren zonder handen">
        <p>
          In een gesprek praat je met de chat en hoef je geen toetsen te gebruiken. Hiervoor moet je
          ingelogd zijn.
        </p>
        <ol className="list-decimal space-y-1 pl-5">
          <li>Zet bij Toegankelijkheid Gesprek zonder handen aan. Dit hoef je maar één keer te doen.</li>
          <li>
            Druk in de chat op <Keys shortcut={SHORTCUTS.gesprek} />, of gebruik de knop Gesprek.
          </li>
          <li>Wacht op de toon die omhoog gaat en stel je vraag.</li>
          <li>Ben je even stil, dan wordt je vraag vanzelf verstuurd.</li>
          <li>Het antwoord wordt voorgelezen. Daarna hoor je de toon weer en ben jij aan de beurt.</li>
        </ol>
        <p>
          Je stopt met <kbd className="font-sans font-semibold">Escape</kbd>, of door alleen stop te
          zeggen. Het gesprek stopt ook vanzelf als je 30 seconden niets zegt. Je hoort dan een toon
          die omlaag gaat.
        </p>
        <p>
          De microfoon staat alleen open na de toon, en je stem gaat dan naar Mistral om uitgeschreven
          te worden. Gebruik een koptelefoon, dan neemt de microfoon de voorleesstem of je
          schermlezer niet op. Noem geen persoonsgegevens.
        </p>
        <p>
          Hoort PromptPlein iets wat op een persoonsgegeven lijkt, dan verschijnt er een melding en
          wacht het gesprek. De stem leest de melding en je keuzes voor. Kies je doorgaan, dan gaat
          het gesprek verder. Kies je terug, dan stopt het gesprek en kun je je bericht aanpassen.
        </p>
      </Section>

      <Section id="hulp-schermlezer" title="Met een schermlezer">
        <ul className="list-disc space-y-1 pl-5">
          <li>
            Elk bericht in de chat heeft een kop: Jouw bericht of Antwoord. Spring van kop naar kop
            om door een gesprek te gaan.
          </li>
          <li>
            Wil je dat je schermlezer elk antwoord voorleest? Kies dat bij Toegankelijkheid, onder Als
            een antwoord in de chat klaar is.
          </li>
          <li>De eerste link van elke pagina brengt je meteen naar de inhoud.</li>
        </ul>
      </Section>

      <Section id="hulp-vraag" title="Lukt het niet?">
        <p>
          Werkt iets niet, of mis je iets? Laat het ons weten via{' '}
          <Link to="/contact" className={LINK_CLASS}>
            Contact
          </Link>
          .
        </p>
      </Section>
    </div>
  );
}
