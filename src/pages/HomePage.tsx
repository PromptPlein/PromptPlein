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
import '@nldd/design-system/badge';
import '@nldd/design-system/button-group';
import '@nldd/design-system/card';
import '@nldd/design-system/collection';
import '@nldd/design-system/container';
import '@nldd/design-system/icon';
import '@nldd/design-system/inline-dialog';
import '@nldd/design-system/link';
import '@nldd/design-system/simple-section';
import '@nldd/design-system/spacer';
import '@nldd/design-system/text';
import '@nldd/design-system/title';

/**
 * De startpagina zoals op main: de vraag als titel, de vier taken als tegels
 * naast elkaar, de categorieën als rij kleine tegels en de nieuwste prompts,
 * alles op een grijze ondergrond. Uitleg staat
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
      {/* De opening zoals op main: de vraag als paginatitel en daaronder de vier
          taken als tegels naast elkaar, elk met een eigen kleur. */}
      <nldd-simple-section background="tinted">
        <nldd-title slot="header" heading-level={1} size={3} text="Wat wil je doen?"></nldd-title>
        <nldd-container layout="grid" column-count={chatEnabled ? 4 : 3} md-column-count={2} sm-column-count={1} gap="16">
          <TaskTile href="/genereren" icon="sparkles" color="lintblauw" label="Prompt maken" background="accent-tinted" />
          {chatEnabled && <TaskTile href="/chat" icon="comment" color="hemelblauw" label="Chatten" />}
          <TaskTile href="/zoeken" icon="search" color="mintgroen" label="Prompts zoeken" count={total} countLabel="prompts" />
          <TaskTile
            href="/technieken"
            icon="stack"
            color="donkergeel"
            label="Technieken leren"
            count={techniques.length || null}
            countLabel="technieken"
          />
        </nldd-container>
      </nldd-simple-section>

      {/* Categorieën als rij kleine tegels: icoon, naam en het aantal prompts. */}
      <nldd-simple-section background="tinted" padding-top="0">
        <nldd-title slot="header" heading-level={2} size={5} text="Categorieën"></nldd-title>
        <nldd-container layout="grid" column-count={8} md-column-count={4} sm-column-count={2} gap="12">
          {categories.map((c) => {
            const count = perCategory[c.id] ?? 0;
            const amount = count === 0 ? 'Nog geen prompts' : countText(count, 'prompt', 'prompts');
            return (
              <nldd-card key={c.id} href={`/zoeken?category=${c.id}`} accessible-label={`${c.name}, ${amount}`}>
                <nldd-container padding="12" gap="8" horizontal-alignment="center">
                  <nldd-container layout="row" horizontal-alignment="right">
                    <nldd-badge color="accent" size="sm" number={loading ? undefined : String(count)} decorative></nldd-badge>
                  </nldd-container>
                  <nldd-icon icon={categoryIconName(c.icon)} size="48" color="lichtblauw" box></nldd-icon>
                  <nldd-text size="sm" weight="bold" horizontal-alignment="center">{c.name}</nldd-text>
                </nldd-container>
              </nldd-card>
            );
          })}
        </nldd-container>
      </nldd-simple-section>

      {/* Nieuwste prompts */}
      <nldd-simple-section background="tinted" padding-top="0">
        <nldd-container slot="header" layout="row" gap="12" vertical-alignment="center">
          <nldd-title heading-level={2} size={5} text="Nieuwe prompts"></nldd-title>
          <nldd-spacer size="flexible"></nldd-spacer>
          <nldd-link href="/zoeken" size="sm" end-icon="arrow-right" text="Alles" accessible-label="Alle prompts"></nldd-link>
        </nldd-container>
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

function countText(n: number, one: string, many: string) {
  return `${n} ${n === 1 ? one : many}`;
}

/** Eén taaktegel zoals op main: icoon linksboven, het aantal rechtsboven, onderaan het label met een pijl. */
function TaskTile({
  href,
  icon,
  color,
  label,
  count,
  countLabel,
  background,
}: {
  href: string;
  icon: string;
  color: ComponentProps<'nldd-icon'>['color'];
  label: string;
  count?: number | null;
  countLabel?: string;
  background?: ComponentProps<'nldd-card'>['background'];
}): ReactNode {
  const name = count != null && countLabel ? `${label}, ${count} ${countLabel}` : label;
  return (
    <nldd-card href={href} accessible-label={name} background={background}>
      <nldd-container padding="20" gap="48">
        <nldd-container layout="row" gap="8" vertical-alignment="top">
          <nldd-icon icon={icon} size="48" color={color} box></nldd-icon>
          <nldd-spacer size="flexible"></nldd-spacer>
          {count != null && <nldd-badge color="accent" number={String(count)} max={999} decorative></nldd-badge>}
        </nldd-container>
        <nldd-container layout="row" gap="8" vertical-alignment="center">
          <nldd-title heading-level={2} size={4} text={label}></nldd-title>
          <nldd-spacer size="flexible"></nldd-spacer>
          <nldd-icon icon="arrow-right" size="24" color="accent"></nldd-icon>
        </nldd-container>
      </nldd-container>
    </nldd-card>
  );
}
