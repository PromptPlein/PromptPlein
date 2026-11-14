import { useCallback, useEffect, useRef, useState } from 'react';
import clsx from 'clsx';
import toast from 'react-hot-toast';
import { FileText, Loader2, Scissors, Trash2, Upload } from '@/components/common/icons';
import InfoDot from '@/components/common/InfoDot';
import ConfirmDialog from '@/components/common/ConfirmDialog';
import PiiFileDialog, { type PiiFileChoice } from '@/components/chat/PiiFileDialog';
import SourceProcessing from '@/components/chat/SourceProcessing';
import { ACCEPTED_DOC_ACCEPT } from '@/lib/extractDocument';
import { countPii, redactPii, type PiiCount } from '@/services/guardrails';
import {
  addProjectFile,
  deleteProjectFile,
  getProjectPrepareStatus,
  listProjectFiles,
  MAX_PROJECT_FILE_BYTES,
  MAX_PROJECT_FILE_CHARS,
  MAX_PROJECT_FILES,
  onProjectPrepare,
  prepareProjectForBuilder,
  type ProjectPrepareStatus,
} from '@/services/chatProjectService';
import type { ChatProjectFile } from '@/types';

/**
 * De bronbestanden van een project, op de projectpagina zelf: lijst, toevoegen,
 * verwijderen en de stand van het verwerken.
 *
 * Een bestand is meteen definitief: uploaden is de bevestiging. Vóór het
 * versturen zoekt de browser naar persoonsgegevens; wat hier wordt vervangen,
 * komt nooit in de database of bij Mistral.
 */
