import { useEffect, useMemo, useRef, useState } from 'react';
import { downloadText } from '@/lib/download';
import { htmlFileName, htmlLooksComplete } from '@/lib/chatFiles';
import { checkHtml, repairRequest, type FileCheckResult } from '@/lib/fileCheck';
import CopyMessageButton from './CopyMessageButton';
import '@nldd/design-system/activity-indicator';
import '@nldd/design-system/button';
import '@nldd/design-system/button-group';
import '@nldd/design-system/card';
import '@nldd/design-system/code-viewer';
import '@nldd/design-system/container';
import '@nldd/design-system/icon';
import '@nldd/design-system/text';

/** Zoveel regels van het eind van het bestand staan in beeld terwijl het groeit. */
const TAIL_LINES = 12;

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  return `${(bytes / 1024).toLocaleString('nl-NL', { maximumFractionDigits: 1 })} kB`;
}

/**
 * Een HTML-pagina uit een chatantwoord, getoond als bestand. Terwijl het model
 * schrijft, zie je de grootte oplopen en de laatste regels voorbijkomen; zodra
 * het af is, kun je het bestand bekijken en downloaden.
 *
 * Het voorbeeld draait in een iframe met `sandbox="allow-scripts"` en zonder
 * allow-same-origin: de pagina is door een model geschreven en mag dus wel
 * zijn eigen script draaien, maar niet bij de opslag van PromptPlein (de chats,
 * de inlogsessie). Om dezelfde reden geen "open in nieuw tabblad" via een
 * blob-URL: die zou wél de herkomst van de app krijgen.
 */
