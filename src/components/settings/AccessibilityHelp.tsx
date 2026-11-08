import type { ReactNode } from 'react';
import { SHORTCUTS, type Shortcut } from '@/lib/shortcuts';
import '@nldd/design-system/cell';
import '@nldd/design-system/container';
import '@nldd/design-system/keyboard-shortcut';
import '@nldd/design-system/link';
import '@nldd/design-system/list';
import '@nldd/design-system/list-item';
import '@nldd/design-system/spacer-cell';
import '@nldd/design-system/step-cell';
import '@nldd/design-system/text';
import '@nldd/design-system/text-cell';
import '@nldd/design-system/title';

function Keys({ shortcut }: { shortcut: Shortcut }) {
  return (
    <nldd-keyboard-shortcut
      keys={`Alt+Shift+${shortcut.key}`}
      mac-keys={`Option+Shift+${shortcut.key}`}
      size="inherit"
      always-visible
    ></nldd-keyboard-shortcut>
  );
}

function Escape() {
  return <nldd-keyboard-shortcut keys="Escape" size="inherit" always-visible></nldd-keyboard-shortcut>;
}

const SECTIONS = [
  { id: 'hulp-telefoon', title: 'Op de telefoon' },
  { id: 'hulp-sneltoetsen', title: 'Sneltoetsen' },
  { id: 'hulp-lezen', title: 'Grotere letters en meer contrast' },
  { id: 'hulp-voorlezen', title: 'Antwoorden laten voorlezen' },
  { id: 'hulp-inspreken', title: 'Inspreken in plaats van typen' },
  { id: 'hulp-gesprek', title: 'Een gesprek voeren zonder handen' },
  { id: 'hulp-doorvragen', title: 'Als de chat eerst vragen stelt' },
  { id: 'hulp-schermlezer', title: 'Met een schermlezer' },
  { id: 'hulp-vraag', title: 'Lukt het niet?' },
];

/** Jumps to a section of this page and keeps the address in step. */
function jumpTo(id: string) {
  const el = document.getElementById(id);
  if (!el) return;
  history.replaceState(history.state, '', `#${id}`);
  el.scrollIntoView({ block: 'start' });
  el.focus({ preventScroll: true });
}

/** The table of contents at the top: one row per section of this page. */
function Contents() {
  return (
    <nldd-list type="navigation" accessible-label="Op deze pagina">
      {SECTIONS.map((section) => (
        <nldd-list-item
          key={section.id}
          href={`#${section.id}`}
          current-type="location"
          onClick={(e) => {
            e.preventDefault();
            jumpTo(section.id);
          }}
        >
          <nldd-text-cell text={section.title}></nldd-text-cell>
        </nldd-list-item>
      ))}
    </nldd-list>
  );
}

function Section({ id, title, children }: { id: string; title: string; children: ReactNode }) {
  return (
    <nldd-container gap="12">
      <nldd-title id={id} tabIndex={-1} heading-level={2} size={4} text={title}></nldd-title>
      {children}
    </nldd-container>
  );
}

/** A list of loose points. */
function Points({ label, items }: { label: string; items: ReactNode[] }) {
  return (
    <nldd-list accessible-label={label}>
      {items.map((item, i) => (
        <nldd-list-item key={i}>
          <nldd-text-cell>{item}</nldd-text-cell>
        </nldd-list-item>
      ))}
    </nldd-list>
  );
}

