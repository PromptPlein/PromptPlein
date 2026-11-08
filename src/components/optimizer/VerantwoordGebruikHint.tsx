import { useMemo } from 'react';
import { detectVerantwoordSignalen } from '@/lib/verantwoordGebruik';

/**
 * Pointer under the builder's input field: when the task touches decisions about
 * citizens, personal data or confidential information, it lists the frameworks
 * and instruments that apply. It blocks nothing; the guardrails already do that
 * for real personal data in the text.
 */
export default function VerantwoordGebruikHint({ text }: { text: string }) {
  const signalen = useMemo(() => detectVerantwoordSignalen(text), [text]);
  if (signalen.length === 0) return null;

  return (
    <nldd-banner variant="accent" size="sm" icon="paragraph-sign" text="Verantwoord gebruik van AI bij deze opdracht">
      <nldd-container gap="12">
        {signalen.map((s) => (
          <nldd-container key={s.id} gap="4">
            <nldd-text size="sm">
              <strong>{s.titel}.</strong> {s.tekst}
            </nldd-text>
            {s.links.length > 0 && (
              <nldd-container layout="wrap" gap="12">
                {s.links.map((l) => (
                  <nldd-link
                    key={l.href}
                    href={l.href}
                    target="_blank"
                    size="sm"
                    text={l.label}
                    end-icon="external-link"
                  ></nldd-link>
                ))}
              </nldd-container>
            )}
          </nldd-container>
        ))}
      </nldd-container>
    </nldd-banner>
  );
}
