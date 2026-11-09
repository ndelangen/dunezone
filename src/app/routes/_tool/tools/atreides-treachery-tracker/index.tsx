import { publishedHref } from '@shared/asset-publishing/publicationTargets';
import { createFileRoute, Link } from '@tanstack/react-router';
import { Notice } from '@ui/block/Notice';
import { PageTitle } from '@ui/block/PageTitle';
import { Pending } from '@ui/content/Pending';
import { usePreloadedImages } from '@ui/content/preloadPublishedImage';
import { LabeledAction } from '@ui/control/LabeledAction';
import { Layers } from 'lucide-react';
import { useMemo, useState, useSyncExternalStore } from 'react';

import { useCataloguePickerGroup } from '@app/db/cataloguePicker';
import { useTreacheryDecks } from '@app/db/play';
import type { TreacheryDeckRead } from '@app/db/play';
import { useTrackerToolSetup } from '@app/db/rulesets';
import { useTreacheryDeckChoices } from '@app/db/treacheryTrackerTool';
import type { TreacheryDeckChoice } from '@app/db/treacheryTrackerTool';
import { toolPageHead } from '@app/routes/_app/tools/toolHead';
import type { FactionToken } from '@app/widgets/faction-token/FactionTokenFace';
import { cardDefs } from '@app/widgets/treachery-tracker/tracker';

import { FactionSearchList } from './FactionSearchList';
import type { FactionSearchStatus } from './FactionSearchList';
import styles from './index.module.css';
import { playGame, savedGame, startGame } from './standaloneGame';
import type { StandaloneGame } from './standaloneGame';
import { TrackerGame, TrackerSetup } from './StandaloneTracker';
import type { SetupDeck } from './StandaloneTracker';
import type { FactionSearch as FactionSearchType, TrackerConfig } from './TrackerConfig';

/*
 * The Treachery tracker on its own, for a game of Dune at a physical table (#2795).
 * Public, signed out, made for a phone: pick any Treachery decks and the factions, then track every Treachery card.
 * The game is kept in this browser only.
 */
export const Route = createFileRoute('/_tool/tools/atreides-treachery-tracker/')({
  ssr: true,
  head: ({ match }) =>
    toolPageHead('atreides-treachery-tracker', {
      description:
        'Track every Treachery card in your game of Dune from your phone: what came up for bid, who holds what, and what is left in the deck. Free, no account, any Treachery deck.',
      match,
    }),
  component: TreacheryTrackerPage,
});

/* The Ruleset whose deck is picked to start with, and the Ruleset whose first six factions, in its own order, are the base six seated at the start. */
const DEFAULT_RULESET = 'dreamrules';
const BASE_RULESET = 'gf9';
const BASE_SEATS = 6;

