import { useState } from 'react';
import { notify } from '@/lib/notify';
import { stripMarkdown, copyToClipboard } from '@/lib/utils';
import '@nldd/design-system/box';
import '@nldd/design-system/button';
import '@nldd/design-system/button-group';
import '@nldd/design-system/card';
import '@nldd/design-system/container';
import '@nldd/design-system/divider';
import '@nldd/design-system/icon';
import '@nldd/design-system/icon-button';
import '@nldd/design-system/text';
import '@nldd/design-system/tooltip';

/**
 * Recognizes the headings the task description is built from (DOEL:, CONTEXT:,
 * AANPAK: …): capitals, spaces and a few signs, followed by a colon at the start
 * of a line.
 */
const HEADING = /^([A-Z][A-Z\s&/-]{2,}):\s*(.*)$/;

/** File name for the download, without characters an operating system objects to. */
function fileNameFor(goal: string): string {
  const base = goal.trim().split(/\s+/).slice(0, 6).join('-').replace(/[^\p{L}\p{N}-]/gu, '');
  return `opdrachtbeschrijving-${base || 'gesprek'}.txt`.toLowerCase();
}

/**
 * What the AI wrote down from the round of questions. The framework choice and
 * the fields come from it. Visible, so whoever answered eight questions can check
 * that nothing went missing or was made up, and resume the conversation before
 * the prompt is built.
 *
 * Saving goes to the clipboard or a text file on purpose: the description is not
 * a prompt, so it does not belong in the prompt library.
 */
export default function BriefSummary({
  brief,
  goal,
  technique,
  why,
}: {
  brief: string;
  goal: string;
  /** De techniek die uit het gesprek volgt; hier pas bekend, niet bij de vragen. */
  technique?: string;
  /** Eén zin waarom die techniek past, gekoppeld aan wat de gebruiker vertelde. */
  why?: string;
}) {
  // Closed: the filled-in fields come first. Whoever wants to read it opens it.
  const [open, setOpen] = useState(false);
  const [copied, setCopied] = useState(false);

  // The lines TECHNIEK: and WAAROM DEZE TECHNIEK: are shown apart at the top.
  const lines = brief
    .trim()
    .split('\n')
    .filter((l) => !/^\s*(TECHNIEK|WAAROM DEZE TECHNIEK):/i.test(l));

  async function copy() {
    try {
      await copyToClipboard(brief.trim());
      setCopied(true);
      notify.success('Samenvatting gekopieerd.');
      window.setTimeout(() => setCopied(false), 2000);
    } catch {
      notify.error('Kopiëren mislukt.');
    }
  }

  function download() {
    // A blob and a temporary link keep the file on the user's device; nothing
    // goes to the server.
    const blob = new Blob([brief.trim()], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = fileNameFor(goal);
    link.click();
    URL.revokeObjectURL(url);
    notify.success('Samenvatting opgeslagen.');
  }

  return (
    <nldd-card>
      <nldd-container padding="16" gap="12">
        <nldd-container layout="wrap" gap="8" vertical-alignment="center">
          <nldd-icon icon="checkbox-list" size="20" color="lintblauw"></nldd-icon>
          <nldd-container width="14rem" gap="2">
            <nldd-text size="sm" weight="bold">
              Dit hebben we uit het gesprek gehaald
            </nldd-text>
            <nldd-text size="xs" color="secondary">
              Hieruit heeft de AI je velden ingevuld.
            </nldd-text>
          </nldd-container>
          <nldd-button-group size="sm">
            <nldd-tooltip text="Kopieer de samenvatting">
              <nldd-button
                appearance="neutral-transparent"
                size="xs"
                start-icon={copied ? 'check-mark' : 'copy'}
                text={copied ? 'Gekopieerd' : 'Kopieer'}
                onClick={() => void copy()}
              ></nldd-button>
            </nldd-tooltip>
            <nldd-tooltip text="Bewaar de samenvatting als tekstbestand op je apparaat">
              <nldd-button
                appearance="neutral-transparent"
                size="xs"
                start-icon="download"
                text="Opslaan"
                onClick={download}
              ></nldd-button>
            </nldd-tooltip>
            <nldd-icon-button
              appearance="neutral-transparent"
              size="xs"
              icon={open ? 'chevron-up' : 'chevron-down'}
              accessible-label={open ? 'Inklappen' : 'Uitklappen'}
              onClick={() => setOpen((v) => !v)}
            ></nldd-icon-button>
          </nldd-button-group>
        </nldd-container>

        {open && (
          <nldd-container gap="6">
            <nldd-divider></nldd-divider>
            {/* The technique that follows from the conversation, with the reason:
                the conclusion on which the rest rests. */}
            {technique && (
              <nldd-box background="accent-tinted">
                <nldd-container padding="12" layout="row" gap="8">
                  <nldd-icon icon="sparkles" size="16" color="lintblauw"></nldd-icon>
                  <nldd-container gap="2">
                    <nldd-text size="sm">
                      Techniek: <strong>{stripMarkdown(technique)}</strong>
                    </nldd-text>
                    {why && (
                      <nldd-text size="xs" color="secondary" line-height="loose">
                        {stripMarkdown(why)}
                      </nldd-text>
                    )}
                  </nldd-container>
                </nldd-container>
              </nldd-box>
            )}
            {lines.map((line, i) => {
              const heading = HEADING.exec(line.trim());
              if (heading) {
                return (
                  <nldd-text key={i} size="sm" line-height="loose">
                    <strong>{heading[1].trim()}:</strong> {stripMarkdown(heading[2])}
                  </nldd-text>
                );
              }
              if (!line.trim()) return null;
              return (
                <nldd-text key={i} size="sm" color="secondary" line-height="loose">
                  {stripMarkdown(line)}
                </nldd-text>
              );
            })}
          </nldd-container>
        )}
      </nldd-container>
    </nldd-card>
  );
}
