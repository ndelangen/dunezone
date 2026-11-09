import { ClientOnly, createFileRoute } from '@tanstack/react-router';
import { PageTitle } from '@ui/block/PageTitle';
import { PageLayout } from '@ui/layout/PageLayout';
import { useCallback, useMemo } from 'react';

import { readSpiceDeck, useSpiceDeckChoices } from '@app/db/spiceDeckTool';
import { pageHead } from '@app/routes/pageTitle';

import { spiceDeckFromSupply } from './spiceDeckSupply';
import type { SpiceDeckChoice } from './spiceDeckSupply';
import { SpiceDeckTool } from './SpiceDeckTool';
import styles from './SpiceDeckTool.module.css';

/*
 * The spice deck tool at /tools/spice-deck, the address its placeholder held.
 * Public and indexed: the server renders the frame, and the game, kept in this browser's storage, starts in the browser.
 */
export const Route = createFileRoute('/_app/tools/spice-deck')({
  ssr: true,
  head: () => pageHead('Spice deck', { kind: 'Tools' }),
  component: SpiceDeckPage,
});

const STORAGE_KEY = 'dunezone.tools.spice-deck';

/* The whole screen is the tool, so a phone on the table shows the piles and nothing else; the title is there for screen readers and crawlers. */
function SpiceDeckPage() {
  return (
    <PageLayout height="fullscreen">
      <PageLayout.Header>
        <PageTitle title="Spice deck" lede={SPICE_DECK_LEDE} />
      </PageLayout.Header>
      <PageLayout.Content width="viewport">
        <ClientOnly fallback={<div className={styles.tool} />}>
          <LiveSpiceDeck />
        </ClientOnly>
      </PageLayout.Content>
    </PageLayout>
  );
}

const SPICE_DECK_LEDE =
  'Run the Dune board game’s spice deck on a phone: pick your Ruleset’s deck, tap a spice pile to turn over its card, and see what Shai-Hulud devours.';

/* The decks come from the rulesets in the catalogue; a picked deck's cards are read once and then live in the stored game. */
function LiveSpiceDeck() {
  const { data } = useSpiceDeckChoices();
  const decks = useMemo(
    () => data?.map((entry) => ({ id: entry.rulesetId, name: entry.deck.name, ruleset: entry.ruleset })),
    [data]
  );
  const loadDeck = useCallback(
    async (choice: SpiceDeckChoice) => {
      const entry = data?.find((candidate) => candidate.rulesetId === choice.id);
      const supply = entry ? await readSpiceDeck(entry.deck) : null;
      if (!supply) {
        throw new Error(`The ${choice.name} is not in the catalogue.`);
      }
      return spiceDeckFromSupply(choice, supply);
    },
    [data]
  );
  return <SpiceDeckTool storageKey={STORAGE_KEY} decks={decks} loadDeck={loadDeck} />;
}