function TreacheryTrackerPage() {
  /* The saved game is read once the page is in the browser: the server has no storage, and renders the page's frame. */
  const game = useSyncExternalStore(savedGame.subscribe, savedGame.get, savedGame.getServer);
  const unsaved = useSyncExternalStore(savedGame.subscribe, savedGame.unsaved, () => false);
  const keep = savedGame.set;
  /* A page of its own, with no app around it: the title and lede until a game starts, then the game fills the screen. */
  return (
    <main className={styles.page}>
      {game && unsaved ? (
        <Notice tone="caution" title="Not saved" live>
          This browser would not save the game, so closing the page loses it. Private browsing or a full phone can cause
          this.
        </Notice>
      ) : null}
      {game ? (
        <Game game={game} />
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

/* A game being tracked, its card pictures fetched again where this browser no longer holds them, such as a saved game opened after the cache was cleared. */
function Game({ game }: Readonly<{ game: StandaloneGame }>) {
  usePreloadedImages(useMemo(() => game.state.copies.map((copy) => copy.def.face), [game.state.copies]));
  return (
    <TrackerGame
      game={game}
      onAction={(action) => savedGame.update((was) => playGame(was, action))}
      onTurn={(turn) => savedGame.update((was) => ({ ...was, turn }))}
      onClear={() => savedGame.set(null)}
    />
  );
}

/* No deck to track: Dune Zone holds no deck of Treachery cards yet. */
function NoDecks() {
  return (
    <Notice
      tone="caution"
      title="No Treachery decks yet"
      action={
        <LabeledAction icon={<Layers size={16} />} renderRoot={(props) => <Link {...props} to="/assets" />}>
          Browse Assets
        </LabeledAction>
      }
    >
      The tracker needs a deck of Treachery cards, and Dune Zone has none to offer right now.
    </Notice>
  );
}

/* The decks to start with: the default Ruleset's Treachery deck, else the first deck. */
function startingDecks(choices: readonly TreacheryDeckChoice[]): string[] {
  const ruleset = choices.filter((choice) => choice.rulesets.some((entry) => entry.slug === DEFAULT_RULESET));
  return (ruleset.length ? ruleset : choices.slice(0, 1)).map((choice) => choice.id);
}

/* The setup: every deck to pick from, the default one picked, and the base six seated until the player changes them. */
function Setup({ onStart }: Readonly<{ onStart: (game: StandaloneGame) => void }>) {
  const choices = useTreacheryDeckChoices();
  const setup = useTrackerToolSetup({ preferredSlug: DEFAULT_RULESET, baseSlug: BASE_RULESET, seats: BASE_SEATS });
  const [picked, setPicked] = useState<readonly string[] | null>(null);
  const [seats, setSeats] = useState<readonly FactionToken[] | null>(null);
  const base = useMemo(() => (setup ? setup.seats.map(seatOf) : undefined), [setup]);
  if (choices?.length === 0) {
    return <NoDecks />;
  }
  /* A picked deck the list no longer offers, such as one deleted since, is dropped, so it can neither be stuck in the setup nor count as picked. */
  const decks = choices
    ? (picked ?? startingDecks(choices)).filter((id) => choices.some((choice) => choice.id === id))
    : [];
  return (
    <DeckSetup
      choices={choices}
      config={{ decks, seats: seats ?? base }}
      onChange={(next) => {
        /* Only a change to the decks is kept as the player's pick, so seating factions before the decks load keeps the default deck. */
        if (next.decks !== decks) {
          setPicked(next.decks);
        }
        if (next.seats) {
          setSeats(next.seats);
        }
      }}
      onStart={onStart}
    />
  );
}

/* A base faction as a seat: its id, name and published token. */
function seatOf(faction: { _id: string; name: string; updated_at: string }): FactionToken {
  return { id: faction._id, name: faction.name, src: publishedHref('faction-token', faction._id, faction.updated_at) };
}

/* The setup reading the picked decks' cards, and fetching every card picture the moment they are in. */
function DeckSetup({
  choices,
  config,
  onChange,
  onStart,
}: Readonly<{
  choices: readonly TreacheryDeckChoice[] | undefined;
  config: TrackerConfig;
  onChange: (config: TrackerConfig) => void;
  onStart: (game: StandaloneGame) => void;
}>) {
  const key = config.decks.join(',');
  const picked = useMemo(
    () => (key && choices ? key.split(',').flatMap((id) => choices.filter((choice) => choice.id === id)) : []),
    [key, choices]
  );
  const read = useTreacheryDecks(picked);
  const deck = config.decks.length ? setupDeck(read) : NO_DECK;
  const faces = useMemo(() => (deck.status === 'ready' ? deck.defs.map((def) => def.face) : []), [deck]);
  const fetched = usePreloadedImages(faces);
  return (
    <TrackerSetup
      decks={choices}
      deck={deck}
      fetched={fetched}
      config={config}
      search={FactionSearch}
      onChange={onChange}
      onStart={() => {
        const game = gameFrom(picked, config.seats, deck);
        if (game) {
          onStart(game);
        }
      }}
    />
  );
}

const NO_DECK: SetupDeck = { status: 'missing', reason: 'Pick at least one Treachery deck.' };

/* What the setup shows of the picked decks: loading, their cards, or why there are none. */
function setupDeck(read: TreacheryDeckRead): SetupDeck {
  if (read.status !== 'read') {
    return read.status === 'loading' ? read : { status: 'missing', reason: read.reason };
  }
  return read.cards.length
    ? { status: 'ready', defs: cardDefs(read.cards) }
    : { status: 'missing', reason: 'The picked decks hold no Treachery cards.' };
}

/* A new game with the picked decks, or null while anything it needs is missing. */
function gameFrom(
  decks: readonly TreacheryDeckChoice[],
  seats: readonly FactionToken[] | undefined,
  deck: SetupDeck
): StandaloneGame | null {
  if (deck.status !== 'ready' || !decks.length || !seats) {
    return null;
  }
  return startGame(
    decks.map(({ id, name }) => ({ id, name })),
    seats,
    deck.defs
  );
}

/* How far a catalogue read has got, in the search list's words; anything else means it has read them all. */
const SEARCH_STATUS: Partial<Record<string, FactionSearchStatus>> = {
  LoadingFirstPage: 'loading',
  CanLoadMore: 'more',
  LoadingMore: 'loading-more',
};

/* Every faction on Dune Zone, searched by name, as the setup's Add a faction lists them. */
const FactionSearch: FactionSearchType = ({ seated, onPick }) => {
  const [query, setQuery] = useState('');
  const read = useCataloguePickerGroup('faction', query.trim(), undefined);
  const factions = read.results.flatMap((choice) =>
    choice.kind === 'faction'
      ? [
          {
            id: choice.id,
            name: choice.faction.data.name,
            src: choice.faction.tokenImages?.faction ?? publishedHref('faction-token', choice.id),
          },
        ]
      : []
  );
  const status = SEARCH_STATUS[read.status] ?? 'done';
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
