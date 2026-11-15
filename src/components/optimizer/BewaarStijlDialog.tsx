import { useEffect, useState } from 'react';
import { Loader2 } from '@/components/common/icons';
import Modal from '@/components/common/Modal';
import { imageStyleForProject } from '@/services/optimizeService';
import { MAX_PROJECT_INSTRUCTIONS_CHARS, MAX_PROJECT_NAME_CHARS } from '@/services/chatProjectService';

/**
 * Bewaar als vaste stijl: maakt van een voorbeeldbeeld een project waarvan de
 * instructie de beeldstijl is. Daarna krijgt elk beeld dat je met dat project
 * maakt dezelfde stijl, met een ander onderwerp.
 *
 * De AI haalt eerst het onderwerp van het voorbeeld eruit. Zonder die stap zou
 * "oranje voor de katten" in elk volgend beeld katten opleveren, want de vaste
 * beeldstijl gaat in elk onderdeel van de prompt mee. De medewerker ziet de
 * uitkomst en past hem aan voordat hij hem bewaart.
 */
export default function BewaarStijlDialog({
  open,
  voorbeeldNaam,
  voorbeeldTekst,
  ai,
  onSave,
  onClose,
}: {
  open: boolean;
  voorbeeldNaam: string;
  voorbeeldTekst: string;
  ai?: { provider?: string; model?: string };
  /** Maakt het project; geeft false terug als het misging. */
  onSave: (name: string, instructions: string) => Promise<boolean>;
  onClose: () => void;
}) {
  const [bezig, setBezig] = useState(false);
  const [mislukt, setMislukt] = useState(false);
  const [naam, setNaam] = useState('');
  const [tekst, setTekst] = useState('');
  const [opslaan, setOpslaan] = useState(false);

  useEffect(() => {
    if (!open) return;
    let actief = true;
    setBezig(true);
    setMislukt(false);
    setNaam('');
    setTekst('');
    imageStyleForProject(voorbeeldTekst, ai).then((res) => {
      if (!actief) return;
      setBezig(false);
      if ('error' in res) {
        // Dan de beschrijving zoals hij is: de medewerker haalt het onderwerp er zelf uit.
        setMislukt(true);
        setNaam(voorbeeldNaam ? `Stijl van ${voorbeeldNaam}` : 'Mijn beeldstijl');
        setTekst(voorbeeldTekst);
        return;
      }
      setNaam(res.naam || (voorbeeldNaam ? `Stijl van ${voorbeeldNaam}` : 'Mijn beeldstijl'));
      setTekst(res.stijlTekst);
    });
    return () => {
      actief = false;
    };
  }, [open]); // eslint-disable-line react-hooks/exhaustive-deps

  async function bewaar() {
    if (!naam.trim() || !tekst.trim() || opslaan) return;
    setOpslaan(true);
    const ok = await onSave(naam.trim(), tekst.trim());
    setOpslaan(false);
    if (ok) onClose();
  }

  return (
    <Modal open={open} onClose={onClose} title="Bewaar als vaste stijl">
      {bezig ? (
        <p role="status" className="flex items-center gap-2 py-6 text-sm text-slate-600 dark:text-slate-300">
          <Loader2 size={16} className="animate-spin" aria-hidden="true" />
          De AI haalt het onderwerp uit je voorbeeld, zodat alleen de stijl overblijft.
        </p>
      ) : (
        <form
          className="space-y-4"
          onSubmit={(e) => {
            e.preventDefault();
            void bewaar();
          }}
        >
          <p className="text-sm text-slate-600 dark:text-slate-300">
            Dit wordt een nieuw project. Kies je dat project bij Uit een project, dan krijgt elk
            beeld deze stijl, met een ander onderwerp.
          </p>
          <div>
            <label
              htmlFor="stijl-naam"
              className="mb-1.5 block text-sm font-semibold text-slate-800 dark:text-slate-100"
            >
              Naam van het project
            </label>
            <input
              id="stijl-naam"
              className="opl-input w-full"
              value={naam}
              maxLength={MAX_PROJECT_NAME_CHARS}
              onChange={(e) => setNaam(e.target.value)}
            />
          </div>
          <div>
            <label
              htmlFor="stijl-tekst"
              className="mb-1.5 block text-sm font-semibold text-slate-800 dark:text-slate-100"
            >
              Je beeldstijl
            </label>
            <p className="mb-2 text-sm text-slate-600 dark:text-slate-300">
              {mislukt
                ? 'Het omzetten lukte niet. Haal zelf weg wat er op je voorbeeld staat, zoals personen en dieren, en houd de techniek, kleuren en het licht.'
                : 'Pas aan wat niet klopt. Je kunt dit later ook aanpassen op de projectpagina.'}
            </p>
            <textarea
              id="stijl-tekst"
              rows={10}
              className="opl-input block w-full resize-y text-[0.9375rem]"
              value={tekst}
              maxLength={MAX_PROJECT_INSTRUCTIONS_CHARS}
              onChange={(e) => setTekst(e.target.value)}
            />
          </div>
          <div className="flex justify-end gap-2 border-t border-slate-200 pt-4 dark:border-slate-700">
            <button type="button" className="opl-btn-secondary" onClick={onClose}>
              Annuleren
            </button>
            <button
              type="submit"
              className="opl-btn-primary"
              disabled={opslaan || !naam.trim() || !tekst.trim()}
            >
              {opslaan && <Loader2 size={15} className="animate-spin" />}
              Bewaren
            </button>
          </div>
        </form>
      )}
    </Modal>
  );
}
