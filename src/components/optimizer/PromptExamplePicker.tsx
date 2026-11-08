import { useId, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useNlddEvent } from '@/lib/nldd';
import { PROMPT_CATEGORIES } from '@/data/promptCategories';
import { PROMPT_EXAMPLES, type PromptExample } from '@/data/promptExamples';

/**
 * Example prompts as a starting point for the context field of a framework.
 *
 * One quiet button above the field: whoever looks for an example finds it,
 * whoever types does not notice it. The list is long on purpose (there is a lot
 * of different work), so it opens in a sheet beside the page instead of pushing
 * the field down. A row shows the title, not the prompt; the eye button beside
 * it shows the prompt itself, and after picking it is in the context field.
 */
export default function PromptExamplePicker({
  onPick,
}: {
  /** De gekozen prompt; de aanroeper zet hem in zijn eigen invoerveld. */
  onPick: (prompt: string) => void;
}) {
  const [open, setOpen] = useState(false);
  // Title of the last picked example, so the button shows what is in the field.
  // Informational only: the user edits the text afterwards.
  const [picked, setPicked] = useState<string | null>(null);
  const baseId = useId().replace(/:/g, '');
  const sheetRef = useRef<HTMLElement>(null);
  useNlddEvent(sheetRef, 'close', () => setOpen(false));

  function pick(ex: PromptExample) {
    setPicked(ex.title);
    setOpen(false);
    onPick(ex.prompt);
  }

  return (
    <>
      <nldd-tooltip text={`${PROMPT_EXAMPLES.length} prompts uit het rijkswerk. Je past ze daarna aan naar je eigen dossier.`}>
        <nldd-button
          appearance="neutral-tinted"
          size="sm"
          start-icon="lightbulb"
          text={picked ? `Voorbeeld gekozen: ${picked}` : 'Begin met een voorbeeld'}
          onClick={() => setOpen(true)}
        ></nldd-button>
      </nldd-tooltip>

      {createPortal(
        <nldd-sheet ref={sheetRef} placement="right" width="32rem" open={open || undefined}>
          <nldd-page>
            <nldd-top-title-bar
              slot="header"
              text="Begin met een voorbeeld"
              heading-level={2}
              dismiss-text="Sluiten"
            ></nldd-top-title-bar>
            <nldd-simple-section>
              <nldd-text slot="header" color="secondary">
                {PROMPT_EXAMPLES.length} prompts uit het rijkswerk. Kies er een; je past hem daarna aan naar je
                eigen dossier.
              </nldd-text>
              <nldd-list appearance="box-base" accessible-label="Voorbeeldprompts">
                {PROMPT_EXAMPLES.map((ex, i) => (
                  <nldd-list-item key={ex.title}>
                    <nldd-list-item-segment width="full" button onClick={() => pick(ex)}>
                      <nldd-text-cell
                        overline={PROMPT_CATEGORIES[ex.category].label}
                        text={ex.title}
                        supporting-text={ex.subtitle}
                      ></nldd-text-cell>
                    </nldd-list-item-segment>
                    <nldd-list-item-segment
                      button
                      popovertarget={`${baseId}-voorbeeld-${i}`}
                      accessible-label={`${ex.title}: bekijk de prompt`}
                    >
                      <nldd-icon-cell icon="eye" size="20"></nldd-icon-cell>
                    </nldd-list-item-segment>
                  </nldd-list-item>
                ))}
              </nldd-list>
              {PROMPT_EXAMPLES.map((ex, i) => (
                <nldd-popover
                  key={ex.title}
                  id={`${baseId}-voorbeeld-${i}`}
                  role="region"
                  width="28rem"
                  accessible-label={`Voorbeeldprompt: ${ex.title}`}
                >
                  <nldd-container padding="16" gap="8">
                    <nldd-text size="sm" weight="bold">
                      {ex.title}
                    </nldd-text>
                    {ex.prompt.split(/\n{2,}/).map((para, j) => (
                      <nldd-text key={j} size="sm">
                        {para}
                      </nldd-text>
                    ))}
                  </nldd-container>
                </nldd-popover>
              ))}
            </nldd-simple-section>
          </nldd-page>
        </nldd-sheet>,
        document.body,
      )}
    </>
  );
}
