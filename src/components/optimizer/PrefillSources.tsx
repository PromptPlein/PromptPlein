import type { PrefillResult } from '@/types';
import '@nldd/design-system/card';
import '@nldd/design-system/container';
import '@nldd/design-system/icon';
import '@nldd/design-system/link';
import '@nldd/design-system/text';
import '@nldd/design-system/tooltip';

/**
 * What the internet search turned up while filling in the fields: the queries,
 * the sources, and how many fields got a fact from them. It sits above the
 * fields, so the user sees the internet was consulted and where the fields with
 * the label "Aangevuld van internet" come from.
 */
export default function PrefillSources({ prefill }: { prefill: PrefillResult }) {
  const sources = prefill.sources ?? [];
  const notices = prefill.notices ?? [];
  if (sources.length === 0 && notices.length === 0) return null;
  const metBron = prefill.fields.filter((f) => f.source === 'bron').length;

  return (
    <nldd-card>
      <nldd-container padding="12" gap="6">
        {notices.map((n) => (
          <nldd-text key={n} size="xs" color="warning">
            {n}
          </nldd-text>
        ))}
        {sources.length > 0 && (
          <>
            <nldd-container layout="row" gap="6" vertical-alignment="center">
              <nldd-icon icon="globe" size="16" color="lintblauw"></nldd-icon>
              <nldd-text size="xs" weight="medium" color="accent">
                Internet geraadpleegd: {sources.length} {sources.length === 1 ? 'bron' : 'bronnen'},{' '}
                {metBron === 0
                  ? 'maar geen enkel veld kreeg er een feit uit'
                  : `${metBron} ${metBron === 1 ? 'veld' : 'velden'} aangevuld`}
              </nldd-text>
            </nldd-container>
            {prefill.queries && prefill.queries.length > 0 && (
              <nldd-text size="xs" color="secondary">
                Gezocht op: {prefill.queries.map((q) => `"${q}"`).join(' en ')}
              </nldd-text>
            )}
            <nldd-container gap="2">
              {sources.map((s, i) => (
                <nldd-container key={s.url} layout="row" gap="6">
                  <nldd-text size="xs" color="secondary">
                    [{i + 1}]
                  </nldd-text>
                  <nldd-tooltip text={s.url}>
                    <nldd-link href={s.url} target="_blank" size="xs" text={s.title}></nldd-link>
                  </nldd-tooltip>
                </nldd-container>
              ))}
            </nldd-container>
          </>
        )}
      </nldd-container>
    </nldd-card>
  );
}
