import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import {
  ChevronDown,
  ChevronUp,
  FileText,
  MessageSquare,
  Plus,
  Settings2,
  Trash2,
  Wand2,
} from '@/components/common/icons';
import InfoDot from '@/components/common/InfoDot';
import { TILE, TILE_PRIMARY, TILE_SOFT } from '@/components/chat/projectTiles';
import { formatDate } from '@/lib/utils';
import type { ChatIndexEntry, ChatProject } from '@/types';

// Dezelfde gele tint als "Technieken leren" op de startpagina: de tegel die
// naar de bouwer leidt valt op naast de twee blauwe.
const TILE_ACCENT =
  'bg-[#ffb612]/20 text-rijksblauw-700 hover:bg-[#ffb612]/35 dark:bg-[#ffb612]/15 dark:text-white dark:hover:bg-[#ffb612]/25';
const SECTION_HEADING =
  'flex items-center text-base font-bold text-rijksblauw-700 dark:text-rijksblauw-200';

/**
 * De projectpagina: wat je ziet als je links op een project klikt.
 *
 * Bewust géén chat. Een project is een plek, geen gesprek — hier zie je waar het
 * project voor staat (de projectinstructie), waar het uit put (de bronbestanden)
 * en wat je er al mee gedaan hebt (de gesprekken). Vanaf hier begin je een nieuw
 * gesprek, en dat gesprek draagt de instructie van dit project automatisch mee.
 *
 * De projectinstructie staat hier ingekort in beeld en niet in een invoerveld:
 * lezen is de normale handeling, bewerken de zeldzame. Dat laatste zit achter
 * "Projectinstellingen".
 */
