import Modal from '@/components/common/Modal';
import PromptUploadForm from './PromptUploadForm';
import type { Prompt } from '@/types';

interface UploadModalProps {
  open: boolean;
  onClose: () => void;
  onCreated: (prompt: Prompt) => void;
}

export default function UploadModal({ open, onClose, onCreated }: UploadModalProps) {
  return (
    <Modal open={open} onClose={onClose} title="Nieuwe prompt uploaden" size="max-w-2xl">
      <PromptUploadForm
        onCancel={onClose}
        onCreated={(prompt) => {
          onCreated(prompt);
          onClose();
        }}
      />
    </Modal>
  );
}
