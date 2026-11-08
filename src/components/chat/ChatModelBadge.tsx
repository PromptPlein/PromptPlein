import { modelLabel, PROVIDER_LABELS, type AiProvider } from '@/config/aiModels';

/**
 * Badge in de chat: welk model er antwoordt (bijv. "Mistral · Mistral Small 4").
 * Dit is altijd het model dat de beheerder heeft ingesteld. Moest de
 * fallback-keten onderweg naar een andere provider uitwijken, dan blijft dat
 * binnenskamers; de gebruiker ziet het ingestelde model staan.
 */
export default function ChatModelBadge({
  provider,
  model,
}: {
  /** De provider volgens de admin-instelling. */
  provider: AiProvider;
  model: string;
}) {
  const providerName = PROVIDER_LABELS[provider] ?? provider;
  const shownModel = modelLabel(provider, model) || model;

  return (
    <nldd-tooltip text="Dit model is ingesteld door de beheerder.">
      <nldd-tag
        size="sm"
        icon="cpu"
        text={[providerName, shownModel].filter(Boolean).join(' · ')}
      ></nldd-tag>
    </nldd-tooltip>
  );
}
