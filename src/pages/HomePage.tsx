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
import '@nldd/design-system/inline-dialog';
import '@nldd/design-system/link';
import '@nldd/design-system/simple-section';
import '@nldd/design-system/spacer';
import '@nldd/design-system/title';

/**
 * De startpagina in tegels op een grijze ondergrond: eerst de vier dingen die je
 * hier kunt doen, dan de categorieën als kaartjes met een aantal, dan de nieuwste prompts. Uitleg staat
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
      {/* Wat wil je doen? Vier tegels, elk één taak, elk met een eigen kleur. */}
      <nldd-simple-section background="tinted">
        <nldd-title slot="header" heading-level={1} size={1} text="Wat wil je doen?"></nldd-title>
        <nldd-container layout="grid" column-count={4} md-column-count={2} sm-column-count={1} gap="16">
          <TaskTile
            href="/genereren"
            icon="sparkles"
            color="accent"
            label="Prompt maken"
            supporting="De AI helpt je op weg"
            background="accent-tinted"
          />
          {chatEnabled && (
            <TaskTile href="/chat" icon="comment" color="hemelblauw" label="Chatten" supporting="Stel direct een vraag" />
          )}
          <TaskTile
            href="/zoeken"
            icon="search"
            color="mintgroen"
            label="Prompts zoeken"
            supporting={total != null ? countText(total, 'prompt', 'prompts') : 'Van collega’s'}
          />
          <TaskTile
            href="/technieken"
            icon="stack"
            color="donkergeel"
            label="Technieken leren"
            supporting={
              techniques.length ? countText(techniques.length, 'techniek', 'technieken') : 'Leer de aanpakken'
            }
          />
        </nldd-container>
      </nldd-simple-section>

      {/* Categorieën als raster van kaartjes, met het aantal prompts. */}
      <nldd-simple-section background="tinted" padding-top="0">
        <nldd-title slot="header" heading-level={2} size={4} text="Categorieën"></nldd-title>
        <nldd-container layout="grid" column-count={4} md-column-count={2} sm-column-count={1} gap="12">
          {[...categories]
            .sort((a, b) => (perCategory[b.id] ?? 0) - (perCategory[a.id] ?? 0))
            .map((c) => {
              const count = perCategory[c.id] ?? 0;
              const amount = count === 0 ? 'Nog geen prompts' : countText(count, 'prompt', 'prompts');
              return (
                <nldd-card key={c.id} href={`/zoeken?category=${c.id}`} accessible-label={`${c.name}, ${amount}`}>
                  <nldd-container padding="16" layout="row" gap="12" vertical-alignment="center">
                    <nldd-icon icon={categoryIconName(c.icon)} size="40" color="lichtblauw" box></nldd-icon>
                    <nldd-title
                      heading-level={3}
                      size={6}
                      text={c.name}
                      supporting-text={loading ? undefined : amount}
                    ></nldd-title>
                  </nldd-container>
                </nldd-card>
              );
            })}
        </nldd-container>
      </nldd-simple-section>

      {/* Nieuwste prompts */}
      <nldd-simple-section background="tinted" padding-top="0">
        <nldd-container slot="header" layout="row" gap="12" vertical-alignment="center">
          <nldd-title heading-level={2} size={4} text="Nieuwe prompts"></nldd-title>
          <nldd-spacer size="flexible"></nldd-spacer>
          <nldd-link href="/zoeken" size="sm" end-icon="arrow-right" text="Alle prompts"></nldd-link>
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

/** Eén taaktegel: icoon in een gekleurd vlak, label met een korte regel eronder, en een pijl. */
function TaskTile({
  href,
  icon,
  color,
  label,
  supporting,
  background,
}: {
  href: string;
  icon: string;
  color: ComponentProps<'nldd-icon'>['color'];
  label: string;
  supporting: string;
  background?: ComponentProps<'nldd-card'>['background'];
}): ReactNode {
  return (
    <nldd-card href={href} accessible-label={`${label}, ${supporting}`} background={background}>
      <nldd-container padding="20" gap="24">
        <nldd-icon icon={icon} size="48" color={color} box></nldd-icon>
        <nldd-container layout="row" gap="8" vertical-alignment="center">
          <nldd-title heading-level={2} size={4} text={label} supporting-text={supporting}></nldd-title>
          <nldd-spacer size="flexible"></nldd-spacer>
          <nldd-icon icon="arrow-right" size="24" color="accent"></nldd-icon>
        </nldd-container>
      </nldd-container>
    </nldd-card>
  );
}
