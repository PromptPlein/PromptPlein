import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import clsx from 'clsx';
import toast from 'react-hot-toast';
import {
  Loader2,
  MessageSquare,
  Pencil,
  Plus,
  RotateCcw,
  Sparkles,
  Trash2,
  Wand2,
  FileText,
} from '@/components/common/icons';
import InfoDot from '@/components/common/InfoDot';
import ProjectFiles from '@/components/chat/ProjectFiles';
import { TILE, TILE_PRIMARY } from '@/components/chat/projectTiles';
import { optimizeProjectInstructions } from '@/services/chatService';
import type { ChatSettings } from '@/services/settingsService';
import {
  markProjectUsed,
  MAX_PROJECT_INSTRUCTIONS_CHARS,
  MAX_PROJECT_NAME_CHARS,
  prepareProjectForBuilder,
} from '@/services/chatProjectService';
import { formatDate } from '@/lib/utils';
import type { ChatIndexEntry, ChatProject } from '@/types';

// Dezelfde gele tint als "Technieken leren" op de startpagina: de tegel die
// naar de bouwer leidt valt op naast de blauwe.
const TILE_ACCENT =
  'bg-[#ffb612]/20 text-rijksblauw-700 hover:bg-[#ffb612]/35 dark:bg-[#ffb612]/15 dark:text-white dark:hover:bg-[#ffb612]/25';
const SECTION_HEADING =
  'flex items-center text-base font-bold text-rijksblauw-700 dark:text-rijksblauw-200';
/** Hoe hoog het instructieveld vanzelf meegroeit; daarboven scrolt het. */
const INSTRUCTIONS_MAX_REM = 24;

/**
 * De projectpagina: wat je ziet als je links op een project klikt, en meteen de
 * plek waar je het project instelt. Er is geen apart instellingenvenster: naam,
 * projectinstructie en bronbestanden pas je hier aan.
 *
 * Bewust géén chat. Een project is een plek, geen gesprek: hier zie je waar het
 * project voor staat (de projectinstructie), waar het uit put (de bronbestanden)
 * en wat je er al mee gedaan hebt (de gesprekken). Vanaf hier begin je een nieuw
 * gesprek, en dat gesprek draagt de instructie van dit project automatisch mee.
 *
 * De instructie wordt pas bij Opslaan bewaard: een halfgeschreven instructie
 * moet geen gesprekken sturen. Een bestand is meteen definitief.
 */
