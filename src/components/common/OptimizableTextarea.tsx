import {
  forwardRef,
  useEffect,
  useState,
  type TextareaHTMLAttributes,
} from 'react';
import { Loader2, Sparkles, Undo2 } from '@/components/common/icons';
import clsx from 'clsx';
import toast from 'react-hot-toast';
import { useAuth } from '@/context/AuthContext';
import { optimizeChatInput } from '@/services/chatService';
import { getChatSettingsCached, type ChatSettings } from '@/services/settingsService';

interface OptimizableTextareaProps
  extends Omit<TextareaHTMLAttributes<HTMLTextAreaElement>, 'value' | 'onChange'> {
  value: string;
  onValueChange: (value: string) => void;
  /**
   * Tekst in de tooltip van het sterretje. Standaard de formulering uit de
   * chat; een veld met een ander doel mag hem aanscherpen.
   */
  optimizeTitle?: string;
}

/**
 * Een tekstvak met hetzelfde groene sterretje als het invoerveld van de chat:
 * één klik en de AI schrijft uit wat de gebruiker in steekwoorden heeft
 * neergezet. De oorspronkelijke tekst blijft daarna één klik weg.
 *
 * Bewust dezelfde route als de chat (`optimizeChatInput`), dus ook dezelfde
 * systeeminstructie uit het beheerportaal en dezelfde schakelaar: staat
 * "sterretje tonen" daar uit, dan verschijnt hij hier evenmin. Wat de beheerder
 * over verbeteren heeft ingesteld, geldt overal waar de gebruiker tekst intypt.
 *
 * Alleen voor ingelogde gebruikers: de verbeterslag draait op de chat-poort van
 * de edge function, en die vraagt om een sessie. Zonder sessie blijft de knop
 * weg in plaats van te falen bij de eerste klik.
 */
const OptimizableTextarea = forwardRef<HTMLTextAreaElement, OptimizableTextareaProps>(
  function OptimizableTextarea(
    { value, onValueChange, optimizeTitle, className, disabled, ...rest },
    ref,
  ) {
    const { user } = useAuth();
    const [settings, setSettings] = useState<ChatSettings | null>(null);
    const [optimizing, setOptimizing] = useState(false);
    // De tekst van vóór de laatste verbetering, met wat eruit kwam. Zolang het
    // veld nog exact het resultaat bevat, kan de gebruiker terug.
    const [beforeOptimize, setBeforeOptimize] = useState<{ before: string; after: string } | null>(
      null,
    );

    useEffect(() => {
      let active = true;
      void getChatSettingsCached().then((s) => {
        if (active) setSettings(s);
      });
      return () => {
        active = false;
      };
    }, []);

    const available = Boolean(user) && Boolean(settings?.optimizeEnabled);
    const canOptimize = available && !disabled && !optimizing && value.trim().length > 0;
    // Alleen terugdraaien zolang het veld nog precies het verbeterde resultaat
    // bevat; typt de gebruiker verder, dan slaat "herstellen" nergens meer op.
    const canUndo = beforeOptimize !== null && value === beforeOptimize.after && !optimizing;

    async function optimize() {
      if (!settings || !canOptimize) return;
      const before = value;
      setOptimizing(true);
      try {
        const res = await optimizeChatInput({ text: before, settings });
        if (res.error) {
          toast.error(res.error);
          return;
        }
        if (!res.changed || !res.text.trim()) {
          toast('Je tekst was al duidelijk genoeg.', { icon: '✨' });
          return;
        }
        onValueChange(res.text);
        setBeforeOptimize({ before, after: res.text });
      } finally {
        setOptimizing(false);
      }
    }

    function undoOptimize() {
      if (!canUndo || !beforeOptimize) return;
      onValueChange(beforeOptimize.before);
      setBeforeOptimize(null);
    }

    return (
      <div className="relative">
        <textarea
          {...rest}
          ref={ref}
          value={value}
          disabled={disabled || optimizing}
          onChange={(e) => onValueChange(e.target.value)}
          // Ruimte rechtsboven voor het sterretje, zodat de tekst er niet onder
          // doorloopt. Vast zodra de knop beschikbaar is (niet afhankelijk van
          // of er tekst staat), anders zou de tekst verspringen bij het typen.
          className={clsx(className, available && 'pr-12')}
        />
        {/* Verschijnt pas zodra er tekst staat, zodat een leeg veld rustig
            blijft. Zelfde groen als in de chat. */}
        {available && (value.trim().length > 0 || optimizing) && (
          <button
            type="button"
            className={clsx(
              'absolute right-3 top-3 flex h-7 w-7 items-center justify-center rounded-lg',
              'bg-pleingroen text-slate-950 shadow-sm',
              'transition-all duration-200 focus:outline-none focus:ring-2 focus:ring-pleingroen/40',
              canOptimize
                ? 'hover:shadow-md motion-safe:hover:-translate-y-px'
                : 'cursor-default opacity-60',
            )}
            onClick={() => void optimize()}
            disabled={!canOptimize}
            title={
              optimizing
                ? 'Bezig met verbeteren…'
                : (optimizeTitle ??
                  'Verbeter mijn tekst met AI; je oorspronkelijke tekst kun je daarna terughalen')
            }
            aria-label="Verbeter mijn tekst met AI"
          >
            {optimizing ? (
              <Loader2 size={14} className="animate-spin" />
            ) : (
              <Sparkles size={14} strokeWidth={2.25} />
            )}
          </button>
        )}

        {/* Na een verbetering: één klik terug naar de eigen tekst. Verdwijnt
            zodra de gebruiker zelf verder typt. */}
        {canUndo && (
          <div className="mt-1.5 flex items-center gap-2 text-[0.6875rem] text-slate-500 dark:text-slate-400">
            <Sparkles size={12} className="shrink-0 text-pleingroen" />
            <span className="min-w-0">Je tekst is verbeterd. Lees hem na en pas gerust aan.</span>
            <button
              type="button"
              className="inline-flex shrink-0 items-center gap-1 font-medium text-rijksblauw-600 hover:underline dark:text-rijksblauw-300"
              onClick={undoOptimize}
            >
              <Undo2 size={12} /> Herstel mijn tekst
            </button>
          </div>
        )}
      </div>
    );
  },
);

export default OptimizableTextarea;
