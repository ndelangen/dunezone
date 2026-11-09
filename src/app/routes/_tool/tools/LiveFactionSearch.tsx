import { publishedHref } from '@shared/asset-publishing/publicationTargets';
import { useState } from 'react';

import { useCataloguePickerGroup } from '@app/db/cataloguePicker';
import type { FactionToken } from '@app/widgets/faction-token/FactionTokenFace';
import { FactionSearchList } from '@app/widgets/treachery-tracker/FactionSearchList';
import type { FactionSearchStatus } from '@app/widgets/treachery-tracker/FactionSearchList';

/* How far a catalogue read has got, in the search list's words; anything else means it has read them all. */
const SEARCH_STATUS: Partial<Record<string, FactionSearchStatus>> = {
  LoadingFirstPage: 'loading',
  CanLoadMore: 'more',
  LoadingMore: 'loading-more',
};

/**
 * Every faction on Dune Zone, searched by name, each with its token: the search the standalone tools share.
 * `seated` are the factions already picked, ticked in the list.
 */
export function LiveFactionSearch({
  seated,
  onPick,
}: Readonly<{ seated: readonly string[]; onPick: (faction: FactionToken) => void }>) {
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
  return (
    <FactionSearchList
      query={query}
      onQuery={setQuery}
      factions={factions}
      seated={seated}
      status={SEARCH_STATUS[read.status] ?? 'done'}
      onMore={() => read.loadMore(12)}
      onPick={onPick}
    />
  );
}
