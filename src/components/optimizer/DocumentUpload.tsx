import { useRef, useState } from 'react';
import { notify } from '@/lib/notify';
import { useNlddEvent, useNlddValue } from '@/lib/nldd';

const ACCEPT =
  '.txt,.md,.markdown,.pdf,.docx,text/plain,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document';

/**
 * Upload zone for an example document (Template-based Output). It extracts the
 * text in the browser (txt/md/pdf/docx), after which the caller (through
 * `onPrefill`) lets the AI read the document and prefill the fields. Shared by
 * the plan builder and the single technique choice.
 *
 * Without an example, the user describes through `onDescribe` what kind of
 * document and format he needs, and the AI proposes a fitting structure. The
 * fields are never filled unasked: the user chooses first.
 */
export default function DocumentUpload({
  onPrefill,
  onDescribe,
  disabled,
}: {
  /** Ontvangt de geëxtraheerde tekst; geeft true terug als de velden gevuld zijn. */
  onPrefill: (text: string) => Promise<boolean>;
  /** Ontvangt de omschrijving van het gewenste document; true als de velden gevuld zijn. */
  onDescribe: (brief: string) => Promise<boolean>;
  disabled?: boolean;
}) {
  const [busy, setBusy] = useState(false);
  const [doneName, setDoneName] = useState<string | null>(null);
  const [brief, setBrief] = useState('');
  const [briefOpen, setBriefOpen] = useState(false);
  const [briefBusy, setBriefBusy] = useState(false);
  const [briefDone, setBriefDone] = useState(false);
  const fileRef = useRef<HTMLElement & { value?: string }>(null);
  useNlddEvent<CustomEvent<{ files?: File[] }>>(fileRef, 'change', (e) => {
    const file = e.detail?.files?.[0];
    if (file) void handleFile(file);
  });

  async function handleFile(file: File) {
    setBusy(true);
    setDoneName(null);
    try {
      const { extractDocument } = await import('@/lib/extractDocument');
      const doc = await extractDocument(file);
      notify.success(`"${doc.name}" ingelezen (${doc.chars.toLocaleString('nl-NL')} tekens).`);
      const ok = await onPrefill(doc.text);
      if (ok) setDoneName(doc.name);
    } catch (err) {
      notify.error(err instanceof Error ? err.message : 'Document inlezen mislukt.');
    } finally {
      setBusy(false);
    }
  }

  async function handleDescribe() {
    const text = brief.trim();
    if (!text) return;
    setBriefBusy(true);
    setBriefDone(false);
    try {
      const ok = await onDescribe(text);
      if (ok) setBriefDone(true);
    } catch (err) {
      notify.error(err instanceof Error ? err.message : 'Voorstellen van een structuur mislukt.');
    } finally {
      setBriefBusy(false);
    }
  }

  return (
    <nldd-box background="accent-tinted">
      <nldd-container padding="16" gap="12">
        <nldd-form-field label="Voorbeelddocument uploaden" optional>
          <nldd-form-field-help-text>
            De AI leest het document volledig door, analyseert de opbouw (format, rubrieken, regels)
            en vult de velden hieronder automatisch voor. Ondersteunt .txt, .md, .pdf en .docx.
          </nldd-form-field-help-text>
          <nldd-file-field ref={fileRef} accept={ACCEPT} disabled={busy || disabled || undefined}></nldd-file-field>
        </nldd-form-field>
        {busy && <nldd-activity-indicator size="20" show-text text="Inlezen…"></nldd-activity-indicator>}
        {doneName && (
          <nldd-container layout="row" gap="6" vertical-alignment="center">
            <nldd-icon icon="check-mark" size="16" color="success"></nldd-icon>
            <nldd-text size="xs" weight="medium" color="success">
              Velden voor-ingevuld op basis van &quot;{doneName}&quot;. Controleer en pas aan waar nodig.
            </nldd-text>
          </nldd-container>
        )}

        <nldd-divider></nldd-divider>

        {/* No example? Describe the document; the AI proposes a structure. */}
        {!briefOpen ? (
          <nldd-button
            appearance="accent-transparent"
            size="sm"
            text="Ik heb geen voorbeelddocument, help me aan een structuur"
            disabled={busy || disabled || undefined}
            onClick={() => setBriefOpen(true)}
          ></nldd-button>
        ) : (
          <nldd-container gap="8">
            <nldd-form-field label="Wat voor document moet het worden, en in welk format?">
              <BriefField value={brief} onValue={setBrief} disabled={briefBusy || Boolean(disabled)} />
              <nldd-form-field-help-text>
                De AI stelt een structuur voor op basis van gangbare conventies binnen de overheid. Dat
                is een voorstel uit eigen kennis, geen bestaand sjabloon; loop het dus even na.
              </nldd-form-field-help-text>
            </nldd-form-field>
            <nldd-button-group>
              <nldd-button
                appearance="secondary"
                start-icon="sparkles"
                text="Stel een structuur voor"
                loading={briefBusy || undefined}
                loading-text="Structuur voorstellen…"
                disabled={briefBusy || disabled || !brief.trim() || undefined}
                onClick={() => void handleDescribe()}
              ></nldd-button>
            </nldd-button-group>
            {briefDone && (
              <nldd-container layout="row" gap="6" vertical-alignment="center">
                <nldd-icon icon="check-mark" size="16" color="success"></nldd-icon>
                <nldd-text size="xs" weight="medium" color="success">
                  Structuur voorgesteld en in de velden gezet. Controleer en pas aan waar nodig.
                </nldd-text>
              </nldd-container>
            )}
          </nldd-container>
        )}
      </nldd-container>
    </nldd-box>
  );
}

/** The description field; it mounts when opened, so its binding does too. */
function BriefField({ value, onValue, disabled }: { value: string; onValue: (v: string) => void; disabled: boolean }) {
  const ref = useRef<HTMLElement & { value?: string }>(null);
  useNlddValue(ref, value, onValue);
  return (
    <nldd-multi-line-text-field
      ref={ref}
      rows={3}
      resize="vertical"
      placeholder="Bijv. een projectplan van maximaal 2 A4 met genummerde hoofdstukken, voor een directieteam"
      disabled={disabled || undefined}
    ></nldd-multi-line-text-field>
  );
}
