import { publishedHref } from '@shared/asset-publishing/publicationTargets';
import { createFileRoute } from '@tanstack/react-router';
import { PageTitle } from '@ui/block/PageTitle';
import { Pending } from '@ui/content/Pending';
import { useEffect, useMemo, useState, useSyncExternalStore } from 'react';

import { useCataloguePickerGroup } from '@app/db/cataloguePicker';
import { useTreacheryDeck } from '@app/db/play';
import type { TreacheryDeckRead } from '@app/db/play';
import { useRulesetCataloguePage, useTrackerToolSetup } from '@app/db/rulesets';
import type { RulesetCatalogueEntry } from '@app/db/rulesets';
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
          onAction={(action) => savedGame.update((was) => playGame(was, action))}
          onTurn={(turn) => savedGame.update((was) => ({ ...was, turn }))}
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
  const setup = useTrackerToolSetup({ preferredSlug: DEFAULT_RULESET, baseSlug: BASE_RULESET, seats: BASE_SEATS });
  const [query, setQuery] = useState('');
  /* What a search found, kept with the words it answers, so a stale answer never lists under new words. */
  const [found, setFound] = useState<{ query: string; entries: RulesetEntry[] } | null>(null);
  const [picked, setPicked] = useState<RulesetEntry | null>(null);
  const [seats, setSeats] = useState<readonly FactionToken[] | null>(null);
  const base = useMemo(() => setup?.seats.map(seatOf), [setup]);
  if (!setup) {
    return <Pending>Loading the Rulesets…</Pending>;
  }
  const words = query.trim();
  const listed = listedRulesets(setup.rulesets, words, found);
  /* The fallback comes from the catalogue the setup opened with, so a search that finds nothing never clears the form. */
  const chosen = picked ?? setup.preferred ?? setup.rulesets.find((entry) => !HIDDEN_RULESETS.has(entry.slug));
  if (!chosen) {
    return null;
  }
  const rulesets = withChosen(listed, chosen);
  return (
    <>
      {/* The search is mounted only while the player types in the Ruleset field. */}
      {words ? <RulesetSearch query={words} onFound={setFound} /> : null}
      <RulesetSetup
        key={chosen.id}
        rulesets={rulesets}
        rulesetId={chosen.id}
        base={setup.base ? base : []}
        seats={seats}
        onSeats={setSeats}
        onPick={(id) => setPicked(rulesets.find((entry) => entry.id === id) ?? null)}
        onRulesetSearch={setQuery}
        onStart={onStart}
      />
    </>
  );
}

/* The Rulesets matching what the player types, read only while there are words to match. */
function RulesetSearch({
  query,
  onFound,
}: Readonly<{ query: string; onFound: (found: { query: string; entries: RulesetEntry[] }) => void }>) {
  const matching = useRulesetCataloguePage({ q: query }).data;
  useEffect(() => {
    if (matching) {
      onFound({ query, entries: matching.entries });
    }
  }, [matching, query, onFound]);
  return null;
}

/*
 * The Rulesets the field lists: what the search found for these words, else the first ones, never the hidden ones.
 * While a search is on its way the first Rulesets stay listed, so the field never empties under the player.
 */
function listedRulesets(
  first: RulesetEntry[],
  words: string,
  found: { query: string; entries: RulesetEntry[] } | null
): RulesetEntry[] {
  const searched = words && found?.query === words ? found.entries : first;
  return searched.filter((entry) => !HIDDEN_RULESETS.has(entry.slug));
}

/* The listed Rulesets, with the chosen one first when the search left it out, so the field can still name it. */
function withChosen(listed: RulesetEntry[], chosen: RulesetEntry): RulesetEntry[] {
  return listed.some((entry) => entry.id === chosen.id) ? listed : [chosen, ...listed];
}

type RulesetEntry = RulesetCatalogueEntry;

/* A base faction as a seat: its id, name and published token. */
function seatOf(faction: { _id: string; name: string; updated_at: string }): FactionToken {
  return { id: faction._id, name: faction.name, src: publishedHref('faction-token', faction._id, faction.updated_at) };
}

/* One Ruleset's setup, reading its Treachery deck, with the factions seated so far or the base six. */
type RulesetSetupProps = Readonly<{
  rulesets: readonly { id: string; name: string }[];
  rulesetId: RulesetId;
  /** The base six, undefined while they load. */
  base: readonly FactionToken[] | undefined;
  seats: readonly FactionToken[] | null;
  onSeats: (seats: readonly FactionToken[]) => void;
  onPick: (rulesetId: string) => void;
  onRulesetSearch: (query: string) => void;
  onStart: (game: StandaloneGame) => void;
}>;

function RulesetSetup({
  rulesets,
  rulesetId,
  base,
  seats,
  onSeats,
  onPick,
  onRulesetSearch,
  onStart,
}: RulesetSetupProps) {
  const deck = setupDeck(useTreacheryDeck(rulesetId));
  const config: TrackerConfig = { ruleset: rulesetId, seats: seats ?? base };
  return (
    <TrackerSetup
      rulesets={rulesets}
      deck={deck}
      config={config}
      search={FactionSearch}
      onRulesetSearch={onRulesetSearch}
      onChange={(next) => {
        if (next.seats && next.seats !== config.seats) {
          onSeats(next.seats);
        }
        if (next.ruleset !== rulesetId) {
          onPick(next.ruleset);
        }
      }}
      onStart={() => {
        const game = gameFrom(
          rulesets.find((entry) => entry.id === rulesetId),
          config.seats,
          deck
        );
        if (game) {
          onStart(game);
        }
      }}
    />
  );
}

/* What the setup shows of a Ruleset's Treachery deck: loading, its cards, or why there are none. */
function setupDeck(read: TreacheryDeckRead): SetupDeck {
  if (read.status !== 'read') {
    return read.status === 'loading' ? read : { status: 'missing', reason: read.reason };
  }
  return read.cards?.length
    ? { status: 'ready', defs: cardDefs(read.cards) }
    : { status: 'missing', reason: 'This Ruleset has no Treachery deck.' };
}

/* A new game at the picked Ruleset, or null while anything it needs is missing. */
function gameFrom(
  ruleset: { id: string; name: string } | undefined,
  seats: readonly FactionToken[] | undefined,
  deck: SetupDeck
): StandaloneGame | null {
  if (deck.status !== 'ready') {
    return null;
  }
  return ruleset && seats ? startGame({ id: ruleset.id, name: ruleset.name }, seats, deck.defs) : null;
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
