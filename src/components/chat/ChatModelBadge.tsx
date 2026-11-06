import { Bot } from '@/components/common/icons';
import { modelLabel, PROVIDER_LABELS, type AiProvider } from '@/config/aiModels';

/**
 * Badge rechtsonder in de chat: welk model er antwoordt (bijv. "Mistral ·
 * Mistral Small 4"). Dit is altijd het model dat de beheerder heeft ingesteld.
 * Moest de fallback-keten onderweg naar een andere provider uitwijken, dan
 * blijft dat binnenskamers; de gebruiker ziet het ingestelde model staan.
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
    <span
      className="opl-badge whitespace-nowrap bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300"
      title="Dit model is ingesteld door de beheerder."
    >
      <Bot size={12} />
      {[providerName, shownModel].filter(Boolean).join(' · ')}
    </span>
  );
}
