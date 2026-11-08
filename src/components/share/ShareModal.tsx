import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { QRCodeSVG } from 'qrcode.react';
import { notify } from '@/lib/notify';
import { useNlddEvent } from '@/lib/nldd';
import { buildMailto, createShareLink, shareUrl } from '@/services/shareService';
import { copyToClipboard, getCurrentUser } from '@/lib/utils';
import { brand } from '@/config/brandColors';
import type { Prompt } from '@/types';
import '@nldd/design-system/activity-indicator';
import '@nldd/design-system/button';
import '@nldd/design-system/card';
import '@nldd/design-system/container';
import '@nldd/design-system/form-field';
import '@nldd/design-system/icon-button';
import '@nldd/design-system/page';
import '@nldd/design-system/sheet';
import '@nldd/design-system/simple-section';
import '@nldd/design-system/text';
import '@nldd/design-system/text-field';
import '@nldd/design-system/top-title-bar';

interface ShareModalProps {
  open: boolean;
  onClose: () => void;
  prompt: Prompt;
}

const TITLE = 'Deel via e-mail of link';

/**
 * A sheet with a share link for one prompt: a QR code, the link to copy and a
 * button that opens an e-mail. The sheet stays mounted and `open` drives it.
 */
export default function ShareModal({ open, onClose, prompt }: ShareModalProps) {
  const [url, setUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [copied, setCopied] = useState(false);
  const sheetRef = useRef<HTMLElement>(null);
  useNlddEvent(sheetRef, 'close', () => {
    if (open) onClose();
  });

  // Create a share link as soon as the sheet opens.
  useEffect(() => {
    if (!open) {
      setUrl(null);
      return;
    }
    let active = true;
    setLoading(true);
    createShareLink(prompt.id, getCurrentUser())
      .then((share) => active && setUrl(shareUrl(share.share_token)))
      .catch(() => active && notify.error('Kon geen deel-link maken'))
      .finally(() => active && setLoading(false));
    return () => {
      active = false;
    };
  }, [open, prompt.id]);

  async function copyLink() {
    if (!url) return;
    await copyToClipboard(url);
    setCopied(true);
    notify.success('Link gekopieerd');
    setTimeout(() => setCopied(false), 1500);
  }

  return createPortal(
    <nldd-sheet ref={sheetRef} open={open || undefined} placement="right" width="480px">
      <nldd-page landmarks="region" accessible-label={TITLE}>
        <nldd-top-title-bar slot="header" text={TITLE} heading-level={2} dismiss-text="Sluit"></nldd-top-title-bar>
        <nldd-simple-section>
          {loading || !url ? (
            <nldd-container min-height="192px">
              <nldd-activity-indicator size="32" text="Deel-link maken"></nldd-activity-indicator>
            </nldd-container>
          ) : (
            <nldd-container layout="stack" gap="20">
              <nldd-container layout="stack" gap="8" horizontal-alignment="center">
                <nldd-card>
                  <nldd-container padding="12">
                    {/* qrcode.react draws its own svg; the module color comes from a token. */}
                    <QRCodeSVG value={url} size={160} fgColor={brand.primary} />
                  </nldd-container>
                </nldd-card>
                <nldd-text size="xs" color="secondary">
                  Scan om de prompt te openen
                </nldd-text>
              </nldd-container>

              <nldd-form-field label="Deelbare link">
                <nldd-text-field readonly value={url}>
                  <nldd-icon-button
                    slot="button"
                    icon={copied ? 'check-mark' : 'copy'}
                    accessible-label={copied ? 'Link gekopieerd' : 'Kopieer link'}
                    onClick={copyLink}
                  ></nldd-icon-button>
                </nldd-text-field>
              </nldd-form-field>

              <nldd-button
                appearance="primary"
                width="full"
                start-icon="envelope"
                text="Stuur via e-mail"
                href={buildMailto(prompt.title, url, getCurrentUser())}
              ></nldd-button>

              <nldd-text size="xs" color="secondary" horizontal-alignment="center">
                Weergaven van deze link worden geteld in de analytics.
              </nldd-text>
            </nldd-container>
          )}
        </nldd-simple-section>
      </nldd-page>
    </nldd-sheet>,
    document.body,
  );
}
