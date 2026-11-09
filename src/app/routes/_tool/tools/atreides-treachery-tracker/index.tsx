import { publishedHref } from '@shared/asset-publishing/publicationTargets';
import { createFileRoute } from '@tanstack/react-router';
import { PageTitle } from '@ui/block/PageTitle';
import { Pending } from '@ui/content/Pending';
import { useMemo, useState, useSyncExternalStore } from 'react';

import { useCataloguePickerGroup } from '@app/db/cataloguePicker';
import { useTreacheryDeck } from '@app/db/play';
import { useOrderedRulesetFactions, useRulesetCataloguePage } from '@app/db/rulesets';
import type { RulesetCatalogueEntry } from '@app/db/rulesets';
import { toolPageHead } from '@app/routes/_app/tools/toolHead';
import type { FactionToken } from '@app/widgets/faction-token/FactionTokenFace';
import { FactionSearchList } from '@app/widgets/treachery-tracker/FactionSearchList';
import type { FactionSearchStatus } from '@app/widgets/treachery-tracker/FactionSearchList';
import { playGame, savedGame, startGame } from '@app/widgets/treachery-tracker/standaloneGame';
import type { StandaloneGame } from '@app/widgets/treachery-tracker/standaloneGame';
import { TrackerGame, TrackerSetup } from '@app/widgets/treachery-tracker/StandaloneTracker';
import type { SetupDeck } from '@app/widgets/treachery-tracker/StandaloneTracker';
import { cardDefs } from '@app/widgets/treachery-tracker/tracker';
import type { FactionSearch as FactionSearchType, TrackerConfig } from '@app/widgets/treachery-tracker/TrackerConfig';

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

/* The deck tracked by default, and the Ruleset whose first six factions, in its own order, are the base six seated at the start. */
const DEFAULT_RULESET = 'dreamrules';
const BASE_RULESET = 'gf9';
const BASE_SEATS = 6;
/* A Ruleset for trying things out, never offered at a table. */
const HIDDEN_RULESETS = new Set(['test']);

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

/* The setup: the Rulesets to pick from, the default one picked, and the base six seated until the player changes them. */
function Setup({ onStart }: Readonly<{ onStart: (game: StandaloneGame) => void }>) {
  const catalogue = useRulesetCataloguePage({ sort: 'name' }).data;
  const [picked, setPicked] = useState<RulesetId | null>(null);
  const [seats, setSeats] = useState<readonly FactionToken[] | null>(null);
  if (!catalogue) {
    return <Pending>Loading the Rulesets…</Pending>;
  }
  const rulesets = catalogue.entries.filter((entry) => !HIDDEN_RULESETS.has(entry.slug));
  const fallback = rulesets.find((entry) => entry.slug === DEFAULT_RULESET) ?? rulesets[0];
  const rulesetId = picked ?? fallback?.id;
  const baseId = (rulesets.find((entry) => entry.slug === BASE_RULESET) ?? fallback)?.id;
  if (!rulesetId || !baseId) {
    return null;
  }
  return (
    <RulesetSetup
      key={rulesetId}
      rulesets={rulesets}
      rulesetId={rulesetId}
      baseId={baseId}
      seats={seats}
      onSeats={setSeats}
      onPick={(id) => setPicked(id as RulesetId)}
      onStart={onStart}
    />
  );
}

/* One Ruleset's setup, reading its Treachery deck, with the factions seated so far or the base six. */
function RulesetSetup({
  rulesets,
  rulesetId,
  baseId,
  seats,
  onSeats,
  onPick,
  onStart,
}: Readonly<{
  rulesets: readonly { id: string; name: string }[];
  rulesetId: RulesetId;
  baseId: RulesetId;
  seats: readonly FactionToken[] | null;
  onSeats: (seats: readonly FactionToken[]) => void;
  onPick: (rulesetId: string) => void;
  onStart: (game: StandaloneGame) => void;
}>) {
  const base = useBaseSeats(baseId);
  const read = useTreacheryDeck(rulesetId);
  const deck: SetupDeck =
    read.status === 'loading'
      ? read
      : read.status === 'failed'
        ? { status: 'missing', reason: read.reason }
        : read.cards?.length
          ? { status: 'ready', defs: cardDefs(read.cards) }
          : { status: 'missing', reason: 'This Ruleset has no Treachery deck.' };
  const config: TrackerConfig = { ruleset: rulesetId, seats: seats ?? base };
  return (
    <TrackerSetup
      rulesets={rulesets}
      deck={deck}
      config={config}
      search={FactionSearch}
      onChange={(next) => {
        if (next.seats && next.seats !== config.seats) {
          onSeats(next.seats);
        }
        if (next.ruleset !== rulesetId) {
          onPick(next.ruleset);
        }
      }}
      onStart={() => {
        const ruleset = rulesets.find((entry) => entry.id === rulesetId);
        if (!ruleset || !config.seats || deck.status !== 'ready') {
          return;
        }
        onStart(startGame({ id: ruleset.id, name: ruleset.name }, config.seats, deck.defs));
      }}
    />
  );
}

/* The base six: the first factions of the base Ruleset, in its own order, each with its published token. */
function useBaseSeats(rulesetId: RulesetId): readonly FactionToken[] | undefined {
  const data = useOrderedRulesetFactions(rulesetId, BASE_SEATS);
  return useMemo(() => data?.factions.map((faction) => factionToken(faction._id, faction.name)), [data]);
}

function factionToken(id: string, name: string): FactionToken {
  return { id, name, src: publishedHref('faction-token', id) };
}

/* Every faction on Dune Zone, searched by name, as the setup's Add a faction lists them. */
const FactionSearch: FactionSearchType = ({ seated, onPick }) => {
  const [query, setQuery] = useState('');
  const read = useCataloguePickerGroup('faction', query.trim(), undefined);
  const factions = read.results.flatMap((choice) =>
    choice.kind === 'faction' ? [factionToken(choice.id, choice.faction.data.name)] : []
  );
  const status: FactionSearchStatus =
    read.status === 'LoadingFirstPage'
      ? 'loading'
      : read.status === 'CanLoadMore'
        ? 'more'
        : read.status === 'LoadingMore'
          ? 'loading-more'
          : 'done';
  return (
    <FactionSearchList
      query={query}
      onQuery={setQuery}
      factions={factions}
      seated={seated}
      status={status}
      onMore={() => read.loadMore(12)}
      onPick={onPick}
    />
  );
};
