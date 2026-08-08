import { useCallback, useEffect, useRef, useState } from 'react';
import { FileText, Loader2, Scissors, Trash2, Upload } from 'lucide-react';
import toast from 'react-hot-toast';
import Modal from '@/components/common/Modal';
import ConfirmDialog from '@/components/common/ConfirmDialog';
import { ACCEPTED_DOC_ACCEPT } from '@/lib/extractDocument';
import {
  addProjectFile,
  deleteProjectFile,
  listProjectFiles,
  MAX_PROJECT_FILES,
  MAX_PROJECT_FILE_CHARS,
  MAX_PROJECT_INSTRUCTIONS_CHARS,
  MAX_PROJECT_NAME_CHARS,
} from '@/services/chatProjectService';
import type { ChatProject, ChatProjectFile } from '@/types';

/**
 * Projectinstellingen: de naam, de projectinstructie en de bronbestanden.
 *
 * Dit is het hart van een project. De projectinstructie is wat élk gesprek in dit
 * project stuurt, en de bestanden zijn wat de assistent altijd bij de hand
 * heeft. Beide staan daarom in één scherm: wie zijn instructie aanpast, wil
 * meestal in dezelfde beweging zien wélke bronnen die instructie bedient.
 *
 * De instructie wordt pas op "opslaan" bewaard (een halfgeschreven instructie
 * moet geen gesprekken sturen); een bestand daarentegen is meteen definitief —
 * uploaden IS de bevestiging.
 */
