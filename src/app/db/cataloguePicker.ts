import { usePaginatedQuery } from 'convex/react';
import type { FunctionArgs, FunctionReturnType } from 'convex/server';

import { api } from '../../../convex/_generated/api';
import { factionCatalogueRowsToEntries } from './factions';

type CatalogueRow = FunctionReturnType<typeof api.cataloguePicker.options>['page'][number]['choice'];
type CataloguePreview =
  | Exclude<CatalogueRow, { kind: 'faction' }>
  | {
      kind: 'faction';
      id: Extract<CatalogueRow, { kind: 'faction' }>['id'];
      faction: ReturnType<typeof factionCatalogueRowsToEntries>[number];
      /** The variant's name, when its Faction has several variants to tell apart. */
      variant?: string;
      /** The seated variant of its Faction, when another variant than this one is seated. */
      seatedAs?: string;
    };
export type CatalogueChoice = CataloguePreview & { selected: boolean | null };
export type CatalogueSelection = FunctionArgs<typeof api.cataloguePicker.options>['selection'];
export type CatalogueTarget =
  | Pick<Extract<CatalogueChoice, { kind: 'faction' }>, 'kind' | 'id'>
  | Pick<Extract<CatalogueChoice, { kind: 'asset' }>, 'kind' | 'id'>;

/**
 * Only the chosen type mounts this read, and leaving its results tears down the subscription.
 * A tool that seats one variant per Faction passes the factions it has `seated`, and a sibling of one comes back saying which.
 */
export function useCataloguePickerGroup(
  group: string,
  q: string,
  selection: CatalogueSelection,
  seated?: readonly string[]
) {
  const query = usePaginatedQuery(
    api.cataloguePicker.options,
    { group, q, selection, seated: seated && [...seated] },
    { initialNumItems: 3 }
  );
  const results: CatalogueChoice[] = query.results.map(({ choice, selected, variant, seatedAs }) => ({
    ...(choice.kind === 'faction'
      ? {
          ...choice,
          faction: factionCatalogueRowsToEntries([choice.faction])[0],
          ...(variant === null ? {} : { variant }),
          ...(seatedAs === null ? {} : { seatedAs }),
        }
      : choice),
    selected,
  }));
  return { ...query, results };
}
