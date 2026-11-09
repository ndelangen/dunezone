import { publishedHref } from '@shared/asset-publishing/publicationTargets';
import { createFileRoute } from '@tanstack/react-router';
import { PageTitle } from '@ui/block/PageTitle';
import { Pending } from '@ui/content/Pending';
import { useMemo, useState, useSyncExternalStore } from 'react';

import { useTreacheryDeck } from '@app/db/play';
import { useOrderedRulesetFactions, useRulesetCataloguePage } from '@app/db/rulesets';
import type { RulesetCatalogueEntry } from '@app/db/rulesets';
import { toolPageHead } from '@app/routes/_app/tools/toolHead';
import type { FactionToken } from '@app/widgets/faction-token/FactionTokenFace';
import { playGame, savedGame, startGame } from '@app/widgets/treachery-tracker/standaloneGame';
import type { StandaloneGame } from '@app/widgets/treachery-tracker/standaloneGame';
import { TrackerGame, TrackerSetup } from '@app/widgets/treachery-tracker/StandaloneTracker';
import type { SetupDeck } from '@app/widgets/treachery-tracker/StandaloneTracker';
import { cardDefs } from '@app/widgets/treachery-tracker/tracker';
import type { TrackerConfig } from '@app/widgets/treachery-tracker/TrackerConfig';

import styles from './index.module.css';

/*
 * The Treachery tracker on its own, for a game of Dune at a physical table (#2795).
 * Public, signed out, made for a phone: pick a Ruleset and its factions, then track every Treachery card.
 * The game is kept in this browser only.
 */
export const Route = createFileRoute('/_tool/tools/atreides-treachery-tracker/')({
  ssr: true,
  head: ({ match }) =>
    toolPageHead('atreides-treachery-tracker', {
      description:
        'Track every Treachery card in your game of Dune from your phone: what came up for bid, who holds what, and what is left in the deck. Free, no account, any Ruleset.',
      match,
    }),
  component: TreacheryTrackerPage,
});

/* Rulesets with more factions than this are rare; the setup lists the first ones in the Ruleset's order. */
const FACTION_LIMIT = 40;

const DEFAULT_RULESET = 'dreamrules';

type RulesetId = RulesetCatalogueEntry['id'];

function TreacheryTrackerPage() {
  /* The saved game is read once the page is in the browser: the server has no storage, and renders the page's frame. */
  const game = useSyncExternalStore(savedGame.subscribe, savedGame.get, savedGame.getServer);
  const keep = savedGame.set;
  /* A page of its own, with no app around it: the title and lede until a game starts, then the game fills the screen. */
  return (
    <main className={styles.page}>
      {game ? (
        <TrackerGame
          game={game}
          onAction={(action) => keep(playGame(game, action))}
          onTurn={(turn) => keep({ ...game, turn })}
          onClear={() => keep(null)}
        />
      ) : (
        <div className={styles.setup}>
          <PageTitle
            title="Treachery tracker"
            subtitle="A Dune Zone tool"
            lede="Track every Treachery card through bidding, hands and discards, so you know what is left in the deck. Saved on this phone, no account needed."
          />
          {game === undefined ? <Pending>Loading your game…</Pending> : <Setup onStart={keep} />}
        </div>
      )}
    </main>
  );
}

/* The setup: the Rulesets to pick from, the default one picked. */
function Setup({ onStart }: Readonly<{ onStart: (game: StandaloneGame) => void }>) {
  const catalogue = useRulesetCataloguePage({ sort: 'name' }).data;
  const [picked, setPicked] = useState<RulesetId | null>(null);
  if (!catalogue) {
    return <Pending>Loading the Rulesets…</Pending>;
  }
  const rulesets = catalogue.entries;
  const rulesetId = picked ?? (rulesets.find((entry) => entry.slug === DEFAULT_RULESET) ?? rulesets[0])?.id;
  if (!rulesetId) {
    return null;
  }
  return (
    <RulesetSetup
      key={rulesetId}
      rulesets={rulesets}
      rulesetId={rulesetId}
      onPick={(id) => setPicked(id as RulesetId)}
      onStart={onStart}
    />
  );
}

/* One Ruleset's setup, reading its factions and its Treachery deck. */
function RulesetSetup({
  rulesets,
  rulesetId,
  onPick,
  onStart,
}: Readonly<{
  rulesets: readonly { id: string; name: string }[];
  rulesetId: RulesetId;
  onPick: (rulesetId: string) => void;
  onStart: (game: StandaloneGame) => void;
}>) {
  const factions = useRulesetFactions(rulesetId);
  const read = useTreacheryDeck(rulesetId);
  const deck: SetupDeck =
    read.status === 'loading'
      ? read
      : read.status === 'failed'
        ? { status: 'missing', reason: read.reason }
        : read.cards?.length
          ? { status: 'ready', defs: cardDefs(read.cards) }
          : { status: 'missing', reason: 'This Ruleset has no Treachery deck.' };
  const [seats, setSeats] = useState<Pick<TrackerConfig, 'order' | 'playing'> | null>(null);
  /* Until the player changes them, every faction of the Ruleset plays, in the Ruleset's order. */
  const ids = factions?.map((faction) => faction.id) ?? [];
  const config: TrackerConfig = { ruleset: rulesetId, ...(seats ?? { order: ids, playing: ids }) };
  return (
    <TrackerSetup
      rulesets={rulesets}
      factions={factions}
      deck={deck}
      config={config}
      onChange={(next) => (next.ruleset === rulesetId ? setSeats(next) : onPick(next.ruleset))}
      onStart={() => {
        const ruleset = rulesets.find((entry) => entry.id === rulesetId);
        if (!ruleset || !factions || deck.status !== 'ready') {
          return;
        }
        const byId = new Map(factions.map((faction) => [faction.id, faction]));
        const seated = config.order.filter((id) => config.playing.includes(id)).map((id) => byId.get(id)!);
        onStart(startGame({ id: ruleset.id, name: ruleset.name }, seated, deck.defs));
      }}
    />
  );
}

/* The Ruleset's factions in its own order, each with its published token. */
function useRulesetFactions(rulesetId: RulesetId): FactionToken[] | undefined {
  const data = useOrderedRulesetFactions(rulesetId, FACTION_LIMIT);
  return useMemo(
    () =>
      data?.factions.map((faction) => ({
        id: faction._id,
        name: faction.name,
        src: publishedHref('faction-token', faction._id),
      })),
    [data]
  );
}
