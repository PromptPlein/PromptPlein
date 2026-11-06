import { useEffect, useMemo, useState } from 'react';
import { Loader2, Map as MapIcon } from '@/components/common/icons';
import ChatFileCard from '@/components/chat/ChatFileCard';
import { buildRoutekaartHtml, parseRoutekaart, routekaartBestandsnaam } from '@/lib/routekaart';

/**
 * De routekaart als bestand, direct onder de ingevulde opdracht in de bouwer.
 * De inhoud komt uit het blok dat de AI net schreef; de opmaak, de beweging en
 * de techniek zijn de vaste routekaart van PromptPlein. Zo krijg je de pagina
 * zonder dat een taalmodel hem eerst moet programmeren.
 */
export default function RoutekaartResult({ content }: { content: string }) {
  const data = useMemo(() => parseRoutekaart(content), [content]);
  const [html, setHtml] = useState<string | null>(null);

  useEffect(() => {
    if (!data) return;
    let active = true;
    setHtml(null);
    void buildRoutekaartHtml(data).then((result) => {
      if (active) setHtml(result);
    });
    return () => {
      active = false;
    };
  }, [data]);

  if (!data) return null;
  const open = (content.match(/\[[^\]\n]+\]/g) ?? []).length;

  return (
    <div className="rounded-xl border border-rijksblauw-200 bg-rijksblauw-50/60 p-4 dark:border-rijksblauw-500/30 dark:bg-rijksblauw-500/10">
      <p className="flex items-center gap-2 text-sm font-semibold text-rijksblauw-700 dark:text-rijksblauw-200">
        <MapIcon size={16} /> Je routekaart staat klaar
      </p>
      <p className="mt-1 text-sm text-slate-600 dark:text-slate-300">
        Gemaakt met de vaste routekaart van PromptPlein en de inhoud hierboven: altijd dezelfde
        rijksstijl, geschikt voor een groot scherm en de telefoon. Bekijk hem hier of download het
        bestand.
        {open > 0 &&
          ` Er ${open === 1 ? 'staat nog 1 gegeven' : `staan nog ${open} gegevens`} tussen [haakjes]; vul die aan in de velden en bouw opnieuw, dan komen ze op de kaart.`}
      </p>
      {html ? (
        <ChatFileCard code={html} closed isStreaming={false} fileName={routekaartBestandsnaam(data)} />
      ) : (
        <p className="mt-3 inline-flex items-center gap-1.5 text-xs text-slate-500 dark:text-slate-400">
          <Loader2 size={12} className="animate-spin" /> De routekaart wordt gemaakt…
        </p>
      )}
    </div>
  );
}