export default function ProjectSettingsModal({
  open,
  project,
  onClose,
  onSave,
  onFilesChanged,
}: {
  open: boolean;
  project: ChatProject | null;
  onClose: () => void;
  /** Bewaart naam + instructie; geeft false terug als het misging. */
  onSave: (patch: { name: string; instructions: string }) => Promise<boolean>;
  /** Er is een bestand bij gekomen of verwijderd (voor de telling in de zijbalk). */
  onFilesChanged: () => void;
}) {
  const [name, setName] = useState('');
  const [instructions, setInstructions] = useState('');
  const [saving, setSaving] = useState(false);
  const [files, setFiles] = useState<ChatProjectFile[]>([]);
  const [loadingFiles, setLoadingFiles] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [confirmDeleteFile, setConfirmDeleteFile] = useState<ChatProjectFile | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const num = (n: number) => n.toLocaleString('nl-NL');
  const projectId = project?.id ?? null;

  // Het formulier volgt het geopende project, niet andersom: pas bij het openen
  // (of bij een ander project) worden de velden gevuld, zodat wat de gebruiker
  // intypt niet halverwege wordt overschreven door een verse lijst uit de zijbalk.
  useEffect(() => {
    if (!open || !project) return;
    setName(project.name);
    setInstructions(project.instructions);
  }, [open, project?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  const loadFiles = useCallback(() => {
    if (!projectId) return;
    let active = true;
    setLoadingFiles(true);
    listProjectFiles(projectId)
      .then((list) => {
        if (active) setFiles(list);
      })
      .catch(() => {
        if (active) toast.error('De bestanden konden niet worden geladen.');
      })
      .finally(() => {
        if (active) setLoadingFiles(false);
      });
    return () => {
      active = false;
    };
  }, [projectId]);

  useEffect(() => {
    if (!open || !projectId) return;
    return loadFiles();
  }, [open, projectId, loadFiles]);

  async function save() {
    if (!project || saving) return;
    const trimmed = name.trim();
    if (!trimmed) {
      toast.error('Geef het project een naam.');
      return;
    }
    setSaving(true);
    const ok = await onSave({ name: trimmed, instructions });
    setSaving(false);
    if (ok) {
      toast.success('Project opgeslagen.');
      onClose();
    }
  }

  async function upload(file: File) {
    if (!projectId || uploading) return;
    if (files.length >= MAX_PROJECT_FILES) {
      toast.error(`Maximaal ${MAX_PROJECT_FILES} bestanden per project.`);
      return;
    }
    setUploading(true);
    try {
      // Dynamische import: pdfjs/mammoth blijven buiten de startbundel.
      const { extractDocument } = await import('@/lib/extractDocument');
      const doc = await extractDocument(file);
      const truncated = doc.text.length > MAX_PROJECT_FILE_CHARS;
      const added = await addProjectFile({
        projectId,
        name: doc.name,
        text: doc.text,
        truncated,
      });
      setFiles((cur) => [...cur, added]);
      onFilesChanged();
      if (truncated) {
        toast(
          `"${doc.name}" was te groot en is afgekapt op ${num(MAX_PROJECT_FILE_CHARS)} tekens.`,
          { icon: '✂️' },
        );
      } else {
        toast.success(`"${doc.name}" toegevoegd (${num(added.chars)} tekens).`);
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Het bestand kon niet worden toegevoegd.');
    } finally {
      setUploading(false);
    }
  }

  async function removeFile(file: ChatProjectFile) {
    if (!projectId) return;
    try {
      await deleteProjectFile(projectId, file.id);
      setFiles((cur) => cur.filter((f) => f.id !== file.id));
      onFilesChanged();
      toast.success(`"${file.name}" verwijderd.`);
    } catch {
      toast.error('Het bestand kon niet worden verwijderd.');
    }
  }

  const totalChars = files.reduce((sum, f) => sum + f.chars, 0);

  return (
    <>
      <Modal open={open} onClose={onClose} title="Projectinstellingen" size="max-w-2xl">
        <div className="space-y-6">
          <div>
            <label
              className="mb-1.5 block text-sm font-medium text-slate-700 dark:text-slate-300"
              htmlFor="project-name"
            >
              Naam
            </label>
            <input
              id="project-name"
              className="opl-input w-full"
              value={name}
              maxLength={MAX_PROJECT_NAME_CHARS}
              onChange={(e) => setName(e.target.value)}
              placeholder="Bijvoorbeeld: Merkstem, Verkoopmails, Kwartaalrapport"
            />
          </div>

          <div>
            <label
              className="mb-1.5 block text-sm font-medium text-slate-700 dark:text-slate-300"
              htmlFor="project-instructions"
            >
              Projectinstructie
            </label>
            <p className="mb-2 text-xs text-slate-500 dark:text-slate-400">
              Deze instructie geldt voor elk gesprek in dit project. Beschrijf wie de assistent is,
              hoe hij moet antwoorden en welk eindproduct eruit moet komen.
            </p>
            <textarea
              id="project-instructions"
              className="opl-input min-h-[10rem] w-full resize-y font-normal"
              value={instructions}
              maxLength={MAX_PROJECT_INSTRUCTIONS_CHARS}
              onChange={(e) => setInstructions(e.target.value)}
              placeholder="Je bent de tekstschrijver van ons merk. Schrijf altijd in de wij-vorm, kort en concreet. Lever elke tekst als: titel, drie alinea's, afsluitende oproep."
            />
            <p className="mt-1 text-right text-[11px] text-slate-400 dark:text-slate-500">
              {num(instructions.length)} van {num(MAX_PROJECT_INSTRUCTIONS_CHARS)} tekens
            </p>
          </div>

          <div>
            <div className="mb-2 flex items-center justify-between gap-3">
              <div>
                <h3 className="text-sm font-medium text-slate-700 dark:text-slate-300">
                  Bronbestanden
                </h3>
                <p className="text-xs text-slate-500 dark:text-slate-400">
                  Maximaal {MAX_PROJECT_FILES} bestanden (.txt, .md, .pdf, .docx). De assistent leest
                  ze in elk gesprek van dit project mee.
                </p>
              </div>
              <button
                type="button"
                className="opl-btn-secondary shrink-0"
                onClick={() => fileInputRef.current?.click()}
                disabled={uploading || files.length >= MAX_PROJECT_FILES}
              >
                {uploading ? <Loader2 size={15} className="animate-spin" /> : <Upload size={15} />}
                Bestand toevoegen
              </button>
              <input
                ref={fileInputRef}
                type="file"
                accept={ACCEPTED_DOC_ACCEPT}
                className="hidden"
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  if (file) void upload(file);
                  e.target.value = '';
                }}
              />
            </div>

            {loadingFiles ? (
              <p className="py-4 text-center text-xs text-slate-400">Bestanden laden…</p>
            ) : files.length === 0 ? (
              <p className="rounded-lg border border-dashed border-slate-300 px-4 py-6 text-center text-xs text-slate-400 dark:border-slate-600 dark:text-slate-500">
                Nog geen bronbestanden. Upload er een om de assistent er in elk gesprek uit te laten
                putten.
              </p>
            ) : (
              <ul className="space-y-1">
                {files.map((file) => (
                  <li
                    key={file.id}
                    className="group flex items-center gap-2 rounded-lg border border-slate-200 px-3 py-2 dark:border-slate-700"
                  >
                    <FileText size={15} className="shrink-0 text-slate-400" />
                    <span className="min-w-0 flex-1 truncate text-sm text-slate-700 dark:text-slate-200">
                      {file.name}
                    </span>
                    {file.truncated && (
                      <span
                        className="inline-flex shrink-0 items-center gap-0.5 text-[11px] text-amber-600 dark:text-amber-400"
                        title="Dit bestand was te groot en is afgekapt."
                      >
                        <Scissors size={11} /> ingekort
                      </span>
                    )}
                    <span className="shrink-0 text-[11px] text-slate-400 dark:text-slate-500">
                      {num(file.chars)} tekens
                    </span>
                    <button
                      type="button"
                      className="shrink-0 rounded-md p-1.5 text-slate-400 transition-colors hover:bg-slate-100 hover:text-rijksrood dark:hover:bg-slate-700"
                      onClick={() => setConfirmDeleteFile(file)}
                      aria-label={`Verwijder bestand "${file.name}"`}
                    >
                      <Trash2 size={14} />
                    </button>
                  </li>
                ))}
              </ul>
            )}

            {files.length > 0 && (
              <p className="mt-2 text-[11px] text-slate-400 dark:text-slate-500">
                Samen {num(totalChars)} tekens bronmateriaal.
              </p>
            )}
          </div>

          <div className="flex justify-end gap-2 border-t border-slate-200 pt-4 dark:border-slate-700">
            <button type="button" className="opl-btn-secondary" onClick={onClose}>
              Annuleren
            </button>
            <button
              type="button"
              className="opl-btn-primary"
              onClick={() => void save()}
              disabled={saving}
            >
              {saving && <Loader2 size={15} className="animate-spin" />}
              Opslaan
            </button>
          </div>
        </div>
      </Modal>

      <ConfirmDialog
        open={confirmDeleteFile !== null}
        title="Bestand verwijderen?"
        message={`"${confirmDeleteFile?.name ?? ''}" wordt uit dit project verwijderd. Nieuwe gesprekken kunnen er dan niet meer uit putten.`}
        confirmLabel="Verwijderen"
        destructive
        onConfirm={() => {
          if (confirmDeleteFile) void removeFile(confirmDeleteFile);
        }}
        onClose={() => setConfirmDeleteFile(null)}
      />
    </>
  );
}
