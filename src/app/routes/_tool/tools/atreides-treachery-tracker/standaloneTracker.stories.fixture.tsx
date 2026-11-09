import { useEffect, useState } from 'react';

import type { FactionToken } from '@app/widgets/faction-token/FactionTokenFace';
import type { CardDef } from '@app/widgets/treachery-tracker/tracker';
import { DREAMRULES_DECK, FACTIONS } from '@app/widgets/treachery-tracker/tracker.stories.fixture';

import { FactionSearchList } from './FactionSearchList';
import type { Fetched, SetupDeck } from './StandaloneTracker';
import { TrackerSetup } from './StandaloneTracker';
import type { DeckOption, FactionSearch, TrackerConfig } from './TrackerConfig';

const href = (path: string) => new URL(path, location.origin).href;

/* The decks the story offers: a Ruleset's deck, decks of other Rulesets, and homebrew decks no Ruleset plays. */
const DECKS: readonly DeckOption[] = [
  {
    id: 'dreamrules',
    name: 'Dreamrules Treachery',
    cards: 45,
    back: href('/play-fixtures/dreamrules/cardback.jpg'),
    rulesets: [{ name: 'Dreamrules' }],
  },
  {
    id: 'gf9',
    name: 'Treachery Deck',
    cards: 33,
    back: href('/play-fixtures/dreamrules/cardback.jpg'),
    rulesets: [{ name: 'GF9' }, { name: 'KISS' }],
  },
  {
    id: 'ixian-tech',
    name: 'Ixian Tech Cards',
    cards: 8,
    back: href('/play-fixtures/product/alliance-back.jpg'),
    rulesets: [],
  },
  { id: 'homebrew', name: 'Homebrew Weapons', cards: 6, back: null, rulesets: [] },
];

/* What each story deck adds to the tracker: the Dreamrules deck, and a slice of it standing in for the others. */
const DEFS: Record<string, readonly CardDef[]> = {
  dreamrules: DREAMRULES_DECK,
  gf9: DREAMRULES_DECK.slice(0, 20),
  'ixian-tech': DREAMRULES_DECK.slice(20, 26).map((def) => ({ ...def, key: `ixian-${def.key}` })),
  homebrew: DREAMRULES_DECK.slice(26, 30).map((def) => ({ ...def, key: `homebrew-${def.key}` })),
};

/* The picked decks' cards together, as the page's read joins them. */
function pickedDeck(picked: readonly string[]): SetupDeck {
  const defs = picked.flatMap((id) => DEFS[id] ?? []);
  return defs.length ? { status: 'ready', defs } : { status: 'missing', reason: 'Pick at least one Treachery deck.' };
}

/* Every faction the story's search knows: the table's six, and two more without a published token yet. */
const MORE_FACTIONS: readonly FactionToken[] = [
  ...FACTIONS,
  { id: 'ixians', name: 'Ixians' },
  { id: 'tleilaxu', name: 'Tleilaxu' },
];

/* The search the page hands the setup, over the story's factions instead of the catalogue. */
const StorySearch: FactionSearch = ({ seated, onPick }) => {
  const [query, setQuery] = useState('');
  return (
    <FactionSearchList
      query={query}
      onQuery={setQuery}
      factions={MORE_FACTIONS.filter((faction) => faction.name.toLowerCase().includes(query.trim().toLowerCase()))}
      seated={seated}
      status="done"
      onMore={() => {}}
      onPick={onPick}
    />
  );
};

/*
 * Card pictures coming in over a slow connection: one more every `pace` ms, starting again when the picked decks change.
 * Without a pace every picture is in at once.
 */
function useStoryFetch(deck: SetupDeck, pace: number | undefined): Fetched {
  const total = deck.status === 'ready' ? new Set(deck.defs.map((def) => def.face)).size : 0;
  const key = deck.status === 'ready' ? deck.defs.map((def) => def.key).join(',') : '';
  const [done, setDone] = useState({ key, done: 0 });
  useEffect(() => {
    if (!pace) {
      return;
    }
    const timer = setInterval(() => setDone((was) => ({ key, done: was.key === key ? was.done + 1 : 1 })), pace);
    return () => clearInterval(timer);
  }, [key, pace]);
  if (!pace) {
    return { done: total, total };
  }
  return { done: Math.min(done.key === key ? done.done : 0, total), total };
}

export function StorySetup({
  deck,
  loading,
  pace,
  decks = DECKS,
  onStart = () => {},
}: Readonly<{
  /** The picked decks' cards as the story fixes them; left out, they follow the decks picked. */
  deck?: SetupDeck;
  loading?: boolean;
  /** How many ms each card picture takes to come in; left out, they are all in. */
  pace?: number;
  decks?: readonly DeckOption[];
  onStart?: () => void;
}>) {
  const [config, setConfig] = useState<TrackerConfig>({ decks: ['dreamrules'], seats: FACTIONS });
  const shown = deck ?? (loading ? { status: 'loading' as const } : pickedDeck(config.decks));
  const fetched = useStoryFetch(shown, pace);
  return (
    <TrackerSetup
      decks={loading ? undefined : decks}
      deck={shown}
      fetched={fetched}
      config={loading ? { ...config, seats: undefined } : config}
      onChange={setConfig}
      onStart={onStart}
      search={StorySearch}
    />
  );
}
