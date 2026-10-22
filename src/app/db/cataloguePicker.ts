import { usePaginatedQuery } from 'convex/react';
import type { FunctionReturnType } from 'convex/server';

import { api } from '../../../convex/_generated/api';
import { factionCatalogueRowsToEntries } from './factions';

type CatalogueRow = FunctionReturnType<typeof api.cataloguePicker.options>['page'][number];
export type CatalogueChoice =
  | Exclude<CatalogueRow, { kind: 'faction' }>
  | {
      kind: 'faction';
      id: Extract<CatalogueRow, { kind: 'faction' }>['id'];
      faction: ReturnType<typeof factionCatalogueRowsToEntries>[number];
    };
export type CatalogueTarget =
  | Pick<Extract<CatalogueChoice, { kind: 'faction' }>, 'kind' | 'id'>
  | Pick<Extract<CatalogueChoice, { kind: 'asset' }>, 'kind' | 'id'>;

/** Mounted only inside the open picker; closing tears down every options subscription. */
export function useCataloguePickerGroup(group: string, q: string) {
  const query = usePaginatedQuery(api.cataloguePicker.options, { group, q }, { initialNumItems: 3 });
  const results: CatalogueChoice[] = query.results.map((row) =>
    row.kind === 'faction' ? { ...row, faction: factionCatalogueRowsToEntries([row.faction])[0] } : row
  );
  return { ...query, results };
}
