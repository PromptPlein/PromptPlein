import { useEffect, useMemo, useState } from 'react';
import ChatFileCard from '@/components/chat/ChatFileCard';
import { buildRoutekaartHtml, parseRoutekaart, routekaartBestandsnaam } from '@/lib/routekaart';
import '@nldd/design-system/activity-indicator';
import '@nldd/design-system/card';
import '@nldd/design-system/container';
import '@nldd/design-system/icon';
import '@nldd/design-system/text';

/**
 * The route map as a file, right under the filled-in task in the builder. The
 * content comes from the block the AI just wrote; layout, motion and technique
 * are the fixed route map of PromptPlein, so no language model has to program it.
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
    <nldd-card background="accent-tinted">
      <nldd-container padding="16" gap="12">
        <nldd-container layout="row" gap="8" vertical-alignment="center">
          <nldd-icon icon="map" size="20" color="lintblauw"></nldd-icon>
          <nldd-text size="sm" weight="bold" color="accent">
            Je routekaart staat klaar
          </nldd-text>
        </nldd-container>
        <nldd-text size="sm" color="secondary">
          Gemaakt met de vaste routekaart van PromptPlein en de inhoud hierboven: altijd dezelfde
          rijksstijl, geschikt voor een groot scherm en de telefoon. Bekijk hem hier of download het
          bestand.
          {open > 0 &&
            ` Er ${open === 1 ? 'staat nog 1 gegeven' : `staan nog ${open} gegevens`} tussen [haakjes]; vul die aan in de velden en bouw opnieuw, dan komen ze op de kaart.`}
        </nldd-text>
        {html ? (
          <ChatFileCard code={html} closed isStreaming={false} fileName={routekaartBestandsnaam(data)} />
        ) : (
          <nldd-container layout="row" gap="8" vertical-alignment="center">
            <nldd-activity-indicator size="16"></nldd-activity-indicator>
            <nldd-text size="xs" color="secondary">
              De routekaart wordt gemaakt…
            </nldd-text>
          </nldd-container>
        )}
      </nldd-container>
    </nldd-card>
  );
}
