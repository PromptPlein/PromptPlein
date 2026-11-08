import { useEffect, useState, type ComponentProps, type ReactNode } from 'react';
import { useNavigate } from 'react-router-dom';
import { useReferenceData } from '@/context/ReferenceDataContext';
import { categoryIconName } from '@/lib/categoryIcons';
import { listPrompts } from '@/services/repository';
import { getChatSettingsCached } from '@/services/settingsService';
import { usePromptCommunity } from '@/hooks/usePromptCommunity';
import UploadModal from '@/components/prompts/UploadModal';
import PromptCard from '@/components/prompts/PromptCard';
import { SkeletonGrid } from '@/components/common/Skeleton';
import type { Prompt } from '@/types';
import '@nldd/design-system/button';
import '@nldd/design-system/button-group';
import '@nldd/design-system/card';
import '@nldd/design-system/collection';
import '@nldd/design-system/container';
import '@nldd/design-system/icon';
import '@nldd/design-system/icon-cell';
import '@nldd/design-system/inline-dialog';
import '@nldd/design-system/link';
import '@nldd/design-system/list';
import '@nldd/design-system/list-item';
import '@nldd/design-system/one-third-two-thirds-section';
import '@nldd/design-system/simple-section';
import '@nldd/design-system/spacer';
import '@nldd/design-system/spacer-cell';
import '@nldd/design-system/text-cell';
import '@nldd/design-system/title';

/**
 * De startpagina in tegels: eerst de vier dingen die je hier kunt doen, dan de
 * categorieën als iconen met een aantal, dan de nieuwste prompts. Uitleg staat
 * niet als lopende tekst op de pagina, maar achter een infobolletje.
 */
