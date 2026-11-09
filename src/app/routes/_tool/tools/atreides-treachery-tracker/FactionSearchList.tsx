import { ScrollArea, Text, TextInput, UnstyledButton } from '@mantine/core';
import { Pending } from '@ui/content/Pending';
import { LoadMoreButton } from '@ui/control/LoadMoreButton';
import { Check, Search } from 'lucide-react';

import { FactionTokenFace } from '@app/widgets/faction-token/FactionTokenFace';
import type { FactionToken } from '@app/widgets/faction-token/FactionTokenFace';
import { useTrackerTouch } from '@app/widgets/treachery-tracker/TrackerSurface';

import styles from './FactionSearchList.module.css';

/** How far the search has read the factions: the first page, more to load, or all of them. */
export type FactionSearchStatus = 'loading' | 'more' | 'loading-more' | 'done';

/**
 * A search over every faction on Dune Zone, drawn for the tracker: a field, then one row per faction with its token.
 * A faction already at the table stays in the list, ticked, so the player sees it is there.
 * The page reads the factions and hands them in.
 */
export function FactionSearchList({
  query,
  onQuery,
  factions,
  seated,
  status,
  onMore,
  onPick,
}: Readonly<{
  query: string;
  onQuery: (query: string) => void;
  factions: readonly FactionToken[];
  seated: readonly string[];
  status: FactionSearchStatus;
  onMore: () => void;
  onPick: (faction: FactionToken) => void;
}>) {
  const touch = useTrackerTouch();
  return (
    <div className={styles.search}>
      <TextInput
        type="search"
        aria-label="Search factions"
        placeholder="Search factions"
        size={touch ? 'lg' : 'sm'}
        leftSection={<Search size={16} />}
        value={query}
        autoComplete="off"
        data-1p-ignore
        data-lpignore="true"
        onChange={(event) => onQuery(event.currentTarget.value)}
      />
      <ScrollArea.Autosize mah={touch ? '55dvh' : 320} type="auto" overscrollBehavior="contain">
        <ul className={styles.list} aria-label="Factions">
          {factions.map((faction) => (
            <li key={faction.id}>
              <FactionRow faction={faction} here={seated.includes(faction.id)} onPick={onPick} />
            </li>
          ))}
        </ul>
        <SearchProgress status={status} empty={factions.length === 0} onMore={onMore} />
      </ScrollArea.Autosize>
    </div>
  );
}

/* One faction to add, or ticked and disabled when it is already at the table. */
function FactionRow({
  faction,
  here,
  onPick,
}: Readonly<{ faction: FactionToken; here: boolean; onPick: (faction: FactionToken) => void }>) {
  const touch = useTrackerTouch();
  return (
    <UnstyledButton
      className={styles.row}
      data-touch={touch ? 'true' : 'false'}
      disabled={here}
      aria-label={here ? `${faction.name} is at the table` : `Add ${faction.name}`}
      onClick={() => onPick(faction)}
    >
      <FactionTokenFace token={faction} size={touch ? 36 : 28} />
      <Text size="sm" component="span" className={styles.name}>
        {faction.name}
      </Text>
      {here ? <Check size={16} aria-hidden /> : null}
    </UnstyledButton>
  );
}

/* Below the rows: the first page loading, no match, or a button that reads the next page. */
function SearchProgress({
  status,
  empty,
  onMore,
}: Readonly<{ status: FactionSearchStatus; empty: boolean; onMore: () => void }>) {
  if (status === 'loading') {
    return <Pending>Searching the factions…</Pending>;
  }
  if (status === 'done') {
    return empty ? (
      <Text size="sm" className={styles.dim}>
        No faction matches.
      </Text>
    ) : null;
  }
  return <LoadMoreButton loading={status === 'loading-more'} onLoadMore={onMore} />;
}