/** Steps to take in order, numbered. */
function Steps({ label, items }: { label: string; items: ReactNode[] }) {
  return (
    <nldd-list accessible-label={label} dividers="never">
      {items.map((item, i) => (
        <nldd-list-item key={i}>
          <nldd-step-cell
            size="md"
            status="future"
            text={String(i + 1)}
            position={items.length === 1 ? 'only' : i === 0 ? 'first' : i === items.length - 1 ? 'last' : 'between'}
          ></nldd-step-cell>
          <nldd-spacer-cell size="12"></nldd-spacer-cell>
          <nldd-text-cell>{item}</nldd-text-cell>
        </nldd-list-item>
      ))}
    </nldd-list>
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
    <nldd-container gap="32">
      <nldd-text>
        Hier lees je hoe je PromptPlein gebruikt met je stem, je toetsenbord of een schermlezer.
        Alles staat uit tot je het zelf aanzet bij Instellen.
      </nldd-text>
      <Contents />

      <Section id="hulp-telefoon" title="Op de telefoon">
        <Points
          label="Op de telefoon"
          items={[
            'Het hoofdmenu staat onderaan het scherm.',
            'Instellingen, thema en inloggen vind je achter de knop Menu of Accountmenu.',
            'Inzoomen met twee vingers werkt op elke pagina.',
            'De chat werkt met VoiceOver op een iPhone en met TalkBack op Android.',
            'Veeg naar rechts voor het volgende onderdeel. Tik twee keer om te kiezen. Bij een open venster blijft de schermlezer in dat venster.',
            'Typen hoeft niet: de microfoon in de chat zet wat je zegt om in tekst.',
          ]}
        />
      </Section>

      <Section id="hulp-sneltoetsen" title="Sneltoetsen">
        <nldd-list accessible-label="Alle sneltoetsen van PromptPlein">
          {Object.values(SHORTCUTS).map((shortcut) => (
            <nldd-list-item key={shortcut.code}>
              <nldd-text-cell text={shortcut.label} supporting-text={shortcut.where}></nldd-text-cell>
              {/* On a narrow screen the keys would squeeze the text; that is a
                  phone or a strong zoom, where a keyboard shortcut is rarely used. */}
              <nldd-spacer-cell size="12" hide-below="30rem"></nldd-spacer-cell>
              <nldd-cell hide-below="30rem">
                <Keys shortcut={shortcut} />
              </nldd-cell>
            </nldd-list-item>
          ))}
        </nldd-list>
        <nldd-text>
          Met <Escape /> stop je inspreken, voorlezen of een gesprek.
        </nldd-text>
      </Section>

      <Section id="hulp-lezen" title="Grotere letters en meer contrast">
        <nldd-text>
          Ga naar <nldd-link href="/instellingen/toegankelijkheid">Instellen</nldd-link>. Daar kies je de
          tekstgrootte en minder beweging. Dit werkt ook zonder account en blijft
          bewaard in deze browser.
        </nldd-text>
        <nldd-text>
          Wil je meer contrast? Gebruik de contrastinstelling van je computer. Met de
          contrastthema&apos;s van Windows volgt elk onderdeel van PromptPlein mee.
        </nldd-text>
      </Section>

      <Section id="hulp-voorlezen" title="Antwoorden laten voorlezen">
        <nldd-text>Voorlezen staat uit. Bij Instellen zet je het op een van deze manieren aan:</nldd-text>
        <Points
          label="Manieren om voorlezen aan te zetten"
          items={[
            'Zet de knop Voorlezen onder elk antwoord aan. Dan kies je zelf welk antwoord je hoort.',
            'Kies dat PromptPlein elk antwoord hardop voorleest zodra het klaar is.',
          ]}
        />
        <nldd-text>
          Staat voorlezen aan, dan hoor je het laatste antwoord met <Keys shortcut={SHORTCUTS.voorlezen} />.
        </nldd-text>
        <nldd-text>
          Ben je ingelogd, dan leest de stem Lotte voor. Zonder account leest de stem van je
          apparaat voor. Bij Instellen kun je een andere stem en snelheid kiezen.
        </nldd-text>
      </Section>

      <Section id="hulp-inspreken" title="Inspreken in plaats van typen">
        <nldd-text>Hiervoor moet je ingelogd zijn.</nldd-text>
        <Steps
          label="Stappen om in te spreken"
          items={[
            <>
              Druk op <Keys shortcut={SHORTCUTS.dicteren} />. Je hoort een toon die omhoog gaat.
            </>,
            'Zeg wat je wilt typen.',
            <>
              Druk nog een keer op <Keys shortcut={SHORTCUTS.dicteren} />. De tekst komt in het
              tekstvak.
            </>,
          ]}
        />
        <nldd-text>
          Je leest de tekst na en verstuurt hem zelf. Wil je meteen versturen? Zet dan bij Instellen
          Versturen met je stem aan, en eindig met het woord verstuur.
        </nldd-text>
      </Section>

      <Section id="hulp-gesprek" title="Een gesprek voeren zonder handen">
        <nldd-text>
          In een gesprek praat je met de chat en hoef je geen toetsen te gebruiken. Hiervoor moet je
          ingelogd zijn.
        </nldd-text>
        <Steps
          label="Stappen voor een gesprek zonder handen"
          items={[
            'Zet bij Instellen Gesprek zonder handen aan. Dit hoef je maar één keer te doen.',
            <>
              Druk in de chat op <Keys shortcut={SHORTCUTS.gesprek} />, of gebruik de knop Gesprek.
            </>,
            'Wacht op de toon die omhoog gaat en stel je vraag.',
            'Ben je even stil, dan wordt je vraag vanzelf verstuurd.',
            'Het antwoord wordt voorgelezen. Daarna hoor je de toon weer en ben jij aan de beurt.',
          ]}
        />
        <nldd-text>
          Je stopt met <Escape />, of door alleen stop te zeggen. Het gesprek stopt ook vanzelf als je
          30 seconden niets zegt. Je hoort dan een toon die omlaag gaat.
        </nldd-text>
        <nldd-text>
          De microfoon staat alleen open na de toon, en je stem gaat dan naar Mistral om uitgeschreven
          te worden. Gebruik een koptelefoon, dan neemt de microfoon de voorleesstem of je
          schermlezer niet op. Noem geen persoonsgegevens.
        </nldd-text>
        <nldd-text>
          Hoort PromptPlein iets wat op een persoonsgegeven lijkt, dan verschijnt er een melding en
          wacht het gesprek. De stem leest de melding en je keuzes voor. Kies je doorgaan, dan gaat
          het gesprek verder. Kies je terug, dan stopt het gesprek en kun je je bericht aanpassen.
        </nldd-text>
      </Section>

      <Section id="hulp-doorvragen" title="Als de chat eerst vragen stelt">
        <nldd-text>
          Bij het eerste bericht van een nieuwe chat stelt de chat soms eerst een paar vragen. Daarna
          maakt hij er een prompt van.
        </nldd-text>
        <Points
          label="Vragen van de chat"
          items={[
            'Kies een antwoord met een knop, of typ je antwoord in het tekstvak.',
            'Met de knop Sla de vragen over gaat je bericht meteen door.',
            'Met de knop Gebruik deze prompt komt de prompt in het tekstvak. Je leest hem na en verstuurt hem zelf.',
            'Je zet dit uit bij Instellingen, Chat.',
          ]}
        />
      </Section>

      <Section id="hulp-schermlezer" title="Met een schermlezer">
        <Points
          label="Met een schermlezer"
          items={[
            'Elk bericht in de chat heeft een kop: Jouw bericht of Antwoord. Spring van kop naar kop om door een gesprek te gaan.',
            'Wil je dat je schermlezer elk antwoord voorleest? Kies dat bij Instellen, onder Als een antwoord in de chat klaar is.',
            'De eerste link van elke pagina brengt je meteen naar de inhoud.',
          ]}
        />
      </Section>

      <Section id="hulp-vraag" title="Lukt het niet?">
        <nldd-text>
          Werkt iets niet, of mis je iets? Laat het ons weten via <nldd-link href="/contact">Contact</nldd-link>.
        </nldd-text>
      </Section>
    </nldd-container>
  );
}