export default function ProjectView({
  project,
  conversations,
  onNewChat,
  onNewPrompt,
  onMakeInstruction,
  onOpenSettings,
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
  onOpenSettings: () => void;
  onSelectConversation: (id: string) => void;
  onRequestDeleteConversation: (id: string) => void;
  onRequestDeleteProject: () => void;
  disabled: boolean;
}) {
  const instructions = project.instructions.trim();
  const fileCount = project.fileCount ?? 0;
  const chatCount = conversations.length;

  // De instructie staat standaard ingekort. Een projectinstructie kan een heel
  // document zijn (20.000 tekens mag); dan duwt hij de bronbestanden en de
  // gesprekken van het scherm en is de projectpagina alleen nog een lap tekst.
  // Zes regels is genoeg om te zien waar het project over gaat, de rest is er
  // voor wie hem echt wil lezen.
  const [instructionsOpen, setInstructionsOpen] = useState(false);
  const [instructionsOverflow, setInstructionsOverflow] = useState(false);
  const instructionsRef = useRef<HTMLParagraphElement>(null);

  // Ander project, weer ingeklapt: de uitklap hoort bij de instructie die je
  // aan het lezen was, niet bij de pagina.
  useEffect(() => {
    setInstructionsOpen(false);
  }, [project.id]);

  // Of er iets ónder de zesde regel staat kun je alleen meten, niet aan de tekst
  // aflezen: dat hangt af van de breedte van het venster. Vandaar de meting bij
  // elke maatverandering — en alleen in ingeklapte staat, want uitgeklapt past
  // alles per definitie en zou de knop meteen weer laten verdwijnen.
  useLayoutEffect(() => {
    const el = instructionsRef.current;
    if (!el || instructionsOpen) return;
    const measure = () => setInstructionsOverflow(el.scrollHeight > el.clientHeight + 1);
    measure();
    if (typeof ResizeObserver === 'undefined') return;
    const observer = new ResizeObserver(measure);
    observer.observe(el);
    return () => observer.disconnect();
  }, [instructions, instructionsOpen]);

  return (
    <div className="min-h-0 flex-auto overflow-y-auto px-4 py-6 sm:px-6">
      <div className="mx-auto max-w-2xl space-y-6">
        {/* Naam met de twee aantallen als bolletjes, daaronder de drie dingen
            die je met een project kunt doen als tegels: praten, er een prompt
            mee bouwen, of het instellen. Tegels in plaats van een rij knoppen
            naast de titel: zo wordt een lange projectnaam nooit afgekapt en
            lees je de acties in één blik, net als op de startpagina. */}
        <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
          <h2 className="min-w-0 break-words text-2xl font-bold text-rijksblauw-700 dark:text-slate-100">
            {project.name}
          </h2>
          <span className="inline-flex items-center gap-1.5 rounded-full bg-rijksblauw-50 px-2.5 py-0.5 text-sm font-semibold text-rijksblauw-700 dark:bg-rijksblauw-500/15 dark:text-rijksblauw-100">
            <FileText size={14} aria-hidden="true" />
            <span aria-label={`${fileCount} bronbestanden`}>{fileCount}</span>
          </span>
          <span className="inline-flex items-center gap-1.5 rounded-full bg-rijksblauw-50 px-2.5 py-0.5 text-sm font-semibold text-rijksblauw-700 dark:bg-rijksblauw-500/15 dark:text-rijksblauw-100">
            <MessageSquare size={14} aria-hidden="true" />
            <span aria-label={`${chatCount} chats`}>{chatCount}</span>
          </span>
        </div>

        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
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
          <button type="button" className={`${TILE} ${TILE_SOFT}`} onClick={onOpenSettings} disabled={disabled}>
            <Settings2 size={28} />
            <span className="text-base font-bold leading-tight">Instellingen</span>
          </button>
        </div>

        {/* De instructie: het eerste wat je wilt weten als je een project opent.
            Staat er niets, dan is dat geen fout maar een uitnodiging. */}
        <section className="rounded-xl border border-slate-200 bg-slate-50/70 p-4 dark:border-slate-700 dark:bg-slate-900/40">
          <h3 className={`${SECTION_HEADING} mb-1.5`}>
            Projectinstructie
            <InfoDot
              label="Uitleg over de projectinstructie"
              text="Elke chat in dit project volgt deze instructie. Je past hem aan bij Instellingen."
            />
          </h3>
          {instructions ? (
            <>
              <p
                ref={instructionsRef}
                id="project-instructions-text"
                // max-h is precies zes regels van 1.5rem, dus de afkapping valt
                // op een regelgrens en niet dwars door een letter heen. De mask
                // laat de laatste regel vervagen: dat werkt op elke achtergrond,
                // waar een gradient-overlay de kleur van de kaart zou moeten
                // raden — inclusief de doorzichtige donkere variant.
                className={`whitespace-pre-wrap text-sm leading-6 text-slate-700 dark:text-slate-300 ${
                  instructionsOpen
                    ? ''
                    : `max-h-36 overflow-hidden ${
                        instructionsOverflow
                          ? '[mask-image:linear-gradient(to_bottom,black_60%,transparent)]'
                          : ''
                      }`
                }`}
              >
                {instructions}
              </p>
              {(instructionsOverflow || instructionsOpen) && (
                <button
                  type="button"
                  className="mt-2 flex items-center gap-1 text-sm font-medium text-rijksblauw-600 hover:underline dark:text-rijksblauw-300"
                  onClick={() => setInstructionsOpen((open) => !open)}
                  aria-expanded={instructionsOpen}
                  aria-controls="project-instructions-text"
                >
                  {instructionsOpen ? (
                    <>
                      <ChevronUp size={14} /> Minder tonen
                    </>
                  ) : (
                    <>
                      <ChevronDown size={14} /> Volledige instructie tonen
                    </>
                  )}
                </button>
              )}
            </>
          ) : (
            <p className="text-sm text-slate-600 dark:text-slate-400">
              Nog geen instructie.{' '}
              <button
                type="button"
                className="font-medium text-rijksblauw-600 hover:underline dark:text-rijksblauw-300"
                onClick={onMakeInstruction}
              >
                Laat de AI er een maken
              </button>{' '}
              of{' '}
              <button
                type="button"
                className="font-medium text-rijksblauw-600 hover:underline dark:text-rijksblauw-300"
                onClick={onOpenSettings}
              >
                schrijf er zelf een
              </button>
            </p>
          )}
        </section>

        <section>
          <h3 className={`${SECTION_HEADING} mb-1`}>
            Bronbestanden
            <span
              aria-label={`${fileCount} bronbestanden`}
              className="ml-1.5 min-w-[1.5rem] rounded-full bg-rijksblauw-700 px-1.5 text-center text-xs font-bold leading-6 text-white dark:bg-rijksblauw-500"
            >
              {fileCount}
            </span>
            <InfoDot
              label="Uitleg over bronbestanden"
              text="Documenten waar de chats in dit project uit putten. Je beheert ze bij Instellingen."
            />
          </h3>
          <button
            type="button"
            className="text-sm font-semibold text-rijksblauw-600 hover:underline dark:text-rijksblauw-300"
            onClick={onOpenSettings}
          >
            {fileCount > 0 ? 'Beheren' : 'Upload er een'}
          </button>
        </section>

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
                    className="mr-1 shrink-0 rounded-md p-1.5 text-slate-500 opacity-0 transition-opacity hover:bg-slate-200 hover:text-rijksrood focus:opacity-100 group-hover:opacity-100 dark:text-slate-400 dark:hover:bg-slate-700"
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
