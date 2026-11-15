import { ScrollArea, Text, TextInput, UnstyledButton } from '@mantine/core';
import { Pending } from '@ui/content/Pending';
import { QualifiedName } from '@ui/content/QualifiedName';
import { LoadMoreButton } from '@ui/control/LoadMoreButton';
import clsx from 'clsx';
import { Check, Search } from 'lucide-react';

import { FactionTokenFace } from '@app/widgets/faction-token/FactionTokenFace';
import type { FactionToken, ListedFactionToken } from '@app/widgets/faction-token/FactionTokenFace';
import { searchRowSeating } from '@app/widgets/faction-token/searchRowSeating';

import styles from './FactionSearchList.module.css';
import { useTrackerTouch } from './TrackerSurface';

/** How far the search has read the factions: the first page, more to load, or all of them. */
export type FactionSearchStatus = 'loading' | 'more' | 'loading-more' | 'done';

/**
 * A search over every faction on Dune Zone, drawn for the tracker: a field, then one row per faction with its token.
 * A faction already at the table stays in the list, ticked, so the player sees it is there.
 * A tool seats one variant per Faction, so a sibling of a seated variant stays too, dimmed, and says which variant is seated.
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
  factions: readonly ListedFactionToken[];
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
          {factions.map(({ variant, seatedAs, ...token }) => {
            const here = seated.includes(token.id);
            const seating = searchRowSeating({ name: token.name, variant, seatedAs }, here);
            return (
              <li key={token.id}>
                <UnstyledButton
                  className={clsx(styles.row, seating.note && styles.rowOut)}
                  data-touch={touch ? 'true' : 'false'}
                  disabled={here || seating.note !== undefined}
                  aria-label={seating.label}
                  onClick={() => onPick(token)}
                >
                  <FactionTokenFace token={token} size={touch ? 36 : 28} />
                  <Text
                    size="sm"
                    component="span"
                    className={variant === undefined ? styles.name : styles.nameWrapping}
                  >
                    <QualifiedName name={token.name} qualifier={variant} />
                    {seating.note ? (
                      <Text size="xs" span display="block">
                        {seating.note}
                      </Text>
                    ) : null}
                  </Text>
                  {here ? <Check size={16} aria-hidden /> : null}
                </UnstyledButton>
              </li>
            );
          })}
        </ul>
        {status === 'loading' ? <Pending>Searching the factions…</Pending> : null}
        {status === 'done' && factions.length === 0 ? (
          <Text size="sm" className={styles.dim}>
            No faction matches.
          </Text>
        ) : null}
        {status === 'more' || status === 'loading-more' ? (
          <LoadMoreButton loading={status === 'loading-more'} onLoadMore={onMore} />
        ) : null}
      </ScrollArea.Autosize>
    </div>
  );
}
