import { FileText, FileType2, FileCode2, FileJson, Hash } from 'lucide-react';
import toast from 'react-hot-toast';
import Modal from '@/components/common/Modal';
import { exportPrompt, type ExportFormat, type ExportMeta } from '@/services/exportService';
import type { Prompt } from '@/types';

const FORMATS: {
  id: ExportFormat;
  label: string;
  hint: string;
  icon: typeof FileText;
}[] = [
  { id: 'pdf', label: 'PDF', hint: 'Opent printvenster — opslaan als PDF', icon: FileText },
  { id: 'word', label: 'Word (.doc)', hint: 'Opent in Microsoft Word', icon: FileType2 },
  { id: 'html', label: 'HTML', hint: 'Opgemaakt webdocument', icon: FileCode2 },
  { id: 'markdown', label: 'Markdown', hint: 'Platte tekst met opmaak', icon: Hash },
  { id: 'json', label: 'JSON', hint: 'Ruwe gegevens', icon: FileJson },
];

export default function ExportModal({
  open,
  onClose,
  prompt,
  meta,
}: {
  open: boolean;
  onClose: () => void;
  prompt: Prompt;
  meta?: ExportMeta;
}) {
  function handle(format: ExportFormat) {
    try {
      exportPrompt(prompt, format, meta);
      if (format !== 'pdf') toast.success('Export gestart');
      onClose();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Export mislukt');
    }
  }

  return (
    <Modal open={open} onClose={onClose} title="Exporteren" size="max-w-md">
      <p className="mb-4 text-sm text-slate-500">
        Kies een formaat. Het document krijgt een overheidsconforme kop met rubricering.
      </p>
      <div className="grid grid-cols-1 gap-2">
        {FORMATS.map(({ id, label, hint, icon: Icon }) => (
          <button
            key={id}
            onClick={() => handle(id)}
            className="flex items-center gap-3 rounded-xl border border-slate-200 px-4 py-3 text-left transition-colors hover:border-rijksblauw-300 hover:bg-rijksblauw-50"
          >
            <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-rijksblauw-50 text-rijksblauw-600">
              <Icon size={18} />
            </span>
            <span>
              <span className="block text-sm font-medium text-slate-800">{label}</span>
              <span className="block text-xs text-slate-400">{hint}</span>
            </span>
          </button>
        ))}
      </div>
    </Modal>
  );
}