export default function ChatFileCard({
  code,
  closed,
  isStreaming,
  fileName,
  onRepair,
}: {
  code: string;
  /** Het codeblok is afgesloten door het model. */
  closed: boolean;
  /** Het bericht waar dit bestand in staat, wordt nog geschreven. */
  isStreaming: boolean;
  /** Vaste bestandsnaam; anders komt hij uit de <title> van de pagina. */
  fileName?: string;
  /** "Laat de AI dit herstellen": stuurt de gevonden fouten als nieuw bericht. */
  onRepair?: (text: string) => void;
}) {
  const [preview, setPreview] = useState(false);
  const [showCode, setShowCode] = useState(false);
  const frameHostRef = useRef<HTMLElement>(null);
  const frameRef = useRef<HTMLIFrameElement | null>(null);

  const writing = isStreaming && !closed;
  const complete = closed || htmlLooksComplete(code);
  const name = useMemo(() => fileName ?? htmlFileName(code), [fileName, code]);

  // Controle zodra het bestand af is: de pagina draait onzichtbaar en afgeschermd,
  // en elke fout komt met regelnummer terug. Zo zie je een kapotte pagina vóór
  // je hem downloadt in plaats van erna.
  const [check, setCheck] = useState<FileCheckResult | null>(null);
  useEffect(() => {
    if (writing) {
      setCheck(null);
      return;
    }
    let active = true;
    setCheck(null);
    void checkHtml(code).then((result) => {
      if (active) setCheck(result);
    });
    return () => {
      active = false;
    };
  }, [writing, code]);
  const bytes = useMemo(() => new TextEncoder().encode(code).length, [code]);
  const lineCount = useMemo(() => code.split('\n').length, [code]);
  const tail = writing ? code.split('\n').slice(-TAIL_LINES).join('\n') : '';

  // nldd 0.18.0 has no component for a sandboxed frame, so the preview iframe is
  // created through the DOM API inside an nldd-container instead of as markup.
  useEffect(() => {
    const host = frameHostRef.current;
    if (!host || writing || !preview) return;
    const frame = document.createElement('iframe');
    frame.title = `Voorbeeld van ${name}`;
    frame.srcdoc = code;
    frame.setAttribute('sandbox', 'allow-scripts');
    frame.setAttribute('allow', 'fullscreen');
    frame.allowFullscreen = true;
    frame.width = '100%';
    frame.height = String(Math.round(window.innerHeight * 0.7));
    frame.frameBorder = '0';
    host.replaceChildren(frame);
    frameRef.current = frame;
    return () => {
      frame.remove();
      frameRef.current = null;
    };
  }, [writing, preview, code, name]);

  const status = writing ? 'Wordt geschreven' : complete ? 'Klaar' : 'Niet af';

  return (
    <nldd-card accessible-label={name}>
      <nldd-container padding="12" gap="12">
        <nldd-container layout="row" gap="12" vertical-alignment="center">
          <nldd-icon icon="code" box color="lintblauw" size="40"></nldd-icon>
          <nldd-container gap="2">
            <nldd-text weight="bold">{name}</nldd-text>
            <nldd-container layout="row" gap="6" vertical-alignment="center">
              {writing ? (
                <nldd-activity-indicator size="16" timing="instant" text="Wordt geschreven"></nldd-activity-indicator>
              ) : complete ? (
                <nldd-icon icon="check-mark" size="16" color="success"></nldd-icon>
              ) : null}
              <nldd-text size="xs" color="secondary">
                {status} · {formatSize(bytes)} · {lineCount.toLocaleString('nl-NL')}{' '}
                {lineCount === 1 ? 'regel' : 'regels'}
              </nldd-text>
            </nldd-container>
          </nldd-container>
        </nldd-container>
        {!writing && (
            <nldd-button-group orientation="horizontal" size="sm">
              <nldd-button
                appearance="secondary"
                start-icon={preview ? 'eye-slash' : 'eye'}
                text={preview ? 'Verberg voorbeeld' : 'Bekijk'}
                expanded={preview || undefined}
                onClick={() => setPreview((v) => !v)}
              ></nldd-button>
              <nldd-button
                appearance="primary"
                start-icon="download"
                text="Download"
                supporting-text={complete ? undefined : 'Nog niet af'}
                onClick={() => downloadText(name, code, 'text/html')}
              ></nldd-button>
            </nldd-button-group>
          )}

        {!writing && (
          <nldd-container role="status" gap="6">
            {!check ? (
              <nldd-container layout="row" gap="6" vertical-alignment="center">
                <nldd-activity-indicator size="16" timing="instant" text="Wordt gecontroleerd"></nldd-activity-indicator>
                <nldd-text size="xs" color="secondary">Wordt gecontroleerd op fouten…</nldd-text>
              </nldd-container>
            ) : check.ok ? (
              <nldd-container layout="row" gap="6" vertical-alignment="center">
                <nldd-icon icon="shield-check-mark" size="16" color="success"></nldd-icon>
                <nldd-text size="xs" color="success">Gecontroleerd: de pagina opent zonder fouten.</nldd-text>
              </nldd-container>
            ) : (
              <>
                <nldd-container layout="row" gap="6" vertical-alignment="center">
                  <nldd-icon icon="exclamation-triangle" size="16" color="critical"></nldd-icon>
                  <nldd-text size="xs" weight="bold" color="critical">
                    {check.problems.length === 1
                      ? 'Er zit een fout in dit bestand.'
                      : `Er zitten ${check.problems.length} fouten in dit bestand.`}{' '}
                    Zo werkt de pagina niet goed.
                  </nldd-text>
                </nldd-container>
                {check.problems.map((p, i) => (
                  <nldd-container key={i} gap="2">
                    <nldd-text size="xs" color="critical">
                      {p.line ? <strong>Regel {p.line}: </strong> : null}
                      {p.message}
                    </nldd-text>
                    {p.snippet && (
                      <nldd-code-viewer appearance="simple" no-copy wrap>
                        {p.snippet}
                      </nldd-code-viewer>
                    )}
                  </nldd-container>
                ))}
                {onRepair && (
                  <nldd-container layout="row">
                    <nldd-button
                      appearance="primary"
                      size="sm"
                      start-icon="wrench"
                      text="Laat de AI dit herstellen"
                      onClick={() => onRepair(repairRequest(name, check.problems))}
                    ></nldd-button>
                  </nldd-container>
                )}
              </>
            )}
          </nldd-container>
        )}

        {/* Terwijl het model schrijft: de laatste regels, zodat je ziet dat het
            bestand groeit. Een vast aantal regels, dus de chat springt niet mee. */}
        {writing && (
          <nldd-code-viewer aria-hidden="true" language="html" no-copy wrap max-height="14rem">
            {tail}
          </nldd-code-viewer>
        )}

        {!writing && preview && (
          <nldd-container gap="6">
            <nldd-container layout="wrap" gap="8" vertical-alignment="center">
              <nldd-text size="xs" color="secondary">
                Voorbeeld. Scripts draaien afgeschermd van PromptPlein.
              </nldd-text>
              <nldd-button
                appearance="neutral-transparent"
                size="xs"
                start-icon="full-screen"
                text="Volledig scherm"
                onClick={() => void frameRef.current?.requestFullscreen?.()}
              ></nldd-button>
            </nldd-container>
            <nldd-container ref={frameHostRef}></nldd-container>
          </nldd-container>
        )}

        {!writing && (
          <nldd-container layout="row" gap="12" vertical-alignment="center">
            <nldd-button
              appearance="neutral-transparent"
              size="xs"
              start-icon="code"
              text={showCode ? 'Verberg code' : 'Toon code'}
              expanded={showCode || undefined}
              onClick={() => setShowCode((v) => !v)}
            ></nldd-button>
            <CopyMessageButton text={code} label="Kopieer code" />
          </nldd-container>
        )}
        {!writing && showCode && (
          <nldd-code-viewer language="html" max-height="24rem">
            {code}
          </nldd-code-viewer>
        )}
      </nldd-container>
    </nldd-card>
  );
}
