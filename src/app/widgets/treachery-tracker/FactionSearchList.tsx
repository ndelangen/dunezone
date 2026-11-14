import { ScrollArea, Text, TextInput, UnstyledButton } from '@mantine/core';
import { nameWithVariant } from '@shared/factions/variantName';
import { Pending } from '@ui/content/Pending';
import { QualifiedName } from '@ui/content/QualifiedName';
import { LoadMoreButton } from '@ui/control/LoadMoreButton';
import { Check, Search } from 'lucide-react';

import { FactionTokenFace } from '@app/widgets/faction-token/FactionTokenFace';
import type { FactionToken, ListedFactionToken } from '@app/widgets/faction-token/FactionTokenFace';

import styles from './FactionSearchList.module.css';
import { useTrackerTouch } from './TrackerSurface';

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
          {factions.map(({ variant, ...token }) => {
            const here = seated.includes(token.id);
            const name = nameWithVariant(token.name, variant);
            return (
              <li key={token.id}>
                <UnstyledButton
                  className={styles.row}
                  data-touch={touch ? 'true' : 'false'}
                  disabled={here}
                  aria-label={here ? `${name} is at the table` : `Add ${name}`}
                  onClick={() => onPick(token)}
                >
                  <FactionTokenFace token={token} size={touch ? 36 : 28} />
                  <Text
                    size="sm"
                    component="span"
                    className={variant === undefined ? styles.name : styles.nameWrapping}
                  >
                    <QualifiedName name={token.name} qualifier={variant} />
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