export default function HomePage() {
  const navigate = useNavigate();
  const { categories, techniques } = useReferenceData();
  const [recent, setRecent] = useState<Prompt[]>([]);
  // Aantal prompts in totaal en per categorie, voor de getallen op de tegels.
  const [total, setTotal] = useState<number | null>(null);
  const [perCategory, setPerCategory] = useState<Record<string, number>>({});
  const [loading, setLoading] = useState(true);
  const [uploadOpen, setUploadOpen] = useState(false);
  // De chattegel staat er alleen zolang de beheerder de chat aan heeft, net als
  // het menu-item in de kopbalk.
  const [chatEnabled, setChatEnabled] = useState(true);

  useEffect(() => {
    let active = true;
    listPrompts()
      .then((p) => {
        if (!active) return;
        setRecent(p.slice(0, 6));
        setTotal(p.length);
        const counts: Record<string, number> = {};
        for (const prompt of p) {
          if (prompt.category_id) counts[prompt.category_id] = (counts[prompt.category_id] ?? 0) + 1;
        }
        setPerCategory(counts);
      })
      .finally(() => active && setLoading(false));
    void getChatSettingsCached().then((s) => {
      if (active) setChatEnabled(s.enabled);
    });
    return () => {
      active = false;
    };
  }, []);

  const { enriched, authors } = usePromptCommunity(recent);

  return (
    <>
      {/* Wat wil je doen? Vier tegels, elk één taak. */}
      <nldd-simple-section>
        <nldd-title slot="header" heading-level={1} size={1} text="Wat wil je doen?"></nldd-title>
        <nldd-container layout="grid" column-count={4} md-column-count={2} sm-column-count={1} gap="16">
          <TaskTile href="/genereren" icon="sparkles" label="Prompt maken" background="accent-tinted" />
          {chatEnabled && <TaskTile href="/chat" icon="comment" label="Chatten" />}
          <TaskTile href="/zoeken" icon="search" label="Prompts zoeken" count={total} countLabel="prompts" />
          <TaskTile
            href="/technieken"
            icon="stack"
            label="Technieken leren"
            count={techniques.length || null}
            countLabel="technieken"
          />
        </nldd-container>
      </nldd-simple-section>

      {/* Categorieën met het aantal prompts. */}
      <nldd-one-third-two-thirds-section background="tinted">
        <nldd-title
          slot="left"
          heading-level={2}
          size={3}
          text="Categorieën"
          supporting-text="Kies een categorie. Het getal is het aantal prompts."
        ></nldd-title>
        <nldd-list slot="right" type="navigation" appearance="box-base" accessible-label="Categorieën">
          {categories.map((c) => {
            const count = perCategory[c.id] ?? 0;
            return (
              <nldd-list-item key={c.id} href={`/zoeken?category=${c.id}`}>
                <nldd-icon-cell icon={categoryIconName(c.icon)} color="accent"></nldd-icon-cell>
                <nldd-spacer-cell size="12"></nldd-spacer-cell>
                <nldd-text-cell hide-below="md" text={c.name} supporting-text={c.description || undefined}></nldd-text-cell>
                <nldd-text-cell
                  hide-above="sm"
                  text={c.name}
                  supporting-text={loading ? undefined : `${count} ${count === 1 ? 'prompt' : 'prompts'}`}
                ></nldd-text-cell>
                {!loading && (
                  <>
                    <nldd-spacer-cell size="12" hide-below="md"></nldd-spacer-cell>
                    <nldd-text-cell
                      hide-below="md"
                      width="fit-content"
                      color="secondary"
                      text={`${count} ${count === 1 ? 'prompt' : 'prompts'}`}
                    ></nldd-text-cell>
                  </>
                )}
                <nldd-spacer-cell size="12"></nldd-spacer-cell>
                <nldd-icon-cell size="20" color="secondary" icon="chevron-right"></nldd-icon-cell>
              </nldd-list-item>
            );
          })}
        </nldd-list>
      </nldd-one-third-two-thirds-section>

      {/* Nieuwste prompts */}
      <nldd-simple-section>
        <nldd-title slot="header" heading-level={2} size={3} text="Nieuwe prompts"></nldd-title>
        {loading ? (
          <SkeletonGrid count={6} />
        ) : recent.length === 0 ? (
          <nldd-inline-dialog icon="file-text" text="Er zijn nog geen prompts.">
            <nldd-button-group slot="actions">
              <nldd-button
                appearance="primary"
                start-icon="plus"
                text="Nieuwe prompt"
                onClick={() => setUploadOpen(true)}
              ></nldd-button>
            </nldd-button-group>
          </nldd-inline-dialog>
        ) : (
          <>
            <nldd-collection item-min-width="20rem">
              {enriched.map((p) => (
                <PromptCard
                  key={p.id}
                  prompt={p}
                  author={p.created_by_user ? authors[p.created_by_user] : null}
                  onChanged={(u) => setRecent((prev) => prev.map((x) => (x.id === u.id ? u : x)))}
                />
              ))}
            </nldd-collection>
            <nldd-spacer size="24"></nldd-spacer>
            <nldd-link href="/zoeken" end-icon="arrow-right" text="Alle prompts"></nldd-link>
          </>
        )}
      </nldd-simple-section>

      <UploadModal
        open={uploadOpen}
        onClose={() => setUploadOpen(false)}
        onCreated={(prompt) => navigate(`/prompt/${prompt.id}`)}
      />
    </>
  );
}

/** Eén taaktegel: icoon, één label, een pijl en soms een aantal. */
function TaskTile({
  href,
  icon,
  label,
  count,
  countLabel,
  background,
}: {
  href: string;
  icon: string;
  label: string;
  count?: number | null;
  countLabel?: string;
  background?: ComponentProps<'nldd-card'>['background'];
}): ReactNode {
  const amount = count != null ? `${count} ${countLabel ?? ''}`.trim() : undefined;
  return (
    <nldd-card href={href} accessible-label={amount ? `${label}, ${amount}` : label} background={background}>
      <nldd-container padding="20" gap="24">
        <nldd-icon icon={icon} size="40" color="accent"></nldd-icon>
        <nldd-container layout="row" gap="8" vertical-alignment="center">
          <nldd-title heading-level={2} size={4} text={label} supporting-text={amount}></nldd-title>
          <nldd-spacer size="flexible"></nldd-spacer>
          <nldd-icon icon="arrow-right" size="24" color="accent"></nldd-icon>
        </nldd-container>
      </nldd-container>
    </nldd-card>
  );
}
