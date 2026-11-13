import { useEffect, useRef, useState } from 'react';
import PromptCard from '@/components/prompts/PromptCard';
import UploadModal from '@/components/prompts/UploadModal';
import { SkeletonGrid } from '@/components/common/Skeleton';
import { listPrompts } from '@/services/repository';
import { listPromptsByAuthor } from '@/services/communityService';
import { usePromptCommunity } from '@/hooks/usePromptCommunity';
import { useAuth } from '@/context/AuthContext';
import { useNlddEvent } from '@/lib/nldd';
import type { Prompt } from '@/types';
import '@nldd/design-system/button';
import '@nldd/design-system/button-group';
import '@nldd/design-system/card';
import '@nldd/design-system/collection';
import '@nldd/design-system/container';
import '@nldd/design-system/inline-dialog';
import '@nldd/design-system/simple-section';
import '@nldd/design-system/spacer';
import '@nldd/design-system/tab-bar';
import '@nldd/design-system/title';

type Tab = 'mine' | 'favorites';

/**
 * Mijn bibliotheek: de persoonlijke verzameling van de gebruiker, met twee
 * tabbladen: de prompts die hij zelf gemaakt heeft en zijn favorieten. Eén
 * centrale plek voor "mijn spullen", zodat eigen werk en bewaarde prompts niet
 * verspreid over Community en Favorieten staan.
 */
export default function MyLibraryPage() {
  const { user } = useAuth();
  const [tab, setTab] = useState<Tab>('mine');
  const [mine, setMine] = useState<Prompt[]>([]);
  const [favorites, setFavorites] = useState<Prompt[]>([]);
  const [loadingMine, setLoadingMine] = useState(true);
  const [loadingFavorites, setLoadingFavorites] = useState(true);
  // Een prompt die de gebruiker al heeft (uit een ander hulpmiddel, een
  // collega of zijn eigen notities) zonder de bouwer erin zetten.
  const [uploadOpen, setUploadOpen] = useState(false);
  const tabsRef = useRef<HTMLElement>(null);
  useNlddEvent<CustomEvent<{ item?: HTMLElement }>>(tabsRef, 'tabchange', (e) => {
    const next = e.detail?.item?.dataset.tab;
    if (next === 'mine' || next === 'favorites') setTab(next);
  });

  useEffect(() => {
    let active = true;
    if (!user?.id) {
      setMine([]);
      setLoadingMine(false);
      return;
    }
    setLoadingMine(true);
    listPromptsByAuthor(user.id)
      .then((list) => active && setMine(list))
      .catch(() => active && setMine([]))
      .finally(() => active && setLoadingMine(false));
    return () => {
      active = false;
    };
  }, [user?.id]);

  useEffect(() => {
    let active = true;
    setLoadingFavorites(true);
    listPrompts({ favorites_only: true })
      .then((list) => active && setFavorites(list))
      .catch(() => active && setFavorites([]))
      .finally(() => active && setLoadingFavorites(false));
    return () => {
      active = false;
    };
  }, []);

  const prompts = tab === 'mine' ? mine : favorites;
  const loading = tab === 'mine' ? loadingMine : loadingFavorites;
  const { enriched, authors } = usePromptCommunity(prompts);

  function handleCreated(prompt: Prompt) {
    setMine((prev) => [prompt, ...prev]);
    setTab('mine');
  }

  function handleChanged(updated: Prompt) {
    // Eigen prompts blijven in de lijst staan (alleen bijwerken).
    setMine((prev) => prev.map((p) => (p.id === updated.id ? updated : p)));
    // Favorieten: verwijder uit de lijst als de favoriet is uitgezet.
    setFavorites((prev) =>
      updated.is_favorite
        ? prev.map((p) => (p.id === updated.id ? updated : p))
        : prev.filter((p) => p.id !== updated.id),
    );
  }

  return (
    <nldd-simple-section>
      <nldd-container slot="header" layout="wrap" gap="16" vertical-alignment="center">
        <nldd-title
          heading-level={1}
          size={3}
          text="Mijn prompts"
          supporting-text="De prompts die je zelf maakte en de prompts die je bewaarde."
        ></nldd-title>
        <nldd-spacer size="flexible" direction="horizontal"></nldd-spacer>
        <nldd-button
          appearance="primary"
          start-icon="plus"
          text="Prompt toevoegen"
          onClick={() => setUploadOpen(true)}
        ></nldd-button>
      </nldd-container>

      <nldd-tab-bar ref={tabsRef} accessible-label="Mijn prompts en favorieten">
        <nldd-tab-bar-item
          data-tab="mine"
          text={`Mijn prompts (${mine.length})`}
          current={tab === 'mine' || undefined}
        ></nldd-tab-bar-item>
        <nldd-tab-bar-item
          data-tab="favorites"
          text={`Favorieten (${favorites.length})`}
          current={tab === 'favorites' || undefined}
        ></nldd-tab-bar-item>
      </nldd-tab-bar>
      <nldd-spacer size="24"></nldd-spacer>

      {loading ? (
        <SkeletonGrid count={3} />
      ) : prompts.length === 0 ? (
        <EmptyState tab={tab} />
      ) : (
        <nldd-collection item-min-width="18rem">
          {enriched.map((p) => (
            <PromptCard
              key={p.id}
              prompt={p}
              author={p.created_by_user ? authors[p.created_by_user] : null}
              onChanged={handleChanged}
            />
          ))}
        </nldd-collection>
      )}

      <UploadModal
        open={uploadOpen}
        onClose={() => setUploadOpen(false)}
        onCreated={handleCreated}
      />
    </nldd-simple-section>
  );
}

function EmptyState({ tab }: { tab: Tab }) {
  if (tab === 'mine') {
    return (
      <nldd-card>
        <nldd-container padding="32" sm-padding="24">
          <nldd-inline-dialog icon="file-text" text="Je hebt nog geen eigen prompts gemaakt.">
            <nldd-button-group slot="actions">
              <nldd-button appearance="secondary" href="/genereren" text="Maak je eerste prompt"></nldd-button>
            </nldd-button-group>
          </nldd-inline-dialog>
        </nldd-container>
      </nldd-card>
    );
  }
  return (
    <nldd-card>
      <nldd-container padding="32" sm-padding="24">
        <nldd-inline-dialog icon="star" text="Je hebt nog geen favorieten.">
          <nldd-button-group slot="actions">
            <nldd-button appearance="secondary" href="/zoeken" text="Bekijk de bibliotheek"></nldd-button>
          </nldd-button-group>
        </nldd-inline-dialog>
      </nldd-container>
    </nldd-card>
  );
}
