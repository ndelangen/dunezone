import { publishedHref } from '@shared/asset-publishing/publicationTargets';
import { useState } from 'react';

import { useCataloguePickerGroup } from '@app/db/cataloguePicker';
import type { CatalogueChoice } from '@app/db/cataloguePicker';
import type { FactionToken, ListedFactionToken } from '@app/widgets/faction-token/FactionTokenFace';
import { FactionSearchList } from '@app/widgets/treachery-tracker/FactionSearchList';
import type { FactionSearchStatus } from '@app/widgets/treachery-tracker/FactionSearchList';

/* How far a catalogue read has got, in the search list's words; anything else means it has read them all. */
const SEARCH_STATUS: Partial<Record<string, FactionSearchStatus>> = {
  LoadingFirstPage: 'loading',
  CanLoadMore: 'more',
  LoadingMore: 'loading-more',
};

/* The catalogue's faction choices as a search list offers them: each with its token, and its variant where the catalogue names one. */
function listedFactionTokens(choices: readonly CatalogueChoice[]): ListedFactionToken[] {
  return choices.flatMap((choice) =>
    choice.kind === 'faction'
      ? [
          {
            id: choice.id,
            name: choice.faction.data.name,
            src: choice.faction.tokenImages?.faction ?? publishedHref('faction-token', choice.id),
            variant: choice.variant,
            seatedAs: choice.seatedAs,
          },
        ]
      : []
  );
}

/**
 * Every faction on Dune Zone, searched by name, each with its token: the search the standalone tools share.
 * `seated` are the factions already picked, ticked in the list.
 * A tool that seats several factions sets `onePerFaction`: a sibling of a seated variant then cannot be picked and says which variant is seated.
 */
export function LiveFactionSearch({
  seated,
  onePerFaction = false,
  onPick,
}: Readonly<{ seated: readonly string[]; onePerFaction?: boolean; onPick: (faction: FactionToken) => void }>) {
  const [query, setQuery] = useState('');
  const read = useCataloguePickerGroup('faction', query.trim(), undefined, onePerFaction ? seated : undefined);
  return (
    <FactionSearchList
      query={query}
      onQuery={setQuery}
      factions={listedFactionTokens(read.results)}
      seated={seated}
      status={SEARCH_STATUS[read.status] ?? 'done'}
      onMore={() => read.loadMore(12)}
      onPick={onPick}
    />
  );
}
