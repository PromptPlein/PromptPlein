import { Bot } from 'lucide-react';
import clsx from 'clsx';
import { modelLabel, PROVIDER_LABELS, type AiProvider } from '@/config/aiModels';

/**
 * Badge rechtsonder in de chat: welk model er antwoordt (bijv. "Mistral ·
 * Mistral Small 4"). Antwoordde de fallback-keten met een andere provider,
 * dan toont de badge die tijdelijke provider in amber.
 */
export default function ChatModelBadge({
  provider,
  model,
  actualProvider,
}: {
  /** De provider volgens de admin-instelling. */
  provider: AiProvider;
  model: string;
  /** De provider die het laatste antwoord daadwerkelijk gaf (kan afwijken). */
  actualProvider?: string;
}) {
  const fallback =
    actualProvider && actualProvider !== provider && actualProvider !== 'local-template'
      ? actualProvider
      : null;

  const shownProvider = (fallback ?? provider) as AiProvider;
  const providerName = PROVIDER_LABELS[shownProvider] ?? shownProvider;
  const shownModel = fallback ? '' : modelLabel(provider, model) || model;

  return (
    <span
      className={clsx(
        'opl-badge whitespace-nowrap',
        fallback
          ? 'bg-amber-50 text-amber-700 dark:bg-amber-500/10 dark:text-amber-400'
          : 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300',
      )}
      title={
        fallback
          ? `${PROVIDER_LABELS[provider] ?? provider} was tijdelijk niet beschikbaar; dit antwoord kwam via ${providerName}.`
          : 'Dit model is ingesteld door de beheerder.'
      }
    >
      <Bot size={12} />
      {fallback ? `Tijdelijk via ${providerName}` : [providerName, shownModel].filter(Boolean).join(' · ')}
    </span>
  );
}
