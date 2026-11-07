import { useEffect, useRef, type ReactNode } from 'react';

/**
 * Laat een tabel op de telefoon als rijtje kaarten zien: elke rij een blok, met
 * de kolomnaam voor elke waarde. Een brede tabel zijwaarts schuiven op een smal
 * scherm is voor niemand fijn, en met vergroting raak je de rij kwijt.
 *
 * Dit moet met `display: block` (zie `.opl-stapel` in index.css), en daarmee
 * vergeet de browser dat het een tabel is. Daarom krijgen de elementen hun rol
 * hier expliciet, zodat een schermlezer nog steeds rij en kolom noemt. De kolomnaam
 * komt uit de kop, zodat die op één plek blijft staan.
 */
export default function StackTable({ children }: { children: ReactNode }) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const root = ref.current;
    if (!root) return;

    const apply = () => {
      const table = root.querySelector('table');
      if (!table) return;
      table.setAttribute('role', 'table');
      table.querySelectorAll('thead, tbody').forEach((el) => el.setAttribute('role', 'rowgroup'));
      table.querySelectorAll('tr').forEach((el) => el.setAttribute('role', 'row'));
      const heads = Array.from(table.querySelectorAll('thead th'));
      heads.forEach((el) => el.setAttribute('role', 'columnheader'));
      table.querySelectorAll('tbody tr').forEach((row) => {
        Array.from(row.children).forEach((cell, i) => {
          cell.setAttribute('role', 'cell');
          const label = heads[i]?.textContent?.trim();
          if (label && !cell.hasAttribute('colspan')) cell.setAttribute('data-label', label);
        });
      });
    };

    apply();
    const observer = new MutationObserver(apply);
    observer.observe(root, { childList: true, subtree: true });
    return () => observer.disconnect();
  }, []);

  return (
    <div ref={ref} className="opl-stapel">
      {children}
    </div>
  );
}
