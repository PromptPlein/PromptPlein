import { useCallback, useEffect, useRef, useState } from 'react';
import { FileText, Loader2, RotateCcw, Scissors, Sparkles, Trash2, Upload } from '@/components/common/icons';
import clsx from 'clsx';
import toast from 'react-hot-toast';
import Modal from '@/components/common/Modal';
import ConfirmDialog from '@/components/common/ConfirmDialog';
import { ACCEPTED_DOC_ACCEPT } from '@/lib/extractDocument';
import { countPii, redactPii, type PiiCount } from '@/services/guardrails';
import PiiFileDialog, { type PiiFileChoice } from '@/components/chat/PiiFileDialog';
import { optimizeProjectInstructions } from '@/services/chatService';
import type { ChatSettings } from '@/services/settingsService';
import {
  addProjectFile,
  deleteProjectFile,
  indexProject,
  listProjectFiles,
  markProjectUsed,
  MAX_PROJECT_CONTEXT_CHARS,
  MAX_PROJECT_FILES,
  MAX_PROJECT_FILE_BYTES,
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
  chatSettings,
  checkPii = true,
}: {
  open: boolean;
  project: ChatProject | null;
  onClose: () => void;
  /** Bewaart naam + instructie; geeft false terug als het misging. */
  onSave: (patch: { name: string; instructions: string }) => Promise<boolean>;
  /** Er is een bestand bij gekomen of verwijderd (voor de telling in de zijbalk). */
  onFilesChanged: () => void;
  /**
   * De AI-instellingen van de beheerder. Ontbreken ze (nog niet geladen), of
   * staat de verbeterslag uit, dan blijft het sterretje bij de instructie weg —
   * de rest van het scherm werkt gewoon.
   */
  chatSettings?: ChatSettings | null;
  /** De controle op persoonsgegevens uit Beheer, AI-instellingen. Standaard aan. */
  checkPii?: boolean;
}) {
  const [name, setName] = useState('');
  const [instructions, setInstructions] = useState('');
  const [saving, setSaving] = useState(false);
  const [optimizing, setOptimizing] = useState(false);
  // De instructie van vóór de laatste verbetering, met wat eruit kwam. Zolang
  // het veld nog exact het resultaat bevat, kan de gebruiker terug.
  const [beforeOptimize, setBeforeOptimize] = useState<{ before: string; after: string } | null>(
    null,
  );
  const [files, setFiles] = useState<ChatProjectFile[]>([]);
  const [loadingFiles, setLoadingFiles] = useState(false);
  const [uploading, setUploading] = useState<{ current: number; total: number } | null>(null);
  /** Stukken die nog doorzoekbaar moeten worden; 0 is klaar. */
  const [indexRemaining, setIndexRemaining] = useState(0);
  const [dragging, setDragging] = useState(false);
  const [confirmDeleteFile, setConfirmDeleteFile] = useState<ChatProjectFile | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  // De vraag over persoonsgegevens voor het bestand dat nu aan de beurt is.
  const [piiAsk, setPiiAsk] = useState<{ fileName: string; found: PiiCount[] } | null>(null);
  const piiAnswer = useRef<((choice: PiiFileChoice) => void) | null>(null);

  function askPii(fileName: string, found: PiiCount[]): Promise<PiiFileChoice> {
    return new Promise((resolve) => {
      piiAnswer.current = resolve;
      setPiiAsk({ fileName, found });
    });
  }

  const num = (n: number) => n.toLocaleString('nl-NL');
  const projectId = project?.id ?? null;

  // Het formulier volgt het geopende project, niet andersom: pas bij het openen
  // (of bij een ander project) worden de velden gevuld, zodat wat de gebruiker
  // intypt niet halverwege wordt overschreven door een verse lijst uit de zijbalk.
  useEffect(() => {
    if (!open || !project) return;
    setName(project.name);
    setInstructions(project.instructions);
    // Terugdraaien hoort bij de instructie die je vóór je hebt: een ander
    // project (of opnieuw openen) begint met een schone lei.
    setBeforeOptimize(null);
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

  // Openen telt als gebruik, voor de bewaartermijn.
  useEffect(() => {
    if (open && projectId) markProjectUsed(projectId);
  }, [open, projectId]);

  // Vectoren alleen voor een project dat te groot is om heel mee te gaan: een
  // klein project zoekt nooit, dus dan hoeft de tekst daarvoor niet naar Mistral.
  // Ook bij openen, want een eerdere verwerking kan zijn afgebroken.
  const filesChars = files.reduce((sum, f) => sum + f.chars, 0);
  const needsIndex = filesChars > MAX_PROJECT_CONTEXT_CHARS;
  useEffect(() => {
    if (open && projectId && needsIndex) void indexProject(projectId, setIndexRemaining);
    // files.length erbij: een nieuw bestand in een groot project heeft ook vectoren nodig.
  }, [open, projectId, needsIndex, files.length]);

  // --- Het oranje sterretje: van ruwe instructie naar systeemprompt ---
  // Bewust een zwaardere slag dan het sterretje in de chat: daar wordt één
  // bericht scherper, hier wordt een instructie herschreven die élk gesprek in
  // dit project stuurt. Het resultaat vervangt het veld maar wordt níét
  // opgeslagen — de gebruiker leest het eerst na en drukt zelf op "Opslaan".
  const canOptimize =
    Boolean(chatSettings?.projectOptimizeEnabled) && !saving && instructions.trim().length > 0;
  const canUndoOptimize =
    beforeOptimize !== null && instructions === beforeOptimize.after && !optimizing;

  async function optimize() {
    if (!canOptimize || optimizing || !chatSettings) return;
    const before = instructions;
    setOptimizing(true);
    try {
      const result = await optimizeProjectInstructions({
        instructions: before,
        projectName: name.trim(),
        fileNames: files.map((f) => f.name),
        settings: chatSettings,
      });
      if (result.error) {
        toast.error(result.error);
        return;
      }
      if (!result.changed || !result.text.trim()) {
        toast('Je instructie was al compleet genoeg.', { icon: '✨' });
        return;
      }
      setInstructions(result.text);
      setBeforeOptimize({ before, after: result.text });
      toast.success('Instructie herschreven. Lees hem na en sla op als hij klopt.');
    } finally {
      setOptimizing(false);
    }
  }

  function undoOptimize() {
    if (!canUndoOptimize || !beforeOptimize) return;
    setInstructions(beforeOptimize.before);
    setBeforeOptimize(null);
  }

  async function save() {
    if (!project || saving || optimizing) return;
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

  /** Voegt bestanden één voor één toe, zodat één fout de rest niet tegenhoudt. */
  async function upload(list: File[]) {
    if (!projectId || uploading || list.length === 0) return;
    const room = MAX_PROJECT_FILES - files.length;
    if (room <= 0) {
      toast.error(`Maximaal ${MAX_PROJECT_FILES} bestanden per project.`);
      return;
    }
    if (list.length > room) {
      toast.error(`Er passen nog ${room} bestanden in dit project.`);
    }
    const batch = list.slice(0, room);
    let done = 0;
    setUploading({ current: 1, total: batch.length });
    // Dynamische import: pdfjs/mammoth blijven buiten de startbundel.
    const { extractDocument } = await import('@/lib/extractDocument');
    for (const [index, file] of batch.entries()) {
      setUploading({ current: index + 1, total: batch.length });
      try {
        const doc = await extractDocument(file, MAX_PROJECT_FILE_BYTES);
        // Controle vóór het versturen: wat hier wordt vervangen, komt nooit in de
        // database of bij Mistral.
        let text = doc.text;
        const found = checkPii ? countPii(text) : [];
        if (found.length > 0) {
          const choice = await askPii(doc.name, found);
          if (choice === 'skip') continue;
          if (choice === 'redact') text = redactPii(text);
        }
        const truncated = text.length > MAX_PROJECT_FILE_CHARS;
        const added = await addProjectFile({
          projectId,
          name: doc.name,
          text,
          truncated,
        });
        setFiles((cur) => [...cur, added]);
        done += 1;
        // Meteen na het eerste bestand: vanaf dan is dit geen leeg project meer
        // en mag het bij annuleren niet worden opgeruimd.
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
    if (done > 0) toast.success(done === 1 ? 'Bestand toegevoegd.' : `${done} bestanden toegevoegd.`);
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

  const totalChars = filesChars;

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
              Deze instructie geldt voor elke chat in dit project. Beschrijf wie de assistent is,
              hoe hij moet antwoorden en welk eindproduct eruit moet komen.
            </p>
            <div className="relative">
              <textarea
                id="project-instructions"
                // pb-12: houdt de onderste regel vrij van het sterretje. Zonder
                // die ruimte schuift de laatste zin er precies achter zodra de
                // gebruiker naar beneden typt — juist waar zijn cursor staat.
                className="opl-input min-h-[10rem] w-full resize-y pb-12 font-normal"
                value={instructions}
                maxLength={MAX_PROJECT_INSTRUCTIONS_CHARS}
                onChange={(e) => setInstructions(e.target.value)}
                placeholder="Je bent de tekstschrijver van ons merk. Schrijf altijd in de wij-vorm, kort en concreet. Lever elke tekst als: titel, drie alinea's, afsluitende oproep."
              />
              {/* Sterretje rechtsonder: schrijft de instructie om tot een volwaardige
                  systeemprompt. Verschijnt pas zodra er tekst staat, zodat een leeg
                  veld rustig blijft — hetzelfde gebaar als in de chat, maar met een
                  veel zwaardere slag erachter (zie PROJECTINSTRUCTIE_Framework.md). */}
              {chatSettings?.projectOptimizeEnabled &&
                (instructions.trim().length > 0 || optimizing) && (
                  <button
                    type="button"
                    className={clsx(
                      // Rechtsonder, maar niet in de hoek: daar zitten de rand, de
                      // schuifbalk (± 16px) en het sleepgreepje van resize-y al.
                      // 22px legt de knop er net naast met een paar pixels lucht,
                      // zodat het greepje bruikbaar blijft en de knop niet tegen
                      // de grijze baan van de schuifbalk aan plakt.
                      'absolute bottom-2.5 right-[22px] flex h-8 w-8 items-center justify-center rounded-lg',
                      'bg-rijksoranje text-white',
                      // Een ringetje in de veldkleur licht de knop van de tekst
                      // eronder: zonder die scheiding loopt hij vast aan de regel
                      // waar hij toevallig overheen valt.
                      'shadow-sm ring-2 ring-white dark:ring-slate-800',
                      'transition-all duration-200 focus:outline-none focus:ring-rijksoranje/40',
                      canOptimize && !optimizing
                        ? 'hover:shadow-md motion-safe:hover:-translate-y-px'
                        : 'cursor-default opacity-60',
                    )}
                    onClick={() => void optimize()}
                    disabled={!canOptimize || optimizing}
                    title={
                      optimizing
                        ? 'Bezig met omschrijven…'
                        : 'Schrijf mijn instructie om tot een volledige systeemprompt; je oorspronkelijke tekst kun je daarna terughalen'
                    }
                    aria-label="Schrijf mijn projectinstructie om met AI"
                  >
                    {optimizing ? (
                      <Loader2 size={15} className="animate-spin" />
                    ) : (
                      <Sparkles size={15} strokeWidth={2.25} />
                    )}
                  </button>
                )}
            </div>
            <div className="mt-1 flex items-center justify-between gap-3">
              {canUndoOptimize ? (
                <button
                  type="button"
                  className="inline-flex items-center gap-1 text-[0.6875rem] font-medium text-slate-500 hover:text-rijksblauw-600 hover:underline dark:text-slate-400 dark:hover:text-rijksblauw-300"
                  onClick={undoOptimize}
                >
                  <RotateCcw size={12} /> Herstel mijn eigen tekst
                </button>
              ) : (
                <span />
              )}
              <p className="text-[0.6875rem] text-slate-400 dark:text-slate-500">
                {num(instructions.length)} van {num(MAX_PROJECT_INSTRUCTIONS_CHARS)} tekens
              </p>
            </div>
          </div>

          <div>
            <div className="mb-2">
              <h3 className="text-sm font-medium text-slate-700 dark:text-slate-300">
                Bronbestanden
              </h3>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                Tot {MAX_PROJECT_FILES} bestanden van elk {MAX_PROJECT_FILE_BYTES / (1024 * 1024)} MB
                (.txt, .md, .pdf, .docx). Gebruik je een project drie maanden niet, dan worden
                de bestanden verwijderd. Je krijgt een week vooraf een mail. Het project blijft staan.
              </p>
            </div>
            <button
              type="button"
              className={clsx(
                'mb-2 flex min-h-[4.5rem] w-full items-center justify-center gap-3 rounded-xl border-2 border-dashed px-4 py-3 text-base font-bold text-rijksblauw-700 transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-rijksblauw-500 disabled:cursor-not-allowed disabled:opacity-60 dark:text-white',
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
              disabled={Boolean(uploading) || files.length >= MAX_PROJECT_FILES}
            >
              {uploading ? (
                <>
                  <Loader2 size={24} className="animate-spin" />
                  Bestand {uploading.current} van {uploading.total}
                </>
              ) : (
                <>
                  <Upload size={24} /> Bestanden toevoegen of hierheen slepen
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

            {loadingFiles ? (
              <p className="py-4 text-center text-xs text-slate-400">Bestanden laden…</p>
            ) : files.length === 0 ? null : (
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
                        className="inline-flex shrink-0 items-center gap-0.5 text-[0.6875rem] text-amber-600 dark:text-amber-400"
                        title="Dit bestand was te groot en is afgekapt."
                      >
                        <Scissors size={11} /> ingekort
                      </span>
                    )}
                    <span className="shrink-0 text-[0.6875rem] text-slate-400 dark:text-slate-500">
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
              <p className="mt-2 text-[0.6875rem] text-slate-400 dark:text-slate-500">
                Samen {num(totalChars)} tekens bronmateriaal.
              </p>
            )}

            {indexRemaining > 0 && (
              <p
                role="status"
                className="mt-1 flex items-center gap-1.5 text-[0.6875rem] text-slate-400 dark:text-slate-500"
              >
                <Loader2 size={12} className="animate-spin" />
                Bestanden doorzoekbaar maken
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
              // Ook tijdens het omschrijven dicht: anders bewaart een klik de
              // oude instructie terwijl de nieuwe onderweg is.
              disabled={saving || optimizing}
            >
              {saving && <Loader2 size={15} className="animate-spin" />}
              Opslaan
            </button>
          </div>
        </div>
      </Modal>

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
    </>
  );
}