export default function ProjectView({
  project,
  conversations,
  onNewChat,
  onNewPrompt,
  onMakeInstruction,
  onSave,
  onFilesChanged,
  chatSettings,
  checkPii = true,
  editNameOnOpen = false,
  onSelectConversation,
  onRequestDeleteConversation,
  onRequestDeleteProject,
  disabled,
}: {
  project: ChatProject;
  /** De gesprekken die bij dit project horen, recentste eerst. */
  conversations: ChatIndexEntry[];
  onNewChat: () => void;
  /** Open de promptbouwer met dit project als context. */
  onNewPrompt: (includeFiles: boolean) => void;
  /** Laat de AI met een paar vragen de projectinstructie maken. */
  onMakeInstruction: () => void;
  /** Bewaart naam of instructie; geeft false terug als het misging. */
  onSave: (patch: { name?: string; instructions?: string }) => Promise<boolean>;
  /** Er is een bestand bij gekomen of verwijderd (voor de telling in de zijbalk). */
  onFilesChanged: () => void;
  /**
   * De AI-instellingen van de beheerder. Staat de verbeterslag uit of zijn ze
   * nog niet geladen, dan blijft het sterretje bij de instructie weg.
   */
  chatSettings?: ChatSettings | null;
  /** De controle op persoonsgegevens uit Beheer, AI-instellingen. Standaard aan. */
  checkPii?: boolean;
  /** Een net aangemaakt project: begin met de naam open om in te vullen. */
  editNameOnOpen?: boolean;
  onSelectConversation: (id: string) => void;
  onRequestDeleteConversation: (id: string) => void;
  onRequestDeleteProject: () => void;
  disabled: boolean;
}) {
  const fileCount = project.fileCount ?? 0;
  const chatCount = conversations.length;

  // Openen telt als gebruik, voor de bewaartermijn van de bronbestanden.
  useEffect(() => {
    markProjectUsed(project.id);
  }, [project.id]);

  // --- Naam ---
  const [editingName, setEditingName] = useState(editNameOnOpen);
  const [name, setName] = useState(project.name);
  const [savingName, setSavingName] = useState(false);
  const nameInputRef = useRef<HTMLInputElement>(null);
  // Alleen na een klik op het potlood: vanzelf openen zet op een aanraakscherm
  // geen toetsenbord over de pagina.
  const focusNameRef = useRef(false);

  useEffect(() => {
    setEditingName(editNameOnOpen);
    setName(project.name);
  }, [project.id]); // eslint-disable-line react-hooks/exhaustive-deps

  // De wizard sluit met "Zelf instellen" terwijl deze pagina al openstaat.
  useEffect(() => {
    if (!editNameOnOpen) return;
    setName(project.name);
    setEditingName(true);
  }, [editNameOnOpen]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!editingName) return;
    const el = nameInputRef.current;
    if (!el) return;
    const byClick = focusNameRef.current;
    focusNameRef.current = false;
    if (!byClick && window.matchMedia('(pointer: coarse)').matches) return;
    el.focus();
    el.select();
  }, [editingName]);

  function startEditName() {
    setName(project.name);
    focusNameRef.current = true;
    setEditingName(true);
  }

  async function saveName() {
    const trimmed = name.trim();
    if (!trimmed) {
      toast.error('Geef het project een naam.');
      return;
    }
    if (trimmed === project.name) {
      setEditingName(false);
      return;
    }
    setSavingName(true);
    const ok = await onSave({ name: trimmed });
    setSavingName(false);
    if (ok) setEditingName(false);
  }

  // --- Instructie ---
  const [instructions, setInstructions] = useState(project.instructions);
  const [savingInstructions, setSavingInstructions] = useState(false);
  const [optimizing, setOptimizing] = useState(false);
  // De instructie van vóór de laatste verbetering, met wat eruit kwam. Zolang
  // het veld nog exact het resultaat bevat, kan de gebruiker terug.
  const [beforeOptimize, setBeforeOptimize] = useState<{ before: string; after: string } | null>(
    null,
  );
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  // De namen van de bronbestanden gaan mee naar het sterretje.
  const [fileNames, setFileNames] = useState<string[]>([]);
  // De bewaarde tekst waar het veld van uitging. Verandert hij van buitenaf (de
  // AI maakte een instructie) terwijl de gebruiker niets had aangepast, dan
  // volgt het veld; anders blijft zijn eigen tekst staan.
  const baselineRef = useRef(project.instructions);

  useEffect(() => {
    setInstructions(project.instructions);
    baselineRef.current = project.instructions;
    setBeforeOptimize(null);
  }, [project.id]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    const previous = baselineRef.current;
    baselineRef.current = project.instructions;
    setInstructions((cur) => (cur === previous ? project.instructions : cur));
  }, [project.instructions]);

  const dirty = instructions !== project.instructions;
  const busy = savingInstructions || optimizing;

  // Een niet opgeslagen instructie gaat niet stilletjes verloren bij sluiten of
  // verversen van het tabblad.
  useEffect(() => {
    if (!dirty) return;
    const warn = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = '';
    };
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, [dirty]);

  // Het veld groeit mee met de tekst tot een vaste hoogte en scrolt daarna zelf,
  // zodat een lange instructie de bestanden en chats niet van de pagina duwt.
  useLayoutEffect(() => {
    const el = textareaRef.current;
    if (!el) return;
    const rem = parseFloat(getComputedStyle(document.documentElement).fontSize) || 16;
    el.style.height = 'auto';
    el.style.height = `${Math.min(el.scrollHeight + 2, INSTRUCTIONS_MAX_REM * rem)}px`;
  }, [instructions, project.id]);

  const canOptimize =
    Boolean(chatSettings?.projectOptimizeEnabled) && !busy && instructions.trim().length > 0;
  const canUndoOptimize =
    beforeOptimize !== null && instructions === beforeOptimize.after && !optimizing;

  // Het rode sterretje schrijft de instructie om tot een volledige systeemprompt.
  // Het resultaat vervangt het veld maar wordt niet opgeslagen: de gebruiker
  // leest het eerst na en drukt zelf op Opslaan.
  async function optimize() {
    if (!canOptimize || !chatSettings) return;
    const before = instructions;
    setOptimizing(true);
    try {
      const result = await optimizeProjectInstructions({
        instructions: before,
        projectName: project.name,
        fileNames,
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

  async function saveInstructions() {
    if (!dirty || busy) return;
    setSavingInstructions(true);
    const ok = await onSave({ instructions });
    setSavingInstructions(false);
    if (!ok) return;
    setBeforeOptimize(null);
    // Een andere instructie is ander materiaal, dus een nieuwe analyse.
    if (fileCount > 0) prepareProjectForBuilder(project.id);
    toast.success('Instructie opgeslagen.');
  }

  function discardInstructions() {
    setInstructions(project.instructions);
    setBeforeOptimize(null);
  }

  return (
    <div className="min-h-0 flex-auto overflow-y-auto px-4 py-6 sm:px-6">
      <div className="mx-auto max-w-2xl space-y-6">
        {/* Naam met de twee aantallen als bolletjes. Het potlood zet de naam in
            een invoerveld; Enter bewaart, Escape laat hem zoals hij was. */}
        {editingName ? (
          <form
            className="flex flex-wrap items-center gap-2"
            onSubmit={(e) => {
              e.preventDefault();
              void saveName();
            }}
          >
            <label htmlFor="project-name" className="sr-only">
              Naam van het project
            </label>
            <input
              id="project-name"
              ref={nameInputRef}
              className="opl-input min-w-0 flex-1 text-lg font-bold"
              value={name}
              maxLength={MAX_PROJECT_NAME_CHARS}
              onChange={(e) => setName(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Escape') {
                  e.preventDefault();
                  setName(project.name);
                  setEditingName(false);
                }
              }}
              placeholder="Bijvoorbeeld: Merkstem, Verkoopmails, Kwartaalrapport"
              disabled={savingName}
            />
            <div className="flex gap-2">
              <button
                type="button"
                className="opl-btn-secondary"
                onClick={() => {
                  setName(project.name);
                  setEditingName(false);
                }}
                disabled={savingName}
              >
                Annuleren
              </button>
              <button type="submit" className="opl-btn-primary" disabled={savingName}>
                {savingName && <Loader2 size={15} className="animate-spin" />}
                Opslaan
              </button>
            </div>
          </form>
        ) : (
          <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
            <h2 className="min-w-0 break-words text-2xl font-bold text-rijksblauw-700 dark:text-slate-100">
              {project.name}
            </h2>
            <button
              type="button"
              className="rounded-md p-1.5 text-slate-500 transition-colors hover:bg-slate-100 hover:text-rijksblauw-700 dark:text-slate-400 dark:hover:bg-slate-800 dark:hover:text-white"
              onClick={startEditName}
              disabled={disabled}
              aria-label="Naam van het project wijzigen"
              title="Naam wijzigen"
            >
              <Pencil size={16} />
            </button>
            <span className="inline-flex items-center gap-1.5 rounded-full bg-rijksblauw-50 px-2.5 py-0.5 text-sm font-semibold text-rijksblauw-700 dark:bg-rijksblauw-500/15 dark:text-rijksblauw-100">
              <FileText size={14} aria-hidden="true" />
              <span aria-label={`${fileCount} bronbestanden`}>{fileCount}</span>
            </span>
            <span className="inline-flex items-center gap-1.5 rounded-full bg-rijksblauw-50 px-2.5 py-0.5 text-sm font-semibold text-rijksblauw-700 dark:bg-rijksblauw-500/15 dark:text-rijksblauw-100">
              <MessageSquare size={14} aria-hidden="true" />
              <span aria-label={`${chatCount} chats`}>{chatCount}</span>
            </span>
          </div>
        )}

        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <button type="button" className={`${TILE} ${TILE_PRIMARY}`} onClick={onNewChat} disabled={disabled}>
            <Plus size={28} />
            <span className="text-base font-bold leading-tight">Nieuwe chat</span>
          </button>
          {/* Wand2 is het icoon dat de promptbouwer voor zichzelf gebruikt (de
              instap op /genereren): je ziet vooraf hetzelfde teken als op de
              plek waar je terechtkomt. Altijd zonder bronbestanden beginnen: de
              projectinstructie is meestal genoeg, en wie ze toch wil zet ze aan
              in de balk boven de bouwer. */}
          <button
            type="button"
            className={`${TILE} ${TILE_ACCENT}`}
            onClick={() => onNewPrompt(false)}
            disabled={disabled}
            title="De promptbouwer krijgt de projectinstructie mee, zodat de prompt over jouw onderwerp gaat."
          >
            <Wand2 size={28} strokeWidth={1.5} />
            <span className="text-base font-bold leading-tight">Prompt maken</span>
          </button>
        </div>

        {/* De instructie staat er meteen als invoerveld: lezen en aanpassen
            gebeuren op dezelfde plek. Opslaan verschijnt pas als er iets is
            veranderd. */}
        <section className="rounded-xl border border-slate-200 bg-slate-50/70 p-4 dark:border-slate-700 dark:bg-slate-900/40">
          <div className="mb-1.5 flex flex-wrap items-center justify-between gap-x-3 gap-y-1">
            <h3 className={SECTION_HEADING}>
              <label htmlFor="project-instructions">Projectinstructie</label>
              <InfoDot
                label="Uitleg over de projectinstructie"
                text="Elke chat in dit project volgt deze instructie. Beschrijf wie de assistent is, hoe hij antwoordt en welk eindproduct eruit moet komen."
              />
            </h3>
            {!instructions.trim() && (
              <button
                type="button"
                className="opl-raak inline-flex items-center gap-1 text-sm font-medium text-rijksblauw-600 hover:underline dark:text-rijksblauw-300"
                onClick={onMakeInstruction}
                disabled={disabled}
              >
                <Wand2 size={14} aria-hidden="true" /> Laat de AI er een maken
              </button>
            )}
          </div>
          <div className="relative">
            <textarea
              id="project-instructions"
              ref={textareaRef}
              // pb-12 houdt de onderste regel vrij van het sterretje.
              className={clsx(
                'opl-input min-h-[10rem] w-full resize-y font-normal leading-6',
                chatSettings?.projectOptimizeEnabled && 'pb-12',
              )}
              value={instructions}
              maxLength={MAX_PROJECT_INSTRUCTIONS_CHARS}
              onChange={(e) => setInstructions(e.target.value)}
              onKeyDown={(e) => {
                if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') {
                  e.preventDefault();
                  void saveInstructions();
                }
              }}
              readOnly={optimizing}
              placeholder="Je bent de tekstschrijver van ons merk. Schrijf altijd in de wij-vorm, kort en concreet. Lever elke tekst als: titel, drie alinea's, afsluitende oproep."
            />
            {chatSettings?.projectOptimizeEnabled && (instructions.trim().length > 0 || optimizing) && (
              <button
                type="button"
                className={clsx(
                  // Naast het sleepgreepje en de schuifbalk, niet erop.
                  'absolute bottom-2.5 right-[22px] flex h-8 w-8 items-center justify-center rounded-lg',
                  'bg-nadruk text-white shadow-sm ring-2 ring-white dark:ring-slate-800',
                  'transition-all duration-200 focus:outline-none focus:ring-nadruk/40',
                  canOptimize
                    ? 'hover:shadow-md motion-safe:hover:-translate-y-px'
                    : 'cursor-default opacity-60',
                )}
                onClick={() => void optimize()}
                disabled={!canOptimize}
                title={
                  optimizing
                    ? 'Bezig met omschrijven…'
                    : 'Schrijf mijn instructie om tot een volledige systeemprompt; je eigen tekst kun je daarna terughalen'
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
          <div className="mt-1 flex flex-wrap items-center justify-between gap-x-3 gap-y-1">
            {canUndoOptimize ? (
              <button
                type="button"
                className="opl-raak inline-flex items-center gap-1 text-xs font-medium text-slate-500 hover:text-rijksblauw-600 hover:underline dark:text-slate-400 dark:hover:text-rijksblauw-300"
                onClick={undoOptimize}
              >
                <RotateCcw size={12} aria-hidden="true" /> Herstel mijn eigen tekst
              </button>
            ) : (
              <span />
            )}
            <p className="text-xs text-slate-500 dark:text-slate-400">
              {instructions.length.toLocaleString('nl-NL')} van{' '}
              {MAX_PROJECT_INSTRUCTIONS_CHARS.toLocaleString('nl-NL')} tekens
            </p>
          </div>
          {dirty && (
            <div className="mt-3 flex flex-wrap items-center justify-end gap-2">
              <span className="mr-auto text-sm text-slate-600 dark:text-slate-300">
                Niet opgeslagen
              </span>
              <button
                type="button"
                className="opl-btn-secondary"
                onClick={discardInstructions}
                disabled={busy}
              >
                Annuleren
              </button>
              <button
                type="button"
                className="opl-btn-primary"
                onClick={() => void saveInstructions()}
                // Ook tijdens het omschrijven dicht: anders bewaart een klik de
                // oude instructie terwijl de nieuwe onderweg is.
                disabled={busy || disabled}
              >
                {savingInstructions && <Loader2 size={15} className="animate-spin" />}
                Opslaan
              </button>
            </div>
          )}
        </section>

        <ProjectFiles
          key={project.id}
          projectId={project.id}
          fileCount={fileCount}
          onFilesChanged={onFilesChanged}
          checkPii={checkPii}
          onFileNames={setFileNames}
          headingClassName={SECTION_HEADING}
          disabled={disabled}
        />

        <section>
          <h3 className={`${SECTION_HEADING} mb-1`}>
            Chats in dit project
            <InfoDot
              label="Uitleg over chats in dit project"
              text="Een chat hier draait meteen op de instructie en de bronbestanden van dit project."
            />
          </h3>
          {conversations.length === 0 ? (
            <p className="rounded-lg border border-dashed border-slate-300 px-4 py-5 text-center text-sm text-slate-600 dark:border-slate-600 dark:text-slate-400">
              Nog geen chats.
            </p>
          ) : (
            <ul className="space-y-1">
              {conversations.map((entry) => (
                <li
                  key={entry.id}
                  className="group flex items-center gap-1 rounded-lg transition-colors hover:bg-slate-100 dark:hover:bg-slate-800"
                >
                  <button
                    type="button"
                    className="flex min-w-0 flex-1 items-center gap-2.5 px-2 py-1.5 text-left"
                    onClick={() => onSelectConversation(entry.id)}
                    disabled={disabled}
                  >
                    <span
                      aria-hidden="true"
                      className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-rijksblauw-50 text-rijksblauw-700 dark:bg-rijksblauw-500/15 dark:text-rijksblauw-200"
                    >
                      <MessageSquare size={15} />
                    </span>
                    <span className="flex min-w-0 flex-1 flex-col">
                      <span className="truncate text-sm text-slate-800 dark:text-slate-200">
                        {entry.title}
                      </span>
                      <span className="text-xs text-slate-600 dark:text-slate-400">
                        {formatDate(entry.updatedAt)}
                      </span>
                    </span>
                  </button>
                  <button
                    type="button"
                    className="mr-1 shrink-0 rounded-md p-1.5 text-slate-500 opacity-0 transition-opacity opl-geen-muis:opacity-100 hover:bg-slate-200 hover:text-rijksrood focus:opacity-100 group-hover:opacity-100 dark:text-slate-400 dark:hover:bg-slate-700"
                    onClick={() => onRequestDeleteConversation(entry.id)}
                    disabled={disabled}
                    aria-label={`Verwijder chat "${entry.title}"`}
                  >
                    <Trash2 size={14} />
                  </button>
                </li>
              ))}
            </ul>
          )}
        </section>

        {/* Onderaan en stil: een project verwijderen is zeldzaam en onomkeerbaar,
            dus het staat niet naast de knoppen die je elke dag gebruikt. */}
        <div className="border-t border-slate-200 pt-4 dark:border-slate-700">
          <button
            type="button"
            className="opl-btn-ghost text-rijksrood dark:text-red-400"
            onClick={onRequestDeleteProject}
            disabled={disabled}
          >
            <Trash2 size={14} /> Project verwijderen
          </button>
        </div>
      </div>
    </div>
  );
}
