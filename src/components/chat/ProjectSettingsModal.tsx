import { useCallback, useEffect, useRef, useState, type FormEvent } from 'react';
import { createPortal } from 'react-dom';
import { notify } from '@/lib/notify';
import { useNlddEvent, useNlddValue } from '@/lib/nldd';
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
  const [confirmDeleteFile, setConfirmDeleteFile] = useState<ChatProjectFile | null>(null);
  const sheetRef = useRef<HTMLElement>(null);
  const nameRef = useRef<HTMLElement & { value?: string }>(null);
  const instructionsRef = useRef<HTMLElement & { value?: string }>(null);
  const fileFieldRef = useRef<HTMLElement & { formResetCallback?: () => void }>(null);
  useNlddValue(nameRef, name, setName);
  useNlddValue(instructionsRef, instructions, setInstructions);
  // The sheet clears `open` itself on Escape, the backdrop or the dismiss
  // button. A close that follows our own `open` going false is no news.
  useNlddEvent(sheetRef, 'close', () => {
    if (open) onClose();
  });
  // The field hands over the chosen or dropped files; it is emptied again
  // right away, because each file becomes a row in the list below.
  useNlddEvent<CustomEvent<{ files?: File[] }>>(fileFieldRef, 'change', (e) => {
    const chosen = e.detail?.files ?? [];
    if (chosen.length === 0) return;
    fileFieldRef.current?.formResetCallback?.();
    void upload(chosen);
  });
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
        if (active) notify.error('De bestanden konden niet worden geladen.');
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
        notify.error(result.error);
        return;
      }
      if (!result.changed || !result.text.trim()) {
        notify('Je instructie was al compleet genoeg.', { icon: '✨' });
        return;
      }
      setInstructions(result.text);
      setBeforeOptimize({ before, after: result.text });
      notify.success('Instructie herschreven. Lees hem na en sla op als hij klopt.');
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
      notify.error('Geef het project een naam.');
      return;
    }
    setSaving(true);
    const ok = await onSave({ name: trimmed, instructions });
    setSaving(false);
    if (ok) {
      notify.success('Project opgeslagen.');
      onClose();
    }
  }

  /** Voegt bestanden één voor één toe, zodat één fout de rest niet tegenhoudt. */
  async function upload(list: File[]) {
    if (!projectId || uploading || list.length === 0) return;
    const room = MAX_PROJECT_FILES - files.length;
    if (room <= 0) {
      notify.error(`Maximaal ${MAX_PROJECT_FILES} bestanden per project.`);
      return;
    }
    if (list.length > room) {
      notify.error(`Er passen nog ${room} bestanden in dit project.`);
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
          notify(
            `"${doc.name}" was te groot en is afgekapt op ${num(MAX_PROJECT_FILE_CHARS)} tekens.`,
            { icon: '✂️' },
          );
        }
      } catch (err) {
        notify.error(err instanceof Error ? err.message : `"${file.name}" kon niet worden toegevoegd.`);
      }
    }
    setUploading(null);
    if (done > 1) onFilesChanged();
    if (done > 0) notify.success(done === 1 ? 'Bestand toegevoegd.' : `${done} bestanden toegevoegd.`);
  }

  async function removeFile(file: ChatProjectFile) {
    if (!projectId) return;
    try {
      await deleteProjectFile(projectId, file.id);
      setFiles((cur) => cur.filter((f) => f.id !== file.id));
      onFilesChanged();
      notify.success(`"${file.name}" verwijderd.`);
    } catch {
      notify.error('Het bestand kon niet worden verwijderd.');
    }
  }

  const totalChars = filesChars;
  const showOptimize = Boolean(chatSettings?.projectOptimizeEnabled) && (instructions.trim().length > 0 || optimizing);

  function submit(e: FormEvent) {
    e.preventDefault();
    void save();
  }

  return (
    <>
      {createPortal(
        <nldd-sheet ref={sheetRef} open={open || undefined} placement="right" width="640px">
          <nldd-page>
            <nldd-top-title-bar
              slot="header"
              text="Projectinstellingen"
              dismiss-text="Sluit"
              collapse-anchor="project-instellingen-titel"
            ></nldd-top-title-bar>
            <nldd-simple-section>
              <nldd-title
                id="project-instellingen-titel"
                slot="header"
                heading-level={2}
                size={3}
                text="Projectinstellingen"
              ></nldd-title>
              <nldd-form>
                <form onSubmit={submit}>
                  <nldd-form-field label="Naam">
                    <nldd-text-field
                      ref={nameRef}
                      maxlength={String(MAX_PROJECT_NAME_CHARS)}
                      placeholder="Bijvoorbeeld: Merkstem, Verkoopmails, Kwartaalrapport"
                    ></nldd-text-field>
                  </nldd-form-field>

                  <nldd-form-field
                    label="Projectinstructie"
                    supporting-label="Deze instructie geldt voor elke chat in dit project. Beschrijf wie de assistent is, hoe hij moet antwoorden en welk eindproduct eruit moet komen."
                  >
                    <nldd-multi-line-text-field
                      ref={instructionsRef}
                      rows={7}
                      resize="vertical"
                      maxlength={String(MAX_PROJECT_INSTRUCTIONS_CHARS)}
                      placeholder="Je bent de tekstschrijver van ons merk. Schrijf altijd in de wij-vorm, kort en concreet. Lever elke tekst als: titel, drie alinea's, afsluitende oproep."
                    ></nldd-multi-line-text-field>
                    <nldd-form-field-help-text>
                      {num(instructions.length)} van {num(MAX_PROJECT_INSTRUCTIONS_CHARS)} tekens
                    </nldd-form-field-help-text>
                  </nldd-form-field>

                  {/* The sparkle rewrites the instruction into a full system prompt.
                      It shows once there is text, the same gesture as in the chat
                      with a much heavier rewrite behind it (see
                      PROJECTINSTRUCTIE_Framework.md). */}
                  {(showOptimize || canUndoOptimize) && (
                    <nldd-container layout="wrap" gap="8">
                      {showOptimize && (
                        <nldd-button
                          appearance="secondary"
                          size="sm"
                          start-icon="sparkles"
                          text="Herschrijf met AI"
                          accessible-label="Schrijf mijn projectinstructie om met AI"
                          loading={optimizing || undefined}
                          loading-text="Bezig met omschrijven"
                          onClick={() => void optimize()}
                        ></nldd-button>
                      )}
                      {canUndoOptimize && (
                        <nldd-button
                          appearance="neutral-transparent"
                          size="sm"
                          start-icon="undo"
                          text="Herstel mijn eigen tekst"
                          onClick={undoOptimize}
                        ></nldd-button>
                      )}
                    </nldd-container>
                  )}

                  <nldd-form-field
                    label="Bronbestanden"
                    supporting-label={`Tot ${MAX_PROJECT_FILES} bestanden van elk ${MAX_PROJECT_FILE_BYTES / (1024 * 1024)} MB (.txt, .md, .pdf, .docx). Gebruik je een project drie maanden niet, dan worden de bestanden verwijderd. Je krijgt een week vooraf een mail. Het project blijft staan.`}
                  >
                    <nldd-file-field
                      ref={fileFieldRef}
                      variant="area"
                      multiple
                      accept={ACCEPTED_DOC_ACCEPT}
                      disabled={(Boolean(uploading) || files.length >= MAX_PROJECT_FILES) || undefined}
                    ></nldd-file-field>
                  </nldd-form-field>

                  {uploading && (
                    <nldd-progress-bar
                      max={uploading.total}
                      value={String(uploading.current)}
                      value-format="fraction"
                      text={`Bestand ${uploading.current} van ${uploading.total}`}
                    ></nldd-progress-bar>
                  )}

                  {loadingFiles ? (
                    <nldd-inline-dialog variant="loading" text="Bestanden laden"></nldd-inline-dialog>
                  ) : (
                    <nldd-list appearance="box-base" accessible-label="Bronbestanden">
                      {files.map((file) => (
                        <nldd-list-item key={file.id}>
                          <nldd-icon-cell icon="text-document" color="secondary" size="20"></nldd-icon-cell>
                          <nldd-spacer-cell size="12"></nldd-spacer-cell>
                          <nldd-text-cell
                            text={file.name}
                            supporting-text={
                              file.truncated
                                ? `${num(file.chars)} tekens, ingekort omdat het bestand te groot was`
                                : `${num(file.chars)} tekens`
                            }
                          ></nldd-text-cell>
                          <nldd-list-item-segment
                            button
                            accessible-label={`Verwijder bestand "${file.name}"`}
                            onClick={() => setConfirmDeleteFile(file)}
                          >
                            <nldd-icon-cell icon="trash" color="secondary" size="20"></nldd-icon-cell>
                          </nldd-list-item-segment>
                        </nldd-list-item>
                      ))}
                      <nldd-inline-dialog
                        slot="empty"
                        icon="text-document"
                        text="Nog geen bronbestanden"
                      ></nldd-inline-dialog>
                    </nldd-list>
                  )}

                  {files.length > 0 && (
                    <nldd-text size="xs" color="secondary">
                      Samen {num(totalChars)} tekens bronmateriaal.
                    </nldd-text>
                  )}

                  {indexRemaining > 0 && (
                    <nldd-activity-indicator
                      size="16"
                      show-text
                      timing="instant"
                      text="Bestanden doorzoekbaar maken"
                    ></nldd-activity-indicator>
                  )}

                  <nldd-form-actions>
                    <nldd-button-group>
                      {/* save() also waits while the rewrite runs: otherwise a click
                          would keep the old instruction while the new one is on its way. */}
                      <nldd-button
                        appearance="primary"
                        type="submit"
                        text="Bewaar"
                        loading={saving || undefined}
                        loading-text="Aan het bewaren"
                      ></nldd-button>
                    </nldd-button-group>
                  </nldd-form-actions>
                </form>
              </nldd-form>
            </nldd-simple-section>
          </nldd-page>
        </nldd-sheet>,
        document.body,
      )}

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
