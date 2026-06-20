import { useEffect, useState } from 'react';
import { QRCodeSVG } from 'qrcode.react';
import { Copy, Check, Mail, Loader2 } from 'lucide-react';
import toast from 'react-hot-toast';
import Modal from '@/components/common/Modal';
import { buildMailto, createShareLink, shareUrl } from '@/services/shareService';
import { copyToClipboard, getCurrentUser } from '@/lib/utils';
import { brand } from '@/config/brandColors';
import type { Prompt } from '@/types';

interface ShareModalProps {
  open: boolean;
  onClose: () => void;
  prompt: Prompt;
}

export default function ShareModal({ open, onClose, prompt }: ShareModalProps) {
  const [url, setUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [copied, setCopied] = useState(false);

  // Genereer een deel-link zodra de modal opent.
  useEffect(() => {
    if (!open) {
      setUrl(null);
      return;
    }
    let active = true;
    setLoading(true);
    createShareLink(prompt.id, getCurrentUser())
      .then((share) => active && setUrl(shareUrl(share.share_token)))
      .catch(() => active && toast.error('Kon geen deel-link maken'))
      .finally(() => active && setLoading(false));
    return () => {
      active = false;
    };
  }, [open, prompt.id]);

  async function copyLink() {
    if (!url) return;
    await copyToClipboard(url);
    setCopied(true);
    toast.success('Link gekopieerd');
    setTimeout(() => setCopied(false), 1500);
  }

  return (
    <Modal open={open} onClose={onClose} title="Deel via e-mail of link" size="max-w-md">
      {loading || !url ? (
        <div className="flex h-48 items-center justify-center text-slate-400 dark:text-slate-500">
          <Loader2 className="animate-spin" />
        </div>
      ) : (
        <div className="space-y-5">
          <div className="flex flex-col items-center">
            <div className="rounded-xl border border-slate-200 bg-white p-3 dark:border-slate-700 dark:bg-slate-800">
              <QRCodeSVG value={url} size={160} fgColor={brand.primary} />
            </div>
            <p className="mt-2 text-xs text-slate-400 dark:text-slate-500">Scan om de prompt te openen</p>
          </div>

          <div>
            <label className="opl-label">Deelbare link</label>
            <div className="flex gap-2">
              <input readOnly className="opl-input font-mono text-xs" value={url} onFocus={(e) => e.target.select()} />
              <button className="opl-btn-secondary shrink-0" onClick={copyLink}>
                {copied ? <Check size={16} className="text-rijksgroen" /> : <Copy size={16} />}
              </button>
            </div>
          </div>

          <a
            href={buildMailto(prompt.title, url, getCurrentUser())}
            className="opl-btn-primary w-full"
          >
            <Mail size={16} /> Stuur via e-mail
          </a>

          <p className="text-center text-xs text-slate-400 dark:text-slate-500">
            Weergaven van deze link worden geteld in de analytics.
          </p>
        </div>
      )}
    </Modal>
  );
}
