import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import Modal from '@/components/common/Modal';
import SavePromptPanel from '@/components/prompts/SavePromptPanel';
import type { Prompt } from '@/types';
import '@nldd/design-system/banner';
import '@nldd/design-system/button';
import '@nldd/design-system/button-group';
import '@nldd/design-system/container';

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
  const navigate = useNavigate();

  function close() {
    setSaved(null);
    onClose();
  }

  return (
    <Modal open={open} onClose={close} title="Bewaar als prompt" size="max-w-lg">
      {saved ? (
        <nldd-container gap="16">
          <nldd-banner variant="success" text="Opgeslagen als herbruikbare prompt.">
            <nldd-button
              slot="actions"
              appearance="secondary"
              text="Bekijk in de bibliotheek"
              href={`/prompt/${saved.id}`}
              onClick={(e) => {
                e.preventDefault();
                close();
                navigate(`/prompt/${saved.id}`);
              }}
            ></nldd-button>
          </nldd-banner>
          <nldd-button-group>
            <nldd-button appearance="secondary" text="Sluiten" onClick={close}></nldd-button>
          </nldd-button-group>
        </nldd-container>
      ) : (
        <SavePromptPanel content={content} onSaved={setSaved} onCancel={close} frameless />
      )}
    </Modal>
  );
}
