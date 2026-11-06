import { useState } from 'react';
import { FolderCheck } from '@/components/common/icons';
import { Link } from 'react-router-dom';
import Modal from '@/components/common/Modal';
import SavePromptPanel from '@/components/prompts/SavePromptPanel';
import type { Prompt } from '@/types';

interface SavePromptModalProps {
  open: boolean;
  /** De prompt-inhoud die wordt opgeslagen (bijv. een chatbericht). */
  content: string;
  onClose: () => void;
}

/**
 * "Bewaar als prompt" vanuit de chat: hetzelfde opslagformulier als in de
 * generator (SavePromptPanel), in een modal. Na het opslaan blijft de modal
 * open met een bevestiging en een link naar de bibliotheek.
 */
export default function SavePromptModal({ open, content, onClose }: SavePromptModalProps) {
  const [saved, setSaved] = useState<Prompt | null>(null);

  function close() {
    setSaved(null);
    onClose();
  }

  return (
    <Modal open={open} onClose={close} title="Bewaar als prompt" size="max-w-lg">
      {saved ? (
        <div className="space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800 dark:border-emerald-500/30 dark:bg-emerald-500/15 dark:text-emerald-300">
            <span className="inline-flex items-center gap-2">
              <FolderCheck size={16} /> Opgeslagen als herbruikbare prompt.
            </span>
            <Link
              to={`/prompt/${saved.id}`}
              className="font-medium underline underline-offset-2 hover:no-underline"
              onClick={close}
            >
              Bekijk in de bibliotheek
            </Link>
          </div>
          <div className="flex justify-end">
            <button type="button" className="opl-btn-secondary" onClick={close}>
              Sluiten
            </button>
          </div>
        </div>
      ) : (
        <SavePromptPanel content={content} onSaved={setSaved} onCancel={close} frameless />
      )}
    </Modal>
  );
}
