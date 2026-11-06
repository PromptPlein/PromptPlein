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
import { formatDate } from '@/lib/utils';
import type { ChatIndexEntry, ChatProject } from '@/types';

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
        {/* Naam links, de drie acties rechts.

            NIET afdwingen met flex-nowrap: dan houden de knoppen hun breedte en
            wordt de titel afgekapt tot "Email schrij…". Alles moet leesbaar
            blijven, dus de knoppen zijn compact gemaakt en de tellerregel is
            ingekort tot het geheel binnen de smalste kolom past (656 px bij een
            1024-venster: 454 px knoppen + 184 px tekst + 12 px tussenruimte).
            Past het bij een lange projectnaam tóch niet, dan zakt de knoppenrij
            een regel — stapelen is leesbaarder dan knijpen. */}
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <h2 className="truncate text-xl font-bold text-slate-900 dark:text-slate-100">
              {project.name}
            </h2>
            <p className="mt-0.5 text-xs text-slate-400 dark:text-slate-500">
              {fileCount} bronbestanden · {chatCount} chats
            </p>
          </div>
          {/* De drie dingen die je met een project kunt doen, op één rij:
              instellen, praten, of er een prompt mee bouwen. Compacter dan de
              standaardknop (13px, krappere padding): dat is wat de rij naast de
              titel laat passen, en als werkbalk boven een pagina leest het
              rustiger dan drie knoppen op volle sterkte. */}
          <div className="flex shrink-0 flex-wrap gap-2">
            <button
              type="button"
              className="opl-btn-secondary !px-3 !py-1.5 !text-[13px]"
              onClick={onOpenSettings}
              disabled={disabled}
              // "Instellingen" volstaat: je staat al op de projectpagina, dus
              // waarvan het de instellingen zijn is uit de context duidelijk.
              // "Projectinstellingen" kostte 48 px extra en dat is precies de
              // ruimte die de titel nodig heeft.
              title="Projectinstellingen"
            >
              <Settings2 size={14} /> Instellingen
            </button>
            <button
              type="button"
              className="opl-btn-primary !px-3 !py-1.5 !text-[13px]"
              onClick={onNewChat}
              disabled={disabled}
            >
              <Plus size={14} /> Nieuwe chat
            </button>
            {/* Wand2 is het icoon dat de promptbouwer voor zichzelf gebruikt (de
                instap-tab op /genereren). Dáár zit de herkenning: je ziet vooraf
                hetzelfde teken als op de plek waar je terechtkomt.

                Hetzelfde oranje verloop als "Genereren" in de menubalk
                (accentChip.oranje in components/common/Header.tsx): deze knop
                leidt naar dezelfde plek, dus hij hoort er ook zo uit te zien.
                Naast de neutrale en de blauwe knop is het in één oogopslag de
                andere soort actie. */}
            <button
              type="button"
              className="opl-btn !px-3 !py-1.5 !text-[13px] bg-rijksoranje text-slate-950 shadow-sm hover:bg-rijksoranje-dark dark:hover:text-white focus:ring-rijksoranje"
              // Altijd zonder bronbestanden beginnen: de projectinstructie is
              // meestal genoeg, en wie ze tóch wil zet ze aan in de balk bóven
              // de bouwer — daar ziet hij meteen wat het doet.
              onClick={() => onNewPrompt(false)}
              disabled={disabled}
              title="De promptbouwer krijgt de projectinstructie mee, zodat de prompt over jouw onderwerp gaat en er niet naar gevraagd wordt."
            >
              <Wand2 size={14} /> Genereer prompt
            </button>
          </div>
        </div>

        {/* De instructie: het eerste wat je wilt weten als je een project opent.
            Staat er niets, dan is dat geen fout maar een uitnodiging. */}
        <section className="rounded-xl border border-slate-200 bg-slate-50/70 p-4 dark:border-slate-700 dark:bg-slate-900/40">
          <h3 className="mb-1.5 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
            <Settings2 size={13} /> Projectinstructie
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
            <p className="text-sm text-slate-400 dark:text-slate-500">
              Nog geen instructie.{' '}
              <button
                type="button"
                className="font-medium text-rijksblauw-600 hover:underline dark:text-rijksblauw-300"
                onClick={onOpenSettings}
              >
                Schrijf er een
              </button>
            </p>
          )}
        </section>

        <section>
          <h3 className="mb-2 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
            <FileText size={13} /> Bronbestanden
          </h3>
          {fileCount > 0 ? (
            <p className="text-sm text-slate-600 dark:text-slate-300">
              Bronbestanden: {fileCount}.{' '}
              <button
                type="button"
                className="font-medium text-rijksblauw-600 hover:underline dark:text-rijksblauw-300"
                onClick={onOpenSettings}
              >
                Beheer ze
              </button>
            </p>
          ) : (
            <p className="text-sm text-slate-400 dark:text-slate-500">
              Nog geen bronbestanden.{' '}
              <button
                type="button"
                className="font-medium text-rijksblauw-600 hover:underline dark:text-rijksblauw-300"
                onClick={onOpenSettings}
              >
                Upload er een
              </button>
            </p>
          )}
        </section>

        <section>
          <h3 className="mb-2 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
            <MessageSquare size={13} /> Chats in dit project
          </h3>
          {conversations.length === 0 ? (
            <p className="rounded-lg border border-dashed border-slate-300 px-4 py-6 text-center text-sm text-slate-400 dark:border-slate-600 dark:text-slate-500">
              Nog geen chats. Begin er een; die draait meteen op de instructie en de bronnen
              van dit project.
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
                    className="flex min-w-0 flex-1 flex-col items-start gap-0.5 px-3 py-2 text-left"
                    onClick={() => onSelectConversation(entry.id)}
                    disabled={disabled}
                  >
                    <span className="flex w-full items-center gap-1.5 text-sm text-slate-700 dark:text-slate-300">
                      <MessageSquare size={13} className="shrink-0" />
                      <span className="truncate">{entry.title}</span>
                    </span>
                    <span className="text-[11px] text-slate-400 dark:text-slate-500">
                      {formatDate(entry.updatedAt)}
                    </span>
                  </button>
                  <button
                    type="button"
                    className="mr-1 shrink-0 rounded-md p-1.5 text-slate-400 opacity-0 transition-opacity hover:bg-slate-200 hover:text-rijksrood group-hover:opacity-100 dark:hover:bg-slate-700"
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
