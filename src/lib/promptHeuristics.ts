// Heuristiek voor de chat-nudge: herkent een "rommelige opdracht" — een
// werkopdracht die als losse chatregel is gesteld en als uitgewerkte prompt
// veel beter zou werken. Bewust puur lokaal (geen AI-aanroep): de nudge is een
// hint, geen oordeel, en mag niets kosten.

/** Nederlandse taakwerkwoorden die een werkproduct aankondigen. */
const TASK_VERB = /\b(schrijf|maak|stel\s+\S+\s+op|herschrijf|vat\s+samen|vertaal|formuleer|bedenk|genereer|ontwerp|verbeter)\b/i;

/** Signalen dat de gebruiker al structuur aanbrengt (dan geen nudge). */
const STRUCTURE_SIGNAL = /\n|•|^-\s|\brol\s*:|\bcontext\s*:|\btaak\s*:|\bformat\b|\bdoelgroep\b|\btoon\b|\bje bent\b/im;

/** Bovengrens: langere berichten bevatten meestal al genoeg context. */
const MAX_CHARS = 240;

/** Korte vragen ("wat is de AVG?") zijn geen opdrachten — geen nudge. */
const SHORT_QUESTION_MAX_WORDS = 15;

/**
 * Ziet dit chatbericht eruit als een korte, ongestructureerde werkopdracht?
 * Alleen dan loont de stap naar de generator: die bouwt er een herbruikbare,
 * volledige prompt van (rol, context, format, toon).
 */
export function looksLikeMessyPrompt(text: string): boolean {
  const clean = text.trim();
  if (!clean || clean.length > MAX_CHARS) return false;
  if (!TASK_VERB.test(clean)) return false;
  if (STRUCTURE_SIGNAL.test(clean)) return false;
  const words = clean.split(/\s+/).length;
  if (clean.endsWith('?') && words < SHORT_QUESTION_MAX_WORDS) return false;
  return true;
}