export default function ProjectFiles({
  projectId,
  fileCount,
  onFilesChanged,
  checkPii = true,
  onFileNames,
  headingClassName,
  disabled,
}: {
  projectId: string;
  /** De telling uit de projectlijst, voor de kop zolang de lijst nog laadt. */
  fileCount: number;
  /** Er is een bestand bij gekomen of verwijderd (voor de telling in de zijbalk). */
  onFilesChanged: () => void;
  /** De controle op persoonsgegevens uit Beheer, AI-instellingen. Standaard aan. */
  checkPii?: boolean;
  /** De namen van de bestanden, zodra ze bekend zijn of veranderen. */
  onFileNames?: (names: string[]) => void;
  headingClassName: string;
  disabled?: boolean;
}) {
  const [files, setFiles] = useState<ChatProjectFile[] | null>(null);
  const [uploading, setUploading] = useState<{ current: number; total: number } | null>(null);
  const [dragging, setDragging] = useState(false);
  const [confirmDeleteFile, setConfirmDeleteFile] = useState<ChatProjectFile | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [piiAsk, setPiiAsk] = useState<{ fileName: string; found: PiiCount[] } | null>(null);
  const piiAnswer = useRef<((choice: PiiFileChoice) => void) | null>(null);

  const num = (n: number) => n.toLocaleString('nl-NL');

  function askPii(fileName: string, found: PiiCount[]): Promise<PiiFileChoice> {
    return new Promise((resolve) => {
      piiAnswer.current = resolve;
      setPiiAsk({ fileName, found });
    });
  }

  const loadFiles = useCallback(() => {
    let active = true;
    setFiles(null);
    listProjectFiles(projectId)
      .then((list) => {
        if (active) setFiles(list);
      })
      .catch(() => {
        if (active) {
          setFiles([]);
          toast.error('De bestanden konden niet worden geladen.');
        }
      });
    return () => {
      active = false;
    };
  }, [projectId]);

  useEffect(() => loadFiles(), [loadFiles]);

  // Vectoren en de analyse voor de bouwer, meteen bij het openen: een eerdere
  // verwerking kan zijn afgebroken. Wat er al staat kost een paar kleine query's,
  // en het loopt los van deze pagina door.
  const hasFiles = (files?.length ?? 0) > 0;
  useEffect(() => {
    if (hasFiles) prepareProjectForBuilder(projectId);
  }, [projectId, hasFiles]);

  const [prepareStatus, setPrepareStatus] = useState<ProjectPrepareStatus | null>(null);
  useEffect(() => {
    setPrepareStatus(getProjectPrepareStatus(projectId));
    return onProjectPrepare((id, status) => {
      if (id === projectId) setPrepareStatus(status);
    });
  }, [projectId]);

  const namesKey = (files ?? []).map((f) => f.name).join('\n');
  useEffect(() => {
    onFileNames?.(namesKey ? namesKey.split('\n') : []);
  }, [namesKey]); // eslint-disable-line react-hooks/exhaustive-deps

  const list = files ?? [];
  const count = files ? files.length : fileCount;
  const full = list.length >= MAX_PROJECT_FILES;

  /** Voegt bestanden één voor één toe, zodat één fout de rest niet tegenhoudt. */
  async function upload(picked: File[]) {
    if (uploading || picked.length === 0 || !files) return;
    const room = MAX_PROJECT_FILES - files.length;
    if (room <= 0) {
      toast.error(`Maximaal ${MAX_PROJECT_FILES} bestanden per project.`);
      return;
    }
    if (picked.length > room) {
      toast.error(`Er passen nog ${room} bestanden in dit project.`);
    }
    const batch = picked.slice(0, room);
    let done = 0;
    setUploading({ current: 1, total: batch.length });
    // Dynamische import: pdfjs en mammoth blijven buiten de startbundel.
    const { extractDocument } = await import('@/lib/extractDocument');
    for (const [index, file] of batch.entries()) {
      setUploading({ current: index + 1, total: batch.length });
      try {
        const doc = await extractDocument(file, MAX_PROJECT_FILE_BYTES);
        let text = doc.text;
        const found = checkPii ? countPii(text) : [];
        if (found.length > 0) {
          const choice = await askPii(doc.name, found);
          if (choice === 'skip') continue;
          if (choice === 'redact') text = redactPii(text);
        }
        const truncated = text.length > MAX_PROJECT_FILE_CHARS;
        const added = await addProjectFile({ projectId, name: doc.name, text, truncated });
        setFiles((cur) => [...(cur ?? []), added]);
        done += 1;
        // Meteen na het eerste bestand: vanaf dan is dit geen leeg project meer.
        if (done === 1) onFilesChanged();
        if (truncated) {
          toast(
            `"${doc.name}" was te groot en is afgekapt op ${num(MAX_PROJECT_FILE_CHARS)} tekens.`,
            { icon: '✂️' },
          );
        }
      } catch (err) {
        toast.error(err instanceof Error ? err.message : `"${file.name}" kon niet worden toegevoegd.`);
      }
    }
    setUploading(null);
    if (done > 1) onFilesChanged();
    if (done > 0) prepareProjectForBuilder(projectId);
    if (done > 0) toast.success(done === 1 ? 'Bestand toegevoegd.' : `${done} bestanden toegevoegd.`);
  }

  async function removeFile(file: ChatProjectFile) {
    try {
      await deleteProjectFile(projectId, file.id);
      setFiles((cur) => (cur ?? []).filter((f) => f.id !== file.id));
      onFilesChanged();
      prepareProjectForBuilder(projectId);
      toast.success(`"${file.name}" verwijderd.`);
    } catch {
      toast.error('Het bestand kon niet worden verwijderd.');
    }
  }

  const totalChars = list.reduce((sum, f) => sum + f.chars, 0);

  return (
    <section>
      <h3 className={`${headingClassName} mb-1`}>
        Bronbestanden
        <span
          aria-label={`${count} bronbestanden`}
          className="ml-1.5 min-w-[1.5rem] rounded-full bg-rijksblauw-700 px-1.5 text-center text-xs font-bold leading-6 text-white dark:bg-rijksblauw-500"
        >
          {count}
        </span>
        <InfoDot
          label="Uitleg over bronbestanden"
          text={`Documenten waar de chats in dit project uit putten. Tot ${MAX_PROJECT_FILES} bestanden van elk ${
            MAX_PROJECT_FILE_BYTES / (1024 * 1024)
          } MB (.txt, .md, .pdf, .docx).\nGebruik je een project drie maanden niet, dan worden de bestanden verwijderd. Je krijgt een week vooraf een mail.`}
        />
      </h3>

      <button
        type="button"
        className={clsx(
          'mt-1 flex min-h-[4rem] w-full items-center justify-center gap-3 rounded-xl border-2 border-dashed px-4 py-3 text-base font-bold text-rijksblauw-700 transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-rijksblauw-500 disabled:cursor-not-allowed disabled:opacity-60 dark:text-white',
          dragging
            ? 'border-rijksblauw-700 bg-rijksblauw-50 dark:bg-rijksblauw-500/15'
            : 'border-rijksblauw-300 hover:border-rijksblauw-500 hover:bg-rijksblauw-50 dark:border-rijksblauw-500 dark:hover:bg-rijksblauw-500/15',
        )}
        onClick={() => fileInputRef.current?.click()}
        onDragOver={(e) => {
          e.preventDefault();
          setDragging(true);
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDragging(false);
          void upload(Array.from(e.dataTransfer.files));
        }}
        disabled={disabled || !files || Boolean(uploading) || full}
      >
        {uploading ? (
          <>
            <Loader2 size={24} className="animate-spin" aria-hidden="true" />
            Bestand {uploading.current} van {uploading.total}
          </>
        ) : (
          <>
            <Upload size={24} aria-hidden="true" />
            {full ? 'Het maximum aantal bestanden is bereikt' : 'Bestanden toevoegen of hierheen slepen'}
          </>
        )}
      </button>
      <input
        ref={fileInputRef}
        type="file"
        multiple
        accept={ACCEPTED_DOC_ACCEPT}
        className="hidden"
        aria-label="Kies bestanden"
        onChange={(e) => {
          void upload(Array.from(e.target.files ?? []));
          e.target.value = '';
        }}
      />

      {!files ? (
        <p className="py-4 text-center text-sm text-slate-500 dark:text-slate-400">Bestanden laden…</p>
      ) : list.length > 0 ? (
        <>
          <ul className="mt-2 space-y-1">
            {list.map((file) => (
              <li
                key={file.id}
                className="flex items-center gap-2 rounded-lg border border-slate-200 px-3 py-2 dark:border-slate-700"
              >
                <FileText size={15} className="shrink-0 text-slate-400" aria-hidden="true" />
                <span className="min-w-0 flex-1 truncate text-sm text-slate-700 dark:text-slate-200" title={file.name}>
                  {file.name}
                </span>
                {file.truncated && (
                  <span
                    className="inline-flex shrink-0 items-center gap-0.5 text-xs text-amber-700 dark:text-amber-400"
                    title="Dit bestand was te groot en is afgekapt."
                  >
                    <Scissors size={11} aria-hidden="true" /> ingekort
                  </span>
                )}
                <span className="hidden shrink-0 text-xs text-slate-500 dark:text-slate-400 sm:inline">
                  {num(file.chars)} tekens
                </span>
                <button
                  type="button"
                  className="shrink-0 rounded-md p-1.5 text-slate-500 transition-colors hover:bg-slate-100 hover:text-rijksrood dark:text-slate-400 dark:hover:bg-slate-700"
                  onClick={() => setConfirmDeleteFile(file)}
                  disabled={disabled || Boolean(uploading)}
                  aria-label={`Verwijder bestand "${file.name}"`}
                >
                  <Trash2 size={14} />
                </button>
              </li>
            ))}
          </ul>
          <p className="mt-2 text-xs text-slate-500 dark:text-slate-400">
            Samen {num(totalChars)} tekens bronmateriaal.
          </p>
          <SourceProcessing status={prepareStatus} onRetry={() => prepareProjectForBuilder(projectId)} />
        </>
      ) : null}

      {piiAsk && (
        <PiiFileDialog
          fileName={piiAsk.fileName}
          found={piiAsk.found}
          onChoose={(choice) => {
            setPiiAsk(null);
            piiAnswer.current?.(choice);
            piiAnswer.current = null;
          }}
        />
      )}

      <ConfirmDialog
        open={confirmDeleteFile !== null}
        title="Bestand verwijderen?"
        message={`"${confirmDeleteFile?.name ?? ''}" wordt uit dit project verwijderd. Nieuwe chats kunnen er dan niet meer uit putten.`}
        confirmLabel="Verwijderen"
        destructive
        onConfirm={() => {
          if (confirmDeleteFile) void removeFile(confirmDeleteFile);
        }}
        onClose={() => setConfirmDeleteFile(null)}
      />
    </section>
  );
}
